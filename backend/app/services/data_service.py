"""Data loading and feature pipeline service.

Loads synthetic data from the generated dataset and builds feature matrices
using the existing Phase 1-2 infrastructure. This service handles:
- Loading JSONL files from the synthetic dataset
- Converting raw dicts to Case objects
- Building feature matrices via build_feature_matrix()
- Providing case metadata and location lookups

No ground-truth or Layer-C information is exposed through this service's
public interface except for the is_true_location metadata used internally
for feature matrix construction.
"""

from __future__ import annotations

import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from src.data_generation.features import build_feature_matrix
from src.data_generation.generator import generate_dataset
from src.data_generation.schema import Case, FraudScenario

logger = logging.getLogger(__name__)


class DataService:
    """Manages synthetic data loading and feature matrix construction.

    Generates data on first access (using temp directory) and caches
    the results for the application lifetime.
    """

    def __init__(self, seed: int = 42) -> None:
        self._seed = seed
        self._cases_raw: list[dict] = []
        self._candidates: list[dict] = []
        self._transactions: list[dict] = []
        self._locations: list[dict] = []
        self._ground_truths: list[dict] = []
        self._case_objects: list[Case] = []
        self._feature_matrix: list[dict[str, Any]] = []
        self._location_map: dict[str, dict] = {}
        self._loaded = False

    def load(self) -> None:
        """Generate and load synthetic data into memory."""
        if self._loaded:
            return

        logger.info("Generating synthetic dataset with seed=%d", self._seed)
        with tempfile.TemporaryDirectory() as tmpdir:
            result = generate_dataset(seed=self._seed, output_dir=tmpdir)
            out = Path(result["output_dir"])

            self._cases_raw = self._load_jsonl(out / "generated/cases.jsonl")
            self._candidates = self._load_jsonl(out / "generated/candidates.jsonl")
            self._transactions = self._load_jsonl(out / "generated/transactions.jsonl")
            self._locations = self._load_jsonl(out / "generated/locations.jsonl")
            self._ground_truths = self._load_jsonl(out / "evaluation/ground_truth.jsonl")

        # Build Case objects
        self._case_objects = []
        for c in self._cases_raw:
            self._case_objects.append(
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

        # Build location lookup
        self._location_map = {loc["location_id"]: loc for loc in self._locations}

        # Build feature matrix
        self._feature_matrix = build_feature_matrix(
            cases=self._case_objects,
            candidates=self._candidates,
            transactions=self._transactions,
            locations=self._locations,
            ground_truths=self._ground_truths,
        )

        self._loaded = True
        logger.info(
            "Loaded %d cases, %d candidates, %d features",
            len(self._case_objects),
            len(self._feature_matrix),
            len(self._get_feature_names()),
        )

    def get_all_cases(self) -> list[dict]:
        """Return all case records as raw dicts."""
        self.load()
        return self._cases_raw

    def get_case(self, case_id: str) -> dict | None:
        """Return a single case record by ID."""
        self.load()
        for c in self._cases_raw:
            if c["case_id"] == case_id:
                return c
        return None

    def get_case_ids(self) -> list[str]:
        """Return all case IDs."""
        self.load()
        return [c["case_id"] for c in self._cases_raw]

    def get_feature_rows_for_case(self, case_id: str) -> list[dict[str, Any]]:
        """Return feature matrix rows for a specific case."""
        self.load()
        return [row for row in self._feature_matrix if row["case_id"] == case_id]

    def get_location(self, location_id: str) -> dict | None:
        """Return location details by ID."""
        self.load()
        return self._location_map.get(location_id)

    def get_all_feature_rows(self) -> list[dict[str, Any]]:
        """Return the complete feature matrix."""
        self.load()
        return self._feature_matrix

    def get_train_test_split(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], set[str], set[str]]:
        """Return case-level 80/20 train/test split.

        Returns:
            (train_rows, test_rows, train_case_ids, test_case_ids)
        """
        self.load()
        case_ids = sorted({r["case_id"] for r in self._feature_matrix})
        split_idx = int(len(case_ids) * 0.8)
        train_ids = set(case_ids[:split_idx])
        test_ids = set(case_ids[split_idx:])
        train_rows = [r for r in self._feature_matrix if r["case_id"] in train_ids]
        test_rows = [r for r in self._feature_matrix if r["case_id"] in test_ids]
        return train_rows, test_rows, train_ids, test_ids

    def get_ground_truth_for_case(self, case_id: str) -> dict | None:
        """Return ground truth for a case (evaluation only, not exposed via API)."""
        self.load()
        for gt in self._ground_truths:
            if gt["case_id"] == case_id:
                return gt
        return None

    @staticmethod
    def _load_jsonl(path: Path) -> list[dict]:
        """Load a JSONL file."""
        records = []
        with open(path) as f:
            for line in f:
                records.append(json.loads(line))
        return records

    @staticmethod
    def _get_feature_names() -> list[str]:
        """Return feature names from the feature module."""
        from src.data_generation.features import FEATURE_NAMES

        return list(FEATURE_NAMES)
