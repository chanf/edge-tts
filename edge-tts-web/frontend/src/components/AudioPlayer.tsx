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

export function AudioPlayer({ items, currentItemId, onCurrentItemChange }: AudioPlayerProps) {
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
  const [currentSubtitle, setCurrentSubtitle] = useState("");

  const currentIndex = useMemo(
    () => items.findIndex((item) => item.id === currentItemId),
    [items, currentItemId]
  );

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const currentItemZipUrl = currentItem ? apiClient.getHistoryZipUrl(currentItem.id) : "";

  useEffect(() => {
    if (items.length === 0) {
      onCurrentItemChange(null);
      return;
    }
    if (!currentItemId || !items.some((item) => item.id === currentItemId)) {
      onCurrentItemChange(items[0].id);
    }
  }, [currentItemId, items, onCurrentItemChange]);

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
    setCurrentSubtitle("");
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
      const cue = subtitleCues.find(
        (item) => audio.currentTime >= item.start && audio.currentTime <= item.end
      );
      setCurrentSubtitle(cue?.text || "");
    };
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTime(audio.currentTime || 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentSubtitle("");
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
  }, [goToNext, subtitleCues]);

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

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">{t.audioPlayer}</h3>
      <p className="text-sm text-gray-500 mb-4">{currentItem.text_preview}</p>

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
          <a
            href={currentItemZipUrl}
            download={`${currentItem.id}.zip`}
            aria-label={t.downloadZip}
            title={t.downloadZip}
            className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z" />
            </svg>
          </a>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => {
              const audio = audioRef.current;
              if (!audio) {
                return;
              }
              const value = Number.parseFloat(e.target.value);
              audio.currentTime = Number.isFinite(value) ? value : 0;
              setCurrentTime(audio.currentTime);
            }}
            className="w-full accent-blue-600"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
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

        {currentSubtitle && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-gray-800">
            {currentSubtitle}
          </div>
        )}
      </div>
    </div>
  );
}
