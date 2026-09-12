"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getPriorityTier } from "@/lib/tiers";
import { MODEL_LABELS } from "@/lib/labels";
import { Disclaimer, DISCLAIMER_SCORE_TEXT } from "@/components/Disclaimer";
import { ModelComparisonTable } from "@/components/case/ModelComparison";
import { CandidateReadout } from "@/components/case/CandidateReadout";
import {
  ExplainabilityPanel,
  CandidateCompareTable,
} from "@/components/case/ExplainabilityPanel";
import { useCaseContext } from "../workspace-context";
import {
  getSharedCandidateSelection,
  setSharedCandidateSelection,
} from "@/lib/selection";
import type { RankResponse, RankedCandidate, CaseTransactionsResponse } from "@/types/api";

/**
 * Candidate Intelligence — the ranking-analysis workspace.
 *
 * Layout: ranking summary → analytical ranked table (left, wide) +
 * selected-candidate readout (right) → model comparison (bottom).
 *
 * Data sources (all authoritative, no fabrication):
 *  - POST /rank                → scores, ranks, explanations, group scores
 *  - GET /investigations/:id   → case context (via workspace layout)
 *  - GET .../transactions      → metro context for TX-metro tags
 *
 * Selection is shared with GeoIntel via lib/selection so the two views
 * present the same focused candidate.
 */

type RankingModel = "weighted_baseline" | "random_forest";

const TOP_K_OPTIONS = [5, 10, 20] as const;

const MODEL_DESCRIPTIONS: Record<RankingModel, string> = {
  weighted_baseline:
    "A transparent weighted scoring approach using the existing feature groups. Exposes per-group signal scores for each candidate.",
  random_forest:
    "A machine-learning ranking model using the existing engineered features. Provides per-candidate evidence-signal explanations; does not expose per-group scores.",
};

