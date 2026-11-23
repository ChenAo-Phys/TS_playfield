// Generates board-data.js for the situation-room mockup (design artefact, not production code).
//
//   node docs/design/mockup-situation-room-assets/build-board.mjs
//
// 1. Country box centres: docs/notes/countries.json ref_x/ref_y (2448x1584 reference board), scaled by S,
//    then relaxed so that larger boxes (BOX_W x BOX_H + GAP) never overlap while staying close to the board.
// 2. Placeholder continents: Natural Earth 110m (world-atlas, public domain) warped with a thin-plate spline
//    so that each country's real location lands under its box. The production map is redrawn by the map
//    agent; this only makes the mockup read as a world map.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const countries = JSON.parse(readFileSync(resolve(root, "docs/notes/countries.json"), "utf8"));
const cardsMeta = JSON.parse(readFileSync(resolve(root, "docs/notes/cards_meta.json"), "utf8"));
const world = JSON.parse(readFileSync(resolve(root, "node_modules/world-atlas/countries-110m.json"), "utf8"));

// ── layout ────────────────────────────────────────────────────────────────────────────────────
const S = 0.75, X0 = 30, Y0 = 60;
const BOX_W = 88, BOX_H = 56, GAP_X = 7, GAP_Y = 7;
const toSR = (x, y) => [(x - X0) * S, (y - Y0) * S];

const pos = countries.map((c) => toSR(c.ref_x, c.ref_y));
const home = pos.map((p) => [...p]);
// Gentle per-region nudges before relaxation (gives Europe a little air, pulls SE Asia in).
for (const c of countries) {
  const p = pos[c.id];
  if (c.region_id === 0 && c.id !== 0) { p[0] = 900 * S + (p[0] - 900 * S) * 1.04; p[1] = 120 * S + (p[1] - 120 * S) * 1.05; }
}
for (let it = 0; it < 900; it++) {
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
      const ox = BOX_W + GAP_X - Math.abs(dx), oy = BOX_H + GAP_Y - Math.abs(dy);
      if (ox > 0 && oy > 0) {
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
  const k = it < 700 ? 0.01 : 0;
  for (let i = 0; i < pos.length; i++) {
    pos[i][0] += (home[i][0] - pos[i][0]) * k;
    pos[i][1] += (home[i][1] - pos[i][1]) * k;
  }
}
// Superpower seals (board: USA node 255,530; USSR label 1264-1619 x 285-358).
const sp = { US: toSR(232, 540), USSR: toSR(1520, 330) };

// Normalise into a viewBox with a margin.
const M = 26;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [x, y] of [...pos, sp.US, sp.USSR]) {
  minX = Math.min(minX, x - BOX_W / 2); maxX = Math.max(maxX, x + BOX_W / 2);
  minY = Math.min(minY, y - BOX_H / 2); maxY = Math.max(maxY, y + BOX_H / 2);
}
const OX = minX - M, OY = minY - M - 10;
const W = Math.round(maxX - minX + 2 * M), H = Math.round(maxY - minY + 2 * M + 10);
const fin = (p) => [Math.round((p[0] - OX) * 10) / 10, Math.round((p[1] - OY) * 10) / 10];
const finalPos = pos.map(fin);
sp.US = fin(sp.US); sp.USSR = fin(sp.USSR);

