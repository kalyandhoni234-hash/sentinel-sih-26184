"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { getPriorityTier } from "@/lib/tiers";
import { stratifiedByMetro } from "@/lib/sampling";
import {
  SCENARIO_LABELS,
  SCENARIO_BADGES,
  MODEL_LABELS,
} from "@/lib/labels";
import { Disclaimer, DISCLAIMER_SCORE_TEXT } from "@/components/Disclaimer";
import type {
  InvestigationSummary,
  CaseInfo,
} from "@/types/api";
import type { DashboardCandidate } from "@/lib/alerts";

const SentinelMapDashboard = dynamic(
  () =>
    import("@/components/SentinelMapDashboard").then((m) => ({
      default: m.SentinelMapDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[350px] w-full items-center justify-center rounded-lg sm:h-[400px] lg:h-[450px]"
        style={{ background: "var(--surface-alt)" }}>
        <div className="text-center">
          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-sentinel-border border-t-sentinel-600" />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading map…</p>
        </div>
      </div>
    ),
  }
);

type RankingModel = "weighted_baseline" | "random_forest";

/** Corpus totals render from these directly — never hardcode. */
const SAMPLE_SIZE = 24;
/** Bounded map budget: 12 sampled case origins + ≤10 candidates each. */
const MAP_CASES = 12;
const MAP_TOP_K = 10;
const RECENT_COUNT = 10;

/**
 * Homepage — case-set overview.
 *
 * Data sources, all authoritative:
 *  - GET /investigations (single call on mount) — corpus totals, sampling pool
 *  - POST /rank for a deterministic, geography-stratified sample of
 *    SAMPLE_SIZE cases (one case per metro first, then deterministic fill) —
 *    the ONLY source of priority-tier information, which is explicitly
 *    presented as a sampled metric, never a corpus total
 *  - POST /rank for MAP_CASES metro-spread cases (top MAP_TOP_K candidates
 *    each) for the map preview — bounded markers, one case per metro first
 *
 * System status comes from the shared session-cached useHealth hook used by
 * the shell — no duplicate /health call.
 */
export default function HomePage() {
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(true);
  const [dashboardModel, setDashboardModel] = useState<RankingModel>("weighted_baseline");
  const [mapCandidates, setMapCandidates] = useState<DashboardCandidate[]>([]);
  const [sampledCandidates, setSampledCandidates] = useState<DashboardCandidate[]>([]);
  const [mapOrigins, setMapOrigins] = useState<
    Pick<CaseInfo, "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude">[]
  >([]);
  const [mapLoading, setMapLoading] = useState(false);

  useEffect(() => {
    api.listInvestigations()
      .then((data) => { setCases(data.investigations); setCasesLoading(false); })
      .catch((err) => { setCasesError(err.message); setCasesLoading(false); });
  }, []);

  // Deterministic ordering — the stable input to all sampling below.
  const orderedCases = useMemo(
    () =>
      [...cases].sort(
        (a, b) => new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime()
      ),
    [cases]
  );

  // Rank a deterministic, geography-stratified sample (one case per metro
  // first, then deterministic fill) for the priority metrics, and a
  // metro-spread subset for the map. Identical case selection on every run
  // for a given corpus. Priority-tier counts are rendered as SAMPLED metrics.
  useEffect(() => {
    if (orderedCases.length === 0) return;
    const prioritySample = stratifiedByMetro(orderedCases, SAMPLE_SIZE, "homepage-priority-sample");
    const mapCases = stratifiedByMetro(orderedCases, MAP_CASES, "homepage-map-sample");
    setMapLoading(true);
    Promise.allSettled(
      prioritySample.map((c) =>
        api.rankCandidates(c.case_id, { model: dashboardModel, top_k: 10 }).then((res) => ({ caseId: c.case_id, res }))
      )
    ).then((results) => {
      const candidates: DashboardCandidate[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          const { caseId, res } = r.value;
          for (const c of res.ranked_candidates) {
            candidates.push({ ...c, caseId });
          }
        }
      }
      setSampledCandidates(candidates);
    });
    Promise.allSettled(
      mapCases.map((c) =>
        api.rankCandidates(c.case_id, { model: dashboardModel, top_k: MAP_TOP_K }).then((res) => ({ caseId: c.case_id, res }))
      )
    ).then((results) => {
      const candidates: DashboardCandidate[] = [];
      const origins: Pick<CaseInfo, "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude">[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          const { caseId, res } = r.value;
          origins.push({
            case_id: res.case.case_id,
            origin_metro: res.case.origin_metro,
            origin_latitude: res.case.origin_latitude,
            origin_longitude: res.case.origin_longitude,
          });
          for (const c of res.ranked_candidates) {
            candidates.push({ ...c, caseId });
          }
        }
      }
      setMapCandidates(candidates);
      setMapOrigins(origins);
      setMapLoading(false);
    });
  }, [orderedCases, dashboardModel]);

  const stats = useMemo(() => {
    const totalCandidates = cases.reduce((s, c) => s + c.num_candidates, 0);
    const metros = new Set(cases.map((c) => c.origin_metro));
    const scenarios: Record<string, number> = {};
    for (const c of cases) { scenarios[c.fraud_scenario] = (scenarios[c.fraud_scenario] || 0) + 1; }
    return { totalCandidates, metroCount: metros.size, scenarios };
  }, [cases]);

  /** Priority tiers from the SAMPLE only — rendered as sampled metrics. */
  const priorityStats = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    for (const c of sampledCandidates) {
      const tier = getPriorityTier(c.risk_score);
      if (tier === "HIGH") high++;
      else if (tier === "MEDIUM") medium++;
      else low++;
    }
    return { high, medium, low, total: sampledCandidates.length };
  }, [sampledCandidates]);

  const recentCases = useMemo(
    () => orderedCases.slice(0, RECENT_COUNT),
    [orderedCases]
  );

  /** Deterministic metro-spread spotlights — one per metro, then fill. */
  const spotlightCases = useMemo(
    () => stratifiedByMetro(orderedCases, 8, "homepage-spotlight"),
    [orderedCases]
  );

  const mapSampledMetros = useMemo(
    () => new Set(mapOrigins.map((o) => o.origin_metro)).size,
    [mapOrigins]
  );

  return (
    <div className="space-y-5 p-3 sm:p-5">
      {/* ── Page identity ── */}
      <div>
        <h1 className="text-lg font-bold uppercase tracking-[0.08em] text-sentinel-text">
          Case-Set Overview
        </h1>
        <p className="mt-0.5 text-xs text-sentinel-text-muted">
          Geographic and priority context across the synthetic investigation dataset
        </p>
      </div>

      {/* ── ERROR ── */}
      {casesError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Cannot load investigations: {casesError}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Ensure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {/* ── INVESTIGATION OVERVIEW ── */}
      <div className="intel-panel">
        <div className="intel-header flex items-center justify-between">
          <h2 className="section-label">Dataset Overview</h2>
          <div className="flex items-center gap-2">
            <label className="section-label">Model:</label>
            <select
              value={dashboardModel}
              onChange={(e) => setDashboardModel(e.target.value as RankingModel)}
              className="rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-sentinel-500"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="weighted_baseline">{MODEL_LABELS.weighted_baseline}</option>
              <option value="random_forest">{MODEL_LABELS.random_forest}</option>
            </select>
          </div>
        </div>
        {/* Corpus totals — full synthetic dataset, derived from GET /investigations */}
        <div className="grid grid-cols-3">
          {[
            { label: "Cases", value: cases.length, sub: "Synthetic investigations" },
            { label: "Candidates", value: stats.totalCandidates, sub: "Ranked locations across all cases" },
            { label: "Metros", value: stats.metroCount, sub: "Origin metros represented" },
          ].map((kpi) => (
            <div key={kpi.label} className="intel-section flex flex-col items-center py-5">
              <div className="intel-metric-value text-3xl sm:text-4xl">
                {casesLoading ? "—" : kpi.value.toLocaleString("en-IN")}
              </div>
              <div className="intel-metric-label">{kpi.label}</div>
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>
        {/* Sampled metrics — bounded deterministic sample, explicitly NOT corpus totals */}
        <div
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
            Sampled priority mix — deterministic {SAMPLE_SIZE}-case sample, all metros represented
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
              <span style={{ color: "var(--text-muted)" }}>High {priorityStats.total > 0 ? priorityStats.high : "—"} · ≥0.7</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
              <span style={{ color: "var(--text-muted)" }}>Medium {priorityStats.total > 0 ? priorityStats.medium : "—"} · 0.4–0.7</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} />
              <span style={{ color: "var(--text-muted)" }}>Low {priorityStats.total > 0 ? priorityStats.low : "—"} · &lt;0.4</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── MAP + RECENT CASES ── */}
      <div className="split-view">
        {/* Map */}
        <div className="intel-panel overflow-hidden">
          <div className="intel-header flex items-center justify-between">
            <div>
              <h3 className="section-label">Geographic Intelligence</h3>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {mapOrigins.length > 0
                  ? `${mapOrigins.length} metro-spread sampled investigations · ${mapSampledMetros} metros shown · top ${MAP_TOP_K} candidates each`
                  : "Deterministically sampled across the corpus"}
              </p>
            </div>
            {mapLoading && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Loading…</span>
            )}
          </div>
          <div className="p-1">
            <SentinelMapDashboard candidates={mapCandidates} caseOrigins={mapOrigins} />
          </div>
          <div className="px-4 py-2.5 text-[10px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
            Candidate markers indicate ranked priority level, not confirmed cash-out locations. All data is synthetic.
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-0">
          <div className="intel-panel">
            <div className="intel-header flex items-center justify-between">
              <h3 className="section-label">Recent Investigations</h3>
              <Link href="/investigations" className="text-[10px] font-medium text-sentinel-600 hover:text-sentinel-800">
                View All →
              </Link>
            </div>
            {casesLoading ? (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-20 skeleton" />
                      <div className="h-4 w-14 skeleton rounded-full" />
                      <div className="ml-auto h-4 w-16 skeleton" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {recentCases.map((c) => {
                  const badge = SCENARIO_BADGES[c.fraud_scenario] || "badge-gray";
                  const label = SCENARIO_LABELS[c.fraud_scenario] || c.fraud_scenario.replace(/_/g, " ");
                  return (
                    <Link
                      key={c.case_id}
                      href={`/investigations/${c.case_id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sentinel-surface-alt"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {c.case_id}
                          </span>
                          <span className={`badge text-[10px] ${badge}`}>{label}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          <span>{c.origin_metro}</span>
                          <span>·</span>
                          <span>{formatINR(c.reported_amount)}</span>
                          <span>·</span>
                          <span>{c.num_candidates} candidates</span>
                        </div>
                      </div>
                      <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {formatDate(c.complaint_time)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SCENARIO DISTRIBUTION ── */}
      {Object.keys(stats.scenarios).length > 0 && (
        <div className="intel-panel">
          <div className="intel-section">
            <h3 className="section-label mb-3">Fraud Scenario Distribution</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {Object.entries(stats.scenarios)
                .sort((a, b) => b[1] - a[1])
                .map(([scenario, count]) => {
                  const label = SCENARIO_LABELS[scenario] || scenario.replace(/_/g, " ");
                  return (
                    <div
                      key={scenario}
                      className="rounded-md p-2.5 text-center"
                      style={{ background: "var(--surface-alt)", border: "1px solid var(--border-subtle)" }}
                    >
                      <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{count}</p>
                      <p className="mt-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── INVESTIGATOR SPOTLIGHTS — deterministic metro-spread sample ── */}
      {spotlightCases.length > 0 && (
        <div className="intel-panel">
          <div className="intel-section">
            <h3 className="section-label mb-1">Investigator Spotlights</h3>
            <p className="mb-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              One case per metro, deterministically sampled — a representative sweep of the corpus, not a ranking
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {spotlightCases.map((c) => {
                const badge = SCENARIO_BADGES[c.fraud_scenario] || "badge-gray";
                const label = SCENARIO_LABELS[c.fraud_scenario] || c.fraud_scenario.replace(/_/g, " ");
                return (
                  <Link
                    key={c.case_id}
                    href={`/investigations/${c.case_id}`}
                    className="rounded-md p-2.5 transition-colors hover:bg-sentinel-surface-alt"
                    style={{ background: "var(--surface-alt)", border: "1px solid var(--border-subtle)" }}
                  >
                    <p className="font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {c.case_id}
                    </p>
                    <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                      {c.origin_metro}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className={`badge text-[9px] ${badge}`}>{label}</span>
                      <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                        {formatINR(c.reported_amount)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── DISCLAIMER ── */}
      <Disclaimer variant="panel">
        <strong>Decision-support output:</strong> {DISCLAIMER_SCORE_TEXT} All data is
        synthetic for demonstration purposes.
      </Disclaimer>
    </div>
  );
}
