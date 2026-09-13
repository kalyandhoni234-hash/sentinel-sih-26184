# SENTINEL Project Status

Last updated: 2026-09-13

## Phase 10 — Dataset Scale & Diversity ✅ COMPLETE

- Synthetic geography expanded: 47 city metros across 21 states/UTs (tier-weighted origin sampling)
- Corpus scaled to 5,000 cases (seed 42, deterministic — byte-identical on regeneration)
- 365-day complaint window; lognormal (clipped) amount distribution
- Ledger consistency fix: accounts = num_transactions + 1, no unused tail accounts
- Canonical dataset loading in DataService + per-case indexes (fast startup and request routing)
- Dataset audit script (`scripts/dataset_stats.py`): duplicates, leakage, analysis-point boundary — all PASS

## Phase 1 — Data Foundation ✅ COMPLETE

- Synthetic data schema with Pydantic models
- Geographic environment generator (now 47 metros, 385 locations — see Phase 10)
- 7 fraud scenario definitions with behavioral parameters
- Transaction chain generator with internal structure
- Weighted-probability ground truth generator
- Candidate generator with evidence-metro + multi-anchor selection (no ground-truth access)
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
- Duplicate candidate bug fixed (300 cases, target-independent candidate generation; 100% candidate coverage)
- 73 tests passing

## Phase 3 — Weighted Risk Baseline ✅ COMPLETE

- Weighted interpretable baseline model with 5 feature groups
- Group weights: geographic (30%), transaction (25%), location (15%), temporal (15%), case (15%)
- Ranking evaluation: Top-1/3/5 accuracy, MRR, mean/median rank
- Per-scenario performance breakdown
- Case-level train/test split (80/20)
- Human-readable candidate explanations
- 41 new Phase 3 tests (114 total)

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
- **Historical pre-P0 result (retained for development history): Random Forest beat Weighted Baseline on 5/6 metrics under the pre-leakage-fix candidate-generation pipeline; Baseline won Top-5 accuracy. The current post-P0 numbers are reported separately below.**
- All data is SYNTHETIC — trained and evaluated on synthetic data only

## Phase 5 — Evaluation Framework (FUTURE)

- Comprehensive evaluation metrics
- Cross-validation
- Additional model comparisons

## Phase 6 — FastAPI Backend ✅ COMPLETE

- FastAPI application with clean route/service/schema separation
- Endpoints: GET /health, GET /api/v1/investigations, GET /api/v1/investigations/{case_id}, POST /api/v1/investigations/{case_id}/rank
- Pydantic request/response schemas with validation
- Service layer: DataService (data loading + feature pipeline), ModelService (training + scoring)
- CORS configuration (configurable origins via environment variables)
- Supports both weighted baseline and Random Forest models
- Human-readable candidate explanations
- Location info for map/UI display (lat, lng, metro, region, type)
- Investigator decision-support language (no "prediction" claims)
- 33 new API tests (181 total)
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
| Cases | 5,000 (dataset v0.2.0, seed 42) |
| Accounts | 20,653 |
| Transactions | 15,653 |
| Locations | 385 (47 metros, 21 states/UTs) |
| Features | 47 |
| Tests | 241 tests (backend suite) |
| Frontend | Next.js app — 9 routes, case workspace with 7 surfaces |
| Python | 3.12 |
| ML | scikit-learn 1.9 |
| API | FastAPI 0.141 |

## Historical — Pre-P0 Leakage-Fix Evaluation

The following results were produced by the **earlier candidate-generation pipeline**, which force-inserted the true cash-out location into the candidate set. They are retained here **only as historical development results** and do **not** represent the current SENTINEL behavior. The current, ground-truth-independent evaluation is reported in the next section.

### Phase 3 Baseline Results (Test Set — 60 cases) — Historical

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 15.0% |
| Top-3 Accuracy | 48.3% |
| Top-5 Accuracy | 75.0% |
| MRR | 0.3793 |
| Mean Rank | 4.68 |
| Median Rank | 4.0 |

### Phase 4 Random Forest Results (Test Set — 60 cases) — Historical

| Metric | Value | vs Baseline | Note |
|--------|-------|-------------|------|
| Top-1 Accuracy | 21.7% | +6.7% | Higher is better |
| Top-3 Accuracy | 53.3% | +5.0% | Higher is better |
| Top-5 Accuracy | 71.7% | -3.3% | Higher is better |
| MRR | 0.4231 | +0.0438 | Higher is better |
| Mean Rank ↓ | 4.27 | 4.68 → 4.27 | Lower is better |
| Median Rank ↓ | 3.0 | 4.0 → 3.0 | Lower is better |

**Historical overall winner: Random Forest (5/6 metrics)** — Note: the current post-P0 evaluation shows a 3/3 tie (see below).

### Feature Group Importance (Random Forest, Historical)

