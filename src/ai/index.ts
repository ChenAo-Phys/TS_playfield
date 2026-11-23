/**
 * The AI player (contract.ts `AiPlayer`): DeepStruggle's strongest network and search, at full
 * strength, off the main thread.
 *
 *   const ai = createAiPlayer();                 // AI_CONFIG from ./config
 *   const info = await ai.init(p => ...);        // download/verify/cache the model, start the worker
 *   const { idx } = await ai.choose({ state: engine.snapshot(), seed, moves });
 *   engine.step(engine.decodeFlat(idx), 0);
 *
 * Modes. "worker" (default in browsers): a module worker (./worker.ts) with its own engine, its own
 * onnxruntime session and the belief tracker; the page's thread never loads onnxruntime. "inline"
 * (default where there is no Worker: Node tests, the benchmark): the same code on this thread, on an
 * engine of its own -- never the controller's.
 *
 * Belief. `moves` is the game's full list of non-auto-played moves. The tracker is fed only the moves it
 * has not seen when the list extends what it saw last; otherwise (undo, resume, new game, a fresh
 * worker) it is reset and the whole list replayed. Moves are compared by identity, then by content, so
 * the controller may rebuild the list; AiMove objects must not be mutated after they are passed in.
 *
 * Timing. Every decision takes at least `config.minDelayMs`; a decision at Blockade / Missile Envy / LADC
 * (SENSITIVE_RESOLVING_CARDS) is padded to a delay drawn from the AI's own recent search times, so how
 * long the AI takes does not reveal whether it had a choice. `ms` in the answer is the compute time.
 *
 * Cancel. `cancel()` rejects pending `choose` calls with an AbortError; a search still running is
 * stopped by terminating the worker, and the next call starts a new one (engine + session ~0.2 s; the
 * model bytes are kept, so nothing is downloaded again). A download in progress is not interrupted.
 */
import type { AiConfig, AiInfo, AiMove, AiPlayer, LoadProgress } from "../game/contract";
import { AI_CONFIG, MODEL_BYTES, MODEL_HF_URL, MODEL_SHA256, SENSITIVE_RESOLVING_CARDS } from "./config";
import type { BeliefDelta, Decision, DecisionSource } from "./core";
import { supportsWasmSimd, wasmUnsupportedError, withStage } from "./errors";
import type { FromWorker, ToWorker } from "./protocol";

export { AI_CONFIG, MIN_DELAY_MS, MODEL_HF_URL, MODEL_SHA256, MODEL_URL, SEARCH, SEARCH_NO_BELIEF, SENSITIVE_RESOLVING_CARDS } from "./config";
export type { Decision, DecisionSource } from "./core";
export { WASM_SIMD_UNSUPPORTED, isWasmUnsupportedMessage, stageOf, supportsWasmSimd } from "./errors";
export type { AiLoadStage } from "./errors";

export interface AiChoice {
  /** Legal flat index of `mask(false)` at the requested state (after seating). */
  idx: number;
  /** Compute time in ms (belief + search), padding excluded. */
  ms: number;
  /** Wall time from the call to the answer, padding included. */
  elapsedMs: number;
  source: DecisionSource;
  decision: Decision;
}

export interface AiPlayerHandle extends AiPlayer {
  choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }): Promise<AiChoice>;
  /** Where the AI runs. */
  readonly mode: "worker" | "inline";
  /** Null until init() has resolved. */
  readonly info: AiInfo | null;
  /**
   * A plausible thinking time in ms, drawn from this AI's recent search times (at least minDelayMs).
   * For the controller's auto-played AI answers at SENSITIVE_RESOLVING_CARDS nodes, which never reach
   * `choose` (a single legal move), so their speed does not reveal that the AI had no choice.
   */
  thinkingDelayMs(): number;
  /** Compute times (ms) of the most recent searches, oldest first. */
  recentSearchMs(): readonly number[];
}

