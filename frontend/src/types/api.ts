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
