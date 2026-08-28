"""Phase 3 tests for baseline evaluation metrics.

Tests verify:
- Top-1/3/5 accuracy computation
- MRR computation
- Mean/median rank computation
- Per-scenario evaluation
- Edge cases
"""

from __future__ import annotations

from src.modeling.evaluation import (
    evaluate_by_scenario,
    evaluate_rankings,
    print_evaluation_summary,
)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_scored_candidates(
    case_id: str,
    true_location: str,
    ranked_locations: list[str],
) -> list[dict]:
    """Create scored candidate dicts for testing.

    Args:
        case_id: Case identifier.
        true_location: Ground truth location ID.
        ranked_locations: List of location IDs in ranked order (1st = highest score).

    Returns:
        List of scored candidate dicts.
    """
    candidates = []
    for rank, loc in enumerate(ranked_locations, start=1):
        candidates.append(
            {
                "case_id": case_id,
                "location_id": loc,
                "baseline_score": 1.0 - (rank * 0.1),  # Decreasing scores
                "rank": rank,
                "is_true_location": loc == true_location,
                "group_scores": {},
            }
        )
    return candidates


# ---------------------------------------------------------------------------
# Top-K accuracy tests
# ---------------------------------------------------------------------------


class TestTopKAccuracy:
    """Test Top-1/3/5 accuracy computation."""

    def test_top1_when_true_is_first(self):
        """True location ranked #1 should give Top-1 accuracy = 1.0."""
        scored = _make_scored_candidates("CASE_0001", "LOC_A", ["LOC_A", "LOC_B", "LOC_C"])
        gt = [{"case_id": "CASE_0001", "actual_cashout_location_id": "LOC_A"}]
        results = evaluate_rankings(scored, gt)
        assert results["top1_accuracy"] == 1.0
        assert results["top1_count"] == 1

    def test_top1_when_true_is_second(self):
        """True location ranked #2 should give Top-1 accuracy = 0.0."""
        scored = _make_scored_candidates("CASE_0001", "LOC_B", ["LOC_A", "LOC_B", "LOC_C"])
        gt = [{"case_id": "CASE_0001", "actual_cashout_location_id": "LOC_B"}]
        results = evaluate_rankings(scored, gt)
        assert results["top1_accuracy"] == 0.0
        assert results["top1_count"] == 0

    def test_top3_when_true_is_third(self):
        """True location ranked #3 should give Top-3 accuracy = 1.0."""
        scored = _make_scored_candidates("CASE_0001", "LOC_C", ["LOC_A", "LOC_B", "LOC_C"])
        gt = [{"case_id": "CASE_0001", "actual_cashout_location_id": "LOC_C"}]
        results = evaluate_rankings(scored, gt)
        assert results["top3_accuracy"] == 1.0
        assert results["top3_count"] == 1

    def test_top5_when_true_is_fifth(self):
        """True location ranked #5 should give Top-5 accuracy = 1.0."""
        locs = ["L1", "L2", "L3", "L4", "L5"]
        scored = _make_scored_candidates("CASE_0001", "L5", locs)
        gt = [{"case_id": "CASE_0001", "actual_cashout_location_id": "L5"}]
        results = evaluate_rankings(scored, gt)
        assert results["top5_accuracy"] == 1.0
        assert results["top5_count"] == 1

    def test_top5_when_true_is_sixth(self):
        """True location ranked #6 should give Top-5 accuracy = 0.0."""
        locs = ["L1", "L2", "L3", "L4", "L5", "L6"]
        scored = _make_scored_candidates("CASE_0001", "L6", locs)
        gt = [{"case_id": "CASE_0001", "actual_cashout_location_id": "L6"}]
        results = evaluate_rankings(scored, gt)
        assert results["top5_accuracy"] == 0.0

    def test_multiple_cases_accuracy(self):
        """Multiple cases should give correct aggregate accuracy."""
        scored = []
        gt = []

        # Case 1: true at rank 1
        scored.extend(_make_scored_candidates("C1", "A", ["A", "B", "C"]))
        gt.append({"case_id": "C1", "actual_cashout_location_id": "A"})

        # Case 2: true at rank 2
        scored.extend(_make_scored_candidates("C2", "B", ["A", "B", "C"]))
        gt.append({"case_id": "C2", "actual_cashout_location_id": "B"})

        # Case 3: true at rank 4
        scored.extend(_make_scored_candidates("C3", "D", ["A", "B", "C", "D", "E"]))
        gt.append({"case_id": "C3", "actual_cashout_location_id": "D"})

        results = evaluate_rankings(scored, gt)
        assert results["total_cases"] == 3
        assert abs(results["top1_accuracy"] - 1 / 3) < 1e-4  # 1 out of 3
        assert abs(results["top3_accuracy"] - 2 / 3) < 1e-4  # 2 out of 3
        assert results["top5_accuracy"] == 1.0  # all 3


