# Handoff: shell + integration (`ui-shell`, W1)

Owner: **shell**. Files: `src/main.tsx`, `index.html`, `src/ui/App.tsx`, `src/ui/screens/**` (dev-only `demo/`),
`src/ui/compact/**`, `tests/ui/shell/**`, `src/i18n/locales/{en,zh-CN}/ui_shell.json` (and `ui.json`, unchanged),
`src/ui/map/contract.ts`. Spec: `docs/design/ui-spec.md` §3, §11, §12, §3.3/§3.4, §15.3 "W1", and the whole spec as integrator.

## 1. The composed app

```
main.tsx            fonts.css → tokens.css → base.css; await initLanguage(); <StrictMode><App/>   (the entry chunk)
App.tsx             appController() once (module singleton; StrictMode-safe) → controller.boot()
  <KeymapProvider>                          one keymap (src/ui/common/keymap.ts)
    <UiRootProvider controller>             vm, settings, layout, anchors, director, toasts, zoom, <html> attrs
      <ShownProvider>                       the frame runner, above both screens (it keeps acking on the start screen)
        <ShellContext>                      open(dialog) · toStart() · showResult() · gameKey · telexKey
          route: boot | loading | menu | error → StartScreen (+ <Toaster fixed/>)
                 playing | over → <Suspense><gameChunk.Component key={gameKey}/></Suspense>   (lazy GameScreen)
                 also StartScreen while the player picks a side for a new game, while the coin lands, and while the
                 game chunk is not in yet (never a loading fallback)
          Settings / About / Shortcuts / New-game confirm / Resign confirm dossiers   ("?" toggles the shortcuts)
GameScreen          <CountryPulseContext value={id => map.pulse(id)}> <TrayBeatsProvider humanSide>
  grid per layout (§3; GameScreen.module.css)
    Console variant = desktop (≥ 1440) | condensed (1200–1439) | tablet | compact
    <main id="ts-map" class=table>   MapView (+ useMapBeats, usePromptMapProps, Stage focus, ScoringTable plates,
                                     anchors, insets = tray height − 6, overlap 64/48/0, follow)
                                     <Stage/> once · <PromptStage/> · compact Ticker · tablet RailFlyout host · <Toaster/>
    desktop: <Rail collapsed onToggle/> (column = --ts-rail-strip-w when collapsed)
    tablet:  <RailStrip/> column + one 320 px flyout over the table's right edge
    desktop/tablet: <Tray slip={<OrdersSlip variant/>} offered staged onActivateCard onOpenPile/>
    compact: TheatreBar · orders sheet (grab: tap / swipe → expanded 60 %, OrdersSlip expanded) · BottomDock · CompactSheets
  <PromptDialogs/> · pile viewer <CardPicker browse/> · <CardZoomHost actions={CardSheetActions}/> · <FlightLayer/>
  <DangerFrame/> · <GameOverTelex key={gameKey:telexKey}/> while vm.ending · <Menu/>
```

* **Code splitting** (`src/ui/screens/lazyChunks.ts`): `gameChunk` = `import("./GameScreen")` (the map geometry, stage, tray,
  prompts, console, rail, compact…) and `mapChunk` = `import("../map")` (the start screen's backdrop; the game chunk shares
  it). Each is a `React.lazy` component with a cached `load()`; once loaded, its lazy component resolves in the same render
  (a resolved thenable), so Suspense never shows a fallback. The start screen renders the map when `mapChunk` is in (it
  fades in, 900 ms; none under reduced motion) and calls `gameChunk.load()` from `whenIdle` (requestIdleCallback, 2 s
  timeout; 300 ms timer where missing). `App` keeps the start screen while a game is on but the chunk isn't in; a failed
  download toasts `ui_shell:error.gameChunk` and Resume / a side choice retries. Production (preview, 1440 × 900): entry JS +
  CSS at 16 ms, map chunk 84 ms, game chunk 276 ms (idle), first contentful paint 136 ms; clicking USSR showed the game
  158 ms later with **no new chunk request**.

  | Build (`vite build`, gzip) | before | after |
  |---|---|---|
  | entry JS `index-*.js` | 950.05 kB (308.54) | **529.04 kB (167.36)** |
  | entry CSS | 198.67 kB (36.68) | **67.43 kB (14.17)** |
  | map chunk JS + CSS | — | 185.93 kB (65.04) + 17.27 kB (3.89) |
  | game chunk `GameScreen-*` JS + CSS | — | 242.88 kB (79.08) + 115.84 kB (20.55) |

  The entry is still just over Vite's 500 kB warning: react-dom 132 kB, i18next 81 kB, the English catalogs 79 kB (all
  namespaces), card / country / DS data 115 kB, the controller + engine wrapper + log generation ~110 kB — all needed by the
  boot line. A `manualChunks` vendor split would silence the warning (see requests).
* **Controller wiring** (`src/ui/screens/appController.ts`): `createGameController({ loadEngine: () => WasmEngine.load(),
  ai: createAiPlayer(config), storage: browserStorage(), minAiDelayMs: config.minDelayMs })`.
