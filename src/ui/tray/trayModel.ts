/**
 * The tray's pure model (ui-spec §7.2–§7.4, §7.6, §8.2 stamps): hand fit and fan, the hand's mode and
 * each card's state, the verb stamp of a staged card, the card lifted out of the hand, the human's
 * headline slot, the "known to AI" flag and the pile tops. No React, no DOM: unit-tested in Node.
 *
 * The tray restates no rules: what is playable comes from the prompt layer (`offered`), what is known
 * from the redacted `card_locations`, and the piles from `PublicState`.
 */
import { CHINA_CARD } from "../../data";
import type { Prompt, PublicState, Side } from "../../game/contract";

export type HandMode = "neutral" | "active" | "passive";
export type HandCardState = "neutral" | "playable" | "unplayable" | "passive" | "lifted" | "staged";
export type StampVerb = "headline" | "discard" | "give" | "play";
export type TrayVariant = "desktop" | "tablet";

/** Fan rotation per card (ui-spec §7.2). */
export const FAN_DEG = 2.2;
/**
 * Overlap bounds: never more than 8 px apart; never more than 55 % of a card. Past that cap the hand keeps
 * the 55 % overlap and scrolls only the remainder, so as many cards as possible stay visible.
 */
export const MIN_OVERLAP = -8;
export const MAX_OVERLAP = 0.55;
/** Horizontal padding the fit leaves free inside the hand (final.js fitHand: clientWidth − 16). */
export const HAND_FIT_PAD = 16;

/** Hand card width in CSS px (height = × 1.4): desktop 104 (112 from 1600 px wide), tablet 86, compact drawer 112. */
export function handCardWidth(variant: TrayVariant | "compact", wide = false): number {
  if (variant === "compact") return 112;
  if (variant === "tablet") return 86;
  return wide ? 112 : 104;
}
/** China Card width in the slot: desktop 92, tablet 78. */
export function chinaCardWidth(variant: TrayVariant): number {
  return variant === "tablet" ? 78 : 92;
}

/** Rotation of card `i` of `n` around its bottom centre, in degrees. */
export function fanAngle(i: number, n: number): number {
  const a = (i - (n - 1) / 2) * FAN_DEG;
  return Object.is(a, -0) ? 0 : a;
}

export interface HandFit {
  /** Px each card slides under its left neighbour (negative = a gap). */
  ov: number;
  /** Too many cards even at the overlap cap: a horizontal scroller (no fan) over the remainder. */
  scroll: boolean;
}

/**
 * Overlap so `n` cards of width `w` fill `avail` px (ui-spec §7.2):
 * `ov = max(−8, (n·w − avail) / (n − 1))`. Past `0.55·w` the overlap stays at `0.55·w` and the hand
 * scrolls the rest (coordinator decision on §7.2: a 9-card hand at 1366 × 768 shows ~7 cards, not ~4).
 */
export function fitHand(n: number, w: number, avail: number): HandFit {
  if (n <= 1) return { ov: 0, scroll: n === 1 && avail > 0 && w > avail };
  const ov = Math.max(MIN_OVERLAP, (n * w - avail) / (n - 1));
  const cap = MAX_OVERLAP * w;
  if (ov > cap) return { ov: Math.round(cap * 10) / 10, scroll: true };
  return { ov: Math.round(ov * 10) / 10, scroll: false };
}

/**
 * Overlap (as a share of the card width) from which an overlapped card wears a spine (QA OD-3): its name runs
 * down the visible strip's left edge instead of the caption, which on a strip that narrow could only show the
 * first letters ("NUCLEA…") or nothing but the Ops badge. Below it the caption's two-line name still fits.
 */
export const SPINE_FROM = 0.12;

/**
 * Does card `i` of `n` wear a spine? Every card the next one covers by at least `SPINE_FROM` of its width; the
 * rightmost card (nothing covers it) keeps its caption. A hovered / focused / staged card shows its caption
 * too, but that is a CSS state (`--spine-on: 0`), not this model.
 */
export function spineOf(i: number, n: number, fit: HandFit, w: number): boolean {
  return i < n - 1 && fit.ov >= SPINE_FROM * w;
}

/** Is any card of the hand (or the China Card) an option of the prompt? */
export function handOffered(hand: readonly number[], offered: ReadonlyMap<number, unknown>, holdsChina = false): boolean {
  return hand.some(c => offered.has(c)) || (holdsChina && offered.has(CHINA_CARD));
}

/**
 * The hand's mode (ui-spec §7.2 states): `active` while a card prompt offers hand cards, `passive`
 * while the prompt is about something else or the AI is moving, `neutral` otherwise.
 */
export function handMode(o: {
  prompt: Prompt | null;
  hand: readonly number[];
  offered: ReadonlyMap<number, unknown>;
  holdsChina?: boolean;
  busy: boolean;
  aiThinking: boolean;
}): HandMode {
  if (o.prompt) return !o.busy && handOffered(o.hand, o.offered, o.holdsChina) ? "active" : "passive";
  return o.busy || o.aiThinking ? "passive" : "neutral";
}

/** One card's state in the hand. */
export function handCardState(card: number, o: {
  mode: HandMode;
  offered: ReadonlyMap<number, unknown>;
  staged: number | null;
  lifted: number | null | ReadonlySet<number>;
}): HandCardState {
  const lifted = o.lifted instanceof Set ? o.lifted.has(card) : o.lifted === card;
  if (lifted) return "lifted";
  if (o.staged === card) return "staged";
  if (o.mode === "active") return o.offered.has(card) ? "playable" : "unplayable";
  if (o.mode === "passive") return "passive";
  return "neutral";
}

