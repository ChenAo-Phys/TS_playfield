/**
 * QA round 1, fix group F4 (docs/qa/TRIAGE.md): the shell's focus handling (Q-043, Q-044), the theatre
 * chip that follows a tap (Q-047), the menu's keys (Q-046), the start screen's inert backdrop, failed state
 * and Retry (Q-051, Q-052, K-001), the language switch that fails offline (Q-056), plural names (Q-053),
 * the announcer in every arrangement (Q-045), touch targets and safe areas in the stylesheets (Q-042,
 * Q-048) and the page head (Q-057).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameController, ViewModel } from "../../../src/game/contract";
import { FixtureController } from "../../../src/dev/FixtureController";
import { setLanguage, t } from "../../../src/i18n";
import { retryBoot } from "../../../src/ui/App";
import { framedSlot, THEATRE_ORDER, TheatreBar } from "../../../src/ui/compact/TheatreBar";
import { BottomDock } from "../../../src/ui/compact/BottomDock";
import { switchLanguage } from "../../../src/ui/console/LangToggle";
import { areaRect } from "../../../src/ui/map/layout";
import { focusFallback, GameScreen, mapFocusTarget, sameFraming } from "../../../src/ui/screens/GameScreen";
import { focusLost, focusQuietly } from "../../../src/ui/screens/focusRescue";
import { gameChunk } from "../../../src/ui/screens/lazyChunks";
import { Menu, menuMove } from "../../../src/ui/screens/Menu";
import { StartScreen } from "../../../src/ui/screens/StartScreen";
import { ShownProvider, StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { LayoutKind } from "../../../src/ui/theme";
import type { MapTargets } from "../../../src/ui/ui-contract";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import { fixture } from "../../fixtures/load";

const h = createElement;
const ROOT = join(__dirname, "../../..");
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;
const noop = () => undefined;
const css = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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
const inRoot = (c: GameController, el: ReactNode, layout: LayoutKind = "desktop") =>
  renderToStaticMarkup(h(UiRootProvider, { controller: c, settingsStore: createSettingsStore(null, {}), layout, rootAttributes: false }, el));
const startProps = { coin: null, confirmReplace: true, inGame: false, onPick: noop, onResume: noop, onSettings: noop, onAbout: noop };

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined });
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

/** A stand-in element: connected or not, focusable by script. */
function el(connected = true) {
  const attrs = new Map<string, string>();
  const doc = { activeElement: null as unknown, documentElement: {} };
  const e = {
    isConnected: connected, tabIndex: -1, ownerDocument: doc,
    hasAttribute: (k: string) => attrs.has(k), setAttribute: (k: string, v: string) => { attrs.set(k, v); if (k === "tabindex") e.tabIndex = Number(v); },
    focus: () => { doc.activeElement = e; }, attrs,
  };
  return e;
}

