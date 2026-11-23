# QA triage, round 2 (2026-11-23)

Input: the findings of the 4 round-2 QA agents (`r2-long`, `r2-tablet-touch`, `r2-visual`, `r2-review`; reports in
`docs/qa/r2-<agent>.md`, screenshots in `docs/qa/shots/r2-<agent>/`), plus 8 leftovers from the decided phase (requests the
r2-hand-wait / r2-save agents could not apply in their own files; L-1 … L-8 below).

`$SP` = the QA session's scratch directory (not in the repository). Each agent's tools, runs
and full-size shots are in `$SP/<agent>/`. Ports: the agents ran on 5183 (r2-long), 5184 (r2-tablet-touch), 5185 (r2-visual),
5186 (r2-review); use your own assigned port. Scripts that take a URL: pass yours. `$SP/r2-tablet-touch/lib.mjs` reads
`BASE=http://localhost:PORT/TS_playfield/` from the environment; `t12-dialogs.mjs` and `t13-region.mjs` hard-code 5184 (copy them
and change the port). `$SP/r2-visual/qa.mjs` takes `--url`. Every Playwright run: `source scripts/pw-env.sh` in the same command.

## Summary

* 20 findings → **18 unique** after merging 2 duplicates: the reveal dock over the scoring sheet (r2-long #2 + r2-tablet-touch F1)
  and Chernobyl's Undo play cut off the tablet slip (r2-tablet-touch F7 + r2-visual V5). The leftover contract request
  (`incompatibleSave.reason`) is merged into R-018 (the same defect as r2-visual V2). The leftover `ui:slip.ai.stillThinking` cleanup
  is R-005. That makes **19 items**.
* Each item was checked against the code it names: `stageStore.ts` `onRoll` l.388 and `OrdersSlip.tsx` `useAiPlay` l.544 (any
  `country_id` is taken as the target, while `diceAnchor` already limits it to COUP / REALIGNMENT / WAR_EVENT); `Stage.tsx` paints
  `RevealDock` after `ScoringSheet` and the dock's `pos` only changes in `onCountry`; `locations.ts` l.40 (UNSEEN → deck);
  `MapView.tsx` l.136-140 (the plate popover is reset only on `[targets, regionTargets]`); `OrdersSlip.module.css` l.396 (the
  coarse-pointer 44 px rules are scoped to `.compact`); `Button.tsx` l.60 (the `<kbd>` is always rendered);
  `card_text.json` #73 (`text_en` lacks the final-scoring clause that `text_zh` has); `controller.ts` l.584 (`savedAt: 0` for an
  unreadable save) and l.596 (`if (!this.wroteSave) return true`); `turnAr.ts` vs `GameOverTelex.tsx` l.86;
  `CountryTooltip.tsx` l.87 vs the engine's `free_action::coup_earns_no_military_ops`; `bonusHints` (influence only);
  `Hand.tsx` (`focusCard` is served only from the hand's own order); `zh-CN/ui_shell.json` `dock.log` "记录". I also looked at
  two screenshots (the 1920 sheet under the dock, the zh tablet spines). **None is rejected.** Two parts of findings are not
  routed: the crumb's card-name ellipsis in R-012 is the recorded §8.1 "Fit" design, and the coup prompt strings in R-015 are
  printed by no surface (D-202).
* Routed: **F1 5**, **F2 3**, **F3 8**, **F4 3**. **No blockers.** Severities are as filed: 5 major, 11 minor, 3 polish.
  **Owner decisions: none.** No finding needs a product choice, and the contract changes are additive requests for the
  coordinator. **Deferred: 3.** None of them is filed above polish; D-202 and D-203 are side parts of R-015 and R-003.
* Contract requests (additive, optional; exact text under "For the integrator"): `CoupOdds.milOps?` (R-002) and
  `incompatibleSave.reason?` (R-018).

### Index

| Id | Group | Sev | Title | Sources |
|---|---|---|---|---|
| R-001 | F1 | major | English card text omits clauses printed on the card (#6, #35, #73, #87, #100, #103) | r2-visual V1 |
| R-002 | F1 | major | Free event coups show "Mil ops +2/+3" that are never credited (Junta, Tear Down); Che's 3 not shown | r2-review R2R-1 |
| R-003 | F1 | minor | After one refused save write a tab ignores other tabs (two live copies, older tab wins) | r2-review R2R-4 |
| R-004 | F1 | minor | A Defectors-cancelled AI headline also flies deck → discard | r2-long #1 |
| R-005 | F1 | polish | `ui:slip.ai.stillThinking` unused; i18n.md lacks the three new AI-wait keys | leftover L-2 |
| R-006 | F2 | major | The AI's pinned reveal dock covers the scoring sheet (sheets docked right) and the space dice result | r2-long #2, r2-tablet-touch F1 |
| R-007 | F2 | major | AI space-race plays name a country ("SPACE RACE → NORWAY") in the dock and the slip | r2-long #3 |
| R-008 | F2 | major | A region plate's "if scored now" popover outlives its prompt, covers drawers / sheets / play-mode, can't be closed | r2-tablet-touch F5 |
| R-009 | F3 | minor | Tablet: Chernobyl's region buttons push Undo play off the slip (not tappable) | r2-tablet-touch F7, r2-visual V5 |
| R-010 | F3 | minor | iPad landscape (tablet layout, coarse pointer): most controls below 44 × 44 px | r2-tablet-touch F3 |
| R-011 | F3 | minor | Touch screens still show key caps (↵, Z, T, Space, I/C/R/E/S, Esc) | r2-tablet-touch F6 |
| R-012 | F3 | minor | Tablet touch: slip titles cut after two lines, the rest only in a hover `title` | r2-tablet-touch F4 |
| R-013 | F3 | minor | Tablet zh: long names on hand spines end in a deformed glyph ("我们在德黑羊", "红色恐慌 太") | r2-visual V3 |
| R-014 | F3 | minor | Mid-round game end: slip head + console "End of turn N", telex "Turn N · AR M" | r2-visual V4 |
| R-015 | F3 | minor | China Card / Vietnam Revolts realign: "5/5 rolls left" drops to 3 with no hint; unstaged coup crumb shows the max Ops | r2-review R2R-3 |
| R-016 | F3 | polish | Esc / Back to hand after the China Card: focus on the slip, not the China Card | r2-review R2R-2 |
| R-017 | F4 | minor | Tablet: the Dispatches flyout covers the hand's right end, China Card and piles; no outside tap closes a flyout | r2-tablet-touch F2 |
| R-018 | F4 | minor | A tampered / corrupted save is reported as "made with another version of the engine or AI" | r2-visual V2, leftover L-5 |
| R-019 | F4 | polish | Wording: zh dock "记录" for the log (glossary 电报); en "Font licence" next to "licenses" | r2-visual V6 |

---

## F1 — engine side (game, ai, data, dev, runner/state, catalogs except the six ui_* ones, tools, scripts)

### R-001 (major) English card text in the zoom / card sheet omits clauses printed on the card image (#73, #35, #100, #103, #87, #6)
* Sources: r2-visual V1. Files: `game_resources/card_text.json` (`text_en`, the source of `src/data/cards.ts`), regenerate with
  `tools/gen-data.mjs`; `tests/i18n` or `tests/game` for a regression check. Display only: `src/ui/cards/CardDetails.tsx` needs no change.
* Repro: shell demo `src/ui/screens/demo/index.html?scene=prompt-headline&lang=en` at 1440×900: focus Shuttle Diplomacy (#73) in the
  hand, press Space (probe `node $SP/r2-visual/probe.mjs <url> 1440 p2/zoom73.mjs`). Compare the text panel with the card image.
  Data: compare `src/data/cards.ts` `text.en` with `text.zh` and `public/cards/en/NNN.webp` for 6, 35, 73, 87, 100, 103.
* Expected: the panel ("Text shown is the current errata") says what the English image and the zh text say, which is what the
  engine does (`vendor/DeepStruggle/engine/src/scoring.cpp:49-51, 336-341`).
* Actual: `text_en` is DeepStruggle's `rules/cards.json` wording:
  * #73 lacks "Does not count for Final Scoring at the end of Turn 10" and has the typo "which ever".
  * #35 lacks "or during Final Scoring at the end of Turn 10. Taiwan is not a Battleground country for any other game purpose".
  * #100 lacks "(without Final Scoring Phase)".
  * #103 lacks "(unless played on the Space Race)".
  * #87 lacks "Improves effect of 'Glasnost' event".
  * #6 lacks "cancels Formosan Resolution if played by the US".
  
  The zh text matched the zh images on all 10 sampled cards.
* Evidence: `docs/qa/shots/r2-visual/v1-zoom-73-en.jpg`, `docs/qa/shots/r2-visual/v1-en-card-images-errata.jpg`.
* Fix: rewrite `text_en` of the six cards from the English images (wording as printed, current errata; keep the existing
  punctuation conventions) and regenerate. r2-visual's follow-up scan of all 110 cards (zh notes, cross-references,
  final-scoring and space-race clauses) found only these six. Add a test that pins the six clauses so a regeneration from
  DeepStruggle's text can't drop them again. Note `docs/notes/map-i18n-assets.md` §6 risk 1 as resolved in `docs/handoff/i18n.md`.

### R-002 (major) Free event coups show "Mil ops +2 / +3" that the engine never credits (Junta #47, Tear Down This Wall #96); Che's (#107) credited mil ops are not shown
* Sources: r2-review R2R-1. Files: `src/game/previews.ts` (`computeCoupOdds`), `tests/game`. Contract request (below):
  `CoupOdds.milOps?`. F3 part: `src/ui/prompts/CountryTooltip.tsx` l.87.
* Repro (Node, repo root): `node $SP/r2-review/tools/freecoup.mjs 3` (real engine; it moves Junta / Tear Down This Wall into the human's hand
  with a debug call, plays the Event, takes the free Coup, and compares `computeCoupOdds().ops` with the `mil_ops` change of a
  real coup step); Che: `node $SP/r2-review/tools/che.mjs`. In the app: play Junta as Event, place the 2 influence, choose Coup,
  hover a Latin-American target (any viewport / language).
* Expected: no "Mil ops" line for a coup that earns none (`free_action::coup_earns_no_military_ops`: Junta and Tear Down This Wall
  event-granted Ops, Ortega); "Mil ops +3" for Che's coups, which the engine credits.
* Actual: 7 of 7 free coups (Junta USSR ×3, US ×1, Tear Down ×3) are `coup-target` prompts (`resolving_card` 0 once the event
  grants its Ops) with `ops` 2 / 3. The tooltip prints "Mil ops +2 / +3" ("军事行动 +2"), but `mil_ops` stays 0. The 4 control
  coups (ordinary Ops) are right. Che's coup is an `event-target` prompt, so no line is shown, while the engine credits 3.
  A player who trusts the line misses the turn-end military-ops requirement and loses VP.
* Evidence: `freecoup.mjs` / `che.mjs` output; `docs/qa/r2-review.md` R2R-1.
* Fix: in `computeCoupOdds`, read the coup's credited mil ops from the probe step it already runs (`mil_ops` of the phasing side
  after − before, die face 1; or the engine rule above), and return it as `milOps` (0 for free event coups). Regression test over
  the freecoup / che cases (Junta, Tear Down This Wall, Che, Ortega, one ordinary coup, the China Card outside Asia).
* Cross-group (F3, integrator): in `CountryTooltip.tsx` `CoupSection` print `ui:tip.milops` with `odds.milOps` whenever
  `odds?.milOps` is defined and > 0, for `coup-target` **and** event coups (`EVENT_COUP_CARDS`). Keep today's rule only when
  `milOps` is undefined.

### R-003 (minor) After one refused save write (storage full), a tab ignores other tabs: two live copies, then the older tab overwrites the newer resumed game
* Sources: r2-review R2R-4. Files: `src/game/controller.ts` (`ownsSave` l.595-599, `save()` l.652 `this.wroteSave = written`), `tests/game`.
* Repro (Node, repo root): `SEED=6 node $SP/r2-review/tools/quota.mjs`, then `SEED=9 …`. It runs two real controllers on a shared
  `MemoryStorage` whose `setItem` throws `QuotaExceededError` while it is full. Tab A plays; storage fills; A plays 3–6 steps;
  storage frees; tab B boots and resumes; A answers its open prompt.
* Expected (Q-002): B's resume (a claim with writer B) supersedes A; one live copy; B's game goes on.
* Actual (both seeds): A is not superseded and keeps its prompt; A's next move is written with writer A, which supersedes B and
  discards B's resumed game; in between both tabs take moves (B can replay a decision whose outcome A showed).
* Evidence: `quota.mjs` output (SEED 6, 9); `docs/qa/r2-review.md` R2R-4.
* Fix: keep "this page's claim was stored" (set by the first successful write of a game; reset by `newGame` / `resume`) and use
  it in `ownsSave()` instead of the last write's result: once a claim of this page was stored, a stored save with another writer
  means another tab took over, whether or not the latest write went through. Test with the quota scenario.
* Note: in this condition `browserStorage()`'s probe write also fails at load and the page runs with no storage and no notice.
  That part is deferred as D-203.

### R-004 (minor) A Defectors-cancelled AI headline card flies to the discard pile from the draw deck
* Sources: r2-long #1. Files: `src/ui/runner/locations.ts` (`flightFor`, l.40 UNSEEN → `deck` unless it is `aiPlayCard`),
  `src/ui/runner/FlightLayer.tsx`; read-only reference `src/ui/stage/model.ts` `cancelledHeadline` (F2's helper, l.292); `tests/ui/runner`.
* Repro: dev `?ai=policy`, seed 3, human US; turn-1 headlines US Defectors vs USSR Vietnam Revolts (cancelled). (a) 1920×1080
  fast: `node $SP/r2-long/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side US --until end --game-seed 3 --w 1920
  --h 1080 --lang en --watch --qa-out <out>.json` (the flight recorder logs card 9 `pile:deck → pile:discard`). (b) 1440×900
  normal: `FP_ANSWER=1 FP_SHOT_CONT=1 node $SP/r2-long/tools/flightprobe.mjs http://localhost:PORT/TS_playfield/ 3 US
  "v.prompt.kind==='headline'" <outDir> 1440 900 normal 9 en`.
* Expected: the cancelled paper gets its CANCELLED stamp and slides to the discard pile (it does); nothing else moves.
* Actual: ~250 ms after the paper reaches the pile, a small face-up Vietnam Revolts starts on the draw deck (x 1040, y 755,
  inside the deck pile's rect) and arcs into the discard (290 ms at normal speed): it reads as "a card was drawn and discarded".
  The event is `card-moved 9 UNSEEN → DISCARD_PILE`. A known AI card in the same spot (G1 T7, Sadat Expels Soviets) flew from the
  adversary dossier, as it should.
* Evidence: `docs/qa/shots/r2-long/f-cancelled-headline-flies-from-deck.jpg`; `$SP/r2-long/runs/fp-def.json`.
* Fix: in a frame that carries the headline reveal, skip the flight of the card that the headline papers already move (the
  cancelled headline: the papers fold it into the pile). Detect it from the frame's events, as `cancelledHeadline` does (import
  it, or a runner-side twin). Also check the mirror case (the AI US plays Defectors and the human USSR's headline is
  cancelled): the paper must stay the only animation. Add a runner test with the seed-3 turn-1 frame.

### R-005 (polish) `ui:slip.ai.stillThinking` is no longer used; `docs/handoff/i18n.md` doesn't list the three new AI-wait keys
* Sources: leftover L-2 (r2-hand-wait). Files: `tools/ui-keys.mjs` (l.86), regenerated `src/i18n/locales/{en,zh-CN}/ui.json`
  (the en-XA pseudo-locale too, if generated), `tests/i18n/ui-keys.test.ts`, `docs/handoff/i18n.md`.
* Expected: no dead keys. The slip now uses `ui_prompts:ai.stillThinking` / `ai.stillThinkingSlow` / `ai.slowHint`
  (`OrdersSlip.tsx` l.601, `aiWait.ts`).
* Fix: remove `slip.ai.stillThinking` from the generator and regenerate. Update the test that names it. In i18n.md list the
  three `ui_prompts` keys, their en / zh text, and that they belong to F3's catalog.

---

## F2 — map + stage

### R-006 (major) The AI's pinned reveal dock covers the scoring sheet whenever the sheet docks right (AI plays Europe, Africa, Central or South America Scoring), and the result line of an AI space-race dice tray
* Sources: r2-long #2, r2-tablet-touch F1. Files: `src/ui/stage/stageStore.ts` (dock `pos`, only flipped in `onCountry` l.374;
  the scoring beat), `src/ui/stage/ScoringSheet.tsx` / `src/ui/stage/model.ts` (`pickSheetSide`), `src/ui/stage/Stage.tsx`
  (paint order: `RevealDock` after `ScoringSheet`), `src/ui/stage/RevealDock.module.css` (`.slot` right 64 px),
  `src/ui/stage/DiceTray.tsx` (the `avoid` list), `tests/ui/stage`.
* Repro:
  * 1280×720 en, normal speed, dev `?ai=policy`: `FP_ANSWER=1 FP_SHOT_CONT=1 FP_CONT_WAIT=600 node $SP/r2-long/tools/flightprobe.mjs
    http://localhost:PORT/TS_playfield/ 24 US "st.turn===3 && st.action_round===1 && v.prompt.kind==='action-card'" <outDir> 1280 720
    normal 2 en`. The USSR AI plays Europe Scoring at T3 AR2.
  * 1920×1080: the same with seed 3 and `"st.turn===5 && st.action_round===5 && v.prompt.kind==='action-card'"`. The AI plays
    Africa Scoring at T5 AR6.
  * Tablet 1024×768 touch, USSR, seed 3: `BASE=http://localhost:PORT/TS_playfield/ node $SP/r2-tablet-touch/t7-scoring.mjs 1024 768 en 3
    USSR 4`. The US AI plays Europe Scoring at T2 AR2, South America at T4 AR7 and Central America at T4 AR8.
  * 1366×768: `… t7-scoring.mjs 1366 768 en 3 USSR 2`.
  * The beat watcher logged the overlap in all four full r2-long games, including G5 at 1600×900 zh (Europe at T5).
* Expected: while the sheet waits for Continue, its whole table is readable: the US | USSR headers, the status chips, every row.
  This already works for the human's own scoring plays and for sheets docked left.
* Actual:
  * 1280×720: the sheet is at 444–964 × 74–509 and the dock at 728–928 × 92–349, painted above it. The dock hides the column
    headers, the status chips and the values of Status / Countries / Battlegrounds / Adjacent / Status VP. Only "Total 5 / 10"
    and the net bar can be read.
  * 1920×1080: the dock hides the headers, the card number, the chips and half of the Countries row.
  * Tablet: the dock (200×257 at 700, 88) sits wholly inside the sheet (520×449 at 416, 70) and hides both number columns.
  * Smaller, same cause: an AI space-race dice tray at the console's space track slides under the dock ("Roll 5 · needs (" at
    1536×864; the same in G5 zh).
