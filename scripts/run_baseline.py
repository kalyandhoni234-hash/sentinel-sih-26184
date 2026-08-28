"""CLI entry point for running the SENTINEL baseline evaluation.

Usage:
    python scripts/run_baseline.py [--seed SEED] [--output DIR]

This script:
1. Generates synthetic data (or uses existing)
2. Builds the feature matrix
3. Splits cases into train/test (80/20)
4. Runs the weighted baseline scorer on test cases
5. Evaluates ranking quality against ground truth
6. Prints results and saves them to docs/
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_generation.features import build_feature_matrix, get_feature_names
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario
from src.modeling.baseline import (
    FEATURE_GROUPS,
    GROUP_WEIGHTS,
    compute_baseline_scores,
    explain_candidate,
)
from src.modeling.evaluation import (
    evaluate_by_scenario,
    evaluate_rankings,
    print_evaluation_summary,
)


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def main() -> None:
    """Run baseline evaluation."""
    parser = argparse.ArgumentParser(description="SENTINEL Baseline Evaluation")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output", type=str, default=None, help="Output directory for generated data")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")

    args = parser.parse_args()

    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Step 1: Generate or load data
    with tempfile.TemporaryDirectory() as tmpdir:
        result = generate_dataset(seed=args.seed, output_dir=tmpdir)
        out = Path(result["output_dir"])

        cases_raw = _load_jsonl(out / "generated/cases.jsonl")
        candidates = _load_jsonl(out / "generated/candidates.jsonl")
        transactions = _load_jsonl(out / "generated/transactions.jsonl")
        locations = _load_jsonl(out / "generated/locations.jsonl")
        ground_truths = _load_jsonl(out / "evaluation/ground_truth.jsonl")

    # Step 2: Build Case objects
    case_objects = []
    for c in cases_raw:
        case_objects.append(
            Case(
                case_id=c["case_id"],
                complaint_time=datetime.fromisoformat(c["complaint_time"]),
                fraud_scenario=FraudScenario(c["fraud_scenario"]),
                reported_amount=c["reported_amount"],
                origin_metro=c["origin_metro"],
                origin_location_id=c["origin_location_id"],
                num_accounts_involved=c["num_accounts_involved"],
                num_transactions=c["num_transactions"],
            )
        )

    # Step 3: Build feature matrix
    matrix = build_feature_matrix(
        cases=case_objects,
        candidates=candidates,
        transactions=transactions,
        locations=locations,
        ground_truths=ground_truths,
    )

    # Step 4: Case-level train/test split (80/20)
    case_ids = sorted({r["case_id"] for r in matrix})
    split_idx = int(len(case_ids) * 0.8)
    train_case_ids = set(case_ids[:split_idx])
    test_case_ids = set(case_ids[split_idx:])

    train_rows = [r for r in matrix if r["case_id"] in train_case_ids]
    test_rows = [r for r in matrix if r["case_id"] in test_case_ids]

    test_ground_truths = [g for g in ground_truths if g["case_id"] in test_case_ids]

    # Step 5: Run baseline scorer on test set
    scored = compute_baseline_scores(test_rows)

    # Step 6: Evaluate
    eval_results = evaluate_rankings(scored, test_ground_truths)

    # Step 7: Per-scenario evaluation
    test_cases_raw = [c for c in cases_raw if c["case_id"] in test_case_ids]
    scenario_results = evaluate_by_scenario(scored, test_ground_truths, test_cases_raw)

    # Step 8: Print results
    print("\n" + "=" * 60)
    print("SENTINEL Weighted Risk Baseline Evaluation")
    print("=" * 60)
    print(f"\nDataset: {len(case_ids)} cases ({len(train_case_ids)} train, {len(test_case_ids)} test)")
    print(f"Total candidates: {len(matrix)} ({len(train_rows)} train, {len(test_rows)} test)")
    print(f"Features: {len(get_feature_names())}")
    print("\nFeature Groups and Weights:")
    for group, weight in GROUP_WEIGHTS.items():
        feats = FEATURE_GROUPS[group]
        print(f"  {group:15s}: {weight:.0%} ({len(feats)} features)")

    print(f"\n{'-' * 60}")
    print("Overall Test Set Results:")
    print("-" * 60)
    print(print_evaluation_summary(eval_results))

    print(f"\n{'-' * 60}")
    print("Per-Scenario Results:")
    print("-" * 60)
    for scenario, metrics in sorted(scenario_results.items()):
        print(f"\n  {scenario}:")
        print(f"    Cases:   {metrics['total_cases']}")
        print(f"    Top-1:   {metrics['top1_accuracy']:.1%}")
        print(f"    Top-3:   {metrics['top3_accuracy']:.1%}")
        print(f"    Top-5:   {metrics['top5_accuracy']:.1%}")
        print(f"    MRR:     {metrics['mrr']:.4f}")
        print(f"    Mean Rk: {metrics['mean_rank']:.2f}")

    # Step 9: Show example successful rankings
    print(f"\n{'-' * 60}")
    print("Example Successful Rankings (Top-1):")
    print("-" * 60)
    success_examples = [cr for cr in eval_results["case_results"] if cr["top1"]][:3]
    for ex in success_examples:
        case_candidates = [s for s in scored if s["case_id"] == ex["case_id"]]
        case_candidates.sort(key=lambda x: x["rank"])
        top = case_candidates[0]
        feat_row = next(
            (r for r in test_rows if r["case_id"] == ex["case_id"] and r["location_id"] == top["location_id"]), {}
        )
        explanation = explain_candidate(top, feat_row)
        print(f"\n  Case {ex['case_id']}: True location ranked #1")
        print(f"    Score: {top['baseline_score']:.4f}")
        print(f"    Groups: {top['group_scores']}")
        print(f"    Explanation: {explanation}")

    # Step 10: Show example failure cases
    print(f"\n{'-' * 60}")
    print("Example Difficult Cases (rank > 3):")
    print("-" * 60)
    failure_examples = [cr for cr in eval_results["case_results"] if cr["true_rank"] > 3][:3]
    for ex in failure_examples:
        case_candidates = [s for s in scored if s["case_id"] == ex["case_id"]]
        case_candidates.sort(key=lambda x: x["rank"])
        true_loc_rank = ex["true_rank"]
        print(f"\n  Case {ex['case_id']}: True location ranked #{true_loc_rank}")
        print(f"    Candidates: {ex['num_candidates']}")
        # Show top 3
        for c in case_candidates[:3]:
            print(f"      #{c['rank']} {c['location_id']} (score={c['baseline_score']:.4f})")

    # Step 11: Save results
    output_path = Path(__file__).parent.parent / "docs" / "baseline_evaluation.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    save_data = {
        "evaluation_timestamp": datetime.now().isoformat(),
        "seed": args.seed,
        "train_cases": len(train_case_ids),
        "test_cases": len(test_case_ids),
        "total_features": len(get_feature_names()),
        "group_weights": GROUP_WEIGHTS,
        "overall_results": {k: v for k, v in eval_results.items() if k != "case_results"},
        "scenario_results": {
            s: {k: v for k, v in m.items() if k != "case_results"} for s, m in scenario_results.items()
        },
    }

    with open(output_path, "w") as f:
        json.dump(save_data, f, indent=2, default=str)

    print(f"\n{'-' * 60}")
    print(f"Results saved to: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
