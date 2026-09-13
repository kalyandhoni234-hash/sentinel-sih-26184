/**
 * System & model-evaluation data (Phase 8).
 *
 * The evaluation snapshot is sourced from the project's evaluation artifact
 * (`docs/rf_evaluation.json`), produced by `scripts/run_rf_evaluation.py`
 * using `src/modeling/evaluation.py`. Importing the artifact directly keeps
 * the UI and the offline evaluation in lockstep — no metric is transcribed,
 * recomputed, or invented here.
 *
 * These numbers are OFFLINE EVALUATION RESULTS on the synthetic dataset
 * (dataset v0.2.0: seed 42, 5,000 cases — 4,000 train / 1,000 test, 47
 * features). They are not live telemetry and must never be labeled as such.
 * Ground truth exists only in the evaluation harness — the ranking API itself
 * never uses or exposes it.
 */

import evaluationArtifact from "../../../docs/rf_evaluation.json";

export interface ModelEvaluation {
  modelKey: "weighted_baseline" | "random_forest";
  modelName: string;
  totalCases: number;
  top1: number;
  top3: number;
  top5: number;
  mrr: number;
  meanRank: number;
  medianRank: number;
  top1Count: number;
  top3Count: number;
  top5Count: number;
}

export interface MetricDelta {
  metric: string;
  baseline: number;
  rf: number;
  /** Signed delta in the RF − baseline direction, already rounded for display. */
  delta: number;
  /** Higher-is-better metric (rank metrics are inverted). */
  higherIsBetter: boolean;
  rfWins: boolean;
}

export interface EvaluationProvenance {
  evaluationTimestamp: string;
  seed: number;
  trainCases: number;
  testCases: number;
  totalFeatures: number;
}

const raw = evaluationArtifact as unknown as {
  evaluation_timestamp: string;
  seed: number;
  train_cases: number;
  test_cases: number;
  total_features: number;
  rf_results: Record<string, number>;
  baseline_results: Record<string, number>;
  comparison: { metric_comparison: Record<string, Record<string, number | boolean>> };
};

function toModelEvaluation(
  modelKey: ModelEvaluation["modelKey"],
  modelName: string,
  r: Record<string, number>
): ModelEvaluation {
  return {
    modelKey,
    modelName,
    totalCases: r.total_cases,
    top1: r.top1_accuracy,
    top3: r.top3_accuracy,
    top5: r.top5_accuracy,
    mrr: r.mrr,
    meanRank: r.mean_rank,
    medianRank: r.median_rank,
    top1Count: r.top1_count,
    top3Count: r.top3_count,
    top5Count: r.top5_count,
  };
}

export const evaluationProvenance: EvaluationProvenance = {
  evaluationTimestamp: raw.evaluation_timestamp,
  seed: raw.seed,
  trainCases: raw.train_cases,
  testCases: raw.test_cases,
  totalFeatures: raw.total_features,
};

export const baselineEvaluation = toModelEvaluation(
  "weighted_baseline",
  "Weighted Baseline",
  raw.baseline_results
);

export const rfEvaluation = toModelEvaluation(
  "random_forest",
  "Random Forest",
  raw.rf_results
);

/** Comparison rows derived from the artifact's own comparison block. */
export const metricComparison: MetricDelta[] = (() => {
  const rows: Array<{
    metric: string;
    key: string;
    higherIsBetter: boolean;
  }> = [
    { metric: "Top-1 Accuracy", key: "top1_accuracy", higherIsBetter: true },
    { metric: "Top-3 Accuracy", key: "top3_accuracy", higherIsBetter: true },
    { metric: "Top-5 Accuracy", key: "top5_accuracy", higherIsBetter: true },
    { metric: "MRR", key: "mrr", higherIsBetter: true },
    { metric: "Mean Rank", key: "mean_rank", higherIsBetter: false },
    { metric: "Median Rank", key: "median_rank", higherIsBetter: false },
  ];
  return rows.map(({ metric, key, higherIsBetter }) => {
    const c = raw.comparison.metric_comparison[key];
    return {
      metric,
      baseline: c.baseline as number,
      rf: c.rf as number,
      delta: c.delta as number,
      higherIsBetter,
      rfWins: c.rf_wins === true,
    };
  });
})();

/**
 * Ranking pipeline stages — an explanatory architecture view. Every
 * description states what the stage does with already-available data; no
 * execution times, percentages, or status values are claimed.
 */
export interface PipelineStage {
  key: string;
  title: string;
  description: string;
}

export const RANKING_PIPELINE: PipelineStage[] = [
  {
    key: "evidence",
    title: "Observed Evidence",
    description:
      "The case's recorded transaction ledger and accounts — the only records the analysis may use.",
  },
  {
    key: "features",
    title: "Feature Engineering",
    description:
      "Computes geographic, transaction, location, temporal, and case features from evidence at or before the analysis point.",
  },
  {
    key: "candidates",
    title: "Candidate Generation",
    description:
      "Assembles the candidate location set for the case from the synthetic location registry.",
  },
  {
    key: "risk",
    title: "Risk Analysis",
    description:
      "Scores candidates with the selected model (Weighted Baseline or Random Forest) using the engineered features.",
  },
  {
    key: "ranking",
    title: "Ranking",
    description:
      "Orders candidates into a relative prioritization — higher rank means stronger evidence support, not certainty.",
  },
  {
    key: "review",
    title: "Investigator Prioritization",
    description:
      "Presents the ranked list as review priorities for investigator judgment. SENTINEL does not make operational decisions.",
  },
];

/**
 * System architecture — the components that actually exist in this
 * repository. No fictional infrastructure or live integrations.
 */
export interface ArchitectureLayer {
  key: string;
  title: string;
  components: string[];
}

export const SYSTEM_ARCHITECTURE: ArchitectureLayer[] = [
  {
    key: "data",
    title: "Data",
    components: [
      "Synthetic dataset generator (seeded)",
      "300 canonical synthetic cases",
      "Transactions, accounts, locations, candidates",
    ],
  },
  {
    key: "features",
    title: "Features",
    components: [
      "47 engineered features",
      "Geographic · Transaction · Location · Temporal · Case groups",
      "Pre-analysis-point (T0) boundary enforced",
    ],
  },
  {
    key: "models",
    title: "Models",
    components: [
      "Weighted Baseline — transparent group scoring",
      "Random Forest — trained on the synthetic dataset",
      "Offline evaluation harness with ground truth",
    ],
  },
  {
    key: "api",
    title: "Ranking API",
    components: [
      "FastAPI service",
      "GET /investigations · GET /investigations/:id",
      "POST /rank · GET /investigations/:id/transactions",
    ],
  },
  {
    key: "ui",
    title: "Investigator UI",
    components: [
      "Case workspace: Evidence · Timeline · Network · GeoIntel",
      "Candidates · Explainability · Investigator Case Brief",
      "Investigation queue + intake",
    ],
  },
];
