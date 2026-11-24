/**
 * What each box shows, from the (redacted) state: influence and control by country id. Pure.
 */
import type { RegionScore, RegionScores } from "../../engine/types";
import type { PublicState, Side } from "../../game/contract";
import type { MapTargets, RegionSlot } from "./contract";
import { COUNTRY_COUNT } from "./layout";

export type Controller = Side | "NONE";

export interface BoxValues {
  us: number;
  ussr: number;
  ctrl: Controller;
}

export const EMPTY_BOX: BoxValues = Object.freeze({ us: 0, ussr: 0, ctrl: "NONE" }) as BoxValues;

/** Influence and control per country id (0..83). `state.countries` is keyed by engine name; join on id. */
export function boardValues(state: PublicState | null): BoxValues[] {
  const out: BoxValues[] = Array.from({ length: COUNTRY_COUNT }, () => EMPTY_BOX);
  if (!state) return out;
  for (const c of Object.values(state.countries)) {
    if (c && c.id >= 0 && c.id < COUNTRY_COUNT) {
      out[c.id] = { us: c.us_influence, ussr: c.ussr_influence, ctrl: c.controlled_by };
    }
  }
  return out;
}

/** Apply per-country overrides (beats in flight) on top of the state's values. */
export function withOverrides(base: readonly BoxValues[], overrides: Readonly<Record<number, BoxValues>>): BoxValues[] {
  const keys = Object.keys(overrides);
  if (!keys.length) return base as BoxValues[];
  const out = base.slice();
  for (const k of keys) out[Number(k)] = overrides[Number(k)]!;
  return out;
}

export const sameValues = (a: BoxValues, b: BoxValues): boolean => a.us === b.us && a.ussr === b.ussr && a.ctrl === b.ctrl;

export const other = (side: Side): Side => (side === "US" ? "USSR" : "US");

/** The region score for a slot, if the engine scored it. */
export function scoreOf(scores: RegionScores | null, slot: RegionSlot): RegionScore | undefined {
  return scores?.regions.find(r => r.slot === slot);
}

export type TargetLook = "none" | "quiet" | "loud" | "danger";

export function targetLook(targets: MapTargets | null, id: number): TargetLook {
  if (!targets || !targets.ids.has(id)) return "none";
  if (targets.danger.has(id)) return "danger";
  return targets.tone;
}

export interface Ghost {
  side: Side;
  kind: "add" | "remove";
  /** The numeral shown: the next value for "add", the amount removed (1) for "remove". */
  n: number;
}

/**
 * The ghost marker a hovered target shows (ui-spec §4.4): "+1" in the decider's slot for additions,
 * a struck "−1" in the affected side's slot for removals; nothing for coups, realignments and
 * plain "target" events.
 */
export function ghostFor(targets: MapTargets | null, id: number, values: BoxValues, humanSide: Side): Ghost | null {
  if (!targets || !targets.ids.has(id)) return null;
  if (targets.verb === "add") {
    const side = targets.ghostSide ?? humanSide;
    return { side, kind: "add", n: (side === "US" ? values.us : values.ussr) + 1 };
  }
  if (targets.verb === "remove") {
    let side = targets.ghostSide ?? other(humanSide);
    const has = (s: Side) => (s === "US" ? values.us : values.ussr) > 0;
    if (!targets.ghostSide && !has(side) && has(humanSide)) side = humanSide;
    return has(side) ? { side, kind: "remove", n: 1 } : null;
  }
  return null;
}

/** The country tooltip's own state: `pinned` (long-press, right-click, Space) wins over `tipFor` (hover, focus, a tap). */
export interface TipState {
  pinned: number | null;
  tipFor: number | null;
}

export const TIP_CLOSED: TipState = Object.freeze({ pinned: null, tipFor: null }) as TipState;

/**
 * A tap on the map (ui-spec §4.8 on touch; `box` null = the sea, a link or a label, nothing to inspect):
 * on a box that is not a target it opens that box's tooltip, or closes it when that box already shows
 * one; on a target (a click: it plays) it closes another box's tooltip; on the sea it closes it.
 * Touch has no hover to move away from, so a tap is the only way to dismiss it.
 */
export function tipAfterTap(tip: TipState, tap: { box: number | null; target: boolean }): TipState {
  if (tap.box === null) return tip.pinned === null && tip.tipFor === null ? tip : TIP_CLOSED;
  const showing = (tip.pinned ?? tip.tipFor) === tap.box;
  if (tap.target) return showing || (tip.pinned === null && tip.tipFor === null) ? tip : TIP_CLOSED;
  return showing ? TIP_CLOSED : { pinned: null, tipFor: tap.box };
}

/**
 * The box the pointer or the focus raises (draws last, over its neighbours): the hovered one, else the focused one --
 * unless a finger focused it and its tap's click has not come yet (`touchHeld`): then the box raised before the press
 * (`before`) stays raised, so nothing moves until the click. Raising moves the box's node, and lowering one moves the
 * nodes after its slot (React's keyed reorder), and WebKit sends no click for a press whose node left the document
 * between mousedown and mouseup: the first tap on a box did nothing on iPhone / iPad (QA X-1), and so did the first tap
 * on any box after another was focused (round-3 integration: the earlier box's lowering moved the tapped one). The
 * tap's own result (a staged target, a pinned tooltip) raises it.
 */
export function raisedBox(hover: number | null, focused: number | null, touchHeld: number | null, before: number | null = null): number | null {
  if (hover !== null) return hover;
  return focused !== null && focused === touchHeld ? before : focused;
}

/** The map's transient popovers: the country tooltip and a region plate's "if scored now" popover. */
export interface Popovers extends TipState {
  plateTip: RegionSlot | null;
}

/**
 * What the map's transient popovers become (ui-spec §4.8, R-008). They are about the moment:
 *  - "context": a new prompt, the runner taking the map (a frame plays) or a layout change closes the
 *    pinned tooltip and the plate popover, and on `touch` a tapped tooltip too (no hover to leave; a mouse's
 *    hover or a keyboard's focus tooltip follows the pointer or the focus);
 *  - "outside": a press outside the map (a card, the hand drawer, a sheet, the popover itself) closes all;
 *  - "off-map": the box or plate it points at left the map's view (a pan, a rotation): the pinned tooltip
 *    and the plate popover close (a hover / focus tooltip only hides until its box is back).
 * Returns `p` itself when nothing changes.
 */
export function popoversAfter(p: Popovers, e: "context" | "outside" | "off-map", touch: boolean): Popovers {
  const tipFor = e === "outside" || (e === "context" && touch) ? null : p.tipFor;
  if (p.pinned === null && p.plateTip === null && tipFor === p.tipFor) return p;
  return { pinned: null, tipFor, plateTip: null };
}

/** Whether a popover's anchor (a viewport rect) is on the map's view (`view`, the map's viewport rect): its centre inside. */
export function anchorOnMap(anchor: { left: number; top: number; width: number; height: number }, view: { left: number; top: number; width: number; height: number }): boolean {
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  return cx >= view.left && cx <= view.left + view.width && cy >= view.top && cy <= view.top + view.height;
}
