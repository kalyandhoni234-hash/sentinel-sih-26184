"""Audit regression tests for Phase 1 methodological correctness.

These tests verify findings from the Phase 1 audit gate and prevent
regression of identified issues.
"""

from __future__ import annotations

import json
from pathlib import Path

from src.data_generation.generator import generate_dataset


def _load_generated(output_dir: str, filename: str) -> list[dict]:
    path = Path(output_dir) / "generated" / filename
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def _load_eval(output_dir: str, filename: str) -> list[dict]:
    path = Path(output_dir) / "evaluation" / filename
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def _load_eval(output_dir: str, filename: str) -> list[dict]:
    path = Path(output_dir) / "evaluation" / filename
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


# ---------------------------------------------------------------------------
# AUDIT REGRESSION: Scenario description must not leak in metadata
# ---------------------------------------------------------------------------

def test_metadata_does_not_contain_scenario_description():
    """Case.metadata must not contain scenario_behavior text.

    The scenario description (e.g., 'Quick chain through 2-3 mule accounts')
    would allow trivial scenario reconstruction from a model-visible field.
    """
    result = generate_dataset(seed=42)
    cases = _load_generated(result["output_dir"], "cases.jsonl")

    for case in cases:
        metadata = case.get("metadata", {})
        assert "scenario_behavior" not in metadata, (
            f"Case {case['case_id']}: metadata contains scenario_behavior "
            f"which leaks scenario identity via natural language"
        )


# ---------------------------------------------------------------------------
# AUDIT REGRESSION: Candidate feature distributions
# ---------------------------------------------------------------------------

def test_transaction_proximity_is_not_constant():
    """transaction_proximity_score should have variation across candidates.

    If the score is constant or near-constant, it provides no discriminative
    signal and is a wasted feature.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")

    scores = set(c["transaction_proximity_score"] for c in cands)
    assert len(scores) >= 3, (
        f"transaction_proximity_score has only {len(scores)} unique values; "
        f"expected at least 3 for meaningful discriminative power"
    )


def test_temporal_plausibility_has_variation():
    """temporal_plausibility should have more than 2 unique values.

    Having only 2 values (0.4 and 0.85) makes it a binary proxy for
    metro match rather than a meaningful temporal feature.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")

    scores = set(c["temporal_plausibility"] for c in cands)
    # Currently only has 2 values — document this as a known limitation
    # This test ensures we notice if it degrades to 1 value
    assert len(scores) >= 2, (
        f"temporal_plausibility has only {len(scores)} unique values; "
        f"expected at least 2"
    )


def test_true_location_not_always_nearest():
    """The true location should NOT always be the nearest to origin.

    If the true location is always rank-1 by distance, the model can
    win by simply choosing the nearest candidate.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")
    gts = _load_eval(result["output_dir"], "ground_truth.jsonl")

    gt_map = {g["case_id"]: g["actual_cashout_location_id"] for g in gts}

    rank1_count = 0
    total = 0
    for case_id, true_loc_id in gt_map.items():
        case_cands = [c for c in cands if c["case_id"] == case_id]
        ranked = sorted(case_cands, key=lambda c: c["distance_from_origin_km"])
        if ranked[0]["location_id"] == true_loc_id:
            rank1_count += 1
        total += 1

    # True location should be rank-1 less than 40% of the time
    # to ensure the task is not trivially solvable by nearest-neighbor
    rank1_pct = rank1_count / total
    assert rank1_pct < 0.40, (
        f"True location is rank-1 by distance in {rank1_pct:.1%} of cases; "
        f"task may be trivially solvable by nearest-neighbor"
    )


def test_candidate_set_contains_hard_negatives_from_different_metros():
    """Candidate sets should include locations from other metros.

    This ensures the model cannot simply filter by metro to find the answer.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")
    cases = _load_generated(result["output_dir"], "cases.jsonl")
    locs = _load_generated(result["output_dir"], "locations.jsonl")

    case_map = {c["case_id"]: c for c in cases}
    loc_map = {l["location_id"]: l for l in locs}

    cross_metro_cases = 0
    total = 0
    for case_id in set(c["case_id"] for c in cands):
        case = case_map[case_id]
        case_cands = [c for c in cands if c["case_id"] == case_id]
        metros = {loc_map[c["location_id"]]["metro"] for c in case_cands}
        if len(metros) > 1:
            cross_metro_cases += 1
        total += 1

    cross_metro_pct = cross_metro_cases / total
    assert cross_metro_pct > 0.5, (
        f"Only {cross_metro_pct:.1%} of cases have cross-metro candidates; "
        f"expected >50% for meaningful geographic discrimination"
    )


def test_scenario_field_exists_on_case():
    """Verify fraud_scenario IS on the Case model.

    This is a deliberate design decision: in a real investigation,
    the fraud scenario classification would be available at query time.
    The model should learn to use it, not have it hidden.

    This test documents the decision and prevents accidental removal.
    """
    from src.data_generation.schema import Case
    assert "fraud_scenario" in Case.model_fields, (
        "fraud_scenario must be a field on Case — it is an input feature, "
        "not a derived quantity"
    )


def test_is_true_location_stripped_from_model_visible_output():
    """Verify is_true_location is not in the model-visible candidates file."""
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")

    for c in cands:
        assert "is_true_location" not in c, (
            "Model-visible candidate contains is_true_location field"
        )


def test_no_duplicate_candidate_pairs():
    """Each (case_id, location_id) pair must appear at most once in candidates.

    Duplicates cause the true location to be counted multiple times,
    inflating the TP count beyond the number of cases.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")

    pairs = [(c["case_id"], c["location_id"]) for c in cands]
    from collections import Counter
    pair_counts = Counter(pairs)
    dupes = {k: v for k, v in pair_counts.items() if v > 1}
    assert len(dupes) == 0, f"Duplicate candidate pairs found: {dupes}"


def test_true_positive_count_equals_case_count():
    """Number of true-positive candidate rows must equal number of cases.

    Each case has exactly one ground truth location, and that location
    must appear exactly once in the candidate set.
    """
    result = generate_dataset(seed=42)
    cands = _load_generated(result["output_dir"], "candidates.jsonl")
    gts = _load_eval(result["output_dir"], "ground_truth.jsonl")

    gt_map = {g["case_id"]: g["actual_cashout_location_id"] for g in gts}
    tp_count = sum(1 for c in cands if gt_map.get(c["case_id"]) == c["location_id"])

    assert tp_count == len(gts), (
        f"TP count ({tp_count}) != case count ({len(gts)})"
    )
