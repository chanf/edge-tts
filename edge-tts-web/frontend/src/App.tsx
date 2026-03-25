/** Main App component. */

import { useState } from "react";
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
    addHistoryItem,
    deleteHistoryItems,
  } = useHistory();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t.appTitle}</h1>
            <p className="text-gray-600 mt-1">{t.appSubtitle}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            <TextInput />
            <VoiceSelector />
            <AudioControls />

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
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
            )}
          </div>

          <div className="space-y-6">
            <AudioPlayer
              items={historyItems}
              currentItemId={currentItemId}
              onCurrentItemChange={setCurrentItemId}
            />
            <SubtitleDisplay subtitleUrl={currentItem?.subtitle_url || null} />
            <HistoryList
              items={historyItems}
              loading={historyLoading}
              error={historyError}
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setSelectedIds([]);
              }}
              currentItemId={currentItemId}
              onSelectItem={setCurrentItemId}
              selectedIds={selectedIds}
              onToggleSelectItem={handleToggleSelectItem}
              onToggleSelectAll={handleToggleSelectAll}
              onDeleteItem={(id) => void handleDelete([id])}
              onDeleteSelected={() => void handleDelete(selectedIds)}
            />
          </div>
        </div>
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
