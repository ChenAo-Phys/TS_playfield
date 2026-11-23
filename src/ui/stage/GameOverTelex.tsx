/**
 * Game over (ui-spec §10.4, final.css `.over` / `.telex`): after a 600 ms beat (a white-out and a long
 * fade for nuclear war, Europe lit for Europe control, the final scoring sheet for a final-scoring
 * ending) the scrim falls and a telex sheet with perforated edges rises: "FLASH · FLASH · FLASH", the
 * verdict in the winner's colour (a draw in ink), a rubber stamp from your side ("You win" / "You lose" /
 * "Draw"; none on a resignation), the reason (`endingMessages`), the held scoring cards, the stats (final
 * VP and, for a held scoring card or final scoring, the VP before it; turn · AR, coups, playing time, AI
 * thinking time), the VP-by-turn chart
 * and New game · Review board · Full log.
 *
 * The shell mounts it while a game is shown (it renders nothing until the game-over beat, or at once
 * when the game already ended): `<GameOverTelex ending={vm.ending} humanSide=… onNewGame onReview onLog/>`.
 * Review board and Full log close the telex (remount it, e.g. with a new `key`, to open it again).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Ending, Side } from "../../game/contract";
import { endingMessages } from "../../i18n/endings";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { displayTurnAr, lastActionRound } from "../common/turnAr";
import { Button } from "../common/Button";
import { trapTab } from "../common/Dossier";
import { KeyScope } from "../common/keymap";
import { MessageText } from "../common/MessageText";
import { Stamp } from "../common/Stamp";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import { vpLead } from "./model";
import { vpPoints, type VpPoint } from "./record";
import type { OverState } from "./stageStore";
import { useTypewriter } from "./TurnBanner";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import { VpChart } from "./VpChart";
import s from "./GameOverTelex.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface GameOverTelexProps {
  ending: Ending;
  humanSide: Side;
  onNewGame(): void;
  onReview(): void;
  onLog(): void;
  // ── extensions ──
  /** Overrides for the stats the UI keeps (demo, tests). */
  stats?: Partial<TelexStats>;
}

export interface TelexStats {
  /** VP by turn (default: the stage's game record). */
  points: readonly VpPoint[];
  coups: { US: number; USSR: number };
  /** Action round the game ended in (0 = headline / setup, or the turn's end). */
  ar: number;
  /** The game ended at the end of its turn (held scoring, mil ops, final scoring): "End of turn N" (Q-031). */
  turnEnd?: boolean;
  /** Wall-clock playing time (ms), when this page saw the whole game; null = not shown. */
  playingMs: number | null;
  /** The AI's decisions and thinking time (ViewModel.aiStats); null = not shown. */
  ai: { decisions: number; ms: number } | null;
}

