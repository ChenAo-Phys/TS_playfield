/**
 * Camera maths for the map (pure, unit-tested): the SVG viewBox ("view", map units) for a container
 * ("viewport", CSS px), fit, zoom around a point, framing, clamping and visibility.
 * Spec: docs/design/ui-spec.md §4.7, §3.1 (fit with the tray overlap).
 *
 * The view always has the viewport's aspect ratio, so scale = viewport.width / view.w and
 * `preserveAspectRatio` never letterboxes.
 */
import type { LayoutKind } from "../theme";
import type { MapInsets } from "./contract";
import { MAP_H, MAP_W, type Rect } from "./layout";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  /** Container size (CSS px). */
  width: number;
  height: number;
  /** Px of the container covered by other UI. */
  insets: Required<MapInsets>;
  /** How far the fitted map may slide under the bottom inset (px). */
  overlap: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

/** Map units the camera may show beyond the map's edge when zoomed in. */
export const EDGE_SLACK = 30;
/** Padding around framed countries (ui-spec §15.1 `frame`). */
export const FRAME_PAD = 80;
/** Wheel zoom per notch, double-click/tap zoom (ui-spec §4.7). */
export const WHEEL_STEP = 1.15;
export const DOUBLE_ZOOM = 2;
/** Smallest comfortable touch scale when framing targets on compact (box ≥ 75 × 48 px). */
export const COMPACT_TOUCH_SCALE = 0.85;
/** Touch double-tap: the second tap within this long (ms) and this near (px) of the first. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;

/** A touch tap on the map: when (ms) and where (px in the map's box). */
export interface Tap {
  t: number;
  x: number;
  y: number;
}

/**
 * Touch double-tap (ui-spec §3.3 "double-tap zooms 2×"): whether this tap zooms, and the tap a next one
 * pairs with. A tap on an active target (a box or region plate the prompt offers) is always a click: it
 * never zooms and never starts a double-tap, so two quick taps on a target place two points.
 */
export function nextTap(last: Tap | null, tap: Tap, onTarget: boolean): { zoom: boolean; last: Tap | null } {
  if (onTarget) return { zoom: false, last: null };
  if (last && tap.t - last.t < DOUBLE_TAP_MS && Math.hypot(last.x - tap.x, last.y - tap.y) < DOUBLE_TAP_PX) return { zoom: true, last: null };
  return { zoom: false, last: tap };
}

export function viewport(width: number, height: number, insets: MapInsets = {}, overlap = 0): Viewport {
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    insets: { top: insets.top ?? 0, right: insets.right ?? 0, bottom: insets.bottom ?? 0, left: insets.left ?? 0 },
    overlap: Math.max(0, overlap),
  };
}

export const scaleOf = (view: View, vp: Viewport): number => vp.width / view.w;

/** The uncovered part of the viewport (px). */
function visiblePx(vp: Viewport): { x: number; y: number; w: number; h: number } {
  const { top, right, bottom, left } = vp.insets;
  return { x: left, y: top, w: Math.max(1, vp.width - left - right), h: Math.max(1, vp.height - top - bottom) };
}

/** The "fit" scale: the whole map visible, its bottom allowed `overlap` px under the bottom inset. */
export function fitScaleFor(vp: Viewport): number {
  const v = visiblePx(vp);
  return Math.min(v.w / MAP_W, (v.h + vp.overlap) / MAP_H);
}

/** The "cover" scale: the map fills the uncovered viewport on both axes (no empty bands). */
export function coverScaleFor(vp: Viewport): number {
  const v = visiblePx(vp);
  return Math.max(v.w / MAP_W, v.h / MAP_H);
}

export const isCompactLayout = (layout: LayoutKind): boolean => layout === "compact" || layout === "compact-landscape";

/**
 * Zoom range. Desktop/tablet: [fit, fit × 4] (ui-spec §4.7). Compact: the map always fills the
 * screen (a phone never shows empty bands around a tiny world) up to at least 2 px per unit.
 */
export function limitsFor(vp: Viewport, layout: LayoutKind): ZoomLimits {
  if (isCompactLayout(layout)) {
    const min = coverScaleFor(vp);
    return { min, max: Math.max(min * 4, 2) };
  }
  const fit = fitScaleFor(vp);
  return { min: fit, max: Math.max(fit * 4, 1.6) };
}

/** The camera's home view: fit on desktop/tablet; on compact the cover view centred on the map. */
export function homeView(vp: Viewport, layout: LayoutKind): View {
  if (!isCompactLayout(layout)) return fitView(vp);
  const s = coverScaleFor(vp);
  const v = visiblePx(vp);
  const view = { x: MAP_W / 2 - (v.x + v.w / 2) / s, y: MAP_H / 2 - (v.y + v.h / 2) / s, w: vp.width / s, h: vp.height / s };
  return clampView(view, vp, limitsFor(vp, layout));
}

/** The fitted view: centred horizontally; top-aligned when it may slide under the tray, else centred. */
export function fitView(vp: Viewport): View {
  const s = fitScaleFor(vp);
  const v = visiblePx(vp);
  const offX = v.x + (v.w - MAP_W * s) / 2;
  const offY = vp.overlap > 0 ? v.y : v.y + Math.max(0, (v.h - MAP_H * s) / 2);
  return { x: -offX / s, y: -offY / s, w: vp.width / s, h: vp.height / s };
}

/** The map rect (map units) visible through the uncovered part of the viewport. */
export function visibleRect(view: View, vp: Viewport): Rect {
  const s = scaleOf(view, vp);
  const v = visiblePx(vp);
  return { x: view.x + v.x / s, y: view.y + v.y / s, w: v.w / s, h: v.h / s };
}

