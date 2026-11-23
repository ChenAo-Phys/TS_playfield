/**
 * Region plates ("if scored now", ui-spec §4.5) and the two superpower plates (§4.2).
 */
import { memo, type Ref } from "react";
import type { DataLang } from "../../data";
import type { RegionalStatus, RegionScore } from "../../engine/types";
import type { Side } from "../../game/contract";
import type { RegionSlot } from "./contract";
import { glyphPath } from "./glyphs";
import { MAP_H, MAP_W, PLATE, PLATES, SUPERPOWER_PLATES } from "./layout";

/** Overview detail: plates grow (ui-spec §4.6). */
export const OVERVIEW_PLATE_SCALE = 1.4;
import s from "./MapView.module.css";
import { textWidth } from "./measure";
import { mapText, plateName, type MapStringKey } from "./strings";

const INK: Record<RegionSlot, string> = {
  0: s.bandEUW!, 1: s.bandASIA!, 2: s.bandME!, 3: s.bandAF!, 4: s.bandCA!, 5: s.bandSA!, 6: s.bandSEA!,
};

const STATUS_KEY: Record<RegionalStatus, MapStringKey> = {
  NONE: "plate.none", PRESENCE: "plate.pres", DOMINATION: "plate.dom", CONTROL: "plate.ctrl",
};

/** The plate's "if scored" net line, e.g. "US +3", "USSR wins", "Even". */
export function plateNet(lang: DataLang, score: RegionScore | undefined): { text: string; side: Side | null; wins: boolean } {
  if (!score) return { text: mapText(lang, "plate.even"), side: null, wins: false };
  const side = (k: Side) => mapText(lang, `side.${k}`);
  if (score.wins) return { text: mapText(lang, "plate.wins", { side: side(score.wins) }), side: score.wins, wins: true };
  if (score.net === 0) return { text: mapText(lang, "plate.even"), side: null, wins: false };
  const who: Side = score.net > 0 ? "US" : "USSR";
  return { text: mapText(lang, "plate.net", { side: side(who), vp: Math.abs(score.net) }), side: who, wins: false };
}

export interface RegionPlateProps {
  slot: RegionSlot;
  score: RegionScore | undefined;
  lang: DataLang;
  /** Overview detail: plates grow ×1.4 around their centre. */
  big: boolean;
  /** Region prompt: offered (loud ring). */
  offered: boolean;
  /** Highlighted (focus region / spotlight / hovered in a region prompt). */
  hot: boolean;
  dim: boolean;
  fontsVersion: number;
  plateRef?: Ref<SVGGElement>;
}

function RegionPlateImpl(p: RegionPlateProps) {
  const r = PLATES[p.slot];
  const w = PLATE.w, h = PLATE.h;
  const zh = p.lang === "zh";
  const net = plateNet(p.lang, p.score);
  const name = plateName(p.lang, p.slot);
  const netW = Math.max(textWidth(net.text, zh ? "net-zh" : "net-en", zh ? 13 : 15), textWidth(mapText(p.lang, "plate.ifScored"), "chip-en", 10));
  const nameRoom = w - 12 - 10 - netW;
  const nameW = textWidth(name, zh ? "plate-zh" : "plate-en", zh ? 18 : 22);
  const label = mapText(p.lang, "map.plateLabel", { region: name, net: net.text });
  const scale = p.big ? OVERVIEW_PLATE_SCALE : 1;
  // A grown plate stays on the chart.
  const half = { w: (w * scale) / 2, h: (h * scale) / 2 };
  const cx = Math.min(MAP_W - 4 - half.w, Math.max(4 + half.w, r.x + w / 2));
  const cy = Math.min(MAP_H - 4 - half.h, Math.max(4 + half.h, r.y + h / 2));
  const transform = scale === 1 ? `translate(${r.x} ${r.y})` : `translate(${cx} ${cy}) scale(${scale}) translate(${-w / 2} ${-h / 2})`;
  return (
    <g
      ref={p.plateRef}
      className={[s.plate, p.offered && s.loud, p.hot && s.plateHot, p.dim && s.boxDim].filter(Boolean).join(" ")}
      transform={transform}
      data-plate={p.slot}
      tabIndex={-1}
      role="button"
      aria-label={label}
    >
      {p.offered && (
        <g aria-hidden="true">
          <rect className={s.ringGlow} x={-6} y={-6} width={w + 12} height={h + 12} rx={6} />
          <rect className={s.ringEdge} x={-6} y={-6} width={w + 12} height={h + 12} rx={6} />
          <rect className={s.ring} x={-6} y={-6} width={w + 12} height={h + 12} rx={6} />
        </g>
      )}
      <rect className={s.plateBody} width={w} height={h} rx={2} />
      <rect className={INK[p.slot]} width={5} height={h} rx={1} />
      <rect className={s.plateFocus} x={-3} y={-3} width={w + 6} height={h + 6} rx={4} />
      <text
        className={s.plateName}
        x={12}
        y={zh ? 24 : 25}
        textLength={nameW > nameRoom ? nameRoom : undefined}
        lengthAdjust={nameW > nameRoom ? "spacingAndGlyphs" : undefined}
      >
        {name}
      </text>
      <text className={s.plateNetLabel} x={w - 8} y={12}>{mapText(p.lang, "plate.ifScored")}</text>
      <text className={[s.plateNet, net.side === "US" ? s.netUS : net.side === "USSR" ? s.netUSSR : s.netEven].join(" ")} x={w - 8} y={27}>
        {net.text}
      </text>
      {net.wins && <line className={s.netHazard} x1={w - 8 - netW} y1={30.5} x2={w - 8} y2={30.5} />}
      {p.slot === 6 ? (
        <text className={s.plateValues} x={12} y={48}>{mapText(p.lang, "plate.values.6")}</text>
      ) : (
        <>
          <Chips lang={p.lang} score={p.score} />
          <text className={s.plateValues} x={w - 8} y={48} textAnchor="end">{mapText(p.lang, `plate.values.${p.slot}` as MapStringKey)}</text>
        </>
      )}
    </g>
  );
}

