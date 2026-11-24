/**
 * Regression tests for the QA round-3 items fixed in src/game (group F1): the view model says when a game is not being
 * autosaved (D-203, `ViewModel.saveUnavailable`), and the coup prompt's Ops are worded as a maximum when a regional
 * bonus (the China Card in Asia, Vietnam Revolts in Southeast Asia) may not apply (D-202).
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Prompt, Side } from "../../src/game/contract";
import { type ControllerViewModel, TsGameController } from "../../src/game/controller";
import { MemoryStorage, browserStorage, readSave } from "../../src/game/persistence";
import { computeCoupOdds } from "../../src/game/previews";
import { buildPrompt } from "../../src/game/prompt";
import { playerOf } from "../../src/game/rules";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import { drive, loadEngine, makeController, mulberry32, tick } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// D-203: ViewModel.saveUnavailable
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A storage that refuses writes while `full` (QuotaExceededError), as a full origin does. */
class RefusingStorage extends MemoryStorage {
  full = false;
  writes = 0;
  override setItem(key: string, value: string): void {
    this.writes++;
    if (this.full) {
      const e = new Error("The quota has been exceeded.");
      e.name = "QuotaExceededError";
      throw e;
    }
    super.setItem(key, value);
  }
}

const sv = (ctrl: TsGameController) => ctrl.getSnapshot() as ControllerViewModel;

describe("saveUnavailable (D-203)", () => {
  it("is set for the whole game when the page has no storage, and only while it is playing", async () => {
    const h = makeController({ storage: null as unknown as MemoryStorage, aiSalt: 3 });
    await h.ctrl.boot();
    expect(sv(h.ctrl).status).toBe("menu");
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();
    await h.ctrl.newGame({ side: "US", seed: 41 });
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
    await drive(h, { rand: mulberry32(41), stopAfterPrompts: 3, timeoutMs: 60_000 });
    expect(sv(h.ctrl).status).toBe("playing");
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
    h.ctrl.resign();
    expect(sv(h.ctrl).status).toBe("over");
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();
  }, 120_000);

  it("is never set while storage takes every write", async () => {
    const h = makeController({ aiSalt: 3 });
    await h.ctrl.newGame({ side: "USSR", seed: 42 });
    let seen = 0;
    await drive(h, {
      rand: mulberry32(42), stopAfterPrompts: 6, timeoutMs: 60_000,
      onPrompt: (_p, vm) => { seen++; expect((vm as ControllerViewModel).saveUnavailable).toBeUndefined(); },
    });
    expect(seen).toBeGreaterThan(0);
    expect(readSave(h.storage)).not.toBeNull();
  }, 120_000);

  it("follows the last write: set when storage refuses it, cleared by the next one that goes through", async () => {
    const store = new RefusingStorage();
    const h = makeController({ storage: store, aiSalt: 4 });
    await h.ctrl.newGame({ side: "US", seed: 43 });
    await drive(h, { rand: mulberry32(43), stopAfterPrompts: 3, timeoutMs: 60_000 });
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();

    store.full = true;
    const before = store.writes;
    let flagged = 0;
    await drive(h, {
      rand: mulberry32(44), stopAfterPrompts: 3, timeoutMs: 60_000,
      onPrompt: (_p, vm) => { if ((vm as ControllerViewModel).saveUnavailable) flagged++; },
    });
    expect(store.writes).toBeGreaterThan(before);
    expect(flagged).toBeGreaterThan(0);
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
    expect(sv(h.ctrl).superseded).toBeUndefined();

    // Room again: the next write goes through and the flag clears (the listeners hear it).
    store.full = false;
    let heard = 0;
    const off = h.ctrl.subscribe(() => { if (!sv(h.ctrl).saveUnavailable) heard++; });
    await drive(h, { rand: mulberry32(45), stopAfterPrompts: 2, timeoutMs: 60_000 });
    off();
    expect(heard).toBeGreaterThan(0);
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();
    expect(readSave(store)!.steps.length).toBe(h.ctrl.stepActors().length);
  }, 120_000);

  it("is set at once when the new game's first write is refused, and cleared when a new game starts with room", async () => {
    const store = new RefusingStorage();
    store.full = true;
    const h = makeController({ storage: store, aiSalt: 5 });
    await h.ctrl.newGame({ side: "USSR", seed: 46 });
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
    expect(readSave(store)).toBeNull();
    store.full = false;
    await h.ctrl.newGame({ side: "US", seed: 47 });
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();
    expect(readSave(store)).not.toBeNull();
  }, 120_000);

  it("is never set on a superseded page, even when its own last write was refused", async () => {
    const shared = new RefusingStorage();
    const A = makeController({ storage: shared, aiSalt: 6 });
    await A.ctrl.newGame({ side: "US", seed: 48 });
    await drive(A, { rand: mulberry32(48), stopAfterPrompts: 3, timeoutMs: 60_000 });
    shared.full = true;
    await drive(A, { rand: mulberry32(49), stopAfterPrompts: 2, timeoutMs: 60_000 });
    expect(sv(A.ctrl).saveUnavailable).toBe(true);
    shared.full = false;

    // Another tab resumes the game (its write goes through): A is superseded and says nothing about saving.
    const B = makeController({ storage: new RefusingStorage(shared.map), aiSalt: 6 });
    await B.ctrl.boot();
    expect(await B.ctrl.resume()).toBe(true);
    await tick();
    expect(sv(A.ctrl).superseded).toBe(true);
    expect(sv(A.ctrl).saveUnavailable).toBeUndefined();
    expect(sv(B.ctrl).saveUnavailable).toBeUndefined();
  }, 120_000);

  it("is set after a resume whose claim is refused", async () => {
    const shared = new RefusingStorage();
    const A = makeController({ storage: shared, aiSalt: 7 });
    await A.ctrl.newGame({ side: "USSR", seed: 50 });
    await drive(A, { rand: mulberry32(50), stopAfterPrompts: 2, timeoutMs: 60_000 });
    A.ctrl.resign();
    // A finished game is not resumable: start one more and leave it unfinished.
    await A.ctrl.newGame({ side: "USSR", seed: 51 });
    await drive(A, { rand: mulberry32(51), stopAfterPrompts: 2, timeoutMs: 60_000 });

    const store = new RefusingStorage(shared.map);
    const B = makeController({ storage: store, aiSalt: 7 });
    await B.ctrl.boot();
    store.full = true;
    expect(await B.ctrl.resume()).toBe(true);
    expect(sv(B.ctrl).status).toBe("playing");
    expect(sv(B.ctrl).saveUnavailable).toBe(true);
  }, 120_000);
});

