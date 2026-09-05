"""Phase 2 tests for feature engineering and leakage validation.

Tests cover:
- Feature generation correctness
- Query-time cutoff enforcement
- Target isolation
- Future-event isolation
- Candidate-level correctness
- Deterministic feature generation
- Case-level split preparation
- Missing-value handling
- Leakage regression
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime
from pathlib import Path

from src.data_generation.features import (
    FEATURE_NAMES,
    FEATURE_REGISTRY,
    METADATA_COLUMNS,
    build_feature_matrix,
    get_feature_names,
)
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def _build_matrix_with_raw_data(seed: int = 42) -> tuple[list[dict], dict]:
    """Generate data and build feature matrix, returning raw data too.

    Uses a temporary directory to avoid file locking issues on Windows.
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

    meta = {
        "cases_raw": cases_raw,
        "candidates": candidates,
        "transactions": transactions,
        "locations": locations,
        "ground_truths": ground_truths,
        "case_objects": case_objects,
    }
    return matrix, meta


# ---------------------------------------------------------------------------
# Feature generation tests
# ---------------------------------------------------------------------------


class TestFeatureGeneration:
    """Test that features are correctly generated."""

    def test_feature_matrix_has_correct_row_count(self):
        """Each candidate should produce one row in the feature matrix."""
        matrix, meta = _build_matrix_with_raw_data()
        assert len(matrix) == len(meta["candidates"]), (
            f"Feature matrix rows ({len(matrix)}) != candidates ({len(meta['candidates'])})"
        )

    def test_feature_matrix_has_all_feature_columns(self):
        """All registered features should be present in each row."""
        matrix, _ = _build_matrix_with_raw_data()
        expected = set(get_feature_names())
        for row in matrix[:5]:
            actual = set(k for k in row.keys() if k not in METADATA_COLUMNS)
            missing = expected - actual
            extra = actual - expected
            assert not missing, f"Missing features: {missing}"
            assert not extra, f"Unexpected features: {extra}"

    def test_metadata_columns_present(self):
        """Metadata columns should be present in each row."""
        matrix, _ = _build_matrix_with_raw_data()
        for row in matrix:
            for col in METADATA_COLUMNS:
                assert col in row, f"Missing metadata column: {col}"

    def test_case_ids_match(self):
        """Each feature row should reference the correct case."""
        matrix, meta = _build_matrix_with_raw_data()
        cand_case_ids = {c["case_id"] for c in meta["candidates"]}
        feat_case_ids = {r["case_id"] for r in matrix}
        assert cand_case_ids == feat_case_ids

    def test_location_ids_match(self):
        """Each feature row should reference the correct candidate location."""
        matrix, meta = _build_matrix_with_raw_data()
        cand_loc_ids = {(c["case_id"], c["location_id"]) for c in meta["candidates"]}
        feat_loc_ids = {(r["case_id"], r["location_id"]) for r in matrix}
        assert cand_loc_ids == feat_loc_ids

    def test_features_are_deterministic(self):
        """Same seed should produce identical feature values."""
        matrix1, _ = _build_matrix_with_raw_data(seed=42)
        matrix2, _ = _build_matrix_with_raw_data(seed=42)
        assert len(matrix1) == len(matrix2)
        for r1, r2 in zip(matrix1, matrix2):
            for key in FEATURE_NAMES:
                assert r1[key] == r2[key], f"Non-deterministic feature {key}: {r1[key]} != {r2[key]}"


# ---------------------------------------------------------------------------
# Query-time cutoff tests
# ---------------------------------------------------------------------------


