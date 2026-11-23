/** Controller behaviour: prompt release, stale input, undo policy, resign, random side, AI timing and errors, saves. */
import { describe, expect, it } from "vitest";
import type { AiInfo, AiMove, AiPlayer, Frame, ViewModel } from "../../src/game/contract";
import { TsGameController } from "../../src/game/controller";
import { MemoryStorage, readSave, SAVE_KEY, writeSave } from "../../src/game/persistence";
import { TIMING_PADDED_CARDS, forcedEventTarget } from "../../src/game/rules";
import { drive, loadEngine, makeController, mulberry32, STUB_AI_MS, StubAi, tick } from "./helpers";

/** Ack every frame as it appears (what the UI does once it has animated it). */
function autoAck(ctrl: TsGameController): () => void {
  let last = 0;
  const l = () => {
    const f = ctrl.getSnapshot().frame;
    if (f && f.seq > last) { last = f.seq; ctrl.ackFrame(f.seq); }
  };
  const un = ctrl.subscribe(l);
  l();
  return un;
}

async function until(ctrl: TsGameController, pred: (vm: ViewModel) => boolean, max = 20_000): Promise<ViewModel> {
  for (let i = 0; i < max; i++) {
    const vm = ctrl.getSnapshot();
    if (vm.status === "error") throw new Error(vm.error);
    if (pred(vm)) return vm;
    await tick();
  }
  throw new Error("condition never met");
}

describe("prompts and frames", () => {
  it("releases the prompt only once every frame is acked, and ignores stale input", async () => {
    const h = makeController();
    await h.ctrl.newGame({ side: "USSR", seed: 31 });
    let vm = h.ctrl.getSnapshot();
    expect(vm.status).toBe("playing");
    expect(vm.frame).not.toBeNull();
    expect(vm.prompt).toBeNull(); // the first frame is not acked yet
    const first = vm.frame as Frame;
    expect(first.events).toEqual([{ t: "phase", phase: "SETUP" }]);
    h.ctrl.ackFrame(first.seq + 5); // a wrong seq does nothing
    expect(h.ctrl.getSnapshot().prompt).toBeNull();
    h.ctrl.ackFrame(first.seq);
    vm = h.ctrl.getSnapshot();
    expect(vm.prompt?.kind).toBe("setup-place");
    const p = vm.prompt!;
    expect(p.remaining).toBe(6);
    // Not an option / stale prompt id: ignored.
    h.ctrl.choose(p.promptId, 208);
    h.ctrl.choose(p.promptId + 1, p.options[0].idx);
    expect(h.ctrl.stepActors()).toHaveLength(0);
    h.ctrl.choose(p.promptId, p.options[0].idx);
    expect(h.ctrl.stepActors()).toHaveLength(1);
    vm = h.ctrl.getSnapshot();
    expect(vm.prompt).toBeNull(); // the step's frame must be animated first
    expect(vm.frame?.actor).toBe("USSR");
    expect(vm.frame?.events.some(e => e.t === "influence" && e.side === "USSR" && e.to - e.from === 1)).toBe(true);
    h.ctrl.ackFrame(vm.frame!.seq);
    expect(h.ctrl.getSnapshot().prompt?.remaining).toBe(5);
    // The same prompt id again is ignored.
    h.ctrl.choose(p.promptId, p.options[0].idx);
    expect(h.ctrl.stepActors()).toHaveLength(1);
  });
});

describe("log release", () => {
  it("shows a step's log entry only once its frame is on screen", async () => {
    const h = makeController();
    await h.ctrl.newGame({ side: "US", seed: 37 }); // the AI (USSR) places its 6 setup points first
    await until(h.ctrl, v => v.queued >= 6);
    let vm = h.ctrl.getSnapshot();
    expect(vm.log.map(e => e.kind)).toEqual(["system"]); // only "new game": the AI's placements wait for their frames
    for (let i = 1; i <= 6; i++) {
      h.ctrl.ackFrame(vm.frame!.seq);
      vm = h.ctrl.getSnapshot();
      expect(vm.log.length).toBe(1 + i);
      expect(vm.log[i].side).toBe("USSR");
      expect(vm.frame!.actor).toBe("USSR");
    }
  });
});

