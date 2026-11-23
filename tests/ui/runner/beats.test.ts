/** buildBeats (ui-spec §9.4): grouping and order, on hand-made frames and on every recorded frame. */
import { describe, expect, it } from "vitest";
import type { Frame, GameEvent, PublicState } from "../../../src/game/contract";
import { boardRank, buildBeats, cancelledHeadlineCard, dealtCards, silentMove, staggerOffset } from "../../../src/ui/runner/beats";
import { flightFor } from "../../../src/ui/runner/locations";
import { cancelledHeadline } from "../../../src/ui/stage/model";
import { TIMING } from "../../../src/ui/theme";
import type { Beat } from "../../../src/ui/ui-contract";
import { fixture, fixtureNames } from "../../fixtures/load";

const base = fixture("prompt-action-card").frames[0]!;
const frame = (events: GameEvent[], patch: Partial<Frame> = {}): Frame => ({ ...base, seq: 2, actor: "USSR", auto: false, events, ...patch });
const kinds = (groups: Beat[][]) => groups.map(g => g.map(b => (b.k === "track" ? `track:${b.event.t}` : b.k === "banner" ? `banner:${b.kind}` : b.k)).join("+"));

describe("buildBeats: order and groups", () => {
  it("sorts an ordinary frame into the catalogue order, one group per lead / roll / scoring", () => {
    const f = frame([
      { t: "action-round", ar: 3, side: "US" },
      { t: "vp", from: 0, to: 2 },
      { t: "influence", country: 7, side: "USSR", from: 0, to: 1 },
      { t: "card-moved", card: 5, from: "HAND_USSR_KNOWN", to: "DISCARD_PILE" },
      { t: "roll", roll: { type: "COUP", roll1: 4 } },
      { t: "card-played", side: "USSR", card: 5, how: "coup" },
      { t: "effect-on", flag: "X" },
      { t: "roll", roll: { type: "COUP", roll1: 2 } },
      { t: "china-card", holder: "US", playable: false },
      { t: "defcon", from: 4, to: 3 },
      { t: "game-over", ending: { winner: "US", reason: "vp20", vpBefore: 20, vpFinal: 20, turn: 3 } },
    ]);
    expect(kinds(buildBeats(f, base.state, "US"))).toEqual([
      "reveal", "roll", "roll", "country", "track:vp+track:defcon", "effect", "card-moved", "china", "track:action-round", "game-over",
    ]);
  });

  it("marks the human's reveals byHuman", () => {
    const g = buildBeats(frame([{ t: "card-played", side: "US", card: 5, how: "event" }, { t: "card-played", side: "USSR", card: 9, how: "headline" }]), base.state, "US");
    expect(g.map(x => x[0])).toEqual([
      { k: "reveal", side: "US", card: 5, how: "event", byHuman: true },
      { k: "reveal", side: "USSR", card: 9, how: "headline", byHuman: false },
    ]);
  });

  it("merges influence and control per country, in board order", () => {
    const f = frame([
      { t: "influence", country: 40, side: "US", from: 1, to: 2 }, // Asia
      { t: "influence", country: 7, side: "USSR", from: 0, to: 2 }, // Europe
      { t: "influence", country: 7, side: "US", from: 3, to: 1 },
      { t: "control", country: 7, from: "US", to: "USSR" },
    ]);
    const [group] = buildBeats(f, base.state, "US");
    expect(group).toHaveLength(2);
    const order = group!.map(b => (b as { country: number }).country);
    expect(order).toEqual([...order].sort((a, b) => boardRank(a) - boardRank(b)));
    const west = group!.find(b => b.k === "country" && b.country === 7);
    expect(west).toEqual({
      k: "country", country: 7, control: { from: "US", to: "USSR" },
      influence: [{ side: "USSR", from: 0, to: 2 }, { side: "US", from: 3, to: 1 }],
    });
  });

  it("keeps an end-of-turn frame in its own order (turn banner before the deal, phase, AR)", () => {
    const f = frame([
      { t: "vp", from: 0, to: -1 },
      { t: "milops", side: "US", from: 2, to: 0 },
      { t: "effect-off", flag: "A" },
      { t: "defcon", from: 3, to: 4 },
      { t: "turn-start", turn: 4 },
      { t: "deal", side: "US", count: 3 },
      { t: "card-moved", card: 33, from: "DISCARD_PILE", to: "REMOVED_FROM_GAME" },
      { t: "china-card", holder: "US", playable: true },
      { t: "phase", phase: "HEADLINE" },
    ], { actor: null });
    expect(kinds(buildBeats(f, base.state, "US"))).toEqual([
      "track:vp+track:milops", "effect", "track:defcon", "banner:turn", "deal", "card-moved", "china", "banner:phase",
    ]);
  });

  it("shows no banner for SETUP / ACTION_ROUND / GAME_OVER phases", () => {
    for (const phase of ["SETUP", "ACTION_ROUND", "GAME_OVER"] as const) {
      expect(buildBeats(frame([{ t: "phase", phase }]), base.state, "US")).toEqual([]);
    }
  });
});

