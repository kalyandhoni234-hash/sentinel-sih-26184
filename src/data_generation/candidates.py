"""Synthetic candidate location generator.

For each case, generates a set of candidate cash-out locations drawn
exclusively from information available BEFORE the target is known:

- The complaint origin (case.origin_metro, case.origin_location_id)
- The known transaction chain endpoints (last sender / receiver metros)
- All known locations in the synthetic geographic environment
- Public location metadata (type, density, attractiveness)

CRITICAL: This module MUST NOT receive, read, or use the hidden ground
truth to construct the candidate set. In particular:

- The true cash-out location is never inserted because it is the answer.
- Hard negatives are NOT selected based on their distance to the target.
- Selection rules depend only on observable evidence and seeded randomness.

After the candidate set is generated, the (separate) label step in
``generator.label_candidates_with_ground_truth`` attaches the
``is_true_location`` flag for evaluation only. That flag is stripped from
model-visible output and never enters model features.
"""

from __future__ import annotations

import random
from typing import Any

from .locations import compute_distance_km, find_nearest_locations
from .schema import Candidate, Case, Location, Transaction

# ---------------------------------------------------------------------------
# Observable-evidence scoring helpers
# ---------------------------------------------------------------------------


def _compute_scenario_affinity(
    case: Case,
    location: Location,
) -> float:
    """Compute how well a location fits the fraud scenario (observable rule)."""
    affinity = 0.5  # baseline

    if case.fraud_scenario.value in ("DIRECT_CASHOUT", "RAPID_MULE_CHAIN"):
        if location.location_type.value in ("ATM", "BANK_BRANCH"):
            affinity += 0.3
        elif location.location_type.value in ("MONEY_TRANSFER_AGENT",):
            affinity += 0.2
    elif case.fraud_scenario.value == "MULTI_HOP":
        if location.location_type.value in ("BANK_BRANCH", "COMMERCIAL_COMPLEX"):
            affinity += 0.25
    elif case.fraud_scenario.value == "GEOGRAPHIC_JUMP":
        affinity += 0.1
    elif case.fraud_scenario.value == "URBAN_CLUSTER":
        if location.density_score > 0.6:
            affinity += 0.2
    elif case.fraud_scenario.value == "DISPERSED_ACTIVITY":
        if location.location_type.value in ("TRANSPORT_HUB", "MARKET"):
            affinity += 0.2

    return min(affinity, 1.0)


def _compute_transaction_proximity_score(
    case: Case,
    location: Location,
    all_locations: list[Location],
    evidence_anchor: Location | None,
) -> float:
    """Compute proximity to the observable evidence anchor (origin or last TX).

    The model does not see the true cash-out location, so proximity is scored
    against the best available OBSERVABLE anchor: the last known transaction
    receiver, falling back to the complaint origin.
    """
    anchor = evidence_anchor
    if anchor is None:
        anchor = next(
            (loc for loc in all_locations if loc.location_id == case.origin_location_id),
            None,
        )
    if not anchor:
        return 0.5

    dist = compute_distance_km(
        anchor.latitude,
        anchor.longitude,
        location.latitude,
        location.longitude,
    )

    if dist < 5:
        return 0.9
    elif dist < 15:
        return 0.7
    elif dist < 30:
        return 0.5
    elif dist < 60:
        return 0.3
    return 0.15


def _compute_temporal_plausibility(
    case: Case,
    location: Location,
) -> float:
    """Temporal plausibility based on observable metro context only."""
    if location.metro == case.origin_metro:
        return 0.85
    return 0.4


# ---------------------------------------------------------------------------
# Evidence-based selection helpers
# ---------------------------------------------------------------------------


def _derive_evidence_anchor(
    case: Case,
    case_transactions: list[Transaction],
    locations: list[Location],
) -> Location | None:
    """Pick the best available OBSERVABLE anchor for proximity scoring.

    Priority:
      1. The last pre-complaint transaction's receiver location (if known)
      2. The complaint origin location (always available)
    """
    pre_complaint = [tx for tx in case_transactions if tx.timestamp <= case.complaint_time]
    if pre_complaint:
        last_tx = max(pre_complaint, key=lambda t: t.timestamp)
        # The receiver metro is observable, but exact receiver location is not.
        # Use any known location in that metro as the observable anchor.
        in_receiver_metro = [loc for loc in locations if loc.metro == last_tx.receiver_metro]
        if in_receiver_metro:
            # Deterministic-ish pick: the highest cash-out attractiveness in that metro.
            return max(in_receiver_metro, key=lambda location: location.cash_out_attractiveness)

    return next(
        (loc for loc in locations if loc.location_id == case.origin_location_id),
        None,
    )


