/** Shared formatting utilities for the SENTINEL frontend. */

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Time-of-day only, e.g. "14:32:11" — used in the evidence trail. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Date only, e.g. "11 Sep 2026" — paired with formatTime in dense rows. */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Full timestamp for expanded detail views, e.g. "11 Sep 2026, 14:32:11". */
export function formatTimestampFull(iso: string): string {
  return `${formatDateShort(iso)}, ${formatTime(iso)}`;
}
