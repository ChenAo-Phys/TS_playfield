/**
 * Prompts at positions random play rarely reaches, set up with the engine's debug setters: Grain
 * Sales with UN Intervention, Tear Down This Wall's and Junta's declinable free coup, and the
 * DEFCON-suicide coup warning.
 */
import { describe, expect, it } from "vitest";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import type { Prompt, Side } from "../../src/game/contract";
import { describeAction } from "../../src/game/describe";
import { vpSource } from "../../src/game/events";
import { doneLabel } from "../../src/game/messages";
import { attachWarnings, computeCoupOdds, computeRealignOdds } from "../../src/game/previews";
import { buildPrompt } from "../../src/game/prompt";
import { playerOf } from "../../src/game/rules";
import { redactState } from "../../src/game/view";
import { loadEngine, mulberry32 } from "./helpers";

const HAND = { US: 2, USSR: 4 } as const;
const DISCARD = 6;

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
    const legal = [...m.keys()].filter(i => m[i]);
    expect(E.step(E.decodeFlat(legal[Math.floor(rand() * legal.length)]), 0)).toBeNull();
  }
  throw new Error("no card choice reached");
}

function prompt(E: WasmEngine, human: Side) {
  const raw = E.display();
  const p = buildPrompt({ raw, mask: E.mask(false), layout: E.layout, names: E, human, promptId: 1 });
  attachWarnings(E, p, raw, human);
  return p;
}

function give(E: WasmEngine, side: Side, ...cards: number[]) {
  for (const c of cards) expect(E.setCardLocation(c, HAND[side])).toBeNull();
}

function emptyHand(E: WasmEngine, side: Side) {
  for (const c of E.display().hands[side]) E.setCardLocation(c, DISCARD);
}

describe("done labels (ui-spec 8.4)", () => {
  const base = { promptId: 1, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 0, maxPerCountry: 0,
    options: [], cards: [], countries: [], title: { key: "prompt:title.headline" } } as unknown as Prompt;
  const done = { idx: 208, kind: "done", id: 0 } as const;
  const label = (p: Partial<Prompt>) => doneLabel({ ...base, done, ...p } as Prompt)?.key;
  it("uses the context's words, else the meaning's", () => {
    expect(doneLabel(base)).toBeNull();
    expect(label({ kind: "action-card", doneMeaning: "pass", title: { key: "prompt:title.actionCardAr8" }, cards: [6, 12] })).toBe("prompt:doneFor.ar8");
    expect(label({ kind: "action-card", doneMeaning: "pass", title: { key: "prompt:title.actionCard", params: { ar: 3 } }, cards: [6] })).toBe("prompt:doneFor.keepChina");
    expect(label({ kind: "action-card", doneMeaning: "pass", title: { key: "prompt:title.actionCard", params: { ar: 3 } }, cards: [] })).toBe("prompt:done.pass");
    expect(label({ kind: "event-card", doneMeaning: "pass", resolvingCard: 250 })).toBe("prompt:doneFor.keepHand");
    expect(label({ kind: "realign-target", doneMeaning: "stop" })).toBe("prompt:doneFor.stopRealign");
    expect(label({ kind: "influence", doneMeaning: "stop" })).toBe("prompt:done.stop");
    expect(label({ kind: "event-target", doneMeaning: "decline", resolvingCard: 40 })).toBe("prompt:doneFor.keepCrisis");
    expect(label({ kind: "event-card", doneMeaning: "decline", resolvingCard: 10 })).toBe("prompt:doneFor.blockade");
    expect(label({ kind: "event-card", doneMeaning: "decline", resolvingCard: 95 })).toBe("prompt:doneFor.ladc");
    expect(label({ kind: "op-mode", doneMeaning: "decline", pendingCard: 47 })).toBe("prompt:doneFor.freeOps");
    expect(label({ kind: "op-mode", doneMeaning: "decline", pendingCard: 96 })).toBe("prompt:doneFor.freeOps");
    expect(label({ kind: "op-mode", doneMeaning: "decline", pendingCard: 26 })).toBe("prompt:done.decline");
    expect(label({ kind: "play-mode", doneMeaning: "return", resolvingCard: 67 })).toBe("prompt:doneFor.grainSales");
    expect(label({ kind: "event-card", doneMeaning: "return", resolvingCard: 108 })).toBe("prompt:doneFor.tehran");
    expect(label({ kind: "event-card", doneMeaning: "skip", resolvingCard: 43 })).toBe("prompt:doneFor.takeNoCard");
    expect(label({ kind: "event-card", doneMeaning: "skip", resolvingCard: 85 })).toBe("prompt:doneFor.takeNoCard");
    expect(label({ kind: "event-target", doneMeaning: "skip", resolvingCard: 91 })).toBe("prompt:done.skip");
    expect(doneLabel({ ...base, done, kind: "event-card", doneMeaning: "decline", resolvingCard: 10 } as Prompt)?.params)
      .toEqual({ country: { country: 7, name: "West Germany" } });
  });
});

