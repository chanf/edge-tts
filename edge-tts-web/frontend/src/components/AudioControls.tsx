/** Audio controls component for rate, volume, and pitch. */

import { useTTSContext } from "../contexts/TTSContext";
import { useT } from "../contexts/LanguageContext";

interface SliderControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}

function SliderControl({ label, value, onChange, min, max, step, unit }: SliderControlProps) {
  const numValue = parseInt(value) || 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm text-gray-500">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          onChange(val >= 0 ? `+${val}${unit}` : `${val}${unit}`);
        }}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

export function AudioControls() {
  const { config, updateConfig } = useTTSContext();
  const t = useT();

  const handleReset = () => {
    updateConfig("rate", "+0%");
    updateConfig("volume", "+0%");
    updateConfig("pitch", "+0Hz");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <label className="text-lg font-semibold text-gray-700">{t.audioControls}</label>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          {t.reset}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SliderControl
          label={t.rate}
          value={config.rate}
          onChange={(v) => updateConfig("rate", v)}
          min={-100}
          max={100}
          step={5}
          unit="%"
        />

        <SliderControl
          label={t.pitch}
          value={config.pitch}
          onChange={(v) => updateConfig("pitch", v)}
          min={-100}
          max={100}
          step={5}
          unit="Hz"
        />

        <SliderControl
          label={t.volume}
          value={config.volume}
          onChange={(v) => updateConfig("volume", v)}
          min={-100}
          max={100}
          step={5}
          unit="%"
        />
      </div>
    </div>
  );
}
