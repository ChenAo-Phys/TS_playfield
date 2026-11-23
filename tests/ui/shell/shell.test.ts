/**
 * The shell (src/ui/App.tsx, src/ui/screens, src/ui/compact): pure helpers, the composed app rendered with
 * react-dom/server over recorded fixtures (the real UiRootProvider, ShownProvider and every workstream's
 * components), the start screen in every boot state, the dialogs, the compact parts, in English, Chinese and
 * the pseudo-language (every string the shell itself shows comes from a catalog).
 */
import { createElement, Suspense, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AI_CONFIG } from "../../../src/ai/config";
import { FixtureController } from "../../../src/dev/FixtureController";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { GameController, LogEntry, ViewModel } from "../../../src/game/contract";
import { message, setLanguage } from "../../../src/i18n";
import { App } from "../../../src/ui/App";
import { BottomDock } from "../../../src/ui/compact/BottomDock";
import { framedSlot, TheatreBar, theatreCounts, THEATRE_ORDER } from "../../../src/ui/compact/TheatreBar";
import { boundsOf, countriesOfSlot, MAP_H, MAP_W } from "../../../src/ui/map";
import { Ticker } from "../../../src/ui/compact/Ticker";
import { AboutDossier } from "../../../src/ui/screens/AboutDossier";
import { pageAiConfig } from "../../../src/ui/screens/appController";
import { BootLine, bootProgress, errorKey } from "../../../src/ui/screens/BootLine";
import { WASM_SIMD_UNSUPPORTED } from "../../../src/ai/errors";
import { ConfirmDossier } from "../../../src/ui/screens/ConfirmDossier";
import { consoleVariant, GameScreen } from "../../../src/ui/screens/GameScreen";
import { Menu } from "../../../src/ui/screens/Menu";
import { SettingsDossier } from "../../../src/ui/screens/SettingsDossier";
import { ShortcutsSheet, SHORTCUT_ROWS } from "../../../src/ui/screens/ShortcutsSheet";
import { gameChunk, lazyChunk, mapChunk, whenIdle } from "../../../src/ui/screens/lazyChunks";
import { agoText, StartScreen } from "../../../src/ui/screens/StartScreen";
import { ShownProvider, StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { LayoutKind } from "../../../src/ui/theme";
import type { MapTargets } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();

/** A controller stand-in with a fixed view model (start screen states). */
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

function inRoot(controller: GameController, el: ReactNode, layout: LayoutKind = "desktop") {
  return renderToStaticMarkup(
    h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout, rootAttributes: false }, el),
  );
}

function inGame(scene: string, el: ReactNode, layout: LayoutKind = "desktop") {
  const c = new FixtureController(fixture(scene));
  const vm = c.getSnapshot();
  return inRoot(c, h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores) }, el), layout);
}

const noop = () => undefined;
const startProps = { coin: null, confirmReplace: true, inGame: false, onPick: noop, onResume: noop, onSettings: noop, onAbout: noop };

