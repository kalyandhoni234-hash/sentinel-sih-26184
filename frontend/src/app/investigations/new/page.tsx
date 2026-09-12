"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { SCENARIO_BADGES } from "@/lib/labels";
import type { CaseInfo, InvestigationSummary } from "@/types/api";

type MatchState = "idle" | "loading" | "matched" | "none";

function readableError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

function scenarioLabel(scenario: string): string {
  return scenario
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function matchScore(
  c: InvestigationSummary,
  enteredAmount: number,
  enteredTime: Date | null
): number {
  const amountPct = Math.abs(c.reported_amount - enteredAmount) / enteredAmount;
  if (!enteredTime) return amountPct;
  const diffHours =
    Math.abs(new Date(c.complaint_time).getTime() - enteredTime.getTime()) /
    3_600_000;
  const timeScore = Math.min(diffHours / 24, 1);
  return 0.7 * amountPct + 0.3 * timeScore;
}

export default function NewInvestigationPage() {
  const router = useRouter();

  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesRetry, setCasesRetry] = useState(0);

  const [scenario, setScenario] = useState("");
  const [metro, setMetro] = useState("");
  const [complaintTime, setComplaintTime] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [matches, setMatches] = useState<InvestigationSummary[]>([]);
  const [selected, setSelected] = useState<InvestigationSummary | null>(null);
  const [detail, setDetail] = useState<CaseInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCasesLoading(true);
    setCasesError(null);
    api
      .listInvestigations()
      .then((data) => {
        if (!cancelled) setCases(data.investigations);
      })
      .catch((err) => {
        if (!cancelled) setCasesError(readableError(err));
      })
      .finally(() => {
        if (!cancelled) setCasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [casesRetry]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api
      .getInvestigation(selected.case_id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(readableError(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, detailRetry]);

  const scenarios = useMemo(
    () =>
      Array.from(new Set(cases.map((c) => c.fraud_scenario))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [cases]
  );

  const metros = useMemo(
    () =>
      Array.from(new Set(cases.map((c) => c.origin_metro))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [cases]
  );

  const libraryCases = useMemo(() => {
    const q = search.toLowerCase();
    return cases.filter(
      (c) =>
        c.case_id.toLowerCase().includes(q) ||
        c.fraud_scenario.toLowerCase().includes(q) ||
        c.origin_metro.toLowerCase().includes(q)
    );
  }, [cases, search]);

  function handleFindMatch() {
    setFormError(null);
    const amountNum = parseAmount(amount);
    if (!scenario) {
      setFormError("Select a fraud scenario from the complaint.");
      return;
    }
    if (!metro) {
      setFormError("Select the origin metro from the complaint.");
      return;
    }
    if (amountNum === null) {
      setFormError("Enter a valid reported amount (e.g. 337093).");
      return;
    }
    setMatchState("loading");
    setMatches([]);
    setDetail(null);
    setSelected(null);
    window.setTimeout(() => {
      const bucket = cases.filter(
        (c) => c.fraud_scenario === scenario && c.origin_metro === metro
      );
      if (bucket.length === 0) {
        setMatchState("none");
        return;
      }
      const enteredTime = parseLocalDateTime(complaintTime);
      const scored = [...bucket].sort(
        (a, b) =>
          matchScore(a, amountNum, enteredTime) -
          matchScore(b, amountNum, enteredTime)
      );
      setMatches(scored);
      setSelected(scored[0]);
      setMatchState("matched");
    }, 250);
  }

  function handleLibrarySelect(c: InvestigationSummary) {
    setMatchState("idle");
    setMatches([]);
    setSelected(c);
  }

  const inputClass =
    "w-full rounded-md border border-sentinel-border px-3 py-2 text-sm focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500";
  const labelClass = "block text-xs font-medium text-sentinel-text-muted mb-1";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">            <h2 className="text-xl font-bold text-sentinel-text">New Investigation</h2>
          <span className="badge-red">SYNTHETIC DEMO MODE</span>
        </div>
        <p className="mt-1 text-sm text-sentinel-text-muted">
          Enter the information available from the complaint.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-sentinel-text-muted">
          All data in this demonstration is synthetic. In a production
          deployment, this information would come from authorized investigation
          systems. No real police, banking, NCRP, or personal data is used.
        </p>
      </div>

      {casesLoading && cases.length === 0 && (
        <div className="space-y-4">
          <div className="card">
            <div className="h-5 w-48 skeleton" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-1 h-3 w-24 skeleton" />
                  <div className="h-9 w-full skeleton" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <div className="h-9 w-48 skeleton" />
              <div className="h-9 w-52 skeleton" />
            </div>
          </div>
        </div>
      )}

      {casesError && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            Backend unavailable — could not load the synthetic case dataset:{" "}
            {casesError}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Make sure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>{" "}
            and try again.
          </p>
          <button
            onClick={() => setCasesRetry((n) => n + 1)}
            className="btn-secondary mt-3"
          >
            Retry
          </button>
        </div>
      )}

      {!casesLoading && !casesError && cases.length === 0 && (
        <div className="card">
          <p className="text-sm text-sentinel-text-muted">
            No cases available. Generate the synthetic dataset first.
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <>
          <div className="card">
            <h3 className="font-semibold text-sentinel-text">
              Complaint Information
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="scenario" className={labelClass}>
                  Fraud Scenario
                </label>
                <select
                  id="scenario"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select scenario...</option>
                  {scenarios.map((s) => (
                    <option key={s} value={s}>
                      {scenarioLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="metro" className={labelClass}>
                  Origin Metro
                </label>
                <select
                  id="metro"
                  value={metro}
                  onChange={(e) => setMetro(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select metro...</option>
                  {metros.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="complaint-time" className={labelClass}>
                  Complaint Date &amp; Time
                </label>
                <input
                  id="complaint-time"
                  type="datetime-local"
                  value={complaintTime}
                  onChange={(e) => setComplaintTime(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-sentinel-text-muted">
                  Optional — refines matching to cases filed at a similar time.
                </p>
              </div>
              <div>
                <label htmlFor="amount" className={labelClass}>
                  Reported Amount
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-sentinel-text-muted">
                    ₹
                  </span>
                  <input
                    id="amount"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 337093"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${inputClass} pl-7`}
                  />
                </div>
              </div>
            </div>

            {formError && (
              <p className="mt-3 text-sm text-red-700">{formError}</p>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={handleFindMatch}
                className="btn-primary shrink-0"
              >
                Find Matching Synthetic Case
              </button>
              <button
                onClick={() => setLibraryOpen((o) => !o)}
                className="btn-secondary shrink-0"
              >
                {libraryOpen
                  ? "Hide Demo Case Library"
                  : "Browse Synthetic Case Library"}
              </button>
            </div>
          </div>

          {matchState === "loading" && (
            <div className="card">
              <p className="text-sm text-sentinel-text-muted">
                Finding matching synthetic case...
              </p>
            </div>
          )}

          {matchState === "none" && (
            <div className="card border-yellow-200 bg-yellow-50">
              <h3 className="font-semibold text-sentinel-text">
                No compatible synthetic case found
              </h3>
              <p className="mt-1 text-sm text-sentinel-text-secondary">
                No existing synthetic demonstration case combines the entered
                fraud scenario and origin metro. SENTINEL does not fabricate
                cases or evidence.
              </p>
              <button
                onClick={() => setLibraryOpen(true)}
                className="btn-secondary mt-3"
              >
                Choose from available demo cases
              </button>
            </div>
          )}

          {matchState === "matched" && selected && (
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
                    Synthetic case matched
                  </p>
                  <h3 className="mt-1 font-mono text-lg font-semibold text-sentinel-text">
                    {selected.case_id}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-sentinel-text-secondary">
                    <span
                      className={
                        SCENARIO_BADGES[selected.fraud_scenario] || "badge-red"
                      }
                    >
                      {scenarioLabel(selected.fraud_scenario)}
                    </span>
                    <span>{selected.origin_metro}</span>
                    <span>{formatINR(selected.reported_amount)}</span>
                    <span>{formatDate(selected.complaint_time)}</span>
                  </div>
                </div>
              </div>

              {matches.length > 1 && (
                <div className="mt-4 border-t border-sentinel-border-subtle pt-4">
                  <p className="text-xs text-sentinel-text-muted">
                    {matches.length} compatible synthetic cases match this
                    profile. Select the closest one to review:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {matches.map((c) => (
                      <button
                        key={c.case_id}
                        onClick={() => setSelected(c)}
                        className={`rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors ${
                          selected.case_id === c.case_id
                            ? "border-sentinel-500 bg-sentinel-50 text-sentinel-700"
                            : "border-sentinel-border bg-sentinel-surface text-sentinel-text-secondary hover:bg-sentinel-surface-alt"
                        }`}
                      >
                        {c.case_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs text-sentinel-text-muted">
                Matched to an existing synthetic investigation within the
                canonical synthetic dataset. No transactions, candidate
                locations, or model features are fabricated for this
                demonstration.
              </p>
            </div>
          )}

          {selected && (
            <div className="card">
              <p className="text-xs font-medium uppercase tracking-wider text-sentinel-text-muted">
                Available Evidence
              </p>

              {detailLoading && (
                <div className="py-6 text-center text-sm text-sentinel-text-muted">
                  Loading case evidence...
                </div>
              )}

              {detailError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">
                    Failed to load case evidence: {detailError}
                  </p>
                  <button
                    onClick={() => setDetailRetry((n) => n + 1)}
                    className="btn-secondary mt-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {detail && (
                <>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Synthetic Case</p>
                      <p className="font-mono text-sm font-medium text-sentinel-text">
                        {detail.case_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Fraud Scenario</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {scenarioLabel(detail.fraud_scenario)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Complaint Origin</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {detail.origin_metro}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Complaint Time</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {formatDate(detail.complaint_time)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Reported Amount</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {formatINR(detail.reported_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Accounts Involved</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {detail.num_accounts_involved}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Transactions</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {detail.num_transactions}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sentinel-text-muted">Candidate Locations</p>
                      <p className="text-sm font-medium text-sentinel-text">
                        {detail.num_candidates}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-sentinel-text-secondary">
                      Evidence available for this case (from the SENTINEL
                      dataset):
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-sentinel-text-muted">
                        · Transaction ledger — {detail.num_transactions} observed
                        transfer{detail.num_transactions !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-sentinel-text-muted">
                        · Accounts involved — {detail.num_accounts_involved}
                      </p>
                      <p className="text-xs text-sentinel-text-muted">
                        · Candidate locations — {detail.num_candidates} scored
                        by the ranking model
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] text-sentinel-text-muted">
                      Counts reflect this case&apos;s actual record in the
                      SENTINEL dataset. The complaint narrative itself is not
                      part of the MVP data model.
                    </p>
                  </div>

                  <div className="mt-4 border-t border-sentinel-border-subtle pt-4">
                    <p className="max-w-2xl text-xs text-sentinel-text-muted">
                      SENTINEL will rank candidate locations using evidence
                      available at complaint time. These rankings represent
                      investigative priorities, not guaranteed predictions —
                      SENTINEL does not know the actual cash-out location.
                    </p>
                    <button
                      onClick={() =>
                        router.push(`/investigations/${detail.case_id}`)
                      }
                      className="btn-primary mt-3"
                    >
                      Run SENTINEL Analysis
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {libraryOpen && (
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sentinel-text">
                  Demo Case Library
                </h3>
                <span className="text-xs text-sentinel-text-muted">
                  Browse all {cases.length} canonical synthetic cases
                </span>
              </div>
              <label
                htmlFor="library-search"
                className="mt-4 block text-xs font-medium text-sentinel-text-muted mb-1"
              >
                Search
              </label>
              <input
                id="library-search"
                type="text"
                placeholder="Search by ID, scenario, or metro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
              />
              <div className="mt-2 max-h-72 overflow-y-auto overflow-x-auto rounded-md border border-sentinel-border">
                <table className="min-w-full text-sm" aria-label="Synthetic case library">
                  <thead className="sticky top-0 bg-sentinel-surface-alt">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-sentinel-text-muted">
                        Case
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-sentinel-text-muted">
                        Scenario
                      </th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-sentinel-text-muted sm:table-cell">
                        Metro
                      </th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-sentinel-text-muted sm:table-cell">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sentinel-border-subtle">
                    {libraryCases.map((c) => (
                      <tr
                        key={c.case_id}
                        onClick={() => handleLibrarySelect(c)}
                        className={`cursor-pointer transition-colors ${
                          selected?.case_id === c.case_id
                            ? "bg-sentinel-50"
                            : "hover:bg-sentinel-surface-alt"
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium text-sentinel-text">
                          {c.case_id}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              SCENARIO_BADGES[c.fraud_scenario] || "badge-red"
                            }
                          >
                            {scenarioLabel(c.fraud_scenario)}
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-sentinel-text-secondary sm:table-cell">
                          {c.origin_metro}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-sentinel-text-secondary sm:table-cell">
                          {formatINR(c.reported_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {libraryCases.length === 0 && (
                  <div className="py-6 text-center text-xs text-sentinel-text-muted">
                    No cases match your search.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}