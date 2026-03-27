/** Subtitle display component. */

import { useEffect, useState } from "react";
import { useT } from "../contexts/LanguageContext";
import type { SubtitleCue } from "../types/api";

interface SubtitleDisplayProps {
  subtitleUrl: string | null;
  currentTimeSec: number;
}

function parseSrtTimeToTimestamp(value: string): number {
  const [hoursPart, minutesPart, rest] = value.split(":");
  const [secondsPart, millisPart] = rest.split(",");
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart, 10);
  const seconds = Number.parseInt(secondsPart, 10);
  const millis = Number.parseInt(millisPart, 10);
  if ([hours, minutes, seconds, millis].some(Number.isNaN)) {
    return 0;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function parseSrt(content: string): Array<SubtitleCue & { startMs: number; endMs: number }> {
  return content
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim());
      if (lines.length < 3) {
        return null;
      }

      const [startRaw, endRaw] = (lines[1] || "").split(" --> ");
      if (!startRaw || !endRaw) {
        return null;
      }

      return {
        index: Number.parseInt(lines[0], 10) || 0,
        start: startRaw,
        end: endRaw,
        text: lines.slice(2).join(" "),
        startMs: parseSrtTimeToTimestamp(startRaw),
        endMs: parseSrtTimeToTimestamp(endRaw),
      };
    })
    .filter((cue): cue is SubtitleCue & { startMs: number; endMs: number } => cue !== null)
    .sort((a, b) => a.startMs - b.startMs);
}

export function SubtitleDisplay({ subtitleUrl, currentTimeSec }: SubtitleDisplayProps) {
  const [cues, setCues] = useState<Array<SubtitleCue & { startMs: number; endMs: number }>>([]);
  const [loading, setLoading] = useState(false);
  const t = useT();
  const count = cues.length;
  const currentTimeMs = currentTimeSec * 1000;

  useEffect(() => {
    let canceled = false;
    setCues([]);
    if (!subtitleUrl) {
      return;
    }

    setLoading(true);
    void fetch(subtitleUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load subtitle: ${response.status}`);
        }
        return response.text();
      })
      .then((content) => {
        if (!canceled) {
          setCues(parseSrt(content));
        }
      })
      .catch(() => {
        if (!canceled) {
          setCues([]);
        }
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [subtitleUrl]);

  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-700">
          {t.subtitles} ({count})
        </h3>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">{t.loading}</p>
      ) : count === 0 ? (
        <p className="text-gray-500 text-center py-8">
          {t.noSubtitles}
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">#</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">{t.time}</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">{t.text}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cues.map((cue) => {
                const isActive = currentTimeMs >= cue.startMs && currentTimeMs <= cue.endMs;
                return (
                <tr
                  key={cue.index}
                  className={isActive ? "bg-green-100 text-gray-900" : "hover:bg-gray-50"}
                >
                  <td className="px-4 py-2 text-gray-600">{cue.index}</td>
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                    {cue.start}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{cue.text}</td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
