// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The display state as the human may see it (port of DS web/ui/src/game/view.ts `redactState`).
 * Every state that reaches the UI -- the live board, a step's settled board, the board after the
 * first headline, any state the frame events are diffed from -- goes through `redactState` first, so
 * no component can show the AI's private information by forgetting to hide it:
 *
 * - the AI's hand keeps only the cards the engine says the human has seen (`HAND_<ai>_KNOWN`); the
 *   rest are only a count (`aiHandCount`);
 * - those unseen cards and the draw deck share one location, `UNSEEN`; so do the cards the AI drew
 *   to choose from (`PEEKED_TEMP`) while it chooses;
 * - a headline the AI has chosen but not revealed is not shown (unless the human holds Space Race
 *   box 4 alone, which makes the AI reveal first);
 * - while the AI decides, its legal actions are withheld (for a card choice they are its hand).
 */
import type { GameState } from "../engine/types";
import type { PublicState, Side } from "./contract";
import { otherSide } from "./rules";

/** The location the human's view gives a card in the draw deck or the AI's unseen hand. */
export const UNSEEN = "UNSEEN";

/** True when `loc` (a raw engine location) is in `side`'s hand. */
export function inHandOf(loc: string | undefined, side: Side): boolean {
  return loc === `HAND_${side}_KNOWN` || loc === `HAND_${side}_UNKNOWN`;
}

/** Whether the AI's committed headline is still face down for the human (raw state). */
export function aiHeadlineFaceDown(s: GameState, human: Side): boolean {
  const ai = otherSide(human);
  const hl = ai === "US" ? s.headline_us_card : s.headline_ussr_card;
  if (!hl) return false;
  const perk = (s.space?.[human] ?? 0) >= 4 && (s.space?.[ai] ?? 0) < 4;
  const loc = s.card_locations?.[String(hl)] ?? "";
  return !perk && loc.startsWith(`HAND_${ai}`);
}

/** The display state as the human (`human`) may see it. Never mutates `s`. */
export function redactState(s: GameState, human: Side): PublicState {
  const ai = otherSide(human);
  const r: GameState = structuredClone(s);
  r.view = human;
  const locs = (s.card_locations ?? {}) as Record<string, string>;
  const known = `HAND_${ai}_KNOWN`;
  const unknown = `HAND_${ai}_UNKNOWN`;
  const aiDeciding = s.decision_context?.decision_player === ai;
  // The card the AI's decision is about is public when it is named in the decision itself (Grain
  // Sales' card drawn from the human's own hand).
  const pendingPublic = s.decision_context?.pending_op_card ?? 0;

  const keep = (id: number) => locs[String(id)] === known;
  const aiHand = s.hands?.[ai] ?? [];
  r.hands[ai] = aiHand.filter(keep);
  const cardsKey = `${ai}_cards` as "US_cards" | "USSR_cards";
  if (s.hands?.[cardsKey]) r.hands[cardsKey] = s.hands[cardsKey]!.filter(c => keep(c.id));
  const hidden = aiHand.length - r.hands[ai].length;
  r.hidden_cards = { US: 0, USSR: 0, [ai]: hidden } as { US: number; USSR: number };

  const rl: Record<string, string> = {};
  for (const [id, loc] of Object.entries(locs)) {
    const peekedHidden = loc === "PEEKED_TEMP" && aiDeciding && Number(id) !== pendingPublic;
    rl[id] = loc === unknown || loc === "DRAW_DECK" || peekedHidden ? UNSEEN : loc;
  }
  r.card_locations = rl;
  r.unseen_count = (s.draw_deck_count || 0) + hidden;

  const faceDown = aiHeadlineFaceDown(s, human);
  if (faceDown) {
    if (ai === "US") r.headline_us_card = 0;
    else r.headline_ussr_card = 0;
  }

  if (aiDeciding && !s.is_terminal) {
    r.view_hidden_decision = true;
    r.legal_actions = {
      ...s.legal_actions, valid_ids: [], valid_action_labels: {}, can_confirm_done: false, can_decline: false,
      un_intervention: false,
    };
  }
  delete r.action_logs;
  return {
    ...r,
    humanSide: human,
    aiHandCount: aiHand.length,
    aiKnownCards: [...r.hands[ai]],
    aiHeadlineHidden: faceDown,
  };
}

/**
 * The cards the human may NOT know the whereabouts of in the raw state `s`: the AI's unseen hand
 * cards and the cards the AI drew to choose from while it chooses (a card in play -- the decision's
 * `pending_op_card` or `resolving_card` -- is public, though the engine leaves it in its owner's hand
 * until the play ends). The AI's face-down headline is one of its unseen cards, or a known
 * card whose being the headline is the secret: `PublicState.headline_<ai>_card` is 0 then.
 */
export function secretCards(s: GameState, human: Side): Set<number> {
  const ai = otherSide(human);
  const out = new Set<number>();
  const aiDeciding = s.decision_context?.decision_player === ai;
  // Cards in play are public: the one being played (it stays in its owner's hand until the play
  // ends), the one whose Event is resolving, and a headline revealed early.
  const inPlay = new Set([s.decision_context?.pending_op_card ?? 0, s.decision_context?.resolving_card ?? 0]);
  // The AI's headline shown by Space Race box 4 is public too.
  const hl = ai === "US" ? s.headline_us_card : s.headline_ussr_card;
  if (hl && !aiHeadlineFaceDown(s, human)) inPlay.add(hl);
  for (const [id, loc] of Object.entries(s.card_locations ?? {})) {
    const n = Number(id);
    if (inPlay.has(n)) continue;
    if (loc === `HAND_${ai}_UNKNOWN`) out.add(n);
    else if (loc === "PEEKED_TEMP" && aiDeciding) out.add(n);
  }
  return out;
}
