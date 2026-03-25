"""TTS generation API routes."""

import io
import os
import re
import subprocess
import zipfile
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ...models.requests import HistoryDeleteRequest, TTSRequest
from ...models.responses import (
    HistoryDeleteResponse,
    HistoryListResponse,
    TTSGenerateResponse,
)
from ...services.tts_service import TTSService
from ...services.storage import get_history_store

router = APIRouter(prefix="/api/tts", tags=["tts"])

# Output directory for generated files
OUTPUT_DIR = os.environ.get("EDGE_TTS_OUTPUT_DIR", "downloads")
SAFE_ITEM_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
SRT_TIMING_PATTERN = re.compile(
    r"^(?P<start>\\d{2}:\\d{2}:\\d{2},\\d{3})\\s*-->\\s*(?P<end>\\d{2}:\\d{2}:\\d{2},\\d{3})$"
)
SPEED_MIN = 0.5
SPEED_MAX = 2.0
SPEED_EPSILON = 1e-3


def _parse_srt_timestamp(value: str) -> int:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return (
        int(hours) * 3600 * 1000
        + int(minutes) * 60 * 1000
        + int(seconds) * 1000
        + int(millis)
    )


def _format_srt_timestamp(total_ms: int) -> str:
    total_ms = max(total_ms, 0)
    hours = total_ms // 3600000
    remainder = total_ms % 3600000
    minutes = remainder // 60000
    remainder %= 60000
    seconds = remainder // 1000
    millis = remainder % 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _scale_srt_timestamps(content: bytes, speed: float) -> bytes:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="ignore")

    lines = []
    for line in text.splitlines():
        match = SRT_TIMING_PATTERN.match(line.strip())
        if not match:
            lines.append(line)
            continue

        start_ms = _parse_srt_timestamp(match.group("start"))
        end_ms = _parse_srt_timestamp(match.group("end"))
        scaled_start = int(round(start_ms / speed))
        scaled_end = int(round(end_ms / speed))
        lines.append(f"{_format_srt_timestamp(scaled_start)} --> {_format_srt_timestamp(scaled_end)}")

    return ("\n".join(lines) + ("\n" if text.endswith("\n") else "")).encode("utf-8")


def _build_atempo_filter(speed: float) -> str:
    filters = []
    remaining = speed
    while remaining > SPEED_MAX:
        filters.append(str(SPEED_MAX))
        remaining /= SPEED_MAX
    while remaining < SPEED_MIN:
        filters.append(str(SPEED_MIN))
        remaining /= SPEED_MIN
    filters.append(f"{remaining:.6f}")
    return "atempo=" + ",atempo=".join(filters)


def _adjust_audio_speed(audio_bytes: bytes, speed: float) -> bytes:
    if abs(speed - 1.0) <= SPEED_EPSILON:
        return audio_bytes

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-filter:a",
        _build_atempo_filter(speed),
        "-f",
        "mp3",
        "pipe:1",
    ]
    try:
        result = subprocess.run(
            cmd,
            input=audio_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="ffmpeg not available") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="ignore").strip() or "ffmpeg failed"
        raise HTTPException(status_code=500, detail=detail) from exc

    return result.stdout


@router.post("/generate", response_model=TTSGenerateResponse)
async def generate_tts(request: TTSRequest) -> TTSGenerateResponse:
    """
    Generate TTS audio and optionally subtitles.

    This endpoint processes the input text and returns URLs to download
    the generated audio file and subtitle file (if requested).
    """
    try:
        history_item = await TTSService.generate_tts(request, output_dir=OUTPUT_DIR)

        return TTSGenerateResponse(
            audio_url=history_item.audio_url,
            subtitle_url=history_item.subtitle_url,
            duration_ms=history_item.duration_ms,
            word_count=history_item.word_count,
            history_item=history_item,
        )
    except Exception as e:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=HistoryListResponse)
async def get_history(
    search: Optional[str] = Query(
        default=None,
        min_length=1,
        max_length=200,
        description="Search keyword for text, voice, id, or created time",
    ),
    page: Optional[int] = Query(default=None, ge=1, description="Page number for pagination"),
    page_size: Optional[int] = Query(
        default=None,
        ge=1,
        le=200,
        description="Page size for pagination",
    ),
) -> HistoryListResponse:
    """Get persisted generation history."""
    try:
        items, total = await TTSService.get_history(
            output_dir=OUTPUT_DIR,
            search=search,
            page=page,
            page_size=page_size,
        )
        return HistoryListResponse(items=items, total=total)
    except Exception as e:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history", response_model=HistoryDeleteResponse)
async def delete_history(request: HistoryDeleteRequest) -> HistoryDeleteResponse:
    """Delete one or more history records."""
    try:
        deleted_ids, failed_ids = await TTSService.delete_history(
            ids=request.ids, output_dir=OUTPUT_DIR
        )
        return HistoryDeleteResponse(deleted_ids=deleted_ids, failed_ids=failed_ids)
    except Exception as e:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/downloads/{filename}")
async def download_file(filename: str) -> Response:
    """Download a generated audio or subtitle file."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    store = get_history_store(OUTPUT_DIR)
    try:
        content, media_type = await store.get_file_bytes(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)


@router.get("/history/{item_id}/download")
async def download_history_item_zip(
    item_id: str,
    speed: float = Query(default=1.0, ge=SPEED_MIN, le=SPEED_MAX),
) -> Response:
    """Download history item as ZIP package containing MP3 and SRT."""
    if not SAFE_ITEM_ID_PATTERN.fullmatch(item_id):
        raise HTTPException(status_code=400, detail="Invalid history item id")

    store = get_history_store(OUTPUT_DIR)
    try:
        audio_bytes, subtitle_bytes, audio_filename, subtitle_filename = await store.get_item_assets(
            item_id
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="History item not found") from exc

    if abs(speed - 1.0) > SPEED_EPSILON:
        audio_bytes = _adjust_audio_speed(audio_bytes, speed)
        subtitle_bytes = _scale_srt_timestamps(subtitle_bytes, speed)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr(audio_filename, audio_bytes)
        zip_file.writestr(subtitle_filename, subtitle_bytes)

    zip_filename = f"{item_id}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers=headers,
    )


@router.get("/history/{item_id}/download-audio")
async def download_history_item_audio(
    item_id: str,
    speed: float = Query(default=1.0, ge=SPEED_MIN, le=SPEED_MAX),
) -> Response:
    """Download history item audio only (optionally speed-adjusted)."""
    if not SAFE_ITEM_ID_PATTERN.fullmatch(item_id):
        raise HTTPException(status_code=400, detail="Invalid history item id")

    store = get_history_store(OUTPUT_DIR)
    try:
        audio_bytes, _, audio_filename, _ = await store.get_item_assets(item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="History item not found") from exc

    if abs(speed - 1.0) > SPEED_EPSILON:
        audio_bytes = _adjust_audio_speed(audio_bytes, speed)

    headers = {"Content-Disposition": f'attachment; filename="{audio_filename}"'}
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers=headers,
    )
