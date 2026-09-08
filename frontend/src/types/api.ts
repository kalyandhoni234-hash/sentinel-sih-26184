export interface HealthResponse {
  status: string;
  version: string;
  models_available: string[];
}

export interface LocationInfo {
  location_id: string;
  latitude: number;
  longitude: number;
  metro: string;
  region: string;
  location_type: string;
  density_score: number;
}

export interface RankedCandidate {
  rank: number;
  location_id: string;
  risk_score: number;
  model_used: string;
  explanation: string;
  group_scores: Record<string, number> | null;
  location: LocationInfo | null;
}

export interface CaseInfo {
  case_id: string;
  complaint_time: string;
  fraud_scenario: string;
  reported_amount: number;
  origin_metro: string;
  origin_latitude: number | null;
  origin_longitude: number | null;
  num_accounts_involved: number;
  num_transactions: number;
  num_candidates: number;
}

export interface InvestigationSummary {
  case_id: string;
  fraud_scenario: string;
  reported_amount: number;
  origin_metro: string;
  complaint_time: string;
  num_candidates: number;
}

export interface InvestigationListResponse {
  investigations: InvestigationSummary[];
  total: number;
}

export interface RankResponse {
  case: CaseInfo;
  model_used: string;
  ranked_candidates: RankedCandidate[];
  total_candidates: number;
  disclaimer: string;
}

export interface RankRequest {
  model: "weighted_baseline" | "random_forest";
  top_k?: number | null;
}

export interface ErrorResponse {
  detail: string;
  error_code: string;
}

export interface AccountInfo {
  account_id: string;
  role: string;
  bank_synthetic: string;
  account_age_days: number;
}

export interface TransactionInfo {
  transaction_id: string;
  case_id: string;
  sender_account_id: string;
  receiver_account_id: string;
  timestamp: string;
  amount: number;
  transaction_type: string;
  sequence_number: number;
  sender_metro: string;
  receiver_metro: string;
}

export interface CaseTransactionsResponse {
  case_id: string;
  transactions: TransactionInfo[];
  accounts: AccountInfo[];
  disclaimer: string;
}
