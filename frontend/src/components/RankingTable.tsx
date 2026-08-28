"use client";

import type { RankedCandidate } from "@/types/api";

interface RankingTableProps {
  candidates: RankedCandidate[];
}

export function RankingTable({ candidates }: RankingTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Location
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Risk Score
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Metro
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Type
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {candidates.map((c) => (
            <tr key={c.location_id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sentinel-100 text-xs font-bold text-sentinel-700">
                  {c.rank}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-900">
                {c.location_id}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full ${
                        c.risk_score >= 0.7
                          ? "bg-red-500"
                          : c.risk_score >= 0.4
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${Math.round(c.risk_score * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {c.risk_score.toFixed(3)}
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                {c.location?.metro || "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                {c.location?.location_type || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
