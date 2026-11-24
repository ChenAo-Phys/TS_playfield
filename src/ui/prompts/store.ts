/**
 * The prompt layer's UI state, one store per GameController (so the slip, the map wiring, the hand and
 * the dialogs share it without a provider): the staged selection (ui-spec §8.2), the hovered target
 * (the slip pulses the coins it would spend), the decision run (§8.1 counter), the last prompt (the slip
 * stays frozen on it while your own click animates), whether the target list is open (§8.13), when the
 * AI's current decision began (the slip's "Still thinking · 14 s"), one queued map activation (a quick
 * second tap during your own placement's animation) and a hand card to focus once the play-mode stage
 * closes (Esc "Back to hand").
 *
 * The store listens to the controller itself, so it sees every prompt even when no component is
 * mounted. Staging is cleared whenever `promptId` changes, except a realignment's: after a roll the
 * selection stays on that country while it is still a target. A staged selection is dropped after 6 s
 * without activity (it never acts by itself, WCAG 2.2.1).
 */
import type { GameController, Prompt, PromptKind, ViewModel } from "../../game/contract";
import type { RegionSlot } from "../ui-contract";
import { nextRun, runKey, type RunState } from "./runTotals";

export type StagedKind = "country" | "card" | "option" | "region";

/**
 * A map activation that arrived while your own placement was still animating (QA leftover: a quick second tap
 * during the ~250 ms control-flip beat was lost). It is applied to the next prompt only when that prompt
 * continues the same run (same `runKey`, fewer points left) and offers the same country; else it is dropped.
 */
export interface QueuedActivation {
  kind: "country";
  id: number;
  /** `runKey` of the prompt it was aimed at, and its `remaining`. */
  run: string;
  remaining: number;
  /** promptId of the prompt it was aimed at (the next one must differ). */
  from: number;
  /** promptId it applies to, once that prompt is open (null while waiting for it). */
  to: number | null;
}

export interface Staged {
  kind: StagedKind;
  /** Country id, card id, region id, or the option's flat index for "option". */
  id: number;
  /** The option's flat index (pass to `choose`). */
  idx: number;
  promptId: number;
}

export interface PromptUiState {
  staged: Staged | null;
  /** Country under the pointer / focus on the map or in the target list. */
  hover: number | null;
  /** Region plate or theatre chip under the pointer (region prompts). */
  hoverRegion: RegionSlot | null;
  run: RunState | null;
  /** The latest prompt the controller published (kept while frames animate). */
  lastPrompt: Prompt | null;
  /** promptId of the open prompt (null while none is open). */
  promptId: number | null;
  /** Target list (§8.13) open on desktop. */
  listOpen: boolean;
  /**
   * The target list's active row (a country id), kept across list updates and remounts: after a placement
   * the list stays on the country just used, so a second Enter adds there again (as on a focused map box).
   */
  listActive: number | null;
  /**
   * When the AI's current decision began (the store's clock, ms), null while it is not thinking. Every AI
   * decision alike, from the moment the controller says it thinks (padded forced answers included), so the
   * elapsed time tells nothing the "thinking" state does not.
   */
  aiSince: number | null;
  /** One queued map activation (see `QueuedActivation`). */
  queued: QueuedActivation | null;
  /** A hand card to focus once it is back in the hand and a prompt is open (Esc "Back to hand"). */
  focusCard: number | null;
}

/** Staging timeout (ms) without activity (§8.2). */
export const STAGE_TIMEOUT_MS = 6000;
/** A queued activation is dropped if no prompt opens within this time (ms). */
export const QUEUE_TIMEOUT_MS = 2500;
/** A focus request (Esc "Back to hand") is dropped after this time (ms). */
export const FOCUS_TIMEOUT_MS = 3000;

const EMPTY: PromptUiState = {
  staged: null, hover: null, hoverRegion: null, run: null, lastPrompt: null, promptId: null, listOpen: false, listActive: null,
  aiSince: null, queued: null, focusCard: null,
};

