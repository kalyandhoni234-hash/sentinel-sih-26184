"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import type {
  HealthResponse,
  InvestigationSummary,
  RankedCandidate,
  CaseInfo,
} from "@/types/api";
import {
  generateAttentionAlerts,
  type DashboardCandidate,
  type AttentionAlert,
} from "@/lib/alerts";

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
          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-sentinel-600" />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading map…</p>
        </div>
      </div>
    ),
  }
);

const InvestigatorAttention = dynamic(
  () =>
    import("@/components/SentinelMapDashboard").then((m) => ({
      default: m.InvestigatorAttention,
    })),
  { ssr: false }
);

const SCENARIO_LABELS: Record<string, string> = {
  DIRECT_CASHOUT: "Direct Cashout",
  RAPID_MULE_CHAIN: "Rapid Mule Chain",
  MULTI_HOP: "Multi Hop",
  GEOGRAPHIC_JUMP: "Geographic Jump",
  DELAYED_CASHOUT: "Delayed Cashout",
  URBAN_CLUSTER: "Urban Cluster",
  DISPERSED_ACTIVITY: "Dispersed Activity",
};

const SCENARIO_COLORS: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
};

function getPriorityClass(score: number) {
  if (score >= 0.7) return "priority-high";
  if (score >= 0.4) return "priority-medium";
  return "priority-low";
}