/** Signal-summary mini-bars for the table (WB group scores; blank for RF). */
function SignalSummaryBars({ candidate }: { candidate: RankedCandidate }) {
  const entries = candidate.group_scores
    ? Object.entries(candidate.group_scores).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];
  if (entries.length === 0) {
    return (
      <span className="text-[10px] text-sentinel-text-muted" title="Per-group scores not exposed by this model">
        —
      </span>
    );
  }
  const max = entries[0][1];
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {entries.map(([group, score]) => (
        <div
          key={group}
          className="h-3 w-6 overflow-hidden rounded-sm bg-sentinel-surface-alt"
          title={`${GROUP_LABELS_SHORT[group] ?? group}: ${score.toFixed(2)}`}
        >
          <div
            className={`h-full ${GROUP_BAR_COLORS_SHORT[group] ?? "bg-sentinel-text-muted"}`}
            style={{ width: `${max > 0 ? Math.round((score / max) * 100) : 0}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/* Local short labels for the compact bars (full labels live in lib/labels
   and are used in the readout). Kept here to avoid a circular import. */
const GROUP_LABELS_SHORT: Record<string, string> = {
  geographic: "Geographic",
  transaction: "Transaction",
  location: "Location",
  temporal: "Temporal",
  case: "Case",
};
const GROUP_BAR_COLORS_SHORT: Record<string, string> = {
  geographic: "bg-blue-500",
  transaction: "bg-emerald-500",
  location: "bg-purple-500",
  temporal: "bg-amber-500",
  case: "bg-gray-400",
};

export default function CandidatesPage() {
  const { caseId, caseInfo } = useCaseContext();

  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<RankingModel>("weighted_baseline");
  const [topK, setTopK] = useState<number>(10);
  const [lastRankedModel, setLastRankedModel] = useState<RankingModel>("weighted_baseline");
  const [lastRankedTopK, setLastRankedTopK] = useState<number>(10);

  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pinned candidates for the side-by-side comparison table (max 3).
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const togglePin = useCallback((locationId: string) => {
    setPinnedIds((prev) =>
      prev.includes(locationId)
        ? prev.filter((id) => id !== locationId)
        : prev.length >= 3
          ? prev
          : [...prev, locationId]
    );
  }, []);

  // Model comparison — fetched on demand only.
  const [compareMode, setCompareMode] = useState(false);
  const [compareData, setCompareData] = useState<{
    weighted_baseline: RankResponse | null;
    random_forest: RankResponse | null;
  }>({ weighted_baseline: null, random_forest: null });
  const [compareLoading, setCompareLoading] = useState(false);

  const paramsChanged = model !== lastRankedModel || topK !== lastRankedTopK;

  const txMetros = useMemo(() => {
    if (!txData) return undefined;
    return new Set(
      txData.transactions
        .flatMap((tx) => [tx.sender_metro, tx.receiver_metro])
        .filter(Boolean)
    );
  }, [txData]);

  const loadRanking = useCallback(
    (opts?: { keepSelection?: boolean }) => {
      setLoading(true);
      setError(null);
      if (!opts?.keepSelection) setSelectedId(null);
      const effectiveTopK = Math.max(1, topK);
      api
        .rankCandidates(caseId, { model, top_k: effectiveTopK })
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => {
          setLoading(false);
          setLastRankedModel(model);
          setLastRankedTopK(effectiveTopK);
        });
    },
    [caseId, model, topK]
  );

  // Initial load: ranking + transactions + restore shared selection.
  useEffect(() => {
    loadRanking();
    let active = true;
    api
      .getTransactions(caseId)
      .then((res) => active && setTxData(res))
      .catch(() => active && setTxData(null));
    const shared = getSharedCandidateSelection(caseId);
    if (shared) setSelectedId(shared);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const ranked = useMemo(() => data?.ranked_candidates ?? [], [data]);

  // If the shared selection no longer exists in the current ranking
  // (different model/top-K), clear it rather than showing stale data.
  useEffect(() => {
    if (selectedId && ranked.length > 0 && !ranked.some((c) => c.location_id === selectedId)) {
      setSelectedId(null);
      setSharedCandidateSelection(caseId, null);
    }
  }, [ranked, selectedId, caseId]);

  const selected = useMemo(
    () => ranked.find((c) => c.location_id === selectedId) ?? null,
    [ranked, selectedId]
  );

  // Pinned candidates that still exist in the current ranking — stale pins
  // (e.g. after a model switch) silently drop out rather than fabricating data.
  const pinned = useMemo(
    () =>
      pinnedIds
        .map((id) => ranked.find((c) => c.location_id === id))
        .filter((c): c is RankedCandidate => !!c),
    [pinnedIds, ranked]
  );

  const handleSelect = useCallback(
    (locationId: string) => {
      setSelectedId(locationId);
      setSharedCandidateSelection(caseId, locationId);
    },
    [caseId]
  );

  const topCandidate = ranked.length > 0 ? ranked[0] : null;
  const topTier = topCandidate ? getPriorityTier(topCandidate.risk_score) : null;

  const loadComparison = useCallback(() => {
    setCompareLoading(true);
    const effectiveTopK = Math.max(1, topK);
    Promise.allSettled([
      api.rankCandidates(caseId, { model: "weighted_baseline", top_k: effectiveTopK }),
      api.rankCandidates(caseId, { model: "random_forest", top_k: effectiveTopK }),
    ]).then(([wb, rf]) => {
      setCompareData({
        weighted_baseline: wb.status === "fulfilled" ? wb.value : null,
        random_forest: rf.status === "fulfilled" ? rf.value : null,
      });
      setCompareLoading(false);
    });
  }, [caseId, topK]);

  return (
    <div className="space-y-4">
      {/* ══ RANKING SUMMARY ══ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-sentinel-text">
            Candidate Intelligence
          </h2>
          <p className="mt-0.5 text-xs text-sentinel-text-muted">
            Ranked candidate locations for investigator prioritization
          </p>
        </div>
        {data && topCandidate && (
          <div className="flex items-center gap-4 rounded-md border border-sentinel-border bg-sentinel-surface px-4 py-2">
            <div>
              <p className="section-label">Top Priority</p>
              <p className="font-mono text-sm font-bold text-sentinel-text">
                #{String(topCandidate.rank).padStart(2, "0")} {topCandidate.location_id}
              </p>
            </div>
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />
            <div>
              <p className="section-label">Ranking Score</p>
              <p className="font-mono text-sm font-bold" style={{ color: "var(--accent)" }}>
                {topCandidate.risk_score.toFixed(3)}
              </p>
            </div>
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />
            <div>
              <p className="section-label">Candidates</p>
              <p className="font-mono text-sm font-bold text-sentinel-text">
                {ranked.length}<span className="text-sentinel-text-muted">/{data.total_candidates}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Analysis-point boundary */}
      {caseInfo && (
        <div className="flex items-center gap-2 rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt px-3 py-2 text-[11px] text-sentinel-text-secondary">
          <span className="section-label">Analysis Point</span>
          <span>
            Only evidence available at or before the complaint time contributes to
            this prioritization. No future withdrawal observations are used.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {/* ══ CONTROLS: model + top-K + re-rank state ══ */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-sentinel-border bg-sentinel-surface px-4 py-3">
        {/* Model selector — segmented control */}
        <div>
          <p className="section-label mb-1">Ranking Model</p>
          <div
            className="flex overflow-hidden rounded-md border border-sentinel-border"
            role="radiogroup"
            aria-label="Ranking model"
          >
            {(Object.keys(MODEL_DESCRIPTIONS) as RankingModel[]).map((m) => {
              const active = model === m;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setModel(m)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? "text-white" : "text-sentinel-text-secondary hover:bg-sentinel-surface-alt"
                  }`}
                  style={active ? { background: "var(--accent)" } : undefined}
                >
                  {MODEL_LABELS[m]}
                </button>
              );
            })}
          </div>
          <p className="mt-1 max-w-md text-[10px] leading-snug text-sentinel-text-muted">
            {MODEL_DESCRIPTIONS[model]}
          </p>
        </div>

        {/* Top-K */}
        <div>
          <p className="section-label mb-1">Display</p>
          <div
            className="flex overflow-hidden rounded-md border border-sentinel-border"
            role="radiogroup"
            aria-label="Number of candidates to display"
          >
            {TOP_K_OPTIONS.map((k) => {
              const active = topK === k;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTopK(k)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "text-white" : "text-sentinel-text-secondary hover:bg-sentinel-surface-alt"
                  }`}
                  style={active ? { background: "var(--accent)" } : undefined}
                >
                  Top {k}
                </button>
              );
            })}
          </div>
        </div>

        {/* Re-rank + state */}
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: paramsChanged ? "var(--warning)" : "var(--success)" }}
            />
            <span style={{ color: paramsChanged ? "var(--warning)" : "var(--success)" }}>
              {loading
                ? "Ranking…"
                : paramsChanged
                  ? "Ranking needs update"
                  : "Ranking current"}
            </span>
          </span>
          <button onClick={() => loadRanking()} className="btn-primary relative !py-1.5 text-xs">
            Re-rank
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/10" />
            )}
          </button>
        </div>
      </div>

      {/* ══ MAIN SPLIT: ranked table + selected readout ══ */}
      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Ranked candidate table */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-sentinel-border bg-sentinel-surface">
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="section-label">Ranked Candidates</h3>
          </div>

          {loading && !data ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 skeleton" />
              ))}
            </div>
          ) : ranked.length === 0 ? (
            <p className="p-6 text-center text-xs text-sentinel-text-muted">
              No ranked candidates. Run the ranking to populate the table.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Rank", "Location", "Priority", "Score", "Signals", "Compare"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-sentinel-text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((c) => {
                    const isSelected = selectedId === c.location_id;
                    const tier = getPriorityTier(c.risk_score);
                    return (
                      <tr
                        key={c.location_id}
                        onClick={() => handleSelect(c.location_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelect(c.location_id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        aria-label={`Rank ${c.rank}: ${c.location_id}, ${tier} priority, score ${c.risk_score.toFixed(3)}`}
                        className={`cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sentinel-500 ${
                          isSelected ? "" : "hover:bg-sentinel-surface-alt"
                        }`}
                        style={
                          isSelected
                            ? { background: "var(--accent-dim)" }
                            : undefined
                        }
                      >
                        <td className="px-3 py-1.5">
                          <span
                            className={`font-mono text-xs font-bold ${isSelected ? "" : "text-sentinel-text-muted"}`}
                            style={isSelected ? { color: "var(--accent)" } : undefined}
                          >
                            {String(c.rank).padStart(2, "0")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs font-semibold text-sentinel-text">
                          {c.location_id}
                          {c.location && txMetros?.has(c.location.metro) && (
                            <span
                              className="ml-1.5 rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wider"
                              style={{ borderColor: "var(--success)", color: "var(--success)" }}
                              title="Metro appears in the observed transaction trail"
                            >
                              TX
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
                            style={{
                              color: tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)",
                              border: `1px solid ${tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)"}`,
                            }}
                          >
                            {tier}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-sentinel-text-secondary">
                          {c.risk_score.toFixed(3)}
                        </td>
                        <td className="px-3 py-1.5">
                          <SignalSummaryBars candidate={c} />
                        </td>
                        <td className="px-3 py-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(c.location_id);
                            }}
                            aria-pressed={pinnedIds.includes(c.location_id)}
                            aria-label={`${pinnedIds.includes(c.location_id) ? "Remove" : "Add"} ${c.location_id} ${pinnedIds.includes(c.location_id) ? "from" : "to"} comparison`}
                            className={`rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                              pinnedIds.includes(c.location_id)
                                ? ""
                                : "border-sentinel-border text-sentinel-text-muted hover:bg-sentinel-surface-alt"
                            }`}
                            style={
                              pinnedIds.includes(c.location_id)
                                ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-dim)" }
                                : undefined
                            }
                          >
                            {pinnedIds.includes(c.location_id) ? "Pinned" : "Pin"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected candidate readout */}
        <div
          className="w-full shrink-0 rounded-lg border border-sentinel-border bg-sentinel-surface p-4 xl:w-[360px]"
        >
          <div className="mb-3" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.625rem" }}>
            <h3 className="section-label">Selected Candidate</h3>
          </div>
          {!selected ? (
            <div className="rounded-md border border-dashed border-sentinel-border p-4 text-center">
              <p className="text-xs font-medium text-sentinel-text-secondary">
                No candidate selected
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-sentinel-text-muted">
                Select a row in the table to inspect its ranking context and
                supporting signals.
              </p>
            </div>
          ) : (
            <CandidateReadout
              candidate={selected}
              txMetros={txMetros}
              caseId={caseId}
              showViewOnMap
            />
          )}
        </div>
      </div>

      {/* ══ EXPLAINABLE ANALYSIS (Phase 6) ══ */}
      {selected && (
        <div className="rounded-lg border border-sentinel-border bg-sentinel-surface">
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sentinel-text">
                Explainable Analysis
              </h3>
              <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
                Why this candidate is ranked where it is — based strictly on the
                current model output.
              </p>
            </div>
            <Link
              href={`/investigations/${caseId}/transactions`}
              className="text-[10px] font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Review Evidence Intelligence →
            </Link>
          </div>
          <div className="p-4">
            <ExplainabilityPanel candidate={selected} ranked={ranked} />
          </div>
        </div>
      )}

      {/* ══ CANDIDATE COMPARISON ══ */}
      <div className="rounded-lg border border-sentinel-border bg-sentinel-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sentinel-text">
              Candidate Comparison
            </h3>
            <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
              Pin up to 3 candidates from the table to compare side by side. Rows
              show only data the current model actually exposes.
            </p>
          </div>
          {pinned.length > 0 && (
            <button
              onClick={() => setPinnedIds([])}
              className="text-[10px] font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Clear pins
            </button>
          )}
        </div>
        <div className="px-4 pb-4">
          {pinned.length > 0 ? (
            <CandidateCompareTable pinned={pinned} />
          ) : (
            <p className="text-xs text-sentinel-text-muted">
              No candidates pinned for comparison yet.
            </p>
          )}
        </div>
      </div>

      {/* ══ MODEL COMPARISON ══ */}
      <div className="rounded-lg border border-sentinel-border bg-sentinel-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sentinel-text">
              Ranking Method Comparison
            </h3>
            <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
              Weighted Baseline and Random Forest may order candidates differently
              because they use different ranking approaches. This is a structural
              comparison — not a performance evaluation.
            </p>
          </div>
          <button
            onClick={() => {
              if (!compareMode) loadComparison();
              setCompareMode(!compareMode);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              compareMode
                ? ""
                : "border text-sentinel-text-secondary hover:bg-sentinel-surface-alt"
            }`}
            style={
              compareMode
                ? { background: "var(--accent-dim)", color: "var(--accent)" }
                : { borderColor: "var(--border)" }
            }
          >
            {compareMode ? "Hide" : "Compare"}
          </button>
        </div>
        {compareMode && (
          <div className="px-4 pb-4">
            {compareLoading ? (
              <div className="space-y-2">
                <div className="h-8 skeleton" />
                <div className="h-8 skeleton" />
                <div className="h-8 skeleton" />
              </div>
            ) : compareData.weighted_baseline && compareData.random_forest ? (
              <ModelComparisonTable
                wbData={compareData.weighted_baseline}
                rfData={compareData.random_forest}
              />
            ) : (
              <p className="text-xs text-sentinel-text-muted">
                Could not load comparison data. Ensure the backend is running.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Interpretation + disclaimer */}
      <div className="rounded-lg border border-sentinel-border bg-sentinel-surface px-4 py-3">
        <p className="text-xs leading-relaxed text-sentinel-text-secondary">
          SENTINEL ranks candidate locations using the selected model and available
          investigation signals. Higher-ranked candidates are prioritized for
          investigator review.
        </p>
      </div>
      <Disclaimer variant="panel">
        <strong>Decision-support output:</strong> {DISCLAIMER_SCORE_TEXT} All data is
        synthetic for demonstration purposes.
      </Disclaimer>
    </div>
  );
}
