#!/usr/bin/env python3
"""Build docs/notes/countries.json from DeepStruggle's sources (read-only) plus our reference-board
measurements.

Sources (all read-only):
  DS/engine/src/map_data.cpp                       -- the engine's COUNTRIES table (ground truth)
  DS/rules/map.json                                -- spec copy; region names, subregions, neighbours by name, `pos`
  DS/web/ui/src/map_view.ts                        -- SHORT_NAMES, REGION_STYLE (band colours)
  DS/web/ui/src/i18n/locales/zh-CN/game.json       -- Chinese country / region names (by engine id)
  <scratchpad>/ref_boxes.json                      -- country boxes measured on game_resources/TS_map.jpg

Usage: python3 build_countries.py <DS root> <ref_boxes.json> <out countries.json>
"""
import json
import re
import sys

DS, REF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

REGION_ENUM = {"EUROPE": 0, "ASIA": 1, "MIDDLE_EAST": 2, "AFRICA": 3, "CENTRAL_AMERICA": 4, "SOUTH_AMERICA": 5}
REGION_NAME = {0: "Europe", 1: "Asia", 2: "Middle East", 3: "Africa", 4: "Central America", 5: "South America"}
SP = {"US": "USA", "USSR": "USSR", "NONE": None}

# ---- 1. engine table -------------------------------------------------------------------------
cpp = open(f"{DS}/engine/src/map_data.cpp", encoding="utf-8").read()
row = re.compile(
    r'\{(\d+), "([^"]+)", (\d), (true|false), Region::(\w+), (true|false), (true|false), (true|false), '
    r'Player::(\w+), (\d), \{([\d,]+)\}')
engine = {}
for m in row.finditer(cpp):
    cid = int(m[1]); n = int(m[10])
    nb = [int(x) for x in m[11].split(",")][:n]
    engine[cid] = dict(id=cid, name=m[2], stability=int(m[3]), battleground=m[4] == "true",
                       region_id=REGION_ENUM[m[5]], western_europe=m[6] == "true", eastern_europe=m[7] == "true",
                       southeast_asia=m[8] == "true", superpower_adjacent=SP[m[9]], neighbours=nb)
assert sorted(engine) == list(range(84)), "engine table did not parse to 84 rows"

# ---- 2. rules/map.json -----------------------------------------------------------------------
mj = json.load(open(f"{DS}/rules/map.json", encoding="utf-8"))
spec = {c["id"]: c for c in mj["countries"]}
by_name = {c["name"]: c["id"] for c in mj["countries"]}

# ---- 3. map_view.ts constants ----------------------------------------------------------------
ts = open(f"{DS}/web/ui/src/map_view.ts", encoding="utf-8").read()
short_block = ts[ts.index("const SHORT_NAMES"):]
short_block = short_block[:short_block.index("};")]
SHORT = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', short_block))
style_block = ts[ts.index("export const REGION_STYLE"):]
style_block = style_block[:style_block.index("};")]
STYLE = {k: {"band": b, "accent": a} for k, b, a in
         re.findall(r'"([^"]+)":\s*\{\s*band:\s*"([^"]+)",\s*accent:\s*"([^"]+)"', style_block)}

# ---- 4. zh-CN names --------------------------------------------------------------------------
zh = json.load(open(f"{DS}/web/ui/src/i18n/locales/zh-CN/game.json", encoding="utf-8"))

# ---- 5. reference board boxes ----------------------------------------------------------------
ref = {int(k): v for k, v in json.load(open(REF)).items()}

# ---- cross-checks (fail loudly) --------------------------------------------------------------
problems = []
for cid, e in engine.items():
    s = spec[cid]
    if s["name"] != e["name"]: problems.append(f"{cid}: name {s['name']!r} vs engine {e['name']!r}")
    if s["stability"] != e["stability"]: problems.append(f"{cid}: stability")
    if s["battleground"] != e["battleground"]: problems.append(f"{cid}: battleground")
    if s["region"] != REGION_NAME[e["region_id"]]: problems.append(f"{cid}: region")
    if s["superpower_adjacent"] != e["superpower_adjacent"]: problems.append(f"{cid}: superpower")
    if sorted(by_name[n] for n in s["neighbours"]) != sorted(e["neighbours"]): problems.append(f"{cid}: neighbours")
    subs = set(s.get("subregions") or [])
    want = {x for x, f in (("Western Europe", e["western_europe"]), ("Eastern Europe", e["eastern_europe"]),
                            ("Southeast Asia", e["southeast_asia"])) if f}
    if subs != want: problems.append(f"{cid}: subregions {subs} vs {want}")
    for n in e["neighbours"]:
        if cid not in engine[n]["neighbours"]: problems.append(f"{cid}->{n} not symmetric")
print("cross-check problems:", problems or "none")

out = []
for cid in range(84):
    e, s, r = engine[cid], spec[cid], ref.get(cid)
    region = REGION_NAME[e["region_id"]]
    subs = [x for x, f in (("Western Europe", e["western_europe"]), ("Eastern Europe", e["eastern_europe"]),
                           ("Southeast Asia", e["southeast_asia"])) if f]
    out.append({
        "id": cid,
        "name": e["name"],                                   # engine name == key of state.countries
        "short_name_en": SHORT.get(e["name"]),               # map_view.ts SHORT_NAMES (null = use name)
        "name_zh": zh["countries"][str(cid)],                # DS zh-CN game.json countries.<id>
        "region": region,
        "region_id": e["region_id"],                         # ts::Region enum value
        "region_zh": zh["regions"][region],
        "subregions": subs,
        "stability": e["stability"],
        "battleground": e["battleground"],
        "superpower_adjacent": e["superpower_adjacent"],     # "USA" | "USSR" | null
        "neighbours": sorted(e["neighbours"]),
        "neighbour_names": [engine[n]["name"] for n in sorted(e["neighbours"])],
        "inter_region_neighbours": sorted(n for n in e["neighbours"] if engine[n]["region_id"] != e["region_id"]),
        "coup_target": 2 * e["stability"],                   # die + ops must beat this
        "ds_pos": s["pos"],                                  # map.json pos, map_view.ts box centre, viewBox 0 0 1000 650
        "ds_band_color": (STYLE["Southeast Asia"] if "Southeast Asia" in subs else STYLE[region])["band"],
        "ref_x": r["cx"] if r else None,                     # centre of the whole box (name strip + influence area)
        "ref_y": r["cy"] if r else None,                     # on TS_map.jpg, 2448x1584 px
        "ref_box": [r["left"], r["top"], r["right"], r["bottom"]] if r else None,
    })

edges = {tuple(sorted((c["id"], n))) for c in out for n in c["neighbours"]}
inter = {e for e in edges if engine[e[0]]["region_id"] != engine[e[1]]["region_id"]}
print("countries", len(out), "edges", len(edges), "inter-region edges", len(inter),
      sorted((engine[a]["name"], engine[b]["name"]) for a, b in inter))
print("battlegrounds", sum(c["battleground"] for c in out),
      {REGION_NAME[r]: sum(1 for c in out if c["region_id"] == r and c["battleground"]) for r in range(6)})
print("USA-adjacent", [c["name"] for c in out if c["superpower_adjacent"] == "USA"])
print("USSR-adjacent", [c["name"] for c in out if c["superpower_adjacent"] == "USSR"])
with open(OUT, "w", encoding="utf-8") as f:
    f.write("[\n" + ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in out) + "\n]\n")
print("wrote", OUT)
