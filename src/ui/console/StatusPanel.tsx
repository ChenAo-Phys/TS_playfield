/**
 * Every console instrument at desktop size, stacked (ui-spec §3.2 tablet Status flyout, §3.3 compact
 * Status sheet): Turn (track + era row), Action round, DEFCON with its caption, VP 224, Mil ops, Space.
 * `after` takes what the host adds below (the piles, the In-effect chips on compact).
 */
import type { ReactNode } from "react";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { ArTrack } from "./ArTrack";
import { DefconGauge } from "./DefconGauge";
import { MilOpsTrack } from "./MilOpsTrack";
import { SpaceTrack } from "./SpaceTrack";
import { TurnTrack } from "./TurnTrack";
import { useTrackValues, useVpHistory } from "./useTrackBeats";
import { VpGauge } from "./VpGauge";
import s from "./Console.module.css";

export interface StatusPanelProps {
  /** Shown below the instruments (piles, effects). */
  after?: ReactNode;
  /** Heading (default on). */
  heading?: boolean;
  className?: string;
}

export function StatusPanel({ after, heading = true, className }: StatusPanelProps) {
  const root = useUiRoot();
  const shown = useShown();
  const { t } = useI18n();
  const state = shown.state;
  const human: Side = root.vm.humanSide ?? state?.humanSide ?? "US";
  const values = useTrackValues(state ?? STATUS_EMPTY);
  const history = useVpHistory(state?.turn ?? 0, values.vp);
  return (
    <section className={[s.status, "ts-grain", className].filter(Boolean).join(" ")} aria-label={t("ui_console:status.title")}>
      {heading ? <h2 className={s.statusHead}>{t("ui_console:status.title")}</h2> : null}
      {state ? (
        <div className={s.statusGrid}>
          <TurnTrack turn={state.turn} condensed={false} />
          <ArTrack state={state} humanSide={human} ar={values.ar} />
          <DefconGauge defcon={values.defcon} variant="full" />
          <VpGauge vp={values.vp} width={224} variant="full" history={history} />
          <MilOpsTrack milOps={values.milOps} required={values.defcon} />
          <SpaceTrack space={values.space} />
        </div>
      ) : null}
      {after}
    </section>
  );
}

const STATUS_EMPTY = {
  victory_points: 0, defcon: 5, mil_ops: { US: 0, USSR: 0 }, space: { US: 0, USSR: 0 },
} as unknown as Parameters<typeof useTrackValues>[0];
