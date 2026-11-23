# QA report: qa-rules-flow (decision prompts, rare events, both languages)

Scope: every kind of decision the engine asks the human, presented and answerable in the UI, in English and Chinese.
Method: seeded random games in Node through the real controller and WASM engine (StubAi opponent, random human) harvest the first
states where the human faces each prompt signature; each state is written in the browser's save format (`ts-playfield.game.v1`),
loaded in the dev app (Resume) and checked: prompt kind and title, map/hand/picker targets vs `prompt.options`, the answer made
through the UI (click / tap / Enter / hold, never `__tsp.choose`), and the state after the answer.
Scripts (scratch): `harvest/harvest.test.ts`, `check.mjs`, `plan.mjs`, `planE.mjs`, `summ.mjs` in
`$SP/qa-rules-flow/`.

Progress: complete. 400 harvested games (StubAi opponent, random human, seeds 500000+g); 132 prompt signatures + 12 special flows +
33 no-decision events / ordering cases + 20 warned (game-ending) options + 12 ending flows, each answered through the UI in **en and
zh** at 1440x900 (dev server, `?ai=policy`, speed fast): 418 browser checks, all answered with the intended option (the
first English pass had 9 misses, all limits of the checker script: picker vs rail selector, hold-only rows, a Done that needs a second
press; each was re-run with the fixed script or a probe and passed), map/hand/picker
targets equal to `prompt.options` in every case, no page errors. Node cross-checks: realignment odds (493 targets) and coup odds (200
targets) against an independent rules computation; zh rendering of all 394 distinct prompt titles / warnings. Results:
`res-*.json`, logs `run-*.log`, screenshots `shots/<plan>/` in the scratch dir.

## Findings

### F1 (major): DEFCON dossier says "Ends the game — you lose" when DEFCON 1 would make the human WIN

- Repro: saves in `$SP/qa-rules-flow/saves-defcon1-win.json`
  (3 states). Load one with `probe/defcon1.mjs en` (same dir), or by hand: dev server, `?lang=en&ai=policy`, put the `save` string in
  `localStorage["ts-playfield.game.v1"]`, reload, Resume. 1440x900.
  - game 359, US, turn 9 AR 7: the AI (USSR) played Star Wars for Ops, the US event lets the human take How I Learned to Stop
    Worrying from the discard pile; DEFCON is 2.
  - game 83 (US, turn 8 AR 3) and game 86 (USSR, turn 5 AR 4): the AI played Summit for its event and the human won the roll.
- Expected: the engine (`card_dispatcher.cpp` "the phasing player takes the loss", regression test
  `SummitDefconOneLossFallsOnPhasingPlayer`) and the controller's own warning on that option
  (`game-ending {winner: <human>, reason: "defcon", faces: 6}`) say the human **wins**. Per ui-spec §8.2 / §8.3 (as built) a certain
  game end the human wins stages with severity "caution": no hazard ring, no hold, and the copy from `warningMessage(w)`
  ("…the US wins").
- Actual: lamp 1 is hazard-striped with the caption "ENDS THE GAME — YOU LOSE" (aria-label "DEFCON 1 · Ends the game — you lose"),
  the confirm is a hazard "press and hold" button, and How I Learned's detail line reads "DEFCON 1 ends the game, and you would lose."
  The player is told that a game-winning move loses, so they will not take it. Reproduced on all 3 states. Holding through it
  anyway (scratch `planW-en.json`, items `warn_game_ending_defcon_level-*`) ends the game as the engine says: "AR3 US sets DEFCON to 1
  (degrade) (Summit) … Game over: US — Nuclear war (DEFCON 1)" with the human as the US, i.e. a win. (Olympic Games' boycott at
  DEFCON 2, the same kind of win, gets the right commit policy: it stages without a hazard or hold; see F8 for how it is shown.)
  Same in zh ("游戏结束——你输了", detail "DEFCON 1 会结束游戏，而你将输掉游戏。").
