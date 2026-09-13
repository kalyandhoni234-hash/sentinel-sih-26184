/**
 * Deterministic, bounded sampling helpers for the homepage.
 *
 * The homepage must communicate corpus-level scale (cases / candidates /
 * metros) while keeping priority and map information explicitly presented as
 * SAMPLED metrics — ranking every case client-side is neither possible (no
 * bulk ranking API) nor desirable (thousands of POSTs). All sampling here is:
 *
 *  - deterministic (fixed string-seed hash, identical on every render/build)
 *  - bounded (explicit limits, never O(cases × candidates) work)
 *  - geography-stratified (one case per metro before filling, so no metro —
 *    and none of the 47 — is starved or dominating)
 *  - ground-truth-free (operates only on fields present in
 *    InvestigationSummary; nothing about the true cash-out location is
 *    consulted, so no selection leakage into presentation)
 *
 * This is presentation sampling only. It does not touch ranking thresholds,
 * weights, feature engineering, or candidate-generation semantics.
 */

/** Deterministic 32-bit string hash (FNV-1a). Stable across sessions/builds. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned, avoid -0
  return h >>> 0;
}

/**
 * Stable shuffle of a copy of `items` driven by `seed`.
 * Each element's key = hash(seed + its original index) — deterministic given
 * the same input order, which is guaranteed by upstream sorts.
 */
export function stableShuffle<T>(items: readonly T[], seed: string): T[] {
  return items
    .map((item, index) => ({ item, key: hashSeed(`${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

/**
 * Geography-stratified sample: one case per metro (metro order itself
 * deterministically shuffled), then fill remaining slots with deterministic
 * leftovers. Guarantees broad metro coverage without letting the largest
 * metro dominate the sample.
 */
export function stratifiedByMetro<T extends { origin_metro: string }>(
  cases: readonly T[],
  size: number,
  seed: string
): T[] {
  if (size <= 0 || cases.length === 0) return [];

  const byMetro = new Map<string, T[]>();
  for (const c of cases) {
    const bucket = byMetro.get(c.origin_metro);
    if (bucket) bucket.push(c);
    else byMetro.set(c.origin_metro, [c]);
  }

  const picked: T[] = [];
  // Round 1 — one per metro, metro order deterministically shuffled.
  const metroRounds = stableShuffle([...byMetro.keys()], `${seed}:metros`);
  for (const metro of metroRounds) {
    if (picked.length >= size) break;
    const bucket = stableShuffle(byMetro.get(metro) ?? [], `${seed}:${metro}`);
    picked.push(bucket[0]);
  }

  // Round 2 — fill remaining slots deterministically from the leftovers.
  if (picked.length < size) {
    const chosen = new Set(picked);
    const rest = stableShuffle(
      cases.filter((c) => !chosen.has(c)),
      `${seed}:fill`
    );
    for (const c of rest) {
      if (picked.length >= size) break;
      picked.push(c);
    }
  }

  return picked;
}
