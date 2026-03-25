/** Hook for fetching and filtering voices. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api";
import type { CountryOption, Voice, VoiceFilters } from "../types/voice";

function extractCountryCode(locale: string): string | null {
  const match = locale.toUpperCase().match(/-([A-Z]{2})(?:-|$)/);
  return match ? match[1] : null;
}

function resolveCountryName(code: string): string {
  try {
    if (typeof Intl.DisplayNames !== "undefined") {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      const resolved = displayNames.of(code);
      return resolved || code;
    }
  } catch (_error) {
    // Ignore and fallback to country code.
  }
  return code;
}

function countryInitial(countryName: string): string {
  const firstChar = countryName.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : "#";
}

export function useVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VoiceFilters>({});

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getVoices();
        setVoices(data.voices || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch voices");
      } finally {
        setLoading(false);
      }
    };

    void fetchVoices();
  }, []);

  const countries = useMemo<CountryOption[]>(() => {
    const countryMap = new Map<string, CountryOption>();
    for (const voice of voices) {
      const code = extractCountryCode(voice.locale);
      if (!code) {
        continue;
      }

      const existing = countryMap.get(code);
      if (existing) {
        existing.count += 1;
        continue;
      }

      const name = resolveCountryName(code);
      countryMap.set(code, {
        code,
        name,
        initial: countryInitial(name),
        count: 1,
      });
    }

    return [...countryMap.values()].sort((a, b) => {
      if (a.initial === "#" && b.initial !== "#") {
        return 1;
      }
      if (a.initial !== "#" && b.initial === "#") {
        return -1;
      }
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
  }, [voices]);

  const filteredVoices = useMemo(() => {
    let result = voices;

    if (filters.country) {
      result = result.filter((voice) => extractCountryCode(voice.locale) === filters.country);
    }
    if (filters.gender) {
      result = result.filter((voice) => voice.gender === filters.gender);
    }
    if (filters.language) {
      result = result.filter((voice) => voice.language === filters.language);
    }
    if (filters.search) {
      const searchValue = filters.search.toLowerCase();
      result = result.filter(
        (voice) =>
          voice.name.toLowerCase().includes(searchValue) ||
          voice.locale.toLowerCase().includes(searchValue) ||
          voice.friendly_name.toLowerCase().includes(searchValue)
      );
    }

    return result;
  }, [filters.country, filters.gender, filters.language, filters.search, voices]);

  const updateFilter = useCallback(<K extends keyof VoiceFilters>(key: K, value: VoiceFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    voices: filteredVoices,
    allVoices: voices,
    loading,
    error,
    filters,
    updateFilter,
    clearFilters,
    countries,
    total: filteredVoices.length,
  };
}
