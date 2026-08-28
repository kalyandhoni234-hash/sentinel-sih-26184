"""Phase 4 tests for the Random Forest classifier and comparison.

Tests verify:
1. Model training succeeds
2. Prediction shape and coverage
3. Deterministic results (same seed -> same model)
4. Probability/score validity (0-1, sums to 1 per row)
5. Case-level split integrity (no case overlap)
6. Ranking correctness (sequential, descending by score)
7. Target isolation (is_true_location not used as input feature)
8. Layer-C leakage protection
9. Unseen test cases
10. Comparison/evaluation output format
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime
from pathlib import Path

import numpy as np

from src.data_generation.features import FEATURE_NAMES, build_feature_matrix
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario
from src.modeling.baseline import FEATURE_GROUPS, compute_baseline_scores
from src.modeling.comparison import compare_models, format_comparison
from src.modeling.evaluation import evaluate_rankings
from src.modeling.random_forest import (
    DEFAULT_RF_PARAMS,
    get_feature_importance,
    get_group_importance,
    predict_and_rank,
    prepare_xy,
    train_random_forest,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

LEAKAGE_COLUMNS = [
    "actual_cashout_location_id",
    "cashout_time",
    "cashout_metro",
    "scenario_used",
    "selection_probability",
]


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def _build_test_matrix(seed: int = 42) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Generate data and build feature matrix for testing."""
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


def _split_case_level(
    matrix: list[dict],
) -> tuple[list[dict], list[dict], set[str], set[str]]:
    """Case-level 80/20 split."""
    case_ids = sorted({r["case_id"] for r in matrix})
    split_idx = int(len(case_ids) * 0.8)
    train_ids = set(case_ids[:split_idx])
    test_ids = set(case_ids[split_idx:])
    train_rows = [r for r in matrix if r["case_id"] in train_ids]
    test_rows = [r for r in matrix if r["case_id"] in test_ids]
    return train_rows, test_rows, train_ids, test_ids


# ---------------------------------------------------------------------------
# Training tests
# ---------------------------------------------------------------------------


class TestTraining:
    """Test model training succeeds and produces valid output."""

    def test_training_succeeds(self):
        """Random Forest training should complete without error."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        assert clf is not None

    def test_model_has_expected_attributes(self):
        """Trained model should have expected attributes."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        assert hasattr(clf, "predict_proba")
        assert hasattr(clf, "feature_importances_")
        assert hasattr(clf, "n_estimators")
        assert clf.n_estimators == DEFAULT_RF_PARAMS["n_estimators"]

    def test_feature_importances_non_negative(self):
        """Feature importances should be non-negative and sum to ~1."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        importances = clf.feature_importances_
        assert all(imp >= 0 for imp in importances)
        assert abs(sum(importances) - 1.0) < 0.01


# ---------------------------------------------------------------------------
# Prediction shape tests
# ---------------------------------------------------------------------------


class TestPredictionShape:
    """Test prediction output has correct shape and coverage."""

    def test_prediction_count_matches_test_rows(self):
        """Should produce one prediction per test row."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)
        assert len(ranked) == len(test_rows)

    def test_prediction_covers_all_test_cases(self):
        """Every test case should have predictions."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)
        predicted_cases = {r["case_id"] for r in ranked}
        test_cases = {r["case_id"] for r in test_rows}
        assert predicted_cases == test_cases

    def test_empty_test_rows(self):
        """Empty test set should produce empty output."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, [])
        assert ranked == []


# ---------------------------------------------------------------------------
# Determinism tests
# ---------------------------------------------------------------------------


class TestDeterminism:
    """Test that results are fully deterministic with same seed."""

    def test_same_seed_same_predictions(self):
        """Same data should produce identical predictions."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)

        clf1 = train_random_forest(train_rows)
        ranked1 = predict_and_rank(clf1, test_rows)

        clf2 = train_random_forest(train_rows)
        ranked2 = predict_and_rank(clf2, test_rows)

        for r1, r2 in zip(ranked1, ranked2):
            assert r1["rf_score"] == r2["rf_score"]
            assert r1["rank"] == r2["rank"]

    def test_same_seed_same_importance(self):
        """Same training data should produce identical feature importance."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)

        clf1 = train_random_forest(train_rows)
        imp1 = get_feature_importance(clf1)

        clf2 = train_random_forest(train_rows)
        imp2 = get_feature_importance(clf2)

        for i1, i2 in zip(imp1, imp2):
            assert i1["importance"] == i2["importance"]


