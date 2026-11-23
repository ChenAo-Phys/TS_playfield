/**
 * WCAG 2.x relative luminance and contrast ratio, for tests and for components that pick a text
 * colour against a computed background (e.g. a region band). Hex colours only (#rgb / #rrggbb).
 */

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** [r, g, b] 0..255 from "#rgb" or "#rrggbb". Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a foreground with alpha over an opaque background (both hex), returning hex. */
export function over(fg: string, alpha: number, bg: string): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return "#" + mix.map(c => c.toString(16).padStart(2, "0")).join("");
}
