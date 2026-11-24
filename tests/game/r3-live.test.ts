/**
 * Regression tests for the controller's part of the QA round-3 live-site findings (docs/qa/r3-live.md): the view model
 * says when the AI is loaded (`ViewModel.aiReady`), so a start screen mounted again after a game reads Ready (L-1);
 * and the AI's downloads still wait for the engine (L-3: starting them alongside was measured to delay the side
 * folders on a slow line without bringing Ready forward).
 */
import { describe, expect, it } from "vitest";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import { loadEngine, makeController, StubAi, tick } from "./helpers";

/** A promise to settle from outside. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

/** Waits (real time: the stub AI loads its own engine) until `cond` holds, at most `ms`. */
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise(r => setTimeout(r, 5));
}

describe("ViewModel.aiReady (L-1)", () => {
  it("is absent until the AI has loaded, then stays through a game, a resignation and a new game", async () => {
    const gate = deferred<void>();
    const ai = new StubAi();
    const init = ai.init.bind(ai);
    ai.init = async () => { await gate.promise; return init(); };
    const h = makeController({ ai, engine: await loadEngine() });
    await h.ctrl.boot();
    expect(h.ctrl.getSnapshot().aiReady).toBeUndefined();
    expect(h.ctrl.getSnapshot().load).toEqual({ stage: "model-download", fraction: 0 });
    gate.resolve();
    await until(() => !!h.ctrl.getSnapshot().aiReady);
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "menu", aiReady: true });
    expect(h.ctrl.getSnapshot().load).toBeUndefined();
    await h.ctrl.newGame({ side: "US", seed: 9 });
    expect(h.ctrl.getSnapshot().aiReady).toBe(true);
    h.ctrl.resign();
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "over", aiReady: true });
    await h.ctrl.newGame({ side: "USSR", seed: 10 });
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "playing", aiReady: true });
    expect(h.ctrl.getSnapshot().load).toBeUndefined();
  });

  it("is absent after a failed load, until a Retry has loaded the AI", async () => {
    const ai = new StubAi();
    let fails = 1;
    const init = ai.init.bind(ai);
    ai.init = async () => { await tick(); if (fails-- > 0) throw Object.assign(new Error("HTTP 404"), { stage: "model-download" }); return init(); };
    const h = makeController({ ai, engine: await loadEngine() });
    await h.ctrl.boot();
    await until(() => h.ctrl.getSnapshot().status === "error");
    expect(h.ctrl.getSnapshot().aiReady).toBeUndefined();
    await h.ctrl.boot();
    await until(() => !!h.ctrl.getSnapshot().aiReady);
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "menu", aiReady: true });
  });
});

describe("the AI's downloads wait for the engine (L-3)", () => {
  it("asks for the AI only once the engine is in", async () => {
    const engine = await loadEngine();
    const gate = deferred<WasmEngine>();
    const ai = new StubAi();
    let inits = 0;
    const init = ai.init.bind(ai);
    ai.init = () => { inits++; return init(); };
    const h = makeController({ ai, loadEngine: () => gate.promise });
    const boot = h.ctrl.boot();
    await tick();
    expect(inits).toBe(0);
    expect(h.ctrl.getSnapshot()).toMatchObject({ status: "loading", load: { stage: "engine", fraction: null } });
    gate.resolve(engine);
    await boot;
    expect(inits).toBe(1);
  });
});
