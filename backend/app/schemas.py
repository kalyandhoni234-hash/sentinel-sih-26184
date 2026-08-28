"""Pydantic request/response schemas for SENTINEL API.

All schemas validate input/output and provide OpenAPI documentation.
No ground-truth or Layer-C information is exposed through these schemas.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ModelType(str, Enum):
    """Supported model types for ranking."""

    WEIGHTED_BASELINE = "weighted_baseline"
    RANDOM_FOREST = "random_forest"


class FraudScenario(BaseModel):
    """Fraud scenario information for a case."""

    name: str = Field(..., description="Scenario type name")
    description: str = Field(default="", description="Human-readable description")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class RankRequest(BaseModel):
    """Request to rank candidates for a case."""

    model: ModelType = Field(
        default=ModelType.WEIGHTED_BASELINE,
        description="Model to use for ranking",
    )
    top_k: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="Limit results to top-K candidates (null = all)",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(default="ok", description="Service status")
    version: str = Field(default="0.1.0", description="API version")
    models_available: list[str] = Field(
        default_factory=lambda: ["weighted_baseline", "random_forest"],
        description="Available model types",
    )


class LocationInfo(BaseModel):
    """Location information for map/UI display."""

    location_id: str = Field(..., description="Unique location identifier")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    metro: str = Field(..., description="Metro area name")
    region: str = Field(..., description="Sub-region within metro")
    location_type: str = Field(..., description="Type of location")
    density_score: float = Field(..., description="Foot-traffic density score")


class RankedCandidate(BaseModel):
    """A single ranked candidate location."""

    rank: int = Field(..., ge=1, description="Risk rank (1 = highest risk)")
    location_id: str = Field(..., description="Candidate location identifier")
    risk_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model risk score (higher = more likely cash-out candidate)",
    )
    model_used: str = Field(..., description="Model used for scoring")
    explanation: str = Field(
        default="",
        description="Human-readable explanation of why this candidate scored highly",
    )
    group_scores: dict[str, float] | None = Field(
        default=None,
        description="Per-group score breakdown (baseline model only)",
    )
    location: LocationInfo | None = Field(
        default=None,
        description="Location details for map display",
    )


class CaseInfo(BaseModel):
    """Case information for the investigation."""

    case_id: str = Field(..., description="Unique case identifier")
    complaint_time: datetime = Field(..., description="When the complaint was filed")
    fraud_scenario: str = Field(..., description="Type of fraud scenario")
    reported_amount: float = Field(..., description="Reported fraud amount in INR")
    origin_metro: str = Field(..., description="Metro area where complaint originated")
    num_accounts_involved: int = Field(..., description="Number of accounts in the chain")
    num_transactions: int = Field(..., description="Number of transactions in the chain")
    num_candidates: int = Field(..., description="Number of candidate locations")


class RankResponse(BaseModel):
    """Response containing ranked candidate locations."""

    case: CaseInfo = Field(..., description="Case information")
    model_used: str = Field(..., description="Model used for ranking")
    ranked_candidates: list[RankedCandidate] = Field(
        ...,
        description="Candidates ranked by risk score (highest first)",
    )
    total_candidates: int = Field(..., description="Total number of candidates evaluated")
    disclaimer: str = Field(
        default=(
            "This is an investigator decision-support tool. "
            "Ranked candidates represent risk scores, not guaranteed predictions. "
            "All data is synthetic for demonstration purposes."
        ),
        description="Usage disclaimer",
    )


class InvestigationSummary(BaseModel):
    """Summary of a single investigation case."""

    case_id: str = Field(..., description="Unique case identifier")
    fraud_scenario: str = Field(..., description="Type of fraud scenario")
    reported_amount: float = Field(..., description="Reported fraud amount in INR")
    origin_metro: str = Field(..., description="Metro area where complaint originated")
    complaint_time: datetime = Field(..., description="When the complaint was filed")
    num_candidates: int = Field(..., description="Number of candidate locations")


class InvestigationListResponse(BaseModel):
    """Response containing list of investigations."""

    investigations: list[InvestigationSummary] = Field(
        ...,
        description="List of investigation summaries",
    )
    total: int = Field(..., description="Total number of investigations")


class ErrorResponse(BaseModel):
    """Error response schema."""

    detail: str = Field(..., description="Error message")
    error_code: str = Field(default="UNKNOWN", description="Machine-readable error code")
