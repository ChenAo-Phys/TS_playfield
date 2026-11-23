# Chinese glossary (简体中文术语表)

The Chinese UI uses the words printed on **our Chinese card images** (`game_resources/Chinese_card_gallery/`,
text in `game_resources/card_text.json`). A player reads the cards and the interface side by side, so both
must say the same thing. DeepStruggle's zh-CN catalogs (MIT) were reviewed against the cards and migrated to
these terms (2026-11-22); `tests/i18n/catalogs.test.ts` fails if a superseded term comes back.

Checked on the images: #36 小规模战争 (稳定度, 骰点, 修正后骰点, 军事行动轨道), #38 东南亚计分 (双方计分, 计分后移出游戏,
不得持有), #47 军政府 (政变, 调整掷骰, 行动点数), #80 "个人的一小步……" (太空竞赛轨道, VP), #103 叛逃者 (头条阶段, 行动轮,
弃牌堆), plus era bands 战争早期/中期 on every card.

## Terms

| English | 中文 | Notes / source |
|---|---|---|
| DEFCON | **DEFCON** | Never 核危机等级 (DS). Cards: "DEFCON 降低 1 级", "DEFCON 提升 2 级", "DEFCON 等级" (#4, #34, #41). Degrade = 降低, improve = 提升. |
| Victory Points / VP | **VP** | Cards say "获得 1 VP" (46×). Use VP with numbers and in compact UI ("+2 VP", "VP：3"). 胜利点数 only as a long label (track title, `ui:track.vpLong`). |
| Operations / Ops value | **行动点数** | "本卡牌的行动点数" (#47). With a number: "4 行动点" (#20, #25, #47 "最低为 1 行动点"), `ui:card.ops`; never "4 行动点数" (tested in the i18n-owned catalogs). |
| Operations card | 行动卡 | #42, #44 |
| Influence | 影响力 | "添加 2 点影响力", "移除…影响力" |
| Coup / coup attempt | **政变** / 进行政变 | Roll: 政变掷骰 (#43). "Free coup" = 免费政变 (#47). |
| Realignment | **调整** / 进行调整 | Roll: **调整掷骰** (#21, #47, #93). Never 调整阵营 (DS). |
| Battleground (country) | 战场国 | |
| Stability (number) | **稳定度** | UI and cards, taken from our card image #36, which prints "稳定度为 1 或 2". Never 稳定值. |
| Military Operations (track) | 军事行动 / 军事行动轨道 | "在其军事行动轨道上增加 2" (#11) |
| Space Race (track) | 太空竞赛 / 太空竞赛轨道 | #80 |
| Headline / Headline Phase | 头条 / 头条阶段 | #103; headline card = 头条牌 |
| Action Round | 行动轮 | "第 3 行动轮" |
| Turn | 回合 | "第 4 回合", "本回合剩余时间内" |
| Early / Mid / Late War | **战争早期 / 战争中期 / 战争晚期** | Era band on every card. Never 冷战早期… (DS). |
| Presence / Domination / Control | 存在 / 支配 / 控制 | Scoring cards |
| Scoring card | 计分牌 | |
| Both sides score: | 双方计分： | scoring-card label |
| MAY NOT BE HELD | 不得持有 | scoring-card label |
| Remove from play (if used as an event / after scoring) | 移出游戏 (若作为事件使用，则移出游戏。/ 计分后移出游戏。) | card labels |
| OPTIONAL | 可选 | optional-card label |
| Event / associated Event | 事件 / 关联事件 | US Event 美国事件, USSR Event 苏联事件, neutral 双方事件 |
| Card | 卡牌 | (牌 in compounds: 手牌, 计分牌, 头条牌) |
| Hand | 手牌 | |
| Draw pile / deck | **抽牌堆** | Never bare 牌堆 for the draw deck. |
| Discard (verb) / discard pile | **弃掉** / 弃牌堆 | Never 弃置 (DS). "随机弃掉 1 张卡牌" (#92). |
| Face up / face down | 正面朝上 / **正面朝下** | #71 "正面朝下，且不可立即打出". Never 背面朝上 (DS). |
| The China Card | 中国牌 | |
| Die / roll / modified roll | 骰子 / 掷骰, 骰点 / 修正后骰点 | "掷一枚骰子", "骰点 -1" |
| Phasing player | 行动玩家 | #39, #69 |
| Player who played the card | 出牌玩家 | #20, #24, #36 |
| Opponent / superpower | 对手 / 超级大国 | "敌方超级大国" on scoring cards ("与敌方超级大国相邻"). Never 对方 (DS). |
| Adjacent | 相邻 | |
| US / USSR | 美国 / 苏联 | `common:side.*` |
| Twilight Struggle | 冷战热斗 | Usual Chinese title (`common:brand`) |

## Regions and subregions

欧洲 Europe · 亚洲 Asia · 中东 Middle East · 非洲 Africa · 中美洲 Central America · 南美洲 South America ·
西欧 Western Europe · 东欧 Eastern Europe · 东南亚 Southeast Asia. Source: `src/data/countries.ts` (`REGIONS`,
`SUBREGIONS`), mirrored in `ui:region.*` (a test keeps them equal).

## Country names

DeepStruggle's zh-CN names (standard PRC forms: 西德/东德, 朝鲜/韩国, 扎伊尔, 科特迪瓦, 台湾), with these changes
(`ZH_NAME_OVERRIDES` in `tools/gen-data.mjs`):

| id | English | DS | ours | why |
|---:|---|---|---|---|
| 6 | Benelux | 比荷卢联盟 | 比荷卢 | the box is the three countries, not the Benelux Union |
| 50 | Saharan States | 撒哈拉诸国 | 撒哈拉国家 | one pattern for the multi-country boxes |
| 61 | SE African States | 东南非洲诸国 | 东南非洲国家 | card #52 text says 东南非洲国家 |

Kept: 西非国家 (49), 海湾国家 (27), 西班牙/葡萄牙 (9), 老挝/柬埔寨 (35, the board's order; card #38's text lists
"柬埔寨/老挝" because the English card says "Cambodia/Laos"). Short map labels (`short.zh`, shown at the map's standard
zoom, ui-spec §4.3): 西葡 (9), 捷克 (16), 沙特 (28), 老挝柬埔寨 (35), 印尼 (39), 撒哈拉 (50), 东南非 (61), 多米尼加 (73).
English short labels follow DeepStruggle's plus the map's: W. Germany, Spain/Port., E. Germany, Laos/Camb., N. Korea,
S. Korea, W. Afr. St., Saharan St., SE Afr. St., S. Africa (`EN_SHORT_NAMES` / `ZH_SHORT_NAMES` in `tools/gen-data.mjs`).

## War Table UI words (`ui:` keys, `tools/ui-keys.mjs`)

The UI spec (docs/design/ui-spec.md §14.1) gives Chinese copy; where it differs from this glossary, the glossary wins
(稳定度 not 稳定值; "N 行动点" after a number).

| English | 中文 | Where |
|---|---|---|
| Orders · Turn 5 · AR 3 | 指令 · 第 5 回合 · 第 3 行动轮 | slip head (`ui:slip.orders`) |
| Your move | 轮到你 | slip stamp |
| Adversary | 对手 | rail (`ui:adversary.title`) |
| DeepStruggle AI · full strength | DeepStruggle AI · 全力以赴 | |
| Dispatches (the log) | 电报 | `ui:log.title` |
| In effect | 生效中 | effect chips |
| Permanent / This turn / Conditional / Space perk | 永久 / 本回合 / 有条件 / 太空竞赛特权 | effect durations (= `cards:effect.*`) |
| If scored / Even / {side} wins | 若计分 / 持平 / {side}获胜 | region plates |
| Pres / Dom / Ctrl | 存在 / 支配 / 控制 | plate chips (abbreviations of the scoring-card words) |
| Undo play | 撤销本次出牌 | `ui:game.undo` |
| Skip / Skip to my turn | 跳过 / 跳到我的回合 | AI presentation |
| Commit headline | 确定头条 | |
| Launch coup | 发动政变 | |
| Take command | 开始指挥 | start screen |
| Enter / Space / arrow keys | 回车 / 空格 / 方向键 | keyboard hints |
| United States / Soviet Union (in sentences) | 美国 / 苏联 | `ui:side.long.*` |

## Card titles

Always our `card_text.json` titles (they are on the images): use `cardName(id)` and never type a title into a
message. Where a catalog message names a card in its text (DeepStruggle's HUD/effects messages), it uses our
title verbatim. DeepStruggle's differing titles were replaced, e.g. 北大西洋公约组织 → **北约**, 首脑峰会 → **峰会**,
局部战争 → **小规模战争**, 开放政策 → **公开性**, 奥德里奇·艾姆斯 → **奥尔德里奇·艾姆斯**, 向苏联出售谷物 → **向苏联出售粮食**
(full list: docs/notes/map-i18n-assets.md §A2).

## Style

- One space between Chinese and Latin letters or numbers, as on the cards: "DEFCON 降低 1 级", "获得 2 VP",
  "第 3 回合". No space before full-width punctuation.
- Full-width punctuation in Chinese text: ，。：；（）“”、. Ellipsis ……, dash ——.
- Address the player as 你; the AI is "AI" (or DeepStruggle).
- Numbers stay Arabic numerals (the cards do).
- Card numbers: "#21".
