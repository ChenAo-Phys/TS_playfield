# QA: accessibility, keyboard, reduced motion, settings (qa-a11y)

Dev server: `TSP_NO_HMR=1 npx vite --port 5188` with `?ai=policy` (network-argmax AI) and `?seed=N` (dev only).
Scripts: `$SP/qa-a11y/`
(`lib.mjs` helpers, `kbplay.mjs` keyboard-only play driven by `window.__tspAuto.suggest()` but answered only through
`page.keyboard`, others named per finding). Run each with `source scripts/pw-env.sh && node <scratch dir>/<script>` from the
project root, with a dev server on 5188 (`BASE=` overrides the URL). Relative paths below (`runs/…`, `snap/…`, `shots/…`,
`contrast-*.json`) are in that scratch dir.

**Progress:** complete. Keyboard-only play (2 full turns at 1440x900 USSR seed 13 and 1024x768 US seed 13, re-run on the current
build) done; findings A1-A10 confirmed; aria snapshots (1440, 390), reduced motion (system + setting), every setting by keyboard + reload, map labels 130 % (1024, 390; en/zh), contrast, focus-ring sweep, resign/telex done.

## Findings

### A1. Play-mode stage: "S" stages the space race, then Enter plays the Event (major)
- **Repro:** `t5-space.mjs` (`W=1440 H=900 SEED=13` and `W=1024 H=768 SEED=3`). Dev server, `?ai=policy&seed=13`, en, default
  settings (`confirmFinal` on). Play USSR, reach your first action round, pick any non-scoring card (seed 13: Socialist
  Governments). On "How will you play it?" press `S`, then `Enter`.
- **Expected:** `S` stages Space race (it does: the row is pressed and the slip says "Attempt the launch ↵"); `Enter` (shortcut sheet:
  "Enter: confirm a staged choice") attempts the launch.
- **Actual:** focus stays on the auto-focused **Event** button, so the keymap gives Enter to that button (Enter on a control belongs
  to the control). Seed 13: the **Event** of Socialist Governments is played (event-target prompt follows, space track unchanged).
  Seed 3 (Five Year Plan, an opponent card whose Event ends the play): Enter switches the staged choice to Event, and a second
  Enter commits the US event (no undo). The same happened in the keyboard play-through (`runs/kb2-1440-USSR-13/result.json`,
  play-mode #21: pressed `S` + Enter on Decolonization, and the next four prompts were Decolonization's event targets).
  Reproduced 3 times.
- **Evidence:** `docs/qa/shots/qa-a11y/space-staged-enter-plays-event-1440.jpg` (Space race staged, focus ring on Event, slip
  says "Attempt the launch ↵").
- **Likely files:** `src/ui/prompts/PlayModeStage.tsx` (the `e/i/c/r/s` handler calls `activateOption` but does not move focus
  to the staged row; or Enter on a mode button should confirm the staged option when another row is staged), `usePromptKeys.ts`.

### A2. Focus falls to `<body>` after every play-mode choice, after Continue, and after starting a game (major)
- **Repro:** `kbplay.mjs` (`TAG=kb2-1440-USSR-13 W=1440 H=900 SIDE=USSR SEED=13 TURNS=2` and `W=1024 H=768 SIDE=US`). Keyboard
  only. After choosing a mode on the play-mode stage (`E/I/C/R/S` or Enter on a mode button), `document.activeElement` is
  `<body>` (13 of 13 play-mode / op-mode answers at 1440 and 13 of 13 at 1024). Same after `Space`/`Enter` on Continue of the headline
  papers and the scoring sheet (4 of 4 at 1440, 1 of 1 at 1024), and after picking a side on the start screen.
- **Expected:** ui-spec §12 "Dialogs ... focus returned to the opener"; the task rule "never lost to <body> after a dialog closes".
  The opener (the played hand card) no longer exists, so focus should go to a stable place: the map's first target for map
  prompts (coup / realign / influence / event targets), else the slip or the hand.
- **Actual:** focus on `<body>`. Chrome happens to continue Tab from where the removed node was (4 Tabs to the first map target),
  but a screen reader's virtual cursor goes back to the top of the page each action round, and the next prompt is not reachable
  by any documented key (`[`/`]` and the arrows work only once focus is inside the map).
- **More cases (same cause):** Esc on the play-mode stage ("Back to hand") returns the card to the hand but focus goes to
  `<body>`, not to that card (`t10-keys.mjs`); Esc on the game-over telex ("Review board") → `<body>` (`t9-over.mjs`); Esc from
  an open ☰ menu item → `<body>` (A5).
- **Evidence:** `runs/kb2-1440-USSR-13/result.json` (trace with focus after each answer), `focus-lost-*.jpg` in the same folder.
- **Likely files:** `src/ui/prompts/PlayModeStage.tsx` (the non-modal stage dialog has no focus hand-off when it unmounts),
  `src/ui/stage/HeadlinePapers.tsx` / `ScoringSheet.tsx` (`useFocusReturn`-style return to an opener that is gone),
  `src/ui/common/Dossier.tsx` `useFocusReturn` (no fallback when the opener is disconnected), `src/ui/App.tsx` / StartScreen.

### A3. The "Skip to map" link does nothing (major)
- **Repro:** `t4.mjs` (`W=1440 H=900` and `W=1024 H=768`). In a game at the setup prompt: focus the page, Tab once (the skip link
  gets focus), press Enter.
- **Expected:** focus moves into the map (the first legal target, or the map itself).
- **Actual:** focus stays on the skip link. `GameScreen.tsx` focuses
  `document.querySelector("#ts-map [tabindex='0'], #ts-map svg")`; a selector list returns the first match **in document
  order**, which is always the `<svg role="application">` (an ancestor of the boxes). The svg has no `tabindex`, so `.focus()`
  is a no-op. Same at setup, action-card and influence prompts, both viewports.
- **Likely file:** `src/ui/screens/GameScreen.tsx` line ~230: query the boxes first (`#ts-map [tabindex='0']` and only if none,
  the svg) and give the svg `tabIndex={-1}`.

### A4. AI plays are announced to screen readers only on the desktop rail (major)
- **Repro:** `kbplay.mjs` records every live-region change (`runs/*/live.json`). 1440x900 (desktop rail open): the visually
  hidden `aria-live` mirror in Dispatches announced 49 AI log lines in two turns. 1024x768 (tablet, rail strip): **0**. The mirror
  is inside `Dispatches`, which is mounted only by the open desktop rail and the compact Log sheet, so tablets, phones (sheet
  closed) and a collapsed desktop rail (`L`) get no announcement of what the AI did.
- **Expected:** ui-spec §12 "A log mirror that announces each AI play once", in every arrangement.
- **Likely files:** `src/ui/rail/Dispatches.tsx` (move the announcer out to a component the shell always mounts, e.g. in
  `GameScreen.tsx`), `src/ui/rail/Rail.tsx`, `RailStrip.tsx`, `src/ui/compact/CompactSheets.tsx`.

### A5. The ☰ menu cannot be used from the keyboard (major)
- **Repro:** `t7-menu2.mjs` (1024x768) and `t8-menu3.mjs` (1440x900). In a game, focus the console's **Menu** button (or the
  wordmark "open the menu") and press Enter.
