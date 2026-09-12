import type { CaseInfo } from "@/types/api";

/**
 * Pipeline tracker — visual foundation for the SENTINEL investigation
 * pipeline. Structural only: every stage state is derived from real,
 * already-available case data. Nothing here fabricates backend progress —
 * where the API does not expose a stage's state, the stage is shown as
 * "not exposed" rather than "complete".
 *
 * Stage-state derivation (all from CaseInfo):
 *  - CASE            — always complete (the case record exists)
 *  - EVIDENCE        — complete if transactions/accounts counts > 0
 *  - TRANSACTION INT — complete if num_transactions > 0 (ledger exists)
 *  - CANDIDATE GEN   — complete if num_candidates > 0, otherwise "not exposed"
 *  - RISK ANALYSIS   — "not exposed": backend does not report analysis state
 *  - RANKING         — available (rank runs on demand via POST /rank)
 */

type StageState = "complete" | "available" | "not-exposed";

interface Stage {
  key: string;
  label: string;
  state: StageState;
}

const STAGE_STYLES: Record<StageState, { dot: string; text: string }> = {
  complete: { dot: "var(--success)", text: "var(--text-primary)" },
  available: { dot: "var(--accent)", text: "var(--text-secondary)" },
  "not-exposed": { dot: "var(--border)", text: "var(--text-muted)" },
};

const STAGE_TITLE: Record<StageState, string> = {
  complete: "Evidence for this stage is present in the case record",
  available: "Runs on demand from already-available case data",
  "not-exposed": "Stage state is not exposed by the current API",
};

export function PipelineTracker({
  caseInfo,
  hasAnalysis,
}: {
  caseInfo: CaseInfo;
  /** Whether ranked analysis has been run for this case in the current session view. */
  hasAnalysis?: boolean;
}) {
  const stages: Stage[] = [
    { key: "case", label: "Case", state: "complete" },
    {
      key: "evidence",
      label: "Evidence",
      state:
        caseInfo.num_transactions > 0 || caseInfo.num_accounts_involved > 0
          ? "complete"
          : "not-exposed",
    },
    {
      key: "transaction-intel",
      label: "Transaction Intelligence",
      state: caseInfo.num_transactions > 0 ? "complete" : "not-exposed",
    },
    {
      key: "candidate-gen",
      label: "Candidate Generation",
      state: caseInfo.num_candidates > 0 ? "complete" : "not-exposed",
    },
    // The backend does not report a discrete risk-analysis state; showing it
    // as complete would fabricate pipeline progress.
    { key: "risk-analysis", label: "Risk Analysis", state: "not-exposed" },
    { key: "ranking", label: "Ranking", state: "available" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {stages.map((stage, i) => {
        const s = STAGE_STYLES[stage.state];
        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.dot }}
              title={STAGE_TITLE[stage.state]}
            />
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: s.text }}
            >
              {stage.label}
            </span>
            {i < stages.length - 1 && (
              <span
                className="ml-2 hidden h-px w-4 sm:block"
                style={{ background: "var(--border)" }}
                aria-hidden
              />
            )}
          </div>
        );
      })}
      <span className="sr-only">
        Pipeline stages shown reflect evidence present in the case record.
        Stages not exposed by the API are marked accordingly.
      </span>
    </div>
  );
}
