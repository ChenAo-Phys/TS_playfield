/**
 * The card zoom's play notes (ui-spec §7.5), as data: who the Event fires for, effective Ops (from the
 * controller), the Space Race requirement of the next box (engine layout), the China Card's Asia bonus,
 * and the option's warnings. Pure: the zoom and the card sheet render the result. Nothing here decides
 * legality: every number comes from the controller or the engine's tables.
 */
import { CHINA_CARD, cardInfo } from "../../data";
import type { SpaceBox } from "../../engine/layout";
import type { Prompt, Side, Warning } from "../../game/contract";
import { message, type Message } from "../../i18n";

export interface PlayNote {
  kind: "event" | "ops" | "space" | "asia";
  label: Message | null;
  /** A message, or a bare number as text (effective Ops). */
  value: Message | string;
  /** A second line (the space box's Ops requirement). */
  detail?: Message;
  /** Side whose colour the value takes (event notes). */
  side?: Side;
}

export interface PlayNotesInput {
  card: number;
  prompt: Prompt | null;
  humanSide: Side | null;
  /** Space Race positions (PublicState.space). */
  space: { US: number; USSR: number } | null;
  /** controller.effectiveOps(card) (null when not applicable). */
  effectiveOps: number | null;
  /** engineLayout().space_boxes (null before the engine loads). */
  spaceBoxes: readonly SpaceBox[] | null;
}

export interface PlayNotes {
  notes: PlayNote[];
  warnings: Warning[];
}

const CARD_PROMPTS = new Set<Prompt["kind"]>(["headline", "action-card", "play-mode"]);
const OPS_PROMPTS = new Set<Prompt["kind"]>(["action-card", "play-mode"]);

/** True when the open prompt is about this card (it is offered, or it is the card being played). */
export function promptConcernsCard(prompt: Prompt | null, card: number): prompt is Prompt {
  if (!prompt) return false;
  return prompt.cards.includes(card) || prompt.pendingCard === card;
}

export function cardPlayNotes(i: PlayNotesInput): PlayNotes {
  const { card, prompt, humanSide } = i;
  const info = cardInfo(card);
  if (!info || !promptConcernsCard(prompt, card)) return { notes: [], warnings: [] };
  const notes: PlayNote[] = [];
  const kind = prompt.kind;

  if (CARD_PROMPTS.has(kind) && !info.scoring && humanSide) {
    if (info.side === "NEUTRAL") {
      notes.push({ kind: "event", label: message("ui_common:zoom.notes.event"), value: message("ui_common:zoom.notes.eventNeutral") });
    } else if (info.side === humanSide) {
      notes.push({ kind: "event", label: message("ui_common:zoom.notes.event"), value: message("ui_common:zoom.notes.eventOwn"), side: info.side });
    } else {
      notes.push({
        kind: "event", label: message("ui_common:zoom.notes.event"),
        value: message("ui_common:zoom.notes.eventOpponent", { side: { side: info.side } }), side: info.side,
      });
    }
  }

  if (!info.scoring && i.effectiveOps !== null && i.effectiveOps !== undefined) {
    notes.push({ kind: "ops", label: message("ui_common:zoom.notes.ops"), value: String(i.effectiveOps) });
  }

  if (OPS_PROMPTS.has(kind) && !info.scoring && humanSide && i.space && i.spaceBoxes) {
    const at = i.space[humanSide];
    const next = i.spaceBoxes[at + 1];
    if (next) {
      notes.push({
        kind: "space", label: message("ui_common:zoom.notes.space"),
        value: message("ui_common:zoom.notes.spaceValue", { from: at, to: at + 1, roll: next.max_roll }),
        detail: message("ui_common:zoom.notes.spaceOps", { ops: next.min_ops }),
      });
    }
  }

  if (card === CHINA_CARD && OPS_PROMPTS.has(kind)) {
    notes.push({ kind: "asia", label: null, value: message("ui_common:zoom.notes.asiaBonus") });
  }

  const option = prompt.options.find(o => o.kind === "card" && o.id === card);
  return { notes, warnings: option?.warnings ? [...option.warnings] : [] };
}
