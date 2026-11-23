/**
 * The map's static layers (memoised; they redraw only on a language switch): SVG defs, the sea,
 * coast water lines, land, borders, paper grain, the big superpower lettering, and the links.
 * Plus the annotations layer (pencil marks, delta pills, cost/cap tags, reticle).
 */
import { memo } from "react";
import type { DataLang } from "../../data";
import type { MapDetail } from "../theme";
import paperUrl from "./assets/paper.webp";
import { GEOMETRY, type LandClass } from "./geometry.generated";
import {
  BOX,
  COUNTRY_LAYOUT,
  JAPAN_WRAP,
  LETTERING,
  LINKS,
  MAP_H,
  MAP_W,
  SLOT_LAND,
  SUPERPOWER_LINKS,
} from "./layout";
import type { MapTargets, RegionSlot } from "./contract";
import s from "./MapView.module.css";
import { mapText } from "./strings";

/** Land paint order (big neutral masses first). */
export const LAND_ORDER: readonly LandClass[] = ["neutral", "usa", "ussr", "china", "euw", "eue", "me", "asia", "sea", "af", "ca", "sa"];
const ALL_LAND = LAND_ORDER.map(k => GEOMETRY.land[k]).join("");

/** Element ids inside the map SVG (one map per page; a second copy would define identical ids). */
export const IDS = {
  land: "tsm-land",
  clip: "tsm-clip",
  seaLines: "tsm-sea-lines",
  grain: "tsm-grain",
  sheen: "tsmSheen",
  hatch: "tsmHatch",
} as const;

export const Defs = memo(function Defs() {
  return (
    <defs>
      <path id={IDS.land} d={ALL_LAND} />
      <clipPath id={IDS.clip}>
        <rect width={MAP_W} height={MAP_H} rx={6} />
      </clipPath>
      <pattern id={IDS.seaLines} width={12} height={7} patternUnits="userSpaceOnUse">
        <path className={s.seaLine} d="M0 6.5h12" />
      </pattern>
      <pattern id={IDS.grain} width={256} height={256} patternUnits="userSpaceOnUse">
        <image href={paperUrl} width={256} height={256} preserveAspectRatio="none" />
      </pattern>
      <linearGradient id={IDS.sheen} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: "var(--ts-paper-50)", stopOpacity: 0.3 }} />
        <stop offset=".45" style={{ stopColor: "var(--ts-paper-50)", stopOpacity: 0 }} />
        <stop offset="1" style={{ stopColor: "var(--ts-ink-900)", stopOpacity: 0.16 }} />
      </linearGradient>
      <pattern id={IDS.hatch} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={1.6} height={4} style={{ fill: "var(--ts-paper-50)", fillOpacity: 0.25 }} />
      </pattern>
    </defs>
  );
});

/** Sea, coast, land, borders, grain and lettering, clipped to the chart. */
export const Ground = memo(function Ground() {
  return (
    <g aria-hidden="true">
      {/* A soft table shadow round the chart (static strokes, no filter). */}
      <g transform="translate(0 10)">
        <rect className={s.tableShadow} x={-8} y={-8} width={MAP_W + 16} height={MAP_H + 16} rx={14} strokeWidth={22} strokeOpacity={0.12} />
        <rect className={s.tableShadow} x={-4} y={-4} width={MAP_W + 8} height={MAP_H + 8} rx={10} strokeWidth={10} strokeOpacity={0.22} />
      </g>
      <g clipPath={`url(#${IDS.clip})`}>
        <rect className={s.sea} width={MAP_W} height={MAP_H} />
        <rect width={MAP_W} height={MAP_H} fill={`url(#${IDS.seaLines})`} />
        <use href={`#${IDS.land}`} className={s.coastWide} />
        <use href={`#${IDS.land}`} className={s.coastNarrow} />
        {LAND_ORDER.map(k => (
          <path key={k} className={`${s.land} ${s[`land_${k}`]}`} d={GEOMETRY.land[k]} data-land={k} />
        ))}
        <path className={s.borders} d={GEOMETRY.borders} />
        <rect className={s.grain} width={MAP_W} height={MAP_H} fill={`url(#${IDS.grain})`} />
        <text className={`${s.lettering} ${s.letteringUS}`} x={LETTERING.US.x} y={LETTERING.US.y} fontSize={LETTERING.US.size}>
          {LETTERING.US.text}
        </text>
        <text className={`${s.lettering} ${s.letteringUSSR}`} x={LETTERING.USSR.x} y={LETTERING.USSR.y} fontSize={LETTERING.USSR.size}>
          {LETTERING.USSR.text}
        </text>
      </g>
    </g>
  );
});

/** Brass tint over a region's land (region prompts, region focus). */
export const RegionTint = memo(function RegionTint({ slot, hot }: { slot: RegionSlot | null; hot: boolean }) {
  if (slot === null) return null;
  return (
    <g clipPath={`url(#${IDS.clip})`} aria-hidden="true">
      {SLOT_LAND[slot].map(k => (
        <path key={k} className={`${s.regionTint} ${hot ? s.regionTintHot : ""}`} d={GEOMETRY.land[k]} />
      ))}
    </g>
  );
});