export function GameOverTelex(props: GameOverTelexProps) {
  const root = useUiRoot();
  const shown = useShown();
  const store = useStageStore();
  useStageBeats(["gameOver"], store);
  const over = useStageState(st => st.over, store);
  const [closed, setClosed] = useState(false);

  // Mounted after the game-over frame was already committed (no beat to come): show at once.
  const vm = root.vm;
  const committed = !!vm.frame && shown.state === vm.frame.state && vm.frame.events.some(e => e.t === "game-over");
  useEffect(() => {
    if (committed && !shown.busy) store.showEnded(props.ending);
  }, [committed, shown.busy, store, props.ending]);

  if (closed || !over) return null;
  const close = (then: () => void) => () => { setClosed(true); then(); };
  const tally = store.tally(vm.log);
  // The round the game ended in, never the engine's counter past the turn's last round ("Turn 8 · AR 9") or the
  // next turn after final scoring (Q-031): past those, the game ended at the end of its turn.
  // The rule lives in displayTurnAr (R-014), which the slip head and the console read too.
  const st = shown.state;
  const at = st ? displayTurnAr(st, props.ending) : null;
  const inRound = at?.phase === "ar";
  const turnEnd = !!st && !inRound && (st.turn !== props.ending.turn || st.action_round > lastActionRound(st));
  const stats: TelexStats = {
    points: vpPoints({ ...tally, final: tally.final ?? { turn: props.ending.turn, vp: props.ending.vpFinal } }),
    coups: tally.coups,
    ar: inRound ? at!.ar! : 0,
    turnEnd,
    playingMs: store.playingMs(),
    ai: vm.aiStats ?? null,
    ...props.stats,
  };
  const node = (
    <TelexOverlay
      over={over}
      ending={props.ending}
      humanSide={props.humanSide}
      stats={stats}
      onNewGame={props.onNewGame}
      onReview={close(props.onReview)}
      onLog={close(props.onLog)}
    />
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

export interface TelexOverlayProps {
  over: OverState;
  ending: Ending;
  humanSide: Side;
  stats: TelexStats;
  onNewGame(): void;
  onReview(): void;
  onLog(): void;
}

/** The overlay: the beat's effect, then the scrim and the telex (tests and the demo render it directly). */
export function TelexOverlay({ over, ending, humanSide, stats, onNewGame, onReview, onLog }: TelexOverlayProps) {
  const reduced = useReducedMotion();
  if (over.phase === "beat") {
    return over.effect === "whiteout"
      ? <div className={s.whiteout} style={{ ["--ms" as string]: `${over.ms.beat}ms` } as CSSProperties} aria-hidden="true" data-reduced={reduced || undefined} />
      : null;
  }
  return (
    <KeyScope modal onEscape={onReview}>
      <div className={s.over} data-human={humanSide}>
        <TelexSheet over={over} ending={ending} humanSide={humanSide} stats={stats} onNewGame={onNewGame} onReview={onReview} onLog={onLog} />
      </div>
    </KeyScope>
  );
}

function duration(ms: number, t: ReturnType<typeof useI18n>["t"]): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return t("ui_stage:over.duration.lt1");
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? t("ui_stage:over.duration.hm", { h, m }) : t("ui_stage:over.duration.m", { m });
}

/**
 * The label of the "VP before" stat, or null when the telex leaves it out: a held scoring card's ruling
 * overwrote the VP ("VP before the ruling"); final scoring added to it ("VP before final scoring"); any
 * other ending only moved the VP the way the board shows (or not at all).
 */
export function vpBeforeLabel(ending: Pick<Ending, "reason" | "vpBefore" | "vpFinal">, t: ReturnType<typeof useI18n>["t"]): string | null {
  if (ending.vpBefore === ending.vpFinal) return null;
  switch (ending.reason) {
    case "held-scoring":
    case "held-scoring-both": return t("ui:over.vpBefore");
    case "final-scoring": return t("ui_stage:over.stats.vpBeforeFinal");
    default: return null;
  }
}

/** The telex sheet itself. */
export function TelexSheet({ over, ending, humanSide, stats, onNewGame, onReview, onLog }: TelexOverlayProps) {
  const { t, render, lang } = useI18n();
  const reduced = useReducedMotion();
  const sheet = useRef<HTMLElement | null>(null);
  const primary = useRef<HTMLButtonElement | null>(null);
  const msgs = endingMessages(ending, humanSide);
  const flash = useTypewriter(t("ui:over.flash"), reduced || over.ms.rise <= 0 ? 0 : 40);
  const winner = ending.winner;
  const verdict = winner === "DRAW" ? t("ui:over.draw") : t("ui:over.verdict", { side: t(`ui:side.${winner}`) });
  const stamp = ending.reason === "resign" ? null
    : msgs.outcome === "won" ? t("ui:over.youWin") : msgs.outcome === "lost" ? t("ui:over.youLose") : t("ui:over.draw");
  const stampSide: Side | null = msgs.outcome === "draw" ? null : winner === "DRAW" ? null : winner;
  const animated = !reduced && over.ms.rise > 0;

  useIsoLayoutEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, []);

  const style = {
    ["--rise" as string]: `${over.ms.rise}ms`,
    ["--stamp" as string]: `${over.ms.stamp}ms`,
  } as CSSProperties;
  const before = vpBeforeLabel(ending, t);
  const cells: { label: string; value: string }[] = [
    { label: t("ui_stage:over.stats.finalVp"), value: render(vpLead(ending.vpFinal)) },
    ...(before ? [{ label: before, value: render(vpLead(ending.vpBefore)) }] : []),
    {
      label: t("ui_stage:over.stats.ended"),
      value: stats.ar > 0 ? t("ui_stage:over.stats.turnAr", { turn: ending.turn, ar: stats.ar })
        : stats.turnEnd ? t("log:session.endOfTurn", { turn: ending.turn }) : t("ui:track.turnN", { turn: ending.turn }),
    },
    { label: t("ui_stage:over.stats.coups"), value: t("ui_stage:over.stats.coupsValue", { us: stats.coups.US, ussr: stats.coups.USSR }) },
    ...(stats.playingMs !== null ? [{ label: t("ui_stage:over.stats.time"), value: duration(stats.playingMs, t) }] : []),
    ...(stats.ai ? [{ label: t("ui_stage:over.stats.ai"), value: t("ui_stage:over.stats.aiValue", { time: duration(stats.ai.ms, t), count: stats.ai.decisions }) }] : []),
  ];
  return (
    <section
      ref={sheet}
      className={s.telex}
      style={style}
      data-animate={animated || undefined}
      data-winner={winner}
      role="dialog"
      aria-modal="true"
      aria-label={t("ui:over.gameOver")}
      lang={lang}
      onKeyDown={e => trapTab(e, sheet.current)}
      tabIndex={-1}
    >
      <div className={s.flash} aria-hidden="true">{flash || " "}</div>
      <h2 className={s.verdict}>{verdict}</h2>
      {stamp ? (
        <Stamp side={stampSide} size="l" tilt={-9} animate={animated && ending.reason !== "wargames"} className={s.rubber}>{stamp}</Stamp>
      ) : null}
      <p className={s.reason}><MessageText message={msgs.text} /></p>
      {ending.cards?.length ? (
        <div className={s.held}>
          {ending.cards.map(c => <CardFace key={c} card={c} width={56} />)}
          <span>{t("ui_stage:over.held")}</span>
        </div>
      ) : null}
      <div className={s.grid}>
        <dl className={s.stats}>
          {cells.map(c => (
            <div key={c.label}>
              <dt>{c.label}</dt>
              <dd className="ts-num">{c.value}</dd>
            </div>
          ))}
        </dl>
        <figure className={s.fig}>
          <figcaption>{t("ui:over.chart")}</figcaption>
          <VpChart points={stats.points} drawMs={animated ? over.ms.chart : 0} />
        </figure>
      </div>
      <div className={s.acts}>
        <Button ref={primary} variant="primary" onPaper onClick={onNewGame}>{t("ui:menu.newGame")}</Button>
        <Button variant="ghost" onPaper onClick={onReview}>{t("ui:over.review")}</Button>
        <Button variant="ghost" onPaper onClick={onLog}>{t("ui:over.fullLog")}</Button>
      </div>
    </section>
  );
}
