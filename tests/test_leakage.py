"""Tests for data leakage prevention."""

from __future__ import annotations

from src.data_generation.generator import generate_dataset
from src.data_generation.leakage import LeakageChecker


def test_no_leakage_in_generated_data():
    """Run the full leakage checker on generated data."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    base = Path(result["output_dir"])

    # Load cases
    cases = []
    with open(base / "generated" / "cases.jsonl") as f:
        for line in f:
            cases.append(json.loads(line))

    # Load transactions
    transactions = []
    with open(base / "generated" / "transactions.jsonl") as f:
        for line in f:
            transactions.append(json.loads(line))

    # Load locations
    locations = []
    with open(base / "generated" / "locations.jsonl") as f:
        for line in f:
            locations.append(json.loads(line))

    # Load candidates
    candidates = []
    with open(base / "generated" / "candidates.jsonl") as f:
        for line in f:
            candidates.append(json.loads(line))

    # Load ground truths
    ground_truths = []
    with open(base / "evaluation" / "ground_truth.jsonl") as f:
        for line in f:
            ground_truths.append(json.loads(line))

    # Convert to Pydantic models for the checker
    from src.data_generation.schema import (
        Account, Case, Candidate, GroundTruth, Location, Transaction,
        FraudScenario, AccountRole, TransactionType, LocationType,
    )
    from datetime import datetime

    case_models = []
    for c in cases:
        case_models.append(Case(
            case_id=c["case_id"],
            complaint_time=datetime.fromisoformat(c["complaint_time"].replace("Z", "+00:00")),
            fraud_scenario=FraudScenario(c["fraud_scenario"]),
            reported_amount=c["reported_amount"],
            origin_metro=c["origin_metro"],
            origin_location_id=c["origin_location_id"],
            num_accounts_involved=c["num_accounts_involved"],
            num_transactions=c["num_transactions"],
        ))

    tx_models = []
    for t in transactions:
        tx_models.append(Transaction(
            transaction_id=t["transaction_id"],
            case_id=t["case_id"],
            sender_account_id=t["sender_account_id"],
            receiver_account_id=t["receiver_account_id"],
            timestamp=datetime.fromisoformat(t["timestamp"].replace("Z", "+00:00")),
            amount=t["amount"],
            transaction_type=TransactionType(t["transaction_type"]),
            sequence_number=t["sequence_number"],
            sender_metro=t.get("sender_metro", ""),
            receiver_metro=t.get("receiver_metro", ""),
        ))

    loc_models = []
    for l in locations:
        loc_models.append(Location(
            location_id=l["location_id"],
            latitude=l["latitude"],
            longitude=l["longitude"],
            metro=l["metro"],
            region=l["region"],
            location_type=LocationType(l["location_type"]),
            density_score=l["density_score"],
            cash_out_attractiveness=l["cash_out_attractiveness"],
            is_high_surveillance=l.get("is_high_surveillance", False),
        ))

    cand_models = []
    for c in candidates:
        cand_models.append(Candidate(
            case_id=c["case_id"],
            location_id=c["location_id"],
            distance_from_origin_km=c["distance_from_origin_km"],
            scenario_affinity=c["scenario_affinity"],
            transaction_proximity_score=c["transaction_proximity_score"],
            temporal_plausibility=c["temporal_plausibility"],
            density_score=c["density_score"],
        ))

    gt_models = []
    for g in ground_truths:
        gt_models.append(GroundTruth(
            case_id=g["case_id"],
            actual_cashout_location_id=g["actual_cashout_location_id"],
            cashout_time=datetime.fromisoformat(g["cashout_time"].replace("Z", "+00:00")),
            cashout_metro=g["cashout_metro"],
            scenario_used=FraudScenario(g["scenario_used"]),
            selection_probability=g["selection_probability"],
        ))

    checker = LeakageChecker(
        cases=case_models,
        transactions=tx_models,
        locations=loc_models,
        candidates=cand_models,
        ground_truths=gt_models,
    )
    violations = checker.check_all()

    assert len(violations) == 0, f"Leakage violations found: {violations}"


def test_candidate_does_not_contain_is_true_location():
    """Verify model-visible candidates don't have is_true_location."""
    result = generate_dataset(seed=42)

    from pathlib import Path
    import json

    cands_path = Path(result["output_dir"]) / "generated" / "candidates.jsonl"
    with open(cands_path) as f:
        for line in f:
            c = json.loads(line)
            assert "is_true_location" not in c, (
                "Model-visible candidate contains is_true_location field"
            )


def test_ground_truth_only_in_evaluation_dir():
    """Verify ground truth files are only in the evaluation directory."""
    result = generate_dataset(seed=42)

    from pathlib import Path

    eval_dir = Path(result["output_dir"]) / "evaluation"
    gen_dir = Path(result["output_dir"]) / "generated"

    # Evaluation dir should have ground truth
    gt_files = list(eval_dir.glob("*ground_truth*"))
    assert len(gt_files) > 0, "No ground truth files in evaluation directory"

    # Generated dir should NOT have ground truth
    gen_gt_files = list(gen_dir.glob("*ground_truth*"))
    assert len(gen_gt_files) == 0, (
        "Ground truth file found in generated directory (should only be in evaluation)"
    )