* Evidence: `docs/qa/shots/r2-long/f-dock-covers-scoring-sheet-1280.jpg`, `…/f-dock-covers-scoring-sheet-1920-crop.jpg`,
  `docs/qa/shots/r2-tablet-touch/f1-scoring-sheet-under-reveal-dock-1024.jpg`; `$SP/r2-long/runs/G5.json` (watch.geo);
  `$SP/r2-tablet-touch/t7-1024x768-en-USSR-3.json`, `t7-1366x768-en-USSR-3.json`.
* Fix (F2's choice):
  * Preferred: when a scoring sheet opens while an AI dock is pinned on the side the sheet takes, move the dock to `pos: "left"`,
    as `onCountry` does for a covered country.
  * Alternative: collapse the dock into its pile while the sheet is up. The sheet's subtitle already names the play: "The
    Soviet Union played Africa Scoring".
  * Either way the sheet must never be under the dock. Also add the dock's rect to `DiceTray`'s `avoid` list, or move the dock as
    above while a space roll shows.
  * Record the behaviour as an as-built note for §9.5 / §10.2 (integrator).
  * Test: a right-docked sheet plus a pinned dock never overlap (model or store test), and a space roll's tray avoids the dock.

### R-007 (major) Every AI space-race play names a target country ("SPACE RACE → NORWAY") in the reveal dock and the slip crumb
* Sources: r2-long #3. Files: `src/ui/stage/stageStore.ts` `onRoll` l.388 (sets `dock.country` from any `country_id` in 0–83),
  `src/ui/stage/model.ts` (`diceAnchor` already limits the country to COUP / REALIGNMENT / WAR_EVENT), `tests/ui/stage`.
  F3 part: `src/ui/prompts/OrdersSlip.tsx` `useAiPlay` `offRoll` l.544.
* Repro:
  * (a) 1536×864 en, normal speed: `QA_READY_MS=90000 node $SP/r2-long/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side
    USSR --until 5 --game-seed 16 --w 1536 --h 864 --lang en --speed normal --watch --watch-shots --qa-out <out>.json`. At T1 AR4 the
    US AI plays Decolonization for the space race.
  * (b) 1440×900 en, normal speed: `FP_ANSWER=1 FP_MS=14000 node $SP/r2-long/tools/flightprobe.mjs http://localhost:PORT/TS_playfield/ 3 US
    "st.turn===4 && st.action_round===6 && v.prompt.kind==='action-card'" <outDir> 1440 900 normal 70 en`. At T4 AR7 the USSR AI plays
    OAS Founded for the space race.
  * (c) zh: `node $SP/r2-long/tools/dockcheck.mjs $SP/r2-long/runs/G5.json` flags all 4 of the AI's space plays (seed 13, US,
    1600×900 zh).
