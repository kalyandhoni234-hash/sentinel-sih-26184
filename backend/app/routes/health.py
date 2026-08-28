"""Health check route."""

from __future__ import annotations

from fastapi import APIRouter

from backend.app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint.

    Returns service status and available models.
    """
    return HealthResponse()
