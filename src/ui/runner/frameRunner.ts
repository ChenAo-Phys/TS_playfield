/**
 * The frame runner core (ui-spec §9.1), without React so it runs in Node tests.
 *
 * It watches the controller. For each frame F it plays F's beat groups (`buildBeats`) through the
 * Director, then commits F (`Shown.state = F.state`, region scores, pencil marks / delta pills), tells
 * the `onCommit` listeners (components drop their overrides), and acks F; the controller then
 * releases the next frame or the prompt. The very first frame (mount, new game, resume) is committed
 * at once.
 *
 *  - Skip: aborts the current frame (its handlers jump to their end state) → commit → ack.
 *  - Skip to my turn: aborts the current frame and plays later ones at speed 0 until a human prompt,
 *    a game-over beat, or (setting `pauseOnReveals`) a headline-reveal / scoring beat.
 *  - Shift held (`setBoost`): durations ÷ 3. A hidden tab (`setHidden`): the current frame finishes
 *    at once, later ones play at speed 0.
 *  - Speed is recomputed before each group (`frameSpeed`), so a growing `vm.queued` speeds up the
 *    rest of a frame.
 *  - `Shown.aiPlayCard`: set on an AI `reveal` beat; cleared by a human reveal, an `action-round`
 *    beat, or a human prompt. A new AI play gets a 400 ms lead-in rest before its reveal.
 */
import type { Frame, GameController, PublicState, Side, ViewModel } from "../../game/contract";
import { dur, frameSpeed, type FrameSpeed } from "../theme";
import type { Beat, BeatContext, Director, Shown, UiSettings } from "../ui-contract";
import { buildBeats, staggerOffset } from "./beats";
import { EMPTY_LAST_PLAY, reduceLastPlay, type LastPlayState } from "./lastPlay";

/** The rest before the reveal of a new AI play (ms at 1×, ui-spec §9.5). */
export const AI_LEAD_IN_MS = 400;

export interface FrameRunnerDeps {
  controller: GameController;
  director: Director;
  settings: () => UiSettings;
  /** Called after each commit (Shown already updated), before the ack. */
  onCommit?: (frame: Frame) => void;
  /** An abortable wait (tests may pass an instant one). */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export class FrameRunner {
  private readonly deps: FrameRunnerDeps;
  private shown: Shown;
  private readonly listeners = new Set<() => void>();
  private readonly commitListeners = new Set<(f: Frame) => void>();
  private committedSeq: number | null = null;
  private lastPlay: LastPlayState = EMPTY_LAST_PLAY;
  private gameKey: string | null = null;
  private current: { seq: number; abort: AbortController } | null = null;
  private pumping = false;
  private active = false;
  private skipping = false;
  private boost = false;
  private hidden = false;
  /** The AI play whose reveal had its lead-in (one rest per play). */
  private leadInFor: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped when another game starts: a frame of the old one must not commit. */
  private gen = 0;

  constructor(deps: FrameRunnerDeps) {
    this.deps = deps;
    const vm = deps.controller.getSnapshot();
    this.shown = this.makeShown({ state: null, regionScores: null, busy: false, actor: null, aiPlayCard: 0, lastOpponent: {}, placedThisPlay: {} });
    this.gameKey = keyOf(vm);
    // Mounting on a game in progress: what is on screen now is the current frame, unanimated.
    if (vm.frame) this.commit(vm.frame, vm.humanSide, false);
  }

  // ── store ─────────────────────────────────────────────────────────────────────────────────────

  getShown = (): Shown => this.shown;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Listen to commits (after Shown changed, before the ack). */
  onCommit(fn: (f: Frame) => void): () => void {
    this.commitListeners.add(fn);
    return () => { this.commitListeners.delete(fn); };
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.active) return;
    this.active = true;
    this.unsubscribe = this.deps.controller.subscribe(() => this.onVm());
    const vm = this.deps.controller.getSnapshot();
    // The frame committed at construction still needs its ack (ignored if it had one).
    if (vm.frame && vm.frame.seq === this.committedSeq && !vm.prompt) this.deps.controller.ackFrame(vm.frame.seq);
    this.onVm();
  }

