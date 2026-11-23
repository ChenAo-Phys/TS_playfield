# QA triage, round 1 (2026-11-22)

Input: the findings of 7 QA agents (`qa-long-desktop`, `qa-long-phone`, `qa-visual`, `qa-hidden-info`, `qa-rules-flow`,
`qa-a11y`, `qa-prod-perf`; reports in `docs/qa/<agent>.md`, screenshots in `docs/qa/shots/<agent>/`), plus the known
items from the prep phase and the coordinator (K-001…K-004).

`$SP` = the QA session's scratch directory (not in the repository). Each agent's tools,
runs and full-size shots are in `$SP/<agent>/` (e.g. `$SP/qa-long-desktop/tools/qa-play.mjs`). Scripts that take a URL
were run on each agent's own dev port (5183 desktop, 5186 hidden-info, 5187 rules-flow): use your assigned port.

## Summary

* 68 findings → **60 unique** after merging 8 duplicates (Missile Envy flag ×3, console VP readout ×2, compact-landscape
  target list ×2, turn/AR past the end ×2, two tabs ×2, Defectors cancellation ×2, game-ending log entries ×2).
* Every finding was checked against the code it names (and the screenshots where given). **None is rejected**: each one
  is a real defect or a real UI misreport of what the engine did. No item contradicts a recorded deviation; where a
  deviation is close (theatre chip follows the camera, hand drawer auto-opens, double-tap zoom), the fix keeps it.
* Routed: **F1 17** (incl. K-002, K-003), **F2 9**, **F3 16**, **F4 18** (incl. K-001). Owner decisions: **3**.
  Deferred: **3** (incl. K-004).
