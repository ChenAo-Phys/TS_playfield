# QA round 2 — tablets and small phones with touch (r2-tablet-touch)

Date: 2026-11-23. Dev server `TSP_NO_HMR=1` on port 5184 (`?ai=policy` for the driver), Playwright Chromium with
`hasTouch` + `isMobile` (taps are touch events). Scratch dir (scripts, logs, full-size shots):
`$SP/r2-tablet-touch` (`$SP` below).

## Summary

Both complete touch games finished cleanly (iPad landscape 1024×768 en, USSR, seed 3: final scoring, USSR +2; iPad portrait
768×1024 zh, US, seed 16: final scoring, USSR +3), and 2 turns at 360×740 zh ran clean: 0 fallbacks, 0 mismatches,
0 page errors, and once the frames had settled the screen matched the view model at every checkpoint (map 84/84, hand,
console, rail flyouts, piles, after every rotation). Rotation tablet ↔ portrait and phone portrait ↔ landscape switches the layout cleanly at every
state tried (map prompt with points placed, headline, card zoom, play-mode, AI frames, settings, turn 8), keeps the prompt
and its remaining points, and taps work at once in the new layout. The round-2 changes hold on touch: the quick second tap
(+2 on one country, +1 each on two, no zoom, tablet and 360 px), hand spines (taps on each visible strip hit that card; zh
spines uncut), the AI wait note (no shift 8–26 s; the 20 s hint once as a toast on the tablet and at 768×1024, in the slip
at 360×740 and 740×360, not again after a reload) and Back to hand focus.

7 findings, no blocker: **2 major** (F1 the AI's reveal dock hides the scoring sheet's numbers whenever the sheet docks
right, tablet and 1366; F5 a region plate's "if scored now" popover outlives its prompt and sits over the hand drawer, the
card sheet and the play-mode stage, with no way to close it there), **5 minor** (F2 the tablet log flyout covers the hand's
right end / China Card / piles and no outside tap closes a flyout; F3 iPad-landscape touch targets below 44 px; F4 tablet
slip titles cut after two lines with the rest only in a hover title; F6 keyboard key caps on touch screens; F7 Chernobyl's
Undo play pushed off the tablet slip).

## Progress

- [x] Full game, iPad landscape 1024×768 touch (tablet layout), en, USSR, seed 3: final scoring turn 10, USSR wins (VP −2).
- [x] Full game, iPad portrait 768×1024 touch (compact layout), zh, US, seed 16: final scoring turn 10, USSR wins (VP −3).
- [x] 2 turns at 360×740 zh touch (USSR, seed 1), clean.
- [x] Touch interactions: map taps, quick second taps, long-press tooltips and their touch wording, tap on non-targets and the
      sea, pinch / pan / double tap on the sea (tablet and 768 portrait), theatre chips (768: every tapped chip is the lit one),
      orders sheet grab (tap, swipe down, swipe up beside the grab), dock sheets (open by tap, close by scrim tap), hand
      drawer and card sheet (headline committed from the sheet), hand fan on the tablet (strip taps, long-press zoom, zoom
      closed by a second tap or a tap on the sea), headline staging by touch, play-mode by touch incl. Back to hand, rail strip
      flyouts (F2), dialogs (DEFCON, branch, op-mode, region, event card) and the telex at 1024 / 768 / 360, headline papers'
      and scoring sheet's Continue, settings and ☰ menu sheets, touch-target audits (F3).
- [x] Rotation: tablet 1024×768 ↔ 768×1024 (8 states + turn 8 coup prompt) and phone 360×740 ↔ 740×360 (7 states).
- [x] View-model checkpoints: setup, AR 1, every 40 answers through turn 4 (two seeds), turn 8 (map, hand, console, adversary /
      in-effect / status flyouts, piles), after each rotation.
- [x] Production build (scratch dir, preview 4184) at 1024×768 touch: no `__tsp` / `__tspAuto`, the game starts by tap, the
      setup is placed by taps, 7 spines in the 8-card hand, rotation to 768×1024 works, no errors.

## Full-game results

| Run | Viewport | Lang | Side | Seed | Ending | Answers | Input | Fallbacks / mismatches / errors | Wall |
|---|---|---|---|---|---|---|---|---|---|
| `$SP/run-1024` | 1024×768 touch (tablet) | en | USSR | 3 | final scoring, turn 10, USSR +2 | 292 | 387 taps, 1 dialog | 0 / 0 / 0 | 475 s |
| `$SP/run-768` | 768×1024 touch (compact) | zh | US | 16 | final scoring, turn 10, USSR +3 | 302 | 627 taps, 19 keys, 3 dialog | 0 / 0 / 0 | 850 s |
| `$SP/run-360` | 360×740 touch (compact) | zh | USSR | 1 | to turn 3 (VP +1, DEFCON 4) | 62 | 112 taps, 22 keys, 1 dialog | 0 / 0 / 0 | 202 s |

