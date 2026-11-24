/**
 * The human's open decision as a `Prompt` (contract.ts): its kind, its options (every legal index
 * of the engine's E4 mask, decoded), what CONFIRM_DONE means here, and the instruction for the prompt
 * header in the `prompt` namespace. No rule is restated: the options are exactly the mask.
 *
 * Reads the UNREDACTED state, but only at the human's own decision, and every word it writes is
 * about public facts (the AI's headline is named only when Space Race box 4 shows it).
 */
import type { GameState } from "../engine/types";
import type { ActionLayout } from "../engine/layout";
import { CARDS_METADATA } from "../data/metadata";
import i18next from "i18next";
import { Message, MessageArg, MessageKey, message, messageIfKnown } from "../i18n";
import type { OptionKind, Prompt, PromptKind, PromptOption, Side } from "./contract";
import type { Names } from "./describe";
import { cardArg, sideArg } from "./log";
import { CHINA_CARD, CUBAN_MISSILE_CRISIS, EAGLE_BEAR_DISCARD, otherSide, playsLeft, scoringInHand } from "./rules";
import { aiHeadlineFaceDown } from "./view";

const CARD_SIDE = new Map(CARDS_METADATA.map(c => [c.id, c.side]));

/** Event POINT_NODEs that are coups (Ortega Elected in Nicaragua, Che): coup odds apply. */
export const EVENT_COUP_CARDS: ReadonlySet<number> = new Set([91, 107]);
/** Event-granted Operations at SELECT_OP_MODE that may be declined (Junta, Tear Down This Wall). */
export const FREE_OPS_CARDS: ReadonlySet<number> = new Set([47, 96]);
/** Our Man in Tehran: CONFIRM_DONE returns the drawn cards not discarded. */
const OUR_MAN_IN_TEHRAN = 108;

/** The side a card's Event belongs to ("us" / "ussr" / "neutral"), from the rules' card list. */
export function cardSide(card: number): "us" | "ussr" | "neutral" | undefined {
  return CARD_SIDE.get(card);
}

/**
 * A message for a key built at run time when the English catalog has it (a plural key -- `_one` /
 * `_other` -- counts when the params carry `count`), else null.
 */
function known(key: string, params?: Record<string, MessageArg>): Message | null {
  const count = params?.count;
  if (typeof count === "number") {
    return i18next.exists(key, { lng: "en", count }) ? message(key as MessageKey, params) : null;
  }
  return messageIfKnown(key, params);
}
function dyn(key: string, params: Record<string, MessageArg> | undefined, fallback: Message): Message {
  return known(key, params) ?? fallback;
}
function opt(key: string, params?: Record<string, MessageArg>): Message | undefined {
  return known(key, params) ?? undefined;
}

/** Which kind of prompt the open decision is (the human's). */
export function classifyPrompt(d: GameState, L: ActionLayout): PromptKind {
  const c = d.decision_context;
  const DT = L.decision_types;
  const rc = c.resolving_card;
  const phase = d.current_phase_name;
  switch (c.decision_type) {
    case DT.POINT_NODE:
      if (phase === "SETUP") return c.pending_ops_value === 1 ? "bid-place" : "setup-place";
      if (rc !== 0) return "event-target";
      if (c.op_mode === L.op_modes.COUP) return "coup-target";
      if (c.op_mode === L.op_modes.REALIGN) return "realign-target";
      return "influence";
    case DT.SELECT_CARD:
      if (rc !== 0) return "event-card";
      return phase === "HEADLINE" ? "headline" : "action-card";
    case DT.SELECT_PLAY_MODE:
      return "play-mode";
    case DT.SELECT_OP_MODE:
      return "op-mode";
    case DT.CHOOSE_BRANCH: {
      const ids = L.card_ids;
      if (rc === ids.SUMMIT || rc === ids.HOW_I_LEARNED_TO_STOP_WORRYING) return "defcon-level";
      if (rc === ids.CHERNOBYL) return "region";
      return "branch";
    }
    default:
      throw new Error(`no prompt for decision type ${c.decision_type}`);
  }
}

