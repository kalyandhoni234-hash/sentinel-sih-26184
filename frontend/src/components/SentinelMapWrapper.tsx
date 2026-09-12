"use client";

import dynamic from "next/dynamic";
import type { RankedCandidate, CaseInfo } from "@/types/api";

const SentinelMapInner = dynamic(
  () =>
    import("./SentinelMap").then((mod) => ({ default: mod.SentinelMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-lg bg-sentinel-surface-alt">
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-sentinel-border border-t-sentinel-600" />
          <p className="text-sm text-sentinel-text-muted">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface SentinelMapWrapperProps {
  caseInfo: CaseInfo;
  candidates: RankedCandidate[];
  highlightedId?: string | null;
  onSelectCandidate?: (locationId: string) => void;
}

export function SentinelMapWrapper(props: SentinelMapWrapperProps) {
  return <SentinelMapInner {...props} />;
}
