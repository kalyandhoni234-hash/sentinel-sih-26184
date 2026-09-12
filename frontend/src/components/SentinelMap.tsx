"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import type { RankedCandidate, CaseInfo } from "@/types/api";
import { getPriorityTier } from "@/lib/tiers";

import "leaflet/dist/leaflet.css";
import "@/lib/leaflet-fix";

export interface SentinelMapProps {
  caseInfo: CaseInfo;
  candidates: RankedCandidate[];
  highlightedId?: string | null;
  /** Called when the investigator chooses a candidate from the map popup. */
  onSelectCandidate?: (locationId: string) => void;
}

/* ── Marker geometry ────────────────────────────────────────────────────
   Candidate markers are HOLLOW (evidence = generated/prioritized by
   SENTINEL); the complaint-origin marker is SOLID (observed evidence).
   Rank drives size and label weight; tier drives color. Colors read
   design tokens directly because DivIcons live outside Tailwind's DOM. */

function getRankColor(rank: number): string {
  if (rank === 1) return "var(--danger)";
  if (rank <= 3) return "var(--warning)";
  return "var(--text-muted)";
}

function getRankRadius(rank: number): number {
  if (rank === 1) return 15;
  if (rank <= 3) return 12;
  if (rank <= 5) return 10;
  return 8;
}

function createCandidateIcon(rank: number, highlighted: boolean): L.DivIcon {
  const color = getRankColor(rank);
  const size = getRankRadius(rank);

  return L.divIcon({
    className: "",
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    html: `<div style="
      width: ${size * 2}px;
      height: ${size * 2}px;
      border-radius: 50%;
      background: var(--surface);
      border: 2.5px solid ${color};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${color};
      font-weight: 700;
      font-size: ${rank <= 3 ? 11 : 9}px;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ${highlighted ? "box-shadow: 0 0 0 3px var(--accent-dim), 0 0 0 5px var(--accent);" : ""}
      transition: box-shadow 0.15s ease;
    ">${rank}</div>`,
  });
}

function createOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="geointel-marker-evidence" style="width: 26px; height: 26px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
      <p className="font-semibold text-sentinel-text-secondary mb-1">Map Legend</p>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm"
          style={{ background: "var(--success)" }}
        />
        <span className="text-sentinel-text-secondary">Evidence — complaint origin (observed)</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full border-2 shadow-sm"
          style={{ borderColor: "var(--danger)", background: "var(--surface)" }}
        />
        <span className="text-sentinel-text-secondary">Candidate — rank #1</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full border-2 shadow-sm"
          style={{ borderColor: "var(--warning)", background: "var(--surface)" }}
        />
        <span className="text-sentinel-text-secondary">Candidate — rank #2–3</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border-2 shadow-sm"
          style={{ borderColor: "var(--text-muted)", background: "var(--surface)" }}
        />
        <span className="text-sentinel-text-secondary">Candidate — rank #4+</span>
      </div>
      <p className="border-t pt-1.5 text-[10px] leading-snug text-sentinel-text-muted">
        Solid = observed evidence. Hollow = SENTINEL-ranked candidate.
        <br />
        Ranked priority, not a confirmed cash-out location.
      </p>
    </div>
  );
}

function TileErrorDetector({ onTileError }: { onTileError: () => void }) {
  useMapEvents({
    tileerror: () => {
      onTileError();
    },
  });
  return null;
}

function TileErrorBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] rounded-md border border-yellow-300 bg-yellow-50 px-3 py-1.5 shadow-sm text-xs text-yellow-800 max-w-xs text-center">
      Map tiles could not be loaded. Candidate rankings and location data are
      shown beside the map.
    </div>
  );
}

function MapInner({
  caseInfo,
  candidates,
  highlightedId,
  onSelectCandidate,
  onTileError,
}: SentinelMapProps & { onTileError: () => void }) {
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
      <TileErrorDetector onTileError={onTileError} />
      <FitBounds caseInfo={caseInfo} candidates={candidates} />
      <HighlightHandler
        highlightedId={highlightedId}
        candidates={candidates}
      />

      {originPosition && (
        <Marker position={originPosition} icon={createOriginIcon()}>
          <Popup>
            <div className="text-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Observed Location — Evidence
              </p>
              <p className="mt-0.5 font-semibold text-sentinel-text">
                Complaint Origin
              </p>
              <p className="text-xs text-sentinel-text-secondary">{caseInfo.origin_metro}</p>
              <p className="mt-1 font-mono text-[10px] text-sentinel-text-muted">
                {caseInfo.origin_latitude?.toFixed(4)}, {caseInfo.origin_longitude?.toFixed(4)}
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
              <div className="text-sm max-w-[220px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sentinel-text-muted">
                  Candidate #{c.rank}
                </p>
                <p className="font-mono text-sm font-semibold text-sentinel-text">
                  {c.location_id}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-sentinel-text-secondary">
                  {getPriorityTier(c.risk_score)} Priority
                </p>
                <div className="mt-2 flex items-baseline justify-between border-t pt-2">
                  <span className="text-[10px] uppercase tracking-wider text-sentinel-text-muted">
                    Ranking Score
                  </span>
                  <span className="font-mono text-sm font-bold text-sentinel-text">
                    {c.risk_score.toFixed(3)}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-sentinel-text-muted">
                  {c.location.location_type} — {c.location.region}, {c.location.metro}
                </p>
                {/* The model's own explanation, rendered as-is (see
                    test_rf_explanation_honesty contract). Clipped so the
                    popup stays compact — the full text lives in the
                    workspace panels. */}
                <p className="mt-1.5 border-t pt-1.5 text-[10px] leading-snug text-sentinel-text-secondary">
                  {c.explanation.length > 90 ? `${c.explanation.slice(0, 90)}…` : c.explanation}
                </p>
                {onSelectCandidate && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectCandidate(c.location_id);
                    }}
                    className="btn-primary mt-2.5 w-full !py-1 text-xs"
                  >
                    Select
                  </button>
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
  const [tileError, setTileError] = useState(false);

  const handleTileError = useCallback(() => {
    setTileError(true);
  }, []);

  return (
    <div ref={mapRef} className="relative h-full min-h-[420px] w-full">
      <MapInner {...props} onTileError={handleTileError} />
      <TileErrorBanner visible={tileError} />
    </div>
  );
}