/** Event cards whose in-hand card choice is a discard (display-only verb table; ui-spec §8.2 stamps). */
export const DISCARD_PICK_CARDS: ReadonlySet<number> = new Set([10, 77, 95, 98, 108, 250]);
/** Missile Envy: the chosen card is given to the opponent. */
export const GIVE_PICK_CARD = 49;

/** The verb stamped on a staged hand card: headline → HEADLINE, discard prompts → DISCARD, Missile Envy → GIVE, else PLAY. */
export function stampVerb(prompt: Prompt | null): StampVerb {
  if (!prompt) return "play";
  if (prompt.kind === "headline") return "headline";
  if (prompt.kind === "event-card") {
    if (prompt.resolvingCard === GIVE_PICK_CARD) return "give";
    if (DISCARD_PICK_CARDS.has(prompt.resolvingCard)) return "discard";
    return "play";
  }
  if (prompt.kind === "action-card") {
    const key = String(prompt.title?.key ?? "");
    if (key.endsWith("actionCardQuagmire") || key.endsWith("actionCardBearTrap")) return "discard";
  }
  return "play";
}

/**
 * The card lifted out of the hand onto the stage or the slip clip (ui-spec §7.2 "lifted out"): the
 * prompt's `pendingCard` while it is still in hand and not itself an option (play-mode, op-mode…).
 */
export function liftedOutCard(prompt: Prompt | null, hand: readonly number[], holdsChina = false): number | null {
  if (!prompt) return null;
  const c = prompt.pendingCard;
  if (!c || prompt.cards.includes(c)) return null;
  if (c === CHINA_CARD) return holdsChina ? c : null;
  return hand.includes(c) ? c : null;
}

/** Is this prompt answered from the hand (opens the compact drawer, ui-spec §3.3)? */
export function isHandPrompt(prompt: Prompt | null, hand: readonly number[]): boolean {
  if (!prompt) return false;
  if (prompt.kind === "headline" || prompt.kind === "action-card") return true;
  if (prompt.kind === "event-card") return prompt.cards.some(c => hand.includes(c) || c === CHINA_CARD);
  return false;
}

/** The location string of a card in the redacted state (undefined when the state has no locations). */
export function locationOf(state: PublicState, card: number): string | undefined {
  return state.card_locations?.[String(card)];
}

/** The card is in the human's hand and the AI knows it (`HAND_<human>_KNOWN`). */
export function knownToAi(state: PublicState, human: Side, card: number): boolean {
  return locationOf(state, card) === `HAND_${human}_KNOWN`;
}

/**
 * The human's committed headline card (ui-spec §8.6 headline: "a headline slot at the left end of the
 * hand"): the card while it sits in HEADLINE_COMMITTED, face down until the headlines are revealed.
 */
export function headlineSlotOf(state: PublicState, human: Side): { card: number; faceDown: boolean } | null {
  const card = human === "US" ? state.headline_us_card : state.headline_ussr_card;
  if (!card) return null;
  const loc = locationOf(state, card);
  if (loc !== undefined) {
    if (loc !== "HEADLINE_COMMITTED") return null;
  } else if (state.hands[human].includes(card) || (state.current_phase_name ?? state.phase_name) !== "HEADLINE") {
    return null;
  }
  return { card, faceDown: !(state.headline_stage && state.headline_stage > 0) };
}

export interface PilesView {
  deck: number;
  discard: readonly number[];
  removed: readonly number[];
}

/** The top card of a pile (its last entry), or 0 when empty. */
export function pileTop(pile: readonly number[]): number {
  return pile.length ? pile[pile.length - 1]! : 0;
}

/** The human's China Card position: held face up / face down, or with the AI. */
export type ChinaView = "faceUp" | "faceDown" | "withAi";
export function chinaView(china: PublicState["china_card"], human: Side): ChinaView {
  if (china.holder !== human) return "withAi";
  return china.playable ? "faceUp" : "faceDown";
}

/**
 * The catalog key of a hand card's state words (its accessible name): the staged card's "activate again or
 * press Enter" becomes "tap again" on touch (QA Q-032).
 */
export function cardStateKey(state: HandCardState | "faceDown", touch: boolean): `ui_tray:card.state.${HandCardState | "stagedTouch"}` {
  if (state === "faceDown") return "ui_tray:card.state.unplayable";
  if (state === "staged" && touch) return "ui_tray:card.state.stagedTouch";
  return `ui_tray:card.state.${state}`;
}

/**
 * Is the China Card ready for the prompt layer's focus request (Esc / Back to hand after playing it, QA R-016)?
 * The request names card 6; the card is back in the slot face up, not on the stage, clickable, and the hand
 * is choosing again (mode "active"), as `Hand` requires of its own cards.
 */
export function chinaFocusReady(request: number | null, c: { view: ChinaView; lifted: boolean; interactive: boolean; mode: HandMode }): boolean {
  return request === CHINA_CARD && c.view === "faceUp" && !c.lifted && c.interactive && c.mode === "active";
}

/**
 * Serve a focus request (`PromptStore.focusCard`): clear it and focus the card's element (no scroll jump; then
 * into view within the hand's scroller). False when the element is not there yet (the request waits).
 */
export function serveFocusRequest(store: { setFocusCard(card: number | null): void }, el: { focus(o?: { preventScroll?: boolean }): void; scrollIntoView?(o?: ScrollIntoViewOptions): void } | null): boolean {
  if (!el) return false;
  store.setFocusCard(null);
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}
