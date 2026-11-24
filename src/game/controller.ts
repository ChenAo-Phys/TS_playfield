/**
 * The GameController (contract.ts): owns the one main-thread engine, seats both sides, runs the
 * human-vs-AI loop, redacts the AI's hidden information, and turns every applied engine step into
 * Frames the UI animates, a LogEntry, and (when the human must decide) a Prompt.
 *
 *   newGame / resume ─► drive() ─┬─ human to move: forced? auto-play : open a Prompt (released once
 *                                │                  every queued Frame was acked) ─► choose()
 *                                └─ AI to move:    forced? (padded when it rests on the AI's hand) auto-play
 *                                                  : ai.choose() (+ minimum delay) ─► applyStep()
 *
 * Decisions (docs/ARCHITECTURE.md): every action is `decodeFlat(idx)` of a legal `mask(false)`
 * index, sent unchanged; both seats are re-seated after newGame and every replay; single-legal moves
 * and forced event targets are auto-played for both sides and not fed to the AI's belief; undo goes
 * back at most to the start of the human's current play and only while nothing random or hidden was
 * revealed; the autosave is {seed, steps} and resume replays it.
 */
import type { DieRollState, EventTrackState, GameState, MicroAction } from "../engine/types";
import type { WasmEngine } from "../engine/wasm_engine";
import { Message, message } from "../i18n";
import type {
  AiInfo, AiMove, AiPlayer, CoupOdds, Ending, Frame, GameController, GameEvent, LoadProgress, LogEntry, PlayHow, Prompt,
  PublicState, RealignOdds, Side, SideChoice, ViewModel,
} from "./contract";
import { describeAction, describeDeltas, describeEventTracks, describeRoll, hiddenDrawLine, HeadlineReveal, vpScore } from "./describe";
import { drawCounts } from "./draws";
import { buildFrameEvents, markHandOrigins } from "./events";
import { LogLine, cardArg, cardsIn, sideArg, signed } from "./log";
import {
  SAVE_VERSION, SavedGame, SavedStep, StorageLike, clearSave, fromSavedStep, inspectSave, migrateSave, readSave, saveSummary,
  toSavedStep, writeSave,
} from "./persistence";
import { attachPreviews, computeCoupOdds, computeEffectiveOps, computeRealignOdds } from "./previews";
import { EVENT_COUP_CARDS, buildPrompt, legalIndices } from "./prompt";
import {
  EAGLE_BEAR_DISCARD, SUEZ_CRISIS, classifyEnding, forcedEventTarget, isCardChoice, isScoringCard, otherSide, padsForcedAiDecision, playerOf,
  resignEnding, sideOf, suezSnapshot,
} from "./rules";
import { redactState } from "./view";

/** The AI's obs_features when its AiInfo is not known yet (the pinned model's, critique.md C8). */
export const DEFAULT_AI_OBS_FEATURES = 12;

/**
 * The view model this controller emits (= ViewModel; these optional contract fields were added in the QA rounds):
 * - `superseded`: another tab resumed, started or wrote the saved game; this page's copy takes no more moves (its
 *   prompt is withdrawn, the AI stopped, the save never written again). The UI blocks the game with a Reload notice.
 * - `incompatibleSave`: at boot, storage held an unfinished game of another engine build, which cannot be replayed,
 *   or a value that is not a readable save (tampered with or corrupted: a v2 save whose checksum fails, truncated
 *   data, ...; `savedAt` is 0 then, as the save's own time cannot be trusted); it has been discarded. `reason` (R-018)
 *   tells the two apart: "build" or "unreadable". Set until a game starts; the start screen says so once.
 * - `saveUnavailable` (D-203): this game is not being autosaved -- the page has no storage (`deps.storage` null:
 *   `browserStorage()` found it blocked, privacy mode) or storage refused the last write (quota). Set only while a game
 *   is playing and this page is not superseded (that has its own notice); a later write that goes through clears it.
 * - `aiReady` (QA L-1): the AI has loaded (`aiInfo`); set from then on, so a start screen mounted again after a game
 *   reads Ready (it cannot see the load's progress again).
 */
export type ControllerViewModel = ViewModel;

/** The load stage an AI error was tagged with (`stage`, src/ai/errors.ts withStage), if any. */
function stageOf(e: unknown): LoadProgress["stage"] | undefined {
  const s = typeof e === "object" && e !== null ? (e as { stage?: unknown }).stage : undefined;
  return s === "engine" || s === "model-download" || s === "model-verify" || s === "ai-worker" ? s : undefined;
}

/** A random id for this page's writes to the save (crypto when available: deps.random may be seeded in tests). */
function pageId(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint32Array(2)), x => x.toString(36)).join("-");
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

export interface ControllerDeps {
  /** Loads the main-thread engine (`WasmEngine.load()` in the page). */
  loadEngine: () => Promise<WasmEngine>;
  ai: AiPlayer;
  /** Autosave storage (`localStorage` in the page); null disables saving. */
  storage?: StorageLike | null;
  clock?: { now(): number };
  sleep?: (ms: number) => Promise<void>;
  /** Uniform [0, 1). Default: crypto.getRandomValues. Used for the random side, seeds and padding. */
  random?: () => number;
  /** Every AI decision takes at least this long (AiConfig.minDelayMs). Default 800. */
  minAiDelayMs?: number;
  /** The AI seat's obs_features until AiInfo arrives. Default 12. */
  aiObsFeatures?: number;
  /** Compute the previews attached to prompt options (warnings, cost, endsPlay, effect). Default true. */
  previews?: boolean;
  /** Called with errors the controller turns into status "error" (default console.error). */
  onError?: (e: unknown) => void;
  /**
   * Test/diagnostic hooks: each frame and log entry with the UNREDACTED state it was made from.
   * Never pass these in the page (they hand out the AI's hand).
   */
  debug?: {
    /** `step`: for a step's frames, the raw display before the step and the frame's index in it. */
    onFrame?: (frame: Frame, raw: GameState, step?: { before: GameState; part: number }) => void;
    onLog?: (entry: LogEntry, raw: GameState) => void;
    /** Each prompt once built, with the time its build and previews took (ms, `clock`). */
    onPromptBuilt?: (prompt: Prompt, ms: number) => void;
  };
}

interface StepRecord {
  action: Required<MicroAction>;
  auto: boolean;
  by: Side;
  /** The step played The Cambridge Five's Event, which reveals the AI's hand without a die. */
  reveals: boolean;
}

interface UndoAnchor {
  snapshot: Uint8Array;
  steps: number;
  moves: number;
  log: number;
  rng: string;
  aiSignature: string;
  suezStart: Record<number, number> | null;
}

/** One applied step, read right after it (raw = unredacted, pub = the human's view). */
interface StepData {
  rawBefore: GameState;
  rawSettled: GameState;
  rawAfter: GameState;
  pubBefore: PublicState;
  pubSettled: PublicState;
  /** Only when the step ran into the turn's cleanup. */
  pubAfter: PublicState | null;
  action: Required<MicroAction>;
  actor: Side;
  auto: boolean;
  rolls: DieRollState[];
  tracks: EventTrackState[];
  crossed: boolean;
  /** The step began the turn's end and paused it at the Eagle / Bear Has Landed discard (after the mil-ops penalty). */
  eagleOpens: boolean;
  reveal: HeadlineReveal | null;
  /** A card the step chose out of the discard pile into a hand (SALT): not a draw. */
  taken: number[];
}

/** The Cambridge Five: its Event reveals the US scoring cards (or that there are none). */
const CAMBRIDGE_FIVE = 104;
/** Endings at the turn's end (they get the "End of turn" entry); every other ending ends the game mid-turn. */
const TURN_END_REASONS: ReadonlySet<Ending["reason"]> = new Set(["final-scoring", "held-scoring", "held-scoring-both", "milops-vp20"]);

/** The open decision is the Eagle / Bear Has Landed end-of-turn discard (Space Race box 6). */
function atEagleDiscard(d: GameState): boolean {
  return d.decision_context.resolving_card === EAGLE_BEAR_DISCARD && d.decision_context.decision_type === 1;
}

