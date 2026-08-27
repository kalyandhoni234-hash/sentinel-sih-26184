# Contributing to SENTINEL

Thank you for contributing to SENTINEL — the SIH 2026 Predictive Analytics Framework for Cybercrime Complaints.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Protected/stable branch. Never push directly. |
| `feat/*` | New features (e.g., `feat/phase3-weighted-baseline`) |
| `fix/*` | Bug fixes (e.g., `fix/candidate-generation`) |
| `docs/*` | Documentation updates (e.g., `docs/ppt-update`) |

## Workflow

1. Create a feature branch from `main`
2. Make focused commits
3. Run tests before opening a PR
4. Open a Pull Request
5. Review the diff
6. Merge only after CI passes
7. Keep PRs focused — one logical change per PR

## Running Tests

```bash
# Run all tests
pytest -q

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_features.py -v
```

## Code Quality

```bash
# Format check
ruff format --check .

# Lint check
ruff check .

# Auto-format
ruff format .
```

## Data Leakage Rules

SENTINEL enforces a strict three-layer data leakage contract:

- **Layer A**: Available at query time (case info, transactions, locations, features)
- **Layer B**: Not available at query time (generator weights, scenario parameters)
- **Layer C**: Evaluation only (ground truth, cashout time, is_true_location)

**Never** add features derived from Layer B or Layer C fields.

Run leakage checks:
```bash
pytest tests/test_leakage.py tests/test_audit_regression.py -v
```

## Ownership Boundaries

| Area | Owner |
|------|-------|
| Backend / Data / ML / Tests | Kalyan |
| Frontend / Dashboard / Maps / UI | Bhupinder |
| Research / Documentation / PPT / Demo | Other members |

## What NOT to Commit

- Real NCRP data
- Real banking data
- Real personally identifiable information
- API keys, passwords, tokens
- `.env` files with real values
- Post-complaint information in model features
- Ground truth information in feature matrices
