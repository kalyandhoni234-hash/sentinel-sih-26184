"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">System Status</h2>

      {loading && (
        <div className="py-8 text-center text-sm text-gray-500">
          Checking API...
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">API Error: {error}</p>
          <p className="mt-1 text-xs text-red-600">
            Ensure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {health && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <div>
                <p className="font-medium text-gray-900">
                  API Connected
                </p>
                <p className="text-sm text-gray-500">
                  Version: {health.version}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">
              Available Models
            </h3>
            <div className="mt-3 space-y-2">
              {health.models_available.map((model) => (
                <div
                  key={model}
                  className="flex items-center gap-2 rounded bg-gray-50 px-3 py-2"
                >
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-mono text-sm text-gray-700">
                    {model}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">
              API Endpoints
            </h3>
            <div className="mt-3 space-y-1">
              {[
                { method: "GET", path: "/health", desc: "Health check" },
                {
                  method: "GET",
                  path: "/api/v1/investigations",
                  desc: "List all cases",
                },
                {
                  method: "GET",
                  path: "/api/v1/investigations/{case_id}",
                  desc: "Case details",
                },
                {
                  method: "POST",
                  path: "/api/v1/investigations/{case_id}/rank",
                  desc: "Rank candidates",
                },
              ].map((ep) => (
                <div
                  key={ep.path}
                  className="flex items-center gap-3 rounded bg-gray-50 px-3 py-2"
                >
                  <span
                    className={`badge ${
                      ep.method === "GET" ? "badge-blue" : "badge-green"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <code className="font-mono text-xs text-gray-700">
                    {ep.path}
                  </code>
                  <span className="text-xs text-gray-400">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
