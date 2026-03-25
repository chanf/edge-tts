"""Downloads routes for cloud storage mode."""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ...services.storage import get_history_store

router = APIRouter(tags=["downloads"])
OUTPUT_DIR = os.environ.get("EDGE_TTS_OUTPUT_DIR", "downloads")


@router.get("/downloads/{filename}")
async def download_file(filename: str) -> Response:
    """Download audio or subtitle file from storage."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    store = get_history_store(OUTPUT_DIR)
    try:
        content, media_type = await store.get_file_bytes(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)
