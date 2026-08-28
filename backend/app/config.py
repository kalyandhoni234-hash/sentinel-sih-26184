"""Application configuration for SENTINEL backend.

All settings are loaded from environment variables with sensible defaults.
CORS origins are configurable for local frontend development.
"""

from __future__ import annotations

import os
from pathlib import Path


def _parse_cors_origins() -> list[str]:
    """Parse CORS_ORIGINS from environment variable.

    Accepts comma-separated origins. Defaults to localhost for development.
    """
    raw = os.getenv("CORS_ORIGINS", "")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]


class Settings:
    """Application settings loaded from environment variables."""

    # Server
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # CORS
    CORS_ORIGINS: list[str] = _parse_cors_origins()

    # Data
    DATA_SEED: int = int(os.getenv("SENTINEL_DATA_SEED", "42"))
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent


settings = Settings()
