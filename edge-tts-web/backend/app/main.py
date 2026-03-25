"""Main FastAPI application for edge-tts web service."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import health, tts, voices
from .api.websocket import tts_handler

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for downloads
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
