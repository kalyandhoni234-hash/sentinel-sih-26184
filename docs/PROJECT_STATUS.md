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

## Phase 4 — Random Forest (FUTURE)

- Random Forest classifier
- Hyperparameter tuning
- Feature importance comparison

## Phase 5 — Evaluation Framework (FUTURE)

- Comprehensive evaluation metrics
- Cross-validation
- Baseline comparison

## Phase 6 — FastAPI Backend (FUTURE)

- Prediction API
- Health checks
- Documentation

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
| Transactions | 261 |
| Locations | 44 |
| Features | 47 |
| Tests | 114 passing |
| Python | 3.12 |
| Framework | scikit-learn (planned) |

## Phase 3 Baseline Results (Test Set)

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 37.5% |
| Top-3 Accuracy | 62.5% |
| Top-5 Accuracy | 62.5% |
| MRR | 0.5119 |
| Mean Rank | 4.88 |
| Median Rank | 3.0 |
