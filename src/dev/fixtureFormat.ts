/**
 * The UI fixture format (dev only; never imported by production code).
 *
 * A fixture is a slice of a real game recorded through the real controller with the real engine
 * (tests/fixtures/capture.test.ts): only what the UI receives -- redacted `Frame`s, `LogEntry`s, the
 * `ViewModel` and the controller's previews. Nothing from the raw engine.
 *
 * Two kinds:
 *  - "scene": one frame, already acked, with the ViewModel the UI shows at that moment (usually a
 *    human prompt). The UI renders it as a still.
 *  - "sequence": a base frame (what is on screen before) followed by frames to animate, then the
 *    ViewModel once the last frame is acked (a prompt, the ending, or the AI's turn).
 *
 * On disk, frame 0 carries its full state and every later frame only what changed against the
 * previous one (`encodeFrames` / `decodeFrames`), which keeps a whole game under 0.5 MB.
 */
import type { RegionScores } from "../engine/types";
import type { CoupOdds, Frame, LogEntry, PublicState, RealignOdds, Side, ViewModel } from "../game/contract";

export const FIXTURE_VERSION = 1;

/** A top-level change: keys set, keys deleted, and one level deeper for plain objects. */
export interface ObjectDelta {
  set?: Record<string, unknown>;
  del?: string[];
  sub?: Record<string, { set?: Record<string, unknown>; del?: string[] }>;
}

export interface EncodedFrame {
  seq: number;
  actor: Side | null;
  auto: boolean;
  events: Frame["events"];
  playId?: number;
  /** Frame 0: the full state. */
  state?: PublicState;
  /** Later frames: the change against the previous frame's state. */
  delta?: ObjectDelta;
  /** Present when the region scores differ from the previous frame's (always on frame 0). */
  regionScores?: RegionScores;
}

/** Per-frame ViewModel facts that are not in the frame itself. */
export interface FrameVm {
  /** vm.log ids as inclusive [first, last] ranges (an undo cuts the log and continues with new ids). */
  log: [number, number][];
  /** vm.queued when the frame became current, in the recorded game (its AI answered at once). */
  queued: number;
  status: ViewModel["status"];
}

export interface FixtureFile {
  v: typeof FIXTURE_VERSION;
  name: string;
  kind: "scene" | "sequence";
  description: string;
  /** Searchable facts: "prompt:<kind>", "event:<type>", "ending:<reason>", "human:<side>", "turn:<n>", ... */
  tags: string[];
  humanSide: Side;
  /** Where it was recorded (capture.test.ts game index, engine seed, frame seqs). */
  source: { game: number; seed: number; seqs: [number, number] };
  frames: EncodedFrame[];
  frameVm: FrameVm[];
  /** Every log entry any frame shows, ids ascending. */
  log: LogEntry[];
  /** The ViewModel once the last frame is acked (frame and log come from the last frame). */
  final: Omit<ViewModel, "frame" | "log" | "queued">;
  /** Controller previews at the final prompt (keys are country / card ids). */
  previews?: {
    coupOdds?: Record<string, CoupOdds | null>;
    effectiveOps?: Record<string, number | null>;
    realignOdds?: Record<string, RealignOdds | null>;
  };
  /** Scenes: the option index the recorded human chose at the final prompt. */
  chosen?: number;
}