function getPriorityLabel(score: number) {
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

type RankingModel = "weighted_baseline" | "random_forest";

const MODEL_LABELS: Record<RankingModel, string> = {
  weighted_baseline: "Weighted Baseline",
  random_forest: "Random Forest",
};

const MODEL_DESCRIPTIONS: Record<RankingModel, string> = {
  weighted_baseline:
    "Transparent weighted scoring across five evidence groups.",
  random_forest:
    "Ensemble model capturing nonlinear interactions among evidence signals.",
};

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(true);
  const [dashboardModel, setDashboardModel] = useState<RankingModel>("weighted_baseline");
  const [mapCandidates, setMapCandidates] = useState<DashboardCandidate[]>([]);
  const [mapOrigins, setMapOrigins] = useState<
    Pick<CaseInfo, "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude">[]
  >([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [modelComparisons, setModelComparisons] = useState<
    Record<string, { wbTop1: string | undefined; rfTop1: string | undefined }>
  >({});
  const [attentionLoading, setAttentionLoading] = useState(false);

  useEffect(() => {
    api.getHealth().then(setHealth).catch((err) => setHealthError(err.message));
    api.listInvestigations()
      .then((data) => { setCases(data.investigations); setCasesLoading(false); })
      .catch((err) => { setCasesError(err.message); setCasesLoading(false); });
  }, []);

  useEffect(() => {
    if (cases.length === 0) return;
    const sorted = [...cases].sort(
      (a, b) => new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime()
    );
    const topCases = sorted.slice(0, 20);
    setMapLoading(true);
    Promise.allSettled(
      topCases.map((c) =>
        api.rankCandidates(c.case_id, { model: dashboardModel, top_k: 5 }).then((res) => ({ caseId: c.case_id, res }))
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
  }, [cases, dashboardModel]);

  useEffect(() => {
    if (cases.length === 0) return;
    const sorted = [...cases].sort(
      (a, b) => new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime()
    );
    const top5 = sorted.slice(0, 5);
    setAttentionLoading(true);
    Promise.allSettled(
      top5.map((c) =>
        Promise.all([
          api.rankCandidates(c.case_id, { model: "weighted_baseline", top_k: 1 }),
          api.rankCandidates(c.case_id, { model: "random_forest", top_k: 1 }),
        ]).then(([wbRes, rfRes]) => ({
          caseId: c.case_id,
          wbTop1: wbRes.ranked_candidates[0]?.location_id,
          rfTop1: rfRes.ranked_candidates[0]?.location_id,
        }))
      )
    ).then((results) => {
      const comparisons: Record<string, { wbTop1: string | undefined; rfTop1: string | undefined }> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          comparisons[r.value.caseId] = { wbTop1: r.value.wbTop1, rfTop1: r.value.rfTop1 };
        }
      }
      setModelComparisons(comparisons);
      setAttentionLoading(false);
    });
  }, [cases]);

  const stats = useMemo(() => {
    const totalCandidates = cases.reduce((s, c) => s + c.num_candidates, 0);
    const metros = new Set(cases.map((c) => c.origin_metro));
    const scenarios: Record<string, number> = {};
    for (const c of cases) { scenarios[c.fraud_scenario] = (scenarios[c.fraud_scenario] || 0) + 1; }
    return { totalCandidates, metroCount: metros.size, scenarios };
  }, [cases]);

  const priorityStats = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    for (const c of mapCandidates) {
      if (c.risk_score >= 0.7) high++;
      else if (c.risk_score >= 0.4) medium++;
      else low++;
    }
    return { high, medium, low, total: mapCandidates.length };
  }, [mapCandidates]);

  const topLocations = useMemo(() => {
    const seen = new Set<string>();
    const tops: DashboardCandidate[] = [];
    for (const c of mapCandidates) {
      if (c.rank === 1 && !seen.has(c.caseId)) {
        seen.add(c.caseId);
        tops.push(c);
      }
    }
    return tops.sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  }, [mapCandidates]);

  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.complaint_time).getTime() - new Date(a.complaint_time).getTime())
      .slice(0, 8);
  }, [cases]);

  const attentionAlerts = useMemo(() => {
    return generateAttentionAlerts(mapCandidates, modelComparisons);
  }, [mapCandidates, modelComparisons]);

  const error = healthError || casesError;

  return (
    <div className="space-y-5">
      {/* ── SYSTEM STATUS BAR ── */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${healthError ? "bg-red-500" : "bg-green-500"}`} />
          {healthError ? "API Offline" : health ? `API v${health.version}` : "Connecting…"}
        </span>
        <span className="h-3 w-px" style={{ background: "var(--border)" }} />
        <span>{cases.length} Synthetic Cases</span>
        <span className="h-3 w-px" style={{ background: "var(--border)" }} />
        <span>{MODEL_LABELS[dashboardModel]}</span>
        <span className="h-3 w-px" style={{ background: "var(--border)" }} />
        <span>Seed 42 · 5 Metros · 44 Locations</span>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">
            Cannot connect to API: {error}
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-500">
            Ensure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {/* ── INTELLIGENCE OVERVIEW ── */}
      <div className="intel-panel">
        <div className="intel-header flex items-center justify-between">
          <h2 className="section-label">Intelligence Overview</h2>
          <div className="flex items-center gap-2">
            <label className="section-label">Model:</label>
            <select
              value={dashboardModel}
              onChange={(e) => setDashboardModel(e.target.value as RankingModel)}
              className="rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-sentinel-500"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="weighted_baseline">Weighted Baseline</option>
              <option value="random_forest">Random Forest</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Cases", value: casesLoading ? "—" : cases.length, sub: "Active investigations" },
            { label: "Candidates", value: casesLoading ? "—" : stats.totalCandidates, sub: "Total ranked" },
            { label: "High Priority", value: priorityStats.total > 0 ? priorityStats.high : "—", sub: "Score ≥ 0.7", accent: "text-red-600 dark:text-red-400" },
            { label: "Medium", value: priorityStats.total > 0 ? priorityStats.medium : "—", sub: "Score 0.4–0.7", accent: "text-amber-600 dark:text-amber-400" },
            { label: "Metros", value: casesLoading ? "—" : stats.metroCount, sub: "Coverage areas" },
            { label: "Disagreements", value: Object.keys(modelComparisons).length > 0
              ? Object.values(modelComparisons).filter(c => c.wbTop1 !== c.rfTop1).length
              : "—", sub: "Top-1 model diffs" },
          ].map((kpi) => (
            <div key={kpi.label} className="intel-section flex flex-col items-center py-4">
              <div className={`intel-metric-value ${kpi.accent || ""}`}>{kpi.value}</div>
              <div className="intel-metric-label">{kpi.label}</div>
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRIORITY DISTRIBUTION ── */}
      {priorityStats.total > 0 && (
        <div className="intel-panel">
          <div className="intel-section">
            <h3 className="section-label mb-3">Priority Distribution</h3>
            <p className="mb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {priorityStats.total} ranked candidates · {mapOrigins.length} recent cases · {MODEL_LABELS[dashboardModel]}
            </p>
            <div className="space-y-2">
              {[
                { label: "High", count: priorityStats.high, color: "bg-red-500", textColor: "text-red-700 dark:text-red-400" },
                { label: "Medium", count: priorityStats.medium, color: "bg-amber-500", textColor: "text-amber-700 dark:text-amber-400" },
                { label: "Low", count: priorityStats.low, color: "bg-green-500", textColor: "text-green-700 dark:text-green-400" },
              ].map((bar) => {
                const pct = priorityStats.total > 0 ? Math.round((bar.count / priorityStats.total) * 100) : 0;
                return (
                  <div key={bar.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium ${bar.textColor}`}>{bar.label}</span>
                      <span style={{ color: "var(--text-muted)" }}>{bar.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-alt)" }}>
                      <div className={`h-full rounded-full ${bar.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── INVESTIGATOR ATTENTION ── */}
      {mapCandidates.length > 0 && (
        <InvestigatorAttention alerts={attentionAlerts} loading={attentionLoading} />
      )}

      {/* ── MAP + TOP LOCATIONS SPLIT ── */}
      <div className="split-view">
        {/* Map */}
        <div className="intel-panel overflow-hidden">
          <div className="intel-header flex items-center justify-between">
            <div>
              <h3 className="section-label">Geographic Intelligence</h3>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Ranked candidate locations from available investigations
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

        {/* Right Panel: Top Locations + Queue */}
        <div className="space-y-0">
          {/* Top Priority Locations */}
          <div className="intel-panel">
            <div className="intel-header">
              <h3 className="section-label">Top Priority Locations</h3>
            </div>
            {topLocations.length === 0 && !mapLoading ? (
              <div className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                Ranking data loading…
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {topLocations.map((c, i) => (
                  <Link
                    key={`${c.caseId}-${c.location_id}`}
                    href={`/investigations/${c.caseId}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sentinel-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                          {c.location_id}
                        </span>
                        <span className={`priority-indicator ${getPriorityClass(c.risk_score)}`}>
                          {getPriorityLabel(c.risk_score)}
                        </span>
                      </div>
                      {c.location && (
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {c.location.location_type} · {c.location.region}, {c.location.metro}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {c.risk_score.toFixed(3)}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        {c.caseId}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Investigation Queue */}
          <div className="intel-panel">
            <div className="intel-header flex items-center justify-between">
              <h3 className="section-label">Investigation Queue</h3>
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
                  const badge = SCENARIO_COLORS[c.fraud_scenario] || "badge-gray";
                  const scenarioLabel = SCENARIO_LABELS[c.fraud_scenario] || c.fraud_scenario.replace(/_/g, " ");
                  return (
                    <Link
                      key={c.case_id}
                      href={`/investigations/${c.case_id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {c.case_id}
                          </span>
                          <span className={`badge text-[10px] ${badge}`}>{scenarioLabel}</span>
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
                  const badge = SCENARIO_COLORS[scenario] || "badge-gray";
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

      {/* ── QUICK ACTIONS ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/investigations/new"
          className="intel-panel flex items-center gap-3 p-4 transition-colors hover:border-sentinel-300 dark:hover:border-sentinel-700"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sentinel-600 text-sm font-bold text-white">
            +
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>New Investigation</h3>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Run SENTINEL analysis pipeline</p>
          </div>
        </Link>
        <Link href="/investigations" className="intel-panel p-4 transition-colors hover:border-sentinel-300 dark:hover:border-sentinel-700">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Investigations</h3>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Browse {cases.length} synthetic cases and ranked candidates.
          </p>
        </Link>
        <Link href="/health" className="intel-panel p-4 transition-colors hover:border-sentinel-300 dark:hover:border-sentinel-700">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>System Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${healthError ? "bg-red-500" : "bg-green-500"}`} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {healthError ? "API Offline" : health ? `Operational · v${health.version}` : "Checking…"}
            </span>
          </div>
        </Link>
      </div>

      {/* ── DISCLAIMER ── */}
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-950/20">
        <p className="text-[11px] text-yellow-800 dark:text-yellow-400">
          <strong>Disclaimer:</strong> This is an investigator decision-support tool. Ranked candidates represent
          evidence-based priority scores, not guaranteed predictions. All data is synthetic for demonstration purposes.
        </p>
      </div>
    </div>
  );
}
