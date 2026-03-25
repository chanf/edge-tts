"""TTS generation API routes."""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

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
