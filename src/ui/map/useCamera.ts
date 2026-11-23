/**
 * The map camera (ui-spec §4.7): fit, wheel zoom around the cursor, drag pan with a 6 px slop,
 * pinch, double-click / double-tap zoom, animated framing. The view is written straight to the
 * SVG's viewBox attribute (no React render per frame); React only sees the settled scale, which
 * drives the detail level.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { LayoutKind } from "../theme";
import {
  clampView,
  DOUBLE_ZOOM,
  easeInOut,
  frameRect,
  homeView,
  lerpView,
  limitsFor,
  nextTap,
  panBy,
  scaleOf,
  toMap,
  viewport,
  visibleRect,
  WHEEL_STEP,
  zoomAround,
  type Tap,
  type View,
  type Viewport,
} from "./camera";
import type { MapInsets } from "./contract";
import { containsRect, type Rect } from "./layout";
import { prefersReducedMotion } from "./motion";

/** Drag slop (px): a press that moves less is still a click. */
export const DRAG_SLOP = 6;
/** Camera transitions (ui-spec §4.7). */
export const CAMERA_MS = 350;
/** Follow-camera holds off this long after a manual pan/zoom. */
export const MANUAL_HOLD_MS = 3000;

export interface CameraOptions {
  svgRef: RefObject<SVGSVGElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  layout: LayoutKind;
  insets?: MapInsets;
  overlap: number;
  /** Initial framing for compact layouts (desktop/tablet start at fit). */
  initialRect?: Rect;
  onSettle?(view: View, scale: number): void;
  /**
   * Whether a press on this element is on an active target (a box or plate the prompt offers): a tap
   * there is always a click, never half of a double-tap zoom.
   */
  isTarget?(target: EventTarget | null): boolean;
}

export interface Camera {
  /** Settled scale (CSS px per map unit); updates at the end of gestures and transitions. */
  scale: number;
  view(): View;
  viewportNow(): Viewport;
  /** Apply a view now (clamped), or animate to it. */
  go(view: View, opts?: { animate?: boolean; manual?: boolean }): Promise<void>;
  frame(rect: Rect, opts?: { animate?: boolean; maxScale?: number; minScale?: number }): Promise<void>;
  fit(opts?: { animate?: boolean }): Promise<void>;
  zoomBy(factor: number, at?: { x: number; y: number }, opts?: { animate?: boolean }): Promise<void>;
  /** Pan (keeping the scale) so `rect` is inside the visible area. */
  reveal(rect: Rect, opts?: { animate?: boolean }): Promise<void>;
  isVisible(rect: Rect): boolean;
  /** True (once) when the last press turned into a drag/pinch: the click that follows is swallowed. */
  consumeDrag(): boolean;
  /** A pointer is down on the map, or the user moved the camera in the last 3 s. */
  userBusy(): boolean;
  /** Map point under a client (viewport) point. */
  clientToMap(clientX: number, clientY: number): { x: number; y: number };
  /** Client rect (viewport px) of a map rect. */
  mapToClient(rect: Rect): DOMRect | null;
}

interface Pointer {
  x: number;
  y: number;
  type: string;
}

