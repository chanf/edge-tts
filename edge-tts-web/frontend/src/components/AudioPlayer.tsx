/** Playlist audio player with subtitle sync and keyboard shortcuts. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryItem } from "../types/api";
import { useT } from "../contexts/LanguageContext";
import { apiClient } from "../services/api";

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface AudioPlayerProps {
  items: HistoryItem[];
  currentItemId: string | null;
  onCurrentItemChange: (id: string | null) => void;
  playRequest: { id: string; token: number } | null;
  onTimeUpdate: (timeSec: number) => void;
}

function parseSrtTimeToSeconds(value: string): number {
  const [hoursPart, minutesPart, rest] = value.split(":");
  const [secondsPart, millisPart] = rest.split(",");
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart, 10);
  const seconds = Number.parseInt(secondsPart, 10);
  const millis = Number.parseInt(millisPart, 10);
  if ([hours, minutes, seconds, millis].some(Number.isNaN)) {
    return 0;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseSrt(content: string): SubtitleCue[] {
  return content
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim());
      if (lines.length < 3) {
        return null;
      }
      const timeline = lines[1];
      const [startRaw, endRaw] = timeline.split(" --> ");
      if (!startRaw || !endRaw) {
        return null;
      }
      return {
        start: parseSrtTimeToSeconds(startRaw),
        end: parseSrtTimeToSeconds(endRaw),
        text: lines.slice(2).join(" "),
      };
    })
    .filter((cue): cue is SubtitleCue => cue !== null);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function AudioPlayer({
  items,
  currentItemId,
  onCurrentItemChange,
  playRequest,
  onTimeUpdate,
}: AudioPlayerProps) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoPlayAfterSwitchRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopPlaylist, setLoopPlaylist] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  const currentIndex = useMemo(
    () => items.findIndex((item) => item.id === currentItemId),
    [items, currentItemId]
  );

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;

  useEffect(() => {
    if (items.length === 0) {
      onCurrentItemChange(null);
      return;
    }
    if (!currentItemId || !items.some((item) => item.id === currentItemId)) {
      onCurrentItemChange(items[0].id);
    }
  }, [currentItemId, items, onCurrentItemChange]);

  useEffect(() => {
    if (!playRequest) {
      return;
    }
    const requestedItem = items.find((item) => item.id === playRequest.id);
    if (!requestedItem) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (currentItem && currentItem.id === playRequest.id) {
      void audio.play();
      return;
    }

    autoPlayAfterSwitchRef.current = true;
    onCurrentItemChange(playRequest.id);
  }, [currentItem, items, onCurrentItemChange, playRequest]);

  const goToIndex = useCallback(
    (nextIndex: number, autoPlay: boolean) => {
      if (nextIndex < 0 || nextIndex >= items.length) {
        return;
      }
      autoPlayAfterSwitchRef.current = autoPlay;
      onCurrentItemChange(items[nextIndex].id);
    },
    [items, onCurrentItemChange]
  );

  const goToNext = useCallback(() => {
    if (items.length === 0 || currentIndex < 0) {
      return;
    }
    const shouldAutoPlay = isPlaying;
    const nextIndex = currentIndex + 1;
    if (nextIndex < items.length) {
      goToIndex(nextIndex, shouldAutoPlay);
      return;
    }
    if (loopPlaylist) {
      goToIndex(0, shouldAutoPlay);
    }
  }, [currentIndex, goToIndex, isPlaying, items.length, loopPlaylist]);

  const goToPrevious = useCallback(() => {
    if (items.length === 0 || currentIndex < 0) {
      return;
    }
    const shouldAutoPlay = isPlaying;
    const previousIndex = currentIndex - 1;
    if (previousIndex >= 0) {
      goToIndex(previousIndex, shouldAutoPlay);
      return;
    }
    if (loopPlaylist) {
      goToIndex(items.length - 1, shouldAutoPlay);
    }
  }, [currentIndex, goToIndex, isPlaying, items.length, loopPlaylist]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentItem) {
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, [currentItem]);

  const handleDownloadCurrent = useCallback(() => {
    if (!currentItem) {
      return;
    }
    void apiClient.downloadHistoryZip(currentItem.id, playbackRate).catch(() => {
      window.alert(t.downloadFailed);
    });
  }, [currentItem, playbackRate, t.downloadFailed]);

  const handleDownloadAudio = useCallback(() => {
    if (!currentItem) {
      return;
    }
    void apiClient.downloadHistoryAudio(currentItem.id, playbackRate).catch(() => {
      window.alert(t.downloadFailed);
    });
  }, [currentItem, playbackRate, t.downloadFailed]);

  const handleCopyText = useCallback(() => {
    if (!currentItem?.text) {
      return;
    }
    const text = currentItem.text;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        window.alert(t.copyFailed);
      });
      return;
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (!success) {
        window.alert(t.copyFailed);
      }
    } catch {
      window.alert(t.copyFailed);
    }
  }, [currentItem?.text, t.copyFailed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    let canceled = false;
    setSubtitleCues([]);
    if (!currentItem?.subtitle_url) {
      return;
    }

    void fetch(currentItem.subtitle_url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load subtitle: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!canceled) {
          setSubtitleCues(parseSrt(text));
        }
      })
      .catch(() => {
        if (!canceled) {
          setSubtitleCues([]);
        }
      });

    return () => {
      canceled = true;
    };
  }, [currentItem?.subtitle_url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTime(audio.currentTime || 0);
      onTimeUpdate(audio.currentTime || 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onTimeUpdate(audio.currentTime || 0);
      goToNext();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [goToNext, onTimeUpdate, subtitleCues]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (autoPlayAfterSwitchRef.current) {
      autoPlayAfterSwitchRef.current = false;
      void audio.play();
    } else {
      audio.pause();
      audio.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    }
    setPlaybackRate(1);
  }, [currentItem?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayPause();
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        audio.currentTime = Math.min(duration || audio.duration || 0, audio.currentTime + 5);
        return;
      }

      if (event.code === "ArrowUp") {
        event.preventDefault();
        setVolume((prev) => Math.min(1, prev + 0.05));
        return;
      }

      if (event.code === "ArrowDown") {
        event.preventDefault();
        setVolume((prev) => Math.max(0, prev - 0.05));
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        goToNext();
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        goToPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [duration, goToNext, goToPrevious, togglePlayPause]);

  if (!currentItem) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        {t.noAudio}
      </div>
    );
  }

  const canGoPrevious = loopPlaylist || currentIndex > 0;
  const canGoNext = loopPlaylist || currentIndex < items.length - 1;
  const effectiveDuration = playbackRate > 0 ? duration / playbackRate : duration;
  const effectiveCurrent = playbackRate > 0 ? currentTime / playbackRate : currentTime;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">{t.audioPlayer}</h3>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">
        <span className="break-words">{currentItem.text_preview}</span>
        <button
          type="button"
          onClick={handleCopyText}
          className="ml-2 inline-flex items-center text-xs text-blue-600 hover:text-blue-700"
          aria-label={t.copy}
          title={t.copy}
        >
          {t.copy}
        </button>
      </p>

      <audio ref={audioRef} src={currentItem.audio_url} preload="metadata" />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevious}
            disabled={!canGoPrevious}
            aria-label={t.previous}
            title={t.previous}
            className={`px-3 py-2 rounded-lg text-sm ${
              canGoPrevious
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h2v14H6V5zm3.5 7L20 5v14L9.5 12z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? t.pause : t.play}
            title={isPlaying ? t.pause : t.play}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            {isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5h4v14H7V5zm6 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={goToNext}
            disabled={!canGoNext}
            aria-label={t.next}
            title={t.next}
            className={`px-3 py-2 rounded-lg text-sm ${
              canGoNext
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 5h2v14h-2V5zM14.5 12 4 19V5l10.5 7z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDownloadCurrent}
            aria-label={t.downloadZip}
            title={t.downloadZip}
            className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDownloadAudio}
            aria-label={t.downloadAudio}
            title={t.downloadAudio}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3v10.55a4 4 0 1 0 2 3.45V7h4V3h-6z" />
            </svg>
          </button>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 0}
            step={0.1}
            value={Math.min(effectiveCurrent, effectiveDuration || 0)}
            onChange={(e) => {
              const audio = audioRef.current;
              if (!audio) {
                return;
              }
              const value = Number.parseFloat(e.target.value);
              const nextTime = Number.isFinite(value) ? value * playbackRate : 0;
              audio.currentTime = Number.isFinite(nextTime) ? nextTime : 0;
              setCurrentTime(audio.currentTime);
            }}
            className="w-full accent-blue-600"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatTime(effectiveCurrent)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <label className="text-sm text-gray-700 flex items-center gap-2">
            {t.playerVolume}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number.parseFloat(e.target.value))}
              className="flex-1 accent-blue-600"
            />
          </label>

          <label className="text-sm text-gray-700 flex items-center gap-2">
            {t.playerSpeed}
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number.parseFloat(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded"
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2.0x</option>
            </select>
          </label>

          <label className="text-sm text-gray-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={loopPlaylist}
              onChange={(e) => setLoopPlaylist(e.target.checked)}
            />
            {t.playerLoop}
          </label>
        </div>

      </div>
    </div>
  );
}