beforeAll(async () => {
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined }); // engine layout (space boxes, branch names)
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("pure helpers", () => {
  it("picks the console variant by layout and width (§3.1–3.3)", () => {
    expect(consoleVariant("desktop", 1440)).toBe("desktop");
    expect(consoleVariant("desktop", 1366)).toBe("condensed");
    expect(consoleVariant("desktop", 1200)).toBe("condensed");
    expect(consoleVariant("tablet", 1024)).toBe("tablet");
    expect(consoleVariant("compact", 390)).toBe("compact");
    expect(consoleVariant("compact-landscape", 844)).toBe("compact");
  });

  it("walks the boot line through the load stages", () => {
    expect(bootProgress("boot", undefined, false).step).toBe("link");
    expect(bootProgress("loading", { stage: "engine", fraction: null }, false).step).toBe("engine");
    const dl = bootProgress("menu", { stage: "model-download", fraction: 0.5 }, false);
    expect(dl.step).toBe("model");
    expect(dl.bar).toBeGreaterThan(0.4);
    expect(dl.bar).toBeLessThan(0.6);
    expect(bootProgress("menu", { stage: "model-verify", fraction: null }, false).step).toBe("verify");
    expect(bootProgress("menu", { stage: "ai-worker", fraction: 0.5 }, false).step).toBe("start");
    expect(bootProgress("menu", undefined, true)).toEqual({ step: "ready", bar: 1 });
  });

  it("names the error by the stage that failed", () => {
    expect(errorKey("engine", "The WebAssembly engine is missing (x)")).toBe("ui:error.engine");
    expect(errorKey("model-download", "HTTP 404")).toBe("ui:error.modelDownload");
    expect(errorKey("model-verify", "sha256 mismatch")).toBe("ui:error.modelVerify");
    expect(errorKey("ai-worker", "worker crashed")).toBe("ui:error.worker");
    expect(errorKey("ai-worker", `${WASM_SIMD_UNSUPPORTED}, which the AI needs.`)).toBe("ui:error.webassembly");
    expect(errorKey("engine", "ReferenceError: WebAssembly is not defined")).toBe("ui:error.webassembly");
    // Q-005: onnxruntime's raw error names its ort-wasm-simd-threaded file: a failed download, not a missing feature.
    expect(errorKey("ai-worker", "no available backend found. ERR: [wasm] TypeError: Failed to fetch ort-wasm-simd-threaded.jsep.wasm")).toBe("ui:error.worker");
    expect(errorKey(null, "This browser has no WebAssembly SIMD")).toBe("ui:error.unexpected");
    expect(errorKey(null, "boom")).toBe("ui:error.unexpected");
  });

  it("says how long ago the game was saved, in the page language", () => {
    const now = Date.UTC(2026, 10, 22, 12);
    expect(agoText("en", now - 2 * 3600_000, now)).toMatch(/2 hr\.? ago/);
    expect(agoText("en", now - 30_000, now)).toMatch(/this minute|now/);
    expect(agoText("zh-CN", now - 3 * 86400_000, now)).toMatch(/3/);
  });

  it("counts targets per theatre chip, SE Asia inside Asia too", () => {
    const targets: MapTargets = { ids: new Set([7, 18, 35, 38, 42]), tone: "loud", danger: new Set(), cost2: new Set(), verb: "add" };
    const n = theatreCounts(targets);
    expect(THEATRE_ORDER).toEqual([0, 2, 1, 6, 3, 4, 5]);
    expect(n[0]).toBeGreaterThan(0); // 7 is in Europe
    expect(n[6]).toBeLessThanOrEqual(n[1]); // SE Asia also counts in Asia
    expect(theatreCounts(null)).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  });

  it("presses the chip of the region the camera frames", () => {
    expect(framedSlot({ x: 0, y: 0, w: MAP_W, h: MAP_H })).toBeNull(); // the world
    for (const slot of [0, 2, 3, 4, 5, 6] as const) {
      const r = boundsOf(countriesOfSlot(slot), 40);
      expect(framedSlot(r), `slot ${slot}`).toBe(slot);
    }
  });

  it("plays the leaderboard #1 search unless the dev-only ?ai=policy switch is on", () => {
    expect(pageAiConfig()).toBe(AI_CONFIG); // no location in Node, and tests are not a dev page
    expect(AI_CONFIG.search).toMatch(/belief2048/);
  });
});

