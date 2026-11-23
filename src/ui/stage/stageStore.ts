/**
 * The stage's state and beat handlers (ui-spec §9.4 rows reveal / roll / headline-reveal / scoring /
 * banner / game-over, §9.5, §10), without React so it runs in Node tests.
 *
 * One store per UiRoot (its Director; see `useStageStore`). Components register its handlers with the
 * director and draw its state; the handlers own the timing (durations from `TIMING`, scaled by the
 * frame speed with `dur()`) and resolve when their beat is done, so the frame runner can go on.
 * On `signal.abort` (Skip) a handler jumps to its end state and resolves at once.
 *
 *  - reveal (AI, and every headline card): the reveal dock enters (flight + caption), holds, then stays
 *    pinned (desktop/tablet) until the next card-played, action-round or human prompt, then collapses
 *    into the anchor of the card's location. Compact: no pinned dock (the shell's ticker shows the play).
 *  - country: dock avoidance (the dock moves top-left when a changed box lies under it, the whole dock:
 *    `env.dockRect`) and the how line's target. A rolled country under the dock moves it too, and a scoring
 *    sheet clears it away (`clearSheet`: the other corner, else folded).
 *  - roll: the dice tray (lock → tumble → math → hold); it stays until the frame commits.
 *  - headline-reveal: the newspapers; wait for Continue (`pauseOnReveals`) or hold, then fold.
 *  - scoring: the scoring sheet (in → rows → net → wait/hold); spotlights the region; stays until commit.
 *  - banner: the turn / phase banner (in → hold → out).
 *  - game-over: the 600 ms beat (white-out for nuclear war, Europe lit for Europe control), the final
 *    scoring sheet for a final-scoring ending, then the telex.
 *  - track: action-round releases the dock; DEFCON to/from 2 drives the danger frame ahead of the commit.
 */
import type { RegionScore, RegionScores } from "../../engine/types";
import type { Ending, Frame, LogEntry, PlayHow, PublicState, Side, ViewModel } from "../../game/contract";
import { dur, SPEED_FACTOR, TIMING, type LayoutKind } from "../theme";
import type { AnchorId, AnchorRegistry, Beat, BeatContext, BeatHandler, Director, RegionSlot, UiSettings } from "../ui-contract";
import { DEFAULT_SETTINGS } from "../ui-contract";
import {
  boxOf, cancelledHeadline, cappedVp, collapseAnchor, diceAnchor, diceModel, dockBesideSheet, eraOf, eraStampOf, finalScoringRows, opponentNote,
  overlaps, playedBy, rollCountry, scoringRows, scoringSlot, type Box, type DiceModel,
} from "./model";
import { GameRecorder, mergeTally, tallyFromLog, type GameTally } from "./record";

// ── State ─────────────────────────────────────────────────────────────────────────────────────

export interface DockState {
  key: number;
  card: number;
  side: Side;
  how: PlayHow;
  byHuman: boolean;
  /** enter (flight + caption) → hold → pinned (desktop) / gone (compact); leaving while collapsing. */
  phase: "enter" | "hold" | "pinned" | "leaving";
  /** Avoidance: the dock moves to the table's top left for the rest of the play. */
  pos: "right" | "left";
  /** The play's first target (how line "→ Angola"). */
  country: number | null;
  /** The card's owner when an opponent card is played for Ops (its event happens for them). */
  note: Side | null;
  /** Flight source of the entering card (the adversary dossier, or the table centre for headlines). */
  from: AnchorId | null;
  compact: boolean;
  /** ms of the enter phase (flight + caption), of its flight part, the hold, and the collapse when leaving. */
  enterMs: number;
  flightMs: number;
  holdMs: number;
  leaveMs: number;
  /** Collapse target (the card's pile), null = fade in place. */
  to: AnchorId | null;
}

export interface DiceState {
  key: number;
  anchor: AnchorId;
  model: DiceModel;
  phase: "lock" | "tumble" | "math" | "hold" | "out";
  ms: { lock: number; tumble: number; math: number; hold: number };
}

