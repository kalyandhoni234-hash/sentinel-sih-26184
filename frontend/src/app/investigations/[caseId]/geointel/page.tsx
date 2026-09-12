"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { getPriorityTier } from "@/lib/tiers";
import { MODEL_LABELS } from "@/lib/labels";
import { SentinelMapWrapper } from "@/components/SentinelMapWrapper";
import { CandidateReadout } from "@/components/case/CandidateReadout";
import {
  getSharedCandidateSelection,
  setSharedCandidateSelection,
} from "@/lib/selection";
import { useCaseContext } from "../workspace-context";
import type { RankResponse, RankedCandidate, CaseTransactionsResponse } from "@/types/api";

/**
 * GeoIntel — the geographic intelligence workspace.
 *
 * Map-first: the map is the analytical centerpiece, with a persistent
 * candidate intelligence panel on the right. Selection is bidirectional
 * (map popup ↔ ranked list ↔ panel) and drives every synchronized surface.
 *
 * Data integrity: every value shown comes from POST /rank (scores, ranks,
 * explanations, group scores) or GET /investigations/:id/transactions
 * (transaction-metro context). Nothing about distance, probability, ATM
 * availability, or withdrawal likelihood is displayed — the system does
 * not compute those quantities.
 */

type RankingModel = "weighted_baseline" | "random_forest";

