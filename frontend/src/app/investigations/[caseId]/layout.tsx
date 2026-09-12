"use client";

import { useParams } from "next/navigation";
import { CaseContextProvider } from "./workspace-context";
import { CaseHeader } from "./CaseHeader";

/**
 * Investigation workspace layout — the Case Investigation Workspace
 * foundation. Provides shared case context (single GET /investigations/:id
 * fetch) and renders the persistent case header + case tab navigation
 * above whichever workspace section is active.
 */
export default function CaseWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const caseId = params.caseId as string;

  return (
    <CaseContextProvider caseId={caseId}>
      <CaseHeader />
      <div className="p-3 sm:p-5">{children}</div>
    </CaseContextProvider>
  );
}