* **No blockers.** Severity changes: `qa-hidden-info` F1 (coup odds) and F2 (two tabs) were filed as blockers → **major**
  (both are real hidden-information/consistency failures, but neither affects honest play, and the coup-odds leak only
  tells the human that the AI is about to lose under the held-scoring rule, which the human can't change).
* Filed as owner decisions but routed as fixes (no real choice for the owner): two-tab overwrite (Q-002), engine-update
  save notice (Q-014), telex "VP before the ruling" label (Q-022).

### Index

| Id | Group | Sev | Title | Sources |
|---|---|---|---|---|
| Q-001 | F1 | major | Coup-odds dice leak the AI's held scoring card | qa-hidden-info |
| Q-002 | F1 | major | Two live tabs: next die / AI reply preview, silent save overwrite | qa-hidden-info, qa-prod-perf |
| Q-003 | F1 | major | Defectors' headline cancellation misreported (stage + log) | qa-long-desktop, qa-rules-flow |
| Q-004 | F1 | major | Forced AI card choices from its hand are instant (timing leak) | qa-hidden-info |
| Q-005 | F1 | major | Failed ORT wasm download reported as "no WebAssembly" | qa-prod-perf |
| Q-006 | F1 | minor | Missile Envy: raw engine flag in the log, no In-effect chip | qa-long-desktop, qa-visual, qa-rules-flow |
| Q-007 | F1 | minor | Game-ending steps: wrong / missing "End of turn" entries | qa-long-desktop, qa-rules-flow |
| Q-008 | F1 | minor | Game-over log line doesn't say who won | qa-visual |
| Q-009 | F1 | minor | LADC: the USSR's double step shows the US's decline hint | qa-rules-flow |
| Q-010 | F1 | minor | AI model / worker failure blamed on the rules engine | qa-prod-perf |
| Q-011 | F1 | minor | Anchor registry keeps every old game's DOM alive | qa-prod-perf |
| Q-012 | F1 | minor | Licence notices not shipped; onnxruntime-web not credited | qa-prod-perf |
| K-002 | F1 | minor | endsPlay true before the CMC cancel window | coordinator |
| K-003 | F1 | minor | English card images: errata overlays (#42, #98, #109, #110) | coordinator |
| Q-013 | F1 | polish | Slow first visit: "Start AI" stalls at 95 %; wrong MB in the note | qa-prod-perf |
| Q-014 | F1 | polish | Engine update hides an unfinished game without a notice | qa-prod-perf |
| Q-015 | F1 | polish | play.mjs driver: dialog / plate selectors | qa-long-desktop, qa-long-phone |
| Q-016 | F2 | major | Final scoring sheet leaves out the China Card VP | qa-long-desktop |
| Q-017 | F2 | major | Two quick taps on a target: one point + 2× zoom | qa-long-phone |
| Q-018 | F2 | major | Dice tray off screen / over the slip column | qa-visual |
| Q-019 | F2 | minor | Capped (20 VP) scoring: net contradicts the table | qa-long-desktop |
| Q-020 | F2 | minor | Phone: country tooltip can't be dismissed | qa-long-phone |
| Q-021 | F2 | minor | Map plate / sea texts below WCAG AA | qa-a11y |
| Q-022 | F2 | polish | Telex "VP before the ruling" after every ending | qa-long-desktop |
| Q-023 | F2 | polish | Shuttle Diplomacy's adjustment not shown on the sheet | qa-long-desktop |
| Q-024 | F2 | polish | zh VP-chart aria-label has no separators | qa-long-desktop |
| Q-025 | F3 | major | DEFCON dossier says "you lose" when DEFCON 1 wins | qa-rules-flow |
| Q-026 | F3 | major | Play-mode: S stages Space, Enter plays the Event | qa-a11y |
| Q-027 | F3 | major | Target list: active row resets after each placement | qa-a11y |
| Q-028 | F3 | major | Phone: hand drawer hides the question and its decline (Blockade) | qa-long-phone |
| Q-029 | F3 | major | Compact landscape / 200 %: play-mode options + card sheet Play below the fold | qa-visual |
| Q-030 | F3 | minor | Compact landscape / 200 %: target list unreachable | qa-long-phone, qa-visual |
| Q-031 | F3 | minor | Turn / AR readouts past the end ("Turn 11 · AR 0", "AR 9") | qa-long-phone, qa-visual |
| Q-032 | F3 | minor | Phones show mouse / keyboard instructions | qa-long-phone |
| Q-033 | F3 | minor | Landscape slip cuts title, hint, card name | qa-long-phone |
| Q-034 | F3 | minor | Chernobyl region buttons cut on compact | qa-visual |
| Q-035 | F3 | minor | Phones (en): "INFLUENCE" button label cut | qa-visual |
| Q-036 | F3 | minor | Grain Sales + opponent card: wrong Event-row text | qa-rules-flow |
| Q-037 | F3 | minor | Vietnam Revolts' conditional +1 unexplained | qa-rules-flow |
| Q-038 | F3 | minor | Coup tooltip formula / mil ops use the prompt's Ops | qa-rules-flow |
| Q-039 | F3 | minor | Olympic boycott win not shown in the dossier; slip warning clipped | qa-rules-flow |
| Q-040 | F3 | polish | Portrait tablet: pile viewer in two fixed columns | qa-visual |
| Q-041 | F4 | major | Compact console VP readout / dock label ellipsized ("苏联…1") | qa-long-phone, qa-visual |
| Q-042 | F4 | major | Landscape iPhone: left/right safe areas ignored | qa-long-phone |
| Q-043 | F4 | major | Focus falls to `<body>` after most dialogs / choices | qa-a11y |
| Q-044 | F4 | major | "Skip to map" does nothing | qa-a11y |
| Q-045 | F4 | major | AI-play announcer only on the open desktop rail | qa-a11y |
| Q-046 | F4 | major | ☰ menu not keyboard operable | qa-a11y |
| Q-047 | F4 | minor | Portrait: tapped theatre chip ≠ lit chip | qa-long-phone |
| Q-048 | F4 | minor | Phone touch targets below 44 × 44 px | qa-long-phone |
| Q-049 | F4 | minor | Dispatches: one Tab stop per reference | qa-a11y |
| Q-050 | F4 | minor | AI-play announcements omit outcomes | qa-a11y |
| Q-051 | F4 | minor | Start screen: first Tab lands in the hidden backdrop map | qa-a11y |
| K-001 | F4 | minor | BootLine Retry re-runs boot(); ui-shell.md refresh | coordinator |
| Q-052 | F4 | polish | Boot error: side folders still look enabled | qa-visual |
| Q-053 | F4 | polish | Accessible names: plurals, zh wordmark | qa-visual |
| Q-054 | F4 | polish | Camera keys + − 0 only inside the map | qa-a11y |
| Q-055 | F4 | polish | Failed game-chunk download: double toast | qa-prod-perf |
| Q-056 | F4 | polish | Offline switch to Chinese: silent, unhandled rejection | qa-prod-perf |
| Q-057 | F4 | polish | No favicon, no Open Graph tags | qa-prod-perf |

---

## F1 — engine side (game, ai, data, runner/state, catalogs except the six ui_* ones, tools, scripts)

### Q-001 (major; filed blocker) Coup-odds dice say "ends the game" when the AI holds a scoring card at the turn's last action
* Sources: qa-hidden-info. Files: `src/game/previews.ts` (computeCoupOdds ~l.479), `tests/game`.
* Repro: dev, 1440×900 en, US, `?ai=policy&seed=8`: `source scripts/pw-env.sh && node $SP/qa-hidden-info/tools/coup-boom.mjs http://localhost:PORT/TS_playfield/ 8 <shotsDir>`.
  It plays to the US coup at T1 AR6 (last action of the turn: Defectors 2 Ops, DEFCON 4, the USSR has 1 card left), hovers
  Syria ("fail fail ok ok ok ok"), then swaps one AI card for Europe Scoring (#2) (debug edit, same hand size) and hovers Iraq:
  "boom" ×6. Without debug edits: `node $SP/qa-hidden-info/tools/node-probes.mjs 30 both` (repo root) finds games 8 and 18.
* Expected: `endsGame` only for public endings (`PUBLIC_ENDINGS`: DEFCON, Wargames, VP 20…), never for the turn-end
  held-scoring / final-scoring checks, which depend on the AI's hand. `attachPreviews` already filters these; logic.md and
  the previews.ts header promise it.
* Actual: `endsGame: E.isTerminal()` on the unredacted engine → all six dice hazard-striped (aria "Die: N, ends the game").
* Evidence: `docs/qa/shots/qa-hidden-info/coup-odds-held-scoring-s8.jpg`; `$SP/qa-hidden-info/node-probes-1.json`, `node-probes-2.json` (A1), `node-warn-1.json`.
* Fix: classify the terminal state as `endingsOf` does (reason ∈ `PUBLIC_ENDINGS`) before setting `endsGame`; audit the other
  `E.isTerminal()` uses in previews.ts (l.147, 169, 203). Regression test with the debug hand swap.

### Q-002 (major; filed blocker / minor + owner) Two live tabs on one save: preview the next die and AI reply, and silent overwrites
* Sources: qa-hidden-info, qa-prod-perf. Files: `src/game/persistence.ts`, `src/game/controller.ts`; F4 part `src/ui/App.tsx`.
* Repro: (a) dev 1440×900 en: `node $SP/qa-hidden-info/tools/two-tabs.mjs http://localhost:PORT/TS_playfield/ 21 USSR`, then
  `node $SP/qa-hidden-info/tools/two-tabs-2.mjs http://localhost:PORT/TS_playfield/ 5 US`. By hand: coup-target prompt in tab A;
  open tab B, Resume, coup, note the die; back in tab A (still live) choose. (b) production preview, one profile:
  `$SP/qa-prod-perf/tools/r-tabs.mjs`: A new game USSR to T1 AR2; B Resume; play in A then B; in B Menu › New game › US (save
  has 1 step); one move in A → the save is A's game again, B plays unsaved.
* Expected: one live copy of a game. When another tab resumes / starts / writes the save, the older tab stops taking moves
  and says "This game continued in another tab" (Reload).
* Actual: seed 21: B rolled 3 on country 0, A then rolled 3 on country 1; seed 5: B 6 on 22, A 6 on 23; the save holds A's
  coup ([5,23,0,0]) and no trace of B's. Last writer wins silently. No storage listener, BroadcastChannel or navigator.locks in src.
* Evidence: RESULT lines of `two-tabs.mjs` / `two-tabs-2.mjs` (`$SP/qa-hidden-info`); `docs/qa/qa-hidden-info.md` F2;
  `$SP/qa-prod-perf/out/r-tabs.log`, `r-tabs2.log`.
* Fix: `StorageLike` gains an optional `subscribe(cb)` (browserStorage: `storage` event on the save key, or a
  BroadcastChannel); the controller notes its own writes (tab id or step count) and, when another tab writes the save,
  marks itself superseded: no more moves, AI drive stopped, no more writes. Resume and New game write the save at once so
  other tabs notice. Also re-check on `pageshow` with `persisted` (bfcache). **Contract (coordinator, additive optional):**
  `ViewModel.superseded?: boolean`. **F4 part:** a blocking notice with Reload (new `ui_shell` keys en + zh). Undo stays
  restricted to the unchanged rng_state (ARCHITECTURE "Undo"); this closes the no-tools way around it. Reading the save
  in DevTools is OD-1.

### Q-003 (major) Defectors' cancellation of the USSR headline is misreported (stage "1ST", no CANCELLED stamp, no log line)
* Sources: qa-long-desktop, qa-rules-flow. Files: `src/game/controller.ts` (`headlineStarts`), `src/game/describe.ts`,
  `log` / `prompt` catalogs en + zh, `tests/game/helpers.ts`; check `src/ui/stage/model.ts` (`cancelledHeadline`).
* Repro: (a) `node $SP/qa-long-desktop/tools/papers.mjs http://localhost:PORT/TS_playfield/ $SP/qa-long-desktop/runs/papers 30 1 en`
  (US, seed 30, 1440×900): T1 US Defectors (2 Ops) vs USSR De Gaulle Leads France (3 Ops); same game T9 Defectors vs SALT
  Negotiations. (b) Node: `$SP/qa-rules-flow/harvest2/g107b.test.ts` with G=107 T=2 (US human headlines Five Year Plan, USSR
  headlines Indo-Pakistani War, the random discard is Defectors).
* Expected: the USSR paper gets the CANCELLED stamp and slides to discard (ui-spec §10.1), as at T5 of the same game
  (Defectors vs South America Scoring: "2ND · CANCELLED"); the log says the USSR headline was cancelled by Defectors (both routes).
* Actual: (a) "DE GAULLE LEADS FRANCE · 1ST", no stamp; caption "3 VS 2 OPS · SOVIET UNION RESOLVES FIRST"; the reveal dock
  shows the USSR headline, then nothing happens. T9: SALT "resolves" but DEFCON does not improve. `headlineStarts` emits
  `card-played` for the cancelled `headline_first_card`, which defeats `cancelledHeadline()`. (b) log: "… USSR discards
  Defectors (#103) at random (Five Year Plan) — a US event, so its event fires / Five Year Plan discarded / Indo-Pakistani War
  (#24) discarded"; the revealed headline never resolves; `drive()` in tests/game/helpers.ts reports "frame 114: 1
  headline(s) never announced as played".
* Evidence: `docs/qa/shots/qa-long-desktop/f3-defectors-not-cancelled.jpg` (log at the right: "Resolution Order: 1st USSR…",
  then only "discarded"); frames seq 18/19 and 114/115 in `$SP/qa-long-desktop/runs/C.json`; Node log of `$SP/qa-rules-flow/harvest2/g107b.test.ts`.
* Fix: detect the cancellation (the USSR headline leaves for the discard in the headline phase without its event) and emit
  no `card-played` for it; add a log line (new key, e.g. `log:session.headlineCancelled`, en + zh) on both routes; let
  `drive()` accept Defectors from a random discard. **F2 check:** with no `card-played`, `cancelledHeadline()` should stamp
  CANCELLED; if route (b) needs a stage beat for the stamp, that is an F2 leftover.

### Q-004 (major) Forced AI card choices from its hidden hand are instant (Quagmire / Bear Trap escape, UN Intervention pairing)
* Sources: qa-hidden-info. Files: `src/game/controller.ts` (drive ~l.531-543), `src/game/rules.ts` (`TIMING_PADDED_CARDS`), `src/ai/config.ts`.
* Repro: repo root: `node $SP/qa-hidden-info/tools/node-probes.mjs 30 both` (real controller, tests' random AI; records sleeps;
  probe A2 lists forced AI SELECT_CARD steps). Two identical runs.
* Expected: every forced AI decision whose legal set comes from the AI's unseen hand looks like a real one: aiThinking on, `paddingMs()`.
* Actual: only {10, 49, 95} are padded. Game 1 (AI US in Quagmire): escapes at T5 AR6 / AR7 had one legal card each, instant.
  Games 19 (AI US) and 28 (AI USSR): the UN Intervention pairing had one legal card, instant. The rail goes waiting → playing
  with no THINKING and no 600 ms minimum: the human learns every other AI card is 1-Op/scoring, or that the AI holds no other
  card carrying the human's Event.
* Evidence: `$SP/qa-hidden-info/node-probes-1.json`, `node-probes-2.json` (`a2.forcedHandDependent`); controller.ts drive(), rules.ts:21.
* Fix: pad every forced AI SELECT_CARD whose candidates come from the AI's hand (trapped action round under QUAGMIRE /
  BEAR_TRAP, UN Intervention pairing, plus 10/49/95); leave public sets unpadded (Star Wars / SALT discard picks, Aldrich Ames).
  Node test over the probe's cases.

### Q-005 (major) A failed onnxruntime WebAssembly download is reported as "This browser cannot run WebAssembly"
* Sources: qa-prod-perf. Files: `src/ai/model.ts` (~l.100), `src/ai/index.ts`; F4 part `src/ui/screens/BootLine.tsx`.
* Repro: production build on vite preview, 1440×900 en, fresh profile, abort `assets/ort-wasm-simd-threaded-*.wasm`
  (context.route): `node $SP/qa-prod-perf/tools/r-fail.mjs ortwasm`. Twice.
* Expected: the boot line names an AI download / start-up failure (`ui:error.worker` or `ui:error.modelDownload`) with Retry.
* Actual: "THIS BROWSER CANNOT RUN WEBASSEMBLY, WHICH THE GAME NEEDS." + details "…does not support WebAssembly SIMD … Safari
  (16.4 or later)" in a current Chromium; Retry fixes it. `Model.create` rewrites any InferenceSession error matching /SIMD/i,
  and ORT's network error names `ort-wasm-simd-threaded-*.wasm`.
* Evidence: `docs/qa/shots/qa-prod-perf/boot-errors-wrong-cause.jpg` (row 1); `$SP/qa-prod-perf/out/r-fail.log`, `r-fail2.log`, `fail-ortwasm.png`.
* Fix: rewrite to the SIMD message only when `!supportsWasmSimd()`; give that error a stable marker (prefix / name carried in
  `vm.error`). **F4 part:** `errorKey` tests `/WebAssembly|SIMD/i` on the raw text, which the raw ORT error also matches
  (its file name has "simd"); match the marker instead.

### Q-006 (minor) Missile Envy's obligation shows as the raw engine flag in the log and has no In-effect chip
* Sources: qa-long-desktop, qa-visual, qa-rules-flow. Files: `src/i18n/locales/{en,zh-CN}/effects.json`, `src/data/effects.ts`, `src/game/describe.ts`.
* Repro: (a) game C (US seed 30, T7) or D (USSR seed 38, zh, T10); direct: `node $SP/qa-long-desktop/tools/reach.mjs http://localhost:PORT/TS_playfield/ $SP/qa-long-desktop/runs/ui/envy.jpg 38 USSR "st.flags.includes('MISSILE_ENVY_USSR')" en`.
  (b) `src/ui/screens/demo/index.html?scene=prompt-defcon-level&lang=zh` at 1440×900, Dispatches (T4 headline / AR1), or
  `?scene=seq-ai-event&lang=en`; probe `$SP/qa-visual/p/rawid.mjs`. (c) harvest sig `event-card|prompt:card.49.card|rc49`
  (`$SP/qa-rules-flow` planX-en.json / planX-zh.json items missileenvy-0-USSR, missileenvy-1-US): give the card, read Dispatches.
* Expected: a translated effect name in the log; an In-effect chip while "must play Missile Envy for Ops" stands.
* Actual: "In effect: MISSILE_ENVY_USSR" / "No longer in effect: MISSILE_ENVY_USSR" (zh "生效中：MISSILE_ENVY_USSR",
  "不再生效：…"); no chip. MISSILE_ENVY_US/USSR are the only 2 of the 49 engine flags (bindings/state_json.cpp:591) without
  `effects:<FLAG>.name`; `effectName()` falls back to the flag.
* Evidence: `docs/qa/shots/qa-long-desktop/f7-raw-flag-in-log.jpg`, `docs/qa/shots/qa-visual/f4-raw-effect-id-log-zh.jpg`;
  `$SP/qa-rules-flow` res-X-en.json / res-X-zh.json / res-A-zh.json.
* Fix: names en + zh (card name per cards.json / glossary) and EFFECT_INFO rows (side, CONDITIONAL) so the chip shows; a test
  that every flag the engine can emit has a name or is in `BOOKKEEPING`.

### Q-007 (minor) Game-ending steps: final scoring credited to an Eagle/Bear discard with no "End of turn 10"; a CMC coup logged as "End of turn N"
* Sources: qa-long-desktop, qa-rules-flow. Files: `src/game/controller.ts` (stepLog crossed branch ~l.984-995).
* Repro: (a) `node $SP/qa-long-desktop/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side USSR --until end --game-seed 13 --qa-out $SP/qa-long-desktop/runs/A.json`
  (or `--game-seed 16`), 1440×900 en: the US has the space box-6 perk and discards at the end of turn 10; open Dispatches.
  (b) harvest sig `warn|cmc-suicide|coup-target` (game 16 USSR T6 AR4; game 322 USSR T5 AR2): browser `$SP/qa-rules-flow`
  planW-en.json item warn_cmc_suicide_coup_target-lose-USSR-en (hold the coup); Node `$SP/qa-rules-flow/harvest2/cmc.test.ts`.
* Expected: (a) as in games C/D: "T10 End of turn 10" with the turn-end changes and a final-scoring line carrying the VP
  change, then "Game over". (b) the game ends in that action round; no "End of turn" entry.
* Actual: (a) "AR9 US discards Warsaw Pact Formed (#16) via Eagle / Bear Has Landed … Victory Points: +9 (US) -> +7 (US) (-2
  VP)" (B: "AR8 US discards Marine Barracks Bombing … 0 (Tie) -> -3 (USSR)"), then "T10 Game over"; the step settles straight
  into GAME_OVER, so `crossed` is false. (b) "AR4 USSR attempts Coup in Panama" → "T6 End of turn 6 · Victory Points: −7 (USSR) →
  +20 (US)" → "Game over: US — Coup during the Cuban Missile Crisis" (zh "第 6 回合结束 …"): `endOfTurn` is used whenever
  rawAfter is GAME_OVER.
* Evidence: `$SP/qa-long-desktop/runs/A.json` (ui.logText 601-602); `docs/qa/shots/qa-long-desktop/f1-final-sheet-no-china-B.jpg`
  (log at right); `$SP/qa-rules-flow` res-W-en.json / res-E-en.json / res-E-zh.json finalLog.
* Fix: decide by `ending.reason`: final-scoring → always write the End-of-turn-10 entry (also when the step settles directly
  in GAME_OVER) with a final-scoring line holding the VP change (split the discard's own deltas from the scoring's with
  `ending.vpBefore`); mid-turn endings → no End-of-turn entry. Node tests for both repros.

### Q-008 (minor) Game-over log line doesn't say who won ("Game over: USSR — Resignation (VP 1, turn 2)" reads as "the USSR resigned")
* Sources: qa-visual. Files: `src/i18n/locales/{en,zh-CN}/prompt.json` (`prompt:log.gameOver`), `src/game/controller.ts` (`endLog`).
* Repro: `src/ui/screens/demo/index.html?scene=seq-over-resign&start=end&lang=en` (human US resigned), last Dispatches line;
  zh; also `seq-over-held-scoring` ("VP -20"). Probe `$SP/qa-visual/p/overlog.mjs`.
* Expected: the winner named as winner (DS's own `log:entry.gameOver` says "Winner: {{winner}}"); VP with its side, as other
  log lines ("20 (USSR)").
* Actual: "Game over: {{winner}} — {{reason}} (VP {{vp}}, turn {{turn}})"; zh "游戏结束：苏联——认输（VP 1，第 2 回合）"; raw signed VP.
* Evidence: probe output (en + zh, two fixtures), `$SP/qa-visual`.
* Fix: e.g. "Game over: {{winner}} wins — {{reason}} (VP {{vp}}, turn {{turn}})" + draw variant; zh "游戏结束：{{winner}}获胜——…";
  pass vp as the side-labelled arg the VP log lines use.

### Q-009 (minor) Latin American Debt Crisis: the USSR's "double influence" step shows the US's decline hint
* Sources: qa-rules-flow. Files: `src/game/prompt.ts`, `src/i18n/locales/{en,zh-CN}/prompt.json`.
* Repro: harvest sig `event-target|prompt:card.95.target|rc95` (games 48 and 312, USSR, T8): the US declined, the human USSR
  picks South American countries to double. `$SP/qa-rules-flow` plan items event_target_prompt_card.95.target_rc95-USSR-en/zh. 1440×900.
* Expected: a hint for the USSR's own choice (up to 2 countries, Done to stop early).
* Actual: "Or decline and let the USSR double its influence in 2 South American countries." / "或者拒绝，让苏联把 2 个南美洲国家的苏联影响力翻倍。";
  the event-target branch uses `opt(prompt:card.${rc}.detail)` and picks up card 95's event-card detail.
* Evidence: `$SP/qa-rules-flow` res-A2-en.json / res-A-zh.json slip text.
* Fix: a target-step detail key for 95 (en + zh); audit other event-target prompts that fall back to a detail written for the other side's decision.

### Q-010 (minor) An AI model download or worker load failure says "The rules engine could not be loaded"
* Sources: qa-prod-perf. Files: `src/game/controller.ts` (`ensureAi`), `src/ai/model_fetch.ts`, `src/ai/load.ts`; (UI reads it in `StartScreen.tsx` `useAiReady`).
* Repro: production preview, fresh profile, en: `node $SP/qa-prod-perf/tools/r-fail.mjs onnx` (models/*.onnx and the HF fallback
  blocked); `node $SP/qa-prod-perf/tools/r-fail.mjs worker` (assets/worker-*.js aborted). Twice each.
* Expected: `ui:error.modelDownload` / `ui:error.worker`.
* Actual: both "THE RULES ENGINE COULD NOT BE LOADED." although the engine had loaded (side buttons enabled at ~175 ms). A fast
  failure reports no progress first, so the last stage `useAiReady` saw is still "engine".
* Evidence: `docs/qa/shots/qa-prod-perf/boot-errors-wrong-cause.jpg` (rows 2-3); `$SP/qa-prod-perf/out/r-fail.log`, `r-fail2.log`.
* Fix: report each stage before it starts: `ensureAi` sets `load = {stage:"model-download", fraction:0}` and emits before
  `ai.init`; the loader reports "ai-worker" before creating the worker. No UI change needed. Pairs with K-001.

### Q-011 (minor) The anchor registry keeps detached elements: every finished or abandoned game stays in memory
* Sources: qa-prod-perf. Files: `src/ui/runner/anchors.ts`, `tests/ui/runner`.
* Repro: production preview, 1440×900 en, speed instant: `node $SP/qa-prod-perf/tools/mem.mjs 4 3` or `node $SP/qa-prod-perf/tools/mem2.mjs 3`;
  DOM counters / heap after two GCs on the start screen; heap snapshot via `tools/heapsnap.mjs`.
* Expected: back near boot values (1,668 nodes, 181 listeners, 5.2 MB).
* Actual: nodes 4,816 / 9,084 / 9,640 / 13,409 after games 1-4; listeners 501 → 1,115; heap 9.4 → 12.0 MB; RSS 288 → 581 MB.
  4,632 detached nodes retained via UiRoot `.anchors .ref` closure → `els` Map; one `DIV._game` per old game. The shared ref
  callback prunes with `isConnected` when React passes null, but React 18 detaches refs before removing host nodes.
* Evidence: `$SP/qa-prod-perf/out/mem.log`, `mem2.log`, `heapsnap.log`, `after2games.heapsnapshot`.
* Fix: prune after the commit (`queueMicrotask(() => live(id))`) or one callback per element; test: mount/unmount → registry empty.

### Q-012 (minor) Third-party licence notices are not shipped, and onnxruntime-web is not credited
* Sources: qa-prod-perf. Files: `THIRD_PARTY_LICENSES.md`, `public/`; F4 part `src/ui/screens/AboutDossier.tsx`.
* Repro: `npx vite build --outDir DIR`; `grep -rl 'Permission is hereby granted' DIR`; app › Menu › About & credits.
* Expected: the deployed site carries the MIT / OFL notices of everything it redistributes (DeepStruggle engine + ported code,
  onnxruntime-web wasm + JS, React, i18next, the Emscripten runtime, fonts), reachable from About (`ui:about.licenses` exists).
* Actual: the file is only in the repo root (not in dist/, not linked; the key is unused); onnxruntime-web credited nowhere;
  i18next keeps no notice after minification. fonts/OFL.txt is shipped.
* Evidence: grep over the scratch dist/; the file's sections (DeepStruggle, Fonts, Map data only).
* Fix: add full MIT texts for onnxruntime-web, react / react-dom / scheduler, i18next, the Emscripten runtime (and anything
  else in the bundle); ship as `public/THIRD_PARTY_LICENSES.txt` (copy or generate). **F4 part:** About links it with `ui:about.licenses`.

### K-002 (minor) `endsPlay` is true on the last point of an Event when the Cuban Missile Crisis cancel window opens next
* Sources: coordinator (prep-logic). Files: wherever `endsPlay` is computed (`src/game/prompt.ts` / `previews.ts`), `tests/game`, `docs/handoff/logic.md`.
* Repro: seeds 72 and 126 of the events.test.ts `play` helper (2 of 400 random games): last point of Decolonization / Warsaw
  Pact, then the card-40 event-target prompt for the human in the same play.
* Expected: `endsPlay` false when a human decision follows in the same play. Actual: true → the slip stages "ends your play".
* Evidence: docs/handoff/logic.md ("endsPlay is true on the last point of an Event… Not fixed").
* Fix: treat the human's CMC cancel window as continuing the play; regression test on both seeds; update logic.md.

### K-003 (minor) English card images per the errata: #42 "cancels NORAD"; red "remove from play" line on #98, #109, #110
* Sources: coordinator (prep audit of all 110 images). Files: `scripts/build-cards.mjs` → `public/cards/en/{042,098,109,110}.webp` (never edit game_resources/).
* Expected: CLAUDE.md "original card designs, adjusted to match the errata". Actual: #42 Quagmire lacks "cancels NORAD"; #98
  Aldrich Ames Remix, #109 Yuri and Samantha, #110 AWACS Sale to Saudis lack the red "remove from play" line of the other starred cards.
* Fix: composite a per-card SVG overlay with sharp in the build step, matching the card's typography and the red line of a
  starred card that has it. Look at the results; if an overlay looks worse than the original, don't ship it and report it deferred.

### Q-013 (polish) Slow first visit: "Start AI" sits at 95 % for ~20 s; the note says 5.8 MB when ~10 MB is downloaded
* Sources: qa-prod-perf. Files: `src/ai/load.ts`, `src/ai/worker.ts`, `src/i18n/locales/{en,zh-CN}/ui.json` (via `tools/ui-keys.mjs`).
* Repro: `node $SP/qa-prod-perf/tools/slowboot.mjs` (fresh profile, Pages-like server, 1.6 Mbps / 150 ms, en). Twice + load matrix.
* Expected: progress keeps moving to Ready; the note gives the real size.
* Actual: model 0 → 5.8 MB from 4 s to 33 s; then 95 % "Start AI" from 34 s to 52-55 s while the worker fetches the ORT wasm
  (3.70 MB gzip), which starts only after the model. First visit = 10.2 MB. Side buttons enabled at 3.6 s.
* Evidence: `docs/qa/shots/qa-prod-perf/slow-network-start-ai-stall.jpg`; `$SP/qa-prod-perf/out/load/first-slow-*.json`.
* Fix: the note's size (en + zh) is required; starting the worker / ORT wasm fetch in parallel with the model is optional.

### Q-014 (polish; filed owner) After an engine update an unfinished game disappears from the start screen silently
* Sources: qa-prod-perf. Files: `src/game/controller.ts` (`readResumable`); F4 part `src/ui/screens/StartScreen.tsx`.
* Repro: a real save with another engine fingerprint in localStorage `ts-playfield.game.v1`, reload: `node $SP/qa-prod-perf/tools/r-storage.mjs corrupt` (variant otherEngine). Twice.
* Expected: a notice (`ui:error.saveIncompatible`), then the save is discarded. Actual: no Resume, no notice, the save stays.
* Evidence: `$SP/qa-prod-perf/out/r-storage-corrupt.log`, `r-storage-corrupt2.log`.
* Fix: **contract (coordinator, additive optional):** `ViewModel.incompatibleSave?: { savedAt: number }`, set by
  `readResumable`; the controller clears the save once reported. **F4 part:** the start screen shows the notice once.

### Q-015 (polish) play.mjs driver mis-targets dialogs and Chernobyl plates
* Sources: qa-long-desktop, qa-long-phone (driver notes, not app defects). Files: `src/ui/screens/demo/play.mjs`.
* Repro: game D (T8 SALT discard picker), game F (Our Man in Tehran picker, Star Wars, the Wargames stall) in qa-long-desktop;
  run-us-390 Chernobyl region prompt (T9) in qa-long-phone.
* Expected: the driver answers through the UI a player would use. Actual: `[role=dialog]` `.last()` hits the card zoom (also
  role=dialog) over the picker; `[role=button][data-card=N]` matches a log ref; on compact it looks for `[data-plate]` off camera.
* Evidence: `docs/qa/qa-long-desktop.md` "Notes (not app defects)"; `docs/qa/qa-long-phone.md` "Notes".
* Fix: scope to `[role=dialog][aria-modal=true]`, prefer the open dossier's `[data-card]`; press `button[data-slot]` on compact.

---

## F2 — map + stage

### Q-016 (major) The final scoring sheet leaves out the China Card VP, so its net differs from the VP change
* Sources: qa-long-desktop. Files: `src/ui/stage/stageStore.ts` (~l.520), `src/ui/stage/ScoringSheet.tsx`, `src/ui/stage/model.ts`, ui_stage catalogs.
* Repro: dev 1440×900 en `?ai=policy`: `node $SP/qa-long-desktop/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side USSR --until end --game-seed 13 --qa-out $SP/qa-long-desktop/runs/A.json`;
  final scoring at the end of turn 10. Also seeds 16 (B), 30 (C, `--side US`), 38 (D, zh).
* Expected: net = VP change, with the China Card holder's +1 VP (`Scoring::execute_final_scoring`) as its own row.
* Actual: A rows 30/31, "NET USSR +1", VP US +9 → US +7 (−2). B "NET USSR +2" (0 → −3), C "NET US +2" (+5 → +6), D "净得 苏联 +9"
  (+1 → −7). Net = Σ regions[slot ≤ 5].net. Region rows always match the board.
* Evidence: `docs/qa/shots/qa-long-desktop/f1-final-sheet-no-china-B.jpg`; `$SP/qa-long-desktop/runs/A.verify.txt`.
* Fix: a "China Card +1" row (holder from the state at final scoring; ui_stage key en + zh) included in the net; if the final
  VP is clamped, the Q-019 note. Stage test with a final-scoring fixture.

### Q-017 (major) Two quick taps on a target country place one point and zoom the map 2×
* Sources: qa-long-phone. Files: `src/ui/map/useCamera.ts`, `src/ui/map/MapView.tsx`.
* Repro: `$SP/qa-long-phone/t9-dbl.mjs` (dev `?ai=policy&seed=13`, iPhone 13 profile, touch) at 390×844 zh US and 844×390 en
  USSR (seed=1): at the setup prompt, zoomed so a box is ≥ 80×54 px, tap one ringed country twice 180 ms apart.
* Expected: 2 points placed, camera still. Actual: 1 point and a 2× zoom around the finger (Benelux 0→1, remaining 7→6, zoom
  2.0; Austria likewise; at max zoom 1 point, zoom 1.18-1.25); 450 ms apart works. The second tap becomes the double-tap zoom
  (`onUp` sets dragged=true) and `consumeDrag()` swallows its click. 3× per orientation.
* Evidence: `docs/qa/shots/qa-long-phone/f1-double-tap-390-zh.jpg`, `f1-double-tap-844-en.jpg`; `$SP/qa-long-phone` t9-390x844-zh-US.json, t9-844x390-en-USSR.json.
* Fix: keep §3.3's "double-tap zooms 2×" only where the second tap is not on an active target (sea, non-target box); a tap on a target is always a click.

### Q-018 (major) The dice tray runs off the screen on phones and over the slip column in compact landscape / 200 % zoom
* Sources: qa-visual. Files: `src/ui/stage/DiceTray.tsx`, `src/ui/stage/model.ts`.
* Repro: `src/ui/screens/demo/index.html?scene=seq-ai-coup&speed=normal&lang=zh` (or en) at 390×844 / 360×740 (touch, DPR 2),
  wait for the AI coup on Israel; also 720×450 (1440×900 at 200 %) and 844×390. Probe `$SP/qa-visual/probe.mjs` with `p/dice.mjs`.
* Expected: tray inside the table (placeBeside bounds − 8 px); "1 + 3 Ops − 2×4 = −4" and the result readable; never over the slip (§3.1/§3.4).
* Actual: 390: x 234–453 (63 px off); 360: 204–423; 720×450: 264–483 with the table ending at 420 (over the slip). Maths stops
  at "1 + 3 行动点 −". `PlacedTray` measures once per dice.key while narrow (~148 px); the maths/result lines widen it to ~219 px; never re-clamped.
* Evidence: `docs/qa/shots/qa-visual/f1-dice-tray-offscreen.jpg`; matrix ai-390/360/z200 en + zh (`$SP/qa-visual`).
* Fix: re-measure (ResizeObserver) and re-clamp; cap the width to the table so the maths line wraps.

### Q-019 (minor) A scoring that hits the 20 VP cap shows a net that contradicts its own table
* Sources: qa-long-desktop. Files: `src/ui/stage/stageStore.ts` (onScoring), `src/ui/stage/ScoringSheet.tsx`.
* Repro: `node $SP/qa-long-desktop/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side US --until end --game-seed 12 --shot-sheets --qa-out $SP/qa-long-desktop/runs/E2.json`
  (1440×900 en): T3 AR6, VP USSR +15, the US plays Asia Scoring. Runs E and E2.
* Expected: net from the rows (Total 4 vs 10 → USSR +6, as the plate showed) and a note that the VP track stops at 20.
* Actual: Total 4/10, "NET USSR +5" (the clamped change −15 → −20): net from the event's vp, rows from regionScores.
* Evidence: `docs/qa/shots/qa-long-desktop/f4-capped-scoring-net.jpg`.
* Fix: net from the rows; when the event's vp differs, a line such as "VP track stops at 20: +5 applied" (ui_stage key en + zh).

### Q-020 (minor) Phone: a country tooltip can't be dismissed and stays over the map until the prompt changes
* Sources: qa-long-phone. Files: `src/ui/map/MapView.tsx`.
* Repro: `$SP/qa-long-phone/t10-tip.mjs` at 390×844 zh (US, seed=13) and 844×390 en (USSR, seed=1): at the first Ops influence
  prompt tap a non-target (Sweden or Benelux), then the sea, then the country twice.
* Expected: a tap on the sea or the same country closes it (§4.8). Actual: it stays through every tap; at 390×844 it covers the
  Europe / ME / Asia chips and the turn readout; in the full game Colombia's tooltip covered the map during Chernobyl (T9).
  `tipId = pinned ?? tipFor`; no tap clears them; long-press calls `onInspect`, which the app never wires.
* Evidence: `docs/qa/shots/qa-long-phone/f2-tooltip-stuck-390-zh.jpg`, `f2-tooltip-during-region-prompt-390-zh.jpg`; `$SP/qa-long-phone` t10-390x844-zh-US.json, t10-844x390-en-USSR.json.
* Fix: on touch, a tap on the sea or the same box clears pinned/tipFor; long-press pins. (Wiring `onInspect` in GameScreen
  is an F4 leftover only if chosen.)

### Q-021 (minor) Map plate and sea texts below WCAG AA
* Sources: qa-a11y. Files: `src/ui/map/MapView.module.css`.
* Repro: `$SP/qa-a11y/contrast.mjs` (STATE=action-card W=1440 H=900 LANG_UI=en|zh).
* Expected: ≥ 4.5:1 below 24 px. Actual: plate USSR presence chip "PRES"/"存在" (gold on ussr-600 at `.chipPres` opacity .82)
  3.3:1 at 12 px bold; sea labels "To USA"/"往美国" (`.wrapLabel`) 3.7:1; "If scored" (10 px) and net "Even" 4.2-4.3:1.
* Evidence: `docs/qa/shots/qa-a11y/plate-chips-contrast-zoom.jpg`; `$SP/qa-a11y` contrast-action-card-1440-en.json / -zh.json.
* Fix: full opacity on `.chipPres` (the pair is 4.6:1); adjust the sea-label and plate caption colours; re-run contrast.mjs.

### Q-022 (polish; filed owner) Telex shows "VP before the ruling" after every final-scoring and 20-VP ending
* Sources: qa-long-desktop. Files: `src/ui/stage/GameOverTelex.tsx` (~l.158-161), ui_stage catalogs.
* Repro: any ending by final scoring (games A–D) or by 20 VP (E, seed 12).
* Expected: the stat when a rule overwrote VP (held scoring card), or a label fitting the reason. Actual: "VP BEFORE THE RULING ·
  US +9" (A), "US +5" (C), "裁定前 VP · 美国 +1" (D), "USSR +15" (E); `classifyEnding` sets vpBefore for every reason.
* Evidence: `$SP/qa-long-desktop/runs/B.json.telex.jpg`; telex text in `$SP/qa-long-desktop/runs/C.verify.txt`.
* Fix: label by `ending.reason`: held-scoring → "VP before the ruling"; final-scoring → "VP before final scoring" (new
  ui_stage key en + zh); other reasons → omit. A wording fix: no owner decision needed.

### Q-023 (polish) Shuttle Diplomacy's adjustment is applied on the scoring sheet but never shown
* Sources: qa-long-desktop. Files: `src/ui/stage/model.ts`, `src/ui/stage/ScoringSheet.tsx`, ui_stage catalogs.
* Repro: `node $SP/qa-long-desktop/tools/qa-play.mjs --url http://localhost:PORT/TS_playfield/ --side US --until end --game-seed 11 --shot-sheets --qa-out $SP/qa-long-desktop/runs/F.json`:
  Asia Scoring T5 AR7, Middle East Scoring T7 AR6, Shuttle Diplomacy in effect.
* Expected: a line such as "Shuttle Diplomacy: −1 USSR battleground". Actual: USSR Countries 3 · Battlegrounds 2 while the map
  shows 4 / 3; nothing says why (numbers are correct).
* Evidence: `docs/qa/shots/qa-long-desktop/f8-shuttle-diplomacy-unexplained.jpg`.
* Fix: when the flag was set before the scoring, add a note row (ui_stage key en + zh, card name per cards.json).

### Q-024 (polish) Chinese VP-chart aria-label runs the turns together
* Sources: qa-long-desktop. Files: `src/ui/stage/VpChart.tsx`.
* Repro: game over in Chinese (game D, 1366×768 zh, seed 38); read the chart's aria-label.
* Expected: separated points. Actual: "各回合 VP：开局：持平第 1 回合：美国 +4第 2 回合：美国 +5…" (`Intl.ListFormat('zh-CN', {type:'unit', style:'short'})` joins with "").
* Evidence: `$SP/qa-long-desktop/runs/D.verify.txt`. Fix: join with "；" in zh.

---

## F3 — prompts + tray + cards + common

### Q-025 (major) The DEFCON dossier says "Ends the game — you lose" (hazard + hold) when DEFCON 1 would make the human win
* Sources: qa-rules-flow. Files: `src/ui/prompts/DefconDossier.tsx`, `src/ui/prompts/policy.ts`, ui_prompts catalogs; F1 part
  `src/game/prompt.ts` + `prompt.json` (`prompt:card.46.detail`).
* Repro: saves in `$SP/qa-rules-flow/saves-defcon1-win.json` (game 359 US T9 AR7, How I Learned via the AI's Star Wars; games 83
  US T8 and 86 USSR T5, the AI played Summit and the human won the roll; DEFCON 2): `node probe/defcon1.mjs en|zh` in
  `$SP/qa-rules-flow`, or put the save in localStorage `ts-playfield.game.v1`, reload with `?lang=en&ai=policy`, Resume. 1440×900.
* Expected: the option's own warning `game-ending{winner:<human>}` (and the engine: the phasing player loses) → per §8.2/8.3 a
  certain win stages with "caution" and the warningMessage copy ("This ends the game: the US wins"), no hazard, no hold.
* Actual: lamp 1 hazard-striped, "ENDS THE GAME — YOU LOSE" / "游戏结束——你输了", press-and-hold; How I Learned's detail
  "DEFCON 1 ends the game, and you would lose."; holding ends the game with the human winning. All 3 states, en + zh.
  The caption is static (`defconCaption(level)`), not from the warnings.
* Evidence: `docs/qa/shots/qa-rules-flow/defcon1-win-hilsw-us-en.jpg`, `defcon1-win-summit-us-en.jpg`; `$SP/qa-rules-flow` planW-en.json / planW-zh.json items warn_game_ending_defcon_level-*.
* Fix: caption / hazard / hold from the option's warnings (win → caution "ends the game — you win", no hold; loss → as now;
  no game-ending warning → no "ends the game" caption). **F1 part:** use card 46's "you would lose" detail only when the human
  is the phasing player; add a win variant (en + zh).

### Q-026 (major) Play-mode stage: S stages Space race, then Enter plays the Event instead
* Sources: qa-a11y. Files: `src/ui/prompts/PlayModeStage.tsx`, `src/ui/prompts/usePromptKeys.ts`.
* Repro: `$SP/qa-a11y/t5-space.mjs` (W=1440 H=900 SEED=13; W=1024 H=768 SEED=3): dev en, confirmFinal on, `?ai=policy&seed=13`, USSR,
  first AR pick Socialist Governments, on "How will you play it?" press S, then Enter.
* Expected: Enter (documented "confirm a staged choice") attempts the launch.
* Actual: focus stays on the auto-focused Event button, which takes Enter: seed 13 plays the Event; seed 3 (Five Year Plan,
  opponent card) Enter re-stages Event and a second Enter commits the US event with no undo. Also kb2-1440-USSR-13 (play-mode #21, Decolonization). 3×.
* Evidence: `docs/qa/shots/qa-a11y/space-staged-enter-plays-event-1440.jpg`; `$SP/qa-a11y/runs/kb2-1440-USSR-13/result.json`.
* Fix: the E/I/C/R/S keys move focus to the staged row (or Enter on the stage always commits the staged choice).

### Q-027 (major) Target list (T): the active row resets to the first row after each placement; names lack labels
* Sources: qa-a11y. Files: `src/ui/prompts/TargetList.tsx`.
* Repro: `$SP/qa-a11y/t15-list.mjs` at 1440×900 and 1024×768, seed 13, USSR setup: T, ArrowDown ×2 (East Germany), Enter, Enter.
* Expected: the active row stays on the country just used (§8.13, the screen-reader path). Actual: aria-activedescendant resets
  to Finland → placements ['East Germany','Finland']; option names read "Finland 4 US 0 USSR 1" (stability unlabeled, no action/cost).
* Evidence: t15-list.mjs output; `$SP/qa-a11y/snap/1440x900-en/targetlist.yml`.
* Fix: keep the active row by country id across updates; names like "Finland, stability 4, US 0, USSR 1 — place 1 influence".

### Q-028 (major) Phone: an in-hand card choice opens the hand drawer over the question and its decline button (Blockade)
* Sources: qa-long-phone. Files: `src/ui/tray/HandDrawer.tsx`, `src/ui/common/Sheet.module.css` (auto-open: `GameScreen.tsx` l.133, per spec §3.3).
* Repro: `$SP/qa-long-phone/t16-evcard.mjs` (`?ai=policy&seed=13`, US): T4 AR2 the USSR plays Blockade (#10). 390×844 zh and 844×390 en.
* Expected: the player sees "Blockade: discard a card worth 3 or more Ops" and both answers (a 3-Ops card, or "Discard nothing — lose West Germany influence").
* Actual: the drawer opens by itself over the orders sheet: only "YOUR HAND · 6" and the cards (2 highlighted); elementFromPoint
  confirms the title and "Discard nothing" are underneath; the card sheet's only action is "DISCARD SOCIALIST GOVERNMENTS". In
  landscape the drawer is 844 px wide and covers the side column (§3.4: sheets open over the left column). Same for every
  in-hand event-card prompt with done.
* Evidence: `docs/qa/shots/qa-long-phone/f6-blockade-drawer-390-zh.jpg`, `f6-blockade-drawer-844-en.jpg`; `$SP/qa-long-phone` t16-390x844-zh-US-s13.json, t16-844x390-en-US-s13.json.
* Fix: keep the auto-open; the drawer header carries the prompt's one-line title and, when the prompt has `done`, the done
  button (same label / policy as the slip); in compact landscape sheets cover only the left column. No F4 change expected.

### Q-029 (major) Compact landscape and 200 % zoom: the play-mode choices and the card sheet's Play button are below the fold
* Sources: qa-visual. Files: `src/ui/prompts/PlayModeStage.tsx`, `PlayModeStage.module.css`, `src/ui/cards/CardSheet.tsx`.
* Repro: `src/ui/screens/demo/index.html?scene=prompt-play-mode&lang=en` at 844×390 (touch) or 720×450 (200 %); `?scene=prompt-action-card`
  at 844×390, tap a card in the hand drawer. Probes `$SP/qa-visual/p/playmode.mjs`, `p/cardsheet.mjs`.
* Expected: Event / Influence·Coup·Realign / Space race / Back to hand on screen (§8.7), and the card sheet's "Play <card>".
* Actual: the full-size card comes first: 844×390 content 808 px in a 281 px scroller (Event y 626–682 … Back 863; viewport 390);
  720×450 Event at 559–822; no scroll hint. Card sheet "Play Red Scare/Purge" at y 435–479. en, zh, en-XA.
* Evidence: `docs/qa/shots/qa-visual/f7-playmode-compact-landscape.jpg`; matrix playmode-844-*, playmode-z200-* (`$SP/qa-visual`).
* Fix: on short viewports put the card beside the options or shrink it, options first; card sheet: sticky action footer.

### Q-030 (minor) Compact landscape and 200 % zoom: the target list can't be opened
* Sources: qa-long-phone, qa-visual. Files: `src/ui/prompts/OrdersSlip.tsx`, `src/ui/prompts/usePromptKeys.ts` (`.landscape .grab` is hidden by design, ui-shell §5.9).
* Repro: `$SP/qa-long-phone/t18-list.mjs zh 13 US`: at 390×844 tap the grab at an influence prompt (list: 42 rows of 52 px, a tap
  places), rotate to 844×390. Also `?scene=prompt-influence&lang=en` at 844×390 (touch) or 720×450 (mouse + keyboard), probe `$SP/qa-visual/p/tlist.mjs`.
* Expected: the target list (§8.13) reachable in every arrangement. Actual: no List button, no grab, T does nothing (works at
  1440 / 1024); the listOpen dossier is excluded for compact.
* Evidence: `$SP/qa-long-phone` t18-zh.json, t18-zh/03-landscape.jpg; probe output at 844, 720×450, 1024, 1440 (`$SP/qa-visual`).
* Fix: show the slip's List link in the side-column variant and allow T there; open the target-list dossier (a full-screen sheet on compact).

### Q-031 (minor) Turn / AR readouts past the end: "Turn 11 · AR 0" after final scoring, "AR 9" / "AR 8" in the telex, slip "Turn 3 · AR 7"
* Sources: qa-long-phone, qa-visual. Files: `src/ui/prompts/OrdersSlip.tsx` + a helper in `src/ui/common`; F4 part
  `src/ui/console/Console.tsx`, `TurnTrack.tsx`, `ArTrack.tsx`; F2 part `src/ui/stage/GameOverTelex.tsx` (~l.82).
* Repro: (a) final-scoring endings: `$SP/qa-long-phone/t4-dialogs.mjs 390 844 zh 13 US`, `t14-late.mjs 844 390 en 1 USSR`.
  (b) `?scene=seq-over-milops-vp20&start=end&lang=en` (telex, slip, console: AR 9); `?scene=seq-over-held-scoring&start=end` (AR 8);
  `?scene=seq-turn-end&start=begin&speed=slow` (slip "Orders · Turn 3 · AR 7" while the console says "End of turn 3");
  `?scene=seq-ai-turn&start=begin` (slip "Turn 2 · AR 7"). Probes `$SP/qa-visual/p/telexar.mjs`, `p/artrace.mjs`.
* Expected: the last turn / AR played, or "end of turn" wording; turn 10 after final scoring (the telex's "Ended: Turn 10" is right).
* Actual: slip "ORDERS · TURN 11 · AR 0 — GAME OVER" (zh "指令 · 第 11 回合 · 第 0 行动轮"), console "TURN 11 · LATE WAR"
  (`state.turn` is 11); telex "Ended Turn 8 · AR 9" (`stats.ar = shown.state.action_round`).
* Evidence: `docs/qa/shots/qa-long-phone/f7-end-telex-390-zh.jpg`, `docs/qa/shots/qa-visual/f6-telex-turn8-ar9.jpg`; `$SP/qa-long-phone` t14-844x390-en-USSR-s1.json (end.slipAfterClose, end.consoleAfterClose).
* Fix: one helper (e.g. `displayTurnAr(state, ending)`: turn = ending?.turn ?? min(turn, 10); "end of turn" when the phase is not
  ACTION_ROUND or the AR is past the turn's last) used by the slip (F3), the console readout and tracks (F4 leftover) and the telex (F2 leftover).

### Q-032 (minor) Phones show mouse / keyboard instructions in tooltips, the slip and dialogs
* Sources: qa-long-phone. Files: `src/ui/prompts/CountryTooltip.tsx`, `src/ui/prompts/OrdersSlip.tsx`, ui_prompts / ui_tray
  catalogs; F1 part `ui.json` (via `tools/ui-keys.mjs`); F2 part `src/ui/map/MapTooltipHost.tsx`.
* Repro: `$SP/qa-long-phone/t10-tip.mjs` (as Q-020) and `t4-dialogs.mjs 844 390 en 1 USSR`: tap a non-target; long-press a target;
  open a coup target; stage a DEFCON level in How I Learned.
* Expected: touch wording ("Tap to place", "Tap again to launch"); no right-click / Space hints.
* Actual: "Right-click or Space: keep this open" / "右键或空格键：固定此提示"; "Click place · Right-click details" / "点击放置 ·
  右键详情"; "Click select · Click again to launch"; slip "Click a ringed country"; dossier "Click again or press Enter to confirm"
  (zh "再次点击或按回车确认"); tray "已选中：再次点击或按回车确认". In landscape the coup tooltip spills 25 px over the slip (x 334-569; column at 544).
* Evidence: `docs/qa/shots/qa-long-phone/f2-tooltip-stuck-390-zh.jpg`, `f3-coup-tooltip-844-en.jpg`; `$SP/qa-long-phone/t4-844x390-en-USSR-s1/dialog-2-staged.jpg`.
* Fix: a shared touch signal in src/ui/common (`(hover: none) and (pointer: coarse)` or last pointerType); touch variants of the
  ui_prompts / ui_tray hints (F3). **F1 part:** touch variants of `ui:tip.place`, `ui:tip.coup`, `ui:tip.inspect`,
  `ui:slip.hint.influence` (en + zh). **F2 part:** MapTooltipHost uses the touch inspect hint and keeps the tooltip inside the map column.

### Q-033 (minor) Landscape phone: the slip cuts the prompt title, hint and card name while half of it is empty
* Sources: qa-long-phone. Files: `src/ui/prompts/OrdersSlip.module.css`.
* Repro: `$SP/qa-long-phone/t17-crumb.mjs 844 390 en|zh 13 US` (T2 headline, East European Unrest event-target; T1 AR2 Comecon
  influence); compare `t17-crumb.mjs 390 844 zh`.
* Expected: the 283×279 side-column slip shows the whole question. Actual: title column 160 px with a 2-line clamp (en needs 101
  px of height, gets 40; zh 60/40); hint cut to 2 lines; zh crumb card name one character ("经…", "卧…"); content ends at 89-147 of 279 px; full text only in a title tooltip.
* Evidence: `docs/qa/shots/qa-long-phone/f10-landscape-slip-title-844-en.jpg`, `f10-landscape-slip-title-844-zh.jpg`; `$SP/qa-long-phone` t17-844x390-en.json, t17-844x390-zh.json.
* Fix: in the side-column variant the title takes the full width and up to 4 lines, the hint 3+, the crumb's card name a min-width.

### Q-034 (minor) Chernobyl region buttons cut on compact ("MIDDLE E…", "CENTRAL…", "SOUTH A…")
* Sources: qa-visual. Files: `src/ui/prompts/RegionChoice.tsx`, `src/ui/prompts/OrdersSlip.module.css`.
* Repro: `?scene=prompt-region&lang=en` at 844×390 (also 720×450) and 390×844. Probe `$SP/qa-visual/p/regionbtn.mjs`.
* Expected: readable without a tooltip (desktop already uses "C. America" / "S. America"). Actual: compact uses long names (844:
  65 px for 75/100/88 px); 390×844 "Central America" 100/96; ellipsis on an inline span. zh fine.
* Evidence: `docs/qa/shots/qa-visual/f3-region-buttons-844-en.jpg`. Fix: short names on compact and a 2-line label.

### Q-035 (minor) Phones, English: the play-mode "INFLUENCE" label is cut ("INFLUENC", "INFLUEN")
* Sources: qa-visual. Files: `src/ui/prompts/PlayModeStage.module.css`.
* Repro: `?scene=prompt-play-mode&lang=en` (also prompt-op-mode, prompt-play-mode-opponent) at 390×844 and 360×740 touch; probe `$SP/qa-visual/p/playmode.mjs`.
* Expected: whole labels. Actual: Influence needs 106 px, gets 102 (390) / 92 (360), cut without ellipsis; "REALIGN" touches the edge at 360.
* Evidence: `docs/qa/shots/qa-visual/f8-ops-buttons-phone-en.jpg`. Fix: less tracking / smaller caps on narrow phones or wrap the row; check en-XA.

### Q-036 (minor) Grain Sales with an opponent's card: the "Event first" row shows the Grain Sales instruction
* Sources: qa-rules-flow. Files: `src/ui/prompts/PlayModeStage.tsx` (~l.185).
* Repro: harvest sigs `play-mode|prompt:card.67.playMode|opp|…`, e.g. `node probe/grain.mjs en 0` in `$SP/qa-rules-flow` (the AI
  played Grain Sales for Ops; the US human drew Che). 1440×900, en + zh.
* Expected: the opponent-event explanation of normal play-mode ("A USSR card: if you use it for Operations, its Event happens for
  the USSR (Event first, or after your Ops)"). Actual: "Play it now, return it and use Grain Sales' 2 Ops, or play UN
  Intervention on it." (prompt.detail). Seen with Che, Cultural Revolution, Lone Gunman, Cambridge Five.
* Evidence: `docs/qa/shots/qa-rules-flow/grain-sales-event-row-en.jpg`.
* Fix: use the ordinary opponent-card explanation (the key normal play-mode uses) for the row; keep the Grain Sales detail in the stage header.

### Q-037 (minor) Vietnam Revolts' SE-Asia-only +1 is counted with no hint; two Ops vanish after one point elsewhere
* Sources: qa-rules-flow. Files: `src/ui/prompts/OrdersSlip.tsx` (~l.173, 190), ui_prompts catalogs.
* Repro: in `$SP/qa-rules-flow`: `node probe/vr.mjs en "action-card|opsmod|PURGE_USSR_ACTIVE,VIETNAM_REVOLTS_ACTIVE" 4` (USSR T3 AR4,
  Duck and Cover → Influence) and `node probe/vr.mjs en "action-card|opsmod|BREZHNEV_DOCTRINE_ACTIVE,VIETNAM_REVOLTS_ACTIVE" 84`. 1440×900.
* Expected: the conditional bonus explained like the China Card's (`ui:slip.hint.asiaBonus`; §8.6 names Vietnam Revolts).
* Actual: stage "OPERATIONS · 2 OPS", slip "3/3 OPS LEFT", plain hint; after one point in Sweden "1/3 OPS LEFT". Brezhnev case 3 → 4/4 → 2/4. The hint only checks `pendingCard === 6`.
* Evidence: `docs/qa/shots/qa-rules-flow/vietnam-revolts-counter-en.jpg`.
* Fix: the engine is right; add "gives +1 Op if every point goes to Southeast Asia" (new key en + zh in ui_prompts) when the human is USSR with VIETNAM_REVOLTS_ACTIVE.

### Q-038 (minor) Coup tooltip formula and "Mil ops +N" use prompt.opsValue: wrong for the China Card outside Asia and under SALT
* Sources: qa-rules-flow. Files: `src/ui/prompts/CountryTooltip.tsx` (~l.44), `src/ui/prompts/OrdersSlip.tsx`; F1 part `src/game/previews.ts`.
* Repro: `node probe/couptip.mjs en` in `$SP/qa-rules-flow`: (a) sig `coup|defcon2|0` (game 7 US T5, DEFCON 2), China Card → Coup,
  hover Cameroon; (b) a US coup under SALT (game 261 T9, Arab-Israeli War), hover Syria. Node check of 200 targets: `harvest2/coup.test.ts`.
* Expected: formula, odds and mil ops agree with the engine's roll (China +1 only in Asia; SALT −1; LADS ±1).
* Actual: (a) "5 Ops + ⚀ − 2×1 … Mil ops +5", crumb "· 5 Ops", but the strip shows a 1 → +3 (4 Ops). (b) "2 Ops + ⚀ − 2×2, Success 3/6"
  while the strip fails on a 3 (SALT's −1 missing).
* Evidence: `docs/qa/shots/qa-rules-flow/coup-tooltip-china-outside-asia-en.jpg`; `$SP/qa-rules-flow/harvest2/coup.test.ts` output.
* Fix: take the numbers from the engine. **Contract (coordinator, additive optional):** `CoupOdds.ops?: number` (Ops the coup
  is credited with) and `CoupOdds.modifier?: number` (roll modifier, SALT / LADS); **F1 part:** set them in computeCoupOdds.
  F3 renders them (fallback to opsValue when absent).

### Q-039 (minor) Olympic Games boycott that wins (DEFCON 2): the dossier never says so; the slip's warning line is clipped (en)
* Sources: qa-rules-flow. Files: `src/ui/prompts/BranchDossier.tsx`, `src/ui/prompts/OrdersSlip.tsx`, `OrdersSlip.module.css`.
* Repro: harvest sig `warn|game-ending|branch` with resolving card 20 (game 25 US T5 headline; game 154 USSR T2 AR2): `node probe/boycott2.mjs en|zh` in `$SP/qa-rules-flow`. 1440×900. Click Boycott.
* Expected: the consequence where the choice is made ("This ends the game: the US wins."), §8.3. Actual: the tile says only "DEFCON
  degrades by 1 and the sponsor conducts 4 Ops."; the win is only in the slip's warning behind the scrim, clipped in en (838–852 px vs the panel's 845 px).
* Evidence: `docs/qa/shots/qa-rules-flow/olympics-boycott-win-dossier-en.jpg`, `olympics-boycott-win-slip-en.jpg`.
* Fix: game-ending warnings on the branch tile (caution for a win, hazard for a loss); fix the `.warn` panel's height / overflow.

### Q-040 (polish) Portrait tablet: the pile viewer / card picker uses two fixed narrow columns
* Sources: qa-visual. Files: `src/ui/prompts/CardPicker.module.css`.
* Repro: `?scene=prompt-action-card&lang=en` at 768×1024 touch: close the hand drawer, Status → Discard pile (also 820×1180).
* Expected: the grid fills the sheet. Actual: `.compact { repeat(2, …); justify-items:center }` → two ~136 px columns ~380 px apart.
* Evidence: `docs/qa/shots/qa-visual/f9-pile-viewer-768.jpg`. Fix: `auto-fill minmax(132px, 1fr)` on compact too.

---

## F4 — console + rail + shell + theme

### Q-041 (major) Compact console VP readout and dock hand label ellipsized ("苏联 +13" → "苏联…1", "苏…", "Hand…")
* Sources: qa-long-phone, qa-visual. Files: `src/ui/console/Console.module.css`, `src/ui/console/VpGauge.tsx`, `src/ui/compact/BottomDock.tsx`.
* Repro: (a) `$SP/qa-long-phone/t13-vp.mjs 844 390 zh 12 US` (`?lang=zh&ai=policy&seed=12`, 844×390 touch): USSR at 13 VP in T3;
  seed 13 T2 (`t12-trunc.mjs`): +4 shows "苏联 ..4". (b) any game scene at 360×740 touch, e.g. `?scene=prompt-influence&lang=zh`;
  probe `$SP/qa-visual/p/console.mjs`; also 844×390 / 720×450 zh.
* Expected: "苏联 +13" (as at 390×844 zh and 844×390 en); "苏联 +2" at 360; dock "手牌 · 6" / "Hand · 6" (§3.3).
* Actual: `.vpMini .vpRead { overflow:hidden; text-overflow:ellipsis }`, 42 px for 44 px of text → "苏联…1" (the key number reads 1);
  zh 360 32 px of 44 → "苏…"; zh landscape 2 px short. Turn readout "第 1 行动轮 · 美国（你）" → "…美国…" (115 of 140 px), no title.
  Dock label 33 px of 38-39 → "手…" / "Hand…" (both languages; 390 en-XA). All 36 states at 360.
* Evidence: `docs/qa/shots/qa-long-phone/f5-vp-readout-844-zh-13.jpg`, `f5-vp-readout-844-en-13-ok.jpg`; `docs/qa/shots/qa-visual/f2-360-console-dock-zh.jpg`; `$SP/qa-long-phone` t13-844x390-zh-US-s12.json, t12-844x390-zh-US.json.
* Fix: never ellipsize the number (min-content width; shorten the side word or use the glyph when short); the turn readout may
  wrap or gets title + aria; dock: drop the thumbnails or shorten below ~380 px. Check 360 / 390 / 844 in en, zh, en-XA.

### Q-042 (major) Landscape iPhone: the left / right safe areas are ignored (emulated)
* Sources: qa-long-phone. Files: `src/ui/screens/GameScreen.module.css`, `src/ui/theme/**`; F3 part `src/ui/common/Sheet.module.css`, `Dossier.module.css`.
* Repro: `$SP/qa-long-phone/t6-safearea.mjs en|zh`: 844×390 touch, CDP `Emulation.setSafeAreaInsetsOverride {left:47,right:47,bottom:21}`; index.html has viewport-fit=cover.
* Expected: console, slip and dock inside `env(safe-area-inset-left/right)`, as the bottom inset already is.
* Actual: no CSS uses the left/right insets: the right band holds ☰ (x 798-838), the slip's "6/6 LEFT" and the dock's Status (x
  769-844); the left band the Europe chip (x 8-86). en and zh. Not seen on a device; the CSS gap is certain.
* Evidence: `docs/qa/shots/qa-long-phone/f9-safe-area-844-en.jpg`; `$SP/qa-long-phone` t6-safearea-en.json, t6-safearea-zh.json.
* Fix: pad the game grid and start screen with the left/right insets (the map may stay full-bleed; inset the theatre bar and
  zoom buttons). **F3 part:** Sheet and Dossier insets. Verify with the same override.

### Q-043 (major) Focus falls to `<body>` after play-mode choices, Continue, game start, Back to hand and Review board
* Sources: qa-a11y. Files: `src/ui/screens/GameScreen.tsx`, `src/ui/App.tsx`; F3 part `PlayModeStage.tsx`, `src/ui/common/Dossier.tsx`,
  tray; F2 part `src/ui/stage/HeadlinePapers.tsx`, `ScoringSheet.tsx`, `GameOverTelex.tsx`.
* Repro: `$SP/qa-a11y/kbplay.mjs` (TAG=kb2-1440-USSR-13 W=1440 H=900 SIDE=USSR SEED=13 TURNS=2; W=1024 H=768 SIDE=US); `t10-keys.mjs` (Esc on the play-mode stage); `t9-over.mjs` (Esc on the telex).
* Expected: focus never lost (§12: back to the opener; else a stable place: the slip, the first target, the hand card).
* Actual: `<body>` after 13/13 play-mode / op-mode answers at 1440 and 13/13 at 1024; after Continue on papers and scoring sheet
  (5/5); after picking a side; after Esc "Back to hand" (card not focused); after Esc "Review board".
* Evidence: `$SP/qa-a11y/runs/kb2-1440-USSR-13/result.json`, `runs/kb2-1024-US-13/result.json`, focus-lost-*.jpg there.
* Fix: a central fallback in GameScreen: when the focused element is removed and focus lands on body, focus the slip region
  (tabIndex −1, labelled) — restoring lost focus, not stealing it (§12); App focuses the game's main landmark when the game
  screen mounts. **F3 part:** Back to hand focuses the card; Dossier returns focus to a live opener. **F2 part:** Continue /
  Review board hand off explicitly if the central handler can't see the removal.

### Q-044 (major) "Skip to map" does nothing
* Sources: qa-a11y. Files: `src/ui/screens/GameScreen.tsx` (~l.230).
* Repro: `$SP/qa-a11y/t4.mjs` (1440×900, 1024×768): at the setup, action-card or influence prompt, Tab to "Skip to map", Enter.
* Expected: focus into the map (first legal target, else the map). Actual: stays on the link: `querySelector("#ts-map [tabindex='0'], #ts-map svg")`
  returns the first match in document order, the `<svg role=application>` (no tabindex), so `focus()` does nothing.
* Evidence: t4.mjs output ("querySelector hit: svg tabindex=null role=application").
* Fix: query the target box first, then fall back to a focusable (tabIndex −1) map container.

### Q-045 (major) The AI-play screen-reader announcer exists only on the open desktop rail
* Sources: qa-a11y. Files: `src/ui/rail/Dispatches.tsx`, `Rail.tsx`, `RailStrip.tsx`, `src/ui/compact/CompactSheets.tsx`, `src/ui/screens/GameScreen.tsx`.
* Repro: `$SP/qa-a11y/kbplay.mjs` (live-region changes in runs/*/live.json); `t9-over.mjs` counts `.ts-vh[aria-live]` at 1440×900 (rail open, then L), 1024×768, 390×844.
* Expected: §12 "a log mirror that announces each AI play once", in every arrangement.
* Actual: inside Dispatches → 1 with the rail open, 0 collapsed, 0 on tablet, 0 on phone; 49 AI lines announced over two turns at 1440, 0 at 1024.
* Evidence: `$SP/qa-a11y/runs/kb2-1440-USSR-13/live.json` vs `runs/kb2-1024-US-13/live.json`; t9-over.mjs output.
* Fix: one GameScreen-level announcer in every layout; Dispatches keeps none (no double announcement). Do with Q-050.

### Q-046 (major) The ☰ menu is not keyboard operable
* Sources: qa-a11y. Files: `src/ui/screens/Menu.tsx`; F3 part `src/ui/common/Popover.tsx`.
* Repro: `$SP/qa-a11y/t7-menu2.mjs` (1024×768), `t8-menu3.mjs` (1440×900): focus the Menu button (or the wordmark), Enter, ArrowDown, Tab, Esc.
* Expected: focus to "New game", arrows between items, Esc closes and returns focus to the button.
* Actual: focus stays on the button (Menu focuses the first item in a useEffect while the Popover is still visibility:hidden);
  items are portalled after the rail: 13 Tabs to "New game" at 1024, 85 at 1440 on turn 1 (grows with the log); Esc from an item
  drops focus to body (4/4). New game, Resign and About exist only here. Popover and inner div are both role=menu.
* Evidence: t7-menu2.mjs / t8-menu3.mjs output (`$SP/qa-a11y`).
* Fix: focus the first item once placed, roving arrows + Home/End, Esc / Tab close and return focus to the anchor. **F3 part:**
  Popover gives a placed callback and focus return, and drops the duplicate role=menu.

### Q-047 (minor) Portrait phone: the tapped theatre chip is often not the one that lights up
* Sources: qa-long-phone. Files: `src/ui/screens/GameScreen.tsx` (~l.184-205), `src/ui/compact/TheatreBar.tsx` (`framedSlot`).
* Repro: `$SP/qa-long-phone/t8-chips.mjs` at 390×844 zh (US, seed=13, setup): tap each chip, swiping to reach S. America.
* Expected: the tapped chip pressed (§3.3). Actual: SE Asia → Asia, Africa → Europe, S. America → C. America, World → Europe; the
  camera frames the right region but `onCamera → setFramed(framedSlot(view))` recomputes from a tall view. 844×390 is correct. Two runs (t1-map.mjs, t8-chips.mjs).
* Evidence: `docs/qa/shots/qa-long-phone/f4-chip-samerica-pressed-camerica-390-zh.jpg`; `$SP/qa-long-phone` t8-390x844-zh.json, t8-844x390-en.json, t1-390x844-zh.json.
* Fix: deviation 6 stays (the chip follows the camera), but a programmatic frame keeps the tapped chip until the user pans / zooms; judge tall views by the region at the view's centre.

### Q-048 (minor) Many phone touch targets are below 44 × 44 px
* Sources: qa-long-phone. Files: `src/ui/compact/compact.module.css`, `src/ui/screens/GameScreen.module.css`, Menu / Settings styles;
  F3 part `src/ui/common/Sheet.module.css`, Dossier buttons, slip; F2 part stage and telex buttons.
* Repro: `$SP/qa-long-phone/t11-menu.mjs` and `t14-late.mjs` (`smallTargets()` in lib.mjs) at 390×844 zh and 844×390 en.
* Expected: ≥ 44 × 44 px (§3.3, §12). Actual: theatre chips 42-80 × 26; orders-sheet grab 64 × 18 (the only swipe zone); sheet /
  drawer grab 88 × 24; Undo play 126 × 26; Continue on papers / scoring sheet 88 × 30, 115 × 30; slip speed segment 44 × 36; menu
  language "English" 28 × 24, "简体中文" 41 × 24; settings segments 32-68 × 30, Close 49 × 30; dialog Confirm 338 × 30; game-over buttons 63-76 × 30.
* Evidence: `$SP/qa-long-phone` t11-390x844-zh-US.json (audit, settings.audit), t14-844x390-en-USSR-s1.json (small), t4-390x844-zh-US-s13.json (endScreen.small), t1-390x844-zh.json (swipeUpBeside:false).
* Fix: on coarse pointers a ≥ 44 px hit area (invisible `::after` expansion where the visual must stay small; a full-width grab
  zone). F4: chips, orders-sheet grab, menu language, settings segments + Close. **F3 leftover:** Sheet / drawer grab, Dossier
  Confirm / Close, slip Undo play and speed segment. **F2 leftover:** papers / scoring-sheet Continue, telex buttons.

### Q-049 (minor) The Dispatches log has one Tab stop per reference (274 by turn 3)
* Sources: qa-a11y. Files: `src/ui/rail/Dispatches.tsx`.
* Repro: `$SP/qa-a11y/t8-menu3.mjs`, 1440×900, seed 13 (Tab stops in the rail; Tabs to leave it).
* Expected: the log is one Tab stop (the tape has tabIndex 0); refs by arrows. Actual: 70 stops at T1 AR1, 274 at T3; +~100 per turn.
* Evidence: t8-menu3.mjs output. Fix: refs tabIndex −1 with roving arrow focus inside the tape.

### Q-050 (minor) AI-play announcements omit the outcomes
* Sources: qa-a11y. Files: `src/ui/rail/Dispatches.tsx` (the announcer; after Q-045 the shared one).
* Repro: `$SP/qa-a11y/t12-coupann.mjs` (1440×900, seed 13, USSR, through T2).
* Expected: AI plays and their results. Actual: only the main line: "US attempts Coup in Egypt" (the entry has "US rolls 1 …
  Coup Failed … DEFCON: 3 -> 2"); scoring without VP; "Captured Nazi Scientist for its Event" without the space move; the headline
  reveal (in the human's entry) never announced. No hidden info leaked (t16-leak.mjs, 268 checks).
* Evidence: t12-coupann.mjs output; `$SP/qa-a11y/runs/kb2-1440-USSR-13/live.json`.
* Fix: announce the main line plus the result details (die / result, DEFCON, VP, space) and the headline reveal, one message per entry.

### Q-051 (minor) Start screen: the first Tab focuses a hidden backdrop map box and pops its tooltip
* Sources: qa-a11y. Files: `src/ui/screens/StartScreen.tsx`; optional F2 part `src/ui/map/MapView.tsx`.
* Repro: `$SP/qa-a11y/t7-menu2.mjs` (1440×900, 1024×768): load the start screen, Tab once.
* Expected: first stop the language switch or a folder; backdrop inert. Actual: "Norway" (g role=img, tabIndex 0) inside
  aria-hidden; its tooltip covers "Toss a coin"; screen readers say nothing.
* Evidence: `docs/qa/shots/qa-a11y/start-first-tab-hidden-map-box-1024.jpg`.
* Fix: `inert` on the backdrop wrapper (React 18: `inert=""`). Optional F2: a MapView prop that renders no tab stops.

### K-001 (minor) BootLine Retry re-runs `controller.boot()` before a game; refresh ui-shell.md
* Sources: coordinator. Files: `src/ui/screens/StartScreen.tsx` (~l.213), `src/ui/App.tsx`, `docs/handoff/ui-shell.md`.
* Repro: production preview with the engine or model blocked (`$SP/qa-prod-perf/tools/r-fail.mjs ortwasm|onnx|worker`; `$SP/qa-visual/p/booterr.mjs` with TSP_BLOCK); press Retry.
* Expected: no game in progress → Retry calls `controller.boot()` (the controller now retries a failed engine or pre-game AI
  load); mid-game AI failure → page reload (resumes from the autosave). Actual: always `window.location.reload()`.
* Evidence: `src/game/controller.ts` boot() doc comment.
* Docs: ui-shell.md §1 "boot() memoises its promise", §5 deviation 2, §6.2 (random play loses fast), §6.4 / §8.4 (DemoHarness
  bug, fixed) are outdated; §3's play.mjs usage → the new flags (`--policy ai|random`, `--until end`, `--game-seed`, `--auto`,
  `--touch`, `--json`) and a pointer to docs/handoff/ai.md "The play-through driver". Pairs with Q-010, Q-052.

### Q-052 (polish) After a boot error the side folders still look enabled (busy cursor)
* Sources: qa-visual. Files: `src/ui/screens/StartScreen.module.css`.
* Repro: live app `/?lang=en` with `**/engine/ts_engine.wasm` blocked (`$SP/qa-visual/p/booterr.mjs`, TSP_BLOCK), 1440×900; matrix bootError-390-zh.
* Expected: folders read as unavailable. Actual: disabled but opacity 1 and `cursor: progress` forever.
* Evidence: probe output; `$SP/qa-visual/matrix/bootError-*.jpg`. Fix: dimmed + default cursor on error; progress cursor only while loading.

### Q-053 (polish) Accessible names: "S. America: 1 targets", "Your hand: 1 cards"; zh wordmark "冷战热斗 Playfield"
* Sources: qa-visual. Files: `src/i18n/locales/{en,zh-CN}/ui_shell.json`, `src/i18n/locales/zh-CN/ui_console.json`.
* Repro: theatre chip aria-labels on `?scene=prompt-influence` at 390×844 / 844×390; dock aria with one card; zh wordmark aria-label. Probes `$SP/qa-visual/p/tlist.mjs`, `p/findtxt.mjs`.
* Expected: plural forms; the zh brand as in the document title ("冷战热斗 · AI 对战"). Actual: `theatre.count`, `dock.handAria`,
  `dock.adversaryAria` lack `_one/_other`; zh "冷战热斗 Playfield：打开菜单". Fix: add the plural forms; zh label per the title.

### Q-054 (polish) Camera keys + − 0 work only with focus inside the map
* Sources: qa-a11y. Files: `src/ui/screens/GameScreen.tsx`.
* Repro: `$SP/qa-a11y/t19-camera.mjs` (1440×900): + with focus on body, a hand card, a console button, a map box.
* Expected: §12 lists + − 0 as camera keys with no map scope (the shortcut sheet agrees). Actual: only with a map box focused.
* Fix: bind them in GameScreen (useKey, not in text inputs) to the map handle; no catalog change.

### Q-055 (polish) A failed game-chunk download shows the same toast twice
* Sources: qa-prod-perf. Files: `src/ui/App.tsx` (~l.72-80).
* Repro: `node $SP/qa-prod-perf/tools/r-fail.mjs game` (abort assets/GameScreen-*.js, wait for Ready, click Soviet Union). Twice.
* Actual: two identical "The game screen could not be loaded…" toasts: `retryChunk()` and `useChunk(…, onError)` both toast.
* Evidence: `$SP/qa-prod-perf/out/r-fail2.log` (status#2), `out/fail-game.png`. Fix: toast in one place.

### Q-056 (polish) Switching to Chinese while offline fails silently with an unhandled rejection
* Sources: qa-prod-perf. Files: `src/ui/console/LangToggle.tsx` (and the menu / start-screen switches); optional F1 part `src/i18n/index.ts`.
* Repro: Pages-like server, en; new game; `context.setOffline(true)` at T1 AR1; click 中文 (`node $SP/qa-prod-perf/tools/r-offline2.mjs`). Twice.
* Expected: a toast, no uncaught error. Actual: pageerror "Failed to fetch dynamically imported module …/zh-CN-*.js"; stays English, no message.
* Evidence: `$SP/qa-prod-perf/out/r-offline.log`, `r-offline2.log`.
* Fix: catch in every language-switch caller and toast (new ui_shell key en + zh). Optional F1: don't cache a rejected import.

### Q-057 (polish) No favicon and no Open Graph tags
* Sources: qa-prod-perf. Files: `index.html`.
* Actual: no `<link rel=icon>` → requests `https://chenao-phys.github.io/favicon.ico` (404), generic tab icon; no og:* / twitter:card.
* Fix: an inline SVG data-URI favicon; og:title, og:description, twitter:card "summary". og:image needs an absolute URL and an
  asset in public/ (F1): optional, only if a suitable image exists.

---

## Owner decisions

### OD-1. How much should the client-side autosave resist reading and editing?
* Evidence: qa-hidden-info F4. `localStorage['ts-playfield.game.v1']` is plain JSON; at the human's headline prompt
  `steps.at(-1)` is `[1, <AI headline id>, 0, 0]` (3/3 USSR headline prompts, 1/1 zh, 67/67 in Node probe A3), readable in
  DevTools › Application with no code. The seed plus the public engine give the AI's hand, deck order and future dice. Edited
  saves that replay legally are accepted: a turn-2 USSR save flipped to `humanSide: "US"` resumes with the human holding the
  AI's hand (`tamper.mjs` flippedSide, production preview). `prod-fiber.mjs` reaches the controller through React's fiber
  tree. Scripts: `$SP/qa-hidden-info/tools/`.
* Options: (1) accept, and say on About that the local save is not tamper-proof; (2) don't persist the AI's not-yet-revealed
  headline step and re-ask the deterministic AI on resume (needs the full search to be deterministic); (3) obfuscate the save
  (XOR + base64 + checksum); (4) re-key the RNG per human decision and save rng_state (engine work, new save format).
* Recommendation: **(3) + (1)**. Cheap; it stops the no-code read of the face-down headline and casual edits (flipped side,
  edited moves), and it is honest that DevTools users can always recover hidden information. (2) does not help while the seed
  is in the save; (4) is engine work out of scope. With Q-001, Q-002 and Q-004 fixed, no known hidden-information leak
  remains that works without developer tools.

### OD-2. Full-strength AI on slow devices: keep leaderboard #1 everywhere?
* Evidence: qa-prod-perf F3. With a ~4× slower CPU (SIGSTOP duty cycle, calibrated), decision times median / p90 / max: USSR
  2.3 / 24.8 / 48.2 s (card choices median 17.3 s), US 3.2 / 25.3 / 36.2 s (16.9 s); "Still thinking" shown 10-14 times in two
  turns (1-5 at 1×). The slow decisions are the belief-weighing ones (45-63k likelihood rows late in a turn). Nothing breaks.
  `$SP/qa-prod-perf/out/ai-ussr-1x.json`, `ai-us-1x.json`, `ai-ussr-4x.json`, `ai-us-4x.json` (+ .log).
* Options: (1) keep leaderboard #1 everywhere (CLAUDE.md: no difficulty levels, always full strength); (2) calibrate at boot and
  fall back to the search without `belief2048` (ARCHITECTURE's named fallback) on slow devices, a weaker AI there; (3) keep #1
  and soften the wait (the note shows elapsed time, or a one-time "this device is slow; the AI may take up to a minute").
* Recommendation: **(1)**, with (3) if cheap; revisit with timings from real phones. (2) contradicts CLAUDE.md unless the owner wants it.

### OD-3. Hand at 1280–1366 px: six cards show only their Ops badge, no names
* Evidence: qa-visual F11, `docs/qa/shots/qa-visual/f11-hand-1280-names-hidden.jpg` (`?scene=prompt-influence&lang=en` at
  1280×720 and 1366×768; also 1440 with 7+ cards: "DUCK AND…", "CULTURAL…", "ARAB-ISR…"). The 55 % overlap cap (prep-ui) leaves a
  ~55 px strip per card. Acceptable at 1440, weak at 1280–1366 where the hand is the main decision each turn.
* Options: (1) keep (hover / focus zoom shows the card); (2) smaller hand cards below 1440 px (~92 × 129) so each printed title
  shows; (3) a vertical name strip on each card's visible edge; (4) less overlap, letting the hand take space from the slip / China slot.
* Recommendation: **(2)** — simplest, keeps the printed faces; F3 (`src/ui/tray/trayModel.ts` handCardWidth, `src/ui/cards/cards.module.css`).

---

## Deferred

| Id | Item | Reason |
|---|---|---|
| D-001 | No Content-Security-Policy; the `chenao-phys.github.io` origin is shared with the account's other Pages sites (qa-hidden-info F5) | Deferred: defence in depth with no current sink (no `dangerouslySetInnerHTML`; the only innerHTML is `select.innerHTML = ''` in i18n; tampered save / settings strings never ran; model cache hits are re-hashed). A meta CSP must be tested against ORT's wasm / worker loading (`wasm-unsafe-eval`, blob workers, the HF fallback in connect-src) on Safari and Firefox, which this round can't do. FYI for the owner: every ChenAo-Phys Pages project shares this origin, so they share localStorage and Cache Storage (our keys are namespaced `ts-playfield.*`). |
| K-004 | Load the game-only i18n namespaces (ui_tray, ui_prompts, ui_stage, ui_console, prompt, log) with the game chunk (optional) | Deferred, not cheap: a loader in `src/i18n/index.ts` wired to the game chunk (F4) and to every language switch (also Q-056's failure path), with a risk of raw-key flashes; it saves only part of the 79 kB English catalogs (entry already 16 ms locally, 167 kB gzip). Revisit with the vendor split (ui-shell.md §8 request 5). |
| D-002 | Deploy reminder (qa-prod-perf "GitHub Pages readiness") | Not a defect: there is no `.github/workflows`, `.gitignore` excludes `public/engine/` and `public/cards/`, so a Pages deploy must run `scripts/build-engine.sh` (emsdk) and `scripts/build-cards.mjs`, and `public/models/*.onnx` (5.8 MB) must be committed or fetched (docs/notes/build-deploy.md §4). For the coordinator's deploy step. |

**Rejected:** none. Every finding matched the code it names (spot checks: `previews.ts` l.479, `controller.ts` `headlineStarts` /
stepLog / `boot`, `rules.ts` l.21, `stageStore.ts` l.520, `DefconDossier.tsx`, `GameScreen.tsx` l.133 / 184 / 230,
`StartScreen.tsx` l.49-57 / 213, `App.tsx` l.72-80, `model.ts` l.100, `BootLine.tsx` l.47, `effects.ts`, `prompt.json` gameOver,
`GameOverTelex.tsx` l.158) and the screenshots looked at (Defectors papers, the zh VP readout, the 1280 hand).

## For the integrator: coordinator-owned and cross-group changes

* `src/game/contract.ts` (all additive, optional): `ViewModel.superseded?: boolean` (Q-002); `ViewModel.incompatibleSave?: { savedAt: number }`
  (Q-014); `CoupOdds.ops?: number` and `CoupOdds.modifier?: number` (Q-038).
* Cross-group leftovers: Q-002 F4 notice; Q-003 F2 stamp check; Q-005 F4 `errorKey`; Q-012 F4 About link; Q-014 F4 notice;
  Q-020 F4 `onInspect` (only if chosen); Q-025 F1 card-46 detail; Q-031 F4 console + F2 telex; Q-032 F1 `ui.json` keys + F2
  MapTooltipHost; Q-038 F1 previews; Q-042 F3 Sheet / Dossier; Q-043 F3 + F2; Q-046 F3 Popover; Q-048 F3 + F2; Q-051 F2
  (optional); Q-056 F1 (optional); Q-057 F1 (only for an og:image asset).
