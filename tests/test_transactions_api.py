"""Tests for the transaction evidence API endpoint.

Tests verify:
1. Valid case returns correct transactions
2. Returned transactions belong to the requested case
3. Unknown case returns 404
4. Empty transaction case handled correctly (N/A — all cases have transactions)
5. Response schema validity
6. Ground-truth target information is not leaked
7. Existing investigation/ranking endpoints remain unchanged
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    """Create a test client with lifespan triggered."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---------------------------------------------------------------------------
# Transaction evidence endpoint tests
# ---------------------------------------------------------------------------


class TestTransactionEvidence:
    """Test GET /api/v1/investigations/{case_id}/transactions endpoint."""

    ENDPOINT = "/api/v1/investigations/CASE_0001/transactions"

    def test_returns_200(self, client):
        """Valid case should return 200."""
        response = client.get(self.ENDPOINT)
        assert response.status_code == 200

    def test_response_schema(self, client):
        """Response should match CaseTransactionsResponse schema."""
        data = client.get(self.ENDPOINT).json()
        assert data["case_id"] == "CASE_0001"
        assert "transactions" in data
        assert "accounts" in data
        assert "disclaimer" in data

    def test_transactions_are_list(self, client):
        """Transactions should be a non-empty list."""
        data = client.get(self.ENDPOINT).json()
        assert isinstance(data["transactions"], list)
        assert len(data["transactions"]) > 0

    def test_accounts_are_list(self, client):
        """Accounts should be a non-empty list."""
        data = client.get(self.ENDPOINT).json()
        assert isinstance(data["accounts"], list)
        assert len(data["accounts"]) > 0

    def test_transaction_schema(self, client):
        """Each transaction should have required fields."""
        data = client.get(self.ENDPOINT).json()
        for tx in data["transactions"]:
            assert "transaction_id" in tx
            assert "case_id" in tx
            assert "sender_account_id" in tx
            assert "receiver_account_id" in tx
            assert "timestamp" in tx
            assert "amount" in tx
            assert "transaction_type" in tx
            assert "sequence_number" in tx

    def test_account_schema(self, client):
        """Each account should have required fields."""
        data = client.get(self.ENDPOINT).json()
        for acct in data["accounts"]:
            assert "account_id" in acct
            assert "role" in acct

    def test_transactions_belong_to_requested_case(self, client):
        """All returned transactions should belong to the requested case."""
        data = client.get(self.ENDPOINT).json()
        for tx in data["transactions"]:
            assert tx["case_id"] == "CASE_0001", (
                f"Transaction {tx['transaction_id']} belongs to {tx['case_id']}, not CASE_0001"
            )

    def test_accounts_belong_to_requested_case(self, client):
        """All returned accounts should belong to the requested case."""
        data = client.get(self.ENDPOINT).json()
        for acct in data["accounts"]:
            assert "CASE_0001" in acct["account_id"], f"Account {acct['account_id']} does not belong to CASE_0001"

    def test_transactions_ordered_by_sequence(self, client):
        """Transactions should be ordered by sequence_number."""
        data = client.get(self.ENDPOINT).json()
        seqs = [tx["sequence_number"] for tx in data["transactions"]]
        assert seqs == sorted(seqs), f"Transactions not ordered: {seqs}"

    def test_transaction_amounts_positive(self, client):
        """All transaction amounts should be positive."""
        data = client.get(self.ENDPOINT).json()
        for tx in data["transactions"]:
            assert tx["amount"] > 0, f"Transaction {tx['transaction_id']} has non-positive amount: {tx['amount']}"

    def test_transaction_types_valid(self, client):
        """Transaction types should be valid values."""
        valid_types = {"UPI", "NEFT", "RTGS", "IMPS", "WIRE"}
        data = client.get(self.ENDPOINT).json()
        for tx in data["transactions"]:
            assert tx["transaction_type"] in valid_types, f"Invalid transaction type: {tx['transaction_type']}"

    def test_accounts_roles_valid(self, client):
        """Account roles should be valid values."""
        valid_roles = {"VICTIM", "MULE", "CASH_OUT", "INTERMEDIATE", "UNKNOWN"}
        data = client.get(self.ENDPOINT).json()
        for acct in data["accounts"]:
            assert acct["role"] in valid_roles, f"Invalid account role: {acct['role']}"

    def test_accounts_in_transaction_chain(self, client):
        """Accounts referenced in transactions should appear in the accounts list."""
        data = client.get(self.ENDPOINT).json()
        account_ids = {acct["account_id"] for acct in data["accounts"]}
        for tx in data["transactions"]:
            assert tx["sender_account_id"] in account_ids, f"Sender {tx['sender_account_id']} not in accounts list"
            assert tx["receiver_account_id"] in account_ids, (
                f"Receiver {tx['receiver_account_id']} not in accounts list"
            )

    def test_deterministic(self, client):
        """Multiple calls should return identical results."""
        r1 = client.get(self.ENDPOINT).json()
        r2 = client.get(self.ENDPOINT).json()
        assert r1 == r2


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------


