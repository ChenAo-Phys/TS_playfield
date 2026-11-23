/**
 * The console (ui-spec §5, §3): the instrument bar across the top. Everything it shows comes from the
 * shown state (`useShown().state`) with the running track beats' overrides on top, never from the
 * queued frame. It registers the instruments' anchors and the `track` beat handlers.
 *
 * Variants (`layoutFor` + width, chosen by the shell):
 *  - desktop  (≥ 1440 px): wordmark · Turn (track + era row) · AR · DEFCON (+ caption) · VP 224 · Mil ops ·
 *             Space · ··· · EN|中文 · ⚙ · ☰
 *  - condensed (1200–1439 px): Turn as the readout "5/10 · Mid War", VP 176, DEFCON caption 112, smaller
 *             wordmark
 *  - tablet:  no wordmark subtitle, Mil ops, Space or DEFCON caption (the Status flyout has them); VP 170;
 *             the language as one button showing the other language
 *  - compact: turn/AR readout · DEFCON numeral + "DEFCON" · mini VP gauge (flex) · ☰ 40×40 (with an amber
 *             dot when a warning needs attention). The VP number is never cut: when the bar is too narrow it
 *             takes the squeeze steps in ./squeeze (side glyphs, no DEFCON caption, no VP label) before the turn
 *             readout ellipsizes.
 */
import { useRef, type MouseEvent } from "react";
import type { Side } from "../../game/contract";
import { maxActionRound } from "../../game/rules";
import { displayTurnAr } from "../common/turnAr";
import { useI18n } from "../../i18n/react";
import { Icon } from "../common/Icon";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { ArReadout, arReadoutText, ArTrack } from "./ArTrack";
import { DefconGauge } from "./DefconGauge";
import { Instrument } from "./Instrument";
import { LangToggle } from "./LangToggle";
import { MilOpsTrack } from "./MilOpsTrack";
import { arModel, eraOf } from "./model";
import { SpaceTrack } from "./SpaceTrack";
import { useSqueeze } from "./squeeze";
import { useTrackView } from "./trackStore";
import { TurnTip, TurnTrack } from "./TurnTrack";
import { useTrackBeats, useTrackValues, useVpHistory } from "./useTrackBeats";
import { VpGauge } from "./VpGauge";
import s from "./Console.module.css";

export type ConsoleVariant = "desktop" | "condensed" | "tablet" | "compact";

export interface ConsoleProps {
  variant: ConsoleVariant;
  // ── extensions (the shell owns the settings dossier and the menu) ──
  onSettings?(): void;
  /** Open the menu (popover on desktop, sheet on compact), anchored at the pressed button. */
  onMenu?(anchor: Element): void;
  menuOpen?: boolean;
  /** Compact ☰ amber dot; default: a scoring-stranded warning on the prompt, or a mil-ops shortfall in the last 2 ARs. */
  menuAlert?: boolean;
  className?: string;
}

const VP_WIDTH: Record<Exclude<ConsoleVariant, "compact">, number> = { desktop: 224, condensed: 176, tablet: 170 };

/** Whether the compact ☰ should carry the attention dot (ui-spec §3.3). */
export function needsAttention(vm: ReturnType<typeof useUiRoot>["vm"], human: Side | null): boolean {
  if (vm.prompt?.options.some(o => o.warnings?.some(w => w.code === "scoring-stranded"))) return true;
  const st = vm.frame?.state;
  if (!st || !human || st.current_phase_name !== "ACTION_ROUND") return false;
  return st.action_round >= maxActionRound(st, human) - 1 && st.mil_ops[human] < st.defcon;
}

