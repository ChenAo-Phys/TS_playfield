# Handoff: runner + state + dev kit (`ui-runner`)

Owner: **runner**. Files: `src/ui/runner/**`, `src/ui/state/**` (except `context.ts`), `src/dev/**`, `tests/fixtures/**`,
`tests/ui/runner/**`, `tests/ui/state/**`, `src/i18n/locales/{en,zh-CN}/ui_runner.json` (empty: no strings of my own were needed).
Spec: `docs/design/ui-spec.md` §9, §15.1, §15.3 (W4 runner + the W1 state rows).

---

## 0. Dev kit (start here)

Real game data for your demos and tests, recorded with the real controller and engine. Only what the UI receives
(redacted `Frame`s, `LogEntry`s, the `ViewModel`, controller previews) is stored.

### Fixtures: `tests/fixtures/ui/*.json` (44 fixtures + `index.json`, 2.57 MB; regenerated 2026-11-22 with `card-moved.fromHand` and `seq-event-scoring`)

* **scene** = one frame, already acked, with the prompt open (the UI as a still).
* **sequence** = a base frame (what is on screen before) + frames to animate + the ViewModel after the last ack
  (a prompt, the AI's turn, or the ending).
* `tests/fixtures/ui/index.json` lists every fixture with **tags** (`prompt:<kind>`, `event:<type>`, `how:<PlayHow>`,
  `ending:<reason>`, `phase:<name>`, `warning:<code>`, `human:<side>`, `turn:<n>`, `china-offered`, `auto`, `actor:none`).
  `findFixtures("event:reshuffle")` / `findFixtures("prompt:coup-target", "human:US")` search them.
* Previews: `coupOdds` (coup targets, event coups), `realignOdds` (realign targets), `effectiveOps` (action-card /
  play-mode) at the final prompt; the FixtureController answers from them.
* The data already carries the logic workstream's gap fields: `PromptOption.cost/endsPlay`, `Prompt.effect`,
  `Frame.playId`, vp `source`, `ViewModel.aiStats/savedGame`.

| Name | Kind | Frames | Size | What |
|---|---|---|---|---|
| `prompt-setup-place-ussr` / `-us` | scene | 1 | 21 KB | Setup placement (USSR mid-run / US start) |
| `prompt-bid-place` | scene | 1 | 24 KB | The US +2 bid |
| `prompt-headline-t1`, `prompt-headline` | scene | 1 | 24–33 KB | Headline choice, turn 1 and turn 4+ |
| `prompt-action-card`, `-china`, `-warning`, `-us` | scene | 1 | 31–35 KB | Card choice; with the China Card; with scoring-stranded warnings; as the US |
| `prompt-play-mode`, `-opponent` | scene | 1 | 35 KB | Event/Space/Influence/Coup/Realign; an opponent card (opponent-event warning) |
| `prompt-op-mode` | scene | 1 | 34 KB | Deferred Ops |
| `prompt-influence`, `-start`, `-us` | scene | 1 | 39 KB | Ops influence mid-run (cost 2 options), first point, as the US |
| `prompt-coup-target`, `-us` | scene | 1 | 34–42 KB | Coup target + coup odds |
| `prompt-realign-target` | scene | 1 | 33 KB | Realign target + realign odds |
| `prompt-event-target-add` / `-remove` / `-other` | scene | 1 | 33–35 KB | Event placement / removal / plain target (`Prompt.effect`) |
| `prompt-event-card`, `prompt-branch`, `prompt-defcon-level`, `prompt-region` | scene | 1 | 34–35 KB | Card for an event; branch; DEFCON level (with a defcon-suicide warning); Chernobyl region |
| `prompt-midgame` | scene | 1 | 122 KB | Turn 6 board at an action-card prompt, with the **whole** log (others keep the last 40 entries) |
| `seq-opening-ussr` / `-us` | sequence | 16–17 | 38 KB | Game start → both setups + bid → first headline prompt |
| `seq-headline` | sequence | 4 | 30 KB | Headline chosen → papers → both headlines resolve → AR 1 |
| `seq-ai-turn` | sequence | 9 | 47 KB | AI plays for influence (+ the turn end with reshuffle, deals, hand-revealed) → your headline |
| `seq-ai-coup`, `seq-ai-event` | sequence | 7 / 12 | 39 / 53 KB | AI coup with a die roll; AI event |
| `seq-turn-end` | sequence | 3 | 40 KB | End of turn 3 → turn 4 (Mid War) deal, China face up, headline phase |
| `seq-undo` | sequence | 6 | 41 KB | You play an event + place, then undo (the undo frame) |
| `seq-event-scoring` | sequence | 2 | 34 KB | A scoring card that scores: the capture always writes the first scoring-card play with a **non-zero** net under this name (now Asia Scoring, +3 VP, turn 1) |
| `seq-play-space`, `seq-play-realign`, `seq-play-discard` | sequence | 2–7 | 36–40 KB | Space race; realignment; a discard |
| `seq-over-defcon` / `-held-scoring` / `-milops-vp20` / `-resign` / `-vp20` | sequence | 5 | 38–42 KB | The last frames of games ending that way |
| `game-full` | sequence | 569 | 890 KB | A whole game (USSR, ends "held-scoring" in turn 9); one `card-moved` with `fromHand` |

Every PromptKind has a scene; every `GameEvent` type occurs in a short sequence; every `PlayHow` except `pass`
(random games never produced one) occurs somewhere.

**Regenerate** (deterministic: fixed seeds, the stub AI of `tests/game/helpers.ts` reporting 1200 ms per decision,
`savedGame.savedAt` pinned):

```sh
TSP_CAPTURE=1 npx vitest run tests/fixtures/capture.test.ts     # ~40 s, rewrites tests/fixtures/ui/
npx vitest run tests/ui/runner/fixtures.test.ts                 # checks coverage, size, redaction
```

Format: `src/dev/fixtureFormat.ts` (frame 0 in full, later frames as deltas; `decodeFixture` gives full `Frame`s,
`logs[i]` = `vm.log` while frame i is current, and `final: ViewModel`).

### Loading a fixture

```ts
// Browser (Vite page) or vitest, async, lazy chunk per file:
import { loadFixture, findFixtures, fixtureIndex } from "../../dev/fixtures";
const fx = await loadFixture("prompt-coup-target");
// Node tests, sync:
import { fixture, fixtureNames } from "../../fixtures/load";       // tests/fixtures/load.ts
const fx = fixture("seq-ai-turn");      // fx.frames, fx.logs, fx.final (ViewModel), fx.previews, fx.humanSide
```

### `src/dev/FixtureController.ts`

`new FixtureController(fixture, opts?)` implements `GameController`.

* Scenes start at the end (prompt open, frame acked); sequences at the base frame. Each `ackFrame(seq)` of the frame
  on screen releases the next (like the real controller); after the last one the recorded final ViewModel appears.
* `choose`, `undo`, `resign`, `boot`, `resume` are recorded in `calls` and change nothing (`choices` lists the chooses);
  `newGame` restarts the replay. `coupOdds` / `effectiveOps` / `realignOdds` answer from the fixture while a prompt is open.
* Options: `start: "begin" | "end"`, `queued: "zero"` (default) `| "remaining" | "recorded"`, `aiThinkingMs` (show
  `aiThinking` before each AI frame), `onCall(call, ctrl)`, injectable timers.
* Replay control: `restart(at?)`, `seek(index)`, `setFixture(fx, start?)`, `position {index, count, done}`, `dispose()`.
* `subscribe` / `getSnapshot` are bound (usable directly in `useSyncExternalStore`).

### `src/dev/DemoHarness.tsx`

```tsx
// src/ui/<yours>/demo/main.tsx — dev only
import { bootDemo, DemoHarness, DemoToolbar, useDemo } from "../../../dev/DemoHarness";
bootDemo(() => (
  <DemoHarness scene="prompt-coup-target" /* ?scene= wins */>
    <DemoToolbar />            {/* scene picker, en / zh-CN / en-XA, speed, motion, replay, frame n/N */}
    <MyComponent />            {/* useUiRoot(), useVm(), useShown(), useOverlays() all work */}
  </DemoHarness>
));
```

* = `UiRootProvider(FixtureController)` + `ShownProvider` (the real frame runner). Props: `scene`, `fixture`, `start`,
  `controllerOptions`, `layout`, `settings` (initial), `onCommit`, `loading`, `children` (node or `(demo) => node`).
  `useDemo()` → `{ controller, fixture, settings }` inside it.
* The FixtureController is made and disposed by one effect per fixture (StrictMode's simulated unmount disposes the
  instance it made, the re-run makes a fresh one; the children render once it exists). It used to be `useMemo`'d and
  disposed by the effect cleanup while `useMemo` kept it, which cleared a pending `think=` timer: `?think=` replays
  stayed "AI thinking" forever. Fixed 2026-11-22 (checked in the browser: screens, runner and console demos with
  `think=` replay to the end). `controllerOptions` / URL options are read when the fixture changes.
* `bootDemo(app)` imports the theme CSS (fonts → tokens → base), awaits `initLanguage()` (so `?lang=en|zh|en-XA`
  works) and renders into `#root` under `StrictMode`.
* URL (`demoParams()`): `scene`, `lang`, `start=begin|end`, `speed=slow|normal|fast|instant`, `motion=system|reduce|full`,
  `view=desktop|tablet|compact|compact-landscape`, `queued=zero|remaining|recorded`, `think=<ms>`, `labels=115|130`,
  `patterns=on`, `pause=off`. Settings live in memory (the page's saved settings are not touched).
* `DemoToolbar` is fixed top-right (`inline` prop puts it in the flow); it is dev text, not translated.
* Markup tests without a runner: `StaticShownProvider` + `staticShown(state, regionScores, patch?)` from the runner.
* `src/dev` is dev-only: no production module imports it, except `src/ui/screens/appController.ts`'s dynamic import
  of `dev/autopilot.ts` behind `import.meta.env.DEV`, which a production build drops (checked: no `__tspAuto` /
  `autopilot` in `dist/`).

---

## 1. What I built

| File | What |
|---|---|
| `runner/beats.ts` | `buildBeats(frame, before, humanSide): Beat[][]` (§9.4 groups; end-of-turn frames keep the events order), `boardRank`, `silentMove`, `dealtCards`, `STAGGER`, `staggerOffset` |
| `runner/director.ts` | `createDirector(): RunnerDirector` (several handlers per kind, `Promise.all`; a throwing handler is logged and counts as done; after Skip a handler is waited for at most 150 ms; `count(kind)`, `observe(fn)` for beat logs) |
| `runner/frameRunner.ts` | `FrameRunner` — the §9.1 loop without React (unit-tested in Node): commit after beats, then ack; Skip; Skip to my turn; boost; hidden tab; per-group speed (`frameSpeed`, live `vm.queued`); 400 ms AI lead-in; `Shown.aiPlayCard`; `lastPlay`; new game / jump detection |
| `runner/useFrameRunner.ts` | `useFrameRunner(root, { onCommit? }): Shown`, `useFrameRunnerInstance` (Shift listeners, `visibilitychange`) |
| `runner/ShownContext.tsx` | `ShownProvider({ onCommit? })`, `useShown()`, `useOnCommit(fn)`, `useFrameRunnerHandle()`, `StaticShownProvider`, `staticShown()` |
| `runner/anchors.ts` | `createAnchorRegistry(): RunnerAnchors` (stable `ref(id)` per id, `rect(id)` = latest visible element or null, `element`, `has`, `ids`) |
| `runner/lastPlay.ts` | `reduceLastPlay(prev, frame, humanSide)`, `EMPTY_LAST_PLAY`, `isUndoFrame` |
| `runner/locations.ts` | `anchorForLocation(loc, card, ctx)`, `flightFor(move, ctx)`, `handSide` (§9.6 table), `CardMove`; a move with `fromHand` (contract `card-moved.fromHand`) from `UNSEEN` starts at `hand:<fromHand>` (the pinned AI card still never flies) |
| `runner/FlightLayer.tsx` (+ `.module.css`) | `FlightLayer`: portal at `--ts-z-flight`; registers `card-moved`, `deal`, `reshuffle` (+ the reshuffle toast `ui:toast.reshuffle`); quadratic arc, flip at mid-flight for your dealt cards, reduced variant = fade at source + fade at destination |
| `runner/index.ts` | barrel |
| `runner/demo/` | `index.html`, `main.tsx`, `demo.module.css`, `shoot.mjs` (dev only) |
| `state/UiRootProvider.tsx` | `UiRootProvider({ controller, layout?, settingsStore?, rootAttributes? })` → `UiRootContext` + `OverlayContext`; re-exports `useUiRoot`, `useVm`, `useOverlays`; `cssSpeed`, `rootAttributes`, `MAX_TOASTS` |
| `state/settings.ts` | `loadSettings`, `saveSettings`, `sanitizeSettings`, `useSettings(store?)`, `settingsStore()`, `createSettingsStore(storage, initial?)`, `SETTINGS_KEY` |
| `state/useLayout.ts` | `useLayout()`, `currentLayout()` |
| `state/useReducedMotion.ts` | `useReducedMotion()`, `isReducedMotion(setting, system)`, `systemPrefersReducedMotion()`, `useSystemReducedMotion()` |
| `state/index.ts` | barrel |
| `dev/*` | the dev kit above |
| `tests/fixtures/capture.test.ts`, `load.ts`, `ui/*.json` | recording + loading the fixtures |

## 2. Public API

```tsx
import { UiRootProvider, useUiRoot, useVm, useOverlays, useSettings, useLayout, useReducedMotion } from "./ui/state";
import { ShownProvider, useShown, useOnCommit, FlightLayer, buildBeats, createDirector, createAnchorRegistry,
         reduceLastPlay, anchorForLocation, flightFor, staticShown, StaticShownProvider } from "./ui/runner";

// The shell (GameScreen) composes:
<UiRootProvider controller={controller}>                      {/* vm, settings, layout, anchors, director, toasts, zoom, <html> attrs */}
  <ShownProvider onCommit={() => map.current?.clearOverrides()}>
    …game screen…
    <FlightLayer />
  </ShownProvider>
</UiRootProvider>

// Any component:
const root = useUiRoot();                 // controller, vm, layout, settings, setSettings, anchors, director, zoomCard, toast
const shown = useShown();                 // state, regionScores, busy, actor, aiPlayCard, lastOpponent, placedThisPlay, skip, skipToMyTurn
useEffect(() => root.director.on("roll", async (beat, ctx) => { … }), [root.director]);
<div ref={root.anchors.ref("discard")} />
useOnCommit(frame => dropMyOverrides()); // after Shown.state caught up, before the ack
```

* `UiRootProvider` writes `<html data-human data-motion data-labels data-patterns>` (absent = default / system) and
  `--ts-speed` (`0.0001` for instant). `toast(message, { tone, ms })` queues at most 3, auto-dismissed after `ms`
  (default `TIMING.toast.default`). `zoomCard(card, from?)` / `closeZoom()` feed `OverlayContext.zoom`.
* `Shown.aiPlayCard`: set on an AI `reveal` beat (before its handlers run), cleared on a human reveal, an
  `action-round` beat, or a human prompt.
* Beat stagger is applied **by the runner**: country beats 120 ms apart (board order), card moves 60 ms apart capped so
  the group ends by 1200 ms. Handlers just animate their beat.

## 3. Test / demo

* `npx vitest run tests/ui/runner tests/ui/state` — 7 files, 68 tests: format round trip, coverage of every PromptKind /
  GameEvent / several endings, redaction checks on every fixture frame, FixtureController semantics; `buildBeats` on
  hand-made frames and on all 600+ recorded frames (every event → exactly one beat or a documented fold, rank order,
  board order, influence sums); `reduceLastPlay` with and without `playId` + invariants over every sequence; anchors,
  director (parallel, unregister, failing handler, abort grace); FrameRunner on real sequences (commit after beats,
  ack after commit, Skip, Skip to my turn, pauseOnReveals stop, queue speed-up, boost, hidden tab, StrictMode
  stop/start, jumps, new game, dock card, lead-in); settings / root attributes / reduced motion; providers rendered
  with `renderToStaticMarkup`. `npx tsc --noEmit -p .` passes; `tests/i18n` and `tests/theme` pass.
* Demo: `TSP_VITE_CACHE=node_modules/.vite-5182 npx vite --port 5182 --strictPort`, then
  `http://localhost:5182/TS_playfield/src/ui/runner/demo/index.html?scene=seq-ai-turn&lang=en` — the real map (country
  beats via `useMapBeats`), the flight layer over mock piles / hands, the reveal-dock card, pills and marks, a beat log
  (time, handler count, duration; struck through when aborted), Skip / Skip to my turn, speed and motion, replay.
  Clicking the table while it animates skips. Try `scene=seq-turn-end` (deal), `seq-play-discard` (a card flight),
  `game-full&speed=fast` (a whole game).
* Screenshots: `source scripts/pw-env.sh && node src/ui/runner/demo/shoot.mjs` → `docs/design/shots/ui-runner-*.png`
  (desktop en/zh/en-XA, 1366, 1024, phone en/zh, a card flight, the deal, reduced motion, the end state).

## 4. Deviations (with reasons)

1. **Silent beats are dropped in `buildBeats`**: card moves to/from `UNAVAILABLE` (§9.6: no flight), `DISCARD_PILE →
   UNSEEN` in a reshuffle frame (the reshuffle beat shows it), deck → hand moves in a frame with a deal to that hand
   (the deal beat flies them; `dealtCards(frame, side)` gives their ids), moves into `HEADLINE_COMMITTED` next to a
   `headline-chosen` (that beat shows it), and phase banners other than HEADLINE (§9.4 says none). Otherwise turn 4
   would stagger 45 invisible moves and duplicate flights.
2. **The pinned AI card does not fly** to its pile (`flightFor` returns null when `card === Shown.aiPlayCard` and it
   comes from `UNSEEN`): the reveal dock collapses into that pile at the next play (§9.5), and a second card leaving the
   still-pinned dock looked like a duplicate. `anchorForLocation` still maps that card's `UNSEEN` end to `"stage"`
   (the §9.6 row) for anyone who wants the flight.
3. **Stagger lives in the runner** (`STAGGER` / `staggerOffset`), since `Director.run` gives handlers no index.
4. **Jumps commit without animation**: frames reach the UI one by one, so a frame whose seq is not the last committed
   + 1 (restart, seek, a new game) is committed at once and resets pills/marks; a new first log entry also counts as
   another game.
5. **Hidden tab**: the current frame is aborted (→ commit → ack) and later frames play at speed 0 until visible again.
6. **`lastOpponent`** = influence changes made by AI-actor frames since the latest play began (`Frame.playId`; the
   G2 fallback when absent, which also splits the setup by side). Your first frame of a play clears it; an undo back to
   the start of your play restores it.
7. **No 400 ms lead-in before AI headline reveals** (the papers already pace that moment).
8. `UiRootProvider` binds `controller.subscribe/getSnapshot` itself (the spec's literal
   `useSyncExternalStore(controller.subscribe, controller.getSnapshot)` breaks on class methods), and takes optional
   `layout` / `settingsStore` / `rootAttributes` props for demos and tests. `ShownProvider` is a separate provider
   (as in §15.3), with an `onCommit` prop and `useOnCommit()` for override clearing.
9. `useReducedMotion` lives in `src/ui/state` as specified; `src/ui/common/hooks.ts` also has `usePrefersReducedMotion`
   (system only). Prefer mine where the setting must count.
10. Key bindings for Skip (Space / Esc while busy, Shift+Space) are not bound here: the keymap is the common
    workstream's (`useKey`) and the shell should call `shown.skip()` / `shown.skipToMyTurn()`. Shift-held boost *is*
    detected here (window keydown/keyup/blur).

## 5. Requests (files I do not own)

1. ~~**logic**: `deal` counts miss the era cards dealt from `UNAVAILABLE`~~ — fixed (docs/handoff/logic.md "Deal,
   scoring, reveals"; `seq-turn-end` now deals US 8 / USSR 7).
2. ~~**logic**: emit `{ t: "scoring", card, vp: 0 }` for every scoring-card play~~ — fixed: every scoring-card play
   has its `scoring` event, net 0 included (`seq-ai-event` has a net-0 one). `seq-event-scoring` is written again
   under that name: the first scoring play with a **non-zero** net (the scoring sheet with a result).
3. **stage, `RevealDock.tsx`**: animate the dock's collapse into the card's current pile (§9.5) — the flight layer
   deliberately does not fly the pinned card (deviation 2).
4. **shell, `GameScreen.tsx` / `App.tsx`**: compose `UiRootProvider` → `ShownProvider onCommit={() =>
   map.current?.clearOverrides()}` → screen + `<FlightLayer/>`; bind Space / Esc (only while `shown.busy` and no dialog)
   to `shown.skip()`, Shift+Space and the ⏭ segment to `shown.skipToMyTurn()`, a click on the table while busy to
   `shown.skip()`; register the anchors `deck`, `discard`, `removed`, `effects`, `stage`, `hand:<side>`,
   `headline:<side>`, `card:<id>` in the tray/rail/stage components (the map registers `country:<id>`/`plate:<slot>`).
5. Whoever owns `src/ui/common/hooks.ts`: consider reading the motion *setting* too (`useReducedMotion` from
   `src/ui/state`) in `CardFace`'s cross-fade, so `motion: "reduce"` in the settings applies there as well.

## 6. QA round 1 fixes (group F1, 2026-11-23)

- **Anchor registry leak (Q-011)**: React 18 calls a ref with null *before* it removes the host node, so the shared
  per-id ref callback's `isConnected` prune kept every element of an unmounted screen (one `DIV._game` and ~2.6k nodes
  per finished game). The callback now prunes again in a microtask after a detach (the commit is over by then).
  `RunnerAnchors.retained()` counts held elements (tests). Production preview (`mem2.mjs 3`, New game while the AI
  thinks, start-screen samples after two GCs): DOM nodes 1,700 / 1,700 / 1,706 and listeners 330 / 330 / 331 after games
  1-3 (before: 4,227 / 6,880 / 9,421 nodes, 430 / 522 / 626 listeners).
- **play.mjs (Q-015)**: dialogs are scoped to the open modal dossier (`[role=dialog][aria-modal=true]`), not the last
  `[role=dialog]` (the hover card zoom is one); hand cards are found by `[data-hand-card]` (never a log reference);
  an event-card answer prefers the open dossier's card; region prompts press the compact theatre chip
  (`button[data-slot]`) when it is shown, else the plate; a dock press that times out no longer ends the run.

## 7. QA round 2 fixes (group F1, 2026-11-23)

- **Cancelled headline (R-004)**: in a frame with the headline reveal, the Defectors-cancelled headline's `card-moved`
  to a pile is a silent beat (`silentMove`; `cancelledHeadlineCard(frame)`, the runner's twin of the stage's
  `cancelledHeadline`, which the papers use). The papers stamp it CANCELLED and slide it into the discard pile, so it
  no longer also flies: from the draw deck when it was the AI's hidden card (`UNSEEN`, r2-long #1), from the adversary
  dossier when it was a known AI card, from the hand / slot when it was the human's (the mirror case). The played
  headline's own move keeps its beat (the AI's: folded into the reveal dock's collapse by `flightFor`). Tests:
  `tests/ui/runner/beats.test.ts` (the seed-3 turn-1 frames recorded from the controller, human US and human USSR; a
  known AI card; agreement with `cancelledHeadline` on every recorded reveal). Browser (dev, seed 3, 1440×900 normal):
  after the fold, only Defectors flies (hand → discard); card 9 never leaves the deck
  (`docs/qa/shots/r2-fix-F1/r004-after-cancelled-headline-no-deck-flight.jpg`; before:
  `docs/qa/shots/r2-long/f-cancelled-headline-flies-from-deck.jpg`).
