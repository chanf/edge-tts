/** Hook for subtitle generation and export. */

import { useMemo, useCallback } from "react";
import type { MetadataChunk } from "../types/tts";
import type { SubtitleCue } from "../types/api";

export function useSubtitles(metadata: MetadataChunk[]) {
  // Convert metadata to SRT format
  const srtContent = useMemo(() => {
    if (metadata.length === 0) return "";

    return metadata
      .map((meta, index) => {
        const start = formatTime(meta.offset / 10000); // Convert to seconds
        const end = formatTime((meta.offset + meta.duration) / 10000);

        return `${index + 1}\n${start} --> ${end}\n${meta.text}\n`;
      })
      .join("\n");
  }, [metadata]);

  // Get subtitle cues for display
  const cues = useMemo<SubtitleCue[]>(() => {
    return metadata.map((meta, index) => ({
      index: index + 1,
      start: formatTime(meta.offset / 10000),
      end: formatTime((meta.offset + meta.duration) / 10000),
      text: meta.text,
    }));
  }, [metadata]);

  // Export SRT file
  const exportSRT = useCallback(() => {
    if (metadata.length === 0) return;

    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitles_${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [srtContent, metadata.length]);

  return {
    srtContent,
    cues,
    exportSRT,
    count: metadata.length,
  };
}

// Helper: format time in SRT format (HH:MM:SS,mmm)
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (n: number, width: number) => String(n).padStart(width, "0");

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
}