export function Console({ variant, onSettings, onMenu, menuOpen, menuAlert, className }: ConsoleProps) {
  const root = useUiRoot();
  const { t } = useI18n();
  const shown = useShown();
  const view = useTrackView();
  useTrackBeats(root.director);
  const state = shown.state;
  const human: Side = root.vm.humanSide ?? state?.humanSide ?? "US";
  const values = useTrackValues(state ?? EMPTY_STATE);
  const history = useVpHistory(state?.turn ?? 0, values.vp);
  const compact = variant === "compact";
  const alert = menuAlert ?? (compact && needsAttention(root.vm, root.vm.humanSide));
  const openMenu = (e: MouseEvent<HTMLElement>) => onMenu?.(e.currentTarget);
  const bar = useRef<HTMLElement | null>(null);
  const squeeze = useSqueeze(bar, compact);
  // The turn to show: never the engine's counter past the end (turn 11 after final scoring; Q-031). While the last
  // frames still play, the shown state is in the ending's turn and reads as usual (displayTurnAr).
  const ending = root.vm.ending;
  const turn = state ? displayTurnAr(state, ending).turn : 0;

  const menuButton = (
    <button
      type="button"
      className={[s.iconBtn, compact ? s.iconBtnTouch : ""].filter(Boolean).join(" ")}
      aria-label={t("ui:game.menu")}
      title={t("ui:game.menu")}
      aria-haspopup="menu"
      aria-expanded={menuOpen ?? undefined}
      onClick={openMenu}
    >
      <Icon name="menu" size={compact ? 20 : 17} />
      {alert ? <span className={s.alertDot} aria-hidden="true" /> : null}
    </button>
  );

  return (
    <header
      ref={bar}
      className={[s.console, s[`v_${variant}`], "ts-grain", squeeze >= 1 ? s.sq1 : "", squeeze >= 2 ? s.sq2 : "", squeeze >= 3 ? s.sq3 : "", squeeze >= 4 ? s.sq4 : "", className].filter(Boolean).join(" ")}
      aria-label={t("ui_console:label")}
      data-variant={variant}
      data-squeeze={compact ? squeeze : undefined}
    >
      {view.flash ? <span key={view.flash} className={s.flash} aria-hidden="true" /> : null}
      {compact ? null : (
        <button type="button" className={s.wordmark} onClick={openMenu} aria-label={t("ui_console:wordmark.label")}>
          <b>{t("ui_console:wordmark.title")}</b>
          {variant === "tablet" ? null : <span>{t("ui_console:wordmark.sub")}</span>}
        </button>
      )}

      {state && compact ? (() => {
        const ar = arModel(state, values.ar, ending);
        const arText = arReadoutText(t, ar, human);
        const turnAria = t("ui_console:turn.aria", { turn, era: t(`ui:track.era.${eraOf(turn)}`) });
        return (
          <Instrument
            label={arText.trim() ? `${turnAria} · ${arText}` : turnAria}
            anchor={["turn", "ar"]}
            tip={<><TurnTip turn={turn} />{arText.trim() ? <div className={s.tipRow}>{arText}</div> : null}</>}
            className={s.compactTurn}
            data={{ turn }}
          >
            <div className={s.instLabel} data-fit="" aria-hidden="true">{t("ui_console:turn.compact", { turn, era: t(`ui:track.era.${eraOf(turn)}`) })}</div>
            <ArReadout model={ar} humanSide={human} fit />
          </Instrument>
        );
      })() : null}

      {state && !compact ? (
        <>
          <TurnTrack turn={turn} condensed={variant !== "desktop"} />
          <ArTrack state={state} humanSide={human} ar={values.ar} ending={ending} />
        </>
      ) : null}

      {state ? <DefconGauge defcon={values.defcon} variant={compact ? "compact" : "full"} caption={variant !== "tablet"} /> : null}

      {state ? (
        compact
          ? <VpGauge vp={values.vp} width={0} variant="mini" history={history} className={s.vpFlex} />
          : <VpGauge vp={values.vp} width={VP_WIDTH[variant]} variant="full" history={history} />
      ) : null}

      {state && (variant === "desktop" || variant === "condensed") ? (
        <>
          <MilOpsTrack milOps={values.milOps} required={values.defcon} />
          <SpaceTrack space={values.space} />
        </>
      ) : null}

      <div className={s.spacer} />

      <div className={s.actions}>
        {compact ? null : <LangToggle variant={variant === "tablet" ? "single" : "segmented"} />}
        {compact ? null : (
          <button type="button" className={s.iconBtn} aria-label={t("ui:menu.settings")} title={t("ui:menu.settings")} onClick={() => onSettings?.()}>
            <Icon name="gear" size={17} />
          </button>
        )}
        {menuButton}
      </div>
    </header>
  );
}

/** Before the first frame: a neutral board so the hooks keep their order. */
const EMPTY_STATE = {
  victory_points: 0, defcon: 5, mil_ops: { US: 0, USSR: 0 }, space: { US: 0, USSR: 0 },
} as unknown as Parameters<typeof useTrackValues>[0];