The keys in the compact runs are the driver's own fallback, not a UI failure: `$SP/play-dbg.mjs` (a copy of play.mjs that
logs each key) shows every one is "focus the box + Enter" for a target country outside the follow camera's framing
(x 916–1192 on a 768 px screen, `$SP/run-768b/log.txt`; `$SP/run-360/log.txt`). A player pans or taps ⤢ World, which
works at once, also right as the prompt opens (`$SP/t17-worldrace.mjs`, `$SP/t14-world.mjs`).

## Findings

### F1 — Tablet (and 1366×768): the AI's reveal dock covers the scoring sheet's numbers whenever the sheet docks right (major)

- **Repro:** dev, 1024×768 touch, en, USSR, `?ai=policy&seed=3`: `node $SP/t7-scoring.mjs 1024 768 en 3 USSR 4` (plays with
  the autopilot, stops at every scoring sheet that waits for Continue and measures it against the reveal dock). By hand: play
  to T2 AR2, where the US AI plays Europe Scoring.
- **Expected:** the scoring sheet's table (ui-spec §10.2: Status / Countries / Battlegrounds / Adjacent / Status VP, US and
  USSR columns) readable; the played card's dock beside it, not over it.
- **Actual:** every AI scoring card whose sheet docks **right** (Europe T2 AR2, South America T4 AR7, Central America T4
  AR8 in this game; Middle East at T1 docked left and was fine) has the reveal dock "UNITED STATES PLAYS · <card>"
  (200×257 at x 700, y 88) fully inside the sheet (520×449 at x 416, y 70): it hides both number columns of every row
  and most of the sheet's subtitle, so only Total and the net bar can be read (the dock is `pointer-events: none`, so
  `elementFromPoint` does not report the cells as covered; the cover is visual, see the shot). Same at 1366×768 (Europe, sheet x 530, dock x 814,
  `t7-scoring.mjs 1366 768 en 3 USSR 2`). `sheetSide()` prefers left for Europe, but `pickSheetSide()` flips it right
  because the left sheet covers Europe on this map; the dock stays at `right: 64px` and nothing moves it for the sheet.
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f1-scoring-sheet-under-reveal-dock-1024.jpg` (South America, T4 AR7);
  `$SP/t7-1024x768-en-USSR-3.json`, `$SP/t7-1366x768-en-USSR-3.json`.
- **Likely files:** `src/ui/stage/stageStore.ts` (dock `pos`, only flipped left in `onCountry`), `src/ui/stage/ScoringSheet.tsx`
  / `model.ts` (`pickSheetSide`), `RevealDock.module.css` (`.slot` right 64 px). Suggest: when the sheet docks right, move the
  dock left (or let the sheet take the side away from the dock), as `onCountry` already does for a covered country.

### F2 — Tablet: the Dispatches flyout covers the right end of the hand, the China Card and the piles, and a tap outside does not close it (minor)

- **Repro:** dev, 1024×768 touch, en, USSR, `seed=3`: `node $SP/t6-tablet-hand.mjs` (step `flyoverTray`) and `t1-tablet.mjs`
  (step `railStrip`). At the setup prompt tap the rail strip's Dispatches button, then tap the map.
- **Expected:** the flyout over "the map's right edge" (ui-spec §3.2); on a touch screen (no Esc) a tap outside closes it.
- **Actual:** the log flyout runs to the bottom of the table (320×698 at x 636, y 62) and sits over the tray (z 60 over
  z 15): The Cambridge Five 100 %, Decolonization 84 %, Indo-Pakistani War 30 %, the China Card slot and both piles 100 %
  covered. Tapping the map does not close any of the four flyouts (adversary / effects / log / status, `afterMapTap` still
  open in both runs); only the strip button again or the flyout's × (28×28) does. A player who opens the log in the middle
  of a card prompt loses three cards and the China Card until they find the small ×.
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f2-log-flyout-over-tray-1024.jpg`; `$SP/t6-1024x768-en.json`, `$SP/t1-1024x768-en.json`;
  second run in zh as US (`node $SP/t18-flyout.mjs`, seed 13): taps on the sea, the slip, an uncovered hand card and the console
  leave the log and status flyouts open (8 of 8).