describe("undo", () => {
  it("goes back to the start of the human's play while nothing hidden or random happened", async () => {
    const h = makeController();
    const un = autoAck(h.ctrl);
    await h.ctrl.newGame({ side: "USSR", seed: 32 });
    let vm = await until(h.ctrl, v => !!v.prompt);
    const start = h.engine().saveJson();
    expect(vm.canUndo).toBe(false);
    for (let i = 0; i < 3; i++) {
      h.ctrl.choose(vm.prompt!.promptId, vm.prompt!.countries[0] + 116);
      vm = await until(h.ctrl, v => !!v.prompt);
      expect(vm.canUndo).toBe(true);
    }
    const logBefore = vm.log.length;
    h.ctrl.undo();
    vm = await until(h.ctrl, v => !!v.prompt);
    expect(h.engine().saveJson()).toBe(start);
    expect(vm.canUndo).toBe(false);
    expect(vm.log.length).toBe(logBefore - 3);
    expect(vm.prompt!.remaining).toBe(6);
    // Finish the setup: the AI then places its own (an AI decision), so the headline cannot be undone into.
    while (vm.prompt!.kind === "setup-place") {
      h.ctrl.choose(vm.prompt!.promptId, vm.prompt!.options[0].idx);
      vm = await until(h.ctrl, v => !!v.prompt);
    }
    expect(vm.prompt!.kind).toBe("headline");
    expect(vm.canUndo).toBe(false);
    un();
  });

  it("is never offered right after the human's own die roll", async () => {
    let checked = 0;
    for (let g = 0; g < 4; g++) {
      const h = makeController({ aiSalt: 40 + g });
      let lastHumanRoll = false;
      const human = g % 2 ? "US" : "USSR";
      h.ctrl.subscribe(() => {
        const f = h.ctrl.getSnapshot().frame;
        if (f) lastHumanRoll = f.actor === human && f.events.some(e => e.t === "roll");
      });
      await h.ctrl.newGame({ side: human, seed: 900 + g });
      await drive(h, {
        rand: mulberry32(g), avoidWarned: 0.95, undoRate: 0.3,
        onPrompt: (_p, vm) => {
          if (lastHumanRoll) { expect(vm.canUndo).toBe(false); checked++; }
        },
      });
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("resign, sides, saves", () => {
  it("resigns: the AI wins, the save is finished", async () => {
    const h = makeController();
    const un = autoAck(h.ctrl);
    await h.ctrl.newGame({ side: "US", seed: 33 });
    await until(h.ctrl, v => !!v.prompt);
    expect(h.ctrl.getSnapshot().hasSavedGame).toBe(true);
    const cancels = h.ai.cancels;
    h.ctrl.resign();
    const vm = h.ctrl.getSnapshot();
    expect(vm.status).toBe("over");
    expect(vm.ending).toMatchObject({ winner: "USSR", reason: "resign" });
    expect(vm.prompt).toBeNull();
    expect(vm.hasSavedGame).toBe(false);
    expect(h.ai.cancels).toBeGreaterThan(cancels);
    expect(readSave(h.storage)?.over).toBe(true);
    expect(await h.ctrl.resume()).toBe(false);
    un();
  });

  it("picks a random side and seed with crypto when no random source is given", async () => {
    const engine = await loadEngine();
    const storage = new MemoryStorage();
    const ctrl = new TsGameController({ loadEngine: async () => engine, ai: new StubAi(5), storage, minAiDelayMs: 0, sleep: async () => {} });
    const sides = new Set<string>();
    const seeds = new Set<number>();
    for (let i = 0; i < 24; i++) {
      await ctrl.newGame({ side: "random" });
      sides.add(ctrl.getSnapshot().humanSide!);
      seeds.add(readSave(storage)!.seed);
    }
    expect([...sides].sort()).toEqual(["US", "USSR"]);
    expect(seeds.size).toBe(24);
    for (const s of seeds) expect(Number.isSafeInteger(s) && s > 0).toBe(true);
  });

  it("keeps the AI's stats and summarises the save for the start screen, across a resume", async () => {
    const h = makeController();
    const un = autoAck(h.ctrl);
    await h.ctrl.newGame({ side: "US", seed: 38 });
    let vm = await until(h.ctrl, v => !!v.prompt);
    expect(vm.aiStats).toEqual({ decisions: 6, ms: 6 * STUB_AI_MS }); // the USSR's 6 setup points
    // Play to the first action round.
    while (vm.prompt!.kind !== "action-card") {
      h.ctrl.choose(vm.prompt!.promptId, vm.prompt!.options[0].idx);
      vm = await until(h.ctrl, v => !!v.prompt && v.prompt.promptId !== vm.prompt!.promptId);
    }
    const d = h.engine().display();
    expect(vm.hasSavedGame).toBe(true);
    expect(vm.savedGame).toMatchObject({ turn: d.turn, ar: d.action_round, humanSide: "US" });
    expect(vm.savedGame!.ar).toBeGreaterThanOrEqual(1);
    const stats = vm.aiStats!;
    expect(stats.decisions).toBe(h.ctrl.stepActors().filter(s => s.by === "USSR" && !s.auto).length);
    un();

    const h2 = makeController({ storage: h.storage });
    await h2.ctrl.boot();
    let vm2 = h2.ctrl.getSnapshot();
    expect(vm2.hasSavedGame).toBe(true);
    expect(vm2.savedGame).toEqual(vm.savedGame);
    expect(vm2.aiStats).toBeUndefined(); // no game yet
    expect(await h2.ctrl.resume()).toBe(true);
    vm2 = h2.ctrl.getSnapshot();
    expect(vm2.aiStats).toEqual(stats);
    // A save written before the summary existed (format v1, plain JSON) is still resumable, without a summary.
    const save = readSave(h.storage)!;
    const { turn: _t, ar: _a, aiStats: _s, ...old } = save;
    h.storage.setItem(SAVE_KEY, JSON.stringify({ ...old, v: 1 }));
    const h3 = makeController({ storage: h.storage });
    await h3.ctrl.boot();
    expect(h3.ctrl.getSnapshot().hasSavedGame).toBe(true);
    expect(h3.ctrl.getSnapshot().savedGame).toBeUndefined();
    expect(await h3.ctrl.resume()).toBe(true);
    expect(h3.ctrl.getSnapshot().aiStats).toEqual({ decisions: 0, ms: 0 });
    h3.ctrl.discardSave();
    expect(h3.ctrl.getSnapshot().savedGame).toBeUndefined();
  });

  it("refuses saves from another engine build, or that do not replay", async () => {
    const h = makeController();
    await h.ctrl.boot();
    expect(await h.ctrl.resume()).toBe(false); // nothing saved
    await h.ctrl.newGame({ side: "USSR", seed: 34 });
    const save = readSave(h.storage)!;
    writeSave(h.storage, { ...save, fingerprint: "other" });
    const h2 = makeController({ storage: h.storage });
    await h2.ctrl.boot();
    expect(h2.ctrl.getSnapshot().hasSavedGame).toBe(false);
    expect(await h2.ctrl.resume()).toBe(false);
    writeSave(h.storage, { ...save, steps: [[5, 200, 0, 0]], autoFlags: "0" });
    const h3 = makeController({ storage: h.storage });
    await h3.ctrl.boot();
    expect(h3.ctrl.getSnapshot().hasSavedGame).toBe(true);
    expect(await h3.ctrl.resume()).toBe(false);
    expect(h3.ctrl.getSnapshot().status).toBe("menu");
    expect(h3.ctrl.getSnapshot().hasSavedGame).toBe(false);
    expect(readSave(h.storage)).toBeNull();
  });
});

describe("boot", () => {
  it("is memoised once loaded, and tried again after a failure", async () => {
    const engine = await loadEngine();
    let calls = 0;
    const errors: unknown[] = [];
    let fail = true;
    const h = makeController({
      loadEngine: async () => { calls++; if (fail) throw new Error("the engine could not be fetched"); return engine; },
      onError: e => errors.push(e),
    });
    // Two calls during one attempt share it.
    const a = h.ctrl.boot();
    const b = h.ctrl.boot();
    expect(a).toBe(b);
    await expect(a).rejects.toThrow("could not be fetched");
    expect(calls).toBe(1);
    expect(errors).toHaveLength(1);
    let vm = h.ctrl.getSnapshot();
    expect(vm.status).toBe("error");
    expect(vm.error).toBe("the engine could not be fetched");
    // A second failure is a new attempt.
    await expect(h.ctrl.boot()).rejects.toThrow("could not be fetched");
    expect(calls).toBe(2);
    // Then it loads: the error is gone and the menu shows.
    fail = false;
    const c = h.ctrl.boot();
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "loading", load: { stage: "engine" } });
    expect(h.ctrl.getSnapshot().error).toBeUndefined();
    await c;
    expect(calls).toBe(3);
    vm = h.ctrl.getSnapshot();
    expect(vm.status).toBe("menu");
    expect(vm.error).toBeUndefined();
    expect(h.ctrl.boot()).toBe(c);
    await h.ctrl.newGame({ side: "USSR", seed: 3 });
    expect(calls).toBe(3);
    expect(h.ctrl.getSnapshot().status).toBe("playing");
  });

  it("loads the AI again when its load failed before any game", async () => {
    let fails = 1;
    const ai = new StubAi();
    const init = ai.init.bind(ai);
    ai.init = async () => { if (fails-- > 0) throw new Error("the model could not be fetched"); return init(); };
    const h = makeController({ ai });
    await h.ctrl.boot();
    for (let i = 0; i < 100 && h.ctrl.getSnapshot().status !== "error"; i++) await tick();
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "error", error: "the model could not be fetched" });
    await h.ctrl.boot();
    expect(h.ctrl.getSnapshot().status).toBe("menu");
    expect(h.ctrl.getSnapshot().error).toBeUndefined();
    await tick(); await tick();
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "menu" });
    await h.ctrl.newGame({ side: "USSR", seed: 8 });
    expect(h.ctrl.getSnapshot().status).toBe("playing");
  });

  it("lets newGame retry a failed boot", async () => {
    const engine = await loadEngine();
    let calls = 0;
    const h = makeController({ loadEngine: async () => { if (++calls === 1) throw new Error("offline"); return engine; } });
    await expect(h.ctrl.boot()).rejects.toThrow("offline");
    await h.ctrl.newGame({ side: "US", seed: 5 });
    expect(calls).toBe(2);
    expect(h.ctrl.getSnapshot().status).toBe("playing");
  });
});

