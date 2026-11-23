/**
 * The dev autopilot (src/dev/autopilot.ts): its deterministic fallback, the mapping of the AI's answer onto the
 * controller's prompt, and a whole game in Node -- the policy network playing the human's seat through the real
 * controller against the policy network as the AI (inline mode, the model from public/).
 */
import { afterAll, describe, expect, it } from "vitest";
import { createAiPlayer, type AiPlayerHandle } from "../../src/ai";
import { MODEL_SHA256 } from "../../src/ai/config";
import type { AiMove, Prompt, PromptOption, Side } from "../../src/game/contract";
import { TsGameController } from "../../src/game/controller";
import { MemoryStorage } from "../../src/game/persistence";
import { createAutopilot, fallbackOption, type AutopilotAi } from "../../src/dev/autopilot";
import { loadEngine, PUBLIC_URL, readModelBytes, rng } from "./helpers";

const players: AiPlayerHandle[] = [];
function policy(): AiPlayerHandle {
  const p = createAiPlayer({ modelUrl: "unused", modelSha256: MODEL_SHA256, search: "policy", minDelayMs: 0 },
    { mode: "inline", engineBase: PUBLIC_URL, modelBytes: readModelBytes(), useCache: false, padSensitive: false });
  players.push(p);
  return p;
}
afterAll(() => { for (const p of players) p.dispose(); });

function prompt(kind: Prompt["kind"], options: Array<Partial<PromptOption> & Pick<PromptOption, "kind" | "id">>): Prompt {
  return {
    kind, promptId: 7, decisionType: 0, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 0, maxPerCountry: 0,
    options: options.map((o, i) => ({ idx: o.idx ?? i, ...o })) as PromptOption[], cards: [], countries: [],
    title: { key: "prompt:title.headline" },
  } as Prompt;
}

describe("fallbackOption", () => {
  it("is deterministic: Influence first at a play mode, no option that loses on the spot, else the first real move", () => {
    const modes = prompt("play-mode", [{ kind: "mode", id: 0 }, { kind: "mode", id: 1 }, { kind: "mode", id: 3 }, { kind: "mode", id: 2 }]);
    expect(fallbackOption(modes)).toMatchObject({ kind: "mode", id: 2 });
    const noInf = prompt("play-mode", [{ kind: "mode", id: 0 }, { kind: "mode", id: 3 }, { kind: "mode", id: 1 }]);
    expect(fallbackOption(noInf)).toMatchObject({ kind: "mode", id: 1 });
    const ops = prompt("op-mode", [{ kind: "op-mode", id: 1 }, { kind: "op-mode", id: 2 }]);
    expect(fallbackOption(ops)).toMatchObject({ kind: "op-mode", id: 2 });
    const coup = prompt("coup-target", [
      { kind: "country", id: 3, warnings: [{ code: "defcon-suicide" }] }, { kind: "country", id: 9 }, { kind: "done", id: 0 },
    ]);
    expect(fallbackOption(coup)).toMatchObject({ kind: "country", id: 9 });
    const onlyDone = prompt("event-card", [{ kind: "done", id: 0 }]);
    expect(fallbackOption(onlyDone)).toMatchObject({ kind: "done" });
    const allBad = prompt("coup-target", [{ kind: "country", id: 3, warnings: [{ code: "cmc-suicide" }] }]);
    expect(fallbackOption(allBad)).toMatchObject({ kind: "country", id: 3 });
  });
});

