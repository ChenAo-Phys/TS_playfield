/**
 * Where a popover goes (pure maths; Popover and CardZoomHost use it): beside its anchor on the preferred
 * side, flipping to the side that fits, never over an `avoid` rect (the orders slip), clamped inside the
 * viewport. Rects are viewport coordinates (CSS px).
 */

export type Side4 = "top" | "bottom" | "left" | "right";
export type PlacementPref = "auto" | Side4;

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placed {
  left: number;
  top: number;
  placement: Side4 | "center";
  /** Arrow offset along the popover edge that faces the anchor (px from its start). */
  arrow: number;
}

export interface PlaceOptions {
  placement?: PlacementPref;
  /** Distance from the anchor (default 12). */
  gap?: number;
  /** Minimum distance from the viewport edge (default 8). */
  margin?: number;
  /** Rects the popover must not cover when another side allows it. */
  avoid?: readonly RectLike[];
}

const OPPOSITE: Record<Side4, Side4> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function intersects(a: RectLike, b: RectLike): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** Free room on each side of the anchor inside the viewport. */
function room(anchor: RectLike, vw: number, vh: number, margin: number): Record<Side4, number> {
  return {
    top: anchor.top - margin,
    bottom: vh - (anchor.top + anchor.height) - margin,
    left: anchor.left - margin,
    right: vw - (anchor.left + anchor.width) - margin,
  };
}

function positionOn(side: Side4, anchor: RectLike, w: number, h: number, vw: number, vh: number, gap: number, margin: number): Placed {
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  if (side === "top" || side === "bottom") {
    const top = side === "top" ? anchor.top - gap - h : anchor.top + anchor.height + gap;
    const left = clamp(cx - w / 2, margin, Math.max(margin, vw - w - margin));
    return { left, top: clamp(top, margin, Math.max(margin, vh - h - margin)), placement: side, arrow: clamp(cx - left, 12, Math.max(12, w - 12)) };
  }
  const left = side === "left" ? anchor.left - gap - w : anchor.left + anchor.width + gap;
  const top = clamp(cy - h / 2, margin, Math.max(margin, vh - h - margin));
  return { left: clamp(left, margin, Math.max(margin, vw - w - margin)), top, placement: side, arrow: clamp(cy - top, 12, Math.max(12, h - 12)) };
}

/** Candidate sides in order of preference. */
function order(pref: PlacementPref, r: Record<Side4, number>): Side4[] {
  if (pref === "auto") {
    const horiz: Side4[] = r.right >= r.left ? ["right", "left"] : ["left", "right"];
    const vert: Side4[] = r.top >= r.bottom ? ["top", "bottom"] : ["bottom", "top"];
    return [...horiz, ...vert];
  }
  const cross: Side4[] = pref === "top" || pref === "bottom"
    ? (r.right >= r.left ? ["right", "left"] : ["left", "right"])
    : (r.top >= r.bottom ? ["top", "bottom"] : ["bottom", "top"]);
  return [pref, OPPOSITE[pref], ...cross];
}

/**
 * Place a `size` popover next to `anchor` in a `viewport`. The first candidate side that fits without
 * covering an avoid rect wins; then the first that fits; else the roomiest side, clamped.
 */
export function placePopover(anchor: RectLike, size: { width: number; height: number }, viewport: { width: number; height: number }, opts: PlaceOptions = {}): Placed {
  const { placement = "auto", gap = 12, margin = 8, avoid = [] } = opts;
  const { width: w, height: h } = size;
  const { width: vw, height: vh } = viewport;
  const r = room(anchor, vw, vh, margin);
  const need: Record<Side4, number> = { top: h + gap, bottom: h + gap, left: w + gap, right: w + gap };
  const sides = order(placement, r);
  const fits = sides.filter(s => r[s] >= need[s]);
  for (const s of fits) {
    const p = positionOn(s, anchor, w, h, vw, vh, gap, margin);
    const box = { left: p.left, top: p.top, width: w, height: h };
    if (!avoid.some(a => intersects(box, a))) return p;
  }
  if (fits.length) return positionOn(fits[0]!, anchor, w, h, vw, vh, gap, margin);
  const roomiest = [...sides].sort((a, b) => r[b] - need[b] - (r[a] - need[a]))[0]!;
  return positionOn(roomiest, anchor, w, h, vw, vh, gap, margin);
}

/** Centre a popover in the viewport (no anchor). */
export function placeCentered(size: { width: number; height: number }, viewport: { width: number; height: number }, margin = 8): Placed {
  return {
    left: Math.max(margin, (viewport.width - size.width) / 2),
    top: Math.max(margin, (viewport.height - size.height) / 2),
    placement: "center",
    arrow: 0,
  };
}
