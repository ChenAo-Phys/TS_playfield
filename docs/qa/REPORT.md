# QA round 1: report (2026-11-23)

## 1. What QA covered
Seven QA agents, each with a report in `docs/qa/qa-*.md` and screenshots in `docs/qa/shots/<agent>/`:

| Agent | Scope |
|---|---|
| qa-long-desktop | 7 full games with the autopilot driver, 1440/1366, en and zh |
| qa-long-phone | 2 full touch games (390×844 zh US, 844×390 en USSR) plus targeted probes |
| qa-visual | Every fixture state × 5 viewports × en/zh/en-XA, plus 200 % zoom, with a DOM audit |
| qa-hidden-info | Coup odds, AI timing, two tabs, save tampering, the production bundle, CSP |
| qa-rules-flow | 400 harvested games, 132 prompt kinds, special flows, warnings and endings, each answered through the UI in en and zh |
| qa-a11y | Keyboard-only play, screen readers, contrast, reduced motion |
| qa-prod-perf | Production build: load timeline, slow network, 4× CPU, memory, failed downloads, storage, offline |

The 68 findings merged into 60 unique items. None was rejected and there were no blockers. Routing: F1 17, F2 9, F3 16, F4 18. There were 3 owner decisions and 3 deferred items.

## 2. Outcome
- **Fixed:** 59 of 60. The partial fixes left by the groups were completed at integration: Q-002, Q-005, Q-012, Q-014, Q-025, Q-031, Q-032, Q-038, Q-042 and Q-048.
- **Partial:** 1. K-003: #42 Quagmire's "cancels NORAD" is not drawn on the English card image. #98, #109 and #110 now have the red "Remove from play" line.
- **Not reproduced:** 0. Every group reproduced its items first.
- **Deferred:** 3 (D-001, D-002, K-004).
- **Owner decisions:** 5 (OD-1 to OD-3 from the triage, OD-4 and OD-5 new).

How each item was re-checked on the final tree:
- **F1:** regression tests for every item (`tests/game/qa-fixes.test.ts`, `tests/ai`, `tests/i18n`, `tests/ui/runner`). Re-run in the browser: Q-002 (two tabs), Q-005/Q-010/Q-014 (production probes), Q-008/Q-015/Q-016 (play-throughs), Q-012 (build). Q-013 was verified by F1 only, not re-run.
- **F2:** tests for every item, plus the play-throughs (final scoring, taps on a phone) and the screenshots (dice tray, contrast). Q-020 and Q-032's map part were re-run in the browser.
- **F3:** tests for every item. Browser probes for Q-025, Q-031, Q-032 and Q-038; keyboard turn for Q-026; screenshots for Q-033 and Q-035.
- **F4:**
  - Keyboard turn and probes: Q-043, Q-044, Q-045, Q-046, Q-049, Q-050, Q-051.
  - Touch measurements: Q-042, Q-048.
  - Production probes: K-001, Q-052, Q-057.
  - Tests: Q-047, Q-053, Q-054.
  - Q-055 and Q-056 were verified by F4 on production; not re-run.

## 3. Integration changes
### Coordinator-owned files
- `src/game/contract.ts`, additive and optional only: `ViewModel.superseded?: boolean`, `ViewModel.incompatibleSave?: { savedAt: number }`, `CoupOdds.ops?: number`, `CoupOdds.modifier?: number`.
- `src/ui/ui-contract.ts`, `src/ui/state/context.ts`, `package.json`, `vite.config.ts`: unchanged.

### Cross-group requests applied
- **Tab taken over by another tab (Q-002):** new `src/ui/screens/SupersededDossier.tsx`, mounted by `App.tsx` while `vm.superseded` is set. It blocks the screen, offers Reload, and replaces any other open dialog. New `ui_shell:superseded.*` keys in en and zh.
- **Boot line wording (Q-005):** `BootLine.errorKey` now matches the AI's stable no-SIMD marker (`isWasmUnsupportedMessage`), or a missing WebAssembly at the engine stage, instead of any text containing "simd".
- **Old-build save (Q-014):** the start screen shows the existing `ui:error.saveIncompatible` toast once per `incompatibleSave.savedAt`.
- **Licence link (Q-012):** About now links `THIRD_PARTY_LICENSES.txt`.
- **Coup Ops and modifier (Q-038):** `computeCoupOdds` fills `ops` and `modifier`. The request's formula `total1 − roll1 − mod1` is always 0, because the engine stores one combined `mod1` (Ops plus roll modifiers). Instead, a new exported `coupRollModifier` rebuilds the modifiers from public effects (SALT −1; Death Squads ±1 in Central/South America), and `ops = mod1 − modifier`.
- **How I Learned wording (Q-025):** new `prompt:card.46.detailWin` (en and zh), used when the AI is the phasing player.
- **Turn / AR readouts (Q-031):**
  - The console readout and both tracks use `displayTurnAr(state, vm.ending)` (`arModel` takes the ending). A game that ended mid-round keeps its played pips.
  - The telex reads "Turn N · AR k" only for an ending inside a round, otherwise "End of turn N".
