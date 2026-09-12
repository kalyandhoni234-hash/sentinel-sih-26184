"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDateShort, formatTime, formatTimestampFull } from "@/lib/format";
import { getPriorityTier } from "@/lib/tiers";
import { MODEL_LABELS, ACCOUNT_ROLE_LABELS } from "@/lib/labels";
import {
  summarizeLedger,
  orderedLedger,
  observedMetros,
  isAfterAnalysisPoint,
} from "@/lib/timeline";
import type {
  RankResponse,
  RankedCandidate,
  CaseTransactionsResponse,
} from "@/types/api";

/**
 * Investigator Case Brief (Phase 7) — a presentation layer over the
 * existing data. The underlying ranking/report logic is unchanged.
 *
 * Sections (per the Phase 7 information architecture):
 *   CASE IDENTITY → EXECUTIVE SUMMARY → OBSERVED EVIDENCE →
 *   TRANSACTION TRAIL (condensed) → GEOGRAPHIC CONTEXT →
 *   CANDIDATE PRIORITIZATION → MODEL / EXPLANATION →
 *   INVESTIGATOR FOCUS → METHODOLOGY & LIMITATIONS
 *
 * Executive-summary rules (claim discipline): the summary is assembled
 * deterministically from case info, the ledger, and the ranking response.
 * It never predicts ("will be used next") — it only describes
 * prioritization ("prioritized for investigator review based on the
 * available observed evidence and ranking model").
 *
 * Model explanation rules (Phase 6, preserved): WB shows its group
 * scores; RF shows its supporting-evidence explanation. No SHAP, no
 * confidence, no probability, no fabricated feature importance, and no
 * unsupported contribution percentages anywhere in the brief.
 *
 * Print: the brief is print-first. The app chrome is hidden via
 * .no-print; section cards avoid page-internal breaks; tables repeat
 * their headers across page breaks; interactive-only controls are hidden.
 */

type RankingModel = "weighted_baseline" | "random_forest";