- **Expected:** focus moves to the first item ("New game"), arrows move between items (`Menu.tsx` implements this), Esc closes
  and returns focus to the button.
- **Actual:** the menu opens but focus stays on the button; ArrowDown does nothing. `Menu.tsx` focuses the first item in a
  `useEffect` while the `Popover` is still `visibility: hidden` (it becomes visible only after its layout effect places it), so
  `focus()` is ignored. The items are portalled to the end of `<body>`, after the rail: **13 Tabs** to reach "New game" at
  1024x768, **85 at 1440x900** (turn 1, AR 1; it grows with the log, see A6). Esc with focus on an item closes the menu and
  focus falls to `<body>` (4 of 4 tries). New game, Resign and About are only in this menu. Same with a mouse click on Menu
  (`snap.mjs`: focus stays on the button).
- **Likely files:** `src/ui/screens/Menu.tsx` (focus after the popover is placed, e.g. in a `requestAnimationFrame` or when
  `pos` is set; return focus to the anchor on close), `src/ui/common/Popover.tsx`. Minor: the Popover and the inner div are both
  `role="menu"` (nested menu "Menu" in the accessibility tree).

### A6. The log is hundreds of Tab stops; Tab order past the rail is impractical (minor)
- **Repro:** `t8-menu3.mjs` (1440x900, seed 13). Every country / card reference in a Dispatches entry is its own Tab stop.
- **Measured:** 70 Tab stops in the log at turn 1 AR 1, **274** at the start of turn 3 (129 entries); from the first log entry it
  takes 275 Tabs to leave the rail. It grows by ~100 per turn, so by turn 10 the rail is ~1000 Tab stops; the ☰ menu items
  (portalled after it, A5) move further away each turn.
- **Expected:** ui-spec §12 Tab order "console → map → slip → hand → rail": the log as one Tab stop (the scrollable tape already has
  `tabIndex=0`) with references reachable by arrow keys (roving tabindex), or references with `tabIndex=-1`.
- **Likely files:** `src/ui/rail/Dispatches.tsx` and the log-entry reference renderer.