- **Likely files:** `src/ui/screens/GameScreen.tsx` (flyout host inside `main#ts-map`, which spans the tray rows),
  `src/ui/screens/GameScreen.module.css` (`.flyoutHost`), `src/ui/rail/Rail.module.css` (`.flyout[data-panel="log"] { bottom: 8px }`,
  `.flyoutClose` 28 px). Suggest: stop the flyout above the tray (bottom = tray height), close it on a pointer-down outside
  it and the strip, and give the × a 44 px hit area on coarse pointers.

### F3 — Tablet with touch (iPad landscape): most controls are below 44 × 44 px (minor)

- **Repro:** dev, 1024×768 touch (`(pointer: coarse)` and `(hover: none)` match), en, USSR, `seed=3`: `node $SP/t1-tablet.mjs`,
  `node $SP/t5-kinds.mjs 1024 768 en 3 USSR 4`, `node $SP/t6-tablet-hand.mjs` (`smallTargets()` probes the real hit area with
  `elementFromPoint`, so `::after` expansions count).
- **Expected:** ui-spec §3.3 / §12 and the round-1 Q-048 rule: on coarse pointers touch targets ≥ 44 px (or an invisible
  44 px hit area).
- **Actual (hit areas, all three runs):** console language / settings / menu 32×32; map zoom + − ⤢ 30×30; rail strip
  42×42; flyout × 28×28; slip Undo play 104×26, List 54×26, Commit headline 142×30, the slip's Continue 103×26;
  play-mode Back to hand 114×26; piles 76×34 (a second run, US seed 13, `t5-kinds.mjs 1024 768 en 13 US 3`, gives the
  same list); Chernobyl's region buttons in the slip 88×24 (`t12-dialogs.mjs`). Phones are mostly fixed by Q-048, but the
  play-mode sheet's **Back to hand** is 94×26 there too (360×740 and 768×1024 zh, `node $SP/t12-dialogs.mjs 360 740 zh`,
  scene `prompt-op-mode`). Q-048's coarse-pointer rules are scoped to `.compact` (OrdersSlip.module.css l.396: "The tablet / desktop slip keeps its 152 px height"), so an iPad in landscape, whose only input is touch, gets the
  mouse sizes. The headline papers' / scoring sheet's Continue (44 px) and the play-mode rows (≥ 57 px) are fine.
- **Evidence:** `$SP/t1-1024x768-en.json` (`audit-setup`), `$SP/t5-1024x768-en-USSR-3.json` (`kinds.*.audit`),
  `$SP/t6-1024x768-en.json`; the slip in `docs/qa/shots/r2-tablet-touch/f4-tablet-slip-titles-cut-1024.jpg` (Undo play, List).
- **Likely files:** `src/ui/prompts/OrdersSlip.module.css`, `src/ui/prompts/PlayModeStage.module.css`, `src/ui/console/Console.module.css`,
  `src/ui/map/MapView.module.css` (zoom buttons), `src/ui/rail/Rail.module.css`, `src/ui/tray/Piles.module.css`. Invisible
  44 px hit areas (as for the theatre chips) keep the tablet's visual sizes.

### F4 — Tablet: slip titles are cut after two lines and the rest is only in a hover tooltip (minor)

- **Repro:** dev, 1024×768 touch, en, USSR, `seed=3`: `node $SP/t5-kinds.mjs 1024 768 en 3 USSR 4` (collects every clipped text
  in the slip at every prompt, `allCuts`).