describe("buildBeats: silent card moves", () => {
  it("drops UNAVAILABLE moves, reshuffled discards, dealt cards and headline commits", () => {
    const f = frame([
      { t: "headline-chosen", side: "US" },
      { t: "reshuffle" },
      { t: "deal", side: "US", count: 2 },
      { t: "card-moved", card: 40, from: "UNAVAILABLE", to: "UNSEEN" },
      { t: "card-moved", card: 8, from: "DISCARD_PILE", to: "UNSEEN" },
      { t: "card-moved", card: 9, from: "UNSEEN", to: "HAND_US_KNOWN" },
      { t: "card-moved", card: 10, from: "DISCARD_PILE", to: "HAND_US_UNKNOWN" },
      { t: "card-moved", card: 11, from: "UNSEEN", to: "HAND_USSR_KNOWN" },
      { t: "card-moved", card: 12, from: "HAND_US_KNOWN", to: "HEADLINE_COMMITTED" },
      { t: "card-moved", card: 13, from: "HAND_US_KNOWN", to: "DISCARD_PILE" },
      { t: "card-moved", card: 63, from: "UNAVAILABLE", to: "HAND_US_KNOWN" },
    ]);
    const moved = buildBeats(f, base.state, "US").flat().filter(b => b.k === "card-moved").map(b => (b as { card: number }).card);
    expect(moved).toEqual([11, 13]);
    expect(dealtCards(f, "US")).toEqual([9, 10, 63]);
    expect(silentMove({ t: "card-moved", card: 13, from: "HAND_US_KNOWN", to: "DISCARD_PILE" }, f)).toBe(false);
  });

  // R-004: the headline frames of a Defectors game, recorded from the real controller (game seed 3, turn 1: US Defectors
  // vs USSR Vietnam Revolts, as in QA r2-long G1), the human US (the AI's Vietnam Revolts never public: UNSEEN) and the
  // mirror, the human USSR against the AI's Defectors.
  const humanUs: GameEvent[] = [
    { t: "headline-chosen", side: "USSR" },
    { t: "headline-reveal", us: 103, ussr: 9, first: "US" },
    { t: "card-played", side: "US", card: 103, how: "headline" },
    { t: "card-moved", card: 9, from: "UNSEEN", to: "DISCARD_PILE" },
    { t: "card-moved", card: 103, from: "HAND_US_UNKNOWN", to: "DISCARD_PILE" },
  ];
  const humanUssr: GameEvent[] = [
    { t: "headline-chosen", side: "USSR" },
    { t: "headline-reveal", us: 103, ussr: 9, first: "US" },
    { t: "card-played", side: "US", card: 103, how: "headline" },
    { t: "card-moved", card: 9, from: "HAND_USSR_UNKNOWN", to: "DISCARD_PILE" },
    { t: "card-moved", card: 103, from: "UNSEEN", to: "DISCARD_PILE" },
  ];
  const movedCards = (f: Frame, human: "US" | "USSR") =>
    buildBeats(f, base.state, human).flat().filter(b => b.k === "card-moved").map(b => (b as { card: number }).card);

  it("drops the Defectors-cancelled headline's move: the headline papers slide it into the pile (R-004)", () => {
    // Human US: the AI's cancelled Vietnam Revolts flew from the draw deck after its paper (r2-long #1).
    const a = frame(humanUs, { actor: "US" });
    expect(flightFor({ card: 9, from: "UNSEEN", to: "DISCARD_PILE" })).toEqual({ from: "deck", to: "discard", back: false });
    expect(cancelledHeadlineCard(a)).toBe(9);
    expect(movedCards(a, "US")).toEqual([103]);
    // Mirror: the human's cancelled card no longer flies from the hand; the AI's played Defectors keeps its beat (the
    // reveal dock pins it, and flightFor folds it into the dock's collapse).
    const b = frame(humanUssr, { actor: "USSR" });
    expect(cancelledHeadlineCard(b)).toBe(9);
    expect(movedCards(b, "USSR")).toEqual([103]);
    expect(flightFor({ card: 103, from: "UNSEEN", to: "DISCARD_PILE" }, { aiPlayCard: 103 })).toBeNull();
    // A known AI card (QA G1 turn 7, Sadat Expels Soviets), and the human USSR's own card from its slot.
    const known = frame(humanUs.map(e => (e.t === "card-moved" && e.card === 9 ? { ...e, from: "HAND_USSR_KNOWN" } : e)));
    expect(movedCards(known, "US")).toEqual([103]);
    // Only the move into a pile, and only without a card-played of it (it was not cancelled then).
    expect(silentMove({ t: "card-moved", card: 9, from: "DISCARD_PILE", to: "HAND_US_KNOWN" }, a)).toBe(false);
    expect(silentMove({ t: "card-moved", card: 9, from: "UNSEEN", to: "REMOVED_FROM_GAME" }, a)).toBe(true);
    const played = frame([...humanUs, { t: "card-played", side: "USSR", card: 9, how: "headline" }]);
    expect(cancelledHeadlineCard(played)).toBe(0);
    expect(movedCards(played, "US")).toEqual([9, 103]);
    // No reveal in the frame: an ordinary discard flies.
    const plain = frame(humanUs.filter(e => e.t !== "headline-reveal"));
    expect(movedCards(plain, "US")).toEqual([9, 103]);
  });

  it("agrees with the headline papers' own rule (stage cancelledHeadline) on every frame with a reveal", () => {
    const frames: Frame[] = [frame(humanUs), frame(humanUssr)];
    for (const name of fixtureNames()) frames.push(...fixture(name).frames);
    let reveals = 0;
    for (const f of frames) {
      const r = f.events.find(e => e.t === "headline-reveal") as Extract<GameEvent, { t: "headline-reveal" }> | undefined;
      if (!r) continue;
      reveals++;
      expect(cancelledHeadlineCard(f)).toBe(cancelledHeadline(f, r.us, r.ussr));
    }
    expect(reveals).toBeGreaterThanOrEqual(2);
  });

  it("staggers card moves 60 ms, capped so the group ends by 1200 ms", () => {
    expect(staggerOffset("card-moved", 3, 4)).toBe(180);
    const n = 40;
    expect(staggerOffset("card-moved", n - 1, n) + TIMING.cardMoved.dur).toBeLessThanOrEqual(TIMING.cardMoved.maxTotal);
    expect(staggerOffset("country", 2, 5)).toBe(2 * TIMING.countryStagger.dur);
    expect(staggerOffset("roll", 2, 5)).toBe(0);
  });
});

