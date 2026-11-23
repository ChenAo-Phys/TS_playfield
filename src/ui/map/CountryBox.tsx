/**
 * One country box (ui-spec §4.3 anatomy, §4.4 states) and its influence markers.
 * Positioned by its <g transform>; everything inside is in box-local units (88 × 56).
 */
import { memo, type Ref } from "react";
import type { Side } from "../../game/contract";
import type { MapDetail } from "../theme";
import type { BoxValues, Ghost, TargetLook } from "./board";
import { glyphPath } from "./glyphs";
import { BOX, type BandKind, type CountryLayout } from "./layout";
import s from "./MapView.module.css";
import type { FittedLabel } from "./names";

const BAND_CLASS: Record<Exclude<BandKind, "euwe">, string> = {
  euw: s.bandEUW!, eue: s.bandEUE!, me: s.bandME!, asia: s.bandASIA!, sea: s.bandSEA!, af: s.bandAF!, ca: s.bandCA!, sa: s.bandSA!,
};
const REGION_INK: Record<number, string> = { 0: s.bandEUW!, 1: s.bandASIA!, 2: s.bandME!, 3: s.bandAF!, 4: s.bandCA!, 5: s.bandSA! };

const W = BOX.w, H = BOX.h, BAND = BOX.band, R = BOX.radius;
/** Band path: rounded top corners, square bottom. */
const bandPath = (x0: number, x1: number, roundLeft: boolean, roundRight: boolean): string =>
  `M${x0} ${roundLeft ? R : 0}${roundLeft ? `a${R} ${R} 0 0 1 ${R} ${-R}` : `V0`}H${roundRight ? x1 - R : x1}${roundRight ? `a${R} ${R} 0 0 1 ${R} ${R}` : ""}V${BAND}H${x0}z`;
const BAND_FULL = bandPath(0, W, true, true);
const BAND_LEFT = bandPath(0, W / 2, true, false);
const BAND_RIGHT = bandPath(W / 2, W, false, true);
const BG_STUB = bandPath(0, BOX.bgStub, true, false);

export interface CountryBoxProps {
  layout: CountryLayout;
  values: BoxValues;
  label: FittedLabel;
  /** Name font size (map units, label scale applied). */
  labelSize: number;
  zh: boolean;
  detail: MapDetail;
  target: TargetLook;
  dim: boolean;
  /** Pointer hover or keyboard focus on a target (hover ring, ghost marker, lifted shadow). */
  hot: boolean;
  ghost: Ghost | null;
  patterns: boolean;
  /** Pad the hit area 6 u on every side (touch). */
  touchPad: boolean;
  tabIndex: 0 | -1;
  ariaLabel: string;
  boxRef?: Ref<SVGGElement>;
}

function CountryBoxImpl(p: CountryBoxProps) {
  const { layout: c, values: v, detail } = p;
  const bg = c.info.battleground;
  const isTarget = p.target !== "none";
  const cls = [
    s.box,
    bg && s.boxBG,
    isTarget && s.boxTarget,
    isTarget && s[p.target],
    p.dim && s.boxDim,
    p.hot && s.boxHover,
    v.ctrl === "US" && s.ctrlUS,
    v.ctrl === "USSR" && s.ctrlUSSR,
  ].filter(Boolean).join(" ");
  const ringInset = p.target === "quiet" && !p.hot ? 3.5 : 5.5;
  const ringR = p.target === "quiet" && !p.hot ? 5 : 6;
  const hitPad = p.touchPad ? 6 : 0;
  const nameX = bg ? BOX.nameXBg : BOX.nameX;
  const nameClass = [s.name, p.zh && s.nameZh, bg ? s.nameBG : c.band === "eue" && s.nameEUE].filter(Boolean).join(" ");
  const showText = detail !== "overview";
  return (
    <g
      ref={p.boxRef}
      className={cls}
      transform={`translate(${c.rect.x} ${c.rect.y})`}
      data-cid={c.id}
      tabIndex={p.tabIndex}
      role={isTarget ? "button" : "img"}
      aria-label={p.ariaLabel}
    >
      {isTarget && (
        <g aria-hidden="true">
          {(p.target === "loud" || p.target === "danger") && !p.hot && (
            <rect className={s.ringGlow} x={-ringInset} y={-ringInset} width={W + 2 * ringInset} height={H + 2 * ringInset} rx={ringR} />
          )}
          <rect className={s.ringEdge} x={-ringInset} y={-ringInset} width={W + 2 * ringInset} height={H + 2 * ringInset} rx={ringR} />
          <rect className={s.ring} x={-ringInset} y={-ringInset} width={W + 2 * ringInset} height={H + 2 * ringInset} rx={ringR} />
        </g>
      )}
      <rect className={s.hit} x={-hitPad} y={-hitPad} width={W + 2 * hitPad} height={H + 2 * hitPad} />
      <rect className={s.shadow} x={1.6} y={2.4} width={W} height={H} rx={R} />
      <rect className={s.body} width={W} height={H} rx={R} />
      {v.ctrl === "USSR" && p.patterns && <rect className={s.hatch} width={W} height={H} rx={R} />}
      {bg ? (
        <>
          <path className={s.bandBG} d={BAND_FULL} />
          <path className={c.band === "euwe" ? s.bandEUW : REGION_INK[c.info.region] ?? BAND_CLASS.euw} d={BG_STUB} />
        </>
      ) : c.band === "euwe" ? (
        <>
          <path className={s.bandEUW} d={BAND_LEFT} />
          <path className={s.bandEUE} d={BAND_RIGHT} />
        </>
      ) : (
        <path className={BAND_CLASS[c.band]} d={BAND_FULL} />
      )}
      {showText && p.label.text && (
        <text
          className={nameClass}
          x={nameX}
          y={BOX.nameBaseline}
          fontSize={p.labelSize}
          textLength={p.label.textLength}
          lengthAdjust={p.label.textLength ? "spacingAndGlyphs" : undefined}
        >
          {p.label.text}
        </text>
      )}
      <rect className={s.stabBox} x={BOX.stab.x} y={BOX.stab.y} width={BOX.stab.w} height={BOX.stab.h} rx={2} />
      {showText && <text className={s.stabNum} x={BOX.stab.x + BOX.stab.w / 2} y={BOX.stab.y + 12.2}>{c.info.stability}</text>}
      <line className={s.divider} x1={BOX.divider.x} y1={BOX.divider.y1} x2={BOX.divider.x} y2={BOX.divider.y2} />
      <Slot side="US" n={v.us} flipped={v.ctrl === "US"} detail={detail} patterns={p.patterns} ghost={p.ghost?.side === "US" ? p.ghost : null} />
      <Slot side="USSR" n={v.ussr} flipped={v.ctrl === "USSR"} detail={detail} patterns={p.patterns} ghost={p.ghost?.side === "USSR" ? p.ghost : null} />
      <rect className={s.focusRing} x={-2} y={-2} width={W + 4} height={H + 4} rx={4} />
      <rect className={s.pulse} data-pulse="" x={-4} y={-4} width={W + 8} height={H + 8} rx={6} />
    </g>
  );
}