class TestTransactionEvidenceErrors:
    """Test error handling for transaction evidence endpoint."""

    def test_unknown_case_returns_404(self, client):
        """Nonexistent case should return 404."""
        response = client.get("/api/v1/investigations/NONEXISTENT/transactions")
        assert response.status_code == 404

    def test_404_response_schema(self, client):
        """404 response should have detail field."""
        response = client.get("/api/v1/investigations/NONEXISTENT/transactions")
        data = response.json()
        assert "detail" in data


# ---------------------------------------------------------------------------
# Ground-truth leakage tests
# ---------------------------------------------------------------------------


class TestTransactionEvidenceLeakage:
    """Test that ground-truth information is not leaked via transactions endpoint."""

    FORBIDDEN_FIELDS = [
        "actual_cashout_location_id",
        "cashout_time",
        "cashout_metro",
        "scenario_used",
        "selection_probability",
        "is_true_location",
    ]

    def test_no_ground_truth_in_transactions(self, client):
        """Transaction data should not contain ground-truth fields."""
        data = client.get("/api/v1/investigations/CASE_0001/transactions").json()
        for tx in data["transactions"]:
            for field in self.FORBIDDEN_FIELDS:
                assert field not in tx, f"Ground-truth field '{field}' found in transaction {tx['transaction_id']}"

    def test_no_ground_truth_in_accounts(self, client):
        """Account data should not contain ground-truth fields."""
        data = client.get("/api/v1/investigations/CASE_0001/transactions").json()
        for acct in data["accounts"]:
            for field in self.FORBIDDEN_FIELDS:
                assert field not in acct, f"Ground-truth field '{field}' found in account {acct['account_id']}"

    def test_no_ground_truth_in_response_string(self, client):
        """Full response JSON string should not contain ground-truth identifiers."""
        data = client.get("/api/v1/investigations/CASE_0001/transactions").json()
        response_str = str(data)
        assert "is_true_location" not in response_str
        assert "selection_probability" not in response_str


# ---------------------------------------------------------------------------
# Existing endpoint regression tests
# ---------------------------------------------------------------------------


class TestExistingEndpointsUnchanged:
    """Verify existing endpoints still work after adding transactions endpoint."""

    def test_health_still_works(self, client):
        """Health endpoint should still return 200."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_list_investigations_still_works(self, client):
        """List endpoint should still return 200 with 300 cases."""
        data = client.get("/api/v1/investigations").json()
        assert data["total"] == 300

    def test_get_investigation_still_works(self, client):
        """Get endpoint should still return 200."""
        response = client.get("/api/v1/investigations/CASE_0001")
        assert response.status_code == 200

    def test_baseline_ranking_still_works(self, client):
        """Baseline ranking should still return 200."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "weighted_baseline"},
        )
        assert response.status_code == 200

    def test_rf_ranking_still_works(self, client):
        """RF ranking should still return 200."""
        response = client.post(
            "/api/v1/investigations/CASE_0001/rank",
            json={"model": "random_forest"},
        )
        assert response.status_code == 200
