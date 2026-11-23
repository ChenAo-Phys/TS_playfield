# DeepStruggle WebAssembly engine — programming contract for our frontend

Source of truth (read-only vendor copy): `vendor/DeepStruggle/`. All paths below are relative to it
unless they start with `/` or `docs/`. Line numbers are from the copy as of 2026-11-22.

Everything marked **[verified]** was checked by running the already-built module
`web/ui/public/engine/ts_engine.mjs` (+ `ts_engine.wasm`, built 2026-11-22 11:04, fingerprint
`134a592a22473a8a12b694c93756f9ee33a88e62ad0c5ed8f65108eb7466eddf`) under Node 26 with throw-away probe scripts in
the session scratchpad (random-play games, ~4,000 decisions over 30 games plus targeted probes).

---

## 0. The ten things to know first

1. **One global game per module instance.** The C side holds a single `ts::GameState g_state` (`bindings/wasm/ts_engine_wasm.cpp:53`). Need a second position (AI search, previews) → instantiate a second module (DS does this in a Web Worker) or snapshot/restore around the call.
2. **The flat action space is 304 wide, not 220.** `ts_action_size()` = 304 (`FLAT_ACTION_SPACE_SIZE = flat_slots::SIZE`, `engine/include/ts/action_mask.hpp:30,43`). Slots 0..219 are the "base" (E4) space every view shares; 220..303 are P42 "macro / until-control" slots, legal only in the macro view. A base-network's logits are 220 wide and are padded to 304 with -1e9 (`web/ui/src/analysis/model.ts:189-211`). **[verified]**
3. **`ts_step` resolves every chance node itself** (dice, the turn-end cleanup, the next deal) with the engine RNG unless you force a die. After `ts_step` returns, either the game is terminal or `ts_decision_player()` is ±1 — never 0 mid-game. **[verified over 4,029 random decisions]**
4. **`ts_step` does NOT auto-advance forced (single-option) decisions.** About 1.6% of decisions had exactly one legal action (POINT_NODE 42, SELECT_CARD 18, SELECT_OP_MODE 4 in 4,029). The frontend must play them (or show them) itself. **[verified]**
5. **The decider is not always the phasing player.** Events hand decisions to the other side mid-round (Olympic Games boycott, Blockade discard, the opponent placing influence for an opponent-card event played for Ops, Summit winner, Eagle/Bear discard, Cuban Missile Crisis payoff...). Always drive the loop from `ts_decision_player()`. **[verified]**
6. **Build human options from the flat mask (`ts_mask(0)`) and send `ts_decode_flat(idx)`**, not from `display.legal_actions.valid_ids`. The per-decision `valid_ids` are in a different, legacy index space and miss actions (e.g. Muslim Revolution's forced CONFIRM_DONE shows `valid_ids: []`; Grain Sales' UN-Intervention slot; CONFIRM_DONE in general). **[verified]**
7. **`display()` is god-mode JSON** (both hands, deck order is not exposed but the AI's hidden hand, the AI's face-down headline and the AI's legal actions are). The human's view must be redacted before any render (port `web/ui/src/game/view.ts:81-126`). Save JSON and raw snapshots also contain hidden info **and the RNG state**.
8. **Seat both sides after every `newGame` and every `loadSaveJson`**: `seat_rules` lives in `GameState` and is zeroed by both (save JSON does not carry it). Snapshots preserve it. Human seat = `ts_obs_features_rules()` (= 1544); AI seat = the ONNX model's `ts.obs_features`. **[verified]**
9. **The held-scoring-card tournament rule IS enforced** (`engine/src/state_machine.cpp:748-765`): at turn end, a side holding a scoring card loses (VP set to ±20); both holding → VP 0, draw. **[verified empirically: USSR held Middle East Scoring at end of T1 → VP +20, US win]**. But `ts_ending_reason()` reports it as `"20 VP"`, and the both-hold draw as `"wargames"` (misclassified) — detect it yourself (§8.4).
10. US +2 bid is built into setup (USSR 6 in E. Europe → US 7 in W. Europe → US 2 bonus in countries with US influence; `engine/src/state_machine.cpp:1024-1069`). Optional cards #104-110 are in the deck (The Cambridge Five #104 was dealt in a probe). **[verified]**

---

## 1. Loading the module

### 1.1 Files
- Built by `tools/scripts/build_web.sh --engine` (Emscripten) into `web/ui/public/engine/`:
  - `ts_engine.mjs` (~18 KB ES-module factory) and `ts_engine.wasm` (~410 KB).
- Link flags (`bindings/CMakeLists.txt:51-56`): `-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1`,
  `-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,HEAPF32,UTF8ToString,stringToNewUTF8`, and `_malloc`/`_free` exported.
- Export list: `TS_WASM_EXPORTS` (`bindings/CMakeLists.txt:28-49`). Some functions the TS wrapper uses are not in that
  list (e.g. `_ts_base_action_size`, `_ts_macro_points`) but are exported anyway because every
  `TS_API` is `extern "C" EMSCRIPTEN_KEEPALIVE` (`ts_engine_wasm.cpp:38-43`). **[verified: 83 `_ts_*` functions on the module]**
- The `.mjs` locates the `.wasm` next to itself (`import.meta.url`), so copy both files together into our `public/engine/`.

### 1.2 Factory and wrapper
`WasmEngine.load(base = import.meta.env.BASE_URL)` (`web/ui/src/engine/wasm_engine.ts:47-57`):
```ts
const url = new URL(`${base}engine/ts_engine.mjs`, location.href).href;   // absolute: Vite dev refuses "?import" on public/
const createModule = (await import(/* @vite-ignore */ url)).default;
const M = await createModule();                                           // Emscripten Module
```
Constructor (`wasm_engine.ts:31-39`) reads `fingerprint`, `obsSize` (3824), `actionSize` (304), `baseActionSize` (220),
`layout` (parsed `ts_action_layout_json`), `stateSize` (1664 bytes) and calls `setEngineLayout(layout)`
(`web/ui/src/engine/layout.ts:47`). On GitHub Pages `base` must be `/TS_playfield/`.

### 1.3 Memory/string rules
- Returned `const char*` live only until the next call that returns a string (`g_text`, `ts_engine_wasm.cpp:9,72-78`). Copy with `UTF8ToString` immediately.
- Returned pointers into buffers (`ts_mask`, `ts_decode_flat`, `ts_observation*`) are static C buffers overwritten by the next call; the heap can also move on growth. **Always `.slice()` out of `HEAPU8/HEAP32/HEAPF32`** (the wrapper does).
- String inputs: `stringToNewUTF8(text)` → call → `_free(ptr)`.
- Errors: functions return 0 / null / "" / -1 and set `ts_last_error()`.

---

## 2. Every exported function

Signatures are C; "→ TS" is the wrapper in `web/ui/src/engine/wasm_engine.ts` (none = no wrapper in DS).
Player ints everywhere: **1 = US, -1 = USSR, 0 = none** (`player_from_int`, `ts_engine_wasm.cpp:140-142`; `PLAYER_US/PLAYER_USSR`, `wasm_engine.ts:16-17`).

### 2.1 Identity and layout
| C (line) | Args → return | → TS | Notes |
|---|---|---|---|
| `ts_fingerprint` (167) | () → `const char*` | `fingerprint` (ctor) | Engine-source hash; compare with ONNX `ts.engine_fingerprint` (warn only). |
| `ts_obs_size` (168) | () → int | `obsSize` | 3824 (base observation v2.3). |
| `ts_action_size` (169) | () → int | `actionSize` | 304. |
| `ts_base_action_size` (171) | () → int | `baseActionSize` | 220. |
| `ts_action_layout_json` (174-276) | () → JSON | `layout` | See §2.8. |
| `ts_last_error` (278) | () → string | private `lastError()` | |

### 2.2 Names (English, from the engine)
| C | Args → return | → TS |
|---|---|---|
| `ts_card_name` (281) | id 1..110 → string ("" otherwise) | `cardName(id)` (414) |
| `ts_card_ops` (284) | id → printed Ops (0 otherwise; China Card 6 → 4, scoring → 0) | `cardOps(id)` (415) |
| `ts_country_name` (287) | id 0..83 → string | `countryName(id)` (416) |

`rules/cards.json` (110 entries: `id, side, ops, name, description, one_time, age`) and `rules/map.json`
(`metadata, regions, countries[id,name,stability,battleground,region,subregions,superpower_adjacent,neighbours,pos]`) agree with these
exactly: 0 name and 0 ops mismatches. **[verified]** The engine exports no card side/era/star/text, nor adjacency — use those JSON files.

### 2.3 Position lifecycle
| C | Args → return | → TS | Notes |
|---|---|---|---|
| `ts_new_game` (293-296) | (u32 seed_lo, u32 seed_hi) → void | `newGame(seed)` (69-73) splits a JS number into lo/hi (safe to 2^53) | `init_game` then drains chance nodes. Same seed ⇒ same deal **[verified]**. Zeroes seat rules **[verified]**. Starts in SETUP, USSR to place. |
| `ts_state_size` (300) | → int | `stateSize` | 1664 bytes in this build. |
| `ts_state_ptr` (301) | → `uint8_t*` | `snapshot()` (76-78) = `HEAPU8.slice(ptr, ptr+size)`; `restore(bytes)` (80-83) = `HEAPU8.set` (throws if size differs) | Raw `GameState` (trivially copyable): everything incl. hands, RNG, seat rules. Does not reset the click buffers (§3.4). |
| `ts_display_json` (303) | → JSON | `display()` (85-87) | §4. |
| `ts_settled_display_json` (306) | → JSON | `settledDisplay()` (94-96) | §3.4. |
| `ts_click_rolls_json` (308-312) | → JSON array | `clickRolls()` (100-102) | §3.4. |
| `ts_click_event_tracks_json` (313-317) | → JSON array | `clickEventTracks()` (106-108) | §3.4. |
| `ts_save_json` (318) | → JSON | `saveJson()` (110-112) | Format `ts_save_v2` (§4.9). |
| `ts_load_save_json` (322-332) | (const char*) → 1/0 | `loadSaveJson(text)` (115-122) throws with reason | Refused unless parse ok, `load_save` ok, and `save(load(x)) == x` byte-for-byte; then drains chance nodes. On failure the live game is untouched. **Seat rules become 0** **[verified]**. |

### 2.4 Status of the open decision
| C | → return | → TS |
|---|---|---|
| `ts_is_terminal` (545) | 1/0 | `isTerminal()` (124) — `phase == GAME_OVER || |VP| >= 20` (`engine/src/engine.cpp:236`) |
| `ts_terminal_utility` (546) | float: +1 US win, -1 USSR win, 0 draw (sign of VP) | `terminalUtility()` (125) (`engine.cpp:240-246`) |
| `ts_ending_reason` (547) | string | `endingReason()` (126) — see §8.4 |
| `ts_decision_player` (548) | 1 / -1 / 0 | `decisionPlayer()` (128). 0 only at a chance node (never seen after `ts_step`) or at game end. |
| `ts_decision_type` (549) | DecisionType int | `decisionType()` (129). At game end it reads 7 (ROLL_DIE, the parked turn cleanup) with player 0 **[verified]** — check terminal first. |

### 2.5 Acting
| C | Args → return | → TS | Notes |
|---|---|---|---|
| `ts_step` (565-573) | (decision_type, primary, secondary, flags, forced_die) → 1/0 | `step(a: MicroAction, forcedDie=0): string\|null` (137-140) returns the refusal reason or null | One MicroAction then drain all chance nodes. All-or-nothing (`apply`, 117-138). Refusals: `"the game is over"`, `"forced die must be 0..6"`, `"the action is for a different decision than the one open"` (type ≠ open decision, except Grain Sales' UN Intervention, `for_open_decision` 557-562), `"the engine refused the action"` (not in the flat mask under the seat rules), `"the engine refused the die roll"`. **[verified]** |
| `ts_step_dice` (578-587) | + forced_opp_die → 1/0 | none | Same, forcing both dice of an opposed roll (realignment). For the analysis board; we don't need it. |
| `ts_first_headline_json` (595-623) | same args as `ts_step_dice` → JSON `{"state": <display>, "rolls": n}` or "" | none | Steps a **copy** with the action and stops between the two headlines, so you can show headline 1 resolving on its own. Returns "" unless this action is the second headline pick and the first headline doesn't end the game **[verified: "" for the first pick, `{rolls,state}` for the second]**. **It clears and refills the click-roll buffer** — call it *before* `ts_step`, never between `ts_step` and `clickRolls()`. The `state` is god-mode: redact it. |
| `ts_mask` (626-630) | (view 0/1/2) → `uint8_t*` [304] | `mask(merged: boolean, macro=false)` (146-149): `merged ? 1 : macro ? 2 : 0` | Flat legal mask of the open decision, in view 0 = E4, 1 = MERGED (E4.1), 2 = MACRO (P42), under the decider's seat rules. All zeros at terminal **[verified]**. ~1 µs. |
| `ts_decode_flat` (634-645) | (idx) → `int32_t*` [type, primary, secondary, flags] or null | `decodeFlat(idx): Required<MicroAction>` (172-178), throws outside 0..303 | Decodes in the context of the open decision (`ActionMask::decode_flat_action_212`, `engine/src/action_mask.cpp:844-905`). Macro slots 220..303 decode to `{0,0,0,0}` (NONE) **[verified]** — expand them (§5.5). |
| `ts_macro_points` (649-657) | (idx) → points this until-control slot would place (0 if not offered) | `macroPoints(idx)` (152-154) | |
| `ts_is_merged_influence_action` (660-663) | (idx) → 1/0 | `isMergedInfluenceAction(idx)` (180-182) | True for any NODE slot (116..199) or OPS_INFLUENCE (112) **at SELECT_PLAY_MODE / SELECT_OP_MODE**, regardless of the mask — only meaningful when you are in the merged view. |

### 2.6 Observation and seating
| C | Args → return | → TS | Notes |
|---|---|---|---|
| `ts_observation` (666-671) | (player) → `float*` [3824] | none | Base layout only. |
| `ts_obs_size_for` (675-678) | (u32 features) → width, 0 + error for unknown bit | `obsSizeFor(features)` (198-202) throws | 3824 + 3 if `OPS_BUDGET` (bit value 2); every other bit has width 0 **[verified]**. |
| `ts_observation_features` (704-708) | (player, u32 features) → `float*` | `observation(player, features=0): Float32Array` (190-194) | The model's own view; must use the model's exact `obs_features` (HEADLINE_REVEAL has no width, so a wrong set silently misreads). |
| `ts_seat_obs_features` (682-688) | (player ±1, u32 features) → 1/0 | `seat(player, features): boolean` (165-169) — true if the seat's rules changed; throws on error | Stores `RULES & features` in `seat_rules[side]` (`game_state.hpp:657-659`). Non-rule bits are ignored (seat(1, 14) → rules 8) **[verified]**. |
| `ts_seat_rules` (691-695) | (player) → rule bits or -1 | used inside `seat()` | |
| `ts_obs_features_rules` (699) | → u32 `PERSON_RULES` | `currentRules` getter (157-159) | = 1544 = `OPP_EVENT_GATED(8) | OWN_EVENT_GATED(512) | ALWAYS_ASK_DISCARD(1024)` **[verified]**. |

### 2.7 Scoring helper
| C | Args → return | → TS |
|---|---|---|
| `ts_region_scores_json` (499-543) | (JSON `{"countries": <display countries>, "flags": <display flags>}`) → JSON or "" | `regionScores(state)` (401-410), throws on error |

See §8.1.

### 2.8 `ts_action_layout_json` (verified output)
```json
{"size":304,
 "offsets":{"card":0,"play_mode":110,"op_mode":112,"roll_die":115,"node":116,"branch":200,"defcon_value":209,"region":214},
 "confirm_done_index":208, "ops_influence_index":112,
 "decision_types":{"NONE":0,"SELECT_CARD":1,"SELECT_PLAY_MODE":2,"CHOOSE_TIMING_BRANCH":3,"SELECT_OP_MODE":4,"POINT_NODE":5,"CHOOSE_BRANCH":6,"ROLL_DIE":7},
 "resolutions":{"EVENT":0,"SPACE":1,"OPS_INFLUENCE":2,"OPS_COUP":3,"OPS_REALIGN":4},
 "op_modes":{"INFLUENCE":0,"COUP":1,"REALIGN":2},
 "regions":{"EUROPE":0,"ASIA":1,"MIDDLE_EAST":2,"AFRICA":3,"CENTRAL_AMERICA":4,"SOUTH_AMERICA":5},
 "card_ids":{"ASIA_SCORING":1,"EUROPE_SCORING":2,"MIDDLE_EAST_SCORING":3,"FIVE_YEAR_PLAN":5,"BLOCKADE":10,"WARSAW_PACT_FORMED":16,
   "OLYMPIC_GAMES":20,"UN_INTERVENTION":32,"CENTRAL_AMERICA_SCORING":37,"SE_ASIA_SCORING":38,"SALT_NEGOTIATIONS":43,"SUMMIT":45,
   "HOW_I_LEARNED_TO_STOP_WORRYING":46,"MISSILE_ENVY":49,"GRAIN_SALES_TO_SOVIETS":67,"SHUTTLE_DIPLOMACY":73,
   "ASK_NOT_WHAT_YOUR_COUNTRY_CAN_DO_FOR_YOU":77,"AFRICA_SCORING":79,"SOUTH_AMERICA_SCORING":81,"STAR_WARS":85,"TERRORISM":92,
   "CHERNOBYL":94,"ALDRICH_AMES":98,"WARGAMES":100,"OUR_MAN_IN_TEHRAN":108,"EAGLE_BEAR_LANDED_DISCARD":250},
 "rollout_stops":["boundaries","turn","later","earlier","predeal","earlier_predeal"],
 "rollout_leaves":["mover","decider","own"],
 "space_boxes":[{"min_ops":0,"max_roll":0,"vp_first":0,"vp_second":0},{"min_ops":2,"max_roll":3,"vp_first":2,"vp_second":1},
   {"min_ops":2,"max_roll":4,"vp_first":0,"vp_second":0},{"min_ops":2,"max_roll":3,"vp_first":2,"vp_second":0},
   {"min_ops":2,"max_roll":4,"vp_first":0,"vp_second":0},{"min_ops":3,"max_roll":3,"vp_first":3,"vp_second":1},
   {"min_ops":3,"max_roll":4,"vp_first":0,"vp_second":0},{"min_ops":3,"max_roll":3,"vp_first":4,"vp_second":2},
   {"min_ops":4,"max_roll":2,"vp_first":2,"vp_second":0}]}
```
`EAGLE_BEAR_LANDED_DISCARD` = 250 is a pseudo card id used as `resolving_card` for the Space Race box-6 end-of-turn discard.
Never hard-code these in our code; read them from `layout` (DS's rule: "the page keeps no copy of any of them").

### 2.9 Debug / analysis-board (do not use in normal play)
`ts_set_country(cid, us, ussr)` (712) → `setCountry` (418); `ts_set_defcon(1..5)` (718) → `setDefcon` (421); `ts_set_vp(-20..20)` (723) → `setVp` (422);
`ts_card_location(card)` (737) → raw `CardLocation` int; `ts_set_card_location(card, loc)` (741); `ts_set_rng(lo, hi)` (748) sets `rng_state` (no TS wrapper — see §7.4 for one legitimate use);
`ts_selftest(games, u32* steps_out)` (1115) whole-game digest for parity tests (pass 0 for steps_out; 2 games ≈ 24 ms).

### 2.10 Rollout root and belief (needed only if our AI is a *search* player)
All operate on the module's own position; DS runs them in a Worker with a **separate module instance** (`web/ui/src/analysis/rollout_worker.ts`).

| C (line) | → TS | Purpose |
|---|---|---|
| `ts_rollout_reset(horizon, shared_dice, guard, features, seed_lo, seed_hi, stop, leaf, keyed, aligned, box4)` (780) | `rolloutReset(...)` (217-222) | New batch. `stop`/`leaf` are indexes into `layout.rollout_stops/leaves`; `keyed` 0/1/2. |
| `ts_rollout_candidates(logits*, mask*, k, int32* out)` (1066) | `rolloutCandidates` (294-305) | Top-k legal moves by root logits. |
| `ts_rollout_add(cands*, k, worlds)` (799) | `rolloutAdd` (308-318) | Add the held position × candidates × worlds (opponent hand resampled: honest). |
| `ts_rollout_add_belief(cands*, k, worlds, deal)` (922) | `rolloutAddBelief` (227-237) | Same, worlds dealt from the belief. |
| `ts_rollout_fill_live()` (976), `ts_rollout_buf_obs()` (983), `ts_rollout_buf_masks()` (984), `ts_rollout_obs_width()` (968) | `rolloutFillLive()` (337-340) | Rows to evaluate. |
| `ts_rollout_step(logits*)` (987) | `rolloutStep` (343-351) | Advance rows by masked argmax. |
| `ts_rollout_all_done` (967), `ts_rollout_live` (966), `ts_rollout_refused` (969) | `rolloutAllDone/Live/Refused` | |
| `ts_rollout_fill_leaves` (995), `ts_rollout_set_leaf_values(vals*)` (1034) | `rolloutFillLeaves` (354), `rolloutSetLeafValues` (359) | Critic at horizon. |
| `ts_rollout_race(position, worlds, belief)` (946), `ts_rollout_in_race` (961) | `rolloutRace`, `rolloutInRace` | Racing variant. |
| `ts_rollout_decide(position, cands*, k, logits*, mask*, rule)` (1077) → JSON `{pick,worlds,q[],lead[],lead_se[]}` | `rolloutDecide` (370-385) | Final pick; `rule` = `argmax`, `z<x>`, `kl<t>`. |
| `ts_rollout_rows/values/row_*/worlds_used/leaf_features/leaf_feature_count` (965-1061) | none | Diagnostics. |
| `ts_belief_reset(particles, all_decisions, seed_lo, seed_hi, reveal)` (824), `_temperatures` (828), `_temperature(t)` (829), `_particles` (832), `_observe(type,p,s,f)` (837), `_prepare` (857), `_decisions` (863), `_action(d)` (866), `_rows(d, lo, n, features)` (873), `_set_log_likelihoods(lp*)` (895), `_temperature_weights(out*)` (905), `_worlds(n)` (912) | `belief*` (247-291) | Policy-likelihood belief over the opponent's hand; `beliefObserve` must be called **before every move is applied, at the position it is made in** (DS replays `{before snapshot, action}` pairs, `rollout_runner.ts:128-136`). |

The complete search loop is `rolloutRoot()` in `web/ui/src/analysis/rollout.ts:113-167` (E4 view only; refuses merged/macro models).
Spec grammar and the default player: `web/ui/src/analysis/rollout_spec.ts` (`DEFAULT_ROLLOUT = rollout:4:32:4:z2:earlier:own:keyed:aligned:box4`).

---

## 3. Game lifecycle

### 3.1 New game
`newGame(seed)` → `StateMachine::init_new_game` (`engine/src/state_machine.cpp:156-207`): standard setup influence, China Card to USSR face-up,
Early War deck shuffled and dealt from `rng_state`, phase SETUP. Then:
- SETUP: USSR `POINT_NODE` ×6 (Eastern Europe), US ×7 (Western Europe), US ×2 bonus (`pending_ops_value == 1` marks the bonus stage; any country with US influence). All via flat NODE slots. **[verified]**
- `start_turn` (`state_machine.cpp:209-245`): DEFCON +1, deal, HEADLINE. **The US picks its headline first** (`decision_player = US`), then the USSR — unless exactly one side has Space Race box 4 ("Man in Earth Orbit"), in which case the *other* side picks first.
- Headline pick #1 stores `headline_<side>_card` but the card **stays in hand** (`HAND_*_UNKNOWN`); pick #2 commits both (`HEADLINE_COMMITTED`) and resolves them in Ops order (US wins ties) **inside the same `ts_step`**, including their dice, if they need no player decisions (`state_machine.cpp:1077-1147`). **[verified: one step resolved Duck and Cover + Korean War incl. a WAR_EVENT roll and went to AR1]**
- AR1 begins with USSR `SELECT_CARD` (possibly preceded by the Cuban Missile Crisis payoff `POINT_NODE`, `state_machine.cpp:320-329`).

### 3.2 Stepping and dice
- `step(a, forcedDie=0)`: forcedDie 0 = roll from `rng_state` (SplitMix64, part of `GameState`); 1..6 = force the acting player's die (DS's manual die). We should always pass 0.
- Every chance node (`decision_player == NONE && decision_type == ROLL_DIE`) is drained in the same call (`drain`, `ts_engine_wasm.cpp:101-114`), including the turn-end cleanup (`RollType::TURN_CLEANUP`, no die), Eagle/Bear handled as a real decision, the deal, the held-scoring check.
- All randomness is deterministic from the state: same snapshot + same action ⇒ same dice. Consequence for undo: §7.4.
- `MicroAction.secondary_id` is ignored for non-dice decisions (a POINT_NODE with `secondary_id: 3` was accepted) **[verified]**; DS's HUD puts the manual die there (`web/ui/src/main.ts:1323`). Send 0.

### 3.3 Snapshot / restore / save / load
- Undo: `snapshot()` before each step, `restore(bytes)` to go back (DS `GameSession.apply/undo`, `web/ui/src/game/session.ts:216-231, 342-367`, MAX_UNDO 300).
- `saveJson()` → canonical JSON (keys sorted, compact; byte-identical to Python's). `loadSaveJson()` restores the full position incl. the decision stack and RNG, **not** `seat_rules` (re-seat), **not** `action_history`/`turn_aggregates` (no rule reads them).
- Persistence across page reloads: DS stores `{seed, [MicroAction...], tags}` and replays (`session.ts:168-198`) rather than the save. Either works; replay needs an identical engine build (fingerprint).

### 3.4 What the last click did: settled vs display, clickRolls, clickEventTracks
After `ts_step`:
- `display()` = state after *everything* (action + all chance nodes). If the click ended the turn, this is already the next turn's HEADLINE (cleanup VP, mil-ops reset, DEFCON +1 and the new deal applied) and its `die_roll` has been cleared.
- `settledDisplay()` = state right after the click's action, or after its **last die roll**, *before* the roll-less chance steps (turn cleanup). Use it to animate the click; animate `settled → display` as "end of turn". **[verified: coup on T1 AR6 → settled turn 1 / AR 7 / ACTION_ROUND, display turn 2 / HEADLINE]**
- `clickRolls()` = array of every die-roll record (§4.5 shape) the click produced, in order (a click can roll several: realignment + opponent war card event, two headlines). **[verified: 17 multi-roll clicks in 60 random games]**
- `clickEventTracks()` = array of `{card_id, card_name, vp_delta, defcon_delta}` for every Event the click resolved (vp_delta positive toward US). Needed because two headlines in one step can net to zero.
- DS logic for "crossed a turn": `settled.turn !== after.turn || settled.current_phase_name !== after.current_phase_name` (`session.ts:240-242`).
- These buffers are only refreshed by `ts_step`/`ts_step_dice` (and clobbered by `ts_first_headline_json`); `newGame`, `loadSaveJson`, `restore` leave stale values. Read them immediately after the step.

### 3.5 End of game
Terminal when `phase == GAME_OVER || |VP| >= 20`. Winner by `terminalUtility()` sign. Reasons from `ts_ending_reason()`
(`bindings/state_json.cpp:1156-1189`): `"20 VP"`, `"Europe Control"`, `"DEFCON 1 (own decision)"`, `"DEFCON 1 (opponent decision)"`,
`"final scoring"`, `"wargames"`. Final scoring happens after turn 10 (`finish_end_turn`, `state_machine.cpp:748-…`, `Scoring::execute_final_scoring`).
Held scoring card: §8.4.

---

## 4. Display `GameState` JSON (`ts_display_json`)

Written by `ts::state_json::display_state` (`bindings/state_json.cpp:460-749`). Keys are **sorted alphabetically** in the text
(canonical dump). TS mirror: `web/ui/src/types.ts:112-178` (`GameState`) — it omits a few fields noted below.

### 4.1 Top-level fields
| Field | Type | Meaning / source line |
|---|---|---|
| `victory_points` | int -20..20 | + = US ahead (464) |
| `defcon` | int 1..5 | (465) |
| `mil_ops` | `{US:int, USSR:int}` | Military Operations this turn (466-469) |
| `space` | `{US:int, USSR:int}` | Space Race box 0..8 (470-473) |
| `turn` | int | 1..10 (11 after final scoring path); SETUP shows 1 (474) |
| `action_round` | int | 0 in SETUP/HEADLINE; 1..8; can read 9 (one past the last) during cleanup (475) |
| `phasing_player` | "US"/"USSR"/"NONE" | (478) |
| `current_phase` / `current_phase_name` / `phase_name` | int / string | Phase enum `SETUP 0, HEADLINE 1, ACTION_ROUND 2, INTERRUPT 3, DISCARD 4, END_TURN 5, GAME_OVER 6` (`engine/include/ts/types.hpp:33-41`). Only SETUP, HEADLINE, ACTION_ROUND, GAME_OVER observed in play **[verified]**. (479-481) |
| `headline_us_card`, `headline_ussr_card` | card id or 0 | Set as soon as that side picks — **the first picker's card is visible here while still face down** (482-483) |
| `headline_first_card`, `headline_second_card` | card id or 0 | Resolution order once both picked (484-485) |
| `headline_stage` | int | 0 choosing, 1 resolving first, 2 resolving second, 3 done (486) |
| `forced_card_player` / `forced_card_id` | "US"/"USSR"/"NONE" / id | Missile Envy (49) owed (487-488) |
| `last_die_roll`, `last_opp_die_roll` | int | legacy (489-490) |
| `die_roll` | object | The last step's roll record (§4.5); `type:"NONE"` when none (492-509) |
| `event_tracks` | array | Last step's Event VP/DEFCON changes (513-523) |
| `space_turns_used` | `{US:0..2, USSR:0..2}` | Space attempts this turn (526-529) |
| `china_card` | `{holder:"US"/"USSR", playable:bool}` | (532-535). **The China Card (id 6) is never in `hands`; its `card_locations["6"]` is always `"ONGOING_EVENT"`** **[verified]**. Render it from this field; it is selectable via flat slot 5 when legal. |
| `flags` | string[] | Active continuous effects (§4.6) (538-593) |
| `persistent_effects` | uint64 number | Raw bit set — **not exact in JS above 2^53; use `flags`** (595) |
| `chernobyl_region` | int (Region) | **Present only while Chernobyl is active** (598-601). Not in types.ts. |
| `countries` | object keyed by **English country name** | 84 entries (§4.2) (604-623) |
| `hands` | object | §4.3 (626-666) |
| `discard_pile` | int[] | card ids, ascending (667) |
| `removed_pile` | int[] | (668) |
| `unavailable_cards` | int[] | Not yet in the game (later era) (669) |
| `draw_deck_count` | int | (670) |
| `card_locations` | `{"1".."110": string}` | §4.4 (672-676) |
| `decision_context` | object | §4.7 (679-695) |
| `legal_actions` | object | §4.8 (698-743) |
| `is_terminal` | bool | (746) |
| `terminal_utility` | number | 0 unless terminal (747) |

Fields in types.ts that are *not* from the engine (attached by DS pages): `seed, step_index, can_undo, action_logs, players, position, view, hidden_cards, unseen_count, view_hidden_decision, last_turn, recent_rolls, region_scores, game_id`.

### 4.2 `countries[name]` (`CountryNode`)
`{id:0..83, name, stability, battleground:bool, region: Region int (0 Europe .. 5 South America), us_influence, ussr_influence, controlled_by:"US"|"USSR"|"NONE"}`.
Control rule as written (617-620): `us ≥ stab && us ≥ ussr + stab`. Subregions (W/E Europe, SE Asia) and adjacency are not here — use `rules/map.json`.

### 4.3 `hands`
`{US: int[], USSR: int[], US_cards: CardInHand[], USSR_cards: CardInHand[]}` where `CardInHand = {id, name, ops, event_ready: bool}`.
`event_ready` (not in types.ts) = the card's Event would happen if played now (for the side it fires for; false for the China Card) (641-649).
Contains every card in `HAND_*_{KNOWN,UNKNOWN}`. Does not contain headline-committed or peeked cards.

### 4.4 `card_locations` values
`CardLocation` (`engine/include/ts/types.hpp:67-84`) by name: `UNAVAILABLE(0)`, `DRAW_DECK(1)`, `HAND_US_UNKNOWN(2)`, `HAND_US_KNOWN(3)` (USSR has seen it),
`HAND_USSR_UNKNOWN(4)`, `HAND_USSR_KNOWN(5)`, `DISCARD_PILE(6)`, `REMOVED_FROM_GAME(7)`, `ONGOING_EVENT(8)`, `PEEKED_TEMP(9)` (being looked at:
Grain Sales' drawn card, Our Man in Tehran's five), `HEADLINE_COMMITTED(10)`. All 11 observed **[verified]**. `ONGOING_EVENT` was observed only for
card 6 (China) and 73 (Shuttle Diplomacy) — most "ongoing" effects are `flags`, the card itself goes to removed/discard.

### 4.5 `die_roll` / click roll record
`{type, type_id, roller:"US"|"USSR"|"NONE", card_id, card_name, country_id (255 = none), country_name, roll1, mod1, total1, roll2, mod2, total2, success, net_delta}`.
`type`: `NONE, COUP, REALIGNMENT, SPACE_RACE, WAR_EVENT, OLYMPIC_GAMES, SUMMIT, TRAP_ESCAPE, TURN_CLEANUP` (`state_json.cpp:378-390`).
Meaning per type (as DS's roll tray renders it, `web/ui/src/roll_tray.ts:54-116`):
- COUP: `roll1 + mod1` (ops) vs `mod2` (= 2×stability); `net_delta` influence swung. e.g. `{roll1:4, mod1:3, total1:7, mod2:8, success:false}` **[verified]**.
- REALIGNMENT: US `roll1+mod1` vs USSR `roll2+mod2`; `net_delta` removed.
- SPACE_RACE: `roll1` must be ≤ `mod1`; `country_id` is the **box**, not a country.
- WAR_EVENT: `roll1+mod1` needs ≥ `mod2`; `net_delta` VP.
- OLYMPIC_GAMES / SUMMIT: both sides roll; SUMMIT `net_delta` >0 US won.
- TRAP_ESCAPE (Quagmire/Bear Trap): `roll1` ≤ `mod2` (DS falls back to 4).

### 4.6 `flags`
Names, in this order (`state_json.cpp:540-586`): NATO_ACTIVE, NATO_CANCELED_FRANCE, NATO_CANCELED_WEST_GERMANY, MARSHALL_PLAN_PLAYED, WARSAW_PACT_PLAYED,
US_JAPAN_PACT_ACTIVE, CONTAINMENT_ACTIVE, PURGE_US_ACTIVE, PURGE_USSR_ACTIVE, VIETNAM_REVOLTS_ACTIVE, FORMOSAN_RESOLUTION_ACTIVE, CMC_ACTIVE_US,
CMC_ACTIVE_USSR, NUCLEAR_SUBS_ACTIVE, QUAGMIRE_ACTIVE, BEAR_TRAP_ACTIVE, SALT_ACTIVE, WE_WILL_BURY_YOU_PENDING, BREZHNEV_DOCTRINE_ACTIVE,
FLOWER_POWER_ACTIVE, U2_INCIDENT_ACTIVE, SHUTTLE_DIPLOMACY_ACTIVE, DEATH_SQUADS_US, DEATH_SQUADS_USSR, CAMP_DAVID_PLAYED, IRON_LADY_PLAYED,
NORTH_SEA_OIL_PLAYED, NORTH_SEA_OIL_ACTIVE, THE_REFORMER_PLAYED, IRAN_CONTRA_ACTIVE, EVIL_EMPIRE_PLAYED, ALDRICH_AMES_ACTIVE, JOHN_PAUL_II_PLAYED,
NORAD_ACTIVE, YURI_AND_SAMANTHA_ACTIVE, AWACS_PLAYED, IRANIAN_HOSTAGE_CRISIS_PLAY, WILLY_BRANDT_PLAYED, TEAR_DOWN_THIS_WALL_PLAYED, CHERNOBYL_ACTIVE,
SPACE_US_ATTEMPT_1, SPACE_US_ATTEMPT_2, SPACE_USSR_ATTEMPT_1, SPACE_USSR_ATTEMPT_2, DEFCON_SUICIDE_PROVOKED, CMC_SUICIDE_LOSS, EUROPE_CONTROL_WIN,
plus the pseudo-flags **MISSILE_ENVY_US / MISSILE_ENVY_USSR** (who owes Missile Envy's Ops, 589-592).
The SPACE_*_ATTEMPT_* and *_SUICIDE_*/EUROPE_CONTROL_WIN flags are bookkeeping, not "effects" to show as cards.
DS has bilingual names + descriptions for every flag: `web/ui/src/i18n/locales/{en,zh-CN}/effects.json` (MIT, reusable).

### 4.7 `decision_context`
`{decision_player, decision_type, decision_type_name, op_mode, op_mode_name, pending_op_card, pending_op_card_name, pending_ops_value,
remaining_steps, max_per_country, allow_early_stop:bool, resolving_card, resolving_card_name, stack_depth}` (681-694).
- `resolving_card` ≠ 0 ⇒ the decision belongs to that card's Event (or 250 = Eagle/Bear discard, 40 = CMC payoff).
- `pending_op_card` = the card whose Ops/mode is being chosen; at SELECT_PLAY_MODE **`pending_ops_value` is still 0** (Ops are granted after the mode is chosen) **[verified]**. It is filled at SELECT_OP_MODE / POINT_NODE.
- `op_mode` is meaningful only for Ops plays (`resolving_card == 0`); inside events it can be stale (e.g. "COUP" during Socialist Governments) **[verified]**.
- `remaining_steps` = Ops / placements left; `max_per_country` per-country cap in events.
- `stack_depth` ≤ 5 (nested events; max 2 seen in random play).

### 4.8 `legal_actions` (per-decision space — prefer the flat mask)
`{decision_type, decision_type_name, decision_player, valid_ids:int[], valid_action_labels:{id:label}, allow_early_stop:bool, can_decline:bool, un_intervention?:bool}`.
`valid_ids` index space: SELECT_CARD → card id (0 = pass); SELECT_PLAY_MODE → Resolution 0..4; SELECT_OP_MODE → OpMode 0..2; POINT_NODE → country 0..83;
CHOOSE_BRANCH → 0..7, but **DEFCON level 1..5 for Summit / How I Learned** **[verified: Summit at DEFCON 3 → [2,3,4]]**.
`can_decline` = flat[208] (CONFIRM_DONE legal; not in types.ts). `un_intervention` only at Grain Sales' play-mode node (flat[31]).
`valid_ids` misses actions that the flat mask has (CONFIRM_DONE whenever `allow_early_stop` is false; Muslim Revolution showed `valid_ids: []` with flat `[208]`).

### 4.9 Save JSON (`ts_save_v2`) — for persistence only, never render
Keys **[verified]**: `format, victory_points, defcon, turn, action_round, us_mil_ops, ussr_mil_ops, us_space_track, ussr_space_track, phasing_player(int), current_phase(int),
headline_us_card, headline_ussr_card, headline_first_card, headline_second_card, headline_stage, headline_first_owner, headline_second_owner,
forced_card_player, forced_card_id, defcon_dropped_to_2, china_card_holder, china_card_playable, persistent_effects, rng_state, last_die_roll,
last_opp_die_roll, last_roll{...}, last_event_tracks[], ctx_stack[6 frames], ctx_stack_depth, card_locations[111 ints], us_influence[84], ussr_influence[84]`
(+ `canon_prio`, `canon_prio_tag` only when set). ~3.7 KB. `rng_state` is a uint64 written as a JSON integer — **do not round-trip it through `JSON.parse`/`stringify`** (precision loss → load refused by the round-trip check). Store the string as is.

---

## 5. Decision model

### 5.1 DecisionType (`engine/include/ts/types.hpp:137-146`)
| Value | Name | What the decider is asked | Flat slots |
|---|---|---|---|
| 0 | NONE | nothing (never offered) | — |
| 1 | SELECT_CARD | Play a card in an AR / pick a headline (first: just the card) / a card choice inside an Event (UN Intervention companion, Blockade/LADC discard, Missile Envy give, SALT/Star Wars pick from discard, Our Man in Tehran discards, Ask Not discards, Aldrich Ames, Quagmire/Bear Trap escape discard, Eagle/Bear discard `resolving_card=250`) | 0..109 (card id-1), 208 = pass/done |
| 2 | SELECT_PLAY_MODE | How to resolve `pending_op_card`: Resolution EVENT/SPACE/OPS_INFLUENCE/OPS_COUP/OPS_REALIGN. On an **opponent's** card EVENT = event first then Ops; OPS_* = Ops first then the event fires | 110..114; Grain Sales extras 31 and 208 |
| 3 | CHOOSE_TIMING_BRANCH | **retired (P17)**, never emitted | — |
| 4 | SELECT_OP_MODE | Deferred Ops mode after an event-first play, UN Intervention, Grain Sales return, Olympic boycott Ops, free ops from events: INFLUENCE/COUP/REALIGN | 112..114, 208 = decline (optional free action or nothing spendable) |
| 5 | POINT_NODE | Pick one country: setup placement, Ops influence (one point per step; `remaining_steps` counts down), coup target (one step, die drained), realign target (per step), event targets, CMC payoff (`resolving_card=40`) | 116..199, 208 = stop/done |
| 6 | CHOOSE_BRANCH | Event branch: Warsaw Pact (0 remove US / 1 add USSR), Olympic Games (0 participate / 1 boycott), Wargames (0 end game giving opponent 6 VP / 1 pass), Summit & How I Learned (DEFCON level), Chernobyl (region) | 200..207, 209..213, 214..219, 208 |
| 7 | ROLL_DIE | chance node, decider NONE; drained by `ts_step` | 115 |

### 5.2 Flat action space (`engine/include/ts/action_mask.hpp:15-41`, decode `engine/src/action_mask.cpp:844-905`)
| Index | Width | Meaning | `decodeFlat` → MicroAction `{type, primary, secondary, flags}` |
|---|---|---|---|
| 0..109 | 110 | card id = idx+1 (China Card = slot 5) | `{1, idx+1, 0, 0}` |
| 110..114 | 5 | Resolution at SELECT_PLAY_MODE: 110 EVENT, 111 SPACE, 112 OPS_INFLUENCE, 113 OPS_COUP, 114 OPS_REALIGN | `{2, idx-110, 0, 0}` |
| 112..114 | (shared) | at SELECT_OP_MODE: 112 INFLUENCE, 113 COUP, 114 REALIGN | `{4, idx-112, 0, 0}` |
| 115 | 1 | ROLL_DIE | `{7,0,0,0}` |
| 116..199 | 84 | country id = idx-116 | `{5, idx-116, 0, 0}` |
| 200..207 | 8 | branch 0..7 | `{6, idx-200, 0, 0}` |
| 208 | 1 | CONFIRM_DONE ("pass / done / decline / return") | SELECT_CARD: `{1, 0, 0, 0x80}`; otherwise `{open type, 255, 0, 0x80}` **[verified]** |
| 209..213 | 5 | set DEFCON to 1..5 (Summit, How I Learned) | `{6, level, 0, 0x40}` |
| 214..219 | 6 | Region 0..5 (Chernobyl) | `{6, region, 0, 0x20}` |
| 220..303 | 84 | MACRO: "place in country idx-220 until controlled / points run out" (macro view only) | `{0,0,0,0}` — expand (§5.5) |

`action_flags` (`engine/include/ts/constants.hpp:425-432`): `CONFIRM_DONE 0x80`, `DEFCON_VALUE 0x40`, `REGION 0x20`. For CHOOSE_BRANCH the engine's encoder ignores the flag
and reads the head from `resolving_card` (`action_mask.cpp:942-963`), so a hand-built `{6, level, 0, 0}` works too — but just use `decodeFlat`.

### 5.3 Views: what "merged" and "macro" mean
`ActionView { E4 = 0, MERGED = 1, MACRO = 2 }` (`action_mask.hpp:48`). The view belongs to whoever decides; nothing in `GameState` records it.
- **E4 (0)**: the base mask above. **Use this for the human.**
- **MERGED / E4.1 (1)** (`action_mask.cpp:776-806`): only at SELECT_PLAY_MODE and SELECT_OP_MODE, "Ops for influence" is folded into its first placement: NODE slot `116+c` = `OPS_INFLUENCE` then `POINT_NODE c`; slot 112 = `OPS_INFLUENCE` then `CONFIRM_DONE` (only if placing nothing is legal). Elsewhere identical to E4. **[verified: at a play-mode node E4 = [110..114], merged = [110,111,113,114, 30 node slots]]**
- **MACRO / P42 (2)** (`action_mask.cpp:813-842`): only at POINT_NODE, adds `220+c` where repeating one-point placements in `c` until control (or until the decision changes) places ≥ 2 points. `macroPoints(idx)` says how many. **[verified: 2-point examples]**
- A model's view is in its ONNX metadata: `ts.merged_influence == "true"` / `ts.macro_influence == "true"` (`model.ts:130-139`). The rollout search only supports E4.

### 5.4 Mapping human clicks → flat index → MicroAction
Algorithm (human side, E4):
```
const m = E.mask(false);                       // 304 bytes, under the human seat's rules
const legal = indices where m[i] === 1;
// render affordances from `legal` + decision_context (table below)
on click → idx (must satisfy m[idx] === 1) → E.step(E.decodeFlat(idx), 0)
```
| Decision (`decision_context`) | Click target | Flat index |
|---|---|---|
| SELECT_CARD, AR or headline (`resolving_card==0`) | a card in hand | `id-1` |
| — China Card | the China Card token (`china_card.holder == me && playable`) | `5` |
| SELECT_CARD inside an Event (`resolving_card≠0`) | cards listed by the mask; they may be in the discard (SALT, Star Wars), in `PEEKED_TEMP` (Our Man in Tehran) or in hand | `id-1`; "pass/none" = `208` (label by `resolving_card`) |
| SELECT_PLAY_MODE | Event / Space / Influence / Coup / Realign buttons | `110 + Resolution` |
| — Grain Sales (`resolving_card==67`, card is `pending_op_card`) | play drawn card (modes above), "return it & use Grain Sales' 2 Ops" | `208` |
| — Grain Sales + you hold UN Intervention and the drawn card is the opponent's | "play UN Intervention on it" | `31` (decodes to `{SELECT_CARD,32}`; `ts_step` accepts it specially) |
| SELECT_OP_MODE | Influence / Coup / Realign | `112 / 113 / 114`; decline `208` |
| POINT_NODE | country on the map | `116 + countryId`; "done / stop" `208` |
| CHOOSE_BRANCH (Warsaw Pact, Olympics, Wargames) | branch buttons | `200 + b` |
| CHOOSE_BRANCH (Summit, How I Learned) | DEFCON level buttons | `209 + level - 1` |
| CHOOSE_BRANCH (Chernobyl) | region buttons | `214 + region` |

Typical action-round sequences (each arrow is one `ts_step`):
- Influence: `card` → `112` → `116+c` × N (one per Op; costs and adjacency are the engine's; `remaining_steps` counts down) [→ `208` only if offered].
- Coup: `card` → `113` → `116+c` (die rolled inside this step; read `clickRolls()`).
- Realign: `card` → `114` → `116+c` per Op (each step rolls).
- Space: `card` → `111` (roll inside).
- Own/neutral Event: `card` → `110` → the Event's own decisions (possibly by the opponent).
- Opponent's card: `card` → `110` (event first; opponent may decide its targets) → `SELECT_OP_MODE` → ...; or `card` → `112..114` (Ops first) → after the Ops the Event fires (opponent may decide).
- Scoring card: `card` → `110` (resolves).

Single-option decisions: the mask has one 1. Auto-click them after a short, **constant** delay (both sides), or show them; never leave the loop waiting with no button (DS had that bug class: `action_hud.ts:347-354`).

Effective Ops preview at SELECT_PLAY_MODE (value not exposed): legal trick — `snap = E.snapshot(); E.step(decodeFlat(112)); read display().decision_context.remaining_steps/pending_ops_value; E.restore(snap)`. Do it **after** reading `clickRolls()/settledDisplay()` (a preview step overwrites them), and only on the human's own decision.

### 5.5 Applying a model's flat action (port of `GameSession.applyFlat`, `web/ui/src/game/session.ts:305-339`)
```ts
function applyModelAction(idx: number, merged: boolean, macro: boolean): string | null {
  const m = E.mask(merged, macro);
  if (!m[idx]) return "not legal in this view";
  if (macro && idx >= E.baseActionSize) {                 // until-control
    const points = E.macroPoints(idx);
    const node = E.decodeFlat(idx - E.baseActionSize + E.layout.offsets.node);
    for (let k = 0; k < points; k++) { const why = E.step(node, 0); if (why) { /* undo k steps */ return why; } }
    return null;
  }
  if (merged && E.isMergedInfluenceAction(idx)) {         // "influence, first point at X"
    const why1 = E.step(E.decodeFlat(E.layout.ops_influence_index), 0); if (why1) return why1;
    if (E.isTerminal()) return null;
    const second = idx === E.layout.ops_influence_index ? E.layout.confirm_done_index : idx;
    const why2 = E.step(E.decodeFlat(second), 0); if (why2) { /* restore snapshot */ return why2; }
    return null;
  }
  return E.step(E.decodeFlat(idx), 0);
}
```
Each sub-step is a separate `ts_step` (so each has its own settled/rolls); for animation, read the click buffers after each sub-step.

---

## 6. Seating and rule bits

### 6.1 `obs_features` bits (`engine/include/ts/game_state.hpp:583-652`)
| Value | Name | Kind | Effect |
|---|---|---|---|
| 1 | (STAGED_CARDS, retired) | — | never used |
| 2 | OPS_BUDGET | observation, +3 floats | |
| 4 | HEADLINE_REVEAL | observation, 0 floats | box-4 holder sees the opponent's revealed headline in its card rows |
| 8 | OPP_EVENT_GATED | **rule** | an opponent's card offers EVENT only where it can fire (ENG-9) |
| 16 / 32 / 64 | CANONICAL_FIRST / _LAST / _LEARNED | **rule** (model action order) | never for a person; LEARNED is refused by DS pages |
| 128 / 256 | PLACEMENT_LEGAL / PLACEMENT_ORDER | observation, 0 floats | |
| 512 | OWN_EVENT_GATED | **rule** (person only) | own/neutral card offers EVENT only if it would do something; such a starred card played anyway (headline) is discarded, not removed |
| 1024 | ALWAYS_ASK_DISCARD | **rule** (person only), read on **either** seat | Blockade / Latin American Debt Crisis always ask the US; Missile Envy always asks the giver — hides whether a qualifying card exists |

`RULES = 8|16|32|64|512|1024`; `PERSON_RULES = 8|512|1024 = 1544`; unseated = 0 = the rules before every bit (E8 behaviour).

### 6.2 What seating does
`seat(player, features)` sets `seat_rules[side] = RULES & features` (`game_state.hpp:657-659`). Every mask, step validation and auto-advance reads the **decider's** seat
(`seat_plays_rule`), except ALWAYS_ASK_DISCARD which applies if **either** seat has it (`either_seat_plays_rule`). It changes which actions are legal, never the observation.

### 6.3 What the DS page passes (`web/ui/src/main.ts:893-904`, `seatSides()`, called at every `refresh()`)
```ts
for (const [side, player] of [["US", 1], ["USSR", -1]]) {
  const features = side === autoSide && model ? model.obsFeatures : engine.currentRules;   // AI seat : person seat
  engine.seat(player, features);
}
```
- Human seat: `ts_obs_features_rules()` = 1544.
- AI seat: `model.obsFeatures` = `Number(onnx.metadata["ts.obs_features"] ?? 0)` (`model.ts:67-70, 160-162`). The same value is passed to `observation(player, features)`.
- Consequence: ALWAYS_ASK_DISCARD (from the human seat) also makes the AI answer forced "done"/single-card decisions it may never have seen in training; they are single-legal-action decisions, so the policy cannot err, but they are slightly out of distribution for its observation history. This is DS's deliberate design, not an engine rule change.
- Re-seat after `newGame` and `loadSaveJson` (both zero the seats); `restore(snapshot)` keeps them. Seat before generating any mask.

---

## 7. Hidden information

### 7.1 For the AI: `observation(player, features)`
`ts_observation_features` builds the decider's view (`engine/src/observation.cpp`): the opponent's `*_UNKNOWN` hand and the deck are indistinguishable
(`DECK_OR_HIDDEN`); known cards are marked; `HEADLINE_COMMITTED` cards are shown as committed. The AI never needs (and must never be fed) anything else.
The rollout search determinizes (resamples the opponent's unknown hand) and the belief reads only public moves; both are honest per DS's design.

### 7.2 For the human: redact the display state (port `web/ui/src/game/view.ts:81-126`)
With `me` = human side, `opp` = AI side:
1. `hands[opp]` / `hands[opp+"_cards"]` keep only cards with `card_locations[id] == "HAND_<opp>_KNOWN"`; `hidden_cards[opp] = count of the rest`.
2. `card_locations`: `HAND_<opp>_UNKNOWN`, `DRAW_DECK`, and `PEEKED_TEMP` **while opp decides** → `"UNSEEN"`. `unseen_count = draw_deck_count + hidden`.
3. Face-down headline: if `headline_<opp>_card` ≠ 0 and that card's location still starts with `HAND_<opp>` and **not** (`space[me] ≥ 4 && space[opp] < 4`), set `headline_<opp>_card = 0`.
   (The US picks first by default, so when the human is USSR the AI's headline is exposed here until the human picks.) **[verified: after the US pick, `headline_us_card=4`, location `HAND_US_UNKNOWN`]**
4. While `decision_context.decision_player == opp` and not terminal: blank `legal_actions.valid_ids`, `valid_action_labels`, and do not compute/show the flat mask (it lists the AI's hand for card choices).
5. The log/animation layer must not name a card moving **into** `HAND_<opp>_UNKNOWN` (deals, draws) nor the cards the AI draws to choose from (`PEEKED_TEMP` on its turn) (`redactLogs`, `view.ts:53-78`).
6. Apply the same redaction to `settledDisplay()`, `ts_first_headline_json().state`, and any snapshot-derived display. `clickRolls()`, `clickEventTracks()`, `regionScores` are public.

### 7.3 What remains visible to a determined user (acceptable for PvE, but know it)
`display()` itself, `saveJson()`, snapshots and DevTools all hold the AI hand and `rng_state` (future dice/deals are computable). Do not put these in the URL or
in anything shared. The AI should run in the same tab (or a worker) — there is no server to hide state in.

### 7.4 Undo and dice
Dice come from `rng_state` inside the snapshot, so undo + any action that rolls next yields **the same die** — the human can learn the next roll and re-target.
Options: disallow undo across a roll (check `clickRolls().length`), or after `restore()` reseed with `ts_set_rng(lo, hi)` from `crypto.getRandomValues`
(no wrapper; changing the RNG does not touch anything the model observes). Decide this as a product question.

### 7.5 Timing side channel
ALWAYS_ASK_DISCARD exists to hide whether the US had a 3+ Ops card. If the AI answers forced single-option decisions instantly but "thinks" on real ones,
the timing leaks the same fact. Use a constant AI move delay.

---

## 8. Helpers useful for the UI

### 8.1 `regionScores(state)` (`ts_region_scores_json`, `ts_engine_wasm.cpp:491-543`)
Input: any display state's `countries` + `flags` (so it works on the redacted view). Output **[verified]**:
```json
{"regions":[ /* 0 Europe .. 5 South America, then 6 = Southeast Asia */
  {"slot":0,"battlegrounds":5,"net":0,"wins":null,
   "us":{"status":"PRESENCE","countries":2,"battlegrounds":1,"adjacent":0,"base_vp":3,"vp":4,"controlled":[{"id":1,"battleground":false},{"id":10,"battleground":true}]},
   "ussr":{"status":"PRESENCE","countries":2,"battlegrounds":1,"adjacent":0,"base_vp":3,"vp":4,"controlled":[...],"shuttle_diplomacy":false}},
  ...,
  {"slot":6,"battlegrounds":0,"net":-1,"wins":null,
   "us":{"status":null,"base_vp":null,"vp":0,"controlled":[],...},"ussr":{"status":null,"base_vp":null,"vp":1,"controlled":[{"id":37,"vp":1}],...}}],
 "ignored_flags":[]}
```
`status` ∈ NONE/PRESENCE/DOMINATION/CONTROL; `net` = US VP − USSR VP if scored now; `wins` = "US"/"USSR" if the scoring would end the game (Europe control);
counts are what the scoring *counted* (Shuttle Diplomacy, Formosan Resolution handled). TS types: `RegionScores` in `web/ui/src/types.ts:180-217`. ~cheap; call per render.

### 8.2 Other engine helpers
- `layout.space_boxes[b]` = `{min_ops, max_roll, vp_first, vp_second}` per Space Race box 0..8 (track UI).
- `layout.card_ids` for scoring card ids and the special cards the UI words itself.
- `cardName/cardOps/countryName` (English; ids match `rules/*.json`).

### 8.3 Bilingual text already in DS (MIT, reusable)
`web/ui/src/i18n/locales/zh-CN/` (and `en/`): `game.json` has **all 110 cards (`name`, `description`) and 84 countries by id in Chinese**, plus regions;
`effects.json` (every flag), `enums.json` (phases, decision types, resolutions, op modes), `endings.json`, `branches.json`, `rolls.json`, `hud.json`, etc.
Card `description` text should still be checked against the latest errata.

### 8.4 Detecting a held-scoring-card loss (since `ts_ending_reason` doesn't)
`Engine::is_held_scoring_game_over` is not exported. Equivalent check on the display state:
```
terminal && current_phase_name == "GAME_OVER" && defcon > 1 &&
any scoring id (layout.card_ids *_SCORING = 1,2,3,37,38,79,81) has card_locations starting "HAND_US_" or "HAND_USSR_"
```
→ the holder(s) lose; both holding ⇒ VP 0, `terminal_utility` 0 (draw) and `ts_ending_reason` says `"wargames"` (wrong). **[verified both cases]**
(`engine/src/engine.cpp:258-269` uses `action_round > (turn<=3 ? 6 : 7)` as an extra guard; with `defcon > 1` and GAME_OVER the location test is sufficient in practice — treat as **unverified at the edges**.)

---

## 9. The AI move (policy only, as DS's auto-play does)
`analyze()` (`web/ui/src/analysis/readout.ts:21-133`) + `favourite()` (`analysis_view.ts:335-342`):
```ts
const f = model.obsFeatures, merged = model.meta.mergedInfluence, macro = model.meta.macroInfluence;
const mask = E.mask(merged, macro);                         // 304 wide; Model.run cuts it to 220 for a base model
const obs  = E.observation(aiPlayer, f);                     // obsSizeFor(f) floats
const out  = await model.run(obs, mask, 1);                  // ONNX inputs: obs float32[rows,obsSize], mask uint8[rows,actionSize]; outputs logits, v_win, v_vp
const idx  = argmax over i with mask[i] of out.logits[i];    // greedy = leaderboard "temperature 0"
applyModelAction(idx, merged, macro);                         // §5.5
```
`Model.fromBytes` refuses a model whose `ts.format != "ts-onnx-v1"` or whose widths don't match `obsSizeFor(features)` / 220|304 (`model.ts:119-156`).
onnxruntime-web runs single-threaded on Pages (no COOP/COEP) (`model.ts:26-29`).
If the chosen leaderboard entry is a **search player** (`~rollout(...)`), the move is `rolloutRoot()` instead (§2.10) — tens to hundreds of forwards per move; run it in a Worker with its own engine module.

---

## 10. Minimal game loop (human vs AI, only these APIs)

```ts
const E = await WasmEngine.load(BASE);                       // BASE = "/TS_playfield/" on Pages
const model = await Model.fetch({kind:"hf", repo:"mihaild/deepstruggle", revision:"main", path:CHOSEN},
                                f => E.obsSizeFor(f), E.actionSize, undefined, E.baseActionSize);
const HUMAN = pickSide();                                    // 1 (US) | -1 (USSR) | random
const AI = -HUMAN;
const meSide = HUMAN > 0 ? "US" : "USSR";

function seatBoth() {
  E.seat(HUMAN, E.currentRules);                             // 1544
  E.seat(AI, model.obsFeatures);
}

E.newGame(crypto.getRandomValues(new Uint32Array(2)).reduce((a, x) => a * 2 ** 21 + (x >>> 11), 0)); // random 42-bit seed (any integer < 2^53 works)
seatBoth();

while (!E.isTerminal()) {
  const who = E.decisionPlayer();                            // never 0 here (chance nodes are drained by step)
  const before = E.display();
  let ok: string | null;
  if (who === AI) {
    render(redactState(before, meSide), /*humanMask*/ null, { aiThinking: true });
    await sleep(AI_DELAY_MS);                                // constant
    const idx = await chooseAiAction();                      // §9 (policy) or rolloutRoot (search)
    ok = applyModelAction(idx, model.meta.mergedInfluence, model.meta.macroInfluence);   // §5.5
  } else {
    const mask = E.mask(false);
    const legal = [...mask.keys()].filter(i => mask[i]);
    const idx = legal.length === 1 ? (await sleep(FORCED_DELAY_MS), legal[0])
                                   : await waitForClick(redactState(before, meSide), legal);   // §5.4
    const snap = E.snapshot();                               // undo stack (see §7.4 for dice)
    ok = E.step(E.decodeFlat(idx), 0);
  }
  if (ok) { showError(ok); continue; }                       // refused: nothing changed
  const settled = E.settledDisplay(), rolls = E.clickRolls(), tracks = E.clickEventTracks();
  const after = E.display();
  await animate(redactState(before, meSide), redactState(settled, meSide), rolls, tracks);
  if (settled.turn !== after.turn || settled.current_phase_name !== after.current_phase_name)
    await animateTurnEnd(redactState(settled, meSide), redactState(after, meSide));
  // (re-seat is only needed after newGame / loadSaveJson; harmless to call every iteration)
}
const final = E.display();
showResult({ winner: E.terminalUtility() > 0 ? "US" : E.terminalUtility() < 0 ? "USSR" : "DRAW",
             vp: final.victory_points, turn: final.turn,
             reason: heldScoringLoss(final) ?? E.endingReason() });          // §8.4
```
Notes: inside `applyModelAction` the merged/macro paths make 2..N `ts_step` calls; animate after each one (read the click buffers per sub-step).
For a search AI, keep a `moves: {before: Uint8Array, action: MicroAction}[]` list of **every** applied step (both sides) for `beliefObserve`.

---

## 11. Risks and open questions
1. **Which model/player is "the highest rated"?** If it's a rollout-search player, we need the whole §2.10 machinery in a Worker; its feature bits and E4-only constraint must match. If it's a merged/macro network, the policy path must decompose actions (§5.5). Not determined here.
2. **Undo vs dice** (§7.4): product decision needed.
3. **Ending reason misclassification** for held scoring cards (§8.4) — handle in our UI; worth reporting upstream (don't patch the vendor engine).
4. **`rng_state` as a JSON uint64**: never pass the save through `JSON.parse` (precision loss → `loadSaveJson` refuses it).
5. Display JSON is ~17 KB and `display()` costs ~0.18 ms; fine per step, avoid per-frame polling.
6. Engine fingerprint: a model exported against another engine build loads with only a warning; prefer matching the build the model was exported with (ONNX `ts.engine_fingerprint`).
7. The "flags" list is the only exact source of continuous effects (`persistent_effects` overflows JS numbers).
8. Not verified: Chernobyl (`chernobyl_region`) and late-war branch UIs never occurred in random play; ALWAYS_ASK_DISCARD behaviour when the AI model is seated without that bit was only read from code (`either_seat_plays_rule`).
