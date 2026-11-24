/**
 * Region prompt rows on the slip (ui-spec §8.11, Chernobyl): one button per offered region, in board
 * order. Hover spotlights the region on the map (the shell passes the hovered / staged region as
 * `focusRegion`); activation stages it, and the slip states the consequence (`branchMeta`); a second
 * activation, Enter or the slip's primary commits. The map's plates and the compact theatre chips call
 * the same `activateRegion`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Prompt } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { useTouchUi } from "../common/touch";
import type { RegionSlot } from "../ui-contract";
import { slotName } from "./labels";
import { BOARD_SLOTS, regionTargetsOf } from "./regions";
import { usePromptActions } from "./usePromptActions";
import s from "./OrdersSlip.module.css";

export { regionTargetsOf } from "./regions";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How far a dense region button tightens so its short name stays whole (QA R3-05): 1 drops the staged primary's ↵
 * key cap (the ink fill already marks it), 2 also drops the caps tracking. Names that fit are never touched.
 */
export type NameFit = 0 | 1 | 2;

/** One step further for each button whose name is cut (`cut`: region slots), up to 2; null when nothing changes. */
export function nextNameFit(levels: Readonly<Record<number, NameFit>>, cut: readonly number[]): Record<number, NameFit> | null {
  let next: Record<number, NameFit> | null = null;
  for (const slot of cut) {
    const now = levels[slot] ?? 0;
    if (now >= 2) continue;
    next ??= { ...levels };
    next[slot] = (now + 1) as NameFit;
  }
  return next;
}

const NO_FIT: Readonly<Record<number, NameFit>> = {};

/**
 * The fit levels of a dense grid's buttons: measured after each render, one step at a time while a name is cut;
 * back to none when `key` changes (language, staged region, touch) or the grid's width or the web fonts change.
 */
function useNameFit(group: RefObject<HTMLElement | null>, key: string, enabled: boolean): Readonly<Record<number, NameFit>> {
  const [epoch, setEpoch] = useState(0);
  const full = `${key}|${epoch}`;
  const [fit, setFit] = useState<{ key: string; levels: Readonly<Record<number, NameFit>> }>({ key: full, levels: NO_FIT });
  const levels = fit.key === full ? fit.levels : NO_FIT;
  useIsoLayoutEffect(() => {
    const el = group.current;
    if (!enabled || !el) return;
    const cut = Array.from(el.querySelectorAll<HTMLElement>("[data-slot]"))
      .filter(b => { const n = b.firstElementChild as HTMLElement | null; return !!n && n.scrollWidth > n.clientWidth + 0.5; })
      .map(b => Number(b.dataset.slot));
    const next = nextNameFit(levels, cut);
    if (next) setFit({ key: full, levels: next });
  });
  useIsoLayoutEffect(() => {
    const el = group.current;
    if (!enabled || !el) return;
    let width = el.clientWidth;
    const again = () => setEpoch(n => n + 1);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; again(); }
    }) : null;
    ro?.observe(el);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", again);
    return () => { ro?.disconnect(); fonts?.removeEventListener?.("loadingdone", again); };
  }, [enabled]);
  return enabled ? levels : NO_FIT;
}

/**
 * `dense` (desktop / tablet slips, where height is short): the staged region's own button is the
 * primary (ink, ↵), so no separate actions row is needed. No key cap on touch screens (§3.3, QA R-011), nor
 * where the name needs its room (`useNameFit`, R3-05).
 */
export function RegionChoice({ prompt, dense = false }: { prompt: Prompt; dense?: boolean }) {
  const i18n = useI18n();
  const touch = useTouchUi();
  const actions = usePromptActions();
  const offered = regionTargetsOf(prompt);
  const staged = actions.staged?.kind === "region" ? actions.staged.id : null;
  const slots = BOARD_SLOTS.filter(slot => offered.has(slot));
  const group = useRef<HTMLDivElement | null>(null);
  const fit = useNameFit(group, `${i18n.lang}|${staged}|${touch}`, dense);
  return (
    <div ref={group} className={[s.regions, dense ? s.regionsDense : ""].join(" ")} role="group" aria-label={i18n.t("ui_prompts:region.label")}>
      {slots.map(slot => (
        <button
          key={slot}
          type="button"
          className={[s.regionBtn, dense && staged === slot ? s.regionPrimary : ""].join(" ")}
          data-slot={slot}
          data-fit={fit[slot] || undefined}
          aria-pressed={staged === slot}
          aria-label={slotName(i18n, slot)}
          title={slotName(i18n, slot)}
          disabled={!actions.interactive}
          onClick={() => actions.activateRegion(slot as RegionSlot)}
          onPointerEnter={() => actions.hoverRegion(slot as RegionSlot)}
          onPointerLeave={() => actions.hoverRegion(null)}
          onFocus={() => actions.hoverRegion(slot as RegionSlot)}
          onBlur={() => actions.hoverRegion(null)}
        >
          {/* The short plate names everywhere ("C. America"); the full name is the button's label and title. */}
          <span className={s.regionName}>{i18n.t(`ui:plate.name.${slot as 0}`)}</span>
          {dense && staged === slot && !touch && !fit[slot] ? <kbd className={s.regionKbd} aria-hidden="true">↵</kbd> : null}
        </button>
      ))}
    </div>
  );
}
