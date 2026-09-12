/**
 * Shared ledger & relationship-graph helpers (Phase 7).
 *
 * Pure functions over the authoritative transaction-evidence response
 * (GET /investigations/:id/transactions). Every value returned is derived
 * from the actual ledger — no fabricated relationships, roles, metros, or
 * timing. Used by the Timeline, Network, Overview, and Report surfaces so
 * all four present identical observed facts.
 *
 * Analysis-point semantics (unchanged from the backend):
 *   analysis_point == complaint_time. Ranking features use only records at
 *   or before this boundary. The raw ledger endpoint may contain records
 *   timestamped after it; those are surfaced as "after the analysis point"
 *   and are never treated as ranking evidence.
 */

import type {
  AccountInfo,
  CaseTransactionsResponse,
  TransactionInfo,
} from "@/types/api";

/* ────────────────────────────────────────────────────────────────────────────
   Ledger basics
   ──────────────────────────────────────────────────────────────────────────── */

/** Ledger ordered by chain sequence (sequence order == chronological order). */
export function orderedLedger(
  txData: CaseTransactionsResponse
): TransactionInfo[] {
  return [...txData.transactions].sort(
    (a, b) => a.sequence_number - b.sequence_number
  );
}

/** True when the record was timestamped after the case's analysis point. */
export function isAfterAnalysisPoint(
  tx: TransactionInfo,
  analysisPoint: string | null | undefined
): boolean {
  if (!analysisPoint) return false;
  return new Date(tx.timestamp).getTime() > new Date(analysisPoint).getTime();
}

/** Transaction types actually present in the ledger (stable order). */
export function observedTransactionTypes(txs: TransactionInfo[]): string[] {
  return [...new Set(txs.map((t) => t.transaction_type))].sort();
}

/** Account roles actually present (stable order). */
export function observedAccountRoles(accounts: AccountInfo[]): string[] {
  return [...new Set(accounts.map((a) => a.role))].sort();
}

/** Distinct metros observed across transaction endpoints. */
export function observedMetros(txs: TransactionInfo[]): string[] {
  const set = new Set<string>();
  for (const tx of txs) {
    if (tx.sender_metro) set.add(tx.sender_metro);
    if (tx.receiver_metro) set.add(tx.receiver_metro);
  }
  return [...set].sort();
}

/** Role of an account id, from the accounts list; null when not recorded. */
export function roleOf(
  accounts: AccountInfo[],
  accountId: string
): string | null {
  return accounts.find((a) => a.account_id === accountId)?.role ?? null;
}

/** Per-account related-transaction counts (sender OR receiver). */
export function relatedTxCounts(txs: TransactionInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    counts.set(
      tx.sender_account_id,
      (counts.get(tx.sender_account_id) ?? 0) + 1
    );
    counts.set(
      tx.receiver_account_id,
      (counts.get(tx.receiver_account_id) ?? 0) + 1
    );
  }
  return counts;
}

/**
 * Metros observed for each account, derived strictly from the ledger
 * endpoints where the account appears. Empty array when the account never
 * appears in a transaction with metro data.
 */
export function accountObservedMetros(
  txs: TransactionInfo[]
): Map<string, string[]> {
  const metros = new Map<string, Set<string>>();
  const touch = (id: string, metro: string) => {
    if (!metro) return;
    if (!metros.has(id)) metros.set(id, new Set());
    metros.get(id)!.add(metro);
  };
  for (const tx of txs) {
    touch(tx.sender_account_id, tx.sender_metro);
    touch(tx.receiver_account_id, tx.receiver_metro);
  }
  const out = new Map<string, string[]>();
  for (const [id, set] of metros) out.set(id, [...set].sort());
  return out;
}

/** Aggregate ledger summary for snapshots and the report brief. */
export interface LedgerSummary {
  count: number;
  volume: number;
  accountCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  byType: Record<string, number>;
  byRole: Record<string, number>;
  beforeAnalysis: number;
  afterAnalysis: number;
}

