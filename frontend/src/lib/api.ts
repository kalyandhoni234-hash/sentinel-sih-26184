import type {
  HealthResponse,
  InvestigationListResponse,
  CaseInfo,
  RankResponse,
  RankRequest,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({
      detail: `HTTP ${res.status}: ${res.statusText}`,
    }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  async getHealth(): Promise<HealthResponse> {
    return apiFetch<HealthResponse>("/health");
  },

  async listInvestigations(): Promise<InvestigationListResponse> {
    return apiFetch<InvestigationListResponse>("/api/v1/investigations");
  },

  async getInvestigation(caseId: string): Promise<CaseInfo> {
    return apiFetch<CaseInfo>(`/api/v1/investigations/${caseId}`);
  },

  async rankCandidates(
    caseId: string,
    request: RankRequest
  ): Promise<RankResponse> {
    return apiFetch<RankResponse>(
      `/api/v1/investigations/${caseId}/rank`,
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  },
};
