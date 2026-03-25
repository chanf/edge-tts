/** i18n configuration and translations */

import { zh } from "./zh";
import { en } from "./en";

export const translations = {
  zh,
  en,
};

export type Language = keyof typeof translations;
export const supportedLanguages: Language[] = ["zh", "en"];

export const defaultLanguage: Language = "zh";
