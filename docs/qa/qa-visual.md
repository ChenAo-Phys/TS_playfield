# QA: visual and text audit (qa-visual)

Date: 2026-11-22. Dev server 5185 (no HMR), the composed fixture demo `src/ui/screens/demo/index.html?scene=…` for the
game states, the stage demo `src/ui/stage/demo/index.html?moment=…` for endings that have no fixture (Europe control,
final scoring, Wargames, draw) and the turn-8 banner, the live app for start / boot error / loading / resume, and a
production build + preview (4185, scratch dir) for fonts and the dev-hook check. Compared with
`docs/design/shots/final-*.png` and the prompts/stage handoff shots.

Scripts (scratch dir `$SP/qa-visual`): `qa.mjs` (screenshot + DOM audit per state × viewport × language: horizontal scroll,
text clipped by an overflow ancestor, ellipsis/line-clamp without a tooltip, off-screen text, overlapping text,
contrast on solid backgrounds, en-XA strings without ⟦⟧, Latin text in zh, font load errors, console errors),
`analyze.mjs` (aggregates `matrix*/audit.jsonl`), `probe.mjs` + `p/*.mjs` (one-off DOM probes; `TSP_BLOCK=<glob>` aborts
a request), `elshot.mjs`, `crop.mjs`, `mont.mjs` (montages). Full screenshot sets: `$SP/qa-visual/matrix/` (1008 jobs) and
`$SP/qa-visual/matrix2/` (177 jobs).

**Progress: done.** Both matrices shot, DOM-audited and reviewed (montages per state); every finding below reproduced at
least twice (matrix + probe, or two viewports / scenes). 13 findings: 2 major, 7 minor, 4 polish (one owner decision).

## Summary

| # | Sev. | Finding | Where |
|---|---|---|---|
| F1 | major | Dice tray runs off screen (phones) / over the slip column (compact landscape) | `stage/DiceTray.tsx` |
| F7 | major | Compact landscape & 200 % zoom: play-mode choices and the card sheet's Play button below the fold | `prompts/PlayModeStage`, `cards/CardSheet` |
| F2 | minor | 360×740 (+ zh compact landscape): VP readout "苏…", dock "Hand…" | `console`, `compact/BottomDock` |
| F3 | minor | Chernobyl region buttons "MIDDLE E…" / "CENTRAL…" on compact | `prompts/RegionChoice` |
| F4 | minor | Log shows raw flag "MISSILE_ENVY_USSR" (en + zh) | `game/describe.ts` / `effects.json` |
| F5 | minor | Game-over log line doesn't name the winner ("USSR — Resignation") | `prompt.json` |
| F6 | minor | "Turn 8 · AR 9", "Turn 7 · AR 8", slip "Turn 3 · AR 7" at turn end | telex, slip head, console |
| F8 | minor | Phones (en): "INFLUENC…" play-mode button cut | `prompts/PlayModeStage` CSS |
| F12 | minor | No target list in compact landscape / at 200 % zoom (no List button, `T` inert) | `prompts/OrdersSlip` |
| F9 | polish | Portrait tablet pile viewer: 2 fixed narrow columns | `CardPicker.module.css` |
| F10 | polish | Boot error: disabled side folders still look enabled (busy cursor) | `StartScreen.module.css` |
| F11 | polish, owner | 1280–1366: 6-card hand shows no names (55 % overlap cap) | `tray` |
| F13 | polish | Accessible names "1 targets" / "1 cards"; zh wordmark label "冷战热斗 Playfield" | `ui_shell.json`, `ui_console.json` |

## States × viewports checked

Languages per cell (XA = en-XA pseudo-locale). 200 % = 1440×900 at 200 % zoom, emulated as a 720×450 CSS viewport at
DPR 2 (it reflows into compact landscape). Phones/tablet portrait use touch + DPR 2. ✗ = the scripted step failed in
that cell (compact landscape has no grab for the target list, see F12; the 200 % discard viewer needs touch); those
cells were covered by the probes instead. (*) Playwright's route did not intercept the model download (it runs in a
worker), so "AI model blocked" shows the ready state; the AI-error line was not observed.

