/**
 * Frame events that the board alone cannot tell: the deal counts (the new era's cards and the
 * reshuffled discard pile included, both sides, the AI's by count), the scoring sheet's `scoring`
 * event for every scoring-card play (net 0 included, headlines too), reveals, The Cambridge Five, and
 * the log's draw lines agreeing with the deals. Unit tests on synthetic positions, then real games.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { GameState } from "../../src/engine/types";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import type { Frame, GameEvent, LogEntry, PublicState, Side } from "../../src/game/contract";
import { describeDeltas } from "../../src/game/describe";
import { drawCounts } from "../../src/game/draws";
import { buildFrameEvents, markHandOrigins, scoringEvents } from "../../src/game/events";
import { isScoringCard, otherSide } from "../../src/game/rules";
import { redactState } from "../../src/game/view";
import { renderEnglish } from "../../src/i18n";
import { drive, type GameRecord, loadEngine, makeController, mulberry32, StubAi } from "./helpers";

let E: WasmEngine;
beforeAll(async () => { E = await loadEngine(); });

/** A raw position of a new game with some card locations changed. */
function raw(locs: Record<number, string> = {}, seed = 3): GameState {
  E.newGame(seed);
  const d = structuredClone(E.display());
  for (const [id, loc] of Object.entries(locs)) d.card_locations![id] = loc;
  return d;
}

const pub = (d: GameState, human: Side): PublicState => redactState(d, human);
const of = <T extends GameEvent["t"]>(events: GameEvent[], t: T) => events.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t);

describe("deal counts (draws.ts)", () => {
  it("count the new era's cards dealt straight from UNAVAILABLE, for both sides", () => {
    const b = raw({ 36: "UNAVAILABLE", 37: "UNAVAILABLE", 38: "UNAVAILABLE", 39: "UNAVAILABLE", 40: "UNAVAILABLE", 41: "DRAW_DECK", 42: "DRAW_DECK" });
    const a = structuredClone(b);
    Object.assign(a.card_locations!, { 36: "HAND_USSR_UNKNOWN", 37: "HAND_USSR_UNKNOWN", 41: "HAND_USSR_UNKNOWN", 38: "HAND_US_UNKNOWN", 39: "HAND_US_KNOWN", 40: "DRAW_DECK", 42: "HAND_US_UNKNOWN" });
    const d = drawCounts(b, a);
    expect(d.draws).toEqual({ US: 3, USSR: 3 });
    expect(d.cards).toEqual({ US: [38, 39, 42], USSR: [36, 37, 41] });
    expect(d.reshuffled).toBe(false);
  });

  it("count the reshuffled discard pile only when the deck really was reshuffled; never a take or a hand-to-hand move", () => {
    const b = raw({ 50: "DISCARD_PILE", 51: "DISCARD_PILE", 52: "DISCARD_PILE", 53: "HAND_USSR_UNKNOWN", 54: "DISCARD_PILE" });
    // The deck ran out: the discard pile is back in the deck and the deal drew from it.
    const a = structuredClone(b);
    Object.assign(a.card_locations!, { 50: "DRAW_DECK", 51: "HAND_US_UNKNOWN", 52: "HAND_USSR_KNOWN" });
    expect(drawCounts(b, a)).toMatchObject({ draws: { US: 1, USSR: 1 }, reshuffled: true });
    // No reshuffle: a headline Missile Envy goes from the discard pile to the giver's hand, SALT
    // takes a card back, Grain Sales / Missile Envy move cards between hands.
    const c = structuredClone(b);
    Object.assign(c.card_locations!, { 51: "HAND_USSR_KNOWN", 53: "HAND_US_KNOWN" });
    expect(drawCounts(b, c)).toMatchObject({ draws: { US: 0, USSR: 0 }, reshuffled: false });
    const salt = structuredClone(a);
    Object.assign(salt.card_locations!, { 54: "HAND_US_KNOWN" });
    expect(drawCounts(b, salt, [54]).draws).toEqual({ US: 1, USSR: 1 });
    // Our Man in Tehran's peek draws on the reshuffled pile: a reshuffle, no draw into a hand.
    const peek = structuredClone(b);
    Object.assign(peek.card_locations!, { 50: "PEEKED_TEMP" });
    expect(drawCounts(b, peek)).toMatchObject({ draws: { US: 0, USSR: 0 }, reshuffled: true });
  });

  it("become deal events for both sides, the AI's as a count only", () => {
    const b = raw({ 36: "UNAVAILABLE", 37: "UNAVAILABLE", 41: "DRAW_DECK" });
    const a = structuredClone(b);
    Object.assign(a.card_locations!, { 36: "HAND_USSR_UNKNOWN", 37: "HAND_US_UNKNOWN", 41: "HAND_US_UNKNOWN" });
    const d = drawCounts(b, a);
    const events = buildFrameEvents({ before: pub(b, "USSR"), after: pub(a, "USSR"), draws: d.draws, reshuffled: d.reshuffled, transition: true });
    expect(of(events, "deal")).toEqual([{ t: "deal", side: "US", count: 2 }, { t: "deal", side: "USSR", count: 1 }]);
    // The human's card is a visible move into its hand; the AI's cards never show where they went
    // (the new era's card only enters the unseen pile, the deck's card does not move at all).
    expect(of(events, "card-moved")).toEqual([
      { t: "card-moved", card: 36, from: "UNAVAILABLE", to: "HAND_USSR_UNKNOWN" },
      { t: "card-moved", card: 37, from: "UNAVAILABLE", to: "UNSEEN" },
    ]);
  });
});