### A7. Start screen: the first Tab focuses a hidden backdrop map box and opens its tooltip (minor)
- **Repro:** `t7-menu2.mjs` (1440x900 and 1024x768). Load the start screen, press Tab once.
- **Expected:** the first Tab stop is the language switch (or a side folder).
- **Actual:** focus goes to the backdrop map's "Norway" box (`g[role=img]` with `tabIndex=0`, inside `aria-hidden="true"`), and its
  tooltip ("NORWAY · US (you) 0 · USSR 0 · Right-click or Space: keep this open") opens over the "Toss a coin" folder. Screen
  readers announce nothing for that stop (aria-hidden).
- **Evidence:** `docs/qa/shots/qa-a11y/start-first-tab-hidden-map-box-1024.jpg`.
- **Likely files:** `src/ui/screens/StartScreen.tsx` (the map backdrop should be `inert`, or MapView should render with no
  roving tab stop when not interactive), `src/ui/map/MapView.tsx` (`tabIndex = id === roving ? 0 : -1` also outside prompts).

### A8. Target list (T): after each placement the cursor jumps back to the first row (major)
- **Repro:** `t15-list.mjs` (1440x900 and 1024x768, seed 13, USSR setup). Press `T`, ArrowDown twice (East Germany), Enter, Enter.
- **Expected:** the list is the screen-reader way to place influence (ui-spec §8.13). After a placement the active row stays on
  the country just used, so repeated Enter keeps adding there (as repeated Enter does on a focused map box).
- **Actual:** the first Enter places in East Germany, then `aria-activedescendant` resets to the first row (Finland), so the second
  Enter places in **Finland** (log: `["East Germany","Finland"]`, both viewports). A screen-reader user who presses Enter twice gets
  a point where they did not ask for it (undo exists until the final point, which stages).
- **Also (wording):** option names read "Finland 4 US 0 USSR 1" / "East Germany 3 Battleground US 0 USSR 3": the stability number
  has no word and the action/cost ("+1", "2 Ops") is not in the name (map boxes say "stability 4 ... legal target").
- **Likely file:** `src/ui/prompts/TargetList.tsx` (keep the active id across prompt changes when that country is still a target;
  give options an aria-label like `ui:map.countryLabel` + the action).

### A9. AI-play announcements leave out the outcome (minor)
- **Repro:** `t12-coupann.mjs` (1440x900, seed 13, USSR, `?ai=policy`, through turn 2) records the `aria-live` mirror in Dispatches.
- **Expected:** "live-region announcements for AI plays and results" (task), ui-spec §12 "a log mirror that announces each AI
  play".
- **Actual:** the mirror speaks only the entry's main line (`render(e.text)`), never its detail lines. For the AI's coup in Egypt
  the Dispatches entry says "Coup in Egypt: US rolls 1 (+1 Ops = 2) vs 4 Defense -> Coup Failed ... DEFCON: 3 -> 2"; the
  announcement is only "US attempts Coup in Egypt". Likewise an AI scoring card ("US plays Card: Europe Scoring (#2)", no VP
  result; with pause-on-reveals off no dialog shows it either), an AI event's effects ("US plays Captured Nazi Scientist for its
  Event", no space-race move), and the headline reveal (the "Headlines Simultaneously Revealed: US plays Marshall Plan" text is in
  the human side's entry, so it is never announced). No hidden information was announced: every announcement matched the redacted
  log (49 lines over two turns, `runs/kb2-1440-USSR-13/live.json`).
- **Likely file:** `src/ui/rail/Dispatches.tsx` (announce the entry's details, or a short result line, for AI entries; announce
  the headline reveal).

### A10. A few map texts below WCAG AA (minor)
- **Method:** `contrast.mjs` renders the page, then re-renders with every text transparent and compares each text run's colour with
  the median background under it (states: start, setup, action-card, play-mode, settings, headline; 1440 en/zh, 390 en). Body text
  on the console, slip, dossiers, hand, rail and log passes AA (text under a modal scrim was ignored).
- **Below 4.5:1 (all small text):**
  - Region plates, USSR presence chip "PRES"/"存在": gold on the chip at `.chipPres { opacity: .82 }` → 3.3:1 (12 px bold).
    The 82 % opacity lightens `--ts-ussr-600` to about rgb(183,73,63); the token pair is 4.6:1 only at full opacity.
  - Sea labels "To USA" / "往美国" (`.wrapLabel`, us-700 on the sea): 3.7:1.
  - Plate "If scored" / "若计分" (10 px) and the net "Even" / "持平": ink-500 on the plate, 4.2-4.3:1.
- **Evidence:** `docs/qa/shots/qa-a11y/plate-chips-contrast-zoom.jpg` (Europe/Asia plates, 4x), JSON reports
  `contrast-*.json` in the scratch dir.
- **Likely file:** `src/ui/map/MapView.module.css` (or the map css holding `.chipPres`, `.wrapLabel`, `.plateNetLabel`).

