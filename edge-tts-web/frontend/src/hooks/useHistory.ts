/** Hook for history list loading, searching, and deleting. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api";
import type { HistoryItem } from "../types/api";

const SEARCH_DEBOUNCE_MS = 250;

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadHistory = useCallback(async (searchValue: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getHistory(searchValue);
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadHistory(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadHistory, search]);

  const addHistoryItem = useCallback((item: HistoryItem) => {
    setItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)]);
  }, []);

  const removeHistoryItems = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
  }, []);

  const deleteHistoryItems = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        return { deleted: [] as string[], failed: [] as string[] };
      }

      const response = await apiClient.deleteHistory(ids);
      removeHistoryItems(response.deleted_ids);
      return { deleted: response.deleted_ids, failed: response.failed_ids };
    },
    [removeHistoryItems]
  );

  return useMemo(
    () => ({
      items,
      loading,
      error,
      search,
      setSearch,
      addHistoryItem,
      deleteHistoryItems,
      reload: () => loadHistory(search),
    }),
    [
      addHistoryItem,
      deleteHistoryItems,
      error,
      items,
      loadHistory,
      loading,
      search,
    ]
  );
}
