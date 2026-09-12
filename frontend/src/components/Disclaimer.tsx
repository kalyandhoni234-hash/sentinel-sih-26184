/**
 * Shared disclaimer wording.
 *
 * One component, one constant — every score surface uses these verbatim
 * so the product never varies its honesty language between pages.
 */

export const DISCLAIMER_SCORE_TEXT =
  "Relative prioritization based on observed evidence — not a prediction of certainty.";

export function Disclaimer({
  variant = "inline",
  children,
}: {
  /** "inline" — muted single line under a score or section. "panel" — standalone bordered note. */
  variant?: "inline" | "panel";
  children?: React.ReactNode;
}) {
  if (variant === "inline") {
    return (
      <p className="text-[10px] leading-relaxed text-sentinel-text-muted">
        {children ?? DISCLAIMER_SCORE_TEXT}
      </p>
    );
  }
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-alt)",
      }}
    >
      <p className="text-[11px] leading-relaxed text-sentinel-text-secondary">
        {children ?? DISCLAIMER_SCORE_TEXT}
      </p>
    </div>
  );
}