- **Expected:** the prompt's question readable on a touch screen (no hover there: the full text is only in `title`).
- **Actual:** cut titles, with room left in the slip: "PLACE YOUR STARTING INFLUENCE IN EASTERN…" (setup), "DECOLONIZATION:
  ADD 1 USSR INFLUENCE TO A COUNTRY IN…" (Africa or Southeast Asia lost), "COMECON: ADD 1 USSR INFLUENCE TO A NON-US-CONT…"
  (`scrollHeight` 81 for a 40 px box: three lines hidden), "UN INTERVENTION: CHOOSE AN OPPONENT'S CARD TO PLAY FOR…",
  "SOCIALIST GOVERNMENTS: REMOVE US INFLUENCE IN…", "LIBERATION THEOLOGY: ADD USSR INFLUENCE IN CEN…"; the crumb's card
  name "US/Japan Mutual Defense Pact" (142 px in 126). Second run (US, `seed=13`, `t5-kinds.mjs 1024 768 en 13 US 3`):
  "MARSHALL PLAN: ADD 1 US INFLUENCE TO A NON-USSR-CONTROLLED COUNTRY IN WESTERN EUROPE" and "EAST EUROPEAN UNREST: REMOVE
  USSR INFLUENCE FROM A COUNTRY IN EASTERN EUROPE" cut the same way. The tablet slip is 296 px and `.title` is clamped to 2 lines
  (OrdersSlip.module.css l.88-94); on the UN Intervention prompt the slip has an empty third of its height under the title.
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f4-tablet-slip-titles-cut-1024.jpg` (Decolonization, UN Intervention);
  `$SP/t5-1024x768-en-USSR-3.json` (`allCuts`).
- **Likely files:** `src/ui/prompts/OrdersSlip.module.css` (`.tablet .title`, `.hint` 1-line clamp at ≤ 820 px high),
  `src/ui/prompts/OrdersSlip.tsx`. Suggest: a third title line when the body has room (as Q-033 did for the side column),
  or a tap on the title that shows the full text.

### F5 — A region plate's "if scored now" popover opened outside a map prompt never closes on its own: it stays on top of the hand drawer, the card sheet and the play-mode stage, and a tap on it does nothing (major)

- **Repro:** dev, touch, `?ai=policy&seed=3` (1024×768 en USSR) or `seed=1` (360×740 zh USSR):
  `node $SP/t8-plate.mjs 1024 768 en 3 USSR 0` and `node $SP/t8-plate.mjs 360 740 zh 1 USSR 0`. At the headline prompt (on
  the phone: close the auto-opened hand drawer first) tap the Europe plate to see "if scored now"; then pick the headline
  and play on to the first action-card prompt; tap a card.
- **Expected:** the popover is transient: it closes when the prompt changes (as a tapped country tooltip does since Q-020),
  or at least when a sheet / the play-mode stage opens over the map, and a tap on it or outside it closes it.
- **Actual (both viewports, both runs):** the popover (260×290 / 260×306, z 80) stays open through the headline papers, the
  AI's frames and the next prompt, and sits **above** everything: on the tablet over the console's AR / DEFCON readouts and
  over the play-mode stage's title "HOW WILL YOU PLAY IT? INDEPENDENT REDS"; on the phone over the hand drawer (the first
  card's top half) and then over the card sheet's text (NATO's event text and "If you play it now" rows). Tapping the popover
  does nothing; the sea that would close it is under the drawer / sheet / stage. After a rotation it is still open and is
  re-placed against a stale anchor (phone landscape: popover at x 159, its plate at x −24, y −41, off screen). The reset in
  MapView only runs when `targets` / `regionTargets` change, so between two non-map prompts (headline → action card →
  play-mode) nothing closes it.
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f5-plate-popover-over-drawer-and-card-sheet-360-zh.jpg` (phone: action-card
  prompt, card sheet, landscape after rotation), `f5-plate-popover-over-playmode-1024-and-rotated.jpg` (tablet play-mode, then
  768×1024 after rotation); `$SP/t8-1024x768-en.json`, `$SP/t8-360x740-zh.json`. First seen by chance in the rotation run
  (`$SP/t3-1024.log`, step S5: tooltip at x −27 over the compact play-mode sheet).
- **Likely files:** `src/ui/map/MapView.tsx` (l.136-140 the reset effect keyed on `[targets, regionTargets]`; l.630-636
  `tipAnchor` re-measured only on `[tipId, plateTip, settled]`), `src/ui/map/MapTooltipHost.tsx`. Suggest: also reset on every
  prompt change / when a sheet or the stage opens, close on a tap on the popover itself on touch, and re-anchor on resize.

### F6 — Touch screens still show keyboard key caps on buttons (minor, wording)

- **Repro:** any touch layout. Phone 360×740 zh, `seed=1` USSR, setup prompt, tap a target on the last point
  (`node $SP/t9-final.mjs`): "在波兰放置 ↵", "撤销本次出牌 Z". Tablet 1024×768 en, `seed=3` (`t5-kinds.mjs`, `t6-tablet-hand.mjs`):
  slip "UNDO PLAY Z", "LIST T", "COMMIT HEADLINE ↵", "CONTINUE Space", "SKIP Space"; play-mode rows "INFLUENCE I", "COUP C",
  "REALIGN R", "EVENT FIRST E", "SPACE RACE S", "BACK TO HAND Esc"; the scoring sheet's and the headline papers' "CONTINUE Space".