// ── thin-plate spline warp of the real world onto the board ─────────────────────────────────────
const LL = {
  0: [47, -72], 1: [53, -1.5], 2: [61, 9], 3: [60, 16], 4: [56, 9.5], 5: [62, 26], 6: [51, 5], 7: [50.5, 8.5],
  8: [46.5, 2.5], 9: [40, -4], 10: [42.5, 12.5], 11: [39.5, 22], 12: [39, 35], 13: [47.5, 14], 14: [52.5, 12.5],
  15: [52, 19.5], 16: [49.5, 17], 17: [47, 19.5], 18: [44, 19.5], 19: [46, 25], 20: [42.7, 25.5],
  21: [33.9, 35.8], 22: [35, 38.5], 23: [31.5, 34.9], 24: [33, 44], 25: [32.5, 54], 26: [31, 36.5], 27: [24.5, 52],
  28: [24, 45], 29: [27, 30], 30: [27, 17], 31: [34, 66], 32: [29, 69], 33: [22, 79], 34: [21, 96],
  35: [19, 103], 36: [14.5, 100.5], 37: [14, 108], 38: [4, 102], 39: [-3, 115], 40: [12, 122], 41: [-25, 134],
  42: [23.7, 121], 43: [40, 127], 44: [36, 128], 45: [36, 138], 46: [32, -6], 47: [30, 3], 48: [34, 9.5],
  49: [13, -10], 50: [17, 8], 51: [15, 30], 52: [7.5, -5.5], 53: [9, 8], 54: [9, 39], 55: [6, 46], 56: [5.5, 12.5],
  57: [-3, 23], 58: [0.5, 38], 59: [-12, 17.5], 60: [-19, 30], 61: [-15, 37], 62: [-22, 24], 63: [-30, 25],
  64: [23, -102], 65: [15.5, -90.3], 66: [13.7, -89], 67: [14.8, -86.8], 68: [10, -84], 69: [12.9, -85], 70: [8.5, -80],
  71: [21.5, -79], 72: [19, -72.5], 73: [18.8, -70.3], 74: [4, -73], 75: [-1.5, -78], 76: [-10, -75], 77: [7, -66],
  78: [-17, -64.5], 79: [-10, -50], 80: [-23.4, -58], 81: [-30, -71], 82: [-36, -64], 83: [-33, -56],
};
const ctrl = []; // [lon, lat, x, y]
for (const c of countries) ctrl.push([LL[c.id][1], LL[c.id][0], ...finalPos[c.id]]);
ctrl.push([-98, 39, ...sp.US]);
ctrl.push([62, 56, ...sp.USSR]);
// Extra anchors in board space (reference px -> SR), so the land masses keep a sensible shape.
const refAnchor = (lat, lon, rx, ry) => { const p = fin(toSR(rx, ry)); ctrl.push([lon, lat, p[0], p[1]]); };
refAnchor(55.7, 37.6, 1400, 250); // Moscow
refAnchor(63, 100, 1950, 230); refAnchor(66, 140, 2250, 190); refAnchor(47, 104, 1980, 450);
refAnchor(35, 105, 1990, 640); refAnchor(48, 67, 1640, 470); refAnchor(72, 60, 1600, 40);
refAnchor(70, -40, 690, 60); refAnchor(64, -150, 40, 150); refAnchor(37, -122, 30, 520); refAnchor(41, -74, 470, 470);
refAnchor(60, -95, 260, 260); refAnchor(-54, -68, 520, 1530); refAnchor(-34.5, 18.5, 1160, 1400);
refAnchor(-41, 174, 2400, 1420); refAnchor(-20, 75, 1700, 1250); refAnchor(65, -18, 760, 150);
refAnchor(25, 130, 2250, 800); refAnchor(-5, 145, 2320, 1060);

// Global affine fit (least squares) for far-field anchors.
function affineFit(pts) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const [u, v, x, y] of pts) {
    const r = [u, v, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; bx[i] += r[i] * x; by[i] += r[i] * y; }
  }
  return [solve(A.map((r) => [...r]), bx), solve(A.map((r) => [...r]), by)];
}
function solve(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const [ax, ay] = affineFit(ctrl);
const aff = (u, v) => [ax[0] * u + ax[1] * v + ax[2], ay[0] * u + ay[1] * v + ay[2]];
for (let lon = -180; lon <= 180; lon += 30) for (const lat of [84, -62]) ctrl.push([lon, lat, ...aff(lon, lat)]);
for (let lat = -60; lat <= 80; lat += 20) for (const lon of [-180, 180]) ctrl.push([lon, lat, ...aff(lon, lat)]);

const U = (r2) => (r2 === 0 ? 0 : r2 * Math.log(Math.sqrt(r2)));
const n = ctrl.length, LAMBDA = 30;
const K = [];
for (let i = 0; i < n + 3; i++) K.push(new Array(n + 3).fill(0));
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

const CLASS = {};
const put = (cls, ids) => ids.forEach((id) => (CLASS[id] = cls));
put("euw", ["826", "372", "578", "752", "208", "246", "056", "528", "442", "276", "250", "724", "620", "380", "300", "792", "040", "756", "352", "196"]);
put("eue", ["616", "203", "703", "348", "688", "191", "070", "705", "499", "807", "008", "642", "100"]);
put("ussr", ["643", "804", "112", "440", "428", "233", "498", "268", "051", "031", "398", "860", "795", "417", "762", "496"]);
put("me", ["422", "760", "376", "275", "368", "364", "400", "784", "634", "414", "512", "682", "887", "818", "434"]);
put("asia", ["004", "586", "356", "050", "064", "524", "144", "408", "410", "392", "158", "036", "554", "598", "090", "548", "540", "242"]);
put("sea", ["104", "418", "116", "764", "704", "458", "360", "608", "096", "626"]);
put("china", ["156"]);
put("ca", ["484", "320", "084", "222", "340", "558", "188", "591", "192", "332", "214", "388", "044", "630", "780"]);
put("sa", ["170", "218", "604", "862", "068", "076", "600", "152", "032", "858", "328", "740", "238"]);
put("usa", ["840"]);
put("na", ["124", "304"]);
const DROP = new Set(["010", "260"]);

const geo = feature(world, world.objects.countries);
const paths = {};
const fmt = (v) => (Math.round(v * 10) / 10).toString();
function ringPath(ring) {
  const pts = [];
  for (let i = 0; i < ring.length; i++) {
    const [u0, v0] = ring[i];
    pts.push([u0, v0]);
    const nx = ring[(i + 1) % ring.length];
    if (!nx) continue;
    const d = Math.hypot(nx[0] - u0, nx[1] - v0);
    if (d > 180) continue; // antimeridian jump
    const steps = Math.floor(d / 1.2);
    for (let s = 1; s < steps; s++) pts.push([u0 + ((nx[0] - u0) * s) / steps, v0 + ((nx[1] - v0) * s) / steps]);
  }
  let out = "", last = null;
  for (const [u, v] of pts) {
    if (v < -58) continue;
    const [x, y] = warp(u, v);
    const s = fmt(x) + " " + fmt(y);
    if (s === last) continue;
    out += (out ? "L" : "M") + s; last = s;
  }
  return out ? out + "Z" : "";
}
for (const f of geo.features) {
  const id = f.id ?? (f.properties.name === "Kosovo" ? "-k" : f.properties.name === "N. Cyprus" ? "196" : f.properties.name === "Somaliland" ? "706" : null);
  if (id && DROP.has(id)) continue;
  let cls = CLASS[id];
  if (f.properties.name === "Kosovo") cls = "eue";
  if (!cls) cls = "af";
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) {
    // skip tiny rings far in the Pacific (Fiji etc. wrap issues)
    if (ring.some((p) => p[0] > 179 || p[0] < -179)) continue;
    paths[cls] = (paths[cls] || "") + ringPath(ring);
  }
}

