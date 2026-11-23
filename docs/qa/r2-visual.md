# QA round 2: visual and text audit (r2-visual)

Date: 2026-11-23. Dev server 5185 (no HMR) for the shell demo (`src/ui/screens/demo/index.html?scene=…`), the stage demo
(`src/ui/stage/demo/index.html?moment=…`: Europe control, final scoring, Wargames, draw, turn-8 banner), the tray demo
(`?drop=…&staged=…`) and the live app (start, boot errors, loading, resume, tampered save, two tabs); a production build
+ preview on 4185 (scratch `dist/`) for the production checks. Compared with `docs/design/shots/final-*.png`.

Scratch dir: `$SP/r2-visual`.
- `matrix/`: `shoot.mjs` regenerated (84 shots, "no problems", no horizontal scroll).
- `matrix2/` + `audit-final.jsonl`: `qa.mjs` (round 1's audit, extended): 57 states × 10 viewports × en / zh (+ en-XA at
  1440, 1024, 390, 844) = 1368 jobs, each a JPEG and a DOM audit (horizontal scroll, text clipped by an overflow ancestor,
  ellipsis without tooltip, off-screen text, overlapping text, contrast on solid backgrounds, en-XA strings without ⟦⟧,
  Latin in zh, font errors, console errors). `analyze.mjs` aggregates; `table.mjs` builds the table below; `mont.mjs` montages (`m/`).
- `spinerun.mjs` + `p2/spines.mjs` (`spines/`: 75 hand crops at DSF 2 + `spines.json`), `p2/spinecover.mjs`,
  `p2/spinezoom.mjs` (per-spine PNGs, `sz/`, `sz6/`), `p2/turnar*.mjs`, `p2/slipfoot.mjs`, `p2/menu.mjs`,
  `p2/superseded.mjs`, `p2/zoom73.mjs`, `p2/aiwait.mjs`, `p2/tlist.mjs`, `p2/escfocus.mjs`, `p2/traydim.mjs`, `p2/prod.mjs`;
  run with `node probe.mjs <url> <vp> <script> [shot.jpg]` (env `DSF=`, `SHOTDIR=`, `CARD=`).

**Progress: done.** Matrix shot, audited and reviewed (montages per state); every finding reproduced at least twice
(matrix + probe, or two viewports / languages / scenes). 6 findings: 1 major, 4 minor, 1 polish. All servers stopped.

## Summary

| # | Sev. | Finding | Where |
|---|---|---|---|
| V1 | major | English card text (zoom, card sheet) omits clauses printed on the card image: #73 / #35 final scoring, #100, #103, #87, #6 | `game_resources/card_text.json` → `src/data/cards.ts` |
| V2 | minor | Tampered / corrupted save toast says "made with another version of the engine or AI" | `StartScreen.tsx`, `App.tsx`, `ui.json` |
| V3 | minor | Tablet zh: spines cut into wrong characters ("我们在德黑羊", "红色恐慌太") | `cards.module.css` (`.small .spine`, zh) |
| V4 | minor | Mid-round endings: slip head + console "End of turn N" vs telex "Turn N · AR M" (Q-031 follow-up) | `common/turnAr.ts` |
| V5 | minor | 1024×768 Chernobyl region prompt: Undo play pushed out of the slip (11 of 26 px, not tappable) | `OrdersSlip.module.css`, `RegionChoice.tsx` |
| V6 | polish | zh dock "记录" (mockup / glossary 电报); en "Font licence" vs "licenses" | `ui_shell.json` (zh, en) |

## The round-2 changes