/** A fixture ready to use: full frames and the ViewModel per frame. */
export interface Fixture {
  name: string;
  kind: "scene" | "sequence";
  description: string;
  tags: readonly string[];
  humanSide: Side;
  source: FixtureFile["source"];
  frames: readonly Frame[];
  /** vm.log while frame i is current. */
  logs: readonly (readonly LogEntry[])[];
  frameVm: readonly FrameVm[];
  /** The ViewModel once the last frame is acked. */
  final: ViewModel;
  previews: NonNullable<FixtureFile["previews"]>;
  chosen?: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The change from `prev` to `next` (one level of nesting for plain objects). */
export function objectDelta(prev: Record<string, unknown>, next: Record<string, unknown>): ObjectDelta {
  const d: ObjectDelta = {};
  for (const [k, v] of Object.entries(next)) {
    const p = prev[k];
    if (same(p, v)) continue;
    if (isPlainObject(p) && isPlainObject(v)) {
      const set: Record<string, unknown> = {};
      const del: string[] = [];
      for (const [kk, vv] of Object.entries(v)) if (!same(p[kk], vv)) set[kk] = vv;
      for (const kk of Object.keys(p)) if (!(kk in v)) del.push(kk);
      (d.sub ??= {})[k] = { ...(Object.keys(set).length ? { set } : {}), ...(del.length ? { del } : {}) };
    } else {
      (d.set ??= {})[k] = v;
    }
  }
  for (const k of Object.keys(prev)) if (!(k in next)) (d.del ??= []).push(k);
  return d;
}

/** `prev` with `d` applied (a new object; `prev` is not changed). */
export function applyDelta<T extends Record<string, unknown>>(prev: T, d: ObjectDelta): T {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(d.set ?? {})) out[k] = v;
  for (const k of d.del ?? []) delete out[k];
  for (const [k, sd] of Object.entries(d.sub ?? {})) {
    const inner: Record<string, unknown> = { ...(out[k] as Record<string, unknown>) };
    for (const [kk, vv] of Object.entries(sd.set ?? {})) inner[kk] = vv;
    for (const kk of sd.del ?? []) delete inner[kk];
    out[k] = inner;
  }
  return out as T;
}

export function encodeFrames(frames: readonly Frame[]): EncodedFrame[] {
  return frames.map((f, i) => {
    const e: EncodedFrame = { seq: f.seq, actor: f.actor, auto: f.auto, events: f.events };
    if (f.playId !== undefined) e.playId = f.playId;
    if (i === 0) {
      e.state = f.state;
      e.regionScores = f.regionScores;
    } else {
      const prev = frames[i - 1]!;
      e.delta = objectDelta(prev.state as unknown as Record<string, unknown>, f.state as unknown as Record<string, unknown>);
      if (!same(prev.regionScores, f.regionScores)) e.regionScores = f.regionScores;
    }
    return e;
  });
}

export function decodeFrames(encoded: readonly EncodedFrame[]): Frame[] {
  const out: Frame[] = [];
  for (const [i, e] of encoded.entries()) {
    const prev = out[i - 1];
    const state = i === 0 || !prev
      ? (e.state as PublicState)
      : applyDelta(prev.state as unknown as Record<string, unknown>, e.delta ?? {}) as unknown as PublicState;
    const regionScores = e.regionScores ?? prev?.regionScores;
    if (!state || !regionScores) throw new Error(`fixture frame ${i} has no state / region scores`);
    const f: Frame = { seq: e.seq, state, regionScores, actor: e.actor, events: e.events, auto: e.auto };
    if (e.playId !== undefined) f.playId = e.playId;
    out.push(f);
  }
  return out;
}

/** Log ids as inclusive ranges. */
export function idRanges(ids: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const id of ids) {
    const last = out[out.length - 1];
    if (last && id === last[1] + 1) last[1] = id;
    else out.push([id, id]);
  }
  return out;
}

function inRanges(id: number, ranges: readonly [number, number][]): boolean {
  return ranges.some(([a, b]) => id >= a && id <= b);
}

export function decodeFixture(file: FixtureFile): Fixture {
  if (file.v !== FIXTURE_VERSION) throw new Error(`fixture ${file.name}: version ${file.v}, expected ${FIXTURE_VERSION}`);
  const frames = decodeFrames(file.frames);
  const logs = file.frameVm.map(fv => file.log.filter(e => inRanges(e.id, fv.log)));
  const last = frames[frames.length - 1]!;
  const final: ViewModel = { ...file.final, frame: last, log: logs[logs.length - 1] ?? [], queued: 0 };
  return {
    name: file.name, kind: file.kind, description: file.description, tags: file.tags, humanSide: file.humanSide,
    source: file.source, frames, logs, frameVm: file.frameVm, final, previews: file.previews ?? {}, chosen: file.chosen,
  };
}

/** The index file (tests/fixtures/ui/index.json): one row per fixture. */
export interface FixtureIndexRow {
  name: string;
  kind: "scene" | "sequence";
  description: string;
  tags: string[];
  frames: number;
  bytes: number;
}
