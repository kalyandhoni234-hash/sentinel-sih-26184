"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatTimestampFull } from "@/lib/format";
import { ACCOUNT_ROLE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { buildGraph, observedMetros } from "@/lib/timeline";
import type { GraphEdge, GraphNode } from "@/lib/timeline";
import { useCaseContext } from "../workspace-context";
import type { CaseTransactionsResponse } from "@/types/api";

/**
 * Network Intelligence — the observed relationship-graph workspace
 * (Phase 7).
 *
 * Data source: GET /investigations/:id/transactions only. Nodes exist for
 * accounts recorded in the response; edges exist only for transactions in
 * the ledger, directed sender → receiver. Nothing is inferred between
 * accounts that did not transact, and no predictive model is introduced.
 *
 * Honesty framing (binding for this surface): the graph represents observed
 * transaction relationships in the available synthetic ledger. It does NOT
 * prove criminal intent, ownership, physical movement, cash-out activity,
 * causality, or fraud attribution. Account roles are displayed exactly as
 * recorded by the dataset — accounts are never labeled "criminal".
 *
 * Selection model: a single local selection (account node OR transaction
 * edge) drives the inspector and highlighting. It does not touch the
 * shared candidate-selection mechanism, so no cross-view state conflicts.
 */

type Selection =
  | { kind: "node"; accountId: string }
  | { kind: "edge"; transactionId: string }
  | null;

/* Graph geometry (viewBox units) */
const NODE_W = 150;
const NODE_H = 52;
const COL_GAP = 96;
const ROW_GAP = 30;
const PAD_X = 18;
const PAD_Y = 44;

function roleNodeClass(role: string): string {
  switch (role) {
    case "VICTIM":
      return "net-node-victim";
    case "MULE":
      return "net-node-mule";
    case "CASH_OUT":
      return "net-node-cashout";
    case "INTERMEDIATE":
      return "net-node-intermediate";
    default:
      return "net-node-unknown";
  }
}

/**
 * Cubic bezier from sender node to receiver node, exiting/entering through
 * the node sides that face each other (backward role-flow edges simply
 * route leftward). Same-column edges (e.g. MULE → MULE within a role layer)
 * dip through the row gap below the two nodes instead of looping wide.
 * Returns the arrowhead geometry at the receiver end.
 */
function edgePath(
  sender: { x: number; y: number },
  receiver: { x: number; y: number }
): { d: string; midX: number; midY: number; dx: number; endX: number; endY: number } {
  const forward = receiver.x >= sender.x;
  const y1 = sender.y;
  const y2 = receiver.y;

  if (sender.x === receiver.x && sender.y !== receiver.y) {
    // Same column: C-shaped curve around the side of the column so the
    // connector never crosses a node interior — left side when the receiver
    // is lower, right side when it is higher (direction becomes readable).
    const below = y2 > y1;
    const startX = below ? sender.x : sender.x + NODE_W;
    const endX = below ? receiver.x : receiver.x + NODE_W;
    const startY = y1 + (below ? NODE_H - 14 : 14);
    const endY = y2 + (below ? NODE_H - 14 : 14);
    const bulge = 36;
    const c1x = below ? startX - bulge : startX + bulge;
    const c2x = below ? endX - bulge : endX + bulge;
    return {
      d: `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`,
      midX: below ? Math.min(startX, endX) - 24 : Math.max(startX, endX) + 24,
      midY: (startY + endY) / 2,
      dx: below ? 1 : -1,
      endX,
      endY,
    };
  }

  const startX = forward ? sender.x + NODE_W : sender.x;
  const endX = forward ? receiver.x : receiver.x + NODE_W;
  const k = Math.max(30, Math.abs(endX - startX) / 2);
  const c1x = forward ? startX + k : startX - k;
  const c2x = forward ? endX - k : endX + k;
  const dx = forward ? 1 : -1;
  return {
    d: `M ${startX} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${endX} ${y2}`,
    midX: (startX + endX) / 2,
    midY: (y1 + y2) / 2,
    dx,
    endX,
    endY: y2,
  };
}

export default function CaseNetworkPage() {
  const { caseId, caseInfo } = useCaseContext();
  const [txData, setTxData] = useState<CaseTransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelection(null);
    api
      .getTransactions(caseId)
      .then((res) => active && setTxData(res))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [caseId]);

  const graph = useMemo(
    () => (txData ? buildGraph(txData, caseInfo?.analysis_point) : null),
    [txData, caseInfo?.analysis_point]
  );

  const txMetros = useMemo(
    () => (txData ? observedMetros(txData.transactions) : []),
    [txData]
  );

  /* ── loading / error / empty states ── */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="intel-panel p-4">
          <p className="section-label">Loading Network</p>
          <div className="mt-3 space-y-3">
            <div className="skeleton h-4 w-52" />
            <div className="skeleton h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="intel-panel p-4">
        <p className="section-label">Network Unavailable</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          The relationship graph could not be loaded: {error}
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

  if (!txData || !graph || graph.edges.length === 0) {
    return (
      <div className="intel-panel p-4">
        <p className="section-label">No Transaction Relationships Exposed</p>
        <p className="mt-1 text-xs text-sentinel-text-secondary">
          This investigation dataset does not currently expose transaction
          records, so no relationship graph can be drawn. No relationships
          have been fabricated.
        </p>
      </div>
    );
  }

  /* ── geometry ── */

  const nodePos = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    nodePos.set(node.accountId, {
      x: PAD_X + node.column * (NODE_W + COL_GAP),
      y: PAD_Y + node.row * (NODE_H + ROW_GAP),
    });
  }
  const colsCount = graph.columns.length;
  const maxRows = Math.max(...graph.columns.map((c) => c.length));
  const svgW = PAD_X * 2 + colsCount * NODE_W + (colsCount - 1) * COL_GAP;
  const svgH = PAD_Y * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;

  /* ── selection state ── */

  const selectedNodeId =
    selection?.kind === "node" ? selection.accountId : null;
  const selectedEdgeId =
    selection?.kind === "edge" ? selection.transactionId : null;

  const selectedNode =
    selectedNodeId != null
      ? graph.nodes.find((n) => n.accountId === selectedNodeId) ?? null
      : null;
  const selectedEdge =
    selectedEdgeId != null
      ? graph.edges.find((e) => e.tx.transaction_id === selectedEdgeId) ?? null
      : null;

  // Highlight set: when a node is selected, its connected edges + neighbor
  // accounts; when an edge is selected, its two endpoint accounts.
  const highlightEdges = new Set<string>();
  const highlightNodes = new Set<string>();
  if (selectedNodeId) {
    for (const e of graph.edges) {
      if (e.tx.sender_account_id === selectedNodeId || e.tx.receiver_account_id === selectedNodeId) {
        highlightEdges.add(e.tx.transaction_id);
        highlightNodes.add(e.tx.sender_account_id);
        highlightNodes.add(e.tx.receiver_account_id);
      }
    }
    highlightNodes.add(selectedNodeId);
  } else if (selectedEdge) {
    highlightEdges.add(selectedEdge.tx.transaction_id);
    highlightNodes.add(selectedEdge.tx.sender_account_id);
    highlightNodes.add(selectedEdge.tx.receiver_account_id);
  }

  const relatedTxFor = (accountId: string): GraphEdge[] =>
    graph.edges.filter(
      (e) =>
        e.tx.sender_account_id === accountId || e.tx.receiver_account_id === accountId
    );

  const selectedNodeRelated =
    selectedNodeId != null ? relatedTxFor(selectedNodeId) : [];

  const accountById = new Map(txData.accounts.map((a) => [a.account_id, a]));

  const roleCountFor = (role: string): number =>
    graph.nodes.filter((n) => n.role === role).length;

  const metroTouchCounts = new Map<string, number>();
  for (const tx of txData.transactions) {
    const seen = new Set<string>();
    if (tx.sender_metro) seen.add(tx.sender_metro);
    if (tx.receiver_metro) seen.add(tx.receiver_metro);
    for (const m of seen)
      metroTouchCounts.set(m, (metroTouchCounts.get(m) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      {/* workspace title */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-sentinel-text">
            Network Intelligence
          </h2>
          <p className="mt-0.5 text-xs text-sentinel-text-muted">
            Observed transaction relationships — sender → receiver, from the
            case ledger
          </p>
        </div>
        <span className="rounded border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 font-mono text-[10px] text-sentinel-text-secondary">
          {graph.nodes.length} ACCOUNTS · {graph.edges.length} TRANSACTIONS
        </span>
      </div>

      {/* honesty framing — required for this surface */}
      <div className="intel-panel border-l-2 border-l-sentinel-500 p-3">
        <p className="text-[11px] leading-relaxed text-sentinel-text-secondary">
          <span className="font-semibold text-sentinel-text">
            Observed transaction relationships in the available synthetic
            ledger.
          </span>{" "}
          This graph does not prove criminal intent, account ownership,
          physical movement, cash-out activity, causality, or fraud
          attribution. Account roles are shown exactly as recorded in the
          dataset.
        </p>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {[...new Set(graph.nodes.map((n) => n.role))].map((role) => (
          <span key={role} className="flex items-center gap-1.5 text-[10px] text-sentinel-text-secondary">
            <span className={`net-node-swatch ${roleNodeClass(role)}`} aria-hidden="true" />
            {ACCOUNT_ROLE_LABELS[role] ?? role} ({roleCountFor(role)})
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-sentinel-text-secondary">
          <svg width="22" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="22" y2="3" className="net-edge-line net-edge-after" />
          </svg>
          Recorded after the analysis point
        </span>
      </div>

      {/* graph + inspector */}
      <div className="flex flex-col gap-4 xl:flex-row">
        {/* GRAPH */}
        <div className="intel-panel min-w-0 flex-1 p-2">
          <div className="flex items-center justify-between px-2 pt-1">
            <p className="section-label">Relationship Graph</p>
            {selection && (
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="text-[10px] font-semibold hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="overflow-x-auto">              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="net-graph mx-auto block h-auto w-full max-w-[880px] min-w-[560px] select-none"
                role="group"
                aria-label="Observed transaction relationship graph. Accounts are nodes; transactions are directed edges from sender to receiver."
              >
              {/* click-away target */}
              <rect
                x="0"
                y="0"
                width={svgW}
                height={svgH}
                fill="transparent"
                onClick={() => setSelection(null)}
              />

              {/* role column headers */}
              {graph.columns.map((ids, col) => {
                const role = ids.length > 0 ? graph.nodes.find((n) => n.accountId === ids[0])?.role ?? "" : "";
                const x = PAD_X + col * (NODE_W + COL_GAP) + NODE_W / 2;
                return (
                  <text
                    key={`col-${col}`}
                    x={x}
                    y={20}
                    textAnchor="middle"
                    className="net-column-label"
                  >
                    {(ACCOUNT_ROLE_LABELS[role] ?? role).toUpperCase()} · {ids.length}
                  </text>
                );
              })}

              {/* edges */}
              {graph.edges.map((edge) => {
                const s = nodePos.get(edge.tx.sender_account_id);
                const r = nodePos.get(edge.tx.receiver_account_id);
                if (!s || !r) return null;
                const geo = edgePath(s, r);
                const isSelected = selectedEdgeId === edge.tx.transaction_id;
                const isHighlighted = highlightEdges.has(edge.tx.transaction_id);
                const dimmed = (selectedNodeId != null || selectedEdgeId != null) && !isHighlighted;
                const cls = [
                  "net-edge-line",
                  edge.afterAnalysis ? "net-edge-after" : "",
                  isSelected ? "net-edge-chosen" : "",
                  isHighlighted && !isSelected ? "net-edge-active" : "",
                  dimmed ? "net-edge-dim" : "",
                ].filter(Boolean).join(" ");
                const arrowCls = [
                  "net-edge-arrow",
                  isSelected || isHighlighted ? "net-edge-arrow-active" : "",
                  dimmed ? "net-edge-dim" : "",
                ].filter(Boolean).join(" ");
                const arrowTipX = geo.endX + geo.dx;
                const arrowBaseX = geo.endX - geo.dx * 7;
                return (
                  <g key={edge.tx.transaction_id}>
                    {/* wide invisible hit area */}
                    <path
                      d={geo.d}
                      className="net-edge-hit"
                      onClick={() => setSelection({ kind: "edge", transactionId: edge.tx.transaction_id })}
                      aria-hidden="true"
                    />
                    <path d={geo.d} className={cls} pointerEvents="none" />
                    <polygon
                      className={arrowCls}
                      pointerEvents="none"
                      points={`${geo.endX + geo.dx},${geo.endY} ${geo.endX - geo.dx * 7},${geo.endY - 4} ${geo.endX - geo.dx * 7},${geo.endY + 4}`}
                    />
                    <g pointerEvents="none">
                      <text
                        x={geo.midX}
                        y={geo.midY - 3}
                        textAnchor="middle"
                        className={`net-edge-label ${dimmed ? "net-edge-dim" : ""} ${isSelected ? "net-edge-label-active" : ""}`}
                      >
                        {TRANSACTION_TYPE_LABELS[edge.tx.transaction_type] ?? edge.tx.transaction_type}
                      </text>
                      <text
                        x={geo.midX}
                        y={geo.midY + 8}
                        textAnchor="middle"
                        className={`net-edge-label ${dimmed ? "net-edge-dim" : ""} ${isSelected ? "net-edge-label-active" : ""}`}
                      >
                        {formatINR(edge.tx.amount)}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* nodes */}
              {graph.nodes.map((node) => {
                const pos = nodePos.get(node.accountId);
                if (!pos) return null;
                const isSelected = selectedNodeId === node.accountId;
                const isHighlighted = highlightNodes.has(node.accountId);
                const dimmed =
                  (selectedNodeId != null || selectedEdgeId != null) && !isHighlighted;
                return (
                  <g
                    key={node.accountId}
                    className={`net-node ${roleNodeClass(node.role)} ${isSelected ? "net-node-selected" : ""} ${dimmed ? "net-node-dim" : ""}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Account ${node.accountId}, role ${ACCOUNT_ROLE_LABELS[node.role] ?? node.role}, ${node.txCount} related transactions. Select to inspect.`}
                    onClick={() =>
                      setSelection(
                        selection?.kind === "node" && selection.accountId === node.accountId
                          ? null
                          : { kind: "node", accountId: node.accountId }
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelection(
                          selection?.kind === "node" && selection.accountId === node.accountId
                            ? null
                            : { kind: "node", accountId: node.accountId }
                        );
                      }
                    }}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={6}
                      className="net-node-box"
                    />
                    <text x={10} y={20} className="net-node-id">
                      {node.accountId}
                    </text>
                    <text x={10} y={33} className="net-node-role">
                      {(ACCOUNT_ROLE_LABELS[node.role] ?? node.role).toUpperCase()}
                    </text>
                    <text x={10} y={45} className="net-node-sub">
                      {node.metros.length > 0 ? node.metros.join(" · ") : "Metro not recorded"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="px-2 pb-1 text-[10px] text-sentinel-text-muted">
            Select an account or a transaction to inspect it. Edges are drawn
            sender → receiver exactly as recorded; no relationships are
            inferred between accounts that did not transact.
          </p>
        </div>

        {/* INSPECTOR */}
        <div className="w-full shrink-0 rounded-lg border border-sentinel-border bg-sentinel-surface p-4 xl:w-[340px]">
          <p className="section-label mb-3">
            {selectedNode ? "Account Inspector" : selectedEdge ? "Transaction Inspector" : "Inspector"}
          </p>

          {!selection && (
            <div className="rounded-md border border-dashed border-sentinel-border p-4 text-center">
              <p className="text-xs font-medium text-sentinel-text-secondary">
                Nothing selected
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-sentinel-text-muted">
                Select an account node or a transaction edge in the graph to
                inspect its recorded details.
              </p>
            </div>
          )}

          {selectedNode && (
            <div className="space-y-3">
              <p className="font-mono text-sm font-bold text-sentinel-text">
                {selectedNode.accountId}
              </p>
              <div className="space-y-1.5 text-xs">
                <InspectorKV
                  label="Role"
                  value={ACCOUNT_ROLE_LABELS[selectedNode.role] ?? selectedNode.role}
                />
                {selectedNode.bank && (
                  <InspectorKV label="Bank (Synthetic)" value={selectedNode.bank} />
                )}
                <InspectorKV
                  label="Observed Metros"
                  value={
                    selectedNode.metros.length > 0
                      ? selectedNode.metros.join(", ")
                      : "Not recorded in ledger"
                  }
                />
                <InspectorKV
                  label="Related Transactions"
                  value={String(selectedNode.txCount)}
                  mono
                />
                <InspectorKV
                  label="Sent / Received"
                  value={`${selectedNode.sentCount} / ${selectedNode.receivedCount}`}
                  mono
                />
              </div>

              <div>
                <p className="section-label mb-1">Connected Transactions</p>
                <div className="space-y-1">
                  {selectedNodeRelated.map((e) => (
                    <button
                      key={e.tx.transaction_id}
                      type="button"
                      onClick={() => setSelection({ kind: "edge", transactionId: e.tx.transaction_id })}
                      className="net-related-tx"
                      aria-label={`Inspect transaction ${e.tx.transaction_id}`}
                    >
                      <span className="font-mono text-[10px] text-sentinel-text">
                        #{e.tx.sequence_number} {e.tx.transaction_id}
                      </span>
                      <span className="font-mono text-[10px] text-sentinel-text-secondary">
                        {e.tx.transaction_type} · {formatINR(e.tx.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[10px] leading-snug text-sentinel-text-muted">
                Account attributes as recorded in the investigation dataset.
                The recorded role is a dataset label — this view does not
                establish ownership, intent, or any criminal characterization.
              </p>
            </div>
          )}

          {selectedEdge && (
            <div className="space-y-3">
              <p className="font-mono text-sm font-bold text-sentinel-text">
                {selectedEdge.tx.transaction_id}
              </p>
              <div className="space-y-1.5 text-xs">
                <InspectorKV
                  label="Type"
                  value={
                    TRANSACTION_TYPE_LABELS[selectedEdge.tx.transaction_type] ??
                    selectedEdge.tx.transaction_type
                  }
                />
                <InspectorKV
                  label="Amount"
                  value={formatINR(selectedEdge.tx.amount)}
                  mono
                />
                <InspectorKV
                  label="Sender"
                  value={`${selectedEdge.tx.sender_account_id} (${ACCOUNT_ROLE_LABELS[selectedEdge.senderRole] ?? selectedEdge.senderRole})`}
                  mono
                />
                <InspectorKV
                  label="Receiver"
                  value={`${selectedEdge.tx.receiver_account_id} (${ACCOUNT_ROLE_LABELS[selectedEdge.receiverRole] ?? selectedEdge.receiverRole})`}
                  mono
                />
                <InspectorKV
                  label="Timestamp"
                  value={formatTimestampFull(selectedEdge.tx.timestamp)}
                  mono
                />
                <InspectorKV
                  label="Sequence"
                  value={String(selectedEdge.tx.sequence_number)}
                  mono
                />
                {selectedEdge.tx.sender_metro && (
                  <InspectorKV label="Sender Metro" value={selectedEdge.tx.sender_metro} />
                )}
                {selectedEdge.tx.receiver_metro &&
                  selectedEdge.tx.receiver_metro !== selectedEdge.tx.sender_metro && (
                    <InspectorKV
                      label="Receiver Metro"
                      value={selectedEdge.tx.receiver_metro}
                    />
                  )}
              </div>
              {selectedEdge.afterAnalysis && (
                <p className="rounded-md border border-sentinel-border-subtle bg-sentinel-surface-alt p-2 text-[10px] leading-snug text-sentinel-text-secondary">
                  Recorded after the analysis point — shown for ledger
                  completeness; not used as ranking evidence.
                </p>
              )}
              <p className="text-[10px] leading-snug text-sentinel-text-muted">
                An edge records an observed transfer between these two
                accounts. It does not imply the funds moved through any
                specific candidate location.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* observed transaction geography */}
      <div className="intel-panel p-4">
        <p className="section-label">Observed Transaction Geography</p>
        <p className="mt-2 text-xs text-sentinel-text-secondary">
          {txMetros.length > 0
            ? `Metros observed across transaction endpoints: ${txMetros.join(", ")}.`
            : "No metro information is recorded on this case's transactions."}
        </p>
        {txMetros.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {txMetros.map((m) => (
              <span
                key={m}
                className="rounded border border-sentinel-border bg-sentinel-surface-alt px-2 py-0.5 text-[10px] text-sentinel-text-secondary"
              >
                {m} · {metroTouchCounts.get(m) ?? 0} tx
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-sentinel-text-muted">
          Shared metro does not imply transactions occurred at a specific
          candidate location. Metro fields describe observed transaction
          geography only — not cash-out locations, ATM locations, or travel
          routes.
        </p>
      </div>

      {/* cross-links — the investigator workflow */}
      <div className="flex flex-wrap items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href={`/investigations/${caseId}/timeline`} className="btn-secondary">
          Transaction Timeline →
        </Link>
        <Link href={`/investigations/${caseId}/geointel`} className="btn-primary">
          View Geographic Context →
        </Link>
        <Link href={`/investigations/${caseId}/candidates`} className="btn-secondary">
          Review Candidate Prioritization →
        </Link>
      </div>
    </div>
  );
}

function InspectorKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
        {label}
      </span>
      <span
        className={`text-right text-xs text-sentinel-text ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
