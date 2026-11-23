/**
 * Dev-only autopilot (QA; never imported by production code): picks the human's move at the open prompt the way
 * the AI would, so a play-through reaches turn 10 and final scoring instead of losing by turn 3.
 *
 *   const auto = createAutopilot(controller);      // installed as window.__tspAuto by appController.ts (DEV only)
 *   const s = await auto.suggest();                // { promptId, option: { idx, kind, id }, via, ... } or null
 *   // the driver (src/ui/screens/demo/play.mjs --policy ai) then clicks that option in the real UI
 *
 * A second AiPlayer (src/ai: the network's argmax "policy" by default, the full leaderboard search optional) decides
 * for the HUMAN's seat on the controller's UNREDACTED position and move list (`humanDecisionForDiagnostics`): it is
 * a test tool and may see everything. It plays like the AI with one difference the answer is checked for: src/ai
 * seats the decider with the model's rule bits (OPP_EVENT_GATED) and the other side with the person rules, while
 * the controller seats the human with the person rules (OWN_EVENT_GATED | ALWAYS_ASK_DISCARD). So the AI may pick
 * an Event the human's mask leaves out (One Small Step when not behind, Wargames away from DEFCON 2). An answer that
 * is not one of the prompt's options -- or an AI failure -- falls back to a fixed, deterministic choice (see
 * `fallbackOption`), is logged, and counted in `stats()`. It never throws at a prompt.
 */
import { AI_CONFIG, createAiPlayer, SEARCH, type AiChoice, type DecisionSource } from "../ai";
import type { AiMove, Prompt, PromptOption } from "../game/contract";

/** "policy": the network's argmax (fast). "full": leaderboard #1's search (the production AI's strength). */
export type AutopilotSearch = "policy" | "full";

/** What the autopilot needs from the controller (TsGameController has it). */
export interface AutopilotHost {
  getSnapshot(): { prompt: Prompt | null; status: string };
  choose(promptId: number, idx: number): void;
  humanDecisionForDiagnostics(): { promptId: number; state: Uint8Array; seed: number; moves: readonly AiMove[] } | null;
}

/** The AI the autopilot asks (an AiPlayerHandle; tests pass their own). */
export interface AutopilotAi {
  choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }): Promise<Pick<AiChoice, "idx"> & Partial<Pick<AiChoice, "ms" | "source">>>;
  init?(): Promise<unknown>;
  dispose(): void;
}

export interface Suggestion {
  promptId: number;
  kind: Prompt["kind"];
  /** The option to choose: always one of the prompt's. */
  option: Pick<PromptOption, "idx" | "kind" | "id">;
  /** "ai": the AI's own pick. "fallback": its pick was not an option here, or it failed (see `reason`). */
  via: "ai" | "fallback";
  /** The AI's flat index (null when it failed). */
  aiIdx: number | null;
  reason?: string;
  /** How the AI decided (single, policy, search, fallback) and its compute time. */
  source?: DecisionSource;
  ms: number;
}

export interface AutopilotStats {
  suggestions: number;
  ai: number;
  /** The AI's pick was not an option of the prompt. */
  unmapped: number;
  /** The AI failed (threw). */
  errors: number;
  /** The prompt changed while the AI thought (asked again). */
  stale: number;
  /** Total AI wall time, ms. */
  ms: number;
  /** The last few fallbacks, newest last. */
  recent: string[];
}

export interface Autopilot {
  readonly search: AutopilotSearch;
  /** Switch the search (a new AI player; the old one is disposed). */
  setSearch(search: AutopilotSearch): void;
  /** Load the model now (otherwise the first suggestion does). */
  ready(): Promise<void>;
  /** The option to choose at the visible human prompt, or null when there is none. */
  suggest(): Promise<Suggestion | null>;
  /** suggest() and choose it through the controller (no UI: quick runs and tests). */
  step(): Promise<Suggestion | null>;
  stats(): AutopilotStats;
  dispose(): void;
}

export interface AutopilotOptions {
  search?: AutopilotSearch;
  /** The AI to ask (tests). Default: createAiPlayer with the search, no minimum delay, no padding. */
  ai?: (search: AutopilotSearch) => AutopilotAi;
  /** Where fallbacks are reported (default console.warn). */
  log?: (line: string) => void;
}

/** Warnings of an option that can lose the game on the spot (contract.ts WarningCode): a fallback avoids them. */
const FATAL: ReadonlySet<string> = new Set(["defcon-suicide", "cmc-suicide", "game-ending"]);
/** play-mode ids (contract: Event 0, Space 1, Influence 2, Coup 3, Realign 4) in the fallback's order. */
const MODE_ORDER = [2, 4, 1, 3, 0];
/** op-mode ids (Influence 0, Coup 1, Realign 2). */
const OP_MODE_ORDER = [0, 2, 1];