describe("scoring events", () => {
  const played = (card: number, how: "scoring" | "headline" | "event" | "discard" | "pass"): GameEvent => ({ t: "card-played", side: "USSR", card, how });

  it("come with every scoring-card play, net 0 included (the engine records no track then)", () => {
    expect(scoringEvents([played(2, "scoring")], [])).toEqual([{ t: "scoring", card: 2, vp: 0 }]);
    expect(scoringEvents([played(3, "headline")], [])).toEqual([{ t: "scoring", card: 3, vp: 0 }]);
    // Grain Sales' drawn scoring card played as its Event.
    expect(scoringEvents([played(37, "event")], [])).toEqual([{ t: "scoring", card: 37, vp: 0 }]);
    expect(scoringEvents([played(37, "scoring")], [{ card_id: 37, vp_delta: -5, defcon_delta: 0 }])).toEqual([{ t: "scoring", card: 37, vp: -5 }]);
    // A track without its card-played (the card's play is in the same span in practice) still scores once.
    expect(scoringEvents([], [{ card_id: 1, vp_delta: 2, defcon_delta: 0 }, { card_id: 1, vp_delta: 1, defcon_delta: 0 }])).toEqual([{ t: "scoring", card: 1, vp: 3 }]);
    expect(scoringEvents([played(2, "pass"), played(14, "event")], [{ card_id: 14, vp_delta: 1, defcon_delta: 0 }])).toEqual([]);
  });

  it("sit after the rolls in the frame", () => {
    const b = raw();
    const events = buildFrameEvents({ before: pub(b, "US"), after: pub(b, "US"), pre: [played(2, "scoring")] });
    expect(events).toEqual([played(2, "scoring"), { t: "scoring", card: 2, vp: 0 }]);
  });
});

