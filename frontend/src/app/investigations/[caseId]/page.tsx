"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { SentinelMapWrapper } from "@/components/SentinelMapWrapper";

function getPriorityLabel(score: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (score >= 0.7)
    return {
      label: "HIGH PRIORITY",
      color: "text-red-700",
      bg: "bg-red-100 border-red-200",
    };
  if (score >= 0.4)
    return {
      label: "MEDIUM PRIORITY",
      color: "text-amber-700",
      bg: "bg-amber-100 border-amber-200",
    };
  return {
    label: "LOW PRIORITY",
    color: "text-green-700",
    bg: "bg-green-100 border-green-200",
  };
}

function RiskBar({ score }: { score: number }) {
  const width = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "bg-red-500"
      : score >= 0.4
        ? "bg-yellow-500"
        : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{score.toFixed(3)}</span>
    </div>
  );
}

const GROUP_META: Record<string, { label: string; color: string }> = {
  geographic: { label: "Geographic", color: "bg-blue-500" },
  transaction: { label: "Transaction", color: "bg-emerald-500" },
  location: { label: "Location", color: "bg-amber-500" },
  temporal: { label: "Temporal", color: "bg-purple-500" },
  case: { label: "Case", color: "bg-gray-500" },
};

const SCENARIO_BADGES: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
};

