# Critique: corrections and additions to the six reference notes

Scope: a completeness and correctness pass over `engine-api.md`, `ai-pipeline.md`, `rules-compliance.md`,
`ui-flow.md`, `map-i18n-assets.md`, `build-deploy.md` (+ `countries.json`, `cards_meta.json`), checked against
`vendor/DeepStruggle` at `5b95e91`. Paths are relative to `vendor/DeepStruggle/` unless they start with `/` or `docs/`.

Evidence tags: **[code]** = read in the source at the cited lines; **[probe]** = measured by running the vendored
`web/ui/public/engine/ts_engine.mjs` (fingerprint `134a592a…`) in Node 26 with read-only scripts in
`$SP/probe/`
(`critique_probe.mjs`, `forced_probe.mjs`, `fh_probe.mjs`, `scoring_probe.mjs`, `replay_probe.mjs`,
`preview_probe.mjs`; that directory is ephemeral, so the code that matters is inlined below).
Nothing in `vendor/` was edited or built.

---

## 0. Summary of corrections

| # | Note(s) | Claim | Verdict | Fix |
|---|---|---|---|---|
| C1 | engine-api §8.4 | "terminal && GAME_OVER && defcon>1 && a scoring card in a hand" detects a held-scoring loss | **Wrong.** 33 false positives in 400 probe games (any mid-turn 20 VP / Europe Control / Wargames win while someone happens to hold a scoring card) | Use the classifier in §3.2 |
| C2 | rules-compliance §4.2 | classifier with `action_round > (turn<=3?6:7)` | **Mostly right**, 2 false positives / 400 games: the end-of-turn mil-ops penalty reaching ±20 while a scoring card is held (the note flagged this as "rare") | §3.2 handles it from `settledDisplay()` |
| C3 | engine-api §5.4 | "Scoring card: `card` → `110` (resolves)" | **Wrong.** A scoring card resolves on `SELECT_CARD`; there is no SELECT_PLAY_MODE step (`engine/src/state_machine.cpp:1329-1338` "Scoring card auto-resolve") [code][probe: next decision is the opponent's SELECT_CARD]. ui-flow A1 is right | — |
| C4 | engine-api §9 | "The AI move (policy only, as DS's auto-play does)" | **Misleading.** DS auto-play plays `search.pick` whenever a search is configured (`web/ui/src/analysis/analysis_view.ts:335-342`). The greedy network is #9 on E8 at 1573 anchor Elo vs 1774 (#1) / 1735 (#2) (`lb_show_E8.md`). Policy-only is **not** full strength | Ship the rollout root (§1.1) |
| C5 | engine-api §0.4, rules-compliance §6.5 | "auto-play AI decisions with exactly one legal action, as training's SettleMode.FORCED did" | **Incomplete.** FORCED (`Engine::auto_advance_step`, `engine/src/engine.cpp:175-232`) also plays *forced event targets* (Suez Crisis, Muslim Revolution, East European Unrest) that have several legal actions. `ts_step` does neither | Port in §3.1 |
| C6 | engine-api §2.5 | `ts_first_headline_json` returns "" "unless this action is the second headline pick" | **Too narrow.** It returns a split for *any* HEADLINE-phase action that reaches the pause between headlines, e.g. the last choice of a first headline's event (308 such cases in 300 probe games; 309 of 769 second picks returned "" because the first headline stopped for a choice). It can also write a ~3.4 KB "ts engine anomaly" dump to stderr (191 dumps over ~1,080 calls in the probe; deduplicated only for identical states) | §3.5 |
| C7 | rules-compliance §6.2, §9 Q1 | top player worked out from head-to-head records = the non-belief rollout | **Superseded.** Leaderboard #1 is the *belief* variant (ai-pipeline is right) | §1.1 |
| C8 | rules-compliance §9 Q2 | ONNX `ts.obs_features` unverified | **Verified = 12** in the pinned file (sha256 `70b117b5…f09e`), plus `ts.action_size 220`, `merged/macro false`, `ts.engine_fingerprint 82878d47…` | — |
| C9 | ui-flow §2.3 | DS replay without seating "can be refused (unverified)" | **Verified.** Replaying `{seed, MicroAction[]}` *unseated* diverged/refused in 3/60 random games; seated (US 1544, USSR 8) reproduced the final `saveJson()` byte-for-byte in 60/60 | Seat before replay |
| C10 | ai-pipeline §10 vs build-deploy §4.3 | fetch the model from HF at runtime vs self-host | Not a contradiction, a choice: **self-host** the pinned file (immutable, China-reachable), keep HF `resolve/<commit>` as fallback, check sha256 either way | — |
| C11 | ui-flow §2.8 | "detect it ourselves: a scoring card in a hand in the settled state" | Incomplete in the same way as C2 | §3.2 |

Everything else I spot-checked held (§2).

---

## 1. Contradictions, resolved against the code

### 1.1 Which player is "the highest rated", and can it run in the browser
- `leaderboard/players.json` key
  `E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M~rollout(k=4,worlds=64,horizon=4,rule=z2,stop=earlier,leaf=own,chance=keyed,belief=2048,aligned=true,box4=true,race=16)`
  is #1 on E8 (local fit: 1774 ± 9, 2,000 games; deployed Playdek scale 1821 ± 72). #2 is the same network without
  `belief=2048` (1735 ± 5). The greedy network alone is 1573. [code + scratchpad `lb_show_E8.md`]
- The #1 rating rests on **one** pairing: `leaderboard/matches/E8.jsonl` has exactly one record containing both
  `belief=2048` and `R132` (vs `E8-A8-R102-S44@13520..13600M~rollout(...race=16)`, engine `82878d47…`, 2026-11-17). [probe]
- Runs in the browser: yes. Search string `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16`
  parses with `parseSearchParam` (`web/ui/src/analysis/rollout_spec.ts:55-114`); DS's own site offers it as level
  `6soup_belief` (`site_models.json`). Note the hidden DS level `strongest`, described as "a game begun with it goes
  on with the same search on 64 worlds, without the belief" after a reload: DS does not rebuild the belief on
  resume. We can, by replaying the move list (§3.7).
- **Reading CLAUDE.md:** "the single highest-rated model and weights" fixes the *network* (B6 soup; #1 and #2 share
  it). The belief is a search option. Shipping #1 literally means belief on. Owner decision; see open question Q1.

### 1.2 Seat / rule bits (all notes agree; confirmed)
`engine/include/ts/game_state.hpp:583-674`: `OPP_EVENT_GATED=8`, `OWN_EVENT_GATED=512`, `ALWAYS_ASK_DISCARD=1024`,
`RULES = 8|16|32|64|512|1024`, `PERSON_RULES = 1544`; `seat_obs_features` stores `features & RULES`.
After **every** `newGame`/`loadSaveJson`, and **before** replaying a record:
```ts
E.seat(AI, 12);              // model ts.obs_features (verified 12) -> seat_rules 8
E.seat(HUMAN, E.currentRules); // 1544
// observation: E.observation(AI, 12); mask: E.mask(false) (E4)
```
Rollouts re-seat both sides with the network's bits (`bindings/rollout_batch.cpp:206-208`), so the human's 1544 never
reaches the AI's imagined games. Never pass bits 16/32/64/128/256.

### 1.3 Optional cards, US bid, held-scoring rule
- Optional cards: `add_era_cards_to_deck` (`state_machine.cpp:36-43`) adds every card of the era, no flag; #104-106
  Early, #107-108 Mid, #109-110 Late. `cards_meta.json` marks exactly 104-110 `optional`. Confirmed.
- US +2 bid: `state_machine.cpp:1041-1068` + mask `action_mask.cpp:459-470`. Confirmed.
- Held-scoring loss: `finish_end_turn` (`state_machine.cpp:748-767`). It runs **after** the mil-ops penalty
  (`end_turn`, `:709-746`), which can itself end the game (`scoring.cpp:278-300`) — that ordering is what C2 misses.
  `ts_ending_reason` (`bindings/state_json.cpp:1156-1189`) says "20 VP" for a single holder and "wargames" for both
  (probe: 176 + 4 cases in 400 games).

### 1.4 Threading
Engine: no pthreads, plain ArrayBuffer (`bindings/CMakeLists.txt:51-54`, no `-pthread`). ORT: `numThreads = 1`
(`web/ui/src/analysis/model.ts:26-29`). No COOP/COEP needed. All notes agree; confirmed.

### 1.5 `ts_rollout_reset` argument order (engine-api vs ai-pipeline)
Both are right at different layers: C `ts_rollout_reset(horizon, shared_dice, guard, features, seed_lo, seed_hi,
stop, leaf, keyed, aligned, box4)` (`ts_engine_wasm.cpp:780`); TS wrapper
`rolloutReset(horizon, features, seed, sharedDice=true, guard=true, stop=0, leaf=0, keyed=0, aligned=false, box4=false)`
(`web/ui/src/engine/wasm_engine.ts:217-222`). Same for belief: C `ts_belief_reset(particles, all_decisions, seed_lo,
seed_hi, reveal)`; TS `beliefReset(particles, seed, allDecisions=true, reveal=false)` (`wasm_engine.ts:247-250`);
DS calls `beliefReset(spec.belief, 0, true, spec.box4)` (`rollout_runner.ts:129`). Program against the TS wrapper.

---

## 2. Claims re-verified (no change needed)

| Claim | Evidence |
|---|---|
| `ts_step` drains chance nodes only (no single-legal / forced-target auto-advance) | `ts_engine_wasm.cpp:94-138` calls `Engine::step(g_state, action)` with `auto_advance=false` (default), then `drain` |
| Snapshots restore the RNG: undo replays the same die | probe: 588/588 coups gave the same die after `restore` |
| `{seed, MicroAction[]}` replay is deterministic when seated | probe: 60/60 byte-identical saves |
| Influence click costs 2 Ops in an opponent-controlled country, places 1 | `state_machine.cpp:1557-1569` (`get_influence_cost`, `ops.cpp:189-193`); answers ui-flow §7 item 7 |
| First headline pick stays in hand `HAND_*_UNKNOWN`; `headline_first/second_card` are set only at the second pick | `state_machine.cpp:1077-1123` |
| AI's observation never sees the human's face-down first headline; rollouts forget it | `observation.cpp:214-330`; `rollout_batch.cpp:96-100` |
| Region enum EU0 ASIA1 ME2 AF3 CA4 SA5; `countries.json.region_id` uses it | layout JSON; spot-checked ids 21/31/46/64/74 |
| Decision catalogue in ui-flow §3 | probe saw 52 (decision_type, resolving_card) pairs in 400 games, all catalogued. Not seen in random play: CHOOSE_BRANCH/100 (Wargames) |

---

## 3. Gaps a frontend implementer needs, filled

### 3.1 Forced event targets (port of `forced_event_target`, `engine/src/engine.cpp:21-75`)
Training (`bindings/settle.py` `SettleMode.FORCED` → `Engine::auto_advance_step`) never asked the network at
these nodes; `ts_step` leaves them open. In 300 random games: Suez 202 of 284 multi-legal Suez nodes were forced,
Muslim Revolution 3/13, East European Unrest 9/411; the predicted target was legal in 214/214 [probe]. Without this,
each such node costs the AI a full rollout search for an order that cannot matter.
```ts
const MUSLIM_REVOLUTION_TARGETS = [51, 25, 24, 29, 30, 28, 22, 26]; // constants.hpp:111-114, engine order
const SUEZ_TARGETS = [1, 8, 23];                                     // UK, France, Israel (engine.cpp:28)
/** Flat index the engine's auto_advance_step would play here, or -1 if the decider has a real choice.
 *  suezStartUS: US influence in 1/8/23 when the Suez POINT_NODE first opened (used = start - now). */
function forcedEventTarget(d: GameState, mask: Uint8Array, suezStartUS?: Record<number, number>): number {
  const c = d.decision_context;
  if (c.decision_type !== 5 /*POINT_NODE*/) return -1;
  const us = (id: number) => Object.values(d.countries).find(x => x.id === id)!.us_influence;
  if (c.resolving_card === 28 && suezStartUS) {
    let sum = 0, first = -1;
    for (const cid of SUEZ_TARGETS) {
      const used = suezStartUS[cid] - us(cid);
      const avail = Math.min(us(cid), Math.max(0, 2 - used));
      sum += avail; if (avail > 0 && first < 0) first = cid;
    }
    return sum > c.remaining_steps ? -1 : first >= 0 ? 116 + first : 208;
  }
  if (c.resolving_card === 56 || c.resolving_card === 29) {
    // the mask is exactly {target && !visited} (card_dispatcher.cpp:1956-1973)
    let n = 0; for (let cid = 0; cid < 84; cid++) n += mask[116 + cid];
    if (n > c.remaining_steps) return -1;
    const order = c.resolving_card === 56 ? MUSLIM_REVOLUTION_TARGETS : [...Array(84).keys()];
    const f = order.find(cid => mask[116 + cid]);
    return f === undefined ? 208 : 116 + f;
  }
  return -1;
}
```
Apply it to the AI always (before any model call). Optional for the human (UX: auto-complete with animation).
Fidelity note: the leaderboard harness never fed these, or single-legal moves, to the belief tracker (they happen
inside `auto_advance_step`). Feeding them is harmless for single-legal moves (likelihood 1) and low-impact for
forced targets. I recommend **not** calling `beliefObserve` for moves we auto-played. This is inferred, not measured.

### 3.2 Ending classifier (replaces engine-api §8.4 and rules-compliance §4.2)
Inputs are **unredacted**: `before = display()` before the game-ending step, `settled = settledDisplay()` and
`after = display()` right after it. 0 mismatches over 400 probe games (180 held-scoring endings incl. 4 double holds;
2 mil-ops endings with a held card), checked against a counterfactual (same step with the held scoring cards discarded).
```ts
const SCORING = [1, 2, 3, 37, 38, 79, 81];
const holds = (d: GameState, s: "US" | "USSR") => d.hands[s].some(c => SCORING.includes(c));
function classifyEnding(before: GameState, settled: GameState, after: GameState, engineReason: string): string {
  if (!after.is_terminal) return engineReason;
  const special = after.defcon <= 1 || after.flags.includes("EUROPE_CONTROL_WIN") || after.flags.includes("CMC_SUICIDE_LOSS");
  if (!special) {
    let cleanupRan = false;
    if (before.decision_context.resolving_card === 250) cleanupRan = true;        // Eagle/Bear discard -> finish_end_turn inline
    else if (!settled.is_terminal) {                                              // the turn cleanup ran inside this step
      const req = settled.defcon;                                                 // Scoring::evaluate_military_ops
      const usDef = Math.max(0, req - settled.mil_ops.US), ussrDef = Math.max(0, req - settled.mil_ops.USSR);
      if (Math.abs(settled.victory_points + ussrDef - usDef) >= 20) return "milOps20VP";
      cleanupRan = true;
    }
    const us = holds(after, "US"), ussr = holds(after, "USSR");
    if (cleanupRan && (us || ussr)) return us && ussr ? "heldScoringBoth" : us ? "heldScoringUS" : "heldScoringUSSR";
    if (cleanupRan && after.turn === 11 && engineReason === "20 VP") return "final scoring"; // final scoring clamped at ±20
  }
  return engineReason;
}
```
Store `before/settled` of the last step in the session so a reloaded finished game can be classified (or persist the label).
Remember VP is overwritten (±20/0); show the pre-cleanup VP from `settled` if wanted.

### 3.3 MicroAction discipline (needed for the belief)
`ts_belief_observe` records a move only if some legal flat index decodes to **exactly** the same
`{type, primary, secondary, flags}` (`ts_engine_wasm.cpp:841-855`). `decodeFlat(208)` at a non-SELECT_CARD node is
`{type, 255, 0, 0x80}`; DS's HUD sends `{type, 0, 0, 128}`, which `ts_step` accepts (`action_mask.cpp:907-909`) but the
belief silently drops. **Rule: every human and AI action is `E.decodeFlat(idx)` of a legal `mask(false)` index, sent
unchanged, `forcedDie = 0`.**

### 3.4 Hands are revealed at every reshuffle
When the draw deck runs out, `reveal_both_hands` turns every `HAND_*_UNKNOWN` into `HAND_*_KNOWN`
(`state_machine.cpp:89, 122`; also `card_dispatcher.cpp:1591` for event draws), because each side can deduce the
other's hand. After redaction the human therefore **sees the AI's held-over cards** (343 such reveals in 400 probe
games). Not covered by any note. The UI should present it as an event ("deck exhausted: the remaining hands are
known"), and card-back rendering must handle a mix of known and unknown cards in the AI hand.

### 3.5 Splitting the two headlines (`ts_first_headline_json`)
- Call it with the exact MicroAction **before** every `ts_step` while `current_phase_name === "HEADLINE"`
  (human or AI move). Non-empty result ⇒ `state` = board after headline 1, `rolls` = number of leading entries of
  the subsequent `clickRolls()` that belong to headline 1 (768/768 consistent [probe]).
- The preview copy uses the same `rng_state`, so its dice equal the real step's dice (`ts_engine_wasm.cpp:599`).
- Its `state.decision_context` / `legal_actions` describe a parked internal node: **ignore them**. Redact the rest.
- It triggers `report_anomaly("POINT_NODE with no legal target and no early stop")` (`action_mask.cpp:673`,
  `invariant.cpp:30-60`) on many calls: a stderr dump of the whole state; in the browser that is `console.error`. Pass
  `printErr` to the Emscripten factory (`createModule({ locateFile, printErr })`) and route "ts engine anomaly" lines
  to a diagnostics buffer, not the console. No anomaly fired in ordinary `ts_step` play in my probes (~100k steps;
  the one other dump came from my own `ts_set_card_location` meddling).
- It is not wrapped in DS's `WasmEngine`; add `firstHeadline(a): {state, rolls} | null` (6 args: type, primary,
  secondary, flags, forcedDie=0, forcedOppDie=0).

### 3.6 Engine-truth previews for the human (no rule port)
Coup odds: verified exact on 588/588 coups [probe].
```ts
function coupOdds(E: WasmEngine, country: number) {          // only at the HUMAN's POINT_NODE with op_mode COUP
  const a = E.decodeFlat(116 + country), snap = E.snapshot(), out = [];
  for (let die = 1; die <= 6; die++) {
    const why = E.step(a, die);
    const r = why ? null : E.clickRolls()[0];               // undefined if the US must first choose the CMC payment
    out.push({ die, success: !!r?.success, net: r?.net_delta ?? 0, endsGame: !why && E.isTerminal() });
    E.restore(snap);
  }
  return out;                                               // P(success) = count(success)/6; endsGame flags DEFCON/CMC suicide
}
```
- It clobbers the click buffers, so read `settledDisplay()/clickRolls()/clickEventTracks()` of the real step first.
- Cost: each step serialises a display state per roll, so compute on hover, not for all 84 countries at once.
- Realignment: same idea with `ts_step_dice(type, p, s, f, die, oppDie)` over 36 pairs. There is no TS wrapper, and I did not test it.
- Effective Ops at SELECT_PLAY_MODE: engine-api §5.4 trick (step `112` on a snapshot, read `pending_ops_value`).
- Suicide warnings (DEFCON 1, CMC, Wargames, held scoring): same snapshot→step→`isTerminal()`→restore pattern (ui-flow §3.5.9).

### 3.7 Undo, RNG and persistence (one design, because they interact)
- Every snapshot carries `rng_state`, so a plain undo replays the same die (C9 probe). Reseeding with `ts_set_rng`
  after undo fixes that **but breaks `{seed, steps}` replay** unless the reseed is recorded as a step.
- Recommended policy: undo is allowed only back to the start of the human's current play, and only while
  (a) the RNG is unchanged, checked as the substring `"rng_state":<digits>` of `saveJson()` (string compare, never `JSON.parse`),
  (b) no AI decision was taken, and (c) no AI card became `HAND_*_KNOWN`. Condition (a) also covers roll-less random effects
  (Five Year Plan, Terrorism, Grain Sales draw, deals) that `clickRolls()` would miss. No reseed is then needed.
- Persistence (localStorage): `{v, fingerprint, modelSha256, search, seed, humanSide, steps: [[type,primary,secondary,flags], …], autoFlags}`.
  Resume = `newGame(seed)` → seat both → step all → (search AI) rebuild belief by `beliefReset` + `beliefObserve` over the
  replayed `{before, action}` list. Never persist raw snapshots across builds: `restore()` checks only the byte length
  (`wasm_engine.ts:80-83`).

### 3.8 Action rounds left (scoring-card warning, AR counter)
From `advance_after_action_round` (`state_machine.cpp:608-694`):
`maxAr = turn <= 3 ? 6 : 7`; for `turn >= 4`, a side gets AR8 if (US) `flags.includes("NORTH_SEA_OIL_ACTIVE")` or
`space[side] >= 8 && space[opp] < 8`. AR8 is optional (pass = flat 208, `action_mask.cpp:226-228`). Otherwise passing is
legal only with an empty hand (the China Card may be withheld) (`:214-220`). The USSR moves first, and `action_round`
increments after the US move, so at my AR-`k` card choice `myPlaysLeft = myMaxAr - k + 1` (including this one).
Warn when a non-scoring choice leaves `scoringInHand > myPlaysLeft - 1`. Rule 9.5 (China Card) is the same check.
A trapped player (Quagmire/Bear Trap) may still play scoring cards (`state_machine.cpp:1314-1319`).

### 3.9 AI worker protocol details the notes leave open
- One worker owns its own `WasmEngine` + ORT session. The main thread owns the game engine and never loads ORT.
  Requests: `{search, id, state: snapshot, spec, seed, moves}`. **Cancellation**: DS only drops queued requests
  ("superseded"). A running belief search can take ~11 s on a fast CPU, so on new game / undo / side switch
  `worker.terminate()` and start a fresh worker (cheap: engine + session ≈ 0.2 s, reuse the model `ArrayBuffer`).
- Order per AI decision: (1) terminal? (2) single legal → play; (3) `forcedEventTarget` (§3.1) → play;
  (4) search (falls back to masked policy argmax if it returns null or throws); (5) `step(decodeFlat(idx))`.
- Timing side channel: ALWAYS_ASK_DISCARD exists to hide whether the asked side had a qualifying card
  (Blockade 10, LADC 95, Missile Envy 49 giver). When the **AI** declines at those nodes, the decline is forced and
  instant. Pad every AI decision with `resolving_card ∈ {10, 95, 49}` to a delay drawn from the AI's own recent
  search-time distribution, and use a constant minimum delay for all AI moves.

### 3.10 Redaction details not spelled out
- `redactState` (`web/ui/src/game/view.ts:81-126`) must run on `display()`, `settledDisplay()`, the first-headline preview
  `state`, and any state used for animation diffs. Card-move animations must diff **redacted** `card_locations`.
- `countries.json.superpower_adjacent` uses `"USA"`/`"USSR"` (from `rules/map.json`), while the engine and display use
  `"US"`/`"USSR"`. Normalise on load.

### 3.11 Project scaffold gaps (verified in the repo)
- `package.json` lacks `i18next` (DS uses `26.5.4`, `web/ui/package-lock.json:976-978`). Add it, plus a React binding or a small hook, because our UI is React 18 and DS's `i18n/index.ts` DOM helpers (`applyStatic`) won't apply.
- `.gitignore` lacks `game_resources/TS_Rules_Deluxe.pdf` (and `game_resources/TS_map.jpg`) — must be added **before** `git init`/first commit.
- `scripts/build-engine.sh` still calls `build_web.sh` inside `vendor/` (writes `vendor/DeepStruggle/build/wasm` and `web/ui/public/engine`). Replace with build-deploy §1.5.
- The generator scripts for `countries.json`/`cards_meta.json`/`board_ref_positions.json` live only in the scratchpad; copy them to `tools/`.
- Assets missing entirely: card back, China Card face-down side, the redrawn map SVG, influence/DEFCON/VP/turn/AR/space markers, dice art, self-hosted fonts (a CJK web font is multi-MB; prefer system CJK fonts or a subset). The English card images still show pre-errata text (map-i18n §6.1), so they can contradict what the engine does.

---

## 4. Open questions (owner decisions or unverified)
1. **Belief or not.** #1 (belief) matches CLAUDE.md literally but costs up to ~11 s/decision on a fast desktop core and depends on one 2,000-game pairing. DS itself warns it "may be vulnerable to bluffing". The alternative is #2 at ~1/3 the time. Device timings (laptop/phone, real browser) are still unmeasured.
2. **Undo policy.** The §3.7 recommendation, or none at all.
3. **Auto-complete forced event targets for the human?** (§3.1) — UX only.
4. **Belief fidelity.** Should auto-played moves be withheld from `beliefObserve` (§3.1)? This comes from reading the code. The Python harness path was not traced end to end.
5. **Errata.** Neither the engine text (`rules/cards.json`) nor our English images have been checked against GMT's current errata sheet (no network copy available). Card images should at least match engine behaviour.
6. **Realignment odds via `ts_step_dice`** and Chernobyl/Wargames UIs were not exercised in a browser or a probe.
7. Engine pin `5b95e91` (7 errata commits after the model's `82878d47`) vs exact-match `02768b9d` — build-deploy R1, still open.
