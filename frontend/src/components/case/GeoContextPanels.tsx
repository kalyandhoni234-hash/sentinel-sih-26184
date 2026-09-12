"use client";

import { formatINR } from "@/lib/format";
import { GROUP_LABELS, GROUP_BAR_COLORS } from "@/lib/labels";
import type {
  CaseTransactionsResponse,
  RankedCandidate,
} from "@/types/api";

/**
 * Geographic/evidence context panels extracted from the former case
 * mega-page. Aggregation logic is unchanged — same data, same rendering.
 */

export function TransactionGeography({
  txData,
}: {
  txData: CaseTransactionsResponse | null;
}) {
  if (!txData || txData.transactions.length === 0) return null;

  const { transactions } = txData;

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
    <div className="rounded-lg border border-sentinel-border bg-sentinel-surface p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
        Transaction Geographic Summary
      </h3>
      <p className="mb-3 text-xs text-sentinel-text-muted">
        Metro areas observed in the transaction trail
      </p>

      <div className="space-y-2">
        {sortedMetros.map(([metro, stats]) => {
          const pct = Math.round((stats.count / maxCount) * 100);
          return (
            <div key={metro}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-sentinel-text-secondary">
                  {metro}
                </span>
                <span className="text-[10px] text-sentinel-text-muted">
                  {stats.asSender > 0 && stats.asReceiver > 0
                    ? `${stats.asSender} sent · ${stats.asReceiver} received`
                    : stats.asSender > 0
                      ? `${stats.asSender} sent`
                      : `${stats.asReceiver} received`}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sentinel-surface-alt">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[10px] font-mono text-sentinel-text-muted">
                  {formatINR(stats.totalAmount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-sentinel-text-muted">
        Transaction amounts are observed transfers, not confirmed cash withdrawals.
      </p>
    </div>
  );
}

export function SharedGeoContext({
  txData,
  candidates,
}: {
  txData: CaseTransactionsResponse | null;
  candidates: RankedCandidate[];
}) {
  if (!txData || txData.transactions.length === 0 || candidates.length === 0)
    return null;

  const txMetros = new Set<string>();
  for (const tx of txData.transactions) {
    if (tx.sender_metro) txMetros.add(tx.sender_metro);
    if (tx.receiver_metro) txMetros.add(tx.receiver_metro);
  }

  const candidateMetroCounts: Record<string, number> = {};
  for (const c of candidates) {
    if (c.location) {
      candidateMetroCounts[c.location.metro] =
        (candidateMetroCounts[c.location.metro] || 0) + 1;
    }
  }

  const sharedMetros = [...txMetros]
    .filter((m) => candidateMetroCounts[m])
    .sort((a, b) => (candidateMetroCounts[b] || 0) - (candidateMetroCounts[a] || 0));

  const txOnlyMetros = [...txMetros].filter((m) => !candidateMetroCounts[m]);

  const candidateOnlyMetros = Object.keys(candidateMetroCounts)
    .filter((m) => !txMetros.has(m))
    .sort((a, b) => (candidateMetroCounts[b] || 0) - (candidateMetroCounts[a] || 0));

  if (sharedMetros.length === 0 && txOnlyMetros.length === 0) return null;

  return (
    <div className="rounded-lg border border-sentinel-border bg-sentinel-surface p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
        Shared Geographic Context
      </h3>
      <p className="mb-3 text-xs text-sentinel-text-muted">
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
                  <span className="text-xs font-medium text-sentinel-text-secondary">
                    {metro}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-sentinel-text-muted">
                  <span>
                    {candidateMetroCounts[metro]} candidate
                    {candidateMetroCounts[metro] !== 1 ? "s" : ""}
                  </span>
                  <span className="text-sentinel-text-muted">|</span>
                  <span>in transaction trail</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {txOnlyMetros.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
            Transaction-Only Metros
          </p>
          <div className="flex flex-wrap gap-1.5">
            {txOnlyMetros.map((metro) => (
              <span
                key={metro}
                className="inline-flex items-center gap-1 rounded-full border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 text-[10px] font-medium text-sentinel-text-secondary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sentinel-text-muted" />
                {metro}
              </span>
            ))}
          </div>
        </div>
      )}

      {candidateOnlyMetros.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
            Candidate-Only Metros
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidateOnlyMetros.map((metro) => (
              <span
                key={metro}
                className="inline-flex items-center gap-1 rounded-full border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 text-[10px] font-medium text-sentinel-text-secondary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sentinel-400" />
                {metro} ({candidateMetroCounts[metro]})
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-sentinel-text-muted">
        Shared metros provide geographic context. This does not imply that
        transactions occurred at specific candidate locations.
      </p>
    </div>
  );
}

export function EvidenceSignalStrength({
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
    ? Object.entries(topCandidate.group_scores!).sort((a, b) => b[1] - a[1])
    : [];

  const maxScore = groupEntries.length > 0 ? groupEntries[0][1] : 1;

  return (
    <div className="rounded-lg border border-sentinel-border bg-sentinel-surface p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
        Evidence Signal Strength
      </h3>
      <p className="mb-3 text-xs text-sentinel-text-muted">
        How strongly each evidence category contributed to the #1 ranked
        candidate&apos;s priority score
      </p>

      {hasGroupScores ? (
        <div className="space-y-2.5">
          {groupEntries.map(([group, score]) => {
            const label = GROUP_LABELS[group] ?? group;
            const color = GROUP_BAR_COLORS[group] ?? "bg-sentinel-text-muted";
            const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
            return (
              <div key={group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-sentinel-text-secondary">
                  {label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sentinel-surface-alt">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-mono text-sentinel-text-muted">
                  {score.toFixed(3)}
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-[10px] text-sentinel-text-muted">
            Based on the #1 ranked candidate. Weighted Baseline model provides
            per-group breakdowns.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-3">
          <p className="text-xs text-sentinel-text-secondary">
            {modelUsed === "random_forest"
              ? "The Random Forest model does not expose per-group score breakdowns. Evidence signals are shown per-candidate in the ranked list."
              : "No group score data available for the top candidate."}
          </p>
        </div>
      )}
    </div>
  );
}

export function GeographicEvidence({
  caseInfo,
  candidates,
}: {
  caseInfo: { origin_metro: string; origin_latitude: number | null; origin_longitude: number | null };
  candidates: RankedCandidate[];
}) {
  const metroDistribution: Record<string, number> = {};
  const typeDistribution: Record<string, number> = {};

  for (const c of candidates) {
    if (c.location) {
      metroDistribution[c.location.metro] =
        (metroDistribution[c.location.metro] || 0) + 1;
      typeDistribution[c.location.location_type] =
        (typeDistribution[c.location.location_type] || 0) + 1;
    }
  }

  const sortedMetros = Object.entries(metroDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const sortedTypes = Object.entries(typeDistribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-sentinel-border bg-sentinel-surface p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
        Geographic Evidence
      </h3>
      <p className="mb-3 text-xs text-sentinel-text-muted">
        Geographic distribution of ranked candidate locations relative to the
        complaint origin
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
            Complaint Origin
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-800" />
            <span className="text-sm font-medium text-sentinel-text">
              {caseInfo.origin_metro}
            </span>
          </div>
          {caseInfo.origin_latitude != null &&
            caseInfo.origin_longitude != null && (
              <p className="mt-0.5 pl-[18px] text-[10px] text-sentinel-text-muted">
                {caseInfo.origin_latitude.toFixed(4)},{" "}
                {caseInfo.origin_longitude.toFixed(4)}
              </p>
            )}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
            Candidate Location Types
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedTypes.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 text-[10px] font-medium text-sentinel-text-secondary"
              >
                {type.replace(/_/g, " ")}
                <span className="text-sentinel-text-muted">({count})</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {sortedMetros.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
            Candidate Metro Distribution
          </p>
          <div className="space-y-1">
            {sortedMetros.map(([metro, count]) => {
              const pct = Math.round((count / candidates.length) * 100);
              return (
                <div key={metro} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-sentinel-text-secondary">
                    {metro}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sentinel-surface-alt">
                    <div
                      className="h-full rounded-full bg-sentinel-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] font-mono text-sentinel-text-muted">
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
