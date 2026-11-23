/**
 * The page's one GameController (docs/handoff/logic.md "Wiring"): the main-thread WASM engine, the
 * full-strength AI worker (leaderboard #1, src/ai/config.ts) and localStorage autosaves.
 *
 * Dev only: `?ai=policy` swaps the search for the network's argmax (fast, for QA play-throughs), `?seed=<n>` makes
 * the controller's random source a seeded one (the game seeds and the coin of a random side: with the policy AI and
 * the autopilot a whole game replays exactly), and the QA hooks `window.__tsp` (the controller) and
 * `window.__tspAuto` (src/dev/autopilot.ts: the human's move as the AI would choose it; `?auto=full` for the full
 * search instead of the policy) are installed. The branches sit behind
 * `import.meta.env.DEV`, which Vite replaces with `false` in a production build, so the production bundle has no way
 * to select them and holds no autopilot code (the build check greps dist/ for the parameter, the hooks, "autopilot").
 */
import { AI_CONFIG, createAiPlayer } from "../../ai";
import { WasmEngine } from "../../engine/wasm_engine";
import { browserStorage, createGameController } from "../../game";
import type { AiConfig, GameController } from "../../game/contract";

/** The AI configuration this page plays with. */
export function pageAiConfig(): AiConfig {
  if (import.meta.env.DEV && typeof location !== "undefined") {
    if (new URLSearchParams(location.search).get("ai") === "policy") {
      return { ...AI_CONFIG, search: "policy", minDelayMs: 250 };
    }
  }
  return AI_CONFIG;
}

/** Dev only (`?seed=<n>`): a seeded random source for the controller (mulberry32), else undefined (crypto). */
function devRandom(): (() => number) | undefined {
  if (!import.meta.env.DEV || typeof location === "undefined") return undefined;
  const v = new URLSearchParams(location.search).get("seed");
  if (v === null || !/^\d+$/.test(v)) return undefined;
  let a = Number(v) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let page: GameController | null = null;

/** The page's controller, created once (StrictMode renders twice; the AI worker must not be). */
export function appController(): GameController {
  if (!page) {
    const config = pageAiConfig();
    const ctrl = createGameController({
      loadEngine: () => WasmEngine.load(),
      ai: createAiPlayer(config),
      storage: browserStorage(),
      minAiDelayMs: config.minDelayMs,
      random: devRandom(),
    });
    page = ctrl;
    if (import.meta.env.DEV && typeof window !== "undefined") {
      // QA hooks (dev builds only): Playwright reads the view model through __tsp, and asks __tspAuto which option
      // the AI would pick for the human (src/ui/screens/demo/play.mjs --policy ai).
      const w = window as unknown as { __tsp?: GameController; __tspAuto?: unknown };
      w.__tsp = ctrl;
      void import("../../dev/autopilot").then(m => {
        const search = new URLSearchParams(location.search).get("auto") === "full" ? "full" : "policy";
        w.__tspAuto = m.createAutopilot(ctrl, { search });
      });
    }
  }
  return page;
}
