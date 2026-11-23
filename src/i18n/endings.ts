/**
 * The game-over dialog's words for a contract `Ending`, as Messages (so a language switch redraws
 * them): a title from the human's point of view and one sentence for why the game ended.
 *
 *   const { title, text } = endingMessages(vm.ending, vm.humanSide);
 *   <h2>{render(title)}</h2><p>{render(text)}</p>
 */
import type { Ending, Side } from "../game/contract";
import { cardInfo } from "../data";
import { message, type Message, type MessageArg } from "./index";

export interface EndingMessages {
  /** "Victory" / "Defeat" / "Draw" for the human. */
  title: Message;
  /** Why the game ended (`ui:ending.reason.*`, or `ui:ending.drawReason.*` for a draw). */
  text: Message;
  /** The human won / lost / drew. */
  outcome: "won" | "lost" | "draw";
}

const other = (s: Side): Side => (s === "US" ? "USSR" : "US");

/** Card names as one list argument ("Asia Scoring, Europe Scoring" / "亚洲计分、欧洲计分"). */
export function cardListArg(cards: readonly number[]): MessageArg {
  const args: MessageArg[] = cards.map(id => ({ card: id, name: cardInfo(id)?.title.en ?? `#${id}` }));
  if (args.length === 0) return "";
  return args.reduceRight((rest, a) => message("ui:list.pair", { a, b: rest }));
}

export function endingMessages(ending: Ending, humanSide: Side): EndingMessages {
  if (ending.winner === "DRAW") {
    const text =
      ending.reason === "held-scoring-both" ? message("ui:ending.reason.held-scoring-both", { turn: ending.turn })
      : ending.reason === "final-scoring" ? message("ui:ending.drawReason.final-scoring")
      : ending.reason === "wargames" ? message("ui:ending.drawReason.wargames")
      : message("ui:ending.drawReason.other");
    return { title: message("ui:ending.title.draw"), text, outcome: "draw" };
  }
  const winner = ending.winner;
  const outcome = winner === humanSide ? "won" : "lost";
  const params: Record<string, MessageArg> = {
    winner: { side: winner },
    loser: { side: other(winner) },
    turn: ending.turn,
    vp: Math.abs(ending.vpFinal),
    cards: cardListArg(ending.cards ?? []),
  };
  return {
    title: message(outcome === "won" ? "ui:ending.title.won" : "ui:ending.title.lost"),
    text: message(`ui:ending.reason.${ending.reason}`, params),
    outcome,
  };
}
