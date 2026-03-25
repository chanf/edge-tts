# Edge TTS Web

A web-based user interface for [edge-tts](https://github.com/rany2/edge-tts), providing access to Microsoft Edge's text-to-speech service through a modern React frontend and FastAPI backend.

## Features

- **450+ Voices**: Access to all Microsoft Edge TTS voices in multiple languages
- **Real-time Streaming**: WebSocket-based streaming for instant audio playback
- **Audio Controls**: Adjust rate (-100% to +100%), volume, and pitch
- **Subtitle Generation**: Generate SRT subtitles with word or sentence boundary options
- **Voice Filtering**: Filter voices by locale, gender, or search by name
- **Audio Playback**: Custom audio player with synchronized subtitle display
- **Export**: Download generated audio + subtitles as ZIP (MP3 + SRT)

## Technology Stack

- **Backend**: FastAPI (Python) with WebSocket support
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS

## Quick Start (推荐)

### 一键启动

```bash
cd edge-tts-web
./start.sh
```

该脚本会自动：
1. 检查并停止已运行的服务
2. 安装所有依赖
3. 启动后端服务 (端口 6605)
4. 启动前端服务 (端口 6606)

访问 http://localhost:6606

### 停止服务

```bash
./stop.sh            # 停止服务
./stop.sh --clean     # 停止服务并清理缓存
./stop.sh --clean-all # 停止服务并清理所有缓存和文件
```

**清理选项说明：**
- `--clean` - 清理 Python 缓存和前端构建缓存
- `--clean-all` - 包含 --clean，同时清理下载文件和日志
- `--clean-downloads` - 只清理下载的音频/字幕文件
- `--clean-logs` - 只清理日志文件
- `-h, --help` - 显示帮助信息

```bash
./stop.sh --help     # 查看所有选项
```

## Manual Installation

### Prerequisites

- Python 3.8+
- Node.js 16+
- pip

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
```

## Running

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
uvicorn app.main:app --reload --port 6605
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:6606
- Backend API: http://localhost:6605
- API Docs: http://localhost:6605/docs

## Storage Modes

The backend supports two storage modes:

- `local` (default): store audio/subtitles/history under `backend/downloads`
- `cloudflare`: store audio/subtitles in R2 and history metadata in D1

Switch storage mode via environment variable:

```bash
EDGE_TTS_STORAGE_MODE=local
EDGE_TTS_STORAGE_MODE=cloudflare
```

## Cloudflare Deployment (Containers + R2 + D1)

### Required Environment Variables

```bash
# Storage mode
EDGE_TTS_STORAGE_MODE=cloudflare

# CORS
ALLOWED_ORIGINS=https://your-frontend-domain.example

# R2
CF_R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
CF_R2_BUCKET=your-bucket
CF_R2_ACCESS_KEY_ID=***
CF_R2_SECRET_ACCESS_KEY=***

# D1
CF_ACCOUNT_ID=***
CF_D1_DATABASE_ID=***
CF_D1_API_TOKEN=***

### 变速下载依赖

播放器支持按播放速度下载变速 ZIP（MP3 + SRT）。此功能需要后端运行环境可用 `ffmpeg`。
Cloudflare Containers 镜像请确保安装 `ffmpeg`，否则 `speed!=1` 的下载会失败。
```

### D1 Schema

```sql
CREATE TABLE IF NOT EXISTS tts_history (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  text_preview TEXT NOT NULL,
  text TEXT NOT NULL,
  voice TEXT NOT NULL,
  rate TEXT NOT NULL,
  volume TEXT NOT NULL,
  pitch TEXT NOT NULL,
  boundary TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  audio_key TEXT NOT NULL,
  subtitle_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tts_history_created_at ON tts_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tts_history_voice ON tts_history(voice);
```

### Production Mode

```bash
# Build frontend
cd frontend
npm run build

# Run backend with production frontend
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 6605
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/voices` - List all available voices (with optional filtering)
- `POST /api/tts/generate` - Generate audio and subtitle files
- `WebSocket /api/tts/ws` - Real-time TTS streaming
- `GET /downloads/{filename}` - Download generated files

## Project Structure

```
edge-tts-web/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   ├── api/
│   │   │   ├── routes/          # API endpoints
│   │   │   └── websocket/       # WebSocket handlers
│   │   ├── models/              # Pydantic models
│   │   └── services/            # Business logic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── contexts/            # React Context providers
│   │   ├── services/            # API client
│   │   └── types/               # TypeScript types
│   └── package.json
└── README.md
```

## License

This project uses the [edge-tts](https://github.com/rany2/edge-tts) library, which is licensed under LGPL 3.0.
