/** Voice types. */

export interface Voice {
  id: string;
  name: string;
  short_name: string;
  locale: string;
  gender: "Male" | "Female";
  language: string;
  friendly_name: string;
  status: string;
  categories: string[];
  personalities: string[];
}

export interface VoiceFilters {
  country?: string;
  gender?: "Male" | "Female";
  language?: string;
  search?: string;
}

export interface VoicesListResponse {
  voices: Voice[];
  total: number;
}

export interface CountryOption {
  code: string;
  name: string;
  initial: string;
  count: number;
}