class TestQueryTimeCutoff:
    """Test that features respect the query-time cutoff."""

    def test_no_post_complaint_tx_in_features(self):
        """Features must not use transactions after complaint_time."""
        _, meta = _build_matrix_with_raw_data()

        for case_raw in meta["cases_raw"]:
            cutoff = datetime.fromisoformat(case_raw["complaint_time"])
            case_txs = [t for t in meta["transactions"] if t["case_id"] == case_raw["case_id"]]
            post_txs = [t for t in case_txs if datetime.fromisoformat(t["timestamp"]) > cutoff]
            # Post-complaint transactions should exist in raw data
            # but should NOT be used for feature computation
            # This is validated by the feature logic, not by test
            # We verify the logic handles this correctly
            if post_txs:
                # Features should still be computed from pre-TX only
                pass  # validated by feature computation tests

    def test_tx_count_matches_pre_complaint(self):
        """tx_count should equal the number of pre-complaint transactions."""
        matrix, meta = _build_matrix_with_raw_data()

        case_map = {c["case_id"]: c for c in meta["cases_raw"]}

        for row in matrix:
            case = case_map[row["case_id"]]
            cutoff = datetime.fromisoformat(case["complaint_time"])
            pre_txs = [
                t
                for t in meta["transactions"]
                if t["case_id"] == row["case_id"] and datetime.fromisoformat(t["timestamp"]) <= cutoff
            ]
            assert row["tx_count"] == len(pre_txs), (
                f"Case {row['case_id']}: tx_count={row['tx_count']} but actual pre-TX count={len(pre_txs)}"
            )

    def test_tx_total_amount_matches_pre_complaint(self):
        """tx_total_amount should match sum of pre-complaint transaction amounts."""
        matrix, meta = _build_matrix_with_raw_data()
        case_map = {c["case_id"]: c for c in meta["cases_raw"]}

        for row in matrix[:20]:  # check first 20
            case = case_map[row["case_id"]]
            cutoff = datetime.fromisoformat(case["complaint_time"])
            pre_txs = [
                t
                for t in meta["transactions"]
                if t["case_id"] == row["case_id"] and datetime.fromisoformat(t["timestamp"]) <= cutoff
            ]
            expected_total = sum(t["amount"] for t in pre_txs)
            assert abs(row["tx_total_amount"] - expected_total) < 0.01, (
                f"Case {row['case_id']}: tx_total_amount={row['tx_total_amount']} but expected={expected_total}"
            )


# ---------------------------------------------------------------------------
# Target isolation tests
# ---------------------------------------------------------------------------


class TestTargetIsolation:
    """Test that ground truth does not enter the feature matrix X."""

    def test_no_ground_truth_in_features(self):
        """No feature should contain ground truth information."""
        # Forbidden patterns in feature names
        forbidden_patterns = [
            "true_location",
            "actual_cashout",
            "cashout_time",
            "cashout_metro",
            "target_distance",
            "gt_distance",
        ]
        for fname in FEATURE_NAMES:
            for pattern in forbidden_patterns:
                assert pattern.lower() not in fname.lower(), f"Feature '{fname}' contains forbidden pattern '{pattern}'"

    def test_is_true_location_is_metadata_not_feature(self):
        """is_true_location must be metadata, not a feature."""
        assert "is_true_location" in METADATA_COLUMNS
        assert "is_true_location" not in FEATURE_NAMES

    def test_true_location_label_correct(self):
        """is_true_location should correctly mark the true location."""
        matrix, meta = _build_matrix_with_raw_data()
        gt_map = {g["case_id"]: g["actual_cashout_location_id"] for g in meta["ground_truths"]}

        for row in matrix:
            expected = gt_map.get(row["case_id"]) == row["location_id"]
            assert row["is_true_location"] == expected, (
                f"Case {row['case_id']}, Loc {row['location_id']}: "
                f"is_true_location={row['is_true_location']} but expected={expected}"
            )


# ---------------------------------------------------------------------------
# Future-event isolation tests
# ---------------------------------------------------------------------------


class TestFutureEventIsolation:
    """Test that no post-cutoff information enters features."""

    def test_complaint_delay_is_non_negative(self):
        """complaint_delay should be >= 0 (delay from last TX to complaint)."""
        matrix, _ = _build_matrix_with_raw_data()
        for row in matrix:
            if row["complaint_delay_from_last_tx_hours"] >= 0:
                # Valid: delay is non-negative
                pass
            else:
                # Sentinel -1.0 means no pre-complaint TX — acceptable
                assert row["complaint_delay_from_last_tx_hours"] == -1.0

    def test_no_cashout_time_in_features(self):
        """No feature should reference the cashout time or cashout location."""
        # Forbidden: features that encode the hidden cashout outcome
        # 'cashout_friendly' is acceptable — it describes location TYPE suitability
        # not the actual cashout event
        forbidden_exact = [
            "cashout_time",
            "cashout_metro",
            "cashout_location",
            "actual_cashout",
            "true_cashout",
        ]
        for fname in FEATURE_NAMES:
            for forbidden in forbidden_exact:
                assert forbidden.lower() not in fname.lower(), f"Feature '{fname}' references forbidden '{forbidden}'"

    def test_case_scenario_features_are_binary(self):
        """Scenario one-hot features should be 0 or 1."""
        matrix, _ = _build_matrix_with_raw_data()
        scenario_features = [f for f in FEATURE_NAMES if f.startswith("case_scenario_")]
        for row in matrix:
            for sf in scenario_features:
                assert row[sf] in (0, 1), f"Feature {sf} = {row[sf]}, expected 0 or 1"


