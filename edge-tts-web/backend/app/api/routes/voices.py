"""Voices API routes."""

from typing import Optional
from fastapi import APIRouter, Query

from ...models.requests import VoiceFilterRequest
from ...models.responses import VoicesListResponse
from ...services.tts_service import TTSService

router = APIRouter(prefix="/api/voices", tags=["voices"])


@router.get("", response_model=VoicesListResponse)
async def list_voices_endpoint(
    locale: Optional[str] = Query(None, description="Filter by locale (e.g., 'en-US')"),
    gender: Optional[str] = Query(None, description="Filter by gender ('Male' or 'Female')"),
    language: Optional[str] = Query(None, description="Filter by language (e.g., 'en')"),
    search: Optional[str] = Query(None, description="Search in name, locale, or friendly name"),
) -> VoicesListResponse:
    """
    List all available TTS voices with optional filtering.

    Returns a list of voices with their attributes including:
    - id: Full voice name
    - short_name: Short identifier
    - locale: Region code (e.g., 'en-US')
    - gender: 'Male' or 'Female'
    - language: Language code (e.g., 'en')
    - friendly_name: Display name
    - status: 'GA', 'Preview', or 'Deprecated'
    - categories: Content categories
    - personalities: Voice personality traits
    """
    voices, total = await TTSService.get_voices(
        locale=locale, gender=gender, language=language, search=search
    )
    return VoicesListResponse(voices=voices, total=total)
