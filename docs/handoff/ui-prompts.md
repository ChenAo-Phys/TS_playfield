# Handoff: UI prompts (W7, `src/ui/prompts/**`)

Owner: **prompts**. Files: `src/ui/prompts/**` (dev-only `demo/`), `tests/ui/prompts/**`,
`src/i18n/locales/{en,zh-CN}/ui_prompts.json`. Spec: `docs/design/ui-spec.md` §8 (all), §4.8, §9.5 (the slip during the AI
turn), §12, §15.3 "W7".

## What was built

| File | Exports | What |
|---|---|---|
| `policy.ts` | `policyFor`, `commitFor`, `policiesOf`, `isFinalPoint`, `endsThePlay`, `severityOf`, `warningFaces`, `isDanger`, `isHumanWin`, `isTrapEscape`, `isDiceEvent`, `handPolicies`, `cardVerb`, `stampVerb`, kind sets | the §8.2 confirmation model, pure; tested against every §8.2 / §8.6 row and every scene fixture |
| `costHint.ts` | `cost2Targets`, `pointCost`, `countryFacts`, `deciderOf`, `controlAfter`, `wouldTakeControl`, `realignFacts` | display-only facts (G1): the "2 Ops" set = opponent control (never `cost >= 2`), coin cost from `option.cost` |
| `eventVerbs.ts` | `effectOf`, `verbFor`, `ghostSideFor`, `removeAmount`, `EVENT_VERBS` | `Prompt.effect` (G3) with the card-table fallback |
| `runTotals.ts` | `nextRun`, `runKey`, `runTotalOf`, `runPlaced`, `runCardPicks`, `useRun`, `useRunTotal` | decision runs: counter totals, cap tags and picker counts as differences of the board since the run began |
| `store.ts` | `PromptStore`, `promptStore(controller)`, `STAGE_TIMEOUT_MS` | one store per controller (no provider needed): staged selection, hover, run, last prompt, target-list open; listens to the controller itself |
| `useStaging.ts` | `useStaging(prompt)`, `stagedFor`, `usePromptStore`, `usePromptUi` | §8.2 staging: cleared on promptId change (a realignment's country is carried across its roll), 6 s timeout, paused while the pointer is on the slip |
| `usePromptActions.ts` | `usePromptActions()`, `policyContext`, `stagedKey` | `activateCountry/Card/Region/Option`, `done`, `undo`, `confirm`, `cancel`, `commit`, `hoverCountry/Region`, `policyOf`, `stagedOption`; ignores activations while `Shown.busy` |
| `usePromptTargets.ts` | `usePromptTargets(prompt, state)`, `promptTargets` (pure) | `MapTargets` (+ `ghostSide`, `cap`); frozen while your own click animates (§8.5.4) |
| `usePromptKeys.ts` | `usePromptKeys(actions, enabled)` | Enter, Esc, Z / Mod+Z, D, T (bound by the slip; every handler returns `false` when idle) |
| `doneText.ts` | `doneText(prompt)` | `doneLabel(prompt)` (the §8.4 overrides live in src/game) |
| `labels.ts` | `confirmLabel`, `promptCrumb`, `promptCard`, `ordersHead`, `scoredNet`, `howWord`, `slotName`, `REPEATING_PICKERS` | words built from catalog keys only |
| `regions.ts` | `regionTargetsOf`, `groupByRegion`, `slotOfCountry`, `BOARD_SLOTS`, `SCORING_SLOT` | |
| `previews.ts` | `usePreview`, `previewNow`, `cachedPreview` | `coupOdds` / `realignOdds` on hover, debounced 120 ms, cached per controller + promptId |
| `OrdersSlip.tsx` (+ css) | `OrdersSlip({ variant, expanded? })`, `slipMode`, `playModeKeys` | §8.1: head + side stamp, clip, title, crumb, big counter, Ops coins (hover pulse), undo, hint / warnings / consequence, actions (primary ↵, hold, done, list). Modes: prompt, frozen, AI (§9.5: waiting + caret, "plays X", crumb from the reveal/roll beats, "still thinking" after 8 s, model loading %, speed segment, Skip), over |
| `PlayModeStage.tsx` (+ css) | `PlayModeStage({ prompt })`, `PlayModeRows` | §8.7 play-mode and op-mode panel; compact: a bottom sheet with the card at 46 % |
| `BranchDossier.tsx`, `DefconDossier.tsx` (+ `dossiers.module.css`) | `BranchDossier`, `DefconDossier`, `defconCaption` | §8.8, §8.9 |
| `CardPicker.tsx` (+ css) | `CardPicker({ prompt } \| { browse, onClose })`, `locationTag` | §8.10 picker and pile viewer (filters side / era / Ops) |
| `RegionChoice.tsx` | `RegionChoice({ prompt, dense? })`, `regionTargetsOf` | §8.11 slip rows |
| `CountryTooltip.tsx` (+ css) | `CountryTooltip({ country, prompt, state, humanSide })` | §8.12, give it to the map as `renderTooltip` |
| `TargetList.tsx` (+ css) | `TargetList({ prompt, state })` | §8.13 listbox |
| `dialogParts.tsx` | `DialogKeys`, `ConfirmButton`, `DoneButton`, `useCardPeek` | shared by the dossiers (and `useCardPeek` for any hover zoom). `FocusHold` is gone: hold buttons use `HoldButton autoFocus` with a `key` per option |
| `wiring.tsx` | `usePromptMapProps`, `useHandProps`, `handOffers`, `promptSurface`, `isHandPicker`, `CardSheetActions`, `PromptStage`, `PromptDialogs` | everything the shell plugs in |
| `index.ts` | all of the above | |

## How the shell wires it

```tsx
import { OrdersSlip, PromptStage, PromptDialogs, CardSheetActions, CardPicker, usePromptMapProps, useHandProps,
         usePromptActions } from "./ui/prompts";

const map = usePromptMapProps();     // targets, regionTargets, selection, focusRegion, interactive,
                                     // onActivate, onHover, onRegionActivate, onRegionHover, renderTooltip
<MapView ref={mapRef} state={shown.state} … {...map} />

const hand = useHandProps();         // { offered, staged, liftedOut, mode, stamp, china, onActivate }
<Hand cards=… offered={hand.offered} staged={hand.staged} liftedOut={hand.liftedOut} mode={hand.mode} onActivate={hand.onActivate} />
// staged card's stamp text: t(`ui:stamp.${hand.stamp}`); <ChinaSlot policy={hand.china} onActivate={() => hand.onActivate(6)} />

<Tray slip={<OrdersSlip variant={layout === "tablet" ? "tablet" : "desktop"} />} />   // compact: <OrdersSlip variant="compact" expanded={sheetExpanded} />
<main className="table" style={{ position: "relative" }}> … <PromptStage /> </main>   // play-mode / op-mode stage (absolute, inset 0, z stage)
<PromptDialogs />                                                                     // branch, DEFCON, card picker (portals, z modal)
<CardZoomHost actions={card => <CardSheetActions card={card} />} />                   // compact card sheet answers
{pile && <CardPicker browse={pile} onClose={() => setPile(null)} />}                  // pile viewer (Piles.onOpen)
// compact theatre chips during a region prompt: usePromptActions().activateRegion(slot) / hoverRegion(slot)
```

* Staging is shared through `promptStore(controller)`; no provider. Every surface (map, hand, slip, stage, dossiers, list)
  sees the same selection.
* Keys: the slip binds Enter / Esc / Z / D / T; the play-mode panel binds E I C R S and Esc (cancel, else back = undo);
  dossiers bind Enter / Esc inside their key scope. Space / Shift+Space (skip) stay with the shell.
* `promptSurface(prompt, state, human)` → `"map" | "hand" | "stage" | "branch" | "defcon" | "picker" | "region"`
  (an event-card prompt whose cards are all in your hand is answered from the hand, with verb stamps).

## Test / demo

* `npx tsc --noEmit -p .` — clean.
* `npx vitest run tests/ui/prompts tests/i18n tests/theme` — 13 files, 341 tests pass; mine: 5 files, 136 tests:
  `policy.test.ts` (every §8.2 / §8.3 / §8.6 row + every scene fixture), `model.test.ts` (cost hints, event verbs, runs,
  the store: staging / carry / timeout / attach, targets on fixtures, surfaces, slip modes), `actions.test.ts`
  (`usePromptActions` / `usePromptMapProps` / `useHandProps` over the FixtureController), `components.test.ts` (every
  component in en, zh-CN and a no-hard-coded-text check in en-XA), `styles.test.ts` (§18.2 rules + every CSS-module class used exists).
* Demo: `TSP_VITE_CACHE=node_modules/.vite-5185 npx vite --port 5185 --strictPort`, then
  `http://localhost:5185/TS_playfield/src/ui/prompts/demo/index.html?scene=prompt-coup-target&lang=en` (any fixture;
  `view=compact`, `lang=zh|en-XA`, `motion=reduce`, and `variant=picker|wargames|hold|ai|pile` for prompts no fixture has:
  a discard-pile picker (SALT), Wargames' hold, a certain DEFCON suicide on a map target, the AI thinking, the pile viewer).
  The real map, slip, stage, dossiers, zoom; a stand-in hand / piles / console (dev chrome); the rail logs the controller calls.
* Screenshots: `source scripts/pw-env.sh && node src/ui/prompts/demo/shoot.mjs [name…]` (server running) →
  `docs/design/shots/ui-prompts-*.png` (36: influence / coup / realign / play-mode / op-mode / headline / scoring card /
  branch / Wargames hold / DEFCON / picker / pile / region / event placement / target list / AI / 1366 / 1024 / phone, in
  en, zh, en-XA). Compared with `final-desktop-en`, `final-coup`, `final-playmode`, `final-ai`, `final-phone`,
  `situation-room-card-picker`, `situation-room-defcon-choice`.
* Checked in Chromium (Playwright, port 5185): click stages / Esc cancels / Enter and a second click commit / Z undoes /
  T opens and Esc closes the list / a 1-Op point is instant / the final point stages / I chooses, E stages, E again commits,
  Esc goes back on the stage / DEFCON 1: a click selects, a 0.4 s Enter hold does nothing, a 1.35 s hold commits / a hold
  option on the map moves focus to the slip's hold button / branch tile + Enter / headline card click twice / reduced
  motion: no running animation on the stage. No page errors.

## Deviations from the spec (with reasons)

1. **confirmFinal follows `endsPlay`.** "The action that ends your play" is staged whenever the controller says the option
   ends it: the final point (as specified), every done press, play-mode Space, play-mode Event only when `endsPlay !== false`
   (an Event that asks for targets next keeps undo, so it is instant), and any other option with `endsPlay: true` (e.g. a
   play-mode Coup whose only target is auto-played, which rolls at once).
2. **A certain game end you win stages instead of hold**, has severity "caution" and no hazard ring; the hold, the hazard ring
   and the "fatal" severity are for losses and draws (`params.winner`). A win is final but not a danger.
3. **Hold on map / hand targets:** the first activation selects; the slip's hold button (focus moves to it) confirms. Map boxes
   have no hold ring of their own. In dossiers and on the play-mode stage the hold button is in place.
4. **Hold label = `warningMessage(w)`** (§8.3 "label This ends the game — you lose"), with "Press and hold to confirm"
   under it; the warning panel is not repeated.
5. **Ops coins only for Ops influence** (§8.6 names them there only); setup / bid / realign / event runs show the counter alone.
   This also keeps the 138–153 px desktop slip from overflowing.
6. **Tight slip heights:** the list link is an icon (named for screen readers) and hidden while something is staged; undo
   shrinks to its icon when the actions row also holds a primary or done button, or when the Ops-coins row would overflow
   (`useOverflows`, e.g. Chinese); the actions row docks to the bottom. The note under the title (the hint, or the staged
   choice's consequence) keeps the **whole lines that fit** beside everything else (`useFitLines`: 2, 1 or none,
   `data-lines`), never a line cut in half; it was cut mid-line on influence (coins row) and overlapped the actions on a
   staged coup at 1366 / 1024. Every line that can be clamped or ellipsized carries its full text as a `title` (title,
   crumb, hint, consequence, "still thinking", the ending reason, region buttons). The crumb is one line: the card name
   gives way first ("苏伊士运河… › 政变 → 以色列 · 3 行动点"), a long target is capped at 45 %, mode and Ops stay whole.
   Audited in every slip mode (your move ×10 prompt kinds, staged, headline, committed headline, AI thinking + still
   thinking, AI play, AI event, game over) × en / zh / en-XA × 1440, 1366, 1024, 390: no clipped, cut, covered or
   off-screen text (prep-ui pass).
7. **Region prompt on desktop / tablet slips:** a dense 3×2 grid (short plate names, full names as labels) whose staged
   button is the primary (ink, ↵); no crumb, one consequence line (full text in its title). Compact keeps rows + primary.
8. **Play-mode slip title** = `ui:mode.howTitle` ("How will you play it?", as the mockup), not `prompt.title` (the crumb
   names the card). The stage hides the big card on narrow / short tables (≤ 1199 px wide or ≤ 760 px high) so the panel fits.
9. **Headline hint:** `prompt.detail` (space-race privilege: the AI's headline / it sees yours) wins over
   `ui:slip.hint.headline`; influence uses `ui:slip.hint.influence` (with the "2 Ops" chip) over its generic detail.
10. **Realign tooltip shows odds** (`realignOdds`, G5 now implemented) besides the facts.
11. **Run totals** of Ops runs also use `prompt.opsValue` (a run first seen mid-way after a reload shows 2/3, not 2/2);
    cap tags and picker counts are board differences since the run began (they include auto-played points and survive undo).
12. **Staging timeout** pauses while the pointer is over the slip and restarts when the staged country is hovered.
13. **Target list on desktop** opens in a dossier (modal) titled with the prompt; rows stage / commit with the same policy
    (the confirm words replace the action pill once staged).
14. **Speed segment:** 1× = normal, 2× = fast, ⏭ = `skipToMyTurn()` (one-shot); ⏭ shows pressed when the speed setting is instant.
15. Extra props / exports: `OrdersSlip.expanded`, `RegionChoice.dense`, `PlayModeRows`, `CardSheetActions`, `PromptStage`,
    `PromptDialogs`, `usePromptMapProps`, `useHandProps`, `useCardPeek`.

## Requests (files I do not own)

1. **shell** (`src/ui/screens/GameScreen.tsx`, `src/ui/compact/*`): wire as in "How the shell wires it"; region prompts:
   theatre chips of the offered regions call `activateRegion(slot)` / `hoverRegion(slot)`; pass the compact sheet's expanded
   state to `<OrdersSlip variant="compact" expanded>`; mount `<PromptStage/>` inside the (position: relative) table.
2. **tray** (`src/ui/tray/**`): `Hand` gets `offered / staged / liftedOut / mode / onActivate` from `useHandProps()`; the staged
   card wears `<Stamp>{t(\`ui:stamp.${hand.stamp}\`)}</Stamp>`; `ChinaSlot.policy = hand.china`; on compact a tap opens
   `root.zoomCard(card, el)` (the sheet's answers come from `CardSheetActions`).
3. **map** (`src/ui/map/MapView.tsx`): keep the staged selection's tooltip pinned (§8.6 coup: "click → reticle + pinned
   tooltip with the odds strip"). Now it disappears when the pointer leaves the box, because the clicked box keeps focus and
   `tipId` only falls back to `selection` when `focused === null`; let a focused box that *is* the selection count too.
4. **map**: a click that reaches a target box with no hover before it (Playwright's `page.click`) does not activate it; with a
   150 ms hover first it does. Worth a look at the `onBoxClick` path for touch / pen taps.
5. **runner** (`src/dev/DemoHarness.tsx`): under StrictMode the effect cleanup calls `controller.dispose()` while `useMemo`
   keeps the same FixtureController, so `?think=…` replays stay in "AI thinking" forever (its timer was cleared).
6. ~~**common**: `HoldButton` `forwardRef` / `autoFocus`~~ — done (prep-ui): the slip, the dossiers' `ConfirmButton` and the
   play-mode hold row use `<HoldButton key={option.idx} autoFocus …>`; the 1.2 s Enter / pointer hold is unchanged (checked in
   Chromium: focus moves to the hold after the map click, 0.4 s Enter / 0.3 s press do nothing, 1.35 s Enter commits).
7. **coordinator** (`docs/design/ui-spec.md` §8.1, §8.2, §8.3, §8.11): record deviations 1, 2, 3, 5, 7, 8.

## QA round 1 fixes (fix group F3, 2026-11-23)

Items Q-025 … Q-040 of `docs/qa/TRIAGE.md`; before / after shots in `docs/qa/shots/fix-F3/`; tests in
`tests/ui/prompts/qa-fixes.test.ts` (24) besides the updated `components.test.ts`.

| Item | Change |
|---|---|
| Q-025 | DEFCON 1 holds only when its own warnings don't say the human wins (`commitFor`; `gameEndOf`). The lamp's caption comes from the warnings (`defconCaption(level, current, warnings, human)`: "ends" = you lose, `endsWin` = "Ends the game — you win", none → relative caption); hazard stripes only with the hold; a winning lamp gets a brass ring and, once staged, the warning's words under the rule line (§8.3 caution). |
| Q-026 | The play-mode letters (E I C R S, also by physical key: `letterOf`) move focus to the row they stage, so Enter commits that row (it went to the auto-focused Event button). |
| Q-027 | The target list's active row lives in the prompt store (`listActive`, by country id; reset on close / off the map) and the list dossier stays mounted while your own click animates (frozen): a second Enter places in the same country. A row that leaves the list (capped) moves to the next target in board order (`activeRow`). Rows are named "Finland, stability 4, US 0, USSR 1 — place 1 influence" (`ui_prompts:list.row(Bg)`, `list.say.*`). |
| Q-028 | `HandPromptBar` (new export): the hand prompt's title and its done button (slip label and policy: stage → pressed with the confirm words → commit; hold for a certain loss; D inside the drawer). The compact hand drawer renders it in its header (tray). |
| Q-029 | Play-mode sheet: full height in compact landscape (sheets open over the map column only, common); on short viewports (≤ 560 px high) the card is a 52 px thumbnail beside its name and the rows 44 px: Event · Operations · Space race · Back to hand on screen at 844 × 390 and 720 × 450. |
| Q-030 | Compact landscape (side column): the slip shows the List link, T opens the list (portrait keeps the expanded sheet), in the dossier (a full-screen sheet there). |
| Q-031 | Slip head from `displayTurnAr` (common): "Orders · End of turn 3" past the turn's last round, the ending's turn after final scoring (`ui_prompts:slip.ordersEnd`). |
| Q-032 | Touch wording from `useTouchUi()` (common): tooltip key lines, the influence hint, the coup consequence, dossier and picker hints (`ui_prompts:touch.*`); no "Keys: E · I …" hint on touch. |
| Q-033 | Side-column slip (`.side`, compact landscape): the title over the full width, up to 4 lines; hint up to 4; the crumb wraps between its parts. |
| Q-034 | Region buttons use the short plate names everywhere, on up to two lines on compact (full name as label / title). |
| Q-035 | Narrow phones (≤ 480 px): the Operations buttons stack icon over word, key chip in the corner (en, en-XA whole at 360 px). |
| Q-036 | The Event row of an opponent's card always says `prompt:detail.playModeOpponent` (`opponentEventDetail`); a play-mode with its own title (Grain Sales) shows its detail under the panel's header. |
| Q-037 | Conditional Ops bonuses (`bonusHints`: China Card in Asia, Vietnam Revolts in SE Asia for the USSR, `ui_prompts:hint.seAsiaBonus`) lead the influence hint, so they are in the lines that fit. |
| Q-038 | `coupNumbers(odds, prompt)`: the coup formula ("4 Ops + ⚀ − 1 − 2×2", `tip.coupFormulaMod`), mil ops and the staged crumb use `CoupOdds.ops` / `CoupOdds.modifier` when the controller gives them (optional fields requested of the coordinator + F1), else the prompt's Ops. |
| Q-039 | Branch tiles say a game end: a loss in the hazard line, a win in a caution line (`.tileCaution`), no stripes. The slip's warning panel is never squeezed below one whole line, and on desktop / tablet it takes the crumb's line (the actions stayed inside the 152 px slip). |
| Q-040 | Card picker / pile viewer on compact: `repeat(auto-fill, minmax(148px, 1fr))` (4 columns on a portrait tablet, 2 on phones). |

New deviations from the spec (add to the list above):

16. **DEFCON 1 you win** stages with a caution ring and the warning's words (extends deviation 2 to §8.9's lamp, which the spec
    always hazard-strips).
17. **Desktop / tablet slip with a warning panel** drops the crumb line (the clip and the primary name the play), so the panel and
    the actions fit the 152 px slip.
18. **Compact landscape**: the slip's List link / T open the list dossier (the spec gives the list only to the expanded portrait
    sheet and desktop); the play-mode sheet is full height there.
19. **Region buttons** use the short plate names on compact too (deviation 7 was desktop / tablet only).
20. **Influence hint**: conditional bonuses first, then the click instruction.
21. **Touch**: every instruction has a touch wording (`useTouchUi`), chosen by the last pointer used.

Requests (this round):

8. **coordinator** (`src/game/contract.ts`, additive optional): `CoupOdds.ops?: number` (Ops the coup is credited with, incl. the
   China Card's Asia rule) and `CoupOdds.modifier?: number` (roll modifier: SALT −1, LADS ±1). `coupNumbers` reads them already.
9. **F1** (`src/game/previews.ts` `computeCoupOdds`): set them from the engine's COUP roll (`mod1`, `total1 − roll1 − mod1`).
10. **F1** (`src/game/prompt.ts` + `prompt.json`): `prompt:card.46.detail` ("…and you would lose") only when the human is the
    phasing player; a win variant otherwise (en + zh). The dossier's lamp, caption and caution line are right already.

## QA round 2 (r2-hand-wait, 2026-11-23)

### The AI's wait (owner decision OD-2: full strength everywhere, soften the wait)

* **Clock**: the prompt store's new `aiSince` (its clock: `Timers.now`, default `performance.now()`) is set when a
  ViewModel says `aiThinking` and cleared when it stops — every AI decision alike, the padded forced answers included,
  so the count tells nothing the "thinking" state does not. It lives in the store (not the slip), so a remount (layout
  change) keeps the count.
* **`aiWait.ts`**: `useAiWait()` → `{ since, seconds, still, hintDue }`, re-rendering on each whole second
  (`msToNextSecond`); `STILL_THINKING_S` 8, `SLOW_HINT_S` 20; the one-time hint: `slowHintAvailable(since)`,
  `claimSlowHint(since)`, `slowHintClaimedBy(since)` (module state + sessionStorage `ts-playfield.aiSlowHint`, so a
  reload doesn't show it again; private mode falls back to once per page load).
* **Slip** (`AiBody`): from 8 s "Still thinking · 14 s" / "仍在思考 · 14 秒" (`ui_prompts:ai.stillThinking`), the number in
  a fixed-width tabular span (2ch, end-aligned: nothing moves as it counts, checked 8 → 23 s in 9 arrangements). Past
  20 s, the first decision of the page session continues the note with one sentence where the slip has room for two
  lines or more (`ai.stillThinkingSlow`: "Still thinking · 21 s. At full strength the AI can take up to a minute per
  move on this device." / "仍在思考 · 21 秒。在这台设备上，全力以赴的 AI 每步最多可能需要一分钟。"): 1440 (3 lines),
  1366 (2), phones portrait / landscape (the compact slip grows by one line, once). Where it has not (tablet slips:
  one line), the same sentence comes once as a toast (`ai.slowHint`, 9 s). Later long decisions show the count only.
  en-XA marks all three strings. The old `ui:slip.ai.stillThinking` is no longer used.
* Two slip fixes found on the way: `useFitLines` now restarts from a new maximum (a content-sized compact slip only
  "had room" for what it showed) and its ResizeObserver calls the latest `fit` (it kept the first render's `max`);
  the AI title spans the whole `.top` row and its blinking caret wraps with the last word (on the 296 px tablet slip
  the caret alone took a second line, which hid the note).
* Shots: `docs/qa/shots/r2-hand-wait/ai-wait-slips.png` (22 s: 1440 en / zh, 1366, 1024 tablet (toast), 390 zh, 844 × 390).

### A quick second tap during your own placement (leftover)

A tap that lands while your placement animates (the ~250 ms control-flip beat, before the next point's prompt opens)
was lost. Now it is **queued and applied to the next prompt when that is unambiguous**:

* `PromptStore.queue(prompt, country)`: only for placement runs (`QUEUE_KINDS`: setup-place, bid-place, influence,
  event-target; never coups or realignments), for a country that prompt offered, one at a time. On the next prompt
  (`observe`) it is routed to it if that prompt continues the run (same `runKey`, fewer points left) and offers the
  country, else dropped silently; also dropped when the AI thinks, the game ends, or after `QUEUE_TIMEOUT_MS` (2.5 s).
  A tap aimed at a prompt that is open while its frame still finishes waits for that prompt only.
* `usePromptActions().activateCountry` queues instead of ignoring while your own frame animates (`Shown.busy` with
  `actor` = you, or no prompt yet and the frame is yours); `flushQueued()` (new on `PromptActions`) applies it once
  the prompt is interactive — exactly what a tap then would do (an instant point places, the final point stages) —
  and every mounted surface calls it after rendering (`takeQueued` hands it to one).
* `usePromptMapProps().interactive` stays true during your own placement frame while the frozen rings are shown, so the
  map treats the tap as a target tap (no tooltip, no double-tap zoom) and calls `onActivate`.
* Checked at 390 × 844 touch in the real app (USSR setup, taps 120 ms apart, the second during the frozen frame): the
  same country twice → +2; two countries → +1 each; on the last two points → the first places, the queued tap stages
  the final point (confirm as usual). No console errors.

### Esc "Back to hand"

`backToHand(store, actions, prompt)` (exported from `PlayModeStage.tsx`; Esc and the footer button): asks the hand to
focus the play-mode card (`PromptStore.setFocusCard`, lapses after `FOCUS_TIMEOUT_MS` 3 s) and undoes. The tray's
`Hand` focuses it once it is back and playable (ui-tray.md).

### Tests

`tests/ui/prompts/round2.test.ts` (16): the AI clock in the store; `elapsedSeconds` / `msToNextSecond`; the one-time
hint; the slip's note before 8 s, at 14 s, past 20 s in en / zh, and after another decision claimed the hint; the
queue (kinds, offered country, one at a time, routing, every drop, the timeout, a tap for the prompt just opened);
`activateCountry` / `flushQueued` / map `interactive` over a recorded influence prompt (own frame vs the AI's, a coup
never queues); `backToHand` and the focus request's timeout.

## QA round 2 fixes (fix group F3, 2026-11-23)

Items R-009 … R-015 of `docs/qa/r2-TRIAGE.md` (R-013 / R-016 in ui-tray.md, R-011 / R-014 also in ui-common.md);
after shots in `docs/qa/shots/r2-fix-F3/`; tests in `tests/ui/prompts/round2-f3.test.ts` (21) and the updated Q-037
expectation in `qa-fixes.test.ts`.

| Item | Change |
|---|---|
| R-009 | Dense region prompt (desktop / tablet slips): the 3 × 2 grid and Undo play share one row (`.regionRow`: grid · undo, the undo the height of both rows, its icon alone and no key cap); under it one line (`.regionLine`, `data-note`): the staged region's consequence, else the prompt's detail, kept only where it fits (`useFitLines`, max 1: shown on 138 px+ desktop slips, hidden on 120–126 px tablet slips). The old `.regionFoot` (line + undo under the grid) fell off the 120–138 px slips. Region buttons: tighter tracking (`.05em`) and 4 px padding so "MIDDLE EAST" stays whole in the 69 px columns beside the clip and undo. Checked 1024 × 768, 1100 × 700, 1280 × 720, 1366 × 768, 1440 × 900 in en / zh / en-XA, mouse and touch: undo inside the slip and hittable everywhere; no cut names except en-XA's "⟦MIDDLE EAST⟧" on desktop slips (ellipsis, full name as label / title). |
| R-010 | Coarse pointers (`@media (pointer: coarse)`), desktop / tablet slip: every `.actions` / `.rowTools` button answers a hit area 44 px tall (`::after`, `inset: min(0px, calc(50% - 22px)) -3px`: half the 6 px gap sideways); icon-only buttons (`.iconOnly`, the List link) and the speed segment are 44 px wide (the segment stops clipping, its end buttons round its corners). Region grid: each button 2 px into each gap, the top row 18 px up (over the title), the bottom row 18 px down; the undo beside it 2 px left, 10 px into the slip's right padding. Play-mode: Back to hand answers 44 px (stage and sheet; the short sheet takes the 6 px gap above and reaches 12 px down); the Operations buttons stay 44 px tall (`.narrow { min-height: 44px }`: without the key chip's line they were 38). Measured at 1024 × 768 touch (`smallTargets`): slip buttons 44 tall except where a slip's content already overflows its 126 px (setup-place: title on 2 lines + counter + actions), where the slip's own edge clips the area to 36; region bottom row 37–38 px at 1100 × 700 (the slip ends there), 44 at 1024 × 768. Phones: Back to hand 44 at 360 × 740, 390 × 844, 768 × 1024, 844 × 390, 720 × 450. |
| R-011 | No key caps on touch (`useTouchUi`): `Button` (common) drops its `<kbd>`; the play-mode rows drop their letter chip (`.noKey`: the key column and its gap go too, so no empty column); the staged region button drops its ↵. `aria-keyshortcuts` stays everywhere. Checked in 10 scenes at 1024 × 768 and 360 × 740 touch: no visible `kbd`; 1440 mouse unchanged. |
| R-012 | Slip title (desktop / tablet): `useTitleLines` gives it up to 4 lines where the slip has room beside everything but the note under it (`data-note`: hint / consequence / region line; one note line reserved where one shows); 2 at least, 1 beside the region grid; `data-lines` 1 / 3 / 4 clamps. The title never depends on the note's fit, so both settle in one pass. A cut title or crumb (`useTitleCut`, re-measured on resize and when web fonts load) becomes a toggle: the title is `role="button"`, `tabIndex 0`, `aria-expanded`; a tap / click anywhere on the `.top` block, or Enter / Space on the title (default prevented, so the slip's Enter doesn't confirm), shows the whole title and wraps the crumb (`.top[data-open]`); the slip's main column then scrolls; a second tap folds it; a new prompt starts folded. On the tablet most long event titles have no room for a third line (title 2 lines + crumb + counter + actions fill the 126 px slip), so the toggle is what makes them readable there; where there is room (action-card, branch) the title takes 3–4 lines. |
| R-014 | Slip head of a game that ended inside an action round: "Orders · Turn 5 · AR 2", as the telex (`displayTurnAr`, common). |
| R-015 | `bonusHints` also for `realign-target` (`ui_prompts:hint.asiaBonusRealign`, `hint.seAsiaBonusRealign`) and `coup-target` (`hint.asiaBonusCoup`, `hint.seAsiaBonusCoup`), en + zh-CN; they lead the hint (`PromptHint` / `promptHintText`), and a staged realignment's consequence (its country stays staged across the rolls, so the line after a roll outside Asia explains "5/5 → 3/5"). The unstaged coup crumb drops its Ops while a conditional bonus applies (the prompt's Ops are a maximum); the staged crumb keeps `CoupOdds.ops`. |

New deviations from the spec (add to the list above):

22. **Dense region prompt (§8.11, deviation 7)**: undo stands beside the grid (icon only, no Z cap even with a mouse; its
    title and `aria-keyshortcuts` keep the shortcut), and the one line under the grid shows the prompt's detail until a
    region is staged; on tablet slips the line has no room and is not shown.
23. **Slip title (§8.1 "Fit")**: up to 4 lines where the slip has room (was a 2-line clamp); a cut title or crumb is a
    toggle that shows the whole text in place (touch has no `title` tooltip, §12).
24. **Touch targets on the desktop / tablet slip (§3.3, §12)**: invisible 44 px tall hit areas on coarse pointers; the
    icon-only buttons and the speed segment are 44 px wide there (visible change: wider, same height).
25. **Key caps (§3.3)**: none on touch screens, in every `Button`, the play-mode rows and the region primary.

### Integration (round-2 integrator)

* `CountryTooltip` `coupMilOps(odds, prompt, ops)` (exported): "Mil ops +N" from `CoupOdds.milOps` (contract, R-002) for
  coup-target and event coups (Che: +3; Junta / Tear Down This Wall free coups and Ortega: no line); without the field the
  old rule (the coup's Ops on coup-target only).
* `useAiPlay` takes a roll's target through `rollCountry` (`../stage/model`, R-007): a space-race roll names no country.
* The as-built notes for deviations 22–25 and the r2-hand-wait changes (AI wait, tap queue, spines) are in ui-spec §3.2,
  §3.3, §7.2, §8.1, §8.2, §8.6, §8.11, §8.12, §9.5. Tests: `tests/ui/prompts/r2-integrate.test.ts`.
