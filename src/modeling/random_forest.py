"""Random Forest classifier for SENTINEL cash-out location prediction.

Trains a RandomForestClassifier on Layer-A features only, using the
existing case-level split. Produces probability scores ranked within
each case for comparison with the Phase 3 weighted baseline.

Leakage contract:
    - Training target: is_true_location (binary)
    - Input features: 47 Layer-A features only
    - Forbidden: all Layer-C columns, post-complaint data, target-derived stats
    - Case-level split enforced: no case appears in both train and test
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier

from src.data_generation.features import FEATURE_NAMES

DEFAULT_RF_PARAMS: dict[str, Any] = {
    "n_estimators": 200,
    "max_depth": None,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "class_weight": "balanced",
    "random_state": 42,
    "n_jobs": 1,
}


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------


def prepare_xy(
    rows: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """Extract feature matrix X and target y from feature rows.

    Args:
        rows: Feature dicts from build_feature_matrix().

    Returns:
        X: (n_rows, n_features) float array.
        y: (n_rows,) binary array (1 = true location).
        case_ids: Case ID per row.
        location_ids: Location ID per row.
    """
    feature_cols = list(FEATURE_NAMES)
    X = np.array([[float(r.get(f, 0.0)) for f in feature_cols] for r in rows], dtype=np.float64)
    y = np.array([1 if r.get("is_true_location", False) else 0 for r in rows], dtype=np.int64)
    case_ids = [r["case_id"] for r in rows]
    location_ids = [r["location_id"] for r in rows]
    return X, y, case_ids, location_ids


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def train_random_forest(
    train_rows: list[dict[str, Any]],
    rf_params: dict[str, Any] | None = None,
) -> RandomForestClassifier:
    """Train a Random Forest classifier on training feature rows.

    Args:
        train_rows: Feature rows for training cases only.
        rf_params: Override default RF parameters. None uses defaults.

    Returns:
        Fitted RandomForestClassifier.
    """
    X_train, y_train, _, _ = prepare_xy(train_rows)
    params = {**DEFAULT_RF_PARAMS}
    if rf_params:
        params.update(rf_params)

    clf = RandomForestClassifier(**params)
    clf.fit(X_train, y_train)
    return clf


# ---------------------------------------------------------------------------
# Prediction and ranking
# ---------------------------------------------------------------------------


def predict_and_rank(
    clf: RandomForestClassifier,
    test_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Predict probabilities and rank candidates within each case.

    Uses probability of class 1 (true location) as the risk score.
    Candidates are ranked descending by probability within each case.

    Args:
        clf: Fitted classifier.
        test_rows: Feature rows for test cases.

    Returns:
        List of dicts with keys:
            case_id, location_id, rf_score, rank, is_true_location
    """
    if not test_rows:
        return []

    X_test, _, case_ids, location_ids = prepare_xy(test_rows)

    # Probability of class 1 (true location)
    proba = clf.predict_proba(X_test)
    if proba.shape[1] == 2:
        probs = proba[:, 1]
    else:
        # Only one class seen during training — probability defaults to 0
        probs = np.zeros(len(X_test), dtype=np.float64)

    results = []
    for i, row in enumerate(test_rows):
        results.append(
            {
                "case_id": case_ids[i],
                "location_id": location_ids[i],
                "rf_score": float(probs[i]),
                "is_true_location": bool(row.get("is_true_location", False)),
            }
        )

    # Rank within each case (descending by score)
    cases_seen: dict[str, int] = {}
    for r in sorted(results, key=lambda x: (x["case_id"], -x["rf_score"])):
        cid = r["case_id"]
        cases_seen[cid] = cases_seen.get(cid, 0) + 1
        r["rank"] = cases_seen[cid]

    return results


# ---------------------------------------------------------------------------
# Feature importance
# ---------------------------------------------------------------------------


def get_feature_importance(
    clf: RandomForestClassifier,
) -> list[dict[str, Any]]:
    """Get individual feature importances from the trained model.

    Args:
        clf: Fitted classifier.

    Returns:
        List of dicts with keys: feature, importance, rank.
    """
    importances = clf.feature_importances_
    feature_cols = list(FEATURE_NAMES)

    importance_list = []
    for feat, imp in zip(feature_cols, importances):
        importance_list.append({"feature": feat, "importance": float(imp)})

    # Sort descending and assign rank
    importance_list.sort(key=lambda x: x["importance"], reverse=True)
    for i, item in enumerate(importance_list):
        item["rank"] = i + 1

    return importance_list


def get_group_importance(
    clf: RandomForestClassifier,
    feature_groups: dict[str, list[str]],
) -> dict[str, float]:
    """Aggregate feature importance by the existing 5 feature groups.

    Args:
        clf: Fitted classifier.
        feature_groups: Mapping of group_name -> list of feature names.

    Returns:
        Dict of group_name -> total importance (sums to ~1.0).
    """
    feature_cols = list(FEATURE_NAMES)
    importances = clf.feature_importances_
    feat_to_imp = dict(zip(feature_cols, importances))

    group_totals: dict[str, float] = {}
    for group_name, features in feature_groups.items():
        group_totals[group_name] = sum(feat_to_imp.get(f, 0.0) for f in features)

    return group_totals
