/**
 * The contract between the three layers of the site. Every parallel workstream codes against this
 * file; change it only deliberately (and update docs/ARCHITECTURE.md with it).
 *
 *   engine (src/engine, WASM)  ──►  GameController (src/game)  ──►  React UI (src/ui)
 *                                        │  ▲
 *                                        ▼  │
 *                                   AiPlayer (src/ai, Web Worker)
 *
 * - The controller owns the one main-thread engine, seats both sides, runs the human-vs-AI loop,
 *   redacts the AI's hidden information, and turns every engine step into a `Frame` the UI animates.
 * - The UI never talks to the engine. It renders `ViewModel`, animates `Frame.events`, calls
 *   `ackFrame` when done, and answers `Prompt`s with `choose(option.idx)`.
 * - The AI runs in a worker with its own engine and ONNX session.
 */
import type { DieRollState, GameState, MicroAction, RegionScores } from "../engine/types";
import type { Message } from "../i18n";

export type Side = "US" | "USSR";
export type SideChoice = Side | "random";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Public (redacted) state
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The engine's display state with everything the human may not see removed (port of DS
 * game/view.ts redactState): the AI's unknown hand cards, the AI's face-down headline, the AI's
 * legal actions. `hands[ai]` / `hands[ai + "_cards"]` keep only cards the human legitimately knows
 * (HAND_*_KNOWN, e.g. after a reshuffle reveal or an event that shows the hand).
 */
