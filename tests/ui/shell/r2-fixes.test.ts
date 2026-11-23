/**
 * QA round 2, fix group F4 (docs/qa/r2-TRIAGE.md): the tablet flyouts end above the tray and close on a press
 * outside them, with 44 px touch areas on the strip, the flyout's × and the console's buttons (R-017, R-010's F4
 * part); the toast for a discarded save says why (R-018); the zh dock names the log 电报 and English spells
 * "license" (R-019); the ☰ menu shows no key caps on touch screens (R-011's F4 part).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameController, ViewModel } from "../../../src/game/contract";
import { setLanguage, t } from "../../../src/i18n";
import en from "../../../src/i18n/locales/en/ui_shell.json";
import zh from "../../../src/i18n/locales/zh-CN/ui_shell.json";
import { TouchUiContext } from "../../../src/ui/common/touch";
import { closesFlyout } from "../../../src/ui/screens/GameScreen";
import { Menu } from "../../../src/ui/screens/Menu";
import { discardedSaveKey } from "../../../src/ui/screens/StartScreen";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";

const h = createElement;
const ROOT = join(__dirname, "../../..");
const css = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const noop = () => undefined;

/** A tree of fake DOM nodes: `contains` as the DOM has it (a node contains itself and its descendants). */
class FakeNode {
  readonly nodeType = 1;
  readonly kids: FakeNode[] = [];
  constructor(readonly name: string, readonly parent: FakeNode | null = null) { parent?.kids.push(this); }
  contains(other: FakeNode | null): boolean {
    for (let n: FakeNode | null = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
}
const asNode = (n: FakeNode | null) => n as unknown as Node;

function stubController(vm: Partial<ViewModel>): GameController {
  const full: ViewModel = {
    status: "menu", humanSide: null, frame: null, queued: 0, prompt: null, aiThinking: false, canUndo: false, log: [], ending: null,
    hasSavedGame: false, ...vm,
  };
  return {
    subscribe: () => () => undefined, getSnapshot: () => full, boot: async () => undefined, newGame: async () => undefined,
    resume: async () => false, choose: () => undefined, undo: () => undefined, resign: () => undefined, ackFrame: () => undefined,
    coupOdds: () => null, effectiveOps: () => null,
  };
}

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("tablet flyouts (R-017)", () => {
  // body > [screen > (console, main > (map, flyout host > flyout > ×, toasts > toast), tray > card, strip > button)], menu
  const body = new FakeNode("body");
  const screen = new FakeNode("screen", body);
  const consoleEl = new FakeNode("console", screen);
  const main = new FakeNode("main", screen);
  const mapEl = new FakeNode("map", main);
  const host = new FakeNode("flyout host", main);
  const close = new FakeNode("×", new FakeNode("flyout", host));
  const toasts = new FakeNode("toasts", main);
  const toast = new FakeNode("toast", toasts);
  const card = new FakeNode("card", new FakeNode("tray", screen));
  const strip = new FakeNode("strip", screen);
  const stripBtn = new FakeNode("strip button", strip);
  const menu = new FakeNode("menu", body);
  const keep = [host, strip, toasts].map(asNode);
  const closes = (n: FakeNode | null) => closesFlyout(n as unknown as EventTarget, asNode(screen), keep);

  it("a press on the map, the console or the tray closes the open flyout", () => {
    expect(closes(mapEl)).toBe(true);
    expect(closes(main)).toBe(true);
    expect(closes(consoleEl)).toBe(true);
    expect(closes(card)).toBe(true);
  });
  it("a press inside the flyout, on the strip (its buttons toggle it) or on a toast keeps it", () => {
    for (const n of [host, close, strip, stripBtn, toasts, toast]) expect(closes(n), n.name).toBe(false);
  });
  it("layers above the screen (menu, dialogs, card zoom) and non-nodes keep it", () => {
    expect(closes(menu)).toBe(false);
    expect(closes(body)).toBe(false);
    expect(closes(null)).toBe(false);
    expect(closesFlyout({} as EventTarget, asNode(screen), keep)).toBe(false);
    expect(closesFlyout(asNode(mapEl), null, keep)).toBe(false);
    expect(closesFlyout(asNode(mapEl), asNode(screen), [null, undefined])).toBe(true);
  });

  it("the flyout host ends at the tray row's top, every panel inside it; toasts sit in a box-less wrapper", () => {
    const game = css("src/ui/screens/GameScreen.module.css");
    expect(game).toMatch(/\.flyoutHost \{[^}]*bottom: var\(--ts-tray-h\);/);
    expect(game).toMatch(/\.tablet \{[^}]*--ts-tray-h: clamp\(132px, 18vh, 150px\);[^}]*grid-template-rows: [^;]* var\(--ts-tray-h\);/);
    expect(game).toMatch(/\.toastHost \{ display: contents; \}/);
    const rail = css("src/ui/rail/Rail.module.css");
    // The log panel fills the host (8 px inside it); the others are as tall as their content, capped by the host.
    expect(rail).toMatch(/\.flyout \{[^}]*top: 8px;[^}]*max-height: calc\(100% - 16px\);/);
    expect(rail).toMatch(/\.flyout\[data-panel="log"\] \{ bottom: 8px; \}/);
  });

  it("touch screens: the strip buttons and the × answer 44 × 44 px, inside the flyout and clear of its header", () => {
    const rail = css("src/ui/rail/Rail.module.css");
    const coarse = rail.slice(rail.indexOf("@media (pointer: coarse)"));
    const px = (re: RegExp, src: string) => Number(src.match(re)![1]);
    // The strip: 42 px buttons, an area 1 px wider all round, 8 px apart (the areas never meet).
    expect(px(/\.stripBtn \{[^}]*width: (\d+)px;/, rail)).toBe(42);
    expect(px(/\.stripBtn::after \{[^}]*inset: -(\d+)px;/, coarse)).toBe(1);
    expect(px(/\.strip \{[^}]*gap: (\d+)px;/, rail)).toBeGreaterThanOrEqual(2);
    // The ×: 28 px at top 5 / right 6; its area reaches the flyout's top and right edges and is 44 × 44.
    const box = px(/\.flyoutClose \{[^}]*width: (\d+)px;/, rail);
    const top = px(/\.flyoutClose \{[^}]*top: (\d+)px;/, rail);
    const right = px(/\.flyoutClose \{[^}]*right: (\d+)px;/, rail);
    const a = coarse.match(/\.flyoutClose::after \{[^}]*top: -(\d+)px; right: -(\d+)px; bottom: -(\d+)px; left: -(\d+)px;/)!.slice(1).map(Number);
    expect([a[0], a[1]]).toEqual([top, right]);
    expect(box + a[0]! + a[2]!).toBe(44);
    expect(box + a[1]! + a[3]!).toBe(44);
    // The panel header's controls end left of the area.
    expect(px(/\.flyoutBody \.panelH \{ padding-right: (\d+)px; \}/, coarse)).toBeGreaterThan(44);
  });

  it("touch screens: the console's language / settings / menu buttons answer 44 px, the areas never overlap (R-010)", () => {
    const con = css("src/ui/console/Console.module.css");
    const coarse = con.slice(con.indexOf("@media (pointer: coarse)"));
    const btn = Number(con.match(/\.iconBtn \{[^}]*width: (\d+)px;/)![1]);
    const touchBtn = Number(con.match(/\.iconBtnTouch \{ width: (\d+)px;/)![1]);
    const inset = Number(coarse.match(/\.iconBtn::after \{[^}]*inset: -(\d+)px;/)![1]);
    const touchInset = Number(coarse.match(/\.iconBtnTouch::after \{ inset: -(\d+)px; \}/)![1]);
    const gap = Number(coarse.match(/\.actions \{ gap: (\d+)px; \}/)![1]);
    expect(btn + 2 * inset).toBe(44);
    expect(touchBtn + 2 * touchInset).toBe(44);
    expect(gap).toBeGreaterThanOrEqual(2 * inset);
    expect(coarse).toMatch(/\.langToggle button \{[^}]*min-width: 44px;/);
    expect(coarse).toMatch(/\.langToggle button::after \{[^}]*height: 44px;/);
  });
});

describe("a discarded save says why (R-018)", () => {
  it("unreadable (changed or damaged) vs another build; without `reason`, savedAt 0 means unreadable", () => {
    expect(discardedSaveKey({ savedAt: 0, reason: "unreadable" })).toBe("ui_shell:error.saveUnreadable");
    expect(discardedSaveKey({ savedAt: 0 })).toBe("ui_shell:error.saveUnreadable");
    expect(discardedSaveKey({ savedAt: 1_700_000_000_000, reason: "unreadable" })).toBe("ui_shell:error.saveUnreadable");
    expect(discardedSaveKey({ savedAt: 1_700_000_000_000, reason: "build" })).toBe("ui:error.saveIncompatible");
    expect(discardedSaveKey({ savedAt: 1_700_000_000_000 })).toBe("ui:error.saveIncompatible");
    expect(discardedSaveKey({ savedAt: 0, reason: "build" })).toBe("ui:error.saveIncompatible");
  });

  it("the two toasts in English and Chinese", async () => {
    expect(t("ui_shell:error.saveUnreadable")).toBe("Your saved game could not be read (it was changed or damaged) and was discarded.");
    expect(t("ui:error.saveIncompatible")).toBe("Your saved game was made with another version of the engine or AI and cannot be resumed.");
    await setLanguage("zh-CN");
    try {
      expect(t("ui_shell:error.saveUnreadable")).toBe("无法读取已保存的对局（已被修改或损坏），已将其删除。");
      expect(t("ui:error.saveIncompatible")).toBe("已保存的对局来自其他版本的引擎或 AI，无法继续。");
    } finally {
      await setLanguage("en");
    }
  });

  it("the start screen picks the toast by the reason; a resume refused after boot reads as unreadable", () => {
    const start = readFileSync(join(ROOT, "src/ui/screens/StartScreen.tsx"), "utf8");
    expect(start).toMatch(/discardedSaveKey\(discarded\)/);
    expect(start).toMatch(/root\.toast\(t\(discardedKey\), \{ tone: "warn" \}\)/);
    const app = readFileSync(join(ROOT, "src/ui/App.tsx"), "utf8");
    expect(app).toMatch(/if \(!ok\) root\.toast\(t\("ui_shell:error\.saveUnreadable"\), \{ tone: "warn" \}\)/);
    expect(app).not.toContain("ui:error.saveIncompatible");
  });
});

describe("wording (R-019)", () => {
  it("the zh dock, its label and the ticker call the log 电报 (glossary: ui:log.title)", () => {
    expect(zh.dock.log).toBe("电报");
    expect(zh.dock.label).toBe("手牌、对手、电报与状态");
    expect(zh.dock.logAria_other).toBe("电报：{{count}} 条新电报");
    expect(zh.ticker.open).toBe("打开电报");
    expect(JSON.stringify(zh)).not.toContain("记录");
  });
  it("English spells license (as ui:start.credits and ui:about.licenses do)", () => {
    expect(en.about.oflLink).toBe("Font license (OFL)");
    expect(JSON.stringify(en)).not.toMatch(/licence/i);
  });
});

describe("the ☰ menu on touch screens (R-011)", () => {
  const render = (touch: boolean) => renderToStaticMarkup(
    h(UiRootProvider, { controller: stubController({ status: "playing", humanSide: "USSR" }), settingsStore: createSettingsStore(null, {}), layout: "tablet", rootAttributes: false },
      h(TouchUiContext.Provider, { value: touch }, h(Menu, { anchor: null, onClose: noop, onOpen: noop, onNewGameNow: noop }))),
  );
  it("shows no key caps on touch; keeps them for a mouse and keyboard", () => {
    expect(render(true)).not.toContain("<kbd");
    expect(render(false)).toContain('<kbd aria-hidden="true">?</kbd>');
  });
});
