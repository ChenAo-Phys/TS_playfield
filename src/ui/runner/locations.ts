/**
 * Card locations (the redacted `card_locations` strings of `card-moved`) → screen anchors
 * (ui-spec §9.6). Pure.
 *
 * | Location                                    | Anchor                                            |
 * | DRAW_DECK, UNSEEN                           | "deck" (the AI's pinned card: "stage", the dock)   |
 * | HAND_US_* / HAND_USSR_*                     | "card:<id>" when mounted, else "hand:US/USSR"      |
 * | DISCARD_PILE / REMOVED_FROM_GAME            | "discard" / "removed"                              |
 * | ONGOING_EVENT                               | "effects" (never the China Card)                   |
 * | PEEKED_TEMP                                 | "stage"                                            |
 * | HEADLINE_COMMITTED                          | "headline:<side>", the side from the other end     |
 * | UNAVAILABLE, anything else                  | none                                               |
 *
 * A move out of the AI's hidden hand whose origin the rules make public (`card-moved.fromHand`: Five Year Plan /
 * Terrorism random discards, Grain Sales / Missile Envy takes) starts at `hand:<fromHand>`, not at the deck.
 */
import type { Side } from "../../game/contract";
import type { AnchorId } from "../ui-contract";

export interface LocationContext {
  /** Is `card:<id>` on screen (a hand card, the slip clip...)? */
  mounted?: (id: AnchorId) => boolean;
  /** The AI card pinned in the reveal dock (`Shown.aiPlayCard`), 0 = none. */
  aiPlayCard?: number;
  /** The location at the other end of the move (for HEADLINE_COMMITTED's side). */
  other?: string;
  /** Whose headline slot when nothing else says (the side that committed it). */
  headlineSide?: Side;
}

const HAND = /^HAND_(US|USSR)(?:_|$)/;
const CHINA_CARD = 6;

export function handSide(loc: string): Side | null {
  const m = HAND.exec(loc);
  return m ? (m[1] as Side) : null;
}

export function anchorForLocation(loc: string, card: number, ctx: LocationContext = {}): AnchorId | null {
  if (loc === "DRAW_DECK" || loc === "UNSEEN") {
    return card !== 0 && card === ctx.aiPlayCard ? "stage" : "deck";
  }
  const side = handSide(loc);
  if (side) {
    const own: AnchorId = `card:${card}`;
    return ctx.mounted?.(own) ? own : `hand:${side}`;
  }
  switch (loc) {
    case "DISCARD_PILE": return "discard";
    case "REMOVED_FROM_GAME": return "removed";
    case "ONGOING_EVENT": return card === CHINA_CARD ? null : "effects";
    case "PEEKED_TEMP": return "stage";
    case "HEADLINE_COMMITTED": {
      const s = (ctx.other ? handSide(ctx.other) : null) ?? ctx.headlineSide ?? null;
      return s ? `headline:${s}` : null;
    }
    default: return null;
  }
}

export interface FlightPlan {
  from: AnchorId;
  to: AnchorId;
  /** Fly face down (the card is not public at the end of the move). */
  back: boolean;
}

/** A `card-moved` event or beat. */
export interface CardMove {
  card: number;
  from: string;
  to: string;
  /** The hand an UNSEEN card publicly left (contract.ts `card-moved.fromHand`). */
  fromHand?: Side;
}

/**
 * The flight for one `card-moved` beat, or null when there is none (an end without an anchor, the
 * same anchor at both ends, or the AI's pinned card: the reveal dock collapses into its pile). A card
 * that left the AI's hidden hand (`fromHand`) starts at that hand.
 */
export function flightFor(move: CardMove, ctx: LocationContext = {}): FlightPlan | null {
  if (move.card === CHINA_CARD && (move.from === "ONGOING_EVENT" || move.to === "ONGOING_EVENT")) return null;
  if (ctx.aiPlayCard && move.card === ctx.aiPlayCard && (move.from === "UNSEEN" || move.from === "DRAW_DECK")) return null;
  const from: AnchorId | null = move.fromHand && move.from === "UNSEEN"
    ? `hand:${move.fromHand}`
    : anchorForLocation(move.from, move.card, { ...ctx, other: move.to });
  const to = anchorForLocation(move.to, move.card, { ...ctx, other: move.from });
  if (!from || !to || from === to) return null;
  return { from, to, back: move.to === "UNSEEN" || move.to === "DRAW_DECK" };
}
