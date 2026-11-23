# QA round 2: long games (r2-long)

Agent: r2-long. Dev server port 5183 (`TSP_NO_HMR=1`), production preview 4183. Scratch dir (tools, runs, full-size
screenshots): `$SP/r2-long`
(below: `$S`).

Progress: **done.** 5 dev games (G1–G3 to the end at sizes / seeds / languages round 1 did not use, G4 four turns at
normal speed, G5 an extra full game at 1600×900 zh) and 2 production sessions with the full-strength AI (P1 1×, P2 CPU ×4),
plus targeted probes. 3 findings (2 major, 1 minor), none an owner decision. Dev server 5183 and preview 4183 stopped; no
Chromium left open.

Summary, most severe first:
* **2 (major)** The AI's pinned reveal dock covers the scoring sheet's table when the sheet docks right (the AI plays
  Europe, Africa, Central or South America Scoring); at 1280×720 only the Total row stays readable. The same dock also
  covers the result line of an AI space-race dice tray.
* **3 (major)** Every AI space-race play shows a target country ("SPACE RACE → NORWAY" / "太空竞赛 → 英国") in the dock and
  the slip: the roll's space box is read as a country id.
* **1 (minor)** A Defectors-cancelled AI headline card flies to the discard pile from the draw deck, after its paper has
  already slid there.
* Otherwise the screen matched the game at all 1318 checkpoints (map, tracks, hand and spines, piles, AI hand, China Card,
  effects, log); all 55 scoring plays and the 3 final scorings (China Card row included) were right; the log matched every
  public event; reload → Resume with the v2 save was exact in dev and production; the still-thinking note and the
  once-per-session 20 s hint behaved as specified.

## Tooling

