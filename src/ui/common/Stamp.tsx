/**
 * A rubber stamp (ui-spec §2.4): stencil words in a 1.5 px border, rotated −3…−9°. Side stamps take the
 * side's colour ("YOUR MOVE" in --ts-me, "US · AI" in --ts-ai via `side`); otherwise ink or alert.
 * It lands with a short thunk (opacity only under reduced motion). At most one on screen at a time.
 */
import type { ReactNode } from "react";
import type { Side } from "../../game/contract";
import { SideGlyph } from "./SideGlyph";
import s from "./common.module.css";

export interface StampProps {
  children: ReactNode;
  side?: Side | null;
  /** Rotation in degrees (default −3). */
  tilt?: number;
  tone?: "ink" | "alert";
  // ── extensions ──
  /** s = slip head (default), m = cards and docks, l = stage verdicts. */
  size?: "s" | "m" | "l";
  /** Prefix the side's glyph. */
  glyph?: boolean;
  /** Play the landing animation on mount (default true). */
  animate?: boolean;
  className?: string;
}

export function Stamp({ children, side = null, tilt = -3, tone = "ink", size = "s", glyph = false, animate = true, className }: StampProps) {
  const cls = [
    s.stamp,
    s[`stamp_${size}`],
    side === "US" ? s.stampUs : side === "USSR" ? s.stampUssr : tone === "alert" ? s.stampAlert : s.stampInk,
    animate ? s.stampIn : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <span className={cls} style={{ ["--stamp-tilt" as string]: `${tilt}deg` }} data-side={side ?? undefined}>
      {glyph && side ? <SideGlyph side={side} className={s.stampGlyph} /> : null}
      {children}
    </span>
  );
}
