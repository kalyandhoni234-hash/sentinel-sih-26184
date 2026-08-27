"""Tests for geographic validity."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_locations_have_valid_coordinates():
    """Verify all locations have valid lat/lon coordinates."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    locs_path = Path(result["output_dir"]) / "generated" / "locations.jsonl"
    with open(locs_path) as f:
        for line in f:
            loc = json.loads(line)
            assert -90 <= loc["latitude"] <= 90, (
                f"Location {loc['location_id']}: invalid latitude {loc['latitude']}"
            )
            assert -180 <= loc["longitude"] <= 180, (
                f"Location {loc['location_id']}: invalid longitude {loc['longitude']}"
            )


def test_locations_are_in_india_bounds():
    """Verify locations are within approximate India bounds (synthetic)."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    locs_path = Path(result["output_dir"]) / "generated" / "locations.jsonl"
    with open(locs_path) as f:
        for line in f:
            loc = json.loads(line)
            assert 6.0 <= loc["latitude"] <= 38.0, (
                f"Location {loc['location_id']}: latitude {loc['latitude']} outside India bounds"
            )
            assert 68.0 <= loc["longitude"] <= 98.0, (
                f"Location {loc['location_id']}: longitude {loc['longitude']} outside India bounds"
            )


def test_all_metros_represented():
    """Verify all configured metros have locations."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    locs_path = Path(result["output_dir"]) / "generated" / "locations.jsonl"
    metros = set()
    with open(locs_path) as f:
        for line in f:
            metros.add(json.loads(line)["metro"])

    expected_metros = {"Delhi NCR", "Mumbai", "Kolkata", "Chennai", "Jaipur"}
    assert metros == expected_metros, (
        f"Expected metros {expected_metros}, got {metros}"
    )


def test_candidate_distances_are_non_negative():
    """Verify all candidate distances are non-negative."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"
    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            assert c["distance_from_origin_km"] >= 0, (
                f"Candidate has negative distance: {c['distance_from_origin_km']}"
            )
