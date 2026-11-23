/**
 * Space-race instrument (ui-spec §5): two rows (US first) of eight 8×9 cells, side tags with the box
 * number. A `space` beat hops the marker one box (a small arc); on reaching a privilege box the
 * privilege shows under the instrument for 2 s. Tooltip: each side's box and the next box's Ops,
 * roll and VP as the engine plays them (`engineLayout().space_boxes`), and the privileges reached.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { engineLayout } from "../../engine/layout";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { SideGlyph } from "../common/SideGlyph";
import { TIMING } from "../theme";
import { perksReached, SPACE_PERK_BOXES, spaceBoxKey } from "./model";
import { Instrument } from "./Instrument";
import { useTrackView } from "./trackStore";
import s from "./Console.module.css";

export interface SpaceTrackProps {
  space: { US: number; USSR: number };
  className?: string;
}

const SIDES: Side[] = ["US", "USSR"];
const CELLS = [1, 2, 3, 4, 5, 6, 7, 8];

export function useBoxName(): (box: number) => string {
  const { t } = useI18n();
  return box => {
    const key = spaceBoxKey(box);
    return key ? t(`tracks:spaceBox.${key}`) : t("tracks:spaceBox.fallback", { box });
  };
}

export function SpaceTip({ space }: { space: { US: number; USSR: number } }) {
  const { t } = useI18n();
  const boxName = useBoxName();
  const boxes = engineLayout()?.space_boxes ?? null;
  return (
    <>
      <div className={s.tipHead}>{t("ui:track.spaceRace")}</div>
      {SIDES.map(side => {
        const box = space[side];
        const next = boxes?.[box + 1];
        const perks = perksReached(box);
        return (
          <div key={side} className={s.tipBlock}>
            <div className={s.tipRow}>
              <span className={side === "US" ? s.sideUs : s.sideUssr}><SideGlyph side={side} /></span>{" "}
              <b>{t("ui_console:space.tip.side", { side: t(`ui:side.${side}`), box, name: boxName(box) })}</b>
            </div>
            {box >= 8 ? (
              <div className={s.tipRow}>{t("tracks:next.doneTitle")}</div>
            ) : next ? (
              <div className={s.tipRow}>
                {t("ui_console:space.tip.next", { box: box + 1, ops: next.min_ops, roll: next.max_roll, first: next.vp_first, second: next.vp_second })}
              </div>
            ) : null}
            {perks.length ? (
              <div className={s.tipRow}>
                {t("ui_console:space.tip.perks", { list: perks.map(boxName).join(t("ui_console:listSep")) })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function SpaceTrack({ space, className }: SpaceTrackProps) {
  const { t } = useI18n();
  const view = useTrackView();
  const perk = view.perk;
  const [perkShown, setPerkShown] = useState<number>(0);
  useEffect(() => {
    if (!perk) return;
    setPerkShown(perk.seq);
    const id = setTimeout(() => setPerkShown(0), TIMING.space.perkToast);
    return () => clearTimeout(id);
  }, [perk?.seq]);
  const label = t("ui_console:space.aria", { us: space.US, ussr: space.USSR });
  return (
    <Instrument label={label} anchor={["space:US", "space:USSR"]} tip={<SpaceTip space={space} />} className={[s.space, className].filter(Boolean).join(" ")} data={{ us: space.US, ussr: space.USSR }}>
      <div className={s.instLabel} aria-hidden="true">{t("ui:track.spaceRace")}</div>
      <div className={s.trackGrid} aria-hidden="true">
        {SIDES.map(side => {
          const anim = view.anim[`space:${side}`];
          const hop = anim && anim.ms > 0 && !anim.reduced && anim.to > anim.from ? anim : null;
          return [
            <span key={`${side}t`} className={[s.sideTag, side === "US" ? s.sideUs : s.sideUssr].join(" ")}><SideGlyph side={side} /><span className="ts-num">{space[side]}</span></span>,
            <div key={`${side}r`} className={[s.spRow, side === "US" ? s.us : s.ussr].join(" ")}>
              {CELLS.map(i => {
                const hopping = hop && i === space[side];
                const style: CSSProperties | undefined = hopping ? { animationDuration: `${hop.ms}ms` } : undefined;
                return <i key={hopping ? `${i}:${hop.seq}` : i} className={[i <= space[side] ? s.f : "", hopping ? s.hop : ""].filter(Boolean).join(" ")} style={style} />;
              })}
            </div>,
          ];
        })}
      </div>
      {perk && perkShown === perk.seq && SPACE_PERK_BOXES[perk.box] ? (
        <div className={s.perkNote} role="status">
          <SideGlyph side={perk.side} /> {t(`tracks:privilegeShort.${SPACE_PERK_BOXES[perk.box]!}`)}
        </div>
      ) : null}
    </Instrument>
  );
}