function BriefHeader({
  caseId,
  data,
}: {
  caseId: string;
  data: RankResponse;
}) {
  return (
    <div className="report-header">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-sentinel-600 text-sm font-bold text-white print:h-6 print:w-6 print:text-xs">
              S
            </div>
            <span className="text-xl font-bold text-gray-900 print:text-lg">
              SENTINEL
            </span>
            <span className="rounded bg-sentinel-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sentinel-700 print:hidden">
              Investigator Case Brief
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 print:text-xl">
            Investigator Case Brief
          </h1>
        </div>
        <div className="text-right text-xs text-gray-500 print:text-[10px]">
          <p className="font-mono">{data.case.case_id || caseId}</p>
          <p>Generated: {new Date().toLocaleString("en-IN")}</p>
          <p className="mt-1 font-medium text-amber-700">
            Synthetic Data — For Demonstration
          </p>
        </div>
      </div>

      <div className="report-grid-4 mt-4">
        <div className="report-kv">
          <span className="report-kv-label">Case</span>
          <span className="report-kv-value font-mono">{data.case.case_id}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Scenario</span>
          <span className="report-kv-value">
            {data.case.fraud_scenario.replace(/_/g, " ")}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Location</span>
          <span className="report-kv-value">{data.case.origin_metro}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Filed</span>
          <span className="report-kv-value">
            {formatDateShort(data.case.complaint_time)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Amount</span>
          <span className="report-kv-value font-mono">
            {formatINR(data.case.reported_amount)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Analysis Point</span>
          <span className="report-kv-value font-mono">
            {formatTimestampFull(data.case.analysis_point)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ExecutiveSummarySection({
  data,
  txData,
}: {
  data: RankResponse;
  txData: CaseTransactionsResponse | null;
}) {
  const c = data.case;
  const ledger = txData ? summarizeLedger(txData, c.analysis_point) : null;
  const top = data.ranked_candidates[0] ?? null;
  const model = MODEL_LABELS[data.model_used] ?? data.model_used;

  const parts: string[] = [];
  parts.push(
    `This case concerns a reported ${c.fraud_scenario.replace(/_/g, " ").toLowerCase()} cyber-fraud of ${formatINR(c.reported_amount)} originating from ${c.origin_metro}, filed ${formatDateShort(c.complaint_time)}.`
  );
  if (ledger && ledger.count > 0) {
    parts.push(
      `The recorded ledger contains ${ledger.count} transaction${ledger.count !== 1 ? "s" : ""} totalling ${formatINR(ledger.volume)} across ${ledger.accountCount} account${ledger.accountCount !== 1 ? "s" : ""}${ledger.periodFrom && ledger.periodTo ? `, observed between ${formatDateShort(ledger.periodFrom)} and ${formatDateShort(ledger.periodTo)}` : ""}.`
    );
    if (ledger.afterAnalysis > 0) {
      parts.push(
        `${ledger.afterAnalysis} ledger record${ledger.afterAnalysis !== 1 ? "s" : ""} ${ledger.afterAnalysis === 1 ? "is" : "are"} timestamped after the analysis point and ${ledger.afterAnalysis === 1 ? "was" : "were"} not used as ranking evidence.`
      );
    }
  }
  if (top) {
    parts.push(
      `SENTINEL prioritizes ${top.location_id} (${top.risk_score.toFixed(3)}) for investigator review based on the available observed evidence and the ${model} ranking model.`
    );
  }
  parts.push(
    `All locations in this brief are review priorities derived from observed evidence — not claims about where a cash-out will occur.`
  );

  return (
    <div className="report-section">
      <h2 className="report-section-title">Executive Summary</h2>
      {parts.map((p, i) => (
        <p key={i} className="mb-2 text-sm leading-relaxed text-gray-700">
          {p}
        </p>
      ))}
    </div>
  );
}

function ObservedEvidenceSection({
  txData,
}: {
  txData: CaseTransactionsResponse | null;
}) {
  if (!txData || txData.transactions.length === 0) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">Observed Evidence</h2>
        <p className="text-sm italic text-gray-500">
          No transaction evidence available for this case.
        </p>
      </div>
    );
  }

  const ledger = summarizeLedger(txData, null);
  const roleCounts = Object.entries(ledger.byRole).sort((a, b) => b[1] - a[1]);

  return (
    <div className="report-section">
      <h2 className="report-section-title">Observed Evidence</h2>
      <div className="report-grid-4 mb-3">
        <div className="report-kv">
          <span className="report-kv-label">Transactions</span>
          <span className="report-kv-value font-mono">{ledger.count}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Ledger Accounts</span>
          <span className="report-kv-value font-mono">{ledger.accountCount}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Observed Volume</span>
          <span className="report-kv-value font-mono">
            {formatINR(ledger.volume)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Observed Period</span>
          <span className="report-kv-value font-mono">
            {ledger.periodFrom && ledger.periodTo
              ? `${formatDateShort(ledger.periodFrom)} — ${formatDateShort(ledger.periodTo)}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <span>
          <span className="font-semibold">Record types:</span>{" "}
          {Object.entries(ledger.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${t} (${n})`)
            .join(" · ")}
        </span>
        <span>
          <span className="font-semibold">Account roles:</span>{" "}
          {roleCounts.map(([r, n]) => `${ACCOUNT_ROLE_LABELS[r] ?? r} (${n})`).join(" · ")}
        </span>
      </div>
      <p className="text-[10px] italic text-gray-500">
        Transaction amounts are observed transfers, not confirmed cash
        withdrawals. All data is synthetic.
      </p>
    </div>
  );
}

function TransactionTrailSection({
  txData,
  analysisPoint,
}: {
  txData: CaseTransactionsResponse | null;
  analysisPoint: string;
}) {
  if (!txData || txData.transactions.length === 0) return null;

  const ledger = orderedLedger(txData);
  const roleById = new Map(txData.accounts.map((a) => [a.account_id, a.role]));
  const roleLabel = (id: string) => {
    const r = roleById.get(id);
    return r ? ACCOUNT_ROLE_LABELS[r] ?? r : "—";
  };
  const after = ledger.filter((t) => isAfterAnalysisPoint(t, analysisPoint));

  return (
    <div className="report-section">
      <h2 className="report-section-title">Transaction Trail</h2>
      <p className="mb-3 text-xs italic text-gray-500">
        Condensed evidence chain in recorded order. Metro columns describe
        observed transaction geography only.
      </p>
      <div className="overflow-x-auto">
        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Transaction ID</th>
              <th>Timestamp</th>
              <th>Sender (Role)</th>
              <th>Receiver (Role)</th>
              <th className="text-right">Amount</th>
              <th>Type</th>
              <th>Metro Flow</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((tx) => (
              <tr key={tx.transaction_id}>
                <td className="font-mono text-xs">{tx.sequence_number}</td>
                <td className="font-mono text-xs">{tx.transaction_id}</td>
                <td className="font-mono text-xs text-gray-500">
                  {formatTimestampFull(tx.timestamp)}
                </td>
                <td className="text-xs">
                  {tx.sender_account_id} ({roleLabel(tx.sender_account_id)})
                </td>
                <td className="text-xs">
                  {tx.receiver_account_id} ({roleLabel(tx.receiver_account_id)})
                </td>
                <td className="text-right text-xs font-medium">
                  {formatINR(tx.amount)}
                </td>
                <td className="text-xs font-medium">{tx.transaction_type}</td>
                <td className="text-xs text-gray-600">
                  {tx.sender_metro && tx.receiver_metro
                    ? tx.sender_metro === tx.receiver_metro
                      ? tx.sender_metro
                      : `${tx.sender_metro} → ${tx.receiver_metro}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {after.length > 0 && (
        <p className="mt-2 text-[10px] italic text-gray-500">
          {after.length} record{after.length !== 1 ? "s" : ""} above{" "}
          {after.length !== 1 ? "are" : "is"} timestamped after the analysis
          point ({formatTimestampFull(analysisPoint)}) and {after.length === 1 ? "was" : "were"} not used as
          ranking evidence.
        </p>
      )}
    </div>
  );
}

function GeographicContextSection({
  data,
  txData,
}: {
  data: RankResponse;
  txData: CaseTransactionsResponse | null;
}) {
  const candidateMetroCounts: Record<string, number> = {};
  for (const c of data.ranked_candidates) {
    if (c.location) {
      candidateMetroCounts[c.location.metro] =
        (candidateMetroCounts[c.location.metro] || 0) + 1;
    }
  }

  const txMetros = txData ? observedMetros(txData.transactions) : [];
  const sharedMetros = txMetros.filter((m) => candidateMetroCounts[m]);

  return (
    <div className="report-section">
      <h2 className="report-section-title">Geographic Context</h2>

      <div className="report-grid-2 mb-3">
        <div className="report-kv">
          <span className="report-kv-label">Complaint Origin</span>
          <span className="report-kv-value">{data.case.origin_metro}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Observed Transaction Geography</span>
          <span className="report-kv-value">
            {txMetros.length > 0 ? txMetros.join(", ") : "No metro data recorded"}
          </span>
        </div>
      </div>

      {Object.keys(candidateMetroCounts).length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
            Candidate Metro Distribution
          </h3>
          <div className="space-y-1">
            {Object.entries(candidateMetroCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([metro, count]) => (
                <div key={metro} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 font-medium text-gray-700">
                    {metro}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 print:bg-gray-200">
                    <div
                      className="h-full rounded-full bg-sentinel-400"
                      style={{
                        width: `${(count / data.ranked_candidates.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right font-mono text-gray-500">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {sharedMetros.length > 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 print:border-gray-400 print:bg-white">
          <p className="text-xs text-emerald-700 print:text-gray-700">
            Shared metro context: {sharedMetros.join(", ")}.
          </p>
          <p className="mt-1 text-[10px] italic text-emerald-600 print:text-gray-600">
            Shared metro does not imply transactions occurred at a specific
            candidate location.
          </p>
        </div>
      )}
    </div>
  );
}

function CandidatePrioritizationSection({
  candidates,
}: {
  candidates: RankedCandidate[];
}) {
  if (candidates.length === 0) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">Candidate Prioritization</h2>
        <p className="text-sm italic text-gray-500">
          No ranked candidates available.
        </p>
      </div>
    );
  }

  return (
    <div className="report-section">
      <h2 className="report-section-title">Candidate Prioritization</h2>
      <p className="mb-3 text-xs italic text-gray-500">
        Ranked by evidence-based priority score. These are investigator review
        priorities, not guaranteed predictions.
      </p>

      <table className="report-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Location</th>
            <th>Priority</th>
            <th className="text-right">Score</th>
            <th>Type / Region / Metro</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const tier = getPriorityTier(c.risk_score);
            return (
              <tr key={c.location_id}>
                <td className="font-mono text-xs font-semibold">
                  {String(c.rank).padStart(2, "0")}
                </td>
                <td className="font-mono text-xs font-semibold text-gray-900">
                  {c.location_id}
                </td>
                <td className="text-xs font-semibold">{tier}</td>
                <td className="text-right font-mono text-xs">
                  {c.risk_score.toFixed(3)}
                </td>
                <td className="text-xs text-gray-600">
                  {c.location
                    ? `${c.location.location_type.replace(/_/g, " ")} · ${c.location.region} · ${c.location.metro}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {candidates[0] && (
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            #1 Ranked — {candidates[0].location_id}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-700">
            {candidates[0].explanation}
          </p>
        </div>
      )}
    </div>
  );
}

function ModelExplanationSection({ data }: { data: RankResponse }) {
  const model = MODEL_LABELS[data.model_used] ?? data.model_used;
  const top = data.ranked_candidates[0];

  return (
    <div className="report-section">
      <h2 className="report-section-title">Model &amp; Explanation</h2>
      <div className="report-kv mb-3">
        <span className="report-kv-label">Ranking Model</span>
        <span className="report-kv-value">{model}</span>
      </div>

      {data.model_used === "weighted_baseline" && top?.group_scores ? (
        <>
          <p className="mb-2 text-xs text-gray-600">
            Weighted Baseline group scores for the #1 ranked candidate (
            {top.location_id}). Group scores are raw per-group signal values —
            they are not contribution percentages.
          </p>
          <div className="space-y-2">
            {Object.entries(top.group_scores)
              .sort((a, b) => b[1] - a[1])
              .map(([group, score]) => {
                const pct = Math.round(score * 100);
                return (
                  <div key={group} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs font-medium capitalize text-gray-700">
                      {group}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 print:bg-gray-200">
                      <div
                        className="h-full rounded-full bg-sentinel-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-xs text-gray-600">
                      {score.toFixed(3)}
                    </span>
                  </div>
                );
              })}
          </div>
          <p className="mt-2 text-[10px] italic text-gray-500">
            The model&apos;s configured group weights are not exposed by the
            API and are therefore not shown.
          </p>
        </>
      ) : (
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs leading-relaxed text-gray-600">
            {data.model_used === "random_forest"
              ? "The Random Forest model does not expose per-group score breakdowns. The available explanation is its supporting-evidence assessment, shown per candidate in the Candidate Prioritization section above. Missing breakdowns are not shown as zero."
              : "No group score data is available for the top candidate."}
          </p>
        </div>
      )}
    </div>
  );
}

function InvestigatorFocusSection({
  data,
  txData,
}: {
  data: RankResponse;
  txData: CaseTransactionsResponse | null;
}) {
  const top = data.ranked_candidates[0] ?? null;
  const second = data.ranked_candidates[1] ?? null;
  const ledger = txData ? summarizeLedger(txData, null) : null;
  const txMetros = txData ? observedMetros(txData.transactions) : [];

  let n = 0;
  const item = (node: React.ReactNode) => {
    n += 1;
    return (
      <li key={n} className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white print:bg-gray-700">
          {n}
        </span>
        <span className="text-sm leading-relaxed text-gray-700">{node}</span>
      </li>
    );
  };

  return (
    <div className="report-section">
      <h2 className="report-section-title">Investigator Focus</h2>
      <ol className="space-y-2">
        {top &&
          item(
            <>
              Review the <strong>#1 prioritized candidate</strong>{" "}
              <span className="font-mono text-xs">{top.location_id}</span>
              {top.location && (
                <> — {top.location.region}, {top.location.metro}</>
              )}
              . Ranking score {top.risk_score.toFixed(3)}.
            </>
          )}
        {second &&
          item(
            <>
              Compare against the <strong>#2 prioritized candidate</strong>{" "}
              <span className="font-mono text-xs">{second.location_id}</span>{" "}
              (score {second.risk_score.toFixed(3)}); adjacent candidates may
              have close scores.
            </>
          )}
        {ledger && ledger.count > 0 && (
          <>
            {item(
              <>
                Trace the <strong>transaction trail</strong> —{" "}
                {ledger.count} transactions across {ledger.accountCount}{" "}
                accounts, ending {ledger.periodTo ? formatTimestampFull(ledger.periodTo) : "at the last recorded transfer"}.
              </>
            )}
            {item(
              <>
                Review the <strong>account role structure</strong> from the
                recorded ledger roles:{" "}
                {Object.entries(ledger.byRole)
                  .sort((a, b) => b[1] - a[1])
                  .map(([r, c]) => `${ACCOUNT_ROLE_LABELS[r] ?? r} ×${c}`)
                  .join(", ")}
                .
              </>
            )}
          </>
        )}
        {txMetros.length > 0 && (
          <>
            {item(
              <>
                Cross-check <strong>observed transaction geography</strong> (
                {txMetros.join(", ")}) against candidate metros — as context
                only.
              </>
            )}
          </>
        )}
      </ol>
      <p className="mt-3 text-[10px] italic text-gray-400">
        These are workflow suggestions for investigator review, not automated
        actions and not predictions.
      </p>
    </div>
  );
}

function MethodologyLimitationsSection({ data }: { data: RankResponse }) {
  return (
    <div className="report-section report-disclaimer">
      <h2 className="report-section-title">Methodology &amp; Limitations</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 print:border-gray-400 print:bg-white print:text-gray-700">
          Synthetic Data
        </span>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 print:border-gray-400 print:bg-white print:text-gray-700">
          Decision Support Only
        </span>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 print:border-gray-400 print:bg-white print:text-gray-700">
          Relative Prioritization
        </span>
      </div>

      <p className="text-xs font-semibold text-gray-800">
        Relative prioritization based on observed evidence — not a prediction
        of certainty.
      </p>

      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-gray-700">
        <li>
          All data in this brief is synthetic, generated for demonstration and
          evaluation purposes. No live NCRP or bank systems are accessed.
        </li>
        <li>
          Ranked candidates are relative review priorities derived from
          observed evidence and the {MODEL_LABELS[data.model_used] ?? data.model_used}{" "}
          model — SENTINEL does not predict exact ATM locations or guarantee a
          next withdrawal at any location.
        </li>
        <li>
          Shared metro context does not imply transactions occurred at a
          specific candidate location; the relationship graph records observed
          transfers and proves no intent, ownership, or cash-out activity.
        </li>
        <li>
          Only evidence at or before the analysis point (
          {formatTimestampFull(data.case.analysis_point)}) informs the ranking;
          later ledger records are excluded from ranking inputs.
        </li>
        <li>
          SENTINEL is a decision-support system for investigators. It does not
          make autonomous law-enforcement decisions.
        </li>
      </ul>

      <p className="mt-3 text-[10px] text-gray-400">
        Generated by SENTINEL — Cybercrime Location Intelligence · Problem
        Statement 26184 · Smart India Hackathon 2026
      </p>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [txLoading, setTxLoading] = useState(true);

  const loadRanking = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .rankCandidates(caseId, { model: "weighted_baseline", top_k: 10 })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [caseId]);

  const loadTransactions = useCallback(() => {
    setTxLoading(true);
    api
      .getTransactions(caseId)
      .then(setTxData)
      .catch(() => setTxData(null))
      .finally(() => setTxLoading(false));
  }, [caseId]);

  useEffect(() => {
    loadRanking();
    loadTransactions();
  }, [loadRanking, loadTransactions]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="skeleton h-20" />
            <div className="skeleton h-40" />
            <div className="skeleton h-60" />
            <div className="skeleton h-40" />
          </div>
          <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Generating investigator case brief...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="alert-card alert-high">
            <h2 className="text-lg font-semibold text-red-800">
              Case Brief Unavailable
            </h2>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <Link
              href={`/investigations/${caseId}`}
              className="mt-4 inline-block text-sm font-medium text-sentinel-600 hover:text-sentinel-700"
            >
              Return to Investigation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="intel-panel p-6">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              No Data Available
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              No ranking data available for this case.
            </p>
            <Link
              href={`/investigations/${caseId}`}
              className="mt-4 inline-block text-sm font-medium text-sentinel-600 hover:text-sentinel-700"
            >
              Return to Investigation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white print:bg-white">
      {/* Top bar — hidden on print */}
      <div className="no-print border-b border-gray-200 bg-gray-50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href={`/investigations/${caseId}`}
              className="text-sm font-medium text-sentinel-600 hover:text-sentinel-700"
            >
              ← Back to Investigation
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-400">Investigator Case Brief</span>
          </div>
          <button
            onClick={handlePrint}
            className="rounded-md bg-sentinel-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sentinel-700"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Brief content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 print:px-0 print:py-0">
        <BriefHeader caseId={caseId} data={data} />
        <ExecutiveSummarySection data={data} txData={txData} />
        <ObservedEvidenceSection txData={txData} />
        <TransactionTrailSection
          txData={txData}
          analysisPoint={data.case.analysis_point}
        />
        <GeographicContextSection data={data} txData={txData} />
        <CandidatePrioritizationSection candidates={data.ranked_candidates} />
        <ModelExplanationSection data={data} />
        <InvestigatorFocusSection data={data} txData={txData} />
        <MethodologyLimitationsSection data={data} />
      </div>
    </div>
  );
}