describe("focus is never lost to <body> (Q-043)", () => {
  it("rescues only focus lost by removal: <body> has it and the last focused element left the page", () => {
    const body = el() as unknown as Element;
    (body as unknown as { ownerDocument: { documentElement: unknown } }).ownerDocument = { documentElement: {} };
    const gone = el(false) as unknown as Element;
    const here = el(true) as unknown as Element;
    expect(focusLost(body, gone, body)).toBe(true);
    expect(focusLost(null, gone, body)).toBe(true);
    expect(focusLost(body, here, body)).toBe(false); // a click on empty space: the old control is still there
    expect(focusLost(here, gone, body)).toBe(false); // something has focus: never steal it
    expect(focusLost(body, null, body)).toBe(false);
  });
  it("focusQuietly makes a region focusable by script (tabindex −1) and focuses it", () => {
    const slip = el();
    expect(focusQuietly(slip as unknown as HTMLElement)).toBe(true);
    expect(slip.attrs.get("tabindex")).toBe("-1");
    expect(slip.attrs.has("data-focus-region")).toBe(true); // base.css rings it on keyboard focus
    expect(readFileSync(join(ROOT, "src/ui/theme/base.css"), "utf8")).toMatch(/\[data-focus-region\]:focus-visible \{ outline: 2px solid var\(--ts-focus\);/);
    const button = el();
    button.tabIndex = 0; // natively focusable: left alone
    expect(focusQuietly(button as unknown as HTMLElement)).toBe(true);
    expect(button.attrs.has("tabindex")).toBe(false);
    expect(focusQuietly(null)).toBe(false);
  });
  it("the stable place is the orders slip, else the table", () => {
    const slip = el(), table = el();
    const game = { querySelector: (q: string) => (q === "section[data-mode][data-variant]" ? slip : null) };
    expect(focusFallback(game as unknown as ParentNode, table as unknown as HTMLElement)).toBe(slip);
    expect(focusFallback({ querySelector: () => null } as unknown as ParentNode, table as unknown as HTMLElement)).toBe(table);
    expect(focusFallback(null, null)).toBeNull();
  });
});

describe("Skip to map (Q-044)", () => {
  it("goes to the map's roving box (first legal target), else to the table itself", () => {
    const box = el();
    const queries: string[] = [];
    const table = { querySelector: (q: string) => { queries.push(q); return q === "[data-cid][tabindex='0']" ? box : null; } };
    expect(mapFocusTarget(table as unknown as HTMLElement)).toBe(box);
    expect(queries).toEqual(["[data-cid][tabindex='0']"]); // never the <svg role=application> first
    const empty = { querySelector: () => null };
    expect(mapFocusTarget(empty as unknown as HTMLElement)).toBe(empty);
    expect(mapFocusTarget(null)).toBeNull();
  });
  it("the table is a focusable landmark (tabindex −1) in every arrangement, with one announcer", async () => {
    await gameChunk.load();
    for (const layout of ["desktop", "tablet", "compact", "compact-landscape"] as const) {
      const c = new FixtureController(fixture("prompt-influence"), { start: "end" });
      const html = renderToStaticMarkup(
        h(UiRootProvider, { controller: c, settingsStore: createSettingsStore(null, {}), layout, rootAttributes: false },
          h(ShownProvider, null, h(GameScreen))),
      );
      expect(html, layout).toMatch(/<main id="ts-map" tabindex="-1"/);
      // Q-045: the AI-play announcer is the game screen's, exactly once, whatever holds the log.
      expect(html.match(/role="log" aria-live="polite"/g)?.length, layout).toBe(1);
      expect(html.match(/aria-live=/g)?.length, layout).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("theatre chips follow a tap (Q-047)", () => {
  it("a tall (portrait) view of each region presses that region's chip, SE Asia and Africa included", () => {
    for (const aspect of [1.25, 1.6, 2]) {
      for (const slot of THEATRE_ORDER) {
        const r = areaRect(slot);
        let w = r.w, hh = r.w * aspect;
        if (hh < r.h) { hh = r.h; w = hh / aspect; }
        expect(framedSlot({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - hh / 2, w, h: hh }), `${slot} @ ${aspect}`).toBe(slot);
      }
    }
  });
  it("a wide (landscape) view keeps the area rule", () => {
    for (const slot of THEATRE_ORDER) {
      const r = areaRect(slot);
      const w = Math.max(r.w, r.h / 0.46), hh = w * 0.46;
      expect(framedSlot({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - hh / 2, w, h: hh }), `${slot}`).toBe(slot);
    }
  });
  it("the tapped chip stays pressed while the view is the tap's own (a settle, a sheet resize), not after a pan or zoom", () => {
    const v = { x: 1000, y: 600, w: 400, h: 520 };
    expect(sameFraming({ ...v, h: 480, y: 620 }, v)).toBe(true); // the orders sheet grew: same centre and scale
    expect(sameFraming({ ...v, x: 1030 }, v)).toBe(true);
    expect(sameFraming({ ...v, x: 1200 }, v)).toBe(false); // panned
    expect(sameFraming({ x: 900, y: 470, w: 600, h: 780 }, v)).toBe(false); // zoomed out
  });
});

describe("the ☰ menu by keyboard (Q-046)", () => {
  it("↑ ↓ wrap, Home / End, other keys are not moves", () => {
    expect(menuMove("ArrowDown", -1, 5)).toBe(0);
    expect(menuMove("ArrowDown", 4, 5)).toBe(0);
    expect(menuMove("ArrowUp", 0, 5)).toBe(4);
    expect(menuMove("ArrowUp", -1, 5)).toBe(4);
    expect(menuMove("Home", 3, 5)).toBe(0);
    expect(menuMove("End", 1, 5)).toBe(4);
    expect(menuMove("Enter", 1, 5)).toBeNull();
    expect(menuMove("ArrowDown", -1, 0)).toBeNull();
  });
  it("the popover is the one menu (no nested role=menu); its items are not Tab stops", () => {
    const c = stubController({ status: "playing", humanSide: "USSR" });
    const html = inRoot(c, h(Menu, { anchor: null, onClose: noop, onOpen: noop, onNewGameNow: noop }));
    expect(html.match(/role="menu"/g)?.length).toBe(1);
    expect(html).toMatch(/role="menu" aria-label="Menu"/);
    const items = html.match(/<(button|a)[^>]*role="menuitem"[^>]*>/g) ?? [];
    expect(items.length).toBe(6);
    for (const i of items) expect(i).toContain('tabindex="-1"');
  });
  it("compact: a sheet holding the menu, the language switch outside it with 44 px targets", () => {
    const c = stubController({ status: "playing", humanSide: "USSR" });
    const html = inRoot(c, h(Menu, { anchor: null, onClose: noop, onOpen: noop, onNewGameNow: noop }), "compact");
    expect(html.match(/role="menu"/g)?.length).toBe(1);
    const menu = html.slice(html.indexOf('role="menu"'));
    const menuEnd = menu.indexOf("</div>", menu.lastIndexOf('role="menuitem"'));
    expect(menu.slice(0, menuEnd)).not.toContain("简体中文"); // the language switch is not a menu item
    expect(html).toContain('aria-label="简体中文"');
    expect(html).toMatch(/_menuLangToggle_/);
    expect(css("src/ui/screens/dialogs.module.css")).toMatch(/\.menuLang \.menuLangToggle button \{ min-width: 44px; min-height: 44px;/);
  });
});

describe("start screen (Q-051, Q-052, K-001)", () => {
  it("the backdrop map is inert (no Tab stops, no tooltips) and hidden from AT", () => {
    const html = inRoot(stubController({ status: "menu" }), h(StartScreen, startProps));
    expect(html).toMatch(/<div class="[^"]*_wall_[^"]*" aria-hidden="true" inert="">/);
  });
  it("after a failed load the folders read as unavailable (dimmed, not busy)", () => {
    const failed = inRoot(stubController({ status: "error", error: "boom" }), h(StartScreen, startProps));
    expect(failed).toMatch(/class="[^"]*_start_[^"]*_failed_/);
    const loading = inRoot(stubController({ status: "loading" }), h(StartScreen, startProps));
    expect(loading).not.toMatch(/_failed_/);
    const src = css("src/ui/screens/StartScreen.module.css");
    expect(src).toMatch(/\.failed \.folder:disabled \{ cursor: not-allowed; opacity: \.5;/);
    expect(src).toMatch(/\.folder:disabled \{ cursor: progress; \}/); // only while loading
  });
  it("Retry: boot() again before any game, a page reload in the middle of one", async () => {
    const boot = vi.fn(async () => undefined);
    const reload = vi.fn();
    retryBoot({ boot }, null, reload);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    retryBoot({ boot }, "USSR", reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledTimes(1);
    // A boot that fails again is reported by the controller (status "error"), never an unhandled rejection.
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    expect(() => retryBoot({ boot: failing }, undefined, reload)).not.toThrow();
    await Promise.resolve();
  });
});

describe("language switch offline (Q-056)", () => {
  it("a failed download is reported (toast), never an unhandled rejection", async () => {
    const report = vi.fn();
    expect(await switchLanguage(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")), "zh-CN", report)).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(await switchLanguage(async () => undefined, "en", report)).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
  });
  it("the toast names the language", () => {
    expect(t("ui_shell:error.language", { lang: t("ui:language.zh-CN") })).toBe("简体中文 could not be loaded. Check your connection and try again.");
  });
});

describe("accessible names (Q-053)", () => {
  it("one target / one card in the singular", () => {
    const targets: MapTargets = { ids: new Set([7]), tone: "loud", danger: new Set(), cost2: new Set(), verb: "add" };
    const bar = renderToStaticMarkup(h(TheatreBar, { targets, framed: null, onFrame: noop }));
    expect(bar).toMatch(/aria-label="[^"]+: 1 target"/);
    expect(t("ui_shell:theatre.count", { region: "Asia", count: 3 })).toBe("Asia: 3 targets");
    expect(t("ui_shell:dock.handAria", { count: 1 })).toBe("Your hand: 1 card");
    expect(t("ui_shell:dock.handAria", { count: 6 })).toBe("Your hand: 6 cards");
    expect(t("ui_shell:dock.adversaryAria", { count: 1 })).toBe("Adversary: 1 card in hand");
    expect(t("ui_shell:dock.logAria", { count: 1 })).toBe("Log: 1 new dispatch");
  });
  it("Chinese: the plural forms resolve, the wordmark is named like the page title", async () => {
    await setLanguage("zh-CN");
    try {
      expect(t("ui_shell:dock.handAria", { count: 1 })).toBe("你的手牌：1 张");
      expect(t("ui_shell:theatre.count", { region: "亚洲", count: 2 })).toBe("亚洲：2 个目标");
      expect(t("ui_console:wordmark.label")).toBe(`${t("ui:app.title")}：打开菜单`);
    } finally {
      await setLanguage("en");
    }
  });
});

describe("stylesheets: touch targets and safe areas (Q-041, Q-042, Q-048)", () => {
  it("theatre chips and the orders-sheet grab give touch a 44 px hit area", () => {
    const compact = css("src/ui/compact/compact.module.css");
    expect(compact).toMatch(/@media \(pointer: coarse\) \{[\s\S]*\.chip::after \{[^}]*top: -5px; bottom: -13px;/);
    expect(compact).toMatch(/height: calc\(var\(--ts-c-theatre-h\) \+ 8px\);\s*margin-bottom: -8px;/);
    const game = css("src/ui/screens/GameScreen.module.css");
    expect(game).toMatch(/\.grab \{[^}]*align-self: stretch;/);
    expect(game).toMatch(/@media \(pointer: coarse\) \{\s*\.grab::after \{[^}]*height: 44px;/);
    expect(css("src/ui/screens/dialogs.module.css")).toMatch(/@media \(pointer: coarse\) \{\s*\.seg button \{ min-height: 44px; min-width: 44px;/);
  });
  it("the game grid and the start screen keep inside the left / right safe areas", () => {
    const tokens = css("src/ui/theme/tokens.css");
    expect(tokens).toContain("--ts-safe-left: env(safe-area-inset-left, 0px);");
    expect(tokens).toContain("--ts-safe-right: env(safe-area-inset-right, 0px);");
    const game = css("src/ui/screens/GameScreen.module.css");
    expect(game).toMatch(/\.game \{\s*padding-left: var\(--ts-safe-left\);\s*padding-right: var\(--ts-safe-right\);/);
    expect(game).toMatch(/\.theatreOverlay \{[^}]*padding-left: max\(8px, var\(--ts-safe-left\)\)/);
    expect(css("src/ui/screens/StartScreen.module.css")).toMatch(/padding: 0 var\(--ts-safe-right\) var\(--ts-safe-bottom\) var\(--ts-safe-left\);/);
  });
  it("the dock's hand label and the mini VP readout are never ellipsized", () => {
    const compact = css("src/ui/compact/compact.module.css");
    expect(compact).toMatch(/\.dockHand \.dl \{[^}]*flex: none; overflow: visible;/);
    const con = css("src/ui/console/Console.module.css");
    expect(con).toMatch(/\.vpMini \.vpRead \{ flex: none; \}/);
    expect(con).not.toMatch(/\.vpMini \.vpRead \{[^}]*ellipsis/);
  });
});

describe("the page head (Q-057)", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  it("an inline favicon (no request to the domain root) and link-preview tags", () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
    for (const p of ["og:type", "og:title", "og:description", "og:url", "og:site_name"]) expect(html).toContain(`property="${p}"`);
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('content="https://chenao-phys.github.io/TS_playfield/"');
  });
});

describe("dock names with one card (Q-053)", () => {
  it("compact dock aria labels", () => {
    const c = new FixtureController(fixture("prompt-influence"));
    const vm = c.getSnapshot();
    const html = inRoot(c, h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores) }, h(BottomDock, { open: null, onOpen: noop })), "compact");
    expect(html).toMatch(/aria-label="Your hand: \d+ cards?"/);
    expect(html).toMatch(/aria-label="Adversary: \d+ cards? in hand"/);
  });
});
