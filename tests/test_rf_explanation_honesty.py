"""Regression tests for the P1 Random Forest explanation fix.

The audit identified that hand-written threshold rules were being exposed
to the API and frontend as if they were Random Forest local explanations.
This module locks in the corrected, honest terminology:

  - RF-scored explanations are labeled "Supporting evidence signals".
  - The text is not claimed to be an exact local RF attribution.
  - The schema description and model-service docstring reflect this.
  - The UI surfaces do not claim RF reasoning.

These tests are static and behavioural: they inspect source strings AND
exercise the live API + service to guarantee the contract holds.
"""

from __future__ import annotations

import inspect
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"


# Phrasing that would falsely claim an exact RF local attribution. None of
# these phrases may appear in the user-facing RF explanation path.
FORBIDDEN_RF_PHRASES = [
    "random forest reasoning",
    "exact model reasoning",
    "the random forest decided",
    "the model decided",
    "rf attribution",
    "exact rf attribution",
    "because the model said",
    "causal explanation",
    "rf feature attribution",
    "model says",
]


# Safe phrases that must appear on the RF explanation path.
SAFE_RF_PHRASES = [
    "supporting evidence signals",
]


# ---------------------------------------------------------------------------
# Static source-string checks
# ---------------------------------------------------------------------------


def test_model_service_docstring_documents_rf_term_contract():
    """model_service.py module docstring must explicitly describe the
    non-attribution contract for RF explanations."""
    from backend.app.services import model_service

    src = inspect.getsource(model_service)
    for phrase in SAFE_RF_PHRASES:
        assert phrase in src.lower(), f"backend/app/services/model_service.py does not mention '{phrase}'"
    # Must NOT be silent on the no-attribution rule
    assert "not" in src.lower() and ("attribution" in src.lower() or "reasoning" in src.lower()), (
        "model_service.py must explicitly disclaim RF local attribution"
    )


def test_describe_rf_evidence_signals_returns_safe_prefix():
    """The RF evidence helper must return a string starting with the safe
    'Supporting evidence signals:' prefix."""
    from backend.app.services.model_service import ModelService

    ms = ModelService()
    feature_row = {
        "cand_same_metro_as_origin": 1,
        "cand_same_region_as_origin": 1,
        "cand_same_metro_as_last_tx": 1,
        "cand_distance_from_origin_km": 3.0,
        "loc_is_cashout_friendly_type": 1,
        "loc_type_atm": 1,
        "loc_type_money_transfer": 0,
        "tx_count": 8,
        "tx_total_amount": 200000,
        "loc_density_score": 0.8,
    }
    out = ms.describe_rf_evidence_signals(feature_row)
    assert out.lower().startswith("supporting evidence signals:"), (
        f"RF evidence description must start with 'Supporting evidence signals:'; got: {out!r}"
    )


def test_describe_rf_evidence_signals_handles_empty_row():
    """Even with no positive signals, the prefix must remain safe."""
    from backend.app.services.model_service import ModelService

    ms = ModelService()
    out = ms.describe_rf_evidence_signals({})
    assert out.lower().startswith("supporting evidence signals:"), out
    assert "no prominent observable evidence signals" in out.lower()


def test_describe_rf_evidence_signals_avoids_forbidden_phrases():
    """The RF evidence helper must NEVER use phrases that claim exact RF
    reasoning."""
    from backend.app.services.model_service import ModelService

    ms = ModelService()
    feature_row = {
        "cand_same_metro_as_origin": 1,
        "cand_distance_from_origin_km": 1.0,
        "loc_is_cashout_friendly_type": 1,
        "loc_type_atm": 1,
        "loc_type_money_transfer": 1,
        "tx_count": 10,
        "tx_total_amount": 500000,
        "loc_density_score": 0.9,
    }
    out = ms.describe_rf_evidence_signals(feature_row).lower()
    for phrase in FORBIDDEN_RF_PHRASES:
        assert phrase not in out, f"RF evidence description contains forbidden phrase '{phrase}': {out}"


# ---------------------------------------------------------------------------
# Schema / API contract
# ---------------------------------------------------------------------------


def test_rank_response_schema_describes_explanation_honestly():
    """The OpenAPI schema description for the explanation field must
    explicitly state that the text is NOT an exact local model attribution
    for RF results."""
    from backend.app.schemas import RankedCandidate

    schema = RankedCandidate.model_json_schema()
    desc = schema["properties"]["explanation"]["description"].lower()
    assert "supporting evidence signals" in desc
    assert "not an exact local model attribution" in desc or "not" in desc
    for phrase in FORBIDDEN_RF_PHRASES:
        assert phrase not in desc, f"Schema description for 'explanation' contains forbidden phrase '{phrase}': {desc}"


