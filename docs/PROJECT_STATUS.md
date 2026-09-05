# SENTINEL Project Status

Last updated: 2026-09-05

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
- 300 true positives = 300 cases
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
- **Honest result: Random Forest beats Weighted Baseline on 5/6 metrics (Top-1, Top-3, MRR, Mean Rank, Median Rank); Baseline wins Top-5 accuracy**
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

## Phase 7 — Frontend Dashboard ✅ COMPLETE

- Next.js 14 + React 18 + Tailwind CSS project
- TypeScript types matching API schemas (api.ts)
- API client for backend integration (lib/api.ts)
- Root layout with navigation header
- Home page with API health check + status cards
- Investigations list page (search, sort by date/amount/candidates, scenario color badges)
- Case detail page with model selection, top-K control, ranked candidates
- Leaflet GIS map with origin marker, rank-colored candidate markers, popups, legend
- Bidirectional highlight sync between candidate cards and map
- SSR-safe dynamic import for Leaflet
- Health/status page showing API endpoints and available models
- Build passes: `npm run build`
- Type check passes: `npm run typecheck`
- Frontend dev: `cd frontend && npm run dev`

## Phase 8 — Integration + Deployment (FUTURE)

- Supabase database
- Render/Vercel deployment
- Demo hardening

---

## Current Metrics

| Metric | Value |
|--------|-------|
| Cases | 300 |
| Accounts | 1505 |
| Transactions | 983 |
| Locations | 44 |
| Features | 47 |
| Tests | 181 passing (backend) |
| Frontend | 4 pages, 2 components (SentinelMap, SentinelMapWrapper) |
| Python | 3.12 |
| ML | scikit-learn 1.9 |
| API | FastAPI 0.141 |

## Phase 3 Baseline Results (Test Set — 60 cases)

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 15.0% |
| Top-3 Accuracy | 48.3% |
| Top-5 Accuracy | 75.0% |
| MRR | 0.3793 |
| Mean Rank | 4.68 |
| Median Rank | 4.0 |

## Phase 4 Random Forest Results (Test Set — 60 cases)

| Metric | Value | vs Baseline | Note |
|--------|-------|-------------|------|
| Top-1 Accuracy | 21.7% | +6.7% | Higher is better |
| Top-3 Accuracy | 53.3% | +5.0% | Higher is better |
| Top-5 Accuracy | 71.7% | -3.3% | Higher is better |
| MRR | 0.4231 | +0.0438 | Higher is better |
| Mean Rank ↓ | 4.27 | 4.68 → 4.27 | Lower is better |
| Median Rank ↓ | 3.0 | 4.0 → 3.0 | Lower is better |

**Overall winner: Random Forest (5/6 metrics)**

## Feature Group Importance (Random Forest)

| Group | Importance |
|-------|------------|
| Geographic | 49.2% |
| Transaction | 22.3% |
| Temporal | 10.8% |
| Location | 10.3% |
| Case | 7.4% |