/** Keep the map in sight: no panning past its edges (± slack); a map smaller than the view is centred. */
export function clampView(view: View, vp: Viewport, limits: ZoomLimits): View {
  let s = scaleOf(view, vp);
  const clampedS = Math.min(limits.max, Math.max(limits.min, s));
  let out = view;
  if (Math.abs(clampedS - s) > 1e-9) {
    // Re-scale around the view centre.
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const w = vp.width / clampedS, h = vp.height / clampedS;
    out = { x: cx - w / 2, y: cy - h / 2, w, h };
    s = clampedS;
  }
  const v = visiblePx(vp);
  const fit = fitView(vp);
  const atFit = Math.abs(s - fitScaleFor(vp)) < 1e-6 && Math.abs(limits.min - fitScaleFor(vp)) < 1e-6;
  const axis = (pos: number, offPx: number, visPx: number, mapLen: number, fitPos: number): number => {
    // At fit the camera holds the fitted alignment (the bottom band may sit under the tray).
    if (atFit) return fitPos;
    const visLen = visPx / s;
    const lo0 = pos + offPx / s; // map coordinate at the visible area's start
    // A map shorter than the visible area stays inside it; a longer one may be panned to its
    // edges (plus a little slack). The tray overlap only applies at fit.
    const [min, max] = mapLen <= visLen ? [mapLen - visLen, 0] : [-EDGE_SLACK, mapLen + EDGE_SLACK - visLen];
    return Math.min(max, Math.max(min, lo0)) - offPx / s;
  };
  return {
    x: axis(out.x, v.x, v.w, MAP_W, fit.x),
    y: axis(out.y, v.y, v.h, MAP_H, fit.y),
    w: out.w,
    h: out.h,
  };
}

/** Zoom by `factor` keeping the map point under (px, py) (container px) fixed. */
export function zoomAround(view: View, vp: Viewport, limits: ZoomLimits, factor: number, px: number, py: number): View {
  const s = scaleOf(view, vp);
  const s2 = Math.min(limits.max, Math.max(limits.min, s * factor));
  const mx = view.x + px / s, my = view.y + py / s;
  const w = vp.width / s2, h = vp.height / s2;
  return clampView({ x: mx - px / s2, y: my - py / s2, w, h }, vp, limits);
}

/** Pan by (dx, dy) container px. */
export function panBy(view: View, vp: Viewport, limits: ZoomLimits, dx: number, dy: number): View {
  const s = scaleOf(view, vp);
  return clampView({ ...view, x: view.x - dx / s, y: view.y - dy / s }, vp, limits);
}

/**
 * The view that shows `rect` centred in the uncovered viewport, as large as it fits, within
 * [limits.min, limits.max] and no larger than `maxScale` (when given).
 */
export function frameRect(rect: Rect, vp: Viewport, limits: ZoomLimits, maxScale?: number): View {
  const v = visiblePx(vp);
  let s = Math.min(v.w / rect.w, v.h / rect.h);
  if (maxScale !== undefined) s = Math.min(s, maxScale);
  s = Math.min(limits.max, Math.max(limits.min, s));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const view = { x: cx - (v.x + v.w / 2) / s, y: cy - (v.y + v.h / 2) / s, w: vp.width / s, h: vp.height / s };
  return clampView(view, vp, limits);
}

/** The scale at which `rect` just fits the uncovered viewport. */
export function scaleToFit(rect: Rect, vp: Viewport): number {
  const v = visiblePx(vp);
  return Math.min(v.w / rect.w, v.h / rect.h);
}

/** Map point (units) under a container point (px). */
export function toMap(view: View, vp: Viewport, px: number, py: number): { x: number; y: number } {
  const s = scaleOf(view, vp);
  return { x: view.x + px / s, y: view.y + py / s };
}

/** Container point (px) of a map point. */
export function toScreen(view: View, vp: Viewport, x: number, y: number): { x: number; y: number } {
  const s = scaleOf(view, vp);
  return { x: (x - view.x) * s, y: (y - view.y) * s };
}

/** Linear interpolation between two views (the animated camera). */
export function lerpView(a: View, b: View, t: number): View {
  // Interpolate the scale geometrically so zooms feel even.
  const wa = a.w, wb = b.w;
  const w = wa * Math.pow(wb / wa, t);
  const h = a.h * Math.pow(b.h / a.h, t);
  const k = wa === wb ? t : (w - wa) / (wb - wa);
  const cxa = a.x + a.w / 2, cya = a.y + a.h / 2, cxb = b.x + b.w / 2, cyb = b.y + b.h / 2;
  const kk = Number.isFinite(k) ? k : t;
  const cx = cxa + (cxb - cxa) * kk, cy = cya + (cyb - cya) * kk;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The ease-in-out curve of --ts-ease-in-out (cubic-bezier(.65, 0, .35, 1)), sampled. */
export function easeInOut(t: number): number {
  return cubicBezier(0.65, 0, 0.35, 1, t);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Solve x(u) = t by Newton, then return y(u).
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = bez(x1, x2, u) - t;
    const d = bezD(x1, x2, u);
    if (Math.abs(x) < 1e-5 || d === 0) break;
    u -= x / d;
  }
  return bez(y1, y2, Math.min(1, Math.max(0, u)));
}
const bez = (p1: number, p2: number, u: number) => 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;
const bezD = (p1: number, p2: number, u: number) => 3 * (1 - u) * (1 - u) * p1 + 6 * (1 - u) * u * (p2 - p1) + 3 * u * u * (1 - p2);
