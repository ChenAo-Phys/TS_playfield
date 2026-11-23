/**
 * VP gauge (ui-spec §5): a bar from US 20 (left) to USSR 20 (right) on the fixed political axis, ticks
 * every 5 (the centre taller), the needle at 50 % − vp × 2.5 %, the header "Victory points" + the lead
 * "USSR +2" / "US +3" / "Even" (side colour and side word, never colour alone), ends "★ US 20" /
 * "USSR 20 ☭". Mini (compact): readout above the bar, no ends, needle without its head. When a `vp`
 * beat moves it the needle swings with a slight overshoot and the number rolls. Tooltip: the VP at
 * the end of each turn (a sparkline).
 */
import type { CSSProperties } from "react";
import { useI18n } from "../../i18n/react";
import { RollingNumber } from "../common/RollingNumber";
import { SideGlyph } from "../common/SideGlyph";
import { vpLead, vpNeedle, type VpPoint } from "./model";
import { fillSlots, slot } from "./slots";
import { Instrument } from "./Instrument";
import { useTrackView } from "./trackStore";
import s from "./Console.module.css";

export interface VpGaugeProps {
  vp: number;
  width: number;
  variant: "full" | "mini";
  // ── extensions ──
  /** VP at each turn end (tooltip sparkline); see `useVpHistory`. */
  history?: readonly VpPoint[];
  className?: string;
}

const TICKS = [-20, -15, -10, -5, 0, 5, 10, 15, 20];

/**
 * "USSR +2" / "US +3" / "Even", the number rolling. `glyph` (the compact console) renders the side as both
 * its word and its glyph; the console's squeeze step 1 shows the glyph instead of the word (never the
 * number cut).
 */
export function VpLead({ vp, className, rollMs, glyph = false }: { vp: number; className?: string; rollMs?: number; glyph?: boolean }) {
  const { t } = useI18n();
  const lead = vpLead(vp);
  if (!lead.side) return <span className={[s.vpRead, s.even, className].filter(Boolean).join(" ")}>{t("ui:track.vpEven")}</span>;
  const text = t("ui:track.vpLead", { side: slot("side"), vp: slot("vp") });
  const word = t(`ui:side.${lead.side}`);
  const side = glyph
    ? <><span className={s.vpWord}>{word}</span><SideGlyph side={lead.side} className={s.vpGlyph} /></>
    : word;
  return (
    <span className={[s.vpRead, lead.side === "US" ? s.sideUs : s.sideUssr, className].filter(Boolean).join(" ")}>
      {fillSlots(text, { side, vp: <RollingNumber value={lead.n} ms={rollMs} /> })}
    </span>
  );
}

export function vpLeadText(t: ReturnType<typeof useI18n>["t"], vp: number): string {
  const lead = vpLead(vp);
  return lead.side ? t("ui:track.vpLead", { side: t(`ui:side.${lead.side}`), vp: lead.n }) : t("ui:track.vpEven");
}

/** A small line chart of VP by turn end, US up, USSR down. */
export function VpSparkline({ points, width = 200, height = 64 }: { points: readonly VpPoint[]; width?: number; height?: number }) {
  const max = Math.max(5, ...points.map(p => Math.abs(p.vp)));
  const x = (turn: number) => 6 + ((turn - 1) / 9) * (width - 12);
  const y = (vp: number) => height / 2 - (vp / max) * (height / 2 - 6);
  const line = points.map(p => `${x(p.turn).toFixed(1)},${y(p.vp).toFixed(1)}`).join(" ");
  return (
    <svg className={s.spark} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} className={s.sparkAxis} />
      {[1, 4, 8, 10].map(turn => <line key={turn} x1={x(turn)} x2={x(turn)} y1={height / 2 - 3} y2={height / 2 + 3} className={s.sparkAxis} />)}
      {points.length > 1 ? <polyline points={line} className={s.sparkLine} /> : null}
      {points.map(p => <circle key={p.turn} cx={x(p.turn)} cy={y(p.vp)} r="2.4" className={p.vp > 0 ? s.sparkUs : p.vp < 0 ? s.sparkUssr : s.sparkEven} />)}
    </svg>
  );
}

function VpTip({ vp, history }: { vp: number; history: readonly VpPoint[] }) {
  const { t } = useI18n();
  const ends = history.slice(0, -1);
  return (
    <>
      <div className={s.tipHead}>{t("ui:over.chart")}</div>
      {history.length ? <VpSparkline points={history} /> : null}
      {ends.length ? (
        <div className={s.tipTurns}>
          {ends.map(p => <span key={p.turn}>{t("ui_console:vp.tip.turn", { turn: p.turn, lead: vpLeadText(t, p.vp) })}</span>)}
        </div>
      ) : (
        <div className={s.tipRow}>{t("ui_console:vp.tip.none")}</div>
      )}
      <div className={s.tipRow}><b>{t("ui_console:vp.tip.now", { lead: vpLeadText(t, vp) })}</b></div>
    </>
  );
}

export function VpGauge({ vp, width, variant, history, className }: VpGaugeProps) {
  const { t } = useI18n();
  const view = useTrackView();
  const anim = view.anim.vp;
  const swing = anim && anim.to === vp && anim.ms > 0 && !anim.reduced ? anim : null;
  const needle: CSSProperties = {
    left: `${vpNeedle(vp)}%`,
    transition: swing ? `left ${swing.ms}ms var(--ts-ease-back)` : "none",
  };
  const mini = variant === "mini";
  const label = t("ui_console:vp.aria", { lead: vpLeadText(t, vp) });
  return (
    <Instrument
      label={label}
      anchor="vp"
      tip={<VpTip vp={vp} history={history ?? [{ turn: 1, vp }]} />}
      className={[s.vp, mini ? s.vpMini : "", className].filter(Boolean).join(" ")}
      data={{ vp }}
    >
      <div className={s.vpHead} style={mini ? undefined : { width }} aria-hidden="true">
        <span className={s.instLabel}>{mini ? t("ui:track.vp") : t("ui_console:vp.title")}</span>
        <VpLead
          key={anim?.reduced ? `f${anim.seq}` : "lead"}
          vp={vp}
          glyph={mini}
          rollMs={swing ? swing.ms : undefined}
          className={anim?.reduced ? s.readFlash : undefined}
        />
      </div>
      <div className={s.vpScale} style={mini ? undefined : { width }} aria-hidden="true">
        <div className={s.vpBar} />
        {TICKS.map(v => <span key={v} className={[s.vpTick, v === 0 ? s.mid : ""].filter(Boolean).join(" ")} style={{ left: `${vpNeedle(v)}%` }} />)}
        <span className={s.vpNeedle} style={needle} />
      </div>
      {mini ? null : (
        <div className={s.vpEnds} style={{ width }} aria-hidden="true">
          <span className={s.sideUs}><SideGlyph side="US" /> {t("ui_console:vp.end", { side: t("ui:side.US") })}</span>
          <span className={s.zero}>0</span>
          <span className={s.sideUssr}>{t("ui_console:vp.end", { side: t("ui:side.USSR") })} <SideGlyph side="USSR" /></span>
        </div>
      )}
    </Instrument>
  );
}