* Expected: dock "SPACE RACE · 1 OP"; slip crumb "OAS Founded › Space race". A space attempt has no country.
* Actual: once the die rolls, the dock reads "SOVIET UNION PLAYS · OAS FOUNDED · SPACE RACE → NORWAY · 1 OP" and the crumb reads
  "OAS Founded › Space race → Norway". In zh: "太空竞赛 → 英国 / 挪威 / 瑞典". The engine's SPACE_RACE roll record carries the
  space box in `country_id` (the log reads it correctly as `box`). The announcer is not affected.
* Evidence: `docs/qa/shots/r2-long/f-space-race-target-norway.jpg`; `$SP/r2-long/runs/fp-space.json`.
* Fix: export a helper from `model.ts`, e.g. `rollCountry(roll): number | null`, which returns the country only for COUP /
  REALIGNMENT / WAR_EVENT and only for ids 0–83. Use it in `diceAnchor` and `onRoll`. Test with a SPACE_RACE roll
  (`country_id` 2) → no dock country.
* Cross-group (F3, integrator): in `useAiPlay`'s `offRoll`, use the same helper (OrdersSlip already imports from `../stage`):
  `const c = rollCountry(beat.roll); if (c !== null) setPlay(…)`. Today any `c >= 0` is taken, 255 included.

