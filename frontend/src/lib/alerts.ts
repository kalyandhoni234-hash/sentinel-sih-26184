import type { RankedCandidate } from "@/types/api";

export interface DashboardCandidate extends RankedCandidate {
  caseId: string;
}

export interface AttentionAlert {
  id: string;
  type: "high_priority" | "model_disagreement";
  priority: "high" | "medium";
  title: string;
  description: string;
  caseId: string;
}

export function generateAttentionAlerts(
  mapCandidates: DashboardCandidate[],
  modelComparisons: Record<string, { wbTop1: string | undefined; rfTop1: string | undefined }>,
): AttentionAlert[] {
  const alerts: AttentionAlert[] = [];
  const seenCaseIds = new Set<string>();

  const top1ByCase = new Map<string, DashboardCandidate>();
  for (const c of mapCandidates) {
    if (c.rank === 1) {
      top1ByCase.set(c.caseId, c);
    }
  }

  for (const [caseId, candidate] of top1ByCase) {
    if (candidate.risk_score >= 0.7) {
      alerts.push({
        id: `high-${caseId}`,
        type: "high_priority",
        priority: "high",
        title: "HIGH priority candidate — #1 ranked",
        description: `${candidate.location_id} (score: ${candidate.risk_score.toFixed(3)}). Investigator review recommended.`,
        caseId,
      });
      seenCaseIds.add(caseId);
    }
  }

  for (const [caseId, comparison] of Object.entries(modelComparisons)) {
    if (seenCaseIds.has(caseId)) continue;
    if (!comparison.wbTop1 || !comparison.rfTop1) continue;
    if (comparison.wbTop1 !== comparison.rfTop1) {
      alerts.push({
        id: `disagree-${caseId}`,
        type: "model_disagreement",
        priority: "medium",
        title: "Models disagree on #1 candidate",
        description: `WB: ${comparison.wbTop1} vs RF: ${comparison.rfTop1}. Review evidence signals before prioritizing.`,
        caseId,
      });
      seenCaseIds.add(caseId);
    }
  }

  return alerts;
}