describe("createAutopilot", () => {
  /** A host with one open prompt. */
  function host(p: Prompt | null) {
    const chosen: Array<[number, number]> = [];
    return {
      chosen,
      getSnapshot: () => ({ prompt: p, status: "playing" }),
      choose: (id: number, idx: number) => { chosen.push([id, idx]); },
      humanDecisionForDiagnostics: () => (p ? { promptId: p.promptId, state: new Uint8Array(1), seed: 1, moves: [] as AiMove[] } : null),
    };
  }
  const fixed = (answer: number | Error): AutopilotAi => ({
    choose: async () => { if (answer instanceof Error) throw answer; return { idx: answer, ms: 3, source: "policy" }; },
    dispose: () => undefined,
  });

  it("returns the AI's option when it is one of the prompt's, and falls back (logged) when it is not or the AI fails", async () => {
    const p = prompt("play-mode", [{ kind: "mode", id: 1, idx: 33 }, { kind: "mode", id: 2, idx: 34 }]);
    const lines: string[] = [];
    let a = createAutopilot(host(p), { ai: () => fixed(33), log: l => lines.push(l) });
    expect(await a.suggest()).toMatchObject({ promptId: 7, kind: "play-mode", option: { idx: 33, kind: "mode", id: 1 }, via: "ai", aiIdx: 33 });
    // The Event the human's seat may not take (OWN_EVENT_GATED): not an option, so the fallback (Influence).
    a = createAutopilot(host(p), { ai: () => fixed(32), log: l => lines.push(l) });
    expect(await a.suggest()).toMatchObject({ option: { idx: 34, kind: "mode", id: 2 }, via: "fallback", aiIdx: 32 });
    expect(a.stats()).toMatchObject({ suggestions: 1, ai: 0, unmapped: 1, errors: 0 });
    a = createAutopilot(host(p), { ai: () => fixed(new Error("worker gone")), log: l => lines.push(l) });
    expect(await a.suggest()).toMatchObject({ option: { idx: 34 }, via: "fallback", aiIdx: null });
    expect(a.stats().errors).toBe(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[autopilot\] prompt 7: the AI chose flat index 32/);
    // No prompt: nothing to suggest; step() chooses through the host.
    expect(await createAutopilot(host(null), { ai: () => fixed(33) }).suggest()).toBeNull();
    const h = host(p);
    await createAutopilot(h, { ai: () => fixed(34) }).step();
    expect(h.chosen).toEqual([[7, 34]]);
  });

  it("plays a whole game for the human through the real controller (policy vs policy)", async () => {
    for (const side of ["USSR", "US"] as Side[]) {
      const engine = await loadEngine();
      const ctrl = new TsGameController({
        loadEngine: async () => engine, ai: policy(), storage: new MemoryStorage(), random: rng(side === "US" ? 2 : 1),
        minAiDelayMs: 0, sleep: async () => undefined, onError: () => undefined,
      });
      const auto = createAutopilot(ctrl, { ai: () => policy(), log: () => undefined });
      await ctrl.boot();
      await ctrl.newGame({ side, seed: side === "US" ? 4242 : 4141 });
      let answers = 0;
      for (let it = 0; it < 200_000; it++) {
        const vm = ctrl.getSnapshot();
        if (vm.status === "error") throw new Error(vm.error);
        if (vm.status === "over") break;
        if (vm.frame && !vm.prompt) ctrl.ackFrame(vm.frame.seq);
        if (vm.prompt) {
          const s = await auto.step();
          expect(s).not.toBeNull();
          expect(vm.prompt.options.some(o => o.idx === s!.option.idx)).toBe(true);
          answers++;
        } else {
          await new Promise(r => setTimeout(r, 0));
        }
      }
      const vm = ctrl.getSnapshot();
      const st = auto.stats();
      console.log(`autopilot ${side}: ${vm.ending?.reason} in turn ${vm.ending?.turn} (${vm.ending?.winner}), ${answers} answers, `
        + `${st.unmapped} unmapped, ${st.errors} errors, ${st.recent.join(" | ")}`);
      expect(vm.status).toBe("over");
      expect(st.errors).toBe(0);
      expect(st.suggestions).toBe(answers);
      // The seats' rule bits differ only on dead own Events (One Small Step, Wargames): rare.
      expect(st.unmapped).toBeLessThanOrEqual(Math.max(3, answers / 50));
      expect(vm.ending!.turn).toBeGreaterThanOrEqual(3);
    }
  }, 300_000);
});
