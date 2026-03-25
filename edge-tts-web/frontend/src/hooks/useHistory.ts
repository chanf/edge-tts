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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  const loadHistory = useCallback(
    async (searchValue: string, pageValue: number, pageSizeValue: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.getHistory(searchValue, pageValue, pageSizeValue);
        setItems(response.items);
        setTotal(response.total);

        const totalPages = Math.max(1, Math.ceil(response.total / pageSizeValue));
        if (pageValue > totalPages) {
          setPage(totalPages);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    void loadHistory(debouncedSearch, page, pageSize);
  }, [debouncedSearch, loadHistory, page, pageSize]);

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
      void loadHistory(debouncedSearch, page, pageSize);
      return { deleted: response.deleted_ids, failed: response.failed_ids };
    },
    [debouncedSearch, loadHistory, page, pageSize, removeHistoryItems]
  );

  return useMemo(
    () => ({
      items,
      loading,
      error,
      search,
      setSearch,
      page,
      setPage,
      pageSize,
      setPageSize,
      total,
      addHistoryItem,
      deleteHistoryItems,
      reload: () => loadHistory(debouncedSearch, page, pageSize),
    }),
    [
      addHistoryItem,
      deleteHistoryItems,
      debouncedSearch,
      error,
      items,
      loadHistory,
      loading,
      page,
      pageSize,
      search,
      total,
    ]
  );
}
