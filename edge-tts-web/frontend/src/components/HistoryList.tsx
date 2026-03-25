/** History list component with search and delete actions. */

import type { HistoryItem } from "../types/api";
import { useT } from "../contexts/LanguageContext";
import { apiClient } from "../services/api";

interface HistoryListProps {
  items: HistoryItem[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  currentItemId: string | null;
  onSelectItem: (id: string) => void;
  selectedIds: string[];
  onToggleSelectItem: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  onDeleteSelected: () => void;
}

const HISTORY_TEXT_MAX_UNITS = 20;

function textUnit(char: string): number {
  // CJK chars are treated as 2 units, so 10 Chinese chars ~= 20 Latin chars.
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(char) ? 2 : 1;
}

function truncateHistoryText(text: string): string {
  const source = text.trim();
  if (!source) {
    return "";
  }

  let units = 0;
  let result = "";
  for (const char of source) {
    const nextUnits = textUnit(char);
    if (units + nextUnits > HISTORY_TEXT_MAX_UNITS) {
      return `${result}...`;
    }
    result += char;
    units += nextUnits;
  }

  return result;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function HistoryList({
  items,
  loading,
  error,
  search,
  onSearchChange,
  currentItemId,
  onSelectItem,
  selectedIds,
  onToggleSelectItem,
  onToggleSelectAll,
  onDeleteItem,
  onDeleteSelected,
}: HistoryListProps) {
  const t = useT();
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-700">{t.history}</h3>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedIds.length === 0}
          aria-label={`${t.deleteSelected} (${selectedIds.length})`}
          title={`${t.deleteSelected} (${selectedIds.length})`}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedIds.length === 0
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          <div className="flex items-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
            </svg>
          </div>
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t.searchHistory}
        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 text-sm"
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">{t.loading}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t.noHistory}</div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">{t.createdAt}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">{t.voice}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">{t.text}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => {
                const selected = selectedIds.includes(item.id);
                const active = currentItemId === item.id;
                const downloadZipUrl = apiClient.getHistoryZipUrl(item.id);
                return (
                  <tr
                    key={item.id}
                    className={active ? "bg-blue-50" : "hover:bg-gray-50"}
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelectItem(item.id)}
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-gray-600 whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">{item.voice}</td>
                    <td className="px-3 py-2 align-top text-gray-800" title={item.text}>
                      {truncateHistoryText(item.text)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectItem(item.id)}
                          aria-label={t.play}
                          title={t.play}
                          className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                        <a
                          href={downloadZipUrl}
                          download={`${item.id}.zip`}
                          aria-label={t.downloadZip}
                          title={t.downloadZip}
                          className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z" />
                          </svg>
                        </a>
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.id)}
                          aria-label={t.delete}
                          title={t.delete}
                          className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
