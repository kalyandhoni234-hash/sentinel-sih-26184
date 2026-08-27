# SENTINEL Development Workflow

## Multi-Laptop Team Workflow

Each developer works independently on their local clone, pushes to feature branches, and merges via Pull Requests.

### Developer A (e.g., Kalyan — Backend/ML)

```
local clone
    ↓
git checkout -b feat/phase3-weighted-baseline
    ↓
make changes, run tests
    ↓
git add . && git commit -m "feat: add weighted baseline"
    ↓
git push origin feat/phase3-weighted-baseline
    ↓
Open Pull Request → CI runs → Review → Merge to main
```

### Developer B (e.g., Bhupinder — Frontend)

```
local clone
    ↓
git checkout -b feat/frontend-dashboard
    ↓
make changes, test locally
    ↓
git add . && git commit -m "feat: add dashboard layout"
    ↓
git push origin feat/frontend-dashboard
    ↓
Open Pull Request → CI runs → Review → Merge to main
```

Both developers work independently. Their branches do not conflict because they work in different directories (`src/` vs `frontend/`).

## Directory Ownership

```
SENTINEL/
├── src/            → Kalyan (backend, data, ML)
├── tests/          → Kalyan (tests)
├── scripts/        → Kalyan (data generation, utilities)
├── configs/        → Kalyan (generation config)
├── data/           → Kalyan (synthetic data)
├── backend/        → Kalyan (FastAPI — Phase 6)
├── frontend/       → Bhupinder (Next.js — Phase 7)
├── docs/           → Anyone (shared documentation)
└── .github/        → Anyone (CI, templates)
```

## Commit Messages

Use conventional format:

```
feat: add weighted risk baseline
fix: correct candidate deduplication
docs: update project status
test: add feature matrix tests
refactor: simplify feature computation
```

## Before Opening a PR

1. `pytest -q` — all tests pass
2. `ruff format --check .` — formatting is clean
3. `ruff check .` — no lint errors
4. Review your diff — no secrets, no real data, no leakage
5. Write a clear PR description

## Code Review Checklist

- [ ] Tests pass in CI
- [ ] No secrets or credentials
- [ ] No real NCRP/bank/personal data
- [ ] No post-complaint information in features
- [ ] No ground truth leakage
- [ ] Documentation updated if needed
- [ ] PR is focused on one change
