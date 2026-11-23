/**
 * Words the prompt components share: the confirm label of a staged option, the crumb of a play, the
 * slip head, the side's "plays" verb, region names. Built from i18n keys only (no text here).
 */
import { cardInfo } from "../../data";
import type { RegionScores } from "../../engine/types";
import type { Ending, PlayHow, Prompt, PromptOption, PublicState, Side } from "../../game/contract";
import { branchMeta } from "../../game/branches";
import { doneLabel } from "../../game/messages";
import { isScoringCard } from "../../game/rules";
import type { I18n } from "../../i18n/react";
import { effectOf } from "./eventVerbs";
import { cardVerb, isDiceEvent, isTrapEscape } from "./policy";
import { SCORING_SLOT } from "./regions";
import { EVENT_COUP_CARDS } from "../../game/prompt";
import type { RegionSlot } from "../ui-contract";
import { displayTurnAr } from "../common/turnAr";

type T = I18n["t"];

/** Card pickers that repeat one card per click ("Ask Not…", Our Man in Tehran): the slip counts the picks. */
export const REPEATING_PICKERS: ReadonlySet<number> = new Set([77, 108]);

/** The card a prompt is about (its clip on the slip): the pending card, else the resolving one. */
export function promptCard(p: Prompt | null): number {
  if (!p) return 0;
  const c = p.pendingCard || p.resolvingCard;
  return c > 0 && cardInfo(c) ? c : 0;
}

/** A region (engine Region 0..5, or 6 Southeast Asia) in the current language. */
export function slotName(i18n: Pick<I18n, "regionNameById" | "regionName">, slot: number): string {
  return slot === 6 ? i18n.regionName("SOUTHEAST_ASIA") : i18n.regionNameById(slot);
}

/**
 * "ORDERS · TURN 5 · AR 3" / "… · HEADLINE" / "ORDERS · SETUP" / "ORDERS · END OF TURN 3": the turn and AR
 * the game is at (`displayTurnAr`), never the engine's counters past the turn's last round or the end.
 */
export function ordersHead(t: T, state: PublicState | null, ending?: Pick<Ending, "turn"> | null): string {
  if (!state) return t("ui:slip.ordersSetup");
  const at = displayTurnAr(state, ending);
  switch (at.phase) {
    case "setup": return t("ui:slip.ordersSetup");
    case "headline": return t("ui:slip.ordersHeadline", { turn: at.turn });
    case "ar": return t("ui:slip.orders", { turn: at.turn, ar: at.ar ?? 0 });
    case "end": return t("ui_prompts:slip.ordersEnd", { turn: at.turn });
  }
}

/** "+2 USSR" style net of a region's score if scored now (plate words). */
export function scoredNet(t: T, scores: RegionScores | null, slot: RegionSlot): string | null {
  const r = scores?.regions.find(x => x.slot === slot);
  if (!r) return null;
  if (r.wins) return t("ui:plate.wins", { side: t(`ui:side.${r.wins}`) });
  if (r.net === 0) return t("ui:plate.even");
  const side: Side = r.net > 0 ? "US" : "USSR";
  return t("ui:plate.net", { side: t(`ui:side.${side}`), vp: Math.abs(r.net) });
}

