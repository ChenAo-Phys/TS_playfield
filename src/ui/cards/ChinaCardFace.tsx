/**
 * The China Card (ui-spec §7.3; asset §17): face up = the card image (CardFace #6); face down = red
 * lacquer with a gold rim, the five stars, and the bilingual title "THE CHINA CARD / 中国牌" drawn as SVG
 * text (language-neutral artwork; both titles come from src/data), crossed by an HTML ribbon "Face down"
 * in the UI language.
 */
import { useId } from "react";
import { CHINA_CARD, cardInfo } from "../../data";
import { useI18n } from "../../i18n/react";
import { STAR_PATH } from "../common/glyphs";
import { CardFace, type CardFaceProps } from "./CardFace";
import s from "./cards.module.css";

export interface ChinaCardFaceProps {
  faceUp: boolean;
  /** Width in CSS px; the height is width × 1.4. */
  width: number;
  // ── extensions (face up only) ──
  caption?: boolean;
  dim?: CardFaceProps["dim"];
  tags?: CardFaceProps["tags"];
  eager?: boolean;
  className?: string;
}

/** The big star (centre, scale) and the four small ones arcing round it, each pointing at it (PRC flag). */
const BIG = { x: 37, y: 38, k: 1.45 };
const SMALL_STARS: readonly { x: number; y: number; rot: number }[] = [[61, 20], [69, 30], [69, 44], [61, 55]].map(([x, y]) => ({
  x: x!, y: y!, rot: (Math.atan2(BIG.y - y!, BIG.x - x!) * 180) / Math.PI + 90,
}));

export function ChinaCardFace({ faceUp, width, caption, dim, tags, eager, className }: ChinaCardFaceProps) {
  const { t, cardName } = useI18n();
  const uid = useId().replace(/:/g, "");
  if (faceUp) return <CardFace card={CHINA_CARD} width={width} caption={caption} dim={dim} tags={tags} eager={eager} className={className} />;
  const titles = cardInfo(CHINA_CARD)!.title;
  const height = Math.round(width * 1.4);
  const ribbonSize = width < 100 ? s.ribbonS : width < 180 ? s.ribbonM : s.ribbonL;
  return (
    <div
      className={[s.china, className].filter(Boolean).join(" ")}
      style={{ width, height }}
      role="img"
      aria-label={t("ui_common:china.faceDownLabel", { card: cardName(CHINA_CARD) })}
      data-card={CHINA_CARD}
      data-face="down"
    >
      <svg viewBox="0 0 100 140" width={width} height={height} aria-hidden="true" focusable="false" className={s.chinaSvg}>
        <defs>
          <linearGradient id={`${uid}l`} x1="0" y1="0" x2=".6" y2="1">
            <stop offset="0" className={s.lacquerTop} />
            <stop offset="1" className={s.lacquerBottom} />
          </linearGradient>
          <radialGradient id={`${uid}s`} cx=".35" cy=".2" r=".9">
            <stop offset="0" className={s.sheenTop} />
            <stop offset=".6" className={s.sheenNone} />
          </radialGradient>
        </defs>
        <rect width="100" height="140" rx="6" fill={`url(#${uid}l)`} />
        <rect width="100" height="140" rx="6" fill={`url(#${uid}s)`} />
        <rect x="4.5" y="4.5" width="91" height="131" rx="3" className={s.goldRim} />
        <rect x="7.5" y="7.5" width="85" height="125" rx="2" className={s.goldRimThin} />
        {[[7.5, 7.5], [92.5, 7.5], [7.5, 132.5], [92.5, 132.5]].map(([x, y]) => (
          <rect key={`${x},${y}`} x={x! - 2.2} y={y! - 2.2} width="4.4" height="4.4" transform={`rotate(45 ${x} ${y})`} className={s.goldFill} />
        ))}
        <g transform={`translate(${BIG.x} ${BIG.y}) scale(${BIG.k}) translate(-12 -12)`}>
          <path d={STAR_PATH} className={s.goldFill} />
        </g>
        {SMALL_STARS.map(({ x, y, rot }) => (
          <g key={`${x},${y}`} transform={`translate(${x} ${y}) rotate(${rot.toFixed(1)}) scale(.36) translate(-12 -12)`}>
            <path d={STAR_PATH} className={s.goldFill} />
          </g>
        ))}
        <line x1="20" y1="66" x2="80" y2="66" className={s.goldLine} />
        <text x="50" y="78" fontSize="8.6" textAnchor="middle" className={s.chinaEn}>{titles.en.toUpperCase()}</text>
        <text x="50" y="97" fontSize="15" textAnchor="middle" className={s.chinaZh}>{titles.zh}</text>
        <line x1="20" y1="104" x2="80" y2="104" className={s.goldLine} />
      </svg>
      <span className={`${s.ribbon} ${ribbonSize}`} aria-hidden="true">{t("ui:china.faceDown")}</span>
    </div>
  );
}
