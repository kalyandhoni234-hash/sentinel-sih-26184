import type { RankedCandidate } from "@/types/api";

/**
 * A ranked candidate annotated with the case it came from, for map display.
 *
 * Phase 1 note: the former `generateAttentionAlerts` client-side alert
 * generator was removed — it manufactured "alerts" in the browser from
 * sampled ranking data with no authoritative backend source. If server
 * alerts are added later, they must come from the API, not be derived
 * client-side. DEFERRED / BACKEND ISSUE: no alerts endpoint exists.
 */
export interface DashboardCandidate extends RankedCandidate {
  caseId: string;
}
