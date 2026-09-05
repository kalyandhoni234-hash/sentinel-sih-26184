# SENTINEL

**Predictive Analytics Framework for Cybercrime Complaints**

SIH 2026 — Problem Statement ID: 26184

## Overview

SENTINEL is an investigator decision-support system that analyzes synthetic investigation evidence, generates plausible cash-out location candidates, ranks them, and provides explainable prioritization for cybercrime intervention.

> **Note:** This is the internal hackathon MVP. All data is synthetic. SENTINEL ranks plausible candidate cash-out locations based on evidence available at query time — it does NOT predict exact future locations.

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
- Case-level split preparation (240 train / 60 test)
- Duplicate candidate bug fixed (300 TPs = 300 cases)
- 73 tests passing

### Phase 3 — Weighted Risk Baseline ✅
- Weighted interpretable baseline model with 5 feature groups
- Group weights: geographic (30%), transaction (25%), location (15%), temporal (15%), case (15%)
- Ranking evaluation: Top-1/3/5 accuracy, MRR, mean/median rank
- Human-readable candidate explanations
- 41 new Phase 3 tests

### Phase 4 — Random Forest ✅
- RandomForestClassifier (200 trees, balanced class weights, random_state=42)
- Case-level split enforcement (no case in both train and test)
- Honest comparison: Random Forest wins 5/6 metrics (Top-5 accuracy goes to Baseline)
- 33 new Phase 4 tests

### Phase 6 — FastAPI Backend ✅
- FastAPI application with lifespan-based startup
- Endpoints: GET /health, GET/POST /api/v1/investigations, POST /api/v1/investigations/{id}/rank
- Pydantic request/response schemas with validation
- Service layer: DataService + ModelService
- CORS configuration (configurable via env vars)
- 34 API tests

### Phase 7 — Frontend Dashboard ✅
- Next.js 14 + React 18 + Tailwind CSS
- TypeScript types matching API schemas
- Investigations list page (search, sort by date/amount/candidates)
- Case detail page with model selection, top-K control, ranked candidates
- Leaflet GIS map with origin marker, rank-colored candidate markers, popups, legend
- Bidirectional highlight sync between candidate cards and map
- Health/status page showing API endpoints and available models

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
# All 181 tests
pytest -q

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

See [docs/DATA_LEAKAGE_POLICY.md](docs/DATA_LEAKAGE_POLICY.md) for the three-layer leakage contract (Layer A/B/C).

## Documentation

- [docs/MVP_ARCHITECTURE.md](docs/MVP_ARCHITECTURE.md) — Architecture overview
- [docs/FEATURE_CONTRACT.md](docs/FEATURE_CONTRACT.md) — Feature specification
- [docs/SYNTHETIC_DATA_SPEC.md](docs/SYNTHETIC_DATA_SPEC.md) — Data specification
- [docs/DATA_LEAKAGE_POLICY.md](docs/DATA_LEAKAGE_POLICY.md) — Leakage policy
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — Phase status
- [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) — Team workflow
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines

## Project Structure

```
SENTINEL/
├── backend/app/          # FastAPI backend
├── frontend/             # Next.js frontend with Leaflet GIS
├── src/data_generation/  # Synthetic data generator + features
│   ├── schema.py         # Pydantic models
│   ├── generator.py      # Data generation orchestrator
│   ├── features.py       # Feature engineering
│   └── ...
├── src/modeling/         # Predictive modeling
│   ├── baseline.py       # Weighted risk baseline
│   ├── evaluation.py     # Ranking evaluation metrics
│   ├── random_forest.py  # Random Forest classifier
│   └── comparison.py     # Baseline vs RF comparison
├── data/generated/       # Model-visible data (.jsonl)
├── data/evaluation/      # Hidden ground truth (.jsonl)
├── configs/              # Configuration files
├── scripts/
│   ├── generate_data.py  # Data generation CLI
│   ├── feature_report.py # Feature sanity report
│   ├── run_baseline.py   # Baseline evaluation CLI
│   └── run_rf_evaluation.py  # RF evaluation CLI
├── tests/                # 181 tests
├── docs/                 # Documentation
└── pyproject.toml
```

## License

[MIT License](LICENSE) — SIH 2026 Hackathon.
