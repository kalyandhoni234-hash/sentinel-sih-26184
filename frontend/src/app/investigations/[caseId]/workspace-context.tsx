"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { api } from "@/lib/api";
import type { CaseInfo } from "@/types/api";

/**
 * Case context — shared between the workspace layout and its child routes.
 *
 * `caseInfo` is the authoritative CaseInfo from GET /investigations/:id,
 * fetched once by the workspace layout. It is null while loading or on
 * error; children render their own loading/error states and must not
 * fabricate case facts when it is null.
 */
export interface CaseContextValue {
  caseId: string;
  caseInfo: CaseInfo | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const CaseContext = createContext<CaseContextValue | null>(null);

export function CaseContextProvider({
  caseId,
  children,
}: {
  caseId: string;
  children: React.ReactNode;
}) {
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getInvestigation(caseId)
      .then((data) => active && setCaseInfo(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [caseId, tick]);

  return (
    <CaseContext.Provider value={{ caseId, caseInfo, loading, error, reload }}>
      {children}
    </CaseContext.Provider>
  );
}

export function useCaseContext(): CaseContextValue {
  const ctx = useContext(CaseContext);
  if (!ctx) {
    throw new Error("useCaseContext must be used within a CaseContextProvider");
  }
  return ctx;
}
