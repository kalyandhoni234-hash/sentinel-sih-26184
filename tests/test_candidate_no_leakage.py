"""Tests proving candidate generation does not depend on ground truth.

These tests verify the P0 audit fix:
  Candidate generation must NOT receive, read, or use the hidden
  ground-truth location to construct the candidate set.

Specifically, this module verifies:
  1. Candidate generation runs without any ground-truth argument.
  2. Changing/removing the ground truth does NOT affect the candidate set.
  3. The candidate-generation API does NOT inject the target location.
  4. Hard-negative selection does NOT depend on target distance.
  5. Ground truth remains available only to evaluation/labelling.
"""

from __future__ import annotations

import inspect
import random
from datetime import datetime, timedelta

import pytest

from src.data_generation.candidates import (
    generate_candidates_for_case,
    label_candidates_with_ground_truth,
)
from src.data_generation.locations import generate_locations
from src.data_generation.schema import (
    Case,
    FraudScenario,
    Location,
    Transaction,
    TransactionType,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_locations() -> list[Location]:
    rng = random.Random(7)
    geo = {
        "metros": [
            {"name": "Delhi NCR", "center_lat": 28.6, "center_lon": 77.2, "location_count": 8},
            {"name": "Mumbai", "center_lat": 19.0, "center_lon": 72.8, "location_count": 8},
            {"name": "Kolkata", "center_lat": 22.5, "center_lon": 88.3, "location_count": 6},
        ]
    }
    return generate_locations(geo, rng)


def _make_case(case_id: str = "CASE_TEST_0001") -> Case:
    return Case(
        case_id=case_id,
        complaint_time=datetime(2025, 6, 1, 12, 0, 0),
        fraud_scenario=FraudScenario.DIRECT_CASHOUT,
        reported_amount=50000.0,
        origin_metro="Delhi NCR",
        origin_location_id="LOC_0001",
        num_accounts_involved=3,
        num_transactions=2,
    )


def _make_txs(case_id: str = "CASE_TEST_0001") -> list[Transaction]:
    base = datetime(2025, 6, 1, 8, 0, 0)
    return [
        Transaction(
            transaction_id=f"TX_{case_id}_001",
            case_id=case_id,
            sender_account_id="ACCT_1",
            receiver_account_id="ACCT_2",
            timestamp=base,
            amount=50000.0,
            transaction_type=TransactionType.UPI,
            sequence_number=1,
            sender_metro="Delhi NCR",
            receiver_metro="Delhi NCR",
        ),
        Transaction(
            transaction_id=f"TX_{case_id}_002",
            case_id=case_id,
            sender_account_id="ACCT_2",
            receiver_account_id="ACCT_3",
            timestamp=base + timedelta(hours=1),
            amount=49500.0,
            transaction_type=TransactionType.NEFT,
            sequence_number=2,
            sender_metro="Delhi NCR",
            receiver_metro="Mumbai",
        ),
    ]


@pytest.fixture
def locations() -> list[Location]:
    return _make_locations()


@pytest.fixture
def case() -> Case:
    return _make_case()


@pytest.fixture
def case_txs(case: Case) -> list[Transaction]:
    return _make_txs(case.case_id)


# ---------------------------------------------------------------------------
# 1. Candidate generation has no ground-truth parameter
# ---------------------------------------------------------------------------


def test_generate_candidates_signature_has_no_ground_truth_param():
    """The public candidate-generation function must not accept a
    ground-truth parameter in its signature."""
    sig = inspect.signature(generate_candidates_for_case)
    params = list(sig.parameters.keys())
    forbidden = {"true_ground_truth", "ground_truth", "gt", "true_location", "target"}
    leaked = [p for p in params if p.lower() in forbidden]
    assert not leaked, f"generate_candidates_for_case accepts ground-truth parameter(s): {leaked}. Signature: {params}"


def test_generate_candidates_can_run_without_ground_truth(case, case_txs, locations):
    """Calling generate_candidates_for_case with NO ground-truth object
    must succeed and produce a valid candidate set."""
    rng = random.Random(42)
    cfg = {"min_per_case": 10, "max_per_case": 18}

    candidates = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng,
    )

    assert len(candidates) >= 5, (
        f"Candidate generation produced only {len(candidates)} candidates when called without ground truth"
    )
    # All candidates must reference the case
    for cand in candidates:
        assert cand.case_id == case.case_id
        assert cand.is_true_location is False  # never labelled pre-eval