### R-008 (major) A region plate's "if scored now" popover outlives its prompt, sits above the hand drawer, the card sheet and the play-mode stage, and a tap on it does not close it
* Sources: r2-tablet-touch F5. Files: `src/ui/map/MapView.tsx` (the reset effect l.136-140 is keyed on `[targets, regionTargets]`;
  the `tipAnchor` effect l.630-636 re-measures only on `[tipId, plateTip, settled]`), `src/ui/map/MapTooltipHost.tsx`, `tests/map`.
* Repro: dev, touch, `BASE=http://localhost:PORT/TS_playfield/ node $SP/r2-tablet-touch/t8-plate.mjs 1024 768 en 3 USSR 0` and
  `… t8-plate.mjs 360 740 zh 1 USSR 0`.
  1. At the headline prompt, tap the Europe plate. On the phone, close the auto-opened hand drawer first.
  2. Pick the headline and play on to the first action-card prompt.
  3. Tap a card.
* Expected: the popover is transient. It closes when the prompt changes (as a tapped country tooltip does since Q-020) and when
  a sheet / drawer / the play-mode stage opens. A tap on it, or a tap outside it, closes it. It re-anchors (or closes) on
  resize / rotation.
* Actual: the popover (z 80) stays open through the headline papers, the AI's frames and the next prompt, on top of everything.
  * Tablet: it covers the console's AR / DEFCON readouts and the play-mode title.
  * Phone: it covers the drawer's first card, then the card sheet's event text.
  * A tap on it does nothing, and the sea that would close it is underneath.
  * After a rotation it is still open and anchored to a stale position (plate at x −24, y −41).
* Evidence: `docs/qa/shots/r2-tablet-touch/f5-plate-popover-over-drawer-and-card-sheet-360-zh.jpg`,
  `…/f5-plate-popover-over-playmode-1024-and-rotated.jpg`; `$SP/r2-tablet-touch/t8-1024x768-en.json`, `t8-360x740-zh.json`;
  first seen in `$SP/r2-tablet-touch/t3-1024.log` step S5.
* Fix:
  * Reset `plateTip` (and a touch-pinned tooltip) on every prompt change: key the effect on the prompt id / kind, not only on
    the target arrays. Also reset it when the map stops being the active surface: an AI frame starts, or the play-mode stage,
    the hand drawer or the card sheet opens. MapView may need an `interactive` / `covered` prop. If the shell has to pass one,
    the GameScreen wiring is an F4 one-liner for the integrator.
  * Close it on a tap on the popover itself (touch).
  * Re-measure the anchor on resize / layout change, or close it then.
  * Test: a plate tip opened at a headline prompt is gone at the next prompt.

---

## F3 — prompts + tray + cards + common

### R-009 (minor) Tablet: on the Chernobyl region prompt, Undo play is pushed out of the slip and below the screen
* Sources: r2-tablet-touch F7, r2-visual V5. Files: `src/ui/prompts/RegionChoice.tsx`, `src/ui/prompts/OrdersSlip.module.css`
  (tablet slip 126 px, `overflow: hidden`; the region grid + footer need 141 px), `tests/ui/prompts`.
* Repro: shell demo `src/ui/screens/demo/index.html?scene=prompt-region&lang=en` (and `zh`) at 1024×768, mouse or touch, and
  1100×700. Probes: `$SP/r2-tablet-touch/t13-region.mjs` (six sizes; edit its port), `t12-dialogs.mjs 1024 768 en`,
  `node $SP/r2-visual/probe.mjs <url> 1024 p2/slipfoot.mjs`.
* Expected: every slip control visible and tappable; on a touch tablet, Undo play is the only way to take Chernobyl back.
* Actual: the six region buttons (88×24, 3 × 2) fill the slip. Undo play sits at y 749–775 (slip bottom 760, viewport 768); only
  its top 11 px show, and its centre hit-tests to the tray (1024×768 en / zh, 1100×700 zh). At 1280×720 / 1366×768 it loses 3 px
  but stays tappable; at 1440 it fits. The round-1 matrix (`region-1024-en`) shows the same clip.
* Evidence: `docs/qa/shots/r2-tablet-touch/f7-chernobyl-undo-off-slip-1024.jpg`, `docs/qa/shots/r2-visual/v5-region-undo-cut-1024.jpg`.
* Fix: on short slips put Undo beside the region grid or in the head row, or use one row of six short buttons ("C. America" style,
  as compact). Check 1024×768, 1100×700, 1280×720, 1366×768 in en / zh / en-XA. With R-010 the buttons get a 44 px hit area on
  coarse pointers, which must not overlap Undo's.

