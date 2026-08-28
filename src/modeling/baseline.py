"""Weighted risk scoring baseline for SENTINEL.

Implements a transparent weighted scoring system that ranks candidate
cash-out locations using only Layer-A information available at query time.

Feature groups:
    1. Geographic relevance (30%) — proximity to origin and transaction endpoints
    2. Transaction behavior (25%) — volume, velocity, pattern characteristics
    3. Location characteristics (15%) — type suitability, density, surveillance
    4. Temporal behavior (15%) — complaint timing, inter-arrival patterns
    5. Case/scenario context (15%) — fraud scenario type, amount, complexity

All weights are documented with rationale. The scorer never accesses
Layer-C evaluation information (ground truth, cash-out time, etc.).
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Feature group definitions and weights
# ---------------------------------------------------------------------------

# Group weight allocation — sum to 1.0
# Rationale:
#   Geographic is weighted highest because the strongest signal for
#   cash-out location proximity is geographic closeness to the origin
#   and transaction endpoints. This is the most interpretable and
#   reliable signal available at query time.
#
#   Transaction behavior is second because the volume, velocity, and
#   pattern of pre-complaint transactions reveal the operational
#   structure of the fraud chain.
#
#   Location characteristics, temporal behavior, and case context
#   each contribute meaningful but weaker signals. They provide
#   disambiguation when geographic and transaction signals are
#   ambiguous.

GROUP_WEIGHTS: dict[str, float] = {
    "geographic": 0.30,
    "transaction": 0.25,
    "location": 0.15,
    "temporal": 0.15,
    "case": 0.15,
}

# Feature-to-group mapping
FEATURE_GROUPS: dict[str, list[str]] = {
    "geographic": [
        "cand_distance_from_origin_km",
        "cand_distance_from_last_tx_km",
        "cand_same_metro_as_origin",
        "cand_same_metro_as_last_tx",
        "cand_same_region_as_origin",
        "cand_min_distance_from_any_tx_km",
        "cand_max_distance_from_any_tx_km",
        "cand_mean_distance_from_tx_endpoints_km",
    ],
    "transaction": [
        "tx_total_amount",
        "tx_count",
        "tx_avg_amount",
        "tx_max_amount",
        "tx_amount_range",
        "tx_amount_std",
        "tx_hop_count",
        "tx_amount_to_reported_ratio",
        "tx_chain_duration_hours",
        "tx_avg_inter_arrival_hours",
        "tx_max_inter_arrival_hours",
        "tx_min_inter_arrival_hours",
        "tx_velocity_per_hour",
        "tx_cross_metro_count",
        "tx_unique_metros",
    ],
    "location": [
        "loc_type_atm",
        "loc_type_bank_branch",
        "loc_type_money_transfer",
        "loc_type_shopping_mall",
        "loc_type_market",
        "loc_type_transport_hub",
        "loc_is_cashout_friendly_type",
        "loc_density_score",
        "loc_is_high_surveillance",
    ],
    "temporal": [
        "complaint_delay_from_last_tx_hours",
        "complaint_hour_of_day",
        "complaint_day_of_week",
        "last_tx_hour_of_day",
        "time_since_last_tx_to_complaint_hours",
    ],
    "case": [
        "case_reported_amount",
        "case_num_accounts",
        "case_num_transactions",
        "case_scenario_DIRECT_CASHOUT",
        "case_scenario_RAPID_MULE_CHAIN",
        "case_scenario_MULTI_HOP",
        "case_scenario_GEOGRAPHIC_JUMP",
        "case_scenario_DELAYED_CASHOUT",
        "case_scenario_URBAN_CLUSTER",
        "case_scenario_DISPERSED_ACTIVITY",
    ],
}

# Features where -1.0 sentinel means "missing / no data"
# For these, we replace -1.0 with a neutral score (0.0 after normalization)
SENTINEL_FEATURES: set[str] = {
    "complaint_delay_from_last_tx_hours",
    "last_tx_hour_of_day",
    "time_since_last_tx_to_complaint_hours",
    "cand_distance_from_last_tx_km",
    "cand_min_distance_from_any_tx_km",
    "cand_max_distance_from_any_tx_km",
    "cand_mean_distance_from_tx_endpoints_km",
}

# Features where LOWER values indicate HIGHER risk
# (e.g., distance: closer = more risky)
INVERTED_FEATURES: set[str] = {
    "cand_distance_from_origin_km",
    "cand_distance_from_last_tx_km",
    "cand_min_distance_from_any_tx_km",
    "cand_max_distance_from_any_tx_km",
    "cand_mean_distance_from_tx_endpoints_km",
}


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def _normalize_minmax(values: list[float]) -> list[float]:
    """Min-max normalize a list of values to [0, 1].

    Constant features (max == min) are mapped to 0.0.
    """
    if not values:
        return []
    min_val = min(values)
    max_val = max(values)
    if max_val == min_val:
        return [0.0] * len(values)
    return [(v - min_val) / (max_val - min_val) for v in values]


def _replace_sentinels(row: dict[str, Any], features: list[str]) -> dict[str, float]:
    """Replace -1.0 sentinel values with 0.0 for scoring.

    Sentinel -1.0 means 'no pre-complaint data available'.
    For scoring, we treat this as the worst-case value (0.0 after normalization).

    Returns a dict of feature_name -> cleaned_value.
    """
    cleaned = {}
    for feat in features:
        val = row.get(feat, 0.0)
        if feat in SENTINEL_FEATURES and val == -1.0:
            cleaned[feat] = 0.0
        else:
            cleaned[feat] = float(val)
    return cleaned


# ---------------------------------------------------------------------------
# Group scoring
# ---------------------------------------------------------------------------


def _score_group(
    rows: list[dict[str, Any]],
    features: list[str],
) -> list[float]:
    """Compute normalized group scores for a list of rows.

    For each feature, min-max normalize across all rows, then average
    the normalized feature values within the group.

    For inverted features (where lower raw value = higher risk),
    we invert the normalized score (1 - normalized).

    Args:
        rows: List of feature dicts (one per candidate).
        features: Feature names in this group.

    Returns:
        List of group scores (one per row), each in [0, 1].
    """
    if not rows or not features:
        return [0.0] * len(rows)

    # Step 1: Replace sentinels
    cleaned_rows = [_replace_sentinels(row, features) for row in rows]

    # Step 2: For each feature, collect values across all rows
    feature_values: dict[str, list[float]] = {feat: [] for feat in features}
    for row in cleaned_rows:
        for feat in features:
            feature_values[feat].append(row[feat])

    # Step 3: Min-max normalize each feature across all rows
    normalized: dict[str, list[float]] = {}
    for feat in features:
        normalized[feat] = _normalize_minmax(feature_values[feat])

    # Step 4: Invert if needed and average across features per row
    group_scores = []
    for i in range(len(rows)):
        feat_scores = []
        for feat in features:
            score = normalized[feat][i]
            if feat in INVERTED_FEATURES:
                score = 1.0 - score
            feat_scores.append(score)
        # Average of normalized features in this group
        group_scores.append(sum(feat_scores) / len(feat_scores))

    return group_scores


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_baseline_scores(
    feature_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compute weighted baseline risk scores for all candidate rows.

    Each row must contain the feature values and metadata columns
    (case_id, location_id, is_true_location).

    Args:
        feature_rows: List of feature dicts from build_feature_matrix().

    Returns:
        List of dicts with keys:
            - case_id
            - location_id
            - baseline_score (float, higher = more risky)
            - group_scores (dict of group_name -> score)
            - rank (int, 1 = highest risk)
            - is_true_location (bool, evaluation only)
    """
    if not feature_rows:
        return []

    # Compute group scores for all rows at once
    group_results: dict[str, list[float]] = {}
    for group_name, features in FEATURE_GROUPS.items():
        group_results[group_name] = _score_group(feature_rows, features)

    # Combine groups with weights
    results = []
    for i, row in enumerate(feature_rows):
        weighted_score = 0.0
        group_scores = {}
        for group_name, weight in GROUP_WEIGHTS.items():
            gs = group_results[group_name][i]
            group_scores[group_name] = round(gs, 6)
            weighted_score += weight * gs

        results.append(
            {
                "case_id": row["case_id"],
                "location_id": row["location_id"],
                "baseline_score": round(weighted_score, 6),
                "group_scores": group_scores,
                "is_true_location": row.get("is_true_location", False),
            }
        )

    # Rank candidates within each case (descending by score)
    cases_seen: dict[str, int] = {}
    for r in sorted(results, key=lambda x: (x["case_id"], -x["baseline_score"])):
        case_id = r["case_id"]
        cases_seen[case_id] = cases_seen.get(case_id, 0) + 1
        r["rank"] = cases_seen[case_id]

    return results


