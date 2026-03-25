"""Local filesystem storage implementation."""

import json
from pathlib import Path
from typing import List, Optional, Tuple

from ...models.responses import HistoryItem
from .base import HistoryStore


class LocalHistoryStore(HistoryStore):
    """Persist history items to local filesystem."""

    mode = "local"

    def __init__(self, output_dir: str) -> None:
        self.output_path = Path(output_dir)
        self.output_path.mkdir(parents=True, exist_ok=True)

    def _build_media_urls(self, audio_filename: str, subtitle_filename: str) -> Tuple[str, str]:
        return f"/downloads/{audio_filename}", f"/downloads/{subtitle_filename}"

    async def save(self, item: HistoryItem, audio_bytes: bytes, subtitle_text: str) -> HistoryItem:
        audio_path = self.output_path / item.audio_filename
        subtitle_path = self.output_path / item.subtitle_filename
        metadata_path = self.output_path / f"{item.id}.json"

        audio_path.write_bytes(audio_bytes)
        subtitle_path.write_text(subtitle_text, encoding="utf-8")

        audio_url, subtitle_url = self._build_media_urls(item.audio_filename, item.subtitle_filename)
        saved_item = item.model_copy(update={"audio_url": audio_url, "subtitle_url": subtitle_url})

        metadata_path.write_text(
            json.dumps(saved_item.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return saved_item

    async def list(
        self,
        search: Optional[str],
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Tuple[List[HistoryItem], int]:
        items: List[HistoryItem] = []
        for metadata_path in self.output_path.glob("*.json"):
            try:
                data = json.loads(metadata_path.read_text(encoding="utf-8"))
                item = HistoryItem.model_validate(data)
                audio_url, subtitle_url = self._build_media_urls(
                    item.audio_filename, item.subtitle_filename
                )
                items.append(item.model_copy(update={"audio_url": audio_url, "subtitle_url": subtitle_url}))
            except (OSError, json.JSONDecodeError, ValueError):
                continue

        items.sort(key=lambda item: item.created_at, reverse=True)

        normalized_search = (search or "").strip().lower()
        if normalized_search:
            items = [
                item
                for item in items
                if normalized_search
                in " ".join(
                    [
                        item.id,
                        item.created_at,
                        item.voice,
                        item.text_preview,
                        item.text,
                    ]
                ).lower()
            ]

        total = len(items)
        if offset is not None and limit is not None:
            items = items[offset : offset + limit]

        return items, total

    async def delete(self, ids: List[str]) -> Tuple[List[str], List[str]]:
        deleted_ids: List[str] = []
        failed_ids: List[str] = []

        for item_id in ids:
            removed_any = False
            try:
                for ext in (".mp3", ".srt", ".json"):
                    file_path = self.output_path / f"{item_id}{ext}"
                    if file_path.exists():
                        file_path.unlink()
                        removed_any = True
            except OSError:
                failed_ids.append(item_id)
                continue

            if removed_any:
                deleted_ids.append(item_id)
            else:
                failed_ids.append(item_id)

        return deleted_ids, failed_ids

    async def get_item_assets(self, item_id: str) -> Tuple[bytes, bytes, str, str]:
        metadata_path = self.output_path / f"{item_id}.json"
        if not metadata_path.exists():
            raise FileNotFoundError(item_id)

        data = json.loads(metadata_path.read_text(encoding="utf-8"))
        audio_filename = data.get("audio_filename") or f"{item_id}.mp3"
        subtitle_filename = data.get("subtitle_filename") or f"{item_id}.srt"

        audio_path = self.output_path / audio_filename
        subtitle_path = self.output_path / subtitle_filename
        if not audio_path.exists() or not subtitle_path.exists():
            raise FileNotFoundError(item_id)

        return (
            audio_path.read_bytes(),
            subtitle_path.read_bytes(),
            audio_filename,
            subtitle_filename,
        )

    async def get_file_bytes(self, filename: str) -> Tuple[bytes, str]:
        file_path = self.output_path / filename
        if not file_path.exists():
            raise FileNotFoundError(filename)

        if filename.endswith(".mp3"):
            media_type = "audio/mpeg"
        elif filename.endswith(".srt"):
            media_type = "text/plain"
        else:
            media_type = "application/octet-stream"

        return file_path.read_bytes(), media_type