### R-010 (minor) iPad landscape (tablet layout, coarse pointer): most controls are below 44 × 44 px
* Sources: r2-tablet-touch F3. Files (F3): `src/ui/prompts/OrdersSlip.module.css` (l.396: the Q-048 rules are scoped to
  `.compact`), `src/ui/prompts/PlayModeStage.module.css`, `src/ui/tray/Piles.module.css`, the region buttons (with R-009),
  `tests/ui/prompts`. F4 part: `src/ui/console/Console.module.css`, `src/ui/rail/Rail.module.css`. F2 part: `src/ui/map/MapView.module.css`.
* Repro: dev 1024×768 touch (`(pointer: coarse)` and `(hover: none)` match): `BASE=… node $SP/r2-tablet-touch/t1-tablet.mjs`,
  `t5-kinds.mjs 1024 768 en 3 USSR 4`, `t5-kinds.mjs 1024 768 en 13 US 3`, `t6-tablet-hand.mjs` (`smallTargets()` measures hit
  areas with `elementFromPoint`, so `::after` expansions count). Phones: `t12-dialogs.mjs 360 740 zh` (scene `prompt-op-mode`).
* Expected: ui-spec §12 and §3.3 as built (Q-048). On coarse pointers, touch targets are ≥ 44 px, or have an invisible 44 px hit
  area where the control must stay small visually.
* Actual (hit areas):
  * console lang / settings / menu: 32×32
  * zoom + − ⤢: 30×30
  * rail strip: 42×42
  * flyout ×: 28×28
  * slip Undo play: 104×26
  * List: 54×26
  * Commit headline: 142×30
  * slip Continue: 103×26
  * play-mode Back to hand: 114×26
  * piles: 76×34
  * Chernobyl buttons: 88×24
  * Phones: the play-mode sheet's Back to hand is 94×26 (360×740, 768×1024).
* Evidence: `$SP/r2-tablet-touch/t1-1024x768-en.json` (audit-setup), `t5-1024x768-en-USSR-3.json`, `t5-1024x768-en-US-13.json`,
  `t12-360x740-zh.json`; `docs/qa/shots/r2-tablet-touch/f4-tablet-slip-titles-cut-1024.jpg`.
* Fix: invisible 44 px hit areas (`::after`, negative inset, as the theatre chips / dossier ×) under `@media (pointer: coarse)` for
  the tablet slip's buttons, the play-mode Back to hand (tablet and compact), the piles and the region buttons. The tablet slip
  keeps its height. Neighbouring hit areas must not overlap: split the gap.
* Cross-group (integrator):
  * F4: the console's lang / settings / menu buttons and the rail strip buttons get the same coarse-pointer hit areas. The
    flyout × is part of R-017.
  * F2: the map zoom buttons get them too.

### R-011 (minor) Touch screens still show keyboard key caps on buttons (↵, Z, T, Space, I / C / R / E / S, Esc)
* Sources: r2-tablet-touch F6. Files: `src/ui/common/Button.tsx` (l.60 renders `kbd` always), `src/ui/prompts/PlayModeStage.tsx`
  (l.114 row letters), `src/ui/prompts/RegionChoice.tsx` (l.47 ↵), `tests/ui/common`, `tests/ui/prompts`. Covered by the Button
  change: `OrdersSlip.tsx`, `dialogParts.tsx`, `HandPromptBar.tsx`, `ScoringSheet.tsx`, `HeadlinePapers.tsx`.
* Repro:
  * Phone 360×740 zh, seed 1, USSR (`BASE=… node $SP/r2-tablet-touch/t9-final.mjs`): at the setup prompt, tap a target on the
    last point. The slip shows "在波兰放置 ↵" and "撤销本次出牌 Z".
  * Tablet 1024×768 en, seed 3 (`t5-kinds.mjs`, `t6-tablet-hand.mjs`):
    * slip: UNDO PLAY Z, LIST T, COMMIT HEADLINE ↵, CONTINUE Space, SKIP Space
    * play-mode: INFLUENCE I, COUP C, REALIGN R, EVENT FIRST E, SPACE RACE S, BACK TO HAND Esc
    * headline papers and scoring sheet: CONTINUE Space
* Expected: ui-spec §3.3 as built (Q-032): on touch screens no key hints.
* Actual: every `Button kbd=…` still renders its `<kbd>` when `useTouchUi()` is true.
* Evidence: `docs/qa/shots/r2-tablet-touch/f6-key-caps-on-phone-slip-360-zh.jpg`, `…/f4-tablet-slip-titles-cut-1024.jpg`;
  `$SP/r2-tablet-touch/t6-1024x768-en.json`.
* Fix:
  * `Button` renders `kbd` only when `!useTouchUi()`. Keep `aria-keyshortcuts`: it is harmless for screen readers.
  * Apply the same rule to the play-mode row letters and RegionChoice's ↵.
  * Check that layouts that reserved room for the cap don't leave a gap.
  * F4 (integrator, check only): `src/ui/screens/Menu.tsx` l.88 renders menu key caps too; hide them on touch the same way.

### R-012 (minor) Tablet touch: slip titles are cut after two lines and the rest is only in a hover `title`
* Sources: r2-tablet-touch F4. Files: `src/ui/prompts/OrdersSlip.module.css` (`.title` 2-line clamp l.88-94; `.tablet` rules),
  `src/ui/prompts/OrdersSlip.tsx`, `tests/ui/prompts`.
* Repro: dev 1024×768 touch: `BASE=… node $SP/r2-tablet-touch/t5-kinds.mjs 1024 768 en 3 USSR 4` and `… 13 US 3`. Both collect
  every clipped slip text (`allCuts`).
* Expected: the prompt's question is readable on a touch screen. The §8.1 "Fit" rule ("full text as a `title` tooltip") relies
  on hover, which touch screens don't have; §12 requires hover-only information to be reachable by long-press or focus.
* Actual:
  * Cut titles:
    * "PLACE YOUR STARTING INFLUENCE IN EASTERN…"
    * "DECOLONIZATION: ADD 1 USSR INFLUENCE TO A COUNTRY IN…"
    * "COMECON: … NON-US-CONT…" (three lines hidden)
    * "UN INTERVENTION: CHOOSE AN OPPONENT'S CARD TO PLAY FOR…"
    * Socialist Governments, Liberation Theology, Marshall Plan and East European Unrest the same way
  * On UN Intervention a third of the slip is empty under the title.
* Evidence: `docs/qa/shots/r2-tablet-touch/f4-tablet-slip-titles-cut-1024.jpg`; `$SP/r2-tablet-touch/t5-1024x768-en-USSR-3.json`,
  `t5-1024x768-en-US-13.json`.
* Fix:
  * Give the title a third (and fourth) line when the body has room, as Q-033 did for the side column, e.g. with
    `useFitLines` or when there is no hint / ops row.
  * On touch, a tap on the title (or crumb) toggles the full text in place. A `button`-like element with `aria-expanded`
    satisfies §12.
  * Not a finding: the crumb's card-name ellipsis ("US/Japan Mutual Defense Pact" 142 px in 126) is the recorded §8.1 design. It
    may share the tap-to-expand if cheap.

