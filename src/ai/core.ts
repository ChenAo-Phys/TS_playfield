/**
 * The AI's decision procedure on an engine it owns (the worker's, or the inline path's), shared by
 * src/ai/worker.ts and the no-worker mode of src/ai/index.ts:
 *
 *   1. restore the requested position; the decider is the AI;
 *   2. seat both sides (critique §1.2): the AI's seat reads the model's obs_features (12 -> rule bits 8),
 *      the other seat plays the engine's person rules (`currentRules`, 1544) -- what the controller's
 *      engine does, so the masks agree; re-seating an already seated state changes nothing;
 *   3. bring the belief tracker up to the game's moves (reset + replay, or only the new ones);
 *   4. a single legal move is played as it is (no network call);
 *   5. otherwise the rollout root (src/ai/rollout.ts) under the configured search; if it returns
 *      nothing or throws, the network's masked argmax; if even that fails, the first legal move.
 *
 * The answer is always a legal flat index of `mask(false)` at the seated position.
 */
import type { WasmEngine } from "../engine/wasm_engine";
import type { AiInfo, AiMove } from "../game/contract";
import type { Model } from "./model";
import { policyArgmax, rolloutRoot } from "./rollout";
import { parseSearchParam, type RolloutSpec } from "./rollout_spec";

/** How a decision was reached. */
export type DecisionSource =
  | "single" //   one legal move
  | "search" //   the rollout root's pick
  | "policy" //   the network's argmax (search = "policy", or the root had < 2 candidates)
  | "fallback"; // the search threw; the network's argmax (or the first legal move) was played

/** The moves the tracker has not seen yet, and whether it must start over first. */
export interface BeliefDelta {
  reset: boolean;
  moves: readonly AiMove[];
}

export interface DecideRequest {
  /** Engine snapshot of the position to decide (the AI is the decider). */
  state: Uint8Array;
  /** Search seed (the rollout's chance stream). */
  seed: number;
  belief: BeliefDelta;
}

export interface Decision {
  /** Legal flat index of mask(false). */
  idx: number;
  source: DecisionSource;
  /** Compute time of this decision in ms (belief replay + search), padding excluded. */
  ms: number;
  /** Network rows spent (root + playouts + belief). */
  rows: number;
  /** Of `rows`, the belief's likelihood rows. */
  beliefRows: number;
  /** Legal moves at the position. */
  legal: number;
  /** 1 US, -1 USSR: the side that decided. */
  side: number;
  decisionType: number;
  /** The card whose event owns this decision (0 = none); see SENSITIVE_RESOLVING_CARDS. */
  resolvingCard: number;
  /** The root's candidates (network's move first) and their mean values, when a search ran. */
  candidates?: number[];
  q?: number[];
  /** Moves replayed into the belief tracker for this decision, and how many it refused to record. */
  beliefObserved: number;
  beliefRefused: number;
  /** The requested state's seats were not (AI: model features, other: person rules) and were fixed. */
  reseated: boolean;
  /** Why the search fell back (source "fallback"). */
  error?: string;
}

/** The tracker cannot be brought up to date from the moves sent; the caller resends them all with reset. */
export class BeliefDesyncError extends Error {
  readonly code = "belief-desync";
  constructor(message: string) {
    super(message);
    this.name = "BeliefDesyncError";
  }
}

export class AiCore {
  readonly spec: RolloutSpec | null;
  private beliefReady = false;
  private beliefSide = 0;

  constructor(
    readonly engine: WasmEngine,
    readonly model: Model,
    readonly search: string,
    readonly modelSha256: string,
  ) {
    const spec = parseSearchParam(search);
    if (spec === undefined) throw new Error(`unknown AI search "${search}"`);
    if (spec && (model.meta.mergedInfluence || model.meta.macroInfluence)) {
      throw new Error("the rollout root needs a model that decides in the E4 action view");
    }
    this.spec = spec;
  }

  info(): AiInfo {
    return {
      modelSha256: this.modelSha256,
      search: this.search,
      obsFeatures: this.model.obsFeatures,
      engineFingerprint: this.engine.fingerprint,
    };
  }