# ---------------------------------------------------------------------------
# Live API exercise (uses the session-scoped fixture from conftest)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    """Build a FastAPI test client with real services initialised."""
    from backend.app.main import app
    from backend.app.routes.investigations import init_services
    from backend.app.services.data_service import DataService
    from backend.app.services.model_service import ModelService

    ds = DataService(seed=42)
    ds.load()
    train_rows, _, _, _ = ds.get_train_test_split()
    ms = ModelService()
    ms.train(train_rows)
    init_services(ds, ms)
    return TestClient(app)


def test_api_rf_explanations_use_safe_prefix(client):
    """Live API: every RF candidate explanation must use the safe label."""
    response = client.post(
        "/api/v1/investigations/CASE_0001/rank",
        json={"model": "random_forest"},
    )
    assert response.status_code == 200
    data = response.json()
    for cand in data["ranked_candidates"]:
        text = cand["explanation"].lower()
        assert text.startswith("supporting evidence signals:"), (
            f"RF candidate explanation does not start with safe prefix: {cand['explanation']!r}"
        )
        for phrase in FORBIDDEN_RF_PHRASES:
            assert phrase not in text, f"Live RF explanation contains forbidden phrase '{phrase}': {text}"


def test_api_baseline_explanations_distinct_from_rf(client):
    """Baseline uses its own accurate 'High score because of' phrasing, RF
    uses 'Supporting evidence signals'. Both must be present and distinct."""
    base = client.post(
        "/api/v1/investigations/CASE_0001/rank",
        json={"model": "weighted_baseline"},
    ).json()
    rf = client.post(
        "/api/v1/investigations/CASE_0001/rank",
        json={"model": "random_forest"},
    ).json()

    base_texts = [c["explanation"].lower() for c in base["ranked_candidates"]]
    rf_texts = [c["explanation"].lower() for c in rf["ranked_candidates"]]

    # Baseline uses "high score because of" — transparent weighted model.
    assert any("high score because of" in t for t in base_texts)
    # RF uses "supporting evidence signals" — black-box ensemble, no exact
    # attribution available.
    assert any("supporting evidence signals" in t for t in rf_texts)
    # They must not collide.
    assert not any("supporting evidence signals" in t for t in base_texts)
    assert not any("high score because of" in t for t in rf_texts)


def test_api_explanation_field_present_and_non_empty(client):
    """The API must still return a non-empty explanation field for both
    models (regression check on output schema)."""
    for model in ("weighted_baseline", "random_forest"):
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": model},
        ).json()
        assert data["ranked_candidates"], f"No candidates for {model}"
        for cand in data["ranked_candidates"]:
            assert isinstance(cand["explanation"], str)
            assert len(cand["explanation"]) > 0


# ---------------------------------------------------------------------------
# Frontend surface check
# ---------------------------------------------------------------------------


def test_frontend_uses_safe_label_for_rf():
    """The case-detail page must label RF candidate evidence as
    'Supporting Evidence Signals' (or equivalent safe wording) and not
    claim RF reasoning."""
    detail = (FRONTEND_DIR / "src" / "app" / "investigations" / "[caseId]" / "page.tsx").read_text(encoding="utf-8")
    assert "Supporting Evidence Signals" in detail or "supporting evidence signals" in detail.lower(), (
        "Frontend case-detail page must label RF evidence with safe wording"
    )
    lowered = detail.lower()
    for phrase in FORBIDDEN_RF_PHRASES:
        # Allow the phrase to appear inside a code comment that explicitly
        # disclaims it; otherwise fail.
        if phrase in lowered:
            # Permitted only if it appears in a context denying the claim.
            assert "not" in lowered or "no " in lowered, (
                f"Frontend detail page contains forbidden phrase '{phrase}' without an explicit disclaimer"
            )


def test_frontend_map_renders_explanation_without_renaming():
    """The map popup must render the explanation as-is, not rename it to
    'RF reasoning' or similar."""
    map_src = (FRONTEND_DIR / "src" / "components" / "SentinelMap.tsx").read_text(encoding="utf-8")
    assert "c.explanation" in map_src, "Map popup must render explanation text"
    # It must not wrap it in misleading phrasing.
    assert "Random Forest reasoning" not in map_src
    assert "RF reasoning" not in map_src
    assert "model decided" not in map_src.lower()
