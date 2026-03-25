/** Text input component with character count and validation. */

import type { ChangeEvent } from "react";
import { useTTSContext } from "../contexts/TTSContext";
import { useT } from "../contexts/LanguageContext";

export function TextInput() {
  const { config, updateConfig } = useTTSContext();
  const t = useT();

  const characterCount = config.text.length;
  const wordCount = config.text.trim() ? config.text.trim().split(/\s+/).length : 0;

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    updateConfig("text", e.target.value);
  };

  const handleClear = () => {
    updateConfig("text", "");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-3">
        <label htmlFor="text-input" className="text-lg font-semibold text-gray-700">
          {t.textLabel}
        </label>
        <button
          type="button"
          onClick={handleClear}
          className="text-sm text-red-500 hover:text-red-700 transition-colors"
        >
          {t.clear}
        </button>
      </div>

      <textarea
        id="text-input"
        value={config.text}
        onChange={handleChange}
        placeholder={t.textPlaceholder}
        className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-800"
        maxLength={100000}
      />

      <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
        <span>{wordCount} {t.words}</span>
        <span>{characterCount.toLocaleString()} {t.characters}</span>
      </div>
    </div>
  );
}
