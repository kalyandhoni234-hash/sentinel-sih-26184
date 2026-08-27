"""Tests for ground truth generation and isolation."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_ground_truth_exists_for_every_case():
    """Verify every case has a ground truth entry."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

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

    assert case_ids == gt_case_ids, (
        f"Cases without ground truth: {case_ids - gt_case_ids}"
    )


def test_true_location_in_candidate_set():
    """Verify every ground truth location appears in the candidate set."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

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

    for cid, true_loc_id in gt_map.items():
        assert cid in cand_case_locations, f"Case {cid} has no candidates"
        assert true_loc_id in cand_case_locations[cid], (
            f"Case {cid}: true location {true_loc_id} not in candidate set"
        )


def test_ground_truth_is_not_in_model_visible_data():
    """Verify ground truth fields don't appear in model-visible candidates."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"
    forbidden_fields = {"actual_cashout_location_id", "cashout_time", "cashout_metro"}

    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            for field in forbidden_fields:
                assert field not in c, (
                    f"Ground truth field '{field}' found in model-visible candidate"
                )
