"use client";

import { useState } from "react";
import { formatINR, formatTime, formatDateShort, formatTimestampFull } from "@/lib/format";
import {
  ACCOUNT_ROLE_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/labels";
import type {
  CaseTransactionsResponse,
  TransactionInfo,
  AccountInfo,
} from "@/types/api";

/**
 * Evidence Intelligence trail — the main evidence surface of the Evidence
 * workspace. Presents the observed transaction ledger as a connected,
 * chronologically ordered trail.
 *
 * Data honesty: every displayed value comes from GET
 * /investigations/:id/transactions (TransactionInfo / AccountInfo). No
 * suspiciousness scores, risk labels, intent, or relationships are
 * fabricated — the trail shows only what the dataset actually records.
 */

/* ── Account role badge styling (labels from lib/labels — backend values) ── */

const ACCOUNT_ROLE_BADGES: Record<string, string> = {
  VICTIM: "evidence-role-victim",
  MULE: "evidence-role-mule",
  CASH_OUT: "evidence-role-cashout",
  INTERMEDIATE: "evidence-role-intermediate",
  UNKNOWN: "evidence-role-unknown",
};

function AccountRoleBadge({ role }: { role: string }) {
  const cls = ACCOUNT_ROLE_BADGES[role] ?? "evidence-role-unknown";
  const label = ACCOUNT_ROLE_LABELS[role] ?? role;
  return <span className={`evidence-role ${cls}`}>{label}</span>;
}

/* ── Transaction type — compact mono badge, backend values only ── */

function TxTypeBadge({ type }: { type: string }) {
  const label = TRANSACTION_TYPE_LABELS[type] ?? type;
  return <span className="evidence-txtype">{label}</span>;
}

/** Compact account identity: monospace id + role badge. */
function AccountChip({ accountId, accounts }: { accountId: string; accounts: AccountInfo[] }) {
  const acct = accounts.find((a) => a.account_id === accountId);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-sentinel-text">{accountId}</span>
      {acct && <AccountRoleBadge role={acct.role} />}
    </span>
  );
}

/* ── Single transaction row (button) + expanded detail ── */

