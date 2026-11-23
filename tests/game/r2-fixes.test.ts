/**
 * Regression tests for the QA round-2 findings fixed in src/game (docs/qa/r2-TRIAGE.md, group F1): the military
 * operations a coup credits (R-002) and one live copy of a game after a refused save write (R-003).
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Side } from "../../src/game/contract";
import { computeCoupOdds, coupEarnsMilOps } from "../../src/game/previews";
import { classifyPrompt, EVENT_COUP_CARDS } from "../../src/game/prompt";
import { COUNTRIES } from "../../src/data/countries";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import { type ControllerViewModel, TsGameController } from "../../src/game/controller";
import { MemoryStorage, readSave } from "../../src/game/persistence";
import { drive, loadEngine, makeController, mulberry32, tick } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// R-002: the military operations a coup credits
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("coup odds' military operations (R-002)", () => {
  let E: WasmEngine;
  beforeAll(async () => { E = await loadEngine(); });

  const player = (side: Side) => (side === "US" ? 1 : -1);
  const legal = () => { const m = E.mask(false); const out: number[] = []; for (let i = 0; i < m.length; i++) if (m[i]) out.push(i); return out; };
  const step = (idx: number, die = 0) => { const why = E.step(E.decodeFlat(idx), die); if (why) throw new Error(why); };

  /** A fresh game walked (no coups, no Events, the China Card kept) to `side`'s first action-round card choice. */
  function toActionCard(seed: number, side: Side): boolean {
    const L = E.layout;
    const rand = mulberry32(seed);
    E.newGame(seed);
    E.seat(-player(side), 12);
    E.seat(player(side), E.currentRules);
    for (let n = 0; n < 400 && !E.isTerminal(); n++) {
      const d = E.display(), c = d.decision_context;
      if (d.current_phase_name === "ACTION_ROUND" && c.decision_type === L.decision_types.SELECT_CARD && c.resolving_card === 0
        && E.decisionPlayer() === player(side)) return true;
      let l = legal();
      const calm = l.filter(i => i !== L.offsets.play_mode + L.resolutions.OPS_COUP && i !== L.offsets.play_mode + L.resolutions.EVENT
        && i !== L.offsets.card + 5);
      if (calm.length) l = calm;
      step(l[Math.floor(rand() * l.length)]!);
    }
    return false;
  }

  /** Answer the human's prompts (placements first-legal, Tear Down's op mode: Coup) up to a coup's target decision. */
  function toCoupTarget(side: Side): { kind: string; targets: number[] } | null {
    const L = E.layout;
    for (let k = 0; k < 8 && !E.isTerminal() && E.decisionPlayer() === player(side); k++) {
      const d = E.display(), c = d.decision_context;
      const kind = classifyPrompt(d, L);
      if (c.decision_type === L.decision_types.POINT_NODE
        && (kind === "coup-target" || (kind === "event-target" && EVENT_COUP_CARDS.has(c.resolving_card)))) {
        const targets = legal().filter(i => i >= L.offsets.node && i < L.offsets.node + 84).map(i => i - L.offsets.node);
        return { kind, targets };
      }
      if (c.decision_type === L.decision_types.SELECT_OP_MODE) {
        const coup = L.offsets.op_mode + L.op_modes.COUP;
        if (!E.mask(false)[coup]) return null;
        step(coup);
        continue;
      }
      const l = legal().filter(i => i !== L.confirm_done_index);
      if (!l.length) return null;
      step(l[0]!);
    }
    return null;
  }

  interface Case { name: string; side: Side; card: number; mode: "EVENT" | "OPS_COUP"; setup?: () => void;
    /** Pick the target among the legal ones. */ pick?: (targets: number[]) => number | undefined }
  /** The case's coup decision: the odds there, and the military operations a real coup step credits. */
  function run(c: Case) {
    const L = E.layout;
    for (let s = 0; s < 8; s++) {
      if (!toActionCard(4000 + s, c.side)) continue;
      if (c.card !== 6) E.setCardLocation(c.card, c.side === "US" ? 2 : 4);
      c.setup?.();
      if (!E.mask(false)[L.offsets.card + c.card - 1]) continue;
      step(L.offsets.card + c.card - 1);
      const mode = L.offsets.play_mode + L.resolutions[c.mode];
      if (!E.mask(false)[mode]) continue;
      step(mode);
      const at = toCoupTarget(c.side);
      if (!at) continue;
      const target = (c.pick ?? (t => t[0]))(at.targets);
      if (target === undefined) continue;
      const odds = computeCoupOdds(E, target);
      const before = E.display();
      const snap = E.snapshot();
      step(L.offsets.node + target, 3);
      const after = E.display();
      E.restore(snap);
      // Same turn (no turn end wiped the track) and below the cap: the real step's change is the credit.
      const credited = after.turn === before.turn ? after.mil_ops[c.side] - before.mil_ops[c.side] : null;
      return { kind: at.kind, target, odds, credited, cap: before.mil_ops[c.side] >= 5 };
    }
    throw new Error(`${c.name}: no coup decision reached`);
  }

  const outside = (region: number) => (t: number[]) => t.find(id => COUNTRIES[id]!.region !== region);
  const cases: (Case & { expected: (ops: number) => number })[] = [
    { name: "Junta's free coup (USSR)", side: "USSR", card: 47, mode: "EVENT", expected: () => 0 },
    {
      name: "Junta's free coup (US)", side: "US", card: 47, mode: "EVENT", expected: () => 0,
      // USSR Influence in Latin America for the US to coup.
      setup: () => { for (const name of ["Honduras", "Bolivia"]) E.setCountry(COUNTRIES.find(c => c.engineName === name)!.id, 0, 2); },
    },
    { name: "Tear Down This Wall's free coup", side: "US", card: 96, mode: "EVENT", expected: () => 0 },
    { name: "Junta played for Ops", side: "USSR", card: 47, mode: "OPS_COUP", expected: ops => ops },
    { name: "an ordinary coup (Fidel, US)", side: "US", card: 8, mode: "OPS_COUP", expected: ops => ops },
    { name: "the China Card outside Asia", side: "USSR", card: 6, mode: "OPS_COUP", pick: outside(1), expected: ops => ops },
    {
      name: "Che's coup", side: "USSR", card: 107, mode: "EVENT", expected: ops => ops,
      // Two non-battleground African countries with US Influence to coup.
      setup: () => { for (const c of COUNTRIES.filter(c => c.region === 3 && !c.battleground).slice(0, 2)) E.setCountry(c.id, 2, 0); },
    },
    {
      name: "Ortega's free coup", side: "USSR", card: 91, mode: "EVENT", expected: () => 0,
      // US Influence next to Nicaragua (Honduras, Costa Rica) for the coup.
      setup: () => { for (const name of ["Honduras", "Costa Rica"]) E.setCountry(COUNTRIES.find(c => c.engineName === name)!.id, 2, 0); },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: milOps is what the engine credits`, () => {
      const r = run(c);
      expect(r.odds, c.name).not.toBeNull();
      const ops = r.odds!.ops!;
      expect(ops).toBeGreaterThan(0);
      expect(r.odds!.milOps, c.name).toBe(c.expected(ops));
      expect(r.cap).toBe(false);
      expect(r.credited, `${c.name}: the real coup step`).toBe(r.odds!.milOps);
      if (c.card === 107 || c.card === 91) expect(r.kind).toBe("event-target");
      if (c.card === 6) expect(ops).toBe(4);
    });
  }

  it("reads the rule, not the track: a side at 5 military operations is still shown the coup's credit", () => {
    const run5 = (c: Case) => {
      const L = E.layout;
      for (let s = 0; s < 8; s++) {
        if (!toActionCard(4000 + s, c.side)) continue;
        E.setCardLocation(c.card, c.side === "US" ? 2 : 4);
        // The track at its cap, through a save edit (the engine has no debug setter for it).
        const save = JSON.parse(E.saveJson()) as Record<string, unknown>;
        save[c.side === "US" ? "us_mil_ops" : "ussr_mil_ops"] = 5;
        E.loadSaveJson(JSON.stringify(save));
        step(L.offsets.card + c.card - 1);
        step(L.offsets.play_mode + L.resolutions[c.mode]);
        const at = toCoupTarget(c.side);
        if (!at) continue;
        expect(E.display().mil_ops[c.side]).toBe(5);
        return computeCoupOdds(E, at.targets[0]!)!;
      }
      throw new Error("no coup decision reached");
    };
    const plain = run5({ name: "", side: "USSR", card: 47, mode: "OPS_COUP" });
    expect(plain.milOps).toBe(plain.ops);
    expect(run5({ name: "", side: "USSR", card: 47, mode: "EVENT" }).milOps).toBe(0);
  });

  it("is unknown (null) away from a decision frame the save names", () => {
    const fake = { saveJson: () => "{}" } as unknown as WasmEngine;
    expect(coupEarnsMilOps(fake)).toBeNull();
    const broken = { saveJson: () => "not json" } as unknown as WasmEngine;
    expect(coupEarnsMilOps(broken)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// R-003: one live copy of a game after a refused save write
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A shared storage that refuses writes while `full` (QuotaExceededError). */
class QuotaStorage extends MemoryStorage {
  full = false;
  override setItem(key: string, value: string): void {
    if (this.full) {
      const e = new Error("The quota has been exceeded.");
      e.name = "QuotaExceededError";
      throw e;
    }
    super.setItem(key, value);
  }
}

describe("two tabs after a refused save write (R-003)", () => {
  const sv = (ctrl: TsGameController) => ctrl.getSnapshot() as ControllerViewModel;
  const writerOf = (ctrl: TsGameController) => (ctrl as unknown as { writer: string }).writer;

  for (const seed of [6, 9]) {
    it(`stops the tab whose writes were refused once another tab resumes the game (seed ${seed})`, async () => {
      // r2-review's quota.mjs: tab A plays, storage fills, A plays on (its writes refused), storage frees, tab B resumes.
      const shared = new QuotaStorage();
      const A = makeController({ storage: shared, aiSalt: 2 });
      await A.ctrl.newGame({ side: seed % 2 ? "US" : "USSR", seed });
      await drive(A, { rand: mulberry32(2), stopAfterPrompts: 8, timeoutMs: 60_000 });
      shared.full = true;
      await drive(A, { rand: mulberry32(3), stopAfterPrompts: 4, timeoutMs: 60_000 });
      const stored = readSave(shared)!;
      expect(stored.writer).toBe(writerOf(A.ctrl));
      expect(A.ctrl.stepActors().length).toBeGreaterThan(stored.steps.length); // A is ahead of its last good save
      expect(sv(A.ctrl).superseded).toBeUndefined(); // its own older save: no takeover
      shared.full = false;

      const B = makeController({ storage: new QuotaStorage(shared.map), aiSalt: 2 });
      await B.ctrl.boot();
      expect(await B.ctrl.resume()).toBe(true);
      await tick();
      const bSave = readSave(shared)!;
      expect(bSave.writer).toBe(writerOf(B.ctrl));
      expect(bSave.steps).toEqual(stored.steps);

      // A stopped: no prompt, and its old prompt takes no move and writes nothing.
      const vmA = sv(A.ctrl);
      expect(vmA.superseded).toBe(true);
      expect(vmA.prompt).toBeNull();
      const aSteps = A.ctrl.stepActors().length;
      const p = A.ctrl.getSnapshot().prompt;
      if (p) A.ctrl.choose(p.promptId, p.options[0]!.idx);
      for (let k = 0; k < 50; k++) await tick();
      expect(A.ctrl.stepActors().length).toBe(aSteps);
      expect(readSave(shared)).toEqual(bSave);

      // B's resumed game goes on and stays live.
      await drive(B, { rand: mulberry32(4), stopAfterPrompts: 2, timeoutMs: 60_000 });
      expect(sv(B.ctrl).superseded).toBeUndefined();
      expect(readSave(shared)!.writer).toBe(writerOf(B.ctrl));
      expect(readSave(shared)!.steps.length).toBeGreaterThan(bSave.steps.length);
    }, 120_000);
  }

  it("a game whose first write was refused does not take another tab's older save as a takeover", async () => {
    const shared = new QuotaStorage();
    const old = makeController({ storage: shared, aiSalt: 5 });
    await old.ctrl.newGame({ side: "US", seed: 31 });
    const oldSave = readSave(shared)!;
    // Another tab starts a game while storage is full: its claim is refused, the old tab's save stays.
    const store = new QuotaStorage(shared.map);
    store.full = true;
    shared.full = true;
    const A = makeController({ storage: store, aiSalt: 5 });
    await A.ctrl.newGame({ side: "USSR", seed: 32 });
    await drive(A, { rand: mulberry32(5), stopAfterPrompts: 3, timeoutMs: 60_000 });
    expect(readSave(shared)).toEqual(oldSave);
    expect(sv(A.ctrl).superseded).toBeUndefined();
    // Room again: A's next write claims the save; the old tab (whose game A replaced) stops.
    store.full = false;
    shared.full = false;
    await drive(A, { rand: mulberry32(6), stopAfterPrompts: 2, timeoutMs: 60_000 });
    expect(readSave(shared)!.writer).toBe(writerOf(A.ctrl));
    expect(sv(A.ctrl).superseded).toBeUndefined();
    expect(sv(old.ctrl).superseded).toBe(true);
  }, 120_000);
});
