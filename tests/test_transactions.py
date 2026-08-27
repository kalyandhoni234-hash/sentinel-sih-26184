"""Tests for transaction chain generation."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset


def test_transaction_chains_are_ordered():
    """Verify transactions within each case are sequence-ordered."""
    result = generate_dataset(seed=42)

    # Load generated transactions
    import json
    from pathlib import Path

    tx_path = Path(result["output_dir"]) / "generated" / "transactions.jsonl"
    transactions = []
    with open(tx_path) as f:
        for line in f:
            transactions.append(json.loads(line))

    # Group by case
    case_txs = {}
    for tx in transactions:
        cid = tx["case_id"]
        case_txs.setdefault(cid, []).append(tx)

    for cid, txs in case_txs.items():
        sorted_txs = sorted(txs, key=lambda t: t["sequence_number"])
        for i, tx in enumerate(sorted_txs):
            assert tx["sequence_number"] == i + 1, f"Case {cid}: transaction sequence gap at position {i + 1}"


def test_transaction_chains_have_progressive_timing():
    """Verify transaction timestamps progress forward within each chain."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    tx_path = Path(result["output_dir"]) / "generated" / "transactions.jsonl"
    transactions = []
    with open(tx_path) as f:
        for line in f:
            transactions.append(json.loads(line))

    case_txs = {}
    for tx in transactions:
        cid = tx["case_id"]
        case_txs.setdefault(cid, []).append(tx)

    for cid, txs in case_txs.items():
        sorted_txs = sorted(txs, key=lambda t: t["sequence_number"])
        for i in range(1, len(sorted_txs)):
            prev_time = sorted_txs[i - 1]["timestamp"]
            curr_time = sorted_txs[i]["timestamp"]
            assert curr_time >= prev_time, f"Case {cid}: transaction {i + 1} timestamp before transaction {i}"


def test_transaction_amounts_are_positive():
    """Verify all transaction amounts are positive."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    tx_path = Path(result["output_dir"]) / "generated" / "transactions.jsonl"
    with open(tx_path) as f:
        for line in f:
            tx = json.loads(line)
            assert tx["amount"] > 0, f"Transaction {tx['transaction_id']} has non-positive amount"


def test_each_case_has_transactions():
    """Verify every case has at least one transaction."""
    result = generate_dataset(seed=42)

    import json
    from pathlib import Path

    cases_path = Path(result["output_dir"]) / "generated" / "cases.jsonl"
    tx_path = Path(result["output_dir"]) / "generated" / "transactions.jsonl"

    case_ids = set()
    with open(cases_path) as f:
        for line in f:
            case_ids.add(json.loads(line)["case_id"])

    tx_case_ids = set()
    with open(tx_path) as f:
        for line in f:
            tx_case_ids.add(json.loads(line)["case_id"])

    assert case_ids == tx_case_ids, f"Cases without transactions: {case_ids - tx_case_ids}"
