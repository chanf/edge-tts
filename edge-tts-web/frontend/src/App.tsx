/** Main App component. */

import { useMemo, useState } from "react";
import { TTSProvider, useTTSContext } from "./contexts/TTSContext";
import { LanguageProvider, useT } from "./contexts/LanguageContext";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { TextInput } from "./components/TextInput";
import { VoiceSelector } from "./components/VoiceSelector";
import { AudioControls } from "./components/AudioControls";
import { AudioPlayer } from "./components/AudioPlayer";
import { SubtitleDisplay } from "./components/SubtitleDisplay";
import { HistoryList } from "./components/HistoryList";
import { useHistory } from "./hooks/useHistory";
import { apiClient } from "./services/api";

function AppContent() {
  const { config } = useTTSContext();
  const t = useT();
  const {
    items: historyItems,
    loading: historyLoading,
    error: historyError,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    total: historyTotal,
    addHistoryItem,
    deleteHistoryItems,
  } = useHistory();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [playRequest, setPlayRequest] = useState<{ id: string; token: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [activeTab, setActiveTab] = useState<"basic" | "long">("basic");
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [segmentProgress, setSegmentProgress] = useState<{ current: number; total: number } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const currentItem = historyItems.find((item) => item.id === currentItemId) || null;

  const canGenerate = config.text.trim().length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (!config.text.trim()) {
      alert(t.enterText);
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const response = await apiClient.generateTTS({
        text: config.text,
        voice: config.voice,
        rate: config.rate,
        volume: config.volume,
        pitch: config.pitch,
        boundary: config.boundary,
        generate_subtitles: true,
      });

      if (response.history_item) {
        addHistoryItem(response.history_item);
        setCurrentItemId(response.history_item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.generateFailed);
    } finally {
      setIsGenerating(false);
    }
  };

  const splitLongText = (text: string) => {
    const maxLen = 1000;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    const segments: { index: number; text: string; length: number }[] = [];
    const pushSegment = (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }
      segments.push({
        index: segments.length + 1,
        text: trimmed,
        length: Array.from(trimmed).length,
      });
    };

    const splitByPunctuation = (content: string, splitChars: string[]) => {
      const buffer: string[] = [];
      const parts: string[] = [];
      for (const ch of Array.from(content)) {
        buffer.push(ch);
        if (splitChars.includes(ch)) {
          parts.push(buffer.join("").trim());
          buffer.length = 0;
        }
      }
      if (buffer.length > 0) {
        parts.push(buffer.join("").trim());
      }
      return parts.filter(Boolean);
    };

    const splitWithFallbacks = (content: string) => {
      const primary = splitByPunctuation(content, ["。", "！", "？", "!", "?", "；", ";"]);
      return primary.length > 1 ? primary : splitByPunctuation(content, ["，", ",", "、"]);
    };

    for (const paragraph of paragraphs) {
      const units = Array.from(paragraph);
      if (units.length <= maxLen) {
        pushSegment(paragraph);
        continue;
      }

      let buffer = "";
      let bufferLen = 0;
      const flushBuffer = () => {
        if (buffer) {
          pushSegment(buffer);
          buffer = "";
          bufferLen = 0;
        }
      };

      const chunks = splitWithFallbacks(paragraph);
      for (const chunk of chunks) {
        const chunkLen = Array.from(chunk).length;
        if (chunkLen > maxLen) {
          flushBuffer();
          let piece = "";
          for (const char of Array.from(chunk)) {
            piece += char;
            if (Array.from(piece).length >= maxLen) {
              pushSegment(piece);
              piece = "";
            }
          }
          if (piece) {
            pushSegment(piece);
          }
          continue;
        }

        if (bufferLen + chunkLen > maxLen) {
          flushBuffer();
        }
        buffer += chunk;
        bufferLen += chunkLen;
      }
      flushBuffer();
    }

    return segments;
  };

  const segments = useMemo(() => splitLongText(config.text), [config.text]);
  const totalChars = useMemo(
    () => segments.reduce((sum, seg) => sum + seg.length, 0),
    [segments]
  );

  const handleGenerateLongText = async () => {
    if (segments.length === 0 || isGenerating) {
      return;
    }
    setSegmentError(null);
    setSegmentProgress({ current: 0, total: segments.length });
    setIsGenerating(true);
    setIsMerging(false);

    let failedIndex = 1;
    let mergingPhase = false;
    const createdIds: string[] = [];
    try {
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        failedIndex = i + 1;
        setSegmentProgress({ current: i + 1, total: segments.length });
        const response = await apiClient.generateTTS({
          text: segment.text,
          voice: config.voice,
          rate: config.rate,
          volume: config.volume,
          pitch: config.pitch,
          boundary: config.boundary,
          generate_subtitles: true,
        });
        if (response.history_item) {
          addHistoryItem(response.history_item);
          setCurrentItemId(response.history_item.id);
          createdIds.push(response.history_item.id);
        }
      }

      if (createdIds.length > 0) {
        mergingPhase = true;
        setIsMerging(true);
        const merged = await apiClient.mergeHistory(createdIds, {
          text: config.text,
          voice: config.voice,
          rate: config.rate,
          volume: config.volume,
          pitch: config.pitch,
          boundary: config.boundary,
        });
        addHistoryItem(merged);
        setCurrentItemId(merged.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t.generateFailed;
      if (mergingPhase) {
        setSegmentError(t.mergeFailed + message);
      } else {
        setSegmentError(
          t.segmentFailed.replace("{index}", String(failedIndex)) + message
        );
      }
    } finally {
      setIsGenerating(false);
      setSegmentProgress(null);
      setIsMerging(false);
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(historyItems.map((item) => item.id));
      return;
    }
    setSelectedIds([]);
  };

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      ids.length === 1 ? t.confirmDeleteSingle : t.confirmDeleteBatch.replace("{count}", String(ids.length))
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await deleteHistoryItems(ids);
      if (result.failed.length > 0) {
        setError(t.deletePartialFailed.replace("{count}", String(result.failed.length)));
      }
      setSelectedIds((prev) => prev.filter((id) => !result.deleted.includes(id)));
      if (currentItemId && result.deleted.includes(currentItemId)) {
        setCurrentItemId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed);
    }
  };

  const handlePlayHistoryItem = (id: string) => {
    setPlayRequest((prev) => ({ id, token: (prev?.token ?? 0) + 1 }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t.appTitle}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-2 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("basic")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === "basic"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.basicTtsTab}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("long")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === "long"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.longTtsTab}
              </button>
            </div>

            <TextInput />
            <VoiceSelector />
            <AudioControls />

            {activeTab === "basic" ? (
              <>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-colors ${
                    canGenerate ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isGenerating ? t.generating : t.generate}
                </button>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {error}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">{t.splitPreview}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>{t.segmentCount.replace("{count}", String(segments.length))}</span>
                    <span>{t.totalChars.replace("{count}", String(totalChars))}</span>
                  </div>
                  <div className="mt-4 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    <ul className="divide-y divide-gray-200 text-sm">
                      {segments.map((segment) => (
                        <li key={segment.index} className="px-4 py-3">
                          <div className="text-gray-500 mb-1">
                            {t.segmentLabel
                              .replace("{index}", String(segment.index))
                              .replace("{length}", String(segment.length))}
                          </div>
                          <div className="text-gray-800 whitespace-pre-wrap">{segment.text}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateLongText}
                  disabled={segments.length === 0 || isGenerating}
                  className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-colors ${
                    segments.length > 0 && !isGenerating
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isGenerating
                    ? isMerging
                      ? t.mergingAudio
                      : segmentProgress
                        ? t.generatingSegments
                            .replace("{current}", String(segmentProgress.current))
                            .replace("{total}", String(segmentProgress.total))
                        : t.generating
                    : t.generateAll}
                </button>

                {segmentError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {segmentError}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6 flex flex-col h-full">
            <AudioPlayer
              items={historyItems}
              currentItemId={currentItemId}
              onCurrentItemChange={setCurrentItemId}
              playRequest={playRequest}
              onTimeUpdate={setCurrentTimeSec}
            />
            <SubtitleDisplay
              subtitleUrl={currentItem?.subtitle_url || null}
              currentTimeSec={currentTimeSec}
            />
          </div>
        </div>
        <HistoryList
          items={historyItems}
          loading={historyLoading}
          error={historyError}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setSelectedIds([]);
            setPage(1);
          }}
          page={page}
          pageSize={pageSize}
          total={historyTotal}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            setSelectedIds([]);
          }}
          currentItemId={currentItemId}
          onPlayItem={handlePlayHistoryItem}
          selectedIds={selectedIds}
          onToggleSelectItem={handleToggleSelectItem}
          onToggleSelectAll={handleToggleSelectAll}
          onDeleteItem={(id) => void handleDelete([id])}
          onDeleteSelected={() => void handleDelete(selectedIds)}
        />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          {t.poweredByBy}{" "}
          <a
            href="https://github.com/rany2/edge-tts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            {t.poweredByLink}
          </a>{" "}
          {t.provided}
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <TTSProvider>
        <AppContent />
      </TTSProvider>
    </LanguageProvider>
  );
}

export default App;
