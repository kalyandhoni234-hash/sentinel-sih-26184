/**
 * Cross-view candidate selection sharing.
 *
 * The selected candidate id is stored in sessionStorage so that navigating
 * between the Candidates workspace and GeoIntel keeps the same candidate
 * focused — two views of the same investigation, one selection. sessionStorage
 * (not localStorage) keeps the state per-tab and self-clearing.
 */

const KEY = "sentinel-selected-candidate";

export function getSharedCandidateSelection(caseId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { caseId: string; locationId: string };
    return parsed.caseId === caseId ? parsed.locationId : null;
  } catch {
    return null;
  }
}

export function setSharedCandidateSelection(caseId: string, locationId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (locationId) {
      sessionStorage.setItem(KEY, JSON.stringify({ caseId, locationId }));
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Storage unavailable (private mode etc.) — selection simply won't persist.
  }
}