def _derive_evidence_metros(
    case: Case,
    case_transactions: list[Transaction],
) -> set[str]:
    """Derive the set of metros that are observable from the case."""
    metros: set[str] = {case.origin_metro}
    for tx in case_transactions:
        if tx.timestamp > case.complaint_time:
            continue
        if tx.sender_metro:
            metros.add(tx.sender_metro)
        if tx.receiver_metro:
            metros.add(tx.receiver_metro)
    return metros


def _generate_hard_negatives(
    case: Case,
    locations: list[Location],
    evidence_anchor: Location | None,
    evidence_metros: set[str],
    rng: random.Random,
    count: int,
) -> list[Location]:
    """Generate hard negative candidates using ONLY non-target evidence.

    Hard negatives are designed to be confusing WITHOUT conditioning on the
    true cash-out location. They are anchored on:

      1. Observable anchor (last TX receiver or complaint origin)
      2. Observable metros (from the transaction chain)
      3. General location metadata

    No distance is computed to the hidden target.
    """
    if count <= 0:
        return []

    hard_negatives: list[Location] = []
    origin_metro = case.origin_metro
    same_metro = [loc for loc in locations if loc.metro == origin_metro and loc != evidence_anchor]
    diff_metro = [loc for loc in locations if loc.metro not in evidence_metros]

    # Type 1: Geographically close to evidence anchor but different type
    if evidence_anchor is not None:
        nearby = find_nearest_locations(evidence_anchor.latitude, evidence_anchor.longitude, locations, k=15)
        close_wrong_type = [
            loc
            for loc, dist in nearby
            if loc.location_id != evidence_anchor.location_id
            and loc.location_type != evidence_anchor.location_type
            and dist < 10
        ]
        hard_negatives.extend(
            rng.sample(
                close_wrong_type,
                k=min(count // 4, len(close_wrong_type)),
            )
        )

    # Type 2: Same metro, far from evidence anchor
    if same_metro and evidence_anchor is not None:
        far_same_metro = [
            loc
            for loc in same_metro
            if compute_distance_km(
                evidence_anchor.latitude,
                evidence_anchor.longitude,
                loc.latitude,
                loc.longitude,
            )
            > 15
        ]
        hard_negatives.extend(
            rng.sample(
                far_same_metro,
                k=min(count // 4, len(far_same_metro)),
            )
        )

    # Type 3: High density but from a non-observable metro
    if diff_metro:
        high_density_diff = [loc for loc in diff_metro if loc.density_score > 0.6]
        hard_negatives.extend(
            rng.sample(
                high_density_diff,
                k=min(count // 4, len(high_density_diff)),
            )
        )

    # Type 4: Good cash-out type fit in a different (non-observable) metro
    type_match_diff = [
        loc for loc in diff_metro if loc.location_type.value in ("ATM", "BANK_BRANCH", "MONEY_TRANSFER_AGENT")
    ]
    hard_negatives.extend(
        rng.sample(
            type_match_diff,
            k=min(count // 4, len(type_match_diff)),
        )
    )

    seen: set[str] = set()
    unique: list[Location] = []
    for loc in hard_negatives:
        if loc.location_id not in seen:
            seen.add(loc.location_id)
            unique.append(loc)
    return unique[:count]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_candidates_for_case(
    case: Case,
    case_transactions: list[Transaction],
    locations: list[Location],
    candidate_config: dict[str, Any],
    rng: random.Random,
) -> list[Candidate]:
    """Generate the candidate set for a single case from observable evidence.

    The candidate set is built entirely from query-time information that does
    NOT include the hidden ground truth. Concretely:

    - The true cash-out location is never inserted by force.
    - Hard negatives are selected relative to the observable evidence anchor
      (last known TX receiver, falling back to complaint origin), NOT relative
      to the hidden target.
    - Observable metros come from the case + transaction chain only.

    Args:
        case: The case.
        case_transactions: All transactions for this case (used to derive an
            observable evidence anchor and observable metros).
        locations: All candidate locations.
        candidate_config: Candidate generation config.
        rng: Seeded RNG.

    Returns:
        List of Candidate objects WITHOUT the ``is_true_location`` flag set
        (the flag is attached by ``label_candidates_with_ground_truth`` after
        candidate generation is complete).
    """
    min_candidates = candidate_config.get("min_per_case", 10)
    max_candidates = candidate_config.get("max_per_case", 18)
    target_count = rng.randint(min_candidates, max_candidates)

    evidence_anchor = _derive_evidence_anchor(case, case_transactions, locations)
    evidence_metros = _derive_evidence_metros(case, case_transactions)

    # Resolve a usable origin location for the distance-from-origin feature.
    # This is observable evidence, NOT the hidden target.
    origin_loc = next(
        (loc for loc in locations if loc.location_id == case.origin_location_id),
        None,
    )

    candidates: list[Candidate] = []
    used_location_ids: set[str] = set()

    # 1. Hard negatives (drawn from observable evidence, no target access)
    hard_neg_count = min(target_count // 2, 8)
    hard_negatives = _generate_hard_negatives(case, locations, evidence_anchor, evidence_metros, rng, hard_neg_count)
    for loc in hard_negatives:
        if loc.location_id in used_location_ids:
            continue
        dist = 0.0
        if origin_loc:
            dist = compute_distance_km(
                origin_loc.latitude,
                origin_loc.longitude,
                loc.latitude,
                loc.longitude,
            )
        candidates.append(
            Candidate(
                case_id=case.case_id,
                location_id=loc.location_id,
                distance_from_origin_km=round(dist, 2),
                scenario_affinity=round(_compute_scenario_affinity(case, loc), 4),
                transaction_proximity_score=round(
                    _compute_transaction_proximity_score(case, loc, locations, evidence_anchor),
                    4,
                ),
                temporal_plausibility=round(_compute_temporal_plausibility(case, loc), 4),
                density_score=loc.density_score,
                is_true_location=False,
            )
        )
        used_location_ids.add(loc.location_id)

    # 2. Random plausible candidates from the full location pool
    remaining_count = target_count - len(candidates)
    available = [loc for loc in locations if loc.location_id not in used_location_ids]

    if available and remaining_count > 0:
        random_candidates = rng.sample(
            available,
            k=min(remaining_count, len(available)),
        )
        for loc in random_candidates:
            dist = 0.0
            if origin_loc:
                dist = compute_distance_km(
                    origin_loc.latitude,
                    origin_loc.longitude,
                    loc.latitude,
                    loc.longitude,
                )
            candidates.append(
                Candidate(
                    case_id=case.case_id,
                    location_id=loc.location_id,
                    distance_from_origin_km=round(dist, 2),
                    scenario_affinity=round(_compute_scenario_affinity(case, loc), 4),
                    transaction_proximity_score=round(
                        _compute_transaction_proximity_score(case, loc, locations, evidence_anchor),
                        4,
                    ),
                    temporal_plausibility=round(_compute_temporal_plausibility(case, loc), 4),
                    density_score=loc.density_score,
                    is_true_location=False,
                )
            )

    # NOTE: is_true_location is left False on every candidate. It is attached
    # later by label_candidates_with_ground_truth() using the (hidden) ground
    # truth, and then stripped from model-visible output in the generator.
    return candidates


def label_candidates_with_ground_truth(
    candidates: list[Candidate],
    ground_truths_by_case: dict[str, str],
) -> None:
    """Attach the is_true_location flag to candidates using ground truth.

    This is the ONLY step that may read ground truth to mark candidates.
    It runs strictly AFTER candidate generation and BEFORE model-visible output
    is written. The flag is stripped before being written to the model-visible
    candidates.jsonl file.

    Args:
        candidates: Candidate list (mutated in place).
        ground_truths_by_case: Mapping of case_id -> true location_id.

    Note:
        If the true location is not in the candidate set for a given case,
        no candidate for that case is marked. This is the intended behaviour:
        candidate generation is target-independent.
    """
    for cand in candidates:
        true_loc = ground_truths_by_case.get(cand.case_id)
        if true_loc is not None and cand.location_id == true_loc:
            cand.is_true_location = True
