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

function getPriorityLabel(score: number): string {
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

function intensityToRgb(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0.0, 78, 121, 167],
    [0.25, 65, 158, 155],
    [0.5, 237, 177, 32],
    [0.75, 234, 108, 48],
    [1.0, 200, 45, 45],
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const range = upper[0] - lower[0];
  const f = range === 0 ? 0 : (t - lower[0]) / range;
  return [
    Math.round(lower[1] + f * (upper[1] - lower[1])),
    Math.round(lower[2] + f * (upper[2] - lower[2])),
    Math.round(lower[3] + f * (upper[3] - lower[3])),
  ];
}

function intensityToColor(t: number): string {
  const [r, g, b] = intensityToRgb(t);
  return `rgb(${r},${g},${b})`;
}

function createCandidateIcon(intensity: number, rank: number): L.DivIcon {
  const color = intensityToColor(intensity);
  const size = 6 + intensity * 10;
  const ring = rank <= 3 ? `box-shadow: 0 0 0 2px ${color}, 0 2px 6px rgba(0,0,0,0.35);` : "box-shadow: 0 1px 3px rgba(0,0,0,0.3);";

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
      ${ring}
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

function DashboardMapLegend({ showHeatmap }: { showHeatmap: boolean }) {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 p-2.5 shadow-md text-xs space-y-1.5 dark:bg-[#0a0a0a]/95 dark:text-gray-300">
      <p className="font-semibold text-gray-700 mb-1">Legend</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-blue-800 border-2 border-white shadow-sm" />
        <span className="text-gray-600">Case origin</span>
      </div>
      {showHeatmap && (
        <div className="mt-1 pt-1 border-t border-gray-100">
          <p className="text-[10px] text-gray-500 mb-1">Geographic candidate intensity</p>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full border border-white shadow-sm"
              style={{ width: 12, height: 12, background: "rgba(78,121,167,0.35)" }}
            />
            <span className="text-gray-500">Lower</span>
            <span className="mx-0.5 text-gray-300">→</span>
            <span
              className="inline-block rounded-full border border-white shadow-sm"
              style={{ width: 24, height: 24, background: "rgba(200,45,45,0.55)" }}
            />
            <span className="text-gray-500">Higher</span>
          </div>
          <p className="mt-1 text-[9px] text-gray-400 leading-tight">
            Intensity based on candidate scores and geographic concentration. Does not guarantee a withdrawal location.
          </p>
        </div>
      )}
      <div className="mt-1 pt-1 border-t border-gray-100">
        <p className="text-[10px] text-gray-500 mb-1">Relative candidate score</p>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full border border-white shadow-sm"
            style={{ width: 12, height: 12, background: intensityToColor(0) }}
          />
          <span className="text-gray-500">Lower</span>
          <span className="mx-0.5 text-gray-300">→</span>
          <span
            className="inline-block rounded-full border border-white shadow-sm"
            style={{ width: 24, height: 24, background: intensityToColor(1) }}
          />
          <span className="text-gray-500">Higher</span>
        </div>
      </div>
      <div className="mt-1 pt-1 border-t border-gray-100">
        <p className="text-[10px] text-gray-500 mb-0.5">Priority classification</p>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-600 border border-white shadow-sm" />
          <span className="text-gray-500">High (≥0.7)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500 border border-white shadow-sm" />
          <span className="text-gray-500">Medium (≥0.4)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400 border border-white shadow-sm" />
          <span className="text-gray-500">Low (&lt;0.4)</span>
        </div>
      </div>
    </div>
  );
}

function HeatmapLayer({
  candidates,
  getIntensity,
}: {
  candidates: DashboardCandidate[];
  getIntensity: (score: number) => number;
}) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const validCandidates = candidates.filter(
      (c) => c.location && c.location.latitude != null && c.location.longitude != null
    );

    if (validCandidates.length === 0) return;

    const layer = L.layerGroup();

    for (const c of validCandidates) {
      const intensity = getIntensity(c.risk_score);
      const [r, g, b] = intensityToRgb(intensity);
      const rgb = `${r},${g},${b}`;
      const radius = 12000 + intensity * 28000;
      const opacity = 0.15 + intensity * 0.3;

      L.circleMarker([c.location!.latitude, c.location!.longitude], {
        radius: 8,
        fillColor: `rgb(${rgb})`,
        fillOpacity: opacity,
        stroke: false,
        interactive: false,
      }).addTo(layer);

      L.circleMarker([c.location!.latitude, c.location!.longitude], {
        radius: radius,
        fillColor: `rgb(${rgb})`,
        fillOpacity: opacity * 0.4,
        stroke: false,
        interactive: false,
      }).addTo(layer);
    }

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, candidates, getIntensity]);

  return null;
}

