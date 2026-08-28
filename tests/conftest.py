"""Shared test fixtures for SENTINEL test suite.

Provides session-scoped fixtures to avoid regenerating data for each test,
fixing Windows file locking issues and improving test performance.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import pytest

from src.data_generation.generator import generate_dataset


@pytest.fixture(scope="session")
def generated_data() -> dict[str, Any]:
    """Generate synthetic data once per test session.

    Uses a temporary directory to avoid file locking issues on Windows.
    Returns the generation result dict with output_dir pointing to temp dir.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        result = generate_dataset(output_dir=tmpdir, seed=42)
        yield result


@pytest.fixture(scope="session")
def cases(generated_data) -> list[dict]:
    """Load cases from generated data."""
    return _load_jsonl(generated_data["output_dir"], "generated/cases.jsonl")


@pytest.fixture(scope="session")
def accounts(generated_data) -> list[dict]:
    """Load accounts from generated data."""
    return _load_jsonl(generated_data["output_dir"], "generated/accounts.jsonl")


@pytest.fixture(scope="session")
def transactions(generated_data) -> list[dict]:
    """Load transactions from generated data."""
    return _load_jsonl(generated_data["output_dir"], "generated/transactions.jsonl")


@pytest.fixture(scope="session")
def locations(generated_data) -> list[dict]:
    """Load locations from generated data."""
    return _load_jsonl(generated_data["output_dir"], "generated/locations.jsonl")


@pytest.fixture(scope="session")
def candidates(generated_data) -> list[dict]:
    """Load candidates from generated data."""
    return _load_jsonl(generated_data["output_dir"], "generated/candidates.jsonl")


@pytest.fixture(scope="session")
def ground_truths(generated_data) -> list[dict]:
    """Load ground truths from generated data (evaluation directory)."""
    return _load_jsonl(generated_data["output_dir"], "evaluation/ground_truth.jsonl")


@pytest.fixture(scope="session")
def manifest(generated_data) -> dict:
    """Load manifest from generated data."""
    manifest_files = list(Path(generated_data["output_dir"]).glob("manifests/*.json"))
    if manifest_files:
        with open(manifest_files[0]) as f:
            return json.load(f)
    return {}


def _load_jsonl(output_dir: str, relative_path: str) -> list[dict]:
    """Load JSONL file from output directory."""
    path = Path(output_dir) / relative_path
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


# For tests that need different seeds, they can use this fixture
@pytest.fixture
def generate_dataset_fn():
    """Return the generate_dataset function for tests needing custom seeds."""
    return generate_dataset