export default function GeoIntelPage() {
  const { caseId, caseInfo } = useCaseContext();
  const searchParams = useSearchParams();

  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<RankingModel>("weighted_baseline");
  const [topK, setTopK] = useState<number>(10);
  const [lastRankedModel, setLastRankedModel] = useState<RankingModel>("weighted_baseline");
  const [lastRankedTopK, setLastRankedTopK] = useState<number>(10);

  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);

  // Selection — single source of truth, drives map highlight, list highlight,
  // and the intelligence panel. Restored from (a) the ?candidate= deep link
  // ("View on Map" from Candidates) or (b) the shared cross-view selection.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const paramsChanged = model !== lastRankedModel || topK !== lastRankedTopK;

  const txMetros = useMemo(() => {
    if (!txData) return undefined;
    return new Set(
      txData.transactions
        .flatMap((tx) => [tx.sender_metro, tx.receiver_metro])
        .filter(Boolean)
    );
  }, [txData]);

  const loadRanking = useCallback(() => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
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
  }, [caseId, model, topK]);

  const ranked = useMemo(
    () => data?.ranked_candidates ?? [],
    [data]
  );

  useEffect(() => {
    loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    let active = true;
    api
      .getTransactions(caseId)
      .then((res) => active && setTxData(res))
      .catch(() => active && setTxData(null));
    return () => {
      active = false;
    };
  }, [caseId]);

  // Restore selection from the deep link or the shared cross-view state once
  // the ranked list is available.
  useEffect(() => {
    if (ranked.length === 0) return;
    const fromLink = searchParams.get("candidate");
    const target = fromLink ?? getSharedCandidateSelection(caseId);
    if (target && ranked.some((c) => c.location_id === target)) {
      setSelectedId(target);
      setSharedCandidateSelection(caseId, target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, caseId]);

  const selected = useMemo(
    () => ranked.find((c) => c.location_id === selectedId) ?? null,
    [ranked, selectedId]
  );

  const handleSelect = useCallback(
    (locationId: string) => {
      setSelectedId(locationId);
      setSharedCandidateSelection(caseId, locationId);
    },
    [caseId]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 xl:flex-row">
      {/* ══ MAP (analytical centerpiece) ══ */}
      <div className="flex min-h-[440px] flex-1 flex-col p-3 sm:p-4 xl:min-h-0 xl:pr-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-sentinel-text">
              Geographic Intelligence
            </h2>
            <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
              Candidate location prioritization for {caseId}
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-3 text-[10px] text-sentinel-text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
                Evidence origin
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full border-2"
                  style={{ borderColor: "var(--warning)", background: "var(--surface)" }}
                />
                Candidates ({ranked.length})
              </span>
            </div>
          )}
        </div>

        {/* Map controls — grouped, only real functionality */}
        <div className="mb-2 flex flex-wrap items-end gap-3 rounded-md border border-sentinel-border bg-sentinel-surface px-3 py-2">
          <div>
            <label className="section-label">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as RankingModel)}
              className="mt-0.5 block rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sentinel-500"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="weighted_baseline">{MODEL_LABELS.weighted_baseline}</option>
              <option value="random_forest">{MODEL_LABELS.random_forest}</option>
            </select>
          </div>
          <div>
            <label className="section-label">Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              min={1}
              max={100}
              className="mt-0.5 block w-16 rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sentinel-500"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
            />
          </div>
          <button onClick={loadRanking} className="btn-primary relative !py-1 text-xs">
            Re-rank
            {paramsChanged && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </button>
          <div className="ml-auto text-[10px] text-sentinel-text-muted">
            {loading ? "Ranking…" : data ? `${ranked.length} of ${data.total_candidates} candidates shown` : ""}
          </div>
        </div>

        {error && (
          <div className="card mb-2 border-red-200 bg-red-50">
            <p className="text-sm text-red-800">Error: {error}</p>
          </div>
        )}

        <div className="min-h-[420px] flex-1 overflow-hidden rounded-lg border border-sentinel-border">
          {caseInfo && data ? (
            <SentinelMapWrapper
              caseInfo={data.case}
              candidates={ranked}
              highlightedId={selectedId}
              onSelectCandidate={handleSelect}
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center bg-sentinel-surface-alt">
              {error ? (
                <p className="text-xs text-sentinel-text-muted">Map unavailable — ranking could not be loaded.</p>
              ) : (
                <div className="text-center">
                  <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-sentinel-border border-t-sentinel-600" />
                  <p className="text-xs text-sentinel-text-muted">Preparing map…</p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-2 text-[10px] text-sentinel-text-muted">
          Solid markers are observed evidence; hollow markers are SENTINEL-ranked
          candidates. Ranked priority — not a prediction of certainty. All data is
          synthetic.
        </p>
      </div>

      {/* ══ INTELLIGENCE PANEL ══ */}
      <div className="geointel-panel-surface flex w-full shrink-0 flex-col xl:w-[360px]">
        {/* Ranked candidate list — compact, scannable */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="section-label">Ranked Candidates</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: "380px" }}>
            {loading && !data && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 skeleton" />
                ))}
              </div>
            )}
            {ranked.map((c) => {
              const isSelected = selectedId === c.location_id;
              const tier = getPriorityTier(c.risk_score);
              return (
                <button
                  key={c.location_id}
                  onClick={() => handleSelect(c.location_id)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    isSelected
                      ? ""
                      : "hover:bg-sentinel-surface-alt"
                  }`}
                  style={isSelected ? { background: "var(--accent-dim)" } : undefined}
                >
                  <span
                    className={`font-mono text-xs font-bold ${isSelected ? "" : "text-sentinel-text-muted"}`}
                    style={isSelected ? { color: "var(--accent)" } : undefined}
                  >
                    {String(c.rank).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold text-sentinel-text">
                      {c.location_id}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
                        style={{
                          color: tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)",
                          background: tier === "HIGH" ? "var(--warning-dim)" : "transparent",
                          border: `1px solid ${tier === "HIGH" ? "var(--danger)" : tier === "MEDIUM" ? "var(--warning)" : "var(--success)"}`,
                        }}
                      >
                        {tier}
                      </span>
                      {c.location && txMetros?.has(c.location.metro) && (
                        <span
                          className="rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wider"
                          style={{ borderColor: "var(--success)", color: "var(--success)" }}
                        >
                          TX Metro
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-sentinel-text-secondary">
                    {c.risk_score.toFixed(3)}
                  </span>
                </button>
              );
            })}
            {!loading && ranked.length === 0 && !error && (
              <p className="p-4 text-xs text-sentinel-text-muted">
                No ranked candidates. Run the ranking to populate the map.
              </p>
            )}
          </div>
        </div>

        {/* Selected candidate — intelligence readout */}
        <div
          className="shrink-0 overflow-y-auto p-4"
          style={{ borderTop: "1px solid var(--border)", maxHeight: "calc(100vh - 260px)" }}
        >
          {!selected ? (
            <div className="rounded-md border border-dashed border-sentinel-border p-4 text-center">
              <p className="text-xs font-medium text-sentinel-text-secondary">
                No candidate selected
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-sentinel-text-muted">
                Select a candidate from the list or click a marker on the map to
                inspect its ranking context.
              </p>
            </div>
          ) : (
            <CandidateReadout
              candidate={selected}
              txMetros={txMetros}
              caseId={caseId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