- **Hand spines (OD-3).** Real app (production, 1366 en / 1280 zh, USSR setup, 8 cards) and shell demo (9, 8 + headline
  slot, 7, 6, 5 cards × 1920 / 1440 / 1366 / 1280 / 1024 × en / zh / en-XA, DSF 2): every overlapped card has a spine,
  the rightmost and any hovered / keyboard-focused / staged card show the caption, no spine is covered by a neighbour
  (elementsFromPoint along each spine), no spines at 1920, tags / KNOWN TO AI eye / HEADLINE stamp / unplayable dims
  (`filter: saturate(.3) brightness(.7)`) work in the tray demo. Contrast: US paper on navy 13.8:1, neutral 11.8:1,
  USSR gold on red 6.4:1. Fonts: en 10.5 px Barlow Condensed (9.5 px tablet), zh 12 px (11.5 px tablet). English ends long
  names with "…" (1 per hand at 1280-1440, 2 on tablet; 2-8 in en-XA). Chinese fits everywhere on desktop but not on the
  tablet (V3). When 8-9 cards overflow into the hand's scroll mode (1280-1366 with the headline slot), the last card or
  two sit past the edge fade, as designed (`Hand.module.css .scrolling`).
- **AI wait (OD-2).** Sampled every second at 1440 and 1024: "Still thinking · 8 s" … "· 24 s", the note box never moves
  or changes width as the number ticks; at 20 s the 1440 slip continues with the one-time sentence (box 15 → 30 px tall,
  once), the 1024 slip keeps one line and the same sentence comes as a toast. All 24 cells of the `aiwait` state (22.5 s)
  show it without clipping, including 844×390, 200 % and 360×740; en-XA marked. zh "仍在思考 · 23 秒。在这台设备上，全力以赴的
  AI 每步最多可能需要一分钟。" reads well.
- **About save line.** Shown after the intro in en and zh at every viewport (also in the production build); wording is
  clear and honest.
- **Esc → Back to hand.** At 1366 the returned card has focus, `:focus-visible`, is lifted and shows its caption.
- **Production preview** (4185): no `__tsp` / `__tspAuto`, no rulebook PDF or map image in `dist/`, setup hand spines,
  About line, no console errors.

## States × viewports checked

Languages per cell (XA = en-XA). 200 % = 1440×900 at 200 % zoom, emulated as 720×450 at DSF 2. Phones / portrait tablet:
touch + DSF 2. ✗ = the scripted step did not apply there; those cells were covered otherwise: the desktop discard viewer
does not exist on compact layouts (the compact one is `discardC`, which needs touch); compact landscape and 200 % reach
the target list through the slip's List button, checked by `p2/tlist.mjs` (a full-screen list sheet opens, en and zh).

| State | 1920 | 1440 | 1366 | 1280 | 1024 | 768×1024 | 390×844 | 844×390 | 360×740 | 200 % |
|---|---|---|---|---|---|---|---|---|---|---|
| Start screen (live) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Boot error (engine blocked) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI model blocked | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Loading (model delayed) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Influence prompt | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Coup target + tooltip | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI turn: dock + dice | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline papers | en zh | en XA zh | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI event / scoring sheet | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: 20 VP | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: nuclear war | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: mil-ops penalty | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: resignation | en zh | en zh XA | en zh | en zh | zh en XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: held scoring card | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: Europe control | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Final scoring sheet | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: final scoring | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: Wargames | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Telex: draw | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Era banner turn 8 | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Action-card prompt (7 cards) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| China Card offered | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Card warnings | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Mid-game board + log | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Play-mode stage | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Play-mode, opponent card | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Op-mode | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Region prompt (Chernobyl) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Card picker (UN Intervention) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Branch dossier | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en XA zh | en zh XA | en zh | en zh |
| DEFCON dossier | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Realign target | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Setup placement (US) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline choice, 9 cards (spines) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Headline committed, 8 + slot (spines) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Settings | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| About (new save line) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Shortcuts | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| New-game confirm | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Resign confirm | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Menu | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Target list | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en✗ zh✗ XA✗ | en zh | en✗ zh✗ |
| Card zoom / card sheet | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Hand drawer | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Discard pile viewer | en zh | en zh XA | en zh | en zh | en zh XA | en✗ zh✗ | en✗ zh✗ XA✗ | en✗ zh✗ XA✗ | en✗ zh✗ | en✗ zh✗ |
| Turn-end + era banner (turn 4) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| DEFCON 2 danger frame | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Scoring sheet (AI card) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Scoring sheet (net +3) | en zh | en zh XA | zh en | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Reshuffle toast | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Discard pile viewer (compact) | en✗ zh✗ | en✗ zh✗ XA✗ | en✗ zh✗ | en✗ zh✗ | en✗ zh✗ XA✗ | en zh | en zh XA | en zh XA | en zh | en✗ zh✗ |
| Coup, 5-card US hand (spines) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Coup, 7-card hand (spines) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| AI wait 22 s (count + one-time hint) | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Incompatible / tampered save toast | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Hovered spined card | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en zh XA | en zh XA | en zh | en zh |
| Start screen with Resume | en zh | en zh XA | en zh | en zh | en zh XA | en zh | en XA zh | zh en XA | en zh | zh en |

