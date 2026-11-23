/**
 * Rule helpers the controller needs and the engine does not export, each a port or a restatement
 * of engine code with its source named (docs/notes/critique.md section 3). Pure: no engine calls,
 * no DOM. Everything here reads UNREDACTED display states unless it says otherwise.
 */
import type { GameState } from "../engine/types";
import type { Ending, EndingReason, Side } from "./contract";

/** The scoring cards (engine card_data.cpp `is_scoring`): Asia, Europe, Middle East, Central America,
 *  Southeast Asia, Africa, South America. */
export const SCORING_CARDS: readonly number[] = [1, 2, 3, 37, 38, 79, 81];
const SCORING = new Set(SCORING_CARDS);
export const CHINA_CARD = 6;
/** Pseudo card id of the Space Race box-6 end-of-turn discard (layout.card_ids.EAGLE_BEAR_LANDED_DISCARD). */
export const EAGLE_BEAR_DISCARD = 250;
/** Cuban Missile Crisis: also the resolving card of its payoff POINT_NODE. */
export const CUBAN_MISSILE_CRISIS = 40;

/** Decisions whose instant answer could leak the AI's hand (critique.md section 3.9): Blockade,
 *  Latin American Debt Crisis, Missile Envy. See `padsForcedAiDecision` for the rest. */
export const TIMING_PADDED_CARDS: ReadonlySet<number> = new Set([10, 95, 49]);

/** The engine's SELECT_CARD decision type. */
const SELECT_CARD = 1;

/** `side` is trapped by Quagmire (US) / Bear Trap (USSR) in an action round of `d`. */
export function trappedIn(d: GameState, side: Side): boolean {
  return d.current_phase_name === "ACTION_ROUND"
    && (d.flags ?? []).includes(side === "US" ? "QUAGMIRE_ACTIVE" : "BEAR_TRAP_ACTIVE");
}

/**
 * A forced (single legal / forced target) decision of the AI at `d` (unredacted) whose forcedness rests on the AI's
 * unseen hand, so an instant answer would tell the human what that hand holds (critique.md section 3.9). The
 * controller pads such answers like a real decision. `action` is the forced action.
 * - Blockade, Latin American Debt Crisis, Missile Envy (TIMING_PADDED_CARDS);
 * - a card choice whose one legal card is in the AI's own hand: the escape from Quagmire / Bear Trap, the card UN
 *   Intervention is played with, the Missile Envy obligation, a headline from a one-card hand...;
 * - the AI's card choice in an action round while it is trapped, even when the answer is a pass (no eligible card).
 * Choices out of a public set stay instant: Star Wars and SALT (the discard pile), Aldrich Ames (the US hand, shown).
 */
export function padsForcedAiDecision(d: GameState, ai: Side, action: { decision_type: number; primary_id: number }): boolean {
  const c = d.decision_context;
  if (TIMING_PADDED_CARDS.has(c.resolving_card)) return true;
  if (c.decision_type !== SELECT_CARD) return false;
  if (c.resolving_card === 0 && trappedIn(d, ai)) return true;
  const card = action.decision_type === SELECT_CARD ? action.primary_id : 0;
  const loc = card > 0 ? d.card_locations?.[String(card)] ?? "" : "";
  return loc === `HAND_${ai}_UNKNOWN` || loc === `HAND_${ai}_KNOWN`;
}

/** Muslim Revolution's countries in the engine's order (constants.hpp MUSLIM_REVOLUTION_TARGETS). */
export const MUSLIM_REVOLUTION_TARGETS: readonly number[] = [51, 25, 24, 29, 30, 28, 22, 26];
/** Suez Crisis' countries in the engine's order: UK, France, Israel (engine.cpp forced_event_target). */
export const SUEZ_TARGETS: readonly number[] = [1, 8, 23];
export const SUEZ_CRISIS = 28;
export const MUSLIM_REVOLUTION = 56;
export const EAST_EUROPEAN_UNREST = 29;

export function isScoringCard(card: number): boolean {
  return SCORING.has(card);
}

export function otherSide(s: Side): Side {
  return s === "US" ? "USSR" : "US";
}

/** Engine player int (1 US, -1 USSR) for a side. */
export function playerOf(s: Side): number {
  return s === "US" ? 1 : -1;
}

/** Side for an engine player int or a display string; null for none. */
export function sideOf(p: number | string | null | undefined): Side | null {
  if (p === 1 || p === "US") return "US";
  if (p === -1 || p === "USSR") return "USSR";
  return null;
}

