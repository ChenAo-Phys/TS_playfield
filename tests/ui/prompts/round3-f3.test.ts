/**
 * QA round 3, fix group F3: R3-03 (the tablet slip's touch areas no longer clipped by its edge: the title block fits,
 * the dense region grid's rows get 44 px) and R3-05 (region names kept whole by tightening only the buttons whose
 * name is cut), on recorded scenes (react-dom/server, as round2-f3.test.ts), the pure fit rules and the stylesheet.
 * The compact play-mode sheet's close is Back to hand (D-201, R3-04).
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import { setLanguage } from "../../../src/i18n";
import { TouchUiContext } from "../../../src/ui/common/touch";
import { OrdersSlip, promptStore } from "../../../src/ui/prompts";
import { settleFit, titleFit, type TitleFit, type TitleFitMeasure } from "../../../src/ui/prompts/OrdersSlip";
import { nextNameFit } from "../../../src/ui/prompts/RegionChoice";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;

function render(name: string, layout: LayoutKind, o: { touch?: boolean; before?(c: FixtureController): void } = {}): string {
  const fx = JSON.parse(JSON.stringify(fixture(name))) as Fixture;
  const controller = new FixtureController(fx);
  o.before?.(controller);
  const vm = controller.getSnapshot();
  const shown = staticShown(vm.frame!.state, vm.frame!.regionScores);
  const variant = layout === "compact" || layout === "compact-landscape" ? "compact" : layout;
  const tree: ReactNode = h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout, rootAttributes: false },
    h(StaticShownProvider, { value: shown }, h(OrdersSlip, { variant })));
  return renderToStaticMarkup(o.touch === undefined ? tree : h(TouchUiContext.Provider, { value: o.touch }, tree));
}
const css = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");
const src = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined });
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

// The steps the slip uses (OrdersSlip PROMPT_FIT / AI_FIT).
const PROMPT: TitleFit[] = [{ lines: 2, crumb: true }, { lines: 2, crumb: false }, { lines: 1, crumb: false }];
const AI: TitleFit[] = [{ lines: 2, crumb: true }, { lines: 1, crumb: true }, { lines: 1, crumb: false }];
// A tablet event prompt: a two-line title (20 px lines), the crumb's 19 px line, the 32 px actions row.
const event = (room: number, extra: Partial<TitleFitMeasure> = {}): TitleFitMeasure =>
  ({ natural: 2, lineHeight: 20, crumb: 19, counter: 0, rest: 32, note: 0, room, ...extra });

describe("R3-03 the title block of a fixed slip fits it (titleFit)", () => {
  it("tablet slips (79 / 85 px columns at 1100 × 700 / 1024 × 768): the crumb yields its line, the title keeps two", () => {
    expect(titleFit(event(79), PROMPT, 4)).toEqual({ lines: 2, crumb: false });
    expect(titleFit(event(85), PROMPT, 4)).toEqual({ lines: 2, crumb: false });
  });
  it("desktop slips (97 px and up) keep the crumb; the note's line never decides it, only extra title lines", () => {
    expect(titleFit(event(97, { note: 22 }), PROMPT, 4)).toEqual({ lines: 2, crumb: true });
    expect(titleFit(event(140, { natural: 4, note: 22 }), PROMPT, 4)).toEqual({ lines: 3, crumb: true });
    expect(titleFit(event(160, { natural: 4, note: 22 }), PROMPT, 4)).toEqual({ lines: 4, crumb: true });
  });
  it("a short title never needs the room it doesn't take, nor gets lines it doesn't have", () => {
    expect(titleFit(event(79, { natural: 1 }), PROMPT, 4)).toEqual({ lines: 2, crumb: true });
    expect(titleFit(event(200, { natural: 3 }), PROMPT, 4)).toEqual({ lines: 3, crumb: true });
  });
  it("the big counter stands beside the title: setup / bid (no crumb) fit the 79 px column", () => {
    expect(titleFit({ natural: 2, lineHeight: 20, crumb: 0, counter: 44, rest: 32, note: 0, room: 79 }, PROMPT, 4).crumb).toBe(true);
    // with a crumb, the counter spans both rows: max(title + crumb, counter)
    expect(titleFit({ natural: 1, lineHeight: 20, crumb: 19, counter: 44, rest: 32, note: 0, room: 79 }, PROMPT, 4)).toEqual({ lines: 2, crumb: true });
  });
  it("then one title line; the last step when nothing fits", () => {
    expect(titleFit(event(55), PROMPT, 4)).toEqual({ lines: 1, crumb: false });
    expect(titleFit(event(30), PROMPT, 4)).toEqual({ lines: 1, crumb: false });
  });
  it("the AI's play gives up its title's second line before the crumb (card › mode → target)", () => {
    expect(titleFit(event(79), AI, 2)).toEqual({ lines: 1, crumb: true });
    expect(titleFit(event(97), AI, 2)).toEqual({ lines: 2, crumb: true });
    expect(titleFit(event(45), AI, 2)).toEqual({ lines: 1, crumb: false });
  });
  it("markup: the first step on the server (the fit runs in the browser); the crumb carries no yield yet", () => {
    const html = render("prompt-event-card", "tablet");
    expect(html).toMatch(/data-crumb=""/);
    expect(html).not.toMatch(/data-yield/);
    expect(html).toMatch(/class="[^"]*title[^"]*" title="UN Intervention: [^"]*" data-lines="2"/);
    // compact slips are content-sized: no fit, no line count
    expect(render("prompt-event-card", "compact")).not.toMatch(/title="UN Intervention: [^"]*" data-lines/);
  });
  it("the dense region prompt marks its title block (the tablet's touch rules below)", () => {
    expect(render("prompt-region", "tablet")).toMatch(/class="[^"]*top[^"]*"[^>]*data-dense="true"/);
    expect(render("prompt-event-card", "tablet")).not.toContain("data-dense");
  });
  it("stylesheet: a yielded crumb is visually hidden (still read out); without a crumb line the counter takes row 1 only", () => {
    const s = css("prompts/OrdersSlip.module.css");
    expect(s).toMatch(/\.crumb\[data-yield\] \{\s*position: absolute;\s*width: 1px;\s*height: 1px;\s*overflow: hidden;\s*clip-path: inset\(50%\);\s*\}/);
    expect(s).toMatch(/\.desktop \.top:not\(:has\(> \.crumb:not\(\[data-yield\]\)\)\) > \.bigCount,\s*\.tablet \.top:not\(:has\(> \.crumb:not\(\[data-yield\]\)\)\) > \.bigCount \{ grid-row: 1; \}/);
    // compact (and its side column, which puts the counter in row 2) keep their grid
    expect(s).not.toMatch(/\.compact \.top:not\(:has/);
  });
});

describe("QA round 3 V-1-1 / V-2-1: the title block settles (no fit that reverses itself)", () => {
  // useTitleFit measures the crumb's line as its line height + top margin, in whichever state the last fit left it.
  const s = css("prompts/OrdersSlip.module.css");
  const block = (sel: string) => s.match(new RegExp(`\\n${sel.replace(/[.[\]]/g, m => `\\${m}`)} \\{([^}]*)\\}`))?.[1] ?? "";
  const marginTop = (rule: string) => { const m = rule.match(/margin(?:-top)?:\s*(-?[\d.]+)px/); return m ? Number(m[1]) : undefined; };
  const shownMargin = marginTop(block(".crumb"));
  const yieldedMargin = marginTop(block(".crumb[data-yield]")) ?? shownMargin;
  // The English tablet event prompt the reviews crashed on: 19.95 px title lines, a 15.625 px crumb line, 32 px actions.
  const at = (room: number, crumbShown: boolean): TitleFitMeasure =>
    ({ natural: 2, lineHeight: 19.95, crumb: 15.625 + ((crumbShown ? shownMargin : yieldedMargin) ?? 0), counter: 0, rest: 32, note: 0, room });

  it("the stylesheet gives a yielded crumb the same top margin as a shown one", () => {
    expect(shownMargin).toBe(3);
    expect(yieldedMargin).toBe(shownMargin);
  });
  it("every column from 60 to 130 px: the fit, measured in the state it produces, picks itself again (both start states)", () => {
    for (let room = 60; room <= 130; room += 0.5) {
      for (const start of [true, false]) {
        const first = titleFit(at(room, start), PROMPT, 4);
        expect(titleFit(at(room, first.crumb), PROMPT, 4), `room ${room}`).toEqual(first);
        const ai = titleFit(at(room, start), AI, 2);
        expect(titleFit(at(room, ai.crumb), AI, 2), `AI room ${room}`).toEqual(ai);
      }
    }
  });
  it("the old yield margin (-1 px) did reverse itself at 86–89 px columns (the crash this guards)", () => {
    const old = (room: number, crumbShown: boolean): TitleFitMeasure => ({ ...at(room, crumbShown), crumb: 15.625 + (crumbShown ? 3 : -1) });
    expect(titleFit(old(87, true), PROMPT, 4).crumb).toBe(false);
    expect(titleFit(old(87, false), PROMPT, 4).crumb).toBe(true);
  });
  it("settleFit: the measured fit up to 4 changes a frame, then the more compact of the two, so a flip-flop stops", () => {
    const shown = { lines: 2, crumb: true }, yielded = { lines: 2, crumb: false }, one = { lines: 1, crumb: false };
    expect(settleFit(shown, yielded, 1)).toBe(yielded);
    expect(settleFit(yielded, shown, 4)).toBe(shown);
    expect(settleFit(yielded, shown, 5)).toBe(yielded);
    expect(settleFit(shown, yielded, 5)).toBe(yielded);
    expect(settleFit(yielded, one, 9)).toBe(one);
    expect(settleFit({ lines: 1, crumb: true }, { lines: 2, crumb: true }, 9)).toEqual({ lines: 1, crumb: true });
    // the hook's loop with the old asymmetric measurement: it ends (React's limit is 50 nested updates)
    const old = (crumbShown: boolean): TitleFitMeasure => ({ ...at(87, crumbShown), crumb: 15.625 + (crumbShown ? 3 : -1) });
    let fit: TitleFit = PROMPT[0], changes = 0, renders = 0;
    for (; renders < 50; renders++) {
      const next = titleFit(old(fit.crumb), PROMPT, 4);
      if (next.lines === fit.lines && next.crumb === fit.crumb) break;
      const settled = settleFit(fit, next, ++changes);
      if (settled === fit) break;
      fit = settled;
    }
    expect(renders).toBeLessThan(8);
    expect(fit).toEqual(yielded);
  });
});

describe("R3-03 a staged warning on tablet slips: panel, one-line title and actions fit the 120 px slip", () => {
  it("the panel's padding and margin and the actions' top padding tighten on tablet slips only (one whole line kept)", () => {
    const s = css("prompts/OrdersSlip.module.css");
    expect(s).toMatch(/\.tablet \.warn \{ margin-top: 3px; padding-block: 3px; min-height: calc\(1\.25em \+ 6px\); max-height: calc\(3\.75em \+ 6px\); \}/);
    expect(s).toMatch(/\.tablet \.warn ~ \.actions \{ padding-top: 4px; \}/);
    // 79 px column at 1100 × 700: title 20 + (3 + 21) + (4 + 30) = 78; the 30 px primary's area 7 px up and down
    expect(20 + 3 + 21 + 4 + 30).toBeLessThanOrEqual(79);
    expect(titleFit({ natural: 2, lineHeight: 20, crumb: 0, counter: 0, rest: 3 + 21 + 4 + 30, note: 0, room: 79 }, PROMPT, 4)).toEqual({ lines: 1, crumb: false });
  });
});

describe("R3-03 the dense region grid on tablet slips: two 44 px rows in the 120 px slip", () => {
  const coarse = (s: string) => [...s.matchAll(/@media \(pointer: coarse\)[^{]*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join("\n");
  it("the grid sits right under a 20 px title line; the top row covers that line, the bottom row the gap and runs to the edge", () => {
    const s = coarse(css("prompts/OrdersSlip.module.css"));
    expect(s).toMatch(/\.tablet \.top\[data-dense\] \.title \{ line-height: 20px; \}/);
    expect(s).toMatch(/\.tablet \.regionRow \{ margin-top: 0; \}/);
    expect(s).toMatch(/\.tablet \.regionBtn:nth-child\(-n \+ 3\)::after \{ top: -22px; bottom: 0; \}/);
    expect(s).toMatch(/\.tablet \.regionBtn:nth-child\(n \+ 4\)::after \{ top: -4px; bottom: -22px; \}/);
    // 120 px slip: body from 32; title 32–52; rows 52–76 / 80–104 → areas 30–76 (46) and 76–120 (44)
    const slip = 120, bodyTop = 32, title = 20, row = 24, gap = 4;
    const r1 = { top: bodyTop + title, bottom: bodyTop + title + row };
    const r2 = { top: r1.bottom + gap, bottom: r1.bottom + gap + row };
    expect(r1.bottom - (r1.top - 22)).toBeGreaterThanOrEqual(44);
    expect(Math.min(slip, r2.bottom + 22) - (r2.top - 4)).toBeGreaterThanOrEqual(44);
    expect(r2.top - 4).toBeGreaterThanOrEqual(r1.bottom); // no overlap
  });
  it("a cut title stays a toggle: the top row keeps clear of it", () => {
    expect(coarse(css("prompts/OrdersSlip.module.css"))).toMatch(/\.tablet \.top\[data-toggle\] ~ \.regionRow \.regionBtn:nth-child\(-n \+ 3\)::after \{ top: -2px; \}/);
  });
});

describe("R3-05 region names stay whole (nextNameFit)", () => {
  it("one step at a time for each cut name, up to 2; nothing for names that fit", () => {
    expect(nextNameFit({}, [])).toBeNull();
    expect(nextNameFit({}, [1])).toEqual({ 1: 1 });
    expect(nextNameFit({ 1: 1 }, [1, 4])).toEqual({ 1: 2, 4: 1 });
    expect(nextNameFit({ 1: 2 }, [1])).toBeNull(); // the ellipsis stays, the full name is the label and title
  });
  it("markup: every dense button names its slot; no fit level on the server; the staged primary keeps ↵ until measured", () => {
    const stageAsia = (c: FixtureController) => promptStore(c).stage({ kind: "region", id: 1, idx: 215, promptId: 216 });
    const html = render("prompt-region", "desktop", { before: stageAsia, touch: false });
    expect(html.match(/data-slot="\d"/g)?.length).toBe(6);
    expect(html).not.toContain("data-fit");
    expect(html).toMatch(/aria-pressed="true" aria-label="Asia"[^>]*>.*?↵/);
  });
  it("stylesheet: level 2 drops the caps tracking (level 1, the ↵ cap, is markup)", () => {
    expect(css("prompts/OrdersSlip.module.css")).toMatch(/\.regionsDense \.regionBtn\[data-fit="2"\] \{ letter-spacing: 0; \}/);
    expect(src("prompts/RegionChoice.tsx")).toMatch(/dense && staged === slot && !touch && !fit\[slot\] \? <kbd/);
  });
});

describe("R3-04 (D-201) the compact play-mode sheet's close is Back to hand", () => {
  it("the grab, the scrim, a swipe and Esc undo the play and ask the hand drawer to focus the card", () => {
    expect(src("prompts/PlayModeStage.tsx")).toMatch(/<Sheet open [^>]*onClose=\{\(\) => \{ if \(root\.vm\.canUndo\) backToHand\(store, actions, prompt\); \}\}>/);
  });
});
