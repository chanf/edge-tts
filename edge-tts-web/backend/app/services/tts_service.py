"""TTS service wrapper for edge-tts library."""

import asyncio
import base64
import inspect
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional, Tuple

from edge_tts import Communicate, SubMaker, list_voices

from ..models.requests import TTSRequest
from ..models.responses import HistoryItem, VoiceResponse


class TTSService:
    """Service for Text-to-Speech operations using edge-tts."""

    # Cache for voices list
    _voices_cache: Optional[List[Dict]] = None
    _voices_cache_time: Optional[float] = None
    _CACHE_TTL = 3600  # 1 hour
    _TEXT_PREVIEW_LENGTH = 120

    @staticmethod
    def _create_communicate(request: TTSRequest) -> Communicate:
        """
        Create a Communicate instance with compatibility for different
        edge-tts parameter names.
        """
        kwargs: Dict[str, object] = {
            "text": request.text,
            "voice": request.voice,
            "rate": request.rate,
            "volume": request.volume,
            "pitch": request.pitch,
        }

        signature = inspect.signature(Communicate.__init__)
        if "boundary" in signature.parameters:
            kwargs["boundary"] = request.boundary
        elif "boundary_type" in signature.parameters:
            kwargs["boundary_type"] = request.boundary

        return Communicate(**kwargs)

    @staticmethod
    async def get_voices(
        locale: Optional[str] = None,
        gender: Optional[str] = None,
        language: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[VoiceResponse], int]:
        """
        Get list of available voices with optional filtering.

        Returns:
            Tuple of (voices list, total count)
        """
        # Check cache
        now = asyncio.get_event_loop().time()
        if (
            TTSService._voices_cache is not None
            and TTSService._voices_cache_time is not None
            and now - TTSService._voices_cache_time < TTSService._CACHE_TTL
        ):
            voices_data = TTSService._voices_cache
        else:
            voices_data = await list_voices()
            TTSService._voices_cache = voices_data
            TTSService._voices_cache_time = now

        # Build voice response objects with language field
        voices = []
        for voice in voices_data:
            voice_obj = VoiceResponse(
                id=voice["Name"],
                name=voice["Name"],
                short_name=voice.get("ShortName", voice["Name"]),
                locale=voice["Locale"],
                gender=voice["Gender"],
                language=voice["Locale"].split("-")[0] if "-" in voice["Locale"] else voice["Locale"],
                friendly_name=voice.get("FriendlyName", ""),
                status=voice.get("Status", "GA"),
                categories=voice.get("VoiceTag", {}).get("ContentCategories", []),
                personalities=voice.get("VoiceTag", {}).get("VoicePersonalities", []),
            )
            voices.append(voice_obj)

        # Apply filters
        filtered = voices
        if locale:
            filtered = [v for v in filtered if v.locale == locale]
        if gender:
            filtered = [v for v in filtered if v.gender == gender]
        if language:
            filtered = [v for v in filtered if v.language == language]
        if search:
            search_lower = search.lower()
            filtered = [
                v
                for v in filtered
                if search_lower in v.name.lower()
                or search_lower in v.locale.lower()
                or search_lower in v.friendly_name.lower()
            ]

        return filtered, len(filtered)

    @staticmethod
    async def generate_tts(
        request: TTSRequest, output_dir: str = "downloads"
    ) -> HistoryItem:
        """
        Generate TTS audio and subtitles.

        Returns:
            History item for the generated result.
        """
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Generate unique ID
        request_id = uuid.uuid4().hex[:8]
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        item_id = f"tts_{timestamp}_{request_id}"
        created_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        audio_filename = f"{item_id}.mp3"
        subtitle_filename = f"{item_id}.srt"
        metadata_filename = f"{item_id}.json"

        # Create communicate object
        communicate = TTSService._create_communicate(request)

        # Collect audio chunks and metadata
        audio_chunks: List[bytes] = []
        # Always generate subtitle files when media is saved.
        submaker = SubMaker()
        word_count = 0
        total_duration = 0

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)
                if chunk["type"] == "WordBoundary":
                    word_count += 1
                total_duration = max(total_duration, int(chunk["offset"] + chunk["duration"]))

        # Combine audio chunks
        audio_bytes = b"".join(audio_chunks)
        with open(output_path / audio_filename, "wb") as f:
            f.write(audio_bytes)

        # Generate subtitles
        srt_content = submaker.get_srt()
        with open(output_path / subtitle_filename, "w", encoding="utf-8") as f:
            f.write(srt_content)

        # Convert duration from 100ns units to milliseconds
        duration_ms = total_duration // 10000

        preview = " ".join(request.text.strip().split())
        if len(preview) > TTSService._TEXT_PREVIEW_LENGTH:
            preview = preview[: TTSService._TEXT_PREVIEW_LENGTH - 3] + "..."

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
            duration_ms=duration_ms,
            word_count=word_count,
            audio_filename=audio_filename,
            subtitle_filename=subtitle_filename,
            audio_url=f"/downloads/{audio_filename}",
            subtitle_url=f"/downloads/{subtitle_filename}",
        )

        with open(output_path / metadata_filename, "w", encoding="utf-8") as f:
            json.dump(history_item.model_dump(), f, ensure_ascii=False, indent=2)

        return history_item

    @staticmethod
    async def get_history(
        output_dir: str = "downloads", search: Optional[str] = None
    ) -> Tuple[List[HistoryItem], int]:
        """Get history list from persisted metadata files."""
        output_path = Path(output_dir)
        if not output_path.exists():
            return [], 0

        items: List[HistoryItem] = []
        for metadata_path in output_path.glob("*.json"):
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                items.append(HistoryItem.model_validate(data))
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

        return items, len(items)

    @staticmethod
    async def delete_history(
        ids: List[str], output_dir: str = "downloads"
    ) -> Tuple[List[str], List[str]]:
        """Delete history items and associated files."""
        output_path = Path(output_dir)
        deleted_ids: List[str] = []
        failed_ids: List[str] = []
        safe_id_pattern = re.compile(r"^[A-Za-z0-9_-]+$")

        for item_id in ids:
            if not safe_id_pattern.fullmatch(item_id):
                failed_ids.append(item_id)
                continue

            removed_any = False
            try:
                for ext in (".mp3", ".srt", ".json"):
                    file_path = output_path / f"{item_id}{ext}"
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

    @staticmethod
    async def stream_tts(
        request: TTSRequest,
    ) -> AsyncGenerator[Dict, None]:
        """
        Stream TTS audio and metadata.

        Yields:
            Dict with type and data fields for each chunk
        """
        communicate = TTSService._create_communicate(request)

        sequence = 0
        async for chunk in communicate.stream():
            sequence += 1
            if chunk["type"] == "audio":
                # Encode audio data as base64 for JSON transmission
                yield {
                    "type": "audio",
                    "data": base64.b64encode(chunk["data"]).decode("utf-8"),
                    "sequence": sequence,
                }
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                yield {
                    "type": chunk["type"],
                    "offset": chunk["offset"],
                    "duration": chunk["duration"],
                    "text": chunk["text"],
                    "sequence": sequence,
                }

        # Send completion message
        yield {
            "type": "done",
            "total_chunks": sequence,
        }