const MAP_KINDS = new Set<PromptKind>(["setup-place", "bid-place", "influence", "coup-target", "realign-target", "event-target"]);
/**
 * Placement runs whose next point a quick second tap may queue: one point per prompt, no die in between. Coups
 * end the play and realignments roll, so a tap during their animation is not taken as the next answer.
 */
export const QUEUE_KINDS: ReadonlySet<PromptKind> = new Set<PromptKind>(["setup-place", "bid-place", "influence", "event-target"]);

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  /** The clock for `aiSince` (ms). Default `performance.now()`. */
  now?(): number;
}
const DEFAULT_TIMERS: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
};

export class PromptStore {
  private state: PromptUiState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private timer: unknown = null;
  private queueTimer: unknown = null;
  private focusTimer: unknown = null;
  private paused = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly timers: Timers = DEFAULT_TIMERS) {}

  /** Follow a controller: every published ViewModel goes through `observe`. */
  attach(controller: Pick<GameController, "subscribe" | "getSnapshot">): void {
    if (this.unsubscribe) return;
    this.observe(controller.getSnapshot());
    this.unsubscribe = controller.subscribe(() => this.observe(controller.getSnapshot()));
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopTimer();
    this.dropQueued();
    this.setFocusCard(null);
  }

  /** The store's clock (ms). */
  now(): number {
    return (this.timers.now ?? DEFAULT_TIMERS.now!)();
  }

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  readonly get = (): PromptUiState => this.state;

  private set(patch: Partial<PromptUiState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as (keyof PromptUiState)[]).some(k => next[k] !== this.state[k]);
    if (!changed) return;
    this.state = next;
    for (const fn of [...this.listeners]) fn();
  }

  /** A new ViewModel: track the run, carry or drop the staged selection, close the list off-map. */
  observe(vm: ViewModel | null): void {
    const prompt = vm?.prompt ?? null;
    const state = vm?.frame?.state ?? null;
    // The AI's decision clock: starts when it begins to think, for every decision alike -- but not while the AI is
    // still loading (`vm.load`, a game started before Ready): that wait is the download's, not a decision's (QA L-2).
    const thinking = !!vm?.aiThinking;
    const deciding = thinking && !vm?.load;
    if (deciding && this.state.aiSince === null) this.set({ aiSince: this.now() });
    else if (!deciding && this.state.aiSince !== null) this.set({ aiSince: null });
    // A queued activation never survives the AI's turn or the end of the game.
    if (this.state.queued && (thinking || (vm && vm.status !== "playing"))) this.dropQueued();
    if (!prompt) {
      if (this.state.promptId !== null) this.set({ promptId: null });
      return;
    }
    if (prompt.promptId === this.state.promptId) return;
    this.routeQueued(prompt);
    const prev = this.state.lastPrompt;
    let staged = this.state.staged;
    if (staged) {
      const carry = prompt.kind === "realign-target" && prev?.kind === "realign-target" && staged.kind === "country"
        ? prompt.options.find(o => o.kind === "country" && o.id === staged!.id)
        : undefined;
      staged = carry ? { ...staged, idx: carry.idx, promptId: prompt.promptId } : null;
    }
    this.set({
      promptId: prompt.promptId,
      lastPrompt: prompt,
      run: nextRun(this.state.run, prompt, state),
      staged,
      listOpen: this.state.listOpen && MAP_KINDS.has(prompt.kind),
      listActive: MAP_KINDS.has(prompt.kind) ? this.state.listActive : null,
    });
    if (staged) this.startTimer();
    else this.stopTimer();
  }

  /** Select (stage) an option of the open prompt. */
  stage(sel: Staged): void {
    this.set({ staged: sel });
    this.startTimer();
  }

  /** Drop the staged selection; true when there was one. */
  clear(): boolean {
    this.stopTimer();
    if (!this.state.staged) return false;
    this.set({ staged: null });
    return true;
  }

  /** Activity on the staged selection: restart the 6 s timeout. */
  touch(): void {
    if (this.state.staged) this.startTimer();
  }

  /** Hold the timeout (a pointer over the slip, a hold in progress). */
  pause(on: boolean): void {
    this.paused = on;
    if (on) this.stopTimer();
    else if (this.state.staged) this.startTimer();
  }

  setHover(id: number | null): void {
    this.set({ hover: id });
    if (id !== null && this.state.staged?.kind === "country" && this.state.staged.id === id) this.touch();
  }

  setHoverRegion(slot: RegionSlot | null): void {
    this.set({ hoverRegion: slot });
  }

  setListOpen(open: boolean): void {
    this.set(open ? { listOpen: true } : { listOpen: false, listActive: null });
  }

  setListActive(id: number | null): void {
    this.set({ listActive: id });
  }

  /**
   * Queue a map activation that arrived while your own placement animates (`prompt`: the prompt it was aimed
   * at, the last one seen, or the one just opened while the frame finishes). Only for placement runs, for a
   * country that prompt offered, and one at a time. True when queued.
   */
  queue(prompt: Prompt | null, id: number): boolean {
    if (!prompt || this.state.queued || !QUEUE_KINDS.has(prompt.kind)) return false;
    if (!prompt.options.some(o => o.kind === "country" && o.id === id)) return false;
    const open = this.state.promptId === prompt.promptId;
    // Aimed at the open prompt (its frame still finishing): it applies to that prompt once interactive.
    const q: QueuedActivation = { kind: "country", id, run: runKey(prompt), remaining: prompt.remaining, from: prompt.promptId, to: open ? prompt.promptId : null };
    this.set({ queued: q });
    this.stopQueueTimer();
    this.queueTimer = this.timers.setTimeout(() => { this.queueTimer = null; this.dropQueued(); }, QUEUE_TIMEOUT_MS);
    return true;
  }

  /** Take the queued activation if it applies to `prompt` (it is cleared either way once taken). */
  takeQueued(prompt: Prompt | null): QueuedActivation | null {
    const q = this.state.queued;
    if (!q || !prompt || q.to !== prompt.promptId) return null;
    this.dropQueued();
    return q;
  }

  dropQueued(): void {
    this.stopQueueTimer();
    if (this.state.queued) this.set({ queued: null });
  }

  /** A new prompt opened: the queued activation applies to it, or is dropped. */
  private routeQueued(prompt: Prompt): void {
    const q = this.state.queued;
    if (!q) return;
    if (q.to !== null) {
      // Aimed at a prompt that is gone (answered or replaced): next prompt only.
      if (q.to !== prompt.promptId) this.dropQueued();
      return;
    }
    const continues = prompt.promptId !== q.from && runKey(prompt) === q.run && prompt.remaining < q.remaining
      && prompt.options.some(o => o.kind === "country" && o.id === q.id);
    if (continues) this.set({ queued: { ...q, to: prompt.promptId } });
    else this.dropQueued();
  }

  /** Focus `card` in the hand once it is back there (null clears the request). */
  setFocusCard(card: number | null): void {
    if (this.focusTimer !== null) this.timers.clearTimeout(this.focusTimer);
    this.focusTimer = null;
    this.set({ focusCard: card });
    if (card !== null) {
      this.focusTimer = this.timers.setTimeout(() => { this.focusTimer = null; this.set({ focusCard: null }); }, FOCUS_TIMEOUT_MS);
    }
  }

  private stopQueueTimer(): void {
    if (this.queueTimer !== null) this.timers.clearTimeout(this.queueTimer);
    this.queueTimer = null;
  }

  private startTimer(): void {
    this.stopTimer();
    if (this.paused) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.clear();
    }, STAGE_TIMEOUT_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }
}

const stores = new WeakMap<object, PromptStore>();

/** The store of a controller (created and attached on first use). */
export function promptStore(controller: GameController): PromptStore {
  let s = stores.get(controller);
  if (!s) {
    s = new PromptStore();
    stores.set(controller, s);
    s.attach(controller);
  }
  return s;
}
