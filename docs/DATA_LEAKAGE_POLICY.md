# SENTINEL Data Leakage Policy

## Principle

The ground truth (actual cash-out location) must NEVER be accessible to the predictive model during training or inference. Only after prediction should the ground truth be used for evaluation.

## Three-Layer Classification

### LAYER A — AVAILABLE AT QUERY TIME

What SENTINEL is allowed to know:

- Case information: case_id, complaint_time, reported_amount, origin_metro, origin_location_id, num_accounts_involved, num_transactions, fraud_scenario
- Transaction history: timestamps, amounts, sequence, sender/receiver accounts, metros, transaction_type
- Account information: roles (VICTIM, MULE, CASH_OUT, INTERMEDIATE), bank, age
- Geographic context: all Location objects (coordinates, metro, region, type, density, attractiveness, surveillance)
- Candidate features: distance_from_origin_km, scenario_affinity, transaction_proximity_score, temporal_plausibility, density_score

### LAYER B — NOT AVAILABLE AT QUERY TIME

Information that exists historically/factually but must not be used as features:

- Which scenario type generated the case (the Case.fraud_scenario is available, but the scenario_used from GroundTruth is not — they may differ)
- Generator-assigned weights and probabilities
- Cash-out delay parameters
- Account generation parameters
- Scenario behavior parameters

### LAYER C — EVALUATION ONLY

Ground truth and post-poutcome information:

- `actual_cashout_location_id` — the true cash-out location
- `cashout_time` — when the cash-out occurred
- `cashout_metro` — which metro the cash-out was in
- `scenario_used` — which scenario was used for generation
- `selection_probability` — the generator's assigned probability
- `is_true_location` — flag marking the true location in candidates
- Any feature derived from the above fields

## What is Model-Visible (Layer A)

- Case information (complaint time, reported amount, origin metro, fraud scenario)
- Transaction history (amounts, timestamps, sequence, account relationships)
- Account information (roles, bank, age)
- Geographic context (locations, coordinates, density, types)
- Candidate locations with feature scores
- Temporal information

## What is Evaluation-Only (Layer C — NEVER Model-Visible)

- `actual_cashout_location_id` — the true cash-out location
- `cashout_time` — when the cash-out occurred
- `cashout_metro` — which metro the cash-out was in
- `scenario_used` — which scenario generated the case
- `selection_probability` — the generator's assigned probability
- `is_true_location` — flag marking the true location in candidates
- Any feature derived from the above fields

## Key Design Decision: fraud_scenario as Input

`Case.fraud_scenario` is a **Layer A input** (available at query time). This is a deliberate design decision:

- In a real investigation, the fraud scenario classification would be assigned by the investigator
- The model should learn to use scenario information to improve predictions
- This is NOT the same as `GroundTruth.scenario_used`, which is a Layer C evaluation field

However, `Case.metadata` must NOT contain scenario descriptions or behavior parameters that would leak generation-specific information.

## Leakage Checks Implemented

### 1. Structural Separation
- Ground truth written to `data/evaluation/` directory
- Model-visible data written to `data/generated/` directory
- `is_true_location` field stripped from model-visible candidates

### 2. Field Validation
The `LeakageChecker` class verifies:
- No forbidden fields in Candidate model
- No target-derived distance features
- No post-cash-out transactions in model-visible data
- No hidden scenario parameters in features

### 3. Automated Tests
- `test_no_leakage_in_generated_data` — full checker run
- `test_candidate_does_not_contain_is_true_location` — field check
- `test_ground_truth_only_in_evaluation_dir` — directory separation
- `test_metadata_does_not_contain_scenario_description` — metadata leakage
- `test_scenario_field_exists_on_case` — documents fraud_scenario as Layer A

## Rules for Future Development

1. **Never** add a feature computed from the ground truth location
2. **Never** include post-prediction transactions in model input
3. **Never** use `GroundTruth.scenario_used` as a model feature (it is Layer C)
4. **Never** put scenario behavior descriptions in Case.metadata
5. **Always** run leakage checks before training
6. **Always** keep ground truth in a separate directory
7. **Always** document any new feature and verify it belongs to Layer A

## Detecting Leakage

If you suspect leakage, run:
```bash
pytest tests/test_leakage.py tests/test_audit_regression.py -v
```

Or use the `LeakageChecker` programmatically:
```python
from src.data_generation.leakage import LeakageChecker

checker = LeakageChecker(cases, transactions, locations, candidates, ground_truths)
violations = checker.check_all()
if violations:
    print(f"LEAKAGE DETECTED: {violations}")
```
