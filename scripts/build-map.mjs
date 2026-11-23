#!/usr/bin/env node
// Generates the map geometry: src/ui/map/geometry.generated.ts (+ the paper texture
// src/ui/map/assets/paper.webp). Reproducible: same inputs, same output.
//
//   node scripts/build-map.mjs            write both files
//   node scripts/build-map.mjs --check    exit 1 if the committed geometry is stale
//
// Spec: docs/design/ui-spec.md §4.1. Inputs:
//   docs/notes/countries.json             board positions (ref_x/ref_y on the 2448x1584 reference board) + adjacency
//   node_modules/world-atlas/countries-50m.json   Natural Earth 1:50m admin-0 (public domain)
//
// 1. Country boxes: board centres mapped by (x - 30) * 0.75, (y - 60) * 0.75; Europe widened around
//    its board centre; then relaxed so 88x56 boxes keep >= GAP apart, staying close to the board.
// 2. Region plates and superpower plates: the spec's centres, nudged until they clear every box.
// 3. Land: Natural Earth countries merged into the board's land classes (topojson merge), projected
//    with d3-geo (Mercator, antimeridian-clipped), then warped onto the board with a regularised
//    thin-plate spline whose control points put each country's real location under its box (plus
//    anchors that keep the big land masses where the board draws them), clipped, simplified
//    (Douglas-Peucker in map units) and written as relative SVG paths with 1 decimal.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoMercator, geoStream } from "d3-geo";
import { merge, mesh } from "topojson-client";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT = resolve(root, "src/ui/map/geometry.generated.ts");
const TEXTURE = resolve(root, "src/ui/map/assets/paper.webp");
const args = new Set(process.argv.slice(2));

const countries = JSON.parse(readFileSync(resolve(root, "docs/notes/countries.json"), "utf8"));
const world = JSON.parse(readFileSync(resolve(root, "node_modules/world-atlas/countries-50m.json"), "utf8"));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. Country boxes
// ─────────────────────────────────────────────────────────────────────────────────────────────
const S = 0.75, X0 = 30, Y0 = 60;
const BOX_W = 88, BOX_H = 56;
/** Minimum clear space between two boxes (map units). */
const GAP_X = 7, GAP_Y = 7;
const toMap = (x, y) => [(x - X0) * S, (y - Y0) * S];

const pos = countries.map((c) => toMap(c.ref_x, c.ref_y));
// Per-region nudges before the relaxation: Europe gets a little air around its board centre.
for (const c of countries) {
  const p = pos[c.id];
  if (c.region_id === 0 && c.id !== 0) {
    p[0] = 900 * S + (p[0] - 900 * S) * 1.04;
    p[1] = 120 * S + (p[1] - 120 * S) * 1.05;
  }
}
const home = pos.map((p) => [...p]);
for (let it = 0; it < 1200; it++) {
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
      const ox = BOX_W + GAP_X - Math.abs(dx), oy = BOX_H + GAP_Y - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        // Separate along the axis that needs the smaller relative move.
        if (ox / (BOX_W + GAP_X) < oy / (BOX_H + GAP_Y)) {
          const s = (dx >= 0 ? 1 : -1) * ox * 0.5;
          pos[i][0] -= s; pos[j][0] += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * oy * 0.5;
          pos[i][1] -= s; pos[j][1] += s;
        }
      }
    }
  }
  const k = it < 900 ? 0.01 : 0; // spring back towards the board position, then settle
  for (let i = 0; i < pos.length; i++) {
    pos[i][0] += (home[i][0] - pos[i][0]) * k;
    pos[i][1] += (home[i][1] - pos[i][1]) * k;
  }
}

// Superpower plates (board: USA node (255, 530); USSR label 1264..1619 x 285..358).
const spRaw = { US: toMap(232, 540), USSR: toMap(1520, 330) };

