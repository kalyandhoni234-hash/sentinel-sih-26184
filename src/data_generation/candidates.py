"""Synthetic candidate location generator.

For each case, generates a set of candidate cash-out locations that includes:
- The true location (hidden from the model)
- Hard negatives (designed to confuse a simple model)
- Plausible nearby locations
- Weaker candidates

Hard negatives ensure the model cannot win by simply choosing
the nearest location or the one with the highest density.
"""

from __future__ import annotations

import random
from typing import Any

from .locations import compute_distance_km, find_nearest_locations
from .schema import Candidate, Case, GroundTruth, Location


def _compute_scenario_affinity(
    case: Case,
    location: Location,
) -> float:
    """Compute how well a location fits the fraud scenario."""
    affinity = 0.5  # baseline

    # Location type affinity
    if case.fraud_scenario.value in ("DIRECT_CASHOUT", "RAPID_MULE_CHAIN"):
        if location.location_type.value in ("ATM", "BANK_BRANCH"):
            affinity += 0.3
        elif location.location_type.value in ("MONEY_TRANSFER_AGENT",):
            affinity += 0.2
    elif case.fraud_scenario.value == "MULTI_HOP":
        if location.location_type.value in ("BANK_BRANCH", "COMMERCIAL_COMPLEX"):
            affinity += 0.25
    elif case.fraud_scenario.value == "GEOGRAPHIC_JUMP":
        # Any type is plausible for jumps
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
) -> float:
    """Compute a transaction-based proximity score.

    This simulates how close the location is to transaction chain endpoints.
    Since the model doesn't see the true cash-out location, this is based on
    the origin location and general geographic context.
    """
    origin_loc = next(
        (loc for loc in all_locations if loc.location_id == case.origin_location_id),
        None,
    )
    if not origin_loc:
        return 0.5

    dist = compute_distance_km(
        origin_loc.latitude,
        origin_loc.longitude,
        location.latitude,
        location.longitude,
    )

    # Inverse distance score (closer = higher)
    if dist < 5:
        return 0.9
    elif dist < 15:
        return 0.7
    elif dist < 30:
        return 0.5
    elif dist < 60:
        return 0.3
    else:
        return 0.15


def _compute_temporal_plausibility(
    case: Case,
    location: Location,
) -> float:
    """Compute temporal plausibility for a location.

    Locations in the same metro as the complaint are more temporally plausible.
    """
    if location.metro == case.origin_metro:
        return 0.85
    else:
        # Different metro: still possible but less temporally plausible
        return 0.4


def _generate_hard_negatives(
    case: Case,
    true_location: Location,
    locations: list[Location],
    rng: random.Random,
    count: int,
) -> list[Location]:
    """Generate hard negative candidates.

    Hard negatives are designed to be confusing:
    1. Geographically close but type-wise implausible
    2. Same metro, similar type, but far away
    3. High density but wrong scenario fit
    4. Good scenario fit but different metro
    """
    hard_negatives: list[Location] = []
    same_metro = [
        loc for loc in locations if loc.metro == case.origin_metro and loc.location_id != true_location.location_id
    ]
    diff_metro = [loc for loc in locations if loc.metro != case.origin_metro]

    # Type 1: Geographically close but different type
    nearby = find_nearest_locations(true_location.latitude, true_location.longitude, locations, k=15)
    close_wrong_type = [
        loc
        for loc, dist in nearby
        if loc.location_id != true_location.location_id
        and loc.location_type != true_location.location_type
        and dist < 10
    ]
    hard_negatives.extend(
        rng.sample(
            close_wrong_type,
            k=min(count // 4, len(close_wrong_type)),
        )
    )

    # Type 2: Same metro, far away
    if same_metro:
        far_same_metro = [
            loc
            for loc in same_metro
            if compute_distance_km(
                true_location.latitude,
                true_location.longitude,
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

    # Type 3: High density but different metro
    if diff_metro:
        high_density_diff = [loc for loc in diff_metro if loc.density_score > 0.6]
        hard_negatives.extend(
            rng.sample(
                high_density_diff,
                k=min(count // 4, len(high_density_diff)),
            )
        )

    # Type 4: Good type fit but wrong metro
    type_match_diff = [
        loc for loc in diff_metro if loc.location_type.value in ("ATM", "BANK_BRANCH", "MONEY_TRANSFER_AGENT")
    ]
    hard_negatives.extend(
        rng.sample(
            type_match_diff,
            k=min(count // 4, len(type_match_diff)),
        )
    )

    # Deduplicate
    seen_ids = set()
    unique = []
    for loc in hard_negatives:
        if loc.location_id not in seen_ids:
            seen_ids.add(loc.location_id)
            unique.append(loc)

    return unique[:count]


def generate_candidates_for_case(
    case: Case,
    true_ground_truth: GroundTruth,
    locations: list[Location],
    candidate_config: dict[str, Any],
    rng: random.Random,
) -> list[Candidate]:
    """Generate candidate set for a single case.

    The candidate set always includes the true location and several
    hard negatives plus plausible alternatives.

    Args:
        case: The case.
        true_ground_truth: Hidden ground truth.
        locations: All locations.
        candidate_config: Candidate generation config.
        rng: Seeded RNG.

    Returns:
        List of Candidate objects.
    """
    min_candidates = candidate_config.get("min_per_case", 10)
    max_candidates = candidate_config.get("max_per_case", 18)
    target_count = rng.randint(min_candidates, max_candidates)

    true_loc = next(loc for loc in locations if loc.location_id == true_ground_truth.actual_cashout_location_id)

    candidates: list[Candidate] = []
    used_location_ids: set[str] = set()

    # 1. Add the true location
    origin_loc = next(
        (loc for loc in locations if loc.location_id == case.origin_location_id),
        None,
    )
    true_dist = 0.0
    if origin_loc:
        true_dist = compute_distance_km(
            origin_loc.latitude,
            origin_loc.longitude,
            true_loc.latitude,
            true_loc.longitude,
        )

    candidates.append(
        Candidate(
            case_id=case.case_id,
            location_id=true_loc.location_id,
            distance_from_origin_km=round(true_dist, 2),
            scenario_affinity=round(_compute_scenario_affinity(case, true_loc), 4),
            transaction_proximity_score=round(_compute_transaction_proximity_score(case, true_loc, locations), 4),
            temporal_plausibility=round(_compute_temporal_plausibility(case, true_loc), 4),
            density_score=true_loc.density_score,
            is_true_location=True,  # HIDDEN: evaluation only
        )
    )
    used_location_ids.add(true_loc.location_id)

    # 2. Add hard negatives
    hard_neg_count = min(target_count // 2, 8)
    hard_negatives = _generate_hard_negatives(case, true_loc, locations, rng, hard_neg_count)
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
                transaction_proximity_score=round(_compute_transaction_proximity_score(case, loc, locations), 4),
                temporal_plausibility=round(_compute_temporal_plausibility(case, loc), 4),
                density_score=loc.density_score,
                is_true_location=False,
            )
        )
        used_location_ids.add(loc.location_id)

    # 3. Add random plausible candidates
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
                    transaction_proximity_score=round(_compute_transaction_proximity_score(case, loc, locations), 4),
                    temporal_plausibility=round(_compute_temporal_plausibility(case, loc), 4),
                    density_score=loc.density_score,
                    is_true_location=False,
                )
            )

    return candidates