# ---------------------------------------------------------------------------
# Score validity tests
# ---------------------------------------------------------------------------


class TestScoreValidity:
    """Test that probabilities and scores are valid."""

    def test_scores_in_zero_one_range(self):
        """All RF scores should be between 0 and 1."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)
        for r in ranked:
            assert 0.0 <= r["rf_score"] <= 1.0, (
                f"Score out of range: {r['rf_score']} for {r['case_id']}/{r['location_id']}"
            )

    def test_scores_are_finite(self):
        """All RF scores should be finite numbers."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)
        for r in ranked:
            assert np.isfinite(r["rf_score"]), f"Non-finite score for {r['case_id']}/{r['location_id']}"

    def test_has_required_keys(self):
        """Each ranked result should have required keys."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)
        required = {"case_id", "location_id", "rf_score", "rank", "is_true_location"}
        for r in ranked:
            assert required.issubset(r.keys()), f"Missing keys: {required - r.keys()}"


# ---------------------------------------------------------------------------
# Case-level split integrity tests
# ---------------------------------------------------------------------------


class TestCaseLevelSplit:
    """Test that case-level split is never violated."""

    def test_no_case_in_both_train_and_test(self):
        """No case should appear in both train and test sets."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, train_ids, test_ids = _split_case_level(matrix)
        overlap = train_ids & test_ids
        assert len(overlap) == 0, f"Cases in both train and test: {overlap}"

    def test_split_ratio_approximately_80_20(self):
        """Split should be approximately 80/20."""
        matrix, _, _, _ = _build_test_matrix()
        _, _, train_ids, test_ids = _split_case_level(matrix)
        total = len(train_ids) + len(test_ids)
        train_pct = len(train_ids) / total
        test_pct = len(test_ids) / total
        assert 0.75 <= train_pct <= 0.85, f"Train percentage out of range: {train_pct}"
        assert 0.15 <= test_pct <= 0.25, f"Test percentage out of range: {test_pct}"

    def test_split_total_cases_match(self):
        """Train + test cases should equal total unique cases."""
        matrix, _, _, _ = _build_test_matrix()
        _, _, train_ids, test_ids = _split_case_level(matrix)
        all_ids = {r["case_id"] for r in matrix}
        assert train_ids | test_ids == all_ids


# ---------------------------------------------------------------------------
# Ranking correctness tests
# ---------------------------------------------------------------------------


