# ui-flow: how DeepStruggle's web UI runs a human-vs-AI game

Source studied (read-only): `vendor/DeepStruggle/web/ui/` (Vite + TS + SVG), plus the engine/bindings code it
drives. All paths below are relative to `vendor/DeepStruggle/` unless they start with `/`.
Line numbers are from the vendored checkout as of 2026-11-22.

---

## 0. TL;DR

* The page is a **developer workbench**. Playing against the AI is a mode of it: the "player view"
  (`view=us|ussr`) redacts the state and locks auto-play to the other side. There is no "random side".
* One coordinator class, `TSApp` (`web/ui/src/main.ts`), holds everything. The game itself is
  `GameSession` (`web/ui/src/game/session.ts`) on top of `WasmEngine` (`web/ui/src/engine/wasm_engine.ts`).
  Every position change goes through `TSApp.refresh()` (`main.ts:865`), which re-renders, saves to
  localStorage, then asynchronously runs the model and, if the AI is to move, plays its move after
  350 ms (`AUTO_PLAY_DELAY_MS`, `main.ts:42`).
* A human click is one engine **MicroAction** `{decision_type, primary_id, secondary_id, flags}`.
  The engine call `ts_step` applies it **and rolls every die it leads to** in the same call, so the
  only decisions a human ever sees are SELECT_CARD, SELECT_PLAY_MODE, SELECT_OP_MODE, POINT_NODE,
  CHOOSE_BRANCH (ROLL_DIE is never shown; CHOOSE_TIMING_BRANCH is retired).
* The log is **already bilingual-ready**: `describe.ts` emits `Message` objects (i18n key + id-typed
  params), rendered later by i18next. A complete `zh-CN` catalog exists (log, HUD, branches, effects,
  all 110 card names **and** card texts, 84 countries, regions).
* Most game logic modules are DOM-free and reusable (`session`, `describe`, `log`, `log_view`*,
  `branches`, `names`, `view`, `last_turn`, `rolls`, `record`, `engine/*`, `i18n/*`). The view
  classes (`action_hud`, `cards_view`, `tracks_view`, `map_view`, `result_dialog`) are innerHTML
  string templates: borrow their *logic and wording*, not their code.
* **Bugs / gaps we must not copy** (details in §3.5): no button to decline Junta's / Tear Down This
  Wall's free coup (SELECT_OP_MODE + CONFIRM_DONE); no way to play UN Intervention on a card Grain
  Sales drew; wrong setup prompt during the US +2 bid; Quagmire/Bear Trap discard and forced Missile
  Envy are not explained; a manual-die selector (cheat) is shown to the player; ending reason for a
  held scoring card is mislabeled ("20 VP" / "wargames"); undo restores the RNG and so leaks future
  dice; seats (rule bits) are not re-applied before a saved game is replayed.

---

## 1. The contracts the UI programs against

### 1.1 `WasmEngine` (web/ui/src/engine/wasm_engine.ts) — what the play loop uses

| method (line) | wraps | notes |
|---|---|---|
| `static load(base = import.meta.env.BASE_URL)` (47) | dynamic `import(`${base}engine/ts_engine.mjs`)` | ES module from Emscripten (`-sMODULARIZE -sEXPORT_ES6`, `bindings/CMakeLists.txt:51-54`). Vite-specific `import.meta.env`. |
| `newGame(seed)` (69) | `_ts_new_game(lo, hi)` | `init_game` + drains chance nodes. **Resets seat rules to 0** (`state = GameState{}`, `engine/src/state_machine.cpp:157`). |
| `snapshot(): Uint8Array` / `restore(bytes)` (76/80) | raw `GameState` bytes | used for undo. Includes `rng_state` and `seat_rules`. |
| `display(): GameState` (85) | `_ts_display_json` | full state, **both hands** (redact before rendering!). |
| `settledDisplay()` (94) | `_ts_settled_display_json` | state after the click's action/last die, *before* roll-less chance steps (turn cleanup). |
| `clickRolls(): DieRollState[]` (100) | `_ts_click_rolls_json` | every die the last `step` rolled, in order. |
| `clickEventTracks(): EventTrackState[]` (106) | `_ts_click_event_tracks_json` | per-Event VP/DEFCON deltas of the last step. |
| `step(a, forcedDie = 0): string \| null` (137) | `_ts_step(type, primary, secondary, flags, forcedDie)` | all-or-nothing; returns refusal reason. Drains dice (`forcedDie` 0 = RNG). |
| `mask(merged, macro = false): Uint8Array` (146) | `_ts_mask(view)` | flat mask (304 wide; base 220). |
| `currentRules` (157) / `seat(player, features)` (165) | `_ts_obs_features_rules` / `_ts_seat_obs_features` | rule bits per seat (see §2.3). |
| `decodeFlat(idx)` (172) | `_ts_decode_flat` | flat index → MicroAction at the open decision. |
| `isTerminal / terminalUtility / endingReason / decisionPlayer / decisionType` (124-129) | | `decisionPlayer()`: 1 US, -1 USSR, 0 none. |
| `regionScores(state)` (401) | `_ts_region_scores_json` | engine's scoring of any (redacted) state: for badges and scoring animations. |
| `cardName(id) / cardOps(id) / countryName(id)` (414-416) | | engine English names. |

Exported by the wasm but **not wrapped** by `wasm_engine.ts` (useful for us):
`_ts_first_headline_json(type, primary, secondary, flags, forced_die, forced_opp_die)`
(`bindings/wasm/ts_engine_wasm.cpp:595`) — steps a *copy* with the second headline commit and stops
between the two headlines, returning `{"state": <display>, "rolls": n}` or `""`. Must be called
**before** the real `ts_step` (it clears the click-roll buffer). This is how to animate the two
headlines one at a time. Also `_ts_step_dice` (578, both dice forced), `_ts_card_location`,
`_ts_set_card_location`, `_ts_set_rng` (debug).

Build note: the wasm writes to `TS_WASM_OUTPUT_DIR` (default `web/ui/public/engine`,
`bindings/CMakeLists.txt:23`); we must override it so nothing is written into `vendor/`.

### 1.2 The display state (`bindings/state_json.cpp:460` `display_state`, typed in `web/ui/src/types.ts:112`)

Fields the play UI reads:

* tracks: `victory_points` (+ = US), `defcon`, `mil_ops.{US,USSR}`, `space.{US,USSR}`,
  `space_turns_used.{US,USSR}`, `turn`, `action_round`, `phasing_player`,
  `current_phase_name` ∈ `SETUP|HEADLINE|ACTION_ROUND|INTERRUPT|DISCARD|END_TURN|GAME_OVER`.
* headline: `headline_us_card`, `headline_ussr_card`, `headline_first_card`, `headline_second_card`,
  `headline_stage` (0 choosing, 1 first resolving, 2 second, 3 done).
* `china_card: {holder, playable}`; `forced_card_player`, `forced_card_id` (Missile Envy).
* `flags: string[]` — effect names (`NATO_ACTIVE`, `QUAGMIRE_ACTIVE`, `CHERNOBYL_ACTIVE`, … plus
  pseudo-flags `MISSILE_ENVY_US|USSR`, `SPACE_*_ATTEMPT_n`, `DEFCON_SUICIDE_PROVOKED`,
  `CMC_SUICIDE_LOSS`, `EUROPE_CONTROL_WIN`); list at `state_json.cpp:543-588`.
  `chernobyl_region` (Region int) while Chernobyl is active (599).
