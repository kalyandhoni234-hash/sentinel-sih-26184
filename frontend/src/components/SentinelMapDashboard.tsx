"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { RankedCandidate, CaseInfo } from "@/types/api";

import "leaflet/dist/leaflet.css";
import "@/lib/leaflet-fix";

interface DashboardCandidate extends RankedCandidate {
  caseId: string;
}

interface SentinelMapDashboardProps {
  candidates: DashboardCandidate[];
  caseOrigins: Pick<CaseInfo, "case_id" | "origin_metro" | "origin_latitude" | "origin_longitude">[];
}

function getPriorityColor(score: number): string {
  if (score >= 0.7) return "#dc2626";
  if (score >= 0.4) return "#ea580c";
  return "#6b7280";
}

function getPriorityRadius(score: number): number {
  if (score >= 0.7) return 10;
  if (score >= 0.4) return 8;
  return 6;
}

function createCandidateIcon(score: number): L.DivIcon {
  const color = getPriorityColor(score);
  const size = getPriorityRadius(score);

  return L.divIcon({
    className: "",
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    html: `<div style="
      width: ${size * 2}px;
      height: ${size * 2}px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>`,
  });
}

function createOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #1e40af;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
  });
}

function FitAllBounds({
  candidates,
  caseOrigins,
}: {
  candidates: DashboardCandidate[];
  caseOrigins: Pick<CaseInfo, "case_id" | "origin_latitude" | "origin_longitude">[];
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [];

    for (const o of caseOrigins) {
      if (o.origin_latitude != null && o.origin_longitude != null) {
        points.push([o.origin_latitude, o.origin_longitude]);
      }
    }

    for (const c of candidates) {
      if (c.location) {
        points.push([c.location.latitude, c.location.longitude]);
      }
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 11);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    }
  }, [candidates, caseOrigins, map]);

  return null;
}

function DashboardMapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 p-2.5 shadow-md text-xs space-y-1">
      <p className="font-semibold text-gray-700 mb-1">Legend</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-blue-800 border-2 border-white shadow-sm" />
        <span className="text-gray-600">Case origin</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600 border border-white shadow-sm" />
        <span className="text-gray-600">High priority</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-orange-500 border border-white shadow-sm" />
        <span className="text-gray-600">Medium priority</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 border border-white shadow-sm" />
        <span className="text-gray-600">Low priority</span>
      </div>
    </div>
  );
}

function MapInner({
  candidates,
  caseOrigins,
}: SentinelMapDashboardProps) {
  const center: L.LatLngExpression = useMemo(() => {
    if (caseOrigins.length > 0 && caseOrigins[0].origin_latitude != null && caseOrigins[0].origin_longitude != null) {
      return [caseOrigins[0].origin_latitude, caseOrigins[0].origin_longitude];
    }
    if (candidates.length > 0 && candidates[0].location) {
      return [candidates[0].location.latitude, candidates[0].location.longitude];
    }
    return [20.5937, 78.9629];
  }, [caseOrigins, candidates]);

  return (
    <MapContainer
      center={center}
      zoom={5}
      className="h-full w-full rounded-lg"
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitAllBounds candidates={candidates} caseOrigins={caseOrigins} />

      {caseOrigins.map((o) =>
        o.origin_latitude != null && o.origin_longitude != null ? (
          <Marker
            key={o.case_id}
            position={[o.origin_latitude, o.origin_longitude]}
            icon={createOriginIcon()}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold text-blue-800">Case Origin</p>
                <p className="text-gray-600">{o.origin_metro}</p>
                <p className="font-mono text-xs text-gray-400 mt-1">{o.case_id}</p>
                <Link
                  href={`/investigations/${o.case_id}`}
                  className="mt-2 inline-block text-xs font-medium text-sentinel-600 hover:text-sentinel-800"
                >
                  View Investigation
                </Link>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}

      {candidates.map((c) =>
        c.location ? (
          <Marker
            key={`${c.caseId}-${c.location_id}`}
            position={[c.location.latitude, c.location.longitude]}
            icon={createCandidateIcon(c.risk_score)}
          >
            <Popup>
              <div className="text-sm max-w-xs">
                <p className="font-semibold text-gray-900">Ranked Candidate</p>
                <p className="font-mono text-xs text-gray-500">{c.location_id}</p>
                <p className="text-gray-600 mt-1">
                  {c.location.location_type} — {c.location.region},{" "}
                  {c.location.metro}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Priority Score: {c.risk_score.toFixed(3)} · Rank #{c.rank}
                </p>
                <Link
                  href={`/investigations/${c.caseId}`}
                  className="mt-2 inline-block text-xs font-medium text-sentinel-600 hover:text-sentinel-800"
                >
                  View Investigation
                </Link>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}

      <DashboardMapLegend />
    </MapContainer>
  );
}

export function SentinelMapDashboard(props: SentinelMapDashboardProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);

  const handleTileError = useCallback(() => {
    setTileError(true);
  }, []);

  return (
    <div ref={mapRef} className="relative h-[350px] w-full sm:h-[400px] lg:h-[450px]">
      <MapInner {...props} />
      {tileError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] rounded-md border border-yellow-300 bg-yellow-50 px-3 py-1.5 shadow-sm text-xs text-yellow-800 max-w-xs text-center">
          Map tiles could not be loaded.
        </div>
      )}
    </div>
  );
}
