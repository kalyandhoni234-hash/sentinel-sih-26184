# SENTINEL MVP Architecture

## Problem Statement

Development of a Predictive Analytics Framework for Cybercrime Complaints to Forecast Likely Cash Withdrawal Locations in Advance, Enabling Generation of Actionable Intelligence for Timely and Proactive Cybercrime Intervention.

**SIH Problem Statement ID:** 26184

## What SENTINEL Is

SENTINEL is an **investigator decision-support and intelligence-ranking system**. It analyzes evidence available at query time and ranks plausible cash-out locations so an investigator can prioritize where to investigate first.

## What SENTINEL Is NOT

- An exact future-location predictor
- A replacement for investigators
- Integrated with live NCRP data
- Using confidential banking data
- Making autonomous law-enforcement decisions

## MVP Scope (Internal Hackathon)

One complete vertical slice:

```
Synthetic Case
    ↓
Transaction / Investigation Evidence
    ↓
Candidate Cash-out Locations
    ↓
Feature Engineering            ← PHASE 2 (CURRENT)
    ↓
Weighted Risk Baseline         ← Phase 3
    ↓
Random Forest                  ← Phase 4
    ↓
Top-K Candidate Ranking
    ↓
Explanation
    ↓
API                            ← Phase 6
    ↓
GIS Dashboard                  ← Phase 7
    ↓
Investigator Priority / Simulated Alert
    ↓
Evaluation Against Hidden Ground Truth
```

## Current Implementation Status

### Phase 1 — Data Foundation ✅
- [x] Synthetic data schema (Pydantic models)
- [x] Geographic environment generator (5 metros, 44 locations)
- [x] 7 fraud scenario definitions
- [x] Transaction chain generator
- [x] Weighted-probability ground truth generator
- [x] Candidate generator with hard negatives
- [x] Data validation
- [x] Leakage detection
- [x] Reproducible generation (seeded)
- [x] Dataset manifests
- [x] 40 tests

### Phase 2 — Feature Engineering ✅
- [x] 47 candidate-level features (5 groups)
- [x] Query-time cutoff enforcement
- [x] Feature registry with leakage classification
- [x] Fixed temporal features (replaced binary proxy with real temporal features)
- [x] Missing value policy (sentinel -1.0)
- [x] Feature sanity report script
- [x] Case-level split preparation
- [x] 31 new feature tests + leakage tests
- [x] 73 total tests passing

### Phase 3 — Weighted Baseline ✅
- [x] Weighted scoring system with 5 feature groups
- [x] Group weights: geographic (30%), transaction (25%), location (15%), temporal (15%), case (15%)
- [x] Ranking evaluation: Top-1/3/5, MRR, mean/median rank
- [x] Per-scenario performance breakdown
- [x] Human-readable candidate explanations
- [x] Baseline evaluation script and report
- [x] 41 new Phase 3 tests + leakage audit
- [x] 114 total tests passing
### Phase 4 — Random Forest (Planned)
### Phase 5 — Evaluation (Planned)
### Phase 6 — FastAPI (Planned)
### Phase 7 — Next.js/GIS Dashboard (Planned)
### Phase 8 — Integration + Demo Hardening (Planned)

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Python, FastAPI |
| ML | scikit-learn, Random Forest |
| Database | PostgreSQL / Supabase |
| Frontend | Next.js, React, Tailwind CSS |
| GIS | Leaflet / MapLibre |
| Deployment | Render, Vercel, Supabase |
| Testing | pytest |

## Directory Structure

```
SENTINEL/
├── backend/app/          # FastAPI backend (Phase 6+)
├── frontend/             # Next.js frontend (Phase 7+)
├── src/
│   ├── data_generation/  # Synthetic data generator + features
│   │   ├── schema.py     # Pydantic models
│   │   ├── generator.py  # Data generation orchestrator
│   │   ├── features.py   # Feature engineering (Phase 2)
│   │   └── ...
│   └── modeling/         # Predictive modeling (Phase 3+)
│       ├── baseline.py   # Weighted risk baseline scorer
│       └── evaluation.py # Ranking evaluation metrics
├── data/generated/       # Model-visible data
├── data/evaluation/      # Hidden ground truth
├── configs/              # Configuration files
├── scripts/
│   ├── generate_data.py  # Data generation CLI
│   ├── feature_report.py # Feature sanity report
│   └── run_baseline.py   # Baseline evaluation CLI
├── tests/                # 114 tests
├── docs/
│   ├── SYNTHETIC_DATA_SPEC.md
│   ├── DATA_LEAKAGE_POLICY.md
│   ├── FEATURE_CONTRACT.md
│   ├── PROJECT_STATUS.md
│   ├── DEVELOPMENT_WORKFLOW.md
│   ├── baseline_evaluation.json  # Phase 3 evaluation results
│   └── MVP_ARCHITECTURE.md
├── .github/              # CI, PR/issue templates
└── pyproject.toml
```

## Data Policy

**All data in this repository is SYNTHETIC.**

- No real NCRP records
- No confidential financial data
- No real personally identifiable information
- No fabricated official government statistics
