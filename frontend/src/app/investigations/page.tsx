"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { SCENARIO_BADGES, scenarioLabel } from "@/lib/labels";
import type { InvestigationSummary } from "@/types/api";

/**
 * Investigation Queue — the investigator's starting point.
 *
 * Dense, scannable case list with technical (monospace) case identity,
 * prominent + NEW INVESTIGATION action. All rows come from the
 * authoritative GET /investigations response; no fabricated case facts.
 */

type SortKey = "complaint_time" | "reported_amount" | "num_candidates";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "high-value", label: "High Value" },
  { key: "many-candidates", label: "Many Candidates" },
  { key: "recent", label: "Most Recent 25" },
] as const;

/** Number of newest cases (by complaint time) shown by the "Most Recent 25" filter. */
const RECENT_COUNT = 25;

/**
 * Maximum table rows rendered at once. The corpus now holds 5,000 cases;
 * search and filters apply BEFORE this cap, so any case remains reachable —
 * the cap only prevents multi-thousand-row DOM renders.
 */
const DISPLAY_CAP = 200;

function qualifies(
  c: InvestigationSummary,
  filter: (typeof FILTERS)[number]["key"],
  recentCaseIds: Set<string>
): boolean {
  switch (filter) {
    case "high-value":
      return c.reported_amount >= 500000;
    case "many-candidates":
      return c.num_candidates >= 40;
    case "recent":
      // The dataset is historical (fixed 2025 complaint dates), so "recent"
      // means the newest records by complaint time — not wall-clock recency,
      // which would make this filter permanently empty.
      return recentCaseIds.has(c.case_id);
    default:
      return true;
  }
}

export default function InvestigationsPage() {
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sortBy, setSortBy] = useState<SortKey>("complaint_time");

  // Case ids of the RECENT_COUNT newest records by complaint time — used by
  // the "Most Recent 25" filter (see qualifies).
  const recentCaseIds = useMemo(() => {
    const newest = [...cases]
      .sort(
        (a, b) =>
          new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime()
      )
      .slice(0, RECENT_COUNT);
    return new Set(newest.map((c) => c.case_id));
  }, [cases]);

  useEffect(() => {
    api
      .listInvestigations()
      .then((data) => setCases(data.investigations))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = cases
    .filter(
      (c) =>
        qualifies(c, filter, recentCaseIds) &&
        (c.case_id.toLowerCase().includes(search.toLowerCase()) ||
          c.fraud_scenario.toLowerCase().includes(search.toLowerCase()) ||
          c.origin_metro.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === "reported_amount") return b.reported_amount - a.reported_amount;
      if (sortBy === "num_candidates") return b.num_candidates - a.num_candidates;
      return new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime();
    });

  // Display cap: render only the first rows of the current sort. Search and
  // filters narrow the set before this cap, so the full corpus remains
  // reachable — this only prevents multi-thousand-row DOM renders.
  const visibleRows = filtered.slice(0, DISPLAY_CAP);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-52 skeleton" />
        <div className="flex gap-3">
          <div className="h-9 flex-1 skeleton" />
          <div className="h-9 w-40 skeleton" />
        </div>
        <div className="overflow-hidden rounded-lg border border-sentinel-border bg-sentinel-surface">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-16 border-t border-sentinel-border-subtle px-4 py-2.5"
            >
              <div className="h-4 w-24 skeleton" />
              <div className="h-4 w-28 skeleton rounded-full" />
              <div className="h-4 w-16 skeleton" />
              <div className="h-4 w-16 skeleton" />
              <div className="h-4 w-20 skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-800">Failed to load: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — queue identity + primary action */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold uppercase tracking-[0.08em] text-sentinel-text">
            Investigation Queue
          </h1>
          <p className="mt-0.5 text-xs text-sentinel-text-muted">
            {cases.length} synthetic cases awaiting investigator review
          </p>
        </div>
        <Link href="/investigations/new" className="btn-primary text-xs">
          + New Investigation
        </Link>
      </div>

      {/* Controls: search + filters + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by ID, scenario, or metro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 rounded-md border border-sentinel-border bg-sentinel-surface px-3 py-2 text-sm text-sentinel-text placeholder:text-sentinel-text-muted focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500"
        />
        <div className="flex overflow-hidden rounded-md border border-sentinel-border">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "text-white"
                  : "text-sentinel-text-secondary hover:bg-sentinel-surface-alt"
              }`}
              style={filter === f.key ? { background: "var(--accent)" } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-md border border-sentinel-border bg-sentinel-surface px-3 py-2 text-sm text-sentinel-text focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500"
        >
          <option value="complaint_time">Sort by Date</option>
          <option value="reported_amount">Sort by Amount</option>
          <option value="num_candidates">Sort by Candidates</option>
        </select>
      </div>

      {/* Queue table — dense, technical; scrolls horizontally on narrow
          screens instead of being clipped by the panel. */}
      <div className="overflow-x-auto rounded-lg border border-sentinel-border bg-sentinel-surface">
        <table className="min-w-full divide-y divide-sentinel-border">
          <thead className="bg-sentinel-surface-alt">
            <tr>
              {["Case ID", "Type", "Amount", "Metro", "Candidates", "Filed", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-sentinel-text-muted"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-sentinel-border-subtle">
            {visibleRows.map((c) => (
              <tr key={c.case_id} className="group transition-colors hover:bg-sentinel-surface-alt">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Link
                    href={`/investigations/${c.case_id}`}
                    className="font-mono text-sm font-semibold text-sentinel-text group-hover:underline"
                  >
                    {c.case_id}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`badge text-[10px] ${SCENARIO_BADGES[c.fraud_scenario] || "badge-gray"}`}>
                    {scenarioLabel(c.fraud_scenario)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-sm text-sentinel-text-secondary">
                  {formatINR(c.reported_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-sentinel-text-secondary">
                  {c.origin_metro}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-sm text-sentinel-text-secondary">
                  {c.num_candidates}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-sentinel-text-muted">
                  {formatDate(c.complaint_time)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <Link
                    href={`/investigations/${c.case_id}`}
                    className="text-xs font-medium text-sentinel-600 opacity-0 transition-opacity hover:text-sentinel-800 group-hover:opacity-100"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > visibleRows.length && (
        <div className="py-3 text-center text-xs text-sentinel-text-muted">
          Showing first {visibleRows.length} of {filtered.length} matching cases —
          refine the search or filters to narrow further.
        </div>
      )}

      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-sentinel-text-muted">
          No cases match the current search and filters.
        </div>
      )}
    </div>
  );
}
