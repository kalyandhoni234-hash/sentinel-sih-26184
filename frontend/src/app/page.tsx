"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((err) => setHealthError(err.message));

    api
      .listInvestigations()
      .then((data) => setCaseCount(data.total))
      .catch((err) => setCasesError(err.message));
  }, []);

  const error = healthError || casesError;

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-sentinel-200 bg-gradient-to-br from-sentinel-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sentinel-600 text-xl font-bold text-white">
            S
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">
              Evidence-Based Cash-Out Location Ranking
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-600">
              SENTINEL helps cybercrime investigators prioritize likely
              cash-out locations by analyzing transaction chains, account
              activity, and geographic patterns available at complaint time.
              Candidate locations are ranked by evidence-based risk score — not
              confirmed predictions.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="rounded-full bg-sentinel-100 px-2.5 py-0.5 text-xs font-medium text-sentinel-700">
                {caseCount === null ? "Loading..." : `${caseCount} Synthetic Cases`}
              </span>
              <span className="rounded-full bg-sentinel-100 px-2.5 py-0.5 text-xs font-medium text-sentinel-700">
                47 Evidence Features
              </span>
              <span className="rounded-full bg-sentinel-100 px-2.5 py-0.5 text-xs font-medium text-sentinel-700">
                2 Ranking Models
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                Synthetic Demo
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            Cannot connect to API: {error}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Make sure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {health && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500">API Status</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">
              Connected — v{health.version}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Available models: {health.models_available.join(", ")}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/investigations/new"
          className="card border-sentinel-200 bg-sentinel-50 hover:border-sentinel-400 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sentinel-600 text-sm font-bold text-white">
              +
            </div>
            <h3 className="font-semibold text-sentinel-900">New Investigation</h3>
          </div>
          <p className="mt-2 text-sm text-sentinel-700">
            Enter complaint information, match it to a synthetic demo case, and
            run the SENTINEL analysis pipeline.
          </p>
        </Link>
        <Link href="/investigations" className="card hover:border-sentinel-300 transition-colors">
          <h3 className="font-semibold text-gray-900">All Cases</h3>
          <p className="mt-1 text-sm text-gray-500">
            View all {caseCount ?? "available"} synthetic fraud cases and their
            candidate locations.
          </p>
        </Link>
        <div className="card">
          <h3 className="font-semibold text-gray-900">
            Investigation Intelligence
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Rank plausible cash-out locations using evidence available at
            complaint time.
          </p>
        </div>
      </div>

      <div className="card border-yellow-200 bg-yellow-50">
        <p className="text-xs text-yellow-800">
          <strong>Disclaimer:</strong> This is an investigator decision-support
          tool. Ranked candidates represent risk scores, not guaranteed
          predictions. All data is synthetic for demonstration purposes.
        </p>
      </div>
    </div>
  );
}
