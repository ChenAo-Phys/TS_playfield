/**
 * Words for the parts of a Prompt / Ending the contract carries as codes, so the UI never has to
 * know their parameter conventions: a warning, the CONFIRM_DONE button, an ending's reason. All in
 * the `prompt` namespace (src/i18n/locales/<lang>/prompt.json).
 */
import { CARDS_METADATA } from "../data/metadata";
import { Message, MessageArg, message } from "../i18n";
import type { Ending, EndingReason, Prompt, Warning } from "./contract";
import { FREE_OPS_CARDS } from "./prompt";
import { CHINA_CARD, CUBAN_MISSILE_CRISIS, EAGLE_BEAR_DISCARD } from "./rules";

const CARD_NAME = new Map(CARDS_METADATA.map(c => [c.id, c.name]));

function cardParam(id: number): MessageArg {
  return { card: id, name: CARD_NAME.get(id) ?? `#${id}` };
}

/** A warning attached to a prompt option, as a message. */
export function warningMessage(w: Warning): Message {
  const p = w.params ?? {};
  const faces = typeof p.faces === "number" ? p.faces : 6;
  switch (w.code) {
    case "scoring-stranded":
      return message("prompt:warning.scoring-stranded", { scoring: Number(p.scoring ?? 0), plays: Number(p.plays ?? 0) });
    case "defcon-suicide":
      return faces < 6 ? message("prompt:warning.defcon-suicide-some", { faces }) : message("prompt:warning.defcon-suicide");
    case "cmc-suicide":
      return message("prompt:warning.cmc-suicide");
    case "game-ending": {
      if (p.winner === "DRAW") return message("prompt:warning.game-ending-draw");
      const winner = { side: String(p.winner ?? "") };
      return faces < 6 ? message("prompt:warning.game-ending-some", { faces, winner }) : message("prompt:warning.game-ending", { winner });
    }
    case "opponent-event":
      return message("prompt:warning.opponent-event", { card: cardParam(Number(p.card ?? 0)), side: { side: String(p.side ?? "") } });
  }
}

/** West Germany (Blockade's done label names it). */
const WEST_GERMANY = 7;

/**
 * The CONFIRM_DONE button's label at this prompt: the context's own words where ui-spec section
 * 8.4 gives them (`prompt:doneFor.*`), else the meaning's ("Pass", "Done", "Decline", "Return it",
 * "Skip"). Null when the prompt offers no CONFIRM_DONE. The UI needs nothing else.
 */
export function doneLabel(p: Prompt): Message | null {
  if (!p.done || !p.doneMeaning) return null;
  return doneOverride(p) ?? message(`prompt:done.${p.doneMeaning}` as Message["key"]);
}

function doneOverride(p: Prompt): Message | null {
  switch (p.doneMeaning) {
    case "pass":
      if (p.resolvingCard === EAGLE_BEAR_DISCARD) return message("prompt:doneFor.keepHand");
      if (p.kind !== "action-card") return null;
      if (p.title.key === "prompt:title.actionCardAr8") return message("prompt:doneFor.ar8");
      if (p.cards.length === 1 && p.cards[0] === CHINA_CARD) return message("prompt:doneFor.keepChina");
      return null;
    case "stop":
      return p.kind === "realign-target" ? message("prompt:doneFor.stopRealign") : null;
    case "decline":
      if (p.resolvingCard === CUBAN_MISSILE_CRISIS) return message("prompt:doneFor.keepCrisis");
      if (p.resolvingCard === 10) {
        return message("prompt:doneFor.blockade", { country: { country: WEST_GERMANY, name: "West Germany" } });
      }
      if (p.resolvingCard === 95) return message("prompt:doneFor.ladc");
      if (p.kind === "op-mode" && FREE_OPS_CARDS.has(p.pendingCard)) return message("prompt:doneFor.freeOps");
      return null;
    case "return":
      if (p.resolvingCard === 67) return message("prompt:doneFor.grainSales");
      if (p.resolvingCard === 108) return message("prompt:doneFor.tehran");
      return null;
    case "skip":
      return p.resolvingCard === 43 || p.resolvingCard === 85 ? message("prompt:doneFor.takeNoCard") : null;
    default:
      return null;
  }
}

/** Why a game ended, as a message. */
export function endingReasonMessage(reason: EndingReason): Message {
  return message(`prompt:ending.${reason}` as Message["key"]);
}

/** "The US wins — Control of Europe" style summary parts: the reason, and the held cards if any. */
export function endingMessage(e: Ending): Message {
  return message("prompt:log.gameOver", {
    winner: e.winner === "DRAW" ? message("prompt:log.draw") : { side: e.winner },
    reason: endingReasonMessage(e.reason), vp: e.vpFinal, turn: e.turn,
  });
}
