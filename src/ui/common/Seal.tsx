/**
 * A side's seal (48 × 48 units, ui-spec §2.4): US = navy disc, dashed pale ring, white star;
 * USSR = red disc, dashed gold ring, gold hammer and sickle with a small star. Ported from
 * docs/design/mockup-final-assets/final.js `seal()`; colours come from tokens (common.module.css).
 */
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { glyphPath, STAR_PATH } from "./glyphs";
import s from "./common.module.css";

export interface SealProps {
  side: Side;
  /** Rendered size in CSS px (default 40). */
  size?: number;
  className?: string;
}

export function Seal({ side, size = 40, className }: SealProps) {
  const { sideName } = useI18n();
  const us = side === "US";
  return (
    <svg
      className={[s.seal, us ? s.sealUs : s.sealUssr, className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={sideName(side)}
      data-side={side}
      focusable="false"
    >
      <circle className={s.sealDisc} cx="24" cy="24" r="23" strokeWidth="2" />
      <circle className={s.sealRing} cx="24" cy="24" r="18.5" fill="none" strokeWidth="1" strokeDasharray="2 2.2" />
      {us ? (
        <g transform="translate(10.5 10) scale(1.13)">
          <path className={s.sealMark} d={STAR_PATH} />
        </g>
      ) : (
        <>
          <g transform="translate(11.5 12) scale(1.05)">
            <path className={s.sealMark} d={glyphPath("USSR", (size * 24 * 1.05) / 48)} />
          </g>
          <g transform="translate(20.5 5.2) scale(.29)">
            <path className={s.sealMark} d={STAR_PATH} />
          </g>
        </>
      )}
    </svg>
  );
}
