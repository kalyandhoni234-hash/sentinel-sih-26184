"""Synthetic transaction chain generator.

Generates ordered transaction sequences for each fraud case.
Chains have internal structure controlled by scenario behavior.
"""

from __future__ import annotations

import random
from datetime import timedelta

from .scenarios import ScenarioBehavior, get_scenario_behavior
from .schema import (
    Account,
    AccountRole,
    Case,
    Transaction,
    TransactionType,
)

_TRANSACTION_TYPES = list(TransactionType)
_BANK_NAMES = [
    "SYNTH_BANK_A",
    "SYNTH_BANK_B",
    "SYNTH_BANK_C",
    "SYNTH_BANK_D",
    "SYNTH_BANK_E",
]


def _generate_account(
    case_id: str,
    role: AccountRole,
    account_num: int,
    rng: random.Random,
) -> Account:
    """Generate a single synthetic account."""
    return Account(
        account_id=f"ACCT_{case_id}_{account_num:02d}",
        case_id=case_id,
        role=role,
        bank_synthetic=rng.choice(_BANK_NAMES),
        account_age_days=rng.randint(30, 1800),
    )


def generate_accounts_for_case(
    case: Case,
    scenario_behavior: ScenarioBehavior,
    rng: random.Random,
) -> list[Account]:
    """Generate all accounts for a single case.

    The first account is the victim, the last is the cash-out account,
    and intermediates are mules.

    Always creates max_hops + 1 accounts to ensure enough accounts
    exist for any transaction chain length within the scenario range.
    """
    num_accounts = scenario_behavior.max_hops + 1
    accounts = []

    for i in range(num_accounts):
        if i == 0:
            role = AccountRole.VICTIM
        elif i == num_accounts - 1:
            role = AccountRole.CASH_OUT
        elif rng.random() < 0.7:
            role = AccountRole.MULE
        else:
            role = AccountRole.INTERMEDIATE

        accounts.append(_generate_account(case.case_id, role, i + 1, rng))

    return accounts


def generate_transaction_chain(
    case: Case,
    accounts: list[Account],
    scenario_behavior: ScenarioBehavior,
    locations: list,
    rng: random.Random,
) -> list[Transaction]:
    """Generate an ordered transaction chain for a case.

    Transactions flow from victim -> intermediates -> cash-out account.
    Amounts decrease slightly at each hop (simulating fees/splits).
    Timing progresses forward with scenario-controlled delays.

    Args:
        case: The parent case.
        accounts: Ordered list of accounts (victim first, cash-out last).
        scenario_behavior: Controls timing and amount behavior.
        locations: All locations (for metro assignment).
        rng: Seeded RNG.

    Returns:
        Ordered list of Transaction objects.
    """
    transactions = []
    num_hops = rng.randint(scenario_behavior.min_hops, scenario_behavior.max_hops)

    # Ensure we have enough accounts (should always be true now)
    assert len(accounts) >= num_hops + 1, f"Need {num_hops + 1} accounts but only have {len(accounts)}"

    # Start time: some time before complaint
    chain_duration_hours = rng.uniform(
        scenario_behavior.min_chain_duration_hours,
        scenario_behavior.max_chain_duration_hours,
    )
    start_time = case.complaint_time - timedelta(hours=chain_duration_hours)

    # Initial amount (may differ from reported)
    current_amount = case.reported_amount * rng.uniform(0.9, 1.1)

    # Assign metros to accounts based on scenario behavior
    metros = list({loc.metro for loc in locations})
    origin_metro = case.origin_metro

    if scenario_behavior.allow_cross_metro and rng.random() < scenario_behavior.preferred_metro_spread:
        # Some accounts in different metros
        account_metros = [origin_metro]
        for _ in range(num_hops):
            if rng.random() < scenario_behavior.preferred_metro_spread:
                account_metros.append(rng.choice(metros))
            else:
                account_metros.append(origin_metro)
    else:
        account_metros = [origin_metro] * (num_hops + 1)

    # Generate transactions between consecutive accounts
    prev_tx_time = start_time
    for i in range(min(num_hops, len(accounts) - 1)):
        sender = accounts[i]
        receiver = accounts[i + 1]

        # Time progression — ensure monotonic increase
        hop_delay_hours = chain_duration_hours / num_hops
        base_time = start_time + timedelta(hours=hop_delay_hours * (i + 1))
        jitter = timedelta(minutes=rng.uniform(1, 15))
        tx_time = max(base_time + jitter, prev_tx_time + timedelta(seconds=1))

        # Amount with controlled decrease
        fee_factor = rng.uniform(0.92, 0.99)
        current_amount = current_amount * fee_factor
        current_amount = max(current_amount, 1000)

        # Transaction type
        tx_type = rng.choice(_TRANSACTION_TYPES)

        sender_metro = account_metros[i] if i < len(account_metros) else origin_metro
        receiver_metro = account_metros[i + 1] if i + 1 < len(account_metros) else origin_metro

        transactions.append(
            Transaction(
                transaction_id=f"TX_{case.case_id}_{i + 1:03d}",
                case_id=case.case_id,
                sender_account_id=sender.account_id,
                receiver_account_id=receiver.account_id,
                timestamp=tx_time,
                amount=round(current_amount, 2),
                transaction_type=tx_type,
                sequence_number=i + 1,
                sender_metro=sender_metro,
                receiver_metro=receiver_metro,
            )
        )
        prev_tx_time = tx_time

    return transactions


def generate_all_transactions(
    cases: list[Case],
    all_accounts: dict[str, list[Account]],
    locations: list,
    rng: random.Random,
) -> list[Transaction]:
    """Generate transaction chains for all cases.

    Args:
        cases: All cases to generate transactions for.
        all_accounts: Mapping of case_id -> list of accounts.
        locations: All locations.
        rng: Seeded RNG.

    Returns:
        Flat list of all transactions across all cases.
    """
    all_transactions = []
    for case in cases:
        behavior = get_scenario_behavior(case.fraud_scenario)
        accounts = all_accounts.get(case.case_id, [])
        chain = generate_transaction_chain(case, accounts, behavior, locations, rng)
        all_transactions.extend(chain)
    return all_transactions
