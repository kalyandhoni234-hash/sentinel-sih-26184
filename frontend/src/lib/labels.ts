/**
 * Centralized display labels for backend enum values.
 *
 * Every label here maps an actual value produced by the SENTINEL backend
 * (fraud scenarios, model identifiers, feature groups, account roles,
 * transaction types). Nothing in this file invents data — it only gives
 * backend values human-readable names, replacing per-page duplicated maps.
 */

export const SCENARIO_LABELS: Record<string, string> = {
  DIRECT_CASHOUT: "Direct Cashout",
  RAPID_MULE_CHAIN: "Rapid Mule Chain",
  MULTI_HOP: "Multi Hop",
  GEOGRAPHIC_JUMP: "Geographic Jump",
  DELAYED_CASHOUT: "Delayed Cashout",
  URBAN_CLUSTER: "Urban Cluster",
  DISPERSED_ACTIVITY: "Dispersed Activity",
};

/** Scenario → existing `.badge-*` color class. Cosmetic mapping only. */
export const SCENARIO_BADGES: Record<string, string> = {
  DIRECT_CASHOUT: "badge-red",
  RAPID_MULE_CHAIN: "badge-blue",
  MULTI_HOP: "badge-yellow",
  GEOGRAPHIC_JUMP: "badge-green",
  DELAYED_CASHOUT: "badge-yellow",
  URBAN_CLUSTER: "badge-blue",
  DISPERSED_ACTIVITY: "badge-green",
};

export const MODEL_LABELS: Record<string, string> = {
  weighted_baseline: "Weighted Baseline",
  random_forest: "Random Forest",
};

/** Feature groups emitted by the weighted baseline (group_scores). */
export const GROUP_LABELS: Record<string, string> = {
  geographic: "Geographic",
  transaction: "Transaction",
  location: "Location",
  temporal: "Temporal",
  case: "Case",
};

/** Group → existing Tailwind bar color class. Cosmetic mapping only. */
export const GROUP_BAR_COLORS: Record<string, string> = {
  geographic: "bg-blue-500",
  transaction: "bg-emerald-500",
  location: "bg-amber-500",
  temporal: "bg-purple-500",
  case: "bg-sentinel-text-muted",
};

export const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  VICTIM: "Victim",
  MULE: "Mule",
  CASH_OUT: "Cash Out",
  INTERMEDIATE: "Intermediate",
  UNKNOWN: "Unknown",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  UPI: "UPI",
  NEFT: "NEFT",
  RTGS: "RTGS",
  IMPS: "IMPS",
  WIRE: "Wire",
};

export function scenarioLabel(scenario: string): string {
  return (
    SCENARIO_LABELS[scenario] ?? scenario.replace(/_/g, " ").toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
