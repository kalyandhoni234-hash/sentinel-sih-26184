"use client";

import { useMemo } from "react";
import type { RankResponse } from "@/types/api";

/**
 * Model comparison table extracted from the former case mega-page.
 * Logic unchanged — same two-model side-by-side ranking.
 */

interface ComparisonRow {
  rank: number;
  locationId: string;
  locationType: string;
  metro: string;
  region: string;
  wbScore: number;
  rfScore: number;
  rankChange: number;
}

export function ModelComparisonTable({
  wbData,
  rfData,
}: {
  wbData: RankResponse;
  rfData: RankResponse;
}) {
  const comparison = useMemo(() => {
    const wbMap = new Map(
      wbData.ranked_candidates.map((c) => [c.location_id, c])
    );
    const rfMap = new Map(
      rfData.ranked_candidates.map((c) => [c.location_id, c])
    );

    const allIds = new Set([...wbMap.keys(), ...rfMap.keys()]);
    const rows: ComparisonRow[] = [];

    for (const id of allIds) {
      const wb = wbMap.get(id);
      const rf = rfMap.get(id);
      if (!wb && !rf) continue;

      const wbRank = wb?.rank ?? 999;
      const rfRank = rf?.rank ?? 999;
      const wbScore = wb?.risk_score ?? 0;
      const rfScore = rf?.risk_score ?? 0;
      const loc = wb?.location || rf?.location;

      rows.push({
        rank: Math.min(wbRank, rfRank),
        locationId: id,
        locationType: loc?.location_type ?? "Unknown",
        metro: loc?.metro ?? "Unknown",
        region: loc?.region ?? "Unknown",
        wbScore,
        rfScore,
        rankChange: wbRank - rfRank,
      });
    }

    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }, [wbData, rfData]);

  const wbTop1 = wbData.ranked_candidates[0]?.location_id;
  const rfTop1 = rfData.ranked_candidates[0]?.location_id;
  const agreeTop = wbTop1 === rfTop1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-sentinel-500" />
          <span className="text-xs text-sentinel-text-secondary">
            Weighted Baseline #1: <span className="font-mono font-semibold">{wbTop1 || "—"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
          <span className="text-xs text-sentinel-text-secondary">
            Random Forest #1: <span className="font-mono font-semibold">{rfTop1 || "—"}</span>
          </span>
        </div>
      </div>

      <div className="mb-3 rounded border border-sentinel-border bg-sentinel-surface-alt p-2.5">
        <p className="text-xs text-sentinel-text-secondary">
          {agreeTop ? (
            <>
              <span className="font-medium text-sentinel-700">Models agree</span> on the
              highest-ranked candidate ({wbTop1}). Both models identify the same
              location as the top priority.
            </>
          ) : (
            <>
              <span className="font-medium text-amber-700">Models differ</span> on the
              highest-ranked candidate. Weighted Baseline: {wbTop1 || "—"}. Random
              Forest: {rfTop1 || "—"}. Review the evidence signals before
              prioritizing.
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sentinel-border">
              <th className="pb-2 pr-3 text-left font-medium text-sentinel-text-muted">Rank</th>
              <th className="pb-2 pr-3 text-left font-medium text-sentinel-text-muted">Location</th>
              <th className="pb-2 pr-3 text-left font-medium text-sentinel-text-muted">Type</th>
              <th className="pb-2 pr-3 text-right font-medium text-sentinel-text-muted">Baseline</th>
              <th className="pb-2 pr-3 text-right font-medium text-sentinel-text-muted">RF</th>
              <th className="pb-2 text-right font-medium text-sentinel-text-muted">Rank Change</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr
                key={row.locationId}
                className="border-b border-sentinel-border-subtle last:border-0"
              >
                <td className="py-2 pr-3 font-mono font-semibold text-sentinel-text">
                  #{row.rank}
                </td>
                <td className="py-2 pr-3">
                  <span className="font-mono font-semibold text-sentinel-text">
                    {row.locationId}
                  </span>
                  <span className="ml-1 text-sentinel-text-muted">
                    {row.metro}
                  </span>
                </td>
                <td className="py-2 pr-3 text-sentinel-text-secondary">{row.locationType}</td>
                <td className="py-2 pr-3 text-right font-mono text-sentinel-700">
                  {row.wbScore.toFixed(3)}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-purple-700">
                  {row.rfScore.toFixed(3)}
                </td>
                <td className="py-2 text-right">
                  {row.rankChange === 0 ? (
                    <span className="text-sentinel-text-muted">0</span>
                  ) : row.rankChange > 0 ? (
                    <span className="font-medium text-green-600">
                      +{row.rankChange}
                    </span>
                  ) : (
                    <span className="font-medium text-red-600">
                      {row.rankChange}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
