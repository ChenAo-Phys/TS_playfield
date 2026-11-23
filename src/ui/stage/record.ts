/**
 * The game's record for the game-over telex (ui-spec §10.4): VP at the end of each turn (the VP chart),
 * coups by side, and the playing time.
 *
 * Two public sources, merged:
 *  - `GameRecorder` records from committed frames (the runner's commits): the end-of-turn frame (it
 *    carries `turn-start`) gives the VP at the end of the previous turn, `roll` COUP events count coups,
 *    `game-over` gives the final point. It only sees frames shown in this page session, so after a resume
 *    it starts at the resume point.
 *  - `tallyFromLog(vm.log)` reads the same facts from the log, which the controller rebuilds in full on a
 *    resume: `log:change.vp` details (the VP after the change, per entry turn), `log:session.endOfTurn`
 *    (completed turns) and `log:roll.coup*` details (coups by roller).
 *
 * `mergeTally(log, frames)` takes the log as the base and lets frame records win where both have a turn.
 * Pure (no React); the store owns one `GameRecorder` per game.
 */
import type { Frame, LogEntry, Side } from "../../game/contract";
import type { Message } from "../../i18n";

export interface VpPoint {
  turn: number;
  /** US-positive VP. */
  vp: number;
}

export interface GameTally {
  /** VP at the end of each completed turn. */
  vpEnd: Map<number, number>;
  coups: { US: number; USSR: number };
  /** The ending's point (turn of the ending, final VP), when the game is over. */
  final: VpPoint | null;
  /** The latest VP seen (an ongoing game). */
  current: VpPoint | null;
}

export const emptyTally = (): GameTally => ({ vpEnd: new Map(), coups: { US: 0, USSR: 0 }, final: null, current: null });

const isMsg = (x: unknown): x is Message => !!x && typeof x === "object" && "key" in (x as object);
const sideOf = (x: unknown): Side | null => {
  const s = x && typeof x === "object" ? (x as { side?: unknown }).side : x;
  return s === "US" || s === "USSR" ? s : null;
};

/** The VP a `log:vpScore.*` message stands for (US-positive), else null. */
export function vpOfScore(m: unknown): number | null {
  if (!isMsg(m)) return null;
  const n = Number((m.params as { n?: unknown } | undefined)?.n ?? 0);
  if (m.key === "log:vpScore.us") return n;
  if (m.key === "log:vpScore.ussr") return -n;
  if (m.key === "log:vpScore.tie") return 0;
  return null;
}

/** Facts of the whole game from its log (see the header). */
export function tallyFromLog(log: readonly LogEntry[]): GameTally {
  const t = emptyTally();
  let vp = 0;
  let lastTurn = 0;
  for (const e of log) {
    for (const m of [e.text, ...(e.details ?? [])]) {
      if (!isMsg(m)) continue;
      if (m.key === "log:change.vp") {
        const to = vpOfScore(m.params?.to);
        if (to !== null) vp = to;
      } else if (m.key === "log:roll.coup" || m.key === "log:roll.coupWithCard") {
        const s = sideOf(m.params?.roller);
        if (s) t.coups[s]++;
      }
    }
    lastTurn = Math.max(lastTurn, e.turn);
    if (e.text.key === "log:session.endOfTurn") {
      const turn = Number((e.text.params as { turn?: unknown } | undefined)?.turn ?? e.turn);
      t.vpEnd.set(turn, vp);
    }
  }
  if (log.length) t.current = { turn: Math.max(1, lastTurn), vp };
  return t;
}

/** Records the game's facts from committed frames (see the header). */
export class GameRecorder {
  readonly tally: GameTally = emptyTally();
  /** When the first frame was recorded (ms, the `now` passed in). */
  startedAt: number | null = null;
  /** When the game ended (the game-over frame). */
  endedAt: number | null = null;
  /** True when the first recorded frame was the game's start (so the playing time is the whole game). */
  fromStart = false;
  private readonly seen = new Set<number>();

  /** Start the clock at the first board seen (setup or turn 1's headline = the game's start). */
  start(state: { turn: number; action_round: number }, now: number): void {
    if (this.startedAt !== null) return;
    this.startedAt = now;
    this.fromStart = state.turn <= 1 && state.action_round === 0;
  }

  /** Record one committed frame. */
  commit(frame: Frame, now: number): void {
    if (this.seen.has(frame.seq)) return;
    this.seen.add(frame.seq);
    this.start(frame.state, now);
    const vp = frame.state.victory_points;
    for (const e of frame.events) {
      if (e.t === "turn-start" && e.turn > 1) this.tally.vpEnd.set(e.turn - 1, vp);
      else if (e.t === "roll" && e.roll.type === "COUP") {
        const s = sideOf(e.roll.roller);
        if (s) this.tally.coups[s]++;
      } else if (e.t === "game-over") {
        this.tally.final = { turn: e.ending.turn, vp: e.ending.vpFinal };
        this.endedAt = now;
      }
    }
    this.tally.current = { turn: frame.state.turn, vp };
  }

  /** The playing time in ms, when the recorder saw the whole game; else null. */
  playingMs(now: number): number | null {
    if (this.startedAt === null || !this.fromStart) return null;
    return Math.max(0, (this.endedAt ?? now) - this.startedAt);
  }
}

/**
 * The log's tally with the frames' records on top: frame-recorded turns win, coups are the larger
 * count (the log has the whole game; frames may have started later), the final point from either.
 */
export function mergeTally(log: GameTally, frames: GameTally | null): GameTally {
  if (!frames) return log;
  const vpEnd = new Map(log.vpEnd);
  for (const [turn, vp] of frames.vpEnd) vpEnd.set(turn, vp);
  return {
    vpEnd,
    coups: {
      US: Math.max(log.coups.US, frames.coups.US),
      USSR: Math.max(log.coups.USSR, frames.coups.USSR),
    },
    final: frames.final ?? log.final,
    current: frames.current ?? log.current,
  };
}

/**
 * The VP-by-turn points for the chart: the start (turn 0, VP 0), the end of every completed turn in
 * order (a turn missing from the record carries the previous value), then the final point of an ended
 * game or the current one.
 */
export function vpPoints(t: GameTally): VpPoint[] {
  const end = t.final ?? t.current;
  const turns = [...t.vpEnd.keys()].filter(n => n >= 1);
  const last = Math.max(0, ...turns, end ? end.turn - 1 : 0);
  const out: VpPoint[] = [{ turn: 0, vp: 0 }];
  let vp = 0;
  for (let turn = 1; turn <= last; turn++) {
    if (end && turn >= end.turn) break;
    vp = t.vpEnd.get(turn) ?? vp;
    out.push({ turn, vp });
  }
  if (end) out.push({ turn: end.turn, vp: end.vp });
  return out;
}