| State | 1920×1080 | 1440×900 | 1366×768 | 1280×720 | 1024×768 | 768×1024 | 390×844 | 844×390 | 360×740 | 200 % |
|---|---|---|---|---|---|---|---|---|---|---|
| Start screen (live app) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | zh en XA | en zh XA | en zh | en zh |
| Boot error (engine blocked) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI model blocked (*) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Loading (model delayed) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Influence prompt | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Coup target + tooltip | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI turn: reveal dock + dice | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline papers | en zh | en zh XA | en zh | en zh | en XA zh | en zh | en XA zh | en zh XA | en zh | en zh |
| AI event turn (shoot.mjs moment) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Game over: 20 VP telex | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Game over: nuclear war | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Game over: held scoring card | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Game over: mil-ops penalty | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Game over: resign | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Action-card prompt | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| China Card offered | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Card warnings | en zh | en zh XA | en zh | en zh | en XA zh | en zh | en zh XA | en zh XA | en zh | en zh |
| Mid-game board + log | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en XA zh | en zh XA | en zh | en zh |
| Play-mode stage | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Play-mode, opponent card | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Op-mode | en zh | en zh XA | en zh | en zh | en XA zh | en zh | en XA zh | en zh XA | en zh | en zh |
| Region prompt (Chernobyl) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en XA zh | en zh XA | en zh | en zh |
| Event card from hand (UN Intervention) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Branch dossier | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| DEFCON dossier | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Realign target | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Setup placement (US) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline choice (turn 4) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline committed | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Settings | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| About | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Shortcuts | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| New-game confirm | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Resign confirm | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Menu | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Target list | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA |  ✗ | en zh |  ✗ |
| Card zoom / card sheet | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Hand drawer | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Discard pile viewer | en zh | en zh XA | en zh | en zh | en zh XA |  ✗ |  ✗ |  ✗ |  ✗ |  ✗ |
| Turn-end + era banner (turn 4) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| DEFCON 2 danger frame | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Start screen with Resume | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: Europe control | – | en zh XA | en zh | – | en zh | zh en | en zh XA | en zh | zh en | en zh |
| Final scoring sheet | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Telex: final scoring | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Telex: Wargames | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Telex: draw | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Era banner turn 8 | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Scoring sheet (AI card) | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Scoring sheet (net +3) | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Reshuffle toast | – | en zh XA | en zh | – | en zh | en zh | en zh XA | en zh | en zh | en zh |
| Discard pile viewer (compact) | – | – | – | – | – | en zh | en zh XA | en zh | zh en |  ✗ |

Also checked outside the matrix: the compact menu sheet (390 zh), the desktop card zoom by hover (1440 en/zh), the card
sheet on phones and in compact landscape, the target list via `T` (1440, 1024, 844, 720×450), the DEFCON 2 frame
(`prompt-action-card-us`), and the production preview (start → USSR setup at 1440 zh and 390 en).

## Checked and fine

- No horizontal page scroll in any of the 1185 shots; no font load errors; no console errors except the deliberately
  blocked engine. Production build: Latin and CJK fonts load, `__tsp` / `__tspAuto` undefined, setup prompt renders.
