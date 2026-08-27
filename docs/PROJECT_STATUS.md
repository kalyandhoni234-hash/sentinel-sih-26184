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

## Phase 3 — Weighted Risk Baseline (NEXT)

- Weighted interpretable baseline model
- Feature importance analysis
- Recall@K, MRR evaluation metrics
- Risk scoring

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
| Tests | 73 passing |
| Python | 3.12 |
| Framework | scikit-learn (planned) |
