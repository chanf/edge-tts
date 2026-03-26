/** API client for edge-tts web service. */

import type {
  HealthResponse,
  HistoryDeleteResponse,
  HistoryListResponse,
  TTSGenerateResponse,
} from "../types/api";
import type { VoicesListResponse } from "../types/voice";

// Default backend port follows start.sh (6605).
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:6605") as string;

export interface VoicesParams {
  locale?: string;
  gender?: string;
  language?: string;
  search?: string;
}

export interface GenerateParams {
  text: string;
  voice: string;
  rate?: string;
  volume?: string;
  pitch?: string;
  boundary?: "WordBoundary" | "SentenceBoundary";
  generate_subtitles?: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request("/api/health");
  }

  async getVoices(params?: VoicesParams): Promise<VoicesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.locale) queryParams.set("locale", params.locale);
    if (params?.gender) queryParams.set("gender", params.gender);
    if (params?.language) queryParams.set("language", params.language);
    if (params?.search) queryParams.set("search", params.search);

    const query = queryParams.toString();
    return this.request(`/api/voices${query ? `?${query}` : ""}`);
  }

  async generateTTS(params: GenerateParams): Promise<TTSGenerateResponse> {
    return this.request("/api/tts/generate", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getHistory(
    search?: string,
    page?: number,
    pageSize?: number
  ): Promise<HistoryListResponse> {
    const queryParams = new URLSearchParams();
    if (search && search.trim()) {
      queryParams.set("search", search.trim());
    }
    if (typeof page === "number") {
      queryParams.set("page", String(page));
    }
    if (typeof pageSize === "number") {
      queryParams.set("page_size", String(pageSize));
    }

    const query = queryParams.toString();
    return this.request(`/api/tts/history${query ? `?${query}` : ""}`);
  }

  async deleteHistory(ids: string[]): Promise<HistoryDeleteResponse> {
    return this.request("/api/tts/history", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
  }

  getDownloadUrl(filename: string): string {
    return `${this.baseUrl}/downloads/${filename}`;
  }

  getHistoryZipUrl(itemId: string, speed?: number): string {
    const url = new URL(`${this.baseUrl}/api/tts/history/${encodeURIComponent(itemId)}/download`);
    if (typeof speed === "number") {
      url.searchParams.set("speed", String(speed));
    }
    return url.toString();
  }

  getHistoryAudioUrl(itemId: string, speed?: number): string {
    const url = new URL(
      `${this.baseUrl}/api/tts/history/${encodeURIComponent(itemId)}/download-audio`
    );
    if (typeof speed === "number") {
      url.searchParams.set("speed", String(speed));
    }
    return url.toString();
  }

  private resolveFilenameFromDisposition(disposition: string | null, fallback: string): string {
    if (!disposition) {
      return fallback;
    }
    const match = disposition.match(/filename="?([^"]+)"?/i);
    if (!match || !match[1]) {
      return fallback;
    }
    return match[1];
  }

  async downloadHistoryZip(itemId: string, speed?: number): Promise<void> {
    const fallbackFilename = `${itemId}.zip`;
    const response = await fetch(this.getHistoryZipUrl(itemId, speed));
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const filename = this.resolveFilenameFromDisposition(
      response.headers.get("content-disposition"),
      fallbackFilename
    );
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }

  async downloadHistoryAudio(itemId: string, speed?: number): Promise<void> {
    const fallbackFilename = `${itemId}.mp3`;
    const response = await fetch(this.getHistoryAudioUrl(itemId, speed));
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const filename = this.resolveFilenameFromDisposition(
      response.headers.get("content-disposition"),
      fallbackFilename
    );
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }

  getWebSocketUrl(): string {
    const wsUrl = this.baseUrl.replace("http://", "ws://").replace("https://", "wss://");
    return `${wsUrl}/api/tts/ws`;
  }
}

export const apiClient = new ApiClient();
