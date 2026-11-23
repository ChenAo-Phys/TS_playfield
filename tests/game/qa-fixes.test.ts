/**
 * Regression tests for the QA round-1 findings fixed in src/game (docs/qa/TRIAGE.md, group F1): hidden information in
 * the coup odds (Q-001) and in the AI's timing (Q-004), one live copy of a game across tabs (Q-002), Defectors'
 * headline cancellation (Q-003), the log around game-ending steps (Q-007, Q-008), Latin American Debt Crisis' target
 * hint (Q-009), the AI's failed load stage (Q-010), an incompatible save (Q-014), and `endsPlay` before the Cuban
 * Missile Crisis cancel window (K-002). Real saves harvested by QA are in tests/fixtures/game/qa-saves.json.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AiMove, AiPlayer, Prompt, Side, ViewModel } from "../../src/game/contract";
import { type ControllerViewModel, TsGameController, ussrHeadlineCancelled } from "../../src/game/controller";
import { MemoryStorage, readSave, SAVE_KEY, writeSave, type SavedGame } from "../../src/game/persistence";
import { computeCoupOdds, coupRollModifier } from "../../src/game/previews";
import { SCORING_CARDS, isScoringCard, padsForcedAiDecision, playsLeft, trappedIn } from "../../src/game/rules";
import { message, renderEnglish, type Message } from "../../src/i18n";
import type { GameState } from "../../src/engine/types";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import { drive, loadEngine, makeController, mulberry32, StubAi, tick } from "./helpers";

const SAVES = JSON.parse(readFileSync(new URL("../fixtures/game/qa-saves.json", import.meta.url), "utf8")) as
  Record<string, { side: Side; turn: number; save: SavedGame }>;

/** Ack frames until a prompt shows (or the game ends). */
async function settle(ctrl: TsGameController, max = 5000): Promise<ViewModel> {
  for (let i = 0; i < max; i++) {
    const vm = ctrl.getSnapshot();
    if (vm.status === "error") throw new Error(vm.error);
    if (vm.frame) ctrl.ackFrame(vm.frame.seq);
    if (vm.prompt || vm.status === "over") return ctrl.getSnapshot();
    await tick();
  }
  throw new Error("no prompt came");
}

/** A controller resumed from a QA save, at the save's prompt. */
async function fromSave(key: string, engine: WasmEngine) {
  const h = makeController({ engine, ai: new StubAi(1), seed: 1 });
  await h.ctrl.boot();
  h.storage.setItem(SAVE_KEY, JSON.stringify({ ...SAVES[key]!.save, fingerprint: engine.fingerprint }));
  expect(await h.ctrl.resume()).toBe(true);
  const vm = await settle(h.ctrl);
  return { h, vm, prompt: vm.prompt! };
}

