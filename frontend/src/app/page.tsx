"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Cybercrime Investigation Dashboard
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          SENTINEL ranks candidate cash-out locations to help investigators
          prioritize where to look first.
        </p>
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
        <a href="/investigations/new" className="card hover:border-sentinel-300 transition-colors">
          <h3 className="font-semibold text-gray-900">New Investigation</h3>
          <p className="mt-1 text-sm text-gray-500">
            Select a synthetic demo case and run the SENTINEL analysis pipeline.
          </p>
        </a>
        <a href="/investigations" className="card hover:border-sentinel-300 transition-colors">
          <h3 className="font-semibold text-gray-900">All Cases</h3>
          <p className="mt-1 text-sm text-gray-500">
            View all 80 synthetic fraud cases and their candidate locations.
          </p>
        </a>
        <div className="card opacity-50">
          <h3 className="font-semibold text-gray-900">Analytics</h3>
          <p className="mt-1 text-sm text-gray-500">
            Model performance and scenario breakdown. Coming soon.
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