describe("AI timing and failures", () => {
  it("waits the minimum delay for every AI decision and pads forced Blockade / LADC / Missile Envy answers", async () => {
    let padded = 0;
    let searched = 0;
    for (let g = 0; g < 40 && padded === 0; g++) {
      const ai = Object.assign(new StubAi(70 + g), { thinkingDelayMs: () => 2500 });
      const sleeps: number[] = [];
      const h = makeController({ ai, minAiDelayMs: 1500, clock: { now: () => 0 }, sleep: async ms => { sleeps.push(ms); } });
      ai.onRequest = () => { searched++; };
      let before = 0;
      const un = h.ctrl.subscribe(() => {
        // A sleep requested while the AI faces a forced padded decision.
        const E = h.ctrl.engineForDiagnostics;
        if (!E || sleeps.length === before) return;
        before = sleeps.length;
        const d = E.display();
        const m = E.mask(false);
        const legal = [...m.keys()].filter(i => m[i]).length;
        const forced = legal === 1 || forcedEventTarget(d, m, null) >= 0;
        if (forced && TIMING_PADDED_CARDS.has(d.decision_context.resolving_card) && d.decision_context.decision_player !== h.ctrl.getSnapshot().humanSide) {
          // The AI's own sample (thinkingDelayMs) when above the minimum.
          expect(sleeps[sleeps.length - 1]).toBe(2500);
          padded++;
        }
      });
      await h.ctrl.newGame({ side: "USSR", seed: 2000 + g });
      await drive(h, { rand: mulberry32(g), avoidWarned: 0.95 });
      un();
      expect(sleeps.every(ms => ms >= 1500)).toBe(true);
      expect(sleeps.length).toBeGreaterThanOrEqual(1);
    }
    expect(searched).toBeGreaterThan(0);
    expect(padded).toBeGreaterThan(0);
  }, 300_000);

  class FlakyAi implements AiPlayer {
    calls = 0;
    constructor(private readonly inner: StubAi, private readonly failures: number, private readonly illegal = false) {}
    init(): Promise<AiInfo> { return this.inner.init(); }
    async choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }) {
      this.calls++;
      if (this.calls <= this.failures) {
        if (this.illegal) return { idx: 303, ms: 0 };
        throw new Error("worker crashed");
      }
      return this.inner.choose(req);
    }
    cancel(): void {}
    dispose(): void {}
  }

  it("retries a failing AI, then reports an error", async () => {
    const ok = new FlakyAi(new StubAi(3), 2);
    const h = makeController({ ai: ok });
    const un = autoAck(h.ctrl);
    await h.ctrl.newGame({ side: "US", seed: 35 }); // the AI (USSR) sets up first
    await until(h.ctrl, v => !!v.prompt);
    expect(ok.calls).toBeGreaterThan(2);
    un();

    for (const illegal of [false, true]) {
      const bad = new FlakyAi(new StubAi(3), 1_000, illegal);
      const h2 = makeController({ ai: bad });
      await h2.ctrl.newGame({ side: "US", seed: 36 });
      for (let i = 0; i < 20_000 && h2.ctrl.getSnapshot().status !== "error"; i++) await tick();
      const vm = h2.ctrl.getSnapshot();
      expect(vm.status).toBe("error");
      expect(vm.error).toMatch(illegal ? /illegal/ : /crashed/);
      expect(bad.calls).toBe(3);
    }
  });
});
