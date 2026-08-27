"""Tests for candidate set generation."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_every_case_has_candidates():
    """Verify every case has at least 5 candidates."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    cases_path = Path(result["output_dir"]) / "generated" / "cases.jsonl"
    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"

    case_ids = set()
    with open(cases_path) as f:
        for line in f:
            case_ids.add(json.loads(line)["case_id"])

    cand_counts = {}
    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            cid = c["case_id"]
            cand_counts[cid] = cand_counts.get(cid, 0) + 1

    for cid in case_ids:
        assert cid in cand_counts, f"Case {cid} has no candidates"
        assert cand_counts[cid] >= 5, (
            f"Case {cid} has only {cand_counts[cid]} candidates (minimum 5)"
        )


def test_candidates_reference_valid_locations():
    """Verify all candidates reference existing locations."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    locs_path = Path(result["output_dir"]) / "generated" / "locations.jsonl"
    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"

    location_ids = set()
    with open(locs_path) as f:
        for line in f:
            location_ids.add(json.loads(line)["location_id"])

    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            assert c["location_id"] in location_ids, (
                f"Candidate references non-existent location {c['location_id']}"
            )


def test_candidate_features_are_in_range():
    """Verify all candidate feature values are in valid ranges."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"
    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            assert 0.0 <= c["scenario_affinity"] <= 1.0
            assert 0.0 <= c["transaction_proximity_score"] <= 1.0
            assert 0.0 <= c["temporal_plausibility"] <= 1.0
            assert 0.0 <= c["density_score"] <= 1.0
            assert c["distance_from_origin_km"] >= 0