* `countries`: **keyed by English country name**, each `{id, name, stability, battleground, region,
  us_influence, ussr_influence, controlled_by: "US"|"USSR"|"NONE"}`.
* `hands.{US,USSR}: number[]`, `hands.{US_cards,USSR_cards}: {id,name,ops,event_ready}[]` —
  `ops` is the **printed** value (no Containment/Brezhnev/Red Scare); `event_ready` (646) says
  whether the event would do anything if played now (unused by the page).
* `discard_pile`, `removed_pile`, `unavailable_cards`, `draw_deck_count`,
  `card_locations: {"1".."110": "DRAW_DECK"|"HAND_US_UNKNOWN"|"HAND_US_KNOWN"|"HAND_USSR_UNKNOWN"|
  "HAND_USSR_KNOWN"|"DISCARD_PILE"|"REMOVED_FROM_GAME"|"ONGOING_EVENT"|"PEEKED_TEMP"|"HEADLINE_COMMITTED"|"UNAVAILABLE"}`.
* `die_roll` (the last engine step's roll only — use `clickRolls()` instead), `event_tracks`.
* `decision_context`: `decision_player`, `decision_type` (+`_name`), `op_mode` (+`_name`),
  `pending_op_card` (+`_name`), `pending_ops_value`, `remaining_steps`, `max_per_country`,
  `allow_early_stop`, `resolving_card` (+`_name`), `stack_depth`.
* `legal_actions`: `valid_ids` (per-decision indices, see §3.1), `valid_action_labels`,
  `allow_early_stop`, **`can_decline`** (736: the flat mask offers CONFIRM_DONE — covers Junta/TDTW
  declines that `allow_early_stop` misses), **`un_intervention`** (740: at Grain Sales' node, UN
  Intervention may be played on the drawn card). The page uses neither; `session.state()` recomputes
  `can_confirm_done` from `engine.mask(false)[confirm_done_index]` (`session.ts:115`), which is the
  same thing as `can_decline`.
* `is_terminal`, `terminal_utility` (>0 US wins, <0 USSR, 0 draw).

### 1.3 The human MicroAction

The HUD sends (`action_hud.ts:428-443`):

```ts
{ decision_type: <ctx.decision_type>, primary_id, secondary_id: this.selectedDieRoll /*0..6*/, flags: 0 | 128 }
```

* `flags = 128` (0x80) = CONFIRM_DONE ("done / pass / decline"); with `primary_id` 0, or 255 at
  Grain Sales' node (`action_hud.ts:248`). `encode_micro_action_212` maps any confirm to the flat
  CONFIRM_DONE slot (`engine/src/action_mask.cpp:907`).
* For a hand-card choice `primary_id` = card id 1..110 (China Card = 6); for countries 0..83;
  play modes 0..4 (`Resolution`: EVENT, SPACE, OPS_INFLUENCE, OPS_COUP, OPS_REALIGN); op modes 0..2
  (INFLUENCE, COUP, REALIGN); branches as in §3.3.
* `secondary_id` is ignored by every non-dice decision (only ROLL_DIE reads it,
  `state_machine.cpp:987-992,1592-1596`). The page also passes it as `forcedDie` to
  `session.apply` (`main.ts:1323`). **For our site always send `secondary_id: 0` and `forcedDie 0`.**

---

## 2. The game loop

### 2.1 Start (side, seed)

* Boot: `DOMContentLoaded` → `initLanguage()` → `new TSApp()` (`main.ts:1579-1583`) →
  `boot()` (209): `WasmEngine.load()`, `new GameSession(engine)`, then either resume the stored game
  (§2.7) or `session.newGame(Math.floor(Math.random() * 1_000_000))` (220). Seeds are only 0..999,999.
* Side choice is the "play mode" dialog `#mode-dialog` (`askMode`, `main.ts:430-478`), buttons
  `data-mode="DEV"|"US"|"USSR"`. New Game → `askMode("new")` → `newGame(mode)` (523): `setView(mode)`
  then `session.newGame(seed)` then `refresh()`.
* `setView(v)` (784) → `analysisPanel.setHiddenSide(opponentOf(v))`, which **locks auto-play to the
  opponent side** (`analysis_view.ts:354-360`). That is the whole "PvE" wiring.
* `GameSession.newGame(seed)` (`session.ts:88-104`): engine reset, clears history/steps/record, writes
  the first log line `log:session.started`.
* The engine starts in SETUP with the USSR to place 6 (`state_machine.cpp:201-206`); it already
  contains the +2 US bid as a third setup stage (§3.2 S3). Turn 1 headline follows automatically.

### 2.2 Whose turn

* `engine.decisionPlayer()` → 1/-1/0. Because `ts_step` drains all chance nodes, after any applied
  step the decider is US or USSR unless the game is over.
* Display: `decision_context.decision_player` / `legal_actions.decision_player`; the HUD badge shows
  `decision_type_name` (`action_hud.ts:156-159`).
* In a player view, when the opponent decides, `redactState` (`game/view.ts:81`) empties
  `legal_actions.valid_ids` and sets `view_hidden_decision = true`; the HUD shows
  "`<side>` to move — `<phase>`" (`action_hud.ts:162-168`), and `sendAction` refuses clicks
  (`hiddenSideToMove`, `main.ts:827`, used at 1266, 1285, 1318).
* Decisions switch sides **inside one play** (an opponent's event fired by your Ops play is decided
  by the opponent; Olympic Games is answered by the opponent; Aldrich Ames is decided by the USSR on
  the US hand; Blockade/LADC by the US during the USSR's play). The loop must therefore be driven by
  `decisionPlayer()` after every step, never by "whose action round it is".

### 2.3 Seats / rule bits (critical, easy to miss)

`TSApp.seatSides()` (`main.ts:892-904`) runs at every `refresh()`:

```ts
for (const [side, player] of [["US", 1], ["USSR", -1]] as const) {
  const features = side === auto && this.model ? this.model.obsFeatures : engine.currentRules;
  changed = engine.seat(player, features) || changed;
}
```

* The AI side plays the rule bits its model was trained with (`model.obsFeatures`, from ONNX
  metadata); the human side plays `PERSON_RULES = OPP_EVENT_GATED | OWN_EVENT_GATED | ALWAYS_ASK_DISCARD`
  (`engine/include/ts/game_state.hpp:643`; `engine/AGENTS.md` §19, §22).
* Effect on the human: no Event offered that cannot fire / would do nothing; Blockade and Latin
  American Debt Crisis always ask the US (even with no 3+ Ops card — then the only answer is "done");
  Missile Envy always asks the giver. `ALWAYS_ASK_DISCARD` is read on *either* seat, so the AI also
  gets asked when the human is the Missile Envy player.
* Seats live in `GameState.seat_rules`, are **reset by `newGame`**, are **not in the save JSON**,
  but **are** in undo snapshots. They must be (re)applied after `newGame`, `loadSaveJson`, and
  before replaying a stored record. DeepStruggle's `replayRecord` (`session.ts:168-198`) replays
  steps right after `newGame` without seating → a stored game that went through an
  ALWAYS_ASK_DISCARD node can be refused on reload (unverified, inferred from code). We should seat
  first.

### 2.4 When the AI is invoked

```
refresh()                         main.ts:865
 ├─ seatSides()
 ├─ liveState = session.state(); renderState()          (redact → all views render)
 ├─ storeGame(); offerResult()
 ├─ encodePosition(saveJson) → syncUrl()                 (async; ?pos= in the URL)
 └─ runAnalysis(version)          main.ts:906
     ├─ analyze(engine, model, key)   analysis/readout.ts:21  (one ONNX forward, 3 rows)
     ├─ if searchSpec && searchWanted(decider) → runSearch()  (rollout root in a worker, seconds)
     └─ maybeAutoPlay()            main.ts:1369
          idx = analysisPanel.autoPlayMove()   // favourite() if decider == autoSide (analysis_view.ts:401)
          setTimeout(350 ms) → if version unchanged → sendFlatAction(idx, 0, /*auto*/true)
              → session.applyFlat(idx, model.meta.mergedInfluence, 0, how, model.meta.macroInfluence)
              → refresh()  (loop)
```

* `favourite()` (`analysis_view.ts:335`) = `search.pick` if a search finished, `null` while it runs,
  else `policy.argmax_idx`.
* The model is run on **every** position (also the human's, for the hidden readout). We only need it
  when the AI is to move.
* Each AI micro-step (each influence point!) is a separate `refresh()` + forward + 350 ms timer, so
  an AI 4-Op influence play is ~5 refresh cycles. A `version` counter drops stale async results.
* `applyFlat` (`session.ts:305-339`) handles the model's action views: E4.1 merged influence
  (applied as OPS_INFLUENCE + first point, two logged steps) and P42 macro "until control" (N one-point
  steps). Any refusal rolls the partial steps back.

### 2.5 Human input → engine step

Three input surfaces, all ending in `TSApp.sendAction(action)` (`main.ts:1316`):

| surface | handler | sends |
|---|---|---|
| map country click | `handleCountryClick` (`main.ts:1265`) | only when `decision_type === POINT_NODE` and `valid_ids.includes(cid)`: `{POINT_NODE, cid, selectedDieRoll, 0}` |
| hand card / China card click | `CardsView.renderHand` (`cards_view.ts:430-515`) → `handleCardClick` (`main.ts:1284`) | only when `decision_type === SELECT_CARD` and the card is in `valid_ids` (or `valid_ids` empty!): `{SELECT_CARD, id, 0, 0}` |
| HUD buttons | `ActionHud.render` (`action_hud.ts:137`) | every other answer, incl. CONFIRM_DONE (`data-flags="128"`) |

`sendAction` → `session.apply(action, forcedDie, how)` (`session.ts:216-297`):

1. refuse if terminal; normalise to `Required<MicroAction>`.
2. `before = engine.display()`, `snapshot = engine.snapshot()`, `engine.step(a, forcedDie)`; on refusal
   return the reason (page shows "ENGINE REFUSED" badge for 1.5 s, `main.ts:1302`).
3. push undo entry, push `moves`, `stepIndex++`.
4. `after = display()`, `settled = settledDisplay()`;
   `crossed = settled.turn !== after.turn || settled.current_phase_name !== after.current_phase_name`.
5. Log lines: `describeAction` + one `describeRoll` per `clickRolls()` + `describeEventTracks` +
   `describeDeltas(before, settled-or-after)`; push `ActionLogItem` with `clickInfo` (`log_view.ts:59`).
6. If `crossed`: a second `TURN_END` log item for settled→after (turn-end VP, mil-ops reset, DEFCON,
   new deal).
7. Push `ReplayStep {step_index, turn, ar, phase, player, action, description, state_snapshot: after, rolls, event_tracks}`.
8. If terminal: `result = {winner, margin, end_turn, reason: endingReason()}` and a `GAME_OVER` log line.

Then `afterOwnMove` resets the die selector, and `refresh()`.

### 2.6 Undo

* Button `#btn-undo-action`, Ctrl/Cmd+Z, or **Escape** (`main.ts:1463-1486`) → `cancelAction()`
  (1393): clear auto timer, `session.undo()`, then **keep undoing while the decider is the auto side**
  so the human lands back on their own decision.
* `GameSession.undo()` (`session.ts:342`): pop `{snapshot, logs, steps, stepIndex, moves}`,
  `engine.restore(snapshot)`, truncate log/steps/tags/moves, append `log:session.undone`. Max 300
  entries (`MAX_UNDO`, line 23).
* **Fairness hole:** the snapshot includes `rng_state`, so after undo the same random draws come
  again. A human can coup, see the die, undo and choose a different target with the known die; undo
  past a deal reveals the next cards; undo past an AI turn shows what the AI will do (search is
  seeded from the step index, `main.ts:765`). Decide a policy (e.g. undo only within the human's
  current play and never across a die roll / draw / AI move) — open question §7.

### 2.7 Autosave / reload

* After every `refresh()`, `storeGame({record, submitted})` → localStorage key
  `"ts.workbench.game.v1"` (`game/saved_game.ts:10,17`). `record` (`game/record.ts`
  `GameRecordData`) = `{id, started_at, seed, start_position, steps: [{action, tag}], settings,
  models, events}`; a step tag records source (human/suggested/auto), forced die, mover, etc.
* Reload works only if the URL still has `?pos=` (the full save, zlib+base64url, `game/position.ts`)
  and the stored game, replayed from its seed (`session.replayRecord`), reaches exactly that save
  (`resumeStoredGame`, `main.ts:285-301`). Otherwise the `pos=` save is loaded as a fresh position
  (history lost).
* Replay is deterministic because each recorded step is re-applied with its forced die (0) and the
  RNG lives in the state; the AI's moves are replayed as recorded actions (no model needed).
* For us: store the record in localStorage and resume from it without the URL (the `pos=` link
  carries the AI's hand; not needed for a PvE site). Seat both sides before replaying.

### 2.8 Game over

* `session.apply` sets `session.result` when `engine.isTerminal()` (`session.ts:284-295`):
  `winner = terminalUtility() > 0 ? "US" : < 0 ? "USSR" : "DRAW"`, `margin = after.victory_points`,
  `reason = engine.endingReason()`.
* `refresh()` → `offerResult()` (`main.ts:353`) opens `#result-dialog` once per ending
  (`ResultDialog`, `result_dialog.ts`), which also offers a Playdek-rating stats submission (not for us).
* `ending_reason` strings (`bindings/state_json.cpp:1156`): `"DEFCON 1 (own decision)"`,
  `"DEFCON 1 (opponent decision)"`, `"wargames"`, `"Europe Control"`, `"20 VP"`, `"final scoring"`.
  **Mislabels:** a held scoring card at turn end sets VP to ±20 (`state_machine.cpp:748-767`) and is
  reported as `"20 VP"`; both sides holding one sets VP 0 and is reported as `"wargames"` (the
  `turn <= 10 && |vp| < 20 && GAME_OVER` rule). Detect it ourselves: a scoring card in a hand in the
  `settled` state of the click that ended the game.
* The tournament rule is implemented: `finish_end_turn` (`state_machine.cpp:748`) checks every
  scoring card location after the turn's last AR (and before final scoring on turn 10). The mask
  never forces a scoring card (except under Missile Envy, `action_mask.cpp:~120`), so the UI should
  warn when scoring cards in hand ≥ action rounds left.

### 2.9 Recommended loop for our site (pseudocode)

```ts
startGame(side: "US"|"USSR"|"random", seed = crypto.getRandomValues(...)):
  engine.newGame(seed); seatBoth(); session bookkeeping
loop:
  if engine.isTerminal(): showResult(); return
  const shown = redactState(session.state(), humanSide)          // game/view.ts
  if engine.decisionPlayer() === humanPlayer:
      ui.showDecision(shown)                                     // §3
      await humanAction → apply(action)                          // secondary 0, forcedDie 0
  else:
      idx = await ai.choose(engine)                              // forward (+search) only here
      applyFlat(idx, ...)
  events = diff(before, settled, after, rolls, eventTracks, action)   // §6
  await animator.play(events)                                    // gate the next AI step on it
```

---

## 3. Catalogue of every decision a human can face

### 3.1 Decision types (`engine/include/ts/types.hpp:137`) and per-decision `valid_ids`

| type | id | `valid_ids` meaning (display state, `action_mask.cpp generate_mask`) | CONFIRM_DONE |
|---|---|---|---|
| NONE | 0 | – | – |
| SELECT_CARD | 1 | card ids 1..110; **0 = pass/done** | `{1, 0, 0, 128}` |
| SELECT_PLAY_MODE | 2 | Resolution 0..4 | only Grain Sales: `{2, 255, 0, 128}` |
| CHOOSE_TIMING_BRANCH | 3 | retired by P17 (old replays only) | – |
| SELECT_OP_MODE | 4 | OpMode 0..2 | in flat mask for Junta/TDTW or nothing spendable (`action_mask.cpp:612-624`) |
| POINT_NODE | 5 | country ids 0..83 (84-wide mask, no done slot) | `allow_early_stop`, or `can_decline` when no target left |
| CHOOSE_BRANCH | 6 | branch 0..7, or DEFCON level 1..5 (Summit, How I Learned), or Region 0..5 (Chernobyl) | where `allow_early_stop` |
| ROLL_DIE | 7 | never shown: drained inside `ts_step` | – |

Flat CHOOSE_BRANCH heads: `decode_flat_action_212` (`action_mask.cpp:884-898`) puts Summit/How I
Learned on the DEFCON_VALUE head (`primary_id` = level, flag `DEFCON_VALUE`) and Chernobyl on the
REGION head (`primary_id` = Region). For a human click only `primary_id` matters: the encoder picks
the head from `resolving_card` (`action_mask.cpp:942-964`).

Region enum: 0 EUROPE, 1 ASIA, 2 MIDDLE_EAST, 3 AFRICA, 4 CENTRAL_AMERICA, 5 SOUTH_AMERICA.

### 3.2 Generic decisions

| # | situation | engine state | HUD shows (`action_hud.ts`) | input → action | confusing / notes |
|---|---|---|---|---|---|
| S1 | Setup, USSR 6 in E. Europe | POINT_NODE, phase SETUP, USSR, `remaining_steps` 6→1 | `hud:prompt.setup` "click highlighted countries in Eastern Europe (n remaining)" (296-298) | map click → `{5, cid}`; one point per click | no batch/undo-per-point UI. |
| S2 | Setup, US 7 in W. Europe | same, US, `pending_ops_value == 0`, remaining 7 | same, "Western Europe" | map click | |
| S3 | **US +2 bid** | same, US, `pending_ops_value == 1` (stage flag), remaining 2; targets = any country with US influence (`action_mask.cpp:459-470`) | **still says "Western Europe"** (bug: region chosen only by player, line 297) | map click | Must label "bid: +2 where you already have influence". |
| H1 | Headline choice | SELECT_CARD, phase HEADLINE, `resolving_card 0`. US chooses first unless a side holds Man in Earth Orbit alone (then the *other* side first, `state_machine.cpp:232-243`) | `hud:prompt.headline`; if the opponent's headline is visible (box-4 perk) a banner with its card number | hand card click → `{1, id}` | Second commit resolves **both** headlines in that one step (unless an event asks a question). Card shows as `HEADLINE_COMMITTED`. |
| A0 | Cuban Missile Crisis payoff at the head of your AR | POINT_NODE, `resolving_card 40`, remaining 1, `allow_early_stop 1` (`offer_cuban_missile_payoff`, `state_machine.cpp:320`) | generic "Resolving event *Cuban Missile Crisis*. Select target country (1 remaining)" + "Done / Pass Remaining" | click Cuba (USSR) / W. Germany or Turkey (US) to remove 2 and cancel CMC; Done = keep playing | Very confusing wording: it is an optional "pay 2 Influence to end CMC" offer that appears before every AR while CMC is on and you can pay. |
| A1 | Choose a card in an action round | SELECT_CARD, phase ACTION_ROUND, `resolving_card 0` | `hud:prompt.actionRound`; legal hand cards highlighted (`playable`) | hand card / China card click → `{1, id}`; Pass button if 0 legal (`hud:pass.default` "Pass / Confirm (Do not discard)") | Pass label is wrong for an AR pass (China-only hand, optional AR8). Forced Missile Envy (only card 49 legal; flag `MISSILE_ENVY_<side>`) and Quagmire/Bear Trap (choosing = discard a 2+ effective-Ops card and roll ≤4 to escape; flags `QUAGMIRE_ACTIVE`/`BEAR_TRAP_ACTIVE`) are not explained. A scoring card resolves immediately on selection (no play-mode step). |
| A2 | How to play the card | SELECT_PLAY_MODE, `pending_op_card`, `pending_ops_value`; `valid_ids` ⊆ {0 EVENT, 1 SPACE, 2 OPS_INFLUENCE, 3 OPS_COUP, 4 OPS_REALIGN} | one button per mode (`modeLabel`, 91-100) + die selector | button → `{2, mode}` | On an **opponent's** card EVENT = event-first (then A3), any OPS_* = Ops first and the opponent's event fires afterwards (`fire_owed_event`, `state_machine.cpp:369`), SPACE = no event. The OPS buttons don't say "then the USSR/US event fires" (the log does: `log:mode.opsThenEvent`). Effective Ops shown only via `pending_ops_value`. |
| A3 | Spend Ops after an event-first play (and event-granted Ops) | SELECT_OP_MODE, `pending_op_card`, `pending_ops_value`; `valid_ids` ⊆ {0 INFLUENCE, 1 COUP, 2 REALIGN} | `hud:prompt.opMode` + buttons | → `{4, opMode}` | **No decline button** although the flat mask offers CONFIRM_DONE for Junta / Tear Down This Wall (optional free coup/realign) and when nothing is spendable → player cannot decline / can get stuck (`action_hud.ts:277-288`). Prompt does not name the granting card (`resolving_card` is 0; use `pending_op_card`). |
| A4 | Place influence | POINT_NODE, `op_mode 0`, `remaining_steps` = Ops left, no early stop | `hud:prompt.targetOpsLeft`; target list only if ≤12 targets | map click → `{5, cid}`; one point per click (engine charges 2 in enemy-controlled) | "Done" only when no legal target remains (`can_confirm_done`). No preview of cost. China/Vietnam bonus withdrawn if spent outside Asia/SEA (mask already restricts, ENG-10). |
| A5 | Coup | POINT_NODE, `op_mode 1`, remaining 1, no early stop | `hud:prompt.coup` + target list (name, stability, ★ BG, influence) + die selector | click → `{5, cid}`; die rolled in the same step | Engine lets you coup into DEFCON suicide / under CMC without paying (`CMC_SUICIDE_LOSS`): no warning. If CMC is active for the US and both W.Germany and Turkey hold ≥2, a forced POINT_NODE (`resolving_card 40`, no early stop) asks where to pay *before* the die (`state_machine.cpp:1515-1541`). |
| A6 | Realign | POINT_NODE, `op_mode 2`, `remaining_steps` = rolls left, `allow_early_stop 1` | `hud:prompt.realign` (no remaining count shown) + list + "Done / Pass Remaining" | click per roll; Done stops | One click can roll twice (realign with opponent's war card fires its event). |
| A7 | Space Race | A2 with mode 1 | button "Space Race Attempt" | `{2, 1}`; die rolled immediately | Box needs/odds only in the tracks pill. |
| E1 | Event targets | POINT_NODE, `resolving_card` = card, `remaining_steps`, `max_per_country`, `allow_early_stop` per card | `hud:prompt.resolvingEvent` "Resolving event X. Select target country (n remaining)" + target list + die selector | click per point; Done if early stop | `max_per_country` not shown; "remove" vs "add" not said; the same prompt for adding and removing. |
| T1 | End of turn: Eagle/Bear Has Landed | SELECT_CARD, `resolving_card 250` (pseudo card `EAGLE_BEAR_LANDED_DISCARD`), `allow_early_stop 1` (`state_machine.cpp:709-745`) | `hud:cardChoice.eagleBearLanded` + card buttons (`whereLabel`) + Pass | card → `{1, id}`; Pass → `{1, 0, 0, 128}` | Scoring cards not offered (ENG-7). |
| T2 | End of turn: held cards | **no decision** — non-scoring cards just stay; a held scoring card ends the game | – | – | Must warn before it happens (§2.8). |
| D | Die choice | not a game decision: workbench "🎲 Die Roll Input" (Auto / 1..6) shown with A2, A5, A6, E1 (`action_hud.ts:388-407`); forces the next die | – | `secondary_id` + `forcedDie` | **Cheat tool. Remove.** |

### 3.3 Event branch choices (CHOOSE_BRANCH) — exactly six events

Meaning from `game/branches.ts` (`branchMeta`, line 55; English in `i18n/locales/en/branches.json`).

| card (id) | decider | `primary_id` values | engine source |
|---|---|---|---|
| Warsaw Pact Formed (16) | USSR | 0 remove all US influence from 4 E.Europe countries; 1 add 5 USSR influence in E.Europe (≤2 each) — followed by POINT_NODEs | `early_war.cpp:172` |
| Olympic Games (20) | the **opponent** of the player | 0 participate (dice, sponsor +2, winner 2 VP); 1 boycott (DEFCON −1, sponsor gets a 4-Ops SELECT_OP_MODE) | `early_war.cpp:203`, `card_dispatcher.cpp:~687-710` |
| Summit (45) | winner of the Summit roll (dice first; tie → nothing) | DEFCON level `current-1..current+1` clipped to 1..5 (current = "leave it") | `mid_war.cpp:92`, `card_dispatcher.cpp:~985-1015`, mask `action_mask.cpp:~689` |
| How I Learned to Stop Worrying (46) | phasing player | DEFCON level 1..5 (1 = you lose) | `mid_war.cpp:100` |
| Chernobyl (94) | US | Region 0..5 (USSR may not place Ops influence there this turn) | `late_war.cpp:~187` |
| Wargames (100) | phasing player, only at DEFCON 2 (else no decision; with OWN_EVENT_GATED not even offered) | 0 give opponent 6 VP and end the game; 1 continue | `late_war.cpp:288` |

HUD: `hud:prompt.branch` + `branchAsk` (`action_hud.ts:77`) + one button per `valid_ids` with
`branchMeta(...).title/desc` (355-381). Button → `{6, primary}`.

### 3.4 Event card choices (SELECT_CARD with `resolving_card ≠ 0`) and other per-card flows

The HUD lists every offered card as a button (`cardChoiceButtons`, `action_hud.ts:28-45`: `#id name`,
`Ops · side`, location "Drawn"/"Discard pile"/"US hand"…) because they are often in no visible hand,
plus a pass button when 0 ∈ `valid_ids` (label per card, 205-210). Prompt per card from
`cardChoicePrompt` (59-74).

| card (id) | decider | choice | pass / done | notes |
|---|---|---|---|---|
| Blockade (10) | US | discard a card of **≥3 effective Ops** | Done = lose all US influence in W. Germany | asked even with no such card (ALWAYS_ASK_DISCARD) — then only Done is legal (`early_war.cpp:109-131`). |
| Latin American Debt Crisis (95) | US | discard ≥3 effective Ops | Done → USSR then picks 2 S. America countries to double (POINT_NODE, early stop) | `late_war.cpp:~196-226`; HUD has **no LADC prompt** (falls back to "Resolving Event (Card #95): Select a card"). |
| Aldrich Ames Remix (98) | USSR | any card from the (revealed) US hand | none (mandatory) | US hand → `HAND_US_KNOWN`. |
| Missile Envy (49) | the **giver** (opponent of the player) | one of its highest-Ops non-scoring cards | none | asked even without a tie (ALWAYS_ASK_DISCARD). Taker's own/neutral card → event fires; giver's card → taker gets SELECT_OP_MODE for its Ops; Missile Envy becomes the giver's forced card. |
| UN Intervention (32) | player | an opponent-event card from own hand | none (`allow_early_stop 0`) | then SELECT_OP_MODE for that card's Ops, event suppressed. Not in headline. |
| SALT Negotiations (43) | player | non-scoring card from the discard pile | "Take no card" | |
| Star Wars (85) | US | non-scoring card from discard whose event it can trigger; event fires | "No card can be chosen — continue" when none | UN Intervention not takeable in a headline (ENG §23). |
| Our Man in Tehran (108) | US | discard any of the 5 drawn cards (`PEEKED_TEMP`), one per click | "Done — return the rest to the deck" | repeated SELECT_CARD; drawn cards are hidden from the USSR view. |
| Ask Not What Your Country… (77) | US | discard cards one per click (`remaining_steps` counts the allowance) | Done = draw that many | |
| Eagle/Bear Has Landed (250) | holder of box 6 alone | see T1 | Pass | |
| Grain Sales to Soviets (67) | US | **SELECT_PLAY_MODE** on the drawn USSR card (`pending_op_card` = drawn, `resolving_card 67`): play it (EVENT/SPACE/OPS_*) | Return it: `{2, 255, 0, 128}` → US gets Grain Sales' 2 Ops (SELECT_OP_MODE) | Third option **missing in HUD**: play UN Intervention on the drawn card = `{SELECT_CARD(1), 32, 0, 0}` sent *at the SELECT_PLAY_MODE node* (`for_open_decision`, `ts_engine_wasm.cpp:557`; signalled by `legal_actions.un_intervention`). Headline: only the return is legal. HUD's `pending_ops_value` is 0 here → "the card's Ops". |
| Five Year Plan (5), Terrorism (92) | – | **random**, no decision | – | HUD prompts for them exist but are dead (`early_war.cpp:35`, `late_war.cpp:155`). Log: `✂ … at random`. |
| Quagmire (42) / Bear Trap (44) | trapped side, each AR | A1: choosing a ≥2 effective-Ops card discards it and rolls (TRAP_ESCAPE, ≤4 escapes) | scoring cards may still be played | prompt says "play" (misleading). |

Event POINT_NODE flows (all E1, `resolving_card` = card; `remaining_steps`/`max_per_country`/
`allow_early_stop` come from the engine): Socialist Governments (7), COMECON (14), Truman Doctrine
(19), Independent Reds (22), Marshall Plan (23), Indo-Pakistani War (24: India|Pakistan),
Suez Crisis (28), East European Unrest (29), Decolonization (30), De-Stalinization (33: remove then
place), Brush War (36: stability ≤2), Warsaw Pact (after branch), Junta (47: 2 influence in CA/SA then
optional free coup/realign = A3 with decline), South African Unrest (53), Muslim Revolution (56),
Colonial Rear Guards (63), Puppet Governments (66), OAS Founded (70), Voice of America (74),
Liberation Theology (75), Ussuri River Skirmish (76), The Reformer (87), Marine Barracks Bombing
(88), Ortega (91: free coup adjacent to Nicaragua, optional), Iran-Iraq War (102: Iran|Iraq),
Pershing II (99), The Cambridge Five (104), Special Relationship (105), NORAD (106: after an AR in
which DEFCON fell to 2, US places 1 where it has influence, mandatory), Che (107: free coup in a
non-battleground CA/SA/Africa country; if it removed US influence a second, optional coup is offered),
Cuban Missile Crisis payoff (A0/A5). Korean War (11) and Arab-Israeli War (13) have fixed targets (no
decision, just a die).

Event-granted Ops (A3, `resolving_card 0`, `pending_op_card` = event, `event_granted_ops` set):
CIA Created (26, 1 Op US), Olympic boycott (20, 4 Ops sponsor), ABM Treaty (57, 4), Lone Gunman (62,
1 USSR), Grain Sales return (67, 2 US), Soviets Shoot Down KAL-007 (89, 4 US, if the US controls South Korea), Glasnost
(90, 4 USSR if The Reformer was played), Tear Down This Wall (96, 3 US, coup/realign in Europe only,
declinable), Junta (47, 2, CA/SA only, declinable).

Events with no human decision (just effects): everything else (scoring cards, Fidel, Nasser, Duck and
Cover, Romanian Abdication, Containment, US/Japan Pact, Red Scare/Purge, Nuclear Test Ban, Formosan
Resolution, Arms Race, Nuclear Subs, Kitchen Debates, We Will Bury You, Brezhnev, Portuguese Empire,
Allende, Willy Brandt, Cultural Revolution, Flower Power, U2, OPEC, Panama Canal, Camp David, John Paul
II, Death Squads, Nixon, Sadat, Shuttle Diplomacy, Alliance for Progress, One Small Step, Iranian
Hostage Crisis, Iron Lady, Reagan Bombs Libya, North Sea Oil, Iran-Contra, An Evil Empire, Solidarity,
Yuri and Samantha, AWACS, Defectors, Captured Nazi Scientist, Vietnam Revolts, De Gaulle, NATO…).
(Verified by grepping decision setters in `engine/src/events/*.cpp` and
`card_dispatcher.cpp run_event_step` (512-1775); individual card texts not re-audited.)

### 3.5 What is confusing or broken for a human (do not copy)

1. **SELECT_OP_MODE has no CONFIRM_DONE button** → Junta/Tear Down This Wall free action cannot be
   declined; an "Ops with nothing spendable" node shows no button. Use `legal_actions.can_decline`.
2. **UN Intervention on Grain Sales' drawn card** is not offered (needs a SELECT_CARD(32) at a
   SELECT_PLAY_MODE node; `legal_actions.un_intervention`).
3. **US bid prompt** says "Western Europe" (`action_hud.ts:297`); stage is `pending_ops_value == 1`.
4. **CMC payoff** shown as a generic "resolving event, select target" with a pass — explain it.
5. **Quagmire / Bear Trap / forced Missile Envy / AR pass** use generic "play a card" wording and a
   "Pass / Confirm (Do not discard)" label.
6. Opponent-card OPS buttons don't say the opponent's event follows; no Ops-modifier explanation
   (hand `ops` is printed Ops).
7. Realignment prompt shows no remaining count; event targeting doesn't say add vs remove or the
   per-country cap (`max_per_country`).
8. LADC and Wargames/How I Learned (DEFCON 1 = loss) have weak prompts; How I Learned/Summit buttons
   do mark "(degrade)/(improve)/(unchanged)" and DEFCON 1 "ends the game" (`branches.ts:48-52`).
9. No warnings for: suicide coups (DEFCON/CMC), holding scoring cards near turn end, Wargames choice.
   Suggestion: an engine-truth check — snapshot, step on the copy, look at `isTerminal()`/`defcon`,
   restore (RNG is in the snapshot, so it is side-effect free) — rather than restating rules.
10. Hand cards are highlighted the same way for "play" and "discard" choices; `valid_ids.length === 0`
    makes *every* hand card clickable (`cards_view.ts:494`).
11. Die selector (cheat) and the "Developer" view (sees AI hand) are one click away.
12. Influence placement is one click per point, each a separate step and log line (grouped later);
    the AI's placements arrive one per 350 ms.

---

## 4. The log (`game/describe.ts`, `game/log.ts`, `game/log_view.ts`)

### 4.1 How a line is made

* `LogLine = { msg: Message, mark?: "•"|"🎲"|"★"|"✂"|"⇄"|"▸" }` (`log.ts:26-36`).
* `Message = { key: MessageKey, params?: Record<string, MessageArg> }` and
  `MessageArg = string | number | Message | {card, name} | {country, name} | {region} | {side}`
  (`i18n/index.ts:186-203`). Cards/countries carry the **id** plus the engine's English name; at
  render time `cardName(id, english)` → `game:cards.<id>.name` in the current language.
* Per click (`session.apply`): `describeAction` (`describe.ts:85`) — what was done, by decision type
  (headline commit + "★ revealed / resolution order" on the second commit; event card choices worded by
  `eventCardChoice` (408) as discard/take/give…; branches by `branchMeta.verb`) — then `describeRoll`
  (306) per die (COUP, REALIGNMENT, SPACE_RACE, WAR_EVENT, OLYMPIC_GAMES, SUMMIT, TRAP_ESCAPE), then
  `describeEventTracks` (284) when per-event VP/DEFCON can't be read from before/after, then
  `describeDeltas` (187): influence per country (by id order), DEFCON, VP, MilOps, Space, flags
  on/off, card moves (`log:change.cardMoved` with raw locations), random discards (`randomDiscards`,
  442: Five Year Plan / Terrorism), Missile Envy exchange (478).
* Session lines: `log:session.started|endOfTurn|phaseEnds.*|gameOver|undone|positionLoaded`.
* `ActionLogItem` (`types.ts:60`): `{step_index, turn, ar, phase, player, text, details, vp_delta,
  kind, title, mode, cards, resolving, resolving_name}`; `kind/title/mode/cards` from `clickInfo`
  (`log_view.ts:59-109`).
* `groupLog(items)` (`log_view.ts:341`) turns clicks into **plays** (one entry per card played, per
  headline pair, per side's setup, per turn end): heading "USSR plays Fidel (#8) — Ops: Influence"
  or "Ops: Coup, then the US Event", decisions as `▸` lines, dice/Events in order, the board's
  changes summed per Event segment (`Board`, 173-314: influence summed per country/side, card moves
  reworded "discarded / removed from the game / now known to the USSR", a deal as "US draws 7 cards:
  …", reshuffle on one line, effect flags by their effect names).
* Player view: `redactLogs` (`view.ts:53`) drops card moves into the opponent's unknown hand and its
  `PEEKED_TEMP` moves, and replaces its face-down headline commit with `log:action.headlineFaceDown`.
  Grouping runs **after** redaction.
* Rendering: `lineHtml(l)` / `messageHtml(m)` (`log.ts:114-121`) escape text and wrap cards in
  `span.log-card[data-card-id]` for tooltips; `render(m)` for plain text; `renderEnglish(m)` for data.

### 4.2 Reusable for a bilingual move log? — Yes, with small surgery

* Language plumbing is complete: `i18n/index.ts` (i18next, `en` + `zh-CN`, `en-XA` pseudo), every log
  key present in zh-CN (log 156/156 non-plural keys, hud 94/94, branches 32/32, effects 83/83,
  endings, enums), `zh-CN/game.json` has all 110 card names **and descriptions**, 84 countries, 9
  region/subregion names. A language switch re-renders the same `Message`s (no rebuild of the log).
* English wording in `describe.ts` is pinned to the old Python text (golden test) and is
  developer-flavoured ("confirms / finishes point node selections", "Card #12 (X) moved:
  HAND_US_UNKNOWN -> DISCARD_PILE", "Coup Failed (Roll + Ops <= 2x Stability)"). The grouped view
  rewords most of it. In our fork we can edit `locales/*/log.json` freely (we don't run their golden).
* Dependencies to cut: `log_view.ts` imports `effectNameMessage` from `cards_view.ts` (a DOM class
  module) and `ReplayStep` from `replay_controls.ts`; `last_turn.ts`, `rolls.ts`, `session.ts`,
  `readout.ts` import `ReplayStep`/trace types from DOM modules (type-only). Move `ReplayStep`,
  `EFFECT_INFO_MAP`/`effectNameMessage` into pure modules when vendoring.
* `metadata.ts` imports `../../../rules/map.json` and `rules/cards.json` (card side/ops/text used by
  `describe.ts` `SIDE` map and HUD) — repoint the import path.
* Card *text* in tooltips is `rules/cards.json` (EN) / `zh-CN/game.json` (ZH); our CLAUDE.md wants
  latest errata — needs a separate audit.

---

## 5. Module reuse

### 5.1 Classification

| module | lines | DOM? | depends on | verdict |
|---|---|---|---|---|
| `engine/wasm_engine.ts` | 423 | no (uses `import.meta.env`, `globalThis.location`) | `engine/layout`, `types` | **vendor**; add `firstHeadline()` wrapper; rollout/belief methods only if we use search |
| `engine/layout.ts` | 73 | no | – | **vendor** |
| `types.ts` | 280 | no | `i18n` (type), `game/log` (type) | **vendor** (add `can_decline`, `un_intervention`, `event_ready`, `chernobyl_region`) |
| `game/session.ts` | 458 | no | wasm_engine, describe, log_view, log, i18n, record, `ReplayStep` type | **vendor/adapt**: keep apply/applyFlat/undo/record/replayRecord; drop debug overrides, `replay()` export optional; seat before replay |
| `game/describe.ts` | 500 | no | metadata, branches, wasm_engine, layout, i18n, log | **vendor** |
| `game/log.ts` | 147 | no (escapeHtml only) | html, i18n | **vendor** |
| `game/log_view.ts` | 493 | no, but imports `cards_view` | describe, names, i18n, metadata, `cards_view.effectNameMessage` | **vendor after extracting** `EFFECT_INFO_MAP` + `effectNameMessage` to a pure `effects.ts` |
| `game/branches.ts` | 68 | no | layout, i18n | **vendor** |
| `game/names.ts` | 86 | no | wasm_engine, layout, i18n, branches | vendor (AI move labels / debug) |
| `game/view.ts` | 126 | no | i18n, log | **vendor** — the human view must render only `redactState(...)` |
| `game/last_turn.ts` | 77 | no | layout, i18n, `ReplayStep` | vendor (marks AI's last turn on map) |
| `game/rolls.ts` | 76 | no | i18n, `ReplayStep` | vendor (recent dice) |
| `game/record.ts` | 304 | no | position | vendor `GameRecordData`/`StepTag` for autosave; drop submission/summary or keep |
| `game/position.ts` | 74 | no (CompressionStream, btoa) | – | optional (only if we want share links) |
| `game/saved_game.ts` | 35 | localStorage | record | rewrite (new key, resume without `pos=`) |
| `i18n/index.ts`, `i18n/enums.ts`, `i18n/i18next.d.ts`, `locales/en`, `locales/zh-CN` | | `index.ts` has DOM helpers (`applyStatic`, `bindLanguageSelects`) | i18next | **vendor**; drop workbench namespaces (analysis, trace, replay, debug, leaderboard, result) or keep; language from `navigator.language` |
| `html.ts`, `metadata.ts` | | no | rules/*.json | vendor |
| `roll_tray.ts` | 130 | string HTML | i18n | borrow `describeRoll(r)` (pure: returns `{kind, where, dice, result, ok}`) and `dieSvg` |
| `region_summary.ts` | 95 | string HTML | `map_view` type | borrow logic (standing names, `regionNet`) |
| `action_hud.ts` | 445 | yes | – | **rewrite**; reuse the decision dispatch table, `whereLabel`, `cardChoicePrompt`, pass labels, Grain Sales handling, and the `hud` locale strings |
| `cards_view.ts` | 867 | yes | – | rewrite; extract `EFFECT_INFO_MAP` (35-280, effect side/duration/card) + `sortPile` |
| `tracks_view.ts` | 424 | yes | – | rewrite; borrow `spaceRaceBoxes()` (pure, reads `layout.space_boxes`) |
| `map_view.ts` | 974 | yes (SVG) | – | not read in depth here; we redraw the map |
| `result_dialog.ts` | 231 | yes | record | rewrite (borrow `summaryNotes` if we keep the record summary) |
| `main.ts` | 1583 | yes | everything | do not port; use §2 as the spec of the loop |
| `analysis/*` | | worker + onnxruntime | | AI integration (other notes): `model.ts`, `readout.ts`, `rollout*.ts`, `hf_catalog.ts`, `model_cache.ts` |

### 5.2 Recommended vendor/port list

Copy (with the noted edits) into our `src/`:

```
engine/wasm_engine.ts   engine/layout.ts   types.ts   html.ts   metadata.ts
game/session.ts   game/describe.ts   game/log.ts   game/log_view.ts   game/branches.ts
game/names.ts   game/view.ts   game/last_turn.ts   game/rolls.ts   game/record.ts
i18n/index.ts   i18n/enums.ts   i18n/i18next.d.ts   i18n/locales/{en,zh-CN}/*
+ new: game/effects.ts   (EFFECT_INFO_MAP + effectNameMessage, out of cards_view.ts)
+ new: game/replay_step.ts (ReplayStep / PolicyTrace / CriticTrace types, out of replay_controls.ts)
```

Keep MIT attribution headers. Borrow pure helpers from `roll_tray.ts` (`describeRoll`, `dieSvg`),
`tracks_view.ts` (`spaceRaceBoxes`), `region_summary.ts` (`standingName/standingShort/regionNet`).

---

## 6. Events to animate, and how to detect them

### 6.1 Raw material per applied step (all available after `session.apply`)

```ts
before  = engine.display()           // taken before step
after   = engine.display()
settled = engine.settledDisplay()    // == after unless the click ran into turn cleanup
rolls   = engine.clickRolls()        // every die, in order
tracks  = engine.clickEventTracks()  // [{card_id, card_name, vp_delta (+US), defcon_delta}]
action  = the MicroAction; mover = before.decision_context.decision_player
crossed = settled.turn !== after.turn || settled.current_phase_name !== after.current_phase_name
```

Animate `before → settled` as the play, then (if `crossed`) `settled → after` as the turn end.
`session.steps[i]` keeps `{state_snapshot: after, rolls, event_tracks, action, player, phase, turn, ar}`
so animations can be (re)built from history. Always diff **redacted** states for anything the human
could not see (cards).

### 6.2 Catalogue

| animation | detect | data |
|---|---|---|
| Card played (AR) | `action.decision_type === SELECT_CARD && before.current_phase_name === "ACTION_ROUND" && before.decision_context.resolving_card === 0 && primary in 1..110` | card id; mode comes with the next SELECT_PLAY_MODE step (`clickInfo().mode`) |
| Play mode / Op mode chosen | SELECT_PLAY_MODE / SELECT_OP_MODE steps | `Resolution` / `OpMode`; opponent card → "event first/after" (`log_view.ts classify`) |
| Headline commit (face down) | SELECT_CARD in HEADLINE, opp's `headline_*_card` 0 before | for the AI side show a face-down card only |
| Headline reveal + order | second commit: both `headline_us_card`/`headline_ussr_card` nonzero; `after.headline_first_card`, `headline_second_card` | to split the two resolutions, call `_ts_first_headline_json` before stepping; its `state` is the board after the first headline, `rolls` = number of dice up to there |
| Influence change | per country in `countries` (keyed by name; use `.id`): `us_influence`/`ussr_influence` deltas | also `controlled_by` flips (control change → flip marker) |
| Coup | `rolls[k].type === "COUP"` | `country_id`, `roller`, `roll1` die, `mod1` (Ops+mods), `mod2` defence (2×stab), `success`, `net_delta`; plus influence deltas, `mil_ops` increase, DEFCON drop on a battleground |
| Realignment | `type === "REALIGNMENT"` | `roll1`/`mod1` US, `roll2`/`mod2` USSR, `net_delta` |
| Space Race | `type === "SPACE_RACE"` | `country_id` = target box, `roll1`, `mod1` = max roll needed, `success`; `space.{side}` change, VP change |
| War card | `type === "WAR_EVENT"` | `card_id`, `country_id`, `roll1`, `mod1`, `mod2` threshold, `success`, `net_delta` |
| Olympics | `type === "OLYMPIC_GAMES"` | `roller` = sponsor, `roll1` die, `mod1` = 2, `roll2` opponent die, `success` = sponsor won |
| Summit | `type === "SUMMIT"` | `roll1/mod1` US, `roll2/mod2` USSR, `net_delta` (+2 US / −2 USSR / 0), then CHOOSE_BRANCH by the winner |
| Trap escape | `type === "TRAP_ESCAPE"` | `roll1`, `mod2` threshold (default 4), `success`; flag `QUAGMIRE_ACTIVE`/`BEAR_TRAP_ACTIVE` cleared |
| VP change | `victory_points` delta; per Event: `tracks[]` | split by `describeEventTracks` logic when several events (e.g. two headlines) |
| DEFCON change | `defcon` delta (also +1 at turn start inside `settled→after`) | DEFCON 2 → NORAD, DEFCON 1 → game over |
| Scoring | `action` selects a scoring card (ids 1,2,3,37,38,79,81) — or Star Wars/Grain Sales etc. resolving one; VP delta + `tracks` entry with that `card_id` | breakdown: `engine.regionScores(before)` (`RegionScore{us,ussr:{status,countries,battlegrounds,adjacent,vp,controlled}}`); Europe control → `flags` gets `EUROPE_CONTROL_WIN` |
| Final scoring | `crossed` at end of turn 10 → terminal | `regionScores(settled)` for all regions |
| Mil-ops penalty / reset | in `settled→after`: VP change and `mil_ops` → 0 | |
| Effects on/off | `flags` set difference | names/side/duration from `EFFECT_INFO_MAP`; `TURN` ones go to "this turn" strip |
| Card movements | `card_locations` diff per id | to `DISCARD_PILE`/`REMOVED_FROM_GAME`/`ONGOING_EVENT`/`HAND_*`; `DRAW_DECK→HAND_*` = deal; `DISCARD_PILE→DRAW_DECK` = reshuffle; `UNAVAILABLE→DRAW_DECK` = new era (turns 4, 8); `*_UNKNOWN→*_KNOWN` = revealed (Lone Gunman, Aldrich Ames, Grain Sales); Five Year Plan / Terrorism random discards (`randomDiscards`) |
| China Card passes | `china_card.holder` / `playable` change | |
| Missile Envy exchange | `forced_card_id === 49` newly set (`missileEnvyExchange`, `describe.ts:478`) | taken card id, giver/taker |
| Turn / AR / phasing change | `turn`, `action_round`, `phasing_player`, `current_phase_name` | turn banner; AR8 only for one side |
| Game over | `after.is_terminal` | `terminal_utility`, `engine.endingReason()` (+ held-scoring-card fix §2.8) |
| AI "thinking" | between `refresh` and the AI move | search may take seconds |

### 6.3 Pacing

DeepStruggle has no animation queue: the map only flashes influence boxes that changed since the
last render (`.inf-changed`, skipped when >12 countries changed) and shows a roll tray of the latest
half-AR's dice (`recentRolls`, max 4, `rolls.ts:22,52`). AI moves are paced only by the 350 ms
timer. For us: apply an AI micro-step, build its event list, play it, and only then ask the AI for
the next micro-step (or ask the AI for a whole play first and animate the grouped play — the
`groupLog` boundaries are the natural units).

---

## 7. Risks and open questions

1. **Undo policy** (RNG in snapshot lets undo reveal dice/draws/AI replies). Decide before building.
2. **Seats**: must call `engine.seat()` for both sides after `newGame`, after `loadSaveJson`, and before
   replaying a stored record; the AI side needs the model's `obsFeatures` (from ONNX metadata).
3. **Display JSON size / cost**: `display()` (and `settledDisplay()`) are JSON-parsed several times per
   step; the session keeps one full `state_snapshot` per step (≈ hundreds of steps). Not measured.
4. **The full state is in the page** (both hands; and `pos=` links). Acceptable for PvE; don't put
   `pos=` in URLs.
5. Gaps in DeepStruggle's HUD (§3.5 items 1–2) mean those paths are **untested from a UI**; we should
   test Junta/TDTW decline and Grain Sales + UN Intervention explicitly.
6. Ending reason mislabels for held scoring cards (fix in our result screen, not in the engine).
7. Not verified here: exact `remaining_steps` arithmetic for 2-cost influence placement; whether all
   event POINT_NODEs set `max_per_country` the page could display; per-card zh text vs errata.
8. `ts_first_headline_json` is exported but unused by this page (made for another site); behaviour
   when the first headline asks a decision → returns `""` per its comment — treat as "no split".
