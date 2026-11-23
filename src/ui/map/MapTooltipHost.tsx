/**
 * The map's tooltip host (ui-spec §4.8): an HTML popover in a portal (z popover), placed beside the
 * box on the side with more free space, 12 px away, with a 7 px arrow. Plus the default contents
 * for a country (no prompt) and a region plate (the scoring breakdown).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { COUNTRIES, REGIONS, type DataLang } from "../../data";
import type { RegionScore } from "../../engine/types";
import type { Side } from "../../game/contract";
import { useTouchUi } from "../common/touch";
import type { BoxValues } from "./board";
import type { RegionSlot } from "./contract";
import { glyphPath } from "./glyphs";
import s from "./MapView.module.css";
import { fullName } from "./names";
import { plateNet } from "./Plates";
import { mapText, plateName } from "./strings";

const GAP = 12;
const MARGIN = 8;

export type TipPlacement = "left" | "right" | "top" | "bottom";

export interface TipPosition {
  left: number;
  top: number;
  placement: TipPlacement;
  /** Arrow offset along the popover's edge (px). */
  arrow: number;
}

/**
 * Where to put a popover of size (w, h) next to `anchor` inside a window (ww, wh): the side with more
 * free space horizontally when it fits, else above/below; clamped to the window.
 */
export function placeTip(anchor: { left: number; top: number; width: number; height: number }, w: number, h: number, ww: number, wh: number): TipPosition {
  const spaceL = anchor.left - MARGIN, spaceR = ww - (anchor.left + anchor.width) - MARGIN;
  const spaceT = anchor.top - MARGIN, spaceB = wh - (anchor.top + anchor.height) - MARGIN;
  const cy = anchor.top + anchor.height / 2, cx = anchor.left + anchor.width / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const horiz = Math.max(spaceL, spaceR) >= w + GAP;
  if (horiz) {
    const placement: TipPlacement = spaceR >= spaceL ? "right" : "left";
    const left = placement === "right" ? anchor.left + anchor.width + GAP : anchor.left - GAP - w;
    const top = clamp(cy - h / 2, MARGIN, Math.max(MARGIN, wh - h - MARGIN));
    return { left, top, placement, arrow: clamp(cy - top, 12, h - 12) };
  }
  const placement: TipPlacement = spaceB >= spaceT ? "bottom" : "top";
  const top = placement === "bottom" ? anchor.top + anchor.height + GAP : anchor.top - GAP - h;
  const left = clamp(cx - w / 2, MARGIN, Math.max(MARGIN, ww - w - MARGIN));
  return { left, top, placement, arrow: clamp(cx - left, 12, w - 12) };
}

export interface MapTooltipHostProps {
  /** Viewport rect of what the popover points at; null = closed. */
  anchor: DOMRect | null;
  pinned: boolean;
  zh: boolean;
  children: ReactNode;
  /** A click (a tap) on the pinned popover itself: close it (R-008). The popover takes the tap, so it never falls through. */
  onClose?(): void;
  /** The viewport rect to keep the popover inside (default: the window). Compact landscape passes the map column,
   *  so a tooltip never spills over the side column (Q-032). */
  bounds?: () => DOMRect | null;
}

export function MapTooltipHost({ anchor, pinned, zh, children, bounds, onClose }: MapTooltipHostProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<TipPosition | null>(null);
  const key = anchor ? `${Math.round(anchor.left)},${Math.round(anchor.top)},${Math.round(anchor.width)}` : "";
  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) { setPos(null); return; }
    const r = el.getBoundingClientRect();
    const b = bounds?.() ?? null;
    const ox = b?.left ?? 0, oy = b?.top ?? 0;
    const at = placeTip({ left: anchor.left - ox, top: anchor.top - oy, width: anchor.width, height: anchor.height }, r.width, r.height,
      b ? b.width : window.innerWidth, b ? b.height : window.innerHeight);
    const next = { ...at, left: at.left + ox, top: at.top + oy };
    setPos(cur => (cur && cur.left === next.left && cur.top === next.top && cur.placement === next.placement && cur.arrow === next.arrow ? cur : next));
    // `key` captures the anchor; children changes re-measure too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, children]);
  if (!anchor || typeof document === "undefined") return null;
  const arrowCls = pos
    ? { right: s.tipArrowLeft, left: s.tipArrowRight, bottom: s.tipArrowTop, top: s.tipArrowBottom }[pos.placement]
    : "";
  const arrowStyle = pos
    ? pos.placement === "left" || pos.placement === "right" ? { top: pos.arrow - 7 } : { left: pos.arrow - 7 }
    : undefined;
  return createPortal(
    <div
      ref={ref}
      className={[s.tip, pinned && s.tipPinned, zh && s.zh].filter(Boolean).join(" ")}
      role="tooltip"
      data-map-tip=""
      data-no-skip=""
      onClick={pinned ? onClose : undefined}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      <span className={`${s.tipArrow} ${arrowCls}`} style={arrowStyle} />
      <div className={s.tipBody}>{children}</div>
    </div>,
    document.body,
  );
}

