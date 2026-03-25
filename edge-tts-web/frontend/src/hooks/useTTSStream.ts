/** Hook for TTS streaming via WebSocket. */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { apiClient } from "../services/api";
import type { TTSConfig, WSMessage, MetadataChunk } from "../types/tts";

interface StreamState {
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  progress: number;
}

export function useTTSStream() {
  const [state, setState] = useState<StreamState>({
    isConnected: false,
    isStreaming: false,
    error: null,
    progress: 0,
  });
  const [audioChunks, setAudioChunks] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState<MetadataChunk[]>([]);
  const [isDone, setIsDone] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(apiClient.getWebSocketUrl());

    ws.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false, isStreaming: false }));
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setState((prev) => ({
        ...prev,
        error: "WebSocket connection error",
        isStreaming: false,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        if (message.type === "audio") {
          setAudioChunks((prev) => [...prev, message.data]);
          setState((prev) => ({ ...prev, progress: message.sequence }));
        } else if (
          message.type === "WordBoundary" ||
          message.type === "SentenceBoundary"
        ) {
          setSubtitles((prev) => [...prev, message]);
        } else if (message.type === "done") {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            progress: message.total_chunks,
          }));
          setIsDone(true);
        } else if (message.type === "error") {
          setState((prev) => ({
            ...prev,
            error: message.message,
            isStreaming: false,
          }));
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState((prev) => ({ ...prev, isConnected: false, isStreaming: false }));
  }, []);

  const startStream = useCallback((config: TTSConfig) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setState((prev) => ({
        ...prev,
        error: "WebSocket not connected",
        isStreaming: false,
      }));
      return;
    }

    // Reset state
    setAudioChunks([]);
    setSubtitles([]);
    setIsDone(false);
    setState((prev) => ({ ...prev, isStreaming: true, error: null, progress: 0 }));

    // Send TTS request
    wsRef.current.send(
      JSON.stringify({
        type: "tts_request",
        text: config.text,
        voice: config.voice,
        rate: config.rate,
        volume: config.volume,
        pitch: config.pitch,
        boundary: config.boundary,
      })
    );
  }, []);

  const reset = useCallback(() => {
    setAudioChunks([]);
    setSubtitles([]);
    setIsDone(false);
    setState((prev) => ({ ...prev, error: null, progress: 0 }));
  }, []);

  // Combine audio chunks into a blob URL
  const audioUrl = useMemo(() => {
    if (audioChunks.length === 0) return null;

    try {
      const binaryChunks = audioChunks.map((chunk) => {
        const binaryString = atob(chunk);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });

      const blob = new Blob(binaryChunks, { type: "audio/mpeg" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Error creating audio blob:", err);
      return null;
    }
  }, [audioChunks]);

  return {
    ...state,
    audioUrl,
    subtitles,
    isDone,
    totalChunks: audioChunks.length + subtitles.length,
    connect,
    disconnect,
    startStream,
    reset,
  };
}