function GroupScores({
  groupScores,
}: {
  groupScores: Record<string, number>;
}) {
  const entries = Object.entries(groupScores);
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
        Feature Group Contribution
      </p>
      <div className="space-y-1.5">
        {entries.map(([group, score]) => {
          const meta = GROUP_META[group] ?? {
            label: group,
            color: "bg-gray-400",
          };
          const pct = Math.round(score * 100);
          return (
            <div key={group} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-gray-600">
                {meta.label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full ${meta.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-medium text-gray-500">
                {score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionGeography({
  txData,
}: {
  txData: CaseTransactionsResponse | null;
}) {
  if (!txData || txData.transactions.length === 0) return null;

  const { transactions } = txData;

  // Aggregate by metro: count transactions and sum amounts
  const metroStats: Record<
    string,
    { count: number; totalAmount: number; asSender: number; asReceiver: number }
  > = {};

  for (const tx of transactions) {
    if (tx.sender_metro) {
      if (!metroStats[tx.sender_metro]) {
        metroStats[tx.sender_metro] = { count: 0, totalAmount: 0, asSender: 0, asReceiver: 0 };
      }
      metroStats[tx.sender_metro].count += 1;
      metroStats[tx.sender_metro].totalAmount += tx.amount;
      metroStats[tx.sender_metro].asSender += 1;
    }
    if (tx.receiver_metro && tx.receiver_metro !== tx.sender_metro) {
      if (!metroStats[tx.receiver_metro]) {
        metroStats[tx.receiver_metro] = { count: 0, totalAmount: 0, asSender: 0, asReceiver: 0 };
      }
      metroStats[tx.receiver_metro].count += 1;
      metroStats[tx.receiver_metro].totalAmount += tx.amount;
      metroStats[tx.receiver_metro].asReceiver += 1;
    }
  }

  const sortedMetros = Object.entries(metroStats).sort((a, b) => b[1].count - a[1].count);
  const maxCount = sortedMetros.length > 0 ? sortedMetros[0][1].count : 1;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Transaction Geographic Summary
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        Metro areas observed in the transaction trail
      </p>

      <div className="space-y-2">
        {sortedMetros.map(([metro, stats]) => {
          const pct = Math.round((stats.count / maxCount) * 100);
          return (
            <div key={metro}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {metro}
                </span>
                <span className="text-[10px] text-gray-400">
                  {stats.asSender > 0 && stats.asReceiver > 0
                    ? `${stats.asSender} sent · ${stats.asReceiver} received`
                    : stats.asSender > 0
                      ? `${stats.asSender} sent`
                      : `${stats.asReceiver} received`}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[10px] font-mono text-gray-500">
                  {formatINR(stats.totalAmount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        Transaction amounts are observed transfers, not confirmed cash withdrawals.
      </p>
    </div>
  );
}

function SharedGeoContext({
  txData,
  candidates,
}: {
  txData: CaseTransactionsResponse | null;
  candidates: RankedCandidate[];
}) {
  if (!txData || txData.transactions.length === 0 || candidates.length === 0)
    return null;

  // Collect unique transaction metros
  const txMetros = new Set<string>();
  for (const tx of txData.transactions) {
    if (tx.sender_metro) txMetros.add(tx.sender_metro);
    if (tx.receiver_metro) txMetros.add(tx.receiver_metro);
  }

  // Count candidates per metro
  const candidateMetroCounts: Record<string, number> = {};
  for (const c of candidates) {
    if (c.location) {
      candidateMetroCounts[c.location.metro] =
        (candidateMetroCounts[c.location.metro] || 0) + 1;
    }
  }

  // Find shared metros
  const sharedMetros = [...txMetros]
    .filter((m) => candidateMetroCounts[m])
    .sort((a, b) => (candidateMetroCounts[b] || 0) - (candidateMetroCounts[a] || 0));

  // Find metros only in transactions (not in candidates)
  const txOnlyMetros = [...txMetros].filter((m) => !candidateMetroCounts[m]);

  // Find metros only in candidates (not in transactions)
  const candidateOnlyMetros = Object.keys(candidateMetroCounts)
    .filter((m) => !txMetros.has(m))
    .sort((a, b) => (candidateMetroCounts[b] || 0) - (candidateMetroCounts[a] || 0));

  if (sharedMetros.length === 0 && txOnlyMetros.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Shared Geographic Context
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        Overlap between transaction geography and ranked candidate locations
      </p>

      {sharedMetros.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600">
            Metros in Both
          </p>
          <div className="space-y-1.5">
            {sharedMetros.map((metro) => (
              <div
                key={metro}
                className="flex items-center justify-between rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-gray-700">
                    {metro}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span>
                    {candidateMetroCounts[metro]} candidate
                    {candidateMetroCounts[metro] !== 1 ? "s" : ""}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>in transaction trail</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {txOnlyMetros.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Transaction-Only Metros
          </p>
          <div className="flex flex-wrap gap-1.5">
            {txOnlyMetros.map((metro) => (
              <span
                key={metro}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                {metro}
              </span>
            ))}
          </div>
        </div>
      )}

      {candidateOnlyMetros.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Candidate-Only Metros
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidateOnlyMetros.map((metro) => (
              <span
                key={metro}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sentinel-400" />
                {metro} ({candidateMetroCounts[metro]})
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-gray-400">
        Shared metros provide geographic context. This does not imply that
        transactions occurred at specific candidate locations.
      </p>
    </div>
  );
}

function CandidateCard({
  candidate,
  isHighlighted,
  onHighlight,
  isFirst,
  txMetros,
}: {
  candidate: RankedCandidate;
  isHighlighted: boolean;
  onHighlight: (id: string) => void;
  isFirst: boolean;
  txMetros?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const priority = getPriorityLabel(candidate.risk_score);
  const hasGeoMatch =
    isFirst && txMetros && candidate.location && txMetros.has(candidate.location.metro);

  return (
    <div
      className={`card cursor-pointer transition-all ${
        isFirst
          ? "border-2 border-sentinel-300 bg-sentinel-50/50 shadow-md"
          : "border border-gray-200"
      } ${isHighlighted ? "!border-sentinel-500 ring-2 ring-sentinel-200" : ""}`}
      onClick={() => onHighlight(candidate.location_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onHighlight(candidate.location_id);
        }
      }}
      aria-label={`Candidate ${candidate.rank}: ${candidate.location_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              isFirst
                ? "bg-sentinel-600 text-white"
                : "bg-sentinel-100 text-sentinel-700"
            }`}
          >
            {candidate.rank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm font-medium text-gray-900">
                {candidate.location_id}
              </p>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${priority.bg} ${priority.color}`}
              >
                {priority.label}
              </span>
              {hasGeoMatch && (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  GEO CONTEXT
                </span>
              )}
            </div>
            {candidate.location && (
              <p className="mt-0.5 text-xs text-gray-500">
                {candidate.location.region}, {candidate.location.metro} —{" "}
                {candidate.location.location_type}
              </p>
            )}
          </div>
        </div>
        <RiskBar score={candidate.risk_score} />
      </div>

      <div className="mt-3">
        {candidate.model_used === "random_forest" && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Supporting Evidence Signals
          </p>
        )}
        <p className="text-sm leading-relaxed text-gray-600">
          {candidate.explanation}
        </p>
      </div>

      {candidate.group_scores && (
        <div className="mt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-xs font-medium text-sentinel-600 hover:text-sentinel-800"
            aria-expanded={expanded}
          >
            {expanded ? "Hide" : "Show"} group breakdown
          </button>
          {expanded && <GroupScores groupScores={candidate.group_scores} />}
        </div>
      )}

      {candidate.location && (
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
          <span>
            {candidate.location.latitude.toFixed(4)},{" "}
            {candidate.location.longitude.toFixed(4)}
          </span>
          <span>·</span>
          <span>
            Density: {candidate.location.density_score.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function EvidenceSignalStrength({
  candidates,
  modelUsed,
}: {
  candidates: RankedCandidate[];
  modelUsed: string;
}) {
  if (candidates.length === 0) return null;

  const topCandidate = candidates[0];
  const hasGroupScores =
    modelUsed === "weighted_baseline" && topCandidate.group_scores;

  const groupEntries = hasGroupScores
    ? Object.entries(topCandidate.group_scores!).sort(
        (a, b) => b[1] - a[1]
      )
    : [];

  const maxScore = groupEntries.length > 0 ? groupEntries[0][1] : 1;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Evidence Signal Strength
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        How strongly each evidence category contributed to the #1 ranked
        candidate&apos;s priority score
      </p>

      {hasGroupScores ? (
        <div className="space-y-2.5">
          {groupEntries.map(([group, score]) => {
            const meta = GROUP_META[group] ?? {
              label: group,
              color: "bg-gray-400",
            };
            const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
            return (
              <div key={group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-gray-700">
                  {meta.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${meta.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-mono text-gray-500">
                  {score.toFixed(3)}
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-[10px] text-gray-400">
            Based on the #1 ranked candidate. Weighted Baseline model provides
            per-group breakdowns.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            {modelUsed === "random_forest"
              ? "The Random Forest model does not expose per-group score breakdowns. Evidence signals are shown per-candidate in the ranked list below."
              : "No group score data available for the top candidate."}
          </p>
        </div>
      )}
    </div>
  );
}

function GeographicEvidence({
  caseInfo,
  candidates,
}: {
  caseInfo: { origin_metro: string; origin_latitude: number | null; origin_longitude: number | null };
  candidates: RankedCandidate[];
}) {
  const metroDistribution: Record<string, number> = {};
  const regionDistribution: Record<string, number> = {};
  const typeDistribution: Record<string, number> = {};

  for (const c of candidates) {
    if (c.location) {
      metroDistribution[c.location.metro] =
        (metroDistribution[c.location.metro] || 0) + 1;
      regionDistribution[c.location.region] =
        (regionDistribution[c.location.region] || 0) + 1;
      typeDistribution[c.location.location_type] =
        (typeDistribution[c.location.location_type] || 0) + 1;
    }
  }

  const sortedMetros = Object.entries(metroDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const sortedTypes = Object.entries(typeDistribution).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Geographic Evidence
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        Geographic distribution of ranked candidate locations relative to the
        complaint origin
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Complaint Origin
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-800" />
            <span className="text-sm font-medium text-gray-900">
              {caseInfo.origin_metro}
            </span>
          </div>
          {caseInfo.origin_latitude != null &&
            caseInfo.origin_longitude != null && (
              <p className="mt-0.5 pl-[18px] text-[10px] text-gray-400">
                {caseInfo.origin_latitude.toFixed(4)},{" "}
                {caseInfo.origin_longitude.toFixed(4)}
              </p>
            )}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Candidate Location Types
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedTypes.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600"
              >
                {type.replace(/_/g, " ")}
                <span className="text-gray-400">({count})</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {sortedMetros.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Candidate Metro Distribution
          </p>
          <div className="space-y-1">
            {sortedMetros.map(([metro, count]) => {
              const pct = Math.round(
                (count / candidates.length) * 100
              );
              return (
                <div key={metro} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-gray-600">
                    {metro}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-sentinel-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] font-mono text-gray-500">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ACCOUNT_ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  VICTIM: { label: "VICTIM", color: "text-blue-700", bg: "bg-blue-100 border-blue-200" },
  MULE: { label: "MULE", color: "text-red-700", bg: "bg-red-100 border-red-200" },
  CASH_OUT: { label: "CASH OUT", color: "text-orange-700", bg: "bg-orange-100 border-orange-200" },
  INTERMEDIATE: { label: "INTERMEDIATE", color: "text-purple-700", bg: "bg-purple-100 border-purple-200" },
  UNKNOWN: { label: "UNKNOWN", color: "text-gray-600", bg: "bg-gray-100 border-gray-200" },
};

const TX_TYPE_META: Record<string, { label: string; color: string }> = {
  UPI: { label: "UPI", color: "text-violet-600" },
  NEFT: { label: "NEFT", color: "text-blue-600" },
  RTGS: { label: "RTGS", color: "text-emerald-600" },
  IMPS: { label: "IMPS", color: "text-amber-600" },
  WIRE: { label: "WIRE", color: "text-gray-700" },
};

function AccountBadge({ accountId, accounts }: { accountId: string; accounts: AccountInfo[] }) {
  const acct = accounts.find((a) => a.account_id === accountId);
  const role = acct ? (ACCOUNT_ROLE_META[acct.role] ?? ACCOUNT_ROLE_META.UNKNOWN) : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-700">
        {accountId.replace("ACCT_", "").replace(/_/g, "-")}
      </span>
      {role && (
        <span className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${role.bg} ${role.color}`}>
          {role.label}
        </span>
      )}
    </span>
  );
}

function TransactionCard({
  tx,
  accounts,
  isLast,
}: {
  tx: TransactionInfo;
  accounts: AccountInfo[];
  isLast: boolean;
}) {
  const typeMeta = TX_TYPE_META[tx.transaction_type] ?? {
    label: tx.transaction_type,
    color: "text-gray-600",
  };
  const metroFlow =
    tx.sender_metro && tx.receiver_metro
      ? tx.sender_metro === tx.receiver_metro
        ? tx.sender_metro
        : `${tx.sender_metro} → ${tx.receiver_metro}`
      : null;

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-[15px] top-[32px] h-[calc(100%-20px)] w-px bg-gray-200" />
      )}

      {/* Sequence badge */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-[10px] font-bold text-gray-600">
        {tx.sequence_number}
      </div>

      {/* Transaction content */}
      <div className="min-w-0 flex-1 rounded-md border border-gray-100 bg-gray-50 p-2.5">
        {/* Amount and type */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {formatINR(tx.amount)}
          </span>
          <span className={`text-[10px] font-bold uppercase ${typeMeta.color}`}>
            {typeMeta.label}
          </span>
        </div>

        {/* Account flow */}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <AccountBadge accountId={tx.sender_account_id} accounts={accounts} />
          <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <AccountBadge accountId={tx.receiver_account_id} accounts={accounts} />
        </div>

        {/* Metro flow */}
        {metroFlow && (
          <div className="mt-1.5 flex items-center gap-1">
            <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[11px] text-gray-500">{metroFlow}</span>
          </div>
        )}

        {/* Timestamp */}
        <p className="mt-1 text-[10px] text-gray-400">
          {formatDate(tx.timestamp)}
        </p>
      </div>
    </div>
  );
}

function TransactionEvidence({
  txData,
  txLoading,
  txError,
}: {
  txData: CaseTransactionsResponse | null;
  txLoading: boolean;
  txError: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_COUNT = 5;

  if (txLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Observed Transaction Evidence
        </h3>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 skeleton rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 skeleton" />
                <div className="h-3 w-48 skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (txError) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Observed Transaction Evidence
        </h3>
        <p className="text-xs text-gray-500">
          Transaction evidence unavailable: {txError}
        </p>
      </div>
    );
  }

  if (!txData || txData.transactions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Observed Transaction Evidence
        </h3>
        <p className="text-xs text-gray-500">
          No transaction records available for this case.
        </p>
      </div>
    );
  }

  const { transactions, accounts } = txData;
  const displayTxs = expanded ? transactions : transactions.slice(0, INITIAL_COUNT);
  const hasMore = transactions.length > INITIAL_COUNT;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Observed Transaction Evidence
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} in chain ·{" "}
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {Object.entries(
            transactions.reduce<Record<string, number>>((acc, tx) => {
              acc[tx.transaction_type] = (acc[tx.transaction_type] || 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <span
              key={type}
              className={`rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9px] font-medium ${TX_TYPE_META[type]?.color ?? "text-gray-600"}`}
            >
              {type} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* Transaction chain */}
      <div className="space-y-0">
        {displayTxs.map((tx, i) => (
          <TransactionCard
            key={tx.transaction_id}
            tx={tx}
            accounts={accounts}
            isLast={i === displayTxs.length - 1}
          />
        ))}
      </div>

      {/* Show more/less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          {expanded
            ? "Show fewer transactions"
            : `Show all ${transactions.length} transactions`}
        </button>
      )}

      <p className="mt-3 text-[10px] text-gray-400">
        Transaction geography provides context for the candidate-location
        ranking. Transactions do not directly determine ATM locations.
      </p>
    </div>
  );
}

function EvidenceFlow({
  modelUsed,
}: {
  modelUsed: string;
}) {
  const steps = [
    { label: "Case Evidence", icon: "01" },
    { label: "Transaction Trail", icon: "02" },
    { label: "Feature Analysis", icon: "03" },
    { label: "Ranked Output", icon: "04" },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sentinel-100 text-[10px] font-bold text-sentinel-700">
                {step.icon}
              </span>
              <span className="text-xs font-medium text-gray-700">
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <svg
                className="mx-2 h-4 w-4 shrink-0 text-gray-300 lg:mx-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-400">
        {modelUsed === "random_forest"
          ? "Random Forest: 47 features analyzed per candidate location"
          : "Weighted Baseline: 5 evidence groups scored per candidate location"}
      </p>
    </div>
  );
}

interface ComparisonRow {
  rank: number;
  locationId: string;
  locationType: string;
  metro: string;
  region: string;
  wbScore: number;
  rfScore: number;
  rankChange: number;
}

function ModelComparisonTable({
  wbData,
  rfData,
}: {
  wbData: RankResponse;
  rfData: RankResponse;
}) {
  const comparison = useMemo(() => {
    const wbMap = new Map(
      wbData.ranked_candidates.map((c) => [c.location_id, c])
    );
    const rfMap = new Map(
      rfData.ranked_candidates.map((c) => [c.location_id, c])
    );

    const allIds = new Set([...wbMap.keys(), ...rfMap.keys()]);
    const rows: ComparisonRow[] = [];

    for (const id of allIds) {
      const wb = wbMap.get(id);
      const rf = rfMap.get(id);
      if (!wb && !rf) continue;

      const wbRank = wb?.rank ?? 999;
      const rfRank = rf?.rank ?? 999;
      const wbScore = wb?.risk_score ?? 0;
      const rfScore = rf?.risk_score ?? 0;
      const loc = wb?.location || rf?.location;

      rows.push({
        rank: Math.min(wbRank, rfRank),
        locationId: id,
        locationType: loc?.location_type ?? "Unknown",
        metro: loc?.metro ?? "Unknown",
        region: loc?.region ?? "Unknown",
        wbScore,
        rfScore,
        rankChange: wbRank - rfRank,
      });
    }

    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }, [wbData, rfData]);

  const wbTop1 = wbData.ranked_candidates[0]?.location_id;
  const rfTop1 = rfData.ranked_candidates[0]?.location_id;
  const agreeTop = wbTop1 === rfTop1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-sentinel-500" />
          <span className="text-xs text-gray-600">
            Weighted Baseline #1: <span className="font-mono font-semibold">{wbTop1 || "—"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
          <span className="text-xs text-gray-600">
            Random Forest #1: <span className="font-mono font-semibold">{rfTop1 || "—"}</span>
          </span>
        </div>
      </div>

      <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-2.5">
        <p className="text-xs text-gray-600">
          {agreeTop ? (
            <>
              <span className="font-medium text-sentinel-700">Models agree</span> on the
              highest-ranked candidate ({wbTop1}). Both models identify the same
              location as the top priority.
            </>
          ) : (
            <>
              <span className="font-medium text-amber-700">Models differ</span> on the
              highest-ranked candidate. Weighted Baseline: {wbTop1 || "—"}. Random
              Forest: {rfTop1 || "—"}. Review the evidence signals before
              prioritizing.
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-2 pr-3 text-left font-medium text-gray-500">Rank</th>
              <th className="pb-2 pr-3 text-left font-medium text-gray-500">Location</th>
              <th className="pb-2 pr-3 text-left font-medium text-gray-500">Type</th>
              <th className="pb-2 pr-3 text-right font-medium text-gray-500">Baseline</th>
              <th className="pb-2 pr-3 text-right font-medium text-gray-500">RF</th>
              <th className="pb-2 text-right font-medium text-gray-500">Rank Change</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr
                key={row.locationId}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 pr-3 font-mono font-semibold text-gray-900">
                  #{row.rank}
                </td>
                <td className="py-2 pr-3">
                  <span className="font-mono font-semibold text-gray-900">
                    {row.locationId}
                  </span>
                  <span className="ml-1 text-gray-400">
                    {row.metro}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-600">{row.locationType}</td>
                <td className="py-2 pr-3 text-right font-mono text-sentinel-700">
                  {row.wbScore.toFixed(3)}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-purple-700">
                  {row.rfScore.toFixed(3)}
                </td>
                <td className="py-2 text-right">
                  {row.rankChange === 0 ? (
                    <span className="text-gray-400">0</span>
                  ) : row.rankChange > 0 ? (
                    <span className="font-medium text-green-600">
                      +{row.rankChange}
                    </span>
                  ) : (
                    <span className="font-medium text-red-600">
                      {row.rankChange}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        Rank change shows Weighted Baseline rank minus Random Forest rank. Positive
        means the candidate ranks higher in Random Forest. This comparison is
        descriptive, not a claim that either model is more accurate.
      </p>
    </div>
  );
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"weighted_baseline" | "random_forest">(
    "weighted_baseline"
  );
  const [topK, setTopK] = useState<number>(10);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [lastRankedModel, setLastRankedModel] = useState<
    "weighted_baseline" | "random_forest"
  >("weighted_baseline");
  const [lastRankedTopK, setLastRankedTopK] = useState<number>(10);

  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  // Model comparison
  const [compareMode, setCompareMode] = useState(false);
  const [compareData, setCompareData] = useState<{
    weighted_baseline: RankResponse | null;
    random_forest: RankResponse | null;
  }>({ weighted_baseline: null, random_forest: null });
  const [compareLoading, setCompareLoading] = useState(false);

  const paramsChanged =
    model !== lastRankedModel || topK !== lastRankedTopK;

  const txMetros = useMemo(() => {
    if (!txData) return undefined;
    return new Set(
      txData.transactions.flatMap((tx) => [tx.sender_metro, tx.receiver_metro]).filter(Boolean)
    );
  }, [txData]);

  const loadRanking = () => {
    setLoading(true);
    setError(null);
    setHighlightedId(null);
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
  };

  const loadTransactions = useCallback(() => {
    setTxLoading(true);
    setTxError(null);
    api
      .getTransactions(caseId)
      .then(setTxData)
      .catch((err) => setTxError(err.message))
      .finally(() => setTxLoading(false));
  }, [caseId]);

  const loadComparison = useCallback(() => {
    setCompareLoading(true);
    const effectiveTopK = Math.max(1, topK);
    Promise.allSettled([
      api.rankCandidates(caseId, { model: "weighted_baseline", top_k: effectiveTopK }),
      api.rankCandidates(caseId, { model: "random_forest", top_k: effectiveTopK }),
    ]).then(([wbResult, rfResult]) => {
      setCompareData({
        weighted_baseline:
          wbResult.status === "fulfilled" ? wbResult.value : null,
        random_forest:
          rfResult.status === "fulfilled" ? rfResult.value : null,
      });
      setCompareLoading(false);
    });
  }, [caseId, topK]);

  useEffect(() => {
    loadRanking();
    loadTransactions();
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const topCandidate = data && data.ranked_candidates.length > 0
    ? data.ranked_candidates[0]
    : null;
  const topPriority = topCandidate ? getPriorityLabel(topCandidate.risk_score) : null;

  return (
    <div className="space-y-5">

      {/* === 1. INVESTIGATION HEADER === */}
      <div className="rounded-lg border border-sentinel-200 bg-gradient-to-br from-sentinel-50 to-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sentinel-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-700">
                SENTINEL Investigation
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Synthetic Demo
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{caseId}</h2>
            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge text-[10px] ${SCENARIO_BADGES[data.case.fraud_scenario] || "badge-gray"}`}>
                  {data.case.fraud_scenario.replace(/_/g, " ")}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatINR(data.case.reported_amount)}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-600">
                  {data.case.origin_metro}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">
                  {formatDate(data.case.complaint_time)}
                </span>
              </div>
            )}
          </div>
          <Link href="/investigations" className="btn-secondary shrink-0">
            Back to Investigations
          </Link>
        </div>
      </div>

      {/* === 2. AT A GLANCE === */}
      {data && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            At a Glance
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-gray-400">Scenario</p>
              <p className="text-sm font-medium text-gray-900">
                {data.case.fraud_scenario.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Complaint Amount</p>
              <p className="text-sm font-medium text-gray-900">
                {formatINR(data.case.reported_amount)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Filed</p>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(data.case.complaint_time)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Origin Metro</p>
              <p className="text-sm font-medium text-gray-900">
                {data.case.origin_metro}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Accounts</p>
              <p className="text-sm font-medium text-gray-900">
                {data.case.num_accounts_involved}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Transactions</p>
              <p className="text-sm font-medium text-gray-900">
                {data.case.num_transactions}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Candidate Locations</p>
              <p className="text-sm font-medium text-gray-900">
                {data.case.num_candidates}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Ranking Model</p>
              <p className="text-sm font-medium text-gray-900">
                {data.model_used === "random_forest" ? "Random Forest" : "Weighted Baseline"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton for header area */}
      {loading && !data && (
        <div className="space-y-4">
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
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {/* === 3. #1 PRIORITY RESULT (Above the fold) === */}
      {data && topCandidate && (
        <div className="rounded-lg border-2 border-sentinel-300 bg-sentinel-50/50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-sentinel-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Highest Priority
            </span>
            {topPriority && (
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${topPriority.bg} ${topPriority.color}`}>
                {topPriority.label}
              </span>
            )}
            {txMetros && topCandidate.location && txMetros.has(topCandidate.location.metro) && (
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
                <p className="font-mono text-lg font-bold text-gray-900">
                  {topCandidate.location_id}
                </p>
                {topCandidate.location && (
                  <p className="text-sm text-gray-600">
                    {topCandidate.location.location_type} — {topCandidate.location.region},{" "}
                    {topCandidate.location.metro}
                  </p>
                )}
                {topCandidate.location && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {topCandidate.location.latitude.toFixed(4)}, {topCandidate.location.longitude.toFixed(4)} ·
                    Density: {topCandidate.location.density_score.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">
                {topCandidate.risk_score.toFixed(3)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Priority Score
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              {topCandidate.model_used === "random_forest"
                ? "Supporting Evidence Signals"
                : "Evidence Assessment"}
            </p>
            <p className="text-sm leading-relaxed text-gray-700">
              {topCandidate.explanation}
            </p>
          </div>

          {topCandidate.group_scores && (
            <div className="mt-3">
              <GroupScores groupScores={topCandidate.group_scores} />
            </div>
          )}
        </div>
      )}

      {/* === 4. EVIDENCE PIPELINE === */}
      {data && <EvidenceFlow modelUsed={data.model_used} />}

      {/* === 5. AVAILABLE EVIDENCE === */}
      {data && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Available Evidence
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-100">
                <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Accounts</p>
                <p className="text-sm font-medium text-gray-900">{data.case.num_accounts_involved}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-100">
                <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Transactions</p>
                <p className="text-sm font-medium text-gray-900">{data.case.num_transactions}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-purple-100">
                <svg className="h-3.5 w-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Locations</p>
                <p className="text-sm font-medium text-gray-900">{data.case.num_candidates}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-amber-100">
                <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Model</p>
                <p className="text-sm font-medium text-gray-900">
                  {data.model_used === "random_forest" ? "Random Forest" : "Weighted Baseline"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 6. OBSERVED TRANSACTION EVIDENCE === */}
      <TransactionEvidence txData={txData} txLoading={txLoading} txError={txError} />

      {/* === 7. GEOGRAPHIC CONTEXT === */}
      {txData && txData.transactions.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TransactionGeography txData={txData} />
          {data && (
            <SharedGeoContext txData={txData} candidates={data.ranked_candidates} />
          )}
        </div>
      )}

      {/* === 8. EVIDENCE SIGNALS + GEOGRAPHIC EVIDENCE === */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EvidenceSignalStrength
            candidates={data.ranked_candidates}
            modelUsed={data.model_used}
          />
          <GeographicEvidence
            caseInfo={data.case}
            candidates={data.ranked_candidates}
          />
        </div>
      )}

      {/* === 9. MAP + RANKED CANDIDATES === */}
      {data && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <label className="block text-xs font-medium text-gray-500">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as "weighted_baseline" | "random_forest")}
                className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                <option value="weighted_baseline">Weighted Baseline</option>
                <option value="random_forest">Random Forest</option>
              </select>
              <p className="mt-1 max-w-[220px] text-[10px] leading-tight text-gray-400">
                {model === "weighted_baseline"
                  ? "Transparent weighted scoring across five evidence groups."
                  : "Trained ensemble model with differentiated probability scores."}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500">Top K</label>
              <input
                type="number"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                min={1}
                max={100}
                className="mt-1 w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <button onClick={loadRanking} className="btn-primary relative">
              Re-rank
              {paramsChanged && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" />
              )}
            </button>
            <div className="ml-auto text-xs text-gray-400">
              {data.ranked_candidates.length} of {data.total_candidates} candidates shown
            </div>
          </div>

          {/* Map + Candidates */}
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 lg:w-[60%]">
              <div className="rounded-lg border border-gray-200 bg-white p-2">
                <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Candidate Location Map
                </p>
                <SentinelMapWrapper
                  caseInfo={data.case}
                  candidates={data.ranked_candidates}
                  highlightedId={highlightedId}
                />
                <p className="mt-2 px-2 text-[11px] text-gray-400">
                  Ranked candidate locations are evidence-based priorities, not
                  guaranteed predictions. All data is synthetic.
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col lg:w-[40%]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Ranked Candidate Locations
                </h3>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
                {data.ranked_candidates.map((c, i) => (
                  <CandidateCard
                    key={c.location_id}
                    candidate={c}
                    isHighlighted={highlightedId === c.location_id}
                    onHighlight={setHighlightedId}
                    isFirst={i === 0}
                    txMetros={txMetros}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* === 9B. MODEL COMPARISON === */}
      {data && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Model Comparison
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Compare rankings from both models side by side.
              </p>
            </div>
            <button
              onClick={() => {
                if (!compareMode) {
                  loadComparison();
                }
                setCompareMode(!compareMode);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                compareMode
                  ? "bg-sentinel-100 text-sentinel-700"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {compareMode ? "Hide Comparison" : "Compare Models"}
            </button>
          </div>

          {compareMode && (
            <div className="mt-4">
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
                <p className="text-xs text-gray-500">
                  Could not load comparison data. Ensure the backend is running.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* === 10. INVESTIGATOR FOCUS === */}
      {data && topCandidate && (
        <div className="rounded-lg border border-sentinel-200 bg-sentinel-50 p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-sentinel-600">
            Investigator Focus
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            Suggested review priorities based on the available evidence and ranked candidates.
          </p>
          <ol className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
                1
              </span>
              <span>
                Review the <strong>#1 ranked candidate</strong> at{" "}
                <span className="font-mono text-xs">{topCandidate.location_id}</span>
                {topCandidate.location && (
                  <> — {topCandidate.location.region}, {topCandidate.location.metro}</>
                )}
                . Priority score: {topCandidate.risk_score.toFixed(3)}.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
                2
              </span>
              <span>
                Review the <strong>observed transaction trail</strong> — {data.case.num_transactions} transactions
                across {data.case.num_accounts_involved} accounts.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sentinel-600 text-[10px] font-bold text-white">
                3
              </span>
              <span>
                Review the <strong>geographic relationship</strong> between
                transaction metros and ranked candidate locations for spatial
                context.
              </span>
            </li>
          </ol>
          <p className="mt-3 text-[10px] text-gray-400">
            These are workflow suggestions for investigator review, not
            automated actions.
          </p>
        </div>
      )}

      {/* === 11. DISCLAIMER === */}
      {data && (
        <div className="card border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-800">{data.disclaimer}</p>
        </div>
      )}

      {/* === 12. BOTTOM ACTIONS === */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
        <Link href="/investigations" className="btn-secondary">
          Back to Investigations
        </Link>
        <Link
          href={`/investigations/${caseId}/report`}
          className="rounded-md bg-sentinel-600 px-4 py-2 text-sm font-medium text-white hover:bg-sentinel-700 transition-colors"
        >
          Generate Intelligence Report
        </Link>
        <Link href="/investigations/new" className="btn-secondary">
          New Investigation
        </Link>
        <Link href="/health" className="btn-secondary">
          System Status
        </Link>
      </div>
    </div>
  );
}
