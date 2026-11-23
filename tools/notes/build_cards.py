#!/usr/bin/env python3
"""Build docs/notes/cards_meta.json: one row per card id 1..110 joining
  DS/engine/src/card_data.cpp (CARDS table: ops, side, era, one_time, is_scoring, is_war_card),
  DS/rules/cards.json (description), DS zh-CN game.json (DS Chinese names),
  game_resources/card_text.json (our titles/texts) and the two card galleries (NNN_slug.jpg).
Usage: python3 build_cards.py <DS root> <game_resources dir> <out json>
"""
import json
import os
import re
import sys

DS, GR, OUT = sys.argv[1:4]
src = open(f"{DS}/engine/src/card_data.cpp", encoding="utf-8").read()
pat = re.compile(r'\{(\d+), "([^"]*)", (\d), Player::(\w+), WarEra::(\w+), (true|false), (true|false), (true|false)\}')
eng = {int(m[1]): m for m in pat.finditer(src)}
assert sorted(eng) == list(range(111))
rules = {c["id"]: c for c in json.load(open(f"{DS}/rules/cards.json", encoding="utf-8"))}
dszh = json.load(open(f"{DS}/web/ui/src/i18n/locales/zh-CN/game.json", encoding="utf-8"))["cards"]
ours = {c["id"]: c for c in json.load(open(f"{GR}/card_text.json", encoding="utf-8"))["cards"]}
img_en = {int(f[:3]): f for f in os.listdir(f"{GR}/English_card_gallery")}
img_zh = {int(f[:3]): f for f in os.listdir(f"{GR}/Chinese_card_gallery")}
SIDE = {"US": "US", "USSR": "USSR", "NONE": "neutral"}
ERA = {"EARLY": "early", "MID": "mid", "LATE": "late"}
rows, problems = [], []
for i in range(1, 111):
    m = eng[i]
    r = dict(id=i, name_engine=m[2], ops=int(m[3]), side=SIDE[m[4]], era=ERA[m[5]],
             starred=m[6] == "true", scoring=m[7] == "true", war_card=m[8] == "true",
             optional=104 <= i <= 110, title_en=ours[i]["title_en"], title_zh=ours[i]["title_zh"],
             title_zh_ds=dszh[str(i)]["name"], image_en=f"English_card_gallery/{img_en[i]}",
             image_zh=f"Chinese_card_gallery/{img_zh[i]}")
    rc = rules[i]
    if (rc["ops"], rc["side"], rc["age"], rc["one_time"], rc["name"]) != (
            r["ops"], {"US": "us", "USSR": "ussr", "neutral": "neutral"}[r["side"]],
            {"early": "early war", "mid": "middle war", "late": "late war"}[r["era"]], r["starred"], r["name_engine"]):
        problems.append(f"{i}: rules/cards.json differs from engine")
    if ours[i]["title_en"] != m[2]:
        problems.append(f"{i}: our title_en {ours[i]['title_en']!r} != engine {m[2]!r}")
    if ours[i]["text_en"] != rc["description"]:
        problems.append(f"{i}: our text_en != rules/cards.json description")
    if img_en[i] != img_zh[i]:
        problems.append(f"{i}: EN/ZH image filenames differ")
    rows.append(r)
print("problems:", problems or "none")
with open(OUT, "w", encoding="utf-8") as f:
    f.write("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
from collections import Counter
print("side", Counter(r["side"] for r in rows), "era", Counter(r["era"] for r in rows))
print("starred", sum(r["starred"] for r in rows), "scoring", [r["id"] for r in rows if r["scoring"]],
      "war", [r["id"] for r in rows if r["war_card"]])
print("zh title differs (ours vs DS):", sum(r["title_zh"] != r["title_zh_ds"] for r in rows))
print("wrote", OUT)
