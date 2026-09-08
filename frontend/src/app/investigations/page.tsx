"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import type { InvestigationSummary } from "@/types/api";

const SCENARIO_COLORS: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
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
      <div className="space-y-4">
        <div>
          <div className="h-7 w-40 skeleton" />
          <div className="mt-1 h-4 w-24 skeleton" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 flex-1 skeleton" />
          <div className="h-9 w-40 skeleton" />
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="bg-gray-50 px-4 py-3">
            <div className="flex gap-16">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-3 w-16 skeleton" />
              ))}
            </div>
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-16 border-t border-gray-100 px-4 py-3">
              <div className="h-4 w-24 skeleton" />
              <div className="h-5 w-28 skeleton rounded-full" />
              <div className="h-4 w-16 skeleton" />
              <div className="h-4 w-16 skeleton" />
              <div className="h-4 w-8 skeleton" />
              <div className="h-4 w-28 skeleton" />
              <div className="h-4 w-10 skeleton" />
            </div>
          ))}
        </div>
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
                  <Link
                    href={`/investigations/${c.case_id}`}
                    className="text-sm font-medium text-sentinel-600 hover:text-sentinel-800"
                  >
                    Rank
                  </Link>
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