### A11. Camera keys `+ − 0` work only with focus inside the map (polish)
- **Repro:** `t19-camera.mjs` (1440x900). With focus on `<body>`, a hand card or a console button, `+` does nothing; with focus on a
  map box it zooms. The shortcut sheet lists "+ − 0: Zoom in · zoom out · whole map" without the "Map:" prefix that the other
  map-only rows (arrows, `[ ]`, `1–7`) carry.
- **Fix either way:** prefix the row ("Map: zoom in · zoom out · whole map" / "地图：放大 · 缩小 · 全图") in
  `ui:shortcuts.row.camera`, or bind `+ − 0` globally in `GameScreen.tsx`.

## Checked and fine (no finding)
- **Keyboard-only play:** 2 full turns at 1440x900 (USSR, 61 answers) and 1024x768 (US, 65 answers: setup, bid, headline, influence,
  coup, realignment, events with targets, space race, scoring card, op-mode) answered only through `page.keyboard`: 0 page errors,
  0 unreachable prompts. Every documented key works as listed except A1 (`S` + Enter), A3 (skip link), A11 (camera keys): Tab /
  Shift+Tab, arrows in the map (spatial, targets first), `[ ]`, `1–7`, Enter (stage, second Enter commits coups / realigns / final
  points), hold Enter (Resign: a 0.5 s Enter does nothing, 1.5 s resigns), Space (map tooltip, card zoom, Continue), Esc (closes
  dossiers / popovers, "Back to hand" on the play-mode stage), `Z` and `Ctrl+Z`, `D` (stages, second `D` commits), `E I C R`,
  `T`, `L` (rail 288 ↔ 60 px), `?`.
- **Focus visible:** a Tab sweep from the skip link through console, map, hand, piles, rail and log (`t14-sweep.mjs`) shows a drawn
  ring on every stop (pixel diff and computed outline/box-shadow); no stop off screen; one log reference is covered by the "Jump
  to latest" button while it shows.
- **Dialogs:** Settings, Keyboard shortcuts, target list, card zoom, Resign confirm, headline papers, scoring sheet, game-over telex
  are `role="dialog"` with a name and `aria-modal="true"`; focus moves in, Tab is trapped, Esc closes; Settings / shortcuts return
  focus to their opener. The play-mode stage is a named non-modal dialog with focus on the first mode. Compact (390x844): the
  hand drawer and the play-mode sheet take focus (keyboard flow, `t13-compact.mjs`).
- **Names:** 0 unnamed buttons / links / radios in 14 states at 1440 and 13 at 390 (`snap.mjs`, `snap/*/lint.json`). Map boxes
  read "Iran, Middle East, battleground, stability 2, US 2 controlled, USSR 0, legal target"; region plates "Europe: if scored
  now, USSR +1"; hand cards "Suez Crisis, 3 Ops. Playable"; console instruments are labelled groups; `kbd` hints are
  `aria-hidden`; settings are radio groups with one Tab stop and arrow keys.
- **Hidden information:** no card from the AI's unrevealed hand appears in any text, `aria-label`, `title` or `alt` during two
  turns as the US (`t16-leak.mjs`, 268 checks of 1146 hidden cards; the 6 name matches were all public log lines of cards being
  played or reshuffled, because the engine runs ahead of the shown frame). The live regions never announced an AI card before it
  was played.
- **Reduced motion:** system `prefers-reduced-motion` and the app's Motion = Reduced give the same result (`motion.mjs`, turn 1 at
  normal speed): no running translation / rotation / scale animation; card flights are fade-out → cut → fade-in; ambient loops
  (thinking dot, caret, drift) are paused; Motion = Full under a reduced system preference brings full motion back. The game
  flows: 38 answers in 35 s with 0 stalls (49 s with full motion). Some fades run 220-700 ms (influence "+1" numbers hold then
  fade, scrim-out 380 ms) against the spec's "cross-fades ≤ 150 ms"; they do not move.
- **Settings:** every option changed by keyboard mid-game (`settings.mjs`) applies at once (`data-motion`, `data-labels`,
  `data-patterns`, `--ts-speed`, card image `en/` → `zh/`, `<html lang>`), and all of them (plus the language) survive a reload
  and show in the dossier. Instant speed + pause on reveals still stops at both headlines and each scoring card; instant + pause off
  runs 2 turns with no stop and no stall. Map labels 130 % at 1024x768 and 390x844 in en and zh: no name overflows its box or
  overlaps the stability box (84 boxes each). Patterns on/off toggles the hatch on the 4 USSR-controlled boxes at once.
- **Contrast:** see A10; everything else sampled passes AA.

**Not covered:** a real screen reader (NVDA / VoiceOver) — semantics were checked through Playwright accessibility snapshots
and live-region recording only; Safari / iOS; browser zoom 200 %; forced colours.
