"""Main synthetic data generator orchestrator.

Coordinates all sub-generators to produce a complete synthetic dataset.
Ensures reproducibility via seeded RNG.

Scale note (dataset v0.2.0): the generator is deterministic under a fixed
seed. Case origins are distributed across cities using tier weights from the
config (Tier-1 cities receive the most cases), so no single city dominates
the corpus.
"""

from __future__ import annotations

import json
import logging
import math
import random
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .candidates import (
    generate_candidates_for_case,
    label_candidates_with_ground_truth,
)
from .config import load_config
from .ground_truth import generate_ground_truth
from .locations import generate_locations
from .scenarios import get_scenario_behavior, get_scenario_weights
from .schema import (
    Case,
    DatasetManifest,
)
from .transactions import generate_accounts_for_case, generate_all_transactions
from .validation import DataValidator

logger = logging.getLogger(__name__)


def _tier_weights(config: dict[str, Any]) -> dict[int, float]:
    """Resolve origin tier weights from config (default preserves old behaviour).

    Accepts both ``tier1: 3.0`` and ``1: 3.0`` style keys.
    """
    raw = config.get("geography", {}).get("origin_tier_weights", {})
    weights: dict[int, float] = {}
    for key, weight in raw.items():
        tier = int(str(key).replace("tier", "").replace("_", ""))
        if weight > 0:
            weights[tier] = float(weight)
    return weights


def _generate_cases(
    config: dict[str, Any],
    locations: list,
    rng: random.Random,
) -> list[Case]:
    """Generate synthetic cases with tier-weighted origin distribution."""
    gen_params = config.get("generation", {})
    case_count = gen_params.get("case_count", 80)
    scenario_weights = get_scenario_weights(config)

    # Build metro index from locations (single pass, reused per case).
    metro_to_locations: dict[str, list] = {}
    for loc in locations:
        metro_to_locations.setdefault(loc.metro, []).append(loc)

    metros = sorted(metro_to_locations.keys())
    cases = []
    scenarios = list(scenario_weights.keys())
    weights = list(scenario_weights.values())

    # Tier-weighted origin selection. Falls back to uniform when the config
    # has no tier weights (or the config metros carry no tier field).
    tier_weights = _tier_weights(config)
    metro_cfg_by_name = {m["name"]: m for m in config.get("geography", {}).get("metros", [])}
    metro_sampling_weights: list[float] | None = None
    if tier_weights:
        metro_sampling_weights = []
        for name in metros:
            tier = int(metro_cfg_by_name.get(name, {}).get("tier", 3))
            metro_sampling_weights.append(tier_weights.get(tier, 1.0))

    # Deterministic complaint-time window (default preserves old behaviour).
    window_days = int(gen_params.get("complaint_window_days", 180))
    window_seconds = window_days * 24 * 3600

    # Lognormal amount distribution (falls back to uniform when absent).
    amount_cfg = config.get("transactions", {}).get("amount_lognormal", {})
    min_amount = config.get("transactions", {}).get("min_amount", 2000)
    max_amount = config.get("transactions", {}).get("max_amount", 450000)

    for i in range(case_count):
        case_id = f"CASE_{i + 1:04d}"
        scenario = rng.choices(scenarios, weights=weights, k=1)[0]
        behavior = get_scenario_behavior(scenario)

        # Random complaint time within a synthetic window. One uniform draw
        # over the whole window (second resolution) instead of separate
        # day/hour/minute draws, so scaling the window does not concentrate
        # all cases in the first N days.
        complaint_time = datetime(2025, 1, 1) + timedelta(seconds=rng.randint(0, window_seconds - 1))

        # Origin metro and location (tier-weighted when configured)
        if metro_sampling_weights:
            origin_metro = rng.choices(metros, weights=metro_sampling_weights, k=1)[0]
        else:
            origin_metro = rng.choice(metros)
        origin_loc = rng.choice(metro_to_locations[origin_metro])

        # Amount (synthetic distribution): lognormal with a heavy right tail,
        # clipped to the configured [min, max] band.
        if amount_cfg:
            reported_amount = math.exp(rng.gauss(float(amount_cfg["mu"]), float(amount_cfg["sigma"])))
            reported_amount = min(max(reported_amount, min_amount), max_amount)
        else:
            reported_amount = rng.uniform(min_amount, max_amount)
        reported_amount = round(reported_amount, 2)

        # Number of accounts and transactions
        min_hops = behavior.min_hops
        max_hops = behavior.max_hops
        num_transactions = rng.randint(min_hops, max_hops)
        num_accounts = num_transactions + 1

        cases.append(
            Case(
                case_id=case_id,
                complaint_time=complaint_time,
                fraud_scenario=scenario,
                reported_amount=reported_amount,
                origin_metro=origin_metro,
                origin_location_id=origin_loc.location_id,
                num_accounts_involved=num_accounts,
                num_transactions=num_transactions,
                metadata={
                    "generation_seed_note": "synthetic",
                },
            )
        )

    return cases


