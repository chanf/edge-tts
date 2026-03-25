/** Language context for i18n support */

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { translations, Language, defaultLanguage, supportedLanguages } from "../i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.zh;
  availableLanguages: Language[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);

  const setLanguage = useCallback((lang: Language) => {
    if (supportedLanguages.includes(lang)) {
      setLanguageState(lang);
      // Save to localStorage
      localStorage.setItem("edge-tts-language", lang);
    }
  }, []);

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, availableLanguages: supportedLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

// Hook for translations shorthand
export function useT() {
  const { t } = useLanguage();
  return t;
}
