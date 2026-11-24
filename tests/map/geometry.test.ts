/**
 * The generated map geometry and the layout derived from it (ui-spec §4.1–§4.5): every country has
 * a box, no boxes overlap, every adjacency has a line, plates clear the boxes, size budgets hold,
 * and the committed file matches its generator.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../../src/data";
import { GEOMETRY } from "../../src/ui/map/geometry.generated";
import {
  adjacencyKey,
  areaRect,
  BOX,
  containsRect,
  COUNTRY_LAYOUT,
  countriesOfSlot,
  JAPAN,
  JAPAN_WRAP,
  LINKS,
  MAP_H,
  MAP_W,
  PLATES,
  REGION_SLOTS,
  rectsOverlap,
  SUPERPOWER_LINKS,
  SUPERPOWER_PLATES,
  type Rect,
} from "../../src/ui/map/layout";

const root = resolve(__dirname, "../..");
const gap = (a: Rect, b: Rect) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));

describe("country boxes", () => {
  it("every country id 0..83 has exactly one box, in id order, inside the map", () => {
    expect(GEOMETRY.countries).toHaveLength(84);
    expect(COUNTRY_LAYOUT).toHaveLength(84);
    GEOMETRY.countries.forEach((c, i) => {
      expect(c.id).toBe(i);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
      const r = COUNTRY_LAYOUT[i]!.rect;
      expect(r.w).toBe(88);
      expect(r.h).toBe(56);
      expect(containsRect({ x: 0, y: 0, w: MAP_W, h: MAP_H }, r)).toBe(true);
    });
    expect(GEOMETRY.viewBox).toEqual([0, 0, 1775, 1090]);
  });

  it("no two boxes overlap, and every pair keeps ≥ 7 u apart (rounding aside)", () => {
    let min = Infinity;
    for (let i = 0; i < 84; i++) {
      for (let j = i + 1; j < 84; j++) {
        const a = COUNTRY_LAYOUT[i]!.rect, b = COUNTRY_LAYOUT[j]!.rect;
        expect(rectsOverlap(a, b), `${COUNTRIES[i]!.engineName} / ${COUNTRIES[j]!.engineName}`).toBe(false);
        min = Math.min(min, gap(a, b));
      }
    }
    expect(min).toBeGreaterThanOrEqual(6.9);
  });

  it("stays recognisably where the board puts it (≤ 60 u from the board position)", () => {
    for (const c of GEOMETRY.countries) {
      const b = GEOMETRY.board[c.id]!;
      expect(Math.hypot(c.x - b.x, c.y - b.y), COUNTRIES[c.id]!.engineName).toBeLessThanOrEqual(60);
    }
  });

  it("knows each box's region slot and name band", () => {
    expect(countriesOfSlot(6).sort((a, b) => a - b)).toEqual([34, 35, 36, 37, 38, 39, 40]);
    expect(countriesOfSlot(1)).toHaveLength(15); // Asia scores Southeast Asia too
    expect(COUNTRY_LAYOUT[13]!.band).toBe("euwe"); // Austria: both halves of Europe
    expect(COUNTRY_LAYOUT[5]!.band).toBe("euwe"); // Finland
    expect(COUNTRY_LAYOUT[14]!.band).toBe("eue");
    expect(COUNTRY_LAYOUT[36]!.band).toBe("sea");
    expect(COUNTRY_LAYOUT[0]!.band).toBe("euw"); // Canada is Western Europe
  });
});

describe("connections", () => {
  it("every adjacency in the data has exactly one line, and nothing else", () => {
    const want = new Set<string>();
    for (const c of COUNTRIES) for (const n of c.neighbours) want.add(adjacencyKey(c.id, n));
    const have = LINKS.map(l => adjacencyKey(l.a, l.b));
    expect(new Set(have).size).toBe(have.length);
    expect(new Set(have)).toEqual(want);
    expect(want.size).toBe(112);
  });

  it("lines run centre to centre and are flagged inter-regional exactly when regions differ", () => {
    for (const l of LINKS) {
      const a = COUNTRY_LAYOUT[l.a]!, b = COUNTRY_LAYOUT[l.b]!;
      expect([l.x1, l.y1, l.x2, l.y2]).toEqual([a.cx, a.cy, b.cx, b.cy]);
      expect(l.inter).toBe(a.info.region !== b.info.region);
    }
    const inter = LINKS.filter(l => l.inter).map(l => adjacencyKey(l.a, l.b)).sort();
    expect(inter).toEqual(["12-22", "25-31", "25-32", "29-51", "30-48", "70-74", "8-47", "9-46"].sort());
  });

  it("superpower adjacency: a line from the plate for each, Japan by the wrap arrows", () => {
    const by = (side: "US" | "USSR") => SUPERPOWER_LINKS.filter(l => l.side === side).map(l => l.country).sort((a, b) => a - b);
    expect(by("US")).toEqual([0, 64, 71]);
    expect(by("USSR")).toEqual([5, 15, 19, 31, 43]);
    for (const c of COUNTRIES) {
      if (!c.superpowerAdjacent) continue;
      const drawn = SUPERPOWER_LINKS.some(l => l.country === c.id && l.side === c.superpowerAdjacent) || c.id === JAPAN;
      expect(drawn, c.engineName).toBe(true);
    }
    const j = COUNTRY_LAYOUT[JAPAN]!;
    expect(JAPAN_WRAP.toUsa.x1).toBe(j.rect.x + j.rect.w);
    expect(JAPAN_WRAP.toUsa.x2).toBeGreaterThan(MAP_W - 10);
    expect(JAPAN_WRAP.toJapan.x1).toBe(SUPERPOWER_PLATES.US.x);
    expect(JAPAN_WRAP.toJapan.x2).toBeLessThan(10);
  });
});

describe("plates", () => {
  const SPEC: Record<number, [number, number]> = { 0: [474, 112], 1: [1446, 470], 2: [1227, 645], 3: [1112, 930], 4: [430, 512], 5: [168, 910], 6: [1356, 784] };

  it("region plates are 196 × 58, ≥ 8 u clear of every box and of each other, ≤ 140 u from the spec spot", () => {
    for (const slot of REGION_SLOTS) {
      const p = PLATES[slot];
      expect([p.w, p.h]).toEqual([196, 58]);
      expect(containsRect({ x: 0, y: 0, w: MAP_W, h: MAP_H }, p)).toBe(true);
      for (const c of COUNTRY_LAYOUT) expect(gap(p, c.rect), `plate ${slot} vs ${c.info.engineName}`).toBeGreaterThanOrEqual(8);
      for (const other of REGION_SLOTS) if (other !== slot) expect(gap(p, PLATES[other])).toBeGreaterThan(0);
      const [sx, sy] = SPEC[slot]!;
      expect(Math.hypot(p.x + p.w / 2 - sx, p.y + p.h / 2 - sy)).toBeLessThanOrEqual(140);
    }
  });

  it("superpower plates (112 × 48) at the spec centres, clear of the boxes", () => {
    expect(SUPERPOWER_PLATES.US).toEqual({ x: 145 - 56, y: 400 - 24, w: 112, h: 48 });
    expect(SUPERPOWER_PLATES.USSR).toEqual({ x: 1111 - 56, y: 242 - 24, w: 112, h: 48 });
    for (const sp of Object.values(SUPERPOWER_PLATES)) for (const c of COUNTRY_LAYOUT) expect(gap(sp, c.rect)).toBeGreaterThanOrEqual(8);
  });

  it("region areas contain their boxes and plate", () => {
    for (const slot of REGION_SLOTS) {
      const area = areaRect(slot);
      for (const id of countriesOfSlot(slot)) expect(containsRect(area, COUNTRY_LAYOUT[id]!.rect)).toBe(true);
      expect(containsRect(area, PLATES[slot])).toBe(true);
    }
    const we = areaRect("WESTERN_EUROPE"), ee = areaRect("EASTERN_EUROPE");
    expect(containsRect(we, COUNTRY_LAYOUT[1]!.rect) && containsRect(ee, COUNTRY_LAYOUT[15]!.rect)).toBe(true);
  });
});

describe("land", () => {
  it("has every land class, as relative path data inside the clip frame", () => {
    const classes = ["neutral", "usa", "ussr", "china", "euw", "eue", "me", "asia", "sea", "af", "ca", "sa"] as const;
    for (const k of classes) {
      const d = GEOMETRY.land[k];
      expect(d.length, k).toBeGreaterThan(100);
      expect(d).toMatch(/^(M-?[\d.]+ -?[\d.]+l[-\d. ]+z)+$/);
      // Walk the path and check every point stays within the clip frame (-24 .. size + 24).
      for (const sub of d.split("z").filter(Boolean)) {
        const [head, rest] = sub.slice(1).split("l");
        let [x, y] = head!.split(" ").map(Number) as [number, number];
        const nums = (rest!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        expect(nums.length % 2).toBe(0);
        for (let i = 0; i < nums.length; i += 2) {
          x += nums[i]!; y += nums[i + 1]!;
          expect(x).toBeGreaterThanOrEqual(-24.5);
          expect(x).toBeLessThanOrEqual(MAP_W + 24.5);
          expect(y).toBeGreaterThanOrEqual(-24.5);
          expect(y).toBeLessThanOrEqual(MAP_H + 24.5);
        }
      }
    }
    expect(GEOMETRY.borders).toMatch(/^(M-?[\d.]+ -?[\d.]+l[-\d. ]+)+$/);
  });

  it("puts each country's real-world land under (or next to) its box: no box floats far out at sea", () => {
    // Coarse check on the board's anchors: the warped land's bounding boxes per class overlap
    // the boxes of their region.
    const bbox = (d: string) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const sub of d.split("z").filter(Boolean)) {
        const [head, rest] = sub.slice(1).split("l");
        let [x, y] = head!.split(" ").map(Number) as [number, number];
        const nums = (rest!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        for (let i = 0; i < nums.length; i += 2) { x += nums[i]!; y += nums[i + 1]!; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const regionLand: Record<number, string> = { 2: GEOMETRY.land.me, 3: GEOMETRY.land.af, 4: GEOMETRY.land.ca, 5: GEOMETRY.land.sa };
    for (const [region, d] of Object.entries(regionLand)) {
      const land = bbox(d);
      for (const c of COUNTRY_LAYOUT.filter(c => c.info.region === Number(region))) {
        const centre = { x: c.cx - 1, y: c.cy - 1, w: 2, h: 2 };
        expect(rectsOverlap({ x: land.x - 60, y: land.y - 60, w: land.w + 120, h: land.h + 120 }, centre), c.info.engineName).toBe(true);
      }
    }
  });
});

describe("budgets and freshness", () => {
  it("the generated geometry file is < 150 KB and the paper texture ≤ 30 KB", () => {
    expect(statSync(resolve(root, "src/ui/map/geometry.generated.ts")).size).toBeLessThan(150 * 1024);
    expect(statSync(resolve(root, "src/ui/map/assets/paper.webp")).size).toBeLessThanOrEqual(30 * 1024);
  });

  it("matches its generator (node scripts/build-map.mjs --check)", () => {
    const out = execFileSync(process.execPath, [resolve(root, "scripts/build-map.mjs"), "--check"], { cwd: root, encoding: "utf8" });
    expect(out).toMatch(/up to date/);
  });

  it("box anatomy constants follow ui-spec §4.3", () => {
    expect(BOX).toMatchObject({ w: 88, h: 56, band: 19, marker: { w: 31, h: 30, y: 22.5, usX: 6, ussrX: 50 }, stab: { x: 70, y: 2, w: 16, h: 15 } });
  });
});