describe("reveals", () => {
  it("an AI card shown in place is a reveal, not a move -- unless the AI also drew", () => {
    const b = raw({ 20: "HAND_USSR_UNKNOWN", 21: "HAND_USSR_UNKNOWN" });
    const a = structuredClone(b);
    Object.assign(a.card_locations!, { 20: "HAND_USSR_KNOWN", 21: "HAND_USSR_KNOWN" });
    const shown = buildFrameEvents({ before: pub(b, "US"), after: pub(a, "US") });
    expect(of(shown, "hand-revealed")).toEqual([{ t: "hand-revealed", side: "USSR", cards: [20, 21] }]);
    expect(of(shown, "card-moved")).toEqual([]);
    const dealt = buildFrameEvents({ before: pub(b, "US"), after: pub(a, "US"), draws: { USSR: 1 } });
    expect(of(dealt, "card-moved").map(e => e.card)).toEqual([20, 21]);
  });

  it("The Cambridge Five shows the US scoring cards, or that there are none", () => {
    const cf: GameEvent = { t: "card-played", side: "USSR", card: 104, how: "event" };
    const none = raw({ 1: "DRAW_DECK", 2: "DRAW_DECK", 3: "DRAW_DECK" });
    const e0 = buildFrameEvents({ before: pub(none, "USSR"), after: pub(none, "USSR"), pre: [cf] });
    expect(of(e0, "hand-revealed")).toEqual([{ t: "hand-revealed", side: "US", cards: [] }]);
    // One newly shown, one the USSR already knew: both listed.
    const b = raw({ 1: "HAND_US_UNKNOWN", 2: "HAND_US_KNOWN", 3: "DRAW_DECK" });
    const a = structuredClone(b);
    a.card_locations!["1"] = "HAND_US_KNOWN";
    const e1 = buildFrameEvents({ before: pub(b, "USSR"), after: pub(a, "USSR"), pre: [{ ...cf, how: "headline", side: "US" }] });
    expect(of(e1, "hand-revealed")).toEqual([{ t: "hand-revealed", side: "US", cards: [1, 2] }]);
    // Played for Ops or to the Space Race: no announcement here.
    expect(of(buildFrameEvents({ before: pub(none, "USSR"), after: pub(none, "USSR"), pre: [{ ...cf, how: "space" }] }), "hand-revealed")).toEqual([]);
  });
});

describe("log card lines", () => {
  const keys = (lines: ReturnType<typeof describeDeltas>) => lines.map(l => l.msg.key);

  it("say the human's draws in one line (deck, new era, reshuffled pile) and count the era and pile whole", () => {
    const b = raw({ 36: "UNAVAILABLE", 37: "UNAVAILABLE", 41: "DRAW_DECK", 50: "DISCARD_PILE", 51: "DISCARD_PILE" });
    const a = structuredClone(b);
    Object.assign(a.card_locations!, { 36: "HAND_USSR_UNKNOWN", 37: "DRAW_DECK", 41: "HAND_USSR_UNKNOWN", 50: "HAND_USSR_UNKNOWN", 51: "DRAW_DECK" });
    const d = drawCounts(b, a);
    expect(d.cards.USSR).toEqual([36, 41, 50]);
    const lines = describeDeltas(E, "USSR", pub(b, "USSR"), pub(a, "USSR"), [], 0, d.cards.USSR);
    expect(keys(lines)).toEqual(["log:card.draws", "log:card.newEra", "log:card.reshuffled"]);
    expect(lines[0].msg.params).toMatchObject({ count: 3 });
    expect(lines[1].msg.params).toEqual({ n: 2 });
    expect(lines[2].msg.params).toEqual({ n: 2 });
  });

  it("say a card taken out of the AI's unseen hand is taken from it, not drawn (Grain Sales)", () => {
    const b = raw({ 68: "HAND_USSR_UNKNOWN" });
    const a = structuredClone(b);
    a.card_locations!["68"] = "HAND_US_KNOWN";
    const lines = describeDeltas(E, "US", pub(b, "US"), pub(a, "US"), [], 0, drawCounts(b, a).cards.US);
    expect(keys(lines)).toEqual(["prompt:log.takenFrom"]);
    expect(renderEnglish(lines[0].msg)).toBe("John Paul II Elected Pope (#68) taken from the USSR hand into the US hand");
  });
});

