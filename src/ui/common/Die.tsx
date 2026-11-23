/**
 * A die (ui-spec §2.4, final.css `.die3d`): a 3×3 pip grid; side dice in side colours
 * (`--ts-die-us` / `--ts-die-ussr`, white / gold pips), neutral dice in paper. `result` marks the outcome
 * (ok = green ring, fail = muted, boom = hazard ring). `numeral` draws the flat numbered face used in
 * odds strips (final.css `.odds .die`).
 */
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import s from "./common.module.css";

export interface DieProps {
  /** 1..6 (other values clamp). */
  face: number;
  side: Side | "neutral";
  /** Edge in CSS px (default 44). */
  size?: number;
  result?: "ok" | "fail" | "boom";
  // ── extensions ──
  /** Flat numbered face instead of pips (coup odds strip). */
  numeral?: boolean;
  /** Rotation in degrees (dice trays tilt −8°). */
  tilt?: number;
  className?: string;
}

/** Visible pips per face, as indices into the 3×3 grid (row-major). */
export const PIPS: Readonly<Record<number, readonly number[]>> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function Die({ face, side, size = 44, result, numeral = false, tilt, className }: DieProps) {
  const { t, sideName } = useI18n();
  const f = Math.max(1, Math.min(6, Math.round(face)));
  const on = PIPS[f]!;
  // The side is named, not only coloured (ui-spec §12): "US die: 5, success".
  const base = side === "neutral" ? t("ui_common:die.label", { face: f }) : t("ui_common:die.labelSide", { side: sideName(side), face: f });
  const label = result ? t("ui_common:die.withResult", { die: base, result: t(`ui_common:die.result.${result}`) }) : base;
  const sideCls = side === "US" ? s.dieUs : side === "USSR" ? s.dieUssr : s.dieNeutral;
  const cls = [s.die, numeral ? s.dieNumeral : sideCls, result ? s[`die_${result}`] : "", className].filter(Boolean).join(" ");
  const style = {
    ["--die" as string]: `${size}px`,
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
  };
  return (
    <span className={cls} style={style} role="img" aria-label={label} data-face={f} data-side={side} data-result={result}>
      {numeral ? (
        <span className={`${s.dieNum} ts-num`} aria-hidden="true">{f}</span>
      ) : (
        Array.from({ length: 9 }, (_, i) => <i key={i} className={on.includes(i) ? s.pipOn : s.pip} aria-hidden="true" />)
      )}
    </span>
  );
}