- Evidence: `docs/qa/shots/qa-rules-flow/defcon1-win-hilsw-us-en.jpg`, `docs/qa/shots/qa-rules-flow/defcon1-win-summit-us-en.jpg`.
- Likely files: `src/ui/prompts/DefconDossier.tsx` (`defconCaption` returns "ends" for level 1 unconditionally; the caption should
  follow the option's warning: winner = human → e.g. "Ends the game — you win", loser → "you lose"), `src/ui/prompts/policy.ts`
  (`commitFor`: DEFCON 1 is always "hold"; it should use the same `isHumanWin` rule as other game ends),
  `src/game/prompt.ts` + `prompt:card.46.detail` (static "you would lose"; it should depend on who is phasing, or come from the
  warning), `ui_prompts:defcon.ends` (en/zh).

### F2 (minor): Grain Sales with an opponent's card: the "Event first" row carries the whole prompt's instruction

- Repro: any state where Grain Sales draws an opponent's card for the human (harvest signatures
  `play-mode|prompt:card.67.playMode|opp|…`, e.g. `node probe/grain.mjs en 0` in the scratch dir: the AI (USSR) played Grain Sales for
  Ops, the US human drew Che). 1440x900, en (same in zh).
- Expected (ui-spec §8.7): for an opponent's card the Event row explains the order ("A USSR card: if you use it for Operations, its
  Event happens for the USSR (Event first, or after your Ops)", which is what normal play-mode shows).
- Actual: the Event row's description is `prompt.detail` of the Grain Sales prompt: "Play it now, return it and use Grain Sales' 2 Ops,
  or play UN Intervention on it." / "Play it now, or return it to the USSR and use Grain Sales' 2 Ops." It sits inside the
  "EVENT FIRST" button, so it reads as if pressing Event would return the card or play UN Intervention (both have their own rows).
  Seen with Che, Cultural Revolution, "Lone Gunman" and The Cambridge Five.
- Evidence: `docs/qa/shots/qa-rules-flow/grain-sales-event-row-en.jpg`.
- Likely file: `src/ui/prompts/PlayModeStage.tsx` (`PlayModeRows`: `desc={opponent && prompt.detail ? … }` assumes the detail is
  `playModeOpponent`; for `rc === 67` use the opponent wording and show the Grain Sales detail elsewhere, e.g. the slip hint).

### F3 (minor): Vietnam Revolts' +1 (Southeast Asia only) is counted in the influence run with no explanation, and vanishes on the first click elsewhere

- Repro: harvest states `action-card|opsmod|PURGE_USSR_ACTIVE,VIETNAM_REVOLTS_ACTIVE` (USSR, turn 3 AR 4, play Duck and Cover)
  and `action-card|opsmod|BREZHNEV_DOCTRINE_ACTIVE,VIETNAM_REVOLTS_ACTIVE` (USSR, turn 9 AR 7, play Reagan Bombs Libya):
  `node probe/vr.mjs en "<sig>" <card>` in the scratch dir. 1440x900, en. Choose the card → Influence.
- Expected: the run shows the Ops the player can count on, and the slip explains the conditional bonus the way it does for the China
  Card ("The China Card gives +1 Op if every point goes to Asia.", `ui:slip.hint.asiaBonus`; ui-spec §8.6 names Vietnam Revolts
  there too).
- Actual: the play-mode stage says "OPERATIONS · 2 OPS" (Duck and Cover: 3 − 1 Purge), then the influence slip says "3/3 OPS LEFT" with
  three coins and the plain influence hint; after one point in Sweden it jumps to "1/3 OPS LEFT" (crumb "· 2 Ops"): two Ops gone in
  one click. Same with Reagan Bombs Libya: stage "3 OPS", slip "4/4", after one point outside SE Asia "2/4". The China Card case
  (`influence|china`) does show its bonus hint.
- Evidence: `docs/qa/shots/qa-rules-flow/vietnam-revolts-counter-en.jpg` (the "4/4 OPS LEFT" slip).
- Likely files: `src/ui/prompts/OrdersSlip.tsx` (the asiaBonus hint is keyed to `pendingCard === 6`; add a Vietnam Revolts variant
  when `VIETNAM_REVOLTS_ACTIVE` is in effect and the human is the USSR), en/zh `ui` catalogs for the new hint.

