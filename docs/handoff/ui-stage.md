# Handoff: stage (`ui-stage`, W8)

Owner: **stage**. Files: `src/ui/stage/**` (dev-only `demo/`), `tests/ui/stage/**`, `src/i18n/locales/{en,zh-CN}/ui_stage.json`.
Spec: `docs/design/ui-spec.md` §9.4 (reveal / roll / headline / scoring / banner / game-over rows), §9.5, §10, §12, §15.3 "W8 stage".

## What I built

| File | Exports | What |
|---|---|---|
| `Stage.tsx` (+ css) | `Stage({ onFocusRegion?, className? })` | The layer inside the table (z 40, `pointer-events: none`). Hosts TurnBanner, DiceTray, ScoringSheet, RevealDock, HeadlinePapers. Registers the `stage` anchor (a card-sized box at the table centre). Records the game for the telex on every commit, releases the pinned dock when the runner unpins it or a prompt opens, reports the spotlit region through `onFocusRegion`. |
| `RevealDock.tsx` (+ css) | `RevealDock`, `DockPanel({ dock })`, `DOCK_CARD_W`, `DOCK_PINNED_W` | §9.5: the AI card flies from `hand:<ai>` (the adversary dossier) and flips at mid-flight; kicker / name / how line (fills in the target from later roll and country beats) / printed Ops / opponent-card note; hold; then pinned in the compact form (120 px card); moves to the top left when a changed box lies under it (FLIP 350 ms); collapses into the anchor of the card's location (`discard` / `removed` / `effects`, else fades). Headline cards of both sides go through the dock after the papers. Compact: centred 200 px reveal for the hold, then shrinks away (the shell's ticker shows the play). Registers the `dock` anchor (the card). |
| `DiceTray.tsx` (+ css) | `DiceTray`, `DiceTrayView({ model, phase, tumbleMs?, mathMs? })` | §9.4 roll: felt tray beside the target box (never over it, avoiding the dock), at `country:<id>` / `space:<side>` / `stage`; reticle lock, tumble (faces flicker every 80 ms), land on the engine's die, maths line, result ("US −1 · USSR +3"; tinted ok/steel). Opposed rolls: US die left, USSR right, modifiers under each. Uses common's `Die`. Stays until the frame commits, then fades. |
| `HeadlinePapers.tsx` (+ css) | `HeadlinePapers`, `HeadlinePapersView({ papers, waiting, onContinue })`, `ContinueKeys` | §10.1: scrim, two newspapers (US left −2°, USSR right +1.6°), masthead, dateline, headline, card photo, card text column, 1st/2nd badge, order caption; waits for Continue (dialog, focus on Continue, Space / Enter / Esc / click) with `pauseOnReveals`, else holds 1600; folds (first towards the dock); a headline cancelled in the frame (Defectors) gets CANCELLED and slides to the discard pile. Compact: stacked, US on top. |
| `ScoringSheet.tsx` (+ css) | `ScoringSheet`, `ScoringSheetView({ sheet, waiting, onContinue })`, `ScoringTable({ score, fill?, rowMs?, className? })` | §10.2: 520 px paper sheet docked away from the region, header in the region ink, kicker (you / the AI played it), table US / USSR (status chips, countries, battlegrounds +1 each, adjacent +1 each, status VP, total; SE Asia country by country), rows filling 120 ms apart with `RollingNumber`, result bar (scorer + "Net USSR +3", or Even; Europe control: game over with the hazard underline; **registers the `scoring` anchor**), Continue while waiting. The body scrolls (to the net bar when it arrives, and again when Continue appears) under a **fixed Continue footer**, so Continue is always on screen. Final scoring: one combined sheet, a region per row. Compact: a tighter bottom sheet (390 × 844 fits whole; 844 × 390 scrolls with the net bar and Continue in view). **`ScoringTable` is the plate popover body for the map.** |
| `TurnBanner.tsx` (+ css) | `TurnBanner`, `TurnBannerView({ banner })`, `useTypewriter`, `TYPE_MS_PER_CHAR` | §10.3: paper strip 60 % wide at 28 %, typewriter line (18 ms/char), ruled underline; turns 4 and 8 add the era stamp and a pulse ring on the `deck` anchor; the headline-phase plate. |
| `DangerFrame.tsx` (+ css) | `DangerFrame` | §10.5: fixed inset frame (z 100, `pointer-events: none`), 2.4 s ambient pulse, static under reduced motion. On when `Shown.state.defcon === 2`; a DEFCON beat to / from 2 switches it with the lamp, before the commit. |
| `GameOverTelex.tsx` (+ css) | `GameOverTelex(props)`, `TelexOverlay`, `TelexSheet`, types `GameOverTelexProps`, `TelexStats`, `TelexOverlayProps` | §10.4: 600 ms beat (white-out + 2 s fade for `defcon` / `cmc-suicide`, Europe lit for `europe-control`, the final scoring sheet first for `final-scoring`), scrim, telex rising with perforated edges, FLASH typewriter, verdict in the winner's colour (draw in ink), rubber stamp from your side (none on `resign`, not animated on `wargames`), reason (`endingMessages`), held cards, stats, VP chart, New game / Review board / Full log. Modal dialog: focus on New game, Tab trapped, Esc = Review board. Portal to `document.body`. |
| `VpChart.tsx` (+ css) | `VpChart({ points, drawMs?, className? })`, `chartX`, `chartY` | Ink line over turns 0–10, US wash above 0, USSR wash below, axis words, ticks, the last value; draws in `drawMs`; `role="img"` with every point in the label. |
| `stageStore.ts` | `StageStore`, `EMPTY_STAGE`, `REDUCED_FADE`, `defaultEnv`, state types | The handlers and the state, without React (Node-tested). One store per UiRoot. |
| `useStage.ts` | `useStageStore()`, `useStageState(sel)`, `useStageBeats(names)`, `useStageWaiting()`, `stageStoreFor(director)` | React access; the store is keyed by `UiRoot.director`, so the stage, the telex, the danger frame and the slip share it wherever the shell mounts them. |
| `model.ts` | pure helpers | `scoringSlot`, `regionInk`, `slotKey`, `slotCountries`, `sheetSide`, `pickSheetSide`, `eraOf`, `eraStampOf`, `opponentNote`, `isOpsPlay`, `collapseAnchor`, `diceAnchor`, `diceModel`, `influenceDeltas`, `cancelledHeadline`, `scoringRows`, `playedBy`, `vpLead`, `placeBeside`, `overlaps`, `boxOf`. |
| `record.ts` | `GameRecorder`, `tallyFromLog`, `mergeTally`, `vpPoints`, `vpOfScore`, `emptyTally` | The telex's record (see "VP history" below). |
| `index.ts` | everything above | |
| `demo/` | dev only | `index.html`, `main.tsx`, `demo.module.css`, `shoot.mjs` |