### R-013 (minor) Tablet, Chinese: long card names on the hand spines end in a deformed glyph instead of "…" ("我们在德黑羊", "红色恐慌 太")
* Sources: r2-visual V3. Files: `src/ui/cards/cards.module.css` (`.spine` l.85-111, `.small .spine`, the `:lang(zh)` rules),
  `src/ui/cards/CardFace.tsx`, optionally `src/ui/tray/trayModel.ts` (`spineOf`), `tests/ui/cards`, `tests/ui/tray`.
* Repro: shell demo `src/ui/screens/demo/index.html?scene=prompt-headline&lang=zh` at 1024×768 (tablet, 86 px cards); also
  `?variant=committed&lang=zh` and `?scene=prompt-coup-target&lang=zh` (限制战略武器谈判). Probe: `DSF=3 SHOTDIR=<dir> node
  $SP/r2-visual/probe.mjs '<url>' 1024 p2/spinezoom.mjs`.
* Expected: a name too long for the band ends in a clear "…" (ui-tray.md), as English does ("COLONIAL REAR GUAR…").
* Actual: 我们在德黑兰的人 reads 我们在德黑羊 (兰 merged with the clipped ellipsis); 红色恐慌/大清洗 reads 红色恐慌 太 (the "/" turned
  sideways into a gap, a stray dot on 大). `scrollHeight` 98–99 vs `clientHeight` 98: the ellipsis is drawn over the last glyph.
  Seen at DSF 1, 2, 3, 6, in three scenes and in the audit matrix (`aiwait-1024-zh`). Desktop widths and English are fine.
* Evidence: `docs/qa/shots/r2-visual/v3-tablet-zh-spines-cut.jpg` (I confirmed both glyphs).
* Fix: for CJK, cut the name in JS to whole characters that fit the band, plus "…" (measure with the same font). If that is too
  costly, leave at least one full em before the ellipsis. Use a full-width "／" (or `text-combine-upright` / upright orientation)
  for the slash in vertical text. Test with the two names at 86 px cards.

### R-014 (minor) A game that ends inside an action round reads "End of turn N" in the slip head and the console, while the telex says "Turn N · AR M" (Q-031 follow-up)
* Sources: r2-visual V4. Files: `src/ui/common/turnAr.ts` (`displayTurnAr`: any phase other than ACTION_ROUND → "end"), used by
  `src/ui/prompts/labels.ts` `ordersHead` and `src/ui/console/model.ts` `arModel` (no change needed there), `tests/ui/common`.
* Repro: shell demo `src/ui/screens/demo/index.html?scene=seq-over-vp20&start=end&lang=en` (or `zh`) at 1440×900; also
  `seq-over-defcon`. Read the telex "Ended" line, press Review board, read the slip head and the console. Probes
  `$SP/r2-visual/p2/turnar.mjs`, `p2/turnar2.mjs`.
