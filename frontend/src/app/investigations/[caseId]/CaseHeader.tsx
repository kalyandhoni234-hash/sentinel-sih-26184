"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatINR, formatDate } from "@/lib/format";
import { SCENARIO_BADGES, scenarioLabel } from "@/lib/labels";
import { PipelineTracker } from "@/components/PipelineTracker";
import { useCaseContext } from "./workspace-context";

/**
 * Persistent case context — CaseHeader + case tab navigation.
 *
 * The header stays visible across every case workspace route so the
 * investigator always knows which case they are in. All facts shown come
 * from the authoritative CaseInfo in the shared case context.
 */

/**
 * Case tabs follow the investigation lifecycle:
 * CASE → EVIDENCE → TIMELINE → NETWORK → GEOINTEL → CANDIDATES → REPORT.
 * Horizontally scrollable on small screens so tabs stay usable rather than
 * wrapping uncontrollably.
 */
const CASE_TABS = [
  { segment: "", label: "Overview" },
  { segment: "/transactions", label: "Evidence" },
  { segment: "/timeline", label: "Timeline" },
  { segment: "/network", label: "Network" },
  { segment: "/geointel", label: "GeoIntel" },
  { segment: "/candidates", label: "Candidates" },
  { segment: "/report", label: "Report" },
] as const;

function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  const base = `/investigations/${caseId}`;

  return (
    <nav
      className="flex overflow-x-auto px-3 sm:px-5"
      style={{ borderBottom: "1px solid var(--border)" }}
      aria-label="Case sections"
    >
      {CASE_TABS.map((tab, i) => {
        const href = `${base}${tab.segment}`;
        const active = tab.segment === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? ""
                : "border-transparent text-sentinel-text-secondary hover:text-sentinel-text"
            }`}
            style={
              active
                ? { borderColor: "var(--accent)", color: "var(--text-primary)" }
                : undefined
            }
          >
            {/* Step index reinforces the investigation journey order
                (decorative — screen readers get the label alone). */}
            <span
              aria-hidden
              className="hidden text-[8px] font-mono tracking-widest opacity-60 sm:block"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact case identity rendered into the shell top bar (desktop only). */
function TopBarCaseContext({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("case-context-slot"));
  }, []);

  if (!host) return null;
  return createPortal(children, host);
}

export function CaseHeader() {
  const { caseId, caseInfo, loading, error } = useCaseContext();

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* Compact identity in the shell top bar — the case stays visible while
          scrolling anywhere inside the workspace. */}
      <TopBarCaseContext>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Link
            href={`/investigations/${caseId}`}
            className="shrink-0 font-mono font-semibold text-sentinel-text hover:underline"
          >
            {caseId}
          </Link>
          {caseInfo && (
            <>
              <span className="hidden text-sentinel-text-muted sm:inline">·</span>
              <span className="hidden truncate text-sentinel-text-secondary sm:inline">
                {scenarioLabel(caseInfo.fraud_scenario)} · {caseInfo.origin_metro}
              </span>
            </>
          )}
        </div>
      </TopBarCaseContext>

      <div className="px-3 pb-3 pt-4 sm:px-5">
        {loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-6 w-32 skeleton" />
              <div className="h-4 w-24 skeleton rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="h-2 w-12 skeleton" />
                  <div className="mt-1 h-4 w-16 skeleton" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !caseInfo && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-800">Failed to load case context: {error}</p>
            <p className="mt-1 text-xs text-red-600">
              <Link href="/investigations" className="underline">
                Back to investigation queue
              </Link>
            </p>
          </div>
        )}

        {caseInfo && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-lg font-bold tracking-tight text-sentinel-text">
                  {caseInfo.case_id}
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-sentinel-text-muted">
                  Cyber-Fraud Investigation
                </span>
                <span
                  className={`badge text-[9px] ${
                    SCENARIO_BADGES[caseInfo.fraud_scenario] || "badge-gray"
                  }`}
                >
                  {scenarioLabel(caseInfo.fraud_scenario)}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
                {[
                  { label: "Amount", value: formatINR(caseInfo.reported_amount) },
                  { label: "Filed", value: formatDate(caseInfo.complaint_time) },
                  { label: "Transactions", value: caseInfo.num_transactions.toLocaleString("en-IN") },
                  { label: "Accounts", value: caseInfo.num_accounts_involved },
                  { label: "Candidates", value: caseInfo.num_candidates },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-sentinel-text-muted">
                      {f.label}
                    </p>
                    <p className="font-mono text-xs font-medium text-sentinel-text">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  borderColor: "var(--border)",
                  color: caseInfo.num_candidates > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                }}
              >
                {caseInfo.num_candidates > 0 ? "Analysis Complete" : "Analysis Not Exposed"}
              </span>
              <span
                className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sentinel-text-muted"
                style={{ borderColor: "var(--border)" }}
              >
                Synthetic Data
              </span>
            </div>
          </div>
        )}

        {caseInfo && (
          <div className="mt-3">
            <PipelineTracker caseInfo={caseInfo} hasAnalysis={caseInfo.num_candidates > 0} />
          </div>
        )}
      </div>

      <CaseTabs caseId={caseId} />
    </div>
  );
}
