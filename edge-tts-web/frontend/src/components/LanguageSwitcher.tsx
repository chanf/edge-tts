/** Language switcher component */

import { useLanguage } from "../contexts/LanguageContext";
import type { Language } from "../i18n";

const languageNames: Record<Language, string> = {
  zh: "中文",
  en: "English",
};

export function LanguageSwitcher() {
  const { language, setLanguage, availableLanguages } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">🌐</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors"
      >
        {availableLanguages.map((lang) => (
          <option key={lang} value={lang}>
            {languageNames[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
