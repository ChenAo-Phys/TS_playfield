/**
 * Camera maths (ui-spec §4.7, §3.1): fit, limits, clamping, zoom around a point, framing, visibility.
 */
import { describe, expect, it } from "vitest";
import {
  clampView,
  coverScaleFor,
  fitScaleFor,
  fitView,
  frameRect,
  homeView,
  lerpView,
  limitsFor,
  panBy,
  scaleOf,
  toMap,
  toScreen,
  viewport,
  visibleRect,
  zoomAround,
  easeInOut,
  nextTap,
} from "../../src/ui/map/camera";
import { boundsOf, COUNTRY_LAYOUT, containsRect, MAP_H, MAP_W } from "../../src/ui/map/layout";
import { fitScale } from "../../src/ui/theme";

// Desktop 1440 × 900: the table is 1152 × 842; the map frame is inset 10 px; the tray (167 px)
// covers the bottom, and the map may slide 64 px under it (ui-spec Appendix A).
const desk = viewport(1132, 822, { bottom: 157 }, 64);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("fit", () => {
  it("matches the theme's fitScale at 1440 × 900 (0.638, width-bound)", () => {
    const s = fitScaleFor(desk);
    near(s, fitScale({ tableW: 1152, tableH: 842, trayH: 167, pad: 10, overlap: 64, mapW: MAP_W, mapH: MAP_H }), 1e-9);
    near(s, 1132 / 1775, 1e-9);
    expect(s).toBeCloseTo(0.638, 3);
  });

  it("fits the whole map: centred horizontally, top-aligned when it may slide under the tray", () => {
    const v = fitView(desk);
    const s = scaleOf(v, desk);
    const tl = toScreen(v, desk, 0, 0), br = toScreen(v, desk, MAP_W, MAP_H);
    near(tl.x, 0, 1e-6);
    near(br.x, 1132, 1e-6);
    near(tl.y, 0, 1e-6);
    expect(br.y).toBeGreaterThan(822 - 157); // under the tray…
    expect(br.y).toBeLessThanOrEqual(822 - 157 + 64 + 1e-6); // …by at most the overlap
    near(v.w * s, 1132);
  });

  it("compact layouts fill the screen (cover) instead of letterboxing a tiny world", () => {
    const phone = viewport(390, 550);
    const lim = limitsFor(phone, "compact");
    near(lim.min, coverScaleFor(phone));
    near(lim.min, 550 / MAP_H);
    expect(lim.max).toBeGreaterThanOrEqual(2);
    const home = homeView(phone, "compact");
    const vis = visibleRect(home, phone);
    expect(containsRect({ x: -1e-6, y: -1e-6, w: MAP_W + 2e-6, h: MAP_H + 2e-6 }, vis)).toBe(true);
  });

  it("desktop zoom range is [fit, fit × 4]", () => {
    const lim = limitsFor(desk, "desktop");
    near(lim.min, fitScaleFor(desk));
    near(lim.max, fitScaleFor(desk) * 4);
  });
});