/** What flat index `idx` is at decision type `dt`: its option kind and id. */
export function classifyOption(idx: number, dt: number, L: ActionLayout): { kind: OptionKind; id: number } {
  const o = L.offsets;
  const DT = L.decision_types;
  if (idx === L.confirm_done_index) return { kind: "done", id: 0 };
  if (idx < o.play_mode) {
    // At Grain Sales' play-mode node the card slot of UN Intervention plays it on the drawn card.
    if (dt === DT.SELECT_PLAY_MODE) return { kind: "un-intervention", id: idx + 1 };
    return { kind: "card", id: idx + 1 };
  }
  if (idx < o.roll_die) {
    if (dt === DT.SELECT_OP_MODE) return { kind: "op-mode", id: idx - o.op_mode };
    return { kind: "mode", id: idx - o.play_mode };
  }
  if (idx >= o.node && idx < o.branch) return { kind: "country", id: idx - o.node };
  if (idx >= o.branch && idx < L.confirm_done_index) return { kind: "branch", id: idx - o.branch };
  if (idx >= o.defcon_value && idx < o.region) return { kind: "defcon", id: idx - o.defcon_value + 1 };
  if (idx >= o.region && idx < L.size) return { kind: "region", id: idx - o.region };
  throw new Error(`flat index ${idx} has no option kind`);
}

export interface PromptInput {
  /** Unredacted display state; the human is the decider. */
  raw: GameState;
  mask: Uint8Array;
  layout: ActionLayout;
  names: Names;
  human: Side;
  promptId: number;
  /** Effective Ops of the pending card (play-mode detail), when known. */
  pendingOps?: number | null;
}

/** The legal flat indices of a mask, ascending. */
export function legalIndices(mask: Uint8Array, size = mask.length): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) if (mask[i]) out.push(i);
  return out;
}

export function buildPrompt(input: PromptInput): Prompt {
  const { raw, mask, layout: L, names } = input;
  const c = raw.decision_context;
  const kind = classifyPrompt(raw, L);
  const options: PromptOption[] = legalIndices(mask, L.size).map(idx => ({ idx, ...classifyOption(idx, c.decision_type, L) }));
  const done = options.find(o => o.kind === "done");
  const words = promptWords(kind, raw, input, options);
  const prompt: Prompt = {
    kind, promptId: input.promptId, decisionType: c.decision_type, resolvingCard: c.resolving_card,
    pendingCard: c.pending_op_card, opsValue: c.pending_ops_value, remaining: c.remaining_steps,
    maxPerCountry: c.max_per_country, options,
    cards: options.filter(o => o.kind === "card").map(o => o.id),
    countries: options.filter(o => o.kind === "country").map(o => o.id),
    title: words.title,
  };
  if (words.detail) prompt.detail = words.detail;
  if (done) {
    prompt.done = done;
    prompt.doneMeaning = doneMeaning(kind, raw, names);
  }
  return prompt;
}

/** What CONFIRM_DONE means at this prompt. */
function doneMeaning(kind: PromptKind, d: GameState, names: Names): NonNullable<Prompt["doneMeaning"]> {
  const c = d.decision_context;
  const rc = c.resolving_card;
  const ids = names.layout.card_ids;
  switch (kind) {
    case "action-card":
      return "pass";
    case "play-mode":
      return rc === ids.GRAIN_SALES_TO_SOVIETS ? "return" : "skip";
    case "op-mode":
      return "decline";
    case "realign-target":
    case "influence":
    case "coup-target":
      return c.allow_early_stop ? "stop" : "skip";
    case "event-target":
      if (rc === CUBAN_MISSILE_CRISIS) return "decline";
      if (rc === 91 || rc === 107) return "skip";
      return c.allow_early_stop ? "stop" : "skip";
    case "event-card":
      if (rc === ids.BLOCKADE || rc === 95) return "decline";
      if (rc === ids.SALT_NEGOTIATIONS || rc === ids.STAR_WARS) return "skip";
      if (rc === EAGLE_BEAR_DISCARD) return "pass";
      if (rc === OUR_MAN_IN_TEHRAN) return "return";
      return "stop";
    default:
      return "skip";
  }
}

