"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import type {
  RankResponse,
  RankedCandidate,
  CaseTransactionsResponse,
  TransactionInfo,
  AccountInfo,
} from "@/types/api";

function getPriorityLabel(score: number): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  if (score >= 0.7)
    return {
      label: "HIGH PRIORITY",
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-200",
    };
  if (score >= 0.4)
    return {
      label: "MEDIUM PRIORITY",
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
    };
  return {
    label: "LOW PRIORITY",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
  };
}

const GROUP_META: Record<string, { label: string }> = {
  geographic: { label: "Geographic" },
  transaction: { label: "Transaction" },
  location: { label: "Location" },
  temporal: { label: "Temporal" },
  case: { label: "Case" },
};

const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  VICTIM: "Victim",
  MULE: "Mule",
  CASH_OUT: "Cash Out",
  INTERMEDIATE: "Intermediate",
  UNKNOWN: "Unknown",
};

function ReportHeader({ caseId }: { caseId: string }) {
  return (
    <div className="report-header">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-sentinel-600 text-sm font-bold text-white print:h-6 print:w-6 print:text-xs">
              S
            </div>
            <span className="text-xl font-bold text-gray-900 print:text-lg">
              SENTINEL
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2 print:text-xl">
            Investigator Intelligence Report
          </h1>
        </div>
        <div className="text-right text-xs text-gray-500 print:text-[10px]">
          <p>Case ID: {caseId}</p>
          <p>Generated: {new Date().toLocaleString("en-IN")}</p>
          <p className="mt-1 font-medium text-amber-700">
            Synthetic Data — For Demonstration
          </p>
        </div>
      </div>
    </div>
  );
}

