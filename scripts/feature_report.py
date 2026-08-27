"""Feature matrix sanity report for SENTINEL.

Generates a compact report of all features in the candidate-level feature matrix.
Run after feature engineering to inspect the output before ML.

Usage:
    python scripts/feature_report.py [--seed SEED]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_generation.features import (
    FEATURE_REGISTRY,
    build_feature_matrix,
    get_feature_names,
    get_metadata_columns,
)
from src.data_generation.generator import generate_dataset


def _compute_stats(values: list) -> dict:
    """Compute basic statistics for a list of values."""
    if not values:
        return {"count": 0, "missing": 0}

    numeric = [v for v in values if isinstance(v, (int, float))]
    missing = sum(1 for v in values if v is None or v == -1.0)

    if not numeric:
        return {"count": len(values), "missing": missing, "type": "non-numeric"}

    return {
        "count": len(values),
        "missing": missing,
        "min": round(min(numeric), 4),
        "max": round(max(numeric), 4),
        "mean": round(sum(numeric) / len(numeric), 4),
        "unique": len(set(values)),
    }


def generate_report(seed: int = 42) -> None:
    """Generate and print the feature sanity report."""
    print("=" * 70)
    print("SENTINEL FEATURE MATRIX SANITY REPORT")
    print("=" * 70)

    # Generate dataset
    result = generate_dataset(seed=seed)
    output_dir = result["output_dir"]

    # Load raw data
    cases = []
    with open(Path(output_dir) / "generated/cases.jsonl") as f:
        for line in f:
            cases.append(json.loads(line))

    candidates = []
    with open(Path(output_dir) / "generated/candidates.jsonl") as f:
        for line in f:
            candidates.append(json.loads(line))

    transactions = []
    with open(Path(output_dir) / "generated/transactions.jsonl") as f:
        for line in f:
            transactions.append(json.loads(line))

    locations = []
    with open(Path(output_dir) / "generated/locations.jsonl") as f:
        for line in f:
            locations.append(json.loads(line))

    ground_truths = []
    with open(Path(output_dir) / "evaluation/ground_truth.jsonl") as f:
        for line in f:
            ground_truths.append(json.loads(line))

    # Convert to schema objects
    from datetime import datetime
    from src.data_generation.schema import Case, FraudScenario

    case_objects = []
    for c in cases:
        case_objects.append(Case(
            case_id=c["case_id"],
            complaint_time=datetime.fromisoformat(c["complaint_time"]),
            fraud_scenario=FraudScenario(c["fraud_scenario"]),
            reported_amount=c["reported_amount"],
            origin_metro=c["origin_metro"],
            origin_location_id=c["origin_location_id"],
            num_accounts_involved=c["num_accounts_involved"],
            num_transactions=c["num_transactions"],
        ))

    # Build feature matrix
    matrix = build_feature_matrix(
        cases=case_objects,
        candidates=candidates,
        transactions=transactions,
        locations=locations,
        ground_truths=ground_truths,
    )

    feature_names = get_feature_names()
    meta_cols = get_metadata_columns()

    print(f"\nDataset: {result['case_count']} cases, {len(candidates)} candidates")
    print(f"Feature matrix: {len(matrix)} rows x {len(feature_names)} features + {len(meta_cols)} metadata cols")
    print(f"True positives: {sum(1 for r in matrix if r['is_true_location'])}")

    # Build registry lookup
    reg_lookup = {f["name"]: f for f in FEATURE_REGISTRY}

    print("\n" + "-" * 70)
    print(f"{'Feature':<45} {'Type':<8} {'Unique':<8} {'Missing':<8} {'Min':<10} {'Max':<10}")
    print("-" * 70)

    for fname in feature_names:
        values = [r[fname] for r in matrix]
        stats = _compute_stats(values)
        reg = reg_lookup.get(fname, {})
        dtype = reg.get("dtype", "?")
        unique = stats.get("unique", "?")
        missing = stats.get("missing", 0)
        min_val = stats.get("min", "-")
        max_val = stats.get("max", "-")

        missing_str = f"{missing}" if missing > 0 else "0"
        print(
            f"{fname:<45} {dtype:<8} {str(unique):<8} {missing_str:<8} "
            f"{str(min_val):<10} {str(max_val):<10}"
        )

    # Leakage status summary
    print("\n" + "-" * 70)
    print("LEAKAGE STATUS")
    print("-" * 70)
    for f in FEATURE_REGISTRY:
        status = f.get("leakage", "UNKNOWN")
        marker = "OK" if status == "ALLOWED" else "FORBIDDEN"
        print(f"  [{marker}] {f['name']}: {status}")

    # Feature group summary
    print("\n" + "-" * 70)
    print("FEATURE GROUP SUMMARY")
    print("-" * 70)
    groups = {}
    for f in FEATURE_REGISTRY:
        g = f.get("group", "unknown")
        groups.setdefault(g, []).append(f["name"])
    for g, names in sorted(groups.items()):
        print(f"  {g}: {len(names)} features")

    # Check for any -1.0 sentinel values (missing data indicators)
    print("\n" + "-" * 70)
    print("MISSING VALUE CHECK (sentinel -1.0)")
    print("-" * 70)
    for fname in feature_names:
        sentinel_count = sum(1 for r in matrix if r[fname] == -1.0)
        if sentinel_count > 0:
            pct = sentinel_count / len(matrix) * 100
            print(f"  {fname}: {sentinel_count} rows ({pct:.1f}%) have sentinel -1.0")

    print("\n" + "=" * 70)
    print("Report complete.")
    print("=" * 70)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate feature matrix sanity report")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()
    generate_report(seed=args.seed)


if __name__ == "__main__":
    main()