* **Dev-only fast AI**: `?ai=policy` (network argmax, 250 ms minimum delay) and the QA hook `window.__tsp` (the controller)
  exist only behind `import.meta.env.DEV`. Verified: the production bundle contains neither `get("ai")` nor `__tsp`, and the
  production preview with `?ai=policy` in the URL saved `search: rollout:…:belief2048:race16` (leaderboard #1).
* **Keys** (§12): Space / Esc skip while `shown.busy` (they fall through otherwise), Shift+Space skips to my turn, `?` the
  shortcut sheet, `L` the log sheet on compact (the desktop Rail binds L itself). A click on the table while busy skips
  (controls and dialogs excluded). The slip, play-mode stage and dossiers bind their own keys.
* **Game over**: the telex closes on Review board; the slip's "Game over" body now has **New game** and **Result**
  (reopen the telex) through `useShell()`. New game → start screen; the finished game is not resumable, so no replace prompt.
  Menu → New game (confirm) → start screen without a second "replaces your saved game" prompt; **Resume** there goes back
  to the running game.
* **Boot line** (§11.1): link → engine → AI model (MB from `MODEL_BYTES` × fraction) → verify → start AI → "Ready" (below
  the bar). `vm.load` going away after AI progress = ready (an error forgets the progress, so a Retry never reads "Ready"
  early). On `status: "error"` the line turns alert orange with the `ui:error.*` message for the stage that failed, a
  **Retry** and a details disclosure; the side folders dim (not-allowed cursor). Retry (`retryBoot` in `App.tsx`, K-001):
  while no game is in progress it calls `controller.boot()` again, which retries a failed engine load or a failed pre-game
  AI load in place (no reload); a mid-game AI failure reloads the page, which resumes from the autosave.

## 2. Public API

| Export | Props / signature |
|---|---|
| `App` (`src/ui/App.tsx`) | `{ controller?: GameController }` (default: the page's) |
| `StartScreen`, `COIN_MS`, `agoText(lang, savedAt, now?)` | `{ coin: CoinState; confirmReplace; inGame; onPick(side); onResume(); onSettings(); onAbout() }` |
| `lazyChunk(importer, pick)`, `gameChunk`, `mapChunk`, `useChunk(chunk, want?, onError?)`, `whenIdle(fn, timeout?)` (`screens/lazyChunks.ts`) | `LazyChunk<P>`: `{ Component; load(); loaded(); subscribe(fn) }` |
| `BootLine`, `bootProgress(status, load, aiReady)`, `errorKey(stage, error)` | `{ load?; error?; onRetry(); status; aiReady; failedStage?; className? }` |
| `GameScreen`, `consoleVariant(layout, width)`, `useViewport()` | no props (reads `useUiRoot`, `useShown`, `useShell`) |
| `SettingsDossier`, `AboutDossier`, `ShortcutsSheet` (+ `SHORTCUT_ROWS`), `ConfirmDossier` | `{ onClose() }`; Confirm `{ kind: "newGame" \| "resign"; onConfirm(); onClose() }` |
| `Menu` | `{ anchor: Element \| null; onClose(); onOpen(dialog); onNewGameNow() }` (popover; compact: sheet with the language) |
| `Segmented` | `{ label; value; options: {value,label}[]; onChange(v); id? }` (radio group, arrows) |
| `ShellContext`, `useShell()`, types `ShellActions`, `ShellDialog`, `CoinState` | `src/ui/screens/shellContext.ts` |
| `appController()`, `pageAiConfig()` | `src/ui/screens/appController.ts` |
| `TheatreBar`, `THEATRE_ORDER`, `theatreCounts(targets)`, `framedSlot(view)` | spec props + `regionTargets?`, `stagedRegion?`, `onRegionActivate?`, `onRegionHover?`, `overlay?`, `className?` |
| `BottomDock`, type `DockPanel` | `{ open; onOpen(panel); iconsOnly?; className? }`; stands in for `hand:<human>`, `hand:<ai>`, `milops:*`, `space:*` while its sheet is closed |
| `Ticker`, `TICKER_MS` | `{ entry; aiPlayCard; aiSide?; how?; ar?; quiet?; onOpenLog?; className? }` (one-line recap 6 s, or the 72 px play banner) |
| `CompactSheets` | `{ panel; onClose(); offered; staged; onActivateCard(card); onOpenPile(pile) }` (hand drawer kept mounted, adversary + effects, log 80 %, status + piles + effects) |
| `src/ui/map/contract.ts` | now re-exports `RegionSlot`, `MapTargets` from `ui-contract`; `CountryBeat = Extract<Beat,{k:"country"}>`; `MapHandle extends` the contract's; `MapViewProps` = contract props widened (`Omit` + nullable state) |

i18n: `ui_shell` (en + zh-CN): `table.label`, `sheet.*`, `theatre.*`, `dock.*`, `ticker.*`, `menu.about`, `over.result`,
`about.*`. Everything else reuses `ui:*` (start, settings, shortcuts, menu, game, about, links, loading, error, plate names…).

## 3. How to test / demo

* `npx tsc --noEmit -p .` — clean. `npx vitest run tests/ui tests/i18n tests/theme tests/map` — **45 files, 912 tests** pass.
  Mine (`tests/ui/shell`, 2 files, 86 tests): helpers (console variant, boot progress, error keys, "ago", theatre counts,
  `framedSlot`, the production AI config); `App` renders the game screen on 7 recorded scenes; `GameScreen` in all four
  layouts on each (console variant, rail / strip / dock); `App` routes boot/loading/menu/error to the start screen; the start
  screen (sides, chips, boot line, resume summary, disabled until the engine, compact); boot-line error and ready; every
  dialog; the compact parts; Chinese; an en-XA sweep (every shell string marked); §18.2 stylesheet rules, CSS-module classes
  exist, reduced-motion variants, `ui_shell` parity / glossary / spacing.
* `npm run build` — succeeds (main chunk 950 KB / 309 KB gzip; Vite warns about the size). `dist/` holds no rulebook and no map
  reference image (only cards, engine, fonts, model, assets).
* **Play-through driver** (dev only): `src/ui/screens/demo/play.mjs` drives the real app by clicking the real UI (map boxes at a
  point verified uncovered, hand cards / China slot, play-mode rows, dossier tiles, picker cards, the slip's done / primary,
  the compact card sheet's answer, the dock's Hand button). It uses `window.__tsp` only to decide what to click; a prompt the
  UI fails to answer is counted as a **fallback** and fails the run. A stall watchdog dumps the screen after 25 s of no progress.
  Its full usage (the autopilot `--policy ai|random`, `--until end`, `--game-seed n`, `--auto policy|full`, `--touch`,
  `--json file`, a no-HMR dev server) is in `docs/handoff/ai.md`, "The play-through driver":
  ```sh
  TSP_NO_HMR=1 TSP_VITE_CACHE=node_modules/.vite-PORT npx vite --port PORT --strictPort &   # restart it after your edits
  source scripts/pw-env.sh
  node src/ui/screens/demo/play.mjs --url http://localhost:PORT/TS_playfield/ --side USSR|US|random --until 3|end \
       [--policy ai|random] [--game-seed n] [--auto policy|full] [--w 390 --h 844 --touch] [--lang zh] \
       [--undo --switch-lang --reload --resign] [--shots dir] [--json file]
  ```
  First results (before the autopilot, random play, `?ai=policy`, speed fast, pause on reveals on):

  | Run | Result |
  |---|---|
  | 1440×900 USSR, undo + language en→zh→en + reload/resume + resign | turn 3 reached, 62 / 52 answers (two seeds), **0 fallbacks, 0 errors** |
  | 1440×900 US | end of turn 2 (the AI won on the turn-2 mil-ops penalty), 0 fallbacks, 0 errors |
  | 1440×900 random (→ US) | turn 3, 0 fallbacks, 0 errors |
  | 390×844 USSR, all QA moves | turn 3, 0 fallbacks, 0 errors (twice, before and after the camera fix) |
  | 1024×768 random, 844×390 US | turn 2, 0 fallbacks, 0 errors |

  Exercised across runs: setup + bid, headline phase (papers + Continue), coups, realignments (roll + stop), events with
  targets, scoring cards (incl. net 0), undo, language switch mid-game, reload + Resume, resign (hold) → telex.
* **Production**: `npx vite preview --port 4189 --strictPort` (base `/TS_playfield/`), no `?ai`: the boot line reaches Ready
  in < 1 s (cached), the full-strength AI (belief2048 search) made its 6 setup decisions in 5–6 s of thinking, no errors.
* **Fixture demo**: `src/ui/screens/demo/index.html?scene=<fixture>&lang=en|zh|en-XA` — the real `GameScreen` composed as in the
  app over a `FixtureController` (`toolbar=1` for the dev toolbar, `dialog=settings|about|shortcuts|newGame|resign`,
  `variant=committed`: turn 4, your headline committed face down beside an 8-card hand, from `prompt-headline`).
* **Screenshots**: `node src/ui/screens/demo/shoot.mjs [--out dir] [--only start,coup] [--vp 1440,390] [--lang en,zh]` →
  `docs/design/shots/app-<state>-<w>x<h>-<lang>.png`: 7 states (start, influence, coup tooltip, AI turn with the reveal dock
  and dice, headline papers, scoring sheet, game over) × 1440×900, 1366×768, 1024×768, 390×844, 844×390 × en / zh, plus en-XA
  at 1440 and 390 — **84 files, 53 MB**, no horizontal page scroll anywhere. The start screen comes from the real app, the
  game states from the fixture demo so every viewport shows the same moment. Compared with `final-*.png`.

## 4. Integration fixes in other workstreams' files

| File | Fix | Why |
|---|---|---|
| `src/ui/prompts/OrdersSlip.tsx` | `slipMode`: "over" only once the last frames have played (`!shown.busy && !vm.queued`) | the controller is "over" as soon as it queues the final frames; the slip said "Game over" while the scoring sheet / last AI play still animated (spoiler) |
| `src/ui/prompts/OrdersSlip.tsx` | **Continue** (`ui:slip.continue`, Space cap) replaces Skip while `useStageWaiting().waiting`, in AI mode and in the frozen slip | stage request; §10.2 "Continue ⎵ in the slip" (your own scoring card / headline froze the slip without it) |
| `src/ui/prompts/OrdersSlip.tsx` | game-over body: **New game** + **Result** via `useShell()` | §10.4 "Review board leaves a Game over · New game chip" |
| `tests/ui/prompts/model.test.ts` | two `slipMode` assertions for the above | |
| `src/ui/stage/RevealDock.tsx` | registers `card:<id>` on the dock's card (besides `dock`) | console request: the VP chip starts at `card:<source.card>` (G7) |
| `src/ui/stage/ScoringSheet.module.css` | compact sheet `bottom: var(--stage-bottom)` | the compact orders sheet overlaps the map by 14 px (`--stage-bottom: 14px` set by the shell) |
| `src/ui/map/MapView.tsx` | the staged selection keeps its tooltip while the clicked box keeps focus (`focused === selection`) | prompts request; §8.6 coup "reticle + pinned tooltip with the odds strip" |
| `src/ui/map/useCamera.ts` | a programmatic `frame()` marks the view as chosen, so a container resize keeps centre + scale | **compact bug**: the orders sheet changes height with every prompt / staged choice, and each resize threw the follow-camera framing away (the map jumped to the whole world; a staged coup's tooltip pointed off screen) |
| `src/ui/map/names.ts`, `index.ts` | `MAP_SHORT` table removed; `shortName` reads `COUNTRIES[id].short[lang]` | i18n-ext request (G12; the data now carries the abbreviations, unchanged on screen) |
| `src/ui/map/strings.ts` | zh fallbacks "需 2 行动点", "与敌方超级大国相邻" | i18n-ext request (glossary) |
| `src/ui/map/glyphs.ts` | re-exports the shared glyphs from `src/ui/common/glyphs.ts` | common request (no duplicate paths) |
| `src/ui/console/Console.module.css` | compact landscape: no "DEFCON" caption next to the numeral, tighter padding, the turn readout ellipsizes, VP keeps 76 px | the 300 px side column cut the VP readout to "US…" / "苏" |
| `src/ui/state/UiRootProvider.tsx` | toasts: the provider stores and removes; the Toaster runs each countdown | common request; the provider's own timer ignored the Toaster's hover/focus pause |

Requests checked and **not needed** (already done by their owners): common's `usePrefersReducedMotion` already reads
`settings.motion`; the stage's dock already collapses into the card's pile; the console already toasts DEFCON 2; logic-fix's
deal / net-0 scoring events (a net-0 scoring opens the sheet with "Even" — seen in `seq-ai-event`); `ui:tip.battlegroundDefcon`
is used for the coup line. The prompts workstream's "a click without a hover first doesn't activate a box" **does not
reproduce in the app**: a direct mouse click and a touch tap on a setup target both placed a point (its demo was the cause).

## 5. Deviations from the spec (with reasons)

1. **No Sound row** in Settings (§11.2): no sounds ship (§13 optional), a switch would do nothing.
2. ~~Retry reloads the page~~ — **Retry calls `boot()` again** before any game (the controller forgets a failed attempt); only a
   mid-game AI failure reloads the page (it resumes from the autosave). QA round 1, K-001.
3. **Menu → New game** asks once (`ui:game.newGameConfirm`); the start screen then starts without the second "replaces your
   saved game" prompt, and its Resume returns to the running game.
4. The **coin** spins while the controller draws, then lands (900 ms) on the drawn side's seal; the start screen stays up for the
   landing (+350 ms). Reduced motion: no spin, instant.
5. **Start screen** fine print sits under the boot line below 1400 px wide (beside it at ≥ 1400, as the mockup); short
   viewports shrink the title (≤ 860 / ≤ 700 px high); compact landscape puts the three folders in a row with a small title.
   The title "TWILIGHT STRUGGLE" stays Latin in Chinese with 冷战热斗 under it (as `final-start-zh.png`).
6. **Theatre bar pressed chip** follows the camera (`framedSlot`: the region that best fills the view; in a tall portrait view
   the region whose area is centred nearest the view's centre) as well as taps. A tapped chip stays pressed while the view is
   that tap's own (its settle, an orders-sheet resize); a pan, zoom or follow-camera move hands it back to the camera (Q-047).
7. **Hand drawer** (compact) also closes when the card prompt ends (your choice is made), not only on a non-card prompt — else it
   stayed over the headline papers and their Continue.
8. **Ticker** = the AI's last *play / headline / event* entry (`side === ai`), hidden while your own frames play; the compact
   play banner's how-chip comes from the AI's `reveal` beat.
9. The **compact orders sheet** expands to 60 dvh with the grab (tap, or a swipe of 24 px); compact landscape shows the slip in the
   side column without a grab.
10. `BootLine` / `TheatreBar` / `BottomDock` / `Ticker` take the extra props listed above; `CompactSheets` takes the hand props.
11. The shortcut sheet and the confirmations are `Dossier`s (full-screen sheets on compact, as every dossier).

## 6. Open issues (most severe first)

1. ~~Main chunk 950 KB~~ — split (prep-ui): entry 529 KB / 167 KB gzip, see §1. Still over Vite's 500 kB warning (request 5).
2. ~~Random play loses fast~~ — the driver now plays with the autopilot (`--policy ai`, default) and reaches final scoring on
   turn 10 (`docs/handoff/ai.md`); `--policy random` keeps the old quick games.
3. ~~Compact scoring sheet: Continue below the fold~~ — fixed (stage, prep-ui): the sheet body scrolls under a fixed Continue
   footer and scrolls to the net bar; 390 × 844 now fits whole, 844 × 390 scrolls with the net bar and Continue in view.
4. ~~The DemoHarness StrictMode dispose bug~~ — fixed (runner); `?think=` demos run.
5. ~~`HoldButton` `forwardRef` / `autoFocus`~~ — done (common + prompts, prep-ui); `FocusHold` is gone.
6. The **84 app screenshots are 53 MB**; consider committing a subset.

## 7. What QA should look at next

* Real devices: phone portrait / landscape touch (pinch, theatre chips, long-press tooltips, the hand drawer and card sheet,
  the orders sheet swipe), iPad portrait (compact) and landscape (tablet), browser zoom 200 %.
* A full game to turn 10 on desktop with a human: era turns 4 and 8, reshuffles, held-scoring and final-scoring endings,
  Chernobyl (region prompt via the theatre chips on compact), Grain Sales / UN Intervention, Our Man in Tehran, Missile Envy.
* The full-strength AI on a slow laptop / phone (decision times; the "still thinking" note after 8 s).
* Screen readers (map labels, target list, slip live region, dialogs) and keyboard-only play (Tab order console → map → slip →
  hand → rail, the skip link).
* Reduced motion (system and setting), `patterns` and `mapLabels` 130 % across all arrangements.

## 7a. prep-ui pass (2026-11-22)

Hand overlap capped at 55 % (tray), whole-word captions + `CardTags compact` (cards), `HoldButton` forwardRef / autoFocus
(common, prompts), the scoring sheet's fixed Continue footer and `scoring` anchor (stage) with the console's VP chip starting
there, `china:<ai>` on the rail strip / compact dock / dossier hand row (rail, compact), the slip's fit-to-lines notes, tooltips
and one-line crumb (prompts; audited in every slip mode × en / zh / en-XA × 1440 / 1366 / 1024 / 390), and the code split
above. Smoke tests on the dev server with `?ai=policy` (`play.mjs --until 2`): 1440 × 900 USSR (29 answers) and 390 × 844 US
(31 answers, touch), 0 fallbacks, 0 console errors. Production preview: no `__tsp`, no `?ai` switch, leaderboard #1 search
saved, no errors.

## 8. Requests (files I do not own)

1. **coordinator, `docs/design/ui-spec.md` §15.3 W1**: record the shell's extra props/exports (section 2) and deviations 1–9;
   §11.2 note "Sound: omitted until sounds exist"; §11.1 "Retry reloads the page (`boot()` is memoised)".
2. **coordinator, `docs/design/ui-spec.md` §4.7**: note that a programmatic `frame()` (follow camera, chips, region keys) keeps its
   view across container resizes like a manual pan (the `useCamera` fix above), and §10.2 that the compact sheet bottoms out at
   `--stage-bottom` (14 px on compact).
3. ~~**logic (optional)**: `GameController.boot()` could reset its memoised promise after a failure~~ — done (logic); the Retry
   uses it (K-001).
4. ~~**runner** (`src/dev/DemoHarness.tsx`): the StrictMode `controller.dispose()` issue~~ — fixed.
5. **coordinator** (`vite.config.ts`, optional): the entry chunk is 529 kB (Vite warns above 500 kB). A vendor split keeps it
   under the limit and lets the browser cache React / i18next across deploys:
   `build: { target: 'es2022', outDir: 'dist', rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom', 'i18next'] } } } }`
   Checked with a scratch build (config override, no edit): entry 342.21 kB (107.22 gzip) + vendor 186.15 kB (59.65 gzip),
   no warning. Both still load at boot, so first paint is unchanged; alternatively `chunkSizeWarningLimit: 600`.
6. **i18n** (`src/i18n/index.ts`, optional): the English catalogs (79 kB) all sit in the entry; the game-only namespaces
   (`ui_tray`, `ui_prompts`, `ui_stage`, `ui_console`, `prompt`, `log`) could load with the game chunk.

## 9. QA fix round 1 (fix group F4, 2026-11-22)

Items from `docs/qa/TRIAGE.md` "F4" (the console / rail part is in `ui-console.md`, "QA fix round 1"). Verified in Chromium
(dev server with HMR off, `?ai=policy`; production preview where noted); before / after shots in `docs/qa/shots/fix-F4/`.

| Item | Fix | Verified |
|---|---|---|
| Q-041 | compact VP readout never cut (console squeeze steps); dock "Hand · n" never cut: below ~380 px the thumbnail stack closes up (`flex: 0 1 46px`, min 26) and then the chevron gives way | 360 / 390 / 412 / 844×390 / 720×450 × en / zh / en-XA: no cut text; live 844×390 zh USSR +13 |
| Q-042 | tokens `--ts-safe-left/right/bottom`; the game grid pads left / right; compact landscape keeps the map full-bleed on the left (sea under the notch) and insets the theatre bar, ticker and skip link; the start screen's foreground pads all three | CDP `setSafeAreaInsetsOverride {47, 47, 21}`: no control inside the insets (game and start screen) |
| Q-043 | `focusRescue.ts`: while the game screen is mounted, focus lost by removal (`<body>` has it and the last focused element left the page) goes to the orders slip (tabindex −1), else the table; never taken from anything. The game screen focuses its table (`<main tabindex=-1>`) when it replaces the start screen. Resign now runs after the confirmation has closed and handed focus back, so the telex keeps focus | keyboard-only play 2 turns at 1440 USSR (60 answers) and 1024 US (65): 0 focus losses (13/13 play-mode answers each before); Continue, Esc back to hand, Esc Review board → the slip; picking a side → the table |
| Q-044 | Skip to map focuses `[data-cid][tabindex='0']` (the roving box: first legal target), else the table | setup, action-card, influence at 1440 and 1024 |
| Q-045 | `AiAnnouncer` mounted once by GameScreen | 1 region at 1440 (rail open and collapsed), 1024, 390 |
| Q-046 | menu: first item focused once the popover is shown (retried per frame while hidden), ↑ ↓ Home End, Esc / Tab close and focus returns to the ☰ / wordmark (unless a dialog took it); items `tabindex −1` (one stop); one `role=menu` (the popover); compact: the language switch sits outside the menu list | 1440 and 1024: Enter → "New game", keys, Esc / Tab → button; Settings from the menu → its dossier → Esc → ☰ |
| Q-047 | see deviation 6 | 390×844 zh: all 8 chips (S. America after a swipe), the chip survives the sheet growing / shrinking, a pan hands it back; 844×390 en unchanged |
| Q-048 | touch (`pointer: coarse`): chips get a 44 px tall hit area (`::after`; the bar's box grows 8 px over the map's top, transparent, `pointer-events` only on chips); the orders-sheet grab is a full-width strip with a 44 px zone (over the slip's heading only); compact menu language 44 × 44; settings segments and footer buttons ≥ 44; compact-landscape menu rows 44 px so the language row fits | hit areas measured with `elementFromPoint` at 390×844 zh and 844×390 en |
| Q-051 | the start screen's backdrop wrapper is `inert` | first Tab → "English"; no tooltip |
| K-001 | `retryBoot` (above); docs refreshed (this file §1, §3, §5, §6, §8) | engine and AI model blocked then unblocked: Retry offline fails again in place, online loads in place (no reload) |
| Q-052 | `.failed` start screen: folders dimmed (opacity .5), `not-allowed`; `progress` cursor only while loading | probe at 1440 en / 390 zh |
| Q-053 | `_one` / `_other` for `theatre.count`, `dock.handAria`, `dock.adversaryAria`, `dock.logAria` (zh `_other`) | tests |
| Q-054 | `+ = − _ 0` bound in GameScreen (`useKey`, not in inputs; a focused map box handles them first) | + zooms with focus on body, a hand card, a console button |
| Q-055 | the toast comes from the player's action only (`retryChunk`); the quiet `useChunk` retry no longer toasts | production preview, GameScreen chunk blocked: 1 toast (2 before) |
| Q-056 | every language switch goes through `useSwitchLanguage` (toast `ui_shell:error.language`) | production preview offline: start screen and console 中文 → toast, no page error; online again → Chinese |
| Q-057 | inline SVG favicon (the coin seal), `og:*` and `twitter:card` summary (no image) | built `index.html`; no `/favicon.ico` request |

Also fixed (found while verifying Q-056): on the desktop start screen the centre column's `margin-top: −36px` put the
transparent `<main>` over the header, so the mouse could not reach the language switch or ⚙ (keyboard could) at any
desktop size; the header now stacks above it (`position: relative; z-index: 1`, local).

New deviations: the menu's Tab closes it and returns focus to the ☰ (the APG moves on to the next element; the menu is
portalled to the end of the page, so "next" would be the browser chrome). The theatre bar's box is 44 px tall on touch
screens (36 px painted). New `ui_shell` keys: `error.language`, plural forms above.

Play-through driver after the round (`?ai=policy`, no fallbacks / mismatches / errors): 1440×900 USSR seed 13 with undo,
language switch, reload and resign (38 answers); 390×844 touch zh US seed 12 (31); 844×390 touch USSR seed 13 with resign (38).

Requests from this round:
1. **common** (`src/ui/common/Dossier.tsx`, `useFocusReturn`): give focus back to the opener only when focus is still inside
   the closing dossier or was lost (`!document.activeElement || document.activeElement === document.body`), not
   unconditionally. Today a dossier that closes in the same commit as another dialog opens (resign confirm → game-over telex)
   takes focus back from the new dialog; the shell now resigns one effect later to avoid it, but other pairs can hit it.
2. **common** (optional): `MessageText` `refTabIndex` (see `ui-console.md` request 4).
3. **coordinator** (`docs/design/ui-spec.md` §11.3 / §12 / §3.3): the menu's Tab closes it (focus back to ☰); lost focus goes
   to the orders slip; theatre chips' 44 px touch area (the bar's box 8 px taller on touch); deviation 6's refinement.

## 10. QA round 1 integration (integrator, 2026-11-23)

Cross-group requests applied after the four fix groups (details in `docs/qa/REPORT.md`):

* **Contract** (`src/game/contract.ts`, additive optional): `ViewModel.superseded?`, `ViewModel.incompatibleSave?`
  (`ControllerViewModel` is now an alias of `ViewModel`), `CoupOdds.ops?`, `CoupOdds.modifier?`.
* **Shell:** `SupersededDossier` (`screens/SupersededDossier.tsx`): while `vm.superseded`, a blocking dossier "This game continued
  in another tab" with **Reload** replaces every other shell dialog (`ui_shell:superseded.*`, en + zh; Q-002). `StartScreen` toasts
  `ui:error.saveIncompatible` once per `vm.incompatibleSave.savedAt` (Q-014). `BootLine.errorKey` matches the AI's stable
  no-SIMD marker (`isWasmUnsupportedMessage`) or a missing `WebAssembly` at the engine stage, never the raw "simd" in an
  onnxruntime file name (Q-005). About links `THIRD_PARTY_LICENSES.txt` (Q-012).
* **Console:** `arModel(state, over?, ending?)` and the turn readout / `TurnTrack` use `displayTurnAr(state, vm.ending)` (Q-031).
* **Common:** `useFocusReturn(active?, within?)` gives focus back only when it was lost with the dialog (the resign → telex pair;
  the one-effect-later resign in `App.tsx` stays as a belt). `Sheet` / full-screen `Dossier` pad by the left / right safe areas
  (Q-042); coarse-pointer 44 px hit areas for the sheet grab, the dossier close and footers (Q-048).
* **Q-048 leftovers elsewhere:** the phone slip's actions / Undo / speed segment, the papers' and scoring sheet's Continue and
  the telex buttons are ≥ 44 px on `(pointer: coarse)`.
* **Map:** the default tooltip's key hint on touch is `ui:tip.keys.inspectTouch` ("Tap elsewhere to close"); in compact
  landscape `MapTooltipHost` places the popover inside the map column (`bounds`; Q-032).
* **Engine side:** `computeCoupOdds` sets `ops` / `modifier` (the engine's combined `mod1` split by the public roll modifiers,
  `coupRollModifier`; Q-038); How I Learned's detail says "you would win" when the AI is the phasing player
  (`prompt:card.46.detailWin`; Q-025).
* Not applied (optional, already working another way): `MessageText refTabIndex` (Dispatches' observer works); Esc "Back to
  hand" focusing the returned card (the rescue focuses the slip); `onInspect` (long-press pins).

## 11. Save format v2 (QA round 2, r2-save, 2026-11-23)

* **What the shell sees:** nothing new in the view model. The save in `localStorage["ts-playfield.game.v1"]` is now an
  opaque `"TSP2:…"` string (base64url of the XOR-obfuscated JSON with a CRC-32 inside; format and API in
  `docs/handoff/logic.md` "Save format v2"). A plain-JSON v1 save from before resumes normally and is rewritten as v2
  at boot. A tampered, corrupted or truncated save takes the existing incompatible-save path: at boot
  `vm.incompatibleSave = { savedAt: 0 }` → `StartScreen` shows its one `ui:error.saveIncompatible` toast, the save is
  removed, no Resume; edited after boot, `controller.resume()` returns false → `App`'s resume toast (the same text).
* **About:** one honest line after the intro, `ui_shell:about.save` (en: "Your game is saved in this browser only. The
  save is not tamper-proof: with developer tools anyone can read it, including the AI's hidden cards."; zh:
  "对局只保存在此浏览器中。存档并不防篡改：借助开发者工具，任何人都能读取其中内容，包括 AI 尚未公开的卡牌。").
* **Dev scripts** that clear the save (`play.mjs`, `shoot.mjs`, QA tools) keep working: the key did not change. To read
  a save in a script, decode it with `decodeSave` from `src/game/persistence.ts` (Node 22.6+ strips its types:
  `await import(".../src/game/persistence.ts")`).
* **play.mjs:** `game-over.png` (and `resign-telex.png`) are taken once the telex is up and settled (`telexSettled`:
  Continue pressed where the UI waits, the final scoring sheet filled, then no finite animation running in the telex or
  its scrim and its text and position unchanged for two samples), no longer on a fixed delay that caught the final
  scoring sheet mid-fill. No telex within 90 s (20 s after resigning) counts as an error.
* **Map:** country names on the region bands are a shade darker than `--ts-band-text` (`MapView.module.css .name`:
  `color-mix(in srgb, var(--ts-band-text) 50%, var(--ts-room-950))`, rgb 20,19,17 instead of 34,30,24): the map lamp
  darkens bands near the viewport's edges, and "Australia" measured 4.45:1 on its Asia band (now 4.98; phone-edge W.
  Europe names 4.16 → 4.66). Test: `tests/map/name-contrast.test.ts`.

## 12. QA fix round 2 (fix group F4, 2026-11-23)

Items from `docs/qa/r2-TRIAGE.md` "F4" (the console / rail part is in `ui-console.md`, "QA fix round 2"). Verified in
Chromium (dev server, HMR off, `?ai=policy`; production preview where noted); shots in `docs/qa/shots/r2-fix-F4/`; probes in
the session scratch dir `r2-fix-F4/` (`flyout.mjs`, `sizes.mjs`, `r018.mjs`, `r019.mjs`, `menu.mjs`, `prod.mjs`).

| Item | Fix | Verified |
|---|---|---|
| R-017 | Tablet flyouts end above the tray: `.flyoutHost { bottom: var(--ts-tray-h) }` (every panel; the log panel fills the host 8 px inside it). While a flyout is open, a `pointerdown` (capture, primary button) on the game screen outside the flyout host, the strip column and the toasts closes it (`closesFlyout(target, screen, keep)` in `GameScreen.tsx`); the press is not swallowed, so it also acts on what it hit. Layers above the screen (dialogs, the ☰ menu, the card zoom) are outside the game screen's `<div>` and keep it open; the toasts sit in a box-less wrapper (`.toastHost { display: contents }`) so a press on one keeps it open too. The × and the strip buttons get 44 px touch areas (`ui-console.md`) | 1024×768 touch en US seed 13: log flyout 320×560 ending at y 622 over a tray from 630 (before 698 tall, to 760: Cambridge Five, the China Card and both piles 100 % covered, Decolonization 84 %), nothing in the tray covered; 8 / 8 outside taps (sea, slip, hand card, console × log / status) close it (0 / 8 before); the same strip button closes, another switches, a tap inside keeps. 1280×600, 720×520, 1194×834: every panel ends 8 px above the tray (Status scrolls inside at ≤ 600 px tall). Production preview 1024×768 zh: same geometry, a sea tap closes |
| R-018 | `StartScreen` toasts by the discarded save's reason: `discardedSaveKey(save)` → `ui_shell:error.saveUnreadable` when `reason === "unreadable"`, or no `reason` and `savedAt === 0` (the controller's convention today), else `ui:error.saveIncompatible`. App's refused `resume()` toasts `ui_shell:error.saveUnreadable`. `vm.incompatibleSave` is read through a local `DiscardedSave` type (`reason?` optional), so it compiles before and after the contract change | en / zh: `TSP2:AAAAbogus…` at boot → "could not be read (it was changed or damaged) and was discarded" / "无法读取已保存的对局（已被修改或损坏），已将其删除。"; a real save re-sealed with another fingerprint → the other-build text; a save edited after boot, then Resume → the unreadable text. Production preview zh: the same |
| R-019 | zh `dock.log` / `dock.label` / `dock.logAria_other` / `ticker.open`: 记录 → 电报 ("电报：{{count}} 条新电报", "打开电报"); en `about.oflLink` "Font license (OFL)" | 360 / 390 zh dock: "电报" 80 / 87 px, nothing cut; About en lists "Font license (OFL)" |
| R-011 (F4 check) | The ☰ menu's key cap ("?" on Keyboard shortcuts) is not rendered when `useTouchUi()` | 1024×768 and 1366×1024 touch: 6 items, 0 `<kbd>` |

New `ui_shell` key: `error.saveUnreadable` (en + zh). Tests: `tests/ui/shell/r2-fixes.test.ts` (the outside-press rule on a
fake DOM tree, the stylesheet bounds and 44 px areas, the toast choice and both catalogs, the wording, the menu on touch).
`tests/ui/console/console.test.ts` follows F3's R-014 (`displayTurnAr`: a game that ended inside a round reads that round).

No new deviation from the spec; §3.2's as-built note (flyout bounds, outside press) is for the coordinator (below).

Requests from this round:
1. **coordinator** (`src/game/contract.ts`, R-018, already in the triage): `incompatibleSave?: { savedAt: number; reason?:
   "build" | "unreadable" }` with its doc comment; then F1's `readResumable` sets `reason`. The shell needs no change after it.
2. **coordinator** (`docs/design/ui-spec.md` §3.2, as built): "Each flyout ends above the tray row (the hand, China slot and
   piles stay visible). A press anywhere on the game screen outside the flyout and the strip closes it (touch screens have no
   Esc); the press also acts on what it hit. On coarse pointers the strip buttons and the flyout's × answer 44 × 44 px."
3. **F1 / i18n owner** (optional, `src/i18n/locales/zh-CN/ui.json`): two more zh strings still call the log 记录:
   `over.fullLog` "完整记录" (→ "完整电报") and `shortcuts.row.log` "显示或隐藏侧栏 · 打开记录" (→ "… · 打开电报").

Found, not fixed (not in this round's items): at tablet widths below about 960 px (a 800×600 desktop window, 1280×800 at
150 % zoom, 720×520) the tablet console is wider than the screen (zh 720×520: 967 px of content in 720), so the language
switch, ⚙ and ☰ are off-screen (the wordmark still opens the menu). The tablet variant has no squeeze steps like the
compact one; a next round could hide the AR instrument's pips or narrow the VP gauge there.

## 13. QA round 2 integration (integrator, 2026-11-23)

Cross-group requests applied after the four fix groups (details in the round-2 report, `docs/qa/r2-TRIAGE.md` "For the
integrator"):

* **Contract** (`src/game/contract.ts`, additive optional): `CoupOdds.milOps?` (R-002) and
  `ViewModel.incompatibleSave.reason?: "build" | "unreadable"` (R-018). The controller sets `reason` (`readResumable`);
  `StartScreen.discardedSaveKey` already reads it (a save with no `reason` and `savedAt` 0 still counts as unreadable).
* **Shell:** `GameScreen` passes `promptKey={vm.prompt?.promptId ?? null}` to `MapView` (R-008: a prompt change closes the
  map's transient popovers, also between prompts that offer nothing on the map).
* **Prompts:** `CountryTooltip` prints "Mil ops +N" from `CoupOdds.milOps` (`coupMilOps`), for coup-target and event coups
  (R-002); `OrdersSlip` `useAiPlay` takes a roll's target through the stage's `rollCountry` (R-007).
* **Map:** the zoom buttons answer 44 px hit areas on coarse pointers (R-010: tablet 36 px buttons 8 px apart, compact 40 px).
* **Stage:** the game-over telex reads its round through `displayTurnAr` (R-014, the rule in one place).
* **i18n:** zh `ui:over.fullLog` 完整电报 and `ui:shortcuts.row.log` "… · 打开电报" (R-019 follow-up; `tools/ui-keys.mjs`).
* **Browser storage** (L-3; nothing personal): localStorage `ts-playfield.game.v1` (the save, format v2),
  `ts-playfield.ui.v1` (settings), `tsp.lang` (the language chosen last), the load-time probe `ts-playfield.probe`
  (written and removed); sessionStorage `ts-playfield.aiSlowHint` = "1" once the slow-device hint was shown this session.
* **`play.mjs`** (R-011 follow-up): done and primary buttons are found by their key cap **or** their `aria-keyshortcuts`
  (`keyButton`; `Button` now derives `aria-keyshortcuts` from a single-key cap, ui-common.md). Since R-011 a touch run
  had no caps to find, and the phone game (390×844 zh, seed 1) needed 3 fallbacks at done prompts (Our Man in Tehran,
  the Eagle Has Landed discard, Ask Not); after the change 0.
* Tests: `tests/ui/prompts/r2-integrate.test.ts`; the Q-014 / unreadable expectations in `tests/game/persistence.test.ts`
  and `tests/game/qa-fixes.test.ts` now include `reason`.
