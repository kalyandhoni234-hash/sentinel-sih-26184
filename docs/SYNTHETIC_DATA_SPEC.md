# SENTINEL Synthetic Data Specification

## Overview

SENTINEL uses **synthetic data only** for development and testing. No real NCRP data, banking data, or personally identifiable information is used.

## Data Entities

### Case
| Field | Type | Description |
|-------|------|-------------|
| case_id | string | Unique case identifier (e.g., `CASE_0001`) |
| complaint_time | datetime | When the complaint was filed |
| fraud_scenario | enum | Type of fraud scenario (7 types) |
| reported_amount | float | Reported fraud amount in INR |
| origin_metro | string | Metro area where complaint originated |
| origin_location_id | string | Location ID of complaint origin |
| num_accounts_involved | int | Number of accounts in the chain |
| num_transactions | int | Number of transactions in the chain |

### Account
| Field | Type | Description |
|-------|------|-------------|
| account_id | string | Unique account identifier |
| case_id | string | Parent case identifier |
| role | enum | VICTIM, MULE, CASH_OUT, INTERMEDIATE, UNKNOWN |
| bank_synthetic | string | Synthetic bank name |
| account_age_days | int | Synthetic account age in days |

### Transaction
| Field | Type | Description |
|-------|------|-------------|
| transaction_id | string | Unique transaction identifier |
| case_id | string | Parent case identifier |
| sender_account_id | string | Sender account identifier |
| receiver_account_id | string | Receiver account identifier |
| timestamp | datetime | Transaction timestamp |
| amount | float | Transaction amount in INR |
| transaction_type | enum | UPI, NEFT, RTGS, IMPS, WIRE |
| sequence_number | int | Order in the transaction chain |
| sender_metro | string | Metro where sender is located |
| receiver_metro | string | Metro where receiver is located |

### Location
| Field | Type | Description |
|-------|------|-------------|
| location_id | string | Unique location identifier |
| latitude | float | Latitude coordinate |
| longitude | float | Longitude coordinate |
| metro | string | Metro area name |
| region | string | Sub-region within the metro |
| location_type | enum | ATM, BANK_BRANCH, etc. |
| density_score | float | 0.0-1.0, foot-traffic density |
| cash_out_attractiveness | float | 0.0-1.0, attractiveness for cash-out |
| is_high_surveillance | bool | Whether location has high surveillance |

### Candidate
| Field | Type | Description |
|-------|------|-------------|
| case_id | string | Parent case identifier |
| location_id | string | Candidate location identifier |
| distance_from_origin_km | float | Distance from complaint origin |
| scenario_affinity | float | 0.0-1.0, scenario fit score |
| transaction_proximity_score | float | 0.0-1.0, transaction chain proximity |
| temporal_plausibility | float | 0.0-1.0, timing plausibility |
| density_score | float | 0.0-1.0, foot-traffic density |

### Ground Truth (Evaluation Only)
| Field | Type | Description |
|-------|------|-------------|
| case_id | string | Parent case identifier |
| actual_cashout_location_id | string | True cash-out location |
| cashout_time | datetime | When the cash-out occurred |
| cashout_metro | string | Metro where cash-out occurred |
| scenario_used | enum | Scenario used for generation |
| selection_probability | float | Generator-assigned probability |

## Fraud Scenarios

| Scenario | Description | Hops | Cross-Metro |
|----------|-------------|------|-------------|
| DIRECT_CASHOUT | Direct transfer to cash-out | 1-2 | No |
| RAPID_MULE_CHAIN | Quick chain through mules | 3-4 | No |
| MULTI_HOP | Complex chain, 4+ intermediates | 4-6 | Yes |
| GEOGRAPHIC_JUMP | Funds jump to different metro | 2-4 | Yes |
| DELAYED_CASHOUT | Significant delay before cash-out | 2-3 | Yes |
| URBAN_CLUSTER | Activity concentrated in one area | 2-4 | No |
| DISPERSED_ACTIVITY | Spread across metros | 3-5 | Yes |

## Geographic Environment

5 synthetic metro areas modeled after Indian cities:

- **Delhi NCR** (~28.61°N, 77.21°E) — 10 locations
- **Mumbai** (~19.08°N, 72.88°E) — 10 locations
- **Kolkata** (~22.57°N, 88.36°E) — 8 locations
- **Chennai** (~13.08°N, 80.27°E) — 8 locations
- **Jaipur** (~26.91°N, 75.79°E) — 8 locations

Total: ~44 locations across 10 location types.

## Generation Process

1. Locations generated deterministically from seed
2. Cases generated with scenario-weighted sampling
3. Accounts created per case with role assignments
4. Transaction chains generated with scenario-controlled structure
5. Ground truth selected via weighted probability (NOT random.choice)
6. Candidate sets created with hard negatives

## Output Files

| Directory | Files | Model-Visible |
|-----------|-------|---------------|
| data/generated/ | cases, accounts, transactions, locations, candidates | Yes |
| data/evaluation/ | ground_truth | No (evaluation only) |
| data/manifests/ | manifest JSON | Metadata |
