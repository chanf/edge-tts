/** Subtitle display and export component. */

import { useCallback, useEffect, useState } from "react";
import { useT } from "../contexts/LanguageContext";
import type { SubtitleCue } from "../types/api";

interface SubtitleDisplayProps {
  subtitleUrl: string | null;
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
      };
    })
    .filter((cue): cue is SubtitleCue & { startMs: number } => cue !== null)
    .sort((a, b) => a.startMs - b.startMs)
    .map(({ startMs: _unused, ...cue }) => cue);
}

export function SubtitleDisplay({ subtitleUrl }: SubtitleDisplayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useT();
  const count = cues.length;

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

  const exportSRT = useCallback(() => {
    if (!subtitleUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = subtitleUrl;
    link.download = "subtitles.srt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [subtitleUrl]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-700">
          {t.subtitles} ({count})
        </h3>
        {count > 0 && (
          <button
            type="button"
            onClick={exportSRT}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            {t.downloadSRT}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">{t.loading}</p>
      ) : count === 0 ? (
        <p className="text-gray-500 text-center py-8">
          {t.noSubtitles}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">#</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">{t.time}</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">{t.text}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cues.map((cue) => (
                <tr key={cue.index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">{cue.index}</td>
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                    {cue.start} → {cue.end}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{cue.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
