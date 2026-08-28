"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { InvestigationSummary } from "@/types/api";

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
  mule_account: "badge-blue",
  money_mule: "badge-blue",
  crypto_exchange: "badge-green",
  hawala: "badge-yellow",
  layering: "badge-red",
  smishing: "badge-blue",
  vishing: "badge-green",
  otp_fraud: "badge-yellow",
};

export default function InvestigationsPage() {
  const [cases, setCases] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "complaint_time" | "reported_amount" | "num_candidates"
  >("complaint_time");

  useEffect(() => {
    api
      .listInvestigations()
      .then((data) => setCases(data.investigations))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = cases
    .filter(
      (c) =>
        c.case_id.toLowerCase().includes(search.toLowerCase()) ||
        c.fraud_scenario.toLowerCase().includes(search.toLowerCase()) ||
        c.origin_metro.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "reported_amount")
        return b.reported_amount - a.reported_amount;
      if (sortBy === "num_candidates")
        return b.num_candidates - a.num_candidates;
      return (
        new Date(b.complaint_time).getTime() -
        new Date(a.complaint_time).getTime()
      );
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading investigations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-800">Failed to load: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Investigations</h2>
          <p className="text-sm text-gray-500">{cases.length} cases total</p>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by ID, scenario, or metro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500"
        >
          <option value="complaint_time">Sort by Date</option>
          <option value="reported_amount">Sort by Amount</option>
          <option value="num_candidates">Sort by Candidates</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Case ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Scenario
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Metro
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Candidates
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Filed
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((c) => (
              <tr key={c.case_id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-gray-900">
                  {c.case_id}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      SCENARIO_COLORS[c.fraud_scenario] || "badge-gray"
                    }
                  >
                    {c.fraud_scenario}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {formatINR(c.reported_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {c.origin_metro}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {c.num_candidates}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {formatDate(c.complaint_time)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <a
                    href={`/investigations/${c.case_id}`}
                    className="text-sm font-medium text-sentinel-600 hover:text-sentinel-800"
                  >
                    Rank
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-500">
          No cases match your search.
        </div>
      )}
    </div>
  );
}
