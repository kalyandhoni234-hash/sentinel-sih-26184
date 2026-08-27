"""Candidate-level feature engineering for SENTINEL.

Converts raw synthetic investigation data into a candidate-level feature matrix.
Each row represents one CASE x CANDIDATE LOCATION pair.

All features respect the query-time cutoff: only information available at
complaint_time is used. No future/cash-out information enters the feature matrix.

Query-time cutoff definition:
    cutoff = case.complaint_time
    Only transactions with timestamp <= cutoff are used for feature computation.
    No information after cutoff may enter any feature.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from .locations import compute_distance_km
from .schema import Case

# ---------------------------------------------------------------------------
# Feature record schema
# ---------------------------------------------------------------------------

# Every feature in the feature record has metadata.
# This registry is the machine-readable feature contract.
FEATURE_REGISTRY: list[dict[str, Any]] = [
    # --- Transaction features ---
    {
        "name": "tx_total_amount",
        "dtype": "float",
        "description": "Total amount of pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_count",
        "dtype": "int",
        "description": "Number of pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_avg_amount",
        "dtype": "float",
        "description": "Mean amount of pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_max_amount",
        "dtype": "float",
        "description": "Maximum amount of pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_amount_range",
        "dtype": "float",
        "description": "Max minus min transaction amount",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_amount_std",
        "dtype": "float",
        "description": "Standard deviation of transaction amounts",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_hop_count",
        "dtype": "int",
        "description": "Number of hops (tx_count) in the chain",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_amount_to_reported_ratio",
        "dtype": "float",
        "description": "Total transaction amount / reported fraud amount",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_chain_duration_hours",
        "dtype": "float",
        "description": "Time span from first to last pre-complaint transaction (hours)",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_avg_inter_arrival_hours",
        "dtype": "float",
        "description": "Mean time between consecutive pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_max_inter_arrival_hours",
        "dtype": "float",
        "description": "Maximum time between consecutive pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_min_inter_arrival_hours",
        "dtype": "float",
        "description": "Minimum time between consecutive pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_velocity_per_hour",
        "dtype": "float",
        "description": "Transaction count / chain duration (txs per hour)",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_cross_metro_count",
        "dtype": "int",
        "description": "Number of transactions where sender_metro != receiver_metro",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "tx_unique_metros",
        "dtype": "int",
        "description": "Number of distinct metros involved in pre-complaint transactions",
        "group": "transaction",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    # --- Temporal features ---
    {
        "name": "complaint_delay_from_last_tx_hours",
        "dtype": "float",
        "description": "Hours between last pre-complaint transaction and complaint",
        "group": "temporal",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "complaint_hour_of_day",
        "dtype": "int",
        "description": "Hour of day the complaint was filed (0-23)",
        "group": "temporal",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "complaint_day_of_week",
        "dtype": "int",
        "description": "Day of week the complaint was filed (0=Mon, 6=Sun)",
        "group": "temporal",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "last_tx_hour_of_day",
        "dtype": "int",
        "description": "Hour of day of the last pre-complaint transaction",
        "group": "temporal",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "time_since_last_tx_to_complaint_hours",
        "dtype": "float",
        "description": "Alias for complaint_delay_from_last_tx_hours",
        "group": "temporal",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    # --- Geographic features ---
    {
        "name": "cand_distance_from_origin_km",
        "dtype": "float",
        "description": "Haversine distance from complaint origin to candidate",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_distance_from_last_tx_km",
        "dtype": "float",
        "description": "Haversine distance from last known transaction location to candidate",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_same_metro_as_origin",
        "dtype": "int",
        "description": "1 if candidate metro matches complaint origin metro, else 0",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_same_metro_as_last_tx",
        "dtype": "int",
        "description": "1 if candidate metro matches last transaction metro, else 0",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_same_region_as_origin",
        "dtype": "int",
        "description": "1 if candidate region matches origin location region, else 0",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_min_distance_from_any_tx_km",
        "dtype": "float",
        "description": "Minimum distance from any pre-complaint transaction endpoint to candidate",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_max_distance_from_any_tx_km",
        "dtype": "float",
        "description": "Maximum distance from any pre-complaint transaction endpoint to candidate",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "cand_mean_distance_from_tx_endpoints_km",
        "dtype": "float",
        "description": "Mean distance from pre-complaint transaction endpoints to candidate",
        "group": "geographic",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    # --- Location context features ---
    {
        "name": "loc_type_atm",
        "dtype": "int",
        "description": "1 if candidate is an ATM, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_type_bank_branch",
        "dtype": "int",
        "description": "1 if candidate is a bank branch, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_type_money_transfer",
        "dtype": "int",
        "description": "1 if candidate is a money transfer agent, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_type_shopping_mall",
        "dtype": "int",
        "description": "1 if candidate is a shopping mall, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_type_market",
        "dtype": "int",
        "description": "1 if candidate is a market, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_type_transport_hub",
        "dtype": "int",
        "description": "1 if candidate is a transport hub, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_is_cashout_friendly_type",
        "dtype": "int",
        "description": "1 if location type is ATM, bank, or money transfer agent",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_density_score",
        "dtype": "float",
        "description": "Synthetic foot-traffic density (0-1)",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "loc_is_high_surveillance",
        "dtype": "int",
        "description": "1 if location has high surveillance, else 0",
        "group": "location",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    # --- Case context features ---
    {
        "name": "case_reported_amount",
        "dtype": "float",
        "description": "Reported fraud amount in INR",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_num_accounts",
        "dtype": "int",
        "description": "Number of accounts involved",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_num_transactions",
        "dtype": "int",
        "description": "Number of transactions (pre-complaint)",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_DIRECT_CASHOUT",
        "dtype": "int",
        "description": "1 if fraud scenario is DIRECT_CASHOUT, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_RAPID_MULE_CHAIN",
        "dtype": "int",
        "description": "1 if fraud scenario is RAPID_MULE_CHAIN, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_MULTI_HOP",
        "dtype": "int",
        "description": "1 if fraud scenario is MULTI_HOP, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_GEOGRAPHIC_JUMP",
        "dtype": "int",
        "description": "1 if fraud scenario is GEOGRAPHIC_JUMP, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_DELAYED_CASHOUT",
        "dtype": "int",
        "description": "1 if fraud scenario is DELAYED_CASHOUT, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_URBAN_CLUSTER",
        "dtype": "int",
        "description": "1 if fraud scenario is URBAN_CLUSTER, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
    {
        "name": "case_scenario_DISPERSED_ACTIVITY",
        "dtype": "int",
        "description": "1 if fraud scenario is DISPERSED_ACTIVITY, else 0",
        "group": "case",
        "query_time": True,
        "leakage": "ALLOWED",
    },
]

# Feature names list (excludes metadata columns)
FEATURE_NAMES = [f["name"] for f in FEATURE_REGISTRY]

# Metadata columns (not features, but carried along for tracking)
METADATA_COLUMNS = ["case_id", "location_id", "is_true_location"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _parse_ts(ts_str: str | datetime) -> datetime:
    """Parse an ISO timestamp string, or pass through a datetime object."""
    if isinstance(ts_str, datetime):
        return ts_str
    try:
        return datetime.fromisoformat(ts_str)
    except ValueError:
        return datetime.fromisoformat(ts_str.split("+")[0].split("Z")[0])


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    """Safe division that returns default if b is zero."""
    return a / b if b != 0 else default


def _inter_arrival_hours(sorted_timestamps: list[datetime]) -> list[float]:
    """Compute inter-arrival times in hours between sorted timestamps."""
    if len(sorted_timestamps) < 2:
        return []
    return [
        (sorted_timestamps[i + 1] - sorted_timestamps[i]).total_seconds() / 3600.0
        for i in range(len(sorted_timestamps) - 1)
    ]


# ---------------------------------------------------------------------------
# Feature computation
# ---------------------------------------------------------------------------


def _compute_tx_features(
    case: Case,
    case_txs: list[dict],
    cutoff: datetime,
) -> dict[str, Any]:
    """Compute transaction-based features using only pre-complaint transactions.

    Args:
        case: The case.
        case_txs: All transactions for this case.
        cutoff: Query-time cutoff (complaint_time).

    Returns:
        Dictionary of transaction features.
    """
    # Filter to pre-complaint transactions only
    pre_txs = [tx for tx in case_txs if _parse_ts(tx["timestamp"]) <= cutoff]
    pre_txs_sorted = sorted(pre_txs, key=lambda t: t["sequence_number"])

    amounts = [tx["amount"] for tx in pre_txs]
    timestamps = [_parse_ts(tx["timestamp"]) for tx in pre_txs_sorted]

    tx_count = len(pre_txs)
    total_amount = sum(amounts) if amounts else 0.0
    avg_amount = _safe_div(total_amount, tx_count)
    max_amount = max(amounts) if amounts else 0.0
    min_amount = min(amounts) if amounts else 0.0
    amount_range = max_amount - min_amount

    # Standard deviation
    if len(amounts) >= 2:
        mean_amt = avg_amount
        variance = sum((a - mean_amt) ** 2 for a in amounts) / len(amounts)
        amount_std = math.sqrt(variance)
    else:
        amount_std = 0.0

    # Chain duration
    if len(timestamps) >= 2:
        chain_duration = (timestamps[-1] - timestamps[0]).total_seconds() / 3600.0
    else:
        chain_duration = 0.0

    # Inter-arrival times
    inter_arrivals = _inter_arrival_hours(timestamps)
    avg_inter_arrival = _safe_div(sum(inter_arrivals), len(inter_arrivals))
    max_inter_arrival = max(inter_arrivals) if inter_arrivals else 0.0
    min_inter_arrival = min(inter_arrivals) if inter_arrivals else 0.0

    # Velocity
    velocity = _safe_div(tx_count, chain_duration)

    # Cross-metro transactions
    cross_metro = sum(1 for tx in pre_txs if tx["sender_metro"] != tx["receiver_metro"])

    # Unique metros
    metros = set()
    for tx in pre_txs:
        metros.add(tx["sender_metro"])
        metros.add(tx["receiver_metro"])

    # Amount to reported ratio
    amount_ratio = _safe_div(total_amount, case.reported_amount)

    return {
        "tx_total_amount": round(total_amount, 2),
        "tx_count": tx_count,
        "tx_avg_amount": round(avg_amount, 2),
        "tx_max_amount": round(max_amount, 2),
        "tx_amount_range": round(amount_range, 2),
        "tx_amount_std": round(amount_std, 2),
        "tx_hop_count": tx_count,
        "tx_amount_to_reported_ratio": round(amount_ratio, 4),
        "tx_chain_duration_hours": round(chain_duration, 4),
        "tx_avg_inter_arrival_hours": round(avg_inter_arrival, 4),
        "tx_max_inter_arrival_hours": round(max_inter_arrival, 4),
        "tx_min_inter_arrival_hours": round(min_inter_arrival, 4),
        "tx_velocity_per_hour": round(velocity, 4),
        "tx_cross_metro_count": cross_metro,
        "tx_unique_metros": len(metros),
    }


def _compute_temporal_features(
    case: Case,
    case_txs: list[dict],
    cutoff: datetime,
) -> dict[str, Any]:
    """Compute temporal features using only pre-complaint information.

    Args:
        case: The case.
        case_txs: All transactions for this case.
        cutoff: Query-time cutoff (complaint_time).

    Returns:
        Dictionary of temporal features.
    """
    pre_txs = [tx for tx in case_txs if _parse_ts(tx["timestamp"]) <= cutoff]
    pre_txs_sorted = sorted(pre_txs, key=lambda t: t["sequence_number"])

    # Complaint delay from last TX
    if pre_txs_sorted:
        last_tx_time = _parse_ts(pre_txs_sorted[-1]["timestamp"])
        delay_hours = (cutoff - last_tx_time).total_seconds() / 3600.0
        last_tx_hour = last_tx_time.hour
    else:
        delay_hours = -1.0  # sentinel: no pre-complaint transactions
        last_tx_hour = -1

    return {
        "complaint_delay_from_last_tx_hours": round(delay_hours, 4),
        "complaint_hour_of_day": cutoff.hour,
        "complaint_day_of_week": cutoff.weekday(),
        "last_tx_hour_of_day": last_tx_hour,
        "time_since_last_tx_to_complaint_hours": round(delay_hours, 4),
    }


def _compute_geographic_features(
    candidate: dict,
    case: Case,
    case_txs: list[dict],
    loc_map: dict[str, dict],
    cutoff: datetime,
) -> dict[str, Any]:
    """Compute geographic features between candidate and observable locations.

    Args:
        candidate: Candidate record.
        case: The case.
        case_txs: All transactions for this case.
        loc_map: Mapping of location_id -> location record.
        cutoff: Query-time cutoff.

    Returns:
        Dictionary of geographic features.
    """
    cand_loc = loc_map.get(candidate["location_id"])
    origin_loc = loc_map.get(case.origin_location_id)

    if not cand_loc or not origin_loc:
        return {
            "cand_distance_from_origin_km": -1.0,
            "cand_distance_from_last_tx_km": -1.0,
            "cand_same_metro_as_origin": 0,
            "cand_same_metro_as_last_tx": 0,
            "cand_same_region_as_origin": 0,
            "cand_min_distance_from_any_tx_km": -1.0,
            "cand_max_distance_from_any_tx_km": -1.0,
            "cand_mean_distance_from_tx_endpoints_km": -1.0,
        }

    # Distance from origin
    dist_from_origin = compute_distance_km(
        origin_loc["latitude"],
        origin_loc["longitude"],
        cand_loc["latitude"],
        cand_loc["longitude"],
    )

    # Last transaction location
    pre_txs = sorted(
        [tx for tx in case_txs if _parse_ts(tx["timestamp"]) <= cutoff],
        key=lambda t: t["sequence_number"],
    )

    if pre_txs:
        last_tx = pre_txs[-1]
        last_tx_metro = last_tx["receiver_metro"]
        # Use origin location as proxy for last TX endpoint
        # (we don't have exact TX coordinates, only metro)
        last_tx_loc = origin_loc  # best available proxy
        dist_from_last_tx = compute_distance_km(
            last_tx_loc["latitude"],
            last_tx_loc["longitude"],
            cand_loc["latitude"],
            cand_loc["longitude"],
        )
        same_metro_last_tx = 1 if cand_loc["metro"] == last_tx_metro else 0
    else:
        dist_from_last_tx = -1.0
        same_metro_last_tx = 0

    # Same metro as origin
    same_metro_origin = 1 if cand_loc["metro"] == origin_loc["metro"] else 0

    # Same region as origin
    same_region = 1 if cand_loc["region"] == origin_loc["region"] else 0

    # Distance from any TX endpoint
    # Use origin location for all TX endpoints (best available proxy)
    tx_endpoints = [origin_loc]
    for tx in pre_txs:
        # Receiver metro might differ — use origin as proxy
        tx_endpoints.append(origin_loc)

    tx_dists = [
        compute_distance_km(
            ep["latitude"],
            ep["longitude"],
            cand_loc["latitude"],
            cand_loc["longitude"],
        )
        for ep in tx_endpoints
    ]

    min_tx_dist = min(tx_dists) if tx_dists else -1.0
    max_tx_dist = max(tx_dists) if tx_dists else -1.0
    mean_tx_dist = _safe_div(sum(tx_dists), len(tx_dists), -1.0)

    return {
        "cand_distance_from_origin_km": round(dist_from_origin, 4),
        "cand_distance_from_last_tx_km": round(dist_from_last_tx, 4),
        "cand_same_metro_as_origin": same_metro_origin,
        "cand_same_metro_as_last_tx": same_metro_last_tx,
        "cand_same_region_as_origin": same_region,
        "cand_min_distance_from_any_tx_km": round(min_tx_dist, 4),
        "cand_max_distance_from_any_tx_km": round(max_tx_dist, 4),
        "cand_mean_distance_from_tx_endpoints_km": round(mean_tx_dist, 4),
    }


def _compute_location_features(candidate: dict, loc_map: dict[str, dict]) -> dict[str, Any]:
    """Compute location context features for the candidate.

    These are static attributes of the candidate location, known at query time.
    """
    loc = loc_map.get(candidate["location_id"])
    if not loc:
        return {
            "loc_type_atm": 0,
            "loc_type_bank_branch": 0,
            "loc_type_money_transfer": 0,
            "loc_type_shopping_mall": 0,
            "loc_type_market": 0,
            "loc_type_transport_hub": 0,
            "loc_is_cashout_friendly_type": 0,
            "loc_density_score": 0.0,
            "loc_is_high_surveillance": 0,
        }

    lt = loc.get("location_type", "")
    is_cashout_friendly = 1 if lt in ("ATM", "BANK_BRANCH", "MONEY_TRANSFER_AGENT") else 0

    return {
        "loc_type_atm": 1 if lt == "ATM" else 0,
        "loc_type_bank_branch": 1 if lt == "BANK_BRANCH" else 0,
        "loc_type_money_transfer": 1 if lt == "MONEY_TRANSFER_AGENT" else 0,
        "loc_type_shopping_mall": 1 if lt == "SHOPPING_MALL" else 0,
        "loc_type_market": 1 if lt == "MARKET" else 0,
        "loc_type_transport_hub": 1 if lt == "TRANSPORT_HUB" else 0,
        "loc_is_cashout_friendly_type": is_cashout_friendly,
        "loc_density_score": loc.get("density_score", 0.0),
        "loc_is_high_surveillance": 1 if loc.get("is_high_surveillance", False) else 0,
    }


def _compute_case_features(case: Case) -> dict[str, Any]:
    """Compute case-level context features.

    These are static attributes of the case, known at query time.
    """
    scenarios = [
        "DIRECT_CASHOUT",
        "RAPID_MULE_CHAIN",
        "MULTI_HOP",
        "GEOGRAPHIC_JUMP",
        "DELAYED_CASHOUT",
        "URBAN_CLUSTER",
        "DISPERSED_ACTIVITY",
    ]
    features = {
        "case_reported_amount": case.reported_amount,
        "case_num_accounts": case.num_accounts_involved,
        "case_num_transactions": case.num_transactions,
    }
    for s in scenarios:
        features[f"case_scenario_{s}"] = 1 if case.fraud_scenario.value == s else 0
    return features


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_candidate_features(
    case: Case,
    candidate: dict,
    case_txs: list[dict],
    loc_map: dict[str, dict],
    is_true: bool = False,
) -> dict[str, Any]:
    """Build the complete feature record for one CASE x CANDIDATE pair.

    This is the main feature engineering function. It computes all features
    using only query-time information (before complaint_time).

    Args:
        case: The case record.
        candidate: The candidate record (from candidates.jsonl).
        case_txs: All transactions for this case.
        loc_map: Mapping of location_id -> location record.
        is_true: Whether this candidate is the true location (for labels only).

    Returns:
        Dictionary with all features + metadata columns.
    """
    cutoff = _parse_ts(case.complaint_time)

    features = {}
    features.update(_compute_tx_features(case, case_txs, cutoff))
    features.update(_compute_temporal_features(case, case_txs, cutoff))
    features.update(_compute_geographic_features(candidate, case, case_txs, loc_map, cutoff))
    features.update(_compute_location_features(candidate, loc_map))
    features.update(_compute_case_features(case))

    # Metadata (not features)
    features["case_id"] = case.case_id
    features["location_id"] = candidate["location_id"]
    features["is_true_location"] = is_true

    return features


def build_feature_matrix(
    cases: list[Case],
    candidates: list[dict],
    transactions: list[dict],
    locations: list[dict],
    ground_truths: list[dict] | None = None,
) -> list[dict[str, Any]]:
    """Build the complete candidate-level feature matrix.

    Args:
        cases: All case records.
        candidates: All candidate records.
        transactions: All transaction records.
        locations: All location records.
        ground_truths: Optional ground truth for labels (evaluation only).

    Returns:
        List of feature dictionaries, one per CASE x CANDIDATE pair.
    """
    # Build lookup structures
    case_map = {c.case_id: c for c in cases}
    loc_map = {loc["location_id"]: loc for loc in locations}

    # Group transactions by case
    tx_by_case: dict[str, list[dict]] = {}
    for tx in transactions:
        tx_by_case.setdefault(tx["case_id"], []).append(tx)

    # Build ground truth lookup if provided
    gt_map = {}
    if ground_truths:
        gt_map = {g["case_id"]: g["actual_cashout_location_id"] for g in ground_truths}

    # Build feature matrix
    matrix = []
    for cand in candidates:
        case = case_map.get(cand["case_id"])
        if not case:
            continue

        case_txs = tx_by_case.get(case.case_id, [])
        is_true = gt_map.get(case.case_id) == cand["location_id"]

        record = build_candidate_features(
            case=case,
            candidate=cand,
            case_txs=case_txs,
            loc_map=loc_map,
            is_true=is_true,
        )
        matrix.append(record)

    return matrix


def get_feature_names() -> list[str]:
    """Return the ordered list of feature column names (excluding metadata)."""
    return list(FEATURE_NAMES)


def get_metadata_columns() -> list[str]:
    """Return the metadata column names."""
    return list(METADATA_COLUMNS)
