"use client";

import type { RankedCandidate } from "@/types/api";

interface MapPlaceholderProps {
  candidates: RankedCandidate[];
}

export function MapPlaceholder({ candidates }: MapPlaceholderProps) {
  return (
    <div className="card relative overflow-hidden bg-gray-100" style={{ minHeight: 400 }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="rounded-lg bg-white/80 p-6 shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sentinel-100">
            <svg
              className="h-6 w-6 text-sentinel-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900">GIS Map</h3>
          <p className="mt-1 text-sm text-gray-500">
            Leaflet/MapLibre integration coming in Phase 7
          </p>
          <div className="mt-3 space-y-1">
            {candidates.slice(0, 3).map((c) => (
              <div key={c.location_id} className="text-xs text-gray-600">
                #{c.rank} {c.location_id}
                {c.location && (
                  <span className="text-gray-400">
                    {" "}
                    ({c.location.latitude.toFixed(2)},{" "}
                    {c.location.longitude.toFixed(2)})
                  </span>
                )}
              </div>
            ))}
            {candidates.length > 3 && (
              <p className="text-xs text-gray-400">
                +{candidates.length - 3} more
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