/** Defectors: as the US headline, or fired in the headline phase (a Five Year Plan discard...), it cancels the USSR's. */
const DEFECTORS = 103;

/**
 * Whether the USSR headline `ussr` (of the revealed pair `us` / `ussr`) is cancelled by Defectors in `d` (unredacted,
 * the same headline phase or the action round right after it): the US headlined Defectors (the engine cancels the USSR
 * card wherever it stands), or Defectors' Event fired before the USSR card, the second, resolved -- the engine then
 * clears the second slot (early_war.cpp trigger_defectors). The card goes to the discard pile without its Event.
 */
export function ussrHeadlineCancelled(d: GameState, us: number, ussr: number): boolean {
  if (!ussr || (d.headline_stage ?? 0) < 1) return false;
  if (us === DEFECTORS) return true;
  return d.headline_first_card !== ussr && (d.headline_second_card ?? 0) === 0;
}

/** Log lines of an event's card choice that say where the card went (describe.ts eventCardChoice), and the Eagle /
 *  Bear Has Landed discard's. */
const SAYS_WHERE = new Set<string>([
  "log:action.eagleBearLandedDiscard", "log:choice.discards", "log:choice.discardsFrom", "log:choice.removes", "log:choice.removesFrom", "log:choice.returns",
  "log:choice.returnsFrom", "log:choice.takes", "log:choice.takesFrom", "log:choice.gives", "log:choice.givesFrom", "log:choice.salt",
]);

interface FramePart {
  state: PublicState;
  /** The unredacted state `state` was made from (debug hooks only). */
  raw: GameState;
  actor: Side | null;
  events: GameEvent[];
  auto: boolean;
  playId?: number;
  /** Debug hooks: the step the frame belongs to. */
  step?: { before: GameState; part: number };
}

function cryptoRandom(): number {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error("crypto.getRandomValues is unavailable");
  const a = c.getRandomValues(new Uint32Array(2));
  return ((a[0] >>> 5) * 67108864 + (a[1] >>> 6)) / 9007199254740992;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)));
const defaultClock = { now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()) };

/** The AI side's hand as the human sees it, for the undo check: unseen count, known ids, peeked. */
function aiSignature(d: GameState, ai: Side): string {
  let unknown = 0;
  const known: number[] = [];
  const peeked: number[] = [];
  for (const [id, loc] of Object.entries(d.card_locations ?? {})) {
    if (loc === `HAND_${ai}_UNKNOWN`) unknown++;
    else if (loc === `HAND_${ai}_KNOWN`) known.push(Number(id));
    else if (loc === "PEEKED_TEMP") peeked.push(Number(id));
  }
  return `${unknown}|${known.sort((a, b) => a - b).join(",")}|${peeked.sort((a, b) => a - b).join(",")}`;
}

export class TsGameController implements GameController {
  private readonly deps: ControllerDeps;
  private readonly clock: { now(): number };
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly minAiDelayMs: number;
  private readonly listeners = new Set<() => void>();

  private engine: WasmEngine | null = null;
  private booting: Promise<void> | null = null;
  private aiInit: Promise<AiInfo> | null = null;
  private aiInfo: AiInfo | null = null;
  private aiFeatures: number;

  private status: ViewModel["status"] = "boot";
  private load: LoadProgress | undefined;
  private error: string | undefined;
  private human: Side | null = null;
  private seed = 0;
  private steps: StepRecord[] = [];
  private moves: AiMove[] = [];
  private log: LogEntry[] = [];
  private logId = 0;
  private ending: Ending | null = null;
  private aiThinking = false;
  /** Bumped by newGame / resume / resign / undo: async work of an older generation is dropped. */
  private gen = 0;
  private drivingGen = -1;
  private suezStart: Record<number, number> | null = null;
  private anchor: UndoAnchor | null = null;
  private recentAiMs: number[] = [];
  /** AI decisions taken and their thinking time this game (ViewModel.aiStats). */
  private aiStats: { decisions: number; ms: number } = { decisions: 0, ms: 0 };
  /** Plays (Frame.playId): the last id given, the current play's (undefined between plays), and
   *  who placed the last setup point (each side's setup is one play). */
  private playCounter = 0;
  private play: number | undefined = undefined;
  private setupActor: Side | null = null;
  /** This turn's revealed headlines (set by the second commit), to tell a cancelled USSR headline. */
  private headlinePair: { turn: number; us: number; ussr: number } | null = null;
  /** The first part of a turn's end paused at the Eagle / Bear Has Landed discard (the mil-ops penalty), logged with
   *  the rest once the discard is answered. Kept until the next pause (an undone discard is answered again). */
  private turnEndStash: { turn: number; lines: Message[] } | null = null;

  private seq = 0;
  private current: Frame | null = null;
  private currentAcked = true;
  private queue: Frame[] = [];
  private promptCounter = 0;
  private pending: Prompt | null = null;
  private coupCache = new Map<number, CoupOdds | null>();
  private realignCache = new Map<number, RealignOdds | null>();
  private opsCache = new Map<number, number | null>();

