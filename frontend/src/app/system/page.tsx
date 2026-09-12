"use client";

import { useHealth } from "@/hooks/useHealth";
import {
  baselineEvaluation,
  rfEvaluation,
  metricComparison,
  evaluationProvenance,
  RANKING_PIPELINE,
  SYSTEM_ARCHITECTURE,
} from "@/lib/evaluation";

/**
 * SYSTEM — the SENTINEL system & model-evaluation workspace (Phase 8).
 *
 * This is the technical/control side of the platform, not a live SOC
 * dashboard. Honesty rules binding on this page:
 *  - System status comes from the real /health endpoint and is rendered
 *    only as OPERATIONAL / CONNECTING / OFFLINE — no invented telemetry.
 *  - The evaluation snapshot presents the project's offline evaluation
 *    artifact verbatim (docs/rf_evaluation.json) and is explicitly labeled
 *    as an evaluation result, never as live / real-time / production
 *    accuracy. No metric is invented; nothing unavailable says "NOT EXPOSED".
 *  - The model comparison states observed differences between the two
 *    ranking methods only; it does not declare one model superior — with
 *    60 evaluation cases the observed deltas are small and scenario
 *    results are mixed.
 *  - The pipeline and architecture views are explanatory only: no
 *    fabricated execution times, percentages, throughput, or status values.
 */

type HealthStatus = "operational" | "connecting" | "offline";

const STATUS_META: Record<
  HealthStatus,
  { label: string; color: string; bg: string }
