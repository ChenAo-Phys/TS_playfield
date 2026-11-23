/**
 * A GameController that serves a recorded fixture (dev only: demos and tests; never imported by
 * production code).
 *
 *  - A "scene" starts at its end: the frame is on screen and acked, the prompt is open.
 *  - A "sequence" starts at its base frame; each `ackFrame(seq)` releases the next frame, exactly as
 *    the real controller does; after the last frame the recorded final ViewModel (prompt, ending)
 *    appears.
 *
 * `choose`, `undo`, `resign`, `newGame`, `resume` are recorded in `calls` and change nothing (the
 * fixture is a recording), except `newGame` which restarts the replay. Previews come from the
 * fixture (`coupOdds`, `effectiveOps`, `realignOdds` at the final prompt) or are null.
 */
import type { CoupOdds, GameController, RealignOdds, SideChoice, ViewModel } from "../game/contract";
import type { Fixture } from "./fixtureFormat";

export type ControllerCall =
  | { fn: "choose"; promptId: number; idx: number }
  | { fn: "undo" }
  | { fn: "resign" }
  | { fn: "newGame"; side: SideChoice; seed?: number }
  | { fn: "resume" }
  | { fn: "boot" }
  | { fn: "ackFrame"; seq: number; accepted: boolean };

export interface FixtureControllerOptions {
  /** Where the replay starts: "begin" (base frame, not acked) or "end" (final ViewModel). Default:
   *  scenes "end", sequences "begin". */
  start?: "begin" | "end";
  /**
   * vm.queued while frames play: "zero" (default; as when the AI thinks between its moves),
   * "remaining" (every later frame already queued: the runner's speed-up), or "recorded" (what the
   * capture saw; its AI answered instantly).
   */
  queued?: "zero" | "remaining" | "recorded";
  /** Show `aiThinking` for this long before releasing each AI frame after an ack (ms). Default 0. */
  aiThinkingMs?: number;
  /** Called on every recorded call (after it is recorded). */
  onCall?: (call: ControllerCall, ctrl: FixtureController) => void;
  /** Timer functions (tests). */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

export class FixtureController implements GameController {
  readonly calls: ControllerCall[] = [];
  private fx: Fixture;
  private opts: FixtureControllerOptions;
  /** Index of the frame on screen. */
  private pos = 0;
  /** The frame at `pos` was acked (only possible for the last one: earlier acks move on). */
  private acked = false;
  private thinking = false;
  private timer: unknown = null;
  private vm: ViewModel;
  private readonly listeners = new Set<() => void>();

  constructor(fixture: Fixture, opts: FixtureControllerOptions = {}) {
    this.fx = fixture;
    this.opts = opts;
    this.vm = this.build();
    this.reset(this.startAt());
  }

  get fixture(): Fixture {
    return this.fx;
  }

  /** Index of the frame on screen, and whether the replay reached its final ViewModel. */
  get position(): { index: number; count: number; done: boolean } {
    return { index: this.pos, count: this.fx.frames.length, done: this.acked };
  }

  /** The choices made so far (convenience over `calls`). */
  get choices(): { promptId: number; idx: number }[] {
    return this.calls.flatMap(c => (c.fn === "choose" ? [{ promptId: c.promptId, idx: c.idx }] : []));
  }

  // ── GameController ──────────────────────────────────────────────────────────────────────────