export const CountryBox = memo(CountryBoxImpl);

// ── Markers ───────────────────────────────────────────────────────────────────────────────────
const MK = BOX.marker;
const slotX = (side: Side) => (side === "US" ? MK.usX : MK.ussrX);

/** Marker outline: US square (rx 2.5), USSR chamfered 6 u at top-left and bottom-right. */
export function markerShape(side: Side, x: number, y: number, w = MK.w, h = MK.h): { d?: string; rect?: { x: number; y: number; w: number; h: number } } {
  if (side === "US") return { rect: { x, y, w, h } };
  return { d: `M${x + 6} ${y}H${x + w}V${y + h - 6}L${x + w - 6} ${y + h}H${x}V${y + 6}Z` };
}

function Shape({ side, className, x, y }: { side: Side; className: string; x: number; y: number }) {
  const sh = markerShape(side, x, y);
  return sh.rect
    ? <rect className={className} x={sh.rect.x} y={sh.rect.y} width={sh.rect.w} height={sh.rect.h} rx={2.5} />
    : <path className={className} d={sh.d} />;
}

interface SlotProps {
  side: Side;
  n: number;
  flipped: boolean;
  detail: MapDetail;
  patterns: boolean;
  ghost: Ghost | null;
}

function Slot({ side, n, flipped, detail, patterns, ghost }: SlotProps) {
  const x = slotX(side), y = MK.y;
  const cx = x + MK.w / 2, cy = y + MK.h / 2;
  const sideCls = side === "US" ? s.mkUS : s.mkUSSR;
  if (detail === "overview") {
    if (n <= 0) return null;
    return flipped
      ? <circle className={side === "US" ? s.dotUS : s.dotUSSR} cx={cx} cy={cy} r={7} />
      : <circle className={side === "US" ? s.ringDotUS : s.ringDotUSSR} cx={cx} cy={cy} r={6} />;
  }
  const marker = n > 0 ? (
    <g className={[s.mk, sideCls, flipped && s.mkFlip].filter(Boolean).join(" ")} data-mk={side}>
      <Shape side={side} className={s.mkFace!} x={x} y={y} />
      {flipped && patterns && side === "USSR" && <Shape side={side} className={s.hatch!} x={x} y={y} />}
      <Shape side={side} className={s.mkSheen!} x={x} y={y} />
      <g transform={`translate(${side === "US" ? x + 2.2 : x + MK.w - 10.8} ${y + 2.2}) scale(.36)`}>
        <path className={s.mkGlyph} d={glyphPath(side)} />
      </g>
      <text className={s.mkNum} x={cx + (side === "US" ? 2 : -2)} y={cy + 7.6}>{n}</text>
    </g>
  ) : detail === "detail" && !ghost ? (
    <g transform={`translate(${cx - 8} ${cy - 8}) scale(.6667)`} className={s.slotHint}>
      <path className={side === "US" ? s.slotHintUS : s.slotHintUSSR} d={glyphPath(side)} />
    </g>
  ) : null;
  if (!ghost) return marker;
  if (ghost.kind === "add") {
    return (
      <>
        <g className={[s.mk, sideCls, s.mkGhost].join(" ")} data-ghost={side}>
          <Shape side={side} className={s.mkFace!} x={x} y={y} />
          <text className={s.mkNum} x={cx + (side === "US" ? 2 : -2)} y={cy + 7.6}>{ghost.n}</text>
        </g>
      </>
    );
  }
  // Removal: the counter stays; a struck "−1" tag sits on its corner.
  const tx = side === "US" ? x + MK.w - 6 : x + 6, ty = y + 2;
  return (
    <>
      {marker}
      <g data-ghost={side} className={side === "US" ? s.ghostRemoveUS : s.ghostRemoveUSSR}>
        <rect className={s.ghostTag} x={tx - 12} y={ty - 9} width={24} height={16} rx={2} />
        <text className={s.ghostRemove} x={tx} y={ty + 4.5} stroke="none">{`−${ghost.n}`}</text>
        <line className={s.ghostStrike} x1={tx - 9} y1={ty - 1} x2={tx + 9} y2={ty - 1} />
      </g>
    </>
  );
}
