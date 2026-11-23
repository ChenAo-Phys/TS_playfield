# Map data, translations and card/asset id mapping

Scope: DeepStruggle (DS, read-only at `vendor/DeepStruggle`) map/card data, its zh-CN catalog, and our
own assets in `game_resources/`. Paths below are relative to `vendor/DeepStruggle/` unless they start
with `game_resources/` or `docs/`.

## 0. Files produced

| file | what |
|---|---|
| `docs/notes/countries.json` | 84 countries, one object each (schema in §1.4), built by script from the engine table, `rules/map.json`, `map_view.ts`, DS zh-CN names, plus positions measured on `TS_map.jpg` |
| `docs/notes/cards_meta.json` | 110 cards: engine metadata + our titles + DS zh titles + image paths (§4) |
| `docs/notes/board_ref_positions.json` | non-country features on `TS_map.jpg`: scoring boxes, subregion labels, superpowers, all tracks (§2.3) |
| scratchpad `build_countries.py`, `ref_boxes.py`, `board_ref.py`, `build_cards.py` | the generators (full text of the first two in the appendix). The scratchpad is ephemeral: copy them into the repo if we want to regenerate later |

Scratchpad dir: `$SP/`.

---

## 1. Map data

### 1.1 Ground truth and how the page sees it

* **Engine table (truth):** `engine/src/map_data.cpp:8-187`, `constexpr std::array<CountryInfo, 84> COUNTRIES`.
  `CountryInfo` (`engine/include/ts/map_data.hpp`):
  `{uint8 id; string_view name; uint8 stability; bool battleground; Region region; bool in_western_europe; bool in_eastern_europe; bool in_southeast_asia; Player superpower_adjacent; uint8 num_neighbors; array<uint8,6> neighbors; array<uint64,2> neighbor_mask;}`
* `enum class Region : uint8_t` (`engine/include/ts/types.hpp:161-169`): `EUROPE=0, ASIA=1, MIDDLE_EAST=2, AFRICA=3, CENTRAL_AMERICA=4, SOUTH_AMERICA=5, NONE_REGION=255`.
  Note the order: **Asia is 1, Middle East is 2** (not board order).
* `enum class Player : int8_t` (`types.hpp:9-13`): `USSR=-1, NONE=0, US=1`.
* **Ids are contiguous by region**: Europe 0-20, Middle East 21-30, Asia 31-45, Africa 46-63, Central America 64-73, South America 74-83.
* **Display state** (`bindings/state_json.cpp:603-623`): `state.countries` is an **object keyed by the engine's English name**
  (e.g. `"Spain/Portugal"`, `"Dominican Rep"`, `"SE African States"`), each value
  `{id, name, stability, battleground, region /*int enum*/, us_influence, ussr_influence, controlled_by: "US"|"USSR"|"NONE"}`.
  `controlled_by` is computed there (`inf >= stab && inf >= other + stab`). DS `map_view.ts:616` reads `state.countries[c.name]`.
* **Engine layout export** (`bindings/wasm/ts_engine_wasm.cpp:214-253`): `layout.regions` = the Region enum by name,
  `layout.card_ids` = 25 named card ids (`ASIA_SCORING`, ..., `SE_ASIA_SCORING`, `WARGAMES`, `EAGLE_BEAR_LANDED_DISCARD`=250).
  DS reads these through `web/ui/src/engine/layout.ts` (`engineLayout()`, `namesByValue()`, `titleCase("MIDDLE_EAST") -> "Middle East"`).
* **Legal country targets**: `state.legal_actions.decision_type === layout.decision_types.POINT_NODE` and
  `state.legal_actions.valid_ids` (filter `< 84`) — `map_view.ts:595-599`.

### 1.2 `rules/map.json` (spec copy bundled into the DS page)

Shape: `{ metadata, regions: { "<Region name>": {region_id, color, subregions: {"<Sub>": [names]}, battlegrounds: [names], scoring_card: "<text>"} }, countries: [ {id, name, stability, battleground, region: "<Region name>", subregions: [..], superpower_adjacent: "USA"|"USSR"|null, neighbours: [<names>], pos: [x, y]} ] }`.
DS imports it at build time (`web/ui/src/metadata.ts`: `import mapJson from "../../../rules/map.json"`); TS type `MapMetadata` in `web/ui/src/types.ts:256-273`.

**Cross-check (scripted, `build_countries.py`):** `map.json` agrees with `map_data.cpp` on every field for all 84
countries (name, stability, battleground, region, subregions, superpower adjacency, neighbour sets); adjacency is
symmetric. 112 undirected edges, 29 battlegrounds (EU 5, AS 6, ME 6, AF 5, CA 3, SA 4). Matches the Deluxe board.

Errors in DS docs (not in engine data) — do not copy them:
* `rules/map.json` `regions.Africa.scoring_card = "Africa Scoring (#78)"` and `regions["South America"].scoring_card = "South America Scoring (#39)"` are wrong:
  engine `card_ids::AFRICA_SCORING = 79`, `SOUTH_AMERICA_SCORING = 81` (`engine/include/ts/constants.hpp:202,204`). `rules/map.md` §1 repeats #78/#39.
* `rules/map.md` §3 says "USSR Connected Nodes (6 countries)" but lists (correctly) 5.
* `rules/render_map.py:18-21` puts USA at (100,230), USSR at (650,140); `map_view.ts:501-502` uses (85,230)/(635,120). Only `map_view.ts` matters.

### 1.3 Connections

* **Inter-region edges (8)** — drawn red dashed on the board and in DS:
  France(8)–Algeria(47), Spain/Portugal(9)–Morocco(46), Turkey(12)–Syria(22), Egypt(29)–Sudan(51), Libya(30)–Tunisia(48),
  Iran(25)–Afghanistan(31), Iran(25)–Pakistan(32), Panama(70)–Colombia(74). (Canada–UK is intra-Europe: Canada is a Western Europe country.)
* **Superpower adjacency:** USA: Canada(0), Japan(45), Mexico(64), Cuba(71). USSR: Finland(5), Poland(15), Romania(19), Afghanistan(31), North Korea(43).
  Superpowers are not countries in the engine; adjacency is the `superpower_adjacent` field only.
* **Subregions:** Western Europe = 0-13 (Austria 13 and Finland 5 are in both); Eastern Europe = 5, 13-20; Southeast Asia = 34-40.

### 1.4 `docs/notes/countries.json` schema

```jsonc
{ "id": 0,                       // engine id (ts::MapData index, action-space node id)
  "name": "Canada",              // engine name == key of state.countries
  "short_name_en": null,         // DS SHORT_NAMES abbreviation (map_view.ts:128-136) or null
  "name_zh": "加拿大",            // DS zh-CN game.json countries.<id>
  "region": "Europe", "region_id": 0, "region_zh": "欧洲",
  "subregions": ["Western Europe"],
  "stability": 4, "battleground": false,
  "superpower_adjacent": "USA",  // "USA" | "USSR" | null
  "neighbours": [1], "neighbour_names": ["United Kingdom"],
  "inter_region_neighbours": [],
  "coup_target": 8,              // 2 x stability
  "ds_pos": [180, 145],          // map.json pos = DS box centre, viewBox 0 0 1000 650
  "ds_band_color": "#475569",    // REGION_STYLE band (SE Asia overrides Asia)
  "ref_x": 450, "ref_y": 376,    // centre of the whole country box on TS_map.jpg (2448x1584)
  "ref_box": [403, 345, 497, 407] }  // [left, top, right, bottom], name strip included
```

