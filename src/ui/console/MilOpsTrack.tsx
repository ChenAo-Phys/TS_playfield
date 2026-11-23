/**
 * Mil-ops instrument (ui-spec §5): "Mil ops · need 3", two rows (US first) of five 9×9 cells, filled in
 * the side colour (US square, USSR chamfered: shape, not only colour), the required level (= DEFCON, as
 * the board prints it) outlined in brass, side tags "★ 2" / "☭ 1". A `milops` beat fills or empties the
 * cells left to right. Tooltip: the shortfall "USSR short by 2" (display only, gap G10).
 */
import type { CSSProperties } from "react";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { SideGlyph } from "../common/SideGlyph";
import { milOpsShort } from "./model";
import { Instrument } from "./Instrument";
import { useTrackView, type TrackAnim } from "./trackStore";
import s from "./Console.module.css";

export interface MilOpsTrackProps {
  milOps: { US: number; USSR: number };
  required: number;
  className?: string;
}

const SIDES: Side[] = ["US", "USSR"];
const CELLS = [1, 2, 3, 4, 5];

export function MilOpsTip({ milOps, required }: MilOpsTrackProps) {
  const { t } = useI18n();
  return (
    <>
      <div className={s.tipHead}>{t("ui:track.milopsLong")}</div>
      {SIDES.map(side => {
        const short = milOpsShort(milOps[side], required);
        return (
          <div key={side} className={s.tipRow}>
            <span className={side === "US" ? s.sideUs : s.sideUssr}><SideGlyph side={side} /></span>{" "}
            {short > 0
              ? t("ui:track.short", { side: t(`ui:side.${side}`), n: short })
              : t("ui_console:milops.tip.status", { side: t(`ui:side.${side}`), n: milOps[side], need: required })}
          </div>
        );
      })}
    </>
  );
}

function Row({ side, n, required, anim }: { side: Side; n: number; required: number; anim: TrackAnim | undefined }) {
  const live = anim && anim.ms > 0 && !anim.reduced ? anim : null;
  const changed = live ? Math.max(1, Math.abs(live.to - live.from)) : 1;
  const step = live ? Math.min(40, live.ms / (changed + 6)) : 0;
  return (
    <div className={[s.moRow, side === "US" ? s.us : s.ussr].join(" ")}>
      {CELLS.map(i => {
        const lo = live ? Math.min(live.from, live.to) : 0;
        const order = live ? i - lo - 1 : 0; // left to right, filling or emptying
        const each = Math.max(60, Math.round(live ? live.ms - step * changed : 0));
        const delay = Math.round(Math.max(0, order) * step);
        const style: CSSProperties | undefined = live
          ? { transition: `background-color ${each}ms var(--ts-ease-out) ${delay}ms, box-shadow ${each}ms var(--ts-ease-out) ${delay}ms` }
          : undefined;
        return <i key={i} className={[i <= n ? s.f : "", i === required ? s.req : ""].filter(Boolean).join(" ")} style={style} />;
      })}
    </div>
  );
}

export function MilOpsTrack({ milOps, required, className }: MilOpsTrackProps) {
  const { t } = useI18n();
  const view = useTrackView();
  const label = t("ui_console:milops.aria", { need: required, us: milOps.US, ussr: milOps.USSR });
  return (
    <Instrument label={label} anchor={["milops:US", "milops:USSR"]} tip={<MilOpsTip milOps={milOps} required={required} />} className={[s.milops, className].filter(Boolean).join(" ")} data={{ us: milOps.US, ussr: milOps.USSR }}>
      <div className={s.instLabel} aria-hidden="true">{t("ui:track.milopsNeed", { n: required })}</div>
      <div className={s.trackGrid} aria-hidden="true">
        {SIDES.map(side => [
          <span key={`${side}t`} className={[s.sideTag, side === "US" ? s.sideUs : s.sideUssr].join(" ")}><SideGlyph side={side} /><span className="ts-num">{milOps[side]}</span></span>,
          <Row key={`${side}r`} side={side} n={milOps[side]} required={required} anim={view.anim[`milops:${side}`]} />,
        ])}
      </div>
    </Instrument>
  );
}