## Public API (for the shell and other workstreams)

```tsx
import { Stage, GameOverTelex, DangerFrame, ScoringTable, useStageWaiting } from "./ui/stage";

// GameScreen, inside the table container (after MapView), exactly once:
const [stageFocus, setStageFocus] = useState<RegionSlot | null>(null);
<MapView … focusRegion={stageFocus ?? promptFocus} renderPlateTooltip={slot => { const sc = scoreOf(regionScores, slot); return sc ? <ScoringTable score={sc} /> : null; }} />
<Stage onFocusRegion={setStageFocus} />

// Over the whole app (they portal / fix themselves):
{vm.ending && vm.humanSide ? (
  <GameOverTelex key={gameKey} ending={vm.ending} humanSide={vm.humanSide}
    onNewGame={…} onReview={() => showGameOverChip()} onLog={() => openLog()} />
) : null}
<DangerFrame />

// Orders slip (prompts): Continue while the papers or a scoring sheet wait (pauseOnReveals).
const { waiting, proceed } = useStageWaiting();   // waiting: "headline" | "scoring" | null
{waiting ? <Button variant="primary" onPaper kbd={t("ui:shortcuts.key.space")} onClick={proceed}>{t("ui:slip.continue")}</Button> : …}
```

* `Stage` props: `onFocusRegion?(slot | null)` (scoring sheet, Europe control), `className?`. Its CSS variable
  `--stage-bottom` (default `var(--ts-tray-h)` on desktop/tablet, 0 on compact) is where waiting overlays stop, so the
  slip stays visible; override it through `className` if the tablet tray height differs.