// Normalise into the viewBox 0 0 W H (ui-spec §4.1: 1775 x 1090) with a margin.
const M = 26;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [x, y] of [...pos, spRaw.US, spRaw.USSR]) {
  minX = Math.min(minX, x - BOX_W / 2); maxX = Math.max(maxX, x + BOX_W / 2);
  minY = Math.min(minY, y - BOX_H / 2); maxY = Math.max(maxY, y + BOX_H / 2);
}
const W = 1775, H = 1090;
// The spec's frame: content starts M in from the left and M + 10 from the top (the bottom band is
// ocean and plates). Plate centres in ui-spec §4.1 are in this frame.
const OX = minX - M;
const OY = minY - M - 10;
if (maxX - OX > W - M / 2 || maxY - OY > H - M / 2) throw new Error(`boxes overflow the viewBox: ${maxX - OX} x ${maxY - OY}`);
const r1 = (v) => Math.round(v * 10) / 10;
const fin = (p) => [r1(p[0] - OX), r1(p[1] - OY)];
const boxes = pos.map(fin);
const boardHome = home.map(fin);
const sp = { US: fin(spRaw.US), USSR: fin(spRaw.USSR) };
// The spec's superpower plate centres (ui-spec §4.1); the computed ones are within a few units.
sp.US = [145, 400];
sp.USSR = [1111, 242];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. Plates: region plates 196x58, superpower plates 112x48, clear of every box
// ─────────────────────────────────────────────────────────────────────────────────────────────
const PLATE_W = 196, PLATE_H = 58, PLATE_CLEAR = 8, PLATE_REACH = 140;
const SP_W = 112, SP_H = 48;
// RegionSlot order: engine Region 0..5 (EU, ASIA, ME, AF, CA, SA), 6 = Southeast Asia.
const PLATE_SPEC = { 0: [474, 112], 1: [1446, 470], 2: [1227, 645], 3: [1112, 930], 4: [102, 778], 5: [168, 910], 6: [1356, 784] };
const rectGap = (ax, ay, aw, ah, bx, by, bw, bh) => {
  const dx = Math.abs(ax - bx) - (aw + bw) / 2, dy = Math.abs(ay - by) - (ah + bh) / 2;
  return Math.max(dx, dy); // > 0: separated by at least this along one axis
};
const placed = []; // rects already placed (plates), [x, y, w, h]
function clearOfAll(x, y, w, h) {
  let worst = Infinity;
  for (const [bx, by] of boxes) worst = Math.min(worst, rectGap(x, y, w, h, bx, by, BOX_W, BOX_H));
  for (const [px, py, pw, ph] of placed) worst = Math.min(worst, rectGap(x, y, w, h, px, py, pw, ph));
  return worst;
}
function placePlate([x0, y0], w, h) {
  if (clearOfAll(x0, y0, w, h) >= PLATE_CLEAR) return [x0, y0];
  let best = null;
  for (let r = 2; r <= PLATE_REACH && !best; r += 2) {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const x = r1(x0 + r * Math.cos(t)), y = r1(y0 + r * Math.sin(t));
      if (x - w / 2 < 4 || x + w / 2 > W - 4 || y - h / 2 < 4 || y + h / 2 > H - 4) continue;
      if (clearOfAll(x, y, w, h) >= PLATE_CLEAR) { best = [x, y]; break; }
    }
  }
  if (!best) throw new Error(`no clear spot for plate at ${x0},${y0}`);
  return best;
}
const superpowers = {};
for (const side of ["US", "USSR"]) {
  superpowers[side] = placePlate(sp[side], SP_W, SP_H);
  placed.push([...superpowers[side], SP_W, SP_H]);
}
const plates = {};
for (const slot of [0, 2, 1, 6, 3, 4, 5]) {
  plates[slot] = placePlate(PLATE_SPEC[slot], PLATE_W, PLATE_H);
  placed.push([...plates[slot], PLATE_W, PLATE_H]);
}

