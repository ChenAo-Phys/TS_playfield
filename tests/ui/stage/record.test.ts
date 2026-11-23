/**
 * The game record behind the telex (src/ui/stage/record.ts): VP at the end of each turn and coups by
 * side from the log (complete across a resume) and from committed frames; both agree on a whole game.
 */
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../../../src/game/contract";
import { GameRecorder, mergeTally, tallyFromLog, vpOfScore, vpPoints, emptyTally } from "../../../src/ui/stage/record";
import { fixture } from "../../fixtures/load";

describe("tallyFromLog", () => {
  it("reads VP changes, turn ends and coups from a whole game's log", () => {
    const fx = fixture("game-full");
    const t = tallyFromLog(fx.final.log);
    const coupsInFrames = fx.frames.flatMap(f => f.events.flatMap(e => (e.t === "roll" && e.roll.type === "COUP" ? [e.roll.roller] : [])));
    expect(t.coups.US + t.coups.USSR).toBe(coupsInFrames.length);
    expect(t.coups.US).toBe(coupsInFrames.filter(s => s === "US").length);
    // Nine turns ended (the game ends at the end of turn 9).
    expect([...t.vpEnd.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(t.vpEnd.get(9)).toBe(20);
  });

  it("reads the vpScore messages", () => {
    expect(vpOfScore({ key: "log:vpScore.us", params: { n: 3 } })).toBe(3);
    expect(vpOfScore({ key: "log:vpScore.ussr", params: { n: 5 } })).toBe(-5);
    expect(vpOfScore({ key: "log:vpScore.tie" })).toBe(0);
    expect(vpOfScore({ key: "ui:app.title" })).toBeNull();
    expect(vpOfScore("text")).toBeNull();
  });

  it("is empty for an empty log", () => {
    expect(tallyFromLog([])).toEqual(emptyTally());
  });
});

describe("GameRecorder", () => {
  it("records the same turn ends as the log over a whole game, and the ending", () => {
    const fx = fixture("game-full");
    const rec = new GameRecorder();
    fx.frames.forEach((f, i) => rec.commit(f, 1000 + i * 1000));
    const log = tallyFromLog(fx.final.log);
    for (const [turn, vp] of rec.tally.vpEnd) expect(log.vpEnd.get(turn), `turn ${turn}`).toBe(vp);
    expect(rec.tally.vpEnd.size).toBeGreaterThanOrEqual(8);
    expect(rec.tally.coups).toEqual(log.coups);
    expect(rec.tally.final).toEqual({ turn: fx.final.ending!.turn, vp: fx.final.ending!.vpFinal });
    // It saw the game from its first frame: the playing time is the whole game.
    expect(rec.fromStart).toBe(true);
    expect(rec.playingMs(0)).toBe((fx.frames.length - 1) * 1000);
  });

  it("counts a frame once and has no playing time when it joined mid-game", () => {
    const fx = fixture("seq-ai-coup");
    const rec = new GameRecorder();
    for (const f of fx.frames) { rec.commit(f, 5); rec.commit(f, 6); }
    expect(rec.tally.coups).toEqual({ US: 1, USSR: 0 });
    expect(rec.fromStart).toBe(false);
    expect(rec.playingMs(100)).toBeNull();
  });
});

describe("vpPoints / mergeTally", () => {
  it("starts at 0, carries missing turns, ends on the final point", () => {
    const t = emptyTally();
    t.vpEnd.set(1, 3).set(3, -2);
    t.final = { turn: 5, vp: -20 };
    expect(vpPoints(t)).toEqual([{ turn: 0, vp: 0 }, { turn: 1, vp: 3 }, { turn: 2, vp: 3 }, { turn: 3, vp: -2 }, { turn: 4, vp: -2 }, { turn: 5, vp: -20 }]);
  });

  it("lets the ending replace that turn's end (held scoring at the turn's end)", () => {
    const t = emptyTally();
    t.vpEnd.set(1, 1).set(2, 4);
    t.final = { turn: 2, vp: -20 };
    expect(vpPoints(t)).toEqual([{ turn: 0, vp: 0 }, { turn: 1, vp: 1 }, { turn: 2, vp: -20 }]);
  });

  it("shows the current VP of a game in progress", () => {
    const t = emptyTally();
    t.vpEnd.set(1, 2);
    t.current = { turn: 2, vp: 5 };
    expect(vpPoints(t)).toEqual([{ turn: 0, vp: 0 }, { turn: 1, vp: 2 }, { turn: 2, vp: 5 }]);
  });

  it("merges: frames win per turn, coups take the larger count", () => {
    const log = emptyTally();
    log.vpEnd.set(1, 1).set(2, 2);
    log.coups = { US: 3, USSR: 1 };
    const frames = emptyTally();
    frames.vpEnd.set(2, 5);
    frames.coups = { US: 1, USSR: 2 };
    frames.final = { turn: 3, vp: 9 };
    const m = mergeTally(log, frames);
    expect([...m.vpEnd]).toEqual([[1, 1], [2, 5]]);
    expect(m.coups).toEqual({ US: 3, USSR: 2 });
    expect(m.final).toEqual({ turn: 3, vp: 9 });
    expect(mergeTally(log, null)).toBe(log);
  });

  it("backfills a resumed game's early turns from the log", () => {
    const fx = fixture("game-full");
    const half = Math.floor(fx.frames.length / 2);
    const rec = new GameRecorder();
    for (const f of fx.frames.slice(half)) rec.commit(f, 0);
    const log: readonly LogEntry[] = fx.final.log;
    const merged = vpPoints(mergeTally(tallyFromLog(log), rec.tally));
    const full = vpPoints(tallyFromLog(log));
    expect(merged.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(merged[merged.length - 1]).toEqual({ turn: fx.final.ending!.turn, vp: fx.final.ending!.vpFinal });
  });
});
