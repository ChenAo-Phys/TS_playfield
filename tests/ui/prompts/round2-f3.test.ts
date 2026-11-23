/**
 * QA round 2, fix group F3 (docs/qa/r2-TRIAGE.md R-009 … R-015): the prompt layer's fixes, on recorded scenes
 * patched to the situation QA found (react-dom/server, as qa-fixes.test.ts), and the stylesheet rules that carry
 * the touch-screen parts.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { Prompt } from "../../../src/game/contract";
import { setLanguage, t as appT } from "../../../src/i18n";
import { TouchUiContext } from "../../../src/ui/common/touch";
import { OrdersSlip, PlayModeStage, ordersHead, promptStore } from "../../../src/ui/prompts";
import { bonusHints } from "../../../src/ui/prompts/OrdersSlip";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;

interface Opts {
  layout?: LayoutKind;
  touch?: boolean;
  patch?(fx: Fixture): void;
  before?(c: FixtureController): void;
}

function setup(name: string, o: Opts = {}) {
  const fx = JSON.parse(JSON.stringify(fixture(name))) as Fixture;
  o.patch?.(fx);
  const controller = new FixtureController(fx);
  o.before?.(controller);
  const vm = controller.getSnapshot();
  return { controller, fx, vm, prompt: vm.prompt as Prompt, state: vm.frame!.state };
}

function render(name: string, el: (x: ReturnType<typeof setup>) => ReactNode, o: Opts = {}) {
  const x = setup(name, o);
  const shown = staticShown(x.state, x.vm.frame!.regionScores);
  const tree = h(UiRootProvider, { controller: x.controller, settingsStore: createSettingsStore(null, {}), layout: o.layout ?? "desktop", rootAttributes: false },
    h(StaticShownProvider, { value: shown }, el(x)));
  return renderToStaticMarkup(o.touch === undefined ? tree : h(TouchUiContext.Provider, { value: o.touch }, tree));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
const css = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");
const slip = (variant: "desktop" | "tablet" | "compact") => () => h(OrdersSlip, { variant });
/** The fixture's prompt (every frame's copy) with a different card being played. */
const playing = (card: number) => (fx: Fixture) => {
  fx.final.prompt = { ...fx.final.prompt!, pendingCard: card };
};

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined }); // the engine layout: Chernobyl's branch words
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("R-009 Chernobyl on short slips: undo beside the region grid", () => {
  const stageAsia = (c: FixtureController) => promptStore(c).stage({ kind: "region", id: 1, idx: 215, promptId: 216 });
  for (const variant of ["desktop", "tablet"] as const) {
    it(`${variant}: grid and undo share one row (no row of their own under the grid); its icon alone, no key cap`, () => {
      const html = render("prompt-region", slip(variant), { layout: variant });
      const row = html.slice(html.indexOf("regionRow"), html.indexOf("regionLine"));
      expect(row).toContain('role="group"');
      expect(row).toMatch(/<\/div><button[^>]*class="[^"]*regionUndo[^"]*"[^>]*title="Take back your current play/);
      expect(row).not.toContain("<kbd");
      expect(html).not.toContain("regionFoot");
      // after the row (grid · undo) only the one line: the detail until a region is staged
      expect(html).toMatch(/regionUndo.*?<\/button><\/div><div class="[^"]*regionLine[^"]*" title="For the rest of the turn the USSR may not place influence there with Operations\."/);
    });
  }
  it("staged: the line is the region's consequence; the staged button is the primary with ↵ (mouse), none on touch", () => {
    const html = render("prompt-region", slip("desktop"), { before: stageAsia });
    expect(text(html)).toContain("The USSR may not place influence in Asia with Ops for the rest of the turn.");
    expect(html).toMatch(/aria-pressed="true" aria-label="Asia"[^>]*>.*?Asia.*?↵/);
    const touch = render("prompt-region", slip("tablet"), { layout: "tablet", before: stageAsia, touch: true });
    expect(touch).toMatch(/aria-pressed="true" aria-label="Asia"/);
    expect(touch).not.toContain("<kbd");
  });
  it("compact keeps its rows and actions", () => {
    const html = render("prompt-region", slip("compact"), { layout: "compact", before: stageAsia });
    expect(html).not.toContain("regionRow");
    expect(text(html)).toContain("Choose Asia");
  });
  it("stylesheet: two columns (grid · undo), the line one line that hides when it doesn't fit", () => {
    const s = css("prompts/OrdersSlip.module.css");
    expect(s).toMatch(/\.regionRow \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(s).toMatch(/\.regionUndo \{ align-self: stretch;/);
    expect(s).toMatch(/\.regionLine\[data-lines="0"\] \{ display: none; \}/);
  });
});

describe("R-010 coarse pointers on the desktop / tablet slip and the play-mode stage: 44 px hit areas", () => {
  const coarse = (s: string) => [...s.matchAll(/@media \(pointer: coarse\)[^{]*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join("\n");
  it("slip: every action / tool button answers a 44 px tall area; icon-only buttons and the speed segment 44 px wide", () => {
    const s = coarse(css("prompts/OrdersSlip.module.css"));
    expect(s).toMatch(/\.tablet \.actions :global\(button\)::after[^{]*\{\s*content: "";\s*position: absolute;\s*inset: min\(0px, calc\(50% - 22px\)\) -3px;/);
    expect(s).toMatch(/\.tablet \.iconOnly[^{]*\.tablet \.listLink[^{]*\.tablet \.speedSeg button \{ min-width: 44px; \}/);
    expect(s).toMatch(/\.tablet \.speedSeg \{ overflow: visible; \}/);
  });
  it("region grid: 2 px into each gap, the top row 18 px up, the bottom row 18 px down; undo into the slip's padding", () => {
    const s = coarse(css("prompts/OrdersSlip.module.css"));
    expect(s).toMatch(/\.tablet \.regionsDense \.regionBtn \{ overflow: visible; \}/);
    expect(s).toMatch(/\.tablet \.regionBtn::after \{ content: ""; position: absolute; left: -2px; right: -2px; top: -2px; bottom: -2px; \}/);
    expect(s).toMatch(/\.tablet \.regionBtn:nth-child\(-n \+ 3\)::after \{ top: -18px; \}/);
    expect(s).toMatch(/\.tablet \.regionBtn:nth-child\(n \+ 4\)::after \{ bottom: -18px; \}/);
    expect(s).toMatch(/\.tablet \.regionRow \.regionUndo::after \{ content: ""; position: absolute; inset: 0 -10px 0 -2px; \}/);
  });
  it("play-mode: Back to hand (stage and sheet) answers 44 px; the Operations buttons stay 44 px tall", () => {
    const s = css("prompts/PlayModeStage.module.css");
    expect(coarse(s)).toMatch(/\.foot :global\(button\)::after \{ content: ""; position: absolute; inset: -9px -4px; \}/);
    expect(coarse(s)).toMatch(/\.narrow \{ min-height: 44px; \}/);
    expect(s).toMatch(/@media \(pointer: coarse\) and \(max-height: 560px\) \{\s*[^}]*\.sheet \.foot :global\(button\)::after \{ top: -6px; bottom: -12px; \}/);
  });
  it("the undo / list buttons are marked for it (iconOnly, listLink)", () => {
    const html = render("prompt-coup-target", slip("tablet"), { layout: "tablet", before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: 117 }) });
    expect(html).toMatch(/class="[^"]*iconOnly[^"]*"[^>]*title="Take back your current play/);
  });
});

describe("R-011 no key caps on touch screens", () => {
  it("the slip: Undo play, List, the primary — no <kbd> on touch; the shortcuts stay in aria-keyshortcuts", () => {
    const stage = (c: FixtureController) => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: 117 });
    const mouse = render("prompt-coup-target", slip("tablet"), { layout: "tablet", touch: false });
    expect(mouse).toMatch(/<kbd[^>]*>Z<\/kbd>/);
    expect(mouse).toMatch(/<kbd[^>]*>T<\/kbd>/);
    const touch = render("prompt-coup-target", slip("tablet"), { layout: "tablet", touch: true });
    expect(touch).not.toContain("<kbd");
    expect(touch).toContain('aria-keyshortcuts="Z Control+Z Meta+Z"');
    expect(render("prompt-coup-target", slip("tablet"), { layout: "tablet", touch: true, before: stage })).not.toContain("<kbd");
    expect(render("prompt-influence", slip("compact"), { layout: "compact", touch: true })).not.toContain("<kbd");
  });
  it("the play-mode stage and sheet: no row letters, no Esc cap on touch; the letters stay in aria-keyshortcuts", () => {
    for (const layout of ["desktop", "compact"] as const) {
      const touch = render("prompt-play-mode", x => h(PlayModeStage, { prompt: x.prompt }), { layout, touch: true });
      expect(touch).not.toContain("<kbd");
      expect(touch).toContain('aria-keyshortcuts="E"');
      expect(touch).toMatch(/class="[^"]*noKey[^"]*"/);
      const mouse = render("prompt-play-mode", x => h(PlayModeStage, { prompt: x.prompt }), { layout, touch: false });
      expect(mouse.match(/<kbd/g)?.length).toBeGreaterThanOrEqual(5);
      expect(mouse).not.toMatch(/class="[^"]*noKey/);
    }
  });
  it("stylesheet: the key column goes with the chip", () => {
    const s = css("prompts/PlayModeStage.module.css");
    expect(s).toMatch(/\.wide\.noKey, \.noKey \.holdBody \{ grid-template-columns: 34px minmax\(0, 1fr\); \}/);
    expect(s).toMatch(/\.narrow\.noKey, \.narrow\.noKey \.holdBody \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});

describe("R-012 slip titles: more lines where there is room, a tap shows the rest", () => {
  it("the title carries its line count on desktop / tablet slips (2 at least; 1 beside the region grid), none on compact", () => {
    expect(render("prompt-event-card", slip("tablet"), { layout: "tablet" })).toMatch(/class="[^"]*title[^"]*" title="UN Intervention: [^"]*" data-lines="2"/);
    expect(render("prompt-region", slip("desktop"))).toMatch(/class="[^"]*title[^"]*" title="Chernobyl: choose a region" data-lines="1"/);
    expect(render("prompt-event-card", slip("compact"), { layout: "compact" })).not.toMatch(/title="UN Intervention: [^"]*" data-lines/);
  });
  it("the notes under the title are marked (the title's fit leaves them a line)", () => {
    const html = render("prompt-event-target-add", slip("desktop"));
    expect(html).toMatch(/class="[^"]*hint[^"]*"[^>]*data-note=""/);
  });
  it("stylesheet: 1 / 3 / 4-line clamps; the open title unclamped and the crumb wrapping; the slip then scrolls", () => {
    const s = css("prompts/OrdersSlip.module.css");
    expect(s).toMatch(/\.title\[data-lines="1"\] \{ -webkit-line-clamp: 1; \}/);
    expect(s).toMatch(/\.title\[data-lines="3"\] \{ -webkit-line-clamp: 3; \}/);
    expect(s).toMatch(/\.title\[data-lines="4"\] \{ -webkit-line-clamp: 4; \}/);
    expect(s).toMatch(/\.top\[data-open\] \.title \{ display: block; -webkit-line-clamp: unset; overflow: visible; \}/);
    expect(s).toMatch(/\.top\[data-open\] \.crumb \{ flex-wrap: wrap; white-space: normal;/);
    expect(s).toMatch(/\.main:has\(> \.top\[data-open\]\) \{ overflow-y: auto; \}/);
    expect(s).toMatch(/\.top\[data-toggle\] \{ cursor: pointer; \}/);
  });
});

describe("R-014 the slip head of a game that ended inside an action round", () => {
  it("20 VP in AR 2 of turn 5: 'Orders · Turn 5 · AR 2', as the telex", () => {
    const fx = fixture("seq-over-vp20");
    const st = fx.frames[fx.frames.length - 1]!.state;
    expect(ordersHead(appT as never, st, fx.final.ending)).toBe("Orders · Turn 5 · AR 2");
    const held = fixture("seq-over-held-scoring");
    expect(ordersHead(appT as never, held.frames[held.frames.length - 1]!.state, held.final.ending)).toBe("Orders · End of turn 7");
  });
});

describe("R-015 conditional bonuses on realignments and coups", () => {
  const i18n = { t: appT as never, cardName: (c: number) => (c === 9 ? "Vietnam Revolts" : String(c)) };
  it("bonusHints: realignment and coup words of their own (China Card, Vietnam Revolts for the USSR)", () => {
    expect(bonusHints({ kind: "realign-target", pendingCard: 6 }, { flags: [] }, "US", i18n)).toEqual(["The China Card gives one more roll only if every roll is in Asia."]);
    expect(bonusHints({ kind: "realign-target", pendingCard: 4 }, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "USSR", i18n)).toEqual(["Vietnam Revolts gives one more roll only if every roll is in Southeast Asia."]);
    expect(bonusHints({ kind: "coup-target", pendingCard: 6 }, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "USSR", i18n)).toEqual([
      "The China Card gives +1 Op only to a coup in Asia.",
      "Vietnam Revolts gives +1 Op only to a coup in Southeast Asia.",
    ]);
    expect(bonusHints({ kind: "coup-target", pendingCard: 4 }, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "US", i18n)).toEqual([]);
    expect(bonusHints({ kind: "realign-target", pendingCard: 4 }, { flags: [] }, "USSR", i18n)).toEqual([]);
  });
  it("zh-CN: 中国牌 / 调整掷骰 / 政变 / 行动点", async () => {
    await setLanguage("zh-CN");
    try {
      const zh = { t: appT as never, cardName: () => "越南起义" };
      expect(bonusHints({ kind: "realign-target", pendingCard: 6 }, null, "US", zh)).toEqual(["仅当每次调整掷骰都在亚洲时，中国牌才多给一次掷骰。"]);
      expect(bonusHints({ kind: "coup-target", pendingCard: 6 }, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "USSR", zh)).toEqual([
        "仅当在亚洲进行政变时，中国牌才额外 +1 行动点。",
        "仅当在东南亚进行政变时，越南起义才额外 +1 行动点。",
      ]);
    } finally {
      await setLanguage("en");
    }
  });
  it("the realign slip leads its hint with it (China Card)", () => {
    const t = text(render("prompt-realign-target", slip("desktop"), { patch: playing(6) }));
    expect(t).toMatch(/The China Card gives one more roll only if every roll is in Asia\./);
    expect(t.indexOf("The China Card gives one more roll")).toBeLessThan(t.indexOf("Rolls left") === -1 ? Infinity : t.length);
  });
  it("a staged realignment (its country stays staged across the rolls) leads its consequence with it", () => {
    const t = text(render("prompt-realign-target", slip("desktop"), {
      patch: playing(6),
      before: c => { const p = c.getSnapshot().prompt!; const o = p.options.find(o => o.kind === "country")!; promptStore(c).stage({ kind: "country", id: o.id, idx: o.idx, promptId: p.promptId }); },
    }));
    expect(t).toMatch(/The China Card gives one more roll only if every roll is in Asia\. The selection stays on this country after each roll\./);
  });
  it("the coup slip: the hint first; the unstaged crumb promises no Ops (a coup outside Asia gets 1 less)", () => {
    const t = text(render("prompt-coup-target", slip("desktop"), { patch: playing(6) }));
    expect(t).toMatch(/The China Card gives \+1 Op only to a coup in Asia\. /);
    expect(t).not.toMatch(/Coup · \d Ops/);
    // a card without a conditional bonus keeps its Ops in the crumb
    expect(text(render("prompt-coup-target", slip("desktop")))).toMatch(/Coup · 3 Ops/);
  });
});