describe("code splitting: the game screen and the start screen's map are lazy chunks", () => {
  it("keeps the start screen up while a game is on and its chunk is not in yet (no fallback), then shows the game", async () => {
    expect(gameChunk.loaded()).toBe(false);
    const c = new FixtureController(fixture("prompt-influence"), { start: "end" });
    const before = renderToStaticMarkup(h(App, { controller: c }));
    expect(before).toContain("Take command");
    expect(before).not.toContain('id="ts-map"');
    await gameChunk.load();
    expect(gameChunk.loaded()).toBe(true);
    expect(renderToStaticMarkup(h(App, { controller: new FixtureController(fixture("prompt-influence"), { start: "end" }) }))).toContain('id="ts-map"');
  });

  it("a loaded chunk's lazy component renders in the same pass (no Suspense fallback)", async () => {
    const chunk = lazyChunk(async () => ({ Hello: ({ who }: { who: string }) => h("b", null, `hi ${who}`) }), m => m.Hello);
    const fallback = h("i", null, "loading");
    // Not loaded: the boundary shows its fallback.
    expect(renderToStaticMarkup(h(Suspense, { fallback }, h(chunk.Component, { who: "a" })))).not.toContain("hi a");
    await chunk.load();
    const again = lazyChunk(async () => ({ Hello: ({ who }: { who: string }) => h("b", null, `hi ${who}`) }), m => m.Hello);
    await again.load();
    expect(renderToStaticMarkup(h(Suspense, { fallback }, h(again.Component, { who: "b" })))).toBe("<b>hi b</b>");
  });

  it("a failed download is forgotten, so the next load retries; listeners hear the arrival", async () => {
    let fail = true;
    const chunk = lazyChunk(async () => { if (fail) throw new Error("offline"); return { C: () => null }; }, m => m.C);
    await expect(chunk.load()).rejects.toThrow("offline");
    expect(chunk.loaded()).toBe(false);
    fail = false;
    let heard = 0;
    const off = chunk.subscribe(() => { heard++; });
    await chunk.load();
    expect(chunk.loaded()).toBe(true);
    expect(heard).toBe(1);
    off();
  });

  it("the start screen draws its map backdrop once the map chunk is in; whenIdle is a no-op without a window", async () => {
    const props = { coin: null, confirmReplace: true, inGame: false, onPick: noop, onResume: noop, onSettings: noop, onAbout: noop };
    await mapChunk.load();
    expect(inRoot(stubController({ status: "menu" }), h(StartScreen, props))).toContain('role="application"');
    expect(typeof whenIdle(noop)).toBe("function");
  });
});

describe("the composed app (App → providers → GameScreen) on recorded scenes", () => {
  const SCENES = ["prompt-influence", "prompt-coup-target", "prompt-play-mode", "prompt-headline", "prompt-region", "prompt-branch", "seq-over-vp20"];
  beforeAll(async () => { await gameChunk.load(); });
  for (const scene of SCENES) {
    it(`App renders the game screen: ${scene}`, () => {
      const c = new FixtureController(fixture(scene), { start: "end" });
      const html = renderToStaticMarkup(h(App, { controller: c }));
      expect(html).toContain('role="application"'); // the map
      expect(html).toContain('data-variant="desktop"'); // Node has no viewport: desktop
      expect(html).toContain('id="ts-map"');
    });
    for (const layout of ["desktop", "tablet", "compact", "compact-landscape"] as const) {
      it(`GameScreen · ${scene} · ${layout}`, () => {
        const c = new FixtureController(fixture(scene), { start: "end" });
        const html = renderToStaticMarkup(
          h(UiRootProvider, { controller: c, settingsStore: createSettingsStore(null, {}), layout, rootAttributes: false },
            h(ShownProvider, null, h(GameScreen))),
        );
        expect(html).toContain(`data-layout="${layout}"`);
        const compact = layout === "compact" || layout === "compact-landscape";
        // The console variant, the rail / strip / dock per arrangement (§3).
        expect(html).toContain(`data-variant="${compact ? "compact" : layout === "tablet" ? "tablet" : "desktop"}"`);
        if (compact) {
          expect(html).not.toContain("Dispatches"); // no rail: the log is a sheet
          // The dock: "Hand · n" (portrait) or icons only (landscape, named for screen readers).
          if (layout === "compact") expect(text(html)).toMatch(/Hand · \d/);
          else expect(html).toMatch(/aria-label="Your hand: \d+ cards"/);
        } else {
          expect(text(html)).not.toMatch(/Hand · \d/);
        }
        if (layout === "desktop") expect(text(html)).toContain("Dispatches");
      });
    }
  }

  it("routes boot / loading / menu / error to the start screen", () => {
    for (const status of ["boot", "loading", "menu", "error"] as const) {
      const html = renderToStaticMarkup(h(App, { controller: stubController({ status, error: status === "error" ? "boom" : undefined }) }));
      expect(html).toContain("Take command");
      if (status === "error") expect(html).toContain('role="alert"');
    }
  });
});