# ---------------------------------------------------------------------------
# MRR tests
# ---------------------------------------------------------------------------


class TestMRR:
    """Test Mean Reciprocal Rank computation."""

    def test_mrr_perfect(self):
        """All true locations at rank 1 should give MRR = 1.0."""
        scored = _make_scored_candidates("C1", "A", ["A", "B"])
        gt = [{"case_id": "C1", "actual_cashout_location_id": "A"}]
        results = evaluate_rankings(scored, gt)
        assert results["mrr"] == 1.0

    def test_mrr_half(self):
        """All true locations at rank 2 should give MRR = 0.5."""
        scored = _make_scored_candidates("C1", "B", ["A", "B"])
        gt = [{"case_id": "C1", "actual_cashout_location_id": "B"}]
        results = evaluate_rankings(scored, gt)
        assert abs(results["mrr"] - 0.5) < 1e-10

    def test_mrr_mixed(self):
        """Mixed ranks should give correct MRR."""
        scored = []
        gt = []

        # Case 1: rank 1 -> reciprocal = 1.0
        scored.extend(_make_scored_candidates("C1", "A", ["A", "B"]))
        gt.append({"case_id": "C1", "actual_cashout_location_id": "A"})

        # Case 2: rank 2 -> reciprocal = 0.5
        scored.extend(_make_scored_candidates("C2", "B", ["A", "B"]))
        gt.append({"case_id": "C2", "actual_cashout_location_id": "B"})

        results = evaluate_rankings(scored, gt)
        expected_mrr = (1.0 + 0.5) / 2
        assert abs(results["mrr"] - expected_mrr) < 1e-10


# ---------------------------------------------------------------------------
# Rank statistics tests
# ---------------------------------------------------------------------------


class TestRankStatistics:
    """Test mean and median rank computation."""

    def test_mean_rank(self):
        """Mean rank should be arithmetic mean of true location ranks."""
        scored = []
        gt = []

        # Case 1: rank 1
        scored.extend(_make_scored_candidates("C1", "A", ["A", "B", "C"]))
        gt.append({"case_id": "C1", "actual_cashout_location_id": "A"})

        # Case 2: rank 3
        scored.extend(_make_scored_candidates("C2", "C", ["A", "B", "C"]))
        gt.append({"case_id": "C2", "actual_cashout_location_id": "C"})

        results = evaluate_rankings(scored, gt)
        assert results["mean_rank"] == 2.0  # (1 + 3) / 2

    def test_median_rank(self):
        """Median rank should be the median of true location ranks."""
        scored = []
        gt = []

        # Ranks: 1, 2, 5
        scored.extend(_make_scored_candidates("C1", "A", ["A", "B", "C", "D", "E"]))
        gt.append({"case_id": "C1", "actual_cashout_location_id": "A"})

        scored.extend(_make_scored_candidates("C2", "B", ["A", "B", "C", "D", "E"]))
        gt.append({"case_id": "C2", "actual_cashout_location_id": "B"})

        scored.extend(_make_scored_candidates("C3", "E", ["A", "B", "C", "D", "E"]))
        gt.append({"case_id": "C3", "actual_cashout_location_id": "E"})

        results = evaluate_rankings(scored, gt)
        assert results["median_rank"] == 2.0  # median of [1, 2, 5]


