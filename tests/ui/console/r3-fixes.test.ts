/**
 * QA round 3, fix group F4 (console / rail part): the tablet console squeezes in steps so the language switch, ⚙ and
 * ☰ stay on screen at every tablet width (R3-06), and the log filters answer 44 px hit areas on touch screens (R3-07).
 * The browser sweep (every tablet width 700–1199 px and 1200–2000 px at 600 px tall, en / zh / en-XA, touch and
 * mouse) is in docs/handoff/ui-console.md "QA round 3"; here: the markup both forms need, the step order in the
 * stylesheet, and the level arithmetic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../src/i18n";
import en from "../../../src/i18n/locales/en/ui_console.json";
import zh from "../../../src/i18n/locales/zh-CN/ui_console.json";
import { Console, DefconGauge, TurnTrack, VpGauge } from "../../../src/ui/console";
import { nextSqueeze, SQUEEZE_STEPS, TABLET_SQUEEZE_STEPS } from "../../../src/ui/console/squeeze";
import { Dispatches } from "../../../src/ui/rail/Dispatches";
import { fixture } from "../../fixtures/load";
import { harness, unmarkedWords } from "./helpers";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const h = createElement;
const ROOT = join(__dirname, "../../..");
const css = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const consoleCss = css("src/ui/console/Console.module.css");
const railCss = css("src/ui/rail/Rail.module.css");
const midgame = () => fixture("prompt-midgame").final.frame!.state;
/** The declarations of the first rule whose selector list is exactly `sel` (whitespace-normalised). */
const rule = (src: string, sel: string): string | null => {
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (norm(m[1]!) === norm(sel)) return norm(m[2]!);
  return null;
};
const coarse = () => /@media \(pointer: coarse\) \{([\s\S]*?\n)\}/g;

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("tablet console squeeze (R3-06)", () => {
  it("seven steps for the tablet bar, four for the compact one; a level never passes its bar's steps", () => {
    expect(SQUEEZE_STEPS).toBe(4);
    expect(TABLET_SQUEEZE_STEPS).toBe(7);
    expect(nextSqueeze(4, true, TABLET_SQUEEZE_STEPS)).toBe(5);
    expect(nextSqueeze(6, true, TABLET_SQUEEZE_STEPS)).toBe(7);
    expect(nextSqueeze(7, true, TABLET_SQUEEZE_STEPS)).toBe(7);
    expect(nextSqueeze(4, true)).toBe(4);
  });

  it("the tablet bar renders both forms of every squeezed readout (CSS shows one), level 0 before measuring", () => {
    const hs = harness({ state: midgame(), humanSide: "USSR", layout: "tablet" });
    const out = html(hs.wrap(h(Console, { variant: "tablet" })));
    expect(out).toContain('data-squeeze="0"');
    // DEFCON: the lamps and the word.
    expect(out).toMatch(/_lamps_/);
    expect(out).toMatch(/_defconSub_[^"]*_defconWord_[^"]*"[^>]*>DEFCON</);
    // Turn: "6/10 · Mid War" and "6/10".
    expect(out).toMatch(/_turnFull_[^"]*"><b class="ts-num">6<\/b>\/10 · Mid War</);
    expect(out).toMatch(/_turnShort_[^"]*"><b class="ts-num">6<\/b>\/10</);
    // AR and VP: the side word and its glyph.
    expect(out).toMatch(/_arWord_[^"]*">USSR<\/span><svg class="[^"]*_arGlyph_/);
    expect(out).toMatch(/_vpWord_[^"]*">USSR<\/span><svg class="[^"]*_vpGlyph_/);
    // VP: both labels, and a width the squeeze can override.
    expect(out).toMatch(/_vpTitle_[^"]*">Victory points<\/span><span class="[^"]*_vpShort_[^"]*">VP</);
    expect(out).toContain("width:var(--vp-w, 170px)");
    // The bar's text is the same at every level (both forms always there), so the measurement key holds.
    expect(out).not.toMatch(/data-fit/);
  });

  it("the condensed (1200–1439 px) and desktop bars take the same steps (a safety net there), caption included", () => {
    const hs = harness({ state: midgame(), humanSide: "USSR" });
    const condensed = html(hs.wrap(h(Console, { variant: "condensed" })));
    expect(condensed).toContain('data-squeeze="0"');
    expect(condensed).toMatch(/_defconWord_/);
    expect(condensed).toMatch(/_turnShort_/);
    expect(condensed).toContain("No coups/realigns: Europe"); // its caption stays until step 1
    expect(condensed).toContain("width:var(--vp-w, 176px)");
    const desktop = html(hs.wrap(h(Console, { variant: "desktop" })));
    expect(desktop).toContain('data-squeeze="0"');
    expect(desktop).toMatch(/_defconWord_/);
    expect(desktop).not.toMatch(/_turnShort_/); // the desktop keeps its turn track
    expect(desktop).toContain("width:var(--vp-w, 224px)");
    // Only the compact bar measures its lines one by one (data-fit) and squeezes in its own four steps.
    expect(desktop).not.toMatch(/data-fit/);
  });

  it("the instruments alone: the extensions are opt-in", () => {
    expect(html(h(TurnTrack, { turn: 5, condensed: true }))).not.toMatch(/_turnShort_/);
    expect(html(h(DefconGauge, { defcon: 3, variant: "full", caption: false }))).not.toContain(">DEFCON<");
    expect(html(h(DefconGauge, { defcon: 3, variant: "full", caption: false, word: true }))).toContain(">DEFCON<");
    expect(html(h(VpGauge, { vp: 3, width: 224, variant: "full" }))).not.toMatch(/_vpShort_/);
    expect(html(h(VpGauge, { vp: 3, width: 224, variant: "full" }))).toContain("width:var(--vp-w, 224px)");
  });

  it("Chinese and the pseudo-language: the short turn readout comes from the catalog", async () => {
    expect(en.turn.short).toBe("{{turn}}/{{max}}");
    expect(zh.turn.short).toBe("{{turn}}/{{max}}");
    await setLanguage("en-XA");
    try {
      const hs = harness({ state: midgame(), layout: "tablet" });
      expect(unmarkedWords(html(hs.wrap(h(Console, { variant: "tablet" }))))).toEqual([]);
    } finally {
      await setLanguage("en");
    }
  });

  it("the stylesheet takes the steps in order, each scoped to its bar", () => {
    const bar = ".console:not(.v_compact)";
    const steps: [string, string][] = [
      [`${bar}.sq1 .lamps, ${bar}.sq1 .defconCaption`, "display: none;"],
      [`${bar}.sq1 .defconWord`, "display: block;"],
      [`${bar}.sq2 .wordmark b`, "width: min-content; white-space: normal;"],
      [`${bar}.sq2 .wordmark span`, "display: none;"],
      [`${bar}.sq3 .arTrack`, "display: none;"],
      [`${bar}.sq4`, "--vp-w: auto;"],
      [`${bar}.sq4 .vpTitle, ${bar}.sq4 .vpEnds`, "display: none;"],
      [`${bar}.sq4 .vpShort`, "display: inline;"],
      [`${bar}.sq4 .vpScale`, "min-width: 96px;"],
      [`${bar}.sq5 .arWord, ${bar}.sq5 .vpWord`, "display: none;"],
      [`${bar}.sq6 .turnFull`, "display: none;"],
      [`${bar}.sq6 .turnShort`, "display: block;"],
      [`${bar}.sq7 .wordmark`, "display: none;"],
    ];
    for (const [sel, decl] of steps) expect(rule(consoleCss, sel), sel).toBe(decl);
    expect(rule(consoleCss, ".defconWord, .turnShort, .vpShort")).toBe("display: none;");
    // The compact steps no longer leak into the tablet bar (the AR glyph form exists on both).
    expect(rule(consoleCss, ".v_compact.sq3 .arWord")).toBe("display: none;");
    expect(rule(consoleCss, ".sq3 .arWord")).toBeNull();
    expect(consoleCss).not.toMatch(/\.v_tablet\.sq\d/); // one rule set for every non-compact bar
  });
});

describe("log filters on touch screens (R3-07)", () => {
  it("All / Plays / Dice: 44 × 44 px on coarse pointers, in a header row as tall (no reach over the tape or the edge)", () => {
    const block = [...railCss.matchAll(coarse())].map(m => m[1]).join("\n");
    expect(rule(block, ".log .panelH")).toBe("min-height: 44px; padding-top: 0; padding-bottom: 0;");
    expect(rule(block, ".filters button")).toBe("position: relative; min-width: 44px;");
    // The area: the button's width, 44 px tall, centred on the button, which the 44 px row centres.
    expect(rule(block, ".filters button::after")).toBe('content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%);');
    expect(rule(railCss, ".panelH")).toMatch(/align-items: center;/);
  });

  it("the filters are still the three toggle buttons", () => {
    const out = html(h(Dispatches, { log: [], humanSide: "USSR", current: null }));
    expect(out.match(/<button type="button" aria-pressed="(true|false)">/g)?.length).toBe(3);
  });
});
