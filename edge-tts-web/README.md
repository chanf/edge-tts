# Edge TTS Web

A web-based user interface for [edge-tts](https://github.com/rany2/edge-tts), providing access to Microsoft Edge's text-to-speech service through a modern React frontend and FastAPI backend.

## Features

- **450+ Voices**: Access to all Microsoft Edge TTS voices in multiple languages
- **Real-time Streaming**: WebSocket-based streaming for instant audio playback
- **Audio Controls**: Adjust rate (-100% to +100%), volume, and pitch
- **Subtitle Generation**: Generate SRT subtitles with word or sentence boundary options
- **Voice Filtering**: Filter voices by locale, gender, or search by name
- **Audio Playback**: Custom audio player with synchronized subtitle display
- **Export**: Download generated audio (MP3) and subtitle (SRT) files

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
4. 启动前端服务 (端口 3000)

访问 http://localhost:3000

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