function TrailRow({
  tx,
  accounts,
  selected,
  onSelect,
  isLast,
}: {
  tx: TransactionInfo;
  accounts: AccountInfo[];
  selected: boolean;
  onSelect: () => void;
  isLast: boolean;
}) {
  const sender = accounts.find((a) => a.account_id === tx.sender_account_id);
  const receiver = accounts.find((a) => a.account_id === tx.receiver_account_id);
  const metroFlow =
    tx.sender_metro && tx.receiver_metro
      ? tx.sender_metro === tx.receiver_metro
        ? tx.sender_metro
        : `${tx.sender_metro} → ${tx.receiver_metro}`
      : null;

  return (
    <li className="relative">
      {/* trail connector */}
      {!isLast && <div className="evidence-connector" aria-hidden="true" />}
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        aria-label={`Transaction ${tx.sequence_number}: ${formatINR(tx.amount)}, ${formatTimestampFull(tx.timestamp)}. Select to inspect details.`}
        className={`evidence-row ${selected ? "evidence-row-selected" : ""}`}
      >
        {/* sequence node */}
        <span className={`evidence-node ${selected ? "evidence-node-selected" : ""}`} aria-hidden="true">
          {tx.sequence_number}
        </span>

        {/* timestamp — monospace, scan-friendly */}
        <span className="hidden w-24 shrink-0 sm:block">
          <span className="block font-mono text-xs text-sentinel-text">{formatTime(tx.timestamp)}</span>
          <span className="block text-[10px] text-sentinel-text-muted">{formatDateShort(tx.timestamp)}</span>
        </span>

        {/* core record */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-sentinel-text">{formatINR(tx.amount)}</span>
            <TxTypeBadge type={tx.transaction_type} />
            <span className="font-mono text-[10px] text-sentinel-text-muted">{tx.transaction_id}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <AccountChip accountId={tx.sender_account_id} accounts={accounts} />
            <svg className="h-3 w-3 shrink-0 text-sentinel-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <AccountChip accountId={tx.receiver_account_id} accounts={accounts} />
          </span>
          {metroFlow && (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-sentinel-text-muted">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Observed transaction geography: {metroFlow}
            </span>
          )}
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-sentinel-text-muted transition-transform ${selected ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* expanded detail — every legitimate field on the record */}
      {selected && (
        <div className="evidence-detail" role="region" aria-label={`Transaction ${tx.sequence_number} details`}>
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
          </div>
          <p className="evidence-detail-note">
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

/* ── Account inspector — legitimate AccountInfo fields only ── */

function AccountInspector({ account, txCount }: { account: AccountInfo; txCount: number }) {
  return (
    <div className="evidence-detail" role="region" aria-label={`Account ${account.account_id} details`}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <DetailKV label="Account ID" value={account.account_id} mono />
        <DetailKV label="Role" value={ACCOUNT_ROLE_LABELS[account.role] ?? account.role} />
        <DetailKV label="Bank (Synthetic)" value={account.bank_synthetic} />
        <DetailKV label="Account Age" value={`${account.account_age_days} days`} mono />
        <DetailKV label="Related Transactions" value={String(txCount)} mono />
      </div>
      <p className="evidence-detail-note">
        Account attributes as recorded in the investigation dataset. No additional
        account intelligence is exposed by the current SENTINEL API.
      </p>
    </div>
  );
}

/* ── Public surface ── */

export function EvidenceTrail({ txData }: { txData: CaseTransactionsResponse }) {
  const { transactions, accounts } = txData;
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Per-account transaction counts — derived from the real ledger only.
  const accountTxCounts = new Map<string, number>();
  for (const tx of transactions) {
    accountTxCounts.set(tx.sender_account_id, (accountTxCounts.get(tx.sender_account_id) ?? 0) + 1);
    accountTxCounts.set(tx.receiver_account_id, (accountTxCounts.get(tx.receiver_account_id) ?? 0) + 1);
  }

  const selectedTx = transactions.find((t) => t.transaction_id === selectedTxId) ?? null;
  const selectedAccount = accounts.find((a) => a.account_id === selectedAccountId) ?? null;

  const selectTx = (tx: TransactionInfo) => {
    setSelectedAccountId(null);
    setSelectedTxId((prev) => (prev === tx.transaction_id ? null : tx.transaction_id));
  };
  const selectAccount = (account: AccountInfo) => {
    setSelectedTxId(null);
    setSelectedAccountId((prev) => (prev === account.account_id ? null : account.account_id));
  };

  return (
    <div className="intel-panel">
      <div className="intel-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="section-label" style={{ color: "var(--text-secondary)" }}>
            Transaction Trail
          </h3>
          <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
            Chronological ledger of observed fund transfers. Select a record to
            inspect its details.
          </p>
        </div>
        <span className="rounded border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 font-mono text-[10px] text-sentinel-text-secondary">
          {transactions.length} TXNS · {accounts.length} ACCOUNTS
        </span>
      </div>

      {/* account inspector row */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {accounts.map((account) => (
          <button
            key={account.account_id}
            type="button"
            onClick={() => selectAccount(account)}
            aria-pressed={selectedAccountId === account.account_id}
            aria-label={`Inspect account ${account.account_id}, role ${ACCOUNT_ROLE_LABELS[account.role] ?? account.role}`}
            className={`evidence-account-chip ${selectedAccountId === account.account_id ? "evidence-account-chip-selected" : ""}`}
          >
            <span className="font-mono text-[11px]">{account.account_id}</span>
            <AccountRoleBadge role={account.role} />
          </button>
        ))}
      </div>

      {selectedAccount && (
        <div className="px-4 pt-3">
          <AccountInspector
            account={selectedAccount}
            txCount={accountTxCounts.get(selectedAccount.account_id) ?? 0}
          />
        </div>
      )}

      {/* the trail */}
      <ol className="px-4 py-4">
        {transactions.map((tx, i) => (
          <TrailRow
            key={tx.transaction_id}
            tx={tx}
            accounts={accounts}
            selected={selectedTxId === tx.transaction_id}
            onSelect={() => selectTx(tx)}
            isLast={i === transactions.length - 1}
          />
        ))}
      </ol>

      {/* single detail surface — never stale */}
      {selectedTx && (
        <div className="px-4 pb-4">
          <p className="section-label mb-2" style={{ color: "var(--text-secondary)" }}>
            Selected Record — {selectedTx.transaction_id}
          </p>
        </div>
      )}

      <div className="px-4 pb-4">
        <p className="text-[10px] text-sentinel-text-muted">
          Transaction geography provides context for candidate-location ranking.
          Transactions do not directly determine ATM locations. All evidence shown
          is synthetic demonstration data.
        </p>
      </div>
    </div>
  );
}