function CaseOverviewSection({ data }: { data: RankResponse }) {
  return (
    <div className="report-section">
      <h2 className="report-section-title">Case Overview</h2>
      <div className="report-grid-4">
        <div className="report-kv">
          <span className="report-kv-label">Fraud Scenario</span>
          <span className="report-kv-value">
            {data.case.fraud_scenario.replace(/_/g, " ")}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Reported Amount</span>
          <span className="report-kv-value">
            {formatINR(data.case.reported_amount)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Complaint Date</span>
          <span className="report-kv-value">
            {formatDate(data.case.complaint_time)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Analysis Point</span>
          <span className="report-kv-value">
            {formatDate(data.case.analysis_point)}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Origin Metro</span>
          <span className="report-kv-value">{data.case.origin_metro}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Accounts Involved</span>
          <span className="report-kv-value">
            {data.case.num_accounts_involved}
          </span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Transactions</span>
          <span className="report-kv-value">{data.case.num_transactions}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Candidate Locations</span>
          <span className="report-kv-value">{data.case.num_candidates}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Ranking Model</span>
          <span className="report-kv-value">
            {data.model_used === "random_forest"
              ? "Random Forest"
              : "Weighted Baseline"}
          </span>
        </div>
      </div>
    </div>
  );
}

function TransactionEvidenceSection({
  txData,
  txLoading,
}: {
  txData: CaseTransactionsResponse | null;
  txLoading: boolean;
}) {
  if (txLoading) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">
          Observed Transaction Evidence
        </h2>
        <p className="text-sm text-gray-500">Loading transaction data...</p>
      </div>
    );
  }

  if (!txData || txData.transactions.length === 0) {
    return (
      <div className="report-section">
        <h2 className="report-section-title">
          Observed Transaction Evidence
        </h2>
        <p className="text-sm text-gray-500 italic">
          No transaction evidence available for this case.
        </p>
      </div>
    );
  }

  const { transactions, accounts } = txData;
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  function getAccountRole(accountId: string): string {
    const acct = accounts.find((a) => a.account_id === accountId);
    return acct
      ? ACCOUNT_ROLE_LABELS[acct.role] || acct.role
      : "Unknown";
  }

  return (
    <div className="report-section">
      <h2 className="report-section-title">
        Observed Transaction Evidence
      </h2>
      <p className="text-xs text-gray-500 mb-3 italic">
        Transaction amounts are observed transfers, not confirmed cash
        withdrawals. All data is synthetic.
      </p>

      <div className="report-grid-2 mb-3">
        <div className="report-kv">
          <span className="report-kv-label">Total Transactions</span>
          <span className="report-kv-value">{transactions.length}</span>
        </div>
        <div className="report-kv">
          <span className="report-kv-label">Total Observed Amount</span>
          <span className="report-kv-value">{formatINR(totalAmount)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Transaction ID</th>
              <th>Sender</th>
              <th>Sender Role</th>
              <th>Receiver</th>
              <th>Receiver Role</th>
              <th className="text-right">Amount</th>
              <th>Type</th>
              <th>Timestamp</th>
              <th>Metro Flow</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx: TransactionInfo) => (
              <tr key={tx.transaction_id}>
                <td className="font-mono text-xs">{tx.sequence_number}</td>
                <td className="font-mono text-xs">
                  {tx.transaction_id.length > 16
                    ? tx.transaction_id.slice(0, 16) + "..."
                    : tx.transaction_id}
                </td>
                <td className="font-mono text-xs">
                  {tx.sender_account_id.replace("ACCT_", "").replace(/_/g, "-")}
                </td>
                <td className="text-xs">{getAccountRole(tx.sender_account_id)}</td>
                <td className="font-mono text-xs">
                  {tx.receiver_account_id
                    .replace("ACCT_", "")
                    .replace(/_/g, "-")}
                </td>
                <td className="text-xs">
                  {getAccountRole(tx.receiver_account_id)}
                </td>
                <td className="text-right text-xs font-medium">
                  {formatINR(tx.amount)}
                </td>
                <td className="text-xs font-medium">{tx.transaction_type}</td>
                <td className="text-xs text-gray-500">
                  {formatDate(tx.timestamp)}
                </td>
                <td className="text-xs text-gray-600">
                  {tx.sender_metro && tx.receiver_metro
                    ? tx.sender_metro === tx.receiver_metro
                      ? tx.sender_metro
                      : `${tx.sender_metro} -> ${tx.receiver_metro}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceSignalsSection({ data }: { data: RankResponse }) {
  const topCandidate = data.ranked_candidates[0];
  const hasGroupScores =
    data.model_used === "weighted_baseline" && topCandidate?.group_scores;

  return (
    <div className="report-section">
      <h2 className="report-section-title">Evidence Signal Assessment</h2>

      {hasGroupScores ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Per-group score breakdown for the #1 ranked candidate. Weighted
            Baseline model provides these group-level contributions.
          </p>
          <div className="space-y-2">
            {Object.entries(topCandidate.group_scores!).map(
              ([group, score]) => {
                const meta = GROUP_META[group] ?? { label: group };
                const pct = Math.round(score * 100);
                return (
                  <div key={group} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium text-gray-700 shrink-0">
                      {meta.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-sentinel-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs font-mono text-gray-600 shrink-0">
                      {score.toFixed(3)}
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </>
      ) : (
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            {data.model_used === "random_forest"
              ? "The Random Forest model does not expose per-group score breakdowns. Evidence signals are shown per-candidate in the ranked list below."
              : "No group score data available for the top candidate."}
          </p>
        </div>
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
  // Candidate metro distribution
  const candidateMetroCounts: Record<string, number> = {};
  for (const c of data.ranked_candidates) {
    if (c.location) {
      candidateMetroCounts[c.location.metro] =
        (candidateMetroCounts[c.location.metro] || 0) + 1;
    }
  }

  // Transaction metro set
  const txMetros = new Set<string>();
  if (txData) {
    for (const tx of txData.transactions) {
      if (tx.sender_metro) txMetros.add(tx.sender_metro);
      if (tx.receiver_metro) txMetros.add(tx.receiver_metro);
    }
  }

  // Shared metros
  const sharedMetros = [...txMetros].filter((m) => candidateMetroCounts[m]);

  return (
    <div className="report-section">
      <h2 className="report-section-title">Geographic Context</h2>

      <div className="report-grid-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
            Complaint Origin
          </h3>
          <p className="text-sm font-medium text-gray-900">
            {data.case.origin_metro}
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
            Transaction Metros Observed
          </h3>
          <p className="text-sm text-gray-600">
            {txMetros.size > 0
              ? [...txMetros].join(", ")
              : "No transaction metro data"}
          </p>
        </div>
      </div>

      {Object.keys(candidateMetroCounts).length > 0 && (
        <div className="mb-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
            Candidate Metro Distribution
          </h3>
          <div className="space-y-1">
            {Object.entries(candidateMetroCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([metro, count]) => (
                <div key={metro} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700 w-32 shrink-0">
                    {metro}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-sentinel-400"
                      style={{
                        width: `${(count / data.ranked_candidates.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-gray-500 shrink-0">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {sharedMetros.length > 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
          <h3 className="text-xs font-semibold text-emerald-700 mb-1 uppercase tracking-wide">
            Shared Geographic Context
          </h3>
          <p className="text-xs text-emerald-600">
            Overlapping metros between transaction trail and candidate
            locations: {sharedMetros.join(", ")}.
          </p>
          <p className="text-[10px] text-emerald-500 mt-1 italic">
            Shared metros provide geographic context. This does not imply
            transactions occurred at specific candidate locations.
          </p>
        </div>
      )}
    </div>
  );
}

function RankedCandidatesSection({
  candidates,
}: {
  candidates: RankedCandidate[];
}) {
  return (
    <div className="report-section">
      <h2 className="report-section-title">Forward-Looking Candidate Priorities</h2>
      <p className="text-xs text-gray-500 mb-3 italic">
        Ranked by evidence-based priority score. These are forward-looking
        investigator review priorities, not guaranteed predictions.
      </p>

      <div className="space-y-3">
        {candidates.map((c, i) => {
          const priority = getPriorityLabel(c.risk_score);
          const isFirst = i === 0;

          return (
            <div
              key={c.location_id}
              className={`report-candidate ${isFirst ? "report-candidate-first" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isFirst
                        ? "bg-sentinel-600 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {c.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {c.location_id}
                      </span>
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${priority.color} ${priority.bg} ${priority.border}`}
                      >
                        {priority.label}
                      </span>
                    </div>
                    {c.location && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        {c.location.location_type} — {c.location.region},{" "}
                        {c.location.metro}
                      </p>
                    )}
                    {c.location && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {c.location.latitude.toFixed(4)},{" "}
                        {c.location.longitude.toFixed(4)} — Density:{" "}
                        {c.location.density_score.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-gray-900">
                    {c.risk_score.toFixed(3)}
                  </div>
                  <div className="text-[10px] uppercase text-gray-400">
                    Priority Score
                  </div>
                </div>
              </div>

              <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
                <p className="text-xs text-gray-700 leading-relaxed">
                  {c.explanation}
                </p>
              </div>

              {c.group_scores && Object.keys(c.group_scores).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-medium uppercase text-gray-400 mb-1">
                    Feature Group Contribution
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(c.group_scores).map(([group, score]) => {
                      const meta = GROUP_META[group] ?? { label: group };
                      return (
                        <span key={group} className="text-[10px] text-gray-500">
                          {meta.label}: {score.toFixed(3)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvestigatorFocusSection({
  data,
  topCandidate,
}: {
  data: RankResponse;
  topCandidate: RankedCandidate | null;
}) {
  return (
    <div className="report-section">
      <h2 className="report-section-title">Forward-Looking Candidate Priorities</h2>
      <p className="text-xs text-gray-500 mb-3 italic">
        Evidence-supported candidate priorities for investigator review. These
        locations should be prioritized based on currently available evidence —
        they are not guaranteed future withdrawal locations.
      </p>

      <ol className="space-y-2">
        {topCandidate && (
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
              1
            </span>
            <span className="text-sm text-gray-700">
              Review the <strong>#1 ranked candidate</strong> at{" "}
              <span className="font-mono text-xs">
                {topCandidate.location_id}
              </span>
              {topCandidate.location && (
                <>
                  {" "}
                  — {topCandidate.location.region},{" "}
                  {topCandidate.location.metro}
                </>
              )}
              . Priority score: {topCandidate.risk_score.toFixed(3)}.
            </span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
            {topCandidate ? "2" : "1"}
          </span>
          <span className="text-sm text-gray-700">
            Review the <strong>observed transaction trail</strong> —{" "}
            {data.case.num_transactions} transactions across{" "}
            {data.case.num_accounts_involved} accounts.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
            {topCandidate ? "3" : "2"}
          </span>
          <span className="text-sm text-gray-700">
            Review the <strong>geographic relationship</strong> between
            transaction metros and ranked candidate locations for spatial
            context.
          </span>
        </li>
      </ol>

      <p className="mt-3 text-[10px] text-gray-400 italic">
        These are workflow suggestions for investigator review, not automated
        actions.
      </p>
    </div>
  );
}

function DisclaimerSection() {
  return (
    <div className="report-section report-disclaimer">
      <h2 className="report-section-title">Disclaimer</h2>
      <p className="text-xs text-gray-600 leading-relaxed">
        SENTINEL provides evidence-based decision support for investigators.
        Ranked locations represent candidate priorities derived from available
        synthetic evidence and do not constitute guaranteed predictions or
        autonomous law-enforcement decisions. All data in this report is
        synthetic — for demonstration and evaluation purposes.
      </p>
      <p className="text-[10px] text-gray-400 mt-2">
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

  const topCandidate =
    data && data.ranked_candidates.length > 0
      ? data.ranked_candidates[0]
      : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="h-20 skeleton" />
            <div className="h-40 skeleton" />
            <div className="h-60 skeleton" />
            <div className="h-40 skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-semibold text-red-800">
              Report Generation Failed
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
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
            <h2 className="text-lg font-semibold text-gray-800">
              No Data Available
            </h2>
            <p className="mt-2 text-sm text-gray-600">
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
          <Link
            href={`/investigations/${caseId}`}
            className="text-sm font-medium text-sentinel-600 hover:text-sentinel-700"
          >
            Back to Investigation
          </Link>
          <button
            onClick={handlePrint}
            className="rounded-md bg-sentinel-600 px-4 py-2 text-sm font-medium text-white hover:bg-sentinel-700 transition-colors"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Report content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 print:px-0 print:py-0">
        <ReportHeader caseId={caseId} />
        <CaseOverviewSection data={data} />
        <TransactionEvidenceSection txData={txData} txLoading={txLoading} />
        <EvidenceSignalsSection data={data} />
        <GeographicContextSection data={data} txData={txData} />
        <RankedCandidatesSection candidates={data.ranked_candidates} />
        <InvestigatorFocusSection data={data} topCandidate={topCandidate} />
        <DisclaimerSection />
      </div>
    </div>
  );
}