  /** Seat the AI (`side`) with the model's features and the other side with the person rules. */
  private seat(side: number): boolean {
    const a = this.engine.seat(side, this.model.obsFeatures);
    const b = this.engine.seat(-side, this.engine.currentRules);
    return a || b;
  }

  async decide(req: DecideRequest): Promise<Decision> {
    const t0 = performance.now();
    const E = this.engine;
    E.restore(req.state);
    if (E.isTerminal()) throw new Error("the game is over: there is no decision to make");
    const side = E.decisionPlayer();
    if (side !== 1 && side !== -1) throw new Error("no player is to decide in this position (a chance node?)");
    const reseated = this.seat(side);
    const root = E.snapshot();

    // The belief tracker sees every recorded move of the game, both sides, in order.
    let beliefObserved = 0, beliefRefused = 0;
    const spec = this.spec;
    if (spec && spec.belief > 0) {
      if (!req.belief.reset && (!this.beliefReady || side !== this.beliefSide)) {
        throw new BeliefDesyncError(this.beliefReady
          ? "the AI changed sides without a new game"
          : "the belief tracker is new; it needs the whole game");
      }
      if (req.belief.reset) {
        E.beliefReset(spec.belief, 0, true, spec.box4);
        this.beliefReady = true;
        this.beliefSide = side;
      }
      try {
        for (const m of req.belief.moves) {
          E.restore(m.before);
          this.seat(side);
          if (E.beliefObserve(m.action)) beliefObserved++;
          else beliefRefused++;
        }
      } catch (e) {
        // A half-fed tracker cannot be trusted: the next request must replay the game.
        this.beliefReady = false;
        throw e;
      }
      E.restore(root);
    }

    const mask = E.mask(false);
    const legal: number[] = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) legal.push(i);
    if (legal.length === 0) throw new Error("the position has no legal move");
    const decisionType = E.decisionType();
    const resolvingCard = E.display().decision_context?.resolving_card ?? 0;
    const base = { legal: legal.length, side, decisionType, resolvingCard, beliefObserved, beliefRefused, reseated };
    const done = (d: Omit<Decision, keyof typeof base | "ms">): Decision =>
      ({ ...d, ...base, ms: Math.round(performance.now() - t0) });

    if (legal.length === 1) return done({ idx: legal[0], source: "single", rows: 0, beliefRows: 0 });

    if (!spec) {
      const idx = await policyArgmax(E, this.model);
      if (idx >= 0 && mask[idx]) return done({ idx, source: "policy", rows: 1, beliefRows: 0 });
      return done({ idx: legal[0], source: "fallback", rows: 1, beliefRows: 0, error: "the network chose no legal move" });
    }

    let error: string;
    try {
      const r = await rolloutRoot(E, this.model, spec, req.seed);
      if (r && mask[r.pick]) {
        return done({ idx: r.pick, source: "search", rows: r.rows, beliefRows: r.beliefRows, candidates: r.candidates, q: r.q });
      }
      E.restore(root);
      const idx = await policyArgmax(E, this.model);
      if (r === null && idx >= 0 && mask[idx]) return done({ idx, source: "policy", rows: 1, beliefRows: 0 });
      error = r ? `the search picked an illegal move (${r.pick})` : "the network chose no legal move";
      if (idx >= 0 && mask[idx]) return done({ idx, source: "fallback", rows: 1 + (r?.rows ?? 0), beliefRows: 0, error });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.warn(`[ai] search failed, playing the network's move: ${error}`);
      try {
        E.restore(root);
        const idx = await policyArgmax(E, this.model);
        if (idx >= 0 && mask[idx]) return done({ idx, source: "fallback", rows: 1, beliefRows: 0, error });
      } catch (e2) {
        error += `; policy: ${e2 instanceof Error ? e2.message : String(e2)}`;
      }
    }
    return done({ idx: legal[0], source: "fallback", rows: 0, beliefRows: 0, error });
  }

  /** Free the onnxruntime session. */
  async dispose(): Promise<void> {
    await this.model.release().catch(() => undefined);
  }
}
