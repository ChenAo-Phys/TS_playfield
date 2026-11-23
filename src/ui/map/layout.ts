/**
 * The map's layout in map units ("u", the SVG user units of the viewBox), derived from the generated
 * geometry (scripts/build-map.mjs) and the country data (src/data). Pure: no DOM, no React.
 * Spec: docs/design/ui-spec.md §4.1–§4.5.
 */
import { COUNTRIES, type CountryInfo } from "../../data";
import type { Side } from "../../game/contract";
import type { RegionSlot } from "./contract";
import { GEOMETRY, type LandClass } from "./geometry.generated";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

export const MAP_W = GEOMETRY.viewBox[2];
export const MAP_H = GEOMETRY.viewBox[3];
export const MAP_RECT: Rect = { x: 0, y: 0, w: MAP_W, h: MAP_H };

/** Country box anatomy (ui-spec §4.3), in box-local units. */
export const BOX = {
  w: GEOMETRY.box.w,
  h: GEOMETRY.box.h,
  band: 19,
  radius: 3,
  /** Name x (battlegrounds leave room for the region stub). */
  nameX: 5.5,
  nameXBg: 8.5,
  nameBaseline: 14.4,
  stab: { x: 70, y: 2, w: 16, h: 15 },
  divider: { x: 44, y1: 22, y2: 53 },
  marker: { w: 31, h: 30, y: 22.5, usX: 6, ussrX: 50 },
  /** Battleground region-ink stub at the band's left. */
  bgStub: 5,
} as const;
/** Map units available for a country name (ui-spec §4.3: 88 − (BG 9 : 6) − 21). */
export const nameRoom = (battleground: boolean): number => BOX.w - (battleground ? 9 : 6) - 21;

export const PLATE = { w: 196, h: 58 } as const;
export const SUPERPOWER_PLATE = { w: 112, h: 48 } as const;

/** Region slots in board order (Europe, Middle East, Asia, SE Asia, Africa, C. America, S. America): keys 1–7. */
export const BOARD_ORDER: readonly RegionSlot[] = [0, 2, 1, 6, 3, 4, 5];
export const REGION_SLOTS: readonly RegionSlot[] = [0, 1, 2, 3, 4, 5, 6];

/** How a country's name band is painted (ui-spec §4.3). */
export type BandKind = "euw" | "eue" | "euwe" | "asia" | "sea" | "me" | "af" | "ca" | "sa";

export interface CountryLayout {
  id: number;
  info: CountryInfo;
  /** Box centre. */
  cx: number;
  cy: number;
  /** Box rect (top-left + size). */
  rect: Rect;
  /** Scoring slot: the region, or 6 for Southeast Asia countries. */
  slot: RegionSlot;
  band: BandKind;
}

const REGION_BAND: Record<number, BandKind> = { 0: "euw", 1: "asia", 2: "me", 3: "af", 4: "ca", 5: "sa" };

function bandOf(c: CountryInfo): BandKind {
  const we = c.subregions.includes("WESTERN_EUROPE"), ee = c.subregions.includes("EASTERN_EUROPE");
  if (we && ee) return "euwe";
  if (ee) return "eue";
  if (c.subregions.includes("SOUTHEAST_ASIA")) return "sea";
  return REGION_BAND[c.region] ?? "euw";
}

export const COUNTRY_LAYOUT: readonly CountryLayout[] = GEOMETRY.countries.map(g => {
  const info = COUNTRIES[g.id]!;
  return {
    id: g.id,
    info,
    cx: g.x,
    cy: g.y,
    rect: { x: g.x - BOX.w / 2, y: g.y - BOX.h / 2, w: BOX.w, h: BOX.h },
    slot: info.subregions.includes("SOUTHEAST_ASIA") ? 6 : (info.region as RegionSlot),
    band: bandOf(info),
  };
});
export const COUNTRY_COUNT = COUNTRY_LAYOUT.length;