/** The primary button's words for committing `option` (§8.1, §8.6, §8.10). */
export function confirmLabel(i18n: I18n, p: Prompt, option: PromptOption, state: PublicState | null, human: Side): string {
  const { t, cardName, countryName, render } = i18n;
  switch (option.kind) {
    case "done": {
      const m = doneLabel(p);
      return m ? render(m) : t("ui:action.confirm");
    }
    case "un-intervention":
      return t("ui:mode.un", { card: cardName(32) });
    case "card": {
      const card = cardName(option.id);
      if (p.kind === "headline") return t("ui:slip.confirm.headline");
      if (p.kind === "action-card") {
        const slot = SCORING_SLOT[option.id];
        if (isScoringCard(option.id) && slot !== undefined) return t("ui:slip.confirm.score", { region: slotName(i18n, slot) });
        if (isTrapEscape(p)) return t("ui:slip.confirm.discard", { card });
        return t("ui:slip.confirm.play", { card });
      }
      const verb = cardVerb(p);
      if (verb === "take") return t("ui:slip.confirm.take", { card });
      if (verb === "discard") return t("ui:slip.confirm.discard", { card });
      if (verb === "give") return t("ui:slip.confirm.give", { card });
      return t("ui:slip.confirm.play", { card });
    }
    case "country": {
      const country = countryName(option.id);
      if (p.kind === "coup-target") return t("ui:slip.confirm.coup");
      if (p.kind === "realign-target") return t("ui:slip.confirm.realign", { country });
      if (p.kind === "event-target") {
        if (EVENT_COUP_CARDS.has(p.resolvingCard)) return t("ui:slip.confirm.coup");
        if (isDiceEvent(p)) return t("ui_prompts:confirm.target", { country });
        const e = effectOf(p, human);
        if (e?.verb === "add") return t("ui_prompts:confirm.place", { country });
        if (e?.verb === "remove") return t("ui_prompts:confirm.remove", { country });
        return t("ui_prompts:confirm.target", { country });
      }
      return t("ui_prompts:confirm.place", { country });
    }
    case "region":
      return t("ui_prompts:confirm.region", { region: slotName(i18n, option.id) });
    case "mode":
      if (option.id === 0) return t("ui_prompts:confirm.event");
      if (option.id === 1) return t("ui_prompts:confirm.space");
      return t(option.id === 2 ? "ui:mode.influence" : option.id === 3 ? "ui:mode.coup" : "ui:mode.realign");
    case "op-mode":
      return t(option.id === 0 ? "ui:mode.influence" : option.id === 1 ? "ui:mode.coup" : "ui:mode.realign");
    case "defcon":
      return t("ui:track.defconLevel", { level: option.id });
    case "branch": {
      const meta = state ? branchMeta(p.resolvingCard, option.id, state) : null;
      return meta ? render(meta.title) : t("ui:action.confirm");
    }
  }
}

/** The mode word of a play (crumb, AI crumb). */
export function howWord(t: T, how: PlayHow): string {
  switch (how) {
    case "event": return t("ui:mode.event");
    case "space": return t("ui:mode.space");
    case "influence": return t("ui:mode.influence");
    case "coup": return t("ui:mode.coup");
    case "realign": return t("ui:mode.realign");
    case "headline": return t("ui:stamp.headline");
    case "scoring": return t("ui_prompts:crumb.scoring");
    case "discard": return t("ui:stamp.discard");
    case "give": return t("ui:stamp.give");
    case "pass": return t("ui:stamp.pass");
  }
}

export interface Crumb {
  card: number;
  mode: string | null;
  /** "→ Iran" (a staged / rolled target). */
  target: string | null;
  /** "3 Ops". */
  ops: string | null;
}

/** The play so far: card › mode → target · Ops (§8.1 crumb), from the prompt and the staged selection. */
export function promptCrumb(i18n: I18n, p: Prompt, staged: PromptOption | null): Crumb {
  const { t, cardName, countryName } = i18n;
  let card = promptCard(p);
  let mode: string | null = null;
  let target: string | null = null;
  let ops: string | null = null;
  switch (p.kind) {
    case "influence": mode = t("ui:mode.influence"); break;
    case "coup-target": mode = t("ui:mode.coup"); break;
    case "realign-target": mode = t("ui:mode.realign"); break;
    case "play-mode": mode = t("ui_prompts:crumb.chooseHow"); break;
    case "op-mode": mode = t("ui:mode.operations"); break;
    case "event-target": case "event-card": case "branch": case "defcon-level": case "region": mode = card ? t("ui:mode.event") : null; break;
    default: break;
  }
  if (staged?.kind === "card" && (p.kind === "headline" || p.kind === "action-card")) card = staged.id;
  else if (staged?.kind === "card") target = cardName(staged.id);
  if (staged?.kind === "country") target = countryName(staged.id);
  if (staged?.kind === "region") target = slotName(i18n, staged.id);
  if ((p.kind === "coup-target" || p.kind === "realign-target" || p.kind === "influence") && p.opsValue > 0) {
    ops = t("ui_prompts:ops", { count: p.opsValue });
  }
  return { card, mode, target, ops };
}