- **Expected:** ui-spec §3.3 as built (Q-032): on touch screens no key hints ("no right-click / Space / key hints there").
- **Actual:** the instructions were switched to touch wording, but every `Button kbd=…` still renders its `<kbd>` cap on touch
  (`useTouchUi()` true, `(pointer: coarse)` matches). On a phone the slip's two main buttons carry "↵" and "Z".
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f6-key-caps-on-phone-slip-360-zh.jpg`, `f4-tablet-slip-titles-cut-1024.jpg`
  (Z, T on the tablet slip); `$SP/t6-1024x768-en.json` (`playMode.stage`).
- **Likely files:** `src/ui/common/Button.tsx` (render `kbd` only when `!useTouchUi()`), or the callers in `OrdersSlip.tsx`,
  `PlayModeStage.tsx`, `dialogParts.tsx`, `HandPromptBar.tsx`, `ScoringSheet.tsx`, `HeadlinePapers.tsx`.

### F7 — Tablet: on the Chernobyl region prompt "Undo play" is pushed out of the slip, below the screen (minor)

- **Repro:** shell demo `src/ui/screens/demo/index.html?scene=prompt-region&lang=en` (and `lang=zh`) at 1024×768 touch, or at
  1100×700; `node $SP/t13-region.mjs` measures it at six sizes.
- **Expected:** the slip's Undo play reachable, as on every other map prompt (the human can take back the Chernobyl play
  until a die is rolled).
- **Actual:** the six region buttons (3 × 2 rows, 88×24) fill the 126 px tablet slip, and the Undo play button lands at
  y 749–775 (slip bottom 760, viewport 768): outside the slip, under the tray's edge, `elementFromPoint` at its centre hits
  the tray (1024×768 en and zh, 1100×700 zh). Only its top edge shows. With no keyboard (tablet touch) there is no other way
  to undo. On desktop 1280×720 / 1366×768 the button also overflows the slip but stays on screen and hittable; at 1440×900
  it fits.
- **Evidence:** `docs/qa/shots/r2-tablet-touch/f7-chernobyl-undo-off-slip-1024.jpg`; `t13-region.mjs` prints
  `undoInSlip: false, undoOnScreen: false, undoHittable: false` at 1024×768 en / zh and 1100×700 zh (run twice, also via
  `t12-dialogs.mjs 1024 768 en`, which found the button covered by the tray).
- **Likely files:** `src/ui/prompts/RegionChoice.tsx`, `src/ui/prompts/OrdersSlip.module.css` (tablet slip height 126 px;
  the region grid plus the row of tools does not fit). Suggest: region buttons in 2 rows of 3 beside the Undo, or Undo in
  the slip's head row on the tablet.

## Notes (checked, not filed)

- **Fine:** tablet hand strip taps hit the intended card for all 9 slots (incl. the China Card); the card zoom popover never
  covers the slip and closes on a second tap or a tap on the sea; a tablet headline stages on the first tap and commits on the
  second; Back to hand by touch returns the card with focus on it; tablet map targets at fit are ≥ 53×36 px plus the 6 u touch
  padding and the 387 taps of the tablet game had no mis-hit; long-press on a target shows "Tap to place · Hold for details"
  and places nothing; a non-target tap shows "Tap elsewhere to close" and a second tap closes it; theatre chips at 768 px all
  light the tapped chip (Q-047 holds); the orders sheet grab has its 44 px zone (Q-048 holds); dialogs fit at 1024 / 768 / 360
  and stage a tile on the first tap; the telex buttons are 44 px on touch; the 20 s AI hint toast is shown once per session.
- **Sticky hover (cosmetic, not filed):** after a tap on a hand card the card keeps `:hover` (lifted 22 px, caption instead of
  spine) until the next tap elsewhere; `Hand.module.css` `:hover` rules are not limited to `@media (hover: hover)`. Real iPads
  keep the hover the same way.
- **Portrait World framing:** ⤢ World at 768×1024 frames 1185 of the map's 1775 units (the far west / east stay off screen);
  expected for the aspect ratio, mentioned because a target outside it needs a pan.
- **Rotation keeps UI state:** a tablet flyout left open is back after a round trip through portrait; the compact play-mode
  sheet and the card sheet re-open in the other layout as the play-mode stage / zoom popover. All intended.
- The `--touch` driver needs no change for tablets; its compact keyboard fallback is explained under the results table.
- Every server (dev 5184, preview 4184) and Chromium started for this report is stopped.