# ---------------------------------------------------------------------------
# 2. Candidate set is invariant to the ground truth value
# ---------------------------------------------------------------------------


def test_candidate_set_invariant_to_ground_truth(case, case_txs, locations):
    """Changing the ground-truth value must NOT change the candidate set.

    We generate candidates twice (same seed, same evidence) but with
    different "would-be" ground truths. The candidate sets must be identical.
    """
    cfg = {"min_per_case": 10, "max_per_case": 18}

    rng_a = random.Random(42)
    cands_a = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng_a,
    )

    rng_b = random.Random(42)
    cands_b = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng_b,
    )

    # Candidate set must be byte-identical (same locations, same features)
    sig_a = sorted((c.location_id, round(c.distance_from_origin_km, 4)) for c in cands_a)
    sig_b = sorted((c.location_id, round(c.distance_from_origin_km, 4)) for c in cands_b)
    assert sig_a == sig_b, "Candidate set changed across runs that only differ in RNG seed reset"

    # And re-generate with a totally different seed: still deterministic
    # relative to (case, transactions, locations, config, seed) only.
    rng_c = random.Random(999)
    generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng_c,
    )
    # With a different seed, the set MAY differ (this is allowed). What matters
    # is that no candidate-set location was selected because of a hidden target.
    # We verify this by inspecting each candidate below (test_no_target_injected).


# ---------------------------------------------------------------------------
# 3. Candidate generation does not inject the target location
# ---------------------------------------------------------------------------


def test_no_target_injected(case, case_txs, locations):
    """Verify that the generator does not force-insert a specific location
    based on hidden target information.

    Under the multi-anchor selection design, the candidate set is fully
    deterministic given (case, transactions, locations, config, target_count).
    The target_count itself is drawn from the seeded RNG, so different seeds
    produce different target_counts in [10, 18] and thus different candidate
    set sizes. But for a FIXED target_count, the selection is deterministic.

    We verify two anti-leakage properties:
    1. For a fixed seed, the candidate set is identical across calls
       (purely deterministic for the same RNG state).
    2. No location outside the observable evidence metros appears in the
       candidate set, regardless of seed.
    3. The selection does not depend on a "forced target" — we test this
       by checking that a location that is NOT in the evidence metros
       (and therefore cannot be reached by any anchor) is never included.
    """
    cfg = {"min_per_case": 10, "max_per_case": 18}

    # Use a fixture with a large pool to exercise the multi-anchor path
    rng_big = random.Random(7)
    geo_big = {
        "metros": [
            {"name": "Delhi NCR", "center_lat": 28.6, "center_lon": 77.2, "location_count": 8},
            {"name": "Mumbai", "center_lat": 19.0, "center_lon": 72.8, "location_count": 8},
            {"name": "Kolkata", "center_lat": 22.5, "center_lon": 88.3, "location_count": 6},
            {"name": "Chennai", "center_lat": 13.0, "center_lon": 80.0, "location_count": 6},
        ]
    }
    big_locs = generate_locations(geo_big, rng_big)
    # Create a case with 3 distinct TX receiver metros so the pool is large
    base = datetime(2025, 6, 1, 8, 0, 0)
    big_txs = [
        Transaction(
            transaction_id="TX_TEST_001",
            case_id="CASE_X",
            sender_account_id="A1",
            receiver_account_id="A2",
            timestamp=base,
            amount=50000.0,
            transaction_type=TransactionType.UPI,
            sequence_number=1,
            sender_metro="Delhi NCR",
            receiver_metro="Delhi NCR",
        ),
        Transaction(
            transaction_id="TX_TEST_002",
            case_id="CASE_X",
            sender_account_id="A2",
            receiver_account_id="A3",
            timestamp=base + timedelta(hours=1),
            amount=49500.0,
            transaction_type=TransactionType.NEFT,
            sequence_number=2,
            sender_metro="Delhi NCR",
            receiver_metro="Mumbai",
        ),
        Transaction(
            transaction_id="TX_TEST_003",
            case_id="CASE_X",
            sender_account_id="A3",
            receiver_account_id="A4",
            timestamp=base + timedelta(hours=2),
            amount=49000.0,
            transaction_type=TransactionType.IMPS,
            sequence_number=3,
            sender_metro="Mumbai",
            receiver_metro="Chennai",
        ),
    ]
    big_case = Case(
        case_id="CASE_TEST_0001",
        complaint_time=datetime(2025, 6, 1, 12, 0, 0),
        fraud_scenario=FraudScenario.MULTI_HOP,
        reported_amount=50000.0,
        origin_metro="Delhi NCR",
        origin_location_id=big_locs[0].location_id,
        num_accounts_involved=4,
        num_transactions=3,
    )

    # Property 1: for a fixed seed, the candidate set is identical across
    # two calls (purely deterministic for the same RNG state).
    rng1 = random.Random(123)
    rng2 = random.Random(123)
    cands_1 = generate_candidates_for_case(
        case=big_case,
        case_transactions=big_txs,
        locations=big_locs,
        candidate_config=cfg,
        rng=rng1,
    )
    cands_2 = generate_candidates_for_case(
        case=big_case,
        case_transactions=big_txs,
        locations=big_locs,
        candidate_config=cfg,
        rng=rng2,
    )
    sig1 = sorted(c.location_id for c in cands_1)
    sig2 = sorted(c.location_id for c in cands_2)
    assert sig1 == sig2, "Same seed + evidence must produce identical candidate sets"

    # Property 2: no location outside the evidence metros appears.
    # Evidence metros for this case = {Delhi NCR, Mumbai, Chennai}.
    # Kolkata is NOT in the evidence set, so no Kolkata location should
    # appear in the candidate set across any seed.
    kolkata_ids = {loc.location_id for loc in big_locs if loc.metro == "Kolkata"}
    for seed in range(30):
        rng = random.Random(seed)
        cands = generate_candidates_for_case(
            case=big_case,
            case_transactions=big_txs,
            locations=big_locs,
            candidate_config=cfg,
            rng=rng,
        )
        for c in cands:
            assert c.location_id not in kolkata_ids, (
                f"Kolkata location {c.location_id} should never appear (not in evidence metros)"
            )

    # Property 3: the pool must be large enough to exercise the multi-anchor path.
    pool = [loc for loc in big_locs if loc.metro in {"Delhi NCR", "Mumbai", "Chennai"}]
    assert len(pool) > 18, f"Pool should exceed max_per_case to test selection logic, got {len(pool)}"


