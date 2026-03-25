/** API client for edge-tts web service. */

import type {
  HealthResponse,
  HistoryDeleteResponse,
  HistoryListResponse,
  TTSGenerateResponse,
} from "../types/api";
import type { VoicesListResponse } from "../types/voice";

// Default backend port follows start.sh (6605).
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:6605";

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

  async getHistory(search?: string): Promise<HistoryListResponse> {
    const queryParams = new URLSearchParams();
    if (search && search.trim()) {
      queryParams.set("search", search.trim());
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

  getHistoryZipUrl(itemId: string): string {
    return `${this.baseUrl}/api/tts/history/${encodeURIComponent(itemId)}/download`;
  }

  getWebSocketUrl(): string {
    const wsUrl = this.baseUrl.replace("http://", "ws://").replace("https://", "wss://");
    return `${wsUrl}/api/tts/ws`;
  }
}

export const apiClient = new ApiClient();