- **Map tooltip (Q-032):** on touch, the default hint is the new `ui:tip.keys.inspectTouch` (added via `tools/ui-keys.mjs`). In compact landscape, `MapTooltipHost` keeps the tooltip inside the map column (new `bounds` prop).
- **Focus return:** `useFocusReturn(active, within)` gives focus back to the opener only when focus was lost with the closing dialog.
- **Safe areas (Q-042):** bottom sheets and full-screen dossiers pad by the left/right insets; the side-column sheet width also subtracts the right inset.
- **Touch targets (Q-048):** on coarse pointers, these are now at least 44 px:
  - sheet grab (via a hit area) and the dossier close button
  - dossier footer buttons
  - the phone slip's actions, Undo play and speed segment
  - Continue on the headline papers and the scoring sheet
  - the game-over telex buttons
- **ui-spec:** all the requested items (§7.1, §7.2, §8.1, §10.2, §11.1 Retry, §15.3 W1 lazy chunks, W3 HoldButton) plus the deviations the fix groups recorded this round, as surgical "As built" notes in §3.3, §3.4, §4.5, §4.7, §4.8, §5, §8.6–§8.13, §10.4, §11.3 and §12.

Not applied, because they are optional and already work another way:
- `MessageText refTabIndex`: Dispatches' observer already keeps the log references out of the Tab order.
- Esc "Back to hand" focusing the returned card: focus goes to the orders slip instead.
- Wiring `onInspect`: long-press already pins the tooltip.
- F1's touch variants of `ui.json` keys: F3 used its own keys.
- An og:image: there is no suitable asset.

### Other changes
- **Tests:**
  - `tests/game/qa-fixes.test.ts`: Q-038 checks over three games, two with modified coups; Q-025 on QA's game-359 save, which I added to `tests/fixtures/game/qa-saves.json`. That fixture was reformatted, with each save's steps on one line; the content is otherwise identical.
  - Also updated: `tests/ui/console/console.test.ts`, `tests/ui/stage/components.test.ts`, `tests/ui/shell/shell.test.ts`, `tests/ui/common/qa-fixes.test.ts`.
- **Screenshot script `src/ui/screens/demo/shoot.mjs`, two bugs fixed:**
  - The "scoring" shot waited for any `[data-dock]`, which the slip's actions row also carries, so it captured the wrong moment. It now waits for the scoring sheet.
  - On phone viewports, the headless mouse parked at (0, 0) hovered a map box in compact landscape and opened its tooltip. The mouse is now parked on the dock.
- **Handoffs:**
  - `docs/handoff/ui-shell.md`: new §10.
  - `docs/handoff/logic.md`: contract note updated, plus an integration section.
  - `docs/handoff/i18n.md`: new keys listed.



## 4. Verification
- **Typecheck:** `npx tsc --noEmit -p .` is clean.
- **Tests:**
  - First full run (`--maxWorkers=8`): 1 failure, a CSS regex test that the safe-area change made outdated. I updated the test.
  - Final full run (`--maxWorkers=4`): 64 files passed, 2 skipped; 1123 tests passed, 2 skipped; 86.6 s.
- **Production build** (scratch dir, built in 2 s):
  - entry 353.6 kB (110.8 kB gzip)
  - vendor 186.2 kB (59.7 kB gzip)
  - GameScreen 257.6 kB (84.6 kB gzip)
  - 28 MB in total
- **Bundle contents:**
  - No PDF and no map reference image (no .jpg files at all).
  - `__tsp`, `__tspAuto`, `fixtures`, `get("ai")` and `ai=policy` each appear in 0 files.
  - `TS_Rules_Deluxe` appears only as the gmtgames.com living-rules link.
  - `THIRD_PARTY_LICENSES.txt` is shipped.