* `GameOverTelex` props: spec `{ ending, humanSide, onNewGame(), onReview(), onLog() }` + `stats?: Partial<TelexStats>`
  (overrides for demos/tests). It renders nothing until the `game-over` beat (or at once if mounted after the
  game-over frame was committed). Review board and Full log close it (the shell then shows the slip chip / the log);
  remount (new `key`) to reopen. Mount it per game (`key` = the game) so a closed telex does not carry over.
* `ScoringTable({ score, fill?: "all" | "none" | "timed", rowMs?, className? })`: `score` is a `RegionScore` (`scoreOf`).
* `useStageWaiting(): { waiting, proceed() }`. Space / Enter / Esc on the waiting overlay already call `proceed` (a modal
  `KeyScope`), so the shell's Space→Skip binding does not fire then; the slip's Skip (`shown.skip()`) also ends the wait.
* Anchors registered: `stage` (table centre), `dock` (the reveal-dock card). Read: `hand:<side>` (dock flight source),
  `country:<id>` (dice, avoidance, sheet side), `space:<side>` (space dice), `discard` / `removed` / `effects` (collapse),
  `deck` (era pulse).

### Store / handlers

`StageStore.handlers` (named; each component attaches its own with `useStageBeats([...])`): RevealDock `reveal`,
`country`, `dockTrack` (action-round); DiceTray `roll`; HeadlinePapers `headline`; ScoringSheet `scoring`;
TurnBanner `banner`; GameOverTelex `gameOver`; DangerFrame `dangerTrack` (DEFCON). Each handler computes its durations
from `TIMING` × `ctx.speed` (`dur()`; holds use `speed.hold`), resolves when done, and on `signal.abort` jumps to its end
state at once. `store.commit(frame, vm)` (Stage's `useOnCommit`) fades dice / sheet, drops the danger override and the
spotlight, records the game, and shows the telex for a committed game-over frame that had no beat.

### VP history (the chart) and the other stats

* `GameRecorder` records from committed frames: the end-of-turn frame (it carries `turn-start` T) gives the VP at the end
  of turn T−1; `roll` COUP events count coups by roller; `game-over` gives the final point.
* `tallyFromLog(vm.log)` reads the same from the log, which the controller rebuilds **in full on a resume**: `log:change.vp`
  details (`to` = `log:vpScore.us|ussr|tie {n}`), `log:session.endOfTurn {turn}`, `log:roll.coup*` details (roller).
* The telex uses `mergeTally(log, frames)` (frames win per turn; coups take the larger count) → `vpPoints()`:
  `{turn 0, vp 0}`, the end of each completed turn (missing turns carry the previous VP), then the final point. So a
  resumed game still gets its whole curve (tested: half a game recorded from frames + the full log = the full curve).
* Playing time: wall clock from the first board this page saw, shown only when that was the game's start (turn 1,
  AR 0); saves carry no start time, so a resumed game shows no playing time. AI thinking: `vm.aiStats` (G8).

## How to test / demo

* `npx tsc --noEmit -p .` — clean.
* `npx vitest run tests/ui/stage tests/i18n tests/theme` — 13 files, 338 tests (stage: 5 files, 133 tests):
  * `model.test.ts` — regions, eras, notes, collapse anchors, dice anchors and texts (on every roll in the fixtures, en +
    zh), Defectors, scoring rows (incl. SE Asia), sheet side, tray placement.
  * `record.test.ts` — log tally vs frames on `game-full`, resume backfill, points, merge.
  * `store.test.ts` — every handler's phases and timings (normal, fast, instant, reduced, compact, Skip), Continue,
    avoidance, collapse targets, `syncDock`, commits, game change, danger override; and the store driven by the real
    `FrameRunner` over recorded sequences (AI coup, headline incl. waiting for Continue, a scoring card on the board
    before it, the turn end, five endings).
  * `components.test.ts` — markup of every view in en / zh-CN / en-XA (`renderToStaticMarkup`).
  * `styles.test.ts` — §18.2 rules on every stage stylesheet, reduced-motion handling, ui_stage glossary / spacing /
    minus-sign checks.