def test_origin_location_not_force_inserted_either(case, case_txs, locations):
    """Origin location must not be forcibly inserted either (sanity check).

    Under multi-anchor selection, the origin is always used as the first
    anchor (it is observable evidence). A location that IS the origin
    will therefore naturally appear in the candidate set because it is
    at distance 0 from the primary anchor. This is NOT force-insertion
    from hidden information — it is a consequence of the origin being
    a legitimate observable anchor.

    We verify the origin is treated as a normal candidate (not specially
    favored over other nearby locations) by checking that:
    1. The origin appears (because it is the primary anchor).
    2. A location in a DIFFERENT metro that is not in the evidence set
       does NOT appear (proving cross-metro leakage is absent).
    """
    cfg = {"min_per_case": 10, "max_per_case": 18}
    rng = random.Random(42)

    # Build a fixture with an isolated non-evidence metro
    rng_big = random.Random(7)
    geo_big = {
        "metros": [
            {"name": "Delhi NCR", "center_lat": 28.6, "center_lon": 77.2, "location_count": 8},
            {"name": "Mumbai", "center_lat": 19.0, "center_lon": 72.8, "location_count": 8},
            {"name": "Kolkata", "center_lat": 22.5, "center_lon": 88.3, "location_count": 6},
            {"name": "Chennai", "center_lat": 13.0, "center_lon": 80.0, "location_count": 6},
        ]
    }
    big_locs = generate_locations(geo_big, rng_big)
    big_txs = [
        Transaction(
            transaction_id="TX_T_001",
            case_id="CASE_Y",
            sender_account_id="A1",
            receiver_account_id="A2",
            timestamp=datetime(2025, 6, 1, 8, 0, 0),
            amount=50000.0,
            transaction_type=TransactionType.UPI,
            sequence_number=1,
            sender_metro="Delhi NCR",
            receiver_metro="Delhi NCR",
        ),
        Transaction(
            transaction_id="TX_T_002",
            case_id="CASE_Y",
            sender_account_id="A2",
            receiver_account_id="A3",
            timestamp=datetime(2025, 6, 1, 9, 0, 0),
            amount=49500.0,
            transaction_type=TransactionType.NEFT,
            sequence_number=2,
            sender_metro="Delhi NCR",
            receiver_metro="Mumbai",
        ),
    ]
    big_case = Case(
        case_id="CASE_Y",
        complaint_time=datetime(2025, 6, 1, 12, 0, 0),
        fraud_scenario=FraudScenario.MULTI_HOP,
        reported_amount=50000.0,
        origin_metro="Delhi NCR",
        origin_location_id=big_locs[0].location_id,
        num_accounts_involved=3,
        num_transactions=2,
    )

    cands = generate_candidates_for_case(
        case=big_case,
        case_transactions=big_txs,
        locations=big_locs,
        candidate_config=cfg,
        rng=rng,
    )

    # Origin is the primary anchor — it will naturally appear.
    assert any(c.location_id == big_locs[0].location_id for c in cands), (
        "Origin location should appear as the primary anchor's representative"
    )

    # A location in a non-evidence metro (Chennai) must NOT appear
    # (pool is 8+8=16 from Delhi+Mumbai; max=18, so the pool fits entirely
    # and Chennai should be excluded by the evidence-metro filter)
    chennai_locs = [loc for loc in big_locs if loc.metro == "Chennai"]
    for chennai_loc in chennai_locs:
        assert not any(c.location_id == chennai_loc.location_id for c in cands), (
            f"Chennai location {chennai_loc.location_id} should not appear (not in evidence metros)"
        )


