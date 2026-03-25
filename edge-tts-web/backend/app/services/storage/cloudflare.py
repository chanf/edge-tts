"""Cloudflare R2 + D1 storage implementation."""

import asyncio
import json
import os
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

from ...models.responses import HistoryItem
from .base import HistoryStore


class CloudflareHistoryStore(HistoryStore):
    """Persist history items to Cloudflare R2 + D1."""

    mode = "cloudflare"

    def __init__(self) -> None:
        self.account_id = os.environ.get("CF_ACCOUNT_ID", "")
        self.d1_database_id = os.environ.get("CF_D1_DATABASE_ID", "")
        self.d1_token = os.environ.get("CF_D1_API_TOKEN", "")
        self.r2_endpoint = os.environ.get("CF_R2_ENDPOINT", "")
        self.r2_bucket = os.environ.get("CF_R2_BUCKET", "")
        self.r2_access_key = os.environ.get("CF_R2_ACCESS_KEY_ID", "")
        self.r2_secret_key = os.environ.get("CF_R2_SECRET_ACCESS_KEY", "")

        missing = [
            name
            for name, value in [
                ("CF_ACCOUNT_ID", self.account_id),
                ("CF_D1_DATABASE_ID", self.d1_database_id),
                ("CF_D1_API_TOKEN", self.d1_token),
                ("CF_R2_ENDPOINT", self.r2_endpoint),
                ("CF_R2_BUCKET", self.r2_bucket),
                ("CF_R2_ACCESS_KEY_ID", self.r2_access_key),
                ("CF_R2_SECRET_ACCESS_KEY", self.r2_secret_key),
            ]
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing Cloudflare config: {', '.join(missing)}")

        self.d1_url = (
            f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}"
            f"/d1/database/{self.d1_database_id}/query"
        )

        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.r2_endpoint,
            aws_access_key_id=self.r2_access_key,
            aws_secret_access_key=self.r2_secret_key,
            region_name="auto",
        )

    def _audio_key(self, filename: str) -> str:
        return f"audio/{filename}"

    def _subtitle_key(self, filename: str) -> str:
        return f"subtitle/{filename}"

    def _build_media_urls(self, audio_filename: str, subtitle_filename: str) -> Tuple[str, str]:
        return f"/downloads/{audio_filename}", f"/downloads/{subtitle_filename}"

    def _d1_query_sync(self, sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
        payload = json.dumps({"sql": sql, "params": params or []}).encode("utf-8")
        request = urllib.request.Request(
            self.d1_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.d1_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))

    async def _d1_query(self, sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
        return await asyncio.to_thread(self._d1_query_sync, sql, params)

    def _extract_rows(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not payload.get("success", True):
            errors = payload.get("errors") or []
            raise RuntimeError(f"D1 query failed: {errors}")

        result = payload.get("result")
        if isinstance(result, list) and result:
            entry = result[0]
            if isinstance(entry, dict) and "results" in entry:
                return entry.get("results") or []
            if isinstance(entry, dict) and "success" in entry and "results" in entry:
                return entry.get("results") or []
            if isinstance(entry, dict) and "results" not in entry:
                return result  # Already rows.
        if isinstance(result, dict) and "results" in result:
            return result.get("results") or []
        return []

    def _put_object(self, key: str, body: bytes, content_type: str) -> None:
        self.s3.put_object(
            Bucket=self.r2_bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
        )

    def _get_object_bytes(self, key: str) -> bytes:
        response = self.s3.get_object(Bucket=self.r2_bucket, Key=key)
        return response["Body"].read()

    def _delete_object(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.r2_bucket, Key=key)

    async def save(self, item: HistoryItem, audio_bytes: bytes, subtitle_text: str) -> HistoryItem:
        audio_filename = item.audio_filename
        subtitle_filename = item.subtitle_filename
        audio_key = self._audio_key(audio_filename)
        subtitle_key = self._subtitle_key(subtitle_filename)

        await asyncio.to_thread(self._put_object, audio_key, audio_bytes, "audio/mpeg")
        await asyncio.to_thread(
            self._put_object, subtitle_key, subtitle_text.encode("utf-8"), "text/plain; charset=utf-8"
        )

        await self._d1_query(
            """
            INSERT OR REPLACE INTO tts_history (
              id, created_at, text_preview, text, voice, rate, volume, pitch,
              boundary, duration_ms, word_count, audio_key, subtitle_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                item.id,
                item.created_at,
                item.text_preview,
                item.text,
                item.voice,
                item.rate,
                item.volume,
                item.pitch,
                item.boundary,
                item.duration_ms,
                item.word_count,
                audio_key,
                subtitle_key,
            ],
        )

        audio_url, subtitle_url = self._build_media_urls(audio_filename, subtitle_filename)
        return item.model_copy(update={"audio_url": audio_url, "subtitle_url": subtitle_url})

    async def list(
        self,
        search: Optional[str],
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Tuple[List[HistoryItem], int]:
        params: List[Any] = []
        where_clause = ""
        if search and search.strip():
            search_value = f"%{search.strip()}%"
            where_clause = """
                WHERE id LIKE ?
                   OR voice LIKE ?
                   OR text_preview LIKE ?
                   OR text LIKE ?
                   OR created_at LIKE ?
            """
            params.extend([search_value] * 5)

        count_sql = f"SELECT COUNT(*) AS count FROM tts_history {where_clause}"
        count_payload = await self._d1_query(count_sql, params)
        count_rows = self._extract_rows(count_payload)
        total = int(count_rows[0]["count"]) if count_rows else 0

        data_sql = """
            SELECT id, created_at, text_preview, text, voice, rate, volume, pitch, boundary,
                   duration_ms, word_count, audio_key, subtitle_key
            FROM tts_history
        """
        data_sql += f" {where_clause} ORDER BY created_at DESC"
        data_params = list(params)
        if offset is not None and limit is not None:
            data_sql += " LIMIT ? OFFSET ?"
            data_params.extend([limit, offset])

        payload = await self._d1_query(data_sql, data_params)
        rows = self._extract_rows(payload)

        items: List[HistoryItem] = []
        for row in rows:
            audio_key = row.get("audio_key") or self._audio_key(f"{row['id']}.mp3")
            subtitle_key = row.get("subtitle_key") or self._subtitle_key(f"{row['id']}.srt")
            audio_filename = Path(audio_key).name
            subtitle_filename = Path(subtitle_key).name
            audio_url, subtitle_url = self._build_media_urls(audio_filename, subtitle_filename)

            items.append(
                HistoryItem(
                    id=row["id"],
                    created_at=row["created_at"],
                    text_preview=row["text_preview"],
                    text=row["text"],
                    voice=row["voice"],
                    rate=row["rate"],
                    volume=row["volume"],
                    pitch=row["pitch"],
                    boundary=row["boundary"],
                    duration_ms=int(row["duration_ms"]),
                    word_count=int(row.get("word_count") or 0),
                    audio_filename=audio_filename,
                    subtitle_filename=subtitle_filename,
                    audio_url=audio_url,
                    subtitle_url=subtitle_url,
                )
            )

        return items, total

    async def delete(self, ids: List[str]) -> Tuple[List[str], List[str]]:
        deleted_ids: List[str] = []
        failed_ids: List[str] = []

        for item_id in ids:
            try:
                payload = await self._d1_query(
                    "SELECT audio_key, subtitle_key FROM tts_history WHERE id = ?",
                    [item_id],
                )
                rows = self._extract_rows(payload)
                if not rows:
                    failed_ids.append(item_id)
                    continue

                audio_key = rows[0].get("audio_key") or self._audio_key(f"{item_id}.mp3")
                subtitle_key = rows[0].get("subtitle_key") or self._subtitle_key(f"{item_id}.srt")

                await asyncio.to_thread(self._delete_object, audio_key)
                await asyncio.to_thread(self._delete_object, subtitle_key)
                await self._d1_query("DELETE FROM tts_history WHERE id = ?", [item_id])
                deleted_ids.append(item_id)
            except (ClientError, RuntimeError, KeyError, OSError):
                failed_ids.append(item_id)

        return deleted_ids, failed_ids

    async def get_item_assets(self, item_id: str) -> Tuple[bytes, bytes, str, str]:
        payload = await self._d1_query(
            "SELECT audio_key, subtitle_key FROM tts_history WHERE id = ?",
            [item_id],
        )
        rows = self._extract_rows(payload)
        if not rows:
            raise FileNotFoundError(item_id)

        audio_key = rows[0].get("audio_key") or self._audio_key(f"{item_id}.mp3")
        subtitle_key = rows[0].get("subtitle_key") or self._subtitle_key(f"{item_id}.srt")
        audio_filename = Path(audio_key).name
        subtitle_filename = Path(subtitle_key).name

        try:
            audio_bytes = await asyncio.to_thread(self._get_object_bytes, audio_key)
            subtitle_bytes = await asyncio.to_thread(self._get_object_bytes, subtitle_key)
        except ClientError as exc:
            raise FileNotFoundError(item_id) from exc

        return audio_bytes, subtitle_bytes, audio_filename, subtitle_filename

    async def get_file_bytes(self, filename: str) -> Tuple[bytes, str]:
        if filename.endswith(".mp3"):
            key = self._audio_key(filename)
            media_type = "audio/mpeg"
        elif filename.endswith(".srt"):
            key = self._subtitle_key(filename)
            media_type = "text/plain"
        else:
            key = self._audio_key(filename)
            media_type = "application/octet-stream"

        try:
            data = await asyncio.to_thread(self._get_object_bytes, key)
        except ClientError as exc:
            raise FileNotFoundError(filename) from exc

        return data, media_type