/** The engine's display countries by id (the display keys them by English name). */
export function countryById(d: GameState, id: number) {
  for (const c of Object.values(d.countries)) if (c.id === id) return c;
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Action rounds (state_machine.cpp advance_after_action_round)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Whether `side` gets the eighth action round this turn (North Sea Oil for the US, or the Space
 *  Station box alone). Only from turn 4 on. */
export function hasAr8(d: GameState, side: Side): boolean {
  if (d.turn < 4) return false;
  const opp = otherSide(side);
  if (side === "US" && d.flags.includes("NORTH_SEA_OIL_ACTIVE")) return true;
  return (d.space?.[side] ?? 0) >= 8 && (d.space?.[opp] ?? 0) < 8;
}

/** The last action round `side` plays this turn. */
export function maxActionRound(d: GameState, side: Side): number {
  if (hasAr8(d, side)) return 8;
  return d.turn <= 3 ? 6 : 7;
}

/**
 * Card plays `side` has left this turn, counting the one being chosen now when it is `side`'s own
 * action-round card choice. In the headline phase this is every action round of the turn. The USSR
 * moves first and `action_round` advances after the US move, so at AR k the side still to play AR k
 * counts it (critique.md section 3.8).
 */
export function playsLeft(d: GameState, side: Side): number {
  const max = maxActionRound(d, side);
  const phase = d.current_phase_name;
  if (phase === "SETUP" || phase === "HEADLINE") return max;
  if (phase !== "ACTION_ROUND") return 0;
  const ar = d.action_round;
  // Has `side` already played AR `ar`? The USSR plays first in each round.
  const playedThisRound = side === "USSR" && d.phasing_player === "US";
  const next = playedThisRound ? ar + 1 : ar;
  return Math.max(0, max - next + 1);
}

export function scoringInHand(d: GameState, side: Side): number[] {
  return (d.hands?.[side] ?? []).filter(isScoringCard);
}

/**
 * The scoring-card warning (critique.md section 3.8 and rule 9.5 for the China Card): after this
 * choice, will `side` hold more scoring cards than card plays left? `choice` is the card chosen now
 * (0 = pass / discard without playing a scoring card). Only meaningful at `side`'s own card choice
 * in an action round or the headline.
 */
export function strandsScoring(d: GameState, side: Side, choice: number): { stranded: boolean; scoring: number; plays: number } {
  const scoring = scoringInHand(d, side).filter(c => c !== choice).length;
  const phase = d.current_phase_name;
  // The headline uses no action round; an action-round choice uses this one.
  const plays = phase === "HEADLINE" ? maxActionRound(d, side) : Math.max(0, playsLeft(d, side) - 1);
  return { stranded: scoring > plays, scoring, plays };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Plays (Frame.playId, PromptOption.endsPlay)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The open decision is a card choice: an action-round card (or pass), a headline, or the Eagle /
 * Bear Has Landed discard. The step that answers it starts a new play.
 */
export function isCardChoice(d: GameState): boolean {
  const c = d.decision_context;
  return c.decision_type === 1 && (c.resolving_card === 0 || c.resolving_card === EAGLE_BEAR_DISCARD) && d.current_phase_name !== "SETUP";
}

/**
 * Going from the decision in `before` to `now` (raw states, `now` later in the same game) left the
 * play that answering `before` belongs to: the turn or the phase changed, a headline started
 * resolving, or `now` is a card choice, whose answer starts the next play. When `before` is itself
 * a card choice, its answer starts a play, and the first headline starting to resolve in that same
 * step belongs to it (one frame shows both; Frame.playId).
 *
 * The headline phase ending into the action rounds is no boundary of its own (the controller shows it in the step's
 * frame, with the same play id): a decision before the first card choice -- the Cuban Missile Crisis cancel window
 * after the second headline's last point -- belongs to the second headline's play. Stage 3 (both headlines resolved)
 * starts no headline.
 */
export function crossesPlay(before: GameState, now: GameState): boolean {
  const stage0 = (before.headline_stage ?? 0) + (isCardChoice(before) ? 1 : 0);
  const phase0 = before.current_phase_name;
  const phase1 = now.current_phase_name;
  const phaseChanged = phase1 !== phase0 && !(phase0 === "HEADLINE" && phase1 === "ACTION_ROUND");
  return now.turn !== before.turn || phaseChanged || Math.min(now.headline_stage ?? 0, 2) > stage0 || isCardChoice(now);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Forced event targets (engine.cpp forced_event_target, critique.md section 3.1)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The flat index the engine's auto_advance_step would play here, or -1 when the decider has a real
 * choice. `suezStartUS`: US influence in UK/France/Israel when the Suez Crisis POINT_NODE opened
 * (removals so far = start - now). The index is only returned when the mask allows it.
 */
export function forcedEventTarget(d: GameState, mask: Uint8Array, suezStartUS?: Readonly<Record<number, number>> | null,
                                  nodeOffset = 116, confirmDone = 208): number {
  const c = d.decision_context;
  if (c.decision_type !== 5) return -1;
  const legal = (idx: number) => (mask[idx] === 1 ? idx : -1);
  if (c.resolving_card === SUEZ_CRISIS) {
    if (!suezStartUS) return -1;
    let sum = 0;
    let first = -1;
    for (const cid of SUEZ_TARGETS) {
      const now = countryById(d, cid)?.us_influence ?? 0;
      const used = Math.max(0, (suezStartUS[cid] ?? now) - now);
      const cap = used < 2 ? 2 - used : 0;
      const avail = Math.min(now, cap);
      sum += avail;
      if (avail > 0 && first < 0) first = cid;
    }
    if (sum > c.remaining_steps) return -1;
    return first >= 0 ? legal(nodeOffset + first) : legal(confirmDone);
  }
  if (c.resolving_card === MUSLIM_REVOLUTION || c.resolving_card === EAST_EUROPEAN_UNREST) {
    // The mask is exactly {target && !visited} (card_dispatcher.cpp event masks).
    let n = 0;
    for (let cid = 0; cid < 84; cid++) n += mask[nodeOffset + cid] ? 1 : 0;
    if (n > c.remaining_steps) return -1;
    const order = c.resolving_card === MUSLIM_REVOLUTION ? MUSLIM_REVOLUTION_TARGETS : [...Array(84).keys()];
    const f = order.find(cid => mask[nodeOffset + cid]);
    return f === undefined ? legal(confirmDone) : nodeOffset + f;
  }
  return -1;
}

/** US influence in the Suez Crisis countries, to pass to forcedEventTarget when the node opens. */
export function suezSnapshot(d: GameState): Record<number, number> {
  const out: Record<number, number> = {};
  for (const cid of SUEZ_TARGETS) out[cid] = countryById(d, cid)?.us_influence ?? 0;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Endings (critique.md section 3.2)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The engine's `ending_reason()` strings (bindings/state_json.cpp). */
const ENGINE_REASONS: Record<string, EndingReason> = {
  "20 VP": "vp20",
  "Europe Control": "europe-control",
  "wargames": "wargames",
  "final scoring": "final-scoring",
  "DEFCON 1 (own decision)": "defcon",
  "DEFCON 1 (opponent decision)": "defcon",
};

function winnerOf(vp: number): Side | "DRAW" {
  return vp > 0 ? "US" : vp < 0 ? "USSR" : "DRAW";
}

function heldScoring(d: GameState): number[] {
  return [...scoringInHand(d, "US"), ...scoringInHand(d, "USSR")];
}

/**
 * Why the game ended, from the UNREDACTED displays around the game-ending step: `before` = display()
 * before it, `settled` = settledDisplay() and `after` = display() right after it, and the engine's
 * `endingReason()`. Separates the held-scoring-card loss (which the engine reports as "20 VP", or
 * "wargames" when both hold one) and the end-of-turn military-operations penalty from the rest.
 */
export function classifyEnding(before: GameState, settled: GameState, after: GameState, engineReason: string): Ending {
  const base = { vpFinal: after.victory_points, turn: Math.min(after.turn, 10) };
  const flags = after.flags ?? [];
  const winner = winnerOf(after.victory_points);
  if (flags.includes("CMC_SUICIDE_LOSS")) return { ...base, winner, reason: "cmc-suicide", vpBefore: before.victory_points };
  if (after.defcon <= 1) return { ...base, winner, reason: "defcon", vpBefore: before.victory_points };
  if (flags.includes("EUROPE_CONTROL_WIN")) return { ...base, winner, reason: "europe-control", vpBefore: before.victory_points };

  let cleanupRan = false;
  let vpBeforeCleanup = before.victory_points;
  if (before.decision_context?.resolving_card === EAGLE_BEAR_DISCARD) {
    // The box-6 discard sits after the military-ops penalty; answering it runs finish_end_turn.
    cleanupRan = true;
  } else if (!settled.is_terminal) {
    // The turn's cleanup ran inside this step (state_machine.cpp end_turn): the mil-ops penalty
    // first (Scoring::evaluate_military_ops), which can itself end the game.
    const req = settled.defcon;
    const usDef = Math.max(0, req - settled.mil_ops.US);
    const ussrDef = Math.max(0, req - settled.mil_ops.USSR);
    const vp = settled.victory_points + ussrDef - usDef;
    if (Math.abs(vp) >= 20) {
      return { ...base, winner, reason: "milops-vp20", vpBefore: settled.victory_points };
    }
    cleanupRan = true;
    vpBeforeCleanup = vp;
  }
  if (cleanupRan) {
    const us = scoringInHand(after, "US").length > 0;
    const ussr = scoringInHand(after, "USSR").length > 0;
    if (us || ussr) {
      return {
        ...base, winner: us && ussr ? "DRAW" : us ? "USSR" : "US",
        reason: us && ussr ? "held-scoring-both" : "held-scoring",
        vpBefore: vpBeforeCleanup, cards: heldScoring(after),
      };
    }
    // Final scoring ran (the turn counter is past 10); a final score clamped at +/-20 is what the
    // engine reports as "20 VP".
    if (after.turn >= 11) return { ...base, winner, reason: "final-scoring", vpBefore: vpBeforeCleanup };
  }
  const reason = ENGINE_REASONS[engineReason] ?? "vp20";
  return { ...base, winner, reason, vpBefore: before.victory_points };
}

/** A resignation by `loser` at `d`. */
export function resignEnding(d: GameState, loser: Side): Ending {
  return {
    winner: otherSide(loser), reason: "resign", vpBefore: d.victory_points, vpFinal: d.victory_points,
    turn: Math.min(d.turn, 10),
  };
}