function Chips({ lang, score }: { lang: DataLang; score: RegionScore | undefined }) {
  const zh = lang === "zh";
  let x = 12;
  return (
    <>
      {(["US", "USSR"] as const).map(side => {
        const st = (side === "US" ? score?.us.status : score?.ussr.status) ?? "NONE";
        const text = mapText(lang, STATUS_KEY[st]);
        const cw = Math.max(34, textWidth(text, zh ? "chip-zh" : "chip-en", zh ? 11.5 : 12) + 24);
        const chipCls = st === "NONE" ? s.chipNone : [side === "US" ? s.chipUS : s.chipUSSR, st === "PRESENCE" && s.chipPres].filter(Boolean).join(" ");
        const textCls = [s.chipText, st === "NONE" ? s.chipTextNone : side === "US" ? s.chipTextUS : s.chipTextUSSR].join(" ");
        const el = (
          <g key={side} transform={`translate(${x} 35)`}>
            {side === "US"
              ? <rect className={chipCls} width={cw} height={17} rx={2} />
              : <path className={chipCls} d={`M4 0H${cw}V13L${cw - 4} 17H0V4Z`} />}
            <g transform="translate(4 2.6) scale(.5)">
              <path className={st === "NONE" ? s.chipTextNone : side === "US" ? s.chipTextUS : s.chipTextUSSR} d={glyphPath(side)} />
            </g>
            <text className={textCls} x={cw / 2 + 7} y={13}>{text}</text>
          </g>
        );
        x += cw + 4;
        return el;
      })}
    </>
  );
}

export const RegionPlate = memo(RegionPlateImpl);

/** Superpower plate: side-700 fill, dashed inner rim, glyph + "USA"/"USSR" stencil (ui-spec §4.2). */
export const SuperpowerPlate = memo(function SuperpowerPlate({ side }: { side: Side }) {
  const r = SUPERPOWER_PLATES[side];
  const us = side === "US";
  return (
    <g transform={`translate(${r.x} ${r.y})`} aria-hidden="true">
      <rect className={s.spShadow} x={2} y={3} width={r.w} height={r.h} rx={4} />
      <rect className={us ? s.spPlateUS : s.spPlateUSSR} width={r.w} height={r.h} rx={4} />
      <rect className={us ? s.spRimUS : s.spRimUSSR} x={4} y={4} width={r.w - 8} height={r.h - 8} rx={2} />
      <g transform="translate(10 12)">
        <path className={us ? s.spGlyphUS : s.spGlyphUSSR} d={glyphPath(side)} />
      </g>
      <text className={[s.spText, us ? s.spTextUS : s.spTextUSSR].join(" ")} x={70} y={33}>{us ? "USA" : "USSR"}</text>
    </g>
  );
});
