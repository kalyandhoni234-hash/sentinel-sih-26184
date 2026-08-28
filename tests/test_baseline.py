"""Phase 3 tests for the weighted risk baseline scorer.

Tests verify:
1. Deterministic scoring
2. Same input -> same ranking
3. All candidate rows receive scores
4. Ranking is descending by score
5. Rank values are correct
6. No evaluation-only feature enters the scorer
7. Ground truth is not used during prediction
8. Missing sentinel values do not crash scoring
9. Every case has exactly one ranking
10. Candidate counts remain unchanged
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime
from pathlib import Path

from src.data_generation.features import FEATURE_NAMES, build_feature_matrix
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario
from src.modeling.baseline import (
    FEATURE_GROUPS,
    GROUP_WEIGHTS,
    SENTINEL_FEATURES,
    compute_baseline_scores,
    explain_candidate,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def _build_test_matrix(seed: int = 42) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Generate data and build feature matrix for testing.

    Returns:
        (feature_rows, cases_raw, ground_truths, candidates)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        result = generate_dataset(seed=seed, output_dir=tmpdir)
        out = Path(result["output_dir"])

        cases_raw = _load_jsonl(out / "generated/cases.jsonl")
        candidates = _load_jsonl(out / "generated/candidates.jsonl")
        transactions = _load_jsonl(out / "generated/transactions.jsonl")
        locations = _load_jsonl(out / "generated/locations.jsonl")
        ground_truths = _load_jsonl(out / "evaluation/ground_truth.jsonl")

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

    matrix = build_feature_matrix(
        cases=case_objects,
        candidates=candidates,
        transactions=transactions,
        locations=locations,
        ground_truths=ground_truths,
    )

    return matrix, cases_raw, ground_truths, candidates


# ---------------------------------------------------------------------------
# Scoring determinism tests
# ---------------------------------------------------------------------------


class TestScoringDeterminism:
    """Test that scoring is fully deterministic."""

    def test_same_input_same_scores(self):
        """Same feature rows should produce identical scores."""
        matrix, _, _, _ = _build_test_matrix(seed=42)
        scores1 = compute_baseline_scores(matrix)
        scores2 = compute_baseline_scores(matrix)
        assert len(scores1) == len(scores2)
        for s1, s2 in zip(scores1, scores2):
            assert s1["baseline_score"] == s2["baseline_score"]
            assert s1["case_id"] == s2["case_id"]
            assert s1["location_id"] == s2["location_id"]

    def test_same_input_same_ranks(self):
        """Same feature rows should produce identical ranks."""
        matrix, _, _, _ = _build_test_matrix(seed=42)
        scores1 = compute_baseline_scores(matrix)
        scores2 = compute_baseline_scores(matrix)
        for s1, s2 in zip(scores1, scores2):
            assert s1["rank"] == s2["rank"]

    def test_same_seed_same_matrix(self):
        """Same seed should produce identical feature matrix and scores."""
        matrix1, _, _, _ = _build_test_matrix(seed=42)
        matrix2, _, _, _ = _build_test_matrix(seed=42)
        scores1 = compute_baseline_scores(matrix1)
        scores2 = compute_baseline_scores(matrix2)
        assert len(scores1) == len(scores2)
        for s1, s2 in zip(scores1, scores2):
            assert s1["baseline_score"] == s2["baseline_score"]
            assert s1["rank"] == s2["rank"]


# ---------------------------------------------------------------------------
# Coverage tests
# ---------------------------------------------------------------------------


class TestCoverage:
    """Test that all candidates receive scores."""

    def test_all_rows_scored(self):
        """Every feature row should produce a scored result."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        assert len(scores) == len(matrix)

    def test_every_case_has_rankings(self):
        """Every case should have at least one ranked candidate."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        cases_with_rankings = {s["case_id"] for s in scores}
        cases_in_matrix = {r["case_id"] for r in matrix}
        assert cases_with_rankings == cases_in_matrix

    def test_candidate_counts_unchanged(self):
        """Scored candidate count should equal input candidate count."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        assert len(scores) == len(matrix)


# ---------------------------------------------------------------------------
# Ranking order tests
# ---------------------------------------------------------------------------


