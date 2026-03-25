"""Main FastAPI application for edge-tts web service."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import downloads, health, tts, voices
from .api.websocket import tts_handler
from .services.storage import get_storage_mode

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Output directory for generated files
OUTPUT_DIR = os.environ.get("EDGE_TTS_OUTPUT_DIR", "downloads")

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    logger.info("Starting edge-tts web service")
    yield
    # Shutdown
    logger.info("Shutting down edge-tts web service")


# Create FastAPI app
app = FastAPI(
    title="edge-tts Web Service",
    description="Web API for Microsoft Edge's text-to-speech service",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if allowed_origins_env:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
else:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage_mode = get_storage_mode()
if storage_mode == "cloudflare":
    app.include_router(downloads.router)
else:
    app.mount("/downloads", StaticFiles(directory=OUTPUT_DIR), name="downloads")

# Include routers
app.include_router(health.router)
app.include_router(voices.router)
app.include_router(tts.router)
app.include_router(tts_handler.router)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "edge-tts Web Service",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/api/health",
            "voices": "/api/voices",
            "generate_tts": "/api/tts/generate",
            "websocket": "/api/tts/ws",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=6605, reload=True)
