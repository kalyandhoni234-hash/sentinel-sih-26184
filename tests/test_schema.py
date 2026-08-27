"""Tests for data schema correctness."""

from __future__ import annotations

from datetime import datetime

from src.data_generation.schema import (
    Account,
    AccountRole,
    Candidate,
    Case,
    FraudScenario,
    GroundTruth,
    Location,
    LocationType,
    Transaction,
    TransactionType,
)


def test_case_creation():
    """Test Case model creation with valid data."""
    case = Case(
        case_id="CASE_TEST_001",
        complaint_time=datetime(2025, 3, 15, 10, 30),
        fraud_scenario=FraudScenario.DIRECT_CASHOUT,
        reported_amount=50000.0,
        origin_metro="Delhi NCR",
        origin_location_id="LOC_0001",
        num_accounts_involved=3,
        num_transactions=2,
    )
    assert case.case_id == "CASE_TEST_001"
    assert case.fraud_scenario == FraudScenario.DIRECT_CASHOUT
    assert case.reported_amount == 50000.0


def test_account_creation():
    """Test Account model creation."""
    account = Account(
        account_id="ACCT_001",
        case_id="CASE_TEST_001",
        role=AccountRole.VICTIM,
    )
    assert account.account_id == "ACCT_001"
    assert account.role == AccountRole.VICTIM
    assert account.bank_synthetic == "SYNTH_BANK"  # default


def test_transaction_creation():
    """Test Transaction model creation."""
    tx = Transaction(
        transaction_id="TX_001",
        case_id="CASE_TEST_001",
        sender_account_id="ACCT_001",
        receiver_account_id="ACCT_002",
        timestamp=datetime(2025, 3, 15, 11, 0),
        amount=45000.0,
        transaction_type=TransactionType.UPI,
        sequence_number=1,
    )
    assert tx.amount == 45000.0
    assert tx.transaction_type == TransactionType.UPI


def test_location_creation():
    """Test Location model creation."""
    loc = Location(
        location_id="LOC_0001",
        latitude=28.6139,
        longitude=77.2090,
        metro="Delhi NCR",
        region="Central",
        location_type=LocationType.ATM,
        density_score=0.75,
        cash_out_attractiveness=0.85,
    )
    assert loc.latitude == 28.6139
    assert loc.is_high_surveillance is False  # default


def test_candidate_creation():
    """Test Candidate model creation."""
    cand = Candidate(
        case_id="CASE_TEST_001",
        location_id="LOC_0001",
        distance_from_origin_km=5.2,
        scenario_affinity=0.7,
        transaction_proximity_score=0.8,
        temporal_plausibility=0.6,
        density_score=0.9,
    )
    assert cand.is_true_location is False  # default


def test_ground_truth_creation():
    """Test GroundTruth model creation."""
    gt = GroundTruth(
        case_id="CASE_TEST_001",
        actual_cashout_location_id="LOC_0003",
        cashout_time=datetime(2025, 3, 15, 14, 0),
        cashout_metro="Delhi NCR",
        scenario_used=FraudScenario.DIRECT_CASHOUT,
        selection_probability=0.15,
    )
    assert gt.actual_cashout_location_id == "LOC_0003"
    assert gt.selection_probability == 0.15


def test_fraud_scenario_enum():
    """Test all fraud scenario enum values exist."""
    assert len(FraudScenario) == 7
    scenarios = [s.value for s in FraudScenario]
    assert "DIRECT_CASHOUT" in scenarios
    assert "RAPID_MULE_CHAIN" in scenarios
    assert "MULTI_HOP" in scenarios
    assert "GEOGRAPHIC_JUMP" in scenarios
    assert "DELAYED_CASHOUT" in scenarios
    assert "URBAN_CLUSTER" in scenarios
    assert "DISPERSED_ACTIVITY" in scenarios


def test_account_role_enum():
    """Test all account role enum values exist."""
    assert len(AccountRole) == 5
    roles = [r.value for r in AccountRole]
    assert "VICTIM" in roles
    assert "MULE" in roles
    assert "CASH_OUT" in roles


def test_transaction_type_enum():
    """Test all transaction type enum values exist."""
    assert len(TransactionType) == 5
    types = [t.value for t in TransactionType]
    assert "UPI" in types
    assert "NEFT" in types
    assert "RTGS" in types
    assert "IMPS" in types
    assert "WIRE" in types


def test_location_type_enum():
    """Test all location type enum values exist."""
    assert len(LocationType) == 10
    types = [t.value for t in LocationType]
    assert "ATM" in types
    assert "BANK_BRANCH" in types
    assert "MONEY_TRANSFER_AGENT" in types
