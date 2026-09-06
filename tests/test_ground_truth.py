"""Tests for ground truth generation and isolation."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_ground_truth_exists_for_every_case():
    """Verify every case has a ground truth entry."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    cases_path = Path(result["output_dir"]) / "generated" / "cases.jsonl"
    gt_path = Path(result["output_dir"]) / "evaluation" / "ground_truth.jsonl"

    case_ids = set()
    with open(cases_path) as f:
        for line in f:
            case_ids.add(json.loads(line)["case_id"])

    gt_case_ids = set()
    with open(gt_path) as f:
        for line in f:
            gt_case_ids.add(json.loads(line)["case_id"])

    assert case_ids == gt_case_ids, f"Cases without ground truth: {case_ids - gt_case_ids}"


def test_true_location_in_candidate_set():
    """Verify every ground truth location appears in the candidate set WHEN
    it happens to be sampled by the evidence-based candidate generation.

    NOTE: After the P0 audit fix, candidate generation is target-independent,
    so the true location may or may not be in the candidate set. When it IS
    in the set, the is_true_location flag (carried in memory, stripped from
    model-visible output) must be True.
    """
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    gt_path = Path(result["output_dir"]) / "evaluation" / "ground_truth.jsonl"
    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"

    gt_map = {}
    with open(gt_path) as f:
        for line in f:
            gt = json.loads(line)
            gt_map[gt["case_id"]] = gt["actual_cashout_location_id"]

    cand_case_locations = {}
    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            cand_case_locations.setdefault(c["case_id"], set()).add(c["location_id"])

    # Every case must have candidates
    for cid in gt_map:
        assert cid in cand_case_locations, f"Case {cid} has no candidates"

    # When the true location happens to be in the candidate set, the
    # is_true_location flag must have been set correctly. We re-load the
    # ground truth + candidate dicts (with the flag) for this check.
    from src.data_generation.candidates import label_candidates_with_ground_truth
    from src.data_generation.schema import Candidate

    cands_raw = []
    with open(cands_path) as f:
        for line in f:
            d = json.loads(line)
            cands_raw.append(
                Candidate(
                    case_id=d["case_id"],
                    location_id=d["location_id"],
                    distance_from_origin_km=d["distance_from_origin_km"],
                    scenario_affinity=d["scenario_affinity"],
                    transaction_proximity_score=d["transaction_proximity_score"],
                    temporal_plausibility=d["temporal_plausibility"],
                    density_score=d["density_score"],
                    is_true_location=False,
                )
            )
    label_candidates_with_ground_truth(cands_raw, gt_map)

    for cand in cands_raw:
        if cand.is_true_location:
            assert cand.location_id == gt_map.get(cand.case_id), (
                f"Candidate for {cand.case_id} marked true but doesn't match ground truth"
            )


def test_ground_truth_is_not_in_model_visible_data():
    """Verify ground truth fields don't appear in model-visible candidates."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"
    forbidden_fields = {"actual_cashout_location_id", "cashout_time", "cashout_metro"}

    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            for field in forbidden_fields:
                assert field not in c, f"Ground truth field '{field}' found in model-visible candidate"