/** The countries a region slot scores (Asia includes Southeast Asia; slot 6 is Southeast Asia only). */
export function countriesOfSlot(slot: RegionSlot): number[] {
  if (slot === 6) return COUNTRY_LAYOUT.filter(c => c.slot === 6).map(c => c.id);
  return COUNTRY_LAYOUT.filter(c => c.info.region === slot).map(c => c.id);
}

/** Land classes that make up a region slot (region tint, region prompt). */
export const SLOT_LAND: Readonly<Record<RegionSlot, readonly LandClass[]>> = {
  0: ["euw", "eue"], 1: ["asia", "sea"], 2: ["me"], 3: ["af"], 4: ["ca"], 5: ["sa"], 6: ["sea"],
};

// ── Rect helpers ──────────────────────────────────────────────────────────────────────────────
export function unionRect(rects: readonly Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { ...MAP_RECT };
}
export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
export function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}
export const centreOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function countryRect(id: number): Rect | null {
  const c = COUNTRY_LAYOUT[id];
  return c ? c.rect : null;
}

/** Bounding rect of these countries' boxes. */
export function boundsOf(ids: Iterable<number>, pad = 0): Rect {
  const rects: Rect[] = [];
  for (const id of ids) { const r = countryRect(id); if (r) rects.push(r); }
  return padRect(unionRect(rects), pad);
}

// ── Plates ────────────────────────────────────────────────────────────────────────────────────
const plateRect = (p: Point, w: number, h: number): Rect => ({ x: p.x - w / 2, y: p.y - h / 2, w, h });

/** Region plate rects by slot ("if scored now", ui-spec §4.5). */
export const PLATES: Readonly<Record<RegionSlot, Rect>> = Object.fromEntries(
  REGION_SLOTS.map(s => [s, plateRect(GEOMETRY.plates[s], PLATE.w, PLATE.h)]),
) as Record<RegionSlot, Rect>;

export const SUPERPOWER_PLATES: Readonly<Record<Side, Rect>> = {
  US: plateRect(GEOMETRY.superpowers.US, SUPERPOWER_PLATE.w, SUPERPOWER_PLATE.h),
  USSR: plateRect(GEOMETRY.superpowers.USSR, SUPERPOWER_PLATE.w, SUPERPOWER_PLATE.h),
};

/** Big background lettering (ui-spec §4.1). `x/y` = text start / baseline. */
export const LETTERING: Readonly<Record<Side, { text: string; x: number; y: number; size: number }>> = {
  US: { text: "U.S.A.", x: 26, y: 342, size: 78 },
  USSR: { text: "U.S.S.R.", x: 1250, y: 150, size: 92 },
};

/** Region / subregion areas: padded bounds of their boxes and plate (camera framing, theatre chips). */
export type AreaKey = RegionSlot | "WESTERN_EUROPE" | "EASTERN_EUROPE";
export function areaRect(area: AreaKey, pad = 24): Rect {
  if (area === "WESTERN_EUROPE" || area === "EASTERN_EUROPE") {
    return boundsOf(COUNTRY_LAYOUT.filter(c => c.info.subregions.includes(area)).map(c => c.id), pad);
  }
  const ids = countriesOfSlot(area);
  return padRect(unionRect([boundsOf(ids), PLATES[area]]), pad);
}