// Links: every adjacency once, flagged inter-regional.
const links = [];
for (const c of countries) for (const nb of c.neighbours) if (nb > c.id) links.push([c.id, nb, countries[nb].region_id !== c.region_id ? 1 : 0]);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. Land
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Source plane: Mercator in degree units (x = lon, y = -mercator(lat), north up = negative).
const LAT_N = 84, LAT_S = -58;
const proj = geoMercator().scale(180 / Math.PI).translate([0, 0]).precision(0);
proj.clipExtent([proj([-180, LAT_N]), proj([180, LAT_S])]);
const P = (lon, lat) => proj([lon, lat]);

// Real location of each country (lat, lon): the point that should sit under its box.
const LL = {
  0: [48, -70], 1: [53, -1.5], 2: [61, 9], 3: [60, 16], 4: [56, 9.5], 5: [62, 26], 6: [51, 5], 7: [50.5, 8.5],
  8: [46.5, 2.5], 9: [40, -4], 10: [42.5, 12.5], 11: [39.5, 22], 12: [39, 35], 13: [47.5, 14], 14: [52.5, 12.5],
  15: [52, 19.5], 16: [49.5, 17], 17: [47, 19.5], 18: [44, 19.5], 19: [46, 25], 20: [42.7, 25.5],
  21: [33.9, 35.8], 22: [35, 38.5], 23: [31.5, 34.9], 24: [33, 44], 25: [32.5, 54], 26: [31, 36.5], 27: [24.5, 52],
  28: [24, 45], 29: [27, 30], 30: [27, 17], 31: [34, 66], 32: [29, 69], 33: [22, 79], 34: [21, 96],
  35: [17, 104], 36: [15, 101], 37: [14, 108], 38: [4, 102], 39: [-2, 115], 40: [12, 122], 41: [-25, 134],
  42: [23.7, 121], 43: [40, 127], 44: [36, 128], 45: [36, 138], 46: [32, -6], 47: [30, 3], 48: [34, 9.5],
  49: [13, -10], 50: [17, 8], 51: [15, 30], 52: [7.5, -5.5], 53: [9, 8], 54: [9, 39], 55: [6, 46], 56: [5.5, 12.5],
  57: [-3, 23], 58: [0.5, 38], 59: [-12, 17.5], 60: [-19, 30], 61: [-15, 37], 62: [-22, 24], 63: [-30, 25],
  64: [23, -102], 65: [15.5, -90.3], 66: [13.7, -89], 67: [14.8, -86.8], 68: [10, -84], 69: [12.9, -85], 70: [8.5, -80],
  71: [21.5, -79], 72: [19, -72.5], 73: [18.8, -70.3], 74: [4, -73], 75: [-1.5, -78], 76: [-10, -75], 77: [7, -66],
  78: [-17, -64.5], 79: [-10, -50], 80: [-23.4, -58], 81: [-30, -71], 82: [-36, -64], 83: [-33, -56],
};
// Control points [u, v, x, y]: source plane -> map units.
const ctrl = [];
const addCtrl = (lat, lon, x, y) => { const [u, v] = P(lon, lat); ctrl.push([u, v, x, y]); };
for (const c of countries) addCtrl(LL[c.id][0], LL[c.id][1], boxes[c.id][0], boxes[c.id][1]);
// Superpower heartlands under their plates.
addCtrl(39, -98, ...fin(spRaw.US));
addCtrl(56, 62, ...fin(spRaw.USSR));
// Anchors read off the reference board (board px), keeping the big land masses where it draws them.
const boardAnchor = (lat, lon, bx, by) => addCtrl(lat, lon, ...fin(toMap(bx, by)));
boardAnchor(55.7, 37.6, 1400, 250); // Moscow
boardAnchor(63, 100, 1950, 230); boardAnchor(66, 140, 2250, 190); boardAnchor(47, 104, 1980, 450);
boardAnchor(35, 105, 1990, 640); boardAnchor(48, 67, 1640, 470); boardAnchor(72, 60, 1600, 40);
boardAnchor(70, -40, 690, 60); boardAnchor(64, -150, 40, 150); boardAnchor(37, -122, 30, 520); boardAnchor(41, -74, 470, 470);
boardAnchor(60, -95, 260, 260); boardAnchor(-54, -68, 520, 1530); boardAnchor(-34.5, 18.5, 1160, 1400);
boardAnchor(-41, 174, 2400, 1420); boardAnchor(-20, 75, 1700, 1250); boardAnchor(65, -18, 760, 150);
boardAnchor(25, 130, 2250, 800); boardAnchor(-5, 145, 2320, 1060);