function promptWords(kind: PromptKind, d: GameState, input: PromptInput, options: PromptOption[]): { title: Message; detail?: Message } {
  const { names, human } = input;
  const ai = otherSide(human);
  const c = d.decision_context;
  const rc = c.resolving_card;
  const card = (id: number): MessageArg => cardArg(id, names.cardName(id));
  const remaining = c.remaining_steps;
  const cap = c.max_per_country;
  const remainingDetail = (): Message =>
    cap > 0 && remaining > 1 ? message("prompt:detail.remainingCap", { remaining, cap }) : message("prompt:detail.remaining", { remaining });

  switch (kind) {
    case "setup-place":
      return {
        title: message("prompt:title.setupPlace", { region: { region: human === "USSR" ? "Eastern Europe" : "Western Europe" } }),
        detail: message("prompt:detail.setupPlace", { remaining }),
      };
    case "bid-place":
      return { title: message("prompt:title.bidPlace", { remaining }), detail: message("prompt:detail.bidPlace") };
    case "headline": {
      const hl = ai === "US" ? d.headline_us_card : d.headline_ussr_card;
      const aiPerk = (d.space?.[ai] ?? 0) >= 4 && (d.space?.[human] ?? 0) < 4;
      let detail: Message | undefined;
      if (hl && !aiHeadlineFaceDown(d, human)) detail = message("prompt:detail.headlineSeen", { side: sideArg(ai), card: card(hl) });
      else if (aiPerk) detail = message("prompt:detail.headlineFirst", { side: sideArg(ai) });
      return detail ? { title: message("prompt:title.headline"), detail } : { title: message("prompt:title.headline") };
    }
    case "action-card": {
      const detail = message("prompt:detail.actionCard", { plays: playsLeft(d, human), scoring: scoringInHand(d, human).length });
      const cards = options.filter(o => o.kind === "card").map(o => o.id);
      const envy = names.layout.card_ids.MISSILE_ENVY;
      if (d.forced_card_player === human && d.forced_card_id === envy && cards.includes(envy)) {
        return { title: message("prompt:title.actionCardEnvy"), detail };
      }
      if (human === "US" && d.flags.includes("QUAGMIRE_ACTIVE")) return { title: message("prompt:title.actionCardQuagmire"), detail };
      if (human === "USSR" && d.flags.includes("BEAR_TRAP_ACTIVE")) return { title: message("prompt:title.actionCardBearTrap"), detail };
      if (d.action_round >= 8) return { title: message("prompt:title.actionCardAr8"), detail };
      return { title: message("prompt:title.actionCard", { ar: d.action_round }), detail };
    }
    case "play-mode": {
      const pending = c.pending_op_card;
      if (rc === names.layout.card_ids.GRAIN_SALES_TO_SOVIETS) {
        const un = options.some(o => o.kind === "un-intervention");
        return {
          title: message("prompt:card.67.playMode", { card: card(pending) }),
          detail: un ? message("prompt:card.67.detailUn") : message("prompt:card.67.detail"),
        };
      }
      const side = cardSide(pending);
      const ops = input.pendingOps ?? names.cardOps(pending);
      const scoring = names.cardOps(pending) === 0 && pending !== 6;
      const detail = scoring ? message("prompt:detail.playModeScoring")
        : side === "neutral" ? message("prompt:detail.playModeNeutral", { count: ops })
        : side && side.toUpperCase() !== human ? message("prompt:detail.playModeOpponent", { side: sideArg(side.toUpperCase()) })
        : message("prompt:detail.playModeOwn", { count: ops });
      return { title: message("prompt:title.playMode", { card: card(pending) }), detail };
    }
    case "op-mode": {
      const pending = c.pending_op_card;
      const ops = c.pending_ops_value;
      const side = cardSide(pending);
      // An Event's own Operations (event-granted, or a free coup) are worded by the card; the Ops of
      // an opponent's card used after its Event are the generic case.
      const eventOps = side === "neutral" || side === human.toLowerCase();
      const specific = eventOps ? opt(`prompt:card.${pending}.opMode`, { count: ops }) : undefined;
      const detail = eventOps && FREE_OPS_CARDS.has(pending) ? opt(`prompt:card.${pending}.detailOpMode`) : undefined;
      const title = specific ?? message("prompt:title.opMode", { card: card(pending), count: ops });
      return detail ? { title, detail } : { title };
    }
    case "influence":
      return { title: message("prompt:title.influence", { count: remaining }), detail: message("prompt:detail.influence") };
    case "coup-target": {
      // `pending_ops_value` holds the bonuses that count only where the coup is (the China Card's +1 in Asia, Vietnam
      // Revolts' +1 in Southeast Asia): with one of them it is the most a coup gets, 1 or 2 less elsewhere, and it is
      // worded as a maximum (D-202). The test is the engine's own (ops.cpp budget_if_spent_in).
      const count = c.pending_ops_value;
      const upTo = c.pending_op_card === CHINA_CARD || (human === "USSR" && d.flags.includes("VIETNAM_REVOLTS_ACTIVE"));
      return upTo
        ? { title: message("prompt:title.coupUpTo", { count }), detail: message("prompt:detail.coupUpTo", { count }) }
        : { title: message("prompt:title.coup", { count }), detail: message("prompt:detail.coup", { count }) };
    }
    case "realign-target":
      return { title: message("prompt:title.realign", { count: remaining }), detail: message("prompt:detail.realign") };
    case "event-target": {
      const generic = message("prompt:title.eventTarget", { card: card(rc) });
      if (rc === CUBAN_MISSILE_CRISIS) {
        return { title: message("prompt:card.40.target"), detail: human === "US" ? message("prompt:card.40.detailUS") : message("prompt:card.40.detailUSSR") };
      }
      if (rc === 16 || rc === 33) {
        const add = cap === 2;
        const title = dyn(`prompt:card.${rc}.${add ? "targetAdd" : "targetRemove"}`, undefined, generic);
        const detail = rc === 33 && !add ? message("prompt:card.33.detailRemove", { remaining }) : remainingDetail();
        return { title, detail };
      }
      const title = dyn(`prompt:card.${rc}.target`, undefined, generic);
      // A card whose Event has another decision too (Latin American Debt Crisis: the US's discard, then the USSR's
      // countries) words its target step apart (`detailTarget`): its `detail` is the other decision's.
      const detail = opt(`prompt:card.${rc}.detailTarget`, { count: remaining }) ?? opt(`prompt:card.${rc}.detail`) ?? remainingDetail();
      return { title, detail };
    }
    case "event-card": {
      if (rc === EAGLE_BEAR_DISCARD) {
        return { title: message(human === "US" ? "prompt:card.250.cardUS" : "prompt:card.250.cardUSSR"), detail: message("prompt:card.250.detail") };
      }
      if (rc === names.layout.card_ids.MISSILE_ENVY) {
        return { title: message("prompt:card.49.card", { side: sideArg(ai) }), detail: message("prompt:card.49.detail", { side: sideArg(ai) }) };
      }
      const title = dyn(`prompt:card.${rc}.card`, undefined, message("prompt:title.eventCard", { card: card(rc) }));
      const detail = opt(`prompt:card.${rc}.detail`) ?? (options.some(o => o.kind === "done") ? message("prompt:detail.eventCardDone") : undefined);
      return detail ? { title, detail } : { title };
    }
    case "branch": {
      const generic = message("prompt:title.branch", { card: card(rc) });
      if (rc === names.layout.card_ids.OLYMPIC_GAMES) {
        return { title: message("prompt:card.20.branch", { side: sideArg(ai) }), detail: message("prompt:card.20.detail") };
      }
      const title = dyn(`prompt:card.${rc}.branch`, undefined, generic);
      const detail = opt(`prompt:card.${rc}.detail`);
      return detail ? { title, detail } : { title };
    }
    case "defcon-level": {
      const title = dyn(`prompt:card.${rc}.defcon`, undefined, message("prompt:title.defconLevel", { card: card(rc) }));
      // DEFCON 1 makes the phasing player lose (defcon.hpp resolve_defcon_one_loss): How I Learned played in the AI's
      // round (through Star Wars, say) would make the human win (Q-025).
      const detail = (d.phasing_player === ai ? opt(`prompt:card.${rc}.detailWin`) : undefined) ?? opt(`prompt:card.${rc}.detail`);
      return detail ? { title, detail } : { title };
    }
    case "region": {
      const title = dyn(`prompt:card.${rc}.region`, undefined, message("prompt:title.region", { card: card(rc) }));
      const detail = opt(`prompt:card.${rc}.detail`);
      return detail ? { title, detail } : { title };
    }
  }
}