export type PublicState = GameState & {
  readonly humanSide: Side;
  /** Number of cards in the AI's hand, known or not (China Card not included). */
  readonly aiHandCount: number;
  /** AI hand cards the human knows (subset of the AI's hand). */
  readonly aiKnownCards: readonly number[];
  /** True while the AI has committed a headline card that is still face down. */
  readonly aiHeadlineHidden: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Prompts: what the human must decide now
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type PromptKind =
  | "setup-place" //       USSR: 6 influence in Eastern Europe / US: 7 in Western Europe
  | "bid-place" //         US: +2 bid influence in countries that already hold US influence
  | "headline" //          choose the headline card
  | "action-card" //       choose the card for this action round (China Card included; pass when legal)
  | "play-mode" //         Event / Space / Influence / Coup / Realign for the chosen card
  | "op-mode" //           Influence / Coup / Realign for deferred Ops (event first, free ops, UN Intervention...)
  | "influence" //         place Ops influence, one point per click (`remaining` counts down)
  | "coup-target" //       pick the coup country (the die is rolled inside the step)
  | "realign-target" //    pick a realignment country (one roll per click)
  | "event-target" //      pick a country for an event (place / remove / target)
  | "event-card" //        pick a card for an event (discard, give, retrieve from discard, ...)
  | "branch" //            Warsaw Pact, Olympic Games, Wargames
  | "defcon-level" //      Summit, How I Learned to Stop Worrying
  | "region"; //           Chernobyl

export type OptionKind =
  | "card" //        id = card id (China Card = 6)
  | "mode" //        id = Resolution: 0 EVENT, 1 SPACE, 2 OPS_INFLUENCE, 3 OPS_COUP, 4 OPS_REALIGN
  | "op-mode" //     id = OpMode: 0 INFLUENCE, 1 COUP, 2 REALIGN
  | "country" //     id = engine country id 0..83
  | "branch" //      id = branch index 0..7 (meaning depends on prompt.resolvingCard)
  | "defcon" //      id = DEFCON level 1..5
  | "region" //      id = engine Region 0..5 (EU 0, ASIA 1, ME 2, AF 3, CA 4, SA 5)
  | "done" //        flat 208: pass / stop / decline / return (see Prompt.doneMeaning)
  | "un-intervention"; // flat 31 at Grain Sales: play UN Intervention on the drawn card

export type WarningCode =
  | "scoring-stranded" //   this play leaves more scoring cards than remaining action rounds (incl. China Card, rule 9.5)
  | "defcon-suicide" //     this action drops DEFCON to 1 on your own turn → you lose
  | "cmc-suicide" //        coup under Cuban Missile Crisis → you lose
  | "game-ending" //        engine says this option ends the game (any other reason), see params.winner
  | "opponent-event"; //    playing this opponent card for Ops triggers its event for the opponent

export interface Warning {
  code: WarningCode;
  params?: Record<string, string | number>;
}

export interface PromptOption {
  /** Flat action index; pass to `GameController.choose`. Always a legal `mask(false)` index. */
  idx: number;
  kind: OptionKind;
  id: number;
  warnings?: Warning[];
  /**
   * Influence-type prompts (setup-place, bid-place, influence): how much `remaining` drops: the point's
   * Ops (1, or 2 in a country the opponent controls) plus any conditional bonus it forfeits (China Card
   * outside Asia); all of `remaining` when the point ends the run. Undefined elsewhere. (Gap G1;
   * computed by snapshot → step → restore.)
   */
  cost?: number;
  /**
   * True when choosing this option ends the human's current play: after it the human has no further
   * decision in this play (the AI decides next, a new card must be chosen, or the game ends), for at
   * least one die outcome. The UI stages such options (setting confirmFinal). (Gap G1)
   */
  endsPlay?: boolean;
}

export interface Prompt {
  kind: PromptKind;
  /** Monotonic id; a stale UI click carrying an old promptId is ignored. */
  promptId: number;
  /** engine DecisionType (1 SELECT_CARD, 2 SELECT_PLAY_MODE, 4 SELECT_OP_MODE, 5 POINT_NODE, 6 CHOOSE_BRANCH). */
  decisionType: number;
  /** Card whose event owns this decision (0 = none). 250 = Eagle/Bear discard, 40 = Cuban Missile Crisis payoff. */
  resolvingCard: number;
  /** Card being played for Ops / whose mode is being chosen (0 = none). */
  pendingCard: number;
  /** Ops value being spent (0 at play-mode, where it is not yet known). */
  opsValue: number;
  /** Points / steps left in this decision run. */
  remaining: number;
  /** Per-country cap for event placements (0 = none). */
  maxPerCountry: number;
  options: PromptOption[];
  /** Convenience projections of `options`. */
  cards: number[];
  countries: number[];
  done?: PromptOption;
  doneMeaning?: "pass" | "stop" | "decline" | "return" | "skip";
  /** Human-readable instruction for the prompt header, rendered by the i18n layer. */
  title: Message;
  detail?: Message;
  /**
   * event-target prompts: what a click does and to whose influence (gap G3). "add"/"remove" act on
   * `side`'s influence; "target" picks a country without placing or removing (e.g. a coup event).
   */
  effect?: { verb: "add" | "remove" | "target"; side: Side };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Frames and events: what the UI animates
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type PlayHow = "event" | "space" | "influence" | "coup" | "realign" | "headline" | "scoring" | "discard" | "give" | "pass";

export type GameEvent =
  | { t: "turn-start"; turn: number }
  | { t: "phase"; phase: "SETUP" | "HEADLINE" | "ACTION_ROUND" | "GAME_OVER" }
  | { t: "action-round"; ar: number; side: Side }
  // deal: every card drawn into the side's hand in this frame (deck, the new era's cards at turns 4/8, the
  //       reshuffled discard pile); both sides, the AI's by count only.
  | { t: "deal"; side: Side; count: number }
  | { t: "reshuffle" }
  // hand-revealed: cards newly known. The Cambridge Five's event lists every US scoring card now known, possibly none ([]).
  | { t: "hand-revealed"; side: Side; cards: number[] }
  | { t: "card-played"; side: Side; card: number; how: PlayHow }
  // card-moved: the redacted card_locations diff, except that an AI card revealed in place (no AI deal in the frame) has
  // none. fromHand: set when a card leaves the AI's hidden hand (from = "UNSEEN") for a public place and it is not the
  // AI's own played card, and always when it goes from there into the human's hand (Five Year Plan / Terrorism random
  // discards, Grain Sales / Missile Envy takes, the AI's own discards, the AI's Missile Envy after the exchange); the
  // origin is public under the rules, so the UI may fly it from `hand:<fromHand>` instead of the deck.
  | { t: "card-moved"; card: number; from: string; to: string; fromHand?: Side }
  | { t: "headline-chosen"; side: Side } //                         face down
  | { t: "headline-reveal"; us: number; ussr: number; first: Side }
  | { t: "influence"; country: number; side: Side; from: number; to: number }
  | { t: "control"; country: number; from: Side | "NONE"; to: Side | "NONE" }
  | { t: "roll"; roll: DieRollState }
  | { t: "vp"; from: number; to: number; source?: { card?: number; country?: number } } // source: gap G7
  | { t: "defcon"; from: number; to: number }
  | { t: "milops"; side: Side; from: number; to: number }
  | { t: "space"; side: Side; from: number; to: number }
  | { t: "scoring"; card: number; vp: number } // one per scoring card played (play, headline, event); vp may be 0
  | { t: "effect-on"; flag: string }
  | { t: "effect-off"; flag: string }
  | { t: "china-card"; holder: Side; playable: boolean }
  | { t: "game-over"; ending: Ending };

export interface Frame {
  /** Monotonic; pass back to `ackFrame`. */
  seq: number;
  /** Redacted state to display once this frame's events have played. */
  state: PublicState;
  regionScores: RegionScores;
  /** Side whose decision produced this frame (null for system frames such as the turn start). */
  actor: Side | null;
  /** Ordered list of what changed going into `state`. May be empty. */
  events: GameEvent[];
  /** True when the step was auto-played (single legal option / forced event target). */
  auto: boolean;
  /**
   * Card-play identity (gap G2): every frame from a card's selection/headline until the next card
   * selection, headline or turn end carries the same id; ids increase. Undefined for system frames.
   */
  playId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Log and ending
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LogEntry {
  id: number;
  turn: number;
  ar: number;
  side: Side | null;
  kind: "turn" | "headline" | "play" | "event" | "roll" | "score" | "system";
  /** Main line, rendered in the current language. Card/country params become hoverable refs. */
  text: Message;
  details?: Message[];
  card?: number;
}

export type EndingReason =
  | "vp20" //               20 VP reached during play
  | "europe-control" //     Europe Scoring with control
  | "defcon" //             DEFCON 1 (the phasing player caused it)
  | "cmc-suicide" //        coup under Cuban Missile Crisis
  | "held-scoring" //       a scoring card held at end of turn (tournament rule)
  | "held-scoring-both" //  both held one → draw
  | "milops-vp20" //        military-ops penalty pushed VP to ±20
  | "final-scoring" //      end of turn 10
  | "wargames" //           Wargames event
  | "resign";

export interface Ending {
  winner: Side | "DRAW";
  reason: EndingReason;
  /** VP before the engine clamped/overwrote it (e.g. held-scoring sets ±20). */
  vpBefore: number;
  vpFinal: number;
  turn: number;
  /** For held-scoring: the offending cards. */
  cards?: number[];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// View model and controller
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LoadProgress {
  stage: "engine" | "model-download" | "model-verify" | "ai-worker";
  /** 0..1, or null when unknown. */
  fraction: number | null;
}

export interface ViewModel {
  status: "boot" | "loading" | "menu" | "playing" | "over" | "error";
  load?: LoadProgress;
  error?: string;
  humanSide: Side | null;
  /** The frame the UI should be showing / animating now (null before a game starts). */
  frame: Frame | null;
  /** Frames waiting behind `frame` (the UI may speed up when this grows). */
  queued: number;
  /** Non-null only when the queue is drained and the human must decide. */
  prompt: Prompt | null;
  aiThinking: boolean;
  canUndo: boolean;
  log: readonly LogEntry[];
  ending: Ending | null;
  hasSavedGame: boolean;
  /** Summary of the autosaved game for the start screen (gap G11). Present iff hasSavedGame and readable. */
  savedGame?: { turn: number; ar: number; humanSide: Side; savedAt: number };
  /** AI decisions taken and total thinking time this game, ms (gap G8). */
  aiStats?: { decisions: number; ms: number };
  /** Another tab resumed, started or wrote this saved game; this page takes no more moves and never writes again (Q-002). */
  superseded?: boolean;
  /** At boot, an unfinished save that cannot be resumed was found and discarded; set until a game starts (Q-014).
   *  `reason`: "build" = written by another engine build; "unreadable" = changed or damaged (`savedAt` is 0 then). */
  incompatibleSave?: { savedAt: number; reason?: "build" | "unreadable" };
}

export interface CoupOdds {
  country: number;
  /** One entry per die face 1..6. */
  faces: { die: number; success: boolean; netDelta: number; endsGame: boolean }[];
  /** Ops the coup is credited with (China Card +1 only in Asia, Vietnam Revolts only in SE Asia). Optional (Q-038). */
  ops?: number;
  /** Roll modifier (SALT −1, Latin American Death Squads ±1). Optional (Q-038). */
  modifier?: number;
  /** Military operations the coup credits to the coup's side: 0 for a free event coup (Junta, Tear Down This Wall, Ortega),
   *  the Ops for any other coup, Che's included. Optional (R-002). */
  milOps?: number;
}

/** Realignment odds over the 36 die pairs (gap G5). */
export interface RealignOdds {
  country: number;
  /** Distribution of the result: influence removed from `side` (amount 0 = no change). p sums to 1. */
  outcomes: { side: Side | "NONE"; amount: number; p: number }[];
}

export interface GameController {
  /** useSyncExternalStore-compatible. `getSnapshot` returns a new object only when something changed. */
  subscribe(listener: () => void): () => void;
  getSnapshot(): ViewModel;

  /** Load the engine (and start loading the AI in the background). */
  boot(): Promise<void>;
  newGame(opts: { side: SideChoice; seed?: number }): Promise<void>;
  /** Resume the autosaved game; false if none / incompatible. */
  resume(): Promise<boolean>;
  /** Human answers the current prompt. Ignored unless `promptId` matches and `idx` is an option. */
  choose(promptId: number, idx: number): void;
  undo(): void;
  resign(): void;
  /** The UI finished animating frame `seq`; the controller releases the next one. */
  ackFrame(seq: number): void;
  /** Coup odds at the human's coup-target prompt (null otherwise). */
  coupOdds(country: number): CoupOdds | null;
  /** Effective Ops of `card` if played for Ops now, at the human's play-mode / action-card prompt. */
  effectiveOps(card: number): number | null;
  /** Realignment odds at the human's realign-target prompt (null otherwise). Optional (gap G5). */
  realignOdds?(country: number): RealignOdds | null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One applied decision, recorded for the belief tracker (both sides, game order). */
export interface AiMove {
  /** Engine snapshot (ts_state_size bytes) before the move. */
  before: Uint8Array;
  /** Exactly `engine.decodeFlat(idx)` of the legal index played. */
  action: MicroAction;
}

export interface AiInfo {
  modelSha256: string;
  search: string;
  obsFeatures: number;
  engineFingerprint: string;
}

export interface AiPlayer {
  /** Download/verify/cache the model and start the worker. Idempotent. */
  init(onProgress?: (p: LoadProgress) => void): Promise<AiInfo>;
  /**
   * Choose the AI's action at `state` (engine snapshot). `moves` is the full list of non-auto-played
   * moves of this game so far, both sides, in order; the worker replays its belief from scratch when
   * the list is not an extension of what it saw last (undo, resume, new game).
   * Resolves to a legal flat index of `mask(false)`.
   */
  choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }): Promise<{ idx: number; ms: number }>;
  /** Abort any running search (terminates the worker; the next call restarts it). */
  cancel(): void;
  dispose(): void;
  /**
   * Sampled thinking time (ms) for padding the AI's auto-played answers at hidden-information nodes
   * (Blockade, LADC, Missile Envy), so timing does not reveal that the AI had no choice.
   */
  thinkingDelayMs?(): number;
}

/** AI search configuration (src/ai/config.ts exports the values). */
export interface AiConfig {
  modelUrl: string;
  modelSha256: string;
  /** DS workbench search= string. */
  search: string;
  /** Minimum time an AI decision takes, so timing reveals nothing (ms). */
  minDelayMs: number;
}