export interface AiPlayerOptions {
  /** "auto" (default): a worker where `Worker` exists, else inline. */
  mode?: "auto" | "worker" | "inline";
  /** URL of the directory holding engine/ts_engine.mjs (default: the site's base, import.meta.env.BASE_URL). */
  engineBase?: string;
  /** Tried in order after `config.modelUrl` (default: Hugging Face at the pinned commit). */
  fallbackUrls?: readonly string[];
  /** Expected model size, for download progress (default: the pinned model's when its sha256 is used). */
  modelSize?: number;
  /** The model's bytes, when the caller has them (tests, Node): no download; checked against the sha256. */
  modelBytes?: Uint8Array;
  /** Keep the model in the browser's Cache API (default true). */
  useCache?: boolean;
  /** Random source for the sensitive-decision padding (default Math.random). */
  random?: () => number;
  /** Pad SENSITIVE_RESOLVING_CARDS decisions to a sampled thinking time (default true; benchmarks turn it off). */
  padSensitive?: boolean;
}

/** An Error whose name is "AbortError": the call was cancelled. */
export function abortError(message = "the AI decision was cancelled"): Error {
  const e = new Error(message);
  e.name = "AbortError";
  return e;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Backends: where decisions run
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface LoadArgs {
  engineBase: string;
  search: string;
  sha256: string;
  urls: string[];
  size?: number;
  useCache: boolean;
  bytes?: Uint8Array;
  /** `bytes` came from a previous successful load (no re-hash). */
  trusted: boolean;
}

interface Backend {
  load(args: LoadArgs, onProgress: (p: LoadProgress) => void): Promise<{ info: AiInfo; bytes?: Uint8Array }>;
  decide(req: { state: Uint8Array; seed: number; belief: BeliefDelta }): Promise<Decision>;
  /** A decision is running (or queued) on it. */
  busy(): boolean;
  /** It can take no more work (terminated, or the worker crashed). */
  alive(): boolean;
  /** Stop everything; pending calls reject with AbortError. */
  terminate(): void;
}

class DesyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeliefDesyncError";
  }
}

class WorkerBackend implements Backend {
  private readonly worker: Worker;
  private dead: Error | null = null;
  private loadWaiter: { resolve: (r: { info: AiInfo; bytes?: Uint8Array }) => void; reject: (e: Error) => void } | null = null;
  private progress: ((p: LoadProgress) => void) | null = null;
  private readonly pending = new Map<number, { resolve: (d: Decision) => void; reject: (e: Error) => void }>();
  private next = 1;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "ts-ai" });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
    this.worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault?.();
      // Before "loaded", a failing worker is the AI's start-up failing (its script did not load...).
      this.fail(withStage(new Error(`the AI worker failed: ${ev.message || "could not start (module worker unsupported?)"}`), "ai-worker"));
    };
    this.worker.onmessageerror = () => this.fail(withStage(new Error("the AI worker sent an unreadable message"), "ai-worker"));
  }

  load(args: LoadArgs, onProgress: (p: LoadProgress) => void): Promise<{ info: AiInfo; bytes?: Uint8Array }> {
    if (this.dead) return Promise.reject(this.dead);
    this.progress = onProgress;
    return new Promise((resolve, reject) => {
      this.loadWaiter = { resolve, reject };
      const msg: ToWorker = {
        type: "load", engineBase: args.engineBase, search: args.search, sha256: args.sha256, urls: args.urls,
        size: args.size, useCache: args.useCache, bytes: args.bytes, trusted: args.trusted, wantBytes: !args.bytes,
      };
      // A copy of the page's bytes (it keeps them for the next respawn).
      this.worker.postMessage(msg);
    });
  }

  decide(req: { state: Uint8Array; seed: number; belief: BeliefDelta }): Promise<Decision> {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: ToWorker = { type: "decide", id, state: req.state, seed: req.seed, belief: req.belief };
      this.worker.postMessage(msg);
    });
  }

  busy(): boolean {
    return this.pending.size > 0;
  }

  alive(): boolean {
    return this.dead === null;
  }

  terminate(): void {
    this.worker.terminate();
    this.fail(abortError("the AI worker was stopped"));
  }

  private onMessage(m: FromWorker): void {
    switch (m.type) {
      case "progress":
        this.progress?.(m.progress);
        return;
      case "loaded":
        this.progress = null;
        this.loadWaiter?.resolve({ info: m.info, bytes: m.bytes });
        this.loadWaiter = null;
        return;
      case "decision": {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        p?.resolve(m.decision);
        return;
      }
      case "error": {
        if (m.id === undefined) {
          const e = new Error(m.message);
          if (m.name) e.name = m.name;
          this.loadWaiter?.reject(m.stage ? withStage(e, m.stage) : e);
          this.loadWaiter = null;
          return;
        }
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        p?.reject(m.code === "belief-desync" ? new DesyncError(m.message) : new Error(m.message));
        return;
      }
    }
  }

  private fail(e: Error): void {
    if (!this.dead) this.dead = e;
    this.loadWaiter?.reject(e);
    this.loadWaiter = null;
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }
}

