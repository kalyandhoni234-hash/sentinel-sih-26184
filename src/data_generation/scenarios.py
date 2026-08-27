"""Synthetic fraud scenario definitions.

Each scenario defines behavioral parameters that control how
transaction chains, timing, and geography are generated.

IMPORTANT: Scenario types must NOT be used as direct model features
that reveal the answer. They control generation, but the model
must infer behavioral patterns from observable evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .schema import FraudScenario


@dataclass
class ScenarioBehavior:
    """Behavioral parameters for a fraud scenario.

    These control the synthetic generation process but must NOT
    be directly exposed as model features that leak the answer.
    """

    name: FraudScenario
    description: str
    # Transaction chain structure
    min_hops: int
    max_hops: int
    # Timing (hours relative to complaint)
    min_chain_duration_hours: float
    max_chain_duration_hours: float
    # Geographic behavior
    allow_cross_metro: bool
    preferred_metro_spread: float  # 0.0 = same metro, 1.0 = any metro
    # Amount behavior
    amount_multiplier_mean: float  # Multiplier on reported amount per hop
    amount_multiplier_std: float
    # Cash-out timing (hours after last transaction)
    min_cashout_delay_hours: float
    max_cashout_delay_hours: float
    # Candidate affinity boosts
    metro_affinity_boost: float = 0.2
    proximity_affinity_boost: float = 0.15


# Predefined scenario behaviors for the 7 synthetic scenarios.
SCENARIO_BEHAVIORS: dict[FraudScenario, ScenarioBehavior] = {
    FraudScenario.DIRECT_CASHOUT: ScenarioBehavior(
        name=FraudScenario.DIRECT_CASHOUT,
        description="Direct transfer to cash-out account, minimal hops",
        min_hops=1,
        max_hops=2,
        min_chain_duration_hours=0.5,
        max_chain_duration_hours=4.0,
        allow_cross_metro=False,
        preferred_metro_spread=0.1,
        amount_multiplier_mean=0.95,
        amount_multiplier_std=0.05,
        min_cashout_delay_hours=0.25,
        max_cashout_delay_hours=2.0,
        metro_affinity_boost=0.35,
        proximity_affinity_boost=0.25,
    ),
    FraudScenario.RAPID_MULE_CHAIN: ScenarioBehavior(
        name=FraudScenario.RAPID_MULE_CHAIN,
        description="Quick chain through 2-3 mule accounts",
        min_hops=3,
        max_hops=4,
        min_chain_duration_hours=0.25,
        max_chain_duration_hours=3.0,
        allow_cross_metro=False,
        preferred_metro_spread=0.2,
        amount_multiplier_mean=0.85,
        amount_multiplier_std=0.1,
        min_cashout_delay_hours=0.15,
        max_cashout_delay_hours=1.5,
        metro_affinity_boost=0.25,
        proximity_affinity_boost=0.2,
    ),
    FraudScenario.MULTI_HOP: ScenarioBehavior(
        name=FraudScenario.MULTI_HOP,
        description="Complex chain through 4+ intermediate accounts",
        min_hops=4,
        max_hops=6,
        min_chain_duration_hours=2.0,
        max_chain_duration_hours=24.0,
        allow_cross_metro=True,
        preferred_metro_spread=0.4,
        amount_multiplier_mean=0.80,
        amount_multiplier_std=0.12,
        min_cashout_delay_hours=1.0,
        max_cashout_delay_hours=12.0,
        metro_affinity_boost=0.15,
        proximity_affinity_boost=0.1,
    ),
    FraudScenario.GEOGRAPHIC_JUMP: ScenarioBehavior(
        name=FraudScenario.GEOGRAPHIC_JUMP,
        description="Funds jump to a different metro before cash-out",
        min_hops=2,
        max_hops=4,
        min_chain_duration_hours=1.0,
        max_chain_duration_hours=12.0,
        allow_cross_metro=True,
        preferred_metro_spread=0.8,
        amount_multiplier_mean=0.90,
        amount_multiplier_std=0.08,
        min_cashout_delay_hours=0.5,
        max_cashout_delay_hours=6.0,
        metro_affinity_boost=0.1,
        proximity_affinity_boost=0.05,
    ),
    FraudScenario.DELAYED_CASHOUT: ScenarioBehavior(
        name=FraudScenario.DELAYED_CASHOUT,
        description="Significant delay between last transfer and cash-out",
        min_hops=2,
        max_hops=3,
        min_chain_duration_hours=6.0,
        max_chain_duration_hours=48.0,
        allow_cross_metro=True,
        preferred_metro_spread=0.3,
        amount_multiplier_mean=0.88,
        amount_multiplier_std=0.10,
        min_cashout_delay_hours=6.0,
        max_cashout_delay_hours=36.0,
        metro_affinity_boost=0.2,
        proximity_affinity_boost=0.15,
    ),
    FraudScenario.URBAN_CLUSTER: ScenarioBehavior(
        name=FraudScenario.URBAN_CLUSTER,
        description="All activity concentrated within same urban area",
        min_hops=2,
        max_hops=4,
        min_chain_duration_hours=0.5,
        max_chain_duration_hours=8.0,
        allow_cross_metro=False,
        preferred_metro_spread=0.05,
        amount_multiplier_mean=0.92,
        amount_multiplier_std=0.06,
        min_cashout_delay_hours=0.25,
        max_cashout_delay_hours=4.0,
        metro_affinity_boost=0.4,
        proximity_affinity_boost=0.3,
    ),
    FraudScenario.DISPERSED_ACTIVITY: ScenarioBehavior(
        name=FraudScenario.DISPERSED_ACTIVITY,
        description="Activity spread across multiple metros and locations",
        min_hops=3,
        max_hops=5,
        min_chain_duration_hours=4.0,
        max_chain_duration_hours=36.0,
        allow_cross_metro=True,
        preferred_metro_spread=0.7,
        amount_multiplier_mean=0.82,
        amount_multiplier_std=0.15,
        min_cashout_delay_hours=2.0,
        max_cashout_delay_hours=24.0,
        metro_affinity_boost=0.1,
        proximity_affinity_boost=0.08,
    ),
}


def get_scenario_behavior(scenario: FraudScenario) -> ScenarioBehavior:
    """Get behavioral parameters for a scenario."""
    return SCENARIO_BEHAVIORS[scenario]


def get_scenario_weights(config: dict[str, Any]) -> dict[FraudScenario, float]:
    """Extract scenario sampling weights from config."""
    raw_weights = config.get("scenarios", {}).get("weights", {})
    return {FraudScenario(k): v for k, v in raw_weights.items()}