describe("vp sources", () => {
  it("name the Event that moved the VP most, and its war's country", () => {
    expect(vpSource([], [])).toBeUndefined();
    expect(vpSource([{ card_id: 0, vp_delta: 2, defcon_delta: 0 }], [])).toBeUndefined();
    expect(vpSource([{ card_id: 2, vp_delta: -3, defcon_delta: 0 }], [])).toEqual({ card: 2 });
    expect(vpSource([{ card_id: 11, vp_delta: 1, defcon_delta: 0 }, { card_id: 13, vp_delta: -2, defcon_delta: 0 }],
      [{ type: "WAR_EVENT", card_id: 13, country_id: 23 }])).toEqual({ card: 13, country: 23 });
    expect(vpSource([{ card_id: 13, vp_delta: -2, defcon_delta: 0 }], [{ type: "WAR_EVENT", card_id: 13, country_id: 255 }])).toEqual({ card: 13 });
  });
});

describe("special prompts", () => {
  it("Grain Sales offers play / return / UN Intervention on the drawn card", async () => {
    const E = await atFirstCardChoice("US", 11);
    give(E, "US", 67, 32);
    emptyHand(E, "USSR");
    give(E, "USSR", 7); // Socialist Governments: a USSR card
    expect(E.step(E.decodeFlat(66), 0)).toBeNull(); // select Grain Sales
    expect(prompt(E, "US").kind).toBe("play-mode");
    expect(E.step(E.decodeFlat(110), 0)).toBeNull(); // its Event: draws Socialist Governments
    const p = prompt(E, "US");
    expect(p).toMatchObject({ kind: "play-mode", resolvingCard: 67, pendingCard: 7, doneMeaning: "return" });
    expect(p.title.key).toBe("prompt:card.67.playMode");
    expect(p.detail?.key).toBe("prompt:card.67.detailUn");
    expect(doneLabel(p)?.key).toBe("prompt:doneFor.grainSales");
    const un = p.options.find(o => o.kind === "un-intervention");
    expect(un).toMatchObject({ idx: 31, id: 32 });
    expect(p.cards).toEqual([]);
    // Playing the USSR card for Ops warns that its Event happens for the USSR.
    expect(p.options.filter(o => o.kind === "mode" && o.id >= 2).every(o => o.warnings?.some(w => w.code === "opponent-event"))).toBe(true);
    const before = redactState(E.display(), "US");
    const action = E.decodeFlat(un!.idx);
    expect(E.step(action, 0)).toBeNull();
    const line = describeAction(E, "US", before, redactState(E.display(), "US"), action, null)[0];
    expect(line.msg.key).toBe("log:choice.grainSalesUn");
    const q = prompt(E, "US");
    expect(q).toMatchObject({ kind: "op-mode", pendingCard: 7 });
    expect(q.title.key).toBe("prompt:title.opMode");
  });

  it("Tear Down This Wall's free coup can be declined", async () => {
    const E = await atFirstCardChoice("US", 12);
    give(E, "US", 96);
    expect(E.step(E.decodeFlat(95), 0)).toBeNull();
    expect(E.step(E.decodeFlat(110), 0)).toBeNull(); // Event
    const p = prompt(E, "US");
    expect(p).toMatchObject({ kind: "op-mode", pendingCard: 96, doneMeaning: "decline" });
    expect(p.title.key).toBe("prompt:card.96.opMode");
    expect(p.detail?.key).toBe("prompt:card.96.detailOpMode");
    expect(doneLabel(p)?.key).toBe("prompt:doneFor.freeOps");
    // Declining ends the play (the USSR moves next); a mode leads to a target choice.
    expect(p.done!.endsPlay).toBe(true);
    expect(p.options.filter(o => o.kind === "op-mode").every(o => o.endsPlay === false)).toBe(true);
    expect(E.step(E.decodeFlat(p.done!.idx), 0)).toBeNull();
    expect(E.display().decision_context.decision_player).toBe("USSR");
  });

  it("Junta: place 2, then an optional free coup", async () => {
    const E = await atFirstCardChoice("USSR", 13);
    give(E, "USSR", 47);
    expect(E.step(E.decodeFlat(46), 0)).toBeNull();
    expect(E.step(E.decodeFlat(110), 0)).toBeNull();
    const p = prompt(E, "USSR");
    expect(p).toMatchObject({ kind: "event-target", resolvingCard: 47, effect: { verb: "add", side: "USSR" } });
    expect(p.title.key).toBe("prompt:card.47.target");
    expect(p.options.every(o => o.cost === undefined)).toBe(true);
    expect(E.step(E.decodeFlat(p.options.find(o => o.kind === "country")!.idx), 0)).toBeNull();
    const q = prompt(E, "USSR");
    expect(q).toMatchObject({ kind: "op-mode", pendingCard: 47, doneMeaning: "decline" });
    expect(q.title.key).toBe("prompt:card.47.opMode");
    expect(doneLabel(q)?.key).toBe("prompt:doneFor.freeOps");
  });

  it("previews influence costs, the click that ends the play, and leave the engine untouched", async () => {
    const E = await atFirstCardChoice("US", 15);
    const wg = 7;
    // West Germany: US 1, USSR 5 (USSR control): a US point there costs 2.
    expect(E.setCountry(wg, 1, 5)).toBeNull();
    give(E, "US", 20); // Olympic Games: 2 Ops
    expect(E.step(E.decodeFlat(19), 0)).toBeNull();
    const mode = prompt(E, "US");
    const infl = mode.options.find(o => o.kind === "mode" && o.id === 2)!;
    expect(infl.endsPlay).toBe(false);
    expect(mode.options.every(o => o.cost === undefined)).toBe(true);
    expect(E.step(E.decodeFlat(infl.idx), 0)).toBeNull();
    const save = E.saveJson();
    const p = prompt(E, "US");
    expect(E.saveJson()).toBe(save);
    expect(p).toMatchObject({ kind: "influence", remaining: 2 });
    expect(p.effect).toBeUndefined();
    const there = p.options.find(o => o.kind === "country" && o.id === wg)!;
    expect(there).toMatchObject({ cost: 2, endsPlay: true });
    const board = E.display();
    const ussrControls = (id: number) => Object.values(board.countries).find(c => c.id === id)!.controlled_by === "USSR";
    const others = p.options.filter(o => o.kind === "country" && !ussrControls(o.id));
    expect(others.length).toBeGreaterThan(3);
    for (const o of others) expect(o, `country ${o.id}`).toMatchObject({ cost: 1, endsPlay: false });
    for (const o of p.options.filter(o => o.kind === "country" && ussrControls(o.id))) expect(o, `country ${o.id}`).toMatchObject({ cost: 2, endsPlay: true });
    // After a 1-Op point, the last point ends the play.
    expect(E.step(E.decodeFlat(others[0].idx), 0)).toBeNull();
    const q = prompt(E, "US");
    expect(q.remaining).toBe(1);
    expect(q.options.filter(o => o.kind === "country").every(o => o.cost === 1 && o.endsPlay === true)).toBe(true);
    expect(q.options.some(o => o.kind === "country" && ussrControls(o.id))).toBe(false); // 2 Ops there, 1 left
  });

  it("counts the China Card's Asia bonus a point outside Asia forfeits", async () => {
    const E = await atFirstCardChoice("USSR", 17);
    expect(E.mask(false)[5]).toBe(1); // the China Card (id 6)
    expect(E.step(E.decodeFlat(5), 0)).toBeNull();
    const infl = prompt(E, "USSR").options.find(o => o.kind === "mode" && o.id === 2)!;
    expect(E.step(E.decodeFlat(infl.idx), 0)).toBeNull();
    const p = prompt(E, "USSR");
    expect(p).toMatchObject({ kind: "influence", remaining: 5 });
    const board = E.display();
    const info = (id: number) => Object.values(board.countries).find(c => c.id === id)!;
    const free = p.options.filter(o => o.kind === "country" && info(o.id).controlled_by !== "US");
    const asia = free.filter(o => info(o.id).region === 1);
    const elsewhere = free.filter(o => info(o.id).region !== 1);
    expect(asia.length).toBeGreaterThan(0);
    expect(elsewhere.length).toBeGreaterThan(0);
    for (const o of asia) expect(o.cost, `country ${o.id}`).toBe(1);
    for (const o of elsewhere) expect(o.cost, `country ${o.id}`).toBe(2);
    expect(E.step(E.decodeFlat(elsewhere[0].idx), 0)).toBeNull();
    expect(E.display().decision_context.remaining_steps).toBe(3);
  });

  it("never previews a headline outcome that turns on the AI's face-down headline", async () => {
    const E = await loadEngine();
    const rand = mulberry32(18);
    // The US (here the AI) picks its headline first; the USSR (the human) second.
    E.newGame(41);
    E.seat(1, 12);
    E.seat(-1, E.currentRules);
    for (let i = 0; i < 200 && E.display().current_phase_name === "SETUP"; i++) {
      const m = E.mask(false);
      const legal = [...m.keys()].filter(k => m[k] && k < E.layout.size);
      expect(E.step(E.decodeFlat(legal[Math.floor(rand() * legal.length)]), 0)).toBeNull();
    }
    const d = E.display();
    expect(d.current_phase_name).toBe("HEADLINE");
    expect(E.decisionPlayer()).toBe(1);
    // The US controls the whole Middle East and leads by 19: its Middle East Scoring headline wins.
    for (const c of Object.values(d.countries)) if (c.region === 2) expect(E.setCountry(c.id, 6, 0)).toBeNull();
    expect(E.setVp(19)).toBeNull();
    give(E, "US", 3);
    expect(E.step(E.decodeFlat(2), 0)).toBeNull();
    expect(E.decisionPlayer()).toBe(-1);
    expect(redactState(E.display(), "USSR").aiHeadlineHidden).toBe(true);
    const p = prompt(E, "USSR");
    expect(p.kind).toBe("headline");
    // The engine: picking (almost) anything ends the game -- the preview may not say so.
    const save = E.snapshot();
    const ends = p.options.filter(o => { E.step(E.decodeFlat(o.idx), 1); const t = E.isTerminal(); E.restore(save); return t; });
    expect(ends.length).toBeGreaterThan(0);
    for (const o of p.options) {
      expect((o.warnings ?? []).filter(w => w.code !== "scoring-stranded"), `option ${o.id}`).toEqual([]);
      expect(o.endsPlay).toBe(true);
    }
  });

  it("gives realignment odds over the 36 pairs of dice", async () => {
    const E = await atFirstCardChoice("US", 16);
    const d = E.display();
    const card = d.hands.US.find(c => E.cardOps(c) >= 2 && c !== 6)!;
    expect(E.step(E.decodeFlat(card - 1), 0)).toBeNull();
    const realign = prompt(E, "US").options.find(o => o.kind === "mode" && o.id === 4)!;
    expect(E.step(E.decodeFlat(realign.idx), 0)).toBeNull();
    const p = prompt(E, "US");
    expect(p.kind).toBe("realign-target");
    if (p.done) expect(doneLabel(p)?.key).toBe("prompt:doneFor.stopRealign");
    const save = E.saveJson();
    for (const c of p.countries.slice(0, 4)) {
      const odds = computeRealignOdds(E, c)!;
      expect(E.saveJson()).toBe(save);
      expect(odds.country).toBe(c);
      const total = odds.outcomes.reduce((s, o) => s + o.p, 0);
      expect(total).toBeCloseTo(1, 12);
      for (const o of odds.outcomes) {
        expect(o.side === "NONE").toBe(o.amount === 0);
        expect(Number.isInteger(Math.round(o.p * 36)) && Math.abs(o.p * 36 - Math.round(o.p * 36)) < 1e-9).toBe(true);
      }
      // A 6 against a 1 always removes some USSR influence (every target has some).
      expect(odds.outcomes.some(o => o.side === "USSR")).toBe(true);
    }
    expect(computeRealignOdds(E, 0)).toBeNull(); // Canada: not a realignment target
  });

  it("warns that a battleground coup at DEFCON 2 loses the game, with coup odds per die face", async () => {
    const E = await atFirstCardChoice("US", 14);
    expect(E.setDefcon(2)).toBeNull();
    // USSR influence in Angola (battleground, id 57) and Zaire? Use the engine's names to find ids.
    const d = E.display();
    const angola = Object.values(d.countries).find(c => c.name === "Angola")!;
    const nonBg = Object.values(d.countries).find(c => !c.battleground && c.region === 3 && c.name !== "Angola")!;
    expect(E.setCountry(angola.id, 0, 2)).toBeNull();
    expect(E.setCountry(nonBg.id, 0, 1)).toBeNull();
    const card = d.hands.US.find(c => E.cardOps(c) >= 2 && c !== 6)!;
    expect(E.step(E.decodeFlat(card - 1), 0)).toBeNull();
    const mode = prompt(E, "US");
    const coup = mode.options.find(o => o.kind === "mode" && o.id === 3)!;
    expect(E.step(E.decodeFlat(coup.idx), 0)).toBeNull();
    const p = prompt(E, "US");
    expect(p.kind).toBe("coup-target");
    const bg = p.options.find(o => o.kind === "country" && o.id === angola.id)!;
    const safe = p.options.find(o => o.kind === "country" && o.id === nonBg.id)!;
    expect(bg.warnings).toEqual([{ code: "defcon-suicide", params: { faces: 6 } }]);
    expect(safe.warnings).toBeUndefined();
    const save = E.saveJson();
    const odds = computeCoupOdds(E, angola.id)!;
    expect(odds.faces.map(f => f.die)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(odds.faces.every(f => f.endsGame)).toBe(true);
    expect(E.saveJson()).toBe(save);
    expect(computeCoupOdds(E, nonBg.id)!.faces.some(f => f.endsGame)).toBe(false);
  });
});
