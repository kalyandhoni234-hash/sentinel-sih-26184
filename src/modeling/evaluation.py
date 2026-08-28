"""Ranking evaluation metrics for SENTINEL baseline.

Evaluates the quality of candidate rankings produced by the baseline scorer.
All metrics operate on ranked lists per case and compare against ground truth.

Metrics:
    - Top-1 accuracy: true location ranked #1
    - Top-3 accuracy: true location in top 3
    - Top-5 accuracy: true location in top 5
    - Mean Reciprocal Rank (MRR): average of 1/rank of true location
    - Mean true rank: average rank of true location
    - Median true rank: median rank of true location
    - Per-scenario breakdown
"""

from __future__ import annotations

import statistics
from typing import Any


def evaluate_rankings(
    scored_candidates: list[dict[str, Any]],
    ground_truths: list[dict[str, Any]],
) -> dict[str, Any]:
    """Evaluate ranking quality against ground truth.

    Args:
        scored_candidates: List of scored candidate dicts from compute_baseline_scores().
            Each must have: case_id, location_id, baseline_score, rank, is_true_location.
        ground_truths: List of ground truth dicts.
            Each must have: case_id, actual_cashout_location_id.

    Returns:
        Dictionary with evaluation metrics.
    """
    # Build ground truth lookup
    gt_map = {g["case_id"]: g["actual_cashout_location_id"] for g in ground_truths}

    # Group scored candidates by case
    by_case: dict[str, list[dict]] = {}
    for c in scored_candidates:
        by_case.setdefault(c["case_id"], []).append(c)

    # Compute per-case metrics
    true_ranks = []
    top1_count = 0
    top3_count = 0
    top5_count = 0
    total_cases = 0
    case_results = []

    for case_id, gt_loc in gt_map.items():
        candidates = by_case.get(case_id, [])
        if not candidates:
            continue

        total_cases += 1

        # Find rank of true location
        true_rank = None
        for c in candidates:
            if c["location_id"] == gt_loc:
                true_rank = c["rank"]
                break

        if true_rank is None:
            # True location not in candidate set — rank is len(candidates) + 1
            true_rank = len(candidates) + 1

        true_ranks.append(true_rank)

        if true_rank <= 1:
            top1_count += 1
        if true_rank <= 3:
            top3_count += 1
        if true_rank <= 5:
            top5_count += 1

        case_results.append(
            {
                "case_id": case_id,
                "true_rank": true_rank,
                "num_candidates": len(candidates),
                "top1": true_rank <= 1,
                "top3": true_rank <= 3,
                "top5": true_rank <= 5,
            }
        )

    # Aggregate metrics
    if total_cases == 0:
        return _empty_results()

    mrr = sum(1.0 / r for r in true_ranks) / total_cases
    mean_rank = sum(true_ranks) / total_cases
    median_rank = statistics.median(true_ranks)

    return {
        "total_cases": total_cases,
        "top1_accuracy": round(top1_count / total_cases, 4),
        "top3_accuracy": round(top3_count / total_cases, 4),
        "top5_accuracy": round(top5_count / total_cases, 4),
        "mrr": round(mrr, 4),
        "mean_rank": round(mean_rank, 4),
        "median_rank": round(median_rank, 4),
        "top1_count": top1_count,
        "top3_count": top3_count,
        "top5_count": top5_count,
        "true_ranks": true_ranks,
        "case_results": case_results,
    }


def evaluate_by_scenario(
    scored_candidates: list[dict[str, Any]],
    ground_truths: list[dict[str, Any]],
    cases: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Evaluate ranking quality broken down by fraud scenario.

    Args:
        scored_candidates: List of scored candidate dicts.
        ground_truths: List of ground truth dicts.
        cases: List of case dicts (must have case_id and fraud_scenario).

    Returns:
        Dict of scenario_name -> evaluation metrics.
    """
    # Build case-to-scenario mapping
    scenario_map = {c["case_id"]: c["fraud_scenario"] for c in cases}

    # Group ground truths by scenario
    gt_by_scenario: dict[str, list[dict]] = {}
    for gt in ground_truths:
        scenario = scenario_map.get(gt["case_id"], "UNKNOWN")
        gt_by_scenario.setdefault(scenario, []).append(gt)

    # Group candidates by scenario
    cand_by_scenario: dict[str, list[dict]] = {}
    for c in scored_candidates:
        scenario = scenario_map.get(c["case_id"], "UNKNOWN")
        cand_by_scenario.setdefault(scenario, []).append(c)

    results = {}
    for scenario in sorted(gt_by_scenario.keys()):
        scenario_gts = gt_by_scenario[scenario]
        scenario_cands = cand_by_scenario.get(scenario, [])
        if scenario_gts:
            results[scenario] = evaluate_rankings(scenario_cands, scenario_gts)

    return results


def print_evaluation_summary(results: dict[str, Any]) -> str:
    """Format evaluation results as a readable string.

    Args:
        results: Dict from evaluate_rankings().

    Returns:
        Formatted string.
    """
    lines = [
        "SENTINEL Baseline Evaluation Results",
        "=" * 40,
        f"Total cases:          {results['total_cases']}",
        f"Top-1 accuracy:       {results['top1_accuracy']:.1%} ({results['top1_count']}/{results['total_cases']})",
        f"Top-3 accuracy:       {results['top3_accuracy']:.1%} ({results['top3_count']}/{results['total_cases']})",
        f"Top-5 accuracy:       {results['top5_accuracy']:.1%} ({results['top5_count']}/{results['total_cases']})",
        f"Mean Reciprocal Rank: {results['mrr']:.4f}",
        f"Mean true rank:       {results['mean_rank']:.2f}",
        f"Median true rank:     {results['median_rank']:.1f}",
    ]
    return "\n".join(lines)


def _empty_results() -> dict[str, Any]:
    """Return empty evaluation results."""
    return {
        "total_cases": 0,
        "top1_accuracy": 0.0,
        "top3_accuracy": 0.0,
        "top5_accuracy": 0.0,
        "mrr": 0.0,
        "mean_rank": 0.0,
        "median_rank": 0.0,
        "top1_count": 0,
        "top3_count": 0,
        "top5_count": 0,
        "true_ranks": [],
        "case_results": [],
    }