const text = (m: Message) => renderEnglish(m);
const lines = (e: { text: Message; details?: Message[] }) => [text(e.text), ...(e.details ?? []).map(text)];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-001: coup odds never tell the AI's hand
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("coup odds at the turn's last action (Q-001)", () => {
  it("never mark a die as ending the game by the held-scoring rule, whatever the AI holds", async () => {
    const engine = await loadEngine();
    // QA's node-probes game 8: the human US couped at T1 AR6 (Defectors, 2 Ops) while the USSR, with its last
    // action played, held Europe Scoring.
    const h = makeController({ engine, aiSalt: 1008, seed: 85 });
    await h.ctrl.newGame({ side: "US", seed: 5008 });
    const checked: string[] = [];
    await drive(h, { rand: mulberry32(9008), avoidWarned: 0.97, timeoutMs: 120_000, onPrompt: p => {
      const E = h.engine();
      const raw = E.display();
      if (p.kind !== "coup-target" || raw.turn > 9 || playsLeft(raw, "USSR") !== 0) return;
      const target = p.countries[0]!;
      const held = (raw.hands.USSR ?? []).filter(isScoringCard);
      const odds = h.ctrl.coupOdds(target)!;
      expect(odds.faces.some(f => f.endsGame), `T${raw.turn} AR${raw.action_round}: AI holds ${held}`).toBe(false);
      // The same with a scoring card swapped into the AI's hand (QA's debug edit, same hand size).
      const spare = SCORING_CARDS.find(c => ["DRAW_DECK", "DISCARD_PILE", "REMOVED_FROM_GAME"].includes(raw.card_locations[String(c)] ?? ""));
      const victim = (raw.hands.USSR ?? []).find(c => !isScoringCard(c));
      if (spare && victim && !(raw.hands.US ?? []).some(isScoringCard)) {
        const was = E.cardLocation(spare);
        const victimWas = E.cardLocation(victim);
        E.setCardLocation(victim, was);
        E.setCardLocation(spare, 4);
        const swapped = computeCoupOdds(E, target)!;
        E.setCardLocation(spare, was);
        E.setCardLocation(victim, victimWas);
        expect(swapped.faces.some(f => f.endsGame)).toBe(false);
      }
      checked.push(`T${raw.turn} AR${raw.action_round} held ${held.join(",") || "-"}`);
    } });
    expect(checked.length).toBeGreaterThan(0);
    expect(checked.join(" ")).toMatch(/held 2/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-004: forced AI answers out of its hand take a real decision's time
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("forced AI card choices from its hand (Q-004)", () => {
  it("tells them by the decision, not by the card", () => {
    const d = (over: Partial<GameState["decision_context"]>, extra: Partial<GameState> = {}) => ({
      current_phase_name: "ACTION_ROUND", flags: [], card_locations: { "53": "HAND_US_UNKNOWN", "88": "DISCARD_PILE", "5": "HAND_USSR_KNOWN" },
      decision_context: { decision_type: 1, resolving_card: 0, ...over }, ...extra,
    }) as unknown as GameState;
    const card = (id: number) => ({ decision_type: 1, primary_id: id });
    // Trapped (Quagmire): the escape from the hand, and a pass when no card qualifies.
    const trapped = d({}, { flags: ["QUAGMIRE_ACTIVE"] });
    expect(trappedIn(trapped, "US")).toBe(true);
    expect(padsForcedAiDecision(trapped, "US", card(53))).toBe(true);
    expect(padsForcedAiDecision(trapped, "US", card(0))).toBe(true);
    // UN Intervention's pairing: one card of its own hand.
    expect(padsForcedAiDecision(d({ resolving_card: 32 }), "US", card(53))).toBe(true);
    // Blockade, LADC, Missile Envy: always.
    expect(padsForcedAiDecision(d({ resolving_card: 10 }), "US", card(0))).toBe(true);
    // A public set: Star Wars / SALT from the discard pile, Aldrich Ames from the (shown) US hand.
    expect(padsForcedAiDecision(d({ resolving_card: 88 }), "US", card(88))).toBe(false);
    expect(padsForcedAiDecision(d({ resolving_card: 98 }), "US", card(5))).toBe(false);
    // Not a card choice, or not the trapped side.
    expect(padsForcedAiDecision(d({ decision_type: 5, resolving_card: 30 }), "US", { decision_type: 5, primary_id: 3 })).toBe(false);
    expect(padsForcedAiDecision(trapped, "USSR", card(0))).toBe(false);
  });

  it("pads the Quagmire escapes and the UN Intervention pairing QA's probe found instant (games 1 and 28)", async () => {
    const engine = await loadEngine();
    for (const g of [1, 28]) {
      const side: Side = g % 2 ? "USSR" : "US";
      const ai: Side = side === "US" ? "USSR" : "US";
      const sleeps: number[] = [];
      let ctrl!: TsGameController;
      const h = makeController({ engine, aiSalt: 1000 + g, seed: 77 + g, minAiDelayMs: 600,
        sleep: async () => { sleeps.push(ctrl.stepActors().length); } });
      ctrl = h.ctrl;
      const forced: Array<{ i: number; trapped: boolean; rc: number; legal: number }> = [];
      const c = ctrl as unknown as { applyStep: (a: unknown, auto: boolean, o?: { replay?: boolean }) => void };
      const orig = c.applyStep.bind(ctrl);
      c.applyStep = (a, auto, o) => {
        const E = ctrl.engineForDiagnostics!;
        const d = E.display();
        const m = E.mask(false);
        let legal = 0;
        for (let i = 0; i < m.length; i++) legal += m[i]!;
        const by = d.decision_context.decision_player;
        if (auto && by === ai && d.decision_context.decision_type === 1 && d.current_phase_name === "ACTION_ROUND") {
          const trapped = trappedIn(d, ai);
          if (trapped || d.decision_context.resolving_card === 32) forced.push({ i: ctrl.stepActors().length, trapped, rc: d.decision_context.resolving_card, legal });
        }
        orig(a, auto, o);
      };
      await ctrl.newGame({ side, seed: 5000 + g });
      await drive(h, { rand: mulberry32(9000 + g), avoidWarned: 0.97, timeoutMs: 120_000 });
      expect(forced.length, `game ${g}`).toBeGreaterThan(0);
      for (const f of forced) expect(sleeps, `game ${g} step ${f.i} (${f.trapped ? "trap" : `rc ${f.rc}`})`).toContain(f.i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-002: one live copy of a game across tabs
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("two tabs on one save (Q-002)", () => {
  const sv = (ctrl: TsGameController) => ctrl.getSnapshot() as ControllerViewModel;

  it("stops the older tab when another resumes it, and that tab never writes again", async () => {
    const shared = new MemoryStorage();
    const A = makeController({ storage: shared, aiSalt: 3 });
    await A.ctrl.newGame({ side: "USSR", seed: 21 });
    await drive(A, { rand: mulberry32(1), stopAfterPrompts: 12, timeoutMs: 60_000 });
    const before = readSave(shared)!;
    expect(sv(A.ctrl).superseded).toBeUndefined();
    const stale = A.ctrl.getSnapshot().prompt!;
    expect(stale).not.toBeNull();

    // Tab B: the same profile, its own page.
    const B = makeController({ storage: new MemoryStorage(shared.map), aiSalt: 3 });
    await B.ctrl.boot();
    expect(B.ctrl.getSnapshot().hasSavedGame).toBe(true);
    expect(await B.ctrl.resume()).toBe(true);
    const bSave = readSave(shared)!;
    expect(bSave.steps).toEqual(before.steps);
    expect(bSave.writer).not.toBe(before.writer);

    // A learned it at once: no prompt, no AI, no moves, no writes.
    const vmA = sv(A.ctrl);
    expect(vmA.superseded).toBe(true);
    expect(vmA.prompt).toBeNull();
    expect(vmA.aiThinking).toBe(false);
    A.ctrl.choose(stale.promptId, stale.options[0]!.idx);
    A.ctrl.undo();
    A.ctrl.resign();
    await tick();
    expect(readSave(shared)).toEqual(bSave);
    expect(A.ctrl.getSnapshot().status).toBe("playing");

    // B plays on and saves.
    await drive(B, { rand: mulberry32(2), stopAfterPrompts: 3, timeoutMs: 60_000 });
    expect(readSave(shared)!.steps.length).toBeGreaterThan(bSave.steps.length);
    expect(readSave(shared)!.writer).toBe(bSave.writer);
    expect(sv(B.ctrl).superseded).toBeUndefined();

    // A starts a new game: it takes the save over, and B stops.
    await A.ctrl.newGame({ side: "US", seed: 5 });
    expect(sv(A.ctrl).superseded).toBeUndefined();
    expect(sv(B.ctrl).superseded).toBe(true);
    expect(readSave(shared)!.humanSide).toBe("US");
  });

  it("checks before every move even without storage events (a frozen tab that missed them)", async () => {
    const map = new Map<string, string>();
    const quiet = (s: MemoryStorage) => ({ getItem: (k: string) => s.getItem(k), setItem: (k: string, v: string) => s.setItem(k, v), removeItem: (k: string) => s.removeItem(k) });
    const A = makeController({ storage: quiet(new MemoryStorage(map)) as unknown as MemoryStorage, aiSalt: 4 });
    await A.ctrl.newGame({ side: "US", seed: 9 });
    await drive(A, { rand: mulberry32(3), stopAfterPrompts: 2, timeoutMs: 60_000 });
    const p = A.ctrl.getSnapshot().prompt!;
    const B = makeController({ storage: quiet(new MemoryStorage(map)) as unknown as MemoryStorage, aiSalt: 4 });
    await B.ctrl.boot();
    expect(await B.ctrl.resume()).toBe(true);
    const bSave = map.get(SAVE_KEY);
    expect(sv(A.ctrl).superseded).toBeUndefined();
    A.ctrl.choose(p.promptId, p.options[0]!.idx);
    expect(sv(A.ctrl).superseded).toBe(true);
    expect(map.get(SAVE_KEY)).toBe(bSave);
  });

  it("refreshes the start screen's saved game when another tab writes it", async () => {
    const shared = new MemoryStorage();
    const menu = makeController({ storage: new MemoryStorage(shared.map) });
    await menu.ctrl.boot();
    expect(menu.ctrl.getSnapshot().hasSavedGame).toBe(false);
    const A = makeController({ storage: shared });
    await A.ctrl.newGame({ side: "USSR", seed: 12 });
    expect(menu.ctrl.getSnapshot()).toMatchObject({ hasSavedGame: true, savedGame: { humanSide: "USSR" } });
    expect(sv(menu.ctrl).superseded).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-014: a save of another engine build
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("a save of another engine build (Q-014)", () => {
  it("is reported once at boot and discarded", async () => {
    const h = makeController();
    await h.ctrl.newGame({ side: "US", seed: 40 });
    const save = readSave(h.storage)!;
    const storage = new MemoryStorage();
    writeSave(storage, { ...save, fingerprint: "an older build", savedAt: 1_700_000_000_000 });
    const h2 = makeController({ storage });
    await h2.ctrl.boot();
    const vm = h2.ctrl.getSnapshot() as ControllerViewModel;
    expect(vm.incompatibleSave).toEqual({ savedAt: 1_700_000_000_000, reason: "build" });
    expect(vm.hasSavedGame).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    await h2.ctrl.newGame({ side: "USSR", seed: 41 });
    expect((h2.ctrl.getSnapshot() as ControllerViewModel).incompatibleSave).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-003: Defectors cancels the USSR headline
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A stub AI that headlines `want` when it can. */
class HeadlineAi extends StubAi {
  constructor(private readonly want: number) { super(3); }
  override async choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }) {
    if (!this.engine) await this.init();
    const E = this.engine!;
    E.restore(req.state);
    const d = E.display();
    const idx = E.layout.offsets.card + this.want - 1;
    if (d.current_phase_name === "HEADLINE" && d.decision_context.resolving_card === 0 && E.mask(false)[idx]) return { idx, ms: 5 };
    return super.choose(req);
  }
}

describe("Defectors' headline cancellation (Q-003)", () => {
  it("as the US headline, against a USSR headline that resolves first: no card-played, a CANCELLED stage, a log line", async () => {
    const engine = await loadEngine();
    const h = makeController({ engine, ai: new HeadlineAi(17) as unknown as AiPlayer as StubAi, seed: 3 });
    await h.ctrl.boot();
    await h.ctrl.newGame({ side: "US", seed: 4242 });
    // Deal Defectors (#103) to the US and De Gaulle Leads France (#17, 3 Ops) to the USSR (debug moves).
    const d0 = engine.display();
    const code: Record<string, number> = { UNAVAILABLE: 0, DRAW_DECK: 1, HAND_US_UNKNOWN: 2, HAND_USSR_UNKNOWN: 4, DISCARD_PILE: 6 };
    const give = (card: number, hand: "HAND_US_UNKNOWN" | "HAND_USSR_UNKNOWN") => {
      const from = d0.card_locations[String(card)]!;
      if (from === hand) return;
      const victim = Object.entries(d0.card_locations).find(([id, l]) => l === hand && !isScoringCard(Number(id)) && ![6, 17, 103].includes(Number(id)))![0];
      engine.setCardLocation(Number(victim), code[from] ?? 1);
      engine.setCardLocation(card, code[hand]!);
    };
    give(103, "HAND_US_UNKNOWN");
    give(17, "HAND_USSR_UNKNOWN");
    const frames: ViewModel["frame"][] = [];
    h.ctrl.subscribe(() => { const f = h.ctrl.getSnapshot().frame; if (f && frames[frames.length - 1]?.seq !== f.seq) frames.push(f); });
    const rand = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const vm = await settle(h.ctrl);
      const p = vm.prompt!;
      if (engine.display().current_phase_name === "ACTION_ROUND") break;
      const o = p.kind === "headline" ? p.options.find(x => x.id === 103)! : p.options[Math.floor(rand() * p.options.length)]!;
      h.ctrl.choose(p.promptId, o.idx);
    }
    const all = frames.flatMap(f => f!.events);
    expect(all).toContainEqual({ t: "headline-reveal", us: 103, ussr: 17, first: "USSR" });
    expect(all.some(e => e.t === "card-played" && e.card === 17)).toBe(false);
    expect(all).toContainEqual({ t: "card-played", side: "US", card: 103, how: "headline" });
    // The stage's rule (src/ui/stage/model.ts cancelledHeadline): left for the discard pile, unplayed, in one frame.
    const cancelFrame = frames.find(f => f!.events.some(e => e.t === "card-moved" && e.card === 17 && e.to === "DISCARD_PILE"))!;
    expect(cancelFrame.events.some(e => e.t === "card-played" && e.card === 17)).toBe(false);
    const entry = h.ctrl.getSnapshot().log.find(e => e.kind === "headline" && e.side === "USSR")!;
    expect(lines(entry)).toContain("USSR headline De Gaulle Leads France (#17) is cancelled by Defectors: discarded without its Event");
  });

  it("fired by Five Year Plan's random discard: the log says so, and the driver's headline checks pass (QA game 107)", async () => {
    const engine = await loadEngine();
    const g = 107;
    const h = makeController({ engine, ai: new StubAi(g * 7919 + 5), seed: g + 33 });
    await h.ctrl.boot();
    await h.ctrl.newGame({ side: "US", seed: 500_000 + g });
    const rec = await drive(h, { rand: mulberry32(g * 131 + 7), avoidWarned: 0.97, undoRate: 0 });
    expect(rec.problems).toEqual([]);
    expect(rec.checks.cancelledHeadlines).toBeGreaterThanOrEqual(1);
    const entry = h.ctrl.getSnapshot().log.find(e => e.turn === 2 && e.kind === "headline" && e.side === "USSR")!;
    const ls = lines(entry);
    const fired = ls.findIndex(l => /discards Defectors \(#103\) at random \(Five Year Plan\)/.test(l));
    const cancelled = ls.indexOf("USSR headline Indo-Pakistani War (#24) is cancelled by Defectors: discarded without its Event");
    expect(fired).toBeGreaterThan(0);
    expect(cancelled).toBe(fired + 1);
  });

  it("is read from the engine's headline slots", () => {
    const s = (stage: number, first: number, second: number) => ({ headline_stage: stage, headline_first_card: first, headline_second_card: second }) as GameState;
    expect(ussrHeadlineCancelled(s(0, 0, 0), 103, 17)).toBe(false);
    expect(ussrHeadlineCancelled(s(1, 17, 103), 103, 17)).toBe(true); // Defectors headlined, USSR first
    expect(ussrHeadlineCancelled(s(3, 5, 0), 5, 24)).toBe(true); // second slot cleared by Defectors' Event
    expect(ussrHeadlineCancelled(s(3, 5, 24), 5, 24)).toBe(false); // resolved
    expect(ussrHeadlineCancelled(s(3, 24, 5), 5, 24)).toBe(false); // USSR first, resolved before Defectors fired
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-007, Q-008: the log around game-ending steps
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the log of game-ending steps (Q-007, Q-008)", () => {
  it("final scoring after the Bear Has Landed discard: an End of turn 10 entry with the turn's end and a final-scoring line", async () => {
    const engine = await loadEngine();
    for (const pick of ["discard", "keep"] as const) {
      const { h, prompt } = await fromSave("t10EagleBearUSSR", engine);
      expect(prompt).toMatchObject({ kind: "event-card", resolvingCard: 250 });
      const o = pick === "keep" ? prompt.done! : prompt.options.find(x => x.kind === "card")!;
      h.ctrl.choose(prompt.promptId, o.idx);
      const vm = await settle(h.ctrl);
      expect(vm.ending).toMatchObject({ reason: "final-scoring", turn: 10 });
      const log = vm.log;
      const n = log.length;
      expect(log[n - 1]!.text.key).toBe("prompt:log.gameOver");
      const turnEnd = log[n - 2]!;
      expect(turnEnd).toMatchObject({ kind: "turn", turn: 10, side: null });
      expect(text(turnEnd.text)).toBe("End of turn 10");
      const ls = lines(turnEnd);
      // The mil-ops penalty (told when the discard opened) and the scoring, each with its own VP change.
      expect(ls).toContain("Victory Points: -19 (USSR) -> -17 (USSR) (+2 VP)");
      expect(ls[ls.length - 1]).toBe("Final scoring: Victory Points -17 (USSR) -> -17 (USSR) (0 VP)");
      // The discard's own entry says only the discard.
      const discard = log[n - 3]!;
      expect(discard).toMatchObject({ kind: "event", side: "USSR", turn: 10 });
      expect(discard.details ?? []).toEqual([]);
      expect(text(log[n - 1]!.text)).toBe("Game over: the USSR wins — Final scoring. VP -17 (USSR), turn 10.");
    }
  });

  it("a turn's end paused at the Eagle / Bear discard: its own frame, one End of turn entry after the discard", async () => {
    const engine = await loadEngine();
    const { h, prompt } = await fromSave("t10EagleBearUSSR", engine);
    // The step before the prompt opened the discard: a system frame carried the mil-ops penalty.
    expect(prompt.resolvingCard).toBe(250);
    const frame = h.ctrl.getSnapshot().frame!;
    expect(frame.state.mil_ops).toEqual({ US: 0, USSR: 0 });
    const turnEntries = h.ctrl.getSnapshot().log.filter(e => e.kind === "turn" && e.turn === 10);
    expect(turnEntries).toEqual([]);
  });

  it("a coup during the Cuban Missile Crisis ends the game in its action round: no End of turn entry", async () => {
    const engine = await loadEngine();
    const { h, prompt } = await fromSave("cmcSuicideUSSR", engine);
    const o = prompt.options.find(x => (x.warnings ?? []).some(w => w.code === "cmc-suicide"))!;
    h.ctrl.choose(prompt.promptId, o.idx);
    const vm = await settle(h.ctrl);
    expect(vm.ending).toMatchObject({ reason: "cmc-suicide", winner: "US", turn: 6 });
    const n = vm.log.length;
    expect(vm.log.some(e => e.kind === "turn" && e.turn === 6)).toBe(false);
    const coup = vm.log[n - 2]!;
    expect(coup).toMatchObject({ side: "USSR", turn: 6, ar: 4 });
    expect(lines(coup)).toContain("Victory Points: -7 (USSR) -> +20 (US) (+27 VP)");
    expect(text(vm.log[n - 1]!.text)).toBe("Game over: the US wins — Coup during the Cuban Missile Crisis. VP +20 (US), turn 6.");
  });

  it("names the winner as the winner and gives the VP with its side; a draw says so", async () => {
    const h = makeController();
    await h.ctrl.newGame({ side: "US", seed: 33 });
    await settle(h.ctrl);
    h.ctrl.resign();
    const last = h.ctrl.getSnapshot().log.at(-1)!;
    expect(last.text.key).toBe("prompt:log.gameOver");
    expect(text(last.text)).toMatch(/^Game over: the USSR wins — Resignation\. VP (0 \(Tie\)|[+-]\d+ \((US|USSR)\)), turn 1\.$/);
    const draw = message("prompt:log.gameOverDraw", { reason: message("prompt:ending.held-scoring-both"), vp: message("log:vpScore.tie"), turn: 4 });
    expect(text(draw)).toBe("Game over: a draw — Both sides held a scoring card at the end of the turn. VP 0 (Tie), turn 4.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-009: LADC's target step
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("Latin American Debt Crisis' target step (Q-009)", () => {
  it("has its own hint for the USSR's choice, not the US's decline", async () => {
    const engine = await loadEngine();
    const { prompt } = await fromSave("ladcTarget_48", engine);
    expect(prompt).toMatchObject({ kind: "event-target", resolvingCard: 95 });
    expect(prompt.detail!.key).toBe("prompt:card.95.detailTarget");
    expect(text(prompt.detail!)).toBe("Pick up to 2 South American countries, one per click: your influence in each doubles.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-010: which stage of the AI's load failed
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the AI's load failing (Q-010)", () => {
  it("reports the model download before it starts, and keeps the failed stage in vm.load", async () => {
    for (const stage of ["model-download", "ai-worker", undefined] as const) {
      const ai = new StubAi();
      const seen: Array<ViewModel["load"]> = [];
      ai.init = async () => {
        await tick();
        throw Object.assign(new Error("blocked"), stage ? { stage } : {});
      };
      const h = makeController({ ai });
      h.ctrl.subscribe(() => seen.push(h.ctrl.getSnapshot().load));
      await h.ctrl.boot();
      for (let i = 0; i < 50 && h.ctrl.getSnapshot().status !== "error"; i++) await tick();
      const vm = h.ctrl.getSnapshot();
      expect(vm.status).toBe("error");
      expect(seen).toContainEqual({ stage: "model-download", fraction: 0 });
      expect(vm.load).toEqual(stage ? { stage, fraction: null } : undefined);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// K-002: endsPlay before the Cuban Missile Crisis cancel window
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("endsPlay before the Cuban Missile Crisis cancel window (K-002)", () => {
  it("is false on the second headline's last point when the human's cancel window opens next (seeds 72, 126)", async () => {
    const engine = await loadEngine();
    for (const id of [72, 126]) {
      const h = makeController({ engine, ai: new StubAi(id), seed: id });
      await h.ctrl.boot();
      await h.ctrl.newGame({ side: "USSR", seed: 500 + id });
      let last: { p: Prompt; endsPlay: boolean | undefined; steps: number } | null = null;
      const choose = h.ctrl.choose.bind(h.ctrl);
      h.ctrl.choose = (pid: number, idx: number) => {
        const p = h.ctrl.getSnapshot().prompt!;
        last = { p, endsPlay: p.options.find(o => o.idx === idx)!.endsPlay, steps: h.ctrl.stepActors().length };
        choose(pid, idx);
      };
      let windows = 0;
      const rec = await drive(h, { rand: mulberry32(id), avoidWarned: 0.97, undoRate: 0, onPrompt: (p, vm) => {
        const prev = last as { p: Prompt; endsPlay: boolean | undefined; steps: number } | null;
        if (p.kind !== "event-target" || p.resolvingCard !== 40 || !prev) return;
        const since = h.ctrl.stepActors().slice(prev.steps);
        if (since.length !== 1 || prev.p.kind !== "event-target") return;
        windows++;
        expect(prev.endsPlay, `seed ${id}: the last point of card ${prev.p.resolvingCard}`).toBe(false);
        expect(vm.canUndo).toBe(true);
      } });
      expect(windows, `seed ${id}`).toBe(1);
      expect(rec.problems).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-038: the coup odds name the Ops and the roll modifier the engine uses
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("coup odds carry the coup's Ops and roll modifier (Q-038)", () => {
  it("die + Ops + modifier − 2 × stability decides every face, and the modifier is the public effects'", async () => {
    const engine = await loadEngine();
    let checked = 0, china = 0, modified = 0;
    // Seeds 4 and 17 play coups under SALT / Death Squads (a found case each).
    for (const [seed, side] of [[4, "US"], [17, "USSR"], [13, "USSR"]] as const) {
      const h = makeController({ engine, aiSalt: 3800 + seed, seed: 38 + seed });
      await h.ctrl.newGame({ side, seed: 6000 + seed });
      await drive(h, { rand: mulberry32(7000 + seed), avoidWarned: 0.99, timeoutMs: 120_000, onPrompt: p => {
        if (p.kind !== "coup-target") return;
        const E = h.engine();
        const raw = E.display();
        for (const c of p.countries.slice(0, 3)) {
          const odds = h.ctrl.coupOdds(c)!;
          expect(typeof odds.ops).toBe("number");
          expect(typeof odds.modifier).toBe("number");
          const node = Object.values(raw.countries).find(n => n.id === c)!;
          expect(odds.modifier).toBe(coupRollModifier(raw.flags, node.region, side));
          for (const f of odds.faces) expect(f.success, `T${raw.turn} coup in ${c}`).toBe(f.die + odds.ops! + odds.modifier! - 2 * node.stability > 0);
          expect(odds.ops!).toBeGreaterThanOrEqual(1);
          expect(odds.ops!).toBeLessThanOrEqual(5);
          if (raw.decision_context.resolving_card === 6) {
            china++;
            // The China Card: 4 Ops, +1 only in Asia (region 1).
            expect(odds.ops).toBe(node.region === 1 ? 5 : 4);
          }
          if (odds.modifier) modified++;
          checked++;
        }
      } });
    }
    expect(checked).toBeGreaterThan(10);
    expect(modified).toBeGreaterThan(0);
    void china;
  }, 300_000);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-025 (F1 part): How I Learned's detail says who DEFCON 1 would make lose
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("How I Learned's DEFCON detail (Q-025)", () => {
  it("says you would win when the card is played in the AI's round", async () => {
    const engine = await loadEngine();
    const { h, prompt } = await fromSave("defcon1WinHilswUS", engine);
    expect(prompt.kind).toBe("defcon-level");
    expect(h.engine().display().phasing_player).toBe("USSR");
    expect(text(prompt.detail!)).toBe("DEFCON 1 ends the game, and you would win: the phasing player loses.");
    // The engine agrees: the DEFCON 1 option's own warning names the human as the winner.
    const one = prompt.options.find(o => o.warnings?.some(w => w.code === "game-ending"));
    expect(one?.warnings?.find(w => w.code === "game-ending")?.params?.winner).toBe("US");
  });
});
