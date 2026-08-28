"""CLI entry point for running the SENTINEL Phase 4 Random Forest evaluation.

Usage:
    python scripts/run_rf_evaluation.py [--seed SEED] [--output DIR]

This script:
1. Generates synthetic data (or uses existing)
2. Builds the feature matrix
3. Splits cases into train/test (80/20) — case-level split
4. Trains a Random Forest classifier
5. Predicts and ranks test candidates
6. Evaluates ranking quality against ground truth
7. Compares against Phase 3 weighted baseline
8. Prints results and saves them to docs/
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_generation.features import build_feature_matrix, get_feature_names
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario
from src.modeling.baseline import (
    FEATURE_GROUPS,
    compute_baseline_scores,
)
from src.modeling.comparison import compare_models, format_comparison
from src.modeling.evaluation import (
    evaluate_by_scenario,
    evaluate_rankings,
    print_evaluation_summary,
)
from src.modeling.random_forest import (
    DEFAULT_RF_PARAMS,
    get_feature_importance,
    get_group_importance,
    predict_and_rank,
    train_random_forest,
)


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return records


def main() -> None:
    """Run Phase 4 Random Forest evaluation."""
    parser = argparse.ArgumentParser(description="SENTINEL Phase 4 RF Evaluation")
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
    test_cases_raw = [c for c in cases_raw if c["case_id"] in test_case_ids]

    # Step 5: Train Random Forest
    clf = train_random_forest(train_rows)

    # Step 6: Predict and rank test set
    rf_ranked = predict_and_rank(clf, test_rows)

    # Step 7: Evaluate RF
    rf_results = evaluate_rankings(rf_ranked, test_ground_truths)
    rf_scenario = evaluate_by_scenario(rf_ranked, test_ground_truths, test_cases_raw)

    # Step 8: Baseline for comparison
    baseline_scored = compute_baseline_scores(test_rows)
    baseline_results = evaluate_rankings(baseline_scored, test_ground_truths)
    baseline_scenario = evaluate_by_scenario(baseline_scored, test_ground_truths, test_cases_raw)

    # Step 9: Compare
    comparison = compare_models(baseline_results, rf_results, baseline_scenario, rf_scenario)

    # Step 10: Feature importance
    feature_imp = get_feature_importance(clf)
    group_imp = get_group_importance(clf, FEATURE_GROUPS)

    # Step 11: Print results
    print("\n" + "=" * 70)
    print("SENTINEL Phase 4 — Random Forest Evaluation")
    print("=" * 70)
    print(f"\nDataset: {len(case_ids)} cases ({len(train_case_ids)} train, {len(test_case_ids)} test)")
    print(f"Total candidates: {len(matrix)} ({len(train_rows)} train, {len(test_rows)} test)")
    print(f"Features: {len(get_feature_names())}")
    print("\nRandom Forest Configuration:")
    for k, v in DEFAULT_RF_PARAMS.items():
        print(f"  {k}: {v}")

    print(f"\n{'-' * 70}")
    print("Random Forest Test Set Results:")
    print("-" * 70)
    print(print_evaluation_summary(rf_results))

    print(f"\n{'-' * 70}")
    print("Per-Scenario Results (RF):")
    print("-" * 70)
    for scenario, metrics in sorted(rf_scenario.items()):
        print(f"\n  {scenario}:")
        print(f"    Cases:   {metrics['total_cases']}")
        print(f"    Top-1:   {metrics['top1_accuracy']:.1%}")
        print(f"    Top-3:   {metrics['top3_accuracy']:.1%}")
        print(f"    Top-5:   {metrics['top5_accuracy']:.1%}")
        print(f"    MRR:     {metrics['mrr']:.4f}")
        print(f"    Mean Rk: {metrics['mean_rank']:.2f}")

    print(f"\n{'-' * 70}")
    print("Feature Importance (Top 15):")
    print("-" * 70)
    for item in feature_imp[:15]:
        bar = "#" * int(item["importance"] * 200)
        print(f"  #{item['rank']:>2d} {item['feature']:<45s} {item['importance']:.4f}  {bar}")

    print(f"\n{'-' * 70}")
    print("Feature Group Importance:")
    print("-" * 70)
    sorted_groups = sorted(group_imp.items(), key=lambda x: x[1], reverse=True)
    total_imp = sum(group_imp.values())
    for group_name, imp in sorted_groups:
        pct = imp / total_imp * 100 if total_imp > 0 else 0
        bar = "#" * int(pct / 2)
        print(f"  {group_name:<15s}  {imp:.4f} ({pct:.1f}%)  {bar}")

    print(f"\n{'-' * 70}")
    print("Phase 3 Baseline vs Phase 4 Random Forest:")
    print("-" * 70)
    print(format_comparison(comparison))

    # Step 12: Save results
    output_path = Path(__file__).parent.parent / "docs" / "rf_evaluation.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    save_data = {
        "evaluation_timestamp": datetime.now().isoformat(),
        "seed": args.seed,
        "train_cases": len(train_case_ids),
        "test_cases": len(test_case_ids),
        "total_features": len(get_feature_names()),
        "rf_config": DEFAULT_RF_PARAMS,
        "rf_results": {k: v for k, v in rf_results.items() if k != "case_results"},
        "rf_scenario_results": {s: {k: v for k, v in m.items() if k != "case_results"} for s, m in rf_scenario.items()},
        "baseline_results": {k: v for k, v in baseline_results.items() if k != "case_results"},
        "baseline_scenario_results": {
            s: {k: v for k, v in m.items() if k != "case_results"} for s, m in baseline_scenario.items()
        },
        "comparison": comparison,
        "feature_importance": feature_imp,
        "group_importance": {k: round(v, 6) for k, v in group_imp.items()},
    }

    with open(output_path, "w") as f:
        json.dump(save_data, f, indent=2, default=str)

    print(f"\n{'-' * 70}")
    print(f"Results saved to: {output_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
