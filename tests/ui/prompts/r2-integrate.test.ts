/**
 * QA round 2, integration (docs/qa/r2-TRIAGE.md "For the integrator"): the cross-group parts applied after the fix
 * groups. R-002's tooltip line from `CoupOdds.milOps`, R-007's slip crumb (`rollCountry`), R-010's map zoom hit areas,
 * and R-011's follow-up: a Button's key cap still names its key in `aria-keyshortcuts` on touch screens.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { CoupOdds, Prompt } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import { Button, TouchUiContext } from "../../../src/ui/common";
import { kbdShortcut } from "../../../src/ui/common/Button";
import { CountryTooltip, previewNow } from "../../../src/ui/prompts";
import { coupMilOps } from "../../../src/ui/prompts/CountryTooltip";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;
const src = (rel: string) => readFileSync(new URL(`../../../src/${rel}`, import.meta.url), "utf8");

function render(name: string, patch: (fx: Fixture) => void, el: (x: { controller: FixtureController; prompt: Prompt; state: NonNullable<ReturnType<FixtureController["getSnapshot"]>["frame"]>["state"] }) => ReactNode) {
  const fx = JSON.parse(JSON.stringify(fixture(name))) as Fixture;
  patch(fx);
  const controller = new FixtureController(fx);
  const vm = controller.getSnapshot();
  const x = { controller, prompt: vm.prompt as Prompt, state: vm.frame!.state };
  const tree = h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false },
    h(StaticShownProvider, { value: staticShown(x.state, vm.frame!.regionScores) }, el(x)));
  return renderToStaticMarkup(tree).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined });
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("R-002 the tooltip's mil ops come from CoupOdds.milOps", () => {
  const odds = (o: Partial<CoupOdds>): CoupOdds => ({ country: 1, faces: [], ...o });
  it("milOps wins when present: 0 for a free event coup, the Ops for Che's event coup", () => {
    expect(coupMilOps(odds({ ops: 2, milOps: 0 }), { kind: "coup-target" }, 2)).toBe(0);
    expect(coupMilOps(odds({ ops: 3, milOps: 3 }), { kind: "event-target" }, 3)).toBe(3);
  });
  it("without the field, the old rule: the Ops on a coup-target prompt, nothing for event coups", () => {
    expect(coupMilOps(odds({ ops: 4 }), { kind: "coup-target" }, 4)).toBe(4);
    expect(coupMilOps(null, { kind: "coup-target" }, 3)).toBe(3);
    expect(coupMilOps(odds({ ops: 3 }), { kind: "event-target" }, 3)).toBe(0);
    expect(coupMilOps(null, { kind: "coup-target" }, 0)).toBe(0);
  });
  const tip = (milOps: number | undefined) => render("prompt-coup-target", fx => {
    const o = fx.previews.coupOdds![25] as CoupOdds;
    if (milOps === undefined) delete o.milOps; else o.milOps = milOps;
  }, x => {
    previewNow(x.controller, x.prompt, "coup", 25);
    return h(CountryTooltip, { country: 25, prompt: x.prompt, state: x.state, humanSide: "USSR" });
  });
  it("a free coup (milOps 0) prints no line; a credited one prints its own number", () => {
    expect(tip(0)).not.toMatch(/Mil ops/);
    expect(tip(1)).toContain("Mil ops +1");
    expect(tip(undefined)).toMatch(/Mil ops \+\d/);
  });
});

describe("R-007 the AI slip crumb names no country for a space roll", () => {
  it("useAiPlay's roll handler goes through the stage's rollCountry", () => {
    const slip = src("ui/prompts/OrdersSlip.tsx");
    expect(slip).toMatch(/const c = rollCountry\(beat\.roll\);\s*if \(c !== null\)/);
    expect(slip).not.toMatch(/beat\.roll\.country_id/);
  });
});

describe("R-010 map zoom buttons: 44 px hit areas on coarse pointers", () => {
  it("tablet 36 px + 2 × 4 px, compact 40 px + 2 × 2 px, gaps split", () => {
    const css = src("ui/map/MapView.module.css");
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(coarse).toMatch(/\.controls \{ gap: 8px; \}/);
    expect(coarse).toMatch(/\.controls button \{ position: relative; width: 36px; height: 36px; \}/);
    expect(coarse).toMatch(/\.controls button::after \{ content: ""; position: absolute; inset: -4px; \}/);
    expect(coarse).toMatch(/\.compact \.controls button::after \{ inset: -2px; \}/);
  });
});

describe("R-008 the shell passes the prompt id to the map", () => {
  it("GameScreen gives MapView promptKey", () => {
    expect(src("ui/screens/GameScreen.tsx")).toContain("promptKey={vm.prompt?.promptId ?? null}");
  });
});

describe("R-011 follow-up: the shortcut a key cap stands for stays exposed on touch screens", () => {
  it("kbdShortcut: one Latin letter, ↵ → Enter, Esc → Escape; translated caps (Space / 空格) and none → nothing", () => {
    expect(kbdShortcut("D")).toBe("D");
    expect(kbdShortcut("↵")).toBe("Enter");
    expect(kbdShortcut("Esc")).toBe("Escape");
    expect(kbdShortcut("Space")).toBeUndefined();
    expect(kbdShortcut("空格")).toBeUndefined();
    expect(kbdShortcut(undefined)).toBeUndefined();
  });
  const button = (touch: boolean, extra: Record<string, unknown> = {}) => renderToStaticMarkup(h(TouchUiContext.Provider, { value: touch },
    h(Button, { variant: "ghost", kbd: "D", onClick: () => undefined, ...extra }, "Discard nothing")));
  it("a done button (cap D) is aria-keyshortcuts D with and without its cap; an explicit value wins", () => {
    expect(button(false)).toMatch(/<kbd[^>]*>D<\/kbd>/);
    expect(button(false)).toContain('aria-keyshortcuts="D"');
    expect(button(true)).not.toContain("<kbd");
    expect(button(true)).toContain('aria-keyshortcuts="D"');
    expect(button(true, { kbd: "Z", keyshortcuts: "Z Control+Z Meta+Z" })).toContain('aria-keyshortcuts="Z Control+Z Meta+Z"');
  });
});

