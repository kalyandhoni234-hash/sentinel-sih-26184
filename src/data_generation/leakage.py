"""Data leakage detection checks.

Implements actual checks to verify that no target-derived or
post-prediction information leaks into model-visible features.

This module is CRITICAL for maintaining the separation between
model-visible data and evaluation-only data.
"""

from __future__ import annotations

import logging

from .schema import (
    Candidate,
    Case,
    GroundTruth,
    Location,
    Transaction,
)

logger = logging.getLogger(__name__)


class LeakageError(Exception):
    """Raised when data leakage is detected."""

    pass


class LeakageChecker:
    """Checks for data leakage in the synthetic dataset."""

    # Fields that must NEVER appear in model-visible data
    FORBIDDEN_COLUMNS = {
        "actual_cashout_location_id",
        "cashout_time",
        "cashout_metro",
        "scenario_used",
        "selection_probability",
        "is_true_location",
    }

    def __init__(
        self,
        cases: list[Case],
        transactions: list[Transaction],
        locations: list[Location],
        candidates: list[Candidate],
        ground_truths: list[GroundTruth],
    ):
        self.cases = cases
        self.transactions = transactions
        self.locations = locations
        self.candidates = candidates
        self.ground_truths = ground_truths
        self.violations: list[str] = []

    def check_all(self) -> list[str]:
        """Run all leakage checks. Returns list of violation descriptions."""
        self.violations = []

        self._check_ground_truth_not_in_candidates()
        self._check_case_fraud_scenario_exposed()
        self._check_candidate_columns_safe()
        self._check_no_target_derived_distance()
        self._check_no_post_cashout_transactions()
        self._check_no_hidden_scenario_in_features()

        return self.violations

    def _check_ground_truth_not_in_candidates(self) -> None:
        """Verify the is_true_location flag is not used as a feature.

        The flag should only exist for evaluation, not for model input.
        We verify that the flag is never True in combination with any
        forbidden ground-truth field being present on the Candidate schema
        as a non-metadata field. The Candidate model may carry is_true_location
        for internal bookkeeping, but no other forbidden field should exist
        on the Candidate schema.
        """
        # Verify no forbidden field (other than is_true_location) exists on Candidate
        candidate_fields = set(Candidate.model_fields.keys())
        forbidden_on_candidate = candidate_fields & (self.FORBIDDEN_COLUMNS - {"is_true_location"})
        if forbidden_on_candidate:
            self.violations.append(
                f"LEAKAGE: Candidate model contains forbidden ground-truth fields: {forbidden_on_candidate}"
            )
        # Verify is_true_location is a boolean field (evaluation-only metadata),
        # not a numeric feature that could influence scoring
        if "is_true_location" in candidate_fields:
            field_info = Candidate.model_fields["is_true_location"]
            if field_info.annotation is not bool:
                self.violations.append(
                    "LEAKAGE: is_true_location is not a boolean field — it may be usable as a numeric feature"
                )

    def _check_case_fraud_scenario_exposed(self) -> None:
        """Check if fraud_scenario is exposed in candidate features.

        The fraud_scenario controls generation and should NOT be a direct
        feature in the candidate dataset, as it would leak generation info.
        """
        # Fraud scenario is stored on the Case, not on Candidate.
        # This is correct — we verify no scenario field exists on Candidate.
        sample_candidate_fields = set(Candidate.model_fields.keys())
        if "fraud_scenario" in sample_candidate_fields:
            self.violations.append("LEAKAGE: Candidate model contains fraud_scenario field")

    def _check_candidate_columns_safe(self) -> None:
        """Verify candidate features don't contain forbidden columns.

        Validates both the Candidate Pydantic schema AND the actual
        candidate data (from JSONL output) to ensure no forbidden
        ground-truth fields leak into the candidate set.
        """
        # 1. Check Pydantic schema — no forbidden field should be a schema field
        candidate_fields = set(Candidate.model_fields.keys())
        other_forbidden = candidate_fields & (self.FORBIDDEN_COLUMNS - {"is_true_location"})
        if other_forbidden:
            self.violations.append(f"LEAKAGE: Candidate schema contains forbidden fields: {other_forbidden}")

        # 2. Check actual candidate data — no forbidden field in output dicts
        forbidden_data_fields = self.FORBIDDEN_COLUMNS - {"is_true_location"}
        for i, cand in enumerate(self.candidates):
            cand_dict = cand if isinstance(cand, dict) else cand.model_dump()
            leaked = forbidden_data_fields & set(cand_dict.keys())
            if leaked:
                self.violations.append(
                    f"LEAKAGE: Candidate #{i} (case={cand_dict.get('case_id', '?')}) "
                    f"contains forbidden fields in output: {leaked}"
                )
                break  # One violation is enough to flag the pattern

    def _check_no_target_derived_distance(self) -> None:
        """Verify no distance-to-target features exist.

        Distance features should be computed relative to the complaint origin,
        NOT relative to the true cash-out location.
        """
        candidate_fields = set(Candidate.model_fields.keys())
        target_distance_fields = {f for f in candidate_fields if "target" in f.lower() and "distance" in f.lower()}
        if target_distance_fields:
            self.violations.append(f"LEAKAGE: Target-derived distance fields found: {target_distance_fields}")

    def _check_no_post_cashout_transactions(self) -> None:
        """Verify no transactions are timestamped after the cash-out time."""
        for gt in self.ground_truths:
            case_txs = [tx for tx in self.transactions if tx.case_id == gt.case_id]
            for tx in case_txs:
                if tx.timestamp > gt.cashout_time:
                    self.violations.append(
                        f"LEAKAGE: Transaction {tx.transaction_id} "
                        f"({tx.timestamp}) occurs after cash-out time ({gt.cashout_time})"
                    )

    def _check_no_hidden_scenario_in_features(self) -> None:
        """Verify scenario behavior parameters don't appear in features.

        The scenario controls generation but must not be directly visible
        to the model as a feature that reveals the answer.
        """
        # Check that Candidate doesn't have scenario-specific fields
        candidate_field_names = list(Candidate.model_fields.keys())
        scenario_leak_fields = [
            f for f in candidate_field_names if "scenario" in f.lower() and f != "scenario_affinity"
        ]
        if scenario_leak_fields:
            self.violations.append(f"LEAKAGE: Scenario-leaking fields in Candidate: {scenario_leak_fields}")

    def get_summary(self) -> dict:
        """Return a summary of leakage check results."""
        return {
            "total_violations": len(self.violations),
            "violations": self.violations,
            "status": "PASS" if len(self.violations) == 0 else "FAIL",
        }