  private vm: ViewModel;
  /**
   * Per log entry, the frame seq from which the UI may show it: an entry is released with the frame
   * that animates its step, so the log never tells a die or an AI move before the board shows it.
   */
  private logSeq: number[] = [];
  /** `log` as last handed out (rebuilt only when the log or the shown frame changed). */
  private logView: readonly LogEntry[] = [];
  private logViewKey = "";
  /** Whether storage holds an unfinished game of this engine build (read at boot, then tracked). */
  private resumable = false;
  /** That game's summary for the start screen, when the save carries one. */
  private savedSummary: ViewModel["savedGame"] | null = null;
  /** This page's id in the saves it writes (SavedGame.writer). */
  private readonly writer = pageId();
  /** Another tab took over the saved game (ControllerViewModel.superseded). */
  private superseded = false;
  /**
   * Whether a save of this game by this page is in storage (R-003): set by the game's first write that went through,
   * reset when a game starts or resumes. Until then a stored save with another writer may be an older game (this
   * page's claim was refused), not a takeover. After it, such a save means another tab took the game over, even
   * while this page's own writes are refused (storage full): the last write's result cannot tell.
   */
  private claimStored = false;
  /** The unfinished save that cannot be resumed found at boot (ControllerViewModel.incompatibleSave; `reason` R-018). */
  private incompatible: { savedAt: number; reason: "build" | "unreadable" } | null = null;
  /** Storage refused this game's last autosave write (quota; ControllerViewModel.saveUnavailable, D-203). */
  private saveRefused = false;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? defaultClock;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? cryptoRandom;
    this.minAiDelayMs = deps.minAiDelayMs ?? 800;
    this.aiFeatures = deps.aiObsFeatures ?? DEFAULT_AI_OBS_FEATURES;
    this.vm = this.buildViewModel();
    deps.storage?.subscribe?.(() => this.storageChanged());
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // External store
  // ───────────────────────────────────────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ViewModel {
    return this.vm;
  }

  private emit(): void {
    this.vm = this.buildViewModel();
    for (const l of [...this.listeners]) {
      try { l(); } catch (e) { console.error(e); }
    }
  }

  private promptVisible(): boolean {
    return !!this.pending && this.queue.length === 0 && this.currentAcked && this.status === "playing";
  }

  private buildViewModel(): ViewModel {
    const prompt = this.promptVisible() ? this.pending : null;
    const vm: ViewModel = {
      status: this.status,
      humanSide: this.human,
      frame: this.current,
      queued: this.queue.length,
      prompt,
      aiThinking: this.aiThinking,
      canUndo: !!prompt && this.undoAllowed(),
      log: this.logSnapshot(),
      ending: this.ending,
      hasSavedGame: this.resumable,
    };
    if (this.resumable && this.savedSummary) vm.savedGame = this.savedSummary;
    if (this.human) vm.aiStats = this.aiStats;
    if (this.load) vm.load = this.load;
    if (this.error) vm.error = this.error;
    const ext = vm as ControllerViewModel;
    if (this.superseded) ext.superseded = true;
    if (this.incompatible) ext.incompatibleSave = this.incompatible;
    if (this.saveUnavailable()) ext.saveUnavailable = true;
    if (this.aiInfo) vm.aiReady = true;
    return vm;
  }

  /** This game is not being autosaved (ControllerViewModel.saveUnavailable): no storage, or its last write refused. */
  private saveUnavailable(): boolean {
    return this.status === "playing" && !!this.human && !this.superseded && (!this.deps.storage || this.saveRefused);
  }

  /** Read-only access for tests and diagnostics: the main engine (null before boot). */
  get engineForDiagnostics(): WasmEngine | null {
    return this.engine;
  }

  /**
   * Dev / QA only (src/dev/autopilot.ts): the human's open decision as an AI request -- the UNREDACTED engine snapshot
   * at the visible prompt, a search seed and the game's moves (both sides, as the AI is sent them). Null while no
   * prompt is visible. Never for the UI: the snapshot holds the AI's hand.
   */
  humanDecisionForDiagnostics(): { promptId: number; state: Uint8Array; seed: number; moves: readonly AiMove[] } | null {
    const p = this.promptVisible() ? this.pending : null;
    if (!p || !this.engine) return null;
    return { promptId: p.promptId, state: this.engine.snapshot(), seed: ((this.steps.length + 1) * 1_000_003) >>> 0, moves: this.moves.slice() };
  }

  /** Who made each applied step of the current game, and whether it was auto-played (tests, diagnostics). */
  stepActors(): ReadonlyArray<{ by: Side; auto: boolean }> {
    return this.steps.map(s => ({ by: s.by, auto: s.auto }));
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Boot, AI loading
  // ───────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Loads the engine once (then starts loading the AI). A failure sets status "error" and forgets the attempt, so a
   * later call tries again. Once the engine is up, a call while the AI's load has failed before any game (status
   * "error" on the start screen) loads the AI again.
   *
   * The AI's downloads (onnxruntime and the model, ~9 MB on a first visit) start after the engine, not with it (QA
   * L-3, measured): the first load is bandwidth-bound, so starting them alongside gained no time to Ready on Slow 4G
   * and made the engine -- which enables the side folders, so a USSR player can start at once -- share the line with
   * them (folders 5.0 s → 9.1 s on a 390 px phone, Slow 4G, local preview).
   */
  boot(): Promise<void> {
    if (this.booting && this.engine && this.status === "error" && !this.human && !this.aiInit) {
      this.status = "menu";
      this.error = undefined;
      this.emit();
      void this.ensureAi().catch(() => { /* reported by ensureAi */ });
    }
    if (!this.booting) {
      const run = (async () => {
        this.status = "loading";
        this.error = undefined;
        this.load = { stage: "engine", fraction: null };
        this.emit();
        try {
          this.engine = await this.deps.loadEngine();
        } catch (e) {
          this.fail(e);
          throw e;
        }
        this.load = undefined;
        this.status = "menu";
        this.readResumable(true);
        this.emit();
        void this.ensureAi().catch(() => { /* reported by ensureAi */ });
      })();
      this.booting = run;
      // Registered before any caller's await, so a caller that retries on rejection finds the slot free.
      run.catch(() => { if (this.booting === run) this.booting = null; });
    }
    return this.booting;
  }

  /**
   * The AI, loading it once (and again after a failure). Its first stage is reported before it starts, and a failure
   * keeps the stage it failed in (`stage` on the error, src/ai/errors.ts) in `vm.load`: a fast failure -- a blocked
   * model file, a worker script that did not load -- reports no progress first, and the boot line would otherwise
   * name the last stage it saw, the rules engine's (QA Q-010).
   */
  private ensureAi(): Promise<AiInfo> {
    if (!this.aiInit) {
      if (!this.aiInfo) {
        this.load = { stage: "model-download", fraction: 0 };
        this.emit();
      }
      this.aiInit = this.deps.ai.init(p => {
        if (this.aiInfo) return;
        this.load = p;
        this.emit();
      }).then(info => {
        this.aiInfo = info;
        this.load = undefined;
        if (info.obsFeatures !== this.aiFeatures) {
          this.aiFeatures = info.obsFeatures;
          if (this.engine && this.human) this.seatBoth();
        }
        if (this.error && this.status !== "error") this.error = undefined;
        this.emit();
        return info;
      }, (e: unknown) => {
        this.aiInit = null;
        const stage = stageOf(e);
        this.load = stage ? { stage, fraction: null } : undefined;
        this.fail(e);
        throw e;
      });
    }
    return this.aiInit;
  }

  private fail(e: unknown): void {
    (this.deps.onError ?? ((x: unknown) => console.error(x)))(e);
    this.error = e instanceof Error ? e.message : String(e);
    this.status = "error";
    this.aiThinking = false;
    this.emit();
  }

  private requireEngine(): WasmEngine {
    if (!this.engine) throw new Error("the engine is not loaded (call boot() first)");
    return this.engine;
  }

  private seatBoth(): void {
    const E = this.requireEngine();
    const human = this.human!;
    E.seat(playerOf(otherSide(human)), this.aiFeatures);
    E.seat(playerOf(human), E.currentRules);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Games
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private reset(): void {
    this.gen++;
    this.superseded = false;
    this.claimStored = false;
    this.saveRefused = false;
    this.incompatible = null;
    this.deps.ai.cancel();
    this.steps = [];
    this.moves = [];
    this.log = [];
    this.logSeq = [];
    this.ending = null;
    this.aiThinking = false;
    this.suezStart = null;
    this.anchor = null;
    this.queue = [];
    this.current = null;
    this.currentAcked = true;
    this.pending = null;
    this.coupCache.clear();
    this.realignCache.clear();
    this.opsCache.clear();
    this.error = undefined;
    this.aiStats = { decisions: 0, ms: 0 };
    this.play = undefined;
    this.setupActor = null;
    this.headlinePair = null;
    this.turnEndStash = null;
  }

  private randomSeed(): number {
    const hi = Math.floor(this.random() * 2097152);
    const lo = Math.floor(this.random() * 4294967296);
    return hi * 4294967296 + lo || 1;
  }

  async newGame(opts: { side: SideChoice; seed?: number }): Promise<void> {
    await this.boot();
    const E = this.requireEngine();
    this.reset();
    this.human = opts.side === "random" ? (this.random() < 0.5 ? "US" : "USSR") : opts.side;
    this.seed = opts.seed ?? this.randomSeed();
    E.newGame(this.seed);
    this.seatBoth();
    this.status = "playing";
    this.pushLog({ turn: 1, ar: 0, side: null, kind: "system", text: message("prompt:log.started", { side: sideArg(this.human) }) });
    const raw0 = E.display();
    this.pushFrames([{ state: redactState(raw0, this.human), raw: raw0, actor: null, auto: false, events: [{ t: "phase", phase: "SETUP" }] }]);
    // Written at once, so another tab with this save open stops (one live copy of a game).
    this.save(raw0, true);
    this.emit();
    void this.ensureAi().catch(() => { /* reported */ });
    void this.drive(this.gen);
  }

  async resume(): Promise<boolean> {
    await this.boot();
    const E = this.requireEngine();
    const read = inspectSave(this.deps.storage);
    if (read.kind === "unreadable") {
      // Tampered with or corrupted since boot (the start screen still offered it): forget it, as boot would have.
      console.warn("resume: the saved game cannot be read (tampered with or corrupted); it is discarded");
      clearSave(this.deps.storage);
      this.resumable = false;
      this.savedSummary = null;
      this.emit();
      return false;
    }
    const save = read.kind === "ok" ? read.save : null;
    if (!save || save.over || save.fingerprint !== E.fingerprint) return false;
    this.reset();
    this.human = save.humanSide;
    this.seed = save.seed;
    if (save.aiStats) this.aiStats = { ...save.aiStats };
    E.newGame(this.seed);
    this.seatBoth();
    this.status = "playing";
    this.pushLog({ turn: 1, ar: 0, side: null, kind: "system", text: message("prompt:log.started", { side: sideArg(this.human) }) });
    try {
      save.steps.forEach((s: SavedStep, i: number) => {
        if (this.ending) throw new Error(`the save goes on after the game ended (step ${i})`);
        this.applyStep(fromSavedStep(s), save.autoFlags[i] === "1", { replay: true });
      });
    } catch (e) {
      // A save that does not replay can never be resumed: forget it.
      console.warn(`resume: the saved game does not replay (${e instanceof Error ? e.message : e})`);
      this.reset();
      this.human = null;
      this.status = "menu";
      E.newGame(1);
      clearSave(this.deps.storage);
      this.resumable = false;
      this.savedSummary = null;
      this.emit();
      return false;
    }
    this.pushLog({ turn: E.display().turn, ar: 0, side: null, kind: "system", text: message("prompt:log.resumed") });
    const events: GameEvent[] = this.ending ? [{ t: "game-over", ending: this.ending }] : [];
    const raw = E.display();
    this.pushFrames([{ state: redactState(raw, this.human), raw, actor: null, auto: false, events }]);
    if (this.ending) this.status = "over";
    // Written at once (this page's id): another tab still playing this game stops.
    this.save(raw, true);
    this.emit();
    void this.ensureAi().catch(() => { /* reported */ });
    if (!this.ending) void this.drive(this.gen);
    return true;
  }

  /**
   * Whether storage holds an unfinished game this engine can replay, and its summary. At boot (`report`), an
   * unfinished game of another engine build -- which cannot be replayed (an update of the site) -- or a value that is
   * not a readable save (tampered with, corrupted) is reported (`incompatibleSave`) and discarded, and a plain-JSON v1
   * save is rewritten as v2. Not on later reads: another tab may be playing it on another build.
   */
  private readResumable(report = false): void {
    const read = inspectSave(this.deps.storage);
    const save = read.kind === "ok" ? read.save : null;
    const other = !!save && !!this.engine && save.fingerprint !== this.engine.fingerprint;
    this.resumable = !!save && !save.over && !other;
    this.savedSummary = this.resumable ? saveSummary(save) : null;
    if (!report) return;
    if (read.kind === "unreadable") {
      this.incompatible = { savedAt: 0, reason: "unreadable" };
      clearSave(this.deps.storage);
    } else if (save && !save.over && other) {
      this.incompatible = { savedAt: save.savedAt, reason: "build" };
      clearSave(this.deps.storage);
    } else if (read.kind === "ok" && read.legacy) {
      migrateSave(this.deps.storage);
    }
  }

  /** The save in storage is this page's (or there is none): no other tab took the game over. */
  private ownsSave(): boolean {
    if (!this.claimStored) return true;
    const save = readSave(this.deps.storage);
    return !save || save.writer === this.writer;
  }

  /**
   * Storage changed under this page (another tab, or back from the cache): a live game whose save another tab wrote is
   * superseded; on the start screen, the resumable game is read again.
   */
  private storageChanged(): void {
    if (this.superseded) return;
    if (this.status === "playing" && this.human) {
      if (!this.ownsSave()) this.supersede();
      return;
    }
    if (this.status === "menu" || this.status === "over" || this.status === "error") {
      this.readResumable();
      this.emit();
    }
  }

  /** Another tab now has the live copy of this game: stop moving and never write the save again. */
  private supersede(): void {
    this.superseded = true;
    this.gen++;
    this.deps.ai.cancel();
    this.aiThinking = false;
    this.pending = null;
    this.emit();
  }

  /** Before a move: false (and superseded) when another tab took this game over. */
  private stillLive(): boolean {
    if (this.superseded) return false;
    if (this.ownsSave()) return true;
    this.supersede();
    return false;
  }

  /**
   * Autosave; `d` = the engine's display now, when the caller has it. `claim`: a game this page starts or resumes,
   * written whatever the stored save is; otherwise nothing is written once another tab took the save over. A refused
   * write sets `saveRefused` (ViewModel.saveUnavailable), the next one that goes through clears it.
   */
  private save(d?: GameState, claim = false): void {
    if (!this.deps.storage || !this.engine || !this.human) return;
    if (!claim && !this.stillLive()) return;
    const now = d ?? this.engine.display();
    const save: SavedGame = {
      v: SAVE_VERSION, fingerprint: this.engine.fingerprint, modelSha256: this.aiInfo?.modelSha256 ?? null,
      search: this.aiInfo?.search ?? null, seed: this.seed, humanSide: this.human,
      steps: this.steps.map(s => toSavedStep(s.action)), autoFlags: this.steps.map(s => (s.auto ? "1" : "0")).join(""),
      over: !!this.ending, ending: this.ending, savedAt: Date.now(),
      turn: now.turn, ar: now.current_phase_name === "ACTION_ROUND" ? now.action_round : 0, aiStats: { ...this.aiStats },
      writer: this.writer,
    };
    const written = writeSave(this.deps.storage, save);
    if (written) this.claimStored = true;
    this.saveRefused = !written;
    this.resumable = written && !this.ending;
    this.savedSummary = this.resumable ? saveSummary(save) : null;
  }

  /** Forget the autosave (a finished game's save is kept until the next game otherwise). */
  discardSave(): void {
    clearSave(this.deps.storage);
    this.resumable = false;
    this.savedSummary = null;
    this.emit();
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // The loop
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private async drive(gen: number): Promise<void> {
    if (this.drivingGen === gen) return;
    this.drivingGen = gen;
    try {
      while (gen === this.gen && !this.ending && this.status === "playing") {
        const E = this.requireEngine();
        if (E.isTerminal()) throw new Error("the engine is terminal but no ending was recorded");
        const player = sideOf(E.decisionPlayer());
        if (!player) throw new Error(`no decider (decision type ${E.decisionType()})`);
        const raw = E.display();
        const mask = E.mask(false);
        const legal = legalIndices(mask, E.layout.size);
        if (legal.length === 0) throw new Error("the open decision has no legal action");
        const forced = legal.length === 1 ? legal[0]
          : forcedEventTarget(raw, mask, this.suezStart, E.layout.offsets.node, E.layout.confirm_done_index);
        if (player === this.human) {
          if (forced >= 0) {
            this.applyStep(E.decodeFlat(forced), true);
            continue;
          }
          this.openPrompt(raw, mask);
          return;
        }
        if (forced >= 0) {
          const action = E.decodeFlat(forced);
          // A forced answer out of the AI's unseen hand looks like a real decision (timing must not tell the hand).
          if (padsForcedAiDecision(raw, player, action)) {
            this.setAiThinking(true);
            await this.sleep(this.paddingMs());
            if (gen !== this.gen) return;
            this.setAiThinking(false);
          }
          this.applyStep(action, true);
          continue;
        }
        const idx = await this.askAi(gen, mask);
        if (gen !== this.gen || idx < 0) return;
        this.applyStep(E.decodeFlat(idx), false);
      }
    } catch (e) {
      if (gen === this.gen) this.fail(e);
    } finally {
      if (this.drivingGen === gen) this.drivingGen = -1;
    }
  }

  private setAiThinking(on: boolean): void {
    if (this.aiThinking === on) return;
    this.aiThinking = on;
    this.emit();
  }

  /**
   * A delay like a real AI decision's, never under the minimum: the AI's own sample when it offers
   * one (src/ai's `thinkingDelayMs()`, drawn from its recent search times), else one of the recent
   * decision times seen here.
   */
  private paddingMs(): number {
    const ms = this.deps.ai.thinkingDelayMs?.();
    if (typeof ms === "number" && Number.isFinite(ms)) return Math.max(this.minAiDelayMs, ms);
    const pool = this.recentAiMs;
    const pick = pool.length ? pool[Math.floor(this.random() * pool.length)] : this.minAiDelayMs;
    return Math.max(this.minAiDelayMs, pick);
  }

  private async askAi(gen: number, mask: Uint8Array): Promise<number> {
    const E = this.requireEngine();
    this.setAiThinking(true);
    const start = this.clock.now();
    try {
      await this.ensureAi();
      if (gen !== this.gen) return -1;
      const state = E.snapshot();
      const seed = ((this.steps.length + 1) * 1_000_003) >>> 0;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await this.deps.ai.choose({ state, seed, moves: this.moves.slice() });
          if (gen !== this.gen) return -1;
          if (!Number.isInteger(r.idx) || !mask[r.idx]) throw new Error(`the AI chose an illegal action (${r.idx})`);
          const elapsed = this.clock.now() - start;
          this.recentAiMs.push(elapsed);
          if (this.recentAiMs.length > 32) this.recentAiMs.shift();
          // The AI's own thinking time (its search), else the time it took to answer.
          const thought = typeof r.ms === "number" && Number.isFinite(r.ms) && r.ms >= 0 ? r.ms : Math.max(0, elapsed);
          this.aiStats = { decisions: this.aiStats.decisions + 1, ms: this.aiStats.ms + thought };
          if (elapsed < this.minAiDelayMs) await this.sleep(this.minAiDelayMs - elapsed);
          return gen === this.gen ? r.idx : -1;
        } catch (e) {
          if (gen !== this.gen) return -1;
          lastError = e;
          this.deps.ai.cancel();
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
      if (gen === this.gen) this.setAiThinking(false);
    }
  }

  private openPrompt(raw: GameState, mask: Uint8Array): void {
    const E = this.requireEngine();
    const human = this.human!;
    const L = E.layout;
    const t0 = this.clock.now();
    this.coupCache.clear();
    this.realignCache.clear();
    this.opsCache.clear();
    const c = raw.decision_context;
    const pendingOps = c.decision_type === L.decision_types.SELECT_PLAY_MODE ? computeEffectiveOps(E, c.pending_op_card) : null;
    const prompt = buildPrompt({ raw, mask, layout: L, names: E, human, promptId: ++this.promptCounter, pendingOps });
    if (this.deps.previews !== false) attachPreviews(E, prompt, raw, human, { suezStart: this.suezStart });
    this.deps.debug?.onPromptBuilt?.(prompt, this.clock.now() - t0);
    // A new play starts at a card choice; any human decision after something the human may not
    // take back (an AI move, a die, a reveal) starts one too.
    if (prompt.kind === "action-card" || prompt.kind === "headline" || !this.anchorValid()) this.setAnchor(raw);
    this.pending = prompt;
    this.emit();
  }

  choose(promptId: number, idx: number): void {
    const p = this.pending;
    if (!p || p.promptId !== promptId || !this.promptVisible()) return;
    if (!p.options.some(o => o.idx === idx)) return;
    if (!this.stillLive()) return;
    const E = this.requireEngine();
    if (!E.mask(false)[idx]) return;
    this.pending = null;
    try {
      this.applyStep(E.decodeFlat(idx), false);
    } catch (e) {
      this.fail(e);
      return;
    }
    this.emit();
    void this.drive(this.gen);
  }

  ackFrame(seq: number): void {
    if (!this.current || seq !== this.current.seq || this.currentAcked) return;
    const next = this.queue.shift();
    if (next) {
      this.current = next;
      this.currentAcked = false;
    } else {
      this.currentAcked = true;
    }
    this.emit();
  }

  private pushFrames(parts: FramePart[]): void {
    const E = this.requireEngine();
    for (const p of parts) {
      const frame: Frame = {
        seq: ++this.seq, state: p.state, regionScores: E.regionScores(p.state), actor: p.actor, events: p.events, auto: p.auto,
      };
      if (p.playId !== undefined) frame.playId = p.playId;
      this.deps.debug?.onFrame?.(frame, p.raw, p.step);
      if (!this.current || (this.currentAcked && this.queue.length === 0)) {
        this.current = frame;
        this.currentAcked = false;
      } else {
        this.queue.push(frame);
      }
    }
  }

  /** Adds a log entry, shown with frame `seq` (0: at once; see `releaseLog`). */
  private pushLog(e: Omit<LogEntry, "id">, raw?: GameState, seq = 0): void {
    const entry: LogEntry = { id: ++this.logId, ...e };
    this.log.push(entry);
    this.logSeq.push(seq);
    if (this.deps.debug?.onLog) this.deps.debug.onLog(entry, raw ?? this.requireEngine().display());
  }

  /** Entries pushed from index `from` on are shown with frame `first` (the step's own entry) or
   *  `last` (what came after it: the turn's end, the game's). */
  private releaseLog(from: number, first: number, last: number): void {
    for (let i = from; i < this.log.length; i++) this.logSeq[i] = i === from ? first : last;
  }

  private logSnapshot(): readonly LogEntry[] {
    const shown = this.current?.seq ?? 0;
    let n = 0;
    while (n < this.log.length && this.logSeq[n] <= shown) n++;
    const key = `${this.logId}:${this.log.length}:${n}`;
    if (key !== this.logViewKey) {
      this.logView = this.log.slice(0, n);
      this.logViewKey = key;
    }
    return this.logView;
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Applying one step
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private applyStep(action: Required<MicroAction>, auto: boolean, opts: { replay?: boolean } = {}): void {
    const E = this.requireEngine();
    const human = this.human!;
    const L = E.layout;
    const rawBefore = E.display();
    const actor = sideOf(E.decisionPlayer());
    if (!actor) throw new Error("no decider");
    const snapshot = E.snapshot();
    const fh = rawBefore.current_phase_name === "HEADLINE" ? E.firstHeadline(action) : null;
    const why = E.step(action, 0);
    if (why) throw new Error(`the engine refused ${JSON.stringify(action)}: ${why}`);
    const rolls = E.clickRolls();
    const tracks = E.clickEventTracks();
    const rawSettled = E.settledDisplay();
    const rawAfter = E.display();
    const c = rawBefore.decision_context;
    const DT = L.decision_types;

    this.steps.push({
      action, auto, by: actor,
      reveals: c.decision_type === DT.SELECT_PLAY_MODE && c.pending_op_card === CAMBRIDGE_FIVE && action.primary_id === L.resolutions.EVENT,
    });
    if (!auto) this.moves.push({ before: snapshot, action });

    // Suez Crisis: remember the US influence when its removal node opens (forcedEventTarget).
    const atSuez = (d: GameState) => d.decision_context.decision_type === DT.POINT_NODE && d.decision_context.resolving_card === SUEZ_CRISIS;
    if (atSuez(rawAfter)) {
      if (!atSuez(rawBefore)) this.suezStart = suezSnapshot(rawAfter);
    } else {
      this.suezStart = null;
    }

    // The turn's end paused at the Eagle / Bear Has Landed discard counts as crossed too: its first part (the mil-ops
    // penalty) gets its own frame, and its log lines wait for the rest of the turn's end (stepLog).
    const eagleOpens = atEagleDiscard(rawAfter) && !atEagleDiscard(rawSettled);
    const crossed = rawSettled.turn !== rawAfter.turn || rawSettled.current_phase_name !== rawAfter.current_phase_name || eagleOpens;
    if (E.isTerminal()) this.ending = classifyEnding(rawBefore, rawSettled, rawAfter, E.endingReason());
    const startsPlay = this.stepStartsPlay(rawBefore, actor);
    const step: StepData = {
      rawBefore, rawSettled, rawAfter, action, actor, auto, rolls, tracks, crossed, eagleOpens,
      pubBefore: redactState(rawBefore, human), pubSettled: redactState(rawSettled, human),
      pubAfter: crossed ? redactState(rawAfter, human) : null,
      reveal: this.headlineReveal(rawBefore, rawSettled, action, actor),
      taken: c.resolving_card !== 0 && action.decision_type === DT.SELECT_CARD && action.primary_id > 0 ? [action.primary_id] : [],
    };
    if (step.reveal) this.headlinePair = { turn: rawBefore.turn, us: step.reveal.us, ussr: step.reveal.ussr };
    const logFrom = this.log.length;
    this.stepLog(step);
    if (this.ending) this.endLog(this.ending);
    if (opts.replay) {
      // No frames, but the plays go on as if there were (a headline starting, the turn's end).
      if (startsPlay || (rawSettled.headline_stage ?? 0) > (rawBefore.headline_stage ?? 0)) this.play = ++this.playCounter;
      if (crossed) this.play = undefined;
      return;
    }

    const parts = this.stepFrames(step, fh);
    this.markHandOrigins(parts, step);
    if (this.ending) parts[parts.length - 1].events.push({ t: "game-over", ending: this.ending });
    this.assignPlays(parts, startsPlay);
    if (this.deps.debug?.onFrame) parts.forEach((part, i) => { part.step = { before: rawBefore, part: i }; });
    const firstSeq = this.seq + 1;
    this.pushFrames(parts);
    this.releaseLog(logFrom, firstSeq, this.seq);
    if (this.ending) {
      this.status = "over";
      this.deps.ai.cancel();
      this.aiThinking = false;
    }
    this.save(rawAfter);
    this.emit();
  }

  /**
   * Whether the step answering the decision in `rawBefore` starts a new play (Frame.playId): a card
   * choice (an action-round card or pass, a headline, the Eagle / Bear Has Landed discard), or the
   * first setup point of a side (each side's setup, the US bid included, is one play).
   */
  private stepStartsPlay(rawBefore: GameState, actor: Side): boolean {
    if (rawBefore.current_phase_name === "SETUP") {
      const starts = this.setupActor !== actor;
      this.setupActor = actor;
      return starts;
    }
    return isCardChoice(rawBefore);
  }

  /**
   * Frame.playId for a step's frames: a play runs from a card choice (or a headline starting to
   * resolve) to the next one; the turn's end is a system frame and closes it.
   */
  private assignPlays(parts: FramePart[], startsPlay: boolean): void {
    parts.forEach((part, i) => {
      if (part.actor === null) {
        this.play = undefined;
        return;
      }
      const headline = part.events.some(e => e.t === "card-played" && e.how === "headline");
      if ((i === 0 && startsPlay) || headline || this.play === undefined) this.play = ++this.playCounter;
      part.playId = this.play;
    });
  }

  /** The second headline commit: both cards, and which resolves first (unredacted, public now). */
  private headlineReveal(rawBefore: GameState, rawSettled: GameState, action: Required<MicroAction>, actor: Side): HeadlineReveal | null {
    const c = rawBefore.decision_context;
    if (rawBefore.current_phase_name !== "HEADLINE" || c.resolving_card !== 0 || c.decision_type !== this.requireEngine().layout.decision_types.SELECT_CARD) return null;
    const theirs = actor === "US" ? rawBefore.headline_ussr_card : rawBefore.headline_us_card;
    if (!theirs) return null;
    const us = actor === "US" ? action.primary_id : theirs;
    const ussr = actor === "USSR" ? action.primary_id : theirs;
    const firstCard = rawSettled.headline_first_card ?? 0;
    const first: Side = firstCard === ussr ? "USSR" : "US";
    return { us, ussr, first };
  }

  /** card-played events for the headlines that start resolving between two raw states. */
  private headlineStarts(b: GameState, a: GameState): GameEvent[] {
    const out: GameEvent[] = [];
    const s0 = b.headline_stage ?? 0;
    const s1 = a.headline_stage ?? 0;
    const first = a.headline_first_card ?? 0;
    const second = a.headline_second_card ?? 0;
    if (!first || s1 < s0) return out;
    const owner = (card: number): Side => (card === a.headline_us_card ? "US" : "USSR");
    // A USSR headline cancelled by Defectors goes to the discard pile unplayed: no card-played (the stage stamps it
    // CANCELLED). As the second card the engine clears its slot, so `second` is 0 then.
    const cancelled = (card: number) => owner(card) === "USSR" && a.headline_us_card === DEFECTORS;
    if (s0 === 0 && s1 >= 1 && !cancelled(first)) out.push({ t: "card-played", side: owner(first), card: first, how: "headline" });
    if (second && s0 <= 1 && s1 >= 2 && !cancelled(second)) out.push({ t: "card-played", side: owner(second), card: second, how: "headline" });
    return out;
  }

  /** The step's own events, before its dice and the board's changes. */
  private actionEvents(rawBefore: GameState, rawEnd: GameState, action: Required<MicroAction>, actor: Side,
                       reveal: HeadlineReveal | null): GameEvent[] {
    const L = this.requireEngine().layout;
    const DT = L.decision_types;
    const c = rawBefore.decision_context;
    const done = (action.flags & 0x80) !== 0;
    const out: GameEvent[] = [];
    const played = (card: number, how: PlayHow) => out.push({ t: "card-played", side: actor, card, how });
    if (c.decision_type === DT.SELECT_PLAY_MODE && action.decision_type === DT.SELECT_CARD) {
      // Grain Sales: UN Intervention played on the drawn card (flat slot 31, decoded as a card).
      played(action.primary_id, "event");
    } else if (action.decision_type === DT.SELECT_CARD) {
      const card = action.primary_id;
      if (c.resolving_card === 0 && rawBefore.current_phase_name === "HEADLINE") {
        out.push({ t: "headline-chosen", side: actor });
        if (reveal) out.push({ t: "headline-reveal", us: reveal.us, ussr: reveal.ussr, first: reveal.first });
      } else if (c.resolving_card === 0) {
        const trapped = (actor === "US" && rawBefore.flags.includes("QUAGMIRE_ACTIVE"))
          || (actor === "USSR" && rawBefore.flags.includes("BEAR_TRAP_ACTIVE"));
        if (done || card === 0) played(0, "pass");
        else if (isScoringCard(card)) played(card, "scoring");
        else if (trapped) played(card, "discard");
      } else if (!done && card > 0) {
        // A card out of the actor's own hand: given (Missile Envy -- even when its Event then fires
        // for the taker and it ends in the discard pile) or discarded (Blockade, Ask Not, the Eagle /
        // Bear...). Star Wars plays the Event of a card from the discard pile. A card chosen anywhere
        // else (Our Man in Tehran's peek, Aldrich Ames' pick from the US hand, SALT) is not the
        // actor's play: its card-moved event says what happened to it.
        const from = rawBefore.card_locations?.[String(card)] ?? "";
        const to = rawEnd.card_locations?.[String(card)] ?? "";
        const own = from === `HAND_${actor}_KNOWN` || from === `HAND_${actor}_UNKNOWN`;
        if (c.resolving_card === L.card_ids.STAR_WARS) played(card, "event");
        else if (own && (c.resolving_card === L.card_ids.MISSILE_ENVY || to.startsWith(`HAND_${otherSide(actor)}_`))) played(card, "give");
        else if (own && to === "DISCARD_PILE") played(card, "discard");
      }
    } else if (action.decision_type === DT.SELECT_PLAY_MODE && !done) {
      const R = L.resolutions;
      const how: PlayHow = action.primary_id === R.EVENT ? "event" : action.primary_id === R.SPACE ? "space"
        : action.primary_id === R.OPS_COUP ? "coup" : action.primary_id === R.OPS_REALIGN ? "realign" : "influence";
      played(c.pending_op_card, how);
    }
    return out;
  }

  private stepFrames(step: StepData, fh: { state: GameState; rolls: number } | null): FramePart[] {
    const human = this.human!;
    const { rawBefore, rawSettled, rawAfter, action, actor, auto, rolls, tracks, crossed, pubBefore, pubSettled, reveal, taken } = step;
    const pre = this.actionEvents(rawBefore, rawSettled, action, actor, reveal);
    const parts: FramePart[] = [];
    if (fh) {
      // The board after the first headline: its decision belongs to a parked internal node, so it
      // shows the step's real next decision instead.
      const mid: GameState = { ...fh.state, decision_context: rawSettled.decision_context, legal_actions: rawSettled.legal_actions };
      const pubMid = redactState(mid, human);
      const firstCard = mid.headline_first_card ?? 0;
      const tracks1 = tracks.filter(t => t.card_id === firstCard);
      const tracks2 = tracks.filter(t => t.card_id !== firstCard);
      const d1 = drawCounts(rawBefore, mid, taken);
      const d2 = drawCounts(mid, rawSettled, taken);
      parts.push({
        state: pubMid, raw: mid, actor, auto, events: buildFrameEvents({
          before: pubBefore, after: pubMid, pre: [...pre, ...this.headlineStarts(rawBefore, mid)],
          rolls: rolls.slice(0, fh.rolls), tracks: tracks1, draws: d1.draws, reshuffled: d1.reshuffled,
        }),
      });
      parts.push({
        state: pubSettled, raw: rawSettled, actor, auto, events: buildFrameEvents({
          before: pubMid, after: pubSettled, pre: this.headlineStarts(mid, rawSettled),
          rolls: rolls.slice(fh.rolls), tracks: tracks2, draws: d2.draws, reshuffled: d2.reshuffled,
        }),
      });
    } else {
      const d = drawCounts(rawBefore, rawSettled, taken);
      parts.push({
        state: pubSettled, raw: rawSettled, actor, auto, events: buildFrameEvents({
          before: pubBefore, after: pubSettled, pre: [...pre, ...this.headlineStarts(rawBefore, rawSettled)],
          rolls, tracks, draws: d.draws, reshuffled: d.reshuffled,
        }),
      });
    }
    if (crossed && step.pubAfter) {
      const pubAfter = step.pubAfter;
      const d = drawCounts(rawSettled, rawAfter);
      let events = buildFrameEvents({ before: pubSettled, after: pubAfter, draws: d.draws, reshuffled: d.reshuffled, transition: true });
      // The Eagle / Bear Has Landed discard is no action round, though the engine counts one more for it.
      if (step.eagleOpens) events = events.filter(e => e.t !== "action-round");
      parts.push({ state: pubAfter, raw: rawAfter, actor: null, auto, events });
    }
    return parts;
  }

  /**
   * `card-moved.fromHand` on the step's frames (contract.ts): each frame's moves out of the AI's hidden hand, read
   * against the raw card locations its diff starts from (the step's before, then the previous part's). The AI's own
   * cards are the ones in play as the step starts (its decision context: a part's state may carry a borrowed one), its
   * headline, and its own card choice (an action-round card, a headline).
   */
  private markHandOrigins(parts: FramePart[], step: StepData): void {
    const ai = otherSide(this.human!);
    const DT = this.requireEngine().layout.decision_types;
    const c = step.rawBefore.decision_context;
    const own = [c.pending_op_card, c.resolving_card];
    if (step.actor === ai && c.resolving_card === 0 && step.action.decision_type === DT.SELECT_CARD) own.push(step.action.primary_id);
    const headline = (d: GameState) => (ai === "US" ? d.headline_us_card : d.headline_ussr_card) ?? 0;
    let before = step.rawBefore;
    for (const part of parts) {
      markHandOrigins(part.events, before.card_locations ?? {}, ai, [...own, headline(before)]);
      before = part.raw;
    }
  }

  private stepLog(step: StepData): void {
    const E = this.requireEngine();
    const human = this.human!;
    const ai = otherSide(human);
    const L = E.layout;
    const DT = L.decision_types;
    const { rawBefore, rawSettled, rawAfter, action, actor, rolls, tracks, crossed, eagleOpens, pubBefore, reveal } = step;
    const pubEnd = step.pubSettled;
    const c = rawBefore.decision_context;
    const lines: LogLine[] = describeAction(E, human, pubBefore, pubEnd, action, reveal);
    for (const r of rolls) lines.push(...describeRoll(E, pubBefore, r, actor));
    lines.push(...describeEventTracks(pubBefore, pubEnd, tracks, E));
    const chosen = action.decision_type === DT.SELECT_CARD ? action.primary_id : 0;
    // The step's own line already says where its card went (an event's card choice, Grain Sales'
    // return); the human's draws are one line naming the cards, the AI's a count.
    const said = lines[0]?.msg.key ?? "";
    const implied = SAYS_WHERE.has(said) ? [chosen] : said === "log:action.grainSalesReturn" ? [c.pending_op_card] : [];
    const drawn = drawCounts(rawBefore, rawSettled, step.taken);
    const deltas = describeDeltas(E, human, pubBefore, pubEnd, implied, chosen, drawn.cards[human]);
    // Defectors cancelled the USSR headline in this step (headlined by the US, or fired by a random discard...): said
    // before the card's own move to the discard pile, after the line that fired Defectors.
    const pair = this.headlinePair;
    if (pair && pair.turn === rawBefore.turn && rawBefore.current_phase_name === "HEADLINE"
        && !ussrHeadlineCancelled(rawBefore, pair.us, pair.ussr) && ussrHeadlineCancelled(rawSettled, pair.us, pair.ussr)) {
      const names = (l: LogLine, card: number) => cardsIn(l.msg).includes(card);
      let at = deltas.findIndex(l => names(l, pair.ussr));
      if (at < 0) at = deltas.length;
      const fired = deltas.slice(0, at).findIndex(l => names(l, DEFECTORS));
      deltas.splice(fired >= 0 ? fired + 1 : at, 0, { msg: message("prompt:log.headlineCancelled", {
        side: sideArg("USSR"), card: cardArg(pair.ussr, E.cardName(pair.ussr)), id: pair.ussr, by: cardArg(DEFECTORS, E.cardName(DEFECTORS)),
      }) });
    }
    lines.push(...deltas);
    if (drawn.draws[ai] > 0) lines.push(hiddenDrawLine(ai, drawn.draws[ai]));
    const ending = this.ending;

    // The Eagle / Bear Has Landed discard runs the rest of the turn's end in the same step (the held-scoring check, the
    // effects that expire, DEFCON, the deal -- or final scoring): the step's entry keeps the discard, and the turn's
    // end gets its own entry, with the mil-ops penalty told when the discard opened (the stash).
    const finishesTurn = atEagleDiscard(rawBefore)
      && (rawSettled.turn !== rawBefore.turn || rawSettled.current_phase_name === "GAME_OVER");
    let turnEnd: Message[] = [];
    if (finishesTurn) {
      lines.splice(1);
      const end = crossed && step.pubAfter ? step.pubAfter : pubEnd;
      const dealt = drawCounts(rawBefore, crossed ? rawAfter : rawSettled, step.taken);
      const deltas = describeDeltas(E, human, pubBefore, end, [chosen], chosen, dealt.cards[human]);
      if (dealt.draws[ai] > 0) deltas.push(hiddenDrawLine(ai, dealt.draws[ai]));
      const stash = this.turnEndStash?.turn === rawBefore.turn ? this.turnEndStash.lines : [];
      turnEnd = [...stash, ...this.cleanupLines(pubBefore, deltas, ending)];
    }

    const phase = rawBefore.current_phase_name;
    const headline = phase === "HEADLINE" && c.resolving_card === 0 && action.decision_type === DT.SELECT_CARD;
    const scoring = action.decision_type === DT.SELECT_CARD && c.resolving_card === 0 && isScoringCard(chosen) && phase === "ACTION_ROUND";
    const kind: LogEntry["kind"] = headline ? "headline" : scoring ? "score" : c.resolving_card !== 0 ? "event" : "play";
    // The card the entry is about -- never the AI's face-down headline.
    let card = 0;
    if (action.decision_type === DT.SELECT_CARD && chosen > 0 && (actor === human || !headline || reveal)) card = chosen;
    else if (c.pending_op_card) card = c.pending_op_card;
    else if (c.resolving_card >= 1 && c.resolving_card <= 110) card = c.resolving_card;
    // What the engine did after the step's own action (pubEnd -> pubAfter): the turn's end, or the game's.
    let after: Message[] = [];
    if (crossed && step.pubAfter && !finishesTurn) {
      const dealt = drawCounts(rawSettled, rawAfter);
      const deltas = describeDeltas(E, human, pubEnd, step.pubAfter, [], 0, dealt.cards[human]);
      if (dealt.draws[ai] > 0) deltas.push(hiddenDrawLine(ai, dealt.draws[ai]));
      after = this.cleanupLines(pubEnd, deltas, eagleOpens ? null : ending);
    }
    // An ending in the middle of a turn (DEFCON, 20 VP, Europe Control, the Cuban Missile Crisis, Wargames) ends it
    // with the step: no turn's end, and what the ending changed (VP set to 20...) belongs to the step.
    const midTurnEnd = !!ending && !TURN_END_REASONS.has(ending.reason);
    if (midTurnEnd) lines.push(...after.map(msg => ({ msg })));

    const [main, ...rest] = lines;
    const entry: Omit<LogEntry, "id"> = {
      turn: rawBefore.turn, ar: phase === "ACTION_ROUND" ? rawBefore.action_round : 0, side: actor, kind, text: main.msg,
    };
    if (rest.length) entry.details = rest.map(l => l.msg);
    if (card) entry.card = card;
    this.pushLog(entry, rawSettled);

    if (eagleOpens) {
      // The mil-ops penalty: told with the rest of the turn's end, after the discard.
      this.turnEndStash = { turn: rawSettled.turn, lines: after };
    } else if (finishesTurn) {
      this.pushTurnEntry(rawBefore.turn, rawBefore.action_round, turnEnd, rawSettled);
    } else if (crossed && step.pubAfter && !midTurnEnd) {
      if (rawAfter.turn !== rawSettled.turn || rawAfter.current_phase_name === "GAME_OVER") {
        this.pushTurnEntry(rawSettled.turn, rawSettled.action_round, after, rawAfter);
      } else {
        const text = message("log:session.phaseEnds.other", { phase: rawSettled.current_phase_name ?? "" });
        const turnEntry: Omit<LogEntry, "id"> = { turn: rawSettled.turn, ar: rawSettled.action_round, side: null, kind: "turn", text };
        if (after.length) turnEntry.details = after;
        this.pushLog(turnEntry, rawAfter);
      }
    }
  }

  private pushTurnEntry(turn: number, ar: number, details: Message[], raw: GameState): void {
    const entry: Omit<LogEntry, "id"> = { turn, ar, side: null, kind: "turn", text: message("log:session.endOfTurn", { turn }) };
    if (details.length) entry.details = details;
    this.pushLog(entry, raw);
  }

  /**
   * The lines of a turn's end from `from` (redacted) given its `deltas` lines: when it ran final scoring, the
   * Victory Points line keeps the cleanup's own change (the mil-ops penalty) and a final-scoring line carries the
   * scoring's (Ending.vpBefore splits them).
   */
  private cleanupLines(from: PublicState, deltas: LogLine[], ending: Ending | null): Message[] {
    if (ending?.reason !== "final-scoring") return deltas.map(l => l.msg);
    const out = deltas.filter(l => l.msg.key !== "log:change.vp").map(l => l.msg);
    const v0 = from.victory_points;
    const v1 = ending.vpBefore;
    const v2 = ending.vpFinal;
    const at = deltas.findIndex(l => l.msg.key === "log:change.vp");
    const lines: Message[] = [];
    if (v1 !== v0) lines.push(message("log:change.vp", { from: vpScore(v0), to: vpScore(v1), delta: signed(v1 - v0) }));
    out.splice(at < 0 ? out.length : Math.min(at, out.length), 0, ...lines);
    out.push(message("prompt:log.finalScoring", { from: vpScore(v1), to: vpScore(v2), delta: signed(v2 - v1) }));
    return out;
  }

  private endLog(ending: Ending): void {
    const reason = message(`prompt:ending.${ending.reason}` as Message["key"]);
    const params = { reason, vp: vpScore(ending.vpFinal), turn: ending.turn };
    const entry: Omit<LogEntry, "id"> = {
      turn: ending.turn, ar: 0, side: null, kind: "system",
      text: ending.winner === "DRAW" ? message("prompt:log.gameOverDraw", params)
        : message("prompt:log.gameOver", { ...params, winner: sideArg(ending.winner) }),
    };
    // A held scoring card is revealed by the rule that ends the game.
    const E = this.requireEngine();
    const d = E.display();
    const details: Message[] = (ending.cards ?? []).map(card => message("prompt:log.heldCard", {
      side: sideArg(d.card_locations?.[String(card)]?.startsWith("HAND_USSR") ? "USSR" : "US"),
      card: cardArg(card, E.cardName(card)), id: card,
    }));
    if (details.length) entry.details = details;
    this.pushLog(entry);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Undo, resign
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private setAnchor(raw: GameState): void {
    const E = this.requireEngine();
    this.anchor = {
      snapshot: E.snapshot(), steps: this.steps.length, moves: this.moves.length, log: this.log.length, rng: E.rngState(),
      aiSignature: aiSignature(raw, otherSide(this.human!)), suezStart: this.suezStart ? { ...this.suezStart } : null,
    };
  }

  /** The anchor is still a position the human may go back to (nothing random or hidden since). */
  private anchorValid(): boolean {
    const a = this.anchor;
    if (!a || !this.engine || !this.human || a.steps > this.steps.length) return false;
    const since = this.steps.slice(a.steps);
    if (since.some(s => s.by !== this.human || s.reveals)) return false;
    if (this.engine.rngState() !== a.rng) return false;
    return aiSignature(this.engine.display(), otherSide(this.human)) === a.aiSignature;
  }

  private undoAllowed(): boolean {
    return !!this.anchor && this.status === "playing" && this.steps.length > this.anchor.steps && this.anchorValid();
  }

  undo(): void {
    if (!this.promptVisible() || !this.undoAllowed() || !this.stillLive()) return;
    const E = this.requireEngine();
    const a = this.anchor!;
    this.gen++;
    E.restore(a.snapshot);
    this.steps.length = a.steps;
    this.moves.length = a.moves;
    this.log.length = a.log;
    this.logSeq.length = a.log;
    this.suezStart = a.suezStart ? { ...a.suezStart } : null;
    this.pending = null;
    // The board goes back: the frame animates the difference from what is shown.
    const raw = E.display();
    const state = redactState(raw, this.human!);
    const shown = this.current?.state;
    const events = shown ? buildFrameEvents({ before: shown, after: state }) : [];
    this.pushFrames([{ state, raw, actor: null, auto: false, events }]);
    this.save(raw);
    this.emit();
    void this.drive(this.gen);
  }

  resign(): void {
    if (this.status !== "playing" || !this.human || !this.engine || !this.stillLive()) return;
    this.gen++;
    this.deps.ai.cancel();
    this.aiThinking = false;
    this.pending = null;
    const d = this.engine.display();
    this.ending = resignEnding(d, this.human);
    const logFrom = this.log.length;
    this.pushLog({ turn: d.turn, ar: 0, side: this.human, kind: "system", text: message("prompt:log.resign", { side: sideArg(this.human) }) });
    this.endLog(this.ending);
    this.pushFrames([{ state: redactState(d, this.human), raw: d, actor: this.human, auto: false, events: [{ t: "game-over", ending: this.ending }] }]);
    this.releaseLog(logFrom, this.seq, this.seq);
    this.status = "over";
    this.save(d);
    this.emit();
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Previews
  // ───────────────────────────────────────────────────────────────────────────────────────────

  coupOdds(country: number): CoupOdds | null {
    const p = this.pending;
    if (!p || !this.engine || this.status !== "playing") return null;
    const coup = p.kind === "coup-target" || (p.kind === "event-target" && EVENT_COUP_CARDS.has(p.resolvingCard));
    if (!coup || !p.countries.includes(country)) return null;
    if (!this.coupCache.has(country)) this.coupCache.set(country, computeCoupOdds(this.engine, country));
    return this.coupCache.get(country) ?? null;
  }

  realignOdds(country: number): RealignOdds | null {
    const p = this.pending;
    if (!p || !this.engine || this.status !== "playing") return null;
    if ((p.kind !== "realign-target" && p.kind !== "event-target") || !p.countries.includes(country)) return null;
    if (!this.realignCache.has(country)) this.realignCache.set(country, computeRealignOdds(this.engine, country));
    return this.realignCache.get(country) ?? null;
  }

  effectiveOps(card: number): number | null {
    const p = this.pending;
    if (!p || !this.engine || this.status !== "playing") return null;
    const ok = (p.kind === "action-card" && p.cards.includes(card)) || (p.kind === "play-mode" && p.pendingCard === card);
    if (!ok) return null;
    if (!this.opsCache.has(card)) this.opsCache.set(card, computeEffectiveOps(this.engine, card));
    return this.opsCache.get(card) ?? null;
  }
}

/** The controller the page uses. */
export function createGameController(deps: ControllerDeps): TsGameController {
  return new TsGameController(deps);
}
