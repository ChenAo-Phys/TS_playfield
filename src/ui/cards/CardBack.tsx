/**
 * The back of a card (ui-spec §2.4, final.css `.card-back`; asset §17 ≤ 3 KB): navy with a fine diagonal
 * hatch, a brass inner rim and a brass "TS" roundel. An SVG, so it scales from a 22 px pile thumbnail to a
 * full-size card. The roundel monogram is the game's logo, not text.
 */
import { useId } from "react";
import { useI18n } from "../../i18n/react";
import s from "./cards.module.css";

export interface CardBackProps {
  /** Width in CSS px; the height is width × 1.4. */
  width: number;
  // ── extensions ──
  /** Accessible name (default "Unknown card"); pass "" for a purely decorative back. */
  label?: string;
  className?: string;
}

export function CardBack({ width, label, className }: CardBackProps) {
  const { t } = useI18n();
  const uid = useId().replace(/:/g, "");
  const name = label ?? t("ui:pile.unknownCard");
  const height = Math.round(width * 1.4);
  const small = width < 40;
  return (
    <svg
      className={[s.back, className].filter(Boolean).join(" ")}
      viewBox="0 0 100 140"
      width={width}
      height={height}
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      focusable="false"
      data-back=""
    >
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2=".45" y2="1">
          <stop offset="0" className={s.backTop} />
          <stop offset=".7" className={s.backBottom} />
        </linearGradient>
        <pattern id={`${uid}h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="6" className={s.backHatch} />
        </pattern>
      </defs>
      <rect width="100" height="140" rx={small ? 3 : 6} fill={`url(#${uid}g)`} />
      <rect width="100" height="140" rx={small ? 3 : 6} fill={`url(#${uid}h)`} />
      <rect x="5" y="5" width="90" height="130" rx="3" className={s.backRim} />
      <circle cx="50" cy="70" r="15" className={s.backRing} />
      <circle cx="50" cy="70" r="12" className={s.backRingInner} />
      {small ? null : (
        <text x="50" y="71" className={s.backMono} fontSize="15" textAnchor="middle" dominantBaseline="central">TS</text>
      )}
    </svg>
  );
}