### F4 (minor): Missile Envy log line shows the raw engine flag "In effect: MISSILE_ENVY_USSR"

- Repro: harvest signature `event-card|prompt:card.49.card|rc49` (scratch plan `planX-en.json`, items `missileenvy-0-USSR-en`
  and `missileenvy-1-US-en`): give the highest-Ops card when the AI's Missile Envy hits you, then read the Dispatches tape.
  1440x900, en (zh shows the same raw flag: the name comes from the `effects` catalog).
- Expected: effect names in words, like every other "In effect: …" line (e.g. "In effect: Cuban Missile Crisis (played by USSR)").
- Actual: "T8 HL USSR gives Soviets Shoot Down KAL-007 (#89) to the US (Missile Envy) … In effect: MISSILE_ENVY_USSR …" and
  "AR6 US gives Cuban Missile Crisis (#40) to the USSR (Missile Envy) In effect: … In effect: MISSILE_ENVY_US …" (rendered DOM text,
  both cases). These are the only two engine flags without an `effects:<FLAG>.name` entry (checked all 49 flags emitted by
  `bindings/state_json.cpp` against en and zh `effects.json`).
- Likely files: `src/i18n/locales/{en,zh-CN}/effects.json` (add `MISSILE_ENVY_US` / `MISSILE_ENVY_USSR` names, e.g. "Missile Envy:
  the US must use it for Operations" / zh "导弹嫉妒：美国必须将其用于行动"), or treat them as bookkeeping in
  `src/game/describe.ts` (`BOOKKEEPING`) if the exchange line already says it.

### F5 (minor): A coup during the Cuban Missile Crisis is logged as "End of turn N"

- Repro: harvest signature `warn|cmc-suicide|coup-target` (two states: game 16, USSR, turn 6 AR 4; game 322, USSR, turn 5 AR 2).
  Browser: scratch `planW-en.json` item `warn_cmc_suicide_coup_target-lose-USSR-en` (hold the coup on Panama). Node:
  `harvest2/cmc.test.ts` in the scratch dir (both states). en; zh renders the same entry structure.
- Expected: the game ends at once in that action round; the dispatches say so ("Coup during the Cuban Missile Crisis", VP to 20)
  without claiming the turn ended.
- Actual (rendered tape, both states): "AR4 USSR attempts Coup in Panama" → "T6 End of turn 6 · Victory Points: −7 (USSR) → +20 (US)
  (+27 VP)" → "T6 Game over: US — Coup during the Cuban Missile Crisis". The VP swing is filed under an "End of turn" entry in
  the middle of turn 6 (AR 4), and the coup line itself says nothing about the crisis.
- Likely file: `src/game/controller.ts` `stepLog` (the `crossed` branch picks `log:session.endOfTurn` whenever
  `rawAfter.current_phase_name === "GAME_OVER"`; for a mid-turn game end it should attach the VP line to the step's own entry or use
  a "game ends" wording).

### F6 (minor): Latin American Debt Crisis — the USSR's "double influence" step shows the US's decline hint

- Repro: harvest signature `event-target|prompt:card.95.target|rc95` (games 48 and 312, USSR, turn 8): the US declined to discard,
  now the human USSR picks the South American countries to double. Scratch plan `plan-A-en.json` / `plan-A-zh.json` item
  `event_target_prompt_card.95.target_rc95-USSR-*`. 1440x900, en and zh.
- Expected: a hint for the USSR's own choice (e.g. "Up to 2 countries; press Done to stop") — the title already says what to do.
- Actual: the slip's hint is the US-side text of the discard prompt: "Or decline and let the USSR double its influence in 2 South
  American countries." / zh "或者拒绝，让苏联把 2 个南美洲国家的苏联影响力翻倍。" — addressed to the wrong player and offering a
  "decline" that this prompt does not have (its button is the generic "Done").
- Likely files: `src/game/prompt.ts` (event-target branch: `opt("prompt:card.${rc}.detail") ?? remainingDetail()` picks up
  `prompt:card.95.detail`, which belongs to the event-card prompt; use a `targetDetail` key or `remainingDetail()` for rc 95),
  `src/i18n/locales/{en,zh-CN}/prompt.json`.

### F7 (minor): Coup tooltip formula and "Mil ops +N" use the prompt's Ops, not the Ops the coup really gets (China Card outside Asia, SALT)

- Repro: `node probe/couptip.mjs en` in the scratch dir (1440x900): (a) harvest `coup|defcon2|0` (game 7, US, turn 5, DEFCON 2):
  The China Card → Coup, hover Cameroon; (b) a US coup-target state with SALT in effect (game 261, turn 9, Arab-Israeli War → Coup,
  hover Syria). Node cross-check over 200 coup targets: `harvest2/coup.test.ts` (every mismatch is one of these two cases).
- Expected: the tooltip's formula, odds and mil-ops line agree with what the engine will roll: China Card +1 only when all Ops go to
  Asia (no Asian target is legal at DEFCON 2), SALT −1 to the coup roll (Latin American Death Squads ±1 likewise).
- Actual: (a) "5 Ops + ⚀ − 2×1 … Mil ops +5", crumb "The China Card › Coup · 5 Ops", but the dice strip (from `coupOdds`, i.e. the
  engine) shows a 1 → +3, which is 4 Ops; the coup outside Asia gets 4 Ops and 4 mil ops. (b) "2 Ops + ⚀ − 2×2, Success 3/6" with
  the strip failing on a 3: the formula leaves out SALT's −1, so the formula and the odds disagree on the same card.
- Evidence: `docs/qa/shots/qa-rules-flow/coup-tooltip-china-outside-asia-en.jpg`.
- Likely files: `src/ui/prompts/CountryTooltip.tsx` (`CoupSection`: `ops = prompt.opsValue` for the formula and `ui:tip.milops`;
  derive the effective value from the odds (net on a 6 = 6 + ops + mods − 2×stability) or have the controller expose the per-target
  Ops / modifier), `src/ui/prompts/OrdersSlip.tsx` crumb (China Card "· 5 Ops" on a non-Asian coup).

### F8 (minor): Olympic Games boycott that wins the game: the dossier never says so, and the slip's line is cut in half (en)

- Repro: harvest `warn|game-ending|branch` with resolving card 20 (game 25, US, turn 5 headline, DEFCON 2, USSR sponsors; game 154,
  USSR, turn 2 AR 2, US sponsors): `node probe/boycott2.mjs en` / `zh` in the scratch dir. 1440x900. Click "Boycott" in the branch
  dossier.
- Expected (ui-spec §8.3, as built): a certain game end that the human wins stages with the warning shown where the choice is made
  ("This ends the game: the US wins.").
- Actual: the dossier tile still reads only "DEFCON degrades by 1 and the sponsor conducts 4 Ops."; the win appears only in the slip's
  warning panel behind the modal scrim, and in English that line is clipped by its own panel (text 838–852 px, panel `_warn_` clips at
  845 px: the lower half of the glyphs is cut). zh fits (814–839 vs 819–834). Same on both states. (Choosing it does win: "US boycotts
  the Olympic Games … Game over: US — Nuclear war (DEFCON 1)".)
- Evidence: `docs/qa/shots/qa-rules-flow/olympics-boycott-win-dossier-en.jpg`, `docs/qa/shots/qa-rules-flow/olympics-boycott-win-slip-en.jpg`.
- Likely files: `src/ui/prompts/BranchDossier.tsx` (show `warningMessage(w)` on the staged tile / footer for non-fatal game-ending
  warnings too, not only for `isDanger`), `src/ui/prompts/OrdersSlip.tsx` + `OrdersSlip.module.css` (`.warn` height vs its line box
  when it replaces the hint on the headline slip).

### P1 (polish): Defectors fired by Five Year Plan in the headline cancels the USSR headline without saying so

- Repro (Node, deterministic): scratch `harvest2/g107b.test.ts` with `G=107 T=2` (the harvester's game 107: US human headlines Five
  Year Plan, USSR headlines Indo-Pakistani War; the random discard is Defectors). Engine behaviour is legitimate (a US event that
  fires during the Headline Phase cancels the USSR headline).
- Actual: the headline entry reads "… USSR discards Defectors (#103) at random (Five Year Plan) — a US event, so its event fires /
  Five Year Plan (#5) discarded / Indo-Pakistani War (#24) discarded": the revealed USSR headline never resolves and no line says it
  was cancelled by Defectors. The test helper `drive()` (tests/game/helpers.ts) also flags this frame as "1 headline(s) never
  announced as played", because it only expects a missing headline when Defectors is itself one of the two headlines.
- Suggestion: a "cancelled by Defectors" line (and stage beat) for the cancelled headline; teach the helper's check about it.

## Coverage

Legend: OK = presented and answerable in en and zh, result matches the engine; F# / P# = finding above. "Plan" names the scratch plan
(`plan-A-*`, `planX-*`, `planV-*`, `planW-*`, `planE-*`) whose items cover it.

| Area | Prompt / flow checked | Result |
|---|---|---|
| Opponent-event ordering | play-mode on an opponent card: "Event first" (event resolves for the AI, then op-mode for your Ops) and Ops first (influence, then the event); opponent-event footer on the Ops group (planV `opp-*`, plan-A `play_mode…opp…`) | OK (Grain Sales variant: F2) |
| Chernobyl | region prompt: dense 3×2 region grid, stage then commit; log "US designates Middle East (Chernobyl)"; USSR influence targets exclude the region afterwards | OK |
| Grain Sales | play-mode of the drawn card (own / opponent / neutral / scoring), Space row, "Play UN Intervention on it" row, "Return it — take 2 Ops" (stage, 2nd press commits → op-mode 2 Ops) | OK; F2 |
| UN Intervention | from hand (event-card on an opponent card → op-mode with its Ops); on a Grain Sales card | OK |
| Our Man in Tehran | picker of 5 drawn cards, "Discarded n" counter, one discard per click, "Done — return the rest" | OK |
| Missile Envy (give) | in-hand choice among tied highest-Ops cards, both sides, headline and AR | OK; F4 (log) |
| Five Year Plan | no human decision; random discard logged ("USSR discards Korean War (#11) at random"), US event fires | OK; P1 (Defectors case) |
| Blockade | discard a 3+ card (hand stamps) or "Discard nothing — lose W. Germany influence" | OK |
| Latin American Debt Crisis | US: discard 3+ or "Discard nothing"; USSR: double influence in up to 2 South American countries | OK; F6 |
| Latin American Death Squads | no decision; effect chip and log; coup odds include the ±1 | OK (tooltip formula: F7) |
| Wargames | "End the game" (hold, "This ends the game: the US wins") and "Continue" | OK |
| Cuban Missile Crisis | remove 2 influence to cancel (Cuba / W. Germany / Turkey), "Keep the crisis — play on", coup under CMC = hold → loss | OK; F5 (log) |
| SALT Negotiations | discard-pile picker (40+ cards), take or "Take no card"; −1 coup modifier in odds | OK; F7 (formula) |
| Star Wars | discard-pile picker; event fires; picking Duck and Cover / KAL-007 at DEFCON 2 shows the right win / loss warning | OK |
| Ask Not What Your Country… | in-hand discards one per click (scoring cards allowed), Done draws replacements | OK |
| Influence-moving events | Junta (add 2 + free coup/realign or "Skip the free operation"), Che (coup, optional 2nd coup, skip), Muslim Revolution, Marshall Plan, Decolonization, De-Stalinization (remove up to 4, Done, then place), Warsaw Pact (branch then remove/add), COMECON, Socialist Governments, Suez, VOA, Liberation Theology, Ussuri, Reformer, OAS, Colonial Rear Guards, Puppet Governments, Independent Reds, Truman, East European Unrest, South African Unrest, Marine Barracks, Pershing II, Special Relationship, NORAD, Cambridge Five, Brush War, Indo-Pakistani / Iran-Iraq War | OK (targets = options, counters, caps, verbs) |
| Ops modifiers | Containment, Brezhnev, Red Scare/Purge (both sides), Vietnam Revolts and combinations: hand badges show printed Ops (by design), zoom "Effective Ops", play-mode stage header/meta and the influence counter use the effective value | OK; F3 (Vietnam Revolts) |
| China Card | Asia bonus hint on the influence run ("gives +1 Op if every point goes to Asia"), 5-Op run | OK; F7 (coup outside Asia) |
| Space race | Space row text ("box 2 → 3, roll 1–3"), disabled when Ops are below the next box (OAS 1 Op at box 4), 2nd attempt with the box-2 privilege (box 2–6, used 1) | OK |
| Headlines | both sides; privilege texts "Space Race privilege: the US headline is Europe Scoring." / "…sees your headline first", revealed headline in the AI slot | OK |
| US +2 bid | "US bid: place 2 extra influence", only countries with US influence, both may go to one country | OK |
| Setup | "Place your starting influence in Eastern Europe 6/6" | OK |
| Realignment with modifiers | realign-target incl. Iran-Contra; odds vs independent computation: 493 targets, 0 mismatches; "Stop realigning" | OK |
| Coups under DEFCON limits | DEFCON 5/4/3/2 target sets = options; battleground coup at DEFCON 2 = hold → nuclear war | OK; F7 |
| North Sea Oil / AR8 | "Bonus action round 8: play a card or pass", "Skip action round 8" | OK |
| Held scoring (tournament rule) | strand a scoring card → turn-end loss, result screen "The US held a scoring card at the end of turn 5 (South America Scoring) and loses"; both-held draw | OK (rule enforced by the engine: 243 of 400 random harvest games ended this way) |
| Mil-ops VP penalty | turn-end penalty, ending "Military Operations penalty reached 20 VP", game-ending warning on the final point | OK |
| AR7 / AR8 | AR7 prompts, Eagle / Bear Has Landed AR8 discard ("Keep my hand") | OK |
| Quagmire / Bear Trap | only 2+ Ops cards offered (scoring cards held back), escape roll logged | OK |
| Aldrich Ames | picker of the US hand ("US hand" tags), "Discard Central America Scoring ↵", discarded without event | OK |
| Terrorism, Iran-Contra, Iron Lady, Yuri and Samantha, AWACS, OPEC, Willy Brandt, Evil Empire, Glasnost, Shuttle Diplomacy, Formosan, Red Scare, Containment, Brezhnev, NORAD, JP II | event played from play-mode, log and effect chips en/zh | OK |
| Tear Down This Wall | free coup/realign in Europe or "Skip the free operation" (stage, 2nd press) | OK |
| Summit / How I Learned | DEFCON dossier; losing level 1 = hold | F1 (winning level 1) |
| Olympic Games | participate / boycott, sponsor's 4-Op op-mode | OK; F8 (winning boycott) |
| Optional cards #104–110 | Cambridge Five, Special Relationship, NORAD, Che, Our Man in Tehran, Yuri and Samantha, AWACS | OK |
| Warnings / hold | defcon-suicide, cmc-suicide, game-ending (lose: hold; win: stage) on play-mode, influence, realign Done, coup, event-target, event-card, branch, action-card | OK except F1 |
| Card text (errata) | en + zh text of every card touched above (catalog `src/data/cards.ts`), incl. #53 change | OK: matches the Deluxe/latest errata; zh adds clarifications (#92, #100, #103, #87) that are consistent with the rules |

Not covered: phones / touch and Safari (other QA runs); "Pass (keep the China Card)" never arose in 400 games; Solidarity played
as an event (no harvested state with John Paul II in effect and Solidarity in the human's hand); the human's own Defectors headline.
