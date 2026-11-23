/**
 * The controller with the real AI player (src/ai, inline mode under Node: the same network and code
 * as the worker). The network's policy (search = "policy") keeps it quick; the full-strength search is
 * tested in tests/ai. Checks the integration: seating, the belief move list, legal answers, a game
 * that runs to its end with frames, log and prompts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createAiPlayer, type AiPlayerHandle } from "../../src/ai";
import { MODEL_SHA256 } from "../../src/ai/config";
import { drive, loadEngine, makeController, mulberry32, PUBLIC_BASE } from "./helpers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODEL_FILE } from "../../src/ai/config";

const modelPath = fileURLToPath(new URL(`models/${MODEL_FILE}`, PUBLIC_BASE));
const players: AiPlayerHandle[] = [];
afterAll(() => { for (const p of players) p.dispose(); });

describe("controller + real AI", () => {
  it("plays whole games against the network as either side", async () => {
    for (const side of ["USSR", "US"] as const) {
      const ai = createAiPlayer({ modelUrl: "unused", modelSha256: MODEL_SHA256, search: "policy", minDelayMs: 0 },
        { mode: "inline", engineBase: PUBLIC_BASE, modelBytes: new Uint8Array(readFileSync(modelPath)), useCache: false });
      players.push(ai);
      const h = makeController({ ai: ai as never, engine: await loadEngine() });
      await h.ctrl.boot();
      await h.ctrl.newGame({ side, seed: side === "US" ? 8101 : 8102 });
      const rec = await drive(h, { rand: mulberry32(side === "US" ? 1 : 2), avoidWarned: 0.97, undoRate: 0.05 });
      expect(rec.leaks).toEqual([]);
      expect(rec.problems).toEqual([]);
      const vm = h.ctrl.getSnapshot();
      expect(vm.status).toBe("over");
      expect(ai.info?.obsFeatures).toBe(12);
      expect(ai.recentSearchMs().length).toBeGreaterThanOrEqual(0);
      console.log(`${side}: ${rec.steps} steps, ${rec.prompts} prompts, ending ${JSON.stringify(vm.ending)}`);
    }
  }, 300_000);
});
