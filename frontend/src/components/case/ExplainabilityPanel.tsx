"use client";

import { getPriorityTier } from "@/lib/tiers";
import { GROUP_LABELS, GROUP_BAR_COLORS, MODEL_LABELS } from "@/lib/labels";
import type { RankedCandidate } from "@/types/api";

/**
 * Explainable Candidate Analysis — the deep analysis surface for the
 * selected candidate, added to the Candidates workspace in Phase 6.
 *
 * Data honesty contract:
 *  - Every value comes from the already-loaded POST /rank response.
 *  - WB group scores are shown as GROUP SCORES (raw per-group values).
 *    The model's configured GROUP_WEIGHTS exist in the backend
 *    (src/modeling/baseline.py) but are NOT exposed by the API, so they
 *    are never displayed or implied here.
 *  - RF explanations are shown exactly as returned. RF has no group
 *    scores — the UI says "Not exposed", never "0".
 *  - The "why prioritized" text is a deterministic summary of the actual
 *    ranking outputs — no generated narrative, no causal claims.
 */

type RankingModel = "weighted_baseline" | "random_forest";

/** Canonical group order as defined by the backend's GROUP_WEIGHTS keys. */
const GROUP_ORDER = ["geographic", "transaction", "location", "temporal", "case"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * Deterministic, conservative "why prioritized" summary built strictly
 * from the ranking response. No model claims beyond the existing wording.
 */
function whyPrioritized(candidate: RankedCandidate, total: number): string {
  const rankPhrase = `Ranked ${ordinal(candidate.rank)} of ${total} by the ${
    MODEL_LABELS[candidate.model_used as RankingModel] ?? candidate.model_used
  } model.`;

  if (candidate.model_used === "random_forest") {
    // The explanation already uses the safe "Supporting evidence signals:"
    // wording produced by the backend — presented as-is.
    return `${rankPhrase} ${candidate.explanation}`;
  }

  const entries = candidate.group_scores
    ? GROUP_ORDER.filter((g) => candidate.group_scores?.[g] != null).map(
        (g) => [g, candidate.group_scores![g]] as const
      )
    : [];
  const nonZero = entries.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);

  if (nonZero.length === 0) {
    return `${rankPhrase} All signal groups currently score low for this candidate; its position reflects the relative comparison across the full candidate set.`;
  }

  const top = nonZero
    .slice(0, 2)
    .map(([g, s]) => `${GROUP_LABELS[g] ?? g} (${s.toFixed(3)})`)
    .join(", ");
  const rest = nonZero.length > 2 ? ` Remaining groups score lower.` : "";
  return `${rankPhrase} Highest-scoring signal groups for this candidate: ${top}.${rest} The model combines these group scores into the ranking score shown above.`;
}

/** Explanation-type badge: what kind of explanation this model exposes. */
function ExplanationTypeBadge({ model }: { model: string }) {
  const isRF = model === "random_forest";
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{
        borderColor: isRF ? "var(--warning)" : "var(--accent)",
        color: isRF ? "var(--warning)" : "var(--accent)",
      }}
    >
      {isRF ? "Explanation: Supporting Evidence Signals" : "Explanation: Group Signal Scores"}
    </span>
  );
}

/* ── Main panel ── */

