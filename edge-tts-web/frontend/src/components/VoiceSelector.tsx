/** Voice selector component with filtering. */

import { useEffect, useMemo, useState } from "react";
import { useVoices } from "../hooks/useVoices";
import { useTTSContext } from "../contexts/TTSContext";
import { useT } from "../contexts/LanguageContext";
import type { Voice } from "../types/voice";

const FAVORITES_STORAGE_KEY = "edge-tts-favorite-voices";
const FAVORITES_MAX_COUNT = 8;

function readFavoriteVoiceIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.filter((item): item is string => typeof item === "string"))].slice(
      0,
      FAVORITES_MAX_COUNT
    );
  } catch (_error) {
    return [];
  }
}

function writeFavoriteVoiceIds(ids: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
}

function isSameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

export function VoiceSelector() {
  const { voices, allVoices, filters, updateFilter, clearFilters, countries, loading, error } =
    useVoices();
  const { config, updateConfig } = useTTSContext();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(() => readFavoriteVoiceIds());

  const selectedVoice = allVoices.find((voice) => voice.short_name === config.voice);
  const favoriteSet = useMemo(() => new Set(favoriteVoiceIds), [favoriteVoiceIds]);
  const favoriteVoices = useMemo(() => {
    const voiceMap = new Map(allVoices.map((voice) => [voice.short_name, voice]));
    return favoriteVoiceIds
      .map((shortName) => voiceMap.get(shortName))
      .filter((voice): voice is Voice => Boolean(voice));
  }, [allVoices, favoriteVoiceIds]);

  useEffect(() => {
    if (allVoices.length === 0) {
      return;
    }
    const validIds = new Set(allVoices.map((voice) => voice.short_name));
    setFavoriteVoiceIds((prev) => {
      const cleaned = prev.filter((id) => validIds.has(id)).slice(0, FAVORITES_MAX_COUNT);
      if (isSameList(prev, cleaned)) {
        return prev;
      }
      writeFavoriteVoiceIds(cleaned);
      return cleaned;
    });
  }, [allVoices]);

  const filteredForDisplay = voices.filter((voice) =>
    searchTerm
      ? voice.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        voice.locale.toLowerCase().includes(searchTerm.toLowerCase()) ||
        voice.friendly_name.toLowerCase().includes(searchTerm.toLowerCase())
      : true
  );

  const handleSelectVoice = (voice: Voice) => {
    updateConfig("voice", voice.short_name);
    setIsOpen(false);
  };

  const handleToggleFavorite = (shortName: string) => {
    setFavoriteVoiceIds((prev) => {
      const exists = prev.includes(shortName);
      const next = exists
        ? prev.filter((id) => id !== shortName)
        : [shortName, ...prev.filter((id) => id !== shortName)].slice(0, FAVORITES_MAX_COUNT);
      writeFavoriteVoiceIds(next);
      return next;
    });
  };

  const handleFilterByGender = (gender: "Male" | "Female" | undefined) => {
    updateFilter("gender", gender);
  };

  const handleFilterByCountry = (country: string | undefined) => {
    updateFilter("country", country);
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-500">
          {t.failedToLoadVoices}: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <label className="text-lg font-semibold text-gray-700 block mb-3">{t.selectVoice}</label>

      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-2">{t.favoriteVoices}</div>
        {favoriteVoices.length === 0 ? (
          <div className="text-sm text-gray-500">{t.noFavoriteVoices}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favoriteVoices.map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => handleSelectVoice(voice)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  voice.short_name === config.voice
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-700"
                }`}
              >
                {voice.friendly_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full p-4 border border-gray-300 rounded-lg bg-white text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
      >
        <div>
          <div className="font-medium text-gray-900">{selectedVoice?.friendly_name || t.selectVoice}</div>
          <div className="text-sm text-gray-500">
            {selectedVoice
              ? `${selectedVoice.locale} - ${selectedVoice.gender === "Male" ? t.male : t.female}`
              : ""}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={filters.gender || ""}
              onChange={(e) =>
                handleFilterByGender(
                  e.target.value === "" ? undefined : (e.target.value as "Male" | "Female")
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t.allGenders}</option>
              <option value="Female">{t.female}</option>
              <option value="Male">{t.male}</option>
            </select>

            <select
              value={filters.country || ""}
              onChange={(e) =>
                handleFilterByCountry(e.target.value === "" ? undefined : e.target.value)
              }
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">{t.allCountries}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.count})
                </option>
              ))}
            </select>

            {(filters.gender || filters.country) && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700"
              >
                {t.clearFilters}
              </button>
            )}
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.searchVoices}
            className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 text-sm"
          />

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="text-center py-4 text-gray-500">{t.loading}</div>
            ) : filteredForDisplay.length === 0 ? (
              <div className="text-center py-4 text-gray-500">{t.noVoicesFound}</div>
            ) : (
              filteredForDisplay.map((voice) => (
                <div
                  key={voice.id}
                  className={`flex items-stretch gap-2 p-1 rounded-md mb-1 transition-colors ${
                    voice.short_name === config.voice ? "bg-blue-100" : "hover:bg-gray-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectVoice(voice)}
                    className="flex-1 p-2 text-left rounded-md"
                  >
                    <div className="font-medium text-gray-900">{voice.friendly_name}</div>
                    <div className="text-sm text-gray-600">
                      {voice.locale} - {voice.gender === "Male" ? t.male : t.female}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(voice.short_name)}
                    aria-label={
                      favoriteSet.has(voice.short_name) ? t.removeFromFavorites : t.addToFavorites
                    }
                    title={
                      favoriteSet.has(voice.short_name) ? t.removeFromFavorites : t.addToFavorites
                    }
                    className={`px-3 rounded-md transition-colors ${
                      favoriteSet.has(voice.short_name)
                        ? "text-amber-500 bg-amber-50 hover:text-amber-600"
                        : "text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                    }`}
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill={favoriteSet.has(voice.short_name) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l2.036 6.261a1 1 0 00.95.69h6.583c.969 0 1.371 1.24.588 1.81l-5.325 3.87a1 1 0 00-.364 1.118l2.035 6.261c.3.922-.755 1.688-1.539 1.118l-5.325-3.87a1 1 0 00-1.176 0l-5.325 3.87c-.783.57-1.838-.196-1.539-1.118l2.035-6.261a1 1 0 00-.364-1.118l-5.325-3.87c-.783-.57-.38-1.81.588-1.81h6.583a1 1 0 00.95-.69l2.036-6.261z"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 text-sm text-gray-500 text-center">
            {t.showingVoices} {filteredForDisplay.length} {t.of} {allVoices.length} {t.voices}
          </div>
        </div>
      )}
    </div>
  );
}