export function summarizeLedger(
  txData: CaseTransactionsResponse,
  analysisPoint: string | null | undefined
): LedgerSummary {
  const txs = orderedLedger(txData);
  let volume = 0;
  let before = 0;
  let after = 0;
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  for (const tx of txs) {
    volume += tx.amount;
    byType[tx.transaction_type] = (byType[tx.transaction_type] ?? 0) + 1;
    if (isAfterAnalysisPoint(tx, analysisPoint)) after += 1;
    else before += 1;
  }
  for (const a of txData.accounts) {
    byRole[a.role] = (byRole[a.role] ?? 0) + 1;
  }
  return {
    count: txs.length,
    volume,
    accountCount: txData.accounts.length,
    periodFrom: txs.length > 0 ? txs[0].timestamp : null,
    periodTo: txs.length > 0 ? txs[txs.length - 1].timestamp : null,
    byType,
    byRole,
    beforeAnalysis: before,
    afterAnalysis: after,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Relationship graph (observed relationships only)
   ──────────────────────────────────────────────────────────────────────────── */

/** Canonical role column order for the layered network layout. */
const ROLE_COLUMN_ORDER = [
  "VICTIM",
  "MULE",
  "INTERMEDIATE",
  "CASH_OUT",
  "UNKNOWN",
];

export interface GraphNode {
  accountId: string;
  /** Role from the accounts list ("UNKNOWN" only if the record is missing). */
  role: string;
  bank: string | null;
  /** Observed transaction metros for this account (may be empty). */
  metros: string[];
  txCount: number;
  sentCount: number;
  receivedCount: number;
  /** Layer index (role column) and stacking index within the layer. */
  column: number;
  row: number;
}

export interface GraphEdge {
  /** The actual transaction record backing this relationship. */
  tx: TransactionInfo;
  senderRole: string;
  receiverRole: string;
  afterAnalysis: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Account ids per role column, in display order. */
  columns: string[][];
}

/**
 * Build the observed relationship graph from the ledger.
 *
 * Nodes exist only for accounts recorded in the response; edges exist only
 * for transactions present in the ledger. Nothing is inferred between
 * accounts that did not transact.
 */
export function buildGraph(
  txData: CaseTransactionsResponse,
  analysisPoint: string | null | undefined
): GraphData {
  const txs = orderedLedger(txData);
  const accounts = txData.accounts;

  const accountById = new Map(accounts.map((a) => [a.account_id, a]));
  const counts = relatedTxCounts(txs);
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  for (const tx of txs) {
    sent.set(tx.sender_account_id, (sent.get(tx.sender_account_id) ?? 0) + 1);
    received.set(
      tx.receiver_account_id,
      (received.get(tx.receiver_account_id) ?? 0) + 1
    );
  }
  const metrosByAccount = accountObservedMetros(txs);

  // Every account referenced by a transaction becomes a node — even if the
  // accounts list somehow omitted it (rendered with role UNKNOWN, never invented).
  const referenced = new Set<string>();
  for (const tx of txs) {
    referenced.add(tx.sender_account_id);
    referenced.add(tx.receiver_account_id);
  }

  // Assign columns: canonical role order, unknown/other roles at the end.
  const roleOfId = (id: string): string =>
    accountById.get(id)?.role ?? "UNKNOWN";
  const columnRoles = ROLE_COLUMN_ORDER.filter((role) =>
    [...referenced].some((id) => roleOfId(id) === role)
  );
  const otherRoles = [...new Set([...referenced].map(roleOfId))].filter(
    (r) => !ROLE_COLUMN_ORDER.includes(r)
  );
  columnRoles.push(...otherRoles.sort());

  const columnIndex = new Map(columnRoles.map((r, i) => [r, i]));

  // Sort accounts inside a column by id for stable, readable stacking.
  const byColumn = new Map<number, string[]>();
  for (const id of referenced) {
    const col = columnIndex.get(roleOfId(id)) ?? columnRoles.length - 1;
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col)!.push(id);
  }
  const columns: string[][] = [];
  const nodeColumn = new Map<string, number>();
  const nodeRow = new Map<string, number>();
  for (const col of [...byColumn.keys()].sort((a, b) => a - b)) {
    const ids = (byColumn.get(col) ?? []).sort();
    columns[col] = ids;
    ids.forEach((id, row) => {
      nodeColumn.set(id, col);
      nodeRow.set(id, row);
    });
  }

  const nodes: GraphNode[] = [...referenced]
    .sort()
    .map((id) => {
      const acct = accountById.get(id);
      return {
        accountId: id,
        role: roleOfId(id),
        bank: acct?.bank_synthetic ?? null,
        metros: metrosByAccount.get(id) ?? [],
        txCount: counts.get(id) ?? 0,
        sentCount: sent.get(id) ?? 0,
        receivedCount: received.get(id) ?? 0,
        column: nodeColumn.get(id) ?? 0,
        row: nodeRow.get(id) ?? 0,
      };
    });

  const edges: GraphEdge[] = txs.map((tx) => ({
    tx,
    senderRole: roleOfId(tx.sender_account_id),
    receiverRole: roleOfId(tx.receiver_account_id),
    afterAnalysis: isAfterAnalysisPoint(tx, analysisPoint),
  }));

  return { nodes, edges, columns: columns.filter(Boolean) };
}
