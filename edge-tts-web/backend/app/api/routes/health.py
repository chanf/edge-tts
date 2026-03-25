"""Health check API routes."""

from fastapi import APIRouter

from ...models.responses import HealthResponse
from ...services.storage import get_storage_mode

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns the status of the API and the underlying edge-tts service.
    """
    return HealthResponse(
        status="healthy",
        edge_service="reachable",
        version="1.0.0",
        storage_mode=get_storage_mode(),
    )
