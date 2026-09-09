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
      <div className="flex h-[350px] w-full items-center justify-center rounded-lg bg-gray-100 sm:h-[400px] lg:h-[450px]">
        <div className="text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-sentinel-600" />
          <p className="text-xs text-gray-500">Loading map...</p>
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

const SCENARIO_BADGES: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
};

function getPriorityLabel(score: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (score >= 0.7)
    return {
      label: "HIGH",
      color: "text-red-700",
      bg: "bg-red-100 border-red-200",
    };
  if (score >= 0.4)
    return {
      label: "MEDIUM",
      color: "text-amber-700",
      bg: "bg-amber-100 border-amber-200",
    };
  return {
    label: "LOW",
    color: "text-green-700",
    bg: "bg-green-100 border-green-200",
  };
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="card">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent || "text-gray-900"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function PriorityBar({
  label,
  count,
  total,
  color,
  textColor,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  textColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColor}`}>{label}</span>
        <span className="text-gray-500">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type RankingModel = "weighted_baseline" | "random_forest";

const MODEL_LABELS: Record<RankingModel, string> = {
  weighted_baseline: "Weighted Baseline",
  random_forest: "Random Forest",
};

const MODEL_DESCRIPTIONS: Record<RankingModel, string> = {
  weighted_baseline:
    "Transparent weighted scoring across five evidence groups. Scores reflect relative risk within a compressed range.",
  random_forest:
    "Trained ensemble model. Produces differentiated probability scores.",
};

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(true);

  // Dashboard ranking model
  const [dashboardModel, setDashboardModel] =
    useState<RankingModel>("weighted_baseline");

  // Map data: ranked candidates from top cases
  const [mapCandidates, setMapCandidates] = useState<DashboardCandidate[]>([]);
  const [mapOrigins, setMapOrigins] = useState<
    Pick<CaseInfo, "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude">[]
  >([]);
  const [mapLoading, setMapLoading] = useState(false);

  // Model comparison data for attention alerts (top 5 cases only)
  const [modelComparisons, setModelComparisons] = useState<
    Record<string, { wbTop1: string | undefined; rfTop1: string | undefined }>
  >({});
  const [attentionLoading, setAttentionLoading] = useState(false);

  // Load health + case list
  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((err) => setHealthError(err.message));

    api
      .listInvestigations()
      .then((data) => {
        setCases(data.investigations);
        setCasesLoading(false);
      })
      .catch((err) => {
        setCasesError(err.message);
        setCasesLoading(false);
      });
  }, []);

  // Load map data from top 20 most recent cases
  useEffect(() => {
    if (cases.length === 0) return;

    const sorted = [...cases].sort(
      (a, b) =>
        new Date(b.complaint_time).getTime() -
        new Date(a.complaint_time).getTime()
    );
    const topCases = sorted.slice(0, 20);

    setMapLoading(true);

    Promise.allSettled(
      topCases.map((c) =>
        api
          .rankCandidates(c.case_id, { model: dashboardModel, top_k: 5 })
          .then((res) => ({
            caseId: c.case_id,
            res,
          }))
      )
    ).then((results) => {
      const candidates: DashboardCandidate[] = [];
      const origins: Pick<
        CaseInfo,
        "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude"
      >[] = [];

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

  // Fetch model comparisons for top 5 cases (for attention alerts)
  useEffect(() => {
    if (cases.length === 0) return;

    const sorted = [...cases].sort(
      (a, b) =>
        new Date(b.complaint_time).getTime() -
        new Date(a.complaint_time).getTime()
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
      const comparisons: Record<
        string,
        { wbTop1: string | undefined; rfTop1: string | undefined }
      > = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          comparisons[r.value.caseId] = {
            wbTop1: r.value.wbTop1,
            rfTop1: r.value.rfTop1,
          };
        }
      }
      setModelComparisons(comparisons);
      setAttentionLoading(false);
    });
  }, [cases]);

  // Derive statistics
  const stats = useMemo(() => {
    const totalCandidates = cases.reduce((s, c) => s + c.num_candidates, 0);
    const metros = new Set(cases.map((c) => c.origin_metro));
    const scenarios: Record<string, number> = {};
    for (const c of cases) {
      scenarios[c.fraud_scenario] = (scenarios[c.fraud_scenario] || 0) + 1;
    }
    return { totalCandidates, metroCount: metros.size, scenarios };
  }, [cases]);

  const priorityStats = useMemo(() => {
    let high = 0,
      medium = 0,
      low = 0;
    for (const c of mapCandidates) {
      if (c.risk_score >= 0.7) high++;
      else if (c.risk_score >= 0.4) medium++;
      else low++;
    }
    return { high, medium, low, total: mapCandidates.length };
  }, [mapCandidates]);

  const topLocations = useMemo(() => {
    // Get the #1 ranked candidate from each case that has been ranked
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
      .sort(
        (a, b) =>
          new Date(b.complaint_time).getTime() -
          new Date(a.complaint_time).getTime()
      )
      .slice(0, 8);
  }, [cases]);

  const attentionAlerts = useMemo(() => {
    return generateAttentionAlerts(mapCandidates, modelComparisons);
  }, [mapCandidates, modelComparisons]);

  const error = healthError || casesError;

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="rounded-lg border border-sentinel-200 bg-gradient-to-br from-sentinel-50 to-white p-5 dark:border-sentinel-800 dark:from-[#0a0f1e] dark:to-[#000000]">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sentinel-600 text-lg font-bold text-white">
            S
          </div>
          <div className="flex-1 space-y-1.5">
            <h2 className="text-lg font-bold text-gray-900">
              SENTINEL Command Center
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-600">
              Evidence-based cybercrime investigation decision support.
              Ranked candidate locations derived from transaction chains, account
              activity, and geographic patterns available at complaint time.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="rounded-full bg-sentinel-100 px-2 py-0.5 text-[10px] font-medium text-sentinel-700">
                Investigator Decision Support
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Synthetic Data Demo
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-[#0a0a0a]">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Ranking Model
            </label>
            <select
              value={dashboardModel}
              onChange={(e) =>
                setDashboardModel(e.target.value as RankingModel)
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500 dark:border-gray-600 dark:bg-[#0a0a0a] dark:text-gray-100"
            >
              <option value="weighted_baseline">Weighted Baseline</option>
              <option value="random_forest">Random Forest</option>
            </select>
            <p className="mt-1 max-w-[200px] text-[10px] leading-tight text-gray-400">
              {MODEL_DESCRIPTIONS[dashboardModel]}
            </p>
          </div>
        </div>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            Cannot connect to API: {error}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Ensure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {/* ── INTELLIGENCE OVERVIEW ── */}
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Intelligence Overview
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Investigations"
            value={casesLoading ? "—" : cases.length}
            sub="Synthetic cases"
          />
          <KpiCard
            label="Total Candidates"
            value={casesLoading ? "—" : stats.totalCandidates}
            sub="Across all cases"
          />
          <KpiCard
            label="High Priority"
            value={priorityStats.total > 0 ? priorityStats.high : "—"}
            sub="Score >= 0.7"
            accent="text-red-600"
          />
          <KpiCard
            label="Medium Priority"
            value={priorityStats.total > 0 ? priorityStats.medium : "—"}
            sub="Score 0.4-0.7"
            accent="text-amber-600"
          />
          <KpiCard
            label="Metro Areas"
            value={casesLoading ? "—" : stats.metroCount}
            sub="Origin metros"
          />
          <KpiCard
            label="API Status"
            value={healthError ? "Error" : health ? "OK" : "—"}
            sub={
              health
                ? `v${health.version}`
                : healthError
                  ? "Unreachable"
                  : "Checking..."
            }
            accent={healthError ? "text-red-600" : "text-green-600"}
          />
        </div>
      </div>

      {/* ── PRIORITY DISTRIBUTION ── */}
      {priorityStats.total > 0 && (
        <div className="card">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Priority Distribution
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            Based on {priorityStats.total} ranked candidates from{" "}
            {mapOrigins.length} recent cases ({MODEL_LABELS[dashboardModel]})
          </p>
          <div className="space-y-2.5">
            <PriorityBar
              label="High Priority"
              count={priorityStats.high}
              total={priorityStats.total}
              color="bg-red-500"
              textColor="text-red-700"
            />
            <PriorityBar
              label="Medium Priority"
              count={priorityStats.medium}
              total={priorityStats.total}
              color="bg-amber-500"
              textColor="text-amber-700"
            />
            <PriorityBar
              label="Low Priority"
              count={priorityStats.low}
              total={priorityStats.total}
              color="bg-green-500"
              textColor="text-green-700"
            />
          </div>
          {priorityStats.high === 0 && priorityStats.medium === 0 && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-[#0d0d0d]">
              <p className="text-[11px] text-gray-500">
                {dashboardModel === "weighted_baseline"
                  ? "All sampled candidates fall below the Medium threshold (0.4). The Weighted Baseline model produces relative risk rankings within a compressed score range. Individual investigation pages use per-case ranking to identify the highest-priority candidates within each case."
                  : "All sampled candidates fall below the Medium threshold (0.4). The Random Forest model produces differentiated probability scores. Individual investigation pages provide detailed candidate-level analysis."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── INVESTIGATOR ATTENTION ── */}
      {mapCandidates.length > 0 && (
        <InvestigatorAttention alerts={attentionAlerts} loading={attentionLoading} />
      )}

      {/* ── RISK & LOCATION OVERVIEW (MAP) ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Risk &amp; Location Overview
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Ranked candidate locations from available investigations
            </p>
          </div>
          {mapLoading && (
            <span className="text-xs text-gray-400">Loading map data…</span>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-[#0a0a0a]">
          <SentinelMapDashboard
            candidates={mapCandidates}
            caseOrigins={mapOrigins}
          />
          <p className="mt-2 px-2 text-[11px] text-gray-400">
            Candidate markers indicate ranked priority level, not confirmed
            cash-out locations. All data is synthetic.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── INVESTIGATION QUEUE ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Investigation Queue
            </h3>
            <Link
              href="/investigations"
              className="text-xs font-medium text-sentinel-600 hover:text-sentinel-800"
            >
              View All →
            </Link>
          </div>
          {casesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-24 skeleton" />
                    <div className="h-5 w-16 skeleton rounded-full" />
                    <div className="ml-auto h-4 w-20 skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {recentCases.map((c) => {
                const badge =
                  SCENARIO_BADGES[c.fraud_scenario] || "badge-gray";
                const scenarioLabel =
                  SCENARIO_LABELS[c.fraud_scenario] ||
                  c.fraud_scenario.replace(/_/g, " ");
                return (
                  <Link
                    key={c.case_id}
                    href={`/investigations/${c.case_id}`}
                    className="card flex items-center gap-3 hover:border-sentinel-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-900">
                          {c.case_id}
                        </span>
                        <span className={`badge text-[10px] ${badge}`}>
                          {scenarioLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>{c.origin_metro}</span>
                        <span>·</span>
                        <span>{formatINR(c.reported_amount)}</span>
                        <span>·</span>
                        <span>{c.num_candidates} candidates</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <div>{formatDate(c.complaint_time)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── TOP PRIORITY LOCATIONS ── */}
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Top Priority Locations
          </h3>
          {topLocations.length === 0 && !mapLoading ? (
            <div className="card text-center py-6 text-sm text-gray-500">
              Ranking data loading…
            </div>
          ) : (
            <div className="space-y-2">
              {topLocations.map((c) => {
                const p = getPriorityLabel(c.risk_score);
                return (
                  <Link
                    key={`${c.caseId}-${c.location_id}`}
                    href={`/investigations/${c.caseId}`}
                    className="card flex items-center gap-3 hover:border-sentinel-300 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sentinel-600 text-xs font-bold text-white">
                      1
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-900">
                          {c.location_id}
                        </span>
                        <span
                          className={`badge border text-[10px] ${p.bg} ${p.color}`}
                        >
                          {p.label}
                        </span>
                      </div>
                      {c.location && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {c.location.location_type} — {c.location.region},{" "}
                          {c.location.metro}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-gray-900">
                        {c.risk_score.toFixed(3)}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {c.caseId}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── SCENARIO DISTRIBUTION ── */}
      {Object.keys(stats.scenarios).length > 0 && (
        <div className="card">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Fraud Scenario Distribution
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
            {Object.entries(stats.scenarios)
              .sort((a, b) => b[1] - a[1])
              .map(([scenario, count]) => {
                const badge = SCENARIO_BADGES[scenario] || "badge-gray";
                const label =
                  SCENARIO_LABELS[scenario] ||
                  scenario.replace(/_/g, " ");
                return (
                  <div key={scenario} className="rounded-md border border-gray-100 bg-gray-50 p-2.5 text-center dark:border-gray-700 dark:bg-[#0d0d0d]">
                    <p className="text-lg font-bold text-gray-900">{count}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-gray-500">
                      {label}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── QUICK ACTIONS + SYSTEM STATUS ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/investigations/new"
          className="card border-sentinel-200 bg-sentinel-50 hover:border-sentinel-400 transition-colors dark:border-sentinel-800 dark:bg-[#0a0f1e] dark:hover:border-sentinel-600"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sentinel-600 text-sm font-bold text-white">
              +
            </div>
            <h3 className="font-semibold text-sentinel-900">New Investigation</h3>
          </div>
          <p className="mt-2 text-sm text-sentinel-700">
            Enter complaint information and run the SENTINEL analysis pipeline.
          </p>
        </Link>
        <Link
          href="/investigations"
          className="card hover:border-sentinel-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900">View Investigations</h3>
          <p className="mt-1 text-sm text-gray-500">
            Browse all {cases.length} synthetic cases and their ranked
            candidate locations.
          </p>
        </Link>
        <Link
          href="/health"
          className="card hover:border-sentinel-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900">System Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${healthError ? "bg-red-500" : "bg-green-500"}`}
            />
            <span className="text-sm text-gray-700">
              {healthError
                ? "API Unreachable"
                : health
                  ? `API Operational — v${health.version}`
                  : "Checking…"}
            </span>
          </div>
          {health && (
            <p className="mt-1.5 text-xs text-gray-400">
              Models: {health.models_available.join(", ")}
            </p>
          )}
        </Link>
      </div>

      {/* ── DISCLAIMER ── */}
      <div className="card border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-[#1a1505]">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> This is an investigator decision-support
          tool. Ranked candidates represent evidence-based priority scores, not
          guaranteed predictions. All data is synthetic for demonstration
          purposes.
        </p>
      </div>
    </div>
  );
}