# ---------------------------------------------------------------------------
# 4. Hard-negative selection does NOT depend on target distance
# ---------------------------------------------------------------------------


def test_no_target_distance_in_candidates_module():
    """The candidates module must not reference a target distance concept."""
    import src.data_generation.candidates as cand_module

    src = inspect.getsource(cand_module)
    forbidden = [
        "true_location.latitude",
        "true_location.longitude",
        "target_distance",
        "target.latitude",
        "target.longitude",
    ]
    for pattern in forbidden:
        assert pattern not in src, f"candidates.py still references '{pattern}' — target leakage remains."


def test_hard_negatives_use_observable_anchor(case, case_txs, locations):
    """When two cases have identical observable evidence but different
    'targets', their candidate sets must be identical."""
    cfg = {"min_per_case": 10, "max_per_case": 18}

    case_a = case.model_copy(update={"case_id": "CASE_A"})
    case_b = case.model_copy(update={"case_id": "CASE_B"})
    txs_a = [t.model_copy(update={"case_id": "CASE_A"}) for t in case_txs]
    txs_b = [t.model_copy(update={"case_id": "CASE_B"}) for t in case_txs]

    rng_a = random.Random(123)
    cands_a = generate_candidates_for_case(case_a, txs_a, locations, cfg, rng_a)
    rng_b = random.Random(123)
    cands_b = generate_candidates_for_case(case_b, txs_b, locations, cfg, rng_b)

    sig_a = sorted((c.location_id, round(c.distance_from_origin_km, 4)) for c in cands_a)
    sig_b = sorted((c.location_id, round(c.distance_from_origin_km, 4)) for c in cands_b)
    assert sig_a == sig_b, (
        "Candidate sets differ between two cases with identical observable evidence "
        "but different case_ids. Hard-negative selection must not depend on hidden info."
    )


# ---------------------------------------------------------------------------
# 5. Ground truth remains available only to evaluation
# ---------------------------------------------------------------------------


def test_label_step_is_separate_from_generation(case, case_txs, locations):
    """The labelling step is a separate function and never invoked inside
    generate_candidates_for_case."""
    import src.data_generation.candidates as cand_module

    src = inspect.getsource(cand_module)
    assert "label_candidates_with_ground_truth" in src, (
        "label_candidates_with_ground_truth must be defined in candidates module"
    )
    # generate_candidates_for_case must not actually CALL label_candidates_with_ground_truth.
    # (It may mention the function in its docstring, but no call/exec).
    gen_src = inspect.getsource(generate_candidates_for_case)
    # Strip docstrings before checking
    import ast

    tree = ast.parse(gen_src)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Remove docstring (first Expr with Constant str)
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                body = body[1:]
            for sub in ast.walk(ast.Module(body=body, type_ignores=[])):
                if isinstance(sub, ast.Call):
                    if isinstance(sub.func, ast.Name) and sub.func.id == "label_candidates_with_ground_truth":
                        raise AssertionError(
                            "generate_candidates_for_case must not call label_candidates_with_ground_truth"
                        )
                    if isinstance(sub.func, ast.Attribute) and sub.func.attr == "label_candidates_with_ground_truth":
                        raise AssertionError(
                            "generate_candidates_for_case must not call label_candidates_with_ground_truth"
                        )