class TestRankingOrder:
    """Test that rankings are correctly ordered."""

    def test_ranking_is_descending_by_score(self):
        """Within each case, candidates should be ranked by descending score."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)

        by_case: dict[str, list[dict]] = {}
        for s in scores:
            by_case.setdefault(s["case_id"], []).append(s)

        for case_id, candidates in by_case.items():
            sorted_cands = sorted(candidates, key=lambda x: x["rank"])
            scores_by_rank = [c["baseline_score"] for c in sorted_cands]
            # Scores should be non-increasing (allow ties)
            for i in range(len(scores_by_rank) - 1):
                assert scores_by_rank[i] >= scores_by_rank[i + 1], (
                    f"Case {case_id}: rank {i + 1} score {scores_by_rank[i]} "
                    f"< rank {i + 2} score {scores_by_rank[i + 1]}"
                )

    def test_rank_values_are_correct(self):
        """Rank values should be sequential integers starting at 1."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)

        by_case: dict[str, list[dict]] = {}
        for s in scores:
            by_case.setdefault(s["case_id"], []).append(s)

        for case_id, candidates in by_case.items():
            ranks = sorted(c["rank"] for c in candidates)
            assert ranks[0] == 1, f"Case {case_id}: lowest rank is {ranks[0]}, expected 1"
            for i in range(1, len(ranks)):
                assert ranks[i] == ranks[i - 1] + 1 or ranks[i] == ranks[i - 1], (
                    f"Case {case_id}: non-sequential rank {ranks[i]} after {ranks[i - 1]}"
                )

    def test_exactly_one_ranking_per_case(self):
        """Each case should have exactly one ranking per candidate (no duplicate ranks)."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)

        by_case: dict[str, list[dict]] = {}
        for s in scores:
            by_case.setdefault(s["case_id"], []).append(s)

        for case_id, candidates in by_case.items():
            ranks = [c["rank"] for c in candidates]
            assert len(ranks) == len(set(ranks)), f"Case {case_id}: duplicate ranks detected"


# ---------------------------------------------------------------------------
# Leakage prevention tests
# ---------------------------------------------------------------------------


class TestLeakagePrevention:
    """Test that no evaluation-only information enters the scorer."""

    def test_no_evaluation_features_in_scoring(self):
        """The scorer should not use any Layer-C features."""
        # These features should never be part of FEATURE_GROUPS
        forbidden_groups = [
            "actual_cashout_location_id",
            "cashout_time",
            "cashout_metro",
            "scenario_used",
            "selection_probability",
            "is_true_location",
        ]
        all_group_features = []
        for features in FEATURE_GROUPS.values():
            all_group_features.extend(features)

        for forbidden in forbidden_groups:
            assert forbidden not in all_group_features, f"Forbidden feature '{forbidden}' found in FEATURE_GROUPS"

    def test_ground_truth_not_used_in_scoring(self):
        """compute_baseline_scores should not access ground truth data."""
        matrix, _, ground_truths, _ = _build_test_matrix()

        # Score with ground truth available in feature rows
        scores_with_gt = compute_baseline_scores(matrix)

        # Remove is_true_location from feature rows
        matrix_no_gt = []
        for row in matrix:
            clean_row = {k: v for k, v in row.items() if k != "is_true_location"}
            matrix_no_gt.append(clean_row)

        scores_without_gt = compute_baseline_scores(matrix_no_gt)

        # Scores should be identical (scorer doesn't use is_true_location)
        assert len(scores_with_gt) == len(scores_without_gt)
        for s1, s2 in zip(scores_with_gt, scores_without_gt):
            assert s1["baseline_score"] == s2["baseline_score"], "Scorer appears to use is_true_location"

    def test_only_layer_a_features_used(self):
        """All features used by the scorer should be Layer-A (query-time allowed)."""
        # Every feature in FEATURE_GROUPS should be in FEATURE_NAMES
        for group_name, features in FEATURE_GROUPS.items():
            for feat in features:
                assert feat in FEATURE_NAMES, f"Feature '{feat}' in group '{group_name}' not in FEATURE_NAMES"


# ---------------------------------------------------------------------------
# Missing value handling tests
# ---------------------------------------------------------------------------


class TestMissingValues:
    """Test that sentinel values do not crash scoring."""

    def test_sentinel_values_handled(self):
        """Features with -1.0 sentinel values should not crash the scorer."""
        matrix, _, _, _ = _build_test_matrix()
        # Verify some sentinel values exist
        sentinel_count = sum(1 for row in matrix for feat in SENTINEL_FEATURES if row.get(feat) == -1.0)
        assert sentinel_count > 0, "No sentinel values found in test data"

        # Scoring should not crash
        scores = compute_baseline_scores(matrix)
        assert len(scores) == len(matrix)

    def test_all_scores_finite(self):
        """All baseline scores should be finite numbers."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores:
            assert isinstance(s["baseline_score"], float)
            assert not (s["baseline_score"] != s["baseline_score"]), "NaN score detected"  # NaN check
            assert abs(s["baseline_score"]) < 1e10, f"Extreme score: {s['baseline_score']}"

    def test_scores_in_valid_range(self):
        """All baseline scores should be between 0 and 1."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores:
            assert 0.0 <= s["baseline_score"] <= 1.0, (
                f"Score out of range: {s['baseline_score']} for {s['case_id']}/{s['location_id']}"
            )


# ---------------------------------------------------------------------------
# Group score tests
# ---------------------------------------------------------------------------


class TestGroupScores:
    """Test that group scores are computed correctly."""

    def test_group_scores_present(self):
        """Each scored candidate should have group_scores dict."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores:
            assert "group_scores" in s
            for group_name in GROUP_WEIGHTS:
                assert group_name in s["group_scores"]

    def test_group_scores_in_range(self):
        """All group scores should be between 0 and 1."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores:
            for group_name, gs in s["group_scores"].items():
                assert 0.0 <= gs <= 1.0, (
                    f"Group score out of range: {group_name}={gs} for {s['case_id']}/{s['location_id']}"
                )

    def test_weighted_sum_matches_baseline_score(self):
        """Baseline score should be weighted sum of group scores."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores:
            expected = sum(GROUP_WEIGHTS[g] * s["group_scores"][g] for g in GROUP_WEIGHTS)
            assert abs(s["baseline_score"] - expected) < 1e-5, (
                f"Weighted sum mismatch: {s['baseline_score']} != {expected}"
            )

    def test_group_weights_sum_to_one(self):
        """Group weights should sum to 1.0."""
        total = sum(GROUP_WEIGHTS.values())
        assert abs(total - 1.0) < 1e-10, f"Group weights sum to {total}, expected 1.0"


