"""Tests for generator reproducibility."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_same_seed_produces_same_output():
    """Verify that the same seed produces identical datasets."""
    result1 = generate_dataset(seed=42)
    result2 = generate_dataset(seed=42)

    assert result1["case_count"] == result2["case_count"]
    assert result1["transaction_count"] == result2["transaction_count"]
    assert result1["location_count"] == result2["location_count"]
    assert result1["candidate_count"] == result2["candidate_count"]
    assert result1["ground_truth_count"] == result2["ground_truth_count"]
    assert result1["seed"] == result2["seed"]


def test_different_seed_produces_different_output():
    """Verify that different seeds produce different datasets."""
    result1 = generate_dataset(seed=42)
    result2 = generate_dataset(seed=123)

    # With different seeds, at least case counts or scenarios should differ
    # (very unlikely to be identical with different seeds)
    assert (
        result1["case_count"] != result2["case_count"]
        or result1["scenario_distribution"] != result2["scenario_distribution"]
        or result1["transaction_count"] != result2["transaction_count"]
    )


def test_manifest_contains_seed():
    """Verify the manifest records the seed used."""
    result = generate_dataset(seed=99)
    assert result["seed"] == 99
