"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDateShort, formatTime } from "@/lib/format";
import { EvidenceTrail } from "@/components/case/EvidenceTrail";
import { TransactionGeography } from "@/components/case/GeoContextPanels";
import { useCaseContext } from "../workspace-context";
import type { CaseTransactionsResponse } from "@/types/api";

/**
 * Evidence Intelligence — observed transaction and account evidence for
 * the case.
 *
 * Information architecture:
 *   EVIDENCE SUMMARY (real ledger totals)
 *     → TRANSACTION TRAIL (connected, chronological, expandable records)
 *     → OBSERVED GEOGRAPHY (transaction metros, context only)
 *     → ANALYSIS POINT (temporal boundary — what the ranking may use)
 *     → downstream workspaces (GeoIntel / Candidates)
 *
 * Data source: GET /investigations/:id/transactions only. Every displayed
 * value is derived from that response — no fabricated evidence, scores,
 * or future observations.
 */
export default function CaseEvidencePage() {
  const { caseId, caseInfo } = useCaseContext();
  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getTransactions(caseId)
      .then((res) => active && setTxData(res))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [caseId]);

  // Ledger records timestamped after the analysis point (if any) — used
  // only for the truthful boundary note; they remain part of the trail.
  const afterCount = useMemo(() => {
    if (!txData || !caseInfo) return 0;
    return txData.transactions.filter(
      (tx) => new Date(tx.timestamp).getTime() > new Date(caseInfo.analysis_point).getTime()
    ).length;
  }, [txData, caseInfo]);

  // Complete ledger, sequence order — no truncation on the dedicated view.
  const fullLedger = useMemo(
    () =>
      txData
        ? {
            ...txData,
            transactions: [...txData.transactions].sort(
              (a, b) => a.sequence_number - b.sequence_number
            ),
          }
        : null,
    [txData]
  );

  // Summary metrics — derived from the real ledger only.
  const summary = useMemo(() => {
    if (!txData) return null;
    const txs = [...txData.transactions].sort(
      (a, b) => a.sequence_number - b.sequence_number
    );
    if (txs.length === 0) return null;
    return {
      count: txs.length,
      accountCount: txData.accounts.length,
      volume: txs.reduce((s, tx) => s + tx.amount, 0),
      periodFrom: txs[0].timestamp,
      periodTo: txs[txs.length - 1].timestamp,
      byType: txs.reduce<Record<string, number>>((acc, tx) => {
        acc[tx.transaction_type] = (acc[tx.transaction_type] || 0) + 1;
        return acc;
      }, {}),
    };
  }, [txData]);

  /* ── loading / error / empty states (truthful, no fake evidence) ── */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="intel-panel p-4">
          <p className="section-label">Loading Evidence</p>
          <div className="mt-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="intel-panel p-4">
        <p className="section-label">Evidence Unavailable</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          Transaction evidence could not be loaded: {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            api
              .getTransactions(caseId)
              .then(setTxData)
              .catch((err) => setError(err.message))
              .finally(() => setLoading(false));
          }}
          className="btn-secondary mt-3"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!fullLedger || fullLedger.transactions.length === 0) {
    return (
      <div className="intel-panel p-4">
        <p className="section-label">No Transaction Evidence Exposed</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          This investigation dataset does not currently expose transaction
          records. No evidence has been fabricated to fill this view.
        </p>
      </div>
    );
  }

  const summaryFields = summary
    ? [
        { label: "Transactions", value: String(summary.count) },
        { label: "Accounts", value: String(summary.accountCount) },
        { label: "Observed Volume", value: formatINR(summary.volume) },
        {
          label: "Observed Period",
          value: `${formatDateShort(summary.periodFrom)} — ${formatDateShort(summary.periodTo)}`,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* workspace title */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-sentinel-text">
          Evidence Intelligence
        </h2>
        <p className="mt-0.5 text-xs text-sentinel-text-muted">
          Observed transaction and account evidence for this case
        </p>
      </div>

      {/* evidence summary — real ledger values only */}
      {summary && (
        <div className="intel-panel grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
          {summaryFields.map((f) => (
            <div key={f.label}>
              <p className="section-label">{f.label}</p>
              <p className="mt-0.5 font-mono text-sm font-medium text-sentinel-text">
                {f.value}
              </p>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <p className="text-[10px] text-sentinel-text-muted">
              Record types:{" "}
              {Object.entries(summary.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `${type} (${count})`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* transaction trail */}
      <EvidenceTrail txData={fullLedger} />

      {/* observed transaction geography */}
      <TransactionGeography txData={txData} />

      {/* analysis-point boundary — truthful temporal framing */}
      {caseInfo && afterCount > 0 && (
        <div className="intel-panel border-l-2 border-l-sentinel-500 p-4">
          <p className="section-label">Analysis Point — Temporal Boundary</p>
          <p className="mt-2 text-xs leading-relaxed text-sentinel-text-secondary">
            Analysis point: <strong className="font-mono">{formatDateShort(caseInfo.analysis_point)}, {formatTime(caseInfo.analysis_point)}</strong>.
            Candidate prioritization uses only ledger records at or before
            this boundary.{" "}
            <strong>
              {afterCount} record{afterCount !== 1 ? "s" : ""} in the trail
              above {afterCount === 1 ? "is" : "are"} timestamped after the
              analysis point — shown for ledger completeness, not used as
              ranking evidence. See the Timeline for the boundary
              visualization.
            </strong>
          </p>
        </div>
      )}

      {/* downstream workspaces — prioritization, not proof */}
      <div
        className="flex flex-wrap items-center gap-3 pt-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link href={`/investigations/${caseId}/geointel`} className="btn-secondary">
          Explore Geographic Context →
        </Link>
        <Link href={`/investigations/${caseId}/candidates`} className="btn-primary">
          Review Candidate Prioritization →
        </Link>
        <p className="w-full text-[10px] text-sentinel-text-muted sm:w-auto sm:flex-1">
          Candidate prioritization is a ranking of review priorities derived
          from this evidence — it does not prove that any specific location is
          a cash-out point.
        </p>
      </div>
    </div>
  );
}