* Demo: `TSP_VITE_CACHE=node_modules/.vite-5187 npx vite --port 5187 --strictPort` →
  `http://localhost:5187/TS_playfield/src/ui/stage/demo/index.html?scene=prompt-midgame&lang=en`. Sequences replay
  through the real runner (`scene=seq-headline|seq-ai-coup|seq-ai-event|seq-turn-end|seq-over-*`, toolbar ⟲); the
  "moments" buttons play single beats on the fixture board (AI plays with avoidance and collapse, headline + Defectors,
  scoring of five regions, banners 4 / 8 / 6 / headline phase, every die kind, DEFCON 2, eight endings incl. held-scoring
  and a draw). URL: `moment=<id>` (auto-play), `hold=<n>` (longer holds for screenshots), `chrome=0`, plus the harness's
  `lang`, `view=compact`, `motion=reduce`, `speed`, `pause=off`.
* Screenshots: `source scripts/pw-env.sh && node src/ui/stage/demo/shoot.mjs [name…]` (server running) →
  `docs/design/shots/ui-stage-*.png` (44 files: 1440×900, 1366×768, 1024×768, 390×844; en, zh, en-XA; reduced motion;
  mid-flight / mid-tumble / white-out frames; real sequences).
* Checked in Chromium: Space / Enter / Esc continue the papers and the sheet, focus goes to Continue and back; the slip's
  Continue (`useStageWaiting`) ends the wait in a real replay; the telex focuses New game, traps Tab, closes on Esc;
  `seq-over-vp20&start=end` shows the telex at once (mounted after the end); no console errors.

## Deviations from the spec (with reasons)

1. **Handlers live in a framework-free `StageStore`** (one per UiRoot, keyed by the director) instead of inside each
   component; each component attaches the handlers of its beat. Reason: Node tests of every timing / Skip / Continue
   path, and shared state between the stage and the telex / danger frame / slip that the shell mounts apart.
2. **Headline cards of both sides go through the dock** (the papers fold into it, §10.1); the AI's scoring card is shown
   in the dock, then the sheet (§9.4 says "the card to the centre").
3. **How line Ops = the card's printed Ops**: the UI has no effective Ops for AI plays (`effectiveOps` answers only at the
   human's prompts).
4. **Opponent-card note** says "its event also happens, for the USSR" without "after the coup": the UI cannot know
   whether the AI resolves the event first.
5. **Scoring sheet side**: the spec's side, unless the other side covers clearly less of the region's boxes on the
   current map (`pickSheetSide`, < 60 %). On today's map Africa and Europe dock right; the rest as specified.
6. **Waiting overlays stop above the tray** on desktop/tablet (`--stage-bottom`), so the slip's Continue stays visible.
7. **Dice tray stays until the frame commits** (then fades), so the result line stays next to the box while its country
   beat plays.
8. **Final scoring sheet** lists the six regions (no SE Asia row), each with its VP per side, then **the China Card's
   +1 VP for its holder** (its own row, `Scoring::execute_final_scoring`), then the total; its board is the game-over
   frame's (`ctx.frame.regionScores`: final scoring ignores Shuttle Diplomacy, and the engine has cleared it there).
9. **Playing time** shows only when this page saw the game from the start (see above).
10. **Full log** closes the telex too (otherwise the log would be under its scrim).
11. **Continue key cap** reads `ui:shortcuts.key.space` ("Space" / 空格): the ⎵ glyph is missing in our fonts.
12. **The deck pulse** on era turns is a ring the stage draws over `anchors.rect("deck")` (the tray owns the pile).
13. **No sound** (§13 optional, off by default).
14. **Reduced motion** is applied through a `data-reduced` attribute each component sets from `useReducedMotion()`
    (setting × system), not `[data-motion="reduce"]` alone, so the system preference counts when the setting is
    "system" (the shell leaves `data-motion` absent then).
15. The stage container has no landmark role (it is mostly empty; each overlay is labelled itself).

