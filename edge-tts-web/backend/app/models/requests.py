"""Request models for the edge-tts web API."""

from typing import List, Optional
from typing_extensions import Literal
from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """Request model for TTS generation."""

    text: str = Field(..., min_length=1, max_length=100000, description="Text to synthesize")
    voice: str = Field(..., description="Voice name (e.g., 'en-US-JennyNeural')")
    rate: str = Field(default="+0%", pattern=r"^[+-]\d+%$", description="Rate adjustment")
    volume: str = Field(default="+0%", pattern=r"^[+-]\d+%$", description="Volume adjustment")
    pitch: str = Field(default="+0Hz", pattern=r"^[+-]\d+Hz$", description="Pitch adjustment")
    boundary: Literal["WordBoundary", "SentenceBoundary"] = Field(
        default="SentenceBoundary", description="Type of boundary for subtitles"
    )
    generate_subtitles: bool = Field(default=True, description="Whether to generate subtitles")


class VoiceFilterRequest(BaseModel):
    """Request model for voice filtering."""

    locale: Optional[str] = None
    gender: Optional[Literal["Male", "Female"]] = None
    language: Optional[str] = None
    search: Optional[str] = Field(None, min_length=1, max_length=100)


class HistoryDeleteRequest(BaseModel):
    """Request model for deleting history items."""

    ids: List[str] = Field(..., min_length=1, description="History item IDs to delete")
