"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDateShort, formatTime } from "@/lib/format";
import { getPriorityTier } from "@/lib/tiers";
import { MODEL_LABELS } from "@/lib/labels";
import { PriorityTier } from "@/components/PriorityTier";
import { Disclaimer, DISCLAIMER_SCORE_TEXT } from "@/components/Disclaimer";
import {
  summarizeLedger,
  observedMetros,
  isAfterAnalysisPoint,
} from "@/lib/timeline";
import { useCaseContext } from "./workspace-context";
import type { RankResponse, CaseTransactionsResponse } from "@/types/api";

/**
 * Case Overview — the case command center (Phase 7).
 *
 * Answers, from top to bottom:
 *   WHAT IS THIS CASE?        (case snapshot from GET /investigations/:id)
 *   WHAT EVIDENCE IS AVAILABLE?  (ledger snapshot from GET .../transactions)
 *   WHAT HAS BEEN ANALYZED?   (analysis point + model used)
 *   WHAT IS THE CURRENT PRIORITY?  (#1 ranked candidate from POST /rank)
 *   WHERE CAN I INVESTIGATE NEXT?  (one navigation row into each workspace)
 *
 * Detail lives in the dedicated workspaces (Evidence / Timeline / Network /
 * GeoIntel / Candidates); the Overview summarizes and links rather than
 * duplicating them. Data sources are the three existing endpoints — no new
 * requests per item, no polling.
 */

const NAV_ACTIONS = [
  { href: "transactions", label: "Review Evidence →", primary: false },
  { href: "timeline", label: "Open Timeline →", primary: false },
  { href: "network", label: "Explore Network →", primary: false },
  { href: "geointel", label: "Open GeoIntel →", primary: false },
  { href: "candidates", label: "Review Candidates →", primary: true },
  { href: "report", label: "Generate Report →", primary: false },
] as const;

