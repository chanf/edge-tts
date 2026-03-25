"""Storage interface for history persistence."""

from typing import List, Optional, Protocol, Tuple

from ...models.responses import HistoryItem


class HistoryStore(Protocol):
    """Storage interface for history items and media files."""

    mode: str

    async def save(self, item: HistoryItem, audio_bytes: bytes, subtitle_text: str) -> HistoryItem:
        """Persist a history item with its audio and subtitle assets."""

    async def list(
        self,
        search: Optional[str],
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Tuple[List[HistoryItem], int]:
        """List history items with optional search and pagination."""

    async def delete(self, ids: List[str]) -> Tuple[List[str], List[str]]:
        """Delete history items by id, returning deleted and failed ids."""

    async def get_item_assets(self, item_id: str) -> Tuple[bytes, bytes, str, str]:
        """Return audio bytes, subtitle bytes, and their filenames for an item."""

    async def get_file_bytes(self, filename: str) -> Tuple[bytes, str]:
        """Return file bytes and media type for a given filename."""
