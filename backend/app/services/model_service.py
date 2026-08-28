"""Model training and scoring service.

Manages model lifecycle: training, prediction, and explanation generation.
Wraps the existing Phase 3 baseline and Phase 4 Random Forest implementations.
Keeps trained models in memory for the application lifetime.

No ground-truth or Layer-C information is used during scoring.
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

    def explain_rf_candidate(
        self,
        feature_row: dict[str, Any],
    ) -> str:
        """Generate explanation for an RF-scored candidate.

        Uses observable feature values to produce a human-readable explanation.
        Does NOT reference ground truth information.

        Args:
            feature_row: The original feature row.

        Returns:
            Human-readable explanation string.
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
            reasons = ["scored by Random Forest model based on feature patterns"]

        return f"Risk indicators: {', '.join(reasons)}."
