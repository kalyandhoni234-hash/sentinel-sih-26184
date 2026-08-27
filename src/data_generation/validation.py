"""Automated data validation for the synthetic dataset.

Checks schema correctness, referential integrity, and data quality.
"""

from __future__ import annotations

import logging
from datetime import datetime

from .schema import (
    Account,
    Case,
    Candidate,
    DatasetManifest,
    GroundTruth,
    Location,
    Transaction,
)

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Raised when data validation fails."""
    pass


class DataValidator:
    """Validates the complete synthetic dataset."""

    def __init__(
        self,
        cases: list[Case],
        accounts: list[Account],
        transactions: list[Transaction],
        locations: list[Location],
        candidates: list[Candidate],
        ground_truths: list[GroundTruth],
        manifest: DatasetManifest,
    ):
        self.cases = cases
        self.accounts = accounts
        self.transactions = transactions
        self.locations = locations
        self.candidates = candidates
        self.ground_truths = ground_truths
        self.manifest = manifest
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def validate_all(self) -> list[str]:
        """Run all validation checks. Returns list of error messages."""
        self.errors = []
        self.warnings = []

        self._check_schema_correctness()
        self._check_duplicate_ids()
        self._check_timestamps()
        self._check_coordinates()
        self._check_foreign_keys()
        self._check_missing_values()
        self._check_candidate_integrity()
        self._check_ground_truth_coverage()
        self._check_ground_truth_isolation()
        self._check_manifest_consistency()

        return self.errors

    def _check_schema_correctness(self) -> None:
        """Verify all entities have required fields."""
        for case in self.cases:
            if not case.case_id:
                self.errors.append("Case with empty case_id")
            if case.reported_amount <= 0:
                self.errors.append(f"Case {case.case_id}: reported_amount must be positive")

        for acct in self.accounts:
            if not acct.account_id:
                self.errors.append("Account with empty account_id")

        for tx in self.transactions:
            if not tx.transaction_id:
                self.errors.append("Transaction with empty transaction_id")
            if tx.amount <= 0:
                self.errors.append(f"Transaction {tx.transaction_id}: amount must be positive")

    def _check_duplicate_ids(self) -> None:
        """Check for duplicate IDs across entities."""
        case_ids = [c.case_id for c in self.cases]
        if len(case_ids) != len(set(case_ids)):
            dupes = [id for id in case_ids if case_ids.count(id) > 1]
            self.errors.append(f"Duplicate case IDs: {set(dupes)}")

        acct_ids = [a.account_id for a in self.accounts]
        if len(acct_ids) != len(set(acct_ids)):
            self.errors.append("Duplicate account IDs found")

        tx_ids = [t.transaction_id for t in self.transactions]
        if len(tx_ids) != len(set(tx_ids)):
            self.errors.append("Duplicate transaction IDs found")

        loc_ids = [l.location_id for l in self.locations]
        if len(loc_ids) != len(set(loc_ids)):
            self.errors.append("Duplicate location IDs found")

    def _check_timestamps(self) -> None:
        """Verify timestamps are valid and ordered."""
        for case in self.cases:
            if not isinstance(case.complaint_time, datetime):
                self.errors.append(f"Case {case.case_id}: invalid complaint_time")

        for tx in self.transactions:
            if not isinstance(tx.timestamp, datetime):
                self.errors.append(f"Transaction {tx.transaction_id}: invalid timestamp")

        # Check transaction ordering within cases
        for case in self.cases:
            case_txs = sorted(
                [tx for tx in self.transactions if tx.case_id == case.case_id],
                key=lambda t: t.sequence_number,
            )
            for i in range(1, len(case_txs)):
                if case_txs[i].timestamp < case_txs[i - 1].timestamp:
                    self.warnings.append(
                        f"Case {case.case_id}: transaction {case_txs[i].transaction_id} "
                        f"timestamp before previous transaction"
                    )

    def _check_coordinates(self) -> None:
        """Verify all coordinates are valid."""
        for loc in self.locations:
            if not (-90 <= loc.latitude <= 90):
                self.errors.append(
                    f"Location {loc.location_id}: latitude {loc.latitude} out of range"
                )
            if not (-180 <= loc.longitude <= 180):
                self.errors.append(
                    f"Location {loc.location_id}: longitude {loc.longitude} out of range"
                )

    def _check_foreign_keys(self) -> None:
        """Verify referential integrity."""
        case_ids = {c.case_id for c in self.cases}
        location_ids = {l.location_id for l in self.locations}

        # Accounts reference valid cases
        for acct in self.accounts:
            if acct.case_id not in case_ids:
                self.errors.append(
                    f"Account {acct.account_id} references non-existent case {acct.case_id}"
                )

        # Transactions reference valid cases and accounts
        account_ids = {a.account_id for a in self.accounts}
        for tx in self.transactions:
            if tx.case_id not in case_ids:
                self.errors.append(
                    f"Transaction {tx.transaction_id} references non-existent case {tx.case_id}"
                )
            if tx.sender_account_id not in account_ids:
                self.errors.append(
                    f"Transaction {tx.transaction_id} references non-existent sender account"
                )
            if tx.receiver_account_id not in account_ids:
                self.errors.append(
                    f"Transaction {tx.transaction_id} references non-existent receiver account"
                )

        # Candidates reference valid cases and locations
        for cand in self.candidates:
            if cand.case_id not in case_ids:
                self.errors.append(
                    f"Candidate references non-existent case {cand.case_id}"
                )
            if cand.location_id not in location_ids:
                self.errors.append(
                    f"Candidate references non-existent location {cand.location_id}"
                )

        # Ground truths reference valid cases and locations
        for gt in self.ground_truths:
            if gt.case_id not in case_ids:
                self.errors.append(
                    f"Ground truth references non-existent case {gt.case_id}"
                )
            if gt.actual_cashout_location_id not in location_ids:
                self.errors.append(
                    f"Ground truth references non-existent location {gt.actual_cashout_location_id}"
                )

    def _check_missing_values(self) -> None:
        """Check for missing required values."""
        for case in self.cases:
            if not case.origin_metro:
                self.errors.append(f"Case {case.case_id}: empty origin_metro")
            if not case.origin_location_id:
                self.errors.append(f"Case {case.case_id}: empty origin_location_id")

    def _check_candidate_integrity(self) -> None:
        """Verify candidate set properties."""
        case_candidate_counts = {}
        for cand in self.candidates:
            case_candidate_counts[cand.case_id] = case_candidate_counts.get(cand.case_id, 0) + 1

        for case in self.cases:
            count = case_candidate_counts.get(case.case_id, 0)
            if count < 5:
                self.errors.append(
                    f"Case {case.case_id}: only {count} candidates (minimum 5 required)"
                )

    def _check_ground_truth_coverage(self) -> None:
        """Verify every case has a ground truth."""
        gt_case_ids = {gt.case_id for gt in self.ground_truths}
        for case in self.cases:
            if case.case_id not in gt_case_ids:
                self.errors.append(f"Case {case.case_id}: missing ground truth")

    def _check_ground_truth_isolation(self) -> None:
        """Verify the true location is present in the candidate set."""
        for gt in self.ground_truths:
            matching_candidates = [
                c for c in self.candidates
                if c.case_id == gt.case_id and c.location_id == gt.actual_cashout_location_id
            ]
            if not matching_candidates:
                self.errors.append(
                    f"Case {gt.case_id}: true location {gt.actual_cashout_location_id} "
                    f"not in candidate set"
                )

    def _check_manifest_consistency(self) -> None:
        """Verify manifest counts match actual data."""
        if self.manifest.case_count != len(self.cases):
            self.errors.append(
                f"Manifest case_count {self.manifest.case_count} != actual {len(self.cases)}"
            )
        if self.manifest.total_transactions != len(self.transactions):
            self.errors.append(
                f"Manifest total_transactions {self.manifest.total_transactions} "
                f"!= actual {len(self.transactions)}"
            )
        if self.manifest.total_locations != len(self.locations):
            self.errors.append(
                f"Manifest total_locations {self.manifest.total_locations} "
                f"!= actual {len(self.locations)}"
            )

    def get_summary(self) -> dict:
        """Return a summary of the validation results."""
        return {
            "total_errors": len(self.errors),
            "total_warnings": len(self.warnings),
            "errors": self.errors,
            "warnings": self.warnings,
            "cases": len(self.cases),
            "accounts": len(self.accounts),
            "transactions": len(self.transactions),
            "locations": len(self.locations),
            "candidates": len(self.candidates),
            "ground_truths": len(self.ground_truths),
        }
