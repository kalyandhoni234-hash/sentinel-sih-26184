"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import type { RankedCandidate, CaseInfo } from "@/types/api";

import "leaflet/dist/leaflet.css";
import "@/lib/leaflet-fix";

interface SentinelMapProps {
  caseInfo: CaseInfo;
  candidates: RankedCandidate[];
  highlightedId?: string | null;
}

function getRankColor(rank: number): string {
  if (rank === 1) return "#dc2626";
  if (rank <= 3) return "#ea580c";
  if (rank <= 5) return "#ca8a04";
  return "#6b7280";
}

function getRankRadius(rank: number): number {
  if (rank === 1) return 14;
  if (rank <= 3) return 11;
  if (rank <= 5) return 9;
  return 7;
}

function createCandidateIcon(rank: number, highlighted: boolean): L.DivIcon {
  const color = getRankColor(rank);
  const size = getRankRadius(rank);
  const border = highlighted ? `3px solid #1e40af` : "2px solid white";
  const scale = highlighted ? 1.2 : 1;

  return L.divIcon({
    className: "",
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    html: `<div style="
      width: ${size * 2}px;
      height: ${size * 2}px;
      border-radius: 50%;
      background: ${color};
      border: ${border};
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: ${rank <= 3 ? 11 : 9}px;
      font-family: system-ui, sans-serif;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      transform: scale(${scale});
      transition: transform 0.15s ease;
    ">${rank}</div>`,
  });
}

function createOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #1e40af;
      border: 3px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
  });
}

function FitBounds({
  caseInfo,
  candidates,
}: {
  caseInfo: CaseInfo;
  candidates: RankedCandidate[];
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [];

    if (caseInfo.origin_latitude != null && caseInfo.origin_longitude != null) {
      points.push([caseInfo.origin_latitude, caseInfo.origin_longitude]);
    }

    for (const c of candidates) {
      if (c.location) {
        points.push([c.location.latitude, c.location.longitude]);
      }
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [caseInfo, candidates, map]);

  return null;
}

function HighlightHandler({
  highlightedId,
  candidates,
}: {
  highlightedId: string | null | undefined;
  candidates: RankedCandidate[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!highlightedId) return;
    const candidate = candidates.find(
      (c) => c.location_id === highlightedId && c.location
    );
    if (candidate && candidate.location) {
      map.setView(
        [candidate.location.latitude, candidate.location.longitude],
        Math.max(map.getZoom(), 14),
        { animate: true }
      );
    }
  }, [highlightedId, candidates, map]);

  return null;
}

function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 p-3 shadow-md text-xs space-y-1.5">
      <p className="font-semibold text-gray-700 mb-1">Map Legend</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-blue-800 border-2 border-white shadow-sm" />
        <span className="text-gray-600">Complaint origin</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-red-600 border border-white shadow-sm" />
        <span className="text-gray-600">Rank #1 candidate</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500 border border-white shadow-sm" />
        <span className="text-gray-600">Rank #2–3 candidates</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 border border-white shadow-sm" />
        <span className="text-gray-600">Rank #4–5 candidates</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 border border-white shadow-sm" />
        <span className="text-gray-600">Other ranked candidates</span>
      </div>
    </div>
  );
}

function MapInner({
  caseInfo,
  candidates,
  highlightedId,
}: SentinelMapProps) {
  const originPosition: L.LatLngExpression | null =
    caseInfo.origin_latitude != null && caseInfo.origin_longitude != null
      ? [caseInfo.origin_latitude, caseInfo.origin_longitude]
      : null;

  return (
    <MapContainer
      center={originPosition || [20.5937, 78.9629]}
      zoom={5}
      className="h-full w-full rounded-lg"
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds caseInfo={caseInfo} candidates={candidates} />
      <HighlightHandler
        highlightedId={highlightedId}
        candidates={candidates}
      />

      {originPosition && (
        <Marker position={originPosition} icon={createOriginIcon()}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-blue-800">Complaint Origin</p>
              <p className="text-gray-600">{caseInfo.origin_metro}</p>
              <p className="text-xs text-gray-400 mt-1">
                {caseInfo.fraud_scenario.replace(/_/g, " ")}
              </p>
            </div>
          </Popup>
        </Marker>
      )}

      {candidates.map((c) =>
        c.location ? (
          <Marker
            key={c.location_id}
            position={[c.location.latitude, c.location.longitude]}
            icon={createCandidateIcon(c.rank, highlightedId === c.location_id)}
          >
            <Popup>
              <div className="text-sm max-w-xs">
                <p className="font-semibold text-gray-900">
                  Candidate #{c.rank}
                </p>
                <p className="font-mono text-xs text-gray-500">
                  {c.location_id}
                </p>
                <p className="text-gray-600 mt-1">
                  {c.location.location_type} — {c.location.region},{" "}
                  {c.location.metro}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Risk score: {c.risk_score.toFixed(3)}
                </p>
                {c.explanation && (
                  <p className="text-xs text-gray-500 mt-2 border-t pt-2">
                    {c.explanation}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ) : null
      )}

      <MapLegend />
    </MapContainer>
  );
}

export function SentinelMap(props: SentinelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={mapRef} className="relative" style={{ height: 480 }}>
      <MapInner {...props} />
    </div>
  );
}
