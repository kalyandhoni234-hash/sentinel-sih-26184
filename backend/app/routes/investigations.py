"""Investigation routes.

Exposes case data and ranking endpoints for the SENTINEL API.
All ranking uses only Layer-A features — no ground truth is used in scoring.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.schemas import (
    CaseInfo,
    ErrorResponse,
    InvestigationListResponse,
    InvestigationSummary,
    LocationInfo,
    ModelType,
    RankedCandidate,
    RankRequest,
    RankResponse,
)
from backend.app.services.data_service import DataService
from backend.app.services.model_service import ModelService

router = APIRouter(prefix="/api/v1")

# Services are injected at app startup via dependency injection
_data_service: DataService | None = None
_model_service: ModelService | None = None


def init_services(data_service: DataService, model_service: ModelService) -> None:
    """Initialize route-level service references.

    Called once during app startup.
    """
    global _data_service, _model_service
    _data_service = data_service
    _model_service = model_service


def _get_data_service() -> DataService:
    if _data_service is None:
        raise RuntimeError("DataService not initialized")
    return _data_service


def _get_model_service() -> ModelService:
    if _model_service is None:
        raise RuntimeError("ModelService not initialized")
    return _model_service


@router.get(
    "/investigations",
    response_model=InvestigationListResponse,
    summary="List all investigations",
    description="Returns a summary of all available investigation cases.",
)
async def list_investigations() -> InvestigationListResponse:
    """List all investigation cases."""
    ds = _get_data_service()
    cases = ds.get_all_cases()
    summaries = []
    for c in cases:
        feature_rows = ds.get_feature_rows_for_case(c["case_id"])
        summaries.append(
            InvestigationSummary(
                case_id=c["case_id"],
                fraud_scenario=c["fraud_scenario"],
                reported_amount=c["reported_amount"],
                origin_metro=c["origin_metro"],
                complaint_time=c["complaint_time"],
                num_candidates=len(feature_rows),
            )
        )
    return InvestigationListResponse(investigations=summaries, total=len(summaries))


@router.get(
    "/investigations/{case_id}",
    response_model=CaseInfo,
    summary="Get investigation details",
    description="Returns detailed information about a specific case.",
    responses={
        404: {"model": ErrorResponse, "description": "Case not found"},
    },
)
async def get_investigation(case_id: str) -> CaseInfo:
    """Get details for a specific investigation case."""
    ds = _get_data_service()
    case = ds.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    feature_rows = ds.get_feature_rows_for_case(case_id)
    return CaseInfo(
        case_id=case["case_id"],
        complaint_time=case["complaint_time"],
        fraud_scenario=case["fraud_scenario"],
        reported_amount=case["reported_amount"],
        origin_metro=case["origin_metro"],
        num_accounts_involved=case["num_accounts_involved"],
        num_transactions=case["num_transactions"],
        num_candidates=len(feature_rows),
    )


@router.post(
    "/investigations/{case_id}/rank",
    response_model=RankResponse,
    summary="Rank candidate locations",
    description=(
        "Ranks candidate cash-out locations for a case using the selected model. "
        "This is an investigator decision-support tool — ranked candidates "
        "represent risk scores, not guaranteed predictions."
    ),
    responses={
        404: {"model": ErrorResponse, "description": "Case not found"},
        400: {"model": ErrorResponse, "description": "Invalid model or parameters"},
    },
)
async def rank_candidates(case_id: str, request: RankRequest) -> RankResponse:
    """Rank candidate locations for an investigation case.

    Uses only Layer-A features available at query time.
    Ground truth is never used in scoring.
    """
    ds = _get_data_service()
    ms = _get_model_service()

    # Validate case exists
    case = ds.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    # Get feature rows for this case
    feature_rows = ds.get_feature_rows_for_case(case_id)
    if not feature_rows:
        raise HTTPException(
            status_code=400,
            detail=f"No feature data available for case '{case_id}'",
        )

    # Score based on selected model
    if request.model == ModelType.WEIGHTED_BASELINE:
        scored = ms.score_baseline(feature_rows)
        # Add explanations
        for i, s in enumerate(scored):
            feat_row = feature_rows[i] if i < len(feature_rows) else {}
            s["explanation"] = ms.explain_baseline_candidate(s, feat_row)
        # Normalize output keys
        for s in scored:
            s["risk_score"] = s.pop("baseline_score")
            s["model_used"] = "weighted_baseline"
    elif request.model == ModelType.RANDOM_FOREST:
        scored = ms.score_random_forest(feature_rows)
        # Add explanations
        for i, s in enumerate(scored):
            feat_row = feature_rows[i] if i < len(feature_rows) else {}
            s["explanation"] = ms.explain_rf_candidate(feat_row)
            s["group_scores"] = None
            s["model_used"] = "random_forest"
            s["risk_score"] = s.pop("rf_score")
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model type: {request.model}",
        )

    # Sort by rank
    scored.sort(key=lambda x: x["rank"])

    # Apply top_k limit
    if request.top_k is not None:
        scored = scored[: request.top_k]

    # Build ranked candidates with location info
    ranked_candidates = []
    for s in scored:
        loc = ds.get_location(s["location_id"])
        location_info = None
        if loc:
            location_info = LocationInfo(
                location_id=loc["location_id"],
                latitude=loc["latitude"],
                longitude=loc["longitude"],
                metro=loc["metro"],
                region=loc["region"],
                location_type=loc["location_type"],
                density_score=loc["density_score"],
            )

        ranked_candidates.append(
            RankedCandidate(
                rank=s["rank"],
                location_id=s["location_id"],
                risk_score=round(s["risk_score"], 6),
                model_used=s["model_used"],
                explanation=s.get("explanation", ""),
                group_scores=s.get("group_scores"),
                location=location_info,
            )
        )

    # Build case info
    case_info = CaseInfo(
        case_id=case["case_id"],
        complaint_time=case["complaint_time"],
        fraud_scenario=case["fraud_scenario"],
        reported_amount=case["reported_amount"],
        origin_metro=case["origin_metro"],
        num_accounts_involved=case["num_accounts_involved"],
        num_transactions=case["num_transactions"],
        num_candidates=len(feature_rows),
    )

    return RankResponse(
        case=case_info,
        model_used=request.model.value,
        ranked_candidates=ranked_candidates,
        total_candidates=len(feature_rows),
    )