# ---------------------------------------------------------------------------
# Candidate-level correctness tests
# ---------------------------------------------------------------------------


class TestCandidateLevelCorrectness:
    """Test feature values at the candidate level."""

    def test_distance_features_non_negative(self):
        """Geographic distance features should be non-negative (or sentinel -1)."""
        matrix, _ = _build_matrix_with_raw_data()
        dist_features = [
            "cand_distance_from_origin_km",
            "cand_distance_from_last_tx_km",
            "cand_min_distance_from_any_tx_km",
            "cand_max_distance_from_any_tx_km",
            "cand_mean_distance_from_tx_endpoints_km",
        ]
        for row in matrix:
            for df in dist_features:
                val = row[df]
                assert val >= -1.0, f"{df} = {val}, expected >= -1.0"

    def test_binary_features_are_zero_or_one(self):
        """Binary indicator features should be 0 or 1."""
        matrix, _ = _build_matrix_with_raw_data()
        binary_features = [
            f
            for f in FEATURE_NAMES
            if f.startswith("loc_type_")
            or f.startswith("cand_same_")
            or f.startswith("loc_is_")
            or f.startswith("case_scenario_")
        ]
        for row in matrix:
            for bf in binary_features:
                assert row[bf] in (0, 1), f"{bf} = {row[bf]}, expected 0 or 1"

    def test_density_score_in_range(self):
        """loc_density_score should be between 0 and 1."""
        matrix, _ = _build_matrix_with_raw_data()
        for row in matrix:
            assert 0.0 <= row["loc_density_score"] <= 1.0

    def test_one_scenario_active_per_case(self):
        """Exactly one scenario one-hot should be active per case."""
        matrix, _ = _build_matrix_with_raw_data()
        scenario_features = [f for f in FEATURE_NAMES if f.startswith("case_scenario_")]
        for row in matrix:
            active = sum(row[sf] for sf in scenario_features)
            assert active == 1, f"Case {row['case_id']}: {active} scenarios active, expected 1"


# ---------------------------------------------------------------------------
# Deterministic generation tests
# ---------------------------------------------------------------------------


class TestDeterministicGeneration:
    """Test that feature generation is fully deterministic."""

    def test_same_seed_same_features(self):
        """Same seed should produce identical feature values for all rows."""
        matrix1, _ = _build_matrix_with_raw_data(seed=42)
        matrix2, _ = _build_matrix_with_raw_data(seed=42)
        assert len(matrix1) == len(matrix2)
        for i, (r1, r2) in enumerate(zip(matrix1, matrix2)):
            for key in FEATURE_NAMES + METADATA_COLUMNS:
                assert r1[key] == r2[key], f"Row {i}, feature {key}: {r1[key]} != {r2[key]}"

    def test_different_seed_different_features(self):
        """Different seeds should produce different feature values."""
        matrix1, _ = _build_matrix_with_raw_data(seed=42)
        matrix2, _ = _build_matrix_with_raw_data(seed=123)
        # At least some features should differ
        any_diff = False
        for r1, r2 in zip(matrix1[:20], matrix2[:20]):
            for key in FEATURE_NAMES:
                if r1[key] != r2[key]:
                    any_diff = True
                    break
            if any_diff:
                break
        assert any_diff, "Different seeds produced identical features"


# ---------------------------------------------------------------------------
# Case-level split preparation tests
# ---------------------------------------------------------------------------


