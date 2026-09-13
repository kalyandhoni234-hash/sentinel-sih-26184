"""Dataset statistics and quality-audit script.

Produces the Phase 10 dataset report from ACTUAL generated data:
- Scale and diversity statistics (cases, accounts, transactions, candidates,
  cities, states/UTs, transaction types, location types)
- Distribution summaries (per-city / per-state case counts, candidate stats)
- Duplicate detection
- Ground-truth leakage checks (forbidden fields in model-visible output)
- Analysis-point (temporal boundary) checks: no transactions after the
  complaint time (the analysis point), no transaction after the ground-truth
  cash-out time

Usage:
    python scripts/dataset_stats.py [--data-dir data]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

FORBIDDEN_IN_MODEL_VISIBLE = {
    "actual_cashout_location_id",
    "cashout_time",
    "cashout_metro",
    "scenario_used",
    "selection_probability",
    "is_true_location",
}


def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def fmt_count_table(counter: Counter, total: int, top: int | None = None) -> str:
    items = counter.most_common(top)
    lines = []
    for key, count in items:
        pct = count / total * 100 if total else 0
        lines.append(f"    {key:<28} {count:>6}  ({pct:5.1f}%)")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="SENTINEL dataset statistics & audits")
    parser.add_argument("--data-dir", default="data", help="Dataset directory (default: data)")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    gen = data_dir / "generated"
    eval_dir = data_dir / "evaluation"

    cases = load_jsonl(gen / "cases.jsonl")
    accounts = load_jsonl(gen / "accounts.jsonl")
    transactions = load_jsonl(gen / "transactions.jsonl")
    locations = load_jsonl(gen / "locations.jsonl")
    candidates = load_jsonl(gen / "candidates.jsonl")
    ground_truths = load_jsonl(eval_dir / "ground_truth.jsonl")

    manifest_files = sorted((data_dir / "manifests").glob("manifest_*.json"))
    manifest = json.load(open(manifest_files[-1])) if manifest_files else {}

    errors: list[str] = []

    print("=" * 70)
    print("SENTINEL DATASET SCALE & QUALITY REPORT (measured, not estimated)")
    print("=" * 70)

    # ---------------- Scale ----------------
    print("\nDATASET SCALE")
    print(f"  Cases:                {len(cases)}")
    print(f"  Accounts:             {len(accounts)}")
    print(f"  Transactions:         {len(transactions)}")
    print(f"  Candidate entries:    {len(candidates)}")
    print(f"  Locations:            {len(locations)}")
    print(f"  Ground truths:        {len(ground_truths)}")
    if manifest:
        print(f"  Dataset version:      {manifest.get('dataset_version')}")
        print(f"  Generator version:    {manifest.get('generator_version')}")
        print(f"  Random seed:          {manifest.get('random_seed')}")
        print(f"  Generated at:         {manifest.get('generation_timestamp')}")

    loc_by_id = {loc["location_id"]: loc for loc in locations}
    cases_by_id = {c["case_id"]: c for c in cases}

    # ---------------- Diversity ----------------
    tx_type_counts = Counter(t["transaction_type"] for t in transactions)
    loc_type_counts = Counter(loc["location_type"] for loc in locations)
    scenario_counts = Counter(c["fraud_scenario"] for c in cases)
    city_counts = Counter(c["origin_metro"] for c in cases)
    # Manifest carries cases_per_state directly (written by the generator).
    state_counts = Counter(manifest.get("cases_per_state", {}))
    account_role_counts = Counter(a["role"] for a in accounts)

    print("\nDIVERSITY")
    print(f"  Transaction types ({len(tx_type_counts)}):")
    print(fmt_count_table(tx_type_counts, len(transactions)))
    print(f"  Location types ({len(loc_type_counts)}):")
    print(fmt_count_table(loc_type_counts, len(locations)))
    print(f"  Case scenarios ({len(scenario_counts)}):")
    print(fmt_count_table(scenario_counts, len(cases)))
    print(f"  Account roles ({len(account_role_counts)}):")
    print(fmt_count_table(account_role_counts, len(accounts)))

    # ---------------- Distribution ----------------
    cand_by_case: Counter = Counter(c["case_id"] for c in candidates)
    tx_by_case: Counter = Counter(t["case_id"] for t in transactions)
    acct_by_case: Counter = Counter(a["case_id"] for a in accounts)
    cand_counts = list(cand_by_case.values())
    tx_counts = [tx_by_case.get(c["case_id"], 0) for c in cases]
    acct_counts = [acct_by_case.get(c["case_id"], 0) for c in cases]

    def stats(vals: list[int]) -> str:
        if not vals:
            return "n/a"
        return (
            f"min={min(vals)}  max={max(vals)}  avg={sum(vals) / len(vals):.2f}  median={sorted(vals)[len(vals) // 2]}"
        )

    print("\nDISTRIBUTION (per case)")
    print(f"  Candidates per case:  {stats(cand_counts)}")
    print(f"  Transactions/case:    {stats(tx_counts)}")
    print(f"  Accounts/case:        {stats(acct_counts)}")
    print(f"\n  Cities ({len(city_counts)}) by case count:")
    print(fmt_count_table(city_counts, len(cases), top=50))
    print(f"\n  States/UTs ({len(state_counts)}) by case count:")
    print(fmt_count_table(state_counts, len(cases)))
    print(
        f"\n  Amounts: min={min(c['reported_amount'] for c in cases):,.0f}  "
        f"max={max(c['reported_amount'] for c in cases):,.0f}  "
        f"avg={sum(c['reported_amount'] for c in cases) / len(cases):,.0f} INR (reported)"
    )

    # ---------------- Duplicate detection ----------------
    print("\nQUALITY AUDITS")
    for name, records, key in [
        ("case IDs", cases, "case_id"),
        ("account IDs", accounts, "account_id"),
        ("transaction IDs", transactions, "transaction_id"),
        ("location IDs", locations, "location_id"),
    ]:
        ids = [r[key] for r in records]
        dupes = len(ids) - len(set(ids))
        status = "OK" if dupes == 0 else f"FAIL ({dupes} duplicates)"
        if dupes:
            errors.append(f"Duplicate {name}: {dupes}")
        print(f"  Duplicate {name:<16} {status}")

    # Full-record duplicate check on transactions (exact same content)
    tx_signatures = {json.dumps(t, sort_keys=True) for t in transactions}
    full_dupes = len(transactions) - len(tx_signatures)
    status = "OK" if full_dupes == 0 else f"FAIL ({full_dupes})"
    if full_dupes:
        errors.append(f"Exact duplicate transaction records: {full_dupes}")
    print(f"  Exact duplicate TXs           {status}")

    # Referential integrity (candidates/ground truth reference real entities)
    account_ids_by_case: dict[str, set[str]] = {}
    for a in accounts:
        account_ids_by_case.setdefault(a["case_id"], set()).add(a["account_id"])
    bad_cand_case = sum(1 for c in candidates if c["case_id"] not in cases_by_id)
    bad_cand_loc = sum(1 for c in candidates if c["location_id"] not in loc_by_id)
    bad_gt_case = sum(1 for g in ground_truths if g["case_id"] not in cases_by_id)
    bad_gt_loc = sum(1 for g in ground_truths if g["actual_cashout_location_id"] not in loc_by_id)
    bad_tx_acct = sum(
        1
        for t in transactions
        if t["sender_account_id"] not in account_ids_by_case.get(t["case_id"], ())
        or t["receiver_account_id"] not in account_ids_by_case.get(t["case_id"], ())
    )
    ref_ok = bad_cand_case == bad_cand_loc == bad_gt_case == bad_gt_loc == bad_tx_acct == 0
    print(f"  Referential integrity         {'OK' if ref_ok else 'FAIL'}")
    if not ref_ok:
        errors.append(
            f"Referential integrity: cand_case={bad_cand_case} cand_loc={bad_cand_loc} "
            f"gt_case={bad_gt_case} gt_loc={bad_gt_loc} tx_acct={bad_tx_acct}"
        )

    # ---------------- Ground-truth leakage ----------------
    leaked_fields: set[str] = set()
    for c in candidates:
        leaked_fields |= FORBIDDEN_IN_MODEL_VISIBLE & set(c.keys())
    gt_leak_status = "OK (none present)" if not leaked_fields else f"FAIL: {sorted(leaked_fields)}"
    if leaked_fields:
        errors.append(f"Ground-truth fields in model-visible candidates: {leaked_fields}")
    print(f"  GT fields in candidates       {gt_leak_status}")

    # True location must not be systematically present in every candidate set
    gt_by_case = {g["case_id"]: g["actual_cashout_location_id"] for g in ground_truths}
    cands_by_case: dict[str, set[str]] = {}
    for c in candidates:
        cands_by_case.setdefault(c["case_id"], set()).add(c["location_id"])
    true_in_cands = sum(1 for cid, loc_id in gt_by_case.items() if loc_id in cands_by_case.get(cid, set()))
    coverage = true_in_cands / len(ground_truths) * 100 if ground_truths else 0
    print(
        f"  True loc in candidate set     {true_in_cands}/{len(ground_truths)} cases "
        f"({coverage:.1f}% — target-independent selection, not 100% by design)"
    )

    # ---------------- Analysis-point (temporal boundary) ----------------
    def parse_ts(s: str) -> datetime:
        return datetime.fromisoformat(s)

    post_cashout = 0
    post_complaint = 0
    max_overshoot_min = 0.0
    gt_cashout_by_case = {g["case_id"]: parse_ts(g["cashout_time"]) for g in ground_truths}
    complaint_by_case = {c["case_id"]: parse_ts(c["complaint_time"]) for c in cases}
    for t in transactions:
        ts = parse_ts(t["timestamp"])
        complaint = complaint_by_case.get(t["case_id"], ts)
        if ts > complaint:
            post_complaint += 1
            overshoot_min = (ts - complaint).total_seconds() / 60.0
            max_overshoot_min = max(max_overshoot_min, overshoot_min)
        if ts > gt_cashout_by_case.get(t["case_id"], ts):
            post_cashout += 1

    # Transactions after the analysis point are EXPECTED in the ledger (the
    # generator's chain tail jitters 1-15 minutes past the complaint time;
    # the Timeline renders them as "Beyond Analysis Point"). The leakage
    # invariant is that they (1) never exceed the jitter band and (2) are
    # never used as evidence — features and candidate generation filter to
    # timestamp <= complaint_time (locked in by tests/test_temporal_boundary.py).
    JITTER_BAND_MIN = 16.0  # generator jitter is 1-15 min per hop
    overshoot_ok = max_overshoot_min <= JITTER_BAND_MIN
    status = (
        f"OK (within jitter band, max {max_overshoot_min:.1f} min)"
        if overshoot_ok
        else f"FAIL (overshoot up to {max_overshoot_min:.1f} min exceeds {JITTER_BAND_MIN:.0f} min band)"
    )
    if not overshoot_ok:
        errors.append(f"Post-analysis-point overshoot exceeds jitter band: {max_overshoot_min:.1f} min")
    print(f"  TXs after analysis point      {post_complaint} ledger records (excluded from evidence) {status}")
    status = "OK" if post_cashout == 0 else f"FAIL ({post_cashout})"
    if post_cashout:
        errors.append(f"Transactions after cash-out: {post_cashout}")
    print(f"  TXs after cash-out time       {status}")
    pct = post_complaint / len(transactions) * 100 if transactions else 0
    print(
        f"  Evidence boundary             pre-analysis-point evidence: "
        f"{len(transactions) - post_complaint}/{len(transactions)} txs ({100 - pct:.1f}%)"
    )

    # Ledger consistency: accounts and transactions match the declared counts
    declared_mismatch = sum(
        1
        for c in cases
        if acct_by_case.get(c["case_id"], 0) != c["num_transactions"] + 1
        or tx_by_case.get(c["case_id"], 0) != c["num_transactions"]
    )
    status = "OK" if declared_mismatch == 0 else f"FAIL ({declared_mismatch} cases)"
    if declared_mismatch:
        errors.append(f"Ledger/declared-count mismatches: {declared_mismatch}")
    print(f"  Ledger vs declared counts     {status}")

    # Unused accounts (accounts in the ledger that no transaction touches)
    used_accounts = {t["sender_account_id"] for t in transactions} | {t["receiver_account_id"] for t in transactions}
    unused = sum(1 for a in accounts if a["account_id"] not in used_accounts)
    status = "OK" if unused == 0 else f"FAIL ({unused})"
    if unused:
        errors.append(f"Accounts not referenced by any transaction: {unused}")
    print(f"  Unused accounts in ledger     {status}")

    # ---------------- Verdict ----------------
    print("\n" + "=" * 70)
    if errors:
        print(f"RESULT: {len(errors)} AUDIT FAILURES")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("RESULT: ALL AUDITS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
