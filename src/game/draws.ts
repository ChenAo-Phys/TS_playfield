/**
 * Which cards each side drew between two UNREDACTED engine states, for the controller. Only counts
 * (and the human's own card ids) leave the controller: the AI's draws are told by count alone.
 *
 * A card is drawn when it enters a hand from
 *  - the draw deck (the deal, Ask Not's replacements);
 *  - UNAVAILABLE: the new era's cards join the deck at the start of turns 4 and 8 and are dealt in
 *    the same engine step, so they go straight from UNAVAILABLE into the hands between two states;
 *  - the discard pile, when the deck ran out and the discard pile was reshuffled into it in this
 *    span (the deal, Ask Not), except a card the step itself took from the discard pile (SALT).
 * Cards entering a hand any other way move between public places (Missile Envy -- a headline Missile
 * Envy goes to the giver's hand from the discard pile --, Grain Sales, SALT, an undo) and are told
 * by their `card-moved` events.
 *
 * A reshuffle is seen as discarded cards back in the deck (or in Our Man in Tehran's peek): the
 * engine reshuffles only when the deck runs out, and then the discard pile holds more cards than
 * the draws left to make (the deal needs at most 18, Ask Not fewer than its own discards).
 */
import type { GameState } from "../engine/types";
import type { Side } from "./contract";

export interface DrawCounts {
  /** Cards each side drew (public counts). */
  draws: Record<Side, number>;
  /** The cards each side drew. Only the human's may leave the controller (its own hand). */
  cards: Record<Side, number[]>;
  /** The discard pile was reshuffled into the deck in this span. */
  reshuffled: boolean;
}

function handSide(loc: string | undefined): Side | null {
  if (loc === "HAND_USSR_KNOWN" || loc === "HAND_USSR_UNKNOWN") return "USSR";
  if (loc === "HAND_US_KNOWN" || loc === "HAND_US_UNKNOWN") return "US";
  return null;
}

/**
 * The draws from `b` to `a` (raw states). `taken`: cards the step chose out of the discard pile into
 * a hand (SALT Negotiations), which are not draws.
 */
export function drawCounts(b: GameState, a: GameState, taken: readonly number[] = []): DrawCounts {
  const bl = b.card_locations ?? {};
  const al = a.card_locations ?? {};
  let reshuffled = false;
  for (const [id, loc] of Object.entries(al)) if (bl[id] === "DISCARD_PILE" && (loc === "DRAW_DECK" || loc === "PEEKED_TEMP")) reshuffled = true;
  const draws: Record<Side, number> = { US: 0, USSR: 0 };
  const cards: Record<Side, number[]> = { US: [], USSR: [] };
  for (let id = 1; id <= 110; id++) {
    const side = handSide(al[String(id)]);
    const was = bl[String(id)];
    if (!side || !was || handSide(was)) continue;
    const drawn = was === "DRAW_DECK" || was === "UNAVAILABLE" || (reshuffled && was === "DISCARD_PILE" && !taken.includes(id));
    if (!drawn) continue;
    draws[side]++;
    cards[side].push(id);
  }
  return { draws, cards, reshuffled };
}
