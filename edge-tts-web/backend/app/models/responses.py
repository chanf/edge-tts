"""Response models for the edge-tts web API."""

from typing import List, Optional
from typing_extensions import Literal
from pydantic import BaseModel


class VoiceResponse(BaseModel):
    """Voice model for API responses."""

    id: str
    name: str
    short_name: str
    locale: str
    gender: str
    language: str
    friendly_name: str
    status: str
    categories: List[str]
    personalities: List[str]


class VoicesListResponse(BaseModel):
    """Response model for voices list endpoint."""

    voices: List[VoiceResponse]
    total: int


class HistoryItem(BaseModel):
    """History item model."""

    id: str
    created_at: str
    text_preview: str
    text: str
    voice: str
    rate: str
    volume: str
    pitch: str
    boundary: Literal["WordBoundary", "SentenceBoundary"]
    duration_ms: int
    word_count: int
    audio_filename: str
    subtitle_filename: str
    audio_url: str
    subtitle_url: str


class TTSGenerateResponse(BaseModel):
    """Response model for TTS generation."""

    audio_url: str
    subtitle_url: Optional[str]
    duration_ms: int
    word_count: int
    history_item: Optional[HistoryItem] = None


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str
    edge_service: str
    version: str


class WSMessage(BaseModel):
    """WebSocket message base model."""

    type: str


class HistoryListResponse(BaseModel):
    """Response model for history list."""

    items: List[HistoryItem]
    total: int


class HistoryDeleteResponse(BaseModel):
    """Response model for history delete operation."""

    deleted_ids: List[str]
    failed_ids: List[str]
