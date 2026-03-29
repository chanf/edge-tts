"""TTS generation API routes."""

import io
import os
import re
import subprocess
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ...models.requests import HistoryDeleteRequest, HistoryMergeRequest, TTSRequest
from ...models.responses import (
    HistoryDeleteResponse,
    HistoryListResponse,
    TTSGenerateResponse,
    HistoryItem,
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


def _parse_srt_cues(
    content: bytes,
) -> tuple[list[tuple[int, int, list[str]]], int]:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="ignore")

    cues: list[tuple[int, int, list[str]]] = []
    max_end = 0
    for raw_block in re.split(r"\r?\n\r?\n", text):
        if not raw_block.strip():
            continue
        lines = [line.strip() for line in raw_block.splitlines() if line.strip()]
        timing_idx = next((i for i, line in enumerate(lines) if SRT_TIMING_PATTERN.match(line)), None)
        if timing_idx is None:
            continue
        timing_line = lines[timing_idx]
        match = SRT_TIMING_PATTERN.match(timing_line)
        if not match:
            continue
        start_ms = _parse_srt_timestamp(match.group("start"))
        end_ms = _parse_srt_timestamp(match.group("end"))
        max_end = max(max_end, end_ms)
        text_lines = lines[timing_idx + 1 :]
        if not text_lines:
            continue
        cues.append((start_ms, end_ms, text_lines))

    return cues, max_end


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


def _merge_audio_segments(audio_segments: list[bytes]) -> bytes:
    if not audio_segments:
        return b""
    if len(audio_segments) == 1:
        return audio_segments[0]

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        list_path = temp_path / "inputs.txt"
        input_paths = []

        for idx, data in enumerate(audio_segments):
            segment_path = temp_path / f"segment_{idx}.mp3"
            segment_path.write_bytes(data)
            input_paths.append(segment_path)

        list_content = "\n".join([f"file '{path.as_posix()}'" for path in input_paths])
        list_path.write_text(list_content, encoding="utf-8")

        output_path = temp_path / "merged.mp3"
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            str(output_path),
        ]

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail="ffmpeg not available") from exc
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr.decode("utf-8", errors="ignore").strip() or "ffmpeg failed"
            raise HTTPException(status_code=500, detail=detail) from exc

        return output_path.read_bytes()


def _audio_duration_ms(audio_bytes: bytes) -> Optional[int]:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir) / "segment.mp3"
        temp_path.write_bytes(audio_bytes)
        cmd = [
            "ffmpeg",
            "-i",
            str(temp_path),
        ]
        try:
            result = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail="ffmpeg not available") from exc

        stderr = result.stderr.decode("utf-8", errors="ignore")
        match = re.search(r"Duration:\\s*(\\d+):(\\d+):(\\d+)\\.(\\d+)", stderr)
        if not match:
            return None
        hours = int(match.group(1))
        minutes = int(match.group(2))
        seconds = int(match.group(3))
        centis = match.group(4)
        millis = int(centis.ljust(3, "0")[:3])
        total_ms = ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis
        return total_ms


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


@router.post("/history/merge", response_model=HistoryItem)
async def merge_history_items(request: HistoryMergeRequest) -> HistoryItem:
    """Merge multiple history items into a single audio + subtitle entry."""
    invalid_ids = [item_id for item_id in request.ids if not SAFE_ITEM_ID_PATTERN.fullmatch(item_id)]
    if invalid_ids:
        raise HTTPException(status_code=400, detail="Invalid history item id")

    store = get_history_store(OUTPUT_DIR)
    audio_segments: list[bytes] = []
    subtitle_segments: list[bytes] = []

    for item_id in request.ids:
        try:
            audio_bytes, subtitle_bytes, _, _ = await store.get_item_assets(item_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="History item not found") from exc
        audio_segments.append(audio_bytes)
        subtitle_segments.append(subtitle_bytes)

    merged_audio = _merge_audio_segments(audio_segments)

    offset_ms = 0
    merged_cues: list[tuple[int, int, list[str]]] = []
    for audio_bytes, subtitle_bytes in zip(audio_segments, subtitle_segments):
        cues, segment_max_end = _parse_srt_cues(subtitle_bytes)
        for start_ms, end_ms, text_lines in cues:
            merged_cues.append((start_ms + offset_ms, end_ms + offset_ms, text_lines))

        audio_duration = _audio_duration_ms(audio_bytes)
        if audio_duration is None:
            audio_duration = segment_max_end
        offset_ms += audio_duration

    merged_lines: list[str] = []
    for index, (start_ms, end_ms, text_lines) in enumerate(merged_cues, start=1):
        merged_lines.append(str(index))
        merged_lines.append(
            f"{_format_srt_timestamp(start_ms)} --> {_format_srt_timestamp(end_ms)}"
        )
        merged_lines.extend(text_lines)
        merged_lines.append("")

    merged_srt = "\n".join(merged_lines).strip()
    if merged_srt:
        merged_srt += "\n"

    request_id = uuid.uuid4().hex[:8]
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    item_id = f"tts_{timestamp}_{request_id}"
    created_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    audio_filename = f"{item_id}.mp3"
    subtitle_filename = f"{item_id}.srt"

    preview = " ".join(request.text.strip().split())
    if len(preview) > 120:
        preview = preview[:117] + "..."

    word_count = len(re.findall(r"\\S", request.text))
    history_item = HistoryItem(
        id=item_id,
        created_at=created_at,
        text_preview=preview,
        text=request.text,
        voice=request.voice,
        rate=request.rate,
        volume=request.volume,
        pitch=request.pitch,
        boundary=request.boundary,
        duration_ms=offset_ms,
        word_count=word_count,
        audio_filename=audio_filename,
        subtitle_filename=subtitle_filename,
        audio_url="",
        subtitle_url="",
    )

    saved_item = await store.save(history_item, merged_audio, merged_srt)
    return saved_item