describe("buildBeats on every recorded frame", () => {
  const frames: { name: string; f: Frame; before: PublicState }[] = [];
  for (const name of fixtureNames("sequence")) {
    const fx = fixture(name);
    for (let i = 1; i < fx.frames.length; i++) frames.push({ name, f: fx.frames[i]!, before: fx.frames[i - 1]!.state });
  }

  it("has real frames to check", () => {
    expect(frames.length).toBeGreaterThan(500);
  });

  it("every event becomes exactly one beat (or is folded / silent), and groups are never empty", () => {
    for (const { name, f, before } of frames) {
      const human = f.state.humanSide;
      const groups = buildBeats(f, before, human);
      const beats = groups.flat();
      for (const g of groups) expect(g.length, name).toBeGreaterThan(0);
      const count = (k: string) => beats.filter(b => b.k === k).length;
      const ev = (t: GameEvent["t"]) => f.events.filter(e => e.t === t).length;
      expect(count("reveal"), name).toBe(ev("card-played"));
      expect(count("roll"), name).toBe(ev("roll"));
      expect(count("scoring"), name).toBe(ev("scoring"));
      expect(count("game-over"), name).toBe(ev("game-over"));
      expect(count("deal"), name).toBe(ev("deal"));
      expect(count("effect"), name).toBe(ev("effect-on") + ev("effect-off"));
      expect(count("china"), name).toBe(ev("china-card"));
      expect(beats.filter(b => b.k === "track").length, name).toBe(ev("milops") + ev("space") + ev("defcon") + ev("vp") + ev("action-round"));
      const moves = f.events.filter((e): e is Extract<GameEvent, { t: "card-moved" }> => e.t === "card-moved");
      expect(count("card-moved"), name).toBe(moves.filter(m => !silentMove(m, f)).length);
      // One country beat per country, its influence summing to the events.
      const ids = new Set(f.events.flatMap(e => (e.t === "influence" || e.t === "control" ? [e.country] : [])));
      expect(count("country"), name).toBe(ids.size);
      for (const b of beats) {
        if (b.k !== "country") continue;
        for (const inf of b.influence) {
          const evs = f.events.filter(e => e.t === "influence" && e.country === b.country && e.side === inf.side) as Extract<GameEvent, { t: "influence" }>[];
          expect(inf.to - inf.from, name).toBe(evs.reduce((s, e) => s + e.to - e.from, 0));
        }
      }
    }
  });

  it("country beats share one group; ordinary frames keep the catalogue rank order", () => {
    const rank: Record<string, number> = {
      reveal: 1, "headline-chosen": 1, "headline-reveal": 1, roll: 2, scoring: 3, country: 4, effect: 6, reshuffle: 7, deal: 7.1,
      "hand-revealed": 7.2, "card-moved": 7.3, china: 8, banner: 9, "game-over": 10,
    };
    const rankOf = (b: Beat) => (b.k === "track" ? (b.event.t === "action-round" ? 9.2 : 5) : b.k === "banner" ? (b.kind === "turn" ? 9 : 9.1) : rank[b.k]!);
    for (const { name, f, before } of frames) {
      const groups = buildBeats(f, before, f.state.humanSide);
      expect(groups.filter(g => g.some(b => b.k === "country")).length, name).toBeLessThanOrEqual(1);
      if (f.events.some(e => e.t === "turn-start")) continue;
      const ranks = groups.map(g => rankOf(g[0]!));
      expect(ranks, `${name} seq ${f.seq}`).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("the recorded headline frame plays chosen → papers → first headline", () => {
    const fx = fixture("seq-headline");
    const f = fx.frames.find(x => x.events.some(e => e.t === "headline-reveal"))!;
    const g = buildBeats(f, fx.frames[fx.frames.indexOf(f) - 1]!.state, fx.humanSide).map(x => x[0]!.k);
    expect(g.slice(0, 3)).toEqual(["headline-chosen", "headline-reveal", "reveal"]);
  });
});
