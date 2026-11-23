/**
 * The confirmation model (ui-spec §8.2, §8.3, §8.6): how each prompt option is committed.
 *
 *   instant  one activation calls `choose`.
 *   stage    the first activation selects, the second one (or Enter / the slip's primary) commits.
 *   hold     press and hold 1.2 s (certain game-ending choices).
 *
 * Pure and unit-tested against every row of §8.2 / §8.6 (tests/ui/prompts/policy.test.ts). The only
 * inputs are the prompt, the option, the confirmFinal setting, the display-only `cost2` set (gap G1
 * fallback) and, optionally, the human's side (to tell a winning game end from a losing one).
 */
import { cardInfo } from "../../data";
import type { Prompt, PromptKind, PromptOption, Side, Warning, WarningCode } from "../../game/contract";
import { EVENT_COUP_CARDS } from "../../game/prompt";
import { isScoringCard } from "../../game/rules";
import type { Commit, OptionPolicy, UiSettings } from "../ui-contract";

/** Warnings that end the game (on some or all die faces). */
export const FATAL_CODES: ReadonlySet<WarningCode> = new Set<WarningCode>(["defcon-suicide", "cmc-suicide", "game-ending"]);

/** Kinds whose country / card / branch choices always stage (dice, headlines, event choices). */
export const ALWAYS_STAGE_KINDS: ReadonlySet<PromptKind> = new Set<PromptKind>([
  "coup-target", "realign-target", "headline", "event-card", "branch", "defcon-level", "region",
]);

/** Prompts answered on the map (ui-spec §8.5). */
export const MAP_KINDS: ReadonlySet<PromptKind> = new Set<PromptKind>([
  "setup-place", "bid-place", "influence", "coup-target", "realign-target", "event-target",
]);

/** Influence-type kinds: one point per click, `cost` and the "2 Ops" tag apply. */
export const PLACEMENT_KINDS: ReadonlySet<PromptKind> = new Set<PromptKind>(["setup-place", "bid-place", "influence"]);

/** Wargames (#100): branch 0 ends the game. */
export const WARGAMES = 100;

/** Title keys of the action-card prompts that are a trap escape (discard a 2+ Ops card). */
const TRAP_TITLES: ReadonlySet<string> = new Set(["prompt:title.actionCardQuagmire", "prompt:title.actionCardBearTrap"]);

export interface PolicyContext {
  settings: Pick<UiSettings, "confirmFinal">;
  /** Display-only "a point here costs 2 Ops" set (costHint.ts). */
  cost2: ReadonlySet<number>;
  /** The human's side; lets a game end the human wins stage instead of hold. */
  humanSide?: Side;
}

/** Die faces (of 6) on which a fatal warning applies; 6 when absent (certain). */
export function warningFaces(w: Warning): number {
  const f = w.params?.faces;
  return typeof f === "number" && f >= 0 ? f : 6;
}

/** A defcon-suicide / cmc-suicide / game-ending warning. */
export function isFatalCode(w: Warning): boolean {
  return FATAL_CODES.has(w.code);
}

/** A game-ending warning whose winner is the human (not a danger, but still final). */
export function isHumanWin(w: Warning, humanSide?: Side): boolean {
  return w.code === "game-ending" && !!humanSide && w.params?.winner === humanSide;
}

/** Fatal for the human: ends the game in a loss or a draw (on at least one face). */
export function isDanger(w: Warning, humanSide?: Side): boolean {
  return isFatalCode(w) && !isHumanWin(w, humanSide) && warningFaces(w) > 0;
}

/**
 * What an option's game-ending warnings say about the end of the game (display): "win" when the human
 * wins on at least one face, "lose" for a loss or a draw, null when no warning names an end.
 */
export function gameEndOf(warnings: readonly Warning[] | undefined, humanSide?: Side): "win" | "lose" | null {
  const ws = warnings ?? [];
  if (ws.some(w => isDanger(w, humanSide))) return "lose";
  if (ws.some(w => isHumanWin(w, humanSide) && warningFaces(w) > 0)) return "win";
  return null;
}

/** The most severe warning on an option (styling): fatal > caution > info > none. */
export function severityOf(warnings: readonly Warning[] | undefined, humanSide?: Side): OptionPolicy["severity"] {
  const ws = warnings ?? [];
  if (ws.some(w => isDanger(w, humanSide))) return "fatal";
  if (ws.some(w => w.code === "scoring-stranded" || isHumanWin(w, humanSide))) return "caution";
  if (ws.some(w => w.code === "opponent-event")) return "info";
  return "none";
}

/** The trap-escape discard at Quagmire / Bear Trap (an action-card prompt). */
export function isTrapEscape(prompt: Prompt): boolean {
  return prompt.kind === "action-card" && TRAP_TITLES.has(prompt.title.key);
}

/** A die-rolling event target (war cards, the event coups of Ortega and Che). */
export function isDiceEvent(prompt: Prompt): boolean {
  if (prompt.kind !== "event-target") return false;
  return !!cardInfo(prompt.resolvingCard)?.war || EVENT_COUP_CARDS.has(prompt.resolvingCard);
}

/**
 * The "final point" of a placement run (§8.2): the click that ends the human's play. The controller's
 * `endsPlay` answers it (gap G1); else the option's `cost` (the point uses up `remaining`); else the
 * spec's fallback `remaining === 1 || (remaining === 2 && cost2)`.
 */
export function isFinalPoint(prompt: Prompt, option: PromptOption, cost2: ReadonlySet<number>): boolean {
  if (option.kind !== "country") return false;
  if (!PLACEMENT_KINDS.has(prompt.kind) && prompt.kind !== "event-target") return false;
  if (option.endsPlay !== undefined) return option.endsPlay;
  if (option.cost !== undefined) return option.cost >= prompt.remaining;
  return prompt.remaining <= 1 || (prompt.remaining === 2 && cost2.has(option.id));
}