// Far field: a least-squares affine fit of the control points, sampled on a frame around the world.
function solve(A, b) {
  const n = b.length; const Mx = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r;
    [Mx[c], Mx[p]] = [Mx[p], Mx[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = Mx[r][c] / Mx[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) Mx[r][k] -= f * Mx[c][k];
    }
  }
  return Mx.map((r, i) => r[n] / r[i]);
}
function affineFit(pts) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const [u, v, x, y] of pts) {
    const r = [u, v, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; bx[i] += r[i] * x; by[i] += r[i] * y; }
  }
  return [solve(A.map((r) => [...r]), bx), solve(A.map((r) => [...r]), by)];
}
const [ax, ay] = affineFit(ctrl);
const aff = (u, v) => [ax[0] * u + ax[1] * v + ax[2], ay[0] * u + ay[1] * v + ay[2]];
for (let lon = -180; lon <= 180; lon += 30) for (const lat of [LAT_N, LAT_S - 4]) { const [u, v] = P(lon, lat); ctrl.push([u, v, ...aff(u, v)]); }
for (let lat = -60; lat <= 80; lat += 20) for (const lon of [-180, 180]) { const [u, v] = P(lon, lat); ctrl.push([u, v, ...aff(u, v)]); }

// Regularised thin-plate spline (Bookstein), lambda trades exactness for smoothness.
const LAMBDA = 30;
const U = (r2) => (r2 === 0 ? 0 : r2 * Math.log(Math.sqrt(r2)));
const n = ctrl.length;
const K = Array.from({ length: n + 3 }, () => new Array(n + 3).fill(0));
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    const du = ctrl[i][0] - ctrl[j][0], dv = ctrl[i][1] - ctrl[j][1];
    K[i][j] = U(du * du + dv * dv) + (i === j ? LAMBDA : 0);
  }
  K[i][n] = 1; K[i][n + 1] = ctrl[i][0]; K[i][n + 2] = ctrl[i][1];
  K[n][i] = 1; K[n + 1][i] = ctrl[i][0]; K[n + 2][i] = ctrl[i][1];
}
const wx = solve(K.map((r) => [...r]), [...ctrl.map((c) => c[2]), 0, 0, 0]);
const wy = solve(K.map((r) => [...r]), [...ctrl.map((c) => c[3]), 0, 0, 0]);
function warp(u, v) {
  let x = wx[n] + wx[n + 1] * u + wx[n + 2] * v, y = wy[n] + wy[n + 1] * u + wy[n + 2] * v;
  for (let i = 0; i < n; i++) {
    const du = u - ctrl[i][0], dv = v - ctrl[i][1], k = U(du * du + dv * dv);
    x += wx[i] * k; y += wy[i] * k;
  }
  return [x, y];
}

// Land classes (ISO 3166 numeric) -> --ts-land-* tokens. Everything not listed is Africa or dropped.
const CLASS = {};
const put = (cls, ids) => ids.forEach((id) => (CLASS[id] = cls));
put("euw", ["826", "372", "578", "752", "208", "246", "056", "528", "442", "276", "250", "724", "620", "380", "300", "792",
  "040", "756", "352", "196", "124", "470", "438", "492", "674", "336", "020", "234", "833", "831", "832", "248", "666"]);
