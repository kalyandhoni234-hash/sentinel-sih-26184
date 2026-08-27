"""Hidden ground truth generator.

Generates the actual cash-out location for each case using a controlled
probabilistic mechanism. The ground truth is influenced by:

- Geographic plausibility (near transaction chain endpoints)
- Scenario behavior (cross-metro vs. local)
- Temporal plausibility
- Location attractiveness
- Controlled stochasticity

CRITICAL: The ground truth is NEVER exposed to the predictive model.
It is used ONLY for post-prediction evaluation.
"""

from __future__ import annotations

import random
from datetime import timedelta
from typing import Any

from .locations import compute_distance_km
from .scenarios import ScenarioBehavior, get_scenario_behavior
from .schema import Case, GroundTruth, Location, FraudScenario


def _compute_location_weights(
    case: Case,
    locations: list[Location],
    scenario_behavior: ScenarioBehavior,
    last_tx_metro: str,
    rng: random.Random,
) -> list[tuple[Location, float]]:
    """Compute a probability weight for each candidate location.

    The weight reflects how plausible each location is as a cash-out point,
    given the case evidence and scenario behavior.

    This is NOT random.choice — it's a structured probability distribution.
    """
    weighted_locations: list[tuple[Location, float]] = []

    origin_loc = next(
        (loc for loc in locations if loc.location_id == case.origin_location_id),
        None,
    )

    for loc in locations:
        weight = 1.0

        # Factor 1: Geographic proximity to origin
        if origin_loc:
            dist = compute_distance_km(
                origin_loc.latitude, origin_loc.longitude,
                loc.latitude, loc.longitude,
            )
            # Closer locations get higher weight (exponential decay)
            proximity_factor = max(0.05, 1.0 - (dist / 100.0))
            weight *= proximity_factor ** (1.0 - scenario_behavior.preferred_metro_spread)

        # Factor 2: Metro matching
        if loc.metro == case.origin_metro:
            weight *= (1.0 + scenario_behavior.metro_affinity_boost)
        elif loc.metro == last_tx_metro:
            weight *= (1.0 + scenario_behavior.metro_affinity_boost * 0.7)
        else:
            weight *= 0.6  # Penalty for unrelated metro

        # Factor 3: Cross-metro boost for scenarios that jump
        if scenario_behavior.allow_cross_metro and loc.metro != case.origin_metro:
            weight *= (1.0 + scenario_behavior.preferred_metro_spread * 0.5)

        # Factor 4: Location attractiveness
        weight *= (0.5 + loc.cash_out_attractiveness)

        # Factor 5: Location type suitability
        if loc.location_type.value in ("ATM", "BANK_BRANCH", "MONEY_TRANSFER_AGENT"):
            weight *= 1.3
        elif loc.location_type.value in ("SHOPPING_MALL", "MARKET"):
            weight *= 1.1
        else:
            weight *= 0.7

        # Factor 6: Surveillance penalty (less likely for high-surveillance)
        if loc.is_high_surveillance:
            weight *= 0.75

        # Factor 7: Density bonus
        weight *= (0.6 + loc.density_score * 0.4)

        # Factor 8: Amount plausibility
        # Larger amounts more likely at bank branches/ATMs
        if case.reported_amount > 100000:
            if loc.location_type.value in ("ATM", "BANK_BRANCH"):
                weight *= 1.2
            elif loc.location_type.value in ("CAFE", "RESIDENTIAL_AREA"):
                weight *= 0.5

        # Add controlled noise
        noise = rng.uniform(0.85, 1.15)
        weight *= noise

        weighted_locations.append((loc, max(weight, 0.001)))

    return weighted_locations


def _sample_from_weights(
    weighted_locations: list[tuple[Location, float]],
    rng: random.Random,
) -> tuple[Location, float]:
    """Sample a location from a weighted probability distribution.

    Returns the selected location and its normalized probability.
    """
    total_weight = sum(w for _, w in weighted_locations)
    normalized = [(loc, w / total_weight) for loc, w in weighted_locations]

    r = rng.random()
    cumulative = 0.0
    for loc, prob in normalized:
        cumulative += prob
        if r <= cumulative:
            return loc, prob

    # Fallback to last location
    return normalized[-1]


def generate_ground_truth(
    case: Case,
    locations: list[Location],
    transactions: list,
    rng: random.Random,
) -> GroundTruth:
    """Generate the hidden true cash-out location for a single case.

    Args:
        case: The case to generate ground truth for.
        locations: All candidate locations.
        transactions: All transactions in this case.
        rng: Seeded RNG.

    Returns:
        GroundTruth object with the actual cash-out location.
    """
    behavior = get_scenario_behavior(case.fraud_scenario)

    # Determine last transaction metro for geographic context
    case_txs = [tx for tx in transactions if tx.case_id == case.case_id]
    if case_txs:
        last_tx = max(case_txs, key=lambda t: t.timestamp)
        last_tx_metro = last_tx.receiver_metro
    else:
        last_tx_metro = case.origin_metro

    # Compute weighted probabilities
    weighted_locations = _compute_location_weights(
        case, locations, behavior, last_tx_metro, rng
    )

    # Sample the true location
    selected_loc, selection_prob = _sample_from_weights(weighted_locations, rng)

    # Determine cash-out time
    if case_txs:
        last_tx_time = max(tx.timestamp for tx in case_txs)
    else:
        last_tx_time = case.complaint_time

    cashout_delay = rng.uniform(
        behavior.min_cashout_delay_hours,
        behavior.max_cashout_delay_hours,
    )
    cashout_time = last_tx_time + timedelta(hours=cashout_delay)

    return GroundTruth(
        case_id=case.case_id,
        actual_cashout_location_id=selected_loc.location_id,
        cashout_time=cashout_time,
        cashout_metro=selected_loc.metro,
        scenario_used=case.fraud_scenario,
        selection_probability=round(selection_prob, 6),
    )