/**
 * Whether choosing the option ends the human's play (what `confirmFinal` stages): every `done` press,
 * the final point of a placement run, play-mode Event and Space, and any other option the controller
 * marks `endsPlay` (e.g. a Coup mode whose only target is auto-played).
 */
export function endsThePlay(prompt: Prompt, option: PromptOption, cost2: ReadonlySet<number>): boolean {
  if (option.kind === "done") return true;
  if (option.kind === "country" && (PLACEMENT_KINDS.has(prompt.kind) || prompt.kind === "event-target")) {
    return isFinalPoint(prompt, option, cost2);
  }
  if (prompt.kind === "play-mode" && option.kind === "mode" && (option.id === 0 || option.id === 1)) {
    return option.endsPlay ?? true;
  }
  return option.endsPlay === true;
}

/** How the option is committed (§8.2). */
export function commitFor(prompt: Prompt, option: PromptOption, ctx: PolicyContext): Commit {
  const ws = option.warnings ?? [];
  const human = ctx.humanSide;
  // hold: a certain loss (or draw), Wargames' "end the game", DEFCON 1 (unless its own warning says the
  // human wins: the phasing player takes the DEFCON-1 loss, so Summit / How I Learned in the AI's round win).
  if (ws.some(w => isFatalCode(w) && warningFaces(w) >= 6 && !isHumanWin(w, human))) return "hold";
  if (prompt.kind === "branch" && prompt.resolvingCard === WARGAMES && option.kind === "branch" && option.id === 0) return "hold";
  if (prompt.kind === "defcon-level" && option.kind === "defcon" && option.id === 1 && !ws.some(w => isHumanWin(w, human))) return "hold";
  // stage, always.
  if (option.kind !== "done" && ALWAYS_STAGE_KINDS.has(prompt.kind)) return "stage";
  if (prompt.kind === "action-card" && option.kind === "card") {
    if (isScoringCard(option.id) || isTrapEscape(prompt)) return "stage";
    if (ws.some(w => w.code !== "opponent-event")) return "stage";
  }
  if (option.kind === "country" && isDiceEvent(prompt)) return "stage";
  if (ws.some(w => w.code === "scoring-stranded")) return "stage";
  if (ws.some(w => isFatalCode(w))) return "stage"; // some faces only, or a game end the human wins
  // stage when the setting asks to confirm the end of a play.
  if (ctx.settings.confirmFinal && endsThePlay(prompt, option, ctx.cost2)) return "stage";
  return "instant";
}

/** The option's commit policy and warning severity (§8.2, §8.3). */
export function policyFor(prompt: Prompt, option: PromptOption, ctx: PolicyContext): OptionPolicy {
  return { option, commit: commitFor(prompt, option, ctx), severity: severityOf(option.warnings, ctx.humanSide) };
}

/** Every option's policy by flat index. */
export function policiesOf(prompt: Prompt, ctx: PolicyContext): ReadonlyMap<number, OptionPolicy> {
  const out = new Map<number, OptionPolicy>();
  for (const o of prompt.options) out.set(o.idx, policyFor(prompt, o, ctx));
  return out;
}

/** Card prompts answered from the hand (the China Card included). */
export const HAND_KINDS: ReadonlySet<PromptKind> = new Set<PromptKind>(["headline", "action-card", "event-card"]);

/**
 * The hand's offers: card id → policy for each card option of a headline / action-card / event-card
 * prompt (the tray's `Hand.offered`; the China slot reads `.get(6)`). Empty for other prompts.
 */
export function handPolicies(prompt: Prompt | null, ctx: PolicyContext): ReadonlyMap<number, OptionPolicy> {
  const out = new Map<number, OptionPolicy>();
  if (!prompt || !HAND_KINDS.has(prompt.kind)) return out;
  for (const o of prompt.options) if (o.kind === "card") out.set(o.id, policyFor(prompt, o, ctx));
  return out;
}

/** What a card prompt does with the chosen card. */
export type CardVerb = "headline" | "play" | "discard" | "give" | "take";

/** Event-card prompts by resolving card: what happens to the chosen card. */
const EVENT_CARD_VERBS: Readonly<Record<number, CardVerb>> = {
  10: "discard", // Blockade
  32: "play", //    UN Intervention
  43: "take", //    SALT Negotiations (from the discard pile)
  49: "give", //    Missile Envy
  77: "discard", // "Ask Not…"
  85: "take", //    Star Wars (from the discard pile)
  95: "discard", // Latin American Debt Crisis
  98: "discard", // Aldrich Ames Remix (from the US hand)
  108: "discard", // Our Man in Tehran (the drawn cards)
  250: "discard", // Eagle / Bear Has Landed
};

/** The verb of a card prompt: "headline", "discard" (trap escapes, discards), "give", "take", "play". */
export function cardVerb(prompt: Prompt): CardVerb {
  if (prompt.kind === "headline") return "headline";
  if (isTrapEscape(prompt)) return "discard";
  if (prompt.kind === "event-card") return EVENT_CARD_VERBS[prompt.resolvingCard] ?? "play";
  return "play";
}

/** The stamp on a staged hand card (§8.2): HEADLINE / DISCARD / GIVE / PLAY (`ui:stamp.<verb>`). */
export function stampVerb(prompt: Prompt): "headline" | "discard" | "give" | "play" {
  const v = cardVerb(prompt);
  return v === "take" ? "play" : v;
}