export interface PapersState {
  key: number;
  us: number;
  ussr: number;
  first: Side;
  turn: number;
  /** A headline cancelled in this frame (Defectors), else 0. */
  cancelled: number;
  phase: "drop" | "read" | "fold";
  ms: { drop: number; stamp: number; fold: number };
}

export interface ScoringState {
  key: number;
  /** Scoring card, or 0 for the combined final-scoring sheet. */
  card: number;
  slot: RegionSlot | null;
  /**
   * The US-positive net the result bar shows: its rows' (the region score's net; the final scoring's
   * regions + the China Card), so the bar always agrees with the table.
   */
  vp: number;
  /**
   * The VP the engine actually moved when the VP track stopped the change at ±20 (the sheet notes it),
   * else null / absent.
   */
  capped?: number | null;
  /** Final scoring: the China Card's holder (+1 VP, its own row). */
  china?: Side | null;
  score: RegionScore | null;
  /** All regions (final scoring). */
  scores: RegionScores | null;
  by: Side | null;
  phase: "in" | "rows" | "net" | "read" | "out";
  rows: number;
  ms: { in: number; row: number; net: number };
}

export interface BannerState {
  key: number;
  kind: "turn" | "phase";
  turn: number;
  era: "early" | "mid" | "late";
  eraStamp: "mid" | "late" | null;
  phase: "in" | "hold" | "out";
  ms: { in: number; hold: number; out: number };
}

export interface OverState {
  key: number;
  ending: Ending;
  /** beat: the pause before the telex (special presentation); shown: the telex. */
  phase: "beat" | "shown";
  effect: "whiteout" | "europe" | null;
  ms: { beat: number; rise: number; stamp: number; chart: number };
}

export interface StageState {
  dock: DockState | null;
  /** Docks collapsing into their pile. */
  leaving: readonly DockState[];
  dice: DiceState | null;
  papers: PapersState | null;
  scoring: ScoringState | null;
  banner: BannerState | null;
  over: OverState | null;
  /** A big moment waiting for Continue (`pauseOnReveals`). */
  waiting: "headline" | "scoring" | null;
  /** Region spotlit by the stage (scoring, Europe control). */
  focusRegion: RegionSlot | null;
  /** DEFCON-2 frame override while a frame animates (null = follow Shown.state). */
  danger: boolean | null;
}

export const EMPTY_STAGE: StageState = {
  dock: null, leaving: [], dice: null, papers: null, scoring: null, banner: null, over: null, waiting: null, focusRegion: null, danger: null,
};

// ── Environment ───────────────────────────────────────────────────────────────────────────────

export interface StageEnv {
  anchors: AnchorRegistry;
  layout: LayoutKind;
  settings: UiSettings;
  /** Reduced motion (setting × system). */
  reduced: boolean;
  /**
   * The whole reveal dock's viewport box (card and caption), for avoidance; the Stage sets it. Absent: the
   * `dock` anchor (its card).
   */
  dockRect?(): DOMRect | null;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Timers outside beats (fades after commit, collapses). */
  later(ms: number, fn: () => void): void;
  now(): number;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

const NO_ANCHORS: AnchorRegistry = { ref: () => () => undefined, rect: () => null };

export function defaultEnv(): StageEnv {
  return {
    anchors: NO_ANCHORS, layout: "desktop", settings: DEFAULT_SETTINGS, reduced: false,
    sleep: defaultSleep,
    later: (ms, fn) => { if (ms <= 0) fn(); else setTimeout(fn, ms); },
    now: () => Date.now(),
  };
}

/** Short cross-fade of the reduced-motion variants (ui-spec §9.3: ≤ 150 ms). */
export const REDUCED_FADE = 150;

/** Names of the store's beat handlers (`StageStore.handlers`). */
export type StageHandler = "reveal" | "country" | "roll" | "headline" | "scoring" | "banner" | "gameOver" | "dockTrack" | "dangerTrack";

const isCompact = (l: LayoutKind) => l === "compact" || l === "compact-landscape";

// ── Store ─────────────────────────────────────────────────────────────────────────────────────

export class StageStore {
  env: StageEnv;
  private state: StageState = EMPTY_STAGE;
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private continueWait: (() => void) | null = null;
  /** The latest board the stage knows (a beat's frame state, or the last commit). */
  private latest: PublicState | null = null;
  /** Region scores of the last committed frame: the board before the frame being animated. */
  private lastScores: RegionScores | null = null;
  private recorder = new GameRecorder();
  private gameKey: string | null = null;
  private log: readonly LogEntry[] = [];

