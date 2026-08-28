"""Phase 3 baseline vs Phase 4 Random Forest comparison.

Provides structured comparison of ranking metrics between the weighted
baseline and Random Forest models, using the existing evaluation functions.
"""

from __future__ import annotations

from typing import Any


def compare_models(
    baseline_results: dict[str, Any],
    rf_results: dict[str, Any],
    baseline_per_scenario: dict[str, dict[str, Any]] | None = None,
    rf_per_scenario: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compare baseline and RF evaluation results.

    Args:
        baseline_results: Dict from evaluate_rankings() for baseline.
        rf_results: Dict from evaluate_rankings() for RF.
        baseline_per_scenario: Optional per-scenario baseline results.
        rf_per_scenario: Optional per-scenario RF results.

    Returns:
        Structured comparison dict with deltas and winner.
    """
    metrics = ["top1_accuracy", "top3_accuracy", "top5_accuracy", "mrr", "mean_rank", "median_rank"]

    metric_deltas = {}
    for m in metrics:
        b = baseline_results.get(m, 0.0)
        r = rf_results.get(m, 0.0)
        # For mean_rank and median_rank, lower is better
        if m in ("mean_rank", "median_rank"):
            delta = b - r  # positive = RF is better (lower)
            rf_wins = r < b
        else:
            delta = r - b  # positive = RF is better (higher)
            rf_wins = r > b
        metric_deltas[m] = {
            "baseline": round(b, 4),
            "rf": round(r, 4),
            "delta": round(delta, 4),
            "rf_wins": rf_wins,
        }

    # Overall winner
    rf_wins_count = sum(1 for v in metric_deltas.values() if v["rf_wins"])
    baseline_wins_count = sum(1 for v in metric_deltas.values() if not v["rf_wins"])
    overall = "random_forest" if rf_wins_count > baseline_wins_count else "weighted_baseline"

    # Per-scenario comparison
    scenario_comparison = {}
    if baseline_per_scenario and rf_per_scenario:
        all_scenarios = set(baseline_per_scenario.keys()) | set(rf_per_scenario.keys())
        for scenario in sorted(all_scenarios):
            b_sc = baseline_per_scenario.get(scenario, {})
            r_sc = rf_per_scenario.get(scenario, {})
            b_mrr = b_sc.get("mrr", 0.0)
            r_mrr = r_sc.get("mrr", 0.0)
            scenario_comparison[scenario] = {
                "baseline_mrr": round(b_mrr, 4),
                "rf_mrr": round(r_mrr, 4),
                "rf_wins": r_mrr > b_mrr,
                "baseline_top1": b_sc.get("top1_accuracy", 0.0),
                "rf_top1": r_sc.get("top1_accuracy", 0.0),
            }

    return {
        "metric_comparison": metric_deltas,
        "overall_winner": overall,
        "rf_wins_count": rf_wins_count,
        "baseline_wins_count": baseline_wins_count,
        "scenario_comparison": scenario_comparison,
    }


def format_comparison(comparison: dict[str, Any]) -> str:
    """Format comparison results as a readable report.

    Args:
        comparison: Dict from compare_models().

    Returns:
        Formatted string.
    """
    lines = [
        "SENTINEL Phase 3 vs Phase 4 Comparison",
        "=" * 60,
        "",
        f"{'Metric':<25s} {'Baseline':>10s} {'RF':>10s} {'Delta':>10s} {'Winner':>12s}",
        "-" * 70,
    ]

    for metric, vals in comparison["metric_comparison"].items():
        winner = "RF" if vals["rf_wins"] else "Baseline"
        display_metric = metric.replace("_", " ").title()
        if "accuracy" in metric:
            b_str = f"{vals['baseline']:.1%}"
            r_str = f"{vals['rf']:.1%}"
            d_str = f"{vals['delta']:+.1%}"
        else:
            b_str = f"{vals['baseline']:.4f}"
            r_str = f"{vals['rf']:.4f}"
            d_str = f"{vals['delta']:+.4f}"
        lines.append(f"{display_metric:<25s} {b_str:>10s} {r_str:>10s} {d_str:>10s} {winner:>12s}")

    lines.extend(
        [
            "-" * 70,
            "",
            f"Overall winner: {comparison['overall_winner'].replace('_', ' ').title()}",
            f"  RF wins: {comparison['rf_wins_count']}/{comparison['rf_wins_count'] + comparison['baseline_wins_count']} metrics",
        ]
    )

    if comparison.get("scenario_comparison"):
        lines.extend(["", "Per-Scenario MRR Comparison:", "-" * 40])
        for scenario, vals in comparison["scenario_comparison"].items():
            winner = "RF" if vals["rf_wins"] else "Baseline"
            lines.append(
                f"  {scenario:<30s}  Baseline={vals['baseline_mrr']:.4f}  RF={vals['rf_mrr']:.4f}  -> {winner}"
            )

    return "\n".join(lines)
