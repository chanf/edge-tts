/** TTS configuration types. */

export type BoundaryType = "WordBoundary" | "SentenceBoundary";

export interface TTSConfig {
  text: string;
  voice: string;
  rate: string;
  volume: string;
  pitch: string;
  boundary: BoundaryType;
  generate_subtitles: boolean;
}

export interface TTSRequest {
  type: "tts_request";
  text: string;
  voice: string;
  rate?: string;
  volume?: string;
  pitch?: string;
  boundary?: BoundaryType;
}

export interface TTSResponse {
  audio_url: string;
  subtitle_url?: string;
  duration_ms: number;
  word_count: number;
}

export interface AudioChunk {
  type: "audio";
  data: string; // base64 encoded
  sequence: number;
}

export interface MetadataChunk {
  type: "WordBoundary" | "SentenceBoundary";
  offset: number;
  duration: number;
  text: string;
  sequence: number;
}

export interface DoneChunk {
  type: "done";
  total_chunks: number;
}

export interface ErrorChunk {
  type: "error";
  message: string;
}

export type WSMessage = AudioChunk | MetadataChunk | DoneChunk | ErrorChunk;