16. **The result bar's net is the rows' net** (`ScoringState.vp`), never the engine's VP change: when the VP track stops
    the change at ±20 (`cappedVp`; not a Europe-control win), a line under the bar says what was applied ("The VP track
    stops at 20: USSR +5 applied", `ScoringState.capped`). The sheet takes the board before the frame, or the frame's
    when only that one's net agrees with the engine. (QA Q-016, Q-019.)
17. **Shuttle Diplomacy note**: when the engine's score says it took a USSR battleground out
    (`RegionScore.ussr.shuttle_diplomacy`), `ScoringTable` adds a `tfoot` line ("Shuttle Diplomacy: one USSR battleground
    is not counted"), so the counts reconcile with the board, on the sheet and in the map's plate popover. (Q-023.)
18. **Telex "VP before"** is shown only when a rule replaced or added to the VP: held scoring card → "VP before the
    ruling"; final scoring → "VP before final scoring"; any other ending leaves it out (`vpBeforeLabel`). (Q-022.)
19. **Dice tray placement**: the tray is measured once with its final content (maths and result rendered hidden for one
    layout pass before the first paint) and capped at the table's width minus 2 × 8 px; the maths line wraps when the
    table is narrower than the tray; a `ResizeObserver` (tray and table) moves it back inside on later size changes
    (fonts, language, rotation). It never leaves the table (so never covers the slip column). (Q-018.)
20. **VP chart label** joins the points with `ui_stage:chart.sep` (", " / "；") instead of `Intl.ListFormat`, whose
    zh-CN "unit" list has no separator. (Q-024.)
21. **The scoring sheet is never under the AI's pinned reveal dock** (R-006, an as-built addition to §9.5 / §10.2). When
    a sheet opens on desktop / tablet, it measures itself (its side after `pickSheetSide`, its layout box down to the
    table's bottom) and the dock (`measureDock`: the dock's slot where it is and in the other top corner) and calls
    `store.clearSheet`: the dock **stays** if it leaves the sheet free, else **moves to the other top corner** for the rest
    of the play (as for a covered country; FLIP slide), else (a table too narrow for both, e.g. an 800 × 600 tablet)
    **folds into its pile** at once; the sheet's kicker ("The Soviet Union played Africa Scoring") still names the play.
    In practice the dock (always top right at that point) goes top left for Europe / Africa / C. & S. America sheets.
    `Stage` now paints the dock **below** the dice trays and the sheet (DOM order: banner, dock, dice, sheet, papers), so
    nothing is covered while the dock slides away.
22. **Avoidance uses the whole dock** (card + caption, `env.dockRect`, which the `Stage` sets from the dock's slot) instead
    of the `dock` anchor (the card only), for a changed country (`onCountry`) and the dice trays' `avoid` list. A
    **rolled country** (coup, realignment, war) under the dock moves it top left before the tray locks on (the box is the
    roll's subject; the spec's rule names only changed boxes). An AI **space-race tray** hangs under the space track
    just beside the dock (`hangUnder`), never under it. (R-006.)
23. **A roll names a target only for COUP / REALIGNMENT / WAR_EVENT** (`rollCountry`): a SPACE_RACE record carries the
    space box in `country_id`, which used to read as a country ("SPACE RACE → NORWAY"). Used by `diceAnchor`, `diceModel`
    and `onRoll`; exported for the slip's crumb. (R-007.)

## QA round 1 fixes (F2, 2026-11-22)

Q-016 (China Card row + net), Q-018 (dice tray), Q-019 (cap note), Q-022 (telex label), Q-023 (Shuttle Diplomacy note),
Q-024 (chart separators): deviations 8 and 16–20 above. New `ui_stage` keys: `scoring.chinaBonus`, `scoring.capped`,
`scoring.shuttle`, `over.stats.vpBeforeFinal`, `chart.sep`. New model helpers: `finalScoringRows`, `cappedVp`,
`shuttleApplied`, `clampInside`, constants `CHINA_CARD`, `SHUTTLE_DIPLOMACY`, `VP_TRACK_END`; `ScoringState` gains
optional `capped` and `china`; `ScoringRow.label` may be `{ card }` and has an optional `sub` line. Before / after
screenshots: `docs/qa/shots/fix-F2/`.

## QA round 2 fixes (F2, 2026-11-23)

R-006 (deviations 21, 22), R-007 (deviation 23). New exports: `rollCountry`, `dockBesideSheet`, `hangUnder` (model),
`measureDock`, `dockSlotIn` (RevealDock), `StageStore.clearSheet(sheet, { pos, here, there })`, optional
`StageEnv.dockRect()`. The dock's slot carries `data-dock-slot` (and `data-leaving` while it collapses). Tests:
`tests/ui/stage/model.test.ts` ("the scoring sheet and the pinned reveal dock", "a tray hung under the space track",
`rollCountry`), `tests/ui/stage/store.test.ts` (clearSheet move / fold / compact / idempotent under React's dev double
effects; a rolled country under the dock; a space roll names no target). Browser: 1280 × 720 (Europe), 1920 × 1080
(Africa), 1366 × 768, tablet 1024 × 768 touch (Europe, S. and C. America), 800 × 600 tablet (dock folds), space trays at
1440 × 900, 1536 × 864 and 1600 × 900 zh. Shots: `docs/qa/shots/r2-fix-F2/`.

## Requests (files I do not own)

1. **shell** (`src/ui/screens/GameScreen.tsx`, `src/ui/App.tsx`): compose as in "Public API": one `<Stage
   onFocusRegion>` inside the table after `MapView` (MapView `focusRegion = stageFocus ?? promptFocus`), `<GameOverTelex
   key={game} …/>` while `vm.ending` is set, one `<DangerFrame/>` at the app root, `renderPlateTooltip` with
   `ScoringTable`. Review board → the "Game over · New game" chip in the slip; Full log → open the log. On tablet,
   set `--stage-bottom` to the tablet tray height if it differs from `--ts-tray-h`. Mount the Stage exactly once
   (two would run every handler twice).
2. **prompts** (`OrdersSlip`): while `useStageWaiting().waiting` is non-null, show "Continue ⎵"
   (`t("ui:slip.continue")`, key cap `t("ui:shortcuts.key.space")`) calling `proceed()`, in place of Skip (§10.2: "button
   'Continue ⎵' in the slip and on the sheet").
3. **rail** (`AdversaryDossier`): register `root.anchors.ref(\`hand:${aiSide}\`)` on the AI's hand stack, so the AI card
   flies from the dossier into the dock (without it the card drops in from above).
4. **console** (`useTrackBeats`): the DEFCON-2 toast (`ui:toast.defcon2`) stays with the console's defcon beat (the stage
   only drives the frame). For the VP chip's source, the reveal dock's card is the `dock` anchor; the scoring sheet's net bar
   is `scoring` (done, prep-ui: the console's `chipSource` starts a scoring card's VP chip there while it is mounted).
5. ~~**coordinator**: `"scoring"` in `AnchorId`~~ — added by the coordinator; the stage registers it on the net bar (the
   `footer` of `ScoringSheetView`, from the "net" phase until the sheet goes).
6. **coordinator** (`docs/design/ui-spec.md` §15.3 W8): record the extra exports/props above (`Stage.onFocusRegion`,
   `GameOverTelex.stats`, `ScoringTable.fill/rowMs`, `useStageWaiting`, `DockPanel`/`…View` components) and deviations 2–6.
7. **runner / logic** (`tests/fixtures/ui`): the regenerated fixture set no longer contains `seq-event-scoring` (index.json
   lists 44 files without it, although the regeneration was announced with the same names). My tests pick a sequence by
   the `event:scoring` tag instead; restore it if other workstreams reference the name.
8. **prompts** (done by the round-2 integrator, who also made the telex's `inRound` come from `displayTurnAr`, R-014)
   (`src/ui/prompts/OrdersSlip.tsx`, `useAiPlay`, R-007): the crumb's target from a roll uses
   `rollCountry` (already exported from `../stage`): `const c = rollCountry(beat.roll); if (c !== null) setPlay(p => (p &&
   p.target === null ? { ...p, target: c } : p));` (today any `country_id >= 0` is taken, the space box and 255 included:
   "OAS Founded › Space race → Norway").
9. ~~**coordinator** (`docs/design/ui-spec.md` §9.5 / §10.2): record deviations 21–22 as as-built notes.~~ Done (round-2
   integration).
