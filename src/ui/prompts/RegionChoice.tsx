/**
 * Region prompt rows on the slip (ui-spec §8.11, Chernobyl): one button per offered region, in board
 * order. Hover spotlights the region on the map (the shell passes the hovered / staged region as
 * `focusRegion`); activation stages it, and the slip states the consequence (`branchMeta`); a second
 * activation, Enter or the slip's primary commits. The map's plates and the compact theatre chips call
 * the same `activateRegion`.
 */
import type { Prompt } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { useTouchUi } from "../common/touch";
import type { RegionSlot } from "../ui-contract";
import { slotName } from "./labels";
import { BOARD_SLOTS, regionTargetsOf } from "./regions";
import { usePromptActions } from "./usePromptActions";
import s from "./OrdersSlip.module.css";

export { regionTargetsOf } from "./regions";

/**
 * `dense` (desktop / tablet slips, where height is short): the staged region's own button is the
 * primary (ink, ↵), so no separate actions row is needed. No key cap on touch screens (§3.3, QA R-011).
 */
export function RegionChoice({ prompt, dense = false }: { prompt: Prompt; dense?: boolean }) {
  const i18n = useI18n();
  const touch = useTouchUi();
  const actions = usePromptActions();
  const offered = regionTargetsOf(prompt);
  const staged = actions.staged?.kind === "region" ? actions.staged.id : null;
  const slots = BOARD_SLOTS.filter(slot => offered.has(slot));
  return (
    <div className={[s.regions, dense ? s.regionsDense : ""].join(" ")} role="group" aria-label={i18n.t("ui_prompts:region.label")}>
      {slots.map(slot => (
        <button
          key={slot}
          type="button"
          className={[s.regionBtn, dense && staged === slot ? s.regionPrimary : ""].join(" ")}
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
          {dense && staged === slot && !touch ? <kbd className={s.regionKbd} aria-hidden="true">↵</kbd> : null}
        </button>
      ))}
    </div>
  );
}
