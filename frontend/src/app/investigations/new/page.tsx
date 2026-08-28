"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { InvestigationSummary, CaseInfo } from "@/types/api";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SCENARIO_COLORS: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
};

export default function NewInvestigationPage() {
  const router = useRouter();
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listInvestigations()
      .then((data) => setCases(data.investigations))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    api
      .getInvestigation(selectedId)
      .then(setDetail)
      .catch((err) => setDetailError(err.message))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const filtered = cases.filter(
    (c) =>
      c.case_id.toLowerCase().includes(search.toLowerCase()) ||
      c.fraud_scenario.toLowerCase().includes(search.toLowerCase()) ||
      c.origin_metro.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Investigation Intake
        </h2>
        <p className="text-sm text-gray-500">
          Select a synthetic demo case to run SENTINEL analysis.
        </p>
      </div>

      <div className="card border-yellow-200 bg-yellow-50">
        <p className="text-xs text-yellow-800">
          <strong>Demo Mode:</strong> This system operates on synthetic data
          only. Select an existing synthetic case to demonstrate the
          SENTINEL analysis pipeline. No real police, NCRP, or banking data
          is used.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-gray-500">Loading cases...</div>
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            Failed to load cases: {error}
          </p>
          <p className="mt-1 text-xs text-red-600">
            Ensure the backend is running at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </code>
          </p>
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div className="card">
          <p className="text-sm text-gray-500">
            No cases available. Generate synthetic data first.
          </p>
        </div>
      )}

      {!loading && !error && cases.length > 0 && (
        <>
          <div className="card">
            <label
              htmlFor="case-search"
              className="block text-xs font-medium text-gray-500 mb-1"
            >
              Select Case
            </label>
            <input
              id="case-search"
              type="text"
              placeholder="Search by ID, scenario, or metro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500"
            />
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Case
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Scenario
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">
                      Metro
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c) => (
                    <tr
                      key={c.case_id}
                      onClick={() => setSelectedId(c.case_id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === c.case_id
                          ? "bg-sentinel-50 border-l-2 border-l-sentinel-500"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium text-gray-900">
                        {c.case_id}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            SCENARIO_COLORS[c.fraud_scenario] || "badge-gray"
                          }
                        >
                          {c.fraud_scenario.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700 hidden sm:table-cell">
                        {c.origin_metro}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700 hidden sm:table-cell">
                        {formatINR(c.reported_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-400">
                  No cases match your search.
                </div>
              )}
            </div>
          </div>

          {selectedId && detailLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">Loading case details...</div>
            </div>
          )}

          {selectedId && detailError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-800">
                Failed to load case: {detailError}
              </p>
            </div>
          )}

          {detail && (
            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {detail.case_id}
                  </h3>
                  <span
                    className={`mt-1 inline-block ${
                      SCENARIO_COLORS[detail.fraud_scenario] || "badge-gray"
                    }`}
                  >
                    {detail.fraud_scenario.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="badge-blue text-[10px]">Synthetic Demo</span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-400">Origin Metro</p>
                  <p className="text-sm font-medium text-gray-900">
                    {detail.origin_metro}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Complaint Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(detail.complaint_time)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Reported Amount</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatINR(detail.reported_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Accounts Involved</p>
                  <p className="text-sm font-medium text-gray-900">
                    {detail.num_accounts_involved}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Transactions</p>
                  <p className="text-sm font-medium text-gray-900">
                    {detail.num_transactions}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Candidate Locations</p>
                  <p className="text-sm font-medium text-gray-900">
                    {detail.num_candidates}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-400 max-w-md">
                  Use the information available at complaint time to prioritize
                  candidate cash-out locations.
                </p>
                <button
                  onClick={() => router.push(`/investigations/${detail.case_id}`)}
                  className="btn-primary shrink-0"
                >
                  Run SENTINEL Analysis
                </button>
              </div>
            </div>
          )}

          {!selectedId && !detailLoading && (
            <div className="py-8 text-center text-sm text-gray-400">
              Select a case above to review available evidence.
            </div>
          )}
        </>
      )}
    </div>
  );
}