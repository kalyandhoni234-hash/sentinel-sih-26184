"use client";

import Link from "next/link";
import { getPriorityTier } from "@/lib/tiers";
import { GROUP_LABELS, GROUP_BAR_COLORS, MODEL_LABELS } from "@/lib/labels";
import type { RankedCandidate } from "@/types/api";

/**
 * Selected-candidate intelligence readout — shared by the GeoIntel panel
 * and the Candidates workspace. Single source of truth for how a ranked
 * candidate is presented:
 *
 *  - Ranking Score (never "probability"), with the fixed disclaimer
 *  - Location metadata (existing API fields only)
 *  - Signal Summary: WB group scores, or an honest RF limitation note
 *  - Transaction-trail geographic context (explicitly non-implicating)
 *  - Evidence Assessment (the model's own explanation string)
 *  - Model attribution
 *
 * Optionally renders a "View on Map" action when `caseId` is provided.
 */

type RankingModel = "weighted_baseline" | "random_forest";

export function CandidateReadout({
  candidate,
  txMetros,
  caseId,
  showViewOnMap = false,
}: {
  candidate: RankedCandidate;
  txMetros?: Set<string>;
  caseId?: string;
  showViewOnMap?: boolean;
}) {
  const tier = getPriorityTier(candidate.risk_score);
  const tierColor =
    tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)";

  const groupEntries = candidate.group_scores
    ? Object.entries(candidate.group_scores).sort((a, b) => b[1] - a[1])
    : [];

  const maxGroup = groupEntries.length > 0 ? groupEntries[0][1] : 0;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold" style={{ color: "var(--accent)" }}>
            #{String(candidate.rank).padStart(2, "0")}
          </span>
          <span className="font-mono text-sm font-bold text-sentinel-text">
            {candidate.location_id}
          </span>
        </div>
        <span
          className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: tierColor, border: `1px solid ${tierColor}` }}
        >
          {tier} Priority
        </span>
      </div>

      {/* Ranking score — truthful label, never "probability" */}
      <div className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-3">
        <p className="section-label">Ranking Score</p>
        <p className="mt-1 font-mono text-2xl font-bold text-sentinel-text">
          {candidate.risk_score.toFixed(3)}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-sentinel-text-muted">
          Relative prioritization based on observed evidence — not a prediction of
          certainty.
        </p>
      </div>

      {/* Location metadata — existing legitimate fields only */}
      {candidate.location && (
        <div>
          <p className="section-label mb-1.5">Location</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-sentinel-text-muted">Type</span>
              <span className="font-mono text-sentinel-text">
                {candidate.location.location_type.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sentinel-text-muted">Region</span>
              <span className="text-sentinel-text">{candidate.location.region}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sentinel-text-muted">Metro</span>
              <span className="text-sentinel-text">{candidate.location.metro}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sentinel-text-muted">Coordinates</span>
              <span className="font-mono text-sentinel-text">
                {candidate.location.latitude.toFixed(4)}, {candidate.location.longitude.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sentinel-text-muted">Density</span>
              <span className="font-mono text-sentinel-text">
                {candidate.location.density_score.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Signal summary — group scores from the model, or honest absence */}
      <div>
        <p className="section-label mb-1.5">Signal Summary</p>
        {groupEntries.length > 0 ? (
          <div className="space-y-1.5">
            {groupEntries.map(([group, score]) => {
              const label = GROUP_LABELS[group] ?? group;
              const color = GROUP_BAR_COLORS[group] ?? "bg-sentinel-text-muted";
              const pct = maxGroup > 0 ? Math.round((score / maxGroup) * 100) : 0;
              return (
                <div key={group} className="flex items-center gap-2">
                  <span className="w-[74px] shrink-0 text-[10px] font-medium text-sentinel-text-secondary">
                    {label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sentinel-surface-alt">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-sentinel-text-muted">
                    {score.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-2.5">
            <p className="text-[11px] leading-snug text-sentinel-text-secondary">
              {candidate.model_used === "random_forest"
                ? "The Random Forest model does not expose per-group score breakdowns. Evidence signals are summarized in the candidate's assessment below."
                : "No group score data available for this candidate."}
            </p>
          </div>
        )}
      </div>

      {/* Geographic context — only what the data supports */}
      {candidate.location && txMetros && (
        <p className="text-[10px] leading-snug text-sentinel-text-muted">
          {txMetros.has(candidate.location.metro) ? (
            <>
              <span className="font-semibold" style={{ color: "var(--success)" }}>
                In transaction trail:
              </span>{" "}
              {candidate.location.metro} appears in this case&apos;s observed
              transaction geography. This provides context — it does not imply
              transactions occurred at this specific location.
            </>
          ) : (
            <>
              <span className="font-semibold text-sentinel-text-secondary">Not in transaction trail:</span>{" "}
              {candidate.location.metro} does not appear in this case&apos;s observed
              transaction geography.
            </>
          )}
        </p>
      )}

      {/* Evidence assessment — the model's own explanation */}
      <div>
        <p className="section-label mb-1.5">
          {candidate.model_used === "random_forest" ? "Supporting Evidence Signals" : "Evidence Assessment"}
        </p>
        <p className="rounded-md border border-sentinel-border bg-sentinel-surface p-2.5 text-xs leading-relaxed text-sentinel-text-secondary">
          {candidate.explanation}
        </p>
      </div>

      {/* Model attribution + cross-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-sentinel-text-muted">
          Ranked by {MODEL_LABELS[candidate.model_used as RankingModel] ?? candidate.model_used}.
        </p>
        {showViewOnMap && caseId && (
          <Link
            href={`/investigations/${caseId}/geointel?candidate=${encodeURIComponent(candidate.location_id)}`}
            className="text-[10px] font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            View on Map →
          </Link>
        )}
      </div>
    </div>
  );
}