put("eue", ["616", "203", "703", "348", "688", "191", "070", "705", "499", "807", "008", "642", "100"]);
put("ussr", ["643", "804", "112", "440", "428", "233", "498", "268", "051", "031", "398", "860", "795", "417", "762", "496"]);
put("me", ["422", "760", "376", "275", "368", "364", "400", "784", "634", "414", "512", "682", "887", "818", "434", "048"]);
put("asia", ["004", "586", "356", "050", "064", "524", "144", "408", "410", "392", "158", "036", "554", "598", "090", "548", "540", "462"]);
put("sea", ["104", "418", "116", "764", "704", "458", "360", "608", "096", "626", "702"]);
put("china", ["156", "344", "446"]);
put("ca", ["484", "320", "084", "222", "340", "558", "188", "591", "192", "332", "214", "388", "044", "630", "780", "136",
  "796", "850", "092", "660", "659", "028", "500", "212", "662", "670", "052", "308", "533", "531", "534", "663", "652"]);
put("sa", ["170", "218", "604", "862", "068", "076", "600", "152", "032", "858", "328", "740", "238", "254"]);
put("usa", ["840", "060"]);
put("neutral", ["304"]);
const DROP = new Set(["010", "260", "239", "334", "574", "036-ashmore", "086", "654", "612", "258", "876", "882", "016", "184", "570",
  "776", "296", "520", "584", "583", "580", "316", "585", "242", "690", "480", "132", "678"]);
const NAME_CLASS = { "Kosovo": "eue", "N. Cyprus": "euw", "Somaliland": "af", "Siachen Glacier": "asia", "Indian Ocean Ter.": null };
const geoms = world.objects.countries.geometries;
function classOf(g) {
  if (!g.id) return NAME_CLASS[g.properties?.name] ?? null;
  if (g.id === "036" && g.properties?.name !== "Australia") return null; // Ashmore and Cartier Is.
  if (DROP.has(g.id)) return null;
  return CLASS[g.id] ?? "af";
}
const ORDER = ["neutral", "usa", "ussr", "china", "euw", "eue", "me", "asia", "sea", "af", "ca", "sa"];