| Group | Importance |
|-------|------------|
| Geographic | 49.2% |
| Transaction | 22.3% |
| Temporal | 10.8% |
| Location | 10.3% |
| Case | 7.4% |

## Current — Post-P0 Leakage-Fix / Evidence-Based Evaluation

The following results are produced by the **current SENTINEL pipeline**:

- **Evidence-based candidate generation**: candidates come from the union of the origin metro and all transaction sender/receiver metros (the "evidence metros").
- **Multi-anchor deterministic selection**: when the evidence-metro pool exceeds `max_per_case`, selection is performed by ranking candidates by geographic distance to multiple observable evidence anchors (complaint origin + one representative location per distinct transaction receiver metro).
- **Ground-truth-independent candidate generation**: the true cash-out location is never force-inserted, never accessed, and never used to guide candidate generation or selection.

### Phase 3 Baseline Results (Test Set — 60 cases) — Current

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 8.3% |
| Top-3 Accuracy | 20.0% |
| Top-5 Accuracy | 31.7% |
| MRR | 0.2254 |
| Mean Rank | 8.12 |
| Median Rank | 9.0 |

### Phase 4 Random Forest Results (Test Set — 60 cases) — Current

| Metric | Value | vs Baseline | Note |
|--------|-------|-------------|------|
| Top-1 Accuracy | 8.3% | +0.0% | Higher is better |
| Top-3 Accuracy | 26.7% | +6.7% | Higher is better |
| Top-5 Accuracy | 31.7% | +0.0% | Higher is better |
| MRR | 0.2362 | +0.0108 | Higher is better |
| Mean Rank ↓ | 8.07 | 8.12 → 8.07 | Lower is better |
| Median Rank ↓ | 9.0 | 9.0 → 9.0 | Lower is better |

**Overall winner (current): Random Forest wins 3/6 metrics** (Top-3, MRR, Mean Rank); Weighted Baseline wins 3/6 (Top-1, Top-5, Median Rank).

### Per-Scenario MRR (Current)

| Scenario | Baseline MRR | RF MRR | Winner |
|-----------|-------------:|-------:|--------|
| DELAYED_CASHOUT | 0.1722 | 0.1511 | Baseline |
| DIRECT_CASHOUT | 0.4248 | 0.2765 | Baseline |
| DISPERSED_ACTIVITY | 0.1866 | 0.1421 | Baseline |
| GEOGRAPHIC_JUMP | 0.2001 | 0.2094 | RF |
| MULTI_HOP | 0.1538 | 0.3204 | RF |
| RAPID_MULE_CHAIN | 0.1844 | 0.3161 | RF |
| URBAN_CLUSTER | 0.3861 | 0.1817 | Baseline |

### Feature Group Importance (Random Forest, Current)

| Group | Importance |
|-------|------------|
| Geographic | 31.7% |
| Transaction | 30.7% |
| Temporal | 15.0% |
| Location | 13.6% |
| Case | 9.1% |

## Candidate-Coverage (Evidence-Limited)

The current candidate-generation pipeline operates on **observable pre-prediction evidence only**:

- The candidate set is built from the union of the **origin metro** and all **transaction sender/receiver metros** (the "evidence metros").
- When the evidence-metro pool is larger than the candidate-count cap, the implementation uses a **multi-anchor deterministic selection**: the complaint origin plus one representative location per distinct transaction receiver metro, with per-anchor proximity quotas.
- **Ground truth is never used** during candidate generation or selection, and the true cash-out location is **never force-inserted**.

### Measured Coverage (Current Dataset: 47 metros, 385 locations)

- **True location present in candidate set**: 1,414/5,000 cases (28.3%)
- **Average candidates per case**: 11.38 (range: 10–18)

### Why Coverage Is No Longer Near-100% on This Dataset

Candidate generation is deliberately target-independent: it never inspects the hidden ground truth. On the v0.1 dataset (5 metros, 44 locations) the evidence-metro pool was small enough that the deterministic multi-anchor selection usually swept in the true location (100% coverage). At 47 metros / 385 locations the same evidence-anchored rules select a genuinely contested candidate set — the true location is present in 27.2% of cases. This is the correct, leakage-free behavior: coverage is an evaluation outcome, not a generator guarantee, and ranking models are evaluated against whatever subset the observable evidence yields.

### Real-World Coverage Considerations

In a real-world deployment with many more metros and locations:

- Coverage could drop when the true cash-out metro is not represented in the observable transaction evidence.
- Additional real-world evidence — surveillance footage, suspect travel history, additional transaction channels, or partial intelligence from cooperating institutions — could expand candidate coverage.
- The current 100% coverage is a property of this specific 5-metro synthetic dataset and should not be extrapolated to larger geographic scopes.

The implementation does **not** guarantee 100% coverage in all scenarios; it achieves 100% on the current dataset and honestly reports the result.