# ---------------------------------------------------------------------------
# Explanation tests
# ---------------------------------------------------------------------------


class TestExplanation:
    """Test that explanations are generated correctly."""

    def test_explain_returns_string(self):
        """explain_candidate should return a non-empty string."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores[:5]:
            feat_row = next(
                (r for r in matrix if r["case_id"] == s["case_id"] and r["location_id"] == s["location_id"]),
                {},
            )
            explanation = explain_candidate(s, feat_row)
            assert isinstance(explanation, str)
            assert len(explanation) > 0

    def test_explanation_does_not_reference_ground_truth(self):
        """Explanation should not reference hidden ground truth information."""
        matrix, _, _, _ = _build_test_matrix()
        scores = compute_baseline_scores(matrix)
        for s in scores[:10]:
            feat_row = next(
                (r for r in matrix if r["case_id"] == s["case_id"] and r["location_id"] == s["location_id"]),
                {},
            )
            explanation = explain_candidate(s, feat_row)
            forbidden_terms = [
                "actual cash-out",
                "ground truth",
                "true location",
                "cashout_time",
                "is_true",
            ]
            for term in forbidden_terms:
                assert term.lower() not in explanation.lower(), (
                    f"Explanation references forbidden term '{term}': {explanation}"
                )


# ---------------------------------------------------------------------------
# Empty input tests
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_empty_input(self):
        """Empty feature matrix should produce empty scores."""
        scores = compute_baseline_scores([])
        assert scores == []

    def test_single_candidate(self):
        """Single candidate should get rank 1."""
        row = {
            "case_id": "CASE_0001",
            "location_id": "LOC_001",
            "is_true_location": True,
            "cand_distance_from_origin_km": 5.0,
            "cand_same_metro_as_origin": 1,
            "cand_same_metro_as_last_tx": 1,
            "cand_same_region_as_origin": 1,
            "cand_distance_from_last_tx_km": 3.0,
            "cand_min_distance_from_any_tx_km": 2.0,
            "cand_max_distance_from_any_tx_km": 8.0,
            "cand_mean_distance_from_tx_endpoints_km": 5.0,
            "tx_total_amount": 50000.0,
            "tx_count": 3,
            "tx_avg_amount": 16666.67,
            "tx_max_amount": 25000.0,
            "tx_amount_range": 20000.0,
            "tx_amount_std": 10000.0,
            "tx_hop_count": 3,
            "tx_amount_to_reported_ratio": 0.8,
            "tx_chain_duration_hours": 48.0,
            "tx_avg_inter_arrival_hours": 24.0,
            "tx_max_inter_arrival_hours": 36.0,
            "tx_min_inter_arrival_hours": 12.0,
            "tx_velocity_per_hour": 0.0625,
            "tx_cross_metro_count": 0,
            "tx_unique_metros": 1,
            "complaint_delay_from_last_tx_hours": 2.0,
            "complaint_hour_of_day": 10,
            "complaint_day_of_week": 2,
            "last_tx_hour_of_day": 8,
            "time_since_last_tx_to_complaint_hours": 2.0,
            "loc_type_atm": 1,
            "loc_type_bank_branch": 0,
            "loc_type_money_transfer": 0,
            "loc_type_shopping_mall": 0,
            "loc_type_market": 0,
            "loc_type_transport_hub": 0,
            "loc_is_cashout_friendly_type": 1,
            "loc_density_score": 0.8,
            "loc_is_high_surveillance": 0,
            "case_reported_amount": 100000.0,
            "case_num_accounts": 3,
            "case_num_transactions": 3,
            "case_scenario_DIRECT_CASHOUT": 1,
            "case_scenario_RAPID_MULE_CHAIN": 0,
            "case_scenario_MULTI_HOP": 0,
            "case_scenario_GEOGRAPHIC_JUMP": 0,
            "case_scenario_DELAYED_CASHOUT": 0,
            "case_scenario_URBAN_CLUSTER": 0,
            "case_scenario_DISPERSED_ACTIVITY": 0,
        }
        scores = compute_baseline_scores([row])
        assert len(scores) == 1
        assert scores[0]["rank"] == 1