function MapInner({
  candidates,
  caseOrigins,
  showHeatmap,
  onToggleHeatmap,
}: SentinelMapDashboardProps & {
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
}) {
  const center: L.LatLngExpression = useMemo(() => {
    if (caseOrigins.length > 0 && caseOrigins[0].origin_latitude != null && caseOrigins[0].origin_longitude != null) {
      return [caseOrigins[0].origin_latitude, caseOrigins[0].origin_longitude];
    }
    if (candidates.length > 0 && candidates[0].location) {
      return [candidates[0].location.latitude, candidates[0].location.longitude];
    }
    return [20.5937, 78.9629];
  }, [caseOrigins, candidates]);

  const scoreRange = useMemo(() => {
    const scores = candidates.map((c) => c.risk_score);
    if (scores.length === 0) return { min: 0, max: 1, range: 1 };
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    return { min, max, range: max - min };
  }, [candidates]);

  const getIntensity = useCallback(
    (score: number) => {
      if (scoreRange.range === 0) return 0.5;
      return (score - scoreRange.min) / scoreRange.range;
    },
    [scoreRange]
  );

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

      {showHeatmap && (
        <HeatmapLayer candidates={candidates} getIntensity={getIntensity} />
      )}

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
            icon={createCandidateIcon(getIntensity(c.risk_score), c.rank)}
          >
            <Popup>
              <div className="text-sm max-w-xs">
                <p className="font-semibold text-gray-900">{c.location_id}</p>
                <p className="text-gray-600 mt-0.5">
                  {c.location.location_type} — {c.location.region},{" "}
                  {c.location.metro}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Priority Score: {c.risk_score.toFixed(3)} · Rank #{c.rank}
                </p>
                <p className="text-xs mt-1">
                  <span className="font-medium text-gray-700">Priority: </span>
                  <span>{getPriorityLabel(c.risk_score)}</span>
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

      <DashboardMapLegend showHeatmap={showHeatmap} />

      <button
        type="button"
        onClick={onToggleHeatmap}
        className="absolute top-3 left-3 z-[1000] rounded-md bg-white/95 px-2.5 py-1.5 shadow-md text-xs font-medium text-gray-700 hover:bg-white transition-colors border border-gray-200 dark:bg-[#0a0a0a]/95 dark:text-gray-300 dark:hover:bg-[#141414] dark:border-gray-700"
      >
        {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
      </button>
    </MapContainer>
  );
}

export function SentinelMapDashboard(props: SentinelMapDashboardProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const handleTileError = useCallback(() => {
    setTileError(true);
  }, []);

  const handleToggleHeatmap = useCallback(() => {
    setShowHeatmap((prev) => !prev);
  }, []);

  return (
    <div ref={mapRef} className="relative h-[350px] w-full sm:h-[400px] lg:h-[450px]">
      <MapInner {...props} showHeatmap={showHeatmap} onToggleHeatmap={handleToggleHeatmap} />
      {tileError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] rounded-md border border-yellow-300 bg-yellow-50 px-3 py-1.5 shadow-sm text-xs text-yellow-800 max-w-xs text-center">
          Map tiles could not be loaded.
        </div>
      )}
    </div>
  );
}