describe("zoom, pan, clamp", () => {
  const lim = limitsFor(desk, "desktop");

  it("zooms around the cursor: the map point under it stays put", () => {
    const v0 = fitView(desk);
    const p = { x: 500, y: 300 };
    const before = toMap(v0, desk, p.x, p.y);
    const v1 = zoomAround(v0, desk, lim, 1.15, p.x, p.y);
    near(scaleOf(v1, desk), scaleOf(v0, desk) * 1.15, 1e-9);
    const after = toMap(v1, desk, p.x, p.y);
    near(after.x, before.x, 1e-6);
    near(after.y, before.y, 1e-6);
  });

  it("never zooms out past fit or in past the maximum", () => {
    const v0 = fitView(desk);
    near(scaleOf(zoomAround(v0, desk, lim, 0.2, 100, 100), desk), lim.min, 1e-9);
    near(scaleOf(zoomAround(v0, desk, lim, 100, 100, 100), desk), lim.max, 1e-9);
  });

  it("at fit the camera holds the fitted view; zoomed in it cannot pan past the edges", () => {
    const v0 = fitView(desk);
    const moved = panBy(v0, desk, lim, 300, 200);
    near(moved.x, v0.x); near(moved.y, v0.y);
    const z = zoomAround(v0, desk, lim, 3, 566, 330);
    const far = panBy(z, desk, lim, 100000, 100000);
    const vis = visibleRect(far, desk);
    expect(vis.x).toBeGreaterThanOrEqual(-30 - 1e-6);
    expect(vis.y).toBeGreaterThanOrEqual(-30 - 1e-6);
    const far2 = panBy(z, desk, lim, -100000, -100000);
    const vis2 = visibleRect(far2, desk);
    expect(vis2.x + vis2.w).toBeLessThanOrEqual(MAP_W + 30 + 1e-6);
    expect(vis2.y + vis2.h).toBeLessThanOrEqual(MAP_H + 30 + 1e-6);
  });

  it("clamping keeps the scale within the limits", () => {
    const v = clampView({ x: 0, y: 0, w: 10, h: 10 * (822 / 1132) }, desk, lim);
    near(scaleOf(v, desk), lim.max, 1e-9);
  });
});

describe("framing", () => {
  const lim = limitsFor(desk, "desktop");

  it("frames countries in the uncovered area (above the tray), centred", () => {
    const ids = [21, 22, 23, 24, 25, 26];
    const r = boundsOf(ids, 80);
    const v = frameRect(r, desk, lim);
    const vis = visibleRect(v, desk);
    for (const id of ids) expect(containsRect(vis, COUNTRY_LAYOUT[id]!.rect)).toBe(true);
    near(vis.x + vis.w / 2, r.x + r.w / 2, 1e-6);
    near(vis.y + vis.h / 2, r.y + r.h / 2, 1e-6);
  });

  it("respects maxScale", () => {
    const r = boundsOf([7], 10);
    const v = frameRect(r, desk, lim, 1.2);
    expect(scaleOf(v, desk)).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it("interpolates views geometrically and eases in-out", () => {
    const a = fitView(desk), b = frameRect(boundsOf([7], 80), desk, lim);
    const m0 = lerpView(a, b, 0), m1 = lerpView(a, b, 1);
    near(m0.w, a.w); near(m1.w, b.w); near(m1.x, b.x); near(m0.y, a.y);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    near(easeInOut(0.5), 0.5, 1e-3);
  });
});

describe("touch double-tap (ui-spec §3.3, QA Q-017)", () => {
  it("two quick taps near each other off the targets zoom; slow or far ones do not", () => {
    const first = nextTap(null, { t: 1000, x: 200, y: 300 }, false);
    expect(first).toEqual({ zoom: false, last: { t: 1000, x: 200, y: 300 } });
    expect(nextTap(first.last, { t: 1180, x: 204, y: 302 }, false)).toEqual({ zoom: true, last: null });
    expect(nextTap(first.last, { t: 1450, x: 200, y: 300 }, false).zoom).toBe(false);
    expect(nextTap(first.last, { t: 1100, x: 260, y: 300 }, false).zoom).toBe(false);
  });

  it("a tap on an active target is always a click: it neither zooms nor starts a double-tap", () => {
    // Two taps 180 ms apart on a ringed box: two clicks (two points), the camera stays.
    const a = nextTap(null, { t: 1000, x: 200, y: 300 }, true);
    expect(a).toEqual({ zoom: false, last: null });
    expect(nextTap(a.last, { t: 1180, x: 200, y: 300 }, true)).toEqual({ zoom: false, last: null });
    // The sea, then quickly a target: still a click.
    const sea = nextTap(null, { t: 2000, x: 200, y: 300 }, false);
    expect(nextTap(sea.last, { t: 2150, x: 205, y: 300 }, true).zoom).toBe(false);
    // A target, then quickly the sea: one tap, no zoom yet.
    expect(nextTap(a.last, { t: 1150, x: 200, y: 300 }, false)).toEqual({ zoom: false, last: { t: 1150, x: 200, y: 300 } });
  });
});
