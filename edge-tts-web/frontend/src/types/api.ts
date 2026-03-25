/** API response types. */

import type { BoundaryType } from "./tts";

export interface HealthResponse {
  status: string;
  edge_service: string;
  version: string;
}

export interface SubtitleCue {
  index: number;
  start: string;
  end: string;
  text: string;
}

export interface HistoryItem {
  id: string;
  created_at: string;
  text_preview: string;
  text: string;
  voice: string;
  rate: string;
  volume: string;
  pitch: string;
  boundary: BoundaryType;
  duration_ms: number;
  word_count: number;
  audio_filename: string;
  subtitle_filename: string;
  audio_url: string;
  subtitle_url: string;
}

export interface TTSGenerateResponse {
  audio_url: string;
  subtitle_url?: string;
  duration_ms: number;
  word_count: number;
  history_item?: HistoryItem;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  total: number;
}

export interface HistoryDeleteResponse {
  deleted_ids: string[];
  failed_ids: string[];
}