def explain_candidate(
    scored_candidate: dict[str, Any],
    feature_row: dict[str, Any],
    top_n_groups: int = 3,
) -> str:
    """Generate a human-readable explanation for why a candidate ranked highly.

    The explanation is based ONLY on Layer-A feature values.
    It does NOT reference ground truth information.

    Args:
        scored_candidate: The scored result dict (from compute_baseline_scores).
        feature_row: The original feature row for this candidate.
        top_n_groups: Number of top contributing groups to mention.

    Returns:
        Concise explanation string.
    """
    group_scores = scored_candidate.get("group_scores", {})

    # Sort groups by contribution
    sorted_groups = sorted(group_scores.items(), key=lambda x: x[1], reverse=True)

    # Human-readable group names
    group_names = {
        "geographic": "geographic proximity",
        "transaction": "transaction behavior",
        "location": "location characteristics",
        "temporal": "temporal patterns",
        "case": "case context",
    }

    reasons = []
    for group_name, score in sorted_groups[:top_n_groups]:
        readable = group_names.get(group_name, group_name)
        if score > 0.6:
            reasons.append(f"strong {readable}")
        elif score > 0.4:
            reasons.append(f"moderate {readable}")
        else:
            reasons.append(f"weak {readable}")

    # Add specific feature highlights
    if feature_row.get("cand_same_metro_as_origin") == 1:
        reasons.append("same metro as complaint origin")
    if feature_row.get("cand_same_region_as_origin") == 1:
        reasons.append("same region as origin")
    if feature_row.get("loc_is_cashout_friendly_type") == 1:
        reasons.append("cash-out friendly location type")

    if not reasons:
        reasons = ["no strong signals"]

    return f"High score because of: {', '.join(reasons)}."