The full table is in the appendix (§A1).

### 1.5 DS `web/ui/src/map_view.ts` layout (what we may borrow)

* SVG viewBox `0 0 1000 650` (`:258`, `resetView` `:327`); zoom bounds `MIN_VIEW_W=125`, `MAX_VIEW_W=2000` (`:122-123`); drag slop 6 px; wheel 1.1x; pinch.
* Country box (`:112-119`): `BOX_W=38, BOX_H=22, BAND_H=7.4, STAB_W=6.4, NAME_FONT=4.4, MARKER_W=MARKER_H=12.2`; box centred on `pos`.
  Name band = region colour; stability chip at band's right (purple `#7C3AED` on battlegrounds, `#E2E8F0` otherwise);
  US marker left, USSR right; controlling marker is "flipped" (white on side colour).
* Fill/border by control (`:637-643`): US `#1E40AF`/`#3B82F6`, USSR `#991B1B`/`#EF4444`, uncontrolled BG `#1E1B4B`/`#A855F7`, else `#0F172A`/`#475569`.
* Edges (`:510-528`): intra-region `#475569` w1.2 dash `2,2`; inter-region `#DC2626` w1.6 dash `3,3`; superpower lines side stroke w2 dash `4,4` opacity .8.
  Japan–USA is a special Bezier wrapping round the map bottom (`:533-541`): `M jx jy C 960 210, 960 500, 480 600 S 70 320, 85 230`.
* Superpower nodes (`:500-503`): USA `pos [85,230]` fill `#1E3A8A` stroke `#3B82F6`; USSR `pos [635,120]` fill `#7F1D1D` stroke `#EF4444`; rect 90x24.
* `SHORT_NAMES` (`:128-136`): United Kingdom→`UK`, West Germany→`W. Germany`, East Germany→`E. Germany`, Czechoslovakia→`Czechoslov.`,
  West African States→`W. African St.`, SE African States→`SE African St.`, Dominican Rep→`Dominican R.`. Used only as the English fallback:
  `countryName(c.id, SHORT_NAMES[c.name] ?? c.name)` (`:670`), so zh shows the full Chinese name.
* `REGION_STYLE` (`:143-151`, `{band, accent}`): Europe `#475569/#94A3B8`, Middle East `#0E7490/#22D3EE`, Asia `#C2410C/#FB923C`,
  Southeast Asia `#7C2D12/#F59E0B`, Africa `#A16207/#FACC15`, Central America `#15803D/#4ADE80`, South America `#065F46/#34D399`.
  (`map.json` has a different, unused `regions.*.color`.)
* Scoring badges `REGION_LOOK` (`:39-47`), 104x34: EUROPE [288,29], ASIA [830,179], MIDDLE_EAST [640,221], AFRICA [424,535],
  CENTRAL_AMERICA [130,263], SOUTH_AMERICA [270,441], SE_ASIA [894,433]. Badge numbers come from `state.region_scores` (engine-scored, slot 6 = SE Asia).
* No two DS boxes overlap at 38x22. DS `pos` is essentially the printed board scaled down: least-squares
  `ref_x ≈ 2.442·x_ds + 0.3`, `ref_y ≈ 2.234·y_ds + 33.5`, RMS residual 12 px (largest: Benelux −34 px x, Saharan States +30 px x).

---

## 2. Reference board `game_resources/TS_map.jpg` (2448x1584)

### 2.1 Method and reliability

1. Read each box's top-left corner off 1:1 crops with a 50 px grid (rough, ±10 px).
2. `ref_boxes.py` snaps each to the box's 1-px dark outline: maximise mean darkness along a 94/95 x 62/63 rectangle's perimeter
   within ±7 px (−1 per px moved).
3. Verified by drawing all 84 rectangles + labels back onto the image and inspecting every region (all 84 align with the printed boxes; two that the
   first ±12 px search mis-snapped — Czechoslovakia, Panama — were fixed by the tighter window and re-checked at 4x).

**Result: reliable to ~±2 px.** Every country box is 94-95 px wide, 62-63 px tall (name strip ≈ top 15 px, influence area below,
split by a dashed centre line: US left, USSR right). `ref_x/ref_y` = centre of the whole box.

### 2.2 Notable geometry

* The board's Japan box has a "To USA" arrow (east edge), the USA has "To Japan" (west edge) — the map wraps.
* The board places Canada (Europe region) next to the USA; DS does the same (`ds_pos [180,145]`).
* Turkey (Europe) borders Syria (ME) across the Europe/ME boundary; Panama–Colombia is the CA/SA link.

### 2.3 Non-country features (`docs/notes/board_ref_positions.json`, ±5 px, `[left, top, right, bottom]`)

| feature | box |
|---|---|
| Europe scoring box | [1050, 60, 1180, 150] |
| Middle East scoring | [1529, 788, 1659, 878] |
| Asia scoring | [1769, 617, 1899, 705] |
| Southeast Asia scoring (+ "Subregion of Asia") | [1796, 924, 1929, 1012] (+ label to y 1030) |
| Africa scoring | [902, 980, 1032, 1070] |
| Central America scoring | [500, 645, 630, 735] |
| South America scoring | [505, 1028, 635, 1112] |
| "Western Europe" label | [731, 372, 855, 397] |
| "Eastern Europe" label | [1176, 230, 1305, 252] |
| USA label / node centre | [138, 480, 370, 570] / (255, 530) |
| USSR label / node centre | [1264, 285, 1619, 358] / (1440, 320) |
| Action Round track 1..8 | y 100-148, centres x = 465, 522, 579, 636, 693, 750, 805, 861 (AR7 marked "Turn 4+") |
| Turn Record track 1..10 | y 70-148, x from 1665, pitch 73.7 (centres ≈ 1702…2365); era bands y 155-188: Early 1665-1885, Mid 1890-2180, Late 2188-2402 |
| Space Race 0..8 | y 248-320, centres x = 1702, 1782, 1864, 1944, 2026, 2106, 2188, 2270, 2352; labels y 320-345, "N Ops: Roll" y 350-366, privileges y 372-415 |
| DEFCON 5,4,3,2,1 | y 1240-1308, centres x = 764, 839, 914, 989, 1064 |
| Required Military Ops 0..5 | y 1410-1505, centres x = 762, 837, 912, 987, 1062, 1137 |
| VP track | 9 cols at x = 1484…1998 (pitch ≈64.3), 5 rows at y = 1210, 1278, 1345, 1413, 1480. Row1: USSR 20 (2 cols), USSR 19→13; Row2: USSR 12→4; Row3: USSR 3,2,1, "0 Start" (3 cols), US 1,2,3; Row4: US 4→12; Row5: US 13→19, US 20 (2 cols) |
| Chinese Civil War box (optional rule, not used) | [1957, 543, 2082, 640] |
| Sequence of Play / Map key / logo | [70,1228,322,1485] / [2104,1350,2364,1510] / [50,70,400,250] |

---

## 3. Translations

### 3.1 DS i18n architecture (`web/ui/src/i18n/`)

* i18next, `defaultNS: "common"`, `fallbackLng: "en"`, `interpolation.escapeValue: false` (messages go into innerHTML), `returnEmptyString: false`.
  `LANGUAGES = { en: "English", "zh-CN": "简体中文" }` (`index.ts:21`); zh-CN lazy-loaded (`LOADERS`, `index.ts:27-29`); pseudo-locale `en-XA` wraps every string in `⟦…⟧` for untranslated-string tests.