# ---------------------------------------------------------------------------
# True rank not found tests
# ---------------------------------------------------------------------------


class TestMissingTrueLocation:
    """Test handling when true location is not in candidate set."""

    def test_true_location_not_in_candidates(self):
        """If true location is not in candidates, rank should be len(candidates) + 1."""
        scored = _make_scored_candidates("C1", "X", ["A", "B", "C"])  # X not in [A,B,C]
        gt = [{"case_id": "C1", "actual_cashout_location_id": "X"}]
        results = evaluate_rankings(scored, gt)
        assert results["true_ranks"][0] == 4  # len(candidates) + 1


# ---------------------------------------------------------------------------
# Per-scenario evaluation tests
# ---------------------------------------------------------------------------


class TestPerScenario:
    """Test per-scenario evaluation breakdown."""

    def test_scenario_breakdown(self):
        """Each scenario should have its own evaluation metrics."""
        scored = []
        gt = []
        cases = [
            {"case_id": "C1", "fraud_scenario": "DIRECT_CASHOUT"},
            {"case_id": "C2", "fraud_scenario": "MULTI_HOP"},
        ]

        # C1: DIRECT_CASHOUT, true at rank 1
        scored.extend(_make_scored_candidates("C1", "A", ["A", "B"]))
        gt.append({"case_id": "C1", "actual_cashout_location_id": "A"})

        # C2: MULTI_HOP, true at rank 2
        scored.extend(_make_scored_candidates("C2", "B", ["A", "B"]))
        gt.append({"case_id": "C2", "actual_cashout_location_id": "B"})

        results = evaluate_by_scenario(scored, gt, cases)
        assert "DIRECT_CASHOUT" in results
        assert "MULTI_HOP" in results
        assert results["DIRECT_CASHOUT"]["top1_accuracy"] == 1.0
        assert results["MULTI_HOP"]["top1_accuracy"] == 0.0

    def test_empty_scenario(self):
        """Scenario with no cases should not appear in results."""
        scored = _make_scored_candidates("C1", "A", ["A", "B"])
        gt = [{"case_id": "C1", "actual_cashout_location_id": "A"}]
        cases = [{"case_id": "C1", "fraud_scenario": "DIRECT_CASHOUT"}]

        results = evaluate_by_scenario(scored, gt, cases)
        assert "MULTI_HOP" not in results


# ---------------------------------------------------------------------------
# Empty input tests
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Test edge cases for evaluation."""

    def test_empty_scored_candidates(self):
        """Empty scored candidates should return zero metrics."""
        gt = [{"case_id": "C1", "actual_cashout_location_id": "A"}]
        results = evaluate_rankings([], gt)
        assert results["total_cases"] == 0
        assert results["top1_accuracy"] == 0.0

    def test_empty_ground_truths(self):
        """Empty ground truths should return zero metrics."""
        scored = _make_scored_candidates("C1", "A", ["A", "B"])
        results = evaluate_rankings(scored, [])
        assert results["total_cases"] == 0

    def test_both_empty(self):
        """Both empty should return zero metrics."""
        results = evaluate_rankings([], [])
        assert results["total_cases"] == 0
        assert results["mrr"] == 0.0


# ---------------------------------------------------------------------------
# Print summary tests
# ---------------------------------------------------------------------------


class TestPrintSummary:
    """Test that print_evaluation_summary produces valid output."""

    def test_summary_contains_key_metrics(self):
        """Summary string should contain key metric names."""
        results = {
            "total_cases": 10,
            "top1_accuracy": 0.4,
            "top3_accuracy": 0.7,
            "top5_accuracy": 0.9,
            "mrr": 0.65,
            "mean_rank": 2.3,
            "median_rank": 2.0,
            "top1_count": 4,
            "top3_count": 7,
            "top5_count": 9,
        }
        summary = print_evaluation_summary(results)
        assert "Top-1" in summary
        assert "Top-3" in summary
        assert "Top-5" in summary
        assert "Mean Reciprocal Rank" in summary
        assert "40.0%" in summary  # 0.4 formatted as percentage