/** The same work on this thread (Node, or a browser without module workers). */
class InlineBackend implements Backend {
  private core: import("./core").AiCore | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private running = 0;
  private dead = false;
  private readonly waiters = new Set<(e: Error) => void>();

  async load(args: LoadArgs, onProgress: (p: LoadProgress) => void): Promise<{ info: AiInfo; bytes?: Uint8Array }> {
    const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
    const isNode = !!proc?.versions?.node && typeof window === "undefined";
    // The runtime's files must be located before the first session: served by Vite in a browser, read
    // from node_modules under Node.
    if (isNode) await (await import("./ort_node")).configureOrtForNode();
    else await import("./ort_env");
    const { loadCore } = await import("./load");
    const loaded = await this.abortable(loadCore({ ...args, onProgress }));
    if (this.dead) {
      void loaded.core.dispose();
      throw abortError("the AI was stopped while loading");
    }
    this.core = loaded.core;
    return { info: loaded.core.info(), bytes: args.bytes ? undefined : loaded.bytes };
  }

  decide(req: { state: Uint8Array; seed: number; belief: BeliefDelta }): Promise<Decision> {
    if (this.dead) return Promise.reject(abortError());
    this.running++;
    const run = this.queue.then(async () => {
      // One macrotask first: a search on this thread runs to its end without yielding to timers or
      // input, so this is the last moment a cancel() (or a repaint showing "thinking") can get in.
      await new Promise((r) => setTimeout(r, 0));
      if (this.dead) throw abortError();
      if (!this.core) throw new Error("the AI has no model loaded");
      try {
        return await this.core.decide(req);
      } catch (e) {
        throw e instanceof Error && e.name === "BeliefDesyncError" ? new DesyncError(e.message) : e;
      }
    }).finally(() => { this.running--; });
    this.queue = run.catch(() => undefined);
    return this.abortable(run);
  }

  busy(): boolean {
    return this.running > 0;
  }

  alive(): boolean {
    return !this.dead;
  }

  terminate(): void {
    if (this.dead) return;
    this.dead = true;
    const e = abortError("the AI was stopped");
    for (const w of this.waiters) w(e);
    this.waiters.clear();
    // A search already running on this thread cannot be interrupted; its session is freed once it ends.
    const core = this.core;
    this.core = null;
    if (core) void this.queue.then(() => core.dispose());
  }

  /** `p`, or an AbortError as soon as the backend is terminated. */
  private abortable<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = (e: Error) => reject(e);
      this.waiters.add(onAbort);
      p.then(
        (v) => { this.waiters.delete(onAbort); resolve(v); },
        (e) => { this.waiters.delete(onAbort); reject(e); },
      );
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Belief bookkeeping on the page's side
// ─────────────────────────────────────────────────────────────────────────────────────────────

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameMove(a: AiMove, b: AiMove): boolean {
  if (a === b) return true;
  const x = a.action, y = b.action;
  return x.decision_type === y.decision_type && x.primary_id === y.primary_id
    && (x.secondary_id ?? 0) === (y.secondary_id ?? 0) && (x.flags ?? 0) === (y.flags ?? 0)
    && sameBytes(a.before, b.before);
}

/** What the backend's tracker has seen (null: nothing, it must be reset). */
export class BeliefSync {
  private seen: AiMove[] | null = null;