describe("card-moved fromHand (markHandOrigins)", () => {
  const moved = (card: number, from: string, to: string): Extract<GameEvent, { t: "card-moved" }> => ({ t: "card-moved", card, from, to });
  // The human is the US; the AI (USSR) holds 20 and 21 unseen, 22 known; 23 is in the deck.
  const locs = { 20: "HAND_USSR_UNKNOWN", 21: "HAND_USSR_UNKNOWN", 22: "HAND_USSR_KNOWN", 23: "DRAW_DECK", 24: "HAND_USSR_UNKNOWN" };

  it("marks a card leaving the AI's hidden hand for a public place: random discards, takes, the AI's own discards", () => {
    const events: GameEvent[] = [
      { t: "card-played", side: "US", card: 5, how: "event" },
      moved(20, "UNSEEN", "DISCARD_PILE"), //       Five Year Plan's random discard
      moved(21, "UNSEEN", "HAND_US_KNOWN"), //       Grain Sales / Missile Envy: into the human's hand
      moved(24, "UNSEEN", "REMOVED_FROM_GAME"), //  a discarded US Event that fired (starred)
    ];
    expect(markHandOrigins(events, locs, "USSR")).toBe(3);
    expect(of(events, "card-moved").map(e => e.fromHand)).toEqual(["USSR", "USSR", "USSR"]);
  });

  it("leaves the deck, known cards, moves into the AI's hand or out of sight, and the AI's own played card alone", () => {
    const events: GameEvent[] = [
      moved(23, "UNSEEN", "DISCARD_PILE"), //       from the deck (Our Man in Tehran)
      moved(22, "HAND_USSR_KNOWN", "DISCARD_PILE"), // already known: its own anchor
      moved(20, "UNSEEN", "HAND_USSR_KNOWN"), //     still in the AI's hand
      moved(21, "UNSEEN", "UNSEEN"),
    ];
    expect(markHandOrigins(events, locs, "USSR")).toBe(0);
    // The AI's own plays: in play as the step starts (`own`), played in the frame, its revealed headline.
    const own: GameEvent[] = [
      { t: "card-played", side: "USSR", card: 20, how: "influence" },
      { t: "headline-reveal", us: 30, ussr: 24, first: "US" },
      moved(20, "UNSEEN", "DISCARD_PILE"),
      moved(21, "UNSEEN", "DISCARD_PILE"),
      moved(24, "UNSEEN", "HEADLINE_COMMITTED"),
    ];
    expect(markHandOrigins(own, locs, "USSR", [21])).toBe(0);
    // ...but a give or a discard of the AI's is marked, and so is its played card landing in the human's hand
    // (the AI's Missile Envy, exchanged).
    const give: GameEvent[] = [{ t: "card-played", side: "USSR", card: 20, how: "give" }, moved(20, "UNSEEN", "HAND_US_KNOWN"), moved(21, "UNSEEN", "HAND_US_KNOWN")];
    expect(markHandOrigins(give, locs, "USSR", [21])).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Real games (seeded): the turn-4/8 deals and net-0 scoring plays, AR and headline
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface Played {
  frames: Frame[];
  raws: Map<number, GameState>;
  log: LogEntry[];
  human: Side;
  rec: GameRecord;
}

async function play(id: number, side: Side): Promise<Played> {
  const h = makeController({ engine: await loadEngine(), ai: new StubAi(id), seed: id });
  await h.ctrl.boot();
  await h.ctrl.newGame({ side, seed: 500 + id });
  const frames: Frame[] = [];
  h.ctrl.subscribe(() => {
    const f = h.ctrl.getSnapshot().frame;
    if (f && frames[frames.length - 1]?.seq !== f.seq) frames.push(f);
  });
  const rec = await drive(h, { rand: mulberry32(id), avoidWarned: 0.97, undoRate: 0 });
  expect(rec.problems).toEqual([]);
  expect(rec.leaks).toEqual([]);
  return { frames, raws: h.rawFrames, log: [...h.ctrl.getSnapshot().log], human: side, rec };
}

const inHand = (loc: string | undefined, side: Side) => loc === `HAND_${side}_KNOWN` || loc === `HAND_${side}_UNKNOWN`;

describe("real games", () => {
  it("the turn 4 and 8 deals count the new era's cards for both sides, and the log says the same", async () => {
    const g = await play(16, "USSR");
    const ai = otherSide(g.human);
    let checked = 0;
    for (const turn of [4, 8]) {
      const i = g.frames.findIndex(f => f.events.some(e => e.t === "turn-start" && e.turn === turn));
      expect(i, `turn ${turn} reached`).toBeGreaterThan(0);
      const f = g.frames[i];
      const before = g.raws.get(g.frames[i - 1].seq)!;
      const after = g.raws.get(f.seq)!;
      const deal = (s: Side) => of(f.events, "deal").filter(e => e.side === s).reduce((n, e) => n + e.count, 0);
      let fromEra = 0;
      for (const s of ["US", "USSR"] as const) {
        const entered = Object.keys(after.card_locations!).map(Number)
          .filter(id => !inHand(before.card_locations![id], s) && inHand(after.card_locations![id], s));
        const era = entered.filter(id => before.card_locations![id] === "UNAVAILABLE");
        expect(era.length, `turn ${turn}: ${s} got new era cards`).toBeGreaterThan(0);
        expect(deal(s), `turn ${turn} deal ${s}`).toBe(entered.length);
        fromEra += era.length;
      }
      // The human sees its own cards: one card-moved per card drawn, era cards included.
      const mine = of(f.events, "card-moved").filter(e => inHand(e.to, g.human)).map(e => e.card);
      expect(mine.length).toBe(deal(g.human));
      // The turn's log entry: the human's draws name its cards, the AI's are a count; the new era's
      // cards are counted whole (the dealt ones too).
      const entry = g.log.filter(e => e.kind === "turn" && e.turn === turn - 1).pop()!;
      const lines = entry.details ?? [];
      const draws = lines.find(m => m.key === "log:card.draws")!;
      expect(draws.params?.count).toBe(deal(g.human));
      expect(lines.find(m => m.key === "prompt:log.drawsHidden")?.params?.count).toBe(deal(ai));
      const left = Object.keys(after.card_locations!).filter(id => before.card_locations![id] === "UNAVAILABLE" && after.card_locations![id] !== "UNAVAILABLE");
      expect(lines.find(m => m.key === "log:card.newEra")?.params?.n).toBe(left.length);
      expect(fromEra).toBeLessThanOrEqual(left.length);
      expect(lines.some(m => m.key === "log:card.toHand")).toBe(false);
      expect(renderEnglish(draws)).toMatch(new RegExp(`^USSR draws ${deal(g.human)} cards: `));
      checked++;
    }
    expect(checked).toBe(2);
  }, 120_000);

  it("a scoring card that nets 0 still has its scoring event, in an action round and as a headline", async () => {
    let ar = 0;
    let headline = 0;
    for (const [id, side] of [[16, "USSR"], [13, "US"]] as const) {
      const g = await play(id, side);
      for (const f of g.frames) {
        for (const e of of(f.events, "card-played")) {
          if (!isScoringCard(e.card) || (e.how !== "scoring" && e.how !== "headline")) continue;
          const s = of(f.events, "scoring").filter(x => x.card === e.card);
          expect(s, `frame ${f.seq}: ${e.how} of ${e.card}`).toHaveLength(1);
          const vp = f.state.victory_points - g.frames[g.frames.indexOf(f) - 1].state.victory_points;
          if (s[0].vp === 0) {
            expect(vp, `frame ${f.seq}: a 0 scoring moved no VP`).toBe(0);
            if (e.how === "scoring") ar++;
            else headline++;
          }
        }
      }
    }
    expect(ar).toBeGreaterThan(0);
    expect(headline).toBeGreaterThan(0);
  }, 120_000);

  it("cards taken out of the AI's hidden hand fly from that hand: Five Year Plan, Terrorism, Grain Sales, Missile Envy", async () => {
    // Seeds found by search: 5 (US: Five Year Plan's discard, Grain Sales), 4 (USSR: Terrorism), 9 (US: the AI's
    // Missile Envy lands in the human's hand). drive() checks every move (helpers.ts checkHandOrigins).
    const causes = new Map<number, number>();
    let envy = 0;
    for (const [id, side] of [[5, "US"], [4, "USSR"], [9, "US"]] as const) {
      const g = await play(id, side);
      for (const [k, v] of g.rec.checks.fromHandCauses) causes.set(k, (causes.get(k) ?? 0) + v);
      for (const f of g.frames) {
        for (const e of of(f.events, "card-moved")) if (e.card === 49 && e.from === "UNSEEN" && inHand(e.to, g.human) && e.fromHand === otherSide(g.human)) envy++;
      }
    }
    expect(causes.get(5)).toBeGreaterThan(0);
    expect(causes.get(92)).toBeGreaterThan(0);
    expect(causes.get(67)).toBeGreaterThan(0);
    expect(envy).toBeGreaterThan(0);
  }, 120_000);
});