  /** Bound (usable as `useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot)`). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): ViewModel => this.vm;

  async boot(): Promise<void> {
    this.record({ fn: "boot" });
  }

  async newGame(opts: { side: SideChoice; seed?: number }): Promise<void> {
    this.record({ fn: "newGame", side: opts.side, seed: opts.seed });
    this.restart("begin");
  }

  async resume(): Promise<boolean> {
    this.record({ fn: "resume" });
    return false;
  }

  choose(promptId: number, idx: number): void {
    this.record({ fn: "choose", promptId, idx });
  }

  undo(): void {
    this.record({ fn: "undo" });
  }

  resign(): void {
    this.record({ fn: "resign" });
  }

  ackFrame(seq: number): void {
    const f = this.fx.frames[this.pos];
    const accepted = !!f && f.seq === seq && !this.acked && !this.thinking;
    this.calls.push({ fn: "ackFrame", seq, accepted });
    if (!accepted) return;
    if (this.pos >= this.fx.frames.length - 1) {
      this.acked = true;
      this.emit();
      return;
    }
    const next = this.fx.frames[this.pos + 1]!;
    const wait = this.opts.aiThinkingMs ?? 0;
    if (wait > 0 && next.actor !== null && next.actor !== this.fx.humanSide) {
      this.thinking = true;
      this.emit();
      const st = this.opts.setTimeout ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
      this.timer = st(() => {
        this.timer = null;
        this.thinking = false;
        this.pos++;
        this.emit();
      }, wait);
      return;
    }
    this.pos++;
    this.emit();
  }

  coupOdds(country: number): CoupOdds | null {
    return this.vm.prompt ? (this.fx.previews.coupOdds?.[country] ?? null) : null;
  }

  effectiveOps(card: number): number | null {
    return this.vm.prompt ? (this.fx.previews.effectiveOps?.[card] ?? null) : null;
  }

  realignOdds(country: number): RealignOdds | null {
    return this.vm.prompt ? (this.fx.previews.realignOdds?.[country] ?? null) : null;
  }

  // ── Replay control (demos, tests) ─────────────────────────────────────────────────────────────

  /** Start over: "begin" = the base frame (not acked), "end" = the final ViewModel. */
  restart(at: "begin" | "end" = this.startAt()): void {
    this.reset(at);
    this.emit();
  }

  /** Show frame `index` (not acked yet). */
  seek(index: number): void {
    this.cancelTimer();
    this.pos = Math.max(0, Math.min(this.fx.frames.length - 1, index));
    this.acked = false;
    this.thinking = false;
    this.emit();
  }

  /** Serve another fixture (from its start). */
  setFixture(fixture: Fixture, start?: "begin" | "end"): void {
    this.fx = fixture;
    this.reset(start ?? this.startAt());
    this.emit();
  }

  dispose(): void {
    this.cancelTimer();
    this.listeners.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────

  private startAt(): "begin" | "end" {
    return this.opts.start ?? (this.fx.kind === "scene" ? "end" : "begin");
  }

  private reset(at: "begin" | "end"): void {
    this.cancelTimer();
    this.thinking = false;
    if (at === "end") {
      this.pos = this.fx.frames.length - 1;
      this.acked = true;
    } else {
      this.pos = 0;
      this.acked = false;
    }
    this.vm = this.build();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      const ct = this.opts.clearTimeout ?? ((id: unknown) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>));
      ct(this.timer);
      this.timer = null;
    }
  }

  private record(call: ControllerCall): void {
    this.calls.push(call);
    this.opts.onCall?.(call, this);
  }

  private emit(): void {
    this.vm = this.build();
    for (const l of [...this.listeners]) l();
  }

  private build(): ViewModel {
    const fx = this.fx;
    const last = fx.frames.length - 1;
    if (this.acked && this.pos === last) return { ...fx.final };
    const frame = fx.frames[this.pos]!;
    const fv = fx.frameVm[this.pos]!;
    const mode = this.opts.queued ?? "zero";
    const queued = mode === "recorded" ? fv.queued : mode === "remaining" ? last - this.pos : 0;
    const over = fv.status === "over";
    return {
      status: fv.status,
      humanSide: fx.humanSide,
      frame,
      queued,
      prompt: null,
      aiThinking: this.thinking,
      canUndo: false,
      log: fx.logs[this.pos] ?? [],
      ending: over ? fx.final.ending : null,
      hasSavedGame: fx.final.hasSavedGame,
    };
  }
}