* `$S/tools/qa-play.mjs`: the current `src/ui/screens/demo/play.mjs` (autopilot driver, clicks the real UI) patched with
  QA hooks (`$S/tools/patch-play.mjs`), using `$S/tools/qa-lib.mjs` (round 1's checkpoint library, extended):
  * a **checkpoint at every human prompt** once the slip shows the prompt (runner idle): map (84 boxes: numerals, control
    tint, flipped counters, labels), region plates vs my own scoring, console (turn, AR, DEFCON, VP, mil ops, space),
    hand set + count, China slot, piles, adversary dossier (backs, known cards, count, China mini), In-effect chips vs
    flags, last log entry, danger frame, card-image language, raw i18n keys; a mismatch must persist 4 s to count;
  * new in round 2: **hand spines** at every checkpoint: a spine exactly on the cards the next card covers by ≥ 12 %
    (from the face's `--ov`), none on the rightmost, spine text = the card's name (image alt), side tone class = the
    card's side, spine opaque and caption name hidden unless hovered / focused / staged, spine not covered by the
    neighbour (hit test at its centre and lower part);
  * `--reload-turn N --reload-ar A`: reload mid-turn → Resume, full state fingerprint compared.
* `$S/tools/watch.mjs` (`--watch`): in-page beat watcher: rAF gaps > 50 ms (tagged with what was on stage, and whether a
  QA checkpoint or screenshot was running), long tasks, every card flight (start / end point → the landmark under it),
  stage moments' geometry every 200 ms (inside the table, not over console / slip / hand / adversary, pairwise overlaps);
  `--watch-shots` takes a JPEG when a banner, scoring sheet, papers, reveal dock or dice tray comes up.
* `$S/tools/verify.mjs run.json`: round 1's offline checks (scoring vs my computation vs the sheet, final scoring incl. the
  China Card, banners, deals, headline papers, telex, log raw keys). `$S/tools/logcheck.mjs run.json`: every public frame
  event vs the log's details (and back). `$S/tools/dockcheck.mjs run.json`: reveal-dock texts vs the plays.
* `$S/tools/flightprobe.mjs URL SEED SIDE "stopExpr" OUT [W H speed card lang]`: reaches a seeded moment at instant speed
  through the dev autopilot, switches the speed in Settings, then plays on (env `FP_ANSWER=1`: answers prompts) while it
  records card-flight paths, paper rects, dock / slip / dice texts and the China slot, with screenshots (`FP_SHOT_CONT`,
  `FP_CHINA`).
* `$S/tools/prod-play.mjs` + `$S/tools/prod-hooks.js`: the production driver (below). `$S/tools/montage.mjs`,
  `$S/tools/crop.mjs`: image montages / crops rendered by Chromium.

## Games

| Game | Side | Viewport / lang | Seed | Speed | End | Ending | Answers | Wall | Notes |
|---|---|---|---|---|---|---|---|---|---|
| G1 | US | 1920×1080 en | 3 | fast | T10 | final scoring, USSR +2 (VP before USSR +5) | 292 (397 clicks) | 564 s | 292 checkpoints, 0 failed; 0 fallbacks / mismatches / errors / console warnings; the ending the seed list gives for seed 3 (final scoring) |
| G2 | USSR | 1366×768 zh | 30 | fast | T10 | final scoring, US +6 (VP before US +5) | 285 (376 clicks, 7 keys, 2 dialog) | 582 s | reload + Resume at T6 AR3 (save `TSP2:…`): state identical, +1 "resumed" log line; 285 checkpoints, 2 failed = my harness (a hovered card's own spine, fixed); 439 spines checked (up to 8 per hand), 0 wrong |
| G3 | US | 1280×720 en | 24 | fast | T10 AR2 | Wargames (the USSR AI plays it: USSR +14, minus the 6 VP award → USSR +8, USSR wins) | 237 (323 clicks, 3 keys) | 512 s | as predicted (turn-10 Wargames); 237 checkpoints, 1 failed = my harness (a hovered card covers its neighbour's spine, by design); 1013 spines checked, 0 wrong; 1 autopilot seat-rule fallback (documented, not the app) |
| G4 | USSR | 1536×864 en | 16 | **normal** | T5 start (4 full turns) | – | 116 (154 clicks) | 294 s | `--watch --watch-shots` (23 stage shots); 116 checkpoints, 0 failed; 225 spines checked, 0 wrong |
| G5 | US | 1600×900 zh | 13 | fast | T10 | final scoring, US +7 (VP before US +9) | 296 (395 clicks, 2 keys) | 548 s | extra game (a size and language round 1 did not use); same result as round 1's seed-13 games; 296 checkpoints, 1 failed = my harness (hovered neighbour); 759 spines checked, 0 wrong; dock texts recorded |
| P1 | USSR | 1440×900 en, **production** (`vite preview`, no `?ai`) | – (driver `--policy random --seed 11`) | fast | T3 start (2 full turns) | – | 58 (77 clicks, 1 dialog) | 177 s | full-strength AI; reload + Resume at T2 AR3; 58 checkpoints, 0 failed; 3 page errors = my init script (fixed), not the app |
| P2 | USSR | 1440×900 en, production, **CPU ×4** (SIGSTOP/SIGCONT duty cycle on the renderer, as round 1's qa-prod-perf) | – (`--seed 12`) | fast | T2 start (turn 1) | – | 34 (46 clicks) | 455 s | the 20 s hint: see Checks; reload + Resume at T1 AR5; 34 checkpoints, 0 failed; 0 errors |

## Checks

### Screen vs view model (dev games, `?ai=policy`, autopilot through the real UI)

* **Checkpoints at every human prompt:** G1 292 + G2 285 + G3 237 + G4 116 + G5 296 + P1 58 + P2 34 = **1318**, at
  1920×1080, 1366×768 (zh), 1280×720, 1536×864 (normal speed), 1600×900 (zh) and 1440×900 (production, 1× and ×4): **0 real mismatches** after the
  animations settled (map numerals / control / flipped counters / labels for all 84 boxes, region plates vs my own scoring,
  turn, AR, DEFCON, VP, mil ops, space race, hand set and count, China slot and the AI's China mini, deck / discard / removed,
  AI hand backs / known cards / count, In-effect chips vs flags, last log line, danger frame, card-image language, no raw
  i18n keys). The 4 failed checkpoints were all my spine probe (a hovered card's own spine; a hovered card lifted over its
  neighbour's spine, which is the hover design).
* **Hand spines vs the actual cards:** 2436 spined cards checked (G2 439 after its reload, G3 1013, G4 225, G5 759; up to 8 spines
  in a hand; G1 at 1920 (9-card hands) and P1/P2 at 1440 (≤ 8 cards) never had a card covered by ≥ 12 %, so no spines, which
  the probe checks too): every spine sits exactly on a card covered
  by ≥ 12 %, never on the rightmost card, its text is the card's name in the current language (en at 1280 / 1536, zh at 1366 / 1600), its tone is the
  card's side, it is opaque with the caption name hidden unless the card is hovered / focused / staged, and no neighbouring
  card covers it.
* **Log vs what happened** (`$S/tools/logcheck.mjs`): every frame event of VP, DEFCON, mil ops, die rolls (coup, realign,
  war, space, Olympics, trap), influence (G1 316, G2 293, G3 258, G5 318 changes) and effects on / off has its log detail with the
  same numbers, and no log detail lacks its event, in all games. (A step with two VP or DEFCON changes logs their sum; the
  final scoring has its own "Final scoring: …" line.)
* **Scoring** (`verify.mjs`): 55 scoring plays (G1 13, G2 12, G3 11, G4 5, G5 14), each: engine VP = my computation from the board
  = the sheet's status chips, total row and net. **Final scoring** (G1, G2, G5): the six region rows match my computation,
  the China Card row is there (G1 US +1, G2 and G5 USSR +1), the net equals the VP change (G1 −5 → −2 "NET US +3"; G2 5 → 6
  "净得 美国 +1"; G5 9 → 7 "净得 苏联 +2").
* **Turns:** turn banners T2–T10 with the era stamp at T4 ("MID WAR: NEW CARDS SHUFFLED IN" / "战争中期：新卡牌已洗入抽牌堆")
  and T8; "Headline phase" plate every turn; hands 8/8 (T1–T3) and 9/9 (T4+) at each headline; 44 headline pairs match
  `headline-reveal` (incl. Defectors twice in G1, scoring-card headlines).
* **Endings:** G1/G2/G5 final scoring, G3 Wargames at T10 AR2 ("Wargames ended the game: after its 6 VP award to the opponent,
  the USSR was ahead", "Turn 10 · AR 2"), each the ending the seed list predicts; telex verdict, VP, VP before final
  scoring (final-scoring endings only), coups, AI decisions and the VP chart present; 0 page errors, 0 console warnings.

### Animations (`--watch`; G4 at normal speed, the others fast)

* **Flights:** 663 card flights recorded (G1–G5) with their start / end landmark. Deals go deck → the AI dossier (backs) or deck →
  the centre of your hand (faces); plays go hand card → discard / removed; reshuffles discard → deck; Grain Sales–type
  takes adversary → your hand; known AI cards start at the adversary dossier. One wrong origin: finding 1.
* **Stage geometry** (every 200 ms): banners, papers, dice and docks stay in the table and off the console / slip / hand,
  except transients (a sheet sliding in from 12 px outside, papers dropping in from 14 px above the table at 1280×720, a
  cancelled paper sliding into the pile) and finding 2. A space-race dice tray at the top touches the pinned dock's left
  edge by ~28 px (G4: "needs 4 or less" partly under the dock), too small to file on its own.
* **Pacing** (headless Chromium, shared CPU): G4 at normal speed 16 764 frames in 295 s (57 fps), 75 rAF gaps > 50 ms, the
  longest 100 ms, one long task > 100 ms (at load); G1 (fast) longest gap 150 ms. No stall worth a finding; real-GPU jank
  can't be judged headless.
* **Reveal dock vs the plays** (G5, every 150 ms): 136 distinct dock texts, each card = a `card-played` of that card in
  the frames just before; 4 flagged, all finding 3.
* **Seen at normal speed** (23 stage shots of G4, montages `$S/runs/G4-montage-*.jpg`): headline plate, papers, reveal dock,
  dice trays, scoring sheets (Asia headline by the AI, Europe, Middle East, SE Asia), deal flights, turn banners with the
  T4 era stamp: nothing else out of place. The **China Card passing** (no China play in G4's four turns) was watched
  separately at normal speed (seed 3, T4 AR5, the USSR AI plays it, `$S/runs/fp-china*`): your slot turns face down and the
  card arrives from the adversary dossier in 0.7 s; the dossier's China mini disappears ~1 s later, at the frame's end.

### Production build (full-strength AI)

`npx vite build --outDir $S/dist` (no `__tsp` / `__tspAuto` in the bundle), `npx vite preview --outDir $S/dist --port 4183`.
Production has no `window.__tsp`: `$S/tools/prod-play.mjs` (= qa-play.mjs + `$S/tools/prod-hooks.js`, injected with
`addInitScript`, test side only) finds the controller through a React DevTools hook, times every AI decision by wrapping
`Worker` (`decide` → `decision`), and samples the slip's still-thinking note every 250 ms. The human side plays at random
(`--policy random`, no game-ending moves); the checkpoints run as in the dev games (data modules imported from the dev server).

* **P1, 1×** (this machine, i9, shared with other agents): after the reload the AI was ready from the Cache API in 0.3 s (one worker). The
  AI's decisions after the reload: 17, median 0.34 s, p90 8.2 s, max **10.1 s** (belief search, 70 k rows). "Still thinking ·
  8 s" appeared on the two decisions over 8 s and counted 8 → 9 on the second; the number's box stayed at x 107, 15 px wide,
  and the slip at 344 × 153 px while it counted. No 20 s decision at 1×, so no hint (sessionStorage key absent). The save
  is `TSP2:…` (2.5 kB); no request left localhost.
* **P2, CPU ×4**: before the reload 32 AI decisions, median 2.9 s, p90 24.3 s, max 29.3 s; after the reload 8 decisions,
  max 40.5 s (the first one after Resume includes the worker's belief replay: 33.5 s). The note showed on 11 decisions
  (8 → up to 29 s), ticking once a second with no shift (the number box keeps its x for the whole decision; the note is 320 or
  253 px wide depending on the slip's crumb, the slip 153 px tall throughout). **The hint** came once, on the first
  decision past 20 s ("Still thinking · 21 s. At full strength the AI can take up to a minute per move on this device.", 3
  lines inside the slip, slip height unchanged); the four later 24–29 s decisions showed only the count; after the reload
  (same tab) decisions of 33 and 40 s showed only the count (`ts-playfield.aiSlowHint` = "1"). No toast at 1440 (correct:
  the slip has room). (Tablet toast form not exercised here: the r2-tablet-touch agent's area.)
* **Reload mid-turn → Resume** (P1 T2 AR3, P2 T1 AR5, and G2 T6 AR3 in dev): the start screen offers "Resume game · Turn N ·
  AR k · you play the USSR"; after Resume every field of my state fingerprint (board, hands, AI hand count / known cards,
  China Card, piles, flags, VP, DEFCON, mil ops, space, the open prompt and its options) equals the one before the reload;
  the log gains exactly one "Game resumed" line; the save stays `TSP2:` (unreadable as text). The AI then continued
  normally (P1 to turn 3, P2 to turn 2, G2 to its predicted final scoring, US +6).


## Findings

### 1. A Defectors-cancelled AI headline flies to the discard pile from the draw deck (minor)

* Repro (two runs): (a) G1: `node $S/tools/qa-play.mjs --url http://localhost:5183/TS_playfield/ --side US --until end
  --game-seed 3 --w 1920 --h 1080 --lang en --watch --qa-out $S/runs/G1.json` (dev, `?ai=policy`, fast); turn 1 headlines:
  US **Defectors** vs USSR **Vietnam Revolts** (cancelled). The flight recorder logs card 9 `pile:deck → pile:discard`.
  (b) normal speed, 1440×900 en: `FP_ANSWER=1 FP_SHOT_CONT=1 node $S/tools/flightprobe.mjs
  http://localhost:5183/TS_playfield/ 3 US "v.prompt.kind==='headline'" $S/runs/fp-def 1440 900 normal 9 en`.
* Expected: the cancelled paper gets its CANCELLED stamp and slides to the discard pile (it does: HeadlinePapers' fold,
  ~1.6–2.0 s after the reveal); nothing else moves, or the card moves from the paper / the AI's headline slot.
* Actual: 250 ms after the paper has slid into the discard pile, a second, small face-up *Vietnam Revolts* starts **on the
  draw deck** (flight path at x 1040, y 755 = the deck pile's rect 1036,751) and arcs down into the discard pile
  (normal speed: 290 ms). It reads as "a card was drawn from the deck and discarded". The frame's event is
  `card-moved 9 UNSEEN → DISCARD_PILE` (the AI's card was never public in a hand); `flightFor` maps `UNSEEN` to the
  deck unless the card is the reveal dock's `aiPlayCard`, and a cancelled headline never reaches the dock. The second
  Defectors headline of G1 (T7, vs Sadat Expels Soviets) was a *known* AI card and flew from the adversary dossier.
* Evidence: `docs/qa/shots/r2-long/f-cancelled-headline-flies-from-deck.jpg` (left: the card face on the deck pile;
  right: lifting off it); `$S/runs/fp-def.json` (flight paths, paper rects per frame).
* Likely files: `src/ui/runner/locations.ts` (`flightFor`: skip, or start at `headline:USSR`, for a committed headline that
  `cancelledHeadline` finds in the frame), `src/ui/runner/FlightLayer.tsx`, `src/ui/stage/model.ts` (`cancelledHeadline`).

### 2. The reveal dock covers the scoring sheet when the AI plays Europe, Africa, Central or South America Scoring (major)

* Repro (twice, plus 3 sightings in the full games): (a) 1280×720 en, normal speed: `FP_ANSWER=1 FP_SHOT_CONT=1
  FP_CONT_WAIT=600 node $S/tools/flightprobe.mjs http://localhost:5183/TS_playfield/ 24 US "st.turn===3 &&
  st.action_round===1 && v.prompt.kind==='action-card'" $S/runs/fp-sheetdock 1280 720 normal 2 en` (dev, `?ai=policy&seed=24`;
  the USSR AI plays **Europe Scoring** at T3 AR2). (b) 1920×1080 en: the same with seed 3, stop
  `"st.turn===5 && st.action_round===5 && v.prompt.kind==='action-card'"` (the AI plays **Africa Scoring** at T5 AR6).
  The beat watcher logged sheet + dock overlaps in all four full games (G1 1920: Africa at T5; G2 1366 zh; G3 1280: Europe
  at T3; G5 1600 zh: Europe at T5, sheet 716–1236 × 178–607 with the pinned dock 1000–1200 × 92–350 through the sheet's
  in / rows / net / read phases).
* Expected: while the sheet waits for Continue, its whole table is readable (header with the US | USSR columns, status
  chips, every row), as for the human's own scoring plays and for the regions that dock left.
* Actual: these regions dock the 520 px sheet on the **right** (spec §10.2 as built: C./S. America, and Africa / Europe by
  `pickSheetSide`), which is where the AI's pinned reveal dock sits (table right 64 px, top 34 px; it stays pinned while
  the sheet is up and is painted **above** it: `RevealDock` comes after `ScoringSheet` in `Stage`). Measured: 1280×720 sheet
  444–964 × 74–509, dock 728–928 × 92–349 → the dock hides the column headers, the status chips and the US/USSR values of
  Status, Countries, Battlegrounds, Adjacent and Status VP; only "Total 5 / 10" and the net bar remain. 1920×1080: sheet
  1036–1556 × 178–655, dock 1320–1520 × 92–349 → the column headers, card number, status chips and half of the Countries
  row are hidden.
* Same cause, smaller: an AI space-race play's dice tray sits at the console's space track, just left of the pinned dock,
  and its result line slides under the dock as it widens (G4 1536×864: "Roll 5 · needs 4 or less · FAILS" reads "Roll 5 ·
  needs (", left panel of `f-space-race-target-norway.jpg`; G5 1600×900 zh: tray 889–1058 × 66–140 under the dock
  1000–1200 × 92–350 in its "math" phase).
* Evidence: `docs/qa/shots/r2-long/f-dock-covers-scoring-sheet-1280.jpg` (full screen),
  `docs/qa/shots/r2-long/f-dock-covers-scoring-sheet-1920-crop.jpg`.
* Likely files: `src/ui/stage/ScoringSheet.tsx` / `src/ui/stage/model.ts` (`pickSheetSide`: also avoid the dock, or move the
  sheet down below it), `src/ui/stage/stageStore.ts` (release / collapse the dock when a scoring sheet opens, or move it
  to `pos: "left"` as `onCountry` does for a covered country), `src/ui/stage/Stage.tsx` (paint order).

### 3. AI space-race plays name a country: "SPACE RACE → NORWAY" in the reveal dock and the slip (major)

* Repro (twice): (a) G4 (`QA_READY_MS=90000 node $S/tools/qa-play.mjs --url http://localhost:5183/TS_playfield/ --side USSR
  --until 5 --game-seed 16 --w 1536 --h 864 --lang en --speed normal --watch --watch-shots --qa-out $S/runs/G4.json`):
  T1 AR4 the US AI plays **Decolonization** for the space race. (b) seed 3, 1440×900 en, normal speed:
  `FP_ANSWER=1 FP_MS=14000 node $S/tools/flightprobe.mjs http://localhost:5183/TS_playfield/ 3 US "st.turn===4 &&
  st.action_round===6 && v.prompt.kind==='action-card'" $S/runs/fp-space 1440 900 normal 70 en` (T4 AR7 the USSR AI plays
  **OAS Founded** for the space race; texts recorded every 100 ms in `$S/runs/fp-space.json`).
* Expected: "SPACE RACE · 1 OP" in the dock, "OAS Founded › Space race" in the slip (a space attempt has no country).
* Actual: once the die rolls, the dock reads **"SOVIET UNION PLAYS · OAS FOUNDED · SPACE RACE → NORWAY · 1 OP"** and the slip
  crumb **"OAS Founded › Space race → Norway"**; (a) "UNITED STATES PLAYS · DECOLONIZATION · SPACE RACE → NORWAY · 2 OPS",
  slip "Decolonization › Space race → Norway". The engine's `SPACE_RACE` roll record carries the space box in `country_id`
  (1–8: in my four games 1 = United Kingdom, 2 = Norway, 3 = Sweden, 4 = Denmark, 5 = Finland; the log correctly reads it
  as `box`), and both handlers take any `country_id` in 0–83 as the play's target. Every AI space-race play shows it
  (11 space plays in G1 alone, about half of them the AI's).
* Third sighting, zh (G5, 1600×900, seed 13, `$S/tools/dockcheck.mjs $S/runs/G5.json`): all 4 of the USSR AI's space plays:
  "苏联打出 卧倒并掩护 · 太空竞赛 → 英国 · 3 行动点", "向苏联出售粮食 · 太空竞赛 → 英国", "推倒这堵墙 · 太空竞赛 → 挪威",
  "星球大战计划 · 太空竞赛 → 瑞典".
* Evidence: `docs/qa/shots/r2-long/f-space-race-target-norway.jpg` (dock and slip, G4 T1 AR4).
* Likely files: `src/ui/stage/stageStore.ts` `onRoll` (sets `dock.country` from `roll.country_id` for every roll type),
  `src/ui/prompts/OrdersSlip.tsx` `useAiPlay` (`offRoll` sets `target` likewise): only COUP / REALIGNMENT / WAR_EVENT rolls
  name a country (as `diceAnchor` in `src/ui/stage/model.ts` already does). The announcer (`src/ui/rail/Announcer.tsx`) does not read `country_id`.