/** Run a GeoJSON geometry through the projection (clipping included) and collect rings/lines. */
function projected(geometry) {
  const out = []; let cur = null;
  const sink = {
    point(x, y) { cur.push([x, y]); },
    lineStart() { cur = []; },
    lineEnd() { if (cur.length > 1) out.push(cur); cur = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  };
  geoStream(geometry, proj.stream(sink));
  return out;
}
/** Insert points so no source-plane segment is longer than `step` (the warp is non-linear). */
function densify(pts, closed, step = 0.35) {
  const out = [];
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.floor(d / step);
    for (let s = 1; s < k; s++) out.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}
// Clip a closed ring to the rectangle (Sutherland-Hodgman, one edge at a time).
const CLIP = { x0: -24, y0: -24, x1: W + 24, y1: H + 24 };
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= CLIP.x0, (p) => p[0] <= CLIP.x1, (p) => p[1] >= CLIP.y0, (p) => p[1] <= CLIP.y1,
  ];
  const cut = [
    (a, b) => { const t = (CLIP.x0 - a[0]) / (b[0] - a[0]); return [CLIP.x0, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (CLIP.x1 - a[0]) / (b[0] - a[0]); return [CLIP.x1, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (CLIP.y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), CLIP.y0]; },
    (a, b) => { const t = (CLIP.y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), CLIP.y1]; },
  ];
  let pts = ring;
  for (let e = 0; e < 4 && pts.length; e++) {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ina = edges[e](a), inb = edges[e](b);
      if (ina) res.push(a);
      if (ina !== inb) res.push(cut[e](a, b));
    }
    pts = res;
  }
  return pts;
}
const inside = (p) => p[0] >= CLIP.x0 && p[0] <= CLIP.x1 && p[1] >= CLIP.y0 && p[1] <= CLIP.y1;
/** Douglas-Peucker on an open polyline (iterative). */
function simplifyLine(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]]; const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax_, ay_] = pts[a], [bx_, by_] = pts[b];
    const dx = bx_ - ax_, dy = by_ - ay_, L2 = dx * dx + dy * dy;
    let worst = -1, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2;
      if (L2 === 0) d2 = (px - ax_) ** 2 + (py - ay_) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax_) * dx + (py - ay_) * dy) / L2));
        d2 = (px - ax_ - t * dx) ** 2 + (py - ay_ - t * dy) ** 2;
      }
      if (d2 > worst) { worst = d2; wi = i; }
    }
    if (worst > t2) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(ring, tol) {
  // Split at the point farthest from the first so both halves are open polylines.
  let far = 0, fd = -1;
  for (let i = 1; i < ring.length; i++) { const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = simplifyLine(ring.slice(0, far + 1), tol);
  const b = simplifyLine([...ring.slice(far), ring[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

const TOL = 0.45; // map units (a box is 88 wide)
const MIN_AREA = 14; // drop specks (u^2)
const fmt = (v) => { const s = (Math.round(v * 10) / 10).toFixed(1); return s.endsWith(".0") ? s.slice(0, -2) : s; };
/** Relative SVG path: M x y l dx dy dx dy ... z, deltas from rounded absolutes (no drift). */
function encode(pts, closed) {
  let out = "", px = 0, py = 0;
  const q = pts.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
  const dedup = q.filter((p, i) => i === 0 || p[0] !== q[i - 1][0] || p[1] !== q[i - 1][1]);
  dedup.forEach(([x, y], i) => {
    if (i === 0) { out += "M" + fmt(x / 10) + " " + fmt(y / 10) + "l"; px = x; py = y; return; }
    const dx = fmt((x - px) / 10), dy = fmt((y - py) / 10);
    out += (i === 1 || dx.startsWith("-") ? "" : " ") + dx + (dy.startsWith("-") ? "" : " ") + dy;
    px = x; py = y;
  });
  return dedup.length < 2 ? "" : out + (closed ? "z" : "");
}

const land = {};
let ringCount = 0;
for (const cls of ORDER) {
  const members = geoms.filter((g) => classOf(g) === cls);
  if (!members.length) continue;
  const geom = merge(world, members);
  let d = "";
  for (const ring of projected(geom)) {
    const closedRing = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    if (closedRing.length < 3) continue;
    let pts = densify(closedRing, true).map(([u, v]) => warp(u, v));
    pts = clipRing(pts);
    if (pts.length < 3) continue;
    pts = simplifyRing(pts, TOL);
    if (pts.length < 3 || Math.abs(area(pts)) < MIN_AREA) continue;
    d += encode(pts, true);
    ringCount++;
  }
  land[cls] = d;
}

// Internal borders between countries of the same land class (class edges are the land strokes).
const borderMesh = mesh(world, world.objects.countries, (a, b) => a !== b && classOf(a) !== null && classOf(a) === classOf(b));
let borders = "";
for (const line of projected(borderMesh)) {
  let pts = densify(line, false).map(([u, v]) => warp(u, v));
  // Keep only runs inside the clip rectangle.
  let run = [];
  const flush = () => { if (run.length > 1) { const s = simplifyLine(run, TOL * 1.4); if (s.length > 1) borders += encode(s, false); } run = []; };
  for (const p of pts) { if (inside(p)) run.push(p); else flush(); }
  flush();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────────────────────
const geometry = {
  viewBox: [0, 0, W, H],
  box: { w: BOX_W, h: BOX_H },
  countries: countries.map((c) => ({ id: c.id, x: boxes[c.id][0], y: boxes[c.id][1] })),
  board: countries.map((c) => ({ id: c.id, x: boardHome[c.id][0], y: boardHome[c.id][1] })),
  superpowers: { US: { x: superpowers.US[0], y: superpowers.US[1] }, USSR: { x: superpowers.USSR[0], y: superpowers.USSR[1] } },
  plates: Object.fromEntries(Object.entries(plates).sort((a, b) => a[0] - b[0]).map(([k, [x, y]]) => [k, { x, y }])),
  links,
  land,
  borders,
};

const header = `// GENERATED by scripts/build-map.mjs from docs/notes/countries.json and Natural Earth 1:50m
// (world-atlas, public domain). Do not edit by hand: change the generator and run
// \`node scripts/build-map.mjs\`. Spec: docs/design/ui-spec.md §4.1.

/** Land classes, painted with the --ts-land-<class> tokens. */
export type LandClass = ${ORDER.map((c) => JSON.stringify(c)).join(" | ")};

export interface MapGeometry {
  /** SVG viewBox [x, y, w, h] in map units ("u"). */
  readonly viewBox: readonly [number, number, number, number];
  /** Country box size (u); boxes are centred on their position. */
  readonly box: { readonly w: 88; readonly h: 56 };
  /** Box centre of each country, index = engine country id 0..83. */
  readonly countries: readonly { readonly id: number; readonly x: number; readonly y: number }[];
  /** Where the reference board puts each box (same space, before de-cluttering). Tests only. */
  readonly board: readonly { readonly id: number; readonly x: number; readonly y: number }[];
  /** Superpower plate centres (plates are 112 x 48 u). */
  readonly superpowers: { readonly US: { readonly x: number; readonly y: number }; readonly USSR: { readonly x: number; readonly y: number } };
  /** Region plate centres by RegionSlot (0..5 engine Region, 6 = Southeast Asia); plates are 196 x 58 u. */
  readonly plates: Readonly<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { readonly x: number; readonly y: number }>>;
  /** Every adjacency once: [a, b, inter-regional ? 1 : 0], a < b. */
  readonly links: readonly (readonly [number, number, 0 | 1])[];
  /** Land masses per class as relative SVG path data. */
  readonly land: Readonly<Record<LandClass, string>>;
  /** Country borders inside a land class (open path data). */
  readonly borders: string;
}
`;
const body = `\nexport const GEOMETRY: MapGeometry = ${JSON.stringify(geometry)};\n`;
const text = header + body;

if (args.has("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) { console.error("geometry.generated.ts is stale: run node scripts/build-map.mjs"); process.exit(1); }
  console.log("geometry.generated.ts is up to date");
  process.exit(0);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, text);

let maxShift = 0, sumShift = 0;
for (let i = 0; i < boxes.length; i++) { const s = Math.hypot(boxes[i][0] - boardHome[i][0], boxes[i][1] - boardHome[i][1]); maxShift = Math.max(maxShift, s); sumShift += s; }
const landBytes = Object.values(land).reduce((a, s) => a + s.length, 0);
console.log({
  out: OUT, bytes: text.length, landBytes, borderBytes: borders.length, rings: ringCount,
  maxShift: r1(maxShift), meanShift: r1(sumShift / boxes.length), ctrl: ctrl.length, plates, superpowers,
});

// ── Paper grain texture (tileable value noise, neutral grey on white, multiplied at ~7 %) ──────
await writeTexture();
async function writeTexture() {
  const { default: sharp } = await import("sharp");
  const N = 256;
  let seed = 0x2f6b9d3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const buf = new Float32Array(N * N);
  // Octaves of periodic value noise (lattice sizes divide N, so the tile wraps seamlessly).
  for (const [cells, amp] of [[8, 0.35], [32, 0.3], [64, 0.2], [256, 0.15]]) {
    const lat = Array.from({ length: cells * cells }, rnd);
    const step = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = x / step, gy = y / step, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (i, j) => lat[((j % cells) * cells) + (i % cells)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
      buf[y * N + x] += (a + (b - a) * sy) * amp;
    }
  }
  const px = Buffer.alloc(N * N);
  for (let i = 0; i < N * N; i++) px[i] = Math.max(0, Math.min(255, Math.round(255 - buf[i] * 120)));
  mkdirSync(dirname(TEXTURE), { recursive: true });
  const webp = await sharp(px, { raw: { width: N, height: N, channels: 1 } }).webp({ quality: 55, effort: 6 }).toBuffer();
  writeFileSync(TEXTURE, webp);
  console.log({ texture: TEXTURE, bytes: webp.length });
}
