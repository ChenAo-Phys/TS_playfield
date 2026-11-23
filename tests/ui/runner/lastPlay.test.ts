/** reduceLastPlay (ui-spec §4.4, §9.5): delta pills and pencil marks, with and without Frame.playId. */
import { describe, expect, it } from "vitest";
import type { Frame, GameEvent, Side } from "../../../src/game/contract";
import { EMPTY_LAST_PLAY, isUndoFrame, reduceLastPlay, type LastPlayState } from "../../../src/ui/runner/lastPlay";
import { fixture, fixtureNames } from "../../fixtures/load";

const base = fixture("prompt-action-card").frames[0]!;
const HUMAN: Side = "USSR";
const AI: Side = "US";
let seq = 100;
const fr = (actor: Side | null, events: GameEvent[], playId?: number): Frame => {
  const f: Frame = { ...base, seq: seq++, actor, auto: false, events };
  if (playId !== undefined) f.playId = playId;
  else delete f.playId;
  return f;
};
const inf = (country: number, side: Side, from: number, to: number): GameEvent => ({ t: "influence", country, side, from, to });
const run = (frames: Frame[], s: LastPlayState = EMPTY_LAST_PLAY) => frames.reduce((acc, f) => reduceLastPlay(acc, f, HUMAN), s);

function aiPlayThenHuman(withIds: boolean) {
  const id = (n: number) => (withIds ? n : undefined);
  const aiPlay = [
    fr(AI, [], id(1)), // card selection
    fr(AI, [{ t: "card-played", side: AI, card: 27, how: "influence" }], id(1)),
    fr(AI, [inf(44, AI, 1, 2)], id(1)),
    fr(AI, [inf(44, AI, 2, 3), { t: "control", country: 44, from: "NONE", to: AI }], id(1)),
    fr(AI, [inf(9, HUMAN, 2, 1), { t: "card-moved", card: 27, from: "UNSEEN", to: "DISCARD_PILE" }, { t: "action-round", ar: 2, side: HUMAN }], id(1)),
  ];
  const humanStart = fr(HUMAN, [], id(2));
  const humanPlace = [
    fr(HUMAN, [{ t: "card-played", side: HUMAN, card: 31, how: "influence" }], id(2)),
    fr(HUMAN, [inf(20, HUMAN, 0, 1)], id(2)),
    fr(HUMAN, [inf(20, HUMAN, 1, 2)], id(2)),
    fr(HUMAN, [inf(21, HUMAN, 0, 1)], id(2)),
  ];
  return { aiPlay, humanStart, humanPlace };
}

describe("reduceLastPlay", () => {
  for (const withIds of [true, false]) {
    describe(withIds ? "with Frame.playId" : "without playId (gap G2 fallback)", () => {
      it("the AI's play leaves delta pills until your next play starts", () => {
        const { aiPlay, humanStart } = aiPlayThenHuman(withIds);
        const s = run(aiPlay);
        expect(s.lastOpponent).toEqual({ 44: { us: 2, ussr: 0 }, 9: { us: 0, ussr: -1 } });
        expect(s.placedThisPlay).toEqual({});
        expect(run([humanStart], s).lastOpponent).toEqual({});
      });

      it("pencil marks count your own placements in the play, and clear at its end", () => {
        const { aiPlay, humanStart, humanPlace } = aiPlayThenHuman(withIds);
        const s = run([...aiPlay, humanStart, ...humanPlace]);
        expect(s.placedThisPlay).toEqual({ 20: 2, 21: 1 });
        expect(s.lastOpponent).toEqual({});
        const end = run([fr(HUMAN, [{ t: "action-round", ar: 2, side: AI }], withIds ? 2 : undefined)], s);
        expect(end.placedThisPlay).toEqual({});
      });

      it("an undo takes the marks back and brings the AI's pills back", () => {
        const { aiPlay, humanStart, humanPlace } = aiPlayThenHuman(withIds);
        const mid = run([...aiPlay, humanStart, ...humanPlace]);
        const undo = fr(null, [inf(20, HUMAN, 2, 0), inf(21, HUMAN, 1, 0), { t: "card-moved", card: 31, from: "DISCARD_PILE", to: "HAND_USSR_KNOWN" }]);
        expect(isUndoFrame(undo)).toBe(true);
        const after = run([undo], mid);
        expect(after.placedThisPlay).toEqual({});
        expect(after.lastOpponent).toEqual({ 44: { us: 2, ussr: 0 }, 9: { us: 0, ussr: -1 } });
        // Your next choice starts the play again: the pills go.
        expect(run([fr(HUMAN, [], withIds ? 2 : undefined)], after).lastOpponent).toEqual({});
      });

      it("changes cancelling out leave no pill", () => {
        const s = run([fr(AI, [], withIds ? 5 : undefined), fr(AI, [inf(3, AI, 0, 1)], withIds ? 5 : undefined), fr(AI, [inf(3, AI, 1, 0)], withIds ? 5 : undefined)], { ...EMPTY_LAST_PLAY });
        expect(s.lastOpponent).toEqual({});
      });
    });
  }

  it("returns the same objects when nothing changes (stable React props)", () => {
    const s = run(aiPlayThenHuman(true).aiPlay);
    const t = reduceLastPlay(s, fr(AI, [{ t: "vp", from: 0, to: 1 }], 1), HUMAN);
    expect(t.lastOpponent).toBe(s.lastOpponent);
    expect(t.placedThisPlay).toBe(s.placedThisPlay);
  });

  it("the setup: each side's placements are their own play", () => {
    const s = { ...base.state, current_phase_name: "SETUP" };
    const setup = (actor: Side, e: GameEvent[]) => ({ ...fr(actor, e), state: s });
    const after = run([setup(HUMAN, [inf(15, HUMAN, 0, 1)]), setup(HUMAN, [inf(15, HUMAN, 1, 2)]), setup(AI, [inf(5, AI, 0, 1)])]);
    expect(after.placedThisPlay).toEqual({});
    expect(after.lastOpponent).toEqual({ 5: { us: 1, ussr: 0 } });
  });
});

