"""SENTINEL FastAPI Application.

Main entry point for the SENTINEL investigation backend.
Exposes the existing feature pipeline and modeling layer through
a clean API suitable for the future frontend.

Usage:
    python -m backend.app.main
    # or
    uvicorn backend.app.main:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.routes import health, investigations
from backend.app.services.data_service import DataService
from backend.app.services.model_service import ModelService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

_data_service = DataService(seed=settings.DATA_SEED)
_model_service = ModelService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle.

    Loads data and trains models on startup.
    """
    logger.info("Starting SENTINEL backend...")
    _data_service.load()
    train_rows, _, _, _ = _data_service.get_train_test_split()
    _model_service.train(train_rows)
    investigations.init_services(_data_service, _model_service)
    logger.info("SENTINEL backend ready")
    yield
    logger.info("Shutting down SENTINEL backend...")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SENTINEL API",
    description=(
        "Predictive Analytics Framework for Cybercrime Complaints. "
        "Investigator decision-support tool for ranking candidate cash-out locations. "
        "All data is synthetic for demonstration purposes."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(investigations.router)


@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint — redirects to docs."""
    return {
        "message": "SENTINEL API",
        "docs": "/docs",
        "health": "/health",
    }