// ── output ───────────────────────────────────────────────────────────────────────────────────
const ZH_SHORT = { 9: "西葡", 35: "老挝柬埔寨", 61: "东南非诸国", 73: "多米尼加", 16: "捷克斯洛伐克" };
const EN_SHORT = {
  1: "UK", 7: "W. Germany", 9: "Spain/Port.", 14: "E. Germany", 16: "Czechoslov.", 27: "Gulf States", 28: "Saudi Arabia",
  35: "Laos/Camb.", 43: "N. Korea", 44: "S. Korea", 49: "W. Afr. States", 50: "Saharan St.", 61: "SE Afr. St.",
  63: "S. Africa", 73: "Dominican R.",
};
const sub = (c) => (c.subregions.includes("Southeast Asia") ? "sea" : c.subregions.includes("Western Europe") && c.subregions.includes("Eastern Europe") ? "euwe" : c.subregions.includes("Western Europe") ? "euw" : c.subregions.includes("Eastern Europe") ? "eue" : null);
const regionKey = ["eu", "asia", "me", "af", "ca", "sa"];
const outCountries = countries.map((c) => ({
  id: c.id, en: c.name, enShort: EN_SHORT[c.id] ?? c.name, zh: c.name_zh, zhShort: ZH_SHORT[c.id] ?? c.name_zh,
  region: regionKey[c.region_id], sub: sub(c), stab: c.stability, bg: c.battleground,
  sp: c.superpower_adjacent === "USA" ? "US" : c.superpower_adjacent, x: finalPos[c.id][0], y: finalPos[c.id][1],
}));
const edges = [];
for (const c of countries) for (const nb of c.neighbours) if (nb > c.id) edges.push([c.id, nb, countries[nb].region_id !== c.region_id ? 1 : 0]);
const cards = cardsMeta.map((c) => ({ id: c.id, en: c.title_en, zh: c.title_zh, ops: c.ops, side: c.side, era: c.era, star: c.starred, scoring: c.scoring }));
const data = { W, H, box: { w: BOX_W, h: BOX_H }, sp, countries: outCountries, edges, land: paths, cards };
writeFileSync(resolve(here, "board-data.js"), "// Generated by build-board.mjs. Do not edit.\nwindow.SR_BOARD = " + JSON.stringify(data) + ";\n");
let moved = 0; for (let i = 0; i < pos.length; i++) moved = Math.max(moved, Math.hypot(pos[i][0] - home[i][0], pos[i][1] - home[i][1]));
console.log({ W, H, maxShift: Math.round(moved), ctrl: ctrl.length, bytes: JSON.stringify(data).length });
