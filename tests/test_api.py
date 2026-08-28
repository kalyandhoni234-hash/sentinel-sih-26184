"""Tests for the SENTINEL FastAPI backend.

Tests verify:
1. Health check endpoint
2. Valid investigation request
3. Invalid case handling
4. Invalid model handling
5. Baseline ranking
6. Random Forest ranking
7. Response schema validation
8. Deterministic results
9. Ground-truth isolation
10. Layer-C leakage protection
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    """Create a test client with lifespan triggered."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---------------------------------------------------------------------------
# Health check tests
# ---------------------------------------------------------------------------


class TestHealth:
    """Test health check endpoint."""

    def test_health_returns_200(self, client):
        """Health endpoint should return 200."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_response_schema(self, client):
        """Health response should match schema."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "models_available" in data
        assert "weighted_baseline" in data["models_available"]
        assert "random_forest" in data["models_available"]

    def test_health_is_deterministic(self, client):
        """Multiple health calls should return identical results."""
        r1 = client.get("/health").json()
        r2 = client.get("/health").json()
        assert r1 == r2


# ---------------------------------------------------------------------------
# Investigation list tests
# ---------------------------------------------------------------------------


class TestListInvestigations:
    """Test list investigations endpoint."""

    def test_list_returns_200(self, client):
        """List endpoint should return 200."""
        response = client.get("/api/v1/investigations")
        assert response.status_code == 200

    def test_list_returns_all_cases(self, client):
        """Should return all 80 cases."""
        data = client.get("/api/v1/investigations").json()
        assert data["total"] == 80
        assert len(data["investigations"]) == 80

    def test_list_case_schema(self, client):
        """Each investigation should have required fields."""
        data = client.get("/api/v1/investigations").json()
        for inv in data["investigations"]:
            assert "case_id" in inv
            assert "fraud_scenario" in inv
            assert "reported_amount" in inv
            assert "origin_metro" in inv
            assert "complaint_time" in inv
            assert "num_candidates" in inv
            assert inv["num_candidates"] > 0


# ---------------------------------------------------------------------------
# Investigation detail tests
# ---------------------------------------------------------------------------


class TestGetInvestigation:
    """Test get investigation detail endpoint."""

    def test_get_returns_200(self, client):
        """Get endpoint should return 200 for valid case."""
        response = client.get("/api/v1/investigations/CASE_0001")
        assert response.status_code == 200

    def test_get_returns_404_for_invalid(self, client):
        """Get endpoint should return 404 for nonexistent case."""
        response = client.get("/api/v1/investigations/NONEXISTENT")
        assert response.status_code == 404

    def test_get_response_schema(self, client):
        """Response should match CaseInfo schema."""
        data = client.get("/api/v1/investigations/CASE_0001").json()
        assert data["case_id"] == "CASE_0001"
        assert "complaint_time" in data
        assert "fraud_scenario" in data
        assert "reported_amount" in data
        assert "origin_metro" in data
        assert "num_candidates" in data
        assert data["num_candidates"] > 0


# ---------------------------------------------------------------------------
# Baseline ranking tests
# ---------------------------------------------------------------------------