describe("browserStorage (D-203)", () => {
  // Node may define its own (experimental) localStorage on globalThis: each test replaces it, and it is put back after.
  const g = globalThis as { localStorage?: unknown };
  const original = Object.getOwnPropertyDescriptor(g, "localStorage");
  const use = (value: unknown) => Object.defineProperty(g, "localStorage", { configurable: true, writable: true, value });
  afterEach(() => {
    if (original) Object.defineProperty(g, "localStorage", original);
    else delete g.localStorage;
  });

  it("is null when the page's storage refuses writes (privacy mode, blocked), so the controller reports saveUnavailable", async () => {
    const refusing = new RefusingStorage();
    refusing.full = true;
    use(refusing);
    expect(browserStorage()).toBeNull();
    const h = makeController({ storage: browserStorage() as unknown as MemoryStorage, aiSalt: 8 });
    await h.ctrl.newGame({ side: "US", seed: 52 });
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
  }, 120_000);

  it("is null when reading localStorage throws (storage blocked by the browser)", () => {
    Object.defineProperty(g, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    expect(browserStorage()).toBeNull();
    use(undefined);
    expect(browserStorage()).toBeNull();
  });

  it("wraps a working localStorage, and the controller's refused write surfaces through it", async () => {
    const store = new RefusingStorage();
    use(store);
    const s = browserStorage();
    expect(s).not.toBeNull();
    const h = makeController({ storage: s as unknown as MemoryStorage, aiSalt: 9 });
    await h.ctrl.newGame({ side: "USSR", seed: 53 });
    expect(sv(h.ctrl).saveUnavailable).toBeUndefined();
    store.full = true;
    await drive(h, { rand: mulberry32(53), stopAfterPrompts: 2, timeoutMs: 60_000 });
    expect(sv(h.ctrl).saveUnavailable).toBe(true);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// D-202: the coup prompt's Ops, exact or a maximum
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("coup prompt Ops (D-202)", () => {
  /** A new game played at random until `side`'s first action-round card choice. */
  async function atFirstCardChoice(side: Side, seed: number): Promise<WasmEngine> {
    const E = await loadEngine();
    E.newGame(seed);
    E.seat(playerOf(side), E.currentRules);
    E.seat(-playerOf(side), 12);
    const rand = mulberry32(seed);
    for (let i = 0; i < 500; i++) {
      const d = E.display();
      if (d.current_phase_name === "ACTION_ROUND" && d.decision_context.decision_type === 1 && d.decision_context.resolving_card === 0
          && E.decisionPlayer() === playerOf(side)) return E;
      const m = E.mask(false);
      const legal = [...m.keys()].filter(k => m[k]);
      // No coups, no Events and no China Card on the way (the position stays the opening's).
      const calm = legal.filter(k => k !== E.layout.offsets.play_mode + E.layout.resolutions.OPS_COUP!
        && k !== E.layout.offsets.play_mode + E.layout.resolutions.EVENT! && k !== E.layout.offsets.card + 5);
      const pool = calm.length ? calm : legal;
      expect(E.step(E.decodeFlat(pool[Math.floor(rand() * pool.length)]!), 0)).toBeNull();
    }
    throw new Error("no card choice reached");
  }

  const promptOf = (E: WasmEngine, human: Side, mutate?: (raw: ReturnType<WasmEngine["display"]>) => void): Prompt => {
    const raw = E.display();
    mutate?.(raw);
    return buildPrompt({ raw, mask: E.mask(false), layout: E.layout, names: E, human, promptId: 1 });
  };

  /** Play `card` for a coup from the card choice; true at the coup-target decision (else the position is restored). */
  function toCoup(E: WasmEngine, human: Side, card: number): boolean {
    const snap = E.snapshot();
    if (E.step(E.decodeFlat(E.layout.offsets.card + card - 1), 0) === null) {
      const mode = promptOf(E, human).options.find(o => o.kind === "mode" && o.id === E.layout.resolutions.OPS_COUP);
      if (mode && E.step(E.decodeFlat(mode.idx), 0) === null && promptOf(E, human).kind === "coup-target") return true;
    }
    E.restore(snap);
    return false;
  }

  /** The Ops each coup target is credited with (the engine's own, CoupOdds.ops). */
  const opsByTarget = (E: WasmEngine, p: Prompt) =>
    p.countries.map(id => computeCoupOdds(E, id)!.ops!);

  it("states the exact Ops of a card without a regional bonus", async () => {
    const E = await atFirstCardChoice("USSR", 61);
    const hand = E.display().hands.USSR.filter(c => c !== 6 && E.cardOps(c) > 0);
    const card = hand.find(c => toCoup(E, "USSR", c));
    expect(card, "a card of the hand that coups").toBeDefined();
    const p = promptOf(E, "USSR");
    expect(p.title.key).toBe("prompt:title.coup");
    expect(p.detail?.key).toBe("prompt:detail.coup");
    const count = (p.title.params as { count: number }).count;
    expect(new Set(opsByTarget(E, p))).toEqual(new Set([count]));
  });

  it("states the China Card's Ops as a maximum (its +1 counts only in Asia)", async () => {
    const E = await atFirstCardChoice("USSR", 62);
    expect(toCoup(E, "USSR", 6)).toBe(true);
    const p = promptOf(E, "USSR");
    expect(p.title.key).toBe("prompt:title.coupUpTo");
    expect(p.detail?.key).toBe("prompt:detail.coupUpTo");
    const count = (p.title.params as { count: number }).count;
    const ops = opsByTarget(E, p);
    expect(Math.max(...ops)).toBe(count);
    expect(Math.min(...ops)).toBe(count - 1);
  });

  it("states the Ops as a maximum for the USSR under Vietnam Revolts, never for the US", async () => {
    const E = await atFirstCardChoice("USSR", 63);
    const hand = E.display().hands.USSR.filter(c => c !== 6 && E.cardOps(c) > 0);
    expect(hand.some(c => toCoup(E, "USSR", c))).toBe(true);
    const vietnam = (raw: { flags: string[] }) => { raw.flags = [...raw.flags, "VIETNAM_REVOLTS_ACTIVE"]; };
    expect(promptOf(E, "USSR", vietnam).title.key).toBe("prompt:title.coupUpTo");
    expect(promptOf(E, "USSR").title.key).toBe("prompt:title.coup");

    const U = await atFirstCardChoice("US", 64);
    const usHand = U.display().hands.US.filter(c => U.cardOps(c) > 0);
    expect(usHand.some(c => toCoup(U, "US", c))).toBe(true);
    expect(promptOf(U, "US", vietnam).title.key).toBe("prompt:title.coup");
  });
});
