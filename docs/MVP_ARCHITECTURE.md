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

### Phase 4 — Random Forest ✅
- [x] RandomForestClassifier (200 trees, balanced, random_state=42)
- [x] Case-level split enforcement (no case in both train/test)
- [x] Full ranking evaluation (same metrics as Phase 3)
- [x] Per-scenario performance breakdown
- [x] Feature importance (individual + group aggregation)
- [x] Comparison framework (baseline vs RF)
- [x] Reproducible evaluation script (run_rf_evaluation.py)
- [x] 33 new Phase 4 tests (147 total)
- [x] Honest comparison: Weighted Baseline wins 6/6 metrics
- [x] All data is SYNTHETIC

### Phase 5 — Evaluation (Planned)
### Phase 6 — FastAPI ✅
- [x] FastAPI application with lifespan-based startup
- [x] Route/service/schema separation
- [x] GET /health endpoint
- [x] GET /api/v1/investigations (list all cases)
- [x] GET /api/v1/investigations/{case_id} (case details)
- [x] POST /api/v1/investigations/{case_id}/rank (rank candidates)
- [x] Pydantic request/response schemas with validation
- [x] DataService: data loading, feature pipeline, location lookups
- [x] ModelService: RF training, baseline/RF scoring, explanations
- [x] CORS configuration (configurable via env vars)
- [x] Location info for map display (lat, lng, metro, region, type)
- [x] Investigator decision-support language
- [x] No ground truth exposed via API
- [x] 33 new API tests (181 total)
- [x] Local startup: `uvicorn backend.app.main:app --reload`
- [x] API docs: http://localhost:8000/docs

### Phase 7 — Next.js/GIS Dashboard ✅ COMPLETE
- [x] Next.js 14 + React 18 + Tailwind CSS project
- [x] TypeScript types matching API schemas
- [x] API client for backend integration
- [x] Root layout with navigation
- [x] Home page with API health status
- [x] Investigations list page (search, sort, filter)
- [x] Case detail page with candidate ranking
- [x] Leaflet GIS map with origin marker, rank-colored candidates, popups, legend
- [x] Bidirectional highlight sync between cards and map
- [x] Health/status page

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
├── backend/
│   └── app/
│       ├── __init__.py
│       ├── main.py           # FastAPI app entry point
│       ├── config.py         # Settings from environment variables
│       ├── schemas.py        # Pydantic request/response models
│       ├── routes/
│       │   ├── __init__.py
│       │   ├── health.py     # GET /health
│       │   └── investigations.py  # Investigation + ranking endpoints
│       └── services/
│           ├── __init__.py
│           ├── data_service.py    # Data loading + feature pipeline
│           └── model_service.py   # Model training + scoring
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── layout.tsx      # Root layout with nav
│   │   │   ├── page.tsx        # Home page
│   │   │   ├── health/page.tsx # API status
│   │   │   └── investigations/
│   │   │       ├── page.tsx    # Case list
│   │   │       └── [caseId]/page.tsx  # Case detail + ranking
│   │   ├── components/
│   │   │   ├── SentinelMap.tsx       # Leaflet GIS map
│   │   │   └── SentinelMapWrapper.tsx # SSR-safe dynamic import
│   │   ├── lib/
│   │   │   ├── api.ts          # API client
│   │   │   └── leaflet-fix.ts  # Leaflet default icon fix
│   │   └── types/
│   │       └── api.ts          # TypeScript types
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.js
├── src/
│   ├── data_generation/  # Synthetic data generator + features
│   │   ├── schema.py     # Pydantic models
│   │   ├── generator.py  # Data generation orchestrator
│   │   ├── features.py   # Feature engineering (Phase 2)
│   │   └── ...
│   └── modeling/         # Predictive modeling (Phase 3+)
│       ├── baseline.py   # Weighted risk baseline scorer
│       ├── evaluation.py # Ranking evaluation metrics
│       ├── random_forest.py  # Random Forest classifier (Phase 4)
│       └── comparison.py     # Baseline vs RF comparison
├── data/generated/       # Model-visible data
├── data/evaluation/      # Hidden ground truth
├── configs/              # Configuration files
├── scripts/
│   ├── generate_data.py  # Data generation CLI
│   ├── feature_report.py # Feature sanity report
│   ├── run_baseline.py   # Baseline evaluation CLI
│   └── run_rf_evaluation.py  # Phase 4 RF evaluation CLI
├── tests/                # 181 tests (backend)
├── frontend/             # 4 pages, 2 components (Leaflet GIS)
├── docs/
│   ├── SYNTHETIC_DATA_SPEC.md
│   ├── DATA_LEAKAGE_POLICY.md
│   ├── FEATURE_CONTRACT.md
│   ├── PROJECT_STATUS.md
│   ├── DEVELOPMENT_WORKFLOW.md
│   ├── baseline_evaluation.json  # Phase 3 evaluation results
│   ├── rf_evaluation.json        # Phase 4 evaluation results
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