Also checked outside the matrix: the superseded-tab notice (live app, two tabs of one profile, 1440 en and 390 zh:
"This game continued in another tab" / Reload, focus on Reload), the compact menu sheet (390 zh), the card zoom text of
#73 and #105 (en) and #73 (zh) in the browser, the slip buttons of the region prompt at 1024 / 1280 / 1366 (mouse and
touch), the game-over readouts of five endings (`p2/turnar.mjs`), the tray demo with `drop=31,73&staged=24`, and the
production preview.

## Checked and fine

- No horizontal page scroll in any of the 1452 shots; no font load errors; no console errors except the deliberately
  blocked engine / model; no low-contrast text on solid backgrounds.
- Round-1 fixes hold: dice tray inside the table, play-mode choices and the card sheet's Play button in compact landscape
  and at 200 %, "INFLUENCE" whole at 360-390, short region names on compact, 360×740 VP readout and dock label whole,
  boot-error folders dimmed, target list reachable in compact landscape, Missile Envy names in the log, game-over log
  line, telex "End of turn 7 / 8" for held-scoring and mil-ops endings.
- Card text vs card image, 10 random cards (#5, 14, 27, 40, 48, 68, 73, 89, 101, 110): the zh text is the zh image text
  verbatim on all ten; the en text is equivalent to the image on nine, not on #73 (V1). A follow-up scan of all 110
  (zh notes, card cross-references, final-scoring / space-race clauses) found the other V1 cards.
- zh: no glossary violations in the catalogs (稳定值, 核危机等级, 调整阵营, 背面朝上, 弃置, 对方, 冷战早期, "N 行动点数") and no
  missing CJK-Latin spaces in the `ui*` catalogs; the Latin left in zh shots is the accepted set (DEFCON, VP, AI,
  DeepStruggle, AR1 / T5 in the log as in `final-desktop-zh.png`, key names, credits).
- en-XA: everything marked except data (card text, names), map lettering, key caps (Esc) and the two log templates
  round 1 already noted.
- Start (en / zh vs `final-start*.png`), desktop 1440 / 1366 and AI turn vs `final-desktop-*.png` / `final-ai.png`,
  coup vs `final-coup.png`, phone vs `final-phone*.png`: same layout; the hand now shows spines where the mockup has
  six named cards (owner decision OD-3).
- All eight telex endings, final scoring sheet, scoring sheets, headline papers, era banners 4 and 8, DEFCON 2 frame,
  reshuffle toast, settings, about, shortcuts, confirms, menu, card zoom / card sheet, hand drawer, pile viewers, boot
  error, loading, resume: no clipping or overlap beyond the accepted clamps listed below.

## Not findings (by design, accepted in round 1, or test artefacts)

- Accepted clamps / ellipses with a tooltip: slip titles ("UN Intervention: choose an opponent's card to play for…"),
  slip hints (one line below 820 px height), the crumb's card name, the phone ticker, the start screen's 2-line folder
  descriptions on 360 / 844×390 / 200 %; the 844×390 headline papers run past the bottom (round 1 identical).
- "Option 1 / Option 2" branch tiles in the shell demo (no engine layout in the FixtureController; round 1).
- Stage-demo telexes say "Turn 6 · AR 1" / "End of turn 8" for draw / Wargames because the demo plays a synthetic ending
  on the turn-6 midgame board.
- The menu "did not open" in the matrix at 390 / 844: the card prompt's auto-opened hand drawer took the first tap; with
  no drawer the menu sheet opens normally (`p2/menu.mjs`).
- Audit "overlaps" between a title's line box and the next line, the turn track's double numeral, and transient toasts
  over the start screen's header.

## Findings

### V1 (major) English card text in the zoom / card sheet is DeepStruggle's old wording: it omits clauses printed on the card image

- **Repro:** shell demo `src/ui/screens/demo/index.html?scene=prompt-headline&lang=en` at 1440×900: focus Shuttle Diplomacy
  (#73) in the hand and press Space (or long-press it on a phone). Compare the text panel with the card image beside it.
  Data check (no browser): `node --experimental-strip-types` over `src/data/cards.ts`, `text.en` vs `text.zh` vs
  `public/cards/en/NNN.webp`.
- **Expected:** the text panel ("Text shown is the current errata") says what the English card image and the Chinese text
  say, which is also what the engine does (`vendor/DeepStruggle/engine/src/scoring.cpp:49-51, 336-341`).
- **Actual:** `text.en` is DeepStruggle's `rules/cards.json` description (docs/notes/map-i18n-assets.md §6 risk 1, never
  revisited), and it leaves out rules clauses that the image and `text.zh` carry:
  - **#73 Shuttle Diplomacy:** no "Does not count for Final Scoring at the end of Turn 10" (image and zh: 对第 10 回合结束时的
    最终计分无效); also the typo "which ever comes first".
  - **#35 Formosan Resolution:** only "when the Asia Scoring Card is played"; the image and zh add "or during Final Scoring
    at the end of Turn 10. Taiwan is not a Battleground country for any other game purpose."
  - **#100 Wargames:** no "(without Final Scoring Phase)" (zh: 不进行最终计分).
  - **#103 Defectors:** no "(unless played on the Space Race)" for the USSR's 1 VP (zh: 用于太空竞赛时除外).
  - **#87 The Reformer:** no "Improves effect of 'Glasnost' event" (zh: 本事件增强"公开性"(#90) 事件的效果).
  - **#6 The China Card:** no "cancels Formosan Resolution if played by the US" (zh note: 若由美国打出本卡牌，则取消"台湾决议案"(#35) 的效果).
  The Chinese text matched the Chinese images verbatim on all 10 sampled cards (#5, 14, 27, 40, 48, 68, 73, 89, 101, 110).
- **Likely files:** `game_resources/card_text.json` (`text_en` of 6, 35, 73, 87, 100, 103; worth a full pass against the
  English images) → regenerate `src/data/cards.ts` (`tools/gen-data.mjs`).
- **Evidence:** `docs/qa/shots/r2-visual/v1-zoom-73-en.jpg` (the zoom at 1440×900: the image says "Does not count for
  Final Scoring at the end of Turn 10", the panel beside it does not, above "Text shown is the current errata");
  `docs/qa/shots/r2-visual/v1-en-card-images-errata.jpg` (English images of #35, 73, 87, 100, 103: each prints the clause
  the text panel lacks). Reproduced in the browser (zoom probe `p2/zoom73.mjs`) and in the data scan.

### V2 (minor) A tampered or corrupted save is reported as "made with another version of the engine or AI"

- **Repro:** live app (dev 5185 or the production preview), any viewport: in DevTools set
  `localStorage["ts-playfield.game.v1"] = "TSP2:AAAAbogusbogusbogus"` (or change one character of a real v2 save), reload.
  Script: `qa.mjs --only incompat` in the scratch dir (an init script writes the bogus value once).
- **Expected:** the toast says what happened: the saved game could not be read (damaged or edited) and was removed. r2-save
  routes every unreadable save (bad checksum, truncation, garbage) through the Q-014 incompatible-save path.
- **Actual:** en "Your saved game was made with another version of the engine or AI and cannot be resumed." / zh
  "已保存的对局来自其他版本的引擎或 AI，无法继续。" Both are false for a save written by this very build and then damaged.
  Seen at 1280×720 en, 1440×900 zh, 390×844 zh, 844×390 en (all 24 cells of the `incompat` state); the same string is
  used by `App.tsx:120` when `resume()` fails after boot.
- **Likely files:** `src/ui/screens/StartScreen.tsx:92-97`, `src/ui/App.tsx:120` (pick a second key, e.g.
  `ui:error.saveUnreadable`, when `incompatibleSave.savedAt === 0` / `resume()` refused an unreadable save),
  `src/i18n/locales/{en,zh-CN}/ui.json` (`error.saveIncompatible` + the new key). Optionally the controller could tell
  the two cases apart explicitly instead of the `savedAt: 0` convention.
- **Evidence:** `docs/qa/shots/r2-visual/v2-tampered-save-toast.jpg`.

### V3 (minor) Tablet, Chinese: long card names on the hand spines are cut into wrong characters ("我们在德黑羊", "红色恐慌太")

- **Repro:** shell demo `src/ui/screens/demo/index.html?scene=prompt-headline&lang=zh` at 1024×768 (tablet layout, 86 px
  cards). Also `?variant=committed&lang=zh` and `?scene=prompt-coup-target&lang=zh` (限制战略武器谈判). Probe:
  `DSF=3 SHOTDIR=… node probe.mjs "<url>" 1024 p2/spinezoom.mjs` (scratch dir; one PNG per spine).
- **Expected:** a name longer than the band ends in a clear "…" (ui-tray.md: "Names longer than the band end in '…'"),
  as the English spines do ("COLONIAL REAR GUAR…").
- **Actual:** in Chinese the end of the band shows a deformed last character instead of an ellipsis: Our Man in Tehran
  (我们在德黑兰的人) reads **我们在德黑羊** (the 兰 merges with the cut-off ellipsis), Red Scare/Purge (红色恐慌/大清洗) reads
  **红色恐慌 太** (the "/" turns sideways into a gap and 大 gains a stray dot). Both look like real, different characters.
  The spine element reports `scrollHeight` 98-99 for `clientHeight` 98, so the overflow sits within a pixel of the
  limit and the ellipsis is drawn over the last glyph. Seen at DSF 1, 2, 3 and 6, in three scenes (9 cards, 8 + headline
  slot, 7 cards) and in the audit matrix (`aiwait-1024-zh`). Desktop sizes (1280-1920) fit these names; English is fine.
- **Likely files:** `src/ui/cards/cards.module.css` `.small .spine` / the `:lang(zh)` rule (e.g. `text-combine-upright` or
  a full-width "／" for the slash in vertical text, and leave a whole em of room before the ellipsis, or cut the name in
  JS to whole characters + "…" for CJK); `src/ui/tray/trayModel.ts` if the band should not exceed what fits.
- **Evidence:** `docs/qa/shots/r2-visual/v3-tablet-zh-spines-cut.jpg` (the 8 spines of the 9-card hand at DSF 3).

### V4 (minor) A game that ends inside an action round reads "End of turn N" in the slip head and the console (the telex says "Turn N · AR M")

- **Repro:** shell demo `src/ui/screens/demo/index.html?scene=seq-over-vp20&start=end&lang=en` at 1440×900 (US reaches
  20 VP in AR 2 of turn 5); also `seq-over-defcon` (nuclear war in AR 7 of turn 4) and `&lang=zh`. Read the telex
  "Ended", then Review board and read the slip head and the console. Probes `p2/turnar.mjs`, `p2/turnar2.mjs`.
- **Expected:** one answer everywhere. The game ended in "Turn 5 · AR 2" (the telex, and the console's own AR pips 1-2
  are lit); the end-of-turn phase never ran.
- **Actual:** telex "ENDED Turn 5 · AR 2" / "结束于 第 5 回合 · 第 2 行动轮", but slip head "Orders · End of turn 5" /
  "指令 · 第 5 回合结束" and console "END OF TURN 5" / "第 5 回合结束" (before and after Review board). DEFCON: telex
  "Turn 4 · AR 7", slip and console "End of turn 4". Resignation keeps "Turn 2 · AR 1" everywhere (its phase stays
  ACTION_ROUND); held-scoring and mil-ops endings say "End of turn 7 / 8" everywhere (correct). The Q-031 fix
  taught the telex that GAME_OVER inside a round is "in round" but `displayTurnAr` treats any phase other than
  ACTION_ROUND as "end".
- **Likely files:** `src/ui/common/turnAr.ts` (`displayTurnAr`: phase GAME_OVER with `ending.turn === state.turn` and
  `1 <= action_round <= lastActionRound` → `ar`, as `GameOverTelex.tsx:86-88` does); used by `prompts/labels.ts`
  `ordersHead` and `console/model.ts` `arModel`.
- **Evidence:** `docs/qa/shots/r2-visual/v4-gameover-end-of-turn.jpg` (top: telex "Turn 5 · AR 2"; bottom: after Review
  board, console "END OF TURN 5" with AR pips 1-2 lit, slip "Orders · End of turn 5").

### V5 (minor) Tablet 1024×768: the Chernobyl region prompt pushes "Undo play" out of the slip

- **Repro:** shell demo `src/ui/screens/demo/index.html?scene=prompt-region&lang=en` (or `zh`) at 1024×768, mouse or
  touch (iPad landscape = tablet layout). Probe `p2/slipfoot.mjs` (scratch dir).
- **Expected:** every slip control visible and tappable (Undo play is how a touch player takes the card back; tablets have
  no Z key).
- **Actual:** the slip is 126 px tall with `overflow: hidden`; its content needs 141 px. The region grid (2 rows of 3)
  takes the room and the footer's Undo play button (26 px) shows 11 px: only its top edge, and its centre hit-tests to
  another element. Same in en and zh, mouse and touch, in the audit matrix (`region-1024-*`: kbd "Z" clipped) and twice
  by probe. At 1280×720 / 1366×768 the same button loses 3 px (23 of 26 visible, still tappable). Not reported in
  round 1, but present there too (round-1 matrix `region-1024-en`).
- **Likely files:** `src/ui/prompts/OrdersSlip.module.css` (`.regionFoot` / region grid in the tablet slip: put Undo
  beside the grid, use one row of 6 short buttons, or let the tablet slip grow for this prompt), `src/ui/prompts/RegionChoice.tsx`.
- **Evidence:** `docs/qa/shots/r2-visual/v5-region-undo-cut-1024.jpg` (1024×768 touch en, 1024×768 zh).

### V6 (polish) Wording consistency: zh dock "记录" for the log (mockup and glossary: 电报); en "licence" next to "licenses"

- **Repro:** any game scene at 390×844 zh, e.g. `src/ui/screens/demo/index.html?scene=prompt-influence&lang=zh` (bottom
  dock); About dialog in English.
- **Expected:** the approved phone mockup `docs/design/shots/final-phone-zh.png` labels the dock's log button **电报**, the
  glossary's word for the log (`ui:log.title`, the desktop panel "电报", the log sheet's own title, "有新电报"). English
  uses one spelling of licence/license.
- **Actual:** the dock says **记录** (`ui_shell:dock.log`), its accessible name "记录：3 条新电报" mixes both words, and the
  ticker's "打开记录" too; the sheet it opens is titled 电报. English About: "Font licence (OFL)" (`ui_shell:about.oflLink`)
  beside "Third-party licenses" and the start screen's "Credits & licenses" (`ui.json`).
- **Likely files:** `src/i18n/locales/zh-CN/ui_shell.json` (`dock.log`, `dock.label`, `dock.logAria_other`, `ticker.open`
  → 电报), `src/i18n/locales/en/ui_shell.json` (`about.oflLink` → "Font license (OFL)").
- **Evidence:** `docs/qa/shots/r2-visual/v6-zh-dock-log-label.jpg` (top: mockup; bottom: app, 390×844 zh).