class TestRankingCorrectness:
    """Test that rankings are correctly assigned."""

    def test_ranks_are_sequential(self):
        """Ranks should be sequential integers starting at 1 per case."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)

        by_case: dict[str, list[dict]] = {}
        for r in ranked:
            by_case.setdefault(r["case_id"], []).append(r)

        for case_id, candidates in by_case.items():
            ranks = sorted(c["rank"] for c in candidates)
            assert ranks[0] == 1, f"Case {case_id}: lowest rank is {ranks[0]}, expected 1"
            for i in range(1, len(ranks)):
                assert ranks[i] == ranks[i - 1] + 1, (
                    f"Case {case_id}: non-sequential rank {ranks[i]} after {ranks[i - 1]}"
                )

    def test_ranking_descending_by_score(self):
        """Higher rank should correspond to higher score."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)

        by_case: dict[str, list[dict]] = {}
        for r in ranked:
            by_case.setdefault(r["case_id"], []).append(r)

        for case_id, candidates in by_case.items():
            sorted_cands = sorted(candidates, key=lambda x: x["rank"])
            scores = [c["rf_score"] for c in sorted_cands]
            for i in range(len(scores) - 1):
                assert scores[i] >= scores[i + 1], (
                    f"Case {case_id}: rank {i + 1} score {scores[i]} < rank {i + 2} score {scores[i + 1]}"
                )

    def test_no_duplicate_ranks(self):
        """No two candidates in the same case should have the same rank."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        ranked = predict_and_rank(clf, test_rows)

        by_case: dict[str, list[dict]] = {}
        for r in ranked:
            by_case.setdefault(r["case_id"], []).append(r)

        for case_id, candidates in by_case.items():
            ranks = [c["rank"] for c in candidates]
            assert len(ranks) == len(set(ranks)), f"Case {case_id}: duplicate ranks"


# ---------------------------------------------------------------------------
# Target isolation tests
# ---------------------------------------------------------------------------


class TestTargetIsolation:
    """Test that is_true_location is not used as input feature."""

    def test_is_true_location_not_in_feature_names(self):
        """is_true_location should not be in the feature list."""
        assert "is_true_location" not in FEATURE_NAMES

    def test_is_true_location_not_in_leakage_columns(self):
        """is_true_location should not appear as input to the model."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        # Check that prepare_xy does not include is_true_location as a feature
        X_train, y_train, _, _ = prepare_xy(train_rows)
        assert X_train.shape[1] == len(FEATURE_NAMES)
        # y is the target, not a feature
        assert y_train.shape[0] == X_train.shape[0]

    def test_remove_is_true_location_no_change_to_features(self):
        """Removing is_true_location from rows should not affect X matrix."""
        matrix, _, _, _ = _build_test_matrix()
        X1, _, _, _ = prepare_xy(matrix)
        matrix_no_gt = [{k: v for k, v in r.items() if k != "is_true_location"} for r in matrix]
        X2, _, _, _ = prepare_xy(matrix_no_gt)
        np.testing.assert_array_equal(X1, X2)


# ---------------------------------------------------------------------------
# Layer-C leakage protection tests
# ---------------------------------------------------------------------------