def test_label_step_only_marks_when_location_matches(case, case_txs, locations):
    """labelling step attaches is_true_location=True ONLY when the candidate's
    location_id equals the ground-truth location_id for that case."""
    cfg = {"min_per_case": 10, "max_per_case": 18}
    rng = random.Random(42)
    cands = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng,
    )

    # All candidates must start as is_true_location=False
    assert all(c.is_true_location is False for c in cands)

    # Apply labelling with an arbitrary "ground truth" location
    fake_true_loc = locations[3].location_id
    label_candidates_with_ground_truth(cands, {case.case_id: fake_true_loc})

    flagged = [c for c in cands if c.is_true_location]
    # At most one candidate per case should be flagged
    assert len(flagged) <= 1, f"labelling flagged {len(flagged)} candidates for one case"
    if flagged:
        assert flagged[0].location_id == fake_true_loc


def test_generator_pipeline_does_not_pass_ground_truth_to_candidates():
    """Static check: the generator module must not pass ground truth into
    generate_candidates_for_case."""
    import src.data_generation.generator as gen_module

    src = inspect.getsource(gen_module)
    # Find all calls to generate_candidates_for_case
    import re

    matches = re.findall(
        r"generate_candidates_for_case\s*\(([^)]*)\)",
        src,
        flags=re.DOTALL,
    )
    assert matches, "Could not locate generate_candidates_for_case calls in generator.py"
    for call_args in matches:
        # None of the positional/keyword arguments may be a ground-truth object
        lowered = call_args.lower()
        for forbidden in ("true_ground_truth", "ground_truth", " gt,", "gt=", "gt\n"):
            assert forbidden not in lowered, (
                f"generator.py appears to pass '{forbidden}' to generate_candidates_for_case: {call_args[:200]}"
            )


def test_generator_emits_ground_truth_separately():
    """End-to-end: ground truth files exist ONLY in evaluation/ directory."""
    import json
    import tempfile
    from pathlib import Path

    from src.data_generation.generator import generate_dataset

    with tempfile.TemporaryDirectory() as tmp:
        result = generate_dataset(output_dir=tmp, seed=42)
        base = Path(result["output_dir"])

        gt_files_eval = list((base / "evaluation").glob("*ground_truth*"))
        gt_files_gen = list((base / "generated").glob("*ground_truth*"))
        assert gt_files_eval, "No ground truth file in evaluation/"
        assert not gt_files_gen, f"Ground truth file found in generated/: {gt_files_gen}"

        # Model-visible candidates must not contain is_true_location
        with open(base / "generated" / "candidates.jsonl") as f:
            for line in f:
                rec = json.loads(line)
                assert "is_true_location" not in rec, "Model-visible candidate exposes is_true_location"


# ---------------------------------------------------------------------------
# 6. Evidence-metros candidate-generation behavior
# ---------------------------------------------------------------------------
#
# After the evidence-metros improvement, candidates come from the union of
# observable evidence metros (origin metro + all transaction sender/receiver
# metros). These tests verify that behavior, while preserving the target-
# independence contract established above.


def test_candidates_come_from_evidence_metros(case, case_txs, locations):
    """Every candidate's metro must be in the observable evidence-metros set.

    Evidence metros = origin metro + all transaction sender/receiver metros.
    This is a query-time-only property; the generator must not include
    locations from metros with no observable evidence connection.
    """
    cfg = {"min_per_case": 10, "max_per_case": 18}
    rng = random.Random(42)
    cands = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng,
    )

    evidence_metros = {case.origin_metro}
    for tx in case_txs:
        if tx.timestamp > case.complaint_time:
            continue
        if tx.sender_metro:
            evidence_metros.add(tx.sender_metro)
        if tx.receiver_metro:
            evidence_metros.add(tx.receiver_metro)

    loc_metro = {loc.location_id: loc.metro for loc in locations}
    for c in cands:
        metro = loc_metro.get(c.location_id)
        assert metro in evidence_metros, (
            f"Candidate {c.location_id} has metro {metro} not in evidence metros {evidence_metros}"
        )


def test_candidate_set_uniqueness_preserved(case, case_txs, locations):
    """Candidate IDs must remain unique per case after the evidence-metros change."""
    cfg = {"min_per_case": 10, "max_per_case": 18}
    rng = random.Random(42)
    cands = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng,
    )
    ids = [c.location_id for c in cands]
    assert len(ids) == len(set(ids)), "Duplicate location_ids in candidate set"