  /**
   * Stop watching the controller. The frame in progress is aborted (→ commit → ack) a moment later,
   * unless `start()` comes first (React StrictMode unmounts and remounts effects at once).
   */
  stop(): void {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.stopTimer === null) {
      this.stopTimer = setTimeout(() => {
        this.stopTimer = null;
        if (!this.active) this.current?.abort.abort();
      }, 0);
    }
  }

  // ── controls ──────────────────────────────────────────────────────────────────────────────────

  skip = (): void => {
    this.current?.abort.abort();
  };

  skipToMyTurn = (): void => {
    const vm = this.deps.controller.getSnapshot();
    if (vm.prompt || vm.status !== "playing") return;
    this.skipping = true;
    this.current?.abort.abort();
  };

  /** Shift held: durations ÷ 3 from the next group on. */
  setBoost(on: boolean): void {
    this.boost = on;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.current?.abort.abort();
  }

  get isSkipping(): boolean {
    return this.skipping;
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────

  private makeShown(s: Omit<Shown, "skip" | "skipToMyTurn">): Shown {
    return { ...s, skip: this.skip, skipToMyTurn: this.skipToMyTurn };
  }

  private patch(p: Partial<Omit<Shown, "skip" | "skipToMyTurn">>): void {
    let changed = false;
    for (const [k, v] of Object.entries(p)) if ((this.shown as unknown as Record<string, unknown>)[k] !== v) changed = true;
    if (!changed) return;
    this.shown = { ...this.shown, ...p };
    for (const l of [...this.listeners]) l();
  }

  private onVm(): void {
    if (!this.active) return;
    const vm = this.deps.controller.getSnapshot();
    const key = keyOf(vm);
    if (key !== this.gameKey) {
      // Another game (new game, resume): start from its first frame, unanimated.
      this.gameKey = key;
      this.gen++;
      this.current?.abort.abort();
      this.committedSeq = null;
      this.lastPlay = EMPTY_LAST_PLAY;
      this.skipping = false;
      this.leadInFor = null;
      this.patch({ state: null, regionScores: null, aiPlayCard: 0, lastOpponent: {}, placedThisPlay: {} });
    }
    if (vm.prompt) {
      this.skipping = false;
      if (this.shown.aiPlayCard) this.patch({ aiPlayCard: 0 });
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (!this.active) break;
        const vm = this.deps.controller.getSnapshot();
        const f = vm.frame;
        if (!f || f.seq === this.committedSeq) break;
        await this.play(f, vm);
      }
    } finally {
      this.pumping = false;
      if (this.shown.busy) this.patch({ busy: false, actor: null });
    }
  }

  private speedFor(f: Frame, human: Side | null): FrameSpeed {
    const s = this.deps.settings();
    const vm = this.deps.controller.getSnapshot();
    return frameSpeed({
      speed: s.speed, auto: f.auto, byHuman: !!human && f.actor === human && !f.auto, queued: vm.queued,
      skipping: this.skipping || this.hidden, boost: this.boost,
    });
  }

  private async play(f: Frame, vm: ViewModel): Promise<void> {
    const human = vm.humanSide;
    const before = this.shown.state;
    // The first frame, or a jump (frames reach the UI one by one, so seqs follow each other; a gap
    // means a restart / seek / another game): commit at once, nothing to animate from.
    if (!before || !human || this.committedSeq === null || f.seq !== this.committedSeq + 1) {
      if (this.committedSeq !== null && f.seq !== this.committedSeq + 1) {
        this.lastPlay = EMPTY_LAST_PLAY;
        if (this.shown.aiPlayCard) this.patch({ aiPlayCard: 0 });
      }
      this.commit(f, human, true);
      return;
    }
    const gen = this.gen;
    const abort = new AbortController();
    this.current = { seq: f.seq, abort };
    if (this.hidden) abort.abort();
    this.patch({ busy: true, actor: f.actor });
    const sleep = this.deps.sleep ?? abortableSleep;
    const groups = buildBeats(f, before, human);
    try {
      for (const group of groups) {
        if (abort.signal.aborted) break;
        const settings = this.deps.settings();
        if (this.skipping && group.some(b => b.k === "game-over" || (settings.pauseOnReveals && (b.k === "headline-reveal" || b.k === "scoring")))) {
          this.skipping = false;
        }
        let speed = this.speedFor(f, human);
        // The reveal dock card and the AI's lead-in rest.
        for (const b of group) {
          if (b.k === "reveal") {
            if (b.byHuman || b.side === human) {
              if (this.shown.aiPlayCard) this.patch({ aiPlayCard: 0 });
            } else {
              const play = `${f.playId ?? f.seq}:${b.card}`;
              if (this.leadInFor !== play && b.how !== "headline") {
                this.leadInFor = play;
                await sleep(dur(AI_LEAD_IN_MS, speed.motion), abort.signal);
                if (abort.signal.aborted) break;
                speed = this.speedFor(f, human);
              }
              this.patch({ aiPlayCard: b.card });
            }
          } else if (b.k === "track" && b.event.t === "action-round" && this.shown.aiPlayCard) {
            this.patch({ aiPlayCard: 0 });
          }
        }
        if (abort.signal.aborted) break;
        const ctx: BeatContext = { frame: f, before, humanSide: human, speed, signal: abort.signal, settings };
        await Promise.all(group.map(async (b: Beat, i) => {
          const offset = dur(staggerOffset(b.k, i, group.length), speed.motion);
          if (offset > 0) await sleep(offset, abort.signal);
          if (abort.signal.aborted) return;
          await this.deps.director.run(b, ctx);
        }));
      }
    } finally {
      if (this.current?.abort === abort) this.current = null;
    }
    if (gen !== this.gen) return;
    this.commit(f, human, true);
  }

  private commit(f: Frame, human: Side | null, ack: boolean): void {
    this.committedSeq = f.seq;
    if (human) this.lastPlay = reduceLastPlay(this.lastPlay, f, human);
    this.patch({
      state: f.state as PublicState,
      regionScores: f.regionScores,
      lastOpponent: this.lastPlay.lastOpponent,
      placedThisPlay: this.lastPlay.placedThisPlay,
    });
    for (const fn of [...this.commitListeners]) {
      try { fn(f); } catch (e) { console.error(e); }
    }
    try { this.deps.onCommit?.(f); } catch (e) { console.error(e); }
    if (ack) this.deps.controller.ackFrame(f.seq);
  }
}

/** What identifies one game in the ViewModel: the first log entry (a new game or a resume starts a new log). */
function keyOf(vm: ViewModel): string | null {
  const first = vm.log[0];
  return first ? `${first.id}` : vm.frame ? "nolog" : null;
}
