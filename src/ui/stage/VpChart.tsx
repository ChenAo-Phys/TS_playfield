/**
 * Victory points by turn (ui-spec §10.4, final.css `.spark`): one ink line over turns 0–10, a US wash
 * above zero and a USSR wash below (US up, USSR down: the fixed political axis), the axis words "US ↑" /
 * "USSR ↓", turn ticks and the last value. The line draws itself in `drawMs` (none under reduced motion).
 * Points come from `useGameRecord()` (VP at the end of each turn, then the final VP).
 */
import { useId, type CSSProperties } from "react";
import { useI18n } from "../../i18n/react";
import { formatNumber } from "../common/format";
import { useReducedMotion } from "../state/useReducedMotion";
import { vpLead } from "./model";
import s from "./VpChart.module.css";

export interface VpChartProps {
  points: readonly { turn: number; vp: number }[];
  /** Line draw duration (ms); 0 = drawn at once. */
  drawMs?: number;
  className?: string;
}

const W = 300, H = 120;
const X0 = 40, X1 = 290, Y_MID = 56, HALF = 42;
const TURNS = 10;
/** VP scale: ±20 is the end of the track. */
const RANGE = 20;

export const chartX = (turn: number) => X0 + (Math.max(0, Math.min(TURNS, turn)) / TURNS) * (X1 - X0);
export const chartY = (vp: number) => Y_MID - (Math.max(-RANGE, Math.min(RANGE, vp)) / RANGE) * HALF;

export function VpChart({ points, drawMs = 0, className }: VpChartProps) {
  const { t, render } = useI18n();
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const pts = points.length ? points : [{ turn: 0, vp: 0 }];
  const line = pts.map((p, i) => `${i ? "L" : "M"}${chartX(p.turn).toFixed(1)} ${chartY(p.vp).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const area = `${line} L${chartX(last.turn).toFixed(1)} ${Y_MID} L${chartX(pts[0]!.turn).toFixed(1)} ${Y_MID} Z`;
  const fmt = (vp: number) => render(vpLead(vp));
  // Every point, separated as the language writes a list of items ("Start: Even, Turn 1: US +6" /
  // "开局：持平；第 1 回合：美国 +6"; Intl.ListFormat's zh "unit" list has no separator at all).
  const list = pts
    .map(p => (p.turn === 0 ? t("ui_stage:chart.start", { vp: fmt(p.vp) }) : t("ui_stage:chart.point", { turn: p.turn, vp: fmt(p.vp) })))
    .join(t("ui_stage:chart.sep"));
  const label = t("ui_stage:chart.label", { title: t("ui:over.chart"), points: list });
  const lastY = chartY(last.vp);
  const style = { ["--draw" as string]: `${drawMs}ms` } as CSSProperties;
  return (
    <svg className={[s.chart, className].filter(Boolean).join(" ")} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={style} data-draw={drawMs > 0 || undefined} data-reduced={reduced || undefined}>
      <defs>
        <clipPath id={`${uid}u`}><rect x={0} y={0} width={W} height={Y_MID} /></clipPath>
        <clipPath id={`${uid}r`}><rect x={0} y={Y_MID} width={W} height={H - Y_MID} /></clipPath>
      </defs>
      <rect className={s.bandUs} x={X0} y={Y_MID - HALF} width={X1 - X0} height={HALF} />
      <rect className={s.bandUssr} x={X0} y={Y_MID} width={X1 - X0} height={HALF} />
      <path className={s.washUs} d={area} clipPath={`url(#${uid}u)`} />
      <path className={s.washUssr} d={area} clipPath={`url(#${uid}r)`} />
      <line className={s.zero} x1={X0} x2={X1} y1={Y_MID} y2={Y_MID} />
      {Array.from({ length: TURNS }, (_, i) => i + 1).map(n => (
        <g key={n}>
          <line className={s.tick} x1={chartX(n)} x2={chartX(n)} y1={Y_MID + HALF} y2={Y_MID + HALF + 4} />
          <text className={s.turn} x={chartX(n)} y={H - 2} textAnchor="middle">{n}</text>
        </g>
      ))}
      <text className={s.axis} x={2} y={Y_MID - HALF + 9}>{t("ui_stage:chart.usUp")}</text>
      <text className={s.axis} x={2} y={Y_MID + HALF - 2}>{t("ui_stage:chart.ussrDown")}</text>
      <text className={`${s.axis} ts-num`} x={X0 - 4} y={Y_MID + 3} textAnchor="end">{formatNumber(0)}</text>
      <path className={s.line} d={line} pathLength={1} />
      {pts.map((p, i) => <circle key={i} className={s.dot} cx={chartX(p.turn)} cy={chartY(p.vp)} r={i === pts.length - 1 ? 3.2 : 1.8} />)}
      <text
        className={`${s.value} ts-num`}
        x={last.turn <= 8 ? chartX(last.turn) + 6 : chartX(last.turn) - 6}
        y={Math.max(10, Math.min(Y_MID + HALF, lastY + 4))}
        textAnchor={last.turn <= 8 ? "start" : "end"}
      >
        {fmt(last.vp)}
      </text>
    </svg>
  );
}
