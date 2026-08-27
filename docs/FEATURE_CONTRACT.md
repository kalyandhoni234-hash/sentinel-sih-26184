# SENTINEL Feature Contract

## Query-Time Cutoff

```
cutoff = case.complaint_time
```

Only transactions with `timestamp <= cutoff` are used for feature computation.
No information after the cutoff may enter any feature.

```
     CASE HISTORY
          |
  ──────── CUTOFF ────────
          |
   allowed evidence
          |
          v
     PREDICTION
          |
          X  (hidden future outcome)
          |
          v
       EVALUATION ONLY
```

## Feature Groups

### Transaction Features (15)

| Feature | Type | Description | Formula |
|---------|------|-------------|---------|
| tx_total_amount | float | Total pre-complaint TX amount | sum(amount) for pre-TX |
| tx_count | int | Number of pre-complaint TXs | count(pre-TX) |
| tx_avg_amount | float | Mean pre-complaint TX amount | total / count |
| tx_max_amount | float | Maximum pre-complaint TX amount | max(amount) |
| tx_amount_range | float | Max - min amount | max - min |
| tx_amount_std | float | Std dev of amounts | sqrt(variance) |
| tx_hop_count | int | Number of hops | = tx_count |
| tx_amount_to_reported_ratio | float | Total TX / reported amount | total / reported |
| tx_chain_duration_hours | float | First to last TX span (hours) | (last_ts - first_ts).hours |
| tx_avg_inter_arrival_hours | float | Mean inter-TX time | mean(gaps) |
| tx_max_inter_arrival_hours | float | Max inter-TX time | max(gaps) |
| tx_min_inter_arrival_hours | float | Min inter-TX time | min(gaps) |
| tx_velocity_per_hour | float | TXs per hour | count / duration |
| tx_cross_metro_count | int | Cross-metro TXs | count(sender_metro != receiver_metro) |
| tx_unique_metros | int | Distinct metros involved | len(set(metros)) |

### Temporal Features (5)

| Feature | Type | Description |
|---------|------|-------------|
| complaint_delay_from_last_tx_hours | float | Hours from last TX to complaint |
| complaint_hour_of_day | int | Hour complaint filed (0-23) |
| complaint_day_of_week | int | Day complaint filed (0=Mon) |
| last_tx_hour_of_day | int | Hour of last pre-complaint TX |
| time_since_last_tx_to_complaint_hours | float | Alias for complaint_delay |

### Geographic Features (8)

| Feature | Type | Description |
|---------|------|-------------|
| cand_distance_from_origin_km | float | Distance: origin → candidate |
| cand_distance_from_last_tx_km | float | Distance: last TX endpoint → candidate |
| cand_same_metro_as_origin | int | 1 if same metro as complaint origin |
| cand_same_metro_as_last_tx | int | 1 if same metro as last TX |
| cand_same_region_as_origin | int | 1 if same region as origin |
| cand_min_distance_from_any_tx_km | float | Min distance from any TX endpoint |
| cand_max_distance_from_any_tx_km | float | Max distance from any TX endpoint |
| cand_mean_distance_from_tx_endpoints_km | float | Mean distance from TX endpoints |

### Location Context Features (9)

| Feature | Type | Description |
|---------|------|-------------|
| loc_type_atm | int | 1 if ATM |
| loc_type_bank_branch | int | 1 if bank branch |
| loc_type_money_transfer | int | 1 if money transfer agent |
| loc_type_shopping_mall | int | 1 if shopping mall |
| loc_type_market | int | 1 if market |
| loc_type_transport_hub | int | 1 if transport hub |
| loc_is_cashout_friendly_type | int | 1 if ATM/bank/transfer |
| loc_density_score | float | Foot-traffic density (0-1) |
| loc_is_high_surveillance | int | 1 if high surveillance |

### Case Context Features (10)

| Feature | Type | Description |
|---------|------|-------------|
| case_reported_amount | float | Reported fraud amount |
| case_num_accounts | int | Accounts involved |
| case_num_transactions | int | Transactions in chain |
| case_scenario_DIRECT_CASHOUT | int | 1-hot for scenario |
| case_scenario_RAPID_MULE_CHAIN | int | 1-hot for scenario |
| case_scenario_MULTI_HOP | int | 1-hot for scenario |
| case_scenario_GEOGRAPHIC_JUMP | int | 1-hot for scenario |
| case_scenario_DELAYED_CASHOUT | int | 1-hot for scenario |
| case_scenario_URBAN_CLUSTER | int | 1-hot for scenario |
| case_scenario_DISPERSED_ACTIVITY | int | 1-hot for scenario |

## Metadata Columns (not features)

| Column | Description |
|--------|-------------|
| case_id | Case identifier |
| location_id | Candidate location identifier |
| is_true_location | Label (1 if true cash-out location) |

## Missing Value Policy

| Value | Meaning | Sentinel |
|-------|---------|----------|
| -1.0 | No pre-complaint TX available | complaint_delay, last_tx_hour, distance_from_last_tx |
| 0.0 | Genuinely zero | tx_cross_metro_count, tx_velocity (if no TX) |
| None | Not applicable | Never used |

## Forbidden Information (Layer B/C)

The following must NEVER enter any feature:

- `actual_cashout_location_id`
- `cashout_time`
- `cashout_metro`
- `scenario_used` (from GroundTruth)
- `selection_probability`
- Distance to true location
- Any post-cutoff transaction
- Any target-derived statistic

## Target Definition

For each CASE x CANDIDATE pair:

```
y = 1 if candidate.location_id == ground_truth.actual_cashout_location_id
y = 0 otherwise
```

The target is carried as `is_true_location` in the metadata columns.
It must NEVER appear in the feature columns (X).

## Train/Test Split Design

**CASE-LEVEL SPLITTING** — never row-level:

```
cases → split into train/test
    ↓
candidates inherit case split
    ↓
feature rows inherit split
```

A single case must NEVER appear in both train and test sets.
