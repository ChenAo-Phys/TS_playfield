/**
 * Turn instrument (ui-spec §5): ten cells 15×18 (an extra gap before turns 4 and 8, where new cards
 * enter), past dimmed, the current one brass and lit, and the era row EARLY / MID / LATE. Condensed
 * (1200–1439 px, tablet): the readout "5/10 · Mid War". The lit cell slides one step when the turn
 * changes. Tooltip: era, when its cards were shuffled in, hand size.
 */
import { useI18n } from "../../i18n/react";
import { ERA_START, eraOf, type Era } from "./model";
import { fillSlots, slot } from "./slots";
import { Instrument } from "./Instrument";
import s from "./Console.module.css";

export interface TurnTrackProps {
  turn: number;
  condensed: boolean;
  className?: string;
}

const TURNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ERAS: Era[] = ["early", "mid", "late"];

export function TurnTip({ turn }: { turn: number }) {
  const { t } = useI18n();
  const era = eraOf(turn);
  return (
    <>
      <div className={s.tipHead}>{t("ui:track.turnOfTen", { turn })}</div>
      <div className={s.tipRow}><b>{t(`ui:track.era.${era}`)}</b></div>
      {era === "early" ? <div className={s.tipRow}>{t("ui_console:turn.tip.upcoming", { era: t("ui:track.era.mid"), turn: ERA_START.mid })}</div> : null}
      {era !== "early" ? <div className={s.tipRow}>{t("ui_console:turn.tip.shuffled", { era: t("ui:track.era.mid"), turn: ERA_START.mid })}</div> : null}
      {era === "mid" ? <div className={s.tipRow}>{t("ui_console:turn.tip.upcoming", { era: t("ui:track.era.late"), turn: ERA_START.late })}</div> : null}
      {era === "late" ? <div className={s.tipRow}>{t("ui_console:turn.tip.shuffled", { era: t("ui:track.era.late"), turn: ERA_START.late })}</div> : null}
      <div className={s.tipRow}>{t("ui_console:turn.tip.handSize", { n: era === "early" ? 8 : 9 })}</div>
    </>
  );
}

export function TurnReadout({ turn, className }: { turn: number; className?: string }) {
  const { t } = useI18n();
  const text = t("ui_console:turn.readout", { turn: slot("turn"), max: 10, era: t(`ui:track.era.${eraOf(turn)}`) });
  return <div className={[s.turnRead, className].filter(Boolean).join(" ")}>{fillSlots(text, { turn: <b className="ts-num">{turn}</b> })}</div>;
}

export function TurnTrack({ turn, condensed, className }: TurnTrackProps) {
  const { t } = useI18n();
  const era = eraOf(turn);
  const label = t("ui_console:turn.aria", { turn, era: t(`ui:track.era.${era}`) });
  const now = Math.max(1, Math.min(10, turn));
  // Cell i starts at (i − 1) × 17 px, +5 px from turn 4 and +5 more from turn 8.
  const x = (now - 1) * 17 + (now >= 4 ? 5 : 0) + (now >= 8 ? 5 : 0);
  return (
    <Instrument label={label} anchor="turn" tip={<TurnTip turn={turn} />} className={[s.turn, className].filter(Boolean).join(" ")} data={{ turn }}>
      <div className={s.instLabel} aria-hidden="true">{t("ui:track.turn")}</div>
      {condensed ? (
        <TurnReadout turn={turn} />
      ) : (
        <div className={s.turnBox}>
          <div className={s.turnTrack} aria-hidden="true">
            {TURNS.map(n => (
              <i key={n} className={[n < turn ? s.done : n === turn ? s.nowCell : "", n === 4 || n === 8 ? s.gap : ""].filter(Boolean).join(" ")}>{n}</i>
            ))}
            {turn >= 1 && turn <= 10 ? <span className={s.turnLit} style={{ transform: `translateX(${x}px)` }}>{turn}</span> : null}
          </div>
          <div className={s.eraRow} aria-hidden="true">
            {ERAS.map(e => <span key={e} className={e === era ? s.cur : undefined}>{t(`ui_console:turn.eraShort.${e}`)}</span>)}
          </div>
        </div>
      )}
    </Instrument>
  );
}