export function useCamera(o: CameraOptions): Camera {
  const { svgRef, containerRef, layout } = o;
  const insetsKey = JSON.stringify(o.insets ?? {});
  const vpRef = useRef<Viewport>(viewport(1000, 614, o.insets, o.overlap));
  const viewRef = useRef<View>(homeView(vpRef.current, layout));
  const [scale, setScale] = useState(() => scaleOf(viewRef.current, vpRef.current));
  const anim = useRef<{ raf: number; resolve(): void } | null>(null);
  const manualAt = useRef(-Infinity);
  const touched = useRef(false); // the user has moved the camera since the last fit
  const pointers = useRef(new Map<number, Pointer>());
  const dragged = useRef(false);
  const gesture = useRef<
    | { kind: "pan"; x: number; y: number; view: View; moved: boolean }
    | { kind: "pinch"; dist: number; mx: number; my: number; view: View }
    | null
  >(null);
  const lastTap = useRef<Tap | null>(null);
  /** The pointer type of the last press: a `dblclick` that touch taps synthesise is not a mouse double-click. */
  const lastDownType = useRef("mouse");
  const settleTimer = useRef<number | undefined>(undefined);
  const onSettleRef = useRef(o.onSettle);
  onSettleRef.current = o.onSettle;
  const isTargetRef = useRef(o.isTarget);
  isTargetRef.current = o.isTarget;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const limits = () => limitsFor(vpRef.current, layoutRef.current);

  const write = useCallback((v: View) => {
    viewRef.current = v;
    const svg = svgRef.current;
    if (svg) svg.setAttribute("viewBox", `${round(v.x)} ${round(v.y)} ${round(v.w)} ${round(v.h)}`);
  }, [svgRef]);

  const settle = useCallback(() => {
    const s = scaleOf(viewRef.current, vpRef.current);
    setScale(prev => (Math.abs(prev - s) < 1e-4 ? prev : s));
    onSettleRef.current?.(viewRef.current, s);
  }, []);

  const stopAnim = useCallback(() => {
    if (anim.current) {
      cancelAnimationFrame(anim.current.raf);
      anim.current.resolve();
      anim.current = null;
    }
  }, []);

  const go = useCallback((target: View, opts: { animate?: boolean; manual?: boolean } = {}): Promise<void> => {
    stopAnim();
    const to = clampView(target, vpRef.current, limits());
    if (opts.manual) { manualAt.current = performance.now(); touched.current = true; }
    const from = viewRef.current;
    const animate = opts.animate !== false && !prefersReducedMotion() && typeof requestAnimationFrame === "function";
    if (!animate || sameView(from, to)) {
      write(to);
      settle();
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / CAMERA_MS);
        write(lerpView(from, to, easeInOut(t)));
        if (t < 1) {
          anim.current!.raf = requestAnimationFrame(tick);
        } else {
          anim.current = null;
          settle();
          resolve();
        }
      };
      anim.current = { raf: requestAnimationFrame(tick), resolve };
    });
  }, [settle, stopAnim, write]);

  // ── Container size ────────────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      const prev = vpRef.current;
      const next = viewport(width, height, JSON.parse(insetsKey) as MapInsets, o.overlap);
      vpRef.current = next;
      if (!touched.current) {
        // Not moved by the user yet: keep the initial framing.
        if (o.initialRect && layoutRef.current !== "desktop" && layoutRef.current !== "tablet") {
          write(frameRect(o.initialRect, next, limitsFor(next, layoutRef.current)));
        } else {
          write(homeView(next, layoutRef.current));
        }
      } else {
        // Keep the map point at the centre and the scale.
        const v = viewRef.current;
        const s = scaleOf(v, prev);
        const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
        const w = next.width / s, h = next.height / s;
        write(clampView({ x: cx - w / 2, y: cy - h / 2, w, h }, next, limitsFor(next, layoutRef.current)));
      }
      settle();
    };
    const r = el.getBoundingClientRect();
    apply(r.width, r.height);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box && (Math.abs(box.width - vpRef.current.width) > 0.5 || Math.abs(box.height - vpRef.current.height) > 0.5)) {
        stopAnim();
        apply(box.width, box.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // o.initialRect is read once per layout change on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, insetsKey, o.overlap, layout, settle, stopAnim, write]);

  // ── Gestures ──────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const dy = Math.max(-300, Math.min(300, e.deltaY * unit));
      const factor = Math.pow(WHEEL_STEP, -dy / 100);
      const p = local(e);
      write(zoomAround(viewRef.current, vpRef.current, limits(), factor, p.x, p.y));
      manualAt.current = performance.now();
      touched.current = true;
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 140);
    };
    const onDown = (e: PointerEvent) => {
      lastDownType.current = e.pointerType;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopAnim();
      const p = local(e);
      pointers.current.set(e.pointerId, { ...p, type: e.pointerType });
      dragged.current = false;
      if (pointers.current.size === 1) {
        gesture.current = { kind: "pan", x: p.x, y: p.y, view: viewRef.current, moved: false };
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = {
          kind: "pinch", dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)),
          mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2, view: viewRef.current,
        };
        dragged.current = true;
        try { svg.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      }
    };
    const onMove = (e: PointerEvent) => {
      const ptr = pointers.current.get(e.pointerId);
      if (!ptr) return;
      const p = local(e);
      ptr.x = p.x; ptr.y = p.y;
      const g = gesture.current;
      if (!g) return;
      if (g.kind === "pan") {
        const dx = p.x - g.x, dy = p.y - g.y;
        if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        if (!g.moved) {
          g.moved = true;
          dragged.current = true;
          try { svg.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        }
        write(panBy(g.view, vpRef.current, limits(), dx, dy));
      } else if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y));
        const mx = (a!.x + b!.x) / 2, my = (a!.y + b!.y) / 2;
        const zoomed = zoomAround(g.view, vpRef.current, limits(), dist / g.dist, g.mx, g.my);
        write(panBy(zoomed, vpRef.current, limits(), mx - g.mx, my - g.my));
      }
      manualAt.current = performance.now();
      touched.current = true;
    };
    const onUp = (e: PointerEvent) => {
      const ptr = pointers.current.get(e.pointerId);
      if (!ptr) return;
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      if (pointers.current.size === 1) {
        // Pinch → pan with the remaining finger, without a jump.
        const [rest] = [...pointers.current.values()];
        gesture.current = { kind: "pan", x: rest!.x, y: rest!.y, view: viewRef.current, moved: true };
        return;
      }
      if (pointers.current.size > 0) return;
      gesture.current = null;
      if (g && (g.kind === "pinch" || g.moved)) { settle(); return; }
      // A tap: touch double-tap zooms 2× (mouse uses dblclick), except on an active target, where every
      // tap is a click (two quick taps place two points).
      if (ptr.type === "touch" && e.type === "pointerup") {
        const now = performance.now();
        const tap = nextTap(lastTap.current, { t: now, x: ptr.x, y: ptr.y }, isTargetRef.current?.(e.target) ?? false);
        lastTap.current = tap.last;
        if (tap.zoom) {
          dragged.current = true; // swallow the click of the second tap
          manualAt.current = now;
          touched.current = true;
          void go(zoomAround(viewRef.current, vpRef.current, limits(), DOUBLE_ZOOM, ptr.x, ptr.y), { animate: true });
        }
      }
    };
    const onDbl = (e: MouseEvent) => {
      // Touch zooms on its own double-tap (onUp); the browser's dblclick after two taps is not one. A
      // double-click on an active target is two clicks (two points), not a zoom.
      if (lastDownType.current === "touch" || isTargetRef.current?.(e.target)) return;
      const p = local(e);
      manualAt.current = performance.now();
      touched.current = true;
      void go(zoomAround(viewRef.current, vpRef.current, limits(), e.shiftKey ? 1 / DOUBLE_ZOOM : DOUBLE_ZOOM, p.x, p.y), { animate: true });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("dblclick", onDbl);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("dblclick", onDbl);
      window.clearTimeout(settleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgRef, go, settle, stopAnim, write]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  return useMemo<Camera>(() => ({
    scale,
    view: () => viewRef.current,
    viewportNow: () => vpRef.current,
    go,
    frame: (rect, opts = {}) => {
      // A framed view (follow camera, theatre chips, region keys) survives container resizes, like a
      // manual one: on compact the orders sheet changes height with every prompt and staged choice.
      touched.current = true;
      const lim = limits();
      const max = opts.maxScale !== undefined ? Math.max(lim.min, opts.maxScale) : undefined;
      let v = frameRect(rect, vpRef.current, lim, max);
      if (opts.minScale !== undefined && scaleOf(v, vpRef.current) < opts.minScale) {
        const s = Math.min(lim.max, opts.minScale);
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        const vis = visibleRect(v, vpRef.current);
        const sv = scaleOf(v, vpRef.current);
        // Centre of the uncovered area in px, re-used at the new scale.
        const pcx = (vis.x - v.x + vis.w / 2) * sv, pcy = (vis.y - v.y + vis.h / 2) * sv;
        v = { x: cx - pcx / s, y: cy - pcy / s, w: vpRef.current.width / s, h: vpRef.current.height / s };
      }
      return go(v, { animate: opts.animate });
    },
    fit: (opts = {}) => { touched.current = false; return go(homeView(vpRef.current, layoutRef.current), { animate: opts.animate }); },
    zoomBy: (factor, at, opts = {}) => {
      const p = at ?? { x: vpRef.current.width / 2, y: vpRef.current.height / 2 };
      touched.current = true;
      return go(zoomAround(viewRef.current, vpRef.current, limits(), factor, p.x, p.y), { animate: opts.animate, manual: true });
    },
    reveal: (rect, opts = {}) => {
      const vis = visibleRect(viewRef.current, vpRef.current);
      if (containsRect(vis, rect)) return Promise.resolve();
      const v = viewRef.current;
      const dx = (rect.x + rect.w / 2) - (vis.x + vis.w / 2), dy = (rect.y + rect.h / 2) - (vis.y + vis.h / 2);
      return go({ ...v, x: v.x + dx, y: v.y + dy }, { animate: opts.animate });
    },
    isVisible: rect => containsRect(visibleRect(viewRef.current, vpRef.current), rect),
    consumeDrag: () => { const d = dragged.current; dragged.current = false; return d; },
    userBusy: () => pointers.current.size > 0 || performance.now() - manualAt.current < MANUAL_HOLD_MS,
    clientToMap: (cx, cy) => {
      const svg = svgRef.current;
      const r = svg?.getBoundingClientRect();
      return toMap(viewRef.current, vpRef.current, cx - (r?.left ?? 0), cy - (r?.top ?? 0));
    },
    mapToClient: rect => {
      const svg = svgRef.current;
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const v = viewRef.current, s = scaleOf(v, vpRef.current);
      return new DOMRect(r.left + (rect.x - v.x) * s, r.top + (rect.y - v.y) * s, rect.w * s, rect.h * s);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [scale, go, svgRef]);
}

const round = (v: number) => Math.round(v * 100) / 100;
const sameView = (a: View, b: View) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01;