- Card text vs card image, 10 cards (#7, 19, 33, 53, 61, 77, 86, 95, 104, 108) in en and zh: the zh catalog text is the
  image text verbatim; the en text is the living-rules wording, equivalent to the image (#53 now "any countries
  adjacent"). The zoom (desktop) and card sheet (phone) render exactly that catalog text (spot-checked #31, #105).
- zh map names: all 84 boxes match `docs/glossary.md` (比荷卢, 西葡, 捷克, 沙特, 老挝柬埔寨, 印尼, 撒哈拉, 东南非, 多米尼加…).
- zh glossary scan of rendered text (4 scenes + catalogs): no 稳定值 / 核危机等级 / 调整阵营 / 背面朝上 / 弃置 / 对方 /
  冷战早期 / "N 行动点数"; Latin left in zh is DEFCON, VP, AI, DeepStruggle, the wordmark, the map's USA / USSR plates and
  U.S.A. / U.S.S.R. lettering and the China Card art — all as in `final-desktop-zh.png`.
- en-XA: everything is marked except data (card text, names), map lettering, key names and two log templates whose
  argument splitting defeats the marker check (`log:entry.revealed`, `randomDiscard`; translated in zh).
- Start, settings, about, shortcuts, confirms, menu (popover and compact sheet), headline papers, scoring sheets (fixed
  Continue footer works at 390 and 844), telexes for all eight endings incl. draw (stamp, reason, stats, chart), era
  banners 4 and 8, reshuffle toast, discard viewer, DEFCON dossier, branch dossier match the mockups / handoff shots.

## Not findings (test artefacts)

- **Branch tiles read "Option 1 / Option 2" in the shell demo** (`?scene=prompt-branch`): `branchMeta` needs
  `engineLayout()`, which the FixtureController never loads. The prompts demo (engine loaded) shows "Remove US
  influence / Add USSR influence", so the live app is fine; the shell demo just can't show it.
- **Blank hand cards in some headless shots** (e.g. `prompt-region` at 1440): the `<img>` is complete but not painted
  until `img.decode()`; a headless async-decode artefact, not seen otherwise.
- Headline papers fade the card text out at the bottom of the column by design (excerpt), not a clip.

## Findings

### F1 (major) The dice tray runs off the screen on phones and over the slip column in compact landscape

- **Repro:** `src/ui/screens/demo/index.html?scene=seq-ai-coup&speed=normal&lang=zh` (or `en`) at 390×844 or 360×740
  (touch, DPR 2), wait for the AI's coup on Israel to land. Also 720×450 (= 1440×900 at 200 % zoom) and 844×390.
  Probe: `qa-visual/p/dice.mjs` via `probe.mjs` (scratch dir).
- **Expected:** the tray stays inside the table (`placeBeside` clamps to the stage bounds minus 8 px); the maths line
  "1 + 3 Ops − 2×4 = −4" and the result are fully readable; stage overlays never cover the slip (§3.1, §3.4).
- **Actual:** measured tray rect (CSS px): 390 wide → x 234–453 (63 px past the right edge); 360 → 204–423 (63 px);
  768×1024 → 550–769; 720×450 → 264–483 while the table ends at x 420, so the tray sits over the side column. The
  maths reads "1 + 3 行动点 −" and stops (zh: 49 px cut, en: 26 px). A realignment result ("US −1 · USSR +3") at the same
  spot would be cut the same way. Same in en and zh, reproduced in the matrix run and twice by the probe.
- **Cause (likely):** `PlacedTray` (`src/ui/stage/DiceTray.tsx`) measures `tray.offsetWidth` once per `dice.key`, while
  the tray is still narrow (dice + title); the maths and result lines render later and widen it to ~219 px, and the
  position is never re-clamped. Re-run the placement when the phase reaches `math` (or reserve the final width / use a
  ResizeObserver). Compact-landscape also suggests the host (`offsetParent`) is wider than the table there.
- **Evidence:** `docs/qa/shots/qa-visual/f1-dice-tray-offscreen.jpg` (390×844 zh, 720×450 zh).

### F2 (minor) 360×740 (and zh compact landscape): the console's VP readout and the dock's hand count are cut to "苏…" / "Hand…"

- **Repro:** any game scene at 360×740 (small Android, touch), e.g.
  `src/ui/screens/demo/index.html?scene=prompt-influence&lang=zh`. Probe `qa-visual/p/console.mjs`.
- **Expected:** the compact console shows the VP readout ("苏联 +2") and the dock shows "手牌 · 6" / "Hand · 6" (§3.3).
- **Actual:** zh: `_vpRead` needs 44 px and gets 32 px → "苏…" (who leads and by how much are gone; only the needle
  remains). en fits exactly (49/49). Dock hand label: needs 38–39 px, gets 33 px → "手…" / "Hand…" in both languages
  (also at 390 in en-XA). Seen in all 36 game states of the matrix at 360 (en and zh), confirmed by DOM measurement twice.
  The turn readout "第 2 行动轮 · 苏联（你）" (142 px) takes the width the VP readout needs.
  Compact landscape zh (844×390 and 720×450 = 200 % zoom) is 2 px short: the readout shows "苏联…2" (the sign
  becomes the ellipsis), next to the (accepted) "第 2 行动轮 · 苏…".
- **Likely files:** `src/ui/console/Console.module.css` (compact VP column min width, or shorten the AR readout below
  ~380 px, e.g. drop "（你）"), `src/ui/compact/BottomDock.*` (let the hand label drop the word and keep the count, e.g.
  "▣ 6", below ~380 px).
- **Evidence:** `docs/qa/shots/qa-visual/f2-360-console-dock-zh.jpg`.

### F3 (minor) Chernobyl region buttons cut on phones: "MIDDLE E…", "CENTRAL…", "SOUTH A…"

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-region&lang=en` at 844×390 (also 720×450 = 200 % zoom) and
  390×844 (touch). Probe `qa-visual/p/regionbtn.mjs`.
- **Expected:** every region name readable without a tooltip (touch has none). Desktop and tablet already use the short
  names "C. America" / "S. America" and fit.
- **Actual:** compact layouts use the long names. 844×390: button content 65 px; "Middle East" needs 75, "Central
  America" 100, "South America" 88 → shown as "MIDDLE E…", "CENTRAL…", "SOUTH A…". 390×844: "Central America" is
  100/96 px (clipped edge). The `title` tooltip is the only full text. The `text-overflow: ellipsis` sits on an inline
  `span.regionName`, so the cut is done by the button, not by the span. zh is fine (2–3 characters).
- **Likely file:** `src/ui/prompts/RegionChoice.tsx` (use the short region name in the compact variants too, as on
  desktop) / `OrdersSlip.module.css` `.regionName` (needs `display: block` for its ellipsis to work).
- **Evidence:** `docs/qa/shots/qa-visual/f3-region-buttons-844-en.jpg`.

### F4 (minor) The log prints the raw engine flag "MISSILE_ENVY_USSR" (en and zh)

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-defcon-level&lang=zh` (1440×900), Dispatches: turn 4
  headline lines and AR1. Or `?scene=seq-ai-event&lang=en`. Probe `qa-visual/p/rawid.mjs`.
- **Expected:** a translated effect name (or no line: the next line already says "Missile Envy goes to the USSR hand: the
  USSR must play it for Ops in its next action round").
- **Actual:** "In effect: MISSILE_ENVY_USSR" / "生效中：MISSILE_ENVY_USSR" and "No longer in effect: MISSILE_ENVY_USSR" /
  "不再生效：MISSILE_ENVY_USSR". The engine pushes `MISSILE_ENVY_US` / `MISSILE_ENVY_USSR` into `flags`
  (`state_json.cpp:591`); `effects.json` has no entry for them and `effectName()` falls back to the raw flag. A scan of all
  fixture flags finds only these two (and `DEFCON_SUICIDE_PROVOKED`, already filtered) without a name.
- **Likely files:** `src/game/describe.ts` (`BOOKKEEPING` regex: add `MISSILE_ENVY_(US|USSR)`), or
  `src/i18n/locales/{en,zh-CN}/effects.json` (add names).
- **Evidence:** `docs/qa/shots/qa-visual/f4-raw-effect-id-log-zh.jpg`.

### F5 (minor) Game-over log line does not say who won: "Game over: USSR — Resignation (VP 1, turn 2)"

- **Repro:** `src/ui/screens/demo/index.html?scene=seq-over-resign&start=end&lang=en` (you are the US and resigned);
  last Dispatches line. zh: "游戏结束：苏联——认输（VP 1，第 2 回合）". Probe `qa-visual/p/overlog.mjs`.
- **Expected:** the winner is named as the winner (DS's own template, `log:entry.gameOver`, says "Winner: {{winner}}").
- **Actual:** `prompt:…gameOver` = "Game over: {{winner}} — {{reason}} (VP {{vp}}, turn {{turn}})". With the reason
  "Resignation" it reads as "the USSR resigned", the opposite of what happened; "苏联——认输" reads the same way. The VP is
  the raw signed number ("VP -20" in `seq-over-held-scoring`), without the side the other log lines add ("-20 (USSR)").
- **Likely file:** `src/i18n/locales/{en,zh-CN}/prompt.json` line ~302 ("Game over — {{winner}} wins: {{reason}}…" /
  "游戏结束：{{winner}}获胜——{{reason}}…") and the `vp` argument formatted like `log:change.vp`.

### F6 (minor) Action round past the last one: "Ended Turn 8 · AR 9", "Turn 7 · AR 8", slip "Turn 3 · AR 7"

- **Repro:** `src/ui/screens/demo/index.html?scene=seq-over-milops-vp20&start=end&lang=en` (1440×900): telex "Ended
  Turn 8 · AR 9", slip head "Orders · Turn 8 · AR 9", console "AR 9 · USSR". `?scene=seq-over-held-scoring&start=end`:
  "Turn 7 · AR 8" in all three. `?scene=seq-turn-end&start=begin&speed=slow`: while the console correctly says "End of
  turn 3", the slip head says "Orders · Turn 3 · AR 7" (Early War turns have 6 action rounds). Probes
  `qa-visual/p/telexar.mjs`, `p/artrace.mjs`; seen in en and zh ("第 8 回合 · 第 9 行动轮"). Also
  `?scene=seq-ai-turn&start=begin` (reshuffle at the end of turn 2): slip "Orders · Turn 2 · AR 7" (390, 844, 1024).
- **Expected:** the last action round played (the log's last entry is "AR7 …"), or "end of turn" wording, as the
  console already does during the end-of-turn phase.
- **Actual:** the engine's `action_round` counter has moved past the last round when the turn-end checks run (held
  scoring card, mil-ops penalty, and presumably final scoring), and the telex (`GameOverTelex.tsx:82`,
  `stats.ar = shown.state.action_round`), the slip head and the console print it as is.
- **Likely files:** `src/ui/stage/GameOverTelex.tsx` (show "Turn N · end of turn" when the ending is decided at the turn
  end, i.e. `held-scoring`, `milops-vp20`, `final-scoring`), the slip head in `src/ui/prompts/OrdersSlip.tsx` and the
  console AR readout (`src/ui/console/`) at game over.
- **Evidence:** `docs/qa/shots/qa-visual/f6-telex-turn8-ar9.jpg`.

### F7 (major) Compact landscape / 200 % zoom: the play-mode choices and the card sheet's Play button are below the fold

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-play-mode&lang=en` at 844×390 (touch) or 720×450
  (= 1440×900 at 200 % browser zoom). Also `?scene=prompt-action-card` at 844×390: tap a card in the hand drawer.
  Probes `qa-visual/p/playmode.mjs`, `p/cardsheet.mjs`.
- **Expected:** "How will you play it?" shows its options (Event / Influence · Coup · Realign / Space race / Back to hand)
  on screen, as on 390×844 and on desktop (§8.7); the card sheet shows its primary "Play <card>" button.
- **Actual:** the sheet lays the full-size card image out first; the options start below the viewport. 844×390: sheet
  content 808 px tall in a 281 px scroller, the Event button at y 626–682, Influence / Coup / Realign at 719–775, Space at
  791–847, Back to hand at 863 (viewport 390). 720×450: Event at 559, the rest down to 822. The visible part is the
  card art and the title beside it over an empty dark area, with no hint that the choices are further down. Card sheet:
  "Play Red Scare/Purge" at y 435–479 (scroller 382/281). Keyboard E/I/C/R/S still works, but this layout is the touch
  layout. Same in en, zh, en-XA; seen in the matrix at 844 and 720×450 and twice by probe.
- **Likely files:** `src/ui/prompts/PlayModeStage.tsx` / its CSS (compact-landscape variant: card thumbnail beside the
  options, or options first), `src/ui/cards/CardSheet*` (sticky action footer, as the scoring sheet now has).
- **Evidence:** `docs/qa/shots/qa-visual/f7-playmode-compact-landscape.jpg` (844×390 en, 720×450 zh, card sheet 844×390).

### F8 (minor) Phones, English: the play-mode "INFLUENCE" button label is cut ("INFLUENC", "INFLUEN")

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-play-mode&lang=en` (or `prompt-op-mode`,
  `prompt-play-mode-opponent`) at 390×844 and 360×740, touch. Probe `qa-visual/p/playmode.mjs`.
- **Expected:** the three Operations buttons show "Influence", "Coup", "Realign" whole (§8.7).
- **Actual:** the Influence button's content needs 106 px; it gets 102 px at 390 ("INFLUENC") and 92 px at 360
  ("INFLUEN"), with no ellipsis; "REALIGN" touches the edge at 360. zh is fine. Reproduced on all three scenes at both
  widths.
- **Likely file:** `src/ui/prompts/PlayModeStage.tsx` CSS (smaller icon gap / letter-spacing on narrow screens, or stack
  the icon above the word below ~400 px).
- **Evidence:** `docs/qa/shots/qa-visual/f8-ops-buttons-phone-en.jpg`.

### F9 (polish) Portrait tablet: the pile viewer / card picker uses two fixed narrow columns

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-action-card&lang=en` at 768×1024 (touch): close the hand
  drawer, Status → Discard pile.
- **Expected:** the grid fills the sheet (`repeat(auto-fill, minmax(132px, 1fr))` as on desktop).
- **Actual:** `.compact { grid-template-columns: repeat(2, …); justify-items: center }` gives two columns ~380 px apart
  with ~136 px cards and a large empty middle; the same 2-column rule applies on 820×1180 portrait tablets.
- **Likely file:** `src/ui/prompts/CardPicker.module.css` line 6 (use auto-fill on wide compact sheets).
- **Evidence:** `docs/qa/shots/qa-visual/f9-pile-viewer-768.jpg`.

### F10 (polish) After a boot error the side folders look enabled

- **Repro:** live app `/?lang=en`, block `**/engine/ts_engine.wasm` (probe `qa-visual/p/booterr.mjs` with
  `TSP_BLOCK`), 1440×900.
- **Expected:** with the engine failed, the three folders read as unavailable (dimmed), the Retry being the only action.
- **Actual:** the buttons are `disabled` but keep opacity 1 and `cursor: progress` (a busy cursor that never ends);
  clicking does nothing, with no feedback. Same on 390×844 (`matrix/bootError-390-zh.jpg`).
- **Likely file:** `src/ui/screens/StartScreen.module.css` (disabled style; `cursor: not-allowed` when `status` is
  `error`).

### F11 (polish, owner decision) 1280×720 / 1366×768: a 6-card hand shows no card names

- **Repro:** `?scene=prompt-influence&lang=en` at 1280×720 (also 1366×768, and any 7+ card hand at 1440).
- **Actual:** the hand row is ~380 px for 6 cards × 104 px, so each card shows a ~55 px strip: the caption is the Ops
  badge only (prep-ui's 55 % cap design), and the printed title on the image is under the next card. The player has
  to hover each card to read it. At 1440 with 6 cards the captions are "DUCK AND…", "CULTURAL…", "ARAB-ISR…"
  (the mockup shows two-line names). Asked by prep-ui: I find it acceptable at 1440 but weak at 1280–1366, where it
  is every turn's main decision. Options for the owner: a vertical name on the visible strip, or a smaller card size
  below 1440 px (e.g. 92×129) so that 6 cards fit without overlap.
- **Evidence:** `docs/qa/shots/qa-visual/f11-hand-1280-names-hidden.jpg`.

### F12 (minor) Compact landscape and 200 % zoom have no target list

- **Repro:** `src/ui/screens/demo/index.html?scene=prompt-influence&lang=en` at 844×390 (touch) or 720×450 (= 1440×900
  at 200 % zoom, mouse + keyboard). Probe `qa-visual/p/tlist.mjs`.
- **Expected:** the target list (§8.13, the accessible alternative to the map) reachable: desktop/tablet have the slip's
  "List T" button and the `T` key; compact portrait has the expanded sheet (grab).
- **Actual:** the side-column slip has no List button and no grab (handoff deviation 9), and `T` opens nothing
  (desktop 1440 and tablet 1024 open the "Targets" listbox with the same probe). A keyboard or screen-reader user at
  200 % zoom loses the list entirely.
- **Likely files:** `src/ui/prompts/OrdersSlip.tsx` (render the List button in the compact-landscape variant too) and
  the `T` binding's layout guard.

### F13 (polish) Accessible names: "S. America: 1 targets", "Your hand: 1 cards"

- **Where:** the theatre chips' accessible names on compact (`ui_shell:theatre.count` = "{{region}}: {{count}} targets").
  Seen on `?scene=prompt-influence` at 390×844 / 844×390.
- **Also:** `ui_shell:dock.handAria` "Your hand: {{count}} cards" and `dock.adversaryAria` "Adversary: {{count}} cards in
  hand" say "1 cards" with one card (all three are accessible names, not visible text).
- **Fix:** add `_one` / `_other` plural forms in `src/i18n/locales/en/ui_shell.json` (zh needs none).
- **Related (polish):** the zh console wordmark's accessible name is "冷战热斗 Playfield：打开菜单" (`ui_console.json`
  line 7) while the zh document title and dossier tabs say "冷战热斗 · AI 对战".