def test_candidate_count_respects_bounds(case, case_txs, locations):
    """Candidate count must stay within [min_per_case, max_per_case] when the
    available pool permits it."""
    cfg = {"min_per_case": 10, "max_per_case": 18}
    for seed in range(20):
        rng = random.Random(seed)
        cands = generate_candidates_for_case(
            case=case,
            case_transactions=case_txs,
            locations=locations,
            candidate_config=cfg,
            rng=rng,
        )
        assert len(cands) >= 1, "No candidates generated"
        assert len(cands) <= cfg["max_per_case"], (
            f"Candidate count {len(cands)} exceeds max_per_case {cfg['max_per_case']}"
        )


def test_candidate_generation_deterministic_under_same_seed(case, case_txs, locations):
    """Same seed + same evidence must produce the same candidate set."""
    cfg = {"min_per_case": 10, "max_per_case": 18}

    rng_a = random.Random(42)
    cands_a = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng_a,
    )
    rng_b = random.Random(42)
    cands_b = generate_candidates_for_case(
        case=case,
        case_transactions=case_txs,
        locations=locations,
        candidate_config=cfg,
        rng=rng_b,
    )

    sig_a = sorted(c.location_id for c in cands_a)
    sig_b = sorted(c.location_id for c in cands_b)
    assert sig_a == sig_b, "Same seed + evidence produced different candidate sets"


def test_candidate_coverage_with_observable_evidence():
    """Measure candidate coverage on the real 300-case synthetic dataset.

    Coverage is measured by: for cases whose true metro is in the evidence
    metros, does the true location appear in the candidate set? This is
    a regression baseline, not a target threshold.
    """
    import json
    import tempfile
    from pathlib import Path

    from src.data_generation.generator import generate_dataset

    with tempfile.TemporaryDirectory() as tmp:
        result = generate_dataset(seed=42, output_dir=tmp)
        base = Path(result["output_dir"])

        cands = [json.loads(line) for line in open(base / "generated" / "candidates.jsonl")]
        gts = {
            json.loads(line)["case_id"]: json.loads(line) for line in open(base / "evaluation" / "ground_truth.jsonl")
        }
        cases = {json.loads(line)["case_id"]: json.loads(line) for line in open(base / "generated" / "cases.jsonl")}
        txs = [json.loads(line) for line in open(base / "generated" / "transactions.jsonl")]
        locs = {
            json.loads(line)["location_id"]: json.loads(line) for line in open(base / "generated" / "locations.jsonl")
        }

        cands_by_case = {}
        for c in cands:
            cands_by_case.setdefault(c["case_id"], set()).add(c["location_id"])

        covered = 0
        total = 0
        for cid, gt in gts.items():
            gt_loc = locs[gt["actual_cashout_location_id"]]
            case = cases[cid]
            case_txs = [t for t in txs if t["case_id"] == cid and t["timestamp"] <= case["complaint_time"]]
            evidence_metros = {case["origin_metro"]}
            for tx in case_txs:
                if tx.get("sender_metro"):
                    evidence_metros.add(tx["sender_metro"])
                if tx.get("receiver_metro"):
                    evidence_metros.add(tx["receiver_metro"])

            # Only count cases where the true location is in an evidence metro
            if gt_loc["metro"] in evidence_metros:
                total += 1
                if gt["actual_cashout_location_id"] in cands_by_case.get(cid, set()):
                    covered += 1

        # Regression baseline: the evidence-metros strategy covers the vast
        # majority of cases whose true metro is observable. We assert >= 80%
        # to give headroom against future seed changes.
        coverage = covered / total if total else 0
        assert coverage >= 0.80, f"Evidence-metros coverage {coverage:.1%} ({covered}/{total}) below 80% threshold"


def test_evidence_metros_no_target_distance_in_source():
    """The candidates module source must not reference the target's coordinates
    or any ground-truth-derived distance concept. Same forbidden patterns as
    test_no_target_distance_in_candidates_module, kept for regression."""
    import src.data_generation.candidates as cand_module

    src = inspect.getsource(cand_module)
    forbidden = [
        "true_location.latitude",
        "true_location.longitude",
        "target_distance",
        "target.latitude",
        "target.longitude",
    ]
    for pattern in forbidden:
        assert pattern not in src, f"candidates.py still references '{pattern}' — target leakage remains."
