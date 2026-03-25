/** Global TTS context for managing TTS configuration and state. */

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { TTSConfig } from "../types/tts";

interface TTSContextValue {
  config: TTSConfig;
  updateConfig: <K extends keyof TTSConfig>(key: K, value: TTSConfig[K]) => void;
  resetConfig: () => void;
}

const defaultConfig: TTSConfig = {
  text: "",
  voice: "en-US-JennyNeural",
  rate: "+0%",
  volume: "+0%",
  pitch: "+0Hz",
  boundary: "SentenceBoundary",
  generate_subtitles: true,
};

const TTSContext = createContext<TTSContextValue | null>(null);

interface TTSProviderProps {
  children: ReactNode;
}

export function TTSProvider({ children }: TTSProviderProps) {
  const [config, setConfig] = useState<TTSConfig>(defaultConfig);

  const updateConfig = useCallback(<K extends keyof TTSConfig>(
    key: K,
    value: TTSConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  return (
    <TTSContext.Provider value={{ config, updateConfig, resetConfig }}>
      {children}
    </TTSContext.Provider>
  );
}

export function useTTSContext() {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTSContext must be used within TTSProvider");
  }
  return context;
}
