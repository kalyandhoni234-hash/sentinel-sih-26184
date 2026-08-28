"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { RankResponse, RankedCandidate } from "@/types/api";
import { SentinelMapWrapper } from "@/components/SentinelMapWrapper";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function RiskBar({ score }: { score: number }) {
  const width = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "bg-red-500"
      : score >= 0.4
        ? "bg-yellow-500"
        : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{score.toFixed(3)}</span>
    </div>
  );
}

function CandidateCard({
  candidate,
  isHighlighted,
  onHighlight,
}: {
  candidate: RankedCandidate;
  isHighlighted: boolean;
  onHighlight: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`card cursor-pointer transition-colors ${
        isHighlighted ? "border-sentinel-400 bg-sentinel-50" : ""
      }`}
      onClick={() => onHighlight(candidate.location_id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sentinel-100 text-sm font-bold text-sentinel-700">
            {candidate.rank}
          </div>
          <div>
            <p className="font-mono text-sm font-medium text-gray-900">
              {candidate.location_id}
            </p>
            {candidate.location && (
              <p className="text-xs text-gray-500">
                {candidate.location.region}, {candidate.location.metro} —{" "}
                {candidate.location.location_type}
              </p>
            )}
          </div>
        </div>
        <RiskBar score={candidate.risk_score} />
      </div>

      <p className="mt-3 text-sm text-gray-600">{candidate.explanation}</p>

      {candidate.group_scores && (
        <div className="mt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-xs font-medium text-sentinel-600 hover:text-sentinel-800"
          >
            {expanded ? "Hide" : "Show"} group breakdown
          </button>
          {expanded && (
            <div className="mt-2 grid grid-cols-5 gap-2">
              {Object.entries(candidate.group_scores).map(([group, score]) => (
                <div key={group} className="rounded bg-gray-50 p-2 text-center">
                  <p className="text-[10px] uppercase text-gray-400">{group}</p>
                  <p className="text-xs font-medium text-gray-700">
                    {score.toFixed(3)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {candidate.location && (
        <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-500">
          Lat: {candidate.location.latitude.toFixed(4)}, Lng:{" "}
          {candidate.location.longitude.toFixed(4)} — Density:{" "}
          {candidate.location.density_score.toFixed(2)}
        </div>
      )}
    </div>
  );
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const [data, setData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"weighted_baseline" | "random_forest">(
    "weighted_baseline"
  );
  const [topK, setTopK] = useState<number>(10);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const loadRanking = () => {
    setLoading(true);
    setError(null);
    setHighlightedId(null);
    api
      .rankCandidates(caseId, {
        model,
        top_k: topK,
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRanking();
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Case {caseId}
          </h2>
          {data && (
            <p className="text-sm text-gray-500">
              {data.case.fraud_scenario} — {data.case.origin_metro} —{" "}
              {formatINR(data.case.reported_amount)}
            </p>
          )}
        </div>
        <a
          href="/investigations"
          className="btn-secondary"
        >
          Back to list
        </a>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500">
            Model
          </label>
          <select
            value={model}
            onChange={(e) =>
              setModel(
                e.target.value as "weighted_baseline" | "random_forest"
              )
            }
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="weighted_baseline">Weighted Baseline</option>
            <option value="random_forest">Random Forest</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">
            Top K
          </label>
          <input
            type="number"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            min={1}
            max={100}
            className="mt-1 w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button onClick={loadRanking} className="btn-primary mt-5">
          Re-rank
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-sm text-gray-500">
          Loading ranking...
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="card border-yellow-200 bg-yellow-50">
            <p className="text-xs text-yellow-800">{data.disclaimer}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card">
              <p className="text-xs text-gray-500">Model Used</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {data.model_used}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">Candidates Evaluated</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {data.total_candidates}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">Showing Top</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {data.ranked_candidates.length}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-2">
            <SentinelMapWrapper
              caseInfo={data.case}
              candidates={data.ranked_candidates}
              highlightedId={highlightedId}
            />
            <p className="mt-2 px-2 text-[11px] text-gray-400">
              Ranked candidates are risk-based priorities derived from
              available query-time evidence; they are not guaranteed
              predictions. All data is synthetic.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Ranked Candidates
            </h3>
            {data.ranked_candidates.map((c) => (
              <CandidateCard
                key={c.location_id}
                candidate={c}
                isHighlighted={highlightedId === c.location_id}
                onHighlight={setHighlightedId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
