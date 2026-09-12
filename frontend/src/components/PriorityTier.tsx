import { getPriorityTier, getPriorityTierClass, type PriorityTier } from "@/lib/tiers";

/**
 * PriorityTier — the shared HIGH / MEDIUM / LOW classification badge.
 *
 * Uses the centralized thresholds from lib/tiers.ts. Renders the tier as
 * relative prioritization language only; pair with <Disclaimer /> wherever
 * a raw score is also shown.
 */
export function PriorityTier({
  score,
  tier,
  label,
}: {
  /** Model score — pass either `score` or an explicit `tier`. */
  score?: number;
  tier?: PriorityTier;
  /** Optional suffix, e.g. "PRIORITY". */
  label?: string;
}) {
  const resolved = tier ?? getPriorityTier(score ?? 0);
  return (
    <span className={`priority-indicator ${getPriorityTierClass(resolved)}`}>
      {resolved}
      {label ? ` ${label}` : ""}
    </span>
  );
}
