/**
 * The turn / action round to show (QA Q-031). The engine's counters run past the last round played: the
 * end-of-turn cleanup reads "AR 7" in turn 3 (6 rounds) or "AR 9" in turn 8, and final scoring leaves
 * "turn 11 · AR 0". Every readout (the slip head, the console's turn readout and AR track, the game-over
 * telex) asks this helper instead of printing `state.turn` / `state.action_round`:
 *
 *   setup     the setup phase
 *   headline  the headline phase of `turn`
 *   ar        action round `ar` of `turn` (1 … the turn's last round, AR 8 for a side with that perk); also a
 *             game that ended inside that round (GAME_OVER at a round in range: 20 VP, DEFCON, QA R-014),
 *             the game-over telex's "Turn N · AR M" rule
 *   end       the end of `turn`: the AR counter is past the turn's last round, or another phase (cleanup,
 *             game over at the turn's end: a held scoring card, military ops), or the game ended in a later
 *             turn than the counter shows (final scoring)
 *
 * `turn` is the ending's turn when the game is over (≤ 10), else the engine turn capped at 10.
 */
import type { Ending, PublicState, Side } from "../../game/contract";
import { maxActionRound } from "../../game/rules";

export interface TurnAr {
  phase: "setup" | "headline" | "ar" | "end";
  turn: number;
  /** The action round while one is being played (phase "ar"), else null. */
  ar: number | null;
}

type TurnState = Pick<PublicState, "turn" | "action_round" | "current_phase_name" | "phase_name" | "flags" | "space">;

/** The last action round of the state's turn for either side (6 in turns 1–3, 7 after, 8 with the perk). */
export function lastActionRound(state: TurnState): number {
  const s = state as Parameters<typeof maxActionRound>[0];
  return Math.max(...(["US", "USSR"] as Side[]).map(side => maxActionRound(s, side)));
}

export function displayTurnAr(state: TurnState, ending?: Pick<Ending, "turn"> | null): TurnAr {
  const phase = state.current_phase_name ?? state.phase_name ?? "";
  const turn = Math.min(ending?.turn ?? state.turn, 10);
  // Final scoring (and any ending recorded for an earlier turn than the counter): the end of that turn.
  if (ending && ending.turn !== state.turn) return { phase: "end", turn, ar: null };
  if (phase === "SETUP") return { phase: "setup", turn, ar: null };
  if (phase === "HEADLINE") return { phase: "headline", turn, ar: null };
  const ar = state.action_round;
  const inRange = ar >= 1 && ar <= lastActionRound(state);
  if (phase === "ACTION_ROUND" && inRange) return { phase: "ar", turn, ar };
  // A game that ended inside an action round (20 VP, DEFCON 1) reads that round, as the telex does (R-014).
  if (phase === "GAME_OVER" && inRange && (!ending || ending.turn === state.turn)) return { phase: "ar", turn, ar };
  return { phase: "end", turn, ar: null };
}
