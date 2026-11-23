/**
 * QA seed finder (skipped unless TSP_SEEDS is set): plays the games a dev play-through with `?ai=policy&seed=<n>` and
 * the autopilot (`play.mjs --policy ai --game-seed <n>`) plays, in Node, in seconds -- the same seeded controller
 * random (mulberry32, as appController's `?seed=`), the network's argmax on both sides -- and prints how each ends,
 * so QA can pick seeds that reach the late war or a given ending before running them in the browser.
 *
 *   TSP_SEEDS=1-30 TSP_SIDE=US npx vitest run tests/ai/autopilot-seeds.test.ts --silent=false
 */
import { afterAll, describe, it } from "vitest";
import { createAiPlayer, type AiPlayerHandle } from "../../src/ai";
import { MODEL_SHA256 } from "../../src/ai/config";
import type { Side } from "../../src/game/contract";
import { TsGameController } from "../../src/game/controller";
import { MemoryStorage } from "../../src/game/persistence";
import { createAutopilot } from "../../src/dev/autopilot";
import { loadEngine, PUBLIC_URL, readModelBytes, rng } from "./helpers";

function seeds(spec: string): number[] {
  return spec.split(",").flatMap(part => {
    const [a, b] = part.split("-").map(Number);
    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
  });
}

const players: AiPlayerHandle[] = [];
const policy = () => {
  const p = createAiPlayer({ modelUrl: "unused", modelSha256: MODEL_SHA256, search: "policy", minDelayMs: 0 },
    { mode: "inline", engineBase: PUBLIC_URL, modelBytes: readModelBytes(), useCache: false, padSensitive: false });
  players.push(p);
  return p;
};
afterAll(() => { for (const p of players) p.dispose(); });

describe.skipIf(!process.env.TSP_SEEDS)("autopilot seeds", () => {
  it("plays each seed to the end", async () => {
    const sides = (process.env.TSP_SIDE ?? "USSR,US").split(",") as Side[];
    const engine = await loadEngine();
    const opponent = policy();
    const auto = policy();
    const rows: string[] = [];
    for (const side of sides) {
      for (const seed of seeds(process.env.TSP_SEEDS!)) {
        const ctrl = new TsGameController({
          loadEngine: async () => engine, ai: opponent, storage: new MemoryStorage(), random: rng(seed),
          minAiDelayMs: 0, sleep: async () => undefined, onError: () => undefined,
        });
        const pilot = createAutopilot(ctrl, { ai: () => auto, log: () => undefined });
        await ctrl.boot();
        await ctrl.newGame({ side });
        let answers = 0;
        for (let it = 0; it < 500_000; it++) {
          const vm = ctrl.getSnapshot();
          if (vm.status !== "playing") break;
          if (vm.frame && !vm.prompt) ctrl.ackFrame(vm.frame.seq);
          if (vm.prompt) { await pilot.step(); answers++; } else await new Promise(r => setTimeout(r, 0));
        }
        const e = ctrl.getSnapshot().ending;
        const st = pilot.stats();
        rows.push(`${side.padEnd(4)} seed ${String(seed).padStart(4)}: ${e ? `${e.reason.padEnd(14)} ${e.winner.padEnd(4)} wins, turn ${String(e.turn).padStart(2)}, VP ${e.vpFinal}` : "no ending"}`
          + ` · ${answers} answers${st.unmapped ? `, ${st.unmapped} unmapped` : ""}`);
        console.log(rows[rows.length - 1]);
      }
    }
  }, 3_600_000);
});