* Expected: one answer everywhere. The US reached 20 VP in AR 2 of turn 5 (the telex agrees; the console's AR pips 1–2 are lit).
* Actual:
  * 20 VP: telex "ENDED Turn 5 · AR 2" / "结束于 第 5 回合 · 第 2 行动轮"; slip "Orders · End of turn 5" / "指令 · 第 5 回合结束";
    console "END OF TURN 5".
  * DEFCON: telex "Turn 4 · AR 7"; slip and console "End of turn 4".
  * Resignation, held scoring and mil-ops endings are consistent.
* Evidence: `docs/qa/shots/r2-visual/v4-gameover-end-of-turn.jpg`.
* Fix: in `displayTurnAr`, phase GAME_OVER with `ending.turn === state.turn` and `1 ≤ action_round ≤ lastActionRound(state)` →
  `{ phase: "ar", … }`, exactly the telex's `inRound` rule (`GameOverTelex.tsx` l.86-88). Tests for the five endings.
* Cross-group (F2, optional, integrator): let the telex call `displayTurnAr` instead of its own copy, so the rule lives in one place.

### R-015 (minor) China Card realignment (and Vietnam Revolts): "5/5 rolls left" drops to 3 after one roll outside Asia with no hint; the unstaged coup crumb shows the maximum Ops
* Sources: r2-review R2R-3. Files: `src/ui/prompts/OrdersSlip.tsx` (`bonusHints` l.178: influence only; `PromptHint` for
  `realign-target` and `coup-target`), `src/ui/prompts/labels.ts` (crumb "Coup · N Ops"), the `ui_prompts` catalogs (en, zh-CN),
  `tests/ui/prompts`.
* Repro:
  * UI: `node $SP/r2-review/tools/china-realign-ui.mjs http://localhost:PORT/TS_playfield/ en <shot.jpg>` (dev
    `?ai=policy&seed=1`, 1440×900, USSR, T1 AR1: China Card → Realign, then one roll in Iran).
  * Node, 4 more games: `node $SP/r2-review/tools/chinarealign.mjs`.
  * Coup Ops: `node $SP/r2-review/tools/chinacrumb.mjs` and `vietnam.mjs`.
* Expected: the realign slip carries the same conditional-bonus hint as influence runs since Q-037. So does the coup slip:
  before a target is staged, it shows the bonus hint and does not promise the maximum.
* Actual:
  * Realign, before the roll: "The China Card › Realign · 5 Ops · 5/5 ROLLS LEFT", with no hint.
  * After one roll in Iran: "· 4 Ops · 3/5 ROLLS LEFT". Two rolls vanish unexplained (rules-correct). All 4 Node games went
    5 → 3 after a roll in Canada or Israel.
  * Coup: the unstaged crumb reads "Coup · 5 Ops". A coup outside Asia gets 4 (Vietnam Revolts: 3 for a 3-Op card outside
    SE Asia).
* Evidence: `docs/qa/shots/r2-review/r2r3-china-realign-3-of-5.jpg`; tool outputs; `docs/qa/r2-review.md` R2R-3.
* Fix:
  * `bonusHints` also for `realign-target` and `coup-target`. Realign gets new `ui_prompts` keys in en + zh, e.g.
    `hint.asiaBonusRealign` "The China Card gives one more roll only if every roll is in Asia." /
    "仅当每次掷骰都在亚洲时，中国牌才多给一次掷骰。", and the SE Asia twin for Vietnam Revolts. Coup can reuse the influence
    wording, or add a coup twin.
  * Lead the realign / coup hint with it, as for influence.
  * In the unstaged coup crumb, drop the Ops (or show the base value) when a conditional bonus applies. The staged crumb
    already shows the right Ops from `CoupOdds`.
  * Glossary: 中国牌, 行动点.
* Not routed: the `prompt:title.coup` / `prompt:detail.coup` strings built from `pending_ops_value`. No surface prints them
  (D-202).

### R-016 (polish) Esc / Back to hand after playing the China Card puts focus on the orders slip, not on the China Card
* Sources: r2-review R2R-2. Files: `src/ui/tray/ChinaSlot.tsx` (no `focusCard` effect), `src/ui/tray/Hand.tsx` (serves only its
  own `order`), `src/ui/prompts/PlayModeStage.tsx` (`backToHand`), `tests/ui/tray`.
* Repro: `node $SP/r2-review/tools/esc-china.mjs http://localhost:PORT/TS_playfield/ 1 1440 900`, then `… 3 1024 768` (dev, en,
  USSR, fast, no reveal pauses). At the action-card prompt, click the China Card. Press Esc on the play-mode stage. Sample
  `document.activeElement` at 0.1 / 0.4 / 1 / 3.5 s. Repeat with a hand card, then with the China Card at the next round.
* Expected (round-2 item 4): focus on the returned card, i.e. the China Card button (`[data-card="6"]` in the China slot).
* Actual: all 4 China Card cases → `section[aria-label=Orders]` at every sample. Hand cards are focused as designed. The card-6
  request waits out `FOCUS_TIMEOUT_MS` and is dropped.
* Evidence: `$SP/r2-review/esc-china-run1.log`, `esc-china-run2.log`.
* Fix: `ChinaSlot` serves `focusCard === 6` the same way `Hand` does: focus once it is back and playable, then clear the request.
  Alternatively, the tray resolves any request through the `card:<id>` anchor. Test next to the Hand one.

---

## F4 — console + rail + shell + theme

### R-017 (minor) Tablet: the Dispatches flyout covers the hand's right end, the China Card and the piles, and no outside tap closes a flyout
* Sources: r2-tablet-touch F2. Files: `src/ui/screens/GameScreen.tsx` (flyout host inside `main#ts-map`, which spans the tray rows;
  `flyout` state l.142), `src/ui/screens/GameScreen.module.css` (`.flyoutHost` l.65), `src/ui/rail/Rail.module.css`
  (`.flyout[data-panel="log"] { bottom: 8px }` l.473, `.flyoutClose` 28 px l.479), `src/ui/rail/RailFlyout.tsx`, `tests/ui/rail`,
  `tests/ui/shell`.
* Repro: dev 1024×768 touch: `BASE=… node $SP/r2-tablet-touch/t6-tablet-hand.mjs` (step flyoverTray), `t1-tablet.mjs` (step
  railStrip), `t18-flyout.mjs` (zh, US, seed 13). Tap the rail strip's Dispatches, then tap the map, the slip, a hand card or the console.
* Expected: the flyout sits over the map's right edge (ui-spec §3.2); on touch (no Esc) a tap outside closes it.
* Actual: the log flyout (320×698 at 636, 62; z 60 over the tray's z 15) covers The Cambridge Five, the China Card slot and both
  piles 100 % and Decolonization 84 %. Taps on the sea, slip, an uncovered card or the console leave every flyout open (8 / 8);
  only the strip button or the 28×28 × close it.
* Evidence: `docs/qa/shots/r2-tablet-touch/f2-log-flyout-over-tray-1024.jpg`; `$SP/r2-tablet-touch/t6-1024x768-en.json`,
  `t1-1024x768-en.json`.
* Fix:
  * End the flyout above the tray: the host's bottom = the tray row's height, for every panel.
  * Close the open flyout on a `pointerdown` outside it and outside the strip. The tap that closes it may also act on what it
    hit; don't swallow it.
  * Give the × (and the strip buttons, R-010's F4 part) a 44 px hit area under `(pointer: coarse)`.
  * Record it in §3.2 as built (integrator).

### R-018 (minor) A tampered or corrupted save is reported as "made with another version of the engine or AI"
* Sources: r2-visual V2; leftover L-5 (r2-save's contract request). Files: `src/ui/screens/StartScreen.tsx` (l.91-97),
  `src/ui/App.tsx` (l.120, `resume()` refused), the `ui_shell` catalogs (en, zh-CN), `tests/ui/shell`. Contract request (below):
  `incompatibleSave.reason?`. F1 part: `src/game/controller.ts` `readResumable` l.583-588.
* Repro: live app, any viewport: set `localStorage['ts-playfield.game.v1'] = 'TSP2:AAAAbogusbogusbogus'` (or change one character
  of a real v2 save) and reload. Script: `node $SP/r2-visual/qa.mjs --url http://localhost:PORT/TS_playfield/ --only incompat`.
* Expected: the toast says the saved game could not be read (changed or damaged) and was discarded.
* Actual: en "Your saved game was made with another version of the engine or AI and cannot be resumed." / zh
  "已保存的对局来自其他版本的引擎或 AI，无法继续。" All 24 cells of the incompat state show it. `App.tsx:120` shows the same
  string when `resume()` refuses an unreadable save.
* Evidence: `docs/qa/shots/r2-visual/v2-tampered-save-toast.jpg`.
* Fix:
  * New key `ui_shell:error.saveUnreadable`. en: "Your saved game could not be read (it was changed or damaged) and was
    discarded." zh: "无法读取已保存的对局（已被修改或损坏），已将其删除。"
  * StartScreen shows it when `incompatibleSave.reason === "unreadable"`. Until the contract field lands, also when `reason` is
    absent and `savedAt === 0`, the controller's current convention (l.584). Otherwise keep `ui:error.saveIncompatible`.
  * App's `resume()` failure toast uses `saveUnreadable`. After boot, a refused resume is a save that can't be replayed; an
    other-build save was already discarded at boot.
  * Tests for both toasts.
* Cross-group (F1, integrator, after the contract change): `readResumable` sets `{ savedAt: 0, reason: "unreadable" }` and
  `{ savedAt: save.savedAt, reason: "build" }`; document it in `docs/handoff/logic.md` "Save format v2".

### R-019 (polish) Wording consistency: the zh dock labels the log "记录" (glossary and mockup: 电报); en About says "Font licence" next to "licenses"
* Sources: r2-visual V6. Files: `src/i18n/locales/zh-CN/ui_shell.json` (`dock.label` "手牌、对手、记录与状态", `dock.log`,
  `dock.logAria_other` "记录：{{count}} 条新电报", `ticker.open` "打开记录"), `src/i18n/locales/en/ui_shell.json` (`about.oflLink`).
* Repro: `src/ui/screens/demo/index.html?scene=prompt-influence&lang=zh` at 390×844 (bottom dock); About in en.
* Expected: the approved `docs/design/shots/final-phone-zh.png` and the glossary (`ui:log.title`) say 电报. English uses
  "license" (`ui:start.credits` "Credits & licenses", `ui:about.licenses` "Third-party licenses").
* Actual: 记录 in the dock, its label and the ticker; "Font licence (OFL)".
* Evidence: `docs/qa/shots/r2-visual/v6-zh-dock-log-label.jpg`.
* Fix: 记录 → 电报 in the four zh strings ("手牌、对手、电报与状态", "电报：{{count}} 条新电报" or "{{count}} 条新电报",
  "打开电报"); en "Font license (OFL)". Check the 360 px dock label fits. It has 2 characters, like before.

---

## Owner decisions

None this round. Every item has a fix that follows the spec, the glossary or the engine; the two contract changes are
additive requests for the coordinator.

---

## Deferred

| Id | Item | Reason |
|---|---|---|
| D-201 | Compact: Esc / close on the play-mode sheet returns focus to the sheet's opener, not to the card in the hand drawer (leftover L-4, "shell (optional)") | Deferred, polish. Its author marked it optional. Focus lands on a sensible element (not `<body>`). A fix needs both the shell, which reopens the drawer when `focusCard` is pending (F4), and `HandDrawer`, which serves the request (F3, as R-016 does for the China slot). Revisit with a keyboard pass at 200 % zoom (compact landscape). |
| D-202 | `prompt:title.coup` / `prompt:detail.coup` state `pending_ops_value` ("(5 Ops)", "Roll + 5 Ops must beat …") for the China Card / Vietnam Revolts, while a coup outside Asia / SE Asia gets 1 less (r2-review R2R-3, "Related, coups") | Deferred, latent. No surface prints these strings: the slip uses `ui:slip.verb.coup` / `ui:slip.hint.coup-target`, and the staged crumb uses `CoupOdds.ops`. R-015 fixes the visible part, the unstaged crumb. If a surface ever prints `title` / `detail`, F1 rewords them as "up to N Ops" (`src/game/prompt.ts`, `prompt.json`). |
| D-203 | When storage refuses writes (blocked, or a full `chenao-phys.github.io` origin shared with other Pages projects, D-001), `browserStorage()`'s probe write fails at load and the page plays with no autosave and no notice (r2-review R2R-4, "Likelihood") | Deferred, not a regression. Round 1 (qa-prod-perf) judged blocked storage handled: the game plays and nothing breaks. A one-time "this game can't be saved in this browser" toast is a small F1 + F4 addition worth doing with the deploy pass; R-003 fixes the actual two-tab defect. |

**Rejected:** none. Every finding matched the code it names, and I looked at two of the screenshots (the dock over the 1920 Africa
sheet; the zh tablet spines). Two parts were set aside, not rejected: the crumb's card-name ellipsis (R-012, recorded §8.1 design)
and the unprinted coup strings (D-202).

---

## For the integrator: coordinator-owned and cross-group changes

### Contract requests (`src/game/contract.ts`, additive, optional)

1. **R-002**: in `interface CoupOdds`, after `modifier?: number;`:
   ```ts
     /** Military operations the coup credits to the coup's side: 0 for a free event coup (Junta, Tear Down This Wall, Ortega),
      *  the Ops for any other coup, Che's included. Optional (R-002). */
     milOps?: number;
   ```
2. **R-018** (r2-save's request, L-5): in `interface ViewModel` (contract.ts l.266-267) replace
   ```ts
     incompatibleSave?: { savedAt: number };
   ```
   with
   ```ts
     /** At boot, an unfinished save that cannot be resumed was found and discarded; set until a game starts (Q-014).
      *  `reason`: "build" = written by another engine build; "unreadable" = changed or damaged (`savedAt` is 0 then). */
     incompatibleSave?: { savedAt: number; reason?: "build" | "unreadable" };
   ```

### Cross-group parts (apply after the groups)

* R-002 F3: `CountryTooltip.tsx` prints `odds.milOps` for coup-target and event coups.
* R-007 F3: `OrdersSlip.tsx` `useAiPlay` `offRoll` uses F2's `rollCountry`.
* R-008 F4 (only if F2 needs it): GameScreen passes MapView a "map covered / not interactive" prop.
* R-010 F4: 44 px coarse-pointer hit areas for the console's lang / settings / menu buttons and the rail strip.
* R-010 F2: 44 px coarse-pointer hit areas for the map zoom buttons.
* R-011 F4 (check): `Menu.tsx` key caps on touch.
* R-014 F2 (optional): the telex uses `displayTurnAr`.
* R-018 F1: `readResumable` sets `reason`; logic.md.
* ui-spec as-built notes for R-006 (§9.5 / §10.2 dock vs sheet), R-010 (§3.3 / §12 coarse-pointer targets on tablets), R-011 (§3.3
  key caps), R-012 (§8.1 touch titles), R-017 (§3.2 flyout bounds and outside tap).

### Leftovers from the decided phase (L-1 … L-8)

| Id | Leftover | Routing |
|---|---|---|
| L-1 | ui-spec as-built notes. §7.2: every card the next one covers by ≥ 12 % wears a spine (its name vertically in the side's tone, above the Ops badge); hover, focus and staging show the caption; no smaller cards. §9.5: "still thinking" shows the elapsed seconds from 8 s; past 20 s, once per page session, the slow-device sentence follows (a toast on tablet slips). §8.2: the one exception to "activations are ignored while a frame animates" is a map tap during your own placement frame, queued for the next prompt when unambiguous. | **Integrator** (coordinator-owned `docs/design/ui-spec.md`). Apply as surgical "As built (QA round 2)" notes. |
| L-2 | `ui:slip.ai.stillThinking` unused; i18n.md should list the three new keys | **F1 → R-005.** |
| L-3 | FYI: the app writes the non-sensitive sessionStorage flag `ts-playfield.aiSlowHint` = "1" after the slow-device hint | **No change.** About (`ui_shell:about.save`) names no storage keys, and the flag holds no personal data. Mention it in `docs/handoff/ui-shell.md` §10 if that section lists storage keys. |
| L-4 | Shell (optional): compact Esc / close on the play-mode sheet focuses the opener, not the card in the hand drawer | **Deferred → D-201.** |
| L-5 | Optional contract change `incompatibleSave.reason` + `ui:error.saveUnreadable` | **Merged into R-018** (F4 primary, contract request 2, F1 part). The key moves to the F4-owned `ui_shell` catalog as `ui_shell:error.saveUnreadable`, so no `ui.json` change is needed. |
| L-6 | `docs/ARCHITECTURE.md` Persistence row → localStorage `ts-playfield.game.v1` = "TSP2:" + base64url(XOR keystream over CRC-32 + UTF-8 JSON {v:2, fingerprint, modelSha256, search, seed, humanSide, steps, autoFlags, …}); a v1 plain-JSON save is read and migrated; a tampered or corrupted save is reported as `incompatibleSave` and discarded; obfuscation only (About says so); details in `docs/handoff/logic.md` "Save format v2" | **Integrator** (coordinator-owned doc). Apply verbatim; after R-018, add "(`reason: "unreadable"`)". |
| L-7 | QA tools: the map's country-name fill now computes to `color(srgb …)` (a color-mix); round 1's `contrast.mjs` reads only `rgb()` and skips those names | **Integrator / next QA round.** When re-checking contrast (Q-021 regression), parse `color(srgb r g b)` as fractions × 255, as `$SP/r2-save/mapcontrast.mjs` does. No product change. Note: r2-visual's "no low-contrast text" covers solid backgrounds only, not the map names. |
| L-8 | Heads-up: r2-save added two expects to `tests/ui/shell/shell.test.ts` (the About test checks the save line) | **FYI, keep them.** F4 owns `tests/ui/shell`. F4 and the integrator must keep the two expects when they edit the file (R-018 adds its toast tests there). |