/** Links: superpower adjacency, regional (solid), inter-regional (dotted), the Japan ↔ USA wrap. */
export const Links = memo(function Links({ lang }: { lang: DataLang }) {
  const w = JAPAN_WRAP;
  return (
    <g className={s.links} aria-hidden="true">
      {SUPERPOWER_LINKS.map(l => (
        <line key={`sp${l.country}`} className={l.side === "US" ? s.linkUS : s.linkUSSR} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
      {LINKS.filter(l => !l.inter).map(l => (
        <line key={`${l.a}-${l.b}`} className={s.link} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
      {LINKS.filter(l => l.inter).map(l => (
        <line key={`${l.a}-${l.b}`} className={s.linkInter} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
      <line className={s.linkUS} x1={w.toUsa.x1} y1={w.toUsa.y} x2={w.toUsa.x2} y2={w.toUsa.y} />
      <path className={s.wrapHead} d={`M${w.toUsa.x2 - 10} ${w.toUsa.y - 8}l10 8-10 8`} />
      <text className={s.wrapLabel} x={w.toUsa.labelX} y={w.toUsa.labelY} textAnchor="end">{mapText(lang, "map.toUSA")}</text>
      <line className={s.linkUS} x1={w.toJapan.x1} y1={w.toJapan.y} x2={w.toJapan.x2} y2={w.toJapan.y} />
      <path className={s.wrapHead} d={`M${w.toJapan.x2 + 10} ${w.toJapan.y - 8}l-10 8 10 8`} />
      <text className={s.wrapLabel} x={w.toJapan.labelX} y={w.toJapan.labelY}>{mapText(lang, "map.toJapan")}</text>
    </g>
  );
});

export interface AnnotationsProps {
  lang: DataLang;
  detail: MapDetail;
  targets: MapTargets | null;
  placed: Readonly<Record<number, number>>;
  lastOpponent: Readonly<Record<number, { us: number; ussr: number }>>;
  selection: number | null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Annotations above every box (ui-spec §4.4): pencil marks, delta pills, cost and cap tags, reticle. */
export const Annotations = memo(function Annotations(p: AnnotationsProps) {
  const zh = p.lang === "zh";
  const out: JSX.Element[] = [];
  const t = p.targets;
  for (const c of COUNTRY_LAYOUT) {
    const { x, y } = c.rect;
    const id = c.id;
    if (t && t.ids.has(id) && t.cost2.has(id)) {
      const w = zh ? 30 : 38;
      out.push(
        <g key={`c${id}`} className={s.costTag} transform={`translate(${x - 5} ${y + 48})`}>
          <rect width={w} height={15} rx={2} />
          <text x={w / 2} y={11.5}>{mapText(p.lang, "map.cost2")}</text>
        </g>,
      );
    }
    if (t?.cap && t.ids.has(id) && (t.cap.placed[id] ?? 0) > 0) {
      out.push(
        <g key={`k${id}`} className={s.capTag} transform={`translate(${x + BOX.w - 25} ${y + 48})`}>
          <rect width={30} height={15} rx={2} />
          <text x={15} y={11.5}>{`${t.cap.placed[id] ?? 0}/${t.cap.max}`}</text>
        </g>,
      );
    }
    const pl = p.placed[id];
    if (pl) {
      out.push(
        <g key={`p${id}`} transform={`translate(${x + BOX.w + 1} ${y - 3})`} data-pencil={id}>
          <ellipse className={s.pencilRing} rx={13} ry={10.5} transform="rotate(-12)" />
          <text className={s.pencil} y={5.2}>{signed(pl)}</text>
        </g>,
      );
    }
    const lo = p.lastOpponent[id];
    if (lo && (lo.us || lo.ussr)) {
      let dx = -6;
      for (const side of ["US", "USSR"] as const) {
        const d = side === "US" ? lo.us : lo.ussr;
        if (!d) continue;
        out.push(
          <g key={`d${id}${side}`} className={`${s.pill} ${side === "US" ? s.pillUS : s.pillUSSR}`} transform={`translate(${x + dx} ${y - 9})`}>
            <rect width={25} height={15} rx={side === "US" ? 2.5 : 0} />
            <text x={12.5} y={11.6}>{signed(d)}</text>
          </g>,
        );
        dx += 27;
      }
    }
  }
  if (p.selection !== null && COUNTRY_LAYOUT[p.selection]) {
    const { x, y, w, h } = COUNTRY_LAYOUT[p.selection]!.rect;
    const m = 10, L = 15;
    out.push(
      <path
        key="reticle"
        className={s.reticle}
        data-reticle={p.selection}
        transform={`translate(${x} ${y})`}
        d={`M${-m} ${-m + L}V${-m}H${-m + L} M${w + m - L} ${-m}H${w + m}V${-m + L} M${w + m} ${h + m - L}V${h + m}H${w + m - L} M${-m + L} ${h + m}H${-m}V${h + m - L}`}
      />,
    );
  }
  return <g className={s.anno} aria-hidden="true">{out}</g>;
});