* Language choice (`requested()`, `index.ts:65-76`): `?lang=` → `localStorage["ts.language"]` → **"en"**. It does **not** read
  `navigator.language`; our requirement (auto from browser) needs one more fallback step.
* Static markup: `data-i18n="ns:key"`, `data-i18n-title|placeholder|aria-label` (`applyStatic`).
* Name lookups by engine id with English fallback (`index.ts:158-176`):
  `cardName(id, en)` → `game:cards.<id>.name`; `cardDescription(id, en)` → `game:cards.<id>.description`;
  `countryName(id, en)` → `game:countries.<id>`; `regionName(en)` → `game:regions.<English region name>`; `sideName("US"|"USSR")` → `common:side.<side>`.
* Deferred messages: `message(key, params)` / `render(m)` / `renderEnglish(m)`; params may be `{card,name}`, `{country,name}`, `{region}`, `{side}` so a
  language switch re-renders logs. Enums: `enums.ts` (`enumLabel("decision","SELECT_CARD")`, `endingLabel(reason)` mapping the engine's reason strings
  `"20 VP"`, `"Europe Control"`, `"wargames"`, `"final scoring"`, `"DEFCON 1 (own decision)"`, `"DEFCON 1 (opponent decision)"`).
* Namespaces (22, `locales/<lang>/index.ts`): common, game, page, app, debug, replay, result, hud, rolls, region, map, tracks, cards, analysis,
  trace, leaderboard, branches, effects, enums, endings, actions, log.

### 3.2 Coverage (scripted key diff, plural `_one/_other` folded to one base key)

Base keys per namespace (en = zh-CN, 0 missing, 0 extra in every one): actions 15, analysis 60, app 39, branches 32, cards 63,
common 8, debug 11, effects 83, endings 6, enums 23, hud 94, leaderboard 86, log 156, map 39, page 134, region 24, replay 9, result 32,
rolls 26, trace 37, tracks 76 → **100 % coverage, 1,053 keys**. About 9 zh values equal the English, all legitimate (`Elo`, `{{side}} +{{vp}}`, `—`, `region`).
zh-CN correctly has only `_other` plural forms.

`game` is special: en is `{}`, zh-CN has 313 leaves = 110 card names + 110 card descriptions + 84 countries + 9 regions
(English falls back to the engine/rules names passed as `english`).

Much of the UI catalog is workbench-specific (analysis, trace, leaderboard, debug, replay, page) and will not carry over; the reusable parts are
`game`, `common`, `enums`, `endings`, `region`, `map`, `tracks`, `rolls`, `effects`, `branches`, parts of `hud`/`log`/`cards`.

### 3.3 Quality spot-check

Natural, consistent, correct placeholders and HTML (`<strong>`, `<b>`, `<small>` kept). Examples: `hud:prompt.target` "请选择目标国家：",
`log:roll.realign` "在{{country}}调整阵营：美国掷出 {{usRoll}}（修正 {{usMod}} = {{usTotal}}）…", `map:tooltip.coup` "政变：骰子点数＋行动点数须大于 <b>{{n}}</b>".
Issues: **DEFCON is rendered 核危机等级** everywhere (`tracks:label.defcon`, `endings:defconOwn`, `branches:defcon.*`) — unusual; our cards say `DEFCON`.
Era is 冷战早期/中期/晚期 while our card art says 战争早期/中期/晚期. Realignment is 调整阵营 while our cards say 调整 / 调整掷骰. Brand: `common:brand` "冷战热斗"
(the common Chinese title) and a GMT trademark disclaimer (`common:disclaimer`).

### 3.4 Chinese country and region names (DS `game.json`)

