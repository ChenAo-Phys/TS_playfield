/**
 * Number formatting shared by counters (ui-spec §14 "Numbers"): Arabic numerals, a real minus sign
 * (U+2212) and "+" for signed deltas, "0" unsigned.
 */
export const MINUS = "−";

/** "+2", "−3", "0". */
export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${MINUS}${Math.abs(n)}`;
  return "0";
}

/** A plain number with a real minus sign ("−3"); `signed` adds "+" to positives. */
export function formatNumber(n: number, signed = false): string {
  if (signed) return formatSigned(n);
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}