// ── Connections ───────────────────────────────────────────────────────────────────────────────
export interface Link {
  a: number;
  b: number;
  /** Crosses a region boundary (drawn dotted). */
  inter: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Every adjacency once, centre to centre (drawn under the boxes). */
export const LINKS: readonly Link[] = GEOMETRY.links.map(([a, b, inter]) => {
  const A = COUNTRY_LAYOUT[a]!, B = COUNTRY_LAYOUT[b]!;
  return { a, b, inter: inter === 1, x1: A.cx, y1: A.cy, x2: B.cx, y2: B.cy };
});

export interface SuperpowerLink {
  side: Side;
  country: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Japan's box sits on the far side of the map from the USA: drawn as two "wrap" arrows instead. */
export const JAPAN = 45;

/** Superpower adjacency, from the plate centre to the box centre (Japan excluded, see JAPAN_WRAP). */
export const SUPERPOWER_LINKS: readonly SuperpowerLink[] = COUNTRY_LAYOUT.flatMap(c => {
  const side = c.info.superpowerAdjacent;
  if (!side || c.id === JAPAN) return [];
  const p = side === "US" ? GEOMETRY.superpowers.US : GEOMETRY.superpowers.USSR;
  return [{ side, country: c.id, x1: p.x, y1: p.y, x2: c.cx, y2: c.cy }];
});

/** The Japan ↔ USA wrap (ui-spec §4.2): two short arrows to the map edges, each with a label. */
export const JAPAN_WRAP = (() => {
  const j = COUNTRY_LAYOUT[JAPAN]!;
  const us = SUPERPOWER_PLATES.US;
  const usY = us.y + us.h / 2;
  return {
    // Japan's box reaches almost to the edge, so its label sits under the box, right-aligned.
    toUsa: { x1: j.rect.x + j.rect.w, y: j.cy, x2: MAP_W - 6, labelX: MAP_W - 8, labelY: j.rect.y + j.rect.h + 16, anchor: "end" as const },
    toJapan: { x1: us.x, y: usY, x2: 8, labelX: 10, labelY: usY - 14, anchor: "start" as const },
  };
})();

/** Every adjacency pair (both directions) as "a-b" strings, for tests and lookups. */
export function adjacencyKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ── Spatial navigation (arrow keys, ui-spec §4.9) ─────────────────────────────────────────────
export type Direction = "left" | "right" | "up" | "down";

/**
 * The nearest box from `from` in `dir`: candidates whose centre lies in that direction (a 45° cone
 * widened to a half-plane if the cone is empty), scored by distance along the axis plus twice the
 * sideways offset. `candidates` defaults to every country.
 */
export function nearestInDirection(from: number, dir: Direction, candidates?: Iterable<number>): number | null {
  const a = COUNTRY_LAYOUT[from];
  if (!a) return null;
  const pool = candidates ? [...candidates] : COUNTRY_LAYOUT.map(c => c.id);
  const score = (cone: boolean): number | null => {
    let best: number | null = null, bestS = Infinity;
    for (const id of pool) {
      if (id === from) continue;
      const b = COUNTRY_LAYOUT[id];
      if (!b) continue;
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
      const side = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) continue;
      if (cone && side > along) continue;
      const s = along + 2 * side;
      if (s < bestS) { bestS = s; best = id; }
    }
    return best;
  };
  return score(true) ?? score(false);
}

/** Countries sorted in reading order (top-to-bottom bands of 40 u, then left-to-right): `[`/`]` cycling. */
export function readingOrder(ids: Iterable<number>): number[] {
  return [...ids].filter(id => COUNTRY_LAYOUT[id]).sort((p, q) => {
    const a = COUNTRY_LAYOUT[p]!, b = COUNTRY_LAYOUT[q]!;
    const ra = Math.round(a.cy / 40), rb = Math.round(b.cy / 40);
    return ra - rb || a.cx - b.cx;
  });
}

/** The country whose box contains the map point, if any (hit testing for tap safety). */
export function countryAt(p: Point, pad = 0): number | null {
  for (let i = COUNTRY_LAYOUT.length - 1; i >= 0; i--) {
    const r = padRect(COUNTRY_LAYOUT[i]!.rect, pad);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return COUNTRY_LAYOUT[i]!.id;
  }
  return null;
}

/** Countries among `ids` whose box intersects a circle (map units). */
export function countriesInCircle(c: Point, r: number, ids: Iterable<number>): number[] {
  const out: number[] = [];
  for (const id of ids) {
    const b = COUNTRY_LAYOUT[id]?.rect;
    if (!b) continue;
    const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
    if ((nx - c.x) ** 2 + (ny - c.y) ** 2 <= r * r) out.push(id);
  }
  return out;
}
