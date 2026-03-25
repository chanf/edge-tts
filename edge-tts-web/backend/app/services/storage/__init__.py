"""Storage factory and helpers."""

import os
from functools import lru_cache

from .base import HistoryStore
from .local import LocalHistoryStore


def get_storage_mode() -> str:
    return os.environ.get("EDGE_TTS_STORAGE_MODE", "local").lower()


@lru_cache(maxsize=4)
def get_history_store(output_dir: str) -> HistoryStore:
    mode = get_storage_mode()
    if mode == "cloudflare":
        from .cloudflare import CloudflareHistoryStore

        return CloudflareHistoryStore()
    return LocalHistoryStore(output_dir)
