/**
 * <MapView> markup (react-dom/server, no DOM): every country renders a box with the right states,
 * targets are reachable, annotations appear, both languages render.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../src/i18n";
import { MapView } from "../../src/ui/map";
import type { MapViewProps } from "../../src/ui/map/contract";
import { influenceTargets, MIDGAME, sampleScores, sampleState, targetsOf } from "../../src/ui/map/demo/samples";

const base = (over: Partial<MapViewProps> = {}): MapViewProps => ({
  state: sampleState(MIDGAME, "USSR"),
  regionScores: sampleScores(),
  humanSide: "USSR",
  layout: "desktop",
  targets: null,
  regionTargets: null,
  selection: null,
  placed: {},
  lastOpponent: {},
  focusRegion: null,
  interactive: true,
  labelScale: 1,
  patterns: false,
  ...over,
});

const render = (p: MapViewProps) => renderToStaticMarkup(createElement(MapView, p));
/** The opening tag of a country's box group. */
const boxTag = (html: string, id: number) => {
  const m = html.match(new RegExp(`<g[^>]*data-cid="${id}"[^>]*>`));
  if (!m) throw new Error(`no box ${id}`);
  return m[0];
};
const cls = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

beforeAll(() => {
  // useLayoutEffect warns under the server renderer; that is expected here.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await setLanguage("en");
});

describe("MapView markup", () => {
  it("renders one box per country, the plates, links and land", () => {
    const html = render(base());
    const ids = [...html.matchAll(/data-cid="(\d+)"/g)].map(m => Number(m[1]));
    expect(ids.sort((a, b) => a - b)).toEqual(Array.from({ length: 84 }, (_, i) => i));
    expect(html.match(/data-plate="\d"/g)).toHaveLength(7);
    expect(html.match(/data-land="/g)).toHaveLength(12);
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-label="Map"');
    expect(html).toContain(">U.S.S.R.<");
    expect(html).toContain(">USA<");
  });

  it("without a prompt: boxes are images with roving focus, nothing dimmed", () => {
    const html = render(base());
    const tabbable = [...html.matchAll(/<g[^>]*data-cid="\d+"[^>]*tabindex="0"/g)];
    expect(tabbable).toHaveLength(1);
    expect(boxTag(html, 7)).toContain('role="img"');
    expect(html).not.toMatch(/boxDim/);
  });

  it("during a map prompt: targets are buttons in the tab order, the rest dimmed", () => {
    const ids = influenceTargets(MIDGAME, "USSR");
    const html = render(base({ targets: targetsOf(ids, { cost2: new Set([25]) }) }));
    const t = boxTag(html, 25), n = boxTag(html, 2);
    expect(t).toContain('role="button"');
    expect(t).toContain('tabindex="0"');
    expect(cls(t).some(c => /quiet/.test(c))).toBe(true);
    expect(n).toContain('tabindex="-1"');
    expect(cls(n).some(c => /boxDim/.test(c))).toBe(true);
    expect(t).toMatch(/aria-label="Iran, Middle East, battleground, stability 2, US 2 controlled, USSR 0, legal target: costs 2 Ops"/);
    expect(html).toContain(">2 Ops<"); // cost tag
  });

  it("≤ 12 targets ring loudly; danger targets get the hazard ring", () => {
    const html = render(base({ targets: targetsOf([24, 25], { verb: "coup", danger: new Set([24]) }) }));
    expect(cls(boxTag(html, 25)).some(c => /loud/.test(c))).toBe(true);
    expect(cls(boxTag(html, 24)).some(c => /danger/.test(c))).toBe(true);
  });

  it("shows control (flipped counter, tinted box) and battlegrounds", () => {
    const html = render(base());
    expect(cls(boxTag(html, 15)).some(c => /ctrlUSSR/.test(c))).toBe(true); // Poland
    expect(cls(boxTag(html, 1)).some(c => /ctrlUS/.test(c))).toBe(true); // UK
    expect(cls(boxTag(html, 15)).some(c => /boxBG/.test(c))).toBe(true);
    expect(cls(boxTag(html, 2)).some(c => /boxBG/.test(c))).toBe(false);
    expect(html.match(/data-mk="USSR"/g)!.length).toBeGreaterThan(20);
  });

  it("draws annotations: pencil marks, delta pills, the reticle", () => {
    const html = render(base({ placed: { 24: 1 }, lastOpponent: { 53: { us: 1, ussr: -1 } }, selection: 25 }));
    expect(html).toContain('data-pencil="24"');
    expect(html).toContain(">+1<");
    expect(html).toContain(">−1<");
    expect(html).toContain('data-reticle="25"');
  });

  it("offers regions in a region prompt (loud plates, others dimmed)", () => {
    const html = render(base({ regionTargets: new Set([0, 2]) }));
    const plate = (slot: number) => html.match(new RegExp(`<g[^>]*data-plate="${slot}"[^>]*>`))![0];
    expect(cls(plate(0)).some(c => /loud/.test(c))).toBe(true);
    expect(cls(plate(1)).some(c => /boxDim/.test(c))).toBe(true);
  });

  it("renders an empty board without a state", () => {
    const html = render(base({ state: null, regionScores: null }));
    expect(html.match(/data-cid=/g)).toHaveLength(84);
    expect(html).not.toMatch(/data-mk=/);
  });

  it("renders Chinese names and labels", async () => {
    await setLanguage("zh-CN");
    const html = render(base());
    expect(html).toContain("西德");
    expect(html).toContain("老挝柬埔寨");
    expect(html).toContain('aria-label="地图"');
    expect(html).toContain("若计分");
    expect(html).toContain("往日本");
    await setLanguage("en");
    // The `lang` prop overrides the page language.
    expect(render(base({ lang: "zh" }))).toContain("西德");
  });
});
