/** Voice selector component with filtering. */

import { useState } from "react";
import { useVoices } from "../hooks/useVoices";
import { useTTSContext } from "../contexts/TTSContext";
import { useT } from "../contexts/LanguageContext";

export function VoiceSelector() {
  const { voices, allVoices, filters, updateFilter, clearFilters, countries, loading, error } =
    useVoices();
  const { config, updateConfig } = useTTSContext();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedVoice = allVoices.find((voice) => voice.short_name === config.voice);

  const filteredForDisplay = voices.filter((voice) =>
    searchTerm
      ? voice.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        voice.locale.toLowerCase().includes(searchTerm.toLowerCase()) ||
        voice.friendly_name.toLowerCase().includes(searchTerm.toLowerCase())
      : true
  );

  const handleSelectVoice = (voice: (typeof voices)[number]) => {
    updateConfig("voice", voice.short_name);
    setIsOpen(false);
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
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => handleSelectVoice(voice)}
                  className={`w-full p-3 text-left rounded-md mb-1 transition-colors ${
                    voice.short_name === config.voice
                      ? "bg-blue-100 text-blue-900"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <div className="font-medium">{voice.friendly_name}</div>
                  <div className="text-sm text-gray-600">
                    {voice.locale} - {voice.gender === "Male" ? t.male : t.female}
                  </div>
                </button>
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