  constructor(env: Partial<StageEnv> = {}) {
    this.env = { ...defaultEnv(), ...env };
  }

  configure(env: Partial<StageEnv>): void {
    Object.assign(this.env, env);
  }

  // ── store protocol ──────────────────────────────────────────────────────────────────────────

  getState = (): StageState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(patch: Partial<StageState>): void {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) if ((this.state as unknown as Record<string, unknown>)[k] !== v) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private nextKey(): number {
    return ++this.seq;
  }

  /** Motion factor outside a beat (collapses after a prompt): the speed setting alone. */
  private idleMotion(): number {
    return SPEED_FACTOR[this.env.settings.speed] ?? 1;
  }

  // ── Continue (pauseOnReveals) ───────────────────────────────────────────────────────────────

  /** End the current wait (Continue button, Space / Enter / Esc on the waiting overlay, the slip). */
  proceed = (): void => {
    const go = this.continueWait;
    this.continueWait = null;
    if (this.state.waiting) this.set({ waiting: null });
    go?.();
  };

  private waitForContinue(kind: "headline" | "scoring", signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    this.continueWait?.();
    this.set({ waiting: kind });
    return new Promise(resolve => {
      const done = () => {
        signal.removeEventListener("abort", done);
        if (this.continueWait === done) this.continueWait = null;
        if (this.state.waiting === kind) this.set({ waiting: null });
        resolve();
      };
      this.continueWait = done;
      signal.addEventListener("abort", done, { once: true });
    });
  }

  /** Hold for reading, or wait for Continue when the setting says so. */
  private async readOrWait(kind: "headline" | "scoring", holdMs: number, ctx: BeatContext): Promise<void> {
    if (ctx.settings.pauseOnReveals) await this.waitForContinue(kind, ctx.signal);
    else await this.env.sleep(holdMs, ctx.signal);
  }

  // ── Handlers (register each with the director) ─────────────────────────────────────────────

  /**
   * The handlers by name, each with its beat kind. Components attach the ones they own:
   * RevealDock `reveal` `country` `dockTrack`, DiceTray `roll`, HeadlinePapers `headline`, ScoringSheet
   * `scoring`, TurnBanner `banner`, GameOverTelex `gameOver`, DangerFrame `dangerTrack`.
   */
  readonly handlers = {
    reveal: { kind: "reveal", run: (b: Extract<Beat, { k: "reveal" }>, ctx: BeatContext) => this.onReveal(b, ctx) },
    country: { kind: "country", run: (b: Extract<Beat, { k: "country" }>, ctx: BeatContext) => this.onCountry(b, ctx) },
    roll: { kind: "roll", run: (b: Extract<Beat, { k: "roll" }>, ctx: BeatContext) => this.onRoll(b, ctx) },
    headline: { kind: "headline-reveal", run: (b: Extract<Beat, { k: "headline-reveal" }>, ctx: BeatContext) => this.onHeadline(b, ctx) },
    scoring: { kind: "scoring", run: (b: Extract<Beat, { k: "scoring" }>, ctx: BeatContext) => this.onScoring(b, ctx) },
    banner: { kind: "banner", run: (b: Extract<Beat, { k: "banner" }>, ctx: BeatContext) => this.onBanner(b, ctx) },
    gameOver: { kind: "game-over", run: (b: Extract<Beat, { k: "game-over" }>, ctx: BeatContext) => this.onGameOver(b, ctx) },
    dockTrack: { kind: "track", run: (b: Extract<Beat, { k: "track" }>, ctx: BeatContext) => this.onDockTrack(b, ctx) },
    dangerTrack: { kind: "track", run: (b: Extract<Beat, { k: "track" }>) => this.onDangerTrack(b) },
  } as const;