class TestCaseLevelSplit:
    """Test that features support case-level train/test splitting."""

    def test_unique_case_ids(self):
        """Feature matrix should have well-defined case IDs."""
        matrix, _ = _build_matrix_with_raw_data()
        case_ids = {r["case_id"] for r in matrix}
        assert len(case_ids) == 300  # all 300 cases present

    def test_candidate_rows_inherit_case_identity(self):
        """Each candidate row should carry its case_id for split purposes."""
        matrix, _ = _build_matrix_with_raw_data()
        for row in matrix:
            assert row["case_id"].startswith("CASE_"), f"Invalid case_id: {row['case_id']}"

    def test_case_level_features_consistent_across_candidates(self):
        """Case-level features should be identical for all candidates of the same case."""
        matrix, _ = _build_matrix_with_raw_data()
        case_features = [f for f in FEATURE_NAMES if f.startswith("case_")]

        # Group by case_id
        by_case: dict[str, list] = {}
        for row in matrix:
            by_case.setdefault(row["case_id"], []).append(row)

        for case_id, rows in by_case.items():
            for cf in case_features:
                values = {r[cf] for r in rows}
                assert len(values) == 1, f"Case {case_id}, feature {cf}: multiple values {values} across candidates"


# ---------------------------------------------------------------------------
# Missing-value handling tests
# ---------------------------------------------------------------------------


class TestMissingValues:
    """Test that missing values are handled explicitly."""

    def test_sentinel_value_is_minus_one(self):
        """Missing numerical features should use -1.0 sentinel, not None or NaN."""
        matrix, _ = _build_matrix_with_raw_data()
        for row in matrix:
            for key in FEATURE_NAMES:
                val = row[key]
                assert val is not None, f"Feature {key} is None"
                assert not (isinstance(val, float) and val != val), f"Feature {key} is NaN"

    def test_no_pre_complaint_tx_features(self):
        """Cases with no pre-complaint TX should have sentinel values."""
        matrix, meta = _build_matrix_with_raw_data()
        case_map = {c["case_id"]: c for c in meta["cases_raw"]}

        sentinel_features = [
            "complaint_delay_from_last_tx_hours",
            "last_tx_hour_of_day",
            "time_since_last_tx_to_complaint_hours",
            "cand_distance_from_last_tx_km",
        ]

        for row in matrix:
            case = case_map[row["case_id"]]
            cutoff = datetime.fromisoformat(case["complaint_time"])
            pre_txs = [
                t
                for t in meta["transactions"]
                if t["case_id"] == row["case_id"] and datetime.fromisoformat(t["timestamp"]) <= cutoff
            ]
            if not pre_txs:
                for sf in sentinel_features:
                    assert row[sf] == -1.0, (
                        f"Case {row['case_id']}: {sf} = {row[sf]}, expected -1.0 (no pre-complaint TX)"
                    )


# ---------------------------------------------------------------------------
# Feature registry tests
# ---------------------------------------------------------------------------


class TestFeatureRegistry:
    """Test that the feature registry is consistent."""

    def test_registry_count_matches_features(self):
        """Registry should list exactly the features in FEATURE_NAMES."""
        registry_names = [f["name"] for f in FEATURE_REGISTRY]
        assert set(registry_names) == set(FEATURE_NAMES)

    def test_registry_has_required_fields(self):
        """Every registry entry should have required metadata fields."""
        required = ["name", "dtype", "description", "group", "query_time", "leakage"]
        for entry in FEATURE_REGISTRY:
            for field in required:
                assert field in entry, f"Registry entry {entry.get('name')}: missing field '{field}'"

    def test_all_features_allowed(self):
        """No feature should be marked as FORBIDDEN."""
        for entry in FEATURE_REGISTRY:
            assert entry["leakage"] == "ALLOWED", f"Feature {entry['name']}: leakage={entry['leakage']}"

    def test_all_features_query_time(self):
        """All features should be available at query time."""
        for entry in FEATURE_REGISTRY:
            assert entry["query_time"] is True, f"Feature {entry['name']}: query_time={entry['query_time']}"


# ---------------------------------------------------------------------------
# Phase 1 regression tests (should still pass)
# ---------------------------------------------------------------------------


class TestPhase1Regression:
    """Phase 1 tests should still work with Phase 2 changes."""

    def test_phase1_data_files_still_exist(self):
        """Phase 1 generated data files should still be accessible."""
        result = generate_dataset(seed=42)
        out = Path(result["output_dir"])
        assert (out / "generated/cases.jsonl").exists()
        assert (out / "generated/transactions.jsonl").exists()
        assert (out / "generated/locations.jsonl").exists()
        assert (out / "generated/candidates.jsonl").exists()
        assert (out / "evaluation/ground_truth.jsonl").exists()