class TestLayerCLeakageProtection:
    """Test that no Layer-C information enters the model."""

    def test_forbidden_columns_not_in_features(self):
        """Layer-C columns should not be in the feature names."""
        for col in LEAKAGE_COLUMNS:
            assert col not in FEATURE_NAMES, f"Layer-C column '{col}' found in FEATURE_NAMES"

    def test_forbidden_columns_not_in_group_features(self):
        """Layer-C columns should not be in any feature group."""
        all_group_features = []
        for features in FEATURE_GROUPS.values():
            all_group_features.extend(features)
        for col in LEAKAGE_COLUMNS:
            assert col not in all_group_features, f"Layer-C column '{col}' in FEATURE_GROUPS"

    def test_scoring_independent_of_ground_truth(self):
        """RF scores should not change if is_true_location is modified."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)

        ranked1 = predict_and_rank(clf, test_rows)

        # Flip all is_true_location values
        test_rows_modified = []
        for row in test_rows:
            modified_row = dict(row)
            modified_row["is_true_location"] = not modified_row.get("is_true_location", False)
            test_rows_modified.append(modified_row)

        ranked2 = predict_and_rank(clf, test_rows_modified)

        # Scores should be identical (model doesn't use is_true_location)
        for r1, r2 in zip(ranked1, ranked2):
            assert r1["rf_score"] == r2["rf_score"], "RF score depends on is_true_location"


# ---------------------------------------------------------------------------
# Unseen test cases tests
# ---------------------------------------------------------------------------


class TestUnseenTestCases:
    """Test that test cases are truly unseen during training."""

    def test_train_test_case_id_disjoint(self):
        """Train and test case IDs should be completely disjoint."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, train_ids, test_ids = _split_case_level(matrix)
        assert train_ids.isdisjoint(test_ids)

    def test_model_not_fitted_on_test_data(self):
        """Model should not have seen any test case IDs."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, train_ids, test_ids = _split_case_level(matrix)

        train_cases_in_data = {r["case_id"] for r in train_rows}
        test_cases_in_data = {r["case_id"] for r in test_rows}
        assert train_cases_in_data == train_ids
        assert test_cases_in_data == test_ids
        assert train_cases_in_data.isdisjoint(test_cases_in_data)


# ---------------------------------------------------------------------------
# Comparison and evaluation tests
# ---------------------------------------------------------------------------


class TestComparisonOutput:
    """Test comparison output format and correctness."""

    def test_compare_models_returns_valid_structure(self):
        """compare_models should return expected keys."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        ground_truths_for_test = [
            {"case_id": r["case_id"], "actual_cashout_location_id": r["location_id"]}
            for r in test_rows
            if r.get("is_true_location", False)
        ]

        clf = train_random_forest(train_rows)
        rf_ranked = predict_and_rank(clf, test_rows)
        rf_results = evaluate_rankings(rf_ranked, ground_truths_for_test)

        baseline_scored = compute_baseline_scores(test_rows)
        baseline_results = evaluate_rankings(baseline_scored, ground_truths_for_test)

        comparison = compare_models(baseline_results, rf_results)

        assert "metric_comparison" in comparison
        assert "overall_winner" in comparison
        assert "rf_wins_count" in comparison
        assert "baseline_wins_count" in comparison
        assert comparison["overall_winner"] in ("random_forest", "weighted_baseline")

    def test_format_comparison_returns_string(self):
        """format_comparison should return a non-empty string."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, test_rows, _, _ = _split_case_level(matrix)
        ground_truths_for_test = [
            {"case_id": r["case_id"], "actual_cashout_location_id": r["location_id"]}
            for r in test_rows
            if r.get("is_true_location", False)
        ]

        clf = train_random_forest(train_rows)
        rf_ranked = predict_and_rank(clf, test_rows)
        rf_results = evaluate_rankings(rf_ranked, ground_truths_for_test)

        baseline_scored = compute_baseline_scores(test_rows)
        baseline_results = evaluate_rankings(baseline_scored, ground_truths_for_test)

        comparison = compare_models(baseline_results, rf_results)
        text = format_comparison(comparison)
        assert isinstance(text, str)
        assert len(text) > 0
        assert "Baseline" in text
        assert "RF" in text


# ---------------------------------------------------------------------------
# Feature importance tests
# ---------------------------------------------------------------------------


class TestFeatureImportance:
    """Test feature importance extraction."""

    def test_feature_importance_count(self):
        """Should have importance for every feature."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        importance = get_feature_importance(clf)
        assert len(importance) == len(FEATURE_NAMES)

    def test_importance_sorted_descending(self):
        """Importances should be sorted descending."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        importance = get_feature_importance(clf)
        values = [item["importance"] for item in importance]
        assert values == sorted(values, reverse=True)

    def test_group_importance_sums_to_one(self):
        """Group importances should sum to approximately 1.0."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        group_imp = get_group_importance(clf, FEATURE_GROUPS)
        total = sum(group_imp.values())
        assert abs(total - 1.0) < 0.01, f"Group importance sums to {total}"

    def test_group_importance_has_all_groups(self):
        """Group importance should have entries for all 5 groups."""
        matrix, _, _, _ = _build_test_matrix()
        train_rows, _, _, _ = _split_case_level(matrix)
        clf = train_random_forest(train_rows)
        group_imp = get_group_importance(clf, FEATURE_GROUPS)
        assert set(group_imp.keys()) == set(FEATURE_GROUPS.keys())


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_single_candidate_per_case(self):
        """Model should handle cases with a single candidate."""
        # Create minimal synthetic data with 1 candidate per case
        rows = [
            {
                "case_id": "CASE_0001",
                "location_id": "LOC_001",
                "is_true_location": True,
                **{f: 0.0 for f in FEATURE_NAMES},
            },
            {
                "case_id": "CASE_0002",
                "location_id": "LOC_002",
                "is_true_location": False,
                **{f: 0.0 for f in FEATURE_NAMES},
            },
        ]
        # Train on one case, predict on another
        clf = train_random_forest([rows[0]])
        ranked = predict_and_rank(clf, [rows[1]])
        assert len(ranked) == 1
        assert ranked[0]["rank"] == 1

    def test_constant_features(self):
        """Model should handle constant features without error."""
        rows = []
        for i in range(10):
            rows.append(
                {
                    "case_id": f"CASE_{i:04d}",
                    "location_id": f"LOC_{i:03d}",
                    "is_true_location": i == 0,
                    **{f: float(i % 3) for f in FEATURE_NAMES},
                }
            )
        clf = train_random_forest(rows)
        ranked = predict_and_rank(clf, rows)
        assert len(ranked) == len(rows)