describe("start screen", () => {
  it("shows the three side dossiers, the rule chips, the boot line and the fine print", () => {
    const html = inRoot(stubController({ status: "menu", load: { stage: "model-download", fraction: 0.62 } }), h(StartScreen, startProps));
    const t = text(html);
    for (const s of ["United States", "Toss a coin", "Soviet Union", "US bid +2", "Tournament rule", "Linking with DeepStruggle", "3.6 / 5.8 MB", "Credits & licenses"]) {
      expect(t).toContain(s);
    }
    expect(html).toContain('href="https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf"');
    expect(html).toContain('role="group"');
    expect(t).not.toContain("Resume game");
  });

  it("offers Resume with the save summary", () => {
    const savedAt = Date.now() - 2 * 3600_000;
    const html = inRoot(stubController({ status: "menu", hasSavedGame: true, savedGame: { turn: 5, ar: 3, humanSide: "USSR", savedAt } }), h(StartScreen, startProps));
    expect(text(html)).toMatch(/Resume game Turn 5 · AR 3 · you are the USSR · 2 hr\.? ago/);
  });

  it("keeps the sides disabled until the engine is ready", () => {
    const html = inRoot(stubController({ status: "loading", load: { stage: "engine", fraction: null } }), h(StartScreen, startProps));
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("stacks on compact (no take-command line, chevrons instead)", () => {
    const html = inRoot(stubController({ status: "menu" }), h(StartScreen, startProps), "compact");
    expect(html).toContain('data-layout="compact"');
    expect(text(html)).not.toContain("Take command");
  });
});

describe("boot line", () => {
  it("turns into an alert with Retry and the details on an error", () => {
    const html = renderToStaticMarkup(h(BootLine, { status: "error", error: "HTTP 404 at model", failedStage: "model-download", aiReady: false, onRetry: noop }));
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("The AI model could not be downloaded");
    expect(text(html)).toContain("Retry");
    expect(html).toContain("HTTP 404 at model");
  });
  it("shows Ready when the AI is up", () => {
    const html = renderToStaticMarkup(h(BootLine, { status: "menu", aiReady: true, onRetry: noop }));
    expect(text(html)).toContain("Ready");
    expect(html).toContain('aria-valuenow="100"');
  });
});

describe("dialogs", () => {
  const c = stubController({ status: "playing", humanSide: "USSR" });
  it("settings: every §11.2 row (sound is left out: no sounds ship)", () => {
    const t = text(inRoot(c, h(SettingsDossier, { onClose: noop })));
    for (const s of ["Language", "Card images", "Animation speed", "Motion", "Confirm the action that ends your play", "Pause on headlines and scoring", "Map labels", "Side patterns", "Follow the action"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toContain("Sound");
  });
  it("about: credits, the living rules link, the trademark note", () => {
    const html = inRoot(c, h(AboutDossier, { onClose: noop }));
    const t = text(html);
    expect(t).toContain("DeepStruggle");
    expect(t).toContain("MIT");
    expect(t).toContain("SIL Open Font License");
    expect(t).toContain("Natural Earth");
    expect(t).toContain("trademark of GMT Games");
    expect(html).toContain("TS_Rules_Deluxe.pdf");
    expect(html).toContain("fonts/OFL.txt");
    expect(html).toContain("THIRD_PARTY_LICENSES.txt"); // Q-012
    expect(t).toContain("saved in this browser only"); // save v2 (OD-1): honest about what the save hides
    expect(t).toContain("not tamper-proof");
  });
  it("shortcuts: every §12 row", () => {
    const t = text(inRoot(c, h(ShortcutsSheet, { onClose: noop })));
    expect(SHORTCUT_ROWS.length).toBe(16);
    for (const s of ["Skip to my turn", "Undo play", "Target list", "Shift+Space", "E I C R S"]) expect(t).toContain(s);
  });
  it("confirmations: new game is a click, resign a hold", () => {
    expect(text(inRoot(c, h(ConfirmDossier, { kind: "newGame", onClose: noop, onConfirm: noop })))).toContain("Abandon this game?");
    const resign = inRoot(c, h(ConfirmDossier, { kind: "resign", onClose: noop, onConfirm: noop }));
    expect(text(resign)).toContain("Resign this game?");
    expect(text(resign)).toMatch(/hold/i);
  });
  it("menu: new game, resign, settings, shortcuts, rules, about; compact adds the language", () => {
    const desktop = text(inRoot(c, h(Menu, { anchor: null, onClose: noop, onOpen: noop, onNewGameNow: noop })));
    for (const s of ["New game", "Resign", "Settings", "Keyboard shortcuts", "Rules (GMT living rules)", "About & credits"]) expect(desktop).toContain(s);
    expect(desktop).not.toContain("Language");
  });
});

describe("compact parts", () => {
  it("theatre bar: chips in board order with target counts, World last", () => {
    const targets: MapTargets = { ids: new Set([7, 8, 18]), tone: "loud", danger: new Set(), cost2: new Set(), verb: "add" };
    const t = text(renderToStaticMarkup(h(TheatreBar, { targets, framed: 0, onFrame: noop })));
    expect(t.indexOf("Europe")).toBeLessThan(t.indexOf("Middle East"));
    expect(t.indexOf("Middle East")).toBeLessThan(t.indexOf("Asia"));
    expect(t.trim().endsWith("World")).toBe(true);
  });
  it("dock: hand count, adversary, log, status", () => {
    const html = inGame("prompt-influence", h(BottomDock, { open: null, onOpen: noop }), "compact");
    const t = text(html);
    expect(t).toMatch(/Hand · \d/);
    for (const s of ["Adversary", "Log", "Status"]) expect(t).toContain(s);
  });
  it("ticker: the AI's last play, or the play banner while it plays", () => {
    const entry: LogEntry = { id: 9, turn: 2, ar: 3, side: "US", kind: "play", text: message("prompt:log.resign", { side: "US" }) };
    expect(renderToStaticMarkup(h(Ticker, { entry: null, aiPlayCard: 0 }))).toBe("");
    const banner = text(renderToStaticMarkup(h(Ticker, { entry, aiPlayCard: 30, aiSide: "US", ar: 4, how: "coup" })));
    expect(banner).toContain("US · Action round 4");
    expect(banner).toContain("Decolonization");
  });
});

describe("languages", () => {
  it("Chinese start screen and menu", async () => {
    await setLanguage("zh-CN");
    try {
      const t = text(inRoot(stubController({ status: "menu" }), h(StartScreen, startProps)));
      expect(t).toContain("美国");
      expect(t).toContain("掷硬币");
      expect(t).toContain("开始指挥");
    } finally {
      await setLanguage("en");
    }
  });

  it("pseudo-language: every visible shell string is marked ⟦…⟧", async () => {
    await setLanguage("en-XA");
    try {
      const c = stubController({ status: "playing", humanSide: "USSR" });
      const parts = [
        inRoot(stubController({ status: "menu", load: { stage: "model-download", fraction: 0.3 } }), h(StartScreen, startProps)).replace(/<svg[\s\S]*?<\/svg>/g, ""),
        inRoot(c, h(SettingsDossier, { onClose: noop })),
        inRoot(c, h(AboutDossier, { onClose: noop })),
        inRoot(c, h(ShortcutsSheet, { onClose: noop })),
        inRoot(c, h(ConfirmDossier, { kind: "resign", onClose: noop, onConfirm: noop })),
        inRoot(c, h(Menu, { anchor: null, onClose: noop, onOpen: noop, onNewGameNow: noop })),
        renderToStaticMarkup(h(TheatreBar, { targets: null, framed: null, onFrame: noop })),
        inGame("prompt-influence", h(BottomDock, { open: null, onOpen: noop }), "compact").replace(/<svg[\s\S]*?<\/svg>/g, ""),
      ];
      for (const html of parts) {
        const runs = html.replace(/<[^>]+>/g, "\u0000").replace(/&gt;/g, ">").replace(/&amp;/g, "&").split("\u0000").map(s => s.trim()).filter(Boolean);
        // Allowed unmarked: numbers, punctuation and glyphs, the bilingual title art (冷战热斗 in its own lang span)
        // and card names (data).
        const bad = runs.filter(r => !r.includes("⟦") && !/^[\d\s.·:/%+−\-–—>›→↗⤢▶✓?…,()#]*$/.test(r) && !/冷战热斗/.test(r));
        expect(bad).toEqual([]);
      }
    } finally {
      await setLanguage("en");
    }
  });
});
