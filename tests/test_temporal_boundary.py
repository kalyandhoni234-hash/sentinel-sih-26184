"""Temporal boundary tests for the forward-looking investigator workflow.

Tests verify that:
1. Features are computed using only pre-complaint (T0) transactions
2. Future transactions do not affect forward-looking features
3. Ground-truth fields cannot enter the ranking path
4. Analysis-point filtering is deterministic
5. Candidates generated from available evidence remain stable
6. The API exposes the analysis_point field correctly
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from src.data_generation.features import (
    FEATURE_NAMES,
    build_candidate_features,
    build_feature_matrix,
)
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario
from src.modeling.baseline import compute_baseline_scores


def _generate_test_data():
    """Generate a small synthetic dataset for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = generate_dataset(seed=42, output_dir=tmpdir)
        out = Path(result["output_dir"])

        cases_raw = []
        with open(out / "generated/cases.jsonl") as f:
            for line in f:
                cases_raw.append(json.loads(line))

        candidates = []
        with open(out / "generated/candidates.jsonl") as f:
            for line in f:
                candidates.append(json.loads(line))

        transactions = []
        with open(out / "generated/transactions.jsonl") as f:
            for line in f:
                transactions.append(json.loads(line))

        locations = []
        with open(out / "generated/locations.jsonl") as f:
            for line in f:
                locations.append(json.loads(line))

        ground_truths = []
        with open(out / "evaluation/ground_truth.jsonl") as f:
            for line in f:
                ground_truths.append(json.loads(line))

    return cases_raw, candidates, transactions, locations, ground_truths


def _build_case_objects(cases_raw):
    """Convert raw case dicts to Case objects."""
    case_objects = []
    for c in cases_raw:
        case_objects.append(
            Case(
                case_id=c["case_id"],
                complaint_time=datetime.fromisoformat(c["complaint_time"]),
                fraud_scenario=FraudScenario(c["fraud_scenario"]),
                reported_amount=c["reported_amount"],
                origin_metro=c["origin_metro"],
                origin_location_id=c["origin_location_id"],
                num_accounts_involved=c["num_accounts_involved"],
                num_transactions=c["num_transactions"],
            )
        )
    return case_objects