def generate_dataset(
    config_path: str | Path | None = None,
    output_dir: str | Path | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate a complete synthetic dataset.

    This is the main entry point for data generation.

    Args:
        config_path: Path to config file. Uses default if None.
        output_dir: Directory to write output files. Uses default if None.
        seed: Random seed override. Uses config seed if None.

    Returns:
        Dictionary with generation results and statistics.
    """
    # Load config
    config = load_config(config_path)

    # Resolve seed
    if seed is None:
        seed = config.get("generation", {}).get("random_seed", 42)

    rng = random.Random(seed)
    logger.info(f"Generating dataset with seed={seed}")

    # Resolve output directory
    if output_dir is None:
        # When running under pytest, use a temporary directory by default
        # to avoid overwriting the canonical synthetic dataset in data/
        import sys

        if "pytest" in sys.modules:
            import tempfile

            output_dir = Path(tempfile.mkdtemp(prefix="sentinel_test_"))
        else:
            output_dir = Path(__file__).parent.parent.parent / "data"
    else:
        output_dir = Path(output_dir)

    generated_dir = output_dir / "generated"
    evaluation_dir = output_dir / "evaluation"
    manifests_dir = output_dir / "manifests"
    schemas_dir = output_dir / "schemas"

    for d in [generated_dir, evaluation_dir, manifests_dir, schemas_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Step 1: Generate locations
    geo_config = config.get("geography", {})
    locations = generate_locations(geo_config, rng)
    logger.info(f"Generated {len(locations)} locations")

    # Step 2: Generate cases
    cases = _generate_cases(config, locations, rng)
    logger.info(f"Generated {len(cases)} cases")

    # Step 3: Generate accounts and transactions
    all_accounts = {}
    for case in cases:
        behavior = get_scenario_behavior(case.fraud_scenario)
        accounts = generate_accounts_for_case(case, behavior, rng)
        all_accounts[case.case_id] = accounts

    flat_accounts = [a for acct_list in all_accounts.values() for a in acct_list]
    transactions = generate_all_transactions(cases, all_accounts, locations, rng)
    logger.info(f"Generated {len(transactions)} transactions across {len(flat_accounts)} accounts")

    # Step 4: Generate ground truth (evaluation only)
    # IMPORTANT: ground truth exists at this point but is NOT consumed during
    # candidate generation. Candidate generation must use observable evidence
    # only and is forbidden from reading this data.
    ground_truths = []
    for case in cases:
        case_txs = [tx for tx in transactions if tx.case_id == case.case_id]
        gt = generate_ground_truth(case, locations, case_txs, rng)
        ground_truths.append(gt)
    logger.info(f"Generated {len(ground_truths)} ground truth entries")

    # Step 5: Generate candidates WITHOUT accessing ground truth.
    # Candidate generation receives the case, the case's transactions (as
    # observable evidence), the full location pool, and config/RNG. It does
    # NOT receive the hidden ground truth.
    candidates = []
    candidate_config = config.get("candidates", {})
    for case in cases:
        case_txs = [tx for tx in transactions if tx.case_id == case.case_id]
        case_cands = generate_candidates_for_case(case, case_txs, locations, candidate_config, rng)
        candidates.extend(case_cands)

    # Step 5b: Attach is_true_location flag using ground truth (post-generation).
    # This is the ONLY place where ground truth is used to mark candidates,
    # and the flag is stripped from model-visible output below.
    gt_by_case = {gt.case_id: gt.actual_cashout_location_id for gt in ground_truths}
    label_candidates_with_ground_truth(candidates, gt_by_case)
    logger.info(f"Generated {len(candidates)} candidates across {len(cases)} cases")

    # Step 6: Build manifest
    gen_params = config.get("generation", {})
    scenario_dist = {}
    for case in cases:
        s = case.fraud_scenario.value
        scenario_dist[s] = scenario_dist.get(s, 0) + 1

    # City/state distributions for dataset-scale reporting. Locations carry
    # region (sub-metro) names only; state comes from the geography config.
    metro_cfg_by_name = {m["name"]: m for m in geo_config.get("metros", [])}
    cases_per_city = Counter(case.origin_metro for case in cases)
    state_of_metro = {name: str(cfg.get("state", "Unknown")) for name, cfg in metro_cfg_by_name.items()}
    cases_per_state = Counter()
    for city, count in cases_per_city.items():
        cases_per_state[state_of_metro.get(city, "Unknown")] += count

    manifest = DatasetManifest(
        dataset_version=gen_params.get("dataset_version", "0.1.0"),
        generator_version=gen_params.get("generator_version", "0.1.0"),
        schema_version=gen_params.get("schema_version", "0.1.0"),
        random_seed=seed,
        case_count=len(cases),
        generation_timestamp=datetime.now(),
        total_transactions=len(transactions),
        total_locations=len(locations),
        total_candidates=len(candidates),
        scenario_distribution=scenario_dist,
        cases_per_city=dict(sorted(cases_per_city.items())),
        cases_per_state=dict(sorted(cases_per_state.items())),
    )

    # Step 7: Write model-visible data
    _write_jsonl(
        generated_dir / "cases.jsonl",
        [c.model_dump(mode="json") for c in cases],
    )
    _write_jsonl(
        generated_dir / "accounts.jsonl",
        [a.model_dump(mode="json") for a in flat_accounts],
    )
    _write_jsonl(
        generated_dir / "transactions.jsonl",
        [t.model_dump(mode="json") for t in transactions],
    )
    _write_jsonl(
        generated_dir / "locations.jsonl",
        [loc.model_dump(mode="json") for loc in locations],
    )
    # Candidates: exclude is_true_location from model-visible output
    candidates_visible = []
    for c in candidates:
        d = c.model_dump(mode="json")
        d.pop("is_true_location", None)
        candidates_visible.append(d)
    _write_jsonl(generated_dir / "candidates.jsonl", candidates_visible)

    # Step 8: Write evaluation data (ground truth — NEVER model-visible)
    _write_jsonl(
        evaluation_dir / "ground_truth.jsonl",
        [gt.model_dump(mode="json") for gt in ground_truths],
    )

    # Step 9: Write manifest
    _write_json(
        manifests_dir / f"manifest_{manifest.dataset_version}.json",
        manifest.model_dump(mode="json"),
    )

    # Step 10: Run validation
    validator = DataValidator(
        cases=cases,
        accounts=flat_accounts,
        transactions=transactions,
        locations=locations,
        candidates=candidates,
        ground_truths=ground_truths,
        manifest=manifest,
    )
    validation_errors = validator.validate_all()

    if validation_errors:
        logger.error(f"Validation found {len(validation_errors)} errors:")
        for err in validation_errors:
            logger.error(f"  - {err}")
    else:
        logger.info("All validation checks passed")

    return {
        "seed": seed,
        "case_count": len(cases),
        "account_count": len(flat_accounts),
        "transaction_count": len(transactions),
        "location_count": len(locations),
        "candidate_count": len(candidates),
        "ground_truth_count": len(ground_truths),
        "scenario_distribution": scenario_dist,
        "cases_per_city": manifest.cases_per_city,
        "cases_per_state": manifest.cases_per_state,
        "validation_errors": validation_errors,
        "output_dir": str(output_dir),
    }


def _write_jsonl(path: Path, data: list[dict]) -> None:
    """Write data as JSONL (one JSON object per line)."""
    with open(path, "w", encoding="utf-8") as f:
        for record in data:
            f.write(json.dumps(record, default=str) + "\n")
    logger.debug(f"Wrote {len(data)} records to {path}")


def _write_json(path: Path, data: dict) -> None:
    """Write a single JSON file."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    logger.debug(f"Wrote manifest to {path}")