function Glyph({ side }: { side: Side }) {
  return (
    <svg className={s.tipGlyph} viewBox="0 0 24 24" aria-hidden="true">
      <path d={glyphPath(side)} fill="currentColor" />
    </svg>
  );
}

/** Default country tooltip (no prompt): name + BG chip, stability · region, US row, USSR row, key hint. */
export function DefaultCountryTip({ id, values, humanSide, lang }: { id: number; values: BoxValues; humanSide: Side; lang: DataLang }) {
  // Touch screens: no right-click / Space instruction (Q-032).
  const touch = useTouchUi();
  const c = COUNTRIES[id];
  if (!c) return null;
  const region = c.subregions.includes("SOUTHEAST_ASIA") ? plateName(lang, 6) : REGIONS[c.region]?.name[lang] ?? "";
  const row = (side: Side) => {
    const n = side === "US" ? values.us : values.ussr;
    return (
      <div className={s.tipRow} key={side}>
        <span className={`${s.tipLabel} ${side === "US" ? s.tipUS : s.tipUSSR}`}>
          <Glyph side={side} />
          {mapText(lang, `side.${side}`)}
          {side === humanSide ? ` ${mapText(lang, "tip.you")}` : ""}
        </span>
        <span className={s.tipValue}>
          {n}
          {values.ctrl === side ? ` · ${mapText(lang, "tip.control")}` : ""}
        </span>
      </div>
    );
  };
  return (
    <>
      <div className={s.tipHead}>
        <span className={s.tipName}>{fullName(id, lang)}</span>
        {c.battleground && <span className={s.tipChip}>{mapText(lang, "tip.battleground")}</span>}
      </div>
      <div className={s.tipRow}>
        <span className={s.tipLabel}>{mapText(lang, "tip.stabilityRegion", { region })}</span>
        <span className={s.tipValue}>{c.stability}</span>
      </div>
      {row("US")}
      {row("USSR")}
      <div className={s.tipHint}>{mapText(lang, touch ? "tip.keys.inspectTouch" : "tip.keys.inspect")}</div>
    </>
  );
}

/** Default plate popover: the engine's scoring breakdown for the region if scored now. */
export function DefaultPlateTip({ slot, score, lang }: { slot: RegionSlot; score: RegionScore | undefined; lang: DataLang }) {
  const net = plateNet(lang, score);
  const status = (st: string | null | undefined) =>
    st ? mapText(lang, ({ NONE: "plate.none", PRESENCE: "plate.pres", DOMINATION: "plate.dom", CONTROL: "plate.ctrl" } as const)[st as "NONE"] ?? "plate.none") : "—";
  return (
    <>
      <div className={s.tipHead}>
        <span className={s.tipName}>{plateName(lang, slot)}</span>
      </div>
      {score && (
        <table className={s.tipTable}>
          <thead>
            <tr><th />
              <th className={s.tipUS}>{mapText(lang, "side.US")}</th>
              <th className={s.tipUSSR}>{mapText(lang, "side.USSR")}</th>
            </tr>
          </thead>
          <tbody>
            {slot !== 6 && <tr><td>{mapText(lang, "plate.table.status")}</td><td>{status(score.us.status)}</td><td>{status(score.ussr.status)}</td></tr>}
            <tr><td>{mapText(lang, "plate.table.countries")}</td><td>{score.us.countries}</td><td>{score.ussr.countries}</td></tr>
            {slot !== 6 && <tr><td>{mapText(lang, "plate.table.battlegrounds")}</td><td>{score.us.battlegrounds}</td><td>{score.ussr.battlegrounds}</td></tr>}
            {slot !== 6 && <tr><td>{mapText(lang, "plate.table.adjacent")}</td><td>{score.us.adjacent}</td><td>{score.ussr.adjacent}</td></tr>}
          </tbody>
          <tfoot>
            <tr><td>{mapText(lang, "plate.table.total")}</td><td>{score.us.vp}</td><td>{score.ussr.vp}</td></tr>
          </tfoot>
        </table>
      )}
      <div className={s.tipHint}>{mapText(lang, "plate.ifScored")}: <b className={net.side === "US" ? s.tipUS : net.side === "USSR" ? s.tipUSSR : ""}>{net.text}</b></div>
    </>
  );
}
