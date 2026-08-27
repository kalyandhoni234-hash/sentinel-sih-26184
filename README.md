# SENTINEL

**Predictive Analytics Framework for Cybercrime Complaints**

SIH 2026 — Problem Statement ID: 26184

## Overview

SENTINEL is an investigator decision-support system that analyzes synthetic investigation evidence, generates plausible cash-out location candidates, ranks them, and provides explainable prioritization for cybercrime intervention.

> **Note:** This is the internal hackathon MVP. All data is synthetic.

## Problem Statement

> "Development of a Predictive Analytics Framework for Cybercrime Complaints to Forecast Likely Cash Withdrawal Locations in Advance, Enabling Generation of Actionable Intelligence for Timely and Proactive Cybercrime Intervention."

## Current Status

### Phase 1 — Data Foundation ✅
- Synthetic data schema with Pydantic models
- Geographic environment generator (5 Indian metro areas, ~44 locations)
- 7 fraud scenario types with behavioral parameters
- Transaction chain generator with internal structure
- Weighted-probability ground truth generator (NOT random.choice)
- Candidate generator with hard negatives
- Automated data validation
- Leakage detection system
- Reproducible generation (seeded RNG)
- Dataset manifests
- 40 tests

### Phase 2 — Feature Engineering ✅
- 47 candidate-level features across 5 groups
- Query-time cutoff enforcement (only pre-complaint data)
- Feature registry with leakage classification
- Real temporal features (complaint delay, velocity, inter-arrival)
- Missing value policy (sentinel -1.0 for no pre-complaint TX)
- Feature sanity report script
- Case-level split preparation
- 31 new feature tests + leakage tests
- 71 total tests passing

### Planned (Phases 3-8)
- Weighted risk baseline
- Random Forest model
- Evaluation framework
- FastAPI prediction API
- Next.js + Leaflet GIS dashboard
- Deployment (Render, Vercel, Supabase)

## Quick Start

### Generate Synthetic Data

```bash
pip install -e ".[dev]"

# Generate dataset
python scripts/generate_data.py

# Generate with specific seed
python scripts/generate_data.py --seed 123
```

### Build Feature Matrix

```python
from src.data_generation.features import build_feature_matrix
from src.data_generation.generator import generate_dataset

result = generate_dataset(seed=42)
# Load data, build matrix (see scripts/feature_report.py for full example)
```

### Run Feature Report

```bash
python scripts/feature_report.py
```

### Run Tests

```bash
# All 71 tests
pytest

# Feature tests only
pytest tests/test_features.py -v

# Leakage tests
pytest tests/test_leakage.py tests/test_audit_regression.py -v
```

## Data Policy

**All data in this repository is SYNTHETIC.**

- No real NCRP records
- No confidential financial data
- No real personally identifiable information
- No fabricated official government statistics

See [docs/DATA_LEAKAGE_POLICY.md](docs/DATA_LEAKAGE_POLICY.md) for details.

## Documentation

- [docs/MVP_ARCHITECTURE.md](docs/MVP_ARCHITECTURE.md) — Architecture overview
- [docs/FEATURE_CONTRACT.md](docs/FEATURE_CONTRACT.md) — Feature specification
- [docs/SYNTHETIC_DATA_SPEC.md](docs/SYNTHETIC_DATA_SPEC.md) — Data specification
- [docs/DATA_LEAKAGE_POLICY.md](docs/DATA_LEAKAGE_POLICY.md) — Leakage policy

## Project Structure

```
SENTINEL/
├── backend/app/          # FastAPI backend (Phase 6+)
├── frontend/             # Next.js frontend (Phase 7+)
├── src/data_generation/  # Synthetic data generator + features
│   ├── schema.py         # Pydantic models
│   ├── generator.py      # Data generation orchestrator
│   ├── features.py       # Feature engineering
│   └── ...
├── data/generated/       # Model-visible data
├── data/evaluation/      # Hidden ground truth
├── configs/              # Configuration files
├── scripts/
│   ├── generate_data.py  # Data generation CLI
│   └── feature_report.py # Feature sanity report
├── tests/                # 71 tests
├── docs/                 # Documentation
└── pyproject.toml
```

## License

Internal use only — SIH 2026 Hackathon.
"# sentinel-sih-26184" 