  /** The delta that brings the tracker to `moves`; assumes it will be delivered. */
  delta(moves: readonly AiMove[]): BeliefDelta {
    const seen = this.seen;
    let prefix = seen !== null && seen.length <= moves.length;
    if (prefix && seen) {
      // Newest first: a divergence (undo, another game) is most likely at the end.
      for (let i = seen.length - 1; i >= 0; i--) {
        if (!sameMove(seen[i], moves[i])) {
          prefix = false;
          break;
        }
      }
    }
    this.seen = moves.slice();
    return prefix && seen ? { reset: false, moves: moves.slice(seen.length) } : { reset: true, moves: moves.slice() };
  }

  invalidate(): void {
    this.seen = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The player
// ─────────────────────────────────────────────────────────────────────────────────────────────

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Searches remembered for the padding distribution. */
const SEARCH_HISTORY = 64;
/** Padding for a sensitive decision before any search has been timed. */
const DEFAULT_THINK_MS = 1500;

function absoluteUrl(u: string): string {
  const here = globalThis.location?.href;
  try {
    return here ? new URL(u, here).href : u;
  } catch {
    return u;
  }
}

class AiPlayerImpl implements AiPlayerHandle {
  readonly mode: "worker" | "inline";
  private backend: Backend | null = null;
  private ready: Promise<AiInfo> | null = null;
  private infoValue: AiInfo | null = null;
  private bytes: Uint8Array | null;
  private bytesTrusted = false;
  private readonly sync = new BeliefSync();
  /** Bumped by cancel/dispose: a call that started under an older generation is aborted. */
  private generation = 0;
  private disposed = false;
  private readonly listeners = new Set<(p: LoadProgress) => void>();
  private readonly sleepers = new Set<(e: Error) => void>();
  private readonly searchMs: number[] = [];
  private readonly random: () => number;

  constructor(private readonly config: AiConfig, private readonly options: AiPlayerOptions) {
    const mode = options.mode ?? "auto";
    this.mode = mode === "auto" ? (typeof Worker !== "undefined" ? "worker" : "inline") : mode;
    this.bytes = options.modelBytes ?? null;
    this.random = options.random ?? Math.random;
  }

  get info(): AiInfo | null {
    return this.infoValue;
  }

  init(onProgress?: (p: LoadProgress) => void): Promise<AiInfo> {
    if (this.disposed) return Promise.reject(new Error("the AI player was disposed"));
    if (this.infoValue && this.backend) return Promise.resolve(this.infoValue);
    if (onProgress) {
      this.listeners.add(onProgress);
      const drop = () => this.listeners.delete(onProgress);
      const p = this.ensureReady();
      p.then(drop, drop);
      return p;
    }
    return this.ensureReady();
  }

  private ensureReady(): Promise<AiInfo> {
    if (this.disposed) return Promise.reject(new Error("the AI player was disposed"));
    if (this.ready) return this.ready;
    if (this.mode === "worker" && typeof WebAssembly !== "undefined" && !supportsWasmSimd()) {
      return Promise.reject(wasmUnsupportedError());
    }
    const backend: Backend = this.mode === "worker" ? new WorkerBackend() : new InlineBackend();
    this.backend = backend;
    this.sync.invalidate();
    const sha256 = this.config.modelSha256;
    const urls = [this.config.modelUrl, ...(this.options.fallbackUrls ?? (sha256 === MODEL_SHA256 ? [MODEL_HF_URL] : []))]
      .map(absoluteUrl);
    const args: LoadArgs = {
      engineBase: absoluteUrl(this.options.engineBase ?? import.meta.env.BASE_URL),
      search: this.config.search,
      sha256,
      urls,
      size: this.options.modelSize ?? (sha256 === MODEL_SHA256 ? MODEL_BYTES : undefined),
      useCache: this.options.useCache ?? true,
      bytes: this.bytes ?? undefined,
      trusted: this.bytesTrusted,
    };
    const ready = backend.load(args, (p) => this.emit(p)).then(
      (r) => {
        if (r.bytes) this.bytes = r.bytes;
        if (this.bytes) this.bytesTrusted = true;
        this.infoValue = r.info;
        return r.info;
      },
      (e: unknown) => {
        if (this.backend === backend) {
          backend.terminate();
          this.backend = null;
          this.ready = null;
        }
        throw e instanceof Error ? e : new Error(String(e));
      },
    );
    this.ready = ready;
    return ready;
  }

  private emit(p: LoadProgress): void {
    for (const l of this.listeners) {
      try {
        l(p);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }): Promise<AiChoice> {
    if (this.disposed) throw new Error("the AI player was disposed");
    const gen = this.generation;
    const t0 = now();
    // A worker that crashed earlier is replaced (its model bytes are kept, so this is quick).
    if (this.backend && !this.backend.alive()) this.dropBackend();
    await this.ensureReady();
    if (gen !== this.generation) throw abortError();
    const backend = this.backend;
    if (!backend) throw abortError();
    let decision: Decision;
    try {
      decision = await backend.decide({ state: req.state, seed: req.seed, belief: this.sync.delta(req.moves) });
    } catch (e) {
      // The tracker's state is unknown after a failure: replay the whole game next time.
      this.sync.invalidate();
      if (!backend.alive() && this.backend === backend) this.dropBackend();
      if (!(e instanceof DesyncError) || gen !== this.generation) throw e;
      decision = await backend.decide({ state: req.state, seed: req.seed, belief: this.sync.delta(req.moves) });
    }
    if (gen !== this.generation) throw abortError();
    if (decision.source === "search") {
      this.searchMs.push(decision.ms);
      if (this.searchMs.length > SEARCH_HISTORY) this.searchMs.shift();
    }
    let target = this.config.minDelayMs;
    if ((this.options.padSensitive ?? true) && SENSITIVE_RESOLVING_CARDS.includes(decision.resolvingCard)) {
      target = Math.max(target, this.thinkingDelayMs());
    }
    const wait = target - (now() - t0);
    if (wait > 0) await this.sleep(wait, gen);
    return { idx: decision.idx, ms: decision.ms, elapsedMs: Math.round(now() - t0), source: decision.source, decision };
  }

  thinkingDelayMs(): number {
    const h = this.searchMs;
    const sample = h.length ? h[Math.min(h.length - 1, Math.floor(this.random() * h.length))] : DEFAULT_THINK_MS;
    return Math.max(this.config.minDelayMs, sample);
  }

  recentSearchMs(): readonly number[] {
    return this.searchMs.slice();
  }

  private sleep(ms: number, gen: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onAbort = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      const timer = setTimeout(() => {
        this.sleepers.delete(onAbort);
        if (gen !== this.generation) reject(abortError());
        else resolve();
      }, ms);
      this.sleepers.add(onAbort);
    });
  }

  cancel(): void {
    this.generation++;
    const e = abortError();
    for (const s of this.sleepers) s(e);
    this.sleepers.clear();
    // Only a running search needs the worker stopped; a load in progress (the download) goes on.
    if (this.backend?.busy()) this.dropBackend();
  }

  /** Stop the backend; the next call starts a new one (and replays the game into its tracker). */
  private dropBackend(): void {
    this.backend?.terminate();
    this.backend = null;
    this.ready = null;
    this.sync.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.dropBackend();
    this.bytes = null;
    this.listeners.clear();
  }
}

/**
 * The AI player. `config` defaults to AI_CONFIG (the pinned model, leaderboard #1's search, the minimum
 * delay); `options` choose the mode and, for Node, where the engine and the model's bytes come from.
 */
export function createAiPlayer(config: AiConfig = AI_CONFIG, options: AiPlayerOptions = {}): AiPlayerHandle {
  return new AiPlayerImpl(config, options);
}