  /** Register the named handlers with a director; returns the unregister function. */
  attach(director: Director, names: readonly StageHandler[]): () => void {
    const offs = names.map(n => {
      const h = this.handlers[n];
      return director.on(h.kind, h.run as unknown as BeatHandler<typeof h.kind>);
    });
    return () => { for (const off of offs) off(); };
  }

  // ── reveal dock ─────────────────────────────────────────────────────────────────────────────

  async onReveal(b: Extract<Beat, { k: "reveal" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    const headline = b.how === "headline";
    // Any new card play ends the previous one (ui-spec §9.5).
    this.releaseDock(ctx.frame.state);
    if (b.card <= 0 || (b.byHuman && !headline)) return; // the human's card goes to the slip (tray)
    const compact = isCompact(this.env.layout);
    if (compact && headline) return; // the papers were the reveal; the ticker shows the play
    const m = ctx.speed.motion;
    const reduced = this.env.reduced;
    const T = TIMING.aiCardReveal;
    const enterMs = m <= 0 ? 0 : reduced ? REDUCED_FADE : headline ? dur(T.dock, m) : dur(T.flight + T.caption, m);
    const flightMs = m <= 0 || reduced ? 0 : headline ? dur(T.dock, m) : dur(T.flight, m);
    const holdMs = headline ? 0 : dur(T.hold, ctx.speed.hold);
    const dock: DockState = {
      key: this.nextKey(), card: b.card, side: b.side, how: b.how, byHuman: b.byHuman, phase: "enter", pos: "right",
      country: null, note: opponentNote(b.card, b.side, b.how), from: headline ? "stage" : `hand:${b.side}`, compact,
      enterMs, flightMs, holdMs, leaveMs: 0, to: null,
    };
    this.set({ dock });
    await this.env.sleep(enterMs, ctx.signal);
    if (this.state.dock?.key !== dock.key) return;
    if (!ctx.signal.aborted && holdMs > 0) {
      this.set({ dock: { ...this.state.dock, phase: "hold" } });
      await this.env.sleep(holdMs, ctx.signal);
    }
    const d = this.state.dock;
    if (d?.key !== dock.key) return;
    if (compact) this.releaseDock(null, true);
    else this.set({ dock: { ...d, phase: "pinned" } });
  }

  /**
   * Collapse the current dock into the pile its card is in (`state.card_locations`), or fade it. The
   * stage calls it when the runner clears `Shown.aiPlayCard` or a human prompt opens.
   */
  releaseDock(state: PublicState | null = this.latest, up = false): void {
    const d = this.state.dock;
    if (!d) return;
    const loc = (state ?? this.latest)?.card_locations?.[String(d.card)];
    const to = up ? null : collapseAnchor(loc);
    const m = this.idleMotion();
    const leaveMs = m <= 0 ? 0 : this.env.reduced ? REDUCED_FADE : dur(up ? TIMING.aiCardReveal.dock : TIMING.cardToPile.dur, m);
    const gone: DockState = { ...d, phase: "leaving", to, leaveMs };
    if (leaveMs <= 0) {
      this.set({ dock: null });
      return;
    }
    this.set({ dock: null, leaving: [...this.state.leaving, gone] });
    this.env.later(leaveMs, () => {
      this.set({ leaving: this.state.leaving.filter(x => x.key !== gone.key) });
    });
  }

  /** The dock the runner no longer pins (Shown.aiPlayCard changed) or that a prompt ends. */
  syncDock(aiPlayCard: number, promptOpen: boolean, state: PublicState | null): void {
    const d = this.state.dock;
    if (!d || d.phase !== "pinned") return;
    const over = d.byHuman ? promptOpen : aiPlayCard !== d.card || promptOpen;
    if (over) this.releaseDock(state);
  }

  async onCountry(b: Extract<Beat, { k: "country" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    const d = this.state.dock;
    if (!d || d.phase === "leaving") return;
    let next = d;
    if (d.country === null && d.how !== "headline") next = { ...next, country: b.country };
    next = this.offCountry(next, b.country);
    if (next !== d) this.set({ dock: next });
  }

  /** The dock moved off a country box it covers (desktop / tablet): to the top left for the rest of the play. */
  private offCountry(d: DockState, country: number): DockState {
    if (d.pos !== "right" || d.compact) return d;
    const box = this.env.anchors.rect(`country:${country}`);
    const dock = this.env.dockRect?.() ?? this.env.anchors.rect("dock");
    return box && dock && overlaps(boxOf(dock), boxOf(box), 8) ? { ...d, pos: "left" } : d;
  }

  /**
   * A scoring sheet is up (desktop / tablet): it must never lie under the AI's pinned reveal dock (R-006).
   * The sheet reports its box and the dock as drawn: its side (`pos`), its box there (`here`) and in the
   * other top corner of the table (`there`). The dock moves to that corner for the rest of the play (as for
   * a covered country), or folds into its pile when the table is too narrow for both (the sheet's kicker
   * names the play). Idempotent: the move is to the side away from the drawn one.
   */
  clearSheet(sheet: Box, dock: { pos: DockState["pos"]; here: Box; there: Box }): void {
    const d = this.state.dock;
    if (!d || d.compact || d.phase === "leaving") return;
    const move = dockBesideSheet(sheet, dock.here, dock.there);
    const away = dock.pos === "right" ? "left" : "right";
    if (move === "move" && d.pos !== away) this.set({ dock: { ...d, pos: away } });
    else if (move === "fold") this.releaseDock(this.latest);
  }

  // ── dice ────────────────────────────────────────────────────────────────────────────────────

  async onRoll(b: Extract<Beat, { k: "roll" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    const roll = b.roll;
    const d = this.state.dock;
    // Only a coup, realignment or war names a target: a Space Race roll keeps its box in country_id (R-007).
    // The dock leaves a target box it covers before the tray locks on (R-006).
    const c = rollCountry(roll);
    if (d && c !== null && d.phase !== "leaving") {
      const next = this.offCountry(d.country === null ? { ...d, country: c } : d, c);
      if (next !== d) this.set({ dock: next });
    }
    const m = ctx.speed.motion, h = ctx.speed.hold;
    const T = TIMING.roll;
    const reduced = this.env.reduced || m <= 0;
    const ms = {
      lock: reduced ? 0 : dur(T.lock, m),
      tumble: reduced ? 0 : dur(T.tumble, m),
      math: reduced ? (m > 0 ? REDUCED_FADE : 0) : dur(T.math, m),
      hold: dur(roll.type === "REALIGNMENT" ? T.holdShort : T.hold, h),
    };
    const dice: DiceState = { key: this.nextKey(), anchor: diceAnchor(roll), model: diceModel(roll, ctx.frame, ctx.before), phase: reduced ? "math" : "lock", ms };
    this.set({ dice });
    const step = async (phase: DiceState["phase"], wait: number) => {
      if (ctx.signal.aborted || this.state.dice?.key !== dice.key) return;
      if (this.state.dice.phase !== phase) this.set({ dice: { ...this.state.dice, phase } });
      await this.env.sleep(wait, ctx.signal);
    };
    if (!reduced) {
      await step("lock", ms.lock);
      await step("tumble", ms.tumble);
    }
    await step("math", ms.math);
    await step("hold", ms.hold);
    if (ctx.signal.aborted && this.state.dice?.key === dice.key && this.state.dice.phase !== "hold") {
      this.set({ dice: { ...this.state.dice, phase: "hold" } });
    }
  }

  // ── headline papers ─────────────────────────────────────────────────────────────────────────

  async onHeadline(b: Extract<Beat, { k: "headline-reveal" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    const m = ctx.speed.motion;
    const T = TIMING.headlineReveal;
    const reduced = this.env.reduced;
    const fade = m > 0 ? REDUCED_FADE : 0;
    const papers: PapersState = {
      key: this.nextKey(), us: b.us, ussr: b.ussr, first: b.first, turn: ctx.before.turn || ctx.frame.state.turn,
      cancelled: cancelledHeadline(ctx.frame, b.us, b.ussr), phase: "drop",
      ms: { drop: reduced ? fade : dur(T.drop, m), stamp: reduced ? 0 : dur(T.stamp, m), fold: reduced ? fade : dur(T.fold, m) },
    };
    this.set({ papers });
    try {
      await this.env.sleep(papers.ms.drop + papers.ms.stamp, ctx.signal);
      if (ctx.signal.aborted) return;
      this.set({ papers: { ...papers, phase: "read" } });
      await this.readOrWait("headline", dur(T.hold, ctx.speed.hold), ctx);
      if (ctx.signal.aborted) return;
      this.set({ papers: { ...papers, phase: "fold" } });
      await this.env.sleep(papers.ms.fold, ctx.signal);
    } finally {
      if (this.state.papers?.key === papers.key) this.set({ papers: null, waiting: this.state.waiting === "headline" ? null : this.state.waiting });
    }
  }

  // ── scoring sheet ───────────────────────────────────────────────────────────────────────────

  async onScoring(b: Extract<Beat, { k: "scoring" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    const slot = scoringSlot(b.card);
    const pick = (s: RegionScores | null | undefined) => (slot === null ? undefined : s?.regions.find(r => r.slot === slot));
    // The board before the frame (the last commit); the frame's own when only that one agrees with the engine.
    const before = pick(this.lastScores), after = pick(b.scores);
    const score = (before && before.net !== b.vp && after?.net === b.vp ? after : before ?? after) ?? null;
    // The bar shows the rows' net; when the VP track stopped the change at ±20, the sheet says what moved.
    const net = score ? score.net : b.vp;
    await this.showScoring({
      card: b.card, slot, vp: net, capped: cappedVp(net, b.vp, ctx.frame.state.victory_points), score, scores: null,
      by: playedBy(ctx.frame, b.card),
    }, ctx);
  }

  private async showScoring(s: Pick<ScoringState, "card" | "slot" | "vp" | "capped" | "china" | "score" | "scores" | "by">, ctx: BeatContext): Promise<void> {
    const m = ctx.speed.motion;
    const T = TIMING.scoring;
    const reduced = this.env.reduced || m <= 0;
    const rows = s.score ? scoringRows(s.score).length : s.scores ? finalScoringRows(s.scores, s.china ?? null).rows.length : 0;
    const sheet: ScoringState = {
      key: this.nextKey(), ...s, phase: "in", rows,
      ms: { in: reduced ? (m > 0 ? REDUCED_FADE : 0) : dur(T.in, m), row: reduced ? 0 : dur(T.row, m), net: reduced ? 0 : dur(T.net, m) },
    };
    this.set({ scoring: sheet, focusRegion: s.slot });
    const step = async (phase: ScoringState["phase"], wait: number) => {
      if (ctx.signal.aborted || this.state.scoring?.key !== sheet.key) return;
      this.set({ scoring: { ...this.state.scoring, phase } });
      await this.env.sleep(wait, ctx.signal);
    };
    await this.env.sleep(sheet.ms.in, ctx.signal);
    await step("rows", sheet.ms.row * rows);
    await step("net", sheet.ms.net);
    if (!ctx.signal.aborted && this.state.scoring?.key === sheet.key) {
      this.set({ scoring: { ...this.state.scoring, phase: "read" } });
      await this.readOrWait("scoring", dur(T.hold, ctx.speed.hold), ctx);
    }
    if (this.state.scoring?.key === sheet.key && this.state.scoring.phase !== "read") this.set({ scoring: { ...this.state.scoring, phase: "read" } });
  }

  // ── banners ─────────────────────────────────────────────────────────────────────────────────

  async onBanner(b: Extract<Beat, { k: "banner" }>, ctx: BeatContext): Promise<void> {
    if (b.kind === "phase" && b.phase !== "HEADLINE") return;
    const m = ctx.speed.motion, h = ctx.speed.hold;
    const turn = b.turn ?? ctx.frame.state.turn;
    const eraStamp = b.kind === "turn" ? eraStampOf(turn) : null;
    const reduced = this.env.reduced;
    const fade = m > 0 ? REDUCED_FADE : 0;
    const T = b.kind === "turn" ? TIMING.turnStart : TIMING.phaseBanner;
    const hold = b.kind === "turn" ? (eraStamp ? TIMING.turnStart.holdEra : TIMING.turnStart.hold) : TIMING.phaseBanner.hold;
    const banner: BannerState = {
      key: this.nextKey(), kind: b.kind, turn, era: eraOf(turn), eraStamp, phase: "in",
      ms: { in: reduced ? fade : dur(T.in, m), hold: dur(hold, h), out: reduced ? fade : dur(T.out, m) },
    };
    if (banner.ms.in + banner.ms.hold + banner.ms.out <= 0) return;
    this.set({ banner });
    try {
      await this.env.sleep(banner.ms.in, ctx.signal);
      if (ctx.signal.aborted) return;
      this.set({ banner: { ...banner, phase: "hold" } });
      await this.env.sleep(banner.ms.hold, ctx.signal);
      if (ctx.signal.aborted) return;
      this.set({ banner: { ...banner, phase: "out" } });
      await this.env.sleep(banner.ms.out, ctx.signal);
    } finally {
      if (this.state.banner?.key === banner.key) this.set({ banner: null });
    }
  }

  // ── game over ───────────────────────────────────────────────────────────────────────────────

  async onGameOver(b: Extract<Beat, { k: "game-over" }>, ctx: BeatContext): Promise<void> {
    this.latest = ctx.frame.state;
    this.releaseDock(ctx.frame.state);
    const m = ctx.speed.motion;
    const T = TIMING.gameOver;
    const reason = b.ending.reason;
    const reduced = this.env.reduced;
    const nuclear = reason === "defcon" || reason === "cmc-suicide";
    const effect: OverState["effect"] = nuclear ? "whiteout" : reason === "europe-control" ? "europe" : null;
    const beatMs = m <= 0 ? 0 : nuclear ? dur(2000, m) : dur(T.beat, m);
    const over: OverState = {
      key: this.nextKey(), ending: b.ending, phase: "beat", effect,
      ms: { beat: beatMs, rise: reduced ? (m > 0 ? REDUCED_FADE : 0) : dur(T.rise, m), stamp: reduced ? 0 : dur(T.stamp, m), chart: reduced ? 0 : dur(T.chart, m) },
    };
    this.set({ over, focusRegion: effect === "europe" ? 0 : this.state.focusRegion });
    await this.env.sleep(beatMs, ctx.signal);
    // The game-over frame's board is the one final scoring scored (Shuttle Diplomacy, which final scoring
    // ignores, is already cleared there); the last commit's otherwise.
    const scores = ctx.frame.regionScores ?? this.lastScores;
    if (!ctx.signal.aborted && reason === "final-scoring" && scores) {
      const china = ctx.frame.state.china_card?.holder ?? null;
      const { net } = finalScoringRows(scores, china);
      const capped = cappedVp(net, b.ending.vpFinal - b.ending.vpBefore, b.ending.vpFinal);
      await this.showScoring({ card: 0, slot: null, vp: net, capped, china, score: null, scores, by: null }, ctx);
      if (this.state.scoring?.card === 0) this.set({ scoring: null });
    }
    this.showTelex(over);
    if (!ctx.signal.aborted) await this.env.sleep(over.ms.rise + over.ms.stamp, ctx.signal);
  }

  private showTelex(over?: OverState): void {
    const cur = over ?? this.state.over;
    if (!cur || (this.state.over && this.state.over.key !== cur.key && this.state.over.phase === "shown")) return;
    this.set({ over: { ...cur, phase: "shown" }, focusRegion: cur.effect === "europe" ? null : this.state.focusRegion });
  }

  // ── tracks ──────────────────────────────────────────────────────────────────────────────────

  /** action-round: the play is over, the dock collapses. */
  async onDockTrack(b: Extract<Beat, { k: "track" }>, ctx: BeatContext): Promise<void> {
    if (b.event.t === "action-round") this.releaseDock(ctx.frame.state);
  }

  /** DEFCON to / from 2: the danger frame changes with the lamp, before the commit. */
  async onDangerTrack(b: Extract<Beat, { k: "track" }>): Promise<void> {
    const e = b.event;
    if (e.t !== "defcon") return;
    if (e.to === 2) this.set({ danger: true });
    else if (e.from === 2 && e.to > 2) this.set({ danger: false });
  }

  // ── commits (the runner caught up) ──────────────────────────────────────────────────────────

  /**
   * A frame was committed (`useOnCommit`): Shown.state is now the frame's state. Overlays that wait for
   * the commit fade out, overrides drop, the record grows. `vm` is the ViewModel at that moment.
   */
  commit(frame: Frame, vm: Pick<ViewModel, "log" | "humanSide">): void {
    this.checkGame(vm.log);
    this.latest = frame.state;
    this.lastScores = frame.regionScores;
    this.log = vm.log;
    this.recorder.commit(frame, this.env.now());
    const patch: Partial<StageState> = { danger: null };
    const fadeMs = this.env.reduced ? REDUCED_FADE : TIMING.toast.out;
    const dice = this.state.dice;
    if (dice && dice.phase !== "out") {
      patch.dice = { ...dice, phase: "out" };
      this.env.later(fadeMs, () => { if (this.state.dice?.key === dice.key) this.set({ dice: null }); });
    }
    const sc = this.state.scoring;
    if (sc && sc.phase !== "out") {
      patch.scoring = { ...sc, phase: "out" };
      this.env.later(fadeMs, () => { if (this.state.scoring?.key === sc.key) this.set({ scoring: null }); });
    }
    if (this.state.focusRegion !== null && !(this.state.over?.phase === "beat")) patch.focusRegion = null;
    const ending = frame.events.find(e => e.t === "game-over");
    if (ending && ending.t === "game-over" && this.state.over?.phase !== "shown") {
      patch.over = {
        key: this.nextKey(), ending: ending.ending, phase: "shown", effect: null, ms: { beat: 0, rise: 0, stamp: 0, chart: 0 },
      };
    }
    this.set(patch);
  }

  /**
   * What is on screen when the stage mounts (the runner commits a game's first frame before any
   * listener exists): seeds the scores, the board and the record's clock.
   */
  noteShown(state: PublicState | null, scores: RegionScores | null, log: readonly LogEntry[] = []): void {
    if (!state) return;
    this.checkGame(log);
    if (!this.latest) this.latest = state;
    if (!this.lastScores) this.lastScores = scores;
    this.recorder.start(state, this.env.now());
  }

  /** Clear every overlay (a new game from the shell, the demo). The record is kept. */
  reset(): void {
    this.continueWait?.();
    this.set({ ...EMPTY_STAGE });
  }

  /** Another game (new game, resume: its log starts anew): a fresh record and a clean stage. */
  private checkGame(log: readonly LogEntry[]): void {
    const key = log[0] ? String(log[0].id) : null;
    if (key === this.gameKey) return;
    const had = this.gameKey !== null;
    this.gameKey = key;
    if (!had) return;
    this.recorder = new GameRecorder();
    this.latest = null;
    this.lastScores = null;
    this.continueWait?.();
    this.set({ ...EMPTY_STAGE });
  }

  /** Mounted on a game that is already over (no beat to come): show the telex at once. */
  showEnded(ending: Ending): void {
    if (this.state.over) return;
    this.set({ over: { key: this.nextKey(), ending, phase: "shown", effect: null, ms: { beat: 0, rise: 0, stamp: 0, chart: 0 } } });
  }

  // ── record ──────────────────────────────────────────────────────────────────────────────────

  /** The game's tally: the log's (complete across resumes) with the frames' records on top. */
  tally(log: readonly LogEntry[] = this.log): GameTally {
    return mergeTally(tallyFromLog(log), this.recorder.tally.current ? this.recorder.tally : null);
  }

  /** Playing time (ms) when this page saw the whole game, else null. */
  playingMs(): number | null {
    return this.recorder.playingMs(this.env.now());
  }
}
