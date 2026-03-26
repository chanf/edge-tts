# Edge TTS Web

基于 [edge-tts](https://github.com/rany2/edge-tts) 的 Web 界面，通过现代化的 React 前端与 FastAPI 后端访问 Microsoft Edge 在线文本转语音服务。

## 功能特性

- **450+ 语音**：覆盖 Microsoft Edge 全量语音与多语言
- **实时流式播放**：基于 WebSocket 的即时音频流
- **音频控制**：支持语速（-100%~+100%）、音量与音调调节
- **字幕生成**：支持词/句边界生成 SRT 字幕
- **语音筛选**：按地区、性别或关键字筛选
- **音频播放**：自定义播放器与字幕同步显示
- **导出**：下载 ZIP（MP3 + SRT）

## 技术栈

- **后端**：FastAPI（Python），支持 WebSocket
- **前端**：React + TypeScript + Vite
- **样式**：Tailwind CSS

## 快速开始（推荐）

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

## 手动安装

### 前置依赖

- Python 3.8+
- Node.js 16+
- pip

### 后端安装

```bash
cd backend
pip install -r requirements.txt
```

### 前端安装

```bash
cd frontend
npm install
```

## 运行方式

### 开发模式

**终端 1 - 后端：**
```bash
cd backend
uvicorn app.main:app --reload --port 6605
```

**终端 2 - 前端：**
```bash
cd frontend
npm run dev
```

访问地址：
- 前端：http://localhost:6606
- 后端 API：http://localhost:6605
- API 文档：http://localhost:6605/docs

## Docker 部署

在 `edge-tts-web` 目录执行：

```bash
docker compose up -d --build
```

访问地址：
- 前端：http://localhost:6606
- 后端：http://localhost:6605

停止并清理：

```bash
docker compose down
```

说明：
- 后端镜像已内置 `ffmpeg`（用于变速下载）。
- 下载文件会写入 `edge-tts-web/backend/downloads`（通过 volume 挂载）。

## 存储模式

后端支持两种存储模式：

- `local`（默认）：音频/字幕/历史存储在 `backend/downloads`
- `cloudflare`：音频/字幕存 R2，历史元数据存 D1

通过环境变量切换：

```bash
EDGE_TTS_STORAGE_MODE=local
EDGE_TTS_STORAGE_MODE=cloudflare
```

## Cloudflare 部署（Containers + R2 + D1）

### 必要环境变量

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
```

### 变速下载依赖

播放器支持按播放速度下载变速 ZIP（MP3 + SRT）。此功能需要后端运行环境可用 `ffmpeg`。
Cloudflare Containers 镜像请确保安装 `ffmpeg`，否则 `speed!=1` 的下载会失败。

### D1 表结构

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

### 生产模式

```bash
# 构建前端
cd frontend
npm run build

# 以前端产物运行后端
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 6605
```

## API 接口

- `GET /api/health` - 健康检查
- `GET /api/voices` - 获取语音列表（支持筛选）
- `POST /api/tts/generate` - 生成音频与字幕
- `WebSocket /api/tts/ws` - 实时流式 TTS
- `GET /downloads/{filename}` - 下载生成文件

## 项目结构

```
edge-tts-web/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── api/
│   │   │   ├── routes/          # API 路由
│   │   │   └── websocket/       # WebSocket 处理
│   │   ├── models/              # Pydantic 模型
│   │   └── services/            # 业务逻辑
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # React 组件
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── contexts/            # Context 提供者
│   │   ├── services/            # API 客户端
│   │   └── types/               # TypeScript 类型
│   └── package.json
└── README.md
```

## 许可

本项目使用 [edge-tts](https://github.com/rany2/edge-tts)，其许可证为 LGPL 3.0。
