"""WebSocket TTS streaming handler."""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ...models.requests import TTSRequest
from ...services.tts_service import TTSService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/api/tts/ws")
async def websocket_tts(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time TTS streaming.

    The client should send a JSON message with the TTS request:
    {
        "type": "tts_request",
        "text": "Text to synthesize",
        "voice": "en-US-JennyNeural",
        "rate": "+0%",
        "volume": "+0%",
        "pitch": "+0Hz",
        "boundary": "SentenceBoundary"
    }

    The server responds with streaming chunks:
    - Audio chunks: { "type": "audio", "data": "base64_encoded_mp3", "sequence": 1 }
    - Metadata chunks: { "type": "WordBoundary", "offset": ..., "duration": ..., "text": "...", "sequence": 1 }
    - Completion: { "type": "done", "total_chunks": 42 }
    - Error: { "type": "error", "message": "..." }
    """
    await websocket.accept()
    logger.info("WebSocket connection established")

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") == "tts_request":
                try:
                    # Parse TTS request
                    tts_request = TTSRequest(
                        text=message.get("text", ""),
                        voice=message.get("voice", "en-US-JennyNeural"),
                        rate=message.get("rate", "+0%"),
                        volume=message.get("volume", "+0%"),
                        pitch=message.get("pitch", "+0Hz"),
                        boundary=message.get("boundary", "SentenceBoundary"),
                        generate_subtitles=True,
                    )

                    # Stream TTS data
                    async for chunk in TTSService.stream_tts(tts_request):
                        await websocket.send_json(chunk)

                    logger.info(f"TTS streaming completed for text: {tts_request.text[:50]}...")

                except Exception as e:
                    logger.error(f"Error processing TTS request: {e}")
                    await websocket.send_json({"type": "error", "message": str(e)})
            else:
                await websocket.send_json({"type": "error", "message": "Unknown message type"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