describe("reduceLastPlay on recorded games", () => {
  it("the AI turn ends with pills for exactly what the AI's last play changed", () => {
    const fx = fixture("seq-ai-turn");
    const human = fx.humanSide;
    const ai: Side = human === "US" ? "USSR" : "US";
    // Up to the end of the AI's action round (the frame with the next action-round).
    const playFrames = fx.frames.slice(1);
    const lastAr = playFrames.findIndex(f => f.events.some(e => e.t === "card-played" && e.side === ai));
    const end = playFrames.findIndex((f, i) => i >= lastAr && f.events.some(e => e.t === "action-round"));
    const s = playFrames.slice(0, end + 1).reduce((acc, f) => reduceLastPlay(acc, f, human), EMPTY_LAST_PLAY);
    const expected: Record<number, { us: number; ussr: number }> = {};
    const playId = playFrames[lastAr]!.playId;
    for (const f of playFrames.slice(0, end + 1)) {
      if (f.actor !== ai || (playId !== undefined && f.playId !== playId)) continue;
      for (const e of f.events) {
        if (e.t !== "influence") continue;
        const cur = expected[e.country] ?? { us: 0, ussr: 0 };
        if (e.side === "US") cur.us += e.to - e.from; else cur.ussr += e.to - e.from;
        expected[e.country] = cur;
      }
    }
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(s.lastOpponent).toEqual(expected);
  });

  it("on every sequence: pills come from AI frames only, marks from your own additions only", () => {
    for (const name of fixtureNames("sequence")) {
      const fx = fixture(name);
      const human = fx.humanSide;
      const ai: Side = human === "US" ? "USSR" : "US";
      let s = EMPTY_LAST_PLAY;
      const aiTouched = new Set<number>();
      const humanAdded = new Set<number>();
      for (const f of fx.frames) {
        for (const e of f.events) {
          if (e.t !== "influence") continue;
          if (f.actor === ai) aiTouched.add(e.country);
          if ((f.actor === human || f.actor === null) && e.side === human && e.to > e.from) humanAdded.add(e.country);
        }
        s = reduceLastPlay(s, f, human);
        for (const c of Object.keys(s.lastOpponent)) expect(aiTouched.has(Number(c)), `${name} ${f.seq}`).toBe(true);
        for (const [c, n] of Object.entries(s.placedThisPlay)) {
          expect(humanAdded.has(Number(c)), `${name} ${f.seq}`).toBe(true);
          expect(n, name).toBeGreaterThan(0);
        }
        if (f.events.some(e => e.t === "action-round" || e.t === "turn-start")) expect(s.placedThisPlay, `${name} ${f.seq}`).toEqual({});
      }
    }
  });

  it("the recorded undo restores the position: no pencil marks left", () => {
    const fx = fixture("seq-undo");
    const s = fx.frames.reduce((acc, f) => reduceLastPlay(acc, f, fx.humanSide), EMPTY_LAST_PLAY);
    expect(isUndoFrame(fx.frames[fx.frames.length - 1]!)).toBe(true);
    expect(s.placedThisPlay).toEqual({});
  });
});