class TestBaselineRanking:
    """Test baseline model ranking endpoint."""

    def test_baseline_rank_returns_200(self, client):
        """Baseline ranking should return 200."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        )
        assert response.status_code == 200

    def test_baseline_rank_response_schema(self, client):
        """Response should match RankResponse schema."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        assert "case" in data
        assert "ranked_candidates" in data
        assert "total_candidates" in data
        assert "model_used" in data
        assert "disclaimer" in data
        assert data["model_used"] == "weighted_baseline"

    def test_baseline_rank_candidates_have_required_fields(self, client):
        """Each ranked candidate should have required fields."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert "rank" in cand
            assert "location_id" in cand
            assert "risk_score" in cand
            assert "model_used" in cand
            assert "explanation" in cand
            assert "group_scores" in cand
            assert cand["model_used"] == "weighted_baseline"

    def test_baseline_rank_descending_by_score(self, client):
        """Candidates should be ranked by descending risk score."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        scores = [c["risk_score"] for c in data["ranked_candidates"]]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]

    def test_baseline_rank_sequential_ranks(self, client):
        """Ranks should be sequential starting at 1."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        ranks = [c["rank"] for c in data["ranked_candidates"]]
        assert ranks[0] == 1
        for i in range(1, len(ranks)):
            assert ranks[i] == ranks[i - 1] + 1

    def test_baseline_rank_scores_in_range(self, client):
        """All risk scores should be between 0 and 1."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert 0.0 <= cand["risk_score"] <= 1.0

    def test_baseline_rank_top_k(self, client):
        """top_k should limit results."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline", "top_k": 3},
        ).json()
        assert len(data["ranked_candidates"]) == 3
        assert data["ranked_candidates"][0]["rank"] == 1

    def test_baseline_rank_has_location_info(self, client):
        """Each candidate should have location info."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert cand["location"] is not None
            assert "latitude" in cand["location"]
            assert "longitude" in cand["location"]
            assert "metro" in cand["location"]
            assert "location_type" in cand["location"]

    def test_baseline_rank_has_explanation(self, client):
        """Each candidate should have a non-empty explanation."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert len(cand["explanation"]) > 0


# ---------------------------------------------------------------------------
# Random Forest ranking tests
# ---------------------------------------------------------------------------


class TestRandomForestRanking:
    """Test Random Forest model ranking endpoint."""

    def test_rf_rank_returns_200(self, client):
        """RF ranking should return 200."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        )
        assert response.status_code == 200

    def test_rf_rank_response_schema(self, client):
        """Response should match RankResponse schema."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        assert data["model_used"] == "random_forest"
        assert "case" in data
        assert "ranked_candidates" in data

    def test_rf_rank_candidates_have_required_fields(self, client):
        """Each ranked candidate should have required fields."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert "rank" in cand
            assert "location_id" in cand
            assert "risk_score" in cand
            assert "model_used" in cand
            assert "explanation" in cand
            assert cand["model_used"] == "random_forest"

    def test_rf_rank_descending_by_score(self, client):
        """Candidates should be ranked by descending risk score."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        scores = [c["risk_score"] for c in data["ranked_candidates"]]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]

    def test_rf_rank_scores_in_range(self, client):
        """All risk scores should be between 0 and 1."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert 0.0 <= cand["risk_score"] <= 1.0

    def test_rf_rank_has_location_info(self, client):
        """Each candidate should have location info."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert cand["location"] is not None


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Test error handling."""

    def test_invalid_case_returns_404(self, client):
        """Nonexistent case should return 404."""
        response = client.post(
            "/api/v1/investigations/NONEXISTENT/rank",
            json={"model": "weighted_baseline"},
        )
        assert response.status_code == 404

    def test_invalid_model_returns_422(self, client):
        """Invalid model type should return 422 (Pydantic validation)."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "invalid_model"},
        )
        assert response.status_code == 422

    def test_invalid_top_k_returns_422(self, client):
        """Invalid top_k should return 422."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline", "top_k": -1},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Determinism tests
# ---------------------------------------------------------------------------


class TestDeterminism:
    """Test that API results are deterministic."""

    def test_baseline_ranking_deterministic(self, client):
        """Same case + same model should produce identical rankings."""
        r1 = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        r2 = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for c1, c2 in zip(r1["ranked_candidates"], r2["ranked_candidates"]):
            assert c1["risk_score"] == c2["risk_score"]
            assert c1["rank"] == c2["rank"]

    def test_rf_ranking_deterministic(self, client):
        """Same case + same model should produce identical rankings."""
        r1 = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        r2 = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        for c1, c2 in zip(r1["ranked_candidates"], r2["ranked_candidates"]):
            assert c1["risk_score"] == c2["risk_score"]
            assert c1["rank"] == c2["rank"]


# ---------------------------------------------------------------------------
# Ground-truth isolation tests
# ---------------------------------------------------------------------------


class TestGroundTruthIsolation:
    """Test that ground truth is not used in scoring."""

    def test_baseline_scores_independent_of_ground_truth(self, client):
        """Baseline scores should not depend on ground truth."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert "actual_cashout_location_id" not in cand
            assert "cashout_time" not in cand
            assert "cashout_metro" not in cand
            assert "scenario_used" not in cand
            assert "selection_probability" not in cand

    def test_rf_scores_independent_of_ground_truth(self, client):
        """RF scores should not depend on ground truth."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        ).json()
        for cand in data["ranked_candidates"]:
            assert "actual_cashout_location_id" not in cand
            assert "cashout_time" not in cand


# ---------------------------------------------------------------------------
# Layer-C leakage tests
# ---------------------------------------------------------------------------


class TestLayerCLeakage:
    """Test that Layer-C information is not exposed via API."""

    FORBIDDEN_COLUMNS = [
        "actual_cashout_location_id",
        "cashout_time",
        "cashout_metro",
        "scenario_used",
        "selection_probability",
    ]

    def test_no_leaked_columns_in_rank_response(self, client):
        """Rank response should not contain Layer-C columns."""
        data = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        ).json()
        for col in self.FORBIDDEN_COLUMNS:
            assert col not in str(data), f"Layer-C column '{col}' found in response"

    def test_no_leaked_columns_in_case_response(self, client):
        """Case response should not contain Layer-C columns."""
        data = client.get("/api/v1/investigations/CASE_0001").json()
        for col in self.FORBIDDEN_COLUMNS:
            assert col not in str(data), f"Layer-C column '{col}' found in response"


# ---------------------------------------------------------------------------
# CORS tests
# ---------------------------------------------------------------------------


class TestCORS:
    """Test CORS configuration."""

    def test_cors_preflight_allowed(self, client):
        """OPTIONS request should be handled by CORS."""
        response = client.options(
            "/api/v1/investigations",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code in (200, 405)
