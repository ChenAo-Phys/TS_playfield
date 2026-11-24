/**
 * QA round 3, live site and cross-browser findings in the shell: the start screen reads Ready when it is mounted
 * again after a game (L-1: the AI stays loaded; `vm.aiReady`), the credits' links are 44 px touch targets (L-7), and
 * the "Toss a coin" seal is not a 3D context (X-2: Firefox painted it in the page's top-left corner).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameController, ViewModel } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import { StartScreen } from "../../../src/ui/screens/StartScreen";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";

const h = createElement;
const ROOT = join(__dirname, "../../..");
const css = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const noop = () => undefined;

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
/** One mount of the start screen (react-dom/server: every call is a fresh mount, as after a game). */
const mount = (vm: Partial<ViewModel>, el: ReactNode = h(StartScreen, startProps)) =>
  renderToStaticMarkup(h(UiRootProvider, { controller: stubController(vm), settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false }, el));
const startProps = { coin: null, confirmReplace: true, inGame: false, onPick: noop, onResume: noop, onSettings: noop, onAbout: noop };
const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const bar = (html: string) => /role="progressbar"[^>]*aria-valuenow="(\d+)"/.exec(html)?.[1] ?? /aria-valuenow="(\d+)"[^>]*role="progressbar"/.exec(html)?.[1];

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("the start screen after a game (L-1)", () => {
  it("mounted again with the AI loaded (no load progress to see), it reads Ready, not a stalled 10 MB download", () => {
    // First visit: the download shows.
    const first = mount({ status: "menu", load: { stage: "model-download", fraction: 0.62 } });
    expect(text(first)).toContain("3.6 / 5.8 MB");
    expect(text(first)).toContain("The first visit downloads about 10 MB");
    // Loaded: Ready.
    const ready = mount({ status: "menu", aiReady: true });
    expect(bar(ready)).toBe("100");
    // After a game (resigned → New game: status "over"; menu → New game: "playing"), a new mount: Ready again.
    for (const status of ["over", "playing", "menu"] as const) {
      const again = mount({ status, humanSide: status === "menu" ? null : "US", aiReady: true });
      expect(bar(again)).toBe("100");
      expect(text(again)).not.toContain("The first visit downloads");
      expect(text(again)).not.toMatch(/AI model (?!✓)/i);
    }
  });

  it("in Chinese, mounted again: 就绪, no first-visit note", async () => {
    await setLanguage("zh-CN");
    try {
      const again = mount({ status: "over", humanSide: "USSR", aiReady: true });
      expect(bar(again)).toBe("100");
      expect(text(again)).not.toContain("首次访问");
    } finally {
      await setLanguage("en");
    }
  });

  it("not Ready before the AI is (no aiReady), nor on an error", () => {
    expect(bar(mount({ status: "menu" }))).toBe("15");
    expect(bar(mount({ status: "loading", load: { stage: "engine", fraction: null }, aiReady: true }))).toBe("8");
    const failed = mount({ status: "error", error: "HTTP 404", load: { stage: "model-download", fraction: null } });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain("The AI model could not be downloaded");
  });
});

describe("the credits' links on touch screens (L-7)", () => {
  it("one per line, each at least 44 px tall", () => {
    const src = css("src/ui/screens/dialogs.module.css");
    expect(src).toMatch(/@media \(pointer: coarse\) \{\s*\.links \{ flex-direction: column;[^}]*\}\s*\.links a \{ min-height: 44px; \}/);
    expect(src).toMatch(/\.links a \{ display: inline-flex; align-items: center;/);
  });
});

describe("the coin seal (X-2)", () => {
  it("is not a preserve-3d context (Firefox painted it in the page's corner)", () => {
    const src = css("src/ui/screens/StartScreen.module.css");
    expect(src).toMatch(/\.coinWrap \{ display: inline-grid; width: 54px; height: 54px; \}/);
    expect(src).not.toMatch(/\.coin[A-Za-z]*[^{]*\{[^}]*transform-style: preserve-3d/);
  });
});