- **Preview smoke (port 4195):**
  - Ready in 486 ms. No dev hooks. Favicon and Open Graph tags present.
  - The About licences link returns 200 with the MIT text.
  - USSR game played to turn 1 AR 3 in 17 s (17 answers). The AI made 21 decisions in 11.3 s (max 2.4 s).
  - The save records the leaderboard #1 search (`…:belief2048:race16`) even with `?ai=policy` in the URL; model sha 70b117b5. 0 errors.
- **Failure probes (production):**
  - onnxruntime wasm blocked: "The AI stopped responding" (before the fix: "cannot run WebAssembly").
  - Model blocked: "AI model could not be downloaded".
  - Worker blocked: "The AI stopped responding".
  - Engine wasm blocked: "The rules engine could not be loaded".
  - In every case Retry recovered in place to Ready.
  - Save from another engine build: one toast, the save removed, no Resume, and no toast after a reload.
- **Play-throughs** (autopilot, `?ai=policy`, seed 13):

  | Run | Ending | Answers | Fallbacks / mismatches / errors | Time |
  |---|---|---|---|---|
  | USSR, 1440×900, en | final scoring, turn 10, US +7 | 287 (383 clicks) | 0 / 0 / 0 | 542 s |
  | US, 390×844, zh, touch | final scoring, turn 10, US +7 | 296 (616 taps, 40 keys) | 0 / 0 / 0 | 907 s |

  Both match the earlier recorded outcomes. The final sheet shows the China Card row with a net that equals the VP change, and the console reads "End of turn 10".
- **Keyboard-only turn** (1440×900, USSR, seed 13): 35 answers, 82 Tab presses, 0 focus losses, 0 errors, 118 announcements. Covered headline, influence, coup, realign, event targets, space race and Continue.
- **Screenshots:**
  - Copied the old set to scratch, then regenerated all 84 (55 MB).
  - 12 identical, 72 changed. I reviewed the diffs; all changes are intended:
    - touch controls at 44 px and touch wording
    - the console's squeezed VP readout
    - the scoring sheet's fixed Continue footer
    - the telex without "VP before" for 20-VP endings
    - camera framing and die-animation timing
  - No regressions.

## 5. Re-check probes on the final tree
- **Q-002:** tab A was superseded (prompt withdrawn, no roll). The blocking notice appeared with focus inside it; Reload led to the start screen with Resume.
- **Q-025:** 3 saves × en/zh: lamp 1 reads "Ends the game — you win", no hold; How I Learned's detail says "…you would win".
- **Q-038:**
  - China Card outside Asia: "4 Ops + ⚀ − 2×1" and "Mil ops +4" (the prompt said 5 Ops).
  - SALT: "2 Ops + ⚀ − 1 − 2×2", Success 3/6, matching the odds strip.
- **Q-031:**
  - Console: "END OF TURN 7" (1440) and "第 8 回合结束" (390 zh).
  - Telex: "End of turn 8".
  - Slip: "ORDERS · END OF TURN 7".
- **Q-032 / Q-020:**
  - The coup tooltip at 844×390 sits at x 142–375, inside the map column (0–544), and says "Tap to select".
  - At 390, a tap opens a tooltip ending "Tap elsewhere to close" / "轻触别处关闭"; a sea tap closes it.
- **Q-042:** CDP insets {47, 47, 21}: no control of the hand drawer or a full-screen dossier sits inside the insets.
- **Q-048:** grab hit area 88×44 (painted 88×32); dossier close 44×44; footer, speed segment, Undo play, papers Continue and telex buttons all 44 px tall.
- **Keyboard and focus:**
  - Q-044: the skip link focuses the first legal target.
  - Q-051: the first Tab on the start screen lands on "English".
  - Q-043: after picking a side, focus is on the table; Esc on the play-mode stage puts focus on the slip; after resign, focus is on the telex's New game; Esc (Review board) puts it on the slip.
  - Q-046: the menu takes arrows, Home and End; Esc and Tab return focus to ☰; closing Settings returns focus to ☰.
  - Q-045: one announcer region at 1440, with the rail open or collapsed.

## 6. Owner decisions
OD-1 to OD-3 from the triage, plus two new ones:
- **OD-4:** K-003, Quagmire #42 "cancels NORAD".
- **OD-5:** whether to commit the 84 app screenshots (55 MB).

## 7. Remaining issues
See the `remaining` list.
