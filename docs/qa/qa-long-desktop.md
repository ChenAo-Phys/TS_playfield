# QA: long desktop games (qa-long-desktop)

Agent: qa-long-desktop. Dev server port 5183 (`TSP_NO_HMR=1`), preview 4183. Scratch dir (tools, runs, full-size
screenshots): `$SP/qa-long-desktop`
(below: `$S`).

Progress: **done.** 7 games played (A–F, E twice), Menu and targeted repros run; 8 findings (2 major, 3 minor, 3 polish) plus driver notes. Dev server stopped.

## Tooling

* `$S/tools/qa-play.mjs`: a copy of `src/ui/screens/demo/play.mjs` (the autopilot driver; clicks the real UI) with QA hooks
  (`$S/tools/qa-lib.mjs`):
  * **Checkpoint at every human prompt**, once the slip is in `prompt` mode (runner idle, `queued 0`); a mismatch must
    persist for 4 s to count. It compares the screen with `window.__tsp.getSnapshot().frame.state`:
    map (all 84 boxes: both counters' numerals, box control tint, flipped counters, `aria-label` numbers), region plates
    ("if scored" net vs **my own scoring** of the board), console (turn, AR, DEFCON numeral + lamp data, VP readout/label,
    mil ops need + both values, space race), hand (card set + count label), China slot view, headline slot, piles (deck /
    discard / removed counts, label and text), adversary dossier (card backs = `aiHandCount − known`, known minis, "N cards
    in hand", China mini up/down), In-effect chips vs `state.flags`, DEFCON-2 danger frame, last log entry shown, card image
    language vs the Settings value, and a page-wide scan for raw i18n keys / `{{…}}` / `undefined` / `NaN`.
  * A frame recorder (every frame's events, compact board on scoring / game-over frames) and a MutationObserver that keeps
    every scoring sheet, turn banner, headline paper and telex as shown.
  * QA moves: `--lang-turn N` (en→zh at AR2, back at AR5), `--undo-turn N` (Undo button, compares the state with the one at
    the card prompt), `--reload-turn N` (reload + Resume; compares a full state fingerprint), `--settings-turn` /
    `--settings-back-turn` (Settings dossier by clicks: speed, pause on reveals, card images), `--new-game-after`.
* `$S/tools/verify.mjs run.json`: offline checks: every scoring play (my computation from the recorded board vs the
  engine's event vs the sheet's status chips, total row and net), the final scoring sheet, deals / reshuffles / hand sizes
  per turn, turn and era banners, headline papers vs `headline-reveal`, telex, raw keys in the log.
* `$S/tools/menu.mjs`: Menu → New game (confirm, Resume, real new game) and Menu → Resign → telex → New game.
* `$S/tools/reach.mjs` / `$S/tools/uianswer.mjs` / `$S/tools/papers.mjs` / `$S/tools/picker.mjs`: reach a seeded state fast
  (the dev autopilot answers through the controller at speed instant), then screenshot it or answer the next prompts through
  the real UI (dossier tile → primary ↵ / hold).

## Games played

| Game | Side | Viewport / lang | Seed | End | Ending | Answers | Wall | Notes |
|---|---|---|---|---|---|---|---|---|
| A | USSR | 1440×900 en | 13 | T10 | final scoring, US +7 (VP before 9) | 290 | 629 s | zh T2 AR2–AR5, undo T2, reload + Resume T5 AR1, Settings T6 (speed **normal**, pause off, card images 中文) → T8 back (fast, pause on, follow) |
| B | USSR | 1440×900 en | 16 | T10 | final scoring, USSR +3 (VP before 0) | 297 | 588 s | Undo button ×2 at T3 (state = the card prompt's, log included). The driver crashed after the telex (my selector), so B's recorder file was lost; its 297 checkpoints passed (log) and the final sheet / telex screenshots were kept |
| C | US | 1440×900 en | 30 | T10 | final scoring, US +6 (VP before 5) | 309 | 600 s | Undo button ×2 at T6 (state = card prompt's), reload + Resume at T7 AR1 (state identical, +1 "resumed" log line), telex → New game → start screen with no Resume |
| D | USSR | **1366×768 zh** | 38 | T10 | final scoring, USSR +7 (VP before US +1) | 298 | 626 s | Undo button ×2 at T5; whole game in Chinese (condensed console). 1 driver fallback at T8 (SALT Negotiations' discard pick): **driver selector, not the app** (see Notes) |
| E, E2 | US | 1440×900 en | 12 | T3 AR6 | 20 VP, USSR (VP before USSR +15) | 76 | 158 s | played twice (same seeded game); E2 with a screenshot at every scoring sheet |
| F | US | 1440×900 en | 11 | T10 AR1 | Wargames (US +10 → +4): finished by `uianswer.mjs` | 264 | 642 s | zh T4 AR2–AR5. 5 driver fallbacks (Our Man in Tehran ×4, Star Wars) and a stall at the Wargames branch: **driver selectors, not the app** (Notes); every one answered through the real UI by `$S/tools/uianswer.mjs` |

All games: dev server with `?ai=policy` (both seats network argmax), speed fast unless noted, pause on reveals on unless
noted; 0 autopilot fallbacks, 0 mismatches (the UI never chose another option than the one pressed for), 0 page errors.
Driver fallbacks only in D and F, all from the driver's selectors (Notes).

## What was checked (all games)

* **Screen vs view model at every human prompt:** 292 (A) + 297 (B) + 309 (C) + 298 (D, zh 1366) + 76×2 (E) + 264 (F)
  = 1612 checkpoints over turns 1–10, en and zh, before and after reload, at normal and fast speed: **0 mismatches** after
  settling (map numerals / control / flipped counters / labels for all 84 countries, region plates vs my own scoring,
  turn, AR, DEFCON, VP, mil ops, space, hand, China slot and AI China mini, piles, AI hand backs / known cards / count,
  In-effect chips, danger frame at DEFCON 2, last log entry, card-image language, no raw i18n keys on the page).
* **Scoring:** 59 scoring plays (A 14, C 12, D 14, E 5, F 14: all six regions, SE Asia, Europe at net 0, scoring-card
  headlines, zh sheets, Shuttle Diplomacy twice) recomputed from the recorded board: engine event = my computation = sheet
  status chips, total row and net in every case except the 20-VP cap (finding 4). Final scoring (A, C, D): region rows
  right, net off by the China Card (finding 1; B the same from its screenshot).
* **Turn flow:** hands 8/8 at the T1–T3 headlines and 9/9 from T4 in every game; deck counts and reshuffles (T3, T7 in each
  long game); turn banners T2–T10 with the era stamp at T4 ("MID WAR: NEW CARDS SHUFFLED IN", zh "战争中期：新卡牌已洗入抽牌堆")
  and T8 ("LATE WAR…" / "战争晚期…"); the "Headline phase" plate every turn.
* **Headline papers:** all 43 headline pairs of A, C, D, E, F match `headline-reveal` (en and zh names), incl.
  scoring-card headlines; Defectors: see finding 3.
* **Log sample:** every coup/realignment/space/war roll of C's turns 7–10 checked against the Dispatches text (die, mods,
  totals, result); no raw keys / `{{…}}` / `undefined` in any shown line except finding 7.
* **Undo** (Undo button, 6 times in B, C, D): the state after undo equals the state at the card prompt (board, hands, piles,
  tracks, flags, prompt options and the log). **Language switch** en→zh→en mid-turn (A, F): checks passed in zh.
  **Reload + Resume** (A T5, C T7): identical state and prompt, one "Game resumed" log line; the AI continued and A ended
  exactly like the prep-phase run of the same seed without a reload (US +7). **Settings** by clicks (A): speed Normal (T6–T7),
  pause on reveals Off, card images 中文 (hand images switched to `cards/zh/`), then back (fast, on, follow).
* **Game over:** telex for final scoring (B, C, D), 20 VP (E), resign (`menu.mjs`) and Wargames (seed 11, `uianswer.mjs`): verdict, stamp
  (none on resign), reason sentence, final VP, turn·AR, coups (= the frames' COUP rolls by roller), playing time, AI
  decisions, VP-by-turn chart (= VP at each turn end). New game from the telex → start screen, no Resume (C, D, E).
* **Menu** (`$S/tools/menu.mjs`): New game → "Abandon this game?" → start screen with Resume → Resume returns to the
  identical game; New game again → picking a side starts at setup with no second prompt; Resign → a 0.3 s press does
  nothing, a hold resigns → telex "The US resigned", no stamp, save deleted → New game → no Resume.
* Console: 0 page errors in every run; 0 console warnings in F (the run that recorded them), `papers.mjs` / `picker.mjs` /
  `uianswer.mjs` / `menu.mjs` runs also 0 errors and 0 warnings.

## Findings

### 1. Final scoring sheet leaves out the China Card VP: the net it shows is not the VP change (major)

* Repro: `node $S/tools/qa-play.mjs --url http://localhost:5183/TS_playfield/ --side USSR --until end --game-seed 13
  --qa-out $S/runs/A.json` (1440×900 en, dev server, `?ai=policy`). Final scoring at the end of turn 10; the USSR holds the
  China Card.
* Expected: the final scoring sheet's net equals the VP change of final scoring, i.e. it includes the +1 VP for the China
  Card holder (rule 10.3; the engine adds it in `Scoring::execute_final_scoring`), shown as its own row.
* Actual: rows Europe 6/6, Asia 13/4, Middle East 6/5, Africa 3/3, C. America 2/7, S. America 0/6, Total 30/31, footer
  **"USSR SCORES · NET USSR +1"**, while the VP gauge moves US +9 → **US +7** (−2). The sheet has no China Card row.
  The per-region rows are right (they match my own computation of the board).
* Second game (B, USSR seed 16, China Card with the USSR): rows total 30/32, footer "NET USSR +2", VP Even → USSR +3
  (−3); the telex then says "The USSR leads by 3 VP after Final Scoring" right after a sheet that said +2.
* Also C (US seed 30): rows 34/32 "NET US +2", VP US +5 → US +6 (+1; China Card with the USSR); D (zh, seed 38):
  rows 28/37 "净得 苏联 +9", VP US +1 → USSR +7 (−8; China Card with the US).
* Evidence: `docs/qa/shots/qa-long-desktop/f1-final-sheet-no-china-B.jpg` (B: "NET USSR +2" on the sheet, the log line
  beside it says "0 (Tie) -> -3 (USSR)"); `$S/runs/A.verify.txt` (A's numbers and my recomputation).
* Likely files: `src/ui/stage/stageStore.ts` (game-over beat: `net = Σ regions[slot ≤ 5].net`), `src/ui/stage/ScoringSheet.tsx`
  (`FinalTable`: no China Card row). Also, the net is not clamped to ±20 like the engine's total.

### 2. Log: when the game ends on the Eagle / Bear Has Landed discard, final scoring is credited to that discard (minor)

* Repro: game A (`--side USSR --game-seed 13`) and game B (`--side USSR --game-seed 16`), 1440×900 en: the US holds the
  space-race box-6 perk and discards a held card at the end of turn 10; open Dispatches at the end.
* Expected: as in games C and D, a "T10 End of turn 10" entry carrying the turn-end changes and the final-scoring VP
  (better still, a final-scoring line), then "Game over".
* Actual: A: `AR9 ★ US discards Warsaw Pact Formed (#16) via Eagle / Bear Has Landed (Box 6 privilege). Victory Points:
  +9 (US) -> +7 (US) (-2 VP) …`; B: `AR8 ★ US discards Marine Barracks Bombing (#88) via Eagle / Bear Has Landed … Victory
  Points: 0 (Tie) -> -3 (USSR) (-3 VP)`; then directly `T10 Game over: … Final scoring`. The −2 / −3 is final scoring
  (regions and China Card), not the discard, and there is no "End of turn 10" entry. Turns 1–9 always got one.
* Likely file: `src/game/controller.ts` (step log: the "End of turn N" entry is only written when `crossed`, i.e. the
  settled state differs from the state after the step; the box-6 discard step settles directly in GAME_OVER, so the
  turn-end deltas stay in the discard's details).

### 3. Defectors: a cancelled USSR headline that has more Ops is shown as resolving first, never as cancelled (major)

* Repro: `node $S/tools/qa-play.mjs --url http://localhost:5183/TS_playfield/ --side US --until 2 --game-seed 30
  --qa-out $S/runs/x.json` (1440×900 en, dev, `?ai=policy`). Turn 1 headlines: US **Defectors** (2 Ops) vs USSR **De Gaulle
  Leads France** (3 Ops). Same in that game at turn 9: Defectors vs **SALT Negotiations** (3 Ops).
* Expected: the USSR paper gets the CANCELLED stamp and slides to the discard pile (ui-spec §10.1), as it does when
  Defectors resolves first (same game, turn 5: Defectors vs South America Scoring (0 Ops) → "2ND · CANCELLED"); the log
  says the headline was cancelled.
* Actual: the De Gaulle paper reads **"1ST"** with no stamp, the frame announces `card-played USSR #17 how "headline"`
  (so the stage plays it as the first headline), and then nothing happens (France unchanged; De Gaulle goes to the
  discard pile, as a cancelled card should: the engine is right, the presentation is not). At turn 9, SALT "resolves" but DEFCON does not improve. In all three cases the log
  only says "Resolution Order: 1st USSR 'SALT Negotiations' (3 Ops) -> 2nd US 'Defectors' (2 Ops) · SALT Negotiations (#43)
  discarded · Defectors (#103) discarded" — no word of the cancellation.
* Separate repro with screenshots: `node $S/tools/papers.mjs http://localhost:5183/TS_playfield/ $S/runs/papers 30 1 en`
  → papers "DE GAULLE LEADS FRANCE · 1ST", caption "3 VS 2 OPS · SOVIET UNION RESOLVES FIRST", then the reveal dock shows
  "USSR HEADLINE · DE GAULLE LEADS FRANCE · HEADLINE" followed by "US HEADLINE · DEFECTORS". Evidence:
  `docs/qa/shots/qa-long-desktop/f3-defectors-not-cancelled.jpg`.
* Likely files: `src/game/controller.ts` `headlineStarts` (emits `card-played` for `headline_first_card` even when Defectors
  cancelled it), which defeats `cancelledHeadline` in `src/ui/stage/model.ts` (it looks for a committed card that leaves
  without `card-played`); the headline log lines in the controller.

### 4. A scoring that hits the 20 VP cap shows a net that does not match its own table (minor)

* Repro: `node $S/tools/qa-play.mjs --url http://localhost:5183/TS_playfield/ --side US --until end --game-seed 12
  --shot-sheets --qa-out $S/runs/E2.json` (1440×900 en). Turn 3 AR6, VP USSR +15, the US must play Asia Scoring.
  Seen twice (runs E and E2, the same seeded game).
* Expected: the sheet's net matches its rows (Total US 4 − USSR 10 = USSR +6, which the Asia plate on the map also said:
  "IF SCORED USSR +6"), with a note that the VP track stops at 20 (game over).
* Actual: Total row **4 / 10** but the result bar says **"NET USSR +5"** (the clamped VP change −15 → −20).
* Evidence: `docs/qa/shots/qa-long-desktop/f4-capped-scoring-net.jpg`.
* Likely files: `src/ui/stage/stageStore.ts` `onScoring` (net = the `scoring` event's `vp`, rows = `regionScores`); the
  event's `vp` comes from the controller as the VP-track change.

### 5. Telex: "VP before the ruling" shows after every final-scoring and 20-VP ending (polish, ownerDecision)

* Repro: any game that ends by final scoring or by reaching 20 VP (games A–E).
* Expected: the extra stat only where a rule overwrote the VP (held scoring card: contract `Ending.vpBefore` "VP before the
  engine clamped/overwrote it"), or a label that fits the reason ("VP before final scoring").
* Actual: final scoring: "VP BEFORE THE RULING · US +9" (A), "Even" (B), "US +5" (C), "裁定前 VP · 美国 +1" (D); 20 VP:
  "VP BEFORE THE RULING · USSR +15" (E). `classifyEnding` sets `vpBefore` to the VP before the game-ending step for every
  reason, and the telex shows it whenever it differs.
* Likely files: `src/ui/stage/GameOverTelex.tsx` (`vpChanged` cell), `src/game/rules.ts` `classifyEnding`,
  `ui:over.vpBefore`.

### 6. Chinese VP-chart label runs the turns together (polish)

* Repro: any game over in Chinese (game D): the telex chart's `aria-label` (screen readers).
* Actual: "各回合 VP：开局：持平第 1 回合：美国 +4第 2 回合：美国 +5第 3 回合…" — no separator between points. English
  reads "Start: Even, Turn 1: US +6, Turn 2: …".
* Cause: `Intl.ListFormat("zh-CN", { type: "unit", style: "short" })` joins with an empty string.
* Likely file: `src/ui/stage/VpChart.tsx` (use `type: "conjunction"`/`"、"`, or join with "；").

### 7. Missile Envy's obligation shows as a raw engine flag in the log, and has no In-effect chip (minor)

* Repro: game C (`--side US --game-seed 30`, en) at turn 7 and game D (`--side USSR --game-seed 38`, zh) at turn 10; or
  directly `node $S/tools/reach.mjs http://localhost:5183/TS_playfield/ $S/runs/ui/envy.jpg 38 USSR
  "st.flags.includes('MISSILE_ENVY_USSR')" en` (US headline Missile Envy, the USSR gives Nuclear Test Ban).
* Expected: a translated name ("Missile Envy: the USSR must play it for Ops next" / 中文), and an In-effect chip while the
  obligation stands (the flag is a real restriction: the next action-card prompt offers only Missile Envy).
* Actual: Dispatches show **"In effect: MISSILE_ENVY_USSR"** and "No longer in effect: MISSILE_ENVY_USSR" (zh:
  "生效中：MISSILE_ENVY_USSR" / "不再生效：MISSILE_ENVY_USSR"); the In-effect panel has no chip for it. (The next log line
  does explain it in words: "Missile Envy goes to the USSR hand: the USSR must play it for Ops in its next action round".)
  `MISSILE_ENVY_US` / `MISSILE_ENVY_USSR` are the only engine effect flags missing from the `effects` catalog.
* Evidence: `docs/qa/shots/qa-long-desktop/f7-raw-flag-in-log.jpg`.
* Likely files: `src/i18n/locales/{en,zh-CN}/effects.json` (add the two names), `src/game/describe.ts` `effectName` (falls
  back to the raw flag), `src/data/effects.ts` (an `EFFECT_INFO_MAP` row for the chip, card 49).

### 8. Shuttle Diplomacy's adjustment is applied but not shown on the scoring sheet (polish)

* Repro: game F (`--side US --game-seed 11 --shot-sheets`, 1440×900 en): Asia Scoring at T5 AR7 and Middle East Scoring at
  T7 AR6, both with Shuttle Diplomacy in effect.
* Expected: a line on the sheet ("Shuttle Diplomacy: −1 USSR battleground") so the counts can be matched with the board.
* Actual: the sheet's USSR column says Countries 3 · Battlegrounds 2 (T5 Asia; net Even) while the map shows 4 USSR-controlled
  countries with 3 battlegrounds; nothing on the sheet or in the log ("No longer in effect: Shuttle Diplomacy") says the card
  was applied. The numbers themselves are right (engine = my computation with the rule).
* Evidence: `docs/qa/shots/qa-long-desktop/f8-shuttle-diplomacy-unexplained.jpg`.
* Likely files: `src/ui/stage/model.ts` `scoringRows` (the region score carries `ussr.shuttle_diplomacy`),
  `src/ui/stage/ScoringSheet.tsx`.

## Notes (not app defects)

* **Driver (D's fallback):** at turn 8 the autopilot picked OPEC from SALT Negotiations' discard picker. `play.mjs`
  matched `[role=button][data-card="61"]` outside the picker (a log card ref) and `answerDialog` uses
  `[role=dialog]` `.last()`, which was the **card zoom** (also `role=dialog`) that hover had opened over the picker after
  the driver's Continue click left the mouse there. Through the real UI the picker works: `node $S/tools/picker.mjs
  http://localhost:5183/TS_playfield/ $S/runs/picker 38 USSR 43 zh 1366 768` → tile click stages, "拿取欧佩克 ↵" takes
  OPEC into the hand. Suggestion for `src/ui/screens/demo/play.mjs`: scope dialogs with `[role=dialog][aria-modal=true]`
  and prefer the open dossier's `[data-card]` over page-wide matches.
* **Driver (F's fallbacks and stall):** the same selector problem with Our Man in Tehran's drawn-card picker (T5, four
  discards), Star Wars' discard picker and then the Wargames branch (the stall). Through the UI all of them work:
  `N=6 node $S/tools/uianswer.mjs http://localhost:5183/TS_playfield/ $S/runs/ui/tehran.jpg 11 US
  "v.prompt.kind==='event-card' && v.prompt.resolvingCard===108" en` (tile → "DISCARD KOREAN WAR ↵" ×4 → "DONE — RETURN THE
  REST ↵"), and the same with `"st.turn===10 && v.prompt.kind==='event-card'"` (tile → "TAKE WARGAMES ↵", then the Wargames
  dossier's hold button ends the game: telex "Wargames ended the game: after its 6 VP award to the opponent, the US was
  ahead").
* Flags without an In-effect chip: `SPACE_*_ATTEMPT_n` (space attempts used this turn; fine) and `MISSILE_ENVY_*` (finding 7).
* Game state turn reads 11 after final scoring (`state.turn`); the console still shows turn 10 / "END OF TURN 10" and the
  telex "Turn 10". Fine.