> = {
  operational: {
    label: "OPERATIONAL",
    color: "var(--success)",
    bg: "var(--surface)",
  },
  connecting: {
    label: "CONNECTING",
    color: "var(--text-muted)",
    bg: "var(--surface)",
  },
  offline: {
    label: "OFFLINE",
    color: "var(--danger)",
    bg: "var(--surface)",
  },
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function SystemPage() {
  // Shared session-cached health hook — the same single /health fetch the
  // shell uses. No duplicate request from this page.
  const { health, error: healthError, status: hookStatus } = useHealth();
  const status: HealthStatus =
    hookStatus === "operational"
      ? "operational"
      : hookStatus === "offline"
        ? "offline"
        : "connecting";

  const statusMeta = STATUS_META[status];

  return (
    <div className="space-y-6 p-3 sm:p-5">
      {/* ══ A1. SYSTEM HEADER ══ */}
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-lg font-bold uppercase tracking-[0.08em] text-sentinel-text">
            SENTINEL System
          </h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              borderColor: statusMeta.color,
              color: statusMeta.color,
              background: statusMeta.bg,
            }}
            aria-label={`System status: ${statusMeta.label}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: statusMeta.color }}
            />
            {statusMeta.label}
          </span>
          <span
            className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sentinel-text-muted"
            style={{ borderColor: "var(--border)" }}
          >
            Synthetic Data
          </span>
        </div>
        <p className="mt-1 text-xs text-sentinel-text-muted">
          System health, model evaluation, and platform information.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <HeaderFact label="System Status" value={statusMeta.label} mono />
          <HeaderFact
            label="Version"
            value={health ? `v${health.version}` : "—"}
            mono
          />
          <HeaderFact label="Data Mode" value="Synthetic dataset" />
          <HeaderFact
            label="Available Models"
            value={health ? String(health.models_available.length) : "—"}
            mono
          />
        </div>
        {status === "offline" && (
          <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
            API offline: {healthError}
          </p>
        )}
      </header>

      {/* ══ A2. MODEL EVALUATION SNAPSHOT ══ */}
      <section className="intel-panel" aria-labelledby="eval-snapshot">
        <div className="intel-header flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="eval-snapshot" className="section-label" style={{ color: "var(--text-secondary)" }}>
              Model Evaluation Snapshot
            </h2>
            <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
              Evaluation results from the synthetic evaluation dataset — an
              offline benchmark, not live or real-time performance.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span
              className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sentinel-text-muted"
              style={{ borderColor: "var(--border)" }}
            >
              Offline Evaluation
            </span>
            <span
              className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sentinel-text-muted"
              style={{ borderColor: "var(--border)" }}
            >
              Ground Truth: Evaluation Harness Only
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <ModelEvalCard model={baselineEvaluation} />
          <ModelEvalCard model={rfEvaluation} />
        </div>

        {/* factual comparison — deltas only, no superiority claim */}
        <div className="px-4 pb-4">
          <p className="section-label mb-2">Observed Metric Differences</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Metric", "Weighted Baseline", "Random Forest", "Δ (RF − WB)"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-sentinel-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricComparison.map((row) => {
                  const isRank = !row.higherIsBetter;
                  const fmt = (v: number) =>
                    isRank ? v.toFixed(2) : pct(v);
                  return (
                    <tr key={row.metric} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="px-3 py-1.5 text-sentinel-text-secondary">{row.metric}</td>
                      <td className="px-3 py-1.5 font-mono text-sentinel-text">{fmt(row.baseline)}</td>
                      <td className="px-3 py-1.5 font-mono text-sentinel-text">{fmt(row.rf)}</td>
                      <td className="px-3 py-1.5 font-mono text-sentinel-text-muted">
                        {row.delta >= 0 ? "+" : ""}
                        {isRank ? row.delta.toFixed(2) : (row.delta * 100).toFixed(1) + "pp"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-sentinel-text-muted">
            Differences between the two ranking methods are small on this
            evaluation set ({evaluationProvenance.testCases} cases) and vary by
            scenario; SENTINEL does not declare either method superior. Metrics
            measure where the evaluation harness&apos;s known cash-out location
            lands in each ranking — the investigator-facing API never uses
            ground truth.
          </p>
        </div>

        {/* provenance */}
        <div className="px-4 pb-4">
          <p className="section-label mb-1.5">Evaluation Provenance</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-5">
            <HeaderFact label="Artifact" value="docs/rf_evaluation.json" mono small />
            <HeaderFact label="Seed" value={String(evaluationProvenance.seed)} mono small />
            <HeaderFact
              label="Train / Test Cases"
              value={`${evaluationProvenance.trainCases} / ${evaluationProvenance.testCases}`}
              mono
              small
            />
            <HeaderFact label="Features" value={String(evaluationProvenance.totalFeatures)} mono small />
            <HeaderFact
              label="Evaluated"
              value={evaluationProvenance.evaluationTimestamp.slice(0, 10)}
              mono
              small
            />
          </div>
        </div>
      </section>

      {/* ══ A3. RANKING PIPELINE ══ */}
      <section className="intel-panel p-4" aria-labelledby="pipeline">
        <h2 id="pipeline" className="section-label" style={{ color: "var(--text-secondary)" }}>
          Ranking Pipeline
        </h2>
        <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
          Explanatory view of how a case becomes a prioritized list. Stage
          states and execution telemetry are not exposed by the system and are
          intentionally not shown.
        </p>
        <ol className="mt-3 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          {RANKING_PIPELINE.map((stage, i) => (
            <li
              key={stage.key}
              className="rounded-md border p-3"
              style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
            >
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-sentinel-text-muted">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs font-bold text-sentinel-text">{stage.title}</p>
              <p className="mt-1 text-[10px] leading-snug text-sentinel-text-muted">
                {stage.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ══ A4. DATA / API DISCLOSURE ══ */}
      <section className="rounded-lg border p-4" style={{ borderColor: "var(--warning)", background: "var(--warning-dim)" }} aria-labelledby="disclosure">
        <h2 id="disclosure" className="section-label" style={{ color: "var(--warning)" }}>
          Data &amp; API Disclosure
        </h2>
        <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-sentinel-text-secondary">
          <li>
            <strong>Synthetic data:</strong> all cases, transactions, accounts,
            locations, and scores in this demonstration are synthetic and
            seeded for reproducibility.
          </li>
          <li>
            <strong>No live NCRP data</strong> is connected, and{" "}
            <strong>no live bank transaction feed</strong> is connected. The
            platform reads only its bundled synthetic dataset through its own
            API.
          </li>
          <li>
            <strong>Candidate ranking is prioritization for investigator
            review</strong> — relative prioritization based on observed
            evidence. It does not establish certainty about a future cash-out
            event, does not predict exact ATM locations, and does not
            guarantee a next withdrawal at any location.
          </li>
          <li>
            <strong>Unsupported fields are not displayed.</strong> Where the
            API does not expose a value (group weights, per-request model
            confidence, live system telemetry), the UI says so instead of
            inventing one.
          </li>
          <li>
            <strong>Decision support only.</strong> SENTINEL supports
            investigator judgment; it does not make autonomous law-enforcement
            decisions.
          </li>
        </ul>
      </section>

      {/* ══ A5. SYSTEM ARCHITECTURE ══ */}
      <section className="intel-panel p-4" aria-labelledby="architecture">
        <h2 id="architecture" className="section-label" style={{ color: "var(--text-secondary)" }}>
          System Architecture
        </h2>
        <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
          The components that actually make up this deployment.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {SYSTEM_ARCHITECTURE.map((layer, i) => (
            <div
              key={layer.key}
              className="rounded-md border p-3"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-sentinel-text">
                <span className="font-mono text-[9px] text-sentinel-text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {layer.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {layer.components.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-[10px] leading-snug text-sentinel-text-muted">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══ API + models (from real /health) ══ */}
      {health && (
        <section className="intel-panel p-4" aria-labelledby="api">
          <h2 id="api" className="section-label" style={{ color: "var(--text-secondary)" }}>
            API Surface
          </h2>
          <p className="mt-0.5 text-[11px] text-sentinel-text-muted">
            Endpoints and models reported by the running backend (v{health.version}).
          </p>
          <div className="mt-3 space-y-1.5">
            {[
              { method: "GET", path: "/health", desc: "Health check" },
              { method: "GET", path: "/api/v1/investigations", desc: "List all cases" },
              { method: "GET", path: "/api/v1/investigations/{case_id}", desc: "Case details" },
              { method: "POST", path: "/api/v1/investigations/{case_id}/rank", desc: "Rank candidates" },
              { method: "GET", path: "/api/v1/investigations/{case_id}/transactions", desc: "Transaction evidence" },
            ].map((ep) => (
              <div
                key={ep.path}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-alt)" }}
              >
                <span
                  className="rounded px-1.5 py-px font-mono text-[9px] font-bold"
                  style={{
                    background: ep.method === "GET" ? "var(--accent-dim)" : "var(--warning-dim)",
                    color: ep.method === "GET" ? "var(--accent)" : "var(--warning)",
                  }}
                >
                  {ep.method}
                </span>
                <code className="font-mono text-xs text-sentinel-text">{ep.path}</code>
                <span className="text-[10px] text-sentinel-text-muted">{ep.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {health.models_available.map((m) => (
              <span
                key={m}
                className="rounded border px-2 py-0.5 font-mono text-[10px] text-sentinel-text-secondary"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {m}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HeaderFact({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p
        className={`mt-0.5 ${small ? "text-[11px]" : "text-sm"} font-medium text-sentinel-text ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ModelEvalCard({ model }: { model: typeof baselineEvaluation }) {
  const metrics = [
    { label: "Top-1", value: pct(model.top1), sub: `${model.top1Count}/${model.totalCases} cases` },
    { label: "Top-3", value: pct(model.top3), sub: `${model.top3Count}/${model.totalCases} cases` },
    { label: "Top-5", value: pct(model.top5), sub: `${model.top5Count}/${model.totalCases} cases` },
    { label: "MRR", value: model.mrr.toFixed(4), sub: "mean reciprocal rank" },
    { label: "Mean Rank", value: model.meanRank.toFixed(2), sub: "of true location" },
    { label: "Median Rank", value: model.medianRank.toFixed(1), sub: "of true location" },
  ];
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-sentinel-text">
        {model.modelName}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2.5">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="section-label">{m.label}</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-sentinel-text">{m.value}</p>
            <p className="text-[9px] text-sentinel-text-muted">{m.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