All 84 present; standard PRC forms (西德/东德, 朝鲜/韩国, 扎伊尔, 科特迪瓦, 台湾). Multi-country boxes are inconsistent in DS:
西非国家(49), 撒哈拉诸国(50), 东南非洲诸国(61), 海湾国家(27). Our card text says 东南非洲国家 (#52) and 柬埔寨/老挝 (#38, card order) vs DS 老挝/柬埔寨.
Regions: 欧洲 亚洲 中东 非洲 中美洲 南美洲 西欧 东欧 东南亚. Superpowers: `map:superpower.usa/ussr` = 美国/苏联.

### 3.5 Card names: DS zh vs ours

DS zh and our `card_text.json` `title_zh` differ on **50 of 110** cards (table §A2). **Ours must win**: the Chinese gallery images are already drawn with
our titles (verified #21 北约, #38 东南亚计分, #76 珍宝岛事件, #104 剑桥五人组). DS zh card *descriptions* are independent of ours too; use our `text_zh`.

### 3.6 Proposed glossary (standardise UI on what the Chinese card art already uses)

| EN | ours (cards) | DS UI | recommend |
|---|---|---|---|
| Influence | 影响力 | 影响力 | 影响力 |
| Coup / Coup attempt | 政变 | 政变 | 政变 |
| Realignment (roll) | 调整 / 调整掷骰 | 调整阵营 | 调整 (action "调整", roll "调整掷骰"); never 调整阵营 on cards |
| Battleground | 战场国 | 战场国 | 战场国 |
| Space Race | 太空竞赛 | 太空竞赛 | 太空竞赛 |
| DEFCON | DEFCON | 核危机等级 | **DEFCON** (optionally a one-time gloss "DEFCON（核战备等级）") |
| Military Operations | 军事行动 | 军事行动 | 军事行动 |
| VP | VP (92x) | 胜利点数 | VP in compact UI; 胜利点数 only in prose |
| Operations / Ops value | 行动点数 (+4x bare 行动点) | 行动点数 | 行动点数; "Operations card" = 行动卡 |
| Headline (Phase) | 头条 / 头条阶段 | 头条 | 头条 / 头条阶段 |
| Action Round | 行动轮 | 行动轮 | 行动轮 |
| Turn | 回合 | 回合 | 回合 |
| Presence / Domination / Control | 存在 / 支配 / 控制 | same | same |
| Stability | 稳定值 (1x, #36) | 稳定度 | 稳定度 (and fix #36 text) — owner's call |
| Early/Mid/Late War | 战争早期/中期/晚期 | 冷战早期/… | 战争早期/中期/晚期 (matches card art) |
| Scoring card | 计分牌 | 计分牌 | 计分牌 |
| Event / associated Event | 事件 / 关联事件 | 事件 | same |
| Discard (verb) / discard pile / draw pile | 弃掉 / 弃牌堆 / 抽牌堆 | 弃置/弃掉/弃牌 mixed | 弃掉 / 弃牌堆 / 抽牌堆 |
| Remove from play | 移出游戏 | 移出游戏 | 移出游戏 |
| Superpower / opponent | 超级大国 / 对手 | same | same |
| The China Card | 中国牌 | 中国牌 | 中国牌 |
| MAY NOT BE HELD | 不得持有 (label) | 不可保留到回合结束！ | 不得持有 |
| SE African States etc. | 东南非洲国家 | 东南非洲诸国 | pick one form for all 4 multi-country boxes (suggest 西非国家/撒哈拉国家/东南非洲国家/海湾国家, i.e. ours) |

Our `card_text.json` also carries UI labels (`labels[]`): 战争早期/中期/晚期, 可选 (OPTIONAL), 若作为事件使用，则移出游戏。, 计分后移出游戏。, 不得持有, 双方计分：.
Markup in `text_zh`: `\n` line breaks (62) and `*…*` italics (36 cards); `text_en` is a single plain paragraph (no markup).

---

## 4. Card ids and assets

* **Engine ids** (`engine/include/ts/constants.hpp:118-238`, `namespace card_ids`): 1..110 = standard Deluxe numbering; aliases share ids
  (e.g. `WARSAW_PACT`=`WARSAW_PACT_FORMED`=16); special `EAGLE_BEAR_LANDED_DISCARD = 250` (not a card).
* **Engine metadata** (`engine/src/card_data.cpp:7-132`, `CardInfo {id, name, ops, side, era, one_time, is_scoring, is_war_card}`, index 0 = dummy):
  US 42 / USSR 40 / neutral 28; early 39 / mid 48 / late 23; starred (`one_time`, removed after event) 70 — incl. SE Asia Scoring (#38, "remove after scoring");
  scoring = 1, 2, 3, 37, 38, 79, 81 (ops 0); war cards = 11, 13, 24, 36, 102. Engine names use curly quotes/ellipsis for 50, 62, 77, 80, 97
  (e.g. `“We Will Bury You”`). The China Card (#6, 4 ops) is never in the deck (`state_machine.cpp:36-43`).
* **Optional cards 104-110 are always in the deck** (`add_era_cards_to_deck` adds every card of the era, `state_machine.cpp:36-43,198,787,789`) — consistent with our rule set. #103 Defectors is standard.
* `rules/cards.json` (`[{id, side: "us"|"ussr"|"neutral", ops, name, description, one_time, age: "early war"|"middle war"|"late war"}]`) **agrees with the engine on every field for all 110**.
  It has no scoring/war flags (use engine names/ids or `cards_meta.json`).
* **Our assets:** `game_resources/card_text.json` = `{labels: [{en, zh}], cards: [{id, title_en, title_zh, text_en, text_zh}]}`, ids 1..110 complete.
  `title_en` == engine name for all 110; `text_en` == `rules/cards.json` `description` for all 110 (byte-identical; so it is DS's text, errata status = DS's).
  `English_card_gallery/` and `Chinese_card_gallery/`: 110 files each, identical filenames `NNN_slug.jpg`, NNN = engine id, no gaps/dups.
  EN images 375x525 (8.4 MB total), ZH images 750x1050 (10.7 MB). **No id mismatches.** Slug quirks only (do not derive names from slugs):
  `060_u2-incident`, `077_ask-not-what-your-country` (truncated), `089_soviets-shoot-down-kal-7`.
* Full per-card table: §A3 and `docs/notes/cards_meta.json`
  (`{id, name_engine, ops, side, era, starred, scoring, war_card, optional, title_en, title_zh, title_zh_ds, image_en, image_zh}`).
* Not in any table: "underlined"/ongoing-event status. DS derives active effects from state flags (`effects` namespace, keys like `QUAGMIRE_ACTIVE`).

---

## 5. Licensing

* DS repository: MIT, "Copyright (c) 2026 Mikhail Dektyarev" (`LICENSE`). We may copy/modify code (TS in `web/ui/src`, C++ engine, wasm bindings,
  build scripts) **if we ship the copyright + permission notice** (e.g. `THIRD_PARTY_NOTICES` / `LICENSES/DeepStruggle-MIT.txt`, plus a header comment in copied files).
  Good candidates: `i18n/index.ts` + `enums.ts` (i18n plumbing), map pan/zoom & tooltip logic in `map_view.ts`, `engine/layout.ts`, `game/*`, `analysis/*` (ONNX/HF loading), and the zh-CN JSON catalogs (DS's own translations, covered by MIT).
* Data in `rules/` (`map.json`, `cards.json`) is in the MIT repo, but the **game content** (card titles/texts, map topology as published, board art) is
  GMT Games' IP; MIT cannot license what DS does not own. Same for our English card images (twilightstrategy.com scans of GMT art) and our Chinese
  card images (our redraws of GMT designs). DS itself carries a GMT trademark disclaimer (`README.md:157`, `common:disclaimer`); we should show one too.
  `rules/Rules_Final.pdf` is git-ignored in DS for copyright reasons; consistent with our "link, don't host" rule for the rulebook.
* Models: HF `mihaild/deepstruggle` is public, not gated, **license: MIT** (HF API `cardData.license = "mit"`, tag `license:mit`; checked 2026-11-22).
  DS default repo constant: `web/ui/src/analysis/hf_catalog.ts:14` `DEFAULT_HF_REPO = "mihaild/deepstruggle"`.
* `external/struggler` (git submodule, reference engine for differential tests) — not needed; not checked out/licensed here.

---

## 6. Risks / open questions

1. **Errata:** our `text_en` is DS's text verbatim, and the English gallery images are unmodified originals (e.g. #21 NATO still shows the old
   "Play after 'Marshall Plan' or 'Warsaw Pact.'" wording). CLAUDE.md wants errata-adjusted English cards — needs a separate pass.
2. Glossary decisions for the owner: DEFCON wording, 调整 vs 调整阵营, 稳定度 vs 稳定值, multi-country box names, era label. If we reuse DS's zh catalog, these need a find-replace.
3. Browser-language auto-detect is not in DS's `requested()`; add `navigator.languages` → `zh*` ⇒ `zh-CN`.
4. `state.countries` is keyed by English name — any renaming must happen only in display code; join on `id`.
5. Region enum order (EU 0, AS 1, ME 2, …) differs from board/scoring order; never hard-code by position.
6. Our redrawn SVG can use `ref_x/ref_y` × (target/2448) for a board-faithful layout, or DS `ds_pos` (already de-cluttered, 1000x650). DS `pos` ≈ board/2.44.

---

## Appendix

### A1. Countries (from `docs/notes/countries.json`; `*` = inter-region neighbour; WE/EE/SEA = subregions)
| id | name (engine) | short (DS) | zh (DS) | region | sub | stab | BG | SP adj | neighbours (ids) | ds_pos | ref_x,ref_y |
|---:|---|---|---|---|---|---:|:-:|:-:|---|---|---|
| 0 | Canada |  | 加拿大 | Europe | WE | 4 |  | USA | 1 | 180,145 | 450,376 |
| 1 | United Kingdom | UK | 英国 | Europe | WE | 5 |  |  | 0, 2, 6, 8 | 345,115 | 858,289 |
| 2 | Norway |  | 挪威 | Europe | WE | 4 |  |  | 1, 3 | 405,52 | 974,148 |
| 3 | Sweden |  | 瑞典 | Europe | WE | 4 |  |  | 2, 4, 5 | 460,72 | 1118,211 |
| 4 | Denmark |  | 丹麦 | Europe | WE | 3 |  |  | 3, 7 | 410,85 | 998,221 |
| 5 | Finland |  | 芬兰 | Europe | WE+EE | 4 |  | USSR | 3 | 515,52 | 1258,152 |
| 6 | Benelux |  | 比荷卢联盟 | Europe | WE | 3 |  |  | 1, 7 | 370,148 | 938,363 |
| 7 | West Germany | W. Germany | 西德 | Europe | WE | 4 | Y |  | 4, 6, 8, 13, 14 | 425,148 | 1044,364 |
| 8 | France |  | 法国 | Europe | WE | 3 | Y |  | 1, 7, 9, 10, 47* | 375,192 | 920,450 |
| 9 | Spain/Portugal |  | 西班牙/葡萄牙 | Europe | WE | 2 |  |  | 8, 10, 46* | 345,235 | 843,551 |
| 10 | Italy |  | 意大利 | Europe | WE | 2 | Y |  | 8, 9, 11, 13, 18 | 435,210 | 1061,512 |
| 11 | Greece |  | 希腊 | Europe | WE | 2 |  |  | 10, 12, 18, 20 | 490,248 | 1195,590 |
| 12 | Turkey |  | 土耳其 | Europe | WE | 2 |  |  | 11, 19, 20, 22* | 565,218 | 1385,521 |
| 13 | Austria |  | 奥地利 | Europe | WE+EE | 4 |  |  | 7, 10, 14, 17 | 445,180 | 1088,437 |
| 14 | East Germany | E. Germany | 东德 | Europe | EE | 3 | Y |  | 7, 13, 15, 16 | 445,115 | 1082,293 |
| 15 | Poland |  | 波兰 | Europe | EE | 3 | Y | USSR | 14, 16 | 490,115 | 1192,293 |
| 16 | Czechoslovakia | Czechoslov. | 捷克斯洛伐克 | Europe | EE | 3 |  |  | 14, 15, 17 | 485,148 | 1172,363 |
| 17 | Hungary |  | 匈牙利 | Europe | EE | 3 |  |  | 13, 16, 18, 19 | 485,180 | 1194,437 |
| 18 | Yugoslavia |  | 南斯拉夫 | Europe | EE | 3 |  |  | 10, 11, 17, 19 | 475,210 | 1170,512 |
| 19 | Romania |  | 罗马尼亚 | Europe | EE | 3 |  | USSR | 12, 17, 18 | 530,180 | 1300,437 |
| 20 | Bulgaria |  | 保加利亚 | Europe | EE | 3 |  |  | 11, 12 | 525,210 | 1280,512 |
| 21 | Lebanon |  | 黎巴嫩 | Middle East |  | 1 |  |  | 22, 23, 26 | 550,252 | 1324,594 |
| 22 | Syria |  | 叙利亚 | Middle East |  | 2 |  |  | 12*, 21, 23 | 590,252 | 1426,592 |
| 23 | Israel |  | 以色列 | Middle East |  | 4 | Y |  | 21, 22, 26, 29 | 542,285 | 1306,665 |
| 24 | Iraq |  | 伊拉克 | Middle East |  | 3 | Y |  | 25, 26, 27, 28 | 590,285 | 1426,665 |
| 25 | Iran |  | 伊朗 | Middle East |  | 2 | Y |  | 24, 31*, 32* | 635,285 | 1530,666 |
| 26 | Jordan |  | 约旦 | Middle East |  | 2 |  |  | 21, 23, 24, 28 | 560,318 | 1374,739 |
| 27 | Gulf States |  | 海湾国家 | Middle East |  | 3 |  |  | 24, 28 | 605,318 | 1492,737 |
| 28 | Saudi Arabia |  | 沙特阿拉伯 | Middle East |  | 3 | Y |  | 24, 26, 27 | 600,350 | 1464,809 |
| 29 | Egypt |  | 埃及 | Middle East |  | 2 | Y |  | 23, 30, 51* | 515,318 | 1256,740 |
| 30 | Libya |  | 利比亚 | Middle East |  | 2 | Y |  | 29, 48* | 470,318 | 1147,729 |
| 31 | Afghanistan |  | 阿富汗 | Asia |  | 2 |  | USSR | 25*, 32 | 675,262 | 1653,618 |
| 32 | Pakistan |  | 巴基斯坦 | Asia |  | 2 | Y |  | 25*, 31, 33 | 675,305 | 1656,711 |
| 33 | India |  | 印度 | Asia |  | 3 | Y |  | 32, 34 | 725,325 | 1770,761 |
| 34 | Burma |  | 缅甸 | Asia | SEA | 2 |  |  | 33, 35 | 780,335 | 1900,774 |
| 35 | Laos/Cambodia |  | 老挝/柬埔寨 | Asia | SEA | 1 |  |  | 34, 36, 37 | 820,338 | 2004,785 |
| 36 | Thailand |  | 泰国 | Asia | SEA | 2 | Y |  | 35, 37, 38 | 800,380 | 1960,860 |
| 37 | Vietnam |  | 越南 | Asia | SEA | 1 |  |  | 35, 36 | 845,380 | 2066,860 |
| 38 | Malaysia |  | 马来西亚 | Asia | SEA | 2 |  |  | 36, 39, 41 | 820,430 | 2008,972 |
| 39 | Indonesia |  | 印度尼西亚 | Asia | SEA | 1 |  |  | 38, 40 | 890,465 | 2182,1060 |
| 40 | Philippines |  | 菲律宾 | Asia | SEA | 2 |  |  | 39, 45 | 910,375 | 2222,858 |
| 41 | Australia |  | 澳大利亚 | Asia |  | 4 |  |  | 38 | 890,520 | 2184,1187 |
| 42 | Taiwan |  | 台湾 | Asia |  | 3 |  |  | 44, 45 | 895,328 | 2176,747 |
| 43 | North Korea |  | 朝鲜 | Asia |  | 3 | Y | USSR | 44 | 905,218 | 2200,520 |
| 44 | South Korea |  | 韩国 | Asia |  | 3 | Y |  | 42, 43, 45 | 905,250 | 2222,593 |
| 45 | Japan |  | 日本 | Asia |  | 4 | Y | USA | 40, 42, 44 | 945,280 | 2306,662 |
| 46 | Morocco |  | 摩洛哥 | Africa |  | 3 |  |  | 9*, 47, 49 | 355,288 | 871,687 |
| 47 | Algeria |  | 阿尔及利亚 | Africa |  | 2 | Y |  | 8*, 46, 48, 50 | 405,278 | 977,655 |
| 48 | Tunisia |  | 突尼斯 | Africa |  | 2 |  |  | 30*, 47 | 445,270 | 1086,645 |
| 49 | West African States | W. African St. | 西非国家 | Africa |  | 2 |  |  | 46, 52 | 350,340 | 860,781 |
| 50 | Saharan States |  | 撒哈拉诸国 | Africa |  | 1 |  |  | 47, 53 | 430,340 | 1020,807 |
| 51 | Sudan |  | 苏丹 | Africa |  | 1 |  |  | 29*, 54 | 520,355 | 1274,826 |
| 52 | Ivory Coast |  | 科特迪瓦 | Africa |  | 2 |  |  | 49, 53 | 380,390 | 928,920 |
| 53 | Nigeria |  | 尼日利亚 | Africa |  | 1 | Y |  | 50, 52, 56 | 435,390 | 1060,909 |
| 54 | Ethiopia |  | 埃塞俄比亚 | Africa |  | 1 |  |  | 51, 55 | 550,390 | 1349,901 |
| 55 | Somalia |  | 索马里 | Africa |  | 2 |  |  | 54, 58 | 600,398 | 1466,933 |
| 56 | Cameroon |  | 喀麦隆 | Africa |  | 1 |  |  | 53, 57 | 455,428 | 1109,992 |
| 57 | Zaire |  | 扎伊尔 | Africa |  | 1 | Y |  | 56, 59, 60 | 505,440 | 1234,1027 |
| 58 | Kenya |  | 肯尼亚 | Africa |  | 2 |  |  | 55, 61 | 555,430 | 1360,997 |
| 59 | Angola |  | 安哥拉 | Africa |  | 1 | Y |  | 57, 62, 63 | 465,482 | 1142,1114 |
| 60 | Zimbabwe |  | 津巴布韦 | Africa |  | 1 |  |  | 57, 61, 62 | 520,492 | 1270,1150 |
| 61 | SE African States | SE African St. | 东南非洲诸国 | Africa |  | 1 |  |  | 58, 60 | 560,468 | 1374,1095 |
| 62 | Botswana |  | 博茨瓦纳 | Africa |  | 2 |  |  | 59, 60, 63 | 505,530 | 1236,1226 |
| 63 | South Africa |  | 南非 | Africa |  | 3 | Y |  | 59, 62 | 485,570 | 1186,1306 |
| 64 | Mexico |  | 墨西哥 | Central America |  | 2 | Y | USA | 65 | 55,285 | 132,673 |
| 65 | Guatemala |  | 危地马拉 | Central America |  | 1 |  |  | 64, 66, 67 | 95,322 | 223,748 |
| 66 | El Salvador |  | 萨尔瓦多 | Central America |  | 1 |  |  | 65, 67 | 75,352 | 189,826 |
| 67 | Honduras |  | 洪都拉斯 | Central America |  | 2 |  |  | 65, 66, 68, 69 | 125,352 | 296,820 |
| 68 | Costa Rica |  | 哥斯达黎加 | Central America |  | 3 |  |  | 67, 69, 70 | 115,385 | 286,894 |
| 69 | Nicaragua |  | 尼加拉瓜 | Central America |  | 1 |  |  | 67, 68, 71 | 165,352 | 402,821 |
| 70 | Panama |  | 巴拿马 | Central America |  | 2 | Y |  | 68, 74* | 165,385 | 404,893 |
| 71 | Cuba |  | 古巴 | Central America |  | 3 | Y | USA | 69, 72 | 170,308 | 408,726 |
| 72 | Haiti |  | 海地 | Central America |  | 1 |  |  | 71, 73 | 210,340 | 512,793 |
| 73 | Dominican Rep | Dominican R. | 多米尼加共和国 | Central America |  | 1 |  |  | 72 | 250,340 | 616,792 |
| 74 | Colombia |  | 哥伦比亚 | South America |  | 1 |  |  | 70*, 75, 77 | 195,428 | 472,980 |
| 75 | Ecuador |  | 厄瓜多尔 | South America |  | 2 |  |  | 74, 76 | 145,435 | 360,1013 |
| 76 | Peru |  | 秘鲁 | South America |  | 2 |  |  | 75, 78, 81 | 168,472 | 420,1093 |
| 77 | Venezuela |  | 委内瑞拉 | South America |  | 2 | Y |  | 74, 79 | 215,390 | 530,903 |
| 78 | Bolivia |  | 玻利维亚 | South America |  | 2 |  |  | 76, 80 | 218,500 | 530,1160 |
| 79 | Brazil |  | 巴西 | South America |  | 2 | Y |  | 77, 83 | 295,472 | 714,1087 |
| 80 | Paraguay |  | 巴拉圭 | South America |  | 2 |  |  | 78, 82, 83 | 242,540 | 592,1239 |
| 81 | Chile |  | 智利 | South America |  | 3 | Y |  | 76, 82 | 192,540 | 472,1248 |
| 82 | Argentina |  | 阿根廷 | South America |  | 2 | Y |  | 80, 81, 83 | 208,605 | 508,1388 |
| 83 | Uruguay |  | 乌拉圭 | South America |  | 2 |  |  | 79, 80, 82 | 255,575 | 624,1330 |

### A2. Card titles where DS zh-CN differs from ours (50)

| id | English | ours (card_text.json / ZH gallery) | DS zh-CN |
|---:|---|---|---|
| 10 | Blockade | 柏林封锁 | 封锁 |
| 12 | Romanian Abdication | 罗马尼亚国王退位 | 罗马尼亚颠覆 |
| 13 | Arab-Israeli War | 中东战争 | 阿拉伯—以色列战争 |
| 14 | Comecon | 经互会 | 经济互助委员会 |
| 16 | Warsaw Pact Formed | 华约成立 | 华沙条约组织成立 |
| 18 | Captured Nazi Scientist | 被俘的纳粹科学家 | 逮捕纳粹科学家 |
| 21 | NATO | 北约 | 北大西洋公约组织 |
| 22 | Independent Reds | 独立赤色分子 | 独立的红色 |
| 24 | Indo-Pakistani War | 印巴战争 | 印度—巴基斯坦战争 |
| 27 | US/Japan Mutual Defense Pact | 美日安保条约 | 美日共同防卫协定 |
| 29 | East European Unrest | 东欧动乱 | 东欧剧变 |
| 30 | Decolonization | 去殖民化 | 去殖民地化 |
| 31 | Red Scare/Purge | 红色恐慌/大清洗 | 红色恐慌/清洗 |
| 35 | Formosan Resolution | 台湾决议案 | 台湾决议 |
| 36 | Brush War | 小规模战争 | 局部战争 |
| 43 | SALT Negotiations | 限制战略武器谈判 | 战略武器限制谈判 |
| 45 | Summit | 峰会 | 首脑峰会 |
| 46 | How I Learned to Stop Worrying | 我如何学会停止恐惧 | 我如何学会不再担忧 |
| 50 | “We Will Bury You” | “我们要埋葬你们” | “我们会埋葬你们” |
| 52 | Portuguese Empire Crumbles | 葡萄牙帝国瓦解 | 葡萄牙帝国崩溃 |
| 53 | South African Unrest | 南非动乱 | 南非动荡 |
| 56 | Muslim Revolution | 伊斯兰革命 | 穆斯林革命 |
| 57 | ABM Treaty | 反导条约 | 反弹道导弹条约 |
| 59 | Flower Power | 花的力量 | 花朵力量 |
| 60 | U-2 Incident | U-2 击坠事件 | U-2击坠事件 |
| 61 | OPEC | 欧佩克 | 石油输出国组织 |
| 63 | Colonial Rear Guards | 殖民地后卫部队 | 殖民地殿后部队 |
| 64 | Panama Canal Returned | 巴拿马运河归还 | 归还巴拿马运河 |
| 66 | Puppet Governments | 傀儡政权 | 傀儡政府 |
| 67 | Grain Sales to Soviets | 向苏联出售粮食 | 向苏联出售谷物 |
| 69 | Latin American Death Squads | 拉丁美洲死亡小队 | 拉丁美洲敢死队 |
| 71 | Nixon Plays the China Card | 尼克松打中国牌 | 尼克松打出中国牌 |
| 72 | Sadat Expels Soviets | 萨达特驱逐苏联专家 | 萨达特驱逐苏联 |
| 76 | Ussuri River Skirmish | 珍宝岛事件 | 乌苏里江冲突 |
| 77 | “Ask Not What Your Country Can Do For You…” | “不要问你的国家能为你做什么……” | “不要问你的国家能为你做什么” |
| 78 | Alliance for Progress | 争取进步联盟 | 美洲进步同盟 |
| 80 | “One Small Step…” | “个人的一小步……” | “一小步…” |
| 84 | Reagan Bombs Libya | 里根空袭利比亚 | 里根轰炸利比亚 |
| 85 | Star Wars | 星球大战计划 | 星球大战 |
| 87 | The Reformer | 改革者 | 改革家 |
| 89 | Soviets Shoot Down KAL-007 | 苏联击落大韩航空 007 号班机 | 苏联击落大韩航空007号班机 |
| 90 | Glasnost | 公开性 | 开放政策 |
| 93 | Iran-Contra Scandal | 伊朗门事件 | 伊朗门丑闻 |
| 98 | Aldrich Ames Remix | 奥尔德里奇·艾姆斯 | 奥德里奇·艾姆斯 |
| 99 | Pershing II Deployed | 潘兴 II 导弹部署 | 部署潘兴II型导弹 |
| 102 | Iran-Iraq War | 两伊战争 | 伊朗—伊拉克战争 |
| 103 | Defectors | 叛逃者 | 背叛者 |
| 104 | The Cambridge Five | 剑桥五人组 | 剑桥五杰 |
| 105 | Special Relationship | 英美特殊关系 | 美英特殊关系 |
| 108 | Our Man in Tehran | 我们在德黑兰的人 | 我们的人在德黑兰 |

### A3. Card metadata (engine `card_data.cpp`; `*` starred = removed after event, S scoring, W war card, O optional)

| id | engine name | ops | side | era | starred | scoring | war | opt |
|---:|---|---:|---|---|:-:|:-:|:-:|:-:|
| 1 | Asia Scoring | 0 | neutral | early |  | S |  |  |
| 2 | Europe Scoring | 0 | neutral | early |  | S |  |  |
| 3 | Middle East Scoring | 0 | neutral | early |  | S |  |  |
| 4 | Duck and Cover | 3 | US | early |  |  |  |  |
| 5 | Five Year Plan | 3 | US | early |  |  |  |  |
| 6 | The China Card | 4 | neutral | early |  |  |  |  |
| 7 | Socialist Governments | 3 | USSR | early |  |  |  |  |
| 8 | Fidel | 2 | USSR | early | * |  |  |  |
| 9 | Vietnam Revolts | 2 | USSR | early | * |  |  |  |
| 10 | Blockade | 1 | USSR | early | * |  |  |  |
| 11 | Korean War | 2 | USSR | early | * |  | W |  |
| 12 | Romanian Abdication | 1 | USSR | early | * |  |  |  |
| 13 | Arab-Israeli War | 2 | USSR | early |  |  | W |  |
| 14 | Comecon | 3 | USSR | early | * |  |  |  |
| 15 | Nasser | 1 | USSR | early | * |  |  |  |
| 16 | Warsaw Pact Formed | 3 | USSR | early | * |  |  |  |
| 17 | De Gaulle Leads France | 3 | USSR | early | * |  |  |  |
| 18 | Captured Nazi Scientist | 1 | neutral | early | * |  |  |  |
| 19 | Truman Doctrine | 1 | US | early | * |  |  |  |
| 20 | Olympic Games | 2 | neutral | early |  |  |  |  |
| 21 | NATO | 4 | US | early | * |  |  |  |
| 22 | Independent Reds | 2 | US | early | * |  |  |  |
| 23 | Marshall Plan | 4 | US | early | * |  |  |  |
| 24 | Indo-Pakistani War | 2 | neutral | early |  |  | W |  |
| 25 | Containment | 3 | US | early | * |  |  |  |
| 26 | CIA Created | 1 | US | early | * |  |  |  |
| 27 | US/Japan Mutual Defense Pact | 4 | US | early | * |  |  |  |
| 28 | Suez Crisis | 3 | USSR | early | * |  |  |  |
| 29 | East European Unrest | 3 | US | early |  |  |  |  |
| 30 | Decolonization | 2 | USSR | early |  |  |  |  |
| 31 | Red Scare/Purge | 4 | neutral | early |  |  |  |  |
| 32 | UN Intervention | 1 | neutral | early |  |  |  |  |
| 33 | De-Stalinization | 3 | USSR | early | * |  |  |  |
| 34 | Nuclear Test Ban | 4 | neutral | early |  |  |  |  |
| 35 | Formosan Resolution | 2 | US | early | * |  |  |  |
| 36 | Brush War | 3 | neutral | mid |  |  | W |  |
| 37 | Central America Scoring | 0 | neutral | mid |  | S |  |  |
| 38 | Southeast Asia Scoring | 0 | neutral | mid | * | S |  |  |
| 39 | Arms Race | 3 | neutral | mid |  |  |  |  |
| 40 | Cuban Missile Crisis | 3 | neutral | mid | * |  |  |  |
| 41 | Nuclear Subs | 2 | US | mid | * |  |  |  |
| 42 | Quagmire | 3 | USSR | mid | * |  |  |  |
| 43 | SALT Negotiations | 3 | neutral | mid | * |  |  |  |
| 44 | Bear Trap | 3 | US | mid | * |  |  |  |
| 45 | Summit | 1 | neutral | mid |  |  |  |  |
| 46 | How I Learned to Stop Worrying | 2 | neutral | mid | * |  |  |  |
| 47 | Junta | 2 | neutral | mid |  |  |  |  |
| 48 | Kitchen Debates | 1 | US | mid | * |  |  |  |
| 49 | Missile Envy | 2 | neutral | mid |  |  |  |  |
| 50 | “We Will Bury You” | 4 | USSR | mid | * |  |  |  |
| 51 | Brezhnev Doctrine | 3 | USSR | mid | * |  |  |  |
| 52 | Portuguese Empire Crumbles | 2 | USSR | mid | * |  |  |  |
| 53 | South African Unrest | 2 | USSR | mid |  |  |  |  |
| 54 | Allende | 1 | USSR | mid | * |  |  |  |
| 55 | Willy Brandt | 2 | USSR | mid | * |  |  |  |
| 56 | Muslim Revolution | 4 | USSR | mid |  |  |  |  |
| 57 | ABM Treaty | 4 | neutral | mid |  |  |  |  |
| 58 | Cultural Revolution | 3 | USSR | mid | * |  |  |  |
| 59 | Flower Power | 4 | USSR | mid | * |  |  |  |
| 60 | U-2 Incident | 3 | USSR | mid | * |  |  |  |
| 61 | OPEC | 3 | USSR | mid |  |  |  |  |
| 62 | “Lone Gunman” | 1 | USSR | mid | * |  |  |  |
| 63 | Colonial Rear Guards | 2 | US | mid |  |  |  |  |
| 64 | Panama Canal Returned | 1 | US | mid | * |  |  |  |
| 65 | Camp David Accords | 2 | US | mid | * |  |  |  |
| 66 | Puppet Governments | 2 | US | mid | * |  |  |  |
| 67 | Grain Sales to Soviets | 2 | US | mid |  |  |  |  |
| 68 | John Paul II Elected Pope | 2 | US | mid | * |  |  |  |
| 69 | Latin American Death Squads | 2 | neutral | mid |  |  |  |  |
| 70 | OAS Founded | 1 | US | mid | * |  |  |  |
| 71 | Nixon Plays the China Card | 2 | US | mid | * |  |  |  |
| 72 | Sadat Expels Soviets | 1 | US | mid | * |  |  |  |
| 73 | Shuttle Diplomacy | 3 | US | mid |  |  |  |  |
| 74 | The Voice of America | 2 | US | mid |  |  |  |  |
| 75 | Liberation Theology | 2 | USSR | mid |  |  |  |  |
| 76 | Ussuri River Skirmish | 3 | US | mid | * |  |  |  |
| 77 | “Ask Not What Your Country Can Do For You…” | 3 | US | mid | * |  |  |  |
| 78 | Alliance for Progress | 3 | US | mid | * |  |  |  |
| 79 | Africa Scoring | 0 | neutral | mid |  | S |  |  |
| 80 | “One Small Step…” | 2 | neutral | mid |  |  |  |  |
| 81 | South America Scoring | 0 | neutral | mid |  | S |  |  |
| 82 | Iranian Hostage Crisis | 3 | USSR | late | * |  |  |  |
| 83 | The Iron Lady | 3 | US | late | * |  |  |  |
| 84 | Reagan Bombs Libya | 2 | US | late | * |  |  |  |
| 85 | Star Wars | 2 | US | late | * |  |  |  |
| 86 | North Sea Oil | 3 | US | late | * |  |  |  |
| 87 | The Reformer | 3 | USSR | late | * |  |  |  |
| 88 | Marine Barracks Bombing | 2 | USSR | late | * |  |  |  |
| 89 | Soviets Shoot Down KAL-007 | 4 | US | late | * |  |  |  |
| 90 | Glasnost | 4 | USSR | late | * |  |  |  |
| 91 | Ortega Elected in Nicaragua | 2 | USSR | late | * |  |  |  |
| 92 | Terrorism | 2 | neutral | late |  |  |  |  |
| 93 | Iran-Contra Scandal | 2 | USSR | late | * |  |  |  |
| 94 | Chernobyl | 3 | US | late | * |  |  |  |
| 95 | Latin American Debt Crisis | 2 | USSR | late |  |  |  |  |
| 96 | Tear Down this Wall | 3 | US | late | * |  |  |  |
| 97 | “An Evil Empire” | 3 | US | late | * |  |  |  |
| 98 | Aldrich Ames Remix | 3 | USSR | late | * |  |  |  |
| 99 | Pershing II Deployed | 3 | USSR | late | * |  |  |  |
| 100 | Wargames | 4 | neutral | late | * |  |  |  |
| 101 | Solidarity | 2 | US | late | * |  |  |  |
| 102 | Iran-Iraq War | 2 | neutral | late | * |  | W |  |
| 103 | Defectors | 2 | US | early |  |  |  |  |
| 104 | The Cambridge Five | 2 | USSR | early |  |  |  | O |
| 105 | Special Relationship | 2 | US | early |  |  |  | O |
| 106 | NORAD | 3 | US | early | * |  |  | O |
| 107 | Che | 3 | USSR | mid |  |  |  | O |
| 108 | Our Man in Tehran | 2 | US | mid | * |  |  | O |
| 109 | Yuri and Samantha | 2 | USSR | late | * |  |  | O |
| 110 | AWACS Sale to Saudis | 3 | US | late | * |  |  | O |

### A4. Generator: `build_countries.py` (run: `python3 build_countries.py vendor/DeepStruggle <scratchpad>/ref_boxes.json docs/notes/countries.json`)

```python
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
```

### A5. Reference-board measurement: `ref_boxes.py` (needs Pillow; run with `PYTHONPATH=<scratchpad>/pylib python3 ref_boxes.py ref_boxes.json`)

```python
"""Refine hand-read country box corners on game_resources/TS_map.jpg (2448x1584) by snapping to the
boxes' dark 1-px outlines. Input: rough (left, top) per engine country id, read off 1:1 crops.
Output: ref_boxes.json {id: {left, top, right, bottom, cx, cy, ...}}"""
import json, sys
from PIL import Image
ROUGH = {  # engine id: (left, top) rough, full-res pixels
 0:(402,344), 1:(810,259), 2:(927,117), 3:(1070,180), 4:(950,190), 5:(1210,122), 6:(891,334),
 7:(996,334), 8:(873,419), 9:(796,520), 10:(1014,481), 11:(1147,559), 12:(1338,490), 13:(1041,407),
 14:(1034,262), 15:(1144,262), 16:(1124,334), 17:(1148,407), 18:(1123,482), 19:(1253,407), 20:(1232,482),
 21:(1278,561), 22:(1378,561), 23:(1257,635), 24:(1379,635), 25:(1481,635), 26:(1326,708), 27:(1446,706),
 28:(1415,776), 29:(1208,708), 30:(1100,698),
 31:(1605,587), 32:(1608,679), 33:(1723,729), 34:(1853,744), 35:(1955,755), 36:(1912,829), 37:(2018,829),
 38:(1961,940), 39:(2135,1028), 40:(2174,826), 41:(2137,1155), 42:(2130,716), 43:(2153,488), 44:(2173,561),
 45:(2258,630),
 46:(824,655), 47:(930,622), 48:(1038,614), 49:(814,750), 50:(973,776), 51:(1226,795), 52:(882,889),
 53:(1013,877), 54:(1302,870), 55:(1417,902), 56:(1061,961), 57:(1187,996), 58:(1313,966), 59:(1095,1083),
 60:(1223,1120), 61:(1327,1064), 62:(1189,1195), 63:(1139,1275),
 64:(84,641), 65:(176,716), 66:(141,795), 67:(249,789), 68:(237,863), 69:(355,789), 70:(355,860),
 71:(361,695), 72:(461,760), 73:(567,760),
 74:(424,949), 75:(313,982), 76:(373,1061), 77:(482,871), 78:(483,1129), 79:(666,1055), 80:(544,1208),
 81:(425,1215), 82:(461,1356), 83:(578,1299),
}
im = Image.open('game_resources/TS_map.jpg').convert('RGB')
W, H = im.size
L = im.convert('L').load()
def row_dark(y, x0, x1):
    xs = range(max(0,x0), min(W,x1)); return sum(1 for x in xs if L[x,y] < 80) / max(1,len(xs))
def col_mean(x, y0, y1):
    ys = range(max(0,y0), min(H,y1)); return sum(L[x,y] for y in ys) / max(1,len(ys))
def row_mean(y, x0, x1):
    xs = range(max(0,x0), min(W,x1)); return sum(L[x,y] for x in xs) / max(1,len(xs))
out = {}
def perim(l, t, w, h):
    # mean darkness along the rectangle's four sides (outline is ~1px, near-black)
    tot = n = 0
    for x in range(l, l+w+1, 2):
        tot += 255 - L[x, t]; n += 1
    for y in range(t, t+h+1, 2):
        tot += (255 - L[l, y]) + (255 - L[l+w, y]); n += 2
    return tot / n
for cid, (l, t) in ROUGH.items():
    best = None
    for w in (94, 95):
        for h in (62, 63):
            for dt in range(-7, 8):
                for dl in range(-7, 8):
                    sc = perim(l+dl, t+dt, w, h) - 1.0*(abs(dl)+abs(dt))
                    if best is None or sc > best[0]: best = (sc, l+dl, t+dt, w, h)
    sc, left, top, w, h = best
    out[cid] = dict(left=left, top=top, right=left+w, bottom=top+h, w=w, h=h,
                    cx=round(left+w/2), cy=round(top+h/2), score=round(sc,1), moved=(left-l, top-t))
json.dump(out, open(sys.argv[1] if len(sys.argv)>1 else 'ref_boxes.json','w'), indent=1)
for cid, b in out.items():
    flag = '' if (b['score']>120 and max(map(abs,b['moved']))<=8) else '  <-- CHECK'
    print(cid, b['left'], b['top'], b['right'], b['bottom'], 'c', (b['cx'], b['cy']), 'score', b['score'], 'mv', b['moved'], flag)
```

Other generators in the scratchpad: `board_ref.py` (writes `board_ref_positions.json`, draws a check overlay) and `build_cards.py` (writes `cards_meta.json`, cross-checks engine vs `rules/cards.json` vs `card_text.json` vs gallery filenames; result: no problems).
