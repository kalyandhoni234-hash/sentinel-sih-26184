"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  formatINR,
  formatTime,
  formatDateShort,
  formatTimestampFull,
} from "@/lib/format";
import { ACCOUNT_ROLE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import {
  orderedLedger,
  isAfterAnalysisPoint,
  observedTransactionTypes,
  observedAccountRoles,
} from "@/lib/timeline";
import { useCaseContext } from "../workspace-context";
import type { CaseTransactionsResponse, TransactionInfo } from "@/types/api";

/**
 * Transaction Timeline — the chronological observed-transaction-trail
 * workspace (Phase 7).
 *
 * Data source: GET /investigations/:id/transactions only, ordered by the
 * chain sequence. Every displayed value comes from that response — no
 * fabricated events, amounts, roles, or future observations.
 *
 * Analysis-point boundary: the CaseInfo.analysis_point timestamp is placed
 * between the records available before the boundary and any records
 * timestamped after it (the raw ledger may contain such records). Records
 * after the boundary are shown as observed ledger entries and explicitly
 * marked as beyond the analysis boundary — they are not ranking evidence
 * and no future events are invented.
 *
 * Selection is local to this surface (an expanded transaction detail).
 * It does not touch the shared candidate-selection mechanism used by
 * Candidates/GeoIntel, so no cross-view state can conflict.
 */

type TypeFilter = string; // "ALL" or an observed transaction_type value
type RoleFilter = string; // "ALL_ACCOUNTS" or an observed account role

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "VICTIM"
      ? "evidence-role-victim"
      : role === "MULE"
        ? "evidence-role-mule"
        : role === "CASH_OUT"
          ? "evidence-role-cashout"
          : role === "INTERMEDIATE"
            ? "evidence-role-intermediate"
            : "evidence-role-unknown";
  return (
    <span className={`evidence-role ${cls}`}>
      {ACCOUNT_ROLE_LABELS[role] ?? role}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="evidence-txtype">
      {TRANSACTION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function TimelineEvent({
  tx,
  txData,
  selected,
  onSelect,
  afterBoundary,
  isLastBeforeBoundary,
}: {
  tx: TransactionInfo;
  txData: CaseTransactionsResponse;
  selected: boolean;
  onSelect: () => void;
  afterBoundary: boolean;
  isLastBeforeBoundary: boolean;
}) {
  const sender = txData.accounts.find(
    (a) => a.account_id === tx.sender_account_id
  );
  const receiver = txData.accounts.find(
    (a) => a.account_id === tx.receiver_account_id
  );
  const metroFlow =
    tx.sender_metro && tx.receiver_metro
      ? tx.sender_metro === tx.receiver_metro
        ? tx.sender_metro
        : `${tx.sender_metro} → ${tx.receiver_metro}`
      : null;

  return (
    <li className="relative">
      {/* connector to the next event */}
      {!isLastBeforeBoundary && <div className="timeline-connector" aria-hidden="true" />}

      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        aria-label={`Transaction ${tx.sequence_number}: ${formatINR(tx.amount)}, ${formatTimestampFull(tx.timestamp)}${afterBoundary ? ", after the analysis point" : ""}. Select to inspect details.`}
        className={`timeline-row ${selected ? "timeline-row-selected" : ""}`}
      >
        {/* sequence node — monospace */}
        <span
          className={`timeline-node ${selected ? "timeline-node-selected" : ""} ${afterBoundary ? "timeline-node-after" : ""}`}
          aria-hidden="true"
        >
          {tx.sequence_number}
        </span>

        {/* timestamp column — monospace, desktop */}
        <span className="hidden w-24 shrink-0 sm:block">
          <span className="block font-mono text-xs text-sentinel-text">
            {formatTime(tx.timestamp)}
          </span>
          <span className="block text-[10px] text-sentinel-text-muted">
            {formatDateShort(tx.timestamp)}
          </span>
          {afterBoundary && (
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
              After AP
            </span>
          )}
        </span>

        {/* core record */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-sentinel-text">
              {formatINR(tx.amount)}
            </span>
            <TypeBadge type={tx.transaction_type} />
            <span className="font-mono text-[10px] text-sentinel-text-muted">
              {tx.transaction_id}
            </span>
            {afterBoundary && (
              <span
                className="rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wider text-sentinel-text-muted"
                style={{ borderColor: "var(--border)" }}
              >
                Beyond Analysis Point
              </span>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono text-xs text-sentinel-text">
                {tx.sender_account_id}
              </span>
              {sender && <RoleBadge role={sender.role} />}
            </span>
            <svg
              className="h-3 w-3 shrink-0 text-sentinel-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono text-xs text-sentinel-text">
                {tx.receiver_account_id}
              </span>
              {receiver && <RoleBadge role={receiver.role} />}
            </span>
          </span>
          {metroFlow && (
            <span className="mt-1 block text-[11px] text-sentinel-text-muted">
              Observed transaction geography: {metroFlow}
            </span>
          )}
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-sentinel-text-muted transition-transform ${selected ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {selected && (
        <div
          className="timeline-detail"
          role="region"
          aria-label={`Transaction ${tx.sequence_number} details`}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <DetailKV label="Transaction ID" value={tx.transaction_id} mono />
            <DetailKV label="Timestamp" value={formatTimestampFull(tx.timestamp)} mono />
            <DetailKV label="Amount" value={formatINR(tx.amount)} mono />
            <DetailKV
              label="Type"
              value={TRANSACTION_TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
            />
            <DetailKV
              label="Sender"
              value={
                sender
                  ? `${tx.sender_account_id} (${ACCOUNT_ROLE_LABELS[sender.role] ?? sender.role})`
                  : tx.sender_account_id
              }
              mono
            />
            <DetailKV
              label="Receiver"
              value={
                receiver
                  ? `${tx.receiver_account_id} (${ACCOUNT_ROLE_LABELS[receiver.role] ?? receiver.role})`
                  : tx.receiver_account_id
              }
              mono
            />
            {tx.sender_metro && <DetailKV label="Sender Metro" value={tx.sender_metro} />}
            {tx.receiver_metro && tx.receiver_metro !== tx.sender_metro && (
              <DetailKV label="Receiver Metro" value={tx.receiver_metro} />
            )}
            <DetailKV label="Sequence" value={String(tx.sequence_number)} mono />
            {afterBoundary && (
              <DetailKV
                label="Analysis Boundary"
                value="Timestamped after the analysis point — observed in the ledger, not used as ranking evidence"
              />
            )}
          </div>
          <p className="timeline-detail-note">
            Observed transaction record. Metro fields describe observed transaction
            geography and do not imply the funds moved through a specific candidate
            location.
          </p>
        </div>
      )}
    </li>
  );
}

function DetailKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p className={`mt-0.5 text-xs text-sentinel-text ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

/** Filter chip row — rendered only from values actually present. */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`timeline-filter-chip ${active ? "timeline-filter-chip-active" : ""}`}
    >
      {label}
      {count != null && <span className="font-mono text-[9px] opacity-70">{count}</span>}
    </button>
  );
}

export default function CaseTimelinePage() {
  const { caseId, caseInfo } = useCaseContext();
  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL_ACCOUNTS");
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

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

  const ledger = useMemo(() => (txData ? orderedLedger(txData) : []), [txData]);

  const txTypes = useMemo(
    () => (txData ? observedTransactionTypes(txData.transactions) : []),
    [txData]
  );
  const roles = useMemo(
    () => (txData ? observedAccountRoles(txData.accounts) : []),
    [txData]
  );

  // Account-role lookup for the role filter.
  const roleByAccount = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of txData?.accounts ?? []) m.set(a.account_id, a.role);
    return m;
  }, [txData]);

  const filtered = useMemo(() => {
    return ledger.filter((tx) => {
      if (typeFilter !== "ALL" && tx.transaction_type !== typeFilter) return false;
      if (roleFilter !== "ALL_ACCOUNTS") {
        const senderRole = roleByAccount.get(tx.sender_account_id);
        const receiverRole = roleByAccount.get(tx.receiver_account_id);
        if (senderRole !== roleFilter && receiverRole !== roleFilter) return false;
      }
      return true;
    });
  }, [ledger, typeFilter, roleFilter, roleByAccount]);

  // Split the filtered trail at the analysis point: observed evidence above,
  // any ledger records timestamped after the boundary below.
  const analysisPoint = caseInfo?.analysis_point ?? null;
  const before = useMemo(
    () => filtered.filter((tx) => !isAfterAnalysisPoint(tx, analysisPoint)),
    [filtered, analysisPoint]
  );
  const after = useMemo(
    () => filtered.filter((tx) => isAfterAnalysisPoint(tx, analysisPoint)),
    [filtered, analysisPoint]
  );

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of ledger)
      m.set(tx.transaction_type, (m.get(tx.transaction_type) ?? 0) + 1);
    return m;
  }, [ledger]);

  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of txData?.accounts ?? [])
      m.set(a.role, (m.get(a.role) ?? 0) + 1);
    return m;
  }, [txData]);

  const selectTx = (tx: TransactionInfo) =>
    setSelectedTxId((prev) => (prev === tx.transaction_id ? null : tx.transaction_id));

  /* ── loading / error / empty states ── */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="intel-panel p-4">
          <p className="section-label">Loading Timeline</p>
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
        <p className="section-label">Timeline Unavailable</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          The transaction timeline could not be loaded: {error}
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

  if (!txData || ledger.length === 0) {
    return (
      <div className="intel-panel p-4">
        <p className="section-label">No Transaction Evidence Exposed</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          This investigation dataset does not currently expose transaction
          records, so no timeline can be drawn. No events have been fabricated.
        </p>
      </div>
    );
  }

  const totalObserved = ledger.reduce((s, tx) => s + tx.amount, 0);

  return (
    <div className="space-y-5">
      {/* workspace title */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-sentinel-text">
            Transaction Timeline
          </h2>
          <p className="mt-0.5 text-xs text-sentinel-text-muted">
            Chronological observed transaction trail — the case&apos;s
            transaction ledger in chain order
          </p>
        </div>
        <span className="rounded border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 font-mono text-[10px] text-sentinel-text-secondary">
          {ledger.length} TXNS · {txData.accounts.length} ACCOUNTS ·{" "}
          {formatINR(totalObserved)}
        </span>
      </div>

      {/* filters — built only from values actually present in the ledger */}
      <div className="intel-panel space-y-2.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="section-label mr-1">Type</span>
          <FilterChip label="All" count={ledger.length} active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")} />
          {txTypes.map((t) => (
            <FilterChip
              key={t}
              label={TRANSACTION_TYPE_LABELS[t] ?? t}
              count={typeCounts.get(t) ?? 0}
              active={typeFilter === t}
              onClick={() => setTypeFilter(typeFilter === t ? "ALL" : t)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="section-label mr-1">Accounts</span>
          <FilterChip label="All Roles" active={roleFilter === "ALL_ACCOUNTS"} onClick={() => setRoleFilter("ALL_ACCOUNTS")} />
          {roles.map((r) => (
            <FilterChip
              key={r}
              label={ACCOUNT_ROLE_LABELS[r] ?? r}
              count={roleCounts.get(r) ?? 0}
              active={roleFilter === r}
              onClick={() => setRoleFilter(roleFilter === r ? "ALL_ACCOUNTS" : r)}
            />
          ))}
        </div>
      </div>

      {/* the trail */}
      <div className="intel-panel">
        <div className="intel-header flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-label" style={{ color: "var(--text-secondary)" }}>
              Observed Transaction Trail
            </h3>
            <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
              {filtered.length === ledger.length
                ? "Complete ledger, chronological order. Select a record to inspect its details."
                : `Showing ${filtered.length} of ${ledger.length} records (filtered).`}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-sentinel-text-muted">
            No transactions match the selected filters.
          </p>
        ) : (
          <ol className="px-4 py-4">
            {before.map((tx) => (
              <TimelineEvent
                key={tx.transaction_id}
                tx={tx}
                txData={txData}
                selected={selectedTxId === tx.transaction_id}
                onSelect={() => selectTx(tx)}
                afterBoundary={false}
                isLastBeforeBoundary={false}
              />
            ))}

            {/* ── ANALYSIS POINT BOUNDARY ── */}
            {caseInfo && (
              <li className="relative my-2" aria-label="Analysis point boundary">
                <div
                  className="analysis-point"
                  role="separator"
                  aria-label={`Analysis point at ${formatTimestampFull(caseInfo.analysis_point)}`}
                >
                  <div className="analysis-point-line" aria-hidden="true" />
                  <div className="analysis-point-box">
                    <p className="analysis-point-title">ANALYSIS POINT</p>
                    <p className="analysis-point-time font-mono">
                      {formatTimestampFull(caseInfo.analysis_point)}
                    </p>
                    <p className="analysis-point-note">
                      {before.length} transaction{before.length !== 1 ? "s" : ""} observed
                      before this boundary · no future observations exist beyond the
                      ledger records shown
                    </p>
                  </div>
                  <div className="analysis-point-line" aria-hidden="true" />
                </div>
              </li>
            )}

            {after.map((tx) => (
              <TimelineEvent
                key={tx.transaction_id}
                tx={tx}
                txData={txData}
                selected={selectedTxId === tx.transaction_id}
                onSelect={() => selectTx(tx)}
                afterBoundary
                isLastBeforeBoundary={false}
              />
            ))}
          </ol>
        )}

        <div className="px-4 pb-4">
          <p className="text-[10px] text-sentinel-text-muted">
            Records above the analysis point are the evidence available to
            candidate prioritization. Records timestamped after the analysis
            point (if any) are shown for ledger completeness only — they are
            not used by the ranking. All evidence is synthetic demonstration
            data.
          </p>
        </div>
      </div>

      {/* cross-links */}
      <div className="flex flex-wrap items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href={`/investigations/${caseId}/transactions`} className="btn-secondary">
          Evidence Intelligence →
        </Link>
        <Link href={`/investigations/${caseId}/network`} className="btn-primary">
          Explore Transaction Network →
        </Link>
      </div>
    </div>
  );
}