export function ExplainabilityPanel({
  candidate,
  ranked,
}: {
  candidate: RankedCandidate;
  /** Full ranked list from the same POST /rank response. */
  ranked: RankedCandidate[];
}) {
  const total = ranked.length;
  const isRF = candidate.model_used === "random_forest";
  const tier = getPriorityTier(candidate.risk_score);

  // All groups in canonical order (WB) — zeros shown, since 0 IS a real
  // measured group score for WB. RF shows "Not exposed" instead.
  const groupEntries: Array<[string, number]> = isRF
    ? []
    : GROUP_ORDER.filter((g) => candidate.group_scores?.[g] != null).map(
        (g) => [g, candidate.group_scores![g]]
      );
  const maxGroup = groupEntries.length > 0 ? Math.max(...groupEntries.map(([, s]) => s)) : 0;

  // Neighboring ranks for the rank-position strip.
  const neighbors = ranked.filter(
    (c) => Math.abs(c.rank - candidate.rank) === 1
  );

  return (
    <div className="space-y-4">
      {/* WHY THIS CANDIDATE IS PRIORITIZED */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-sentinel-text">
            Why this candidate is prioritized
          </h4>
          <ExplanationTypeBadge model={candidate.model_used} />
        </div>
        <p className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-3 text-xs leading-relaxed text-sentinel-text-secondary">
          {whyPrioritized(candidate, total)}
        </p>
        <p className="mt-1.5 text-[10px] text-sentinel-text-muted">
          This is a prioritization for investigator review — not a prediction of
          certainty about a future cash-out event.
        </p>
      </div>

      {/* SIGNAL BREAKDOWN */}
      <div>
        <p className="section-label mb-1.5">
          {isRF ? "Signal Breakdown" : "Weighted Baseline Signal Breakdown"}
        </p>
        {groupEntries.length > 0 ? (
          <>
            <div className="space-y-2">
              {groupEntries.map(([group, score]) => {
                const label = GROUP_LABELS[group] ?? group;
                const color = GROUP_BAR_COLORS[group] ?? "bg-sentinel-text-muted";
                const pct = maxGroup > 0 ? Math.round((score / maxGroup) * 100) : 0;
                return (
                  <div key={group} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[11px] font-medium text-sentinel-text-secondary">
                      {label}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sentinel-surface-alt">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] text-sentinel-text">
                      {score.toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Score vs weight distinction — explicit, honest about the API */}
            <div className="mt-2.5 rounded-md border border-sentinel-border-subtle bg-sentinel-surface p-2.5">
              <p className="text-[10px] leading-relaxed text-sentinel-text-muted">
                <span className="font-semibold text-sentinel-text-secondary">Group score:</span>{" "}
                how strongly this signal group measures for this candidate.{" "}
                <span className="font-semibold text-sentinel-text-secondary">Group weight:</span>{" "}
                how much the model configures that group to influence the baseline —
                the configured weights are not exposed by the current API and are
                therefore not shown. Group scores are not contribution percentages.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-3">
            <p className="text-[11px] leading-snug text-sentinel-text-secondary">
              <span className="font-semibold">Not exposed:</span> the Random Forest
              model does not expose per-group scores. The available explanation is
              the model&apos;s supporting-evidence text above. Missing values are not
              shown as zero — zero would imply a measured value.
            </p>
          </div>
        )}
      </div>

      {/* RANK POSITION — selected candidate vs neighboring ranks */}
      <div>
        <p className="section-label mb-1.5">Rank Position</p>
        <div className="flex flex-wrap items-stretch gap-2">
          {neighbors
            .filter((n) => n.rank < candidate.rank)
            .map((n) => (
              <RankCard key={n.location_id} candidate={n} total={total} />
            ))}
          <div
            className="min-w-[130px] flex-1 rounded-md border-2 p-2.5"
            style={{ borderColor: "var(--accent)", background: "var(--accent-dim)" }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-bold" style={{ color: "var(--accent)" }}>
                {ordinal(candidate.rank)}
              </span>
              <span
                className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
                style={{ color: tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)", border: `1px solid ${tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)"}` }}
              >
                {tier}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold text-sentinel-text">
              {candidate.location_id}
            </p>
            <p className="font-mono text-[11px] text-sentinel-text-secondary">
              {candidate.risk_score.toFixed(3)}
            </p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              Selected
            </p>
          </div>
          {neighbors
            .filter((n) => n.rank > candidate.rank)
            .map((n) => (
              <RankCard key={n.location_id} candidate={n} total={total} />
            ))}
        </div>
        <p className="mt-1.5 text-[10px] text-sentinel-text-muted">
          SENTINEL is a ranking framework — adjacent candidates may have close
          scores. The model does not expose a direct explanation of why one rank
          precedes another.
        </p>
      </div>

      {/* EVIDENCE → SIGNAL → RANKING story */}
      <div>
        <p className="section-label mb-1.5">How The Ranking Is Produced</p>
        <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
          {["Observed Evidence", "Signal Groups", "Model", "Ranking Score", "Priority"].map(
            (step, i, arr) => (
              <span key={step} className="flex items-center gap-1.5">
                <span className="rounded border border-sentinel-border bg-sentinel-surface-alt px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-sentinel-text-secondary">
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <svg className="h-3 w-3 text-sentinel-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                )}
              </span>
            )
          )}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-sentinel-text-muted">
          Explanatory view of the ranking pipeline. It does not imply that
          individual transactions map to specific candidate locations.
        </p>
      </div>
    </div>
  );
}

function RankCard({ candidate, total }: { candidate: RankedCandidate; total: number }) {
  const tier = getPriorityTier(candidate.risk_score);
  const tierColor =
    tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)";
  return (
    <div className="min-w-[130px] flex-1 rounded-md border border-sentinel-border bg-sentinel-surface p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold text-sentinel-text-muted">
          {ordinal(candidate.rank)}
        </span>
        <span
          className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
          style={{ color: tierColor, border: `1px solid ${tierColor}` }}
        >
          {tier}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs font-semibold text-sentinel-text-secondary">
        {candidate.location_id}
      </p>
      <p className="font-mono text-[11px] text-sentinel-text-muted">
        {candidate.risk_score.toFixed(3)}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-sentinel-text-muted">
        of {total} ranked
      </p>
    </div>
  );
}

/* ── Candidate comparison table ── */

/**
 * Side-by-side comparison of pinned candidates. Group-score rows render
 * only when the pinned candidates actually expose them; otherwise the
 * row reads "Not exposed" — never a fabricated 0.
 */
export function CandidateCompareTable({
  pinned,
}: {
  pinned: RankedCandidate[];
}) {
  if (pinned.length === 0) return null;

  const anyGroupScores = pinned.some((c) => c.group_scores != null);
  const allGroupScores = pinned.every((c) => c.group_scores != null);

  const groupRow = (group: string) => ({
    label: GROUP_LABELS[group] ?? group,
    render: (c: RankedCandidate) =>
      c.group_scores?.[group] != null ? (
        <span className="font-mono text-xs text-sentinel-text">
          {c.group_scores[group].toFixed(3)}
        </span>
      ) : (
        <span className="text-[10px] italic text-sentinel-text-muted">Not exposed</span>
      ),
  });

  const basicRows = [
    { label: "Rank", render: (c: RankedCandidate) => <span className="font-mono text-xs">{String(c.rank).padStart(2, "0")}</span> },
    {
      label: "Priority",
      render: (c: RankedCandidate) => {
        const tier = getPriorityTier(c.risk_score);
        const color = tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)";
        return (
          <span className="rounded px-1 py-px text-[8px] font-bold uppercase" style={{ color, border: `1px solid ${color}` }}>
            {tier}
          </span>
        );
      },
    },
    { label: "Ranking Score", render: (c: RankedCandidate) => <span className="font-mono text-xs font-semibold">{c.risk_score.toFixed(3)}</span> },
  ];

  const groupRows =
    anyGroupScores && allGroupScores
      ? GROUP_ORDER.filter((g) => pinned[0].group_scores?.[g] != null).map(groupRow)
      : [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" aria-label="Candidate comparison">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-sentinel-text-muted">
              Compare
            </th>
            {pinned.map((c) => (
              <th
                key={c.location_id}
                className="px-3 py-2 text-left font-mono text-[11px] font-bold text-sentinel-text"
              >
                #{String(c.rank).padStart(2, "0")} {c.location_id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {basicRows.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
                {row.label}
              </td>
              {pinned.map((c) => (
                <td key={c.location_id} className="px-3 py-1.5 text-sentinel-text-secondary">
                  {row.render(c)}
                </td>
              ))}
            </tr>
          ))}
          {groupRows.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
                {row.label}
              </td>
              {pinned.map((c) => (
                <td key={c.location_id} className="px-3 py-1.5">
                  {row.render(c)}
                </td>
              ))}
            </tr>
          ))}
          {!allGroupScores && (
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
                Group Scores
              </td>
              {pinned.map((c) => (
                <td key={c.location_id} className="px-3 py-1.5">
                  {c.group_scores ? (
                    <span className="font-mono text-xs text-sentinel-text">available</span>
                  ) : (
                    <span className="text-[10px] italic text-sentinel-text-muted">Not exposed</span>
                  )}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 px-3 text-[10px] text-sentinel-text-muted">
        {anyGroupScores
          ? "Group-score rows appear only for candidates ranked by the Weighted Baseline, which exposes them."
          : "Per-group scores are not exposed by the current model, so no group rows are shown."}
      </p>
    </div>
  );
}
