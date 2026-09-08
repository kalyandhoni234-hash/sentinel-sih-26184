"use client";

import dynamic from "next/dynamic";
import type { RankedCandidate, CaseInfo } from "@/types/api";

const SentinelMapInner = dynamic(
  () =>
    import("./SentinelMap").then((mod) => ({ default: mod.SentinelMap })),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[400px] w-full items-center justify-center rounded-lg bg-gray-100 sm:h-[480px] lg:h-[500px]"
      >
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sentinel-600" />
          <p className="text-sm text-gray-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface SentinelMapWrapperProps {
  caseInfo: CaseInfo;
  candidates: RankedCandidate[];
  highlightedId?: string | null;
}

export function SentinelMapWrapper(props: SentinelMapWrapperProps) {
  return <SentinelMapInner {...props} />;
}