/**
 * The fallback: deterministic, and as harmless as a fixed rule can be -- no option with a fatal warning when another
 * exists; at play-mode / op-mode, Influence first (then Realign, Space, Coup, Event); elsewhere the first option that
 * is not "done" (the lowest flat index), else "done".
 */
export function fallbackOption(p: Prompt): PromptOption {
  const safe = p.options.filter(o => !(o.warnings ?? []).some(w => FATAL.has(w.code)));
  const pool = safe.length ? safe : p.options;
  const order = p.kind === "play-mode" ? MODE_ORDER : p.kind === "op-mode" ? OP_MODE_ORDER : null;
  if (order) {
    const kind = p.kind === "play-mode" ? "mode" : "op-mode";
    for (const id of order) {
      const o = pool.find(x => x.kind === kind && x.id === id);
      if (o) return o;
    }
  }
  return pool.find(o => o.kind !== "done") ?? pool[0]!;
}

function defaultAi(search: AutopilotSearch): AutopilotAi {
  return createAiPlayer({ ...AI_CONFIG, search: search === "full" ? SEARCH : "policy", minDelayMs: 0 }, { padSensitive: false });
}

export function createAutopilot(host: AutopilotHost, opts: AutopilotOptions = {}): Autopilot {
  const make = opts.ai ?? defaultAi;
  const log = opts.log ?? ((line: string) => console.warn(line));
  let search: AutopilotSearch = opts.search ?? "policy";
  let ai: AutopilotAi | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const st: AutopilotStats = { suggestions: 0, ai: 0, unmapped: 0, errors: 0, stale: 0, ms: 0, recent: [] };
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const player = () => (ai ??= make(search));

  const note = (line: string) => {
    st.recent.push(line);
    if (st.recent.length > 20) st.recent.shift();
    log(`[autopilot] ${line}`);
  };

  /** One suggestion for the prompt visible now (null: none). */
  async function once(): Promise<Suggestion | null> {
    const req = host.humanDecisionForDiagnostics();
    const p = host.getSnapshot().prompt;
    if (!req || !p || p.promptId !== req.promptId) return null;
    const t0 = now();
    const pick = (o: PromptOption) => ({ idx: o.idx, kind: o.kind, id: o.id });
    let answer: Awaited<ReturnType<AutopilotAi["choose"]>>;
    try {
      answer = await player().choose({ state: req.state, seed: req.seed, moves: req.moves });
    } catch (e) {
      const reason = `the AI failed: ${e instanceof Error ? e.message : String(e)}`;
      st.errors++;
      const o = fallbackOption(p);
      note(`prompt ${p.promptId} (${p.kind}): ${reason}; fallback ${o.kind}:${o.id}`);
      return { promptId: p.promptId, kind: p.kind, option: pick(o), via: "fallback", aiIdx: null, reason, ms: Math.round(now() - t0) };
    }
    const ms = Math.round(now() - t0);
    st.ms += ms;
    const o = p.options.find(x => x.idx === answer.idx);
    if (o) {
      st.ai++;
      return { promptId: p.promptId, kind: p.kind, option: pick(o), via: "ai", aiIdx: answer.idx, source: answer.source, ms };
    }
    st.unmapped++;
    const fb = fallbackOption(p);
    const reason = `the AI chose flat index ${answer.idx}, not an option of this ${p.kind} prompt (seat rules differ)`;
    note(`prompt ${p.promptId}: ${reason}; fallback ${fb.kind}:${fb.id}`);
    return { promptId: p.promptId, kind: p.kind, option: pick(fb), via: "fallback", aiIdx: answer.idx, reason, source: answer.source, ms };
  }

  async function suggestNow(): Promise<Suggestion | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const s = await once();
      if (!s) return null;
      if (host.getSnapshot().prompt?.promptId === s.promptId) {
        st.suggestions++;
        return s;
      }
      st.stale++;
    }
    return null;
  }

  /** One AI call at a time (the player's belief bookkeeping is sequential). */
  function serial<T>(f: () => Promise<T>): Promise<T> {
    const run = queue.then(f, f);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    get search() {
      return search;
    },
    setSearch(next: AutopilotSearch) {
      if (next === search) return;
      search = next;
      ai?.dispose();
      ai = null;
    },
    ready: () => serial(async () => { await player().init?.(); }),
    suggest: () => serial(suggestNow),
    step: () => serial(async () => {
      const s = await suggestNow();
      if (s) host.choose(s.promptId, s.option.idx);
      return s;
    }),
    stats: () => ({ ...st, recent: [...st.recent] }),
    dispose() {
      ai?.dispose();
      ai = null;
    },
  };
}