class TestTemporalBoundary:
    """Test that the temporal boundary (T0 = complaint_time) is correctly enforced."""

    def test_features_use_only_pre_complaint_transactions(self):
        """Features should be identical whether or not post-complaint transactions exist."""
        cases_raw, candidates, transactions, locations, gt = _generate_test_data()
        case_objects = _build_case_objects(cases_raw)

        # Take the first case
        test_case = case_objects[0]
        case_txs = [t for t in transactions if t["case_id"] == test_case.case_id]
        case_cands = [c for c in candidates if c["case_id"] == test_case.case_id]

        # Build features with original transactions
        loc_map = {loc["location_id"]: loc for loc in locations}

        features_original = []
        for c in case_cands:
            feat = build_candidate_features(test_case, c, case_txs, loc_map, is_true=False)
            features_original.append(feat)

        # Now add fake post-complaint transactions
        future_txs = case_txs.copy()
        future_txs.append(
            {
                "transaction_id": "TX_FUTURE_001",
                "case_id": test_case.case_id,
                "sender_account_id": "ACCT_FUTURE_01",
                "receiver_account_id": "ACCT_FUTURE_02",
                "timestamp": (test_case.complaint_time + timedelta(hours=999)).isoformat(),
                "amount": 999999.0,
                "transaction_type": "TRANSFER",
                "sequence_number": 999,
                "sender_metro": "Delhi NCR",
                "receiver_metro": "Mumbai",
            }
        )

        # Build features with future transactions included
        features_with_future = []
        for c in case_cands:
            feat = build_candidate_features(test_case, c, future_txs, loc_map, is_true=False)
            features_with_future.append(feat)

        # Features should be identical because cutoff = complaint_time
        for orig, fut in zip(features_original, features_with_future):
            for fname in FEATURE_NAMES:
                assert orig[fname] == fut[fname], (
                    f"Feature '{fname}' changed when post-complaint transactions were added. "
                    f"Original={orig[fname]}, With future={fut[fname]}"
                )

    def test_geographic_features_use_pre_complaint_tx_endpoints(self):
        """Geographic features should only use pre-complaint transaction endpoints."""
        cases_raw, candidates, transactions, locations, gt = _generate_test_data()
        case_objects = _build_case_objects(cases_raw)

        test_case = case_objects[0]
        case_txs = [t for t in transactions if t["case_id"] == test_case.case_id]
        case_cands = [c for c in candidates if c["case_id"] == test_case.case_id]

        loc_map = {loc["location_id"]: loc for loc in locations}

        # Build features normally
        features_normal = []
        for c in case_cands[:3]:
            feat = build_candidate_features(test_case, c, case_txs, loc_map, is_true=False)
            features_normal.append(feat)

        # Add a future transaction with a different metro
        future_txs = case_txs.copy()
        future_txs.append(
            {
                "transaction_id": "TX_FUTURE_GEO",
                "case_id": test_case.case_id,
                "sender_account_id": "ACCT_FUTURE_G1",
                "receiver_account_id": "ACCT_FUTURE_G2",
                "timestamp": (test_case.complaint_time + timedelta(hours=1)).isoformat(),
                "amount": 50000.0,
                "transaction_type": "TRANSFER",
                "sequence_number": 998,
                "sender_metro": "Chennai",
                "receiver_metro": "Kolkata",
            }
        )

        features_with_future_geo = []
        for c in case_cands[:3]:
            feat = build_candidate_features(test_case, c, future_txs, loc_map, is_true=False)
            features_with_future_geo.append(feat)

        # Geographic features should not change
        geo_features = [
            "cand_distance_from_origin_km",
            "cand_distance_from_last_tx_km",
            "cand_same_metro_as_origin",
            "cand_same_metro_as_last_tx",
            "cand_same_region_as_origin",
            "cand_min_distance_from_any_tx_km",
            "cand_max_distance_from_any_tx_km",
            "cand_mean_distance_from_tx_endpoints_km",
        ]
        for orig, fut in zip(features_normal, features_with_future_geo):
            for fname in geo_features:
                assert orig[fname] == fut[fname], f"Geographic feature '{fname}' changed with future transactions"

    def test_ground_truth_not_in_feature_columns(self):
        """Ground truth fields must not appear as feature columns."""
        cases_raw, candidates, transactions, locations, gt = _generate_test_data()
        case_objects = _build_case_objects(cases_raw)

        matrix = build_feature_matrix(
            cases=case_objects[:5],
            candidates=[c for c in candidates if c["case_id"] in {case.case_id for case in case_objects[:5]}],
            transactions=transactions,
            locations=locations,
            ground_truths=gt,
        )

        ground_truth_fields = {
            "actual_cashout_location_id",
            "cashout_time",
            "cashout_metro",
            "selection_probability",
            "scenario_used",
        }

        for row in matrix:
            for gt_field in ground_truth_fields:
                assert gt_field not in row, f"Ground truth field '{gt_field}' found in feature row"

    def test_is_true_location_stripped_from_model_input(self):
        """is_true_location must not be used as a feature by the model."""
        from src.data_generation.features import FEATURE_NAMES

        assert "is_true_location" not in FEATURE_NAMES, "is_true_location should not be in FEATURE_NAMES"

    def test_analysis_point_in_api_response(self):
        """The API response should include analysis_point matching complaint_time."""
        from fastapi.testclient import TestClient

        from backend.app.main import app

        with TestClient(app, raise_server_exceptions=False) as client:
            # Get a case ID from the investigations list
            resp = client.get("/api/v1/investigations")
            assert resp.status_code == 200
            cases = resp.json()["investigations"]
            assert len(cases) > 0

            case_id = cases[0]["case_id"]

            # Rank with baseline
            rank_resp = client.post(
                f"/api/v1/investigations/{case_id}/rank",
                json={"model": "weighted_baseline", "top_k": 5},
            )
            assert rank_resp.status_code == 200
            data = rank_resp.json()

            # Verify analysis_point exists and matches complaint_time
            assert "analysis_point" in data["case"], "analysis_point missing from API response"
            assert data["case"]["analysis_point"] == data["case"]["complaint_time"], (
                "analysis_point should match complaint_time"
            )

    def test_forward_ranking_deterministic(self):
        """Forward-looking ranking should be deterministic for the same input."""
        cases_raw, candidates, transactions, locations, gt = _generate_test_data()
        case_objects = _build_case_objects(cases_raw)

        matrix = build_feature_matrix(
            cases=case_objects[:10],
            candidates=[c for c in candidates if c["case_id"] in {case.case_id for case in case_objects[:10]}],
            transactions=transactions,
            locations=locations,
            ground_truths=gt,
        )

        # Run ranking twice
        scored_1 = compute_baseline_scores(matrix)
        scored_2 = compute_baseline_scores(matrix)

        # Results should be identical
        for s1, s2 in zip(scored_1, scored_2):
            assert s1["baseline_score"] == s2["baseline_score"]
            assert s1["rank"] == s2["rank"]

    def test_future_transaction_does_not_change_ranking(self):
        """Adding future transactions should not change the forward-looking ranking."""
        cases_raw, candidates, transactions, locations, gt = _generate_test_data()
        case_objects = _build_case_objects(cases_raw)

        test_case = case_objects[0]
        case_txs = [t for t in transactions if t["case_id"] == test_case.case_id]
        case_cands = [c for c in candidates if c["case_id"] == test_case.case_id]

        # Build matrix with original transactions
        matrix_original = build_feature_matrix(
            cases=[test_case],
            candidates=case_cands,
            transactions=case_txs,
            locations=locations,
            ground_truths=[g for g in gt if g["case_id"] == test_case.case_id],
        )

        # Build matrix with future transactions added
        future_txs = case_txs.copy()
        future_txs.append(
            {
                "transaction_id": "TX_FUTURE_RANK",
                "case_id": test_case.case_id,
                "sender_account_id": "ACCT_FR_01",
                "receiver_account_id": "ACCT_FR_02",
                "timestamp": (test_case.complaint_time + timedelta(hours=48)).isoformat(),
                "amount": 200000.0,
                "transaction_type": "TRANSFER",
                "sequence_number": 997,
                "sender_metro": "Jaipur",
                "receiver_metro": "Chennai",
            }
        )

        matrix_with_future = build_feature_matrix(
            cases=[test_case],
            candidates=case_cands,
            transactions=future_txs,
            locations=locations,
            ground_truths=[g for g in gt if g["case_id"] == test_case.case_id],
        )

        # Score both
        scored_original = compute_baseline_scores(matrix_original)
        scored_future = compute_baseline_scores(matrix_with_future)

        # Rankings should be identical
        orig_ranks = {s["location_id"]: s["rank"] for s in scored_original}
        future_ranks = {s["location_id"]: s["rank"] for s in scored_future}

        assert orig_ranks == future_ranks, "Forward-looking ranking changed when future transactions were added"
