"""TTS generation API routes."""

import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from ...models.requests import HistoryDeleteRequest, TTSRequest
from ...models.responses import (
    HistoryDeleteResponse,
    HistoryListResponse,
    TTSGenerateResponse,
)
from ...services.tts_service import TTSService

router = APIRouter(prefix="/api/tts", tags=["tts"])

# Output directory for generated files
OUTPUT_DIR = os.environ.get("EDGE_TTS_OUTPUT_DIR", "downloads")
SAFE_ITEM_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


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
    )
) -> HistoryListResponse:
    """Get persisted generation history."""
    try:
        items, total = await TTSService.get_history(output_dir=OUTPUT_DIR, search=search)
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
async def download_file(filename: str) -> FileResponse:
    """
    Download a generated audio or subtitle file.
    """
    file_path = os.path.join(OUTPUT_DIR, filename)

    # Security check: ensure filename doesn't contain path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine content type
    if filename.endswith(".mp3"):
        media_type = "audio/mpeg"
    elif filename.endswith(".srt"):
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )


@router.get("/history/{item_id}/download")
async def download_history_item_zip(item_id: str) -> Response:
    """Download history item as ZIP package containing MP3 and SRT."""
    if not SAFE_ITEM_ID_PATTERN.fullmatch(item_id):
        raise HTTPException(status_code=400, detail="Invalid history item id")

    output_path = Path(OUTPUT_DIR)
    metadata_path = output_path / f"{item_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="History item not found")

    try:
        with open(metadata_path, "r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    except (OSError, json.JSONDecodeError):
        raise HTTPException(status_code=404, detail="History item metadata is invalid")

    audio_filename = metadata.get("audio_filename")
    subtitle_filename = metadata.get("subtitle_filename")
    if not isinstance(audio_filename, str) or not isinstance(subtitle_filename, str):
        raise HTTPException(status_code=404, detail="History item files are missing")

    audio_path = output_path / audio_filename
    subtitle_path = output_path / subtitle_filename
    if not audio_path.exists() or not subtitle_path.exists():
        raise HTTPException(status_code=404, detail="History item files are missing")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.write(audio_path, arcname=audio_filename)
        zip_file.write(subtitle_path, arcname=subtitle_filename)

    zip_filename = f"{item_id}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers=headers,
    )
