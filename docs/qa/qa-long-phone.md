# QA report — long games on phones with touch (qa-long-phone)

Date: 2026-11-22. Dev server with `TSP_NO_HMR=1` on port 5184, `?ai=policy` (network-argmax AI for the opponent and the
autopilot), Playwright Chromium with `hasTouch` + `isMobile` (the `play.mjs` driver's `--touch`, and an iPhone 13 profile in
the scratch scripts). Scratch dir: `$SP/qa-long-phone`
(scripts `lib.mjs`, `t*.mjs`; logs `run-*.log`, results `run-*.json`).

## Summary

Both full games finished by touch (US 390×844 zh: final scoring, US +7; USSR 844×390 en: final scoring, US +20) with no
page errors and no UI mismatches, and the screen matched the view model at every checkpoint. 11 findings, none a
blocker: 4 major (F1 double tap loses a placement and zooms; F5 landscape zh VP readout "苏联…1" for +13; F6 the hand
drawer hides Blockade's question and its decline button; F9 no left/right safe-area insets in landscape, emulated) and
7 minor (F2 tooltip cannot be dismissed on touch; F3 desktop key hints on phones; F4 wrong theatre chip lit in portrait;
F7 "Turn 11 · AR 0" after final scoring; F8 touch targets < 44 px; F10 landscape slip cuts the title while half empty;
F11 no target list in landscape).

## Progress

- [x] Full game, US, 390×844 zh, touch, seed 13 (driver run from an earlier attempt, log kept): final scoring turn 10, US +7.
- [x] Full game, USSR, 844×390 en, touch, seed 1: final scoring turn 10, US +20, clean (0 fallbacks / mismatches / errors).
- [x] Map touch (390×844 zh, 844×390 en): tap targets, tap safety, double tap (F1), pinch out/in, one-finger pan, zoom
      buttons, theatre chips (F4), tooltips / long-press (F2, F3), orders sheet grab tap + swipe.
- [x] Hand drawer (8 cards, swipe scroll), card sheet + headline commit by touch, headline papers, ticker → log, dock
      sheets (adversary / log / status: open by tap, close by scrim tap and by swipe-down), ☰ menu sheet, language switch
      mid-game, settings dossier full-screen.
- [x] Rotation portrait ↔ landscape mid-game (map prompt, expanded sheet, log sheet open, during AI frames, card prompt):
      no page scroll, prompt kept, taps work after rotating, map matches the view model (84 countries) after each turn.
- [x] Screen vs view model at setup, AR 1, after the language switch, after rotations: 0 mismatches.
- [x] Every dialog prompt by touch in a whole game (390×844 zh US seed 13: in-hand event card, Chernobyl region via the
      theatre chip, 8 stage sheets; 844×390 en USSR seed 1: Warsaw Pact branch, DEFCON level, 8 stage sheets) and the
      game-over telex in both orientations.
- [x] Late-game checkpoints at turns 4, 8, 10 (844×390 en): map 84/84, hand drawer = hand, adversary count = AI hand,
      status sheet (DEFCON, VP, mil ops, space, deck / discard / removed) = view model; rotation at turn 8 with a map
      prompt open.
- [x] Landscape side column (F5, F9, F10, F11), safe areas (F9), touch-target audit (F8).
- [x] Production build (scratch dir) on an iPhone 13 profile at 390×844 zh: no `__tsp` / `__tspAuto`, the lazy game
      chunk loads, 7 setup taps placed, the leaderboard AI answered, no errors.
- Not covered: a real iOS / Android device (all touch is Chromium emulation), the China Card slide target on the
  compact dock (needs a human China Card play; not found in the seeds used), iOS long-press (Safari's own callout).

## Notes

- **The one fallback in run-us-390 is a driver limitation, not a UI bug.** At Chernobyl's region prompt (turn 9) the
  driver looked for the map plate `[data-plate="5"]`, which was outside the camera (the map was on Europe); a player
  uses the theatre chip or the slip's region buttons. `t15-region.mjs` answers the same prompt by touch through the
  S. America chip (tap → staged "选择南美洲 ↵", tap again → committed) with no fallback. Suggest `play.mjs` press the
  theatre chip (`button[data-slot]`) on compact.
- Checked and fine: pinch out (2.7×) / pinch in / one-finger pan keep the prompt; the zoom buttons; the hand drawer's
  horizontal swipe; the card sheet (headline "确定头条" 366 × 44); headline papers and scoring sheets (Continue on
  screen at 390×844; at 844×390 the papers scroll and the slip's Continue is on screen); dock sheets close by scrim tap
  and swipe-down; ticker tap opens the log; the ☰ sheet's 52 px rows; switching language mid-game (map labels, dock,
  console all re-rendered, 0 mismatches); dialogs at 844×390 are full-screen with nothing clipped; no page scroll in
  any state or orientation.
- Helper scripts in the scratch dir need the dev server (`window.__tsp`, `__tspAuto`, `?seed`). `lib.mjs`'s
  `tapContinue` only presses an on-screen, unobscured Continue (the headline papers' own Continue is below the fold at
  844×390).

## Full-game results

| Run | Viewport | Lang | Side | Seed | Ending | Answers | Taps | Fallbacks | Mismatches | Errors | Wall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| run-us-390 | 390×844 touch | zh | US | 13 | final scoring, turn 10, US +7 | 296 | 633 (+50 keys) | 1 (driver: region plate off-screen, see notes) | 0 | 0 | 960 s |
| run-ussr-844 | 844×390 touch | en | USSR | 1 | final scoring, turn 10, US +20 | 308 | 674 (+2 keys, 2 dialog) | 0 | 0 | 0 | 907 s |

## Findings

### F1 — Two quick taps on a target country place one point and zoom the map (major)

- **Repro:** scratch `t9-dbl.mjs` (dev server `?ai=policy&seed=13`, iPhone 13 profile, touch). 390×844 zh as US, or
  844×390 en as USSR (`seed=1`). At the setup prompt (zoomed so a box is ≥ 80×54 px), tap one ringed country twice,
  180 ms apart, the way a player adds 2 influence to one country.
- **Expected:** 2 influence placed (`remaining` drops by 2); the camera stays put.
- **Actual (both orientations, 3 trials each):** 180 ms apart → only **1** point placed and the map zooms **2×** around
  the finger (Benelux 0→1, `remaining` 7→6, zoom 2.0; Austria 0→1, 6→5, zoom 2.0; at max zoom: 1 point, zoom 1.18–1.25).
  450 ms apart → 2 points, no zoom. The second tap is taken as the touch double-tap zoom and its click is swallowed. On a
  Ops/setup prompt this happens constantly, and the jump makes the next tap land on a different box.
- **Evidence:** `docs/qa/shots/qa-long-phone/f1-double-tap-390-zh.jpg`, `f1-double-tap-844-en.jpg`; results
  `t9-390x844-zh-US.json`, `t9-844x390-en-USSR.json` in the scratch dir.
- **Likely files:** `src/ui/map/useCamera.ts` (`onUp`: touch double-tap → `zoomAround` + `dragged.current = true`),
  `src/ui/map/MapView.tsx` (`onBoxClick` → `consumeDrag()`). Suggest: no double-tap zoom when the second tap is on an
  interactive target box during a map prompt (let both clicks through); keep it for the sea / non-targets.

### F2 — On a phone a country tooltip cannot be dismissed; it stays over the map / theatre bar until the prompt changes (minor)

- **Repro:** scratch `t10-tip.mjs` (390×844 zh US `seed=13`; 844×390 en USSR `seed=1`), at the first Ops influence
  prompt: tap a non-target country (Sweden / Benelux) → its tooltip opens. Then tap the sea, tap the country again, and
  tap it a third time.
- **Expected:** a tap outside (the sea) or a second tap on the same country closes the tooltip (ui-spec §4.8: on touch
  the content should even be a bottom sheet in compact).
- **Actual:** the tooltip stays open after every one of those taps (both runs, both orientations). It only goes when the
  prompt changes. At 390×844 it sits over the theatre chips Europe / Middle East / Asia and the console's turn readout
  (`@34,54 200×127`). The full-game run hit it naturally: Colombia's tooltip was still covering the map during
  Chernobyl's region prompt in turn 9.
- **Evidence:** `docs/qa/shots/qa-long-phone/f2-tooltip-stuck-390-zh.jpg` (after the sea tap),
  `f2-tooltip-during-region-prompt-390-zh.jpg` (full game, turn 9).
- **Likely files:** `src/ui/map/MapView.tsx`: the tooltip shows `tipId = pinned ?? tipFor ?? …` (line 588). A tap on a
  non-target runs `activate()`, which toggles `pinned` but always calls `setTipFor(id)`, and the touch also focuses
  the box (`onBoxFocus` → `setTipFor`). `pinned` is cleared only by Escape, a plate click or a change of targets
  (line 124); nothing clears `pinned` / `tipFor` on a tap on the sea, so on a phone (no Escape, no hover-out) it stays.
  Long-press calls `onInspect`, which the app never wires (`grep onInspect src/ui` finds only the map and the
  contract), so the compact bottom sheet from §4.8 does not exist.

### F3 — Tooltips on phones give mouse/keyboard instructions (minor, wording)

- **Repro:** same runs as F2. Tap a non-target: the hint reads "Right-click or Space: keep this open" /
  "右键或空格键：固定此提示". Long-press a target at an influence prompt: "Click place · Right-click details" /
  "点击放置 · 右键详情". Coup target (844×390 en): "Click select · Click again to launch".
- **Expected:** touch wording on touch devices ("Tap: place", "Tap again to launch"), or no right-click / Space hint.
- **Actual:** the desktop key hint is shown, so the phone tells the player to right-click. The same mouse/keyboard
  wording appears elsewhere on phones: the compact slip hint "Click a ringed country", the staged dossier hint "Click
  again or press Enter to confirm" (DEFCON dialog at 844×390 en, `t4-dialogs.mjs 844 390 en 1 USSR`,
  `t4-844x390-en-USSR-s1/dialog-2-staged.jpg`; zh "再次点击或按回车确认"), the coup slip note "…或按回车确认", and
  the tray's "已选中：再次点击或按回车确认".
- **Evidence:** `docs/qa/shots/qa-long-phone/f2-tooltip-stuck-390-zh.jpg` (inspect hint),
  `f3-coup-tooltip-844-en.jpg` (coup hint). In landscape this coup tooltip also spills 25 px over the side column's
  slip (x 334–569; the column starts at 544).
- **Likely files:** `src/ui/prompts/CountryTooltip.tsx` (`keys = t("ui:tip.keys.*")`), `src/ui/map/MapTooltipHost.tsx`
  (`tip.keys.inspect`), `ui:tip.keys.*` in `src/i18n/locales/{en,zh-CN}/ui.json`, `ui_prompts` `hint` / `tip.keys.*`,
  `ui_tray` `staged`. A `touch` variant of these keys chosen from `(pointer: coarse)` would cover all of them.

### F4 — Portrait phone: the theatre chip you tap is often not the one that lights up (minor)

- **Repro:** scratch `t8-chips.mjs` (390×844 zh, US `seed=13`, setup prompt). Tap each theatre chip in turn (swipe the
  bar for S. America).
- **Expected:** the tapped chip is pressed (ui-spec §3.3: "The chip of the framed region is pressed").
- **Actual (two runs, `t1-map.mjs` and `t8-chips.mjs`):** Europe → Europe, Middle East → Middle East, Asia → Asia, but
  **SE Asia → Asia**, **Africa → Europe**, **S. America → C. America**, World → Europe. The camera does go to the tapped
  region; only the highlight is wrong, because `framedSlot(view)` re-derives the chip from the camera view, and a portrait
  view of Africa / SE Asia / S. America also holds most of Europe / Asia / C. America. At 844×390 en all eight chips are
  right (`t8-844x390-en.json`).
- **Evidence:** `docs/qa/shots/qa-long-phone/f4-chip-samerica-pressed-camerica-390-zh.jpg` (S. America framed, 中美洲 lit).
- **Likely files:** `src/ui/screens/GameScreen.tsx` (`onCamera={v => setFramed(framedSlot(v))}` overrides the
  `setFramed(slot)` from the tap), `src/ui/compact/TheatreBar.tsx` (`framedSlot`). Suggest: keep the tapped slot until
  the user pans or zooms by hand.

### F5 — Landscape phone, Chinese: the VP readout is cut, "苏联 +13" shows as "苏联…1" (major)

- **Repro:** scratch `t13-vp.mjs 844 390 zh 12 US` (`?lang=zh&ai=policy&seed=12`, 844×390 touch, US). The USSR
  reaches 13 VP in turn 3. Look at the console's VP readout in the side column. Also seen at `seed=13` turn 2
  (`t12-trunc.mjs`).
- **Expected:** "苏联 +13" (as at 390×844 zh and at 844×390 en: "USSR +13").
- **Actual:** "苏联…1" at +13 (the "+" and the last digit are ellipsized away), "苏联 ..4" at +4. The readout box is
  42 px for 44 px of text (`.vpMini .vpRead { overflow: hidden; text-overflow: ellipsis }`). The score, the game's
  key number, reads as 1 instead of 13 (the needle and the aria-label "VP：苏联 +13" are right). The turn readout next
  to it, "第 1 行动轮 · 美国（你）", is cut to "第 1 行动轮 · 美国…" (115 of 140 px; no title tooltip).
- **Evidence:** `docs/qa/shots/qa-long-phone/f5-vp-readout-844-zh-13.jpg` (cut), `f5-vp-readout-844-en-13-ok.jpg`
  (the same moment in English, fine).
- **Likely files:** `src/ui/console/Console.module.css` (`.vpMini .vpRead`, line 315; `.v_compact .compactTurn`),
  `src/ui/console/VpGauge.tsx`. The landscape console is 300 px wide (`--ts-c-side-col-w`), so the Chinese side
  name needs a shorter form or the number must never be the part that is cut.

### F6 — Phone: an in-hand card choice opens the hand drawer over the question and its "decline" button (Blockade) (major)

- **Repro:** scratch `t16-evcard.mjs` (`?ai=policy&seed=13`, US). Turn 4 AR 2 the USSR plays Blockade (#10). At
  390×844 zh and at 844×390 en the hand drawer opens by itself.
- **Expected:** the player can see the question ("Blockade: discard a card worth 3 or more Ops") and both answers:
  discard a 3-Ops card, or "Discard nothing — lose West Germany influence".
- **Actual (both viewports):** the drawer covers the orders sheet. Only "YOUR HAND · 6 / China Card: yours · face down"
  and the cards are visible (two of them highlighted). The title and the **Discard nothing** button are underneath
  (checked with `elementFromPoint`). Tapping a card opens its sheet with "DISCARD SOCIALIST GOVERNMENTS", so the
  only way forward on screen is to discard; declining needs the player to know they should close the drawer first.
  In landscape the drawer is 844 px wide and covers the side column too (ui-spec §3.4: sheets open over the left
  column). This applies to every in-hand `event-card` prompt with a `done` option.
- **Evidence:** `docs/qa/shots/qa-long-phone/f6-blockade-drawer-390-zh.jpg`, `f6-blockade-drawer-844-en.jpg`;
  `t16-390x844-zh-US-s13.json`, `t16-844x390-en-US-s13.json`.
- **Likely files:** `src/ui/tray/HandDrawer.tsx` (header: add the prompt title and the `done` button when the prompt is
  an `event-card`), `src/ui/screens/GameScreen.tsx` line 133 (`isHandPrompt` → `setDock("hand")` auto-open),
  `src/ui/compact/CompactSheets.tsx` / `src/ui/common/Sheet.module.css` (in landscape keep the drawer over the left
  column).

### F7 — After a final-scoring ending the console and slip say "Turn 11 · AR 0" (minor)

- **Repro:** any game that ends by final scoring. Seen twice: `t4-dialogs.mjs 390 844 zh 13 US` (US wins +7) and
  `t14-late.mjs 844 390 en 1 USSR` (US wins +20), both ending in turn 10.
- **Expected:** the last turn shown is 10 ("End of turn 10", as the console says while the final scoring sheet is up).
- **Actual:** once the telex is up / closed, the slip reads "ORDERS · TURN 11 · AR 0 — GAME OVER" (zh "指令 · 第 11
  回合 · 第 0 行动轮 — 游戏结束") and the console "TURN 11 · LATE WAR" (the view model's `state.turn` is 11 after
  final scoring). There is no turn 11. The telex itself correctly says "Ended: Turn 10".
- **Evidence:** `docs/qa/shots/qa-long-phone/f7-end-telex-390-zh.jpg` (slip under the telex scrim);
  `t14-844x390-en-USSR-s1.json` → `end.slipAfterClose`, `end.consoleAfterClose`.
- **Likely files:** the slip kicker in `src/ui/prompts/OrdersSlip.tsx` and the console turn readout
  (`src/ui/console/TurnTrack.tsx` / `ArTrack.tsx`): clamp to `ending.turn` when `status === "over"`.

### F8 — Many phone touch targets are smaller than the spec's 44 × 44 px (minor)

- **Repro:** scratch `t11-menu.mjs` and `t14-late.mjs` (`smallTargets()` in `lib.mjs`: visible buttons outside the map
  with a side < 44 px) at 390×844 zh and 844×390 en.
- **Expected:** ui-spec §3.3 / §12: touch targets ≥ 44 × 44 px.
- **Actual:**
  - theatre chips 42–80 × **26** px (both orientations, every state);
  - orders-sheet grab **64 × 18** px, and it is the only place a swipe works: a swipe up on the sheet's top band
    beside it does nothing (`t1-map.mjs`: `swipeUpBeside: false`);
  - sheet / drawer grab "Drag down or tap to close" 88 × 24; Undo play 126 × 26;
  - Continue on the headline papers / scoring sheet 88 × 30 (zh) / 115 × 30 (en); the slip's speed segment 44 × 36;
  - menu sheet language switch "English" **28 × 24**, "简体中文" 41 × 24;
  - settings dossier segments 32–68 × 30 (Slow / Fast "慢 / 快" 32 × 30, On / Off 32 × 30), Close 49 × 30;
  - game-over telex (zh) 新游戏 63 × 30, 查看地图 / 完整记录 76 × 30; slip 新游戏 52 × 36, 结果 40 × 36.
  - (The zoom buttons and ☰ are 40 × 40, as §3.3 specifies; not counted.)
- **Evidence:** `t11-390x844-zh-US.json` (`audit`, `settings.audit`), `t14-844x390-en-USSR-s1.json` (`small`),
  `t4-390x844-zh-US-s13.json` (`endScreen.small`).
- **Likely files:** `src/ui/compact/compact.module.css` (chips), `src/ui/screens/GameScreen.module.css` (`.grab`),
  `src/ui/common/Sheet.module.css`, `src/ui/common/Button*` size `s` on compact, the menu / settings / telex styles.
  A transparent hit area (`::before` inset −8 px) would fix most without changing the look.

### F9 — Landscape iPhone: the page ignores the left/right safe areas, so the side column runs under the notch (major, emulated)

- **Repro:** scratch `t6-safearea.mjs en|zh`: 844×390 touch, then CDP `Emulation.setSafeAreaInsetsOverride`
  `{left: 47, right: 47, bottom: 21}` (iPhone 13 landscape values; `index.html` sets `viewport-fit=cover`, so Safari
  reports these). Same result in en and zh.
- **Expected:** the console, slip and dock stay inside `env(safe-area-inset-left/right)` (padding on the grid), as the
  bottom inset already is.
- **Actual:** nothing uses `safe-area-inset-left` / `-right` (`grep` finds no use in `src/`). In the 47 px band on the
  right sit the ☰ menu (x 798–838), the slip's "6 /6 LEFT" counter and right edge, and the dock's Status button
  (x 769–844); on the left the Europe chip (x 8–86) and the map edge. On a notched iPhone with the notch on the right
  the counter and slip text are under the sensor housing, and the corner buttons are under the rounded corners. Not
  seen on a real device (emulated insets); the CSS gap itself is certain.
- **Evidence:** `docs/qa/shots/qa-long-phone/f9-safe-area-844-en.jpg` (insets drawn in magenta).
- **Likely files:** `src/ui/screens/GameScreen.module.css` (`.landscape` grid: `padding-left/right:
  env(safe-area-inset-*)`, or pad the side column and the theatre overlay), `src/ui/common/Sheet.module.css`,
  `src/ui/common/Dossier.module.css` (sheets and dossiers that span the width).

### F10 — Landscape phone: the slip cuts the prompt title, hint and card name with "…" while half the slip is empty (minor)

- **Repro:** scratch `t17-crumb.mjs 844 390 en|zh 13 US` (`seed=13`, US). Turn 2 headline: East European Unrest's
  event-target prompt; turn 1 AR 2: Comecon's influence prompt. Compare with `t17-crumb.mjs 390 844 zh` (nothing cut).
- **Expected:** the side column's slip (283 × 279 px) shows the whole question; it has room below.
- **Actual:** the title column is 160 px wide (card clip on the left, counter on the right) and clamped to 2 lines:
  en "EAST EUROPEAN UNREST: REMOVE USSR INFLUENCE FROM A COUNTRY IN EASTERN…" needs 101 px of height, gets 40; zh
  "东欧动乱：移除一个东欧国家的苏联影…" (60 → 40). The influence hint is cut to 2 lines (en 46 → 30, zh 48 → 33,
  "每点需 2 …"), and in zh the card name in the crumb is cut to one character ("经…" for 经互会: 36 px box, 39 px
  text; "卧…" in `t3-rotate-zh-US/05-landscape-after-tap.jpg`). Meanwhile the slip's content ends at 89–147 px of its
  279 px. The full text is only in a `title` tooltip, which touch cannot show.
- **Evidence:** `docs/qa/shots/qa-long-phone/f10-landscape-slip-title-844-en.jpg`, `f10-landscape-slip-title-844-zh.jpg`;
  `t17-844x390-en.json`, `t17-844x390-zh.json`.
- **Likely files:** `src/ui/prompts/OrdersSlip.module.css` (compact variant inside `.landscape .sheet`: let the title /
  hint wrap fully, or put the counter below the title), `src/ui/screens/GameScreen.module.css` (`.landscape .sheet`).

### F11 — Landscape phone: the target list (accessible alternative to the map) cannot be opened (minor)

- **Repro:** scratch `t18-list.mjs zh 13 US`: at 390×844 tap the orders-sheet grab at an influence prompt → the target
  list appears (42 rows of 52 px; tapping a row places a point: `remaining` 2 → 1). Rotate to 844×390.
- **Expected:** ui-spec §8.13: compact shows the target list when the sheet is expanded; some way to open it in
  landscape too (screen-reader users rely on it, §8.13 "Screen readers use this list").
- **Actual:** in landscape the list is gone and cannot be reopened: `.landscape .grab { display: none }`, the slip's
  List link is suppressed for `variant="compact"`, and the `T` key's dossier is also desktop-only
  (`listOpen … variant !== "compact"`). Visible slip buttons in landscape: the card and "Undo play" only.
- **Evidence:** `t18-zh.json` (`list`, `tapRow`, `landscape`), `t18-zh/03-landscape.jpg` in the scratch dir.
- **Likely files:** `src/ui/screens/GameScreen.module.css` (`.landscape .grab`), `src/ui/prompts/OrdersSlip.tsx`
  (`listBtn` and the `listOpen` dossier exclude `compact`).

