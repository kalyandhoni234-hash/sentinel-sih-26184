import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

/**
 * Session-cached health status.
 *
 * The shell, the homepage, and the health page all need API status, but the
 * health endpoint only reports deployment info — it is safe to fetch once per
 * session and share. Module-level cache survives route changes (client-side
 * navigation does not remount the module registry).
 */
let cached: Promise<HealthResponse> | null = null;

function fetchHealth(): Promise<HealthResponse> {
  if (!cached) {
    cached = api.getHealth();
    // On failure, allow a later retry instead of caching the rejection.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((h) => active && setHealth(h))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, []);

  return { health, error, status: error ? "offline" : health ? "operational" : "checking" } as const;
}
