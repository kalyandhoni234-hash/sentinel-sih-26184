"""Model training and scoring service.

Manages model lifecycle: training, prediction, and explanation generation.
Wraps the existing Phase 3 baseline and Phase 4 Random Forest implementations.
Keeps trained models in memory for the application lifetime.

No ground-truth or Layer-C information is used during scoring.

Explanation terminology:
    The Random Forest (RF) model is a black-box ensemble. Its score for a
    candidate is derived from the votes of many decision trees, and there is
    NO exact local feature-attribution method wired into this service.
    The text returned for RF-scored candidates is therefore a deterministic
    summary of OBSERVABLE evidence signals (e.g. same metro, close to
    origin, cash-out friendly type). It must NOT be read as
    "the Random Forest decided this because X". The baseline model's
    "High score because of: ..." wording is accurate because the baseline
    is a transparent weighted formula whose group contributions directly
    drive the score.
"""

from __future__ import annotations

import logging
from typing import Any

from sklearn.ensemble import RandomForestClassifier

from src.modeling.baseline import (
    compute_baseline_scores,
    explain_candidate,
)
from src.modeling.random_forest import (
    predict_and_rank,
    train_random_forest,
)

logger = logging.getLogger(__name__)


class ModelService:
    """Manages model training and scoring.

    Models are trained once on startup and cached in memory.
    """

    def __init__(self) -> None:
        self._rf_model: RandomForestClassifier | None = None
        self._trained = False

    def train(self, train_rows: list[dict[str, Any]]) -> None:
        """Train the Random Forest model on training data.

        Args:
            train_rows: Feature rows for training cases only.
        """
        if self._trained:
            return

        logger.info("Training Random Forest on %d rows", len(train_rows))
        self._rf_model = train_random_forest(train_rows)
        self._trained = True
        logger.info("Random Forest training complete")

    def score_baseline(
        self,
        feature_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Score candidates using the weighted baseline model.

        Args:
            feature_rows: Feature rows for candidates to score.

        Returns:
            List of scored candidate dicts with ranks.
        """
        return compute_baseline_scores(feature_rows)

    def score_random_forest(
        self,
        feature_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Score candidates using the Random Forest model.

        Args:
            feature_rows: Feature rows for candidates to score.

        Returns:
            List of scored candidate dicts with ranks.

        Raises:
            RuntimeError: If model has not been trained yet.
        """
        if self._rf_model is None:
            raise RuntimeError("Random Forest model not trained. Call train() first.")
        return predict_and_rank(self._rf_model, feature_rows)

    def explain_baseline_candidate(
        self,
        scored_candidate: dict[str, Any],
        feature_row: dict[str, Any],
    ) -> str:
        """Generate explanation for a baseline-scored candidate.

        Args:
            scored_candidate: The scored result dict.
            feature_row: The original feature row.

        Returns:
            Human-readable explanation string.
        """
        return explain_candidate(scored_candidate, feature_row)

    def describe_rf_evidence_signals(
        self,
        feature_row: dict[str, Any],
    ) -> str:
        """Describe observable evidence signals for an RF-scored candidate.

        The Random Forest model is a black-box ensemble. Its probability
        output for a candidate is the aggregate of many decision-tree votes,
        and this service does NOT compute a local attribution (e.g. SHAP,
        tree interpreter). The text returned here is a deterministic summary
        of query-time feature values associated with the candidate.

        It must NEVER be interpreted as "the Random Forest reasoned that X".
        It is a list of observable evidence signals that the candidate
        exhibits — useful to an investigator, but not a faithful local
        explanation of the RF model's internal scoring path.

        The returned string is prefixed with "Supporting evidence signals:"
        so the API and UI surface cannot accidentally claim RF attribution.

        Args:
            feature_row: The original feature row.

        Returns:
            Human-readable supporting-evidence summary.
        """
        reasons = []

        # Geographic signals
        if feature_row.get("cand_same_metro_as_origin") == 1:
            reasons.append("same metro as complaint origin")
        if feature_row.get("cand_same_region_as_origin") == 1:
            reasons.append("same region as origin")
        if feature_row.get("cand_same_metro_as_last_tx") == 1:
            reasons.append("same metro as last transaction")

        # Distance signals
        dist = feature_row.get("cand_distance_from_origin_km", -1)
        if 0 <= dist < 5:
            reasons.append("very close to complaint origin")
        elif 0 <= dist < 15:
            reasons.append("close to complaint origin")

        # Location type signals
        if feature_row.get("loc_is_cashout_friendly_type") == 1:
            reasons.append("cash-out friendly location type")
        if feature_row.get("loc_type_atm") == 1:
            reasons.append("ATM location")
        if feature_row.get("loc_type_money_transfer") == 1:
            reasons.append("money transfer agent")

        # Transaction signals
        tx_count = feature_row.get("tx_count", 0)
        if tx_count > 5:
            reasons.append("high transaction volume")
        tx_amount = feature_row.get("tx_total_amount", 0)
        if tx_amount > 100000:
            reasons.append("large total transaction amount")

        # Density
        density = feature_row.get("loc_density_score", 0)
        if density > 0.7:
            reasons.append("high foot-traffic area")

        if not reasons:
            reasons = ["no prominent observable evidence signals"]

        return f"Supporting evidence signals: {', '.join(reasons)}."
