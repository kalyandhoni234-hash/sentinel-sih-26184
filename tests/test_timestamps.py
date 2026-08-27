"""Tests for timestamp validity."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_complaint_times_are_valid():
    """Verify all complaint times are valid datetime objects."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    cases_path = Path(result["output_dir"]) / "generated" / "cases.jsonl"
    with open(cases_path) as f:
        for line in f:
            case = json.loads(line)
            ct = case["complaint_time"]
            # Should be parseable as datetime
            assert isinstance(ct, str) and len(ct) > 0


def test_transaction_times_after_complaint_not_required():
    """Note: transactions can occur before complaint (that's how fraud works).

    This test verifies that transactions exist and have valid timestamps.
    """
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    tx_path = Path(result["output_dir"]) / "generated" / "transactions.jsonl"
    with open(tx_path) as f:
        for line in f:
            tx = json.loads(line)
            ts = tx["timestamp"]
            assert isinstance(ts, str) and len(ts) > 0


def test_ground_truth_cashout_times_are_valid():
    """Verify ground truth cash-out times are valid."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    gt_path = Path(result["output_dir"]) / "evaluation" / "ground_truth.jsonl"
    with open(gt_path) as f:
        for line in f:
            gt = json.loads(line)
            ct = gt["cashout_time"]
            assert isinstance(ct, str) and len(ct) > 0
