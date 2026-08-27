"""Pydantic data models for the SENTINEL synthetic data generator.

All models define the schema for SYNTHETIC data only.
These do NOT represent real NCRP records, banking data, or PII.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class FraudScenario(str, Enum):
    """Synthetic fraud scenario types.

    Each scenario controls the structure of transaction chains,
    geographic behavior, and temporal patterns.
    """

    DIRECT_CASHOUT = "DIRECT_CASHOUT"
    RAPID_MULE_CHAIN = "RAPID_MULE_CHAIN"
    MULTI_HOP = "MULTI_HOP"
    GEOGRAPHIC_JUMP = "GEOGRAPHIC_JUMP"
    DELAYED_CASHOUT = "DELAYED_CASHOUT"
    URBAN_CLUSTER = "URBAN_CLUSTER"
    DISPERSED_ACTIVITY = "DISPERSED_ACTIVITY"


class AccountRole(str, Enum):
    """Role of an account in a fraud chain."""

    VICTIM = "VICTIM"
    MULE = "MULE"
    CASH_OUT = "CASH_OUT"
    INTERMEDIATE = "INTERMEDIATE"
    UNKNOWN = "UNKNOWN"


class TransactionType(str, Enum):
    """Synthetic transaction types."""

    UPI = "UPI"
    NEFT = "NEFT"
    RTGS = "RTGS"
    IMPS = "IMPS"
    WIRE = "WIRE"


class LocationType(str, Enum):
    """Types of cash-out or contextual locations."""

    ATM = "ATM"
    BANK_BRANCH = "BANK_BRANCH"
    MONEY_TRANSFER_AGENT = "MONEY_TRANSFER_AGENT"
    SHOPPING_MALL = "SHOPPING_MALL"
    MARKET = "MARKET"
    TRANSPORT_HUB = "TRANSPORT_HUB"
    HOTEL = "HOTEL"
    CAFE = "CAFE"
    RESIDENTIAL_AREA = "RESIDENTIAL_AREA"
    COMMERCIAL_COMPLEX = "COMMERCIAL_COMPLEX"


# ---------------------------------------------------------------------------
# Core Entity Models
# ---------------------------------------------------------------------------


class Case(BaseModel):
    """A synthetic fraud complaint/case.

    This represents the top-level investigation entity.
    Fields are designed to be model-visible at inference time.
    """

    case_id: str = Field(..., description="Unique case identifier")
    complaint_time: datetime = Field(..., description="When the complaint was filed")
    fraud_scenario: FraudScenario = Field(..., description="Type of fraud scenario")
    reported_amount: float = Field(..., gt=0, description="Reported fraud amount in INR")
    origin_metro: str = Field(..., description="Metro area where complaint originated")
    origin_location_id: str = Field(..., description="Location ID of complaint origin")
    num_accounts_involved: int = Field(..., ge=2, description="Number of accounts in the chain")
    num_transactions: int = Field(..., ge=1, description="Number of transactions in the chain")
    metadata: dict = Field(default_factory=dict, description="Additional synthetic metadata")


class Account(BaseModel):
    """A synthetic account involved in a fraud case.

    Accounts have roles that reflect their position in the fraud chain.
    """

    account_id: str = Field(..., description="Unique account identifier")
    case_id: str = Field(..., description="Parent case identifier")
    role: AccountRole = Field(..., description="Role in the fraud chain")
    bank_synthetic: str = Field(default="SYNTH_BANK", description="Synthetic bank name")
    account_age_days: int = Field(default=365, ge=0, description="Synthetic account age in days")


class Transaction(BaseModel):
    """A synthetic transaction in a fraud chain.

    Transactions are ordered within a case and represent the flow of funds.
    """

    transaction_id: str = Field(..., description="Unique transaction identifier")
    case_id: str = Field(..., description="Parent case identifier")
    sender_account_id: str = Field(..., description="Sender account identifier")
    receiver_account_id: str = Field(..., description="Receiver account identifier")
    timestamp: datetime = Field(..., description="Transaction timestamp")
    amount: float = Field(..., gt=0, description="Transaction amount in INR")
    transaction_type: TransactionType = Field(..., description="Payment method used")
    sequence_number: int = Field(..., ge=1, description="Order in the transaction chain")
    sender_metro: str = Field(default="", description="Metro where sender is located")
    receiver_metro: str = Field(default="", description="Metro where receiver is located")


class Location(BaseModel):
    """A synthetic geographic location.

    Locations form the geographic environment for the synthetic world.
    """

    location_id: str = Field(..., description="Unique location identifier")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    metro: str = Field(..., description="Metro area name")
    region: str = Field(..., description="Sub-region within the metro")
    location_type: LocationType = Field(..., description="Type of location")
    density_score: float = Field(
        ..., ge=0.0, le=1.0, description="Synthetic foot-traffic density score (0=low, 1=high)"
    )
    cash_out_attractiveness: float = Field(
        ..., ge=0.0, le=1.0, description="Synthetic attractiveness for cash-out activity"
    )
    is_high_surveillance: bool = Field(
        default=False, description="Whether the location has high surveillance (affects cash-out feasibility)"
    )


class Candidate(BaseModel):
    """A candidate cash-out location for a case.

    The candidate set includes the true location and hard negatives.
    """

    case_id: str = Field(..., description="Parent case identifier")
    location_id: str = Field(..., description="Candidate location identifier")
    distance_from_origin_km: float = Field(..., ge=0, description="Distance from complaint origin in km")
    scenario_affinity: float = Field(..., ge=0.0, le=1.0, description="How well this location fits the fraud scenario")
    transaction_proximity_score: float = Field(
        ..., ge=0.0, le=1.0, description="Score based on transaction chain endpoint proximity"
    )
    temporal_plausibility: float = Field(
        ..., ge=0.0, le=1.0, description="Whether the timing is plausible for this location"
    )
    density_score: float = Field(..., ge=0.0, le=1.0, description="Foot-traffic density at this location")
    is_true_location: bool = Field(
        default=False, description="HIDDEN - only used in evaluation, never in model features"
    )


class GroundTruth(BaseModel):
    """Hidden ground truth for evaluation only.

    This model is NEVER exposed to the predictive model.
    It is used solely for post-prediction evaluation.
    """

    case_id: str = Field(..., description="Parent case identifier")
    actual_cashout_location_id: str = Field(..., description="True cash-out location")
    cashout_time: datetime = Field(..., description="When the cash-out occurred")
    cashout_metro: str = Field(..., description="Metro where cash-out occurred")
    scenario_used: FraudScenario = Field(..., description="Scenario used for generation")
    selection_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Probability the generator assigned to this location"
    )


class DatasetManifest(BaseModel):
    """Manifest describing a generated dataset.

    Ensures reproducibility and traceability.
    """

    dataset_version: str = Field(..., description="Dataset version string")
    generator_version: str = Field(..., description="Generator version string")
    schema_version: str = Field(..., description="Schema version string")
    random_seed: int = Field(..., description="Random seed used for generation")
    case_count: int = Field(..., ge=0, description="Number of cases generated")
    generation_timestamp: datetime = Field(..., description="When the dataset was generated")
    total_transactions: int = Field(default=0, description="Total transactions generated")
    total_locations: int = Field(default=0, description="Total unique locations")
    total_candidates: int = Field(default=0, description="Total candidate entries")
    scenario_distribution: dict[str, int] = Field(default_factory=dict, description="Count of cases per scenario type")
