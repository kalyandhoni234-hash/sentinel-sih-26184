# SENTINEL Project Status

Last updated: 2026-08-28

## Phase 1 — Data Foundation ✅ COMPLETE

- Synthetic data schema with Pydantic models
- Geographic environment generator (5 metros, 44 locations)
- 7 fraud scenario definitions with behavioral parameters
- Transaction chain generator with internal structure
- Weighted-probability ground truth generator
- Candidate generator with hard negatives
- Automated data validation
- Leakage detection system
- Reproducible generation (seeded RNG)
- Dataset manifests
- 40 tests

## Phase 2 — Feature Engineering ✅ COMPLETE

- 47 candidate-level features across 5 groups
- Query-time cutoff enforcement (only pre-complaint data)
- Feature registry with leakage classification
- Real temporal features (complaint delay, velocity, inter-arrival)
- Missing value policy (sentinel -1.0)
- Feature sanity report script
- Case-level split preparation
- Duplicate candidate bug fixed
- 80 true positives = 80 cases
- 73 tests passing

## Phase 3 — Weighted Risk Baseline ✅ COMPLETE

- Weighted interpretable baseline model with 5 feature groups
- Group weights: geographic (30%), transaction (25%), location (15%), temporal (15%), case (15%)
- Ranking evaluation: Top-1/3/5 accuracy, MRR, mean/median rank
- Per-scenario performance breakdown
- Case-level train/test split (80/20)
- Human-readable candidate explanations
- 41 new Phase 3 tests (114 total)
- Baseline evaluation report: docs/baseline_evaluation.json

## Phase 4 — Random Forest ✅ COMPLETE

- RandomForestClassifier (200 trees, balanced class weights, random_state=42)
- Trained on 47 Layer-A features, target = is_true_location
- Case-level split enforced (no case in both train and test)
- Full ranking evaluation: Top-1/3/5, MRR, mean/median rank
- Per-scenario performance breakdown
- Feature importance (individual + aggregated by 5 groups)
- Comparison framework: baseline vs RF
- Reproducible evaluation script: scripts/run_rf_evaluation.py
- 33 new Phase 4 tests (147 total)
- RF evaluation report: docs/rf_evaluation.json
- **Honest result: Weighted Baseline beats Random Forest on all 6 metrics**
- All data is SYNTHETIC — trained and evaluated on synthetic data only

## Phase 5 — Evaluation Framework (FUTURE)

- Comprehensive evaluation metrics
- Cross-validation
- Additional model comparisons

## Phase 6 — FastAPI Backend ✅ COMPLETE

- FastAPI application with clean route/service/schema separation
- Endpoints: GET /health, GET/POST /api/v1/investigations, POST /api/v1/investigations/{id}/rank
- Pydantic request/response schemas with validation
- Service layer: DataService (data loading + feature pipeline), ModelService (training + scoring)
- CORS configuration (configurable origins via environment variables)
- Supports both weighted baseline and Random Forest models
- Human-readable candidate explanations
- Location info for map/UI display (lat, lng, metro, region, type)
- Investigator decision-support language (no "prediction" claims)
- 33 new API tests (180 total)
- Local startup: `uvicorn backend.app.main:app --reload`
- API docs: http://localhost:8000/docs

## Phase 7 — Frontend Dashboard (FUTURE)

- Next.js + React + Tailwind
- Leaflet/MapLibre GIS interface
- Investigator dashboard

## Phase 8 — Integration + Deployment (FUTURE)

- Supabase database
- Render/Vercel deployment
- Demo hardening

---

## Current Metrics

| Metric | Value |
|--------|-------|
| Cases | 80 |
| Accounts | 400 |
| Transactions | 257 |
| Locations | 44 |
| Features | 47 |
| Tests | 180 passing |
| Python | 3.12 |
| ML | scikit-learn 1.9 |
| API | FastAPI 0.141 |

## Phase 3 Baseline Results (Test Set)

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 43.8% |
| Top-3 Accuracy | 81.2% |
| Top-5 Accuracy | 87.5% |
| MRR | 0.6434 |
| Mean Rank | 2.69 |
| Median Rank | 2.0 |

## Phase 4 Random Forest Results (Test Set)

| Metric | Value | vs Baseline |
|--------|-------|-------------|
| Top-1 Accuracy | 31.2% | -12.5% |
| Top-3 Accuracy | 62.5% | -18.8% |
| Top-5 Accuracy | 87.5% | +0.0% |
| MRR | 0.5161 | -0.1273 |
| Mean Rank | 3.19 | -0.50 |
| Median Rank | 3.0 | -1.0 |

**Overall winner: Weighted Baseline (6/6 metrics)**

## Feature Group Importance (Random Forest)

| Group | Importance |
|-------|------------|
| Geographic | 56.9% |
| Transaction | 19.2% |
| Location | 9.9% |
| Temporal | 8.2% |
| Case | 6.0% |