export default function CaseOverviewPage() {
  const { caseId, caseInfo } = useCaseContext();

  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"weighted_baseline" | "random_forest">(
    "weighted_baseline"
  );
  const [lastRankedModel, setLastRankedModel] =
    useState<"weighted_baseline" | "random_forest">("weighted_baseline");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);

  const paramsChanged = model !== lastRankedModel;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setHighlightedId(null);
    api
      .rankCandidates(caseId, { model, top_k: 5 })
      .then((res) => active && setData(res))
      .catch((err) => active && setError(err.message))
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setLastRankedModel(model);
      });
    api
      .getTransactions(caseId)
      .then((res) => active && setTxData(res))
      .catch(() => active && setTxData(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const ranked = data?.ranked_candidates ?? [];
  const topCandidate = ranked.length > 0 ? ranked[0] : null;
  const topPriority = topCandidate
    ? getPriorityTier(topCandidate.risk_score)
    : null;

  const ledger = useMemo(
    () => (txData ? summarizeLedger(txData, caseInfo?.analysis_point) : null),
    [txData, caseInfo?.analysis_point]
  );

  const txMetros = useMemo(
    () => (txData ? observedMetros(txData.transactions) : []),
    [txData]
  );

  const afterCount = useMemo(() => {
    if (!txData) return 0;
    return txData.transactions.filter((tx) =>
      isAfterAnalysisPoint(tx, caseInfo?.analysis_point)
    ).length;
  }, [txData, caseInfo?.analysis_point]);

  return (
    <div className="space-y-5">
      {/* Loading */}
      {loading && !data && (
        <div className="card">
          <div className="h-5 w-48 skeleton" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-16 skeleton" />
                <div className="mt-1 h-4 w-24 skeleton" />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {/* ══ 1. WHAT IS THIS CASE? ══ */}
      {caseInfo && (
        <div className="intel-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-label">Case Snapshot</p>
              <p className="mt-1.5 text-sm leading-relaxed text-sentinel-text-secondary">
                Reported <strong>{caseInfo.fraud_scenario.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</strong>{" "}
                cyber-fraud of <strong className="font-mono">{formatINR(caseInfo.reported_amount)}</strong>{" "}
                originating from <strong>{caseInfo.origin_metro}</strong>, filed{" "}
                {formatDateShort(caseInfo.complaint_time)}. The case ledger
                records <strong className="font-mono">{caseInfo.num_transactions}</strong>{" "}
                transaction{caseInfo.num_transactions !== 1 ? "s" : ""} across{" "}
                <strong className="font-mono">{caseInfo.num_accounts_involved}</strong>{" "}
                account{caseInfo.num_accounts_involved !== 1 ? "s" : ""}.
              </p>
            </div>
            <span
              className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              Analysis Complete
            </span>
          </div>
        </div>
      )}

      {/* ══ 2. WHAT EVIDENCE IS AVAILABLE? ══ */}
      {ledger && ledger.count > 0 && (
        <div className="intel-panel grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
          <SnapshotMetric label="Transactions" value={String(ledger.count)} />
          <SnapshotMetric label="Ledger Accounts" value={String(ledger.accountCount)} />
          <SnapshotMetric label="Observed Volume" value={formatINR(ledger.volume)} mono />
          <SnapshotMetric
            label="Observed Period"
            value={
              ledger.periodFrom && ledger.periodTo
                ? `${formatDateShort(ledger.periodFrom)} — ${formatDateShort(ledger.periodTo)}`
                : "—"
            }
            mono
          />
          <div className="col-span-2 sm:col-span-4">
            <p className="text-[10px] text-sentinel-text-muted">
              Record types:{" "}
              {Object.entries(ledger.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `${type} (${count})`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* ══ 3. WHAT HAS BEEN ANALYZED? — analysis-point boundary ══ */}
      {caseInfo && (
        <div className="intel-panel border-l-2 border-l-sentinel-500 p-4">
          <p className="section-label">Analysis Point — Forward-Looking Boundary</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Complaint time: <strong>{formatDateShort(caseInfo.analysis_point)}, {formatTime(caseInfo.analysis_point)}</strong>{" "}
            — Only evidence available at or before this point contributes to
            candidate prioritization. These are investigator review priorities,
            not guaranteed future withdrawal locations.
            {afterCount > 0 && (
              <>
                {" "}
                <strong>
                  The ledger also contains {afterCount} record
                  {afterCount !== 1 ? "s" : ""} timestamped after this point;
                  they are shown in the Timeline for completeness and are not
                  used as ranking evidence.
                </strong>
              </>
            )}
          </p>
        </div>
      )}

      {/* ══ 4. WHAT IS THE CURRENT PRIORITY? ══ */}
      {data && topCandidate && (
        <div className="rounded-lg border-2 border-sentinel-300 bg-sentinel-50/50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-sentinel-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Highest Priority
            </span>
            {topPriority && <PriorityTier tier={topPriority} label="PRIORITY" />}
            {topCandidate.location && txMetros.includes(topCandidate.location.metro) && (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                GEO CONTEXT MATCH
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-lg font-bold text-white">
                1
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-sentinel-text">
                  {topCandidate.location_id}
                </p>
                {topCandidate.location && (
                  <p className="text-sm text-sentinel-text-secondary">
                    {topCandidate.location.location_type} — {topCandidate.location.region},{" "}
                    {topCandidate.location.metro}
                  </p>
                )}
                {topCandidate.location && (
                  <p className="mt-0.5 text-xs text-sentinel-text-muted">
                    {topCandidate.location.latitude.toFixed(4)},{" "}
                    {topCandidate.location.longitude.toFixed(4)} · Density:{" "}
                    {topCandidate.location.density_score.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-sentinel-text">
                {topCandidate.risk_score.toFixed(3)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-sentinel-text-muted">
                Priority Score
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-sentinel-border bg-sentinel-surface p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-sentinel-text-muted">
              {topCandidate.model_used === "random_forest"
                ? "Supporting Evidence Signals"
                : "Evidence Assessment"}
            </p>
            <p className="text-sm leading-relaxed text-sentinel-text-secondary">
              {topCandidate.explanation}
            </p>
          </div>

          <p className="mt-3 text-[10px] text-sentinel-text-muted">
            Ranked by {MODEL_LABELS[topCandidate.model_used] ?? topCandidate.model_used}.
            Ranked candidates: view all in Candidate Prioritization.
          </p>
        </div>
      )}

      <Disclaimer variant="panel">
        <strong>Decision-support output:</strong> {DISCLAIMER_SCORE_TEXT} All data is
        synthetic for demonstration purposes.
      </Disclaimer>

      {/* ══ 5. WHERE CAN I INVESTIGATE NEXT? ══ */}
      <div
        className="flex flex-wrap items-center gap-3 pt-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {NAV_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={`/investigations/${caseId}/${a.href}`}
            className={a.primary ? "btn-primary" : "btn-secondary"}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-sentinel-text ${mono ? "font-mono" : "font-mono"}`}>
        {value}
      </p>
    </div>
  );
}
