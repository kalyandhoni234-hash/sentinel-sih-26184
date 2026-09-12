/**
 * Centralized priority-tier thresholds and classification.
 *
 * Single source of truth for every score surface in the application.
 * Threshold values are intentionally UNCHANGED from prior behavior
 * (HIGH >= 0.7, MEDIUM >= 0.4) — this module only removes duplication.
 *
 * IMPORTANT SEMANTICS — do not weaken these in call sites:
 * A tier is a relative prioritization band derived from the ranking
 * model's score. It is NOT a probability of a cash-out occurring at a
 * location and must never be presented as one. Pair every tier with the
 * standard disclaimer (see <Disclaimer /> / DISCLAIMER_SCORE_TEXT).
 */

export const HIGH_THRESHOLD = 0.7;
export const MEDIUM_THRESHOLD = 0.4;

export type PriorityTier = "HIGH" | "MEDIUM" | "LOW";

export function getPriorityTier(score: number): PriorityTier {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/** CSS class for the shared `.priority-*` styles in globals.css. */
export function getPriorityTierClass(tier: PriorityTier): string {
  return `priority-${tier.toLowerCase()}`;
}
