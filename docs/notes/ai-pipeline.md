# AI pipeline: running the strongest DeepStruggle player in the browser

Research note for the TS Playfield site, written 2026-11-22. Source: DeepStruggle (MIT), read-only clone at
`vendor/DeepStruggle`. All paths below are relative to `vendor/DeepStruggle/` unless they start with `/`.
"Measured" means I ran it; "read" means it comes from the code or data; "unverified" means I could not check it.

---

## 0. Summary

| | value |
|:--|:--|
| Strongest network (weights) | `E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M` ("B6 soup"). It is the network of the #1 and #2 players on both scales, so the choice of weights is clear. |
| Strongest player (network + search), page default (E8, "All players", Playdek estimate) | `…~rollout(k=4,worlds=64,horizon=4,rule=z2,stop=earlier,leaf=own,chance=keyed,belief=2048,aligned=true,box4=true,race=16)`: Playdek estimate **1821 ± 72**, anchor Elo **1774 ± 9** |
| Its browser `search=` string | `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16` |
| #2, the Hugging Face default and twilightstruggle.app's "Default" level | same network, the same search without `belief2048`: Playdek 1794 ± 67, anchor 1735 ± 5. `search=rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16` |
| ONNX file | `https://huggingface.co/mihaild/deepstruggle/resolve/78708c9d002f0a8b3a089ec4620b95b650ef7d63/_models/E8.1-A8-R132-S45%4011160M%2B(S45%2C46%2C47)%4011520..11600M.onnx`. 5,797,418 bytes, sha256 `70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e`, MIT |
| ONNX contract | in: `obs` float32 [batch, 3824], `mask` uint8 [batch, 220]; out: `logits` float32 [batch, 220] (illegal slots = -1e9), `v_win` float32 [batch, 1], `v_vp` float32 [batch, 1] |
| Model's view | `ts.obs_features = 12` (HEADLINE_REVEAL, bit 2, plus OPP_EVENT_GATED, bit 3); E4 action view (merged = false, macro = false) |
| Threads | single thread. No SharedArrayBuffer and no COOP/COEP needed. This works on GitHub Pages as it is. |
| Time per AI decision (measured, one i9-14900HX core, Node 26, onnxruntime-web 1.30.0 wasm) | HF-default search: median 0.27 s, p90 0.72 s, max 1.2 s, about 100-110 s of thinking per side per game. Top (belief) search: median 0.38 s, p90 5.4 s, max 11.1 s, about 315-330 s per side per game, roughly 3x the HF default (see §7). Slower consumer machines will take longer; I did not measure one. |
| First-visit download | ~9.7 MB: ORT wasm 3.72 MB (gzipped by Pages), model 5.80 MB, engine 0.15 MB, plus JS |

**Top risk.** The belief player is #1 because of games between models. Its only rated opponent was one
network (2,000 games). DeepStruggle's own log says the belief guesses a *person's* hand worse than the
uniform prior (§1.4). It also costs up to ~11 s per decision on a fast CPU. The owner should decide
between "top player as listed" (belief) and "HF default" (no belief, ~40 Elo lower on the model scale,
~27 lower on the Playdek estimate, both inside the error bars against humans). Both use the same weights
and the same code path. Only the `search=` string differs.

---

## 1. Which player is the strongest

### 1.1 Deployed leaderboard data (fetched 2026-11-22)

* The page `https://mihaild.github.io/DeepStruggle/leaderboard.html` loads one script,
  `/DeepStruggle/assets/leaderboard-z3xOx10V.js`, which fetches **only** `/DeepStruggle/leaderboard.json`
  (`fetch("/DeepStruggle/leaderboard.json")`; source `web/ui/src/leaderboard_page.ts:597`). After the
  first render it also reads `https://huggingface.co/mihaild/deepstruggle/resolve/main/models.json` (to tag
  the HF default, `leaderboard_page.ts:308-322`) and `…/site_models.json` (to tag the site's levels,
  `leaderboard_page.ts:281-285`).
* `leaderboard.json`: `schema` 1, `commit` `5b95e91b3e51494aa48958483e21fdf5996831ec`, top-level keys
  `networks, players, epochs (E7, E8), codes, playdek`. `playdek.as_of` = `2026-11-22`, 350 games against
  46 people, `prior_games` = 20, `by_prior_games` keys 5/10/20/50/100/200/500.

**Page defaults** (read from `web/ui/src/leaderboard_page.ts`):
* epoch = the newest epoch with at least one pairing (`defaultEpoch`, L167-171), so **E8**;
* view = **"all"** players unless the URL says `view=main|lineage` (L218-220; also the `checked` radio in `leaderboard.html`);
* scale = **"playdek"** whenever `data.playdek` exists and the URL lacks `scale=anchor` (L225);
* on the Playdek scale rows are sorted by `playdek.by_prior_games[prior] ?? playdek` → `players[pid].rating`
  (L337-346, L361-368). A player with no estimate sorts last.

**E8, Playdek estimate (page default, prior = 20), top 6:**

| # | player | Playdek | ± | games vs people (W-D-L) | anchor Elo |
|--:|:--|--:|--:|:--|--:|
| 1 | B6 soup `~rollout(4,64,4,z2,earlier,own,keyed,belief=2048,aligned,box4,race=16)` | **1821.4** | 71.6 | 23 (13-0-10) | 1773.8 |
| 2 | B6 soup `~rollout(4,64,4,z2,earlier,own,keyed,aligned,box4,race=16)` | 1794.4 | 67.0 | 34 (21-1-12) | 1734.7 |
| 3 | `E8-A8-R102-S44@13520..13600M~rollout(…64…race=16)` | 1731.5 | 86.1 | 29 | 1702.9 |
| 4 | same R102 net, with belief=2048 | 1730.2 | 85.7 | 0 | 1697.5 |
| 5 | `E8-A8-R1-S44@10010M+R48@12720..12800M~rollout(…64…race=16)` | 1708.1 | 74.8 | 0 | 1637.9 |
| 6 | same net, 32 worlds, no race | 1696.9 | 70.8 | 2 | 1621.5 |

**E8, anchor scale** (anchor = E7 R34 soup with `rollout(4,32,…,keyed,aligned,box4)` = 1600): the same #1
(1773.8 ± 9.2) and #2 (1734.7 ± 5.4). #1 is top at **every** prior weight the page offers (5 → 1813.0, 10
→ 1817.9, 20 → 1821.4, 50 → 1824.1, 100 → 1826.0, 200 → 1828.1, 500 → 1830.6), always ahead of #2.

Watch out: in the "Main players" view, E8 shows only its 2 main players, so the E7 anchor would appear on
top. "Highest-rated" has to be read in the "All players" view, which is the page default.

### 1.2 Cross-check with the local `tools/leaderboard.py`

```
cd vendor/DeepStruggle && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 tools/leaderboard.py show --epoch E8
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 tools/leaderboard.py fit --output <scratchpad>/leaderboard_local.json
```
(Pure Python, no numpy or torch needed.) The local E8 table matches the deployed anchor ratings exactly:
#1 belief player 1774 ± 9 (2,000 games, 60.0%), #2 1735 ± 5 (6,000 games, 68.8%), then R102 1703. The local
fit has **no** Playdek block: it needs `--playdek <tools/playdek_estimate.py output>`, which comes from the
site's stats database (`tools/scripts/build_web.sh`, `TS_PLAYDEK_ESTIMATE`). So the Playdek ordering can
only be checked against the deployed JSON. It agrees with the anchor ordering for the top two.

### 1.3 Registry entries for the top player (`leaderboard.json` → `players[...]`, `networks[...]`)

```json
"inference": {"kind":"rollout","k":4,"worlds":64,"horizon":4,"rule":"z2","stop":"earlier","leaf":"own",
              "chance":"keyed","belief":2048,"aligned":true,"box4":true,"race":16},
"workbench_search": "rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16"
```
Network: `file` `checkpoints/_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.pt`, sha256
`dfc8e050…7bbf`, `hf` `_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.pt` (the `.onnx` sits beside
it). Description: "Soup of three 80M SWAs over 11520-11600M: B6 (E8.1-A8-R132-S45 …) and its seed branches
S46 and S47 from 11160M."

### 1.4 How solid "#1" is

* The belief player's anchor rating comes from **one pairing**: 2,000 games against
  `E8-A8-R102-S44@13520..13600M~rollout(…race=16)`, scoring 60.0%. The non-belief #2 scored 54.6% against
  that same opponent and also played the two E8 main players. The two B6 players never played each
  other directly, so the ~39-point gap is transitive through one opponent.
* The R&D log `research/log/P35_belief_vs_people.md` (2026-11-17) reports this: "the belief about a *person's*
  hand on the site's games is **worse than the uniform prior** in log loss (R34 soup −2.7%, B6 soup −3.3%)
  … it still *ranks* the person's cards a little better than random". `site_models.json` describes the
  belief level as "About 40 Elo stronger than experimental, but may be vulnerable to bluffing."
* On the Playdek (human) scale the two are 27 points apart with ±67-72 each. Against people they are not
  distinguishable on the current data.
* **Recommendation:** keep the weights fixed (B6 soup). Make the search a single constant, `AI_SEARCH`, and
  ship the leaderboard #1 (`…:belief2048:race16`) only if its worst-case latency is acceptable on target
  hardware (§7). Otherwise ship the HF default (`…:race16` without belief). This is an owner decision,
  listed in §12.

---

## 2. Hugging Face files

`https://huggingface.co/mihaild/deepstruggle/resolve/main/models.json` (6,548 bytes) is written by
`tools/publish_hf.py`. Schema read by `web/ui/src/analysis/hf_catalog.ts:85-115`:

```json
{ "schema": 1,
  "default": "_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.onnx",
  "default_search": "rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16",
  "models": [ {"path": "...onnx", "date": "ISO-8601", "sha256": "<lfs sha256>", "size": <bytes>}, ... ] }
```
Top / default entry: `path` as above, `date` `2026-11-17T08:41:50.000Z`, `sha256`
`70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e`, `size` 5,797,418. The repo has 29 `.onnx`
entries. E8/E7 exports are ~5.8 MB, older E7 A13 ones 9.2 MB, E4-E6 12.6 MB.

`https://huggingface.co/mihaild/deepstruggle/resolve/main/site_models.json` (3,752 bytes, schema 1; read by
`hf_catalog.ts:207-222`, which uses `levels[].{id,name,description,checkpoint:{repo,revision,path},search,hidden}`):
`"default": "experimental_b6soup"`. Levels on the B6 soup:
* `experimental_b6soup`, "Default": `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16`
* `6soup_belief`: `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16`
Other levels: E7 R34 soup "strong" `rollout:4:32:4:…` and "quick" `policy`; hidden ones on older networks.

**HF repo facts (measured):** `main` = commit `78708c9d002f0a8b3a089ec4620b95b650ef7d63`
(`/api/models/mihaild/deepstruggle/revision/main`, lastModified 2026-11-18T22:28:47Z), tag `license:mit`.
CORS works from `Origin: https://chenao-phys.github.io`: `resolve/…` returns 302 with
`access-control-allow-origin: https://chenao-phys.github.io`, and the CDN target (`us.aws.cdn.hf.co/xet-bridge-us/…`)
returns `access-control-allow-origin: *`. `POST /api/models/mihaild/deepstruggle/paths-info/main` (form body
`paths=<path>&expand=false`) returns `[{"lfs":{"oid":"70b117b5…"}, "size":5797418, …}]` and is CORS-allowed.
`resolve` responses are `cache-control: no-store` and redirect to a freshly signed URL each time, so the
browser HTTP cache never hits. That is why DeepStruggle keeps its own Cache API store (§9).

**Path encoding.** `hfFileUrl(repo, rev, path)` (`hf_catalog.ts:8-10`) applies `encodeURIComponent` per
segment, giving `_models/E8.1-A8-R132-S45%4011160M%2B(S45%2C46%2C47)%4011520..11600M.onnx`. Verified: HTTP
302 with the pinned commit.

**Suggestion:** pin the revision to the commit, not `main`, because `main` is mutable. Keep the sha256 as a
constant and check it after download. The file is MIT, so it could also be mirrored on our Pages site
(5.8 MB, same-origin, no HF dependency). That is a project choice. The model barely compresses (gzip 5.30 MB).

---

## 3. The ONNX contract (measured by parsing the file)

```
ir_version 10, producer pytorch 2.13.0+cu130, opset ai.onnx 20, 68 initializers
INPUT  obs     float32 [batch, 3824]
INPUT  mask    uint8   [batch, 220]
OUTPUT logits  float32 [batch, 220]
OUTPUT v_win   float32 [batch, 1]
OUTPUT v_vp    float32 [batch, 1]
ops: Gemm×16 Gelu×10 Slice×10 LayerNormalization×7 Add×5 Concat×4 Gather×3 Mul×3 MatMul×2 Reshape×2 Cast×2
     Unsqueeze Squeeze ReduceMean Sub Greater Not Where Tanh   (all supported by the ORT wasm EP; it ran)
metadata_props:
  ts.format = ts-onnx-v1              ts.obs_size = 3824          ts.action_size = 220
  ts.obs_features = 12                ts.merged_influence = false ts.macro_influence = false
  ts.label = E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M
  ts.checkpoint = _models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.pt
  ts.checkpoint_sha256 = dfc8e050bc652bbcf0ff6b510caf213865114d4a2c773a67e613666f081d7bbf
  ts.engine_fingerprint = 82878d47f04e9c861fad0bdcf5153b3ccc5a5bc0ac6e5dc3b0eded8d0d6ddba2
```
* Metadata is read with no ONNX library by `onnxMetadata(bytes)` (`web/ui/src/analysis/onnx_meta.ts:58`; field 14
  of ModelProto). `Model.fromBytes` (`model.ts:119-156`) refuses a file unless `ts.format === "ts-onnx-v1"`,
  `ts.obs_size === engine.obsSizeFor(ts.obs_features)`, and `ts.action_size` is 220 (base) or the engine's 304.
* **Masked logits** (measured): illegal slots come out as exactly `-1e9`, legal ones in a normal range. The mask
  is applied inside the graph (Greater/Not/Where).
* **Values**: `v_win` ∈ [-1, 1] (Tanh) from the side whose observation was fed. P(that side wins) = (1+v_win)/2.
  `v_vp` × 20 = expected final VP margin for that side (`web/ui/AGENTS.md` "Which critic reading is believed").
  Only the decider's own reading is calibrated. `tools/export_onnx.py` refuses an export whose value heads
  depend on the mask, so value-only rows get an all-ones mask.
* **Widths**: the engine's flat action space is **304** (`FLAT_ACTION_SPACE_SIZE`, `engine/include/ts/action_mask.hpp:43`;
  slots 220..303 are P42 macro slots, always 0 in the E4 view). The model reads the first **220**.
  `Model.run` (`model.ts:189-211`) slices each 304-wide mask row to 220 and pads logits back to 304 with -1e9.
* The model's export fingerprint (`82878d47…`) differs from the vendored engine build's (`134a592a…`). The
  workbench only shows a warning for that, not a refusal (`model.ts:12-17`). The vendored build in
  `web/ui/public/engine/` has the **same** fingerprint `134a592a…` as the engine deployed at
  `mihaild.github.io/DeepStruggle/engine/ts_engine.wasm` (measured by grepping both binaries), so we run
  exactly what the DeepStruggle site runs.

---

## 4. Building the observation and the mask for the deciding seat

WASM exports (`bindings/wasm/ts_engine_wasm.cpp`), wrapped by `web/ui/src/engine/wasm_engine.ts`:

| wrapper | C export | meaning |
|:--|:--|:--|
| `decisionPlayer()` | `ts_decision_player()` | 1 US, -1 USSR, 0 nobody (chance or terminal) |
| `observation(player, features)` | `ts_observation_features(player, features)` (L704) | `obsSizeFor(features)` floats (3824 for 12) |
| `mask(merged=false, macro=false)` | `ts_mask(view)` (L626) | 304 bytes, view 0 = E4 |
| `seat(player, features)` | `ts_seat_obs_features` (L682) | that seat plays `features & RULES` |
| `currentRules` | `ts_obs_features_rules()` (L699) | `PERSON_RULES` = 1544 |
| `decodeFlat(idx)` | `ts_decode_flat` (L634) | `{decision_type, primary_id, secondary_id, flags}` |
| `step(ma, forcedDie)` | `ts_step` (L565) | one click plus its chance nodes; 0 = roll |

**Seating is required, and is reset by a new game.** Each seat plays the rule bits of whoever plays it
(`main.ts:887-904` `seatSides()`): the AI's seat gets `model.obsFeatures` (12, so seat_rules = 8,
OPP_EVENT_GATED) and the human's seat gets `engine.currentRules` (1544 = OPP_EVENT_GATED | OWN_EVENT_GATED |
ALWAYS_ASK_DISCARD; `engine/include/ts/game_state.hpp:641-643`). Measured: after `ts_new_game`,
`ts_seat_rules` reads **0/0**, so re-seat after every `newGame`/load. The workbench calls `seatSides()` on
every `refresh()` (`main.ts:865-868`). It is cheap and idempotent, so do the same. Seats live in `GameState`
(`seat_rules[2]`), so snapshots and undo carry them.

Why it matters: OPP_EVENT_GATED is a rule the model was trained under (E8.1). HEADLINE_REVEAL (bit 2) has no
rule effect and no width but changes what the observation shows. Feeding the base layout (features 0) would
run without error and misread Space Race box 4's revealed headline (`wasm_engine.ts:184-189`). DeepStruggle's
own seating is the configuration its human-games data was played under (`P35_belief_vs_people.md`
"Setup"), so following it keeps the model in distribution.

**Per decision:**
```ts
const p = engine.decisionPlayer();                 // must equal the AI's side (1 or -1)
const obs  = engine.observation(p, 12);            // Float32Array(3824)
const mask = engine.mask(false);                   // Uint8Array(304), E4 view, under the seated rules
const out  = await model.run(obs, mask, 1);        // slices mask to 220, pads logits to 304
```

---

## 5. Logits to an action

* **Policy only** (`search=policy`, the "quick" level): masked argmax of the logits. Leaderboard players are
  "greedy unless a player's id says otherwise", and none of ours samples. `readout.ts:90-103` shows the
  softmax at temperature 1 for **display** and picks `argmax`. There is no temperature sampling at play time.
* **Rollout root** (the strong players): `pick` from `rolloutDecide` (§6). The rule `z2` plays the
  network's argmax unless a challenger's paired lead is at least 2 standard errors.
* Fallbacks used by the workbench (`analysis_view.ts:335-342` `favourite()`): `search.pick` if a search
  answered. While a search is pending, nothing is played. If the search returned `null` (fewer than 2 legal
  moves, `rollout.ts:128-129`) or threw, the policy argmax is played instead.
* **Applying it:** `session.applyFlat(idx, merged=false, forcedDie=0, how, macro=false)` (`game/session.ts:305`).
  This calls `engine.decodeFlat(idx)` and then `engine.step(ma, 0)`. The engine rolls every die from its own
  SplitMix64 stream (`state.rng_state`, seeded by `newGame(seed)`). Auto-play always uses `forcedDie = 0`
  (`main.ts:1384`).

---

## 6. The rollout search

### 6.1 Algorithm (`web/ui/src/analysis/rollout.ts:113-167` `rolloutRoot(engine, model, spec, seed)`)

The engine must be **a separate instance** from the board's (the worker's own).
1. Refuse merged/macro models (B6 is E4, OK). Return `null` if terminal or no decider.
2. Root forward: `model.run(engine.observation(decider, 12), engine.mask(false), 1)` → `logits` (304).
3. `candidates = engine.rolloutCandidates(logits, mask, spec.k)`: the top-k legal moves by logit, best first,
   so candidate 0 is the network's own move. If fewer than 2 candidates, return `null`.
4. `engine.rolloutReset(horizon, 12, seed, sharedDice=true, guard=true, stopIdx, leafIdx, keyed?1:0, aligned, box4)`.
   `stopIdx = layout.rollout_stops.indexOf("earlier")` = 3 and `leafIdx = layout.rollout_leaves.indexOf("own")` = 2
   (from `ts_action_layout_json`).
5. Worlds. With `race`, `first = race (16)`, else `worlds`.
   * belief: if `beliefParticles() === 2048 && beliefPrepare()`, call `weighBelief` (below), then
     `rolloutAddBelief(candidates, first, worlds)`, which deals all 64 hands in one draw and plays the first 16;
   * else `rolloutAdd(candidates, first)`, a uniform redeal of the cards the mover cannot see (honest
     determinization, `bindings/rollout_batch.hpp:37-48`).
6. `playOut` (`rollout.ts:49-66`). Loop until `rolloutAllDone()`: `rolloutFillLive()` returns `{rows, obs, masks}`,
   `model.run`, then `rolloutStep(logits, rows)`. In C++ every row advances by its **masked argmax**, both sides
   played by the network, with the DEFCON-2 suicide guard (`rollout_batch.hpp:13-18`). Then
   `rolloutFillLeaves()` (from the mover's side), `model.run`, and `rolloutSetLeafValues(vWin)`. More than 400
   plies is an error.
7. Race: `rolloutRace(0, worlds - first, belief)`. Challengers whose paired lead over candidate 0 is below 0
   drop out, and the survivors play 48 more worlds. Then `playOut` again.
8. `rolloutDecide(0, candidates, logits, mask, "z2")` returns JSON `{"pick","worlds","q","lead","lead_se"}`
   (`ts_engine_wasm.cpp:1077-1112`).
9. Return `SearchResult {kind:"rollout", spec, candidates, pick, worlds, q, lead, lead_se, dropped?, rows, ms,
   temperature_weights?}` (`rollout.ts:29-46`).

Spec semantics (`bindings/rollout_batch.hpp` `Config` L105-135, `ai/search/rollout_root.py` docstring L1-40):
`k`=4 candidates; `worlds`=64 sampled worlds; `horizon`=4 action-round boundaries; `stop=earlier` stops at the
turn's end if it comes within 4 boundaries, else after 4; `leaf=own` plays on to the mover's next decision and
reads the critic there from the mover's side; `keyed` ties each dice/deal draw to its situation, so candidates
in one world draw alike; `aligned` counts the horizon from the end of the mover's own action round;
`box4` keeps an opponent headline revealed by Space Race box 4; `race16` plays every candidate on 16 worlds,
then only non-trailing ones on the remaining 48; `z2` picks the best mean only if its paired lead is
≥ 2 s.e., else the network's move. Grammar: `rollout_spec.ts:55-114` (`parseRolloutParam`, `parseSearchParam`).
The trailing tokens may come in any order.

The search **never reads the human's real hand**. Candidates come from the real position, values only from
worlds dealt from the AI's information set (`rollout.ts:15-17`).

### 6.2 The belief (`:belief2048`), and what it needs from our game loop

`bindings/belief.hpp` (same C++ as Python's): one tracker per game. It records **every** decision of the
game (both sides) and, at the AI's decision, weighs 2,048 uniformly drawn opponent hands by the network's
likelihood of each of the opponent's decisions **this turn**, at temperatures {1, 1.5, 2, 3, 5, 8}
(Bayesian-averaged by fit to this opponent's past turns). It then deals the root's worlds from that mixture.

What our app must do (`rollout_runner.ts:95-133`, `rollout_worker.ts:50-58`):
* At game start, on the searching engine: `engine.beliefReset(2048, /*seed*/0, /*allDecisions*/true, /*reveal=box4*/true)`.
* For **every applied move** (human and AI alike, each `MicroAction` click), in game order:
  `engine.restore(move.before); engine.beliefObserve(move.action)`. `GameSession.apply` already records
  `moves.push({before: snapshot, action})` (`game/session.ts:37-40, 230`). `ts_belief_observe` records
  only moves expressible as a flat E4 action (`ts_engine_wasm.cpp:837-855`).
* On undo: reset and replay (`RolloutRunner.beliefDelta` does this when the move list is no longer a
  prefix-extension of what it saw).
* Per search, `weighBelief` (`rollout.ts:76-105`): `D = beliefDecisions()` recorded decisions × `N = 2048`
  hands, evaluated in chunks of `BELIEF_CHUNK = 256` rows: `beliefRows(d, lo, n, 12, width)` → `model.run` →
  JS masked log-softmax of the recorded action at each of 6 temperatures → `beliefSetLogLikelihoods(lp)`
  (layout `lp[(t*D + d)*N + k]`). Weights are reused, so D = 0 and the cost is zero, when the opponent has
  not moved since the last search. **Cost = D × 2048 forward rows**, where D = the opponent's decisions so far
  this turn. Every influence point is one decision.

### 6.3 Worker architecture (as built in DeepStruggle)

`RolloutRunner` (`rollout_runner.ts:20-166`), used from `main.ts:217, 732-762`:
* `setModel(model, key)` starts `new Worker(new URL("./rollout_worker.ts", import.meta.url), {type:"module"})`
  and posts `{type:"load", base: import.meta.env.BASE_URL, bytes: model.bytes.slice(), source}`. The worker
  does `WasmEngine.load(base)` (its own engine) and `Model.fromBytes(...)` (its own ORT session), then replies
  `{type:"loaded", fingerprint}`.
* `search(state = engine.snapshot(), model, key, spec, seed, moves = session.moves)`. Requests are queued, one
  at a time, and a request superseded before it starts rejects with "superseded by a newer search". With a
  belief it first posts `{type:"belief", reset, hands, reveal, moves}`, then `{type:"search", id, state, spec, seed}`.
  The reply is `{type:"result", id, result: SearchResult|null}` or `{type:"error", id?, message}`.
* Without `Worker` support it falls back to running inline on a separate `WasmEngine`.
* Seed: `seedFor() = ((step_index + 1) * 1_000_003) >>> 0` (`main.ts:765-768`). This is deterministic per
  game step, so reopening a position searches it the same way.
* The state bytes are `ts_state_size()` bytes of raw `GameState`. Both engines must be the same build
  (`restore` throws "snapshot from another engine build" otherwise).

---

## 7. How long a move takes (measured)

Setup: my port of `rolloutRoot` / `playOut` / `weighBelief` (no logic changes) in Node v26.13.1 with
**onnxruntime-web 1.30.0** (the version locked in `web/ui/package-lock.json`), `ort.env.wasm.numThreads = 1`,
wasm EP, running the vendored `web/ui/public/engine/ts_engine.{mjs,wasm}` (fingerprint `134a592a…`) and the
top ONNX. One core of an Intel i9-14900HX. AI vs AI, both seats on features 12, game seed 7, search seed as
in the workbench. Scripts: `$SP/scripts/bench.mjs`;
logs in the same scratchpad (`bench_default.log`, `bench_belief.log`).

| item | measured |
|:--|:--|
| `InferenceSession.create` (5.8 MB model) | ~160 ms |
| one forward, batch 1 | 0.47-0.51 ms |
| batch 64 / 256 / 1024 | 9 ms / 33-35 ms / 132-137 ms (≈130-140 µs per row) |
| **HF default** `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16`, full game (603 decisions, 593 searched) | median **272 ms**, p90 723 ms, p99 1.0 s, max 1.2 s; 1.7k (median) to 8k rows per search; **~101 s (US) / 113 s (USSR) of thinking per side per game** |
| **Top** `…:belief2048:race16`, full game (458 decisions, 449 searched; a different game, because the picks differ) | median **383 ms**, p90 5.4 s, p99 9.9 s, max **11.1 s**; 21% of searches > 2 s, 11% > 5 s, 3.6% > 8 s; the belief weighting ran at 114 decisions (up to 77,824 likelihood rows) and accounts for 494 s of the 645 s total; **~315 s (US) / 331 s (USSR) of thinking per side per game** |
| policy only, full game | 507 decisions, ~0.5 ms each |

Notes:
* Single-threaded browser WASM is roughly as fast as Node's. A mid-range laptop is probably **1.5-3x slower**
  than this desktop-class core and a phone 3-6x. That is a rough guess and **not measured**. The belief
  spikes would then reach ~20-30 s on a laptop (unverified). The site's own description of the old 32-world "Strong" level
  says "A few seconds a move".
* The worst belief spikes come late in an action-round sequence, when the opponent has made many
  decisions this turn (D up to 38 → 77,824 likelihood rows in this game).
* Every AI sub-decision (each influence point, each event choice) is a separate search. Decisions with a
  single legal move skip the search (`candidates < 2`).

---

## 8. Threading, COOP/COEP, and where the ORT wasm files come from

* `web/ui/src/analysis/model.ts:19-29`:
  ```ts
  import * as ort from "onnxruntime-web/wasm";                                   // → dist/ort.wasm.bundle.min.mjs
  import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";     // Vite copies + hashes it
  import ortMjsUrl  from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };                // same origin, not a CDN
  ort.env.wasm.numThreads = 1;
  ```
  `InferenceSession.create(bytes, { executionProviders: ["wasm"] })` (`model.ts:154`).
* **No SharedArrayBuffer and no COOP/COEP are needed.** ORT 1.30's own init (`dist/ort.wasm.min.mjs`) does
  this: if `numThreads` is unset and `!self.crossOriginIsolated`, it sets `numThreads = 1`. If >1 without
  isolation, it warns and falls back to single-threaded. The DeepStruggle Pages site sends no COOP/COEP
  headers (measured) and works.
* ORT 1.30 **requires WebAssembly SIMD** and throws "WebAssembly SIMD is not supported in the current
  environment" otherwise (read in the bundle). Every evergreen browser has it (Safari ≥ 16.4). This is
  worth a friendly error message.
* The ORT session runs in the search worker. Module workers are required (`{type:"module"}`, Vite bundles
  `new URL("./rollout_worker.ts", import.meta.url)`).
* Possible speed-ups (all **untested**, none needed for correctness):
  (a) `coi-serviceworker` to fake COOP/COEP on Pages so ORT can use up to 4 threads. Cross-origin HF fetches
  are CORS so they would pass COEP, and fonts/CDN assets would need `crossorigin`.
  (b) A pool of ORT-only workers fed by transferable buffers, without SharedArrayBuffer. This fits the
  belief's 256-row chunks well.
  (c) The WebGPU EP (`onnxruntime-web/webgpu`). A bigger bundle, and gains on 64-256-row batches are unclear.

---

## 9. Model caching and download sizes

`web/ui/src/analysis/model_cache.ts`:
* Cache API store `CACHE_NAME = "ts-models-v1"` (L17), keys `https://model-cache.invalid/sha256/<lfs sha256>`,
  keeping at most `MAX_MODELS = 8` (L19). The oldest are evicted on `put`.
* `Model.fetch` for `kind:"hf"` (`model.ts:175-184`): `hfFileSha256` (POST `paths-info`), then
  `cachedModel(sha)`. On a hit it is used directly. On a miss it downloads `hfFileUrl(...)`, builds the
  model, and calls `storeModel(sha, bytes)`, which re-hashes with `crypto.subtle` before storing. Failures
  fall back to a plain download.
* The Cache API exists only in secure contexts (https, localhost). GitHub Pages is https.
* Our app can skip the `paths-info` round trip by pinning revision and sha256 as constants
  (`cachedModel("70b117b5…")` → else download pinned URL → verify sha256 → `storeModel`).
  IndexedDB would also work. The Cache API is simpler for whole files.

Download sizes (measured; gzip is what GitHub Pages actually serves: `content-encoding: gzip` observed on
`application/wasm` and JS at mihaild.github.io):

| file | raw | over the wire |
|:--|--:|--:|
| `ort-wasm-simd-threaded.wasm` (ORT 1.30.0) | 14,239,897 B | 3,722,335 B (gzip, measured on Pages) |
| `ort-wasm-simd-threaded.mjs` | 24,381 B | ~9.1 KB |
| ORT JS bundle `ort.wasm.bundle.min.mjs` (inside our bundle) | 73,054 B | ~24.6 KB |
| engine `ts_engine.wasm` | 409,346 B | ~149 KB |
| engine `ts_engine.mjs` | 17,973 B | ~5.2 KB |
| model `.onnx` (HF, `application/octet-stream`) | 5,797,418 B | 5.80 MB (gzip would only give 5.30 MB) |

First visit is about 9.7 MB. Repeat visits fetch the model from the Cache API, and the wasm files through
HTTP cache revalidation (Pages sends `cache-control: max-age=600` plus ETag). Do not load the
other ORT variants (`.jsep`/`.jspi`/`.asyncify`, 16-28 MB each). `onnxruntime-web/wasm` avoids them.

---

## 10. Recipe: "the AI plays side X at full strength"

Files to borrow (MIT, keep the license header): `web/ui/src/engine/{wasm_engine.ts,layout.ts}`,
`web/ui/src/analysis/{model.ts,onnx_meta.ts,model_cache.ts,hf_catalog.ts (hfFileUrl, DEFAULT_*),rollout_spec.ts,rollout.ts,rollout_worker.ts,rollout_runner.ts}`,
`web/ui/src/game/session.ts` (or at least its `Move` type plus `apply`/`applyFlat`), `web/ui/src/types.ts`
(`MicroAction`, `GameState`). Copy the built `ts_engine.mjs` and `ts_engine.wasm` to `public/engine/` and set
Vite `base: "/TS_playfield/"`. `WasmEngine.load()` fetches `${BASE_URL}engine/ts_engine.mjs`.

```ts
// constants -- the leaderboard's #1 (or swap SEARCH for the HF default, see §1.4)
const MODEL = { kind: "hf", repo: "mihaild/deepstruggle",
  revision: "78708c9d002f0a8b3a089ec4620b95b650ef7d63",
  path: "_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.onnx" } as const;
const MODEL_SHA256 = "70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e";
const SEARCH = parseSearchParam("rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16")!;
//            HF default: "rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16"

// A. boot
const engine  = await WasmEngine.load();                       // board engine (main thread)
const session = new GameSession(engine);
session.newGame(seed);
const model = await Model.fetch(MODEL, f => engine.obsSizeFor(f), engine.actionSize, undefined, engine.baseActionSize);
//  (checks ts.format, obs width 3824 for features 12, action size 220; Cache API by sha256)
const runner = new RolloutRunner();                            // worker: own engine + own ORT session
runner.setModel(model, "top");

// B. seat both sides -- after every newGame / load / undo, i.e. on every refresh
const ai = X === "US" ? 1 : -1;
engine.seat(ai, model.obsFeatures);        // 12  → seat rules 8 (OPP_EVENT_GATED)
engine.seat(-ai, engine.currentRules);     // 1544 (PERSON_RULES)

// C. when it is the AI's decision
if (!engine.isTerminal() && engine.decisionPlayer() === ai) {
  const stepIndex = session.stepIndex;
  let pick: number | null = null;
  try {
    const r = await runner.search(engine.snapshot(), model, "top", SEARCH,
                                  ((stepIndex + 1) * 1_000_003) >>> 0, session.moves);
    pick = r?.pick ?? null;
  } catch { /* superseded or failed → policy fallback below */ }
  if (pick === null) {                                       // single legal move, or search failed
    const out = await model.run(engine.observation(ai, model.obsFeatures), engine.mask(false), 1);
    const m = engine.mask(false); let best = -1;
    for (let i = 0; i < m.length; i++) if (m[i] && (best < 0 || out.logits[i] > out.logits[best])) best = i;
    pick = best;
  }
  // re-check the position did not change while searching (the workbench uses a version counter)
  session.applyFlat(pick, /*merged*/false, /*forcedDie*/0, { source: "auto", analysis: false }, /*macro*/false);
}
```
* `RolloutRunner.search` feeds the belief tracker from `session.moves` before each search. It resets and
  replays when the list was rewound (undo).
* `Model.fetch` also creates a main-thread ORT session, used only by the fallback above. To keep ORT out of
  the main thread, write a thin worker protocol (`load` → fetch/cache/verify inside the worker; `search` →
  `rolloutRoot` with the policy-argmax fallback in the worker) instead of reusing `RolloutRunner` verbatim.
* Show a "thinking…" state. A search is 0.15-1.2 s, and with the belief occasionally ~11 s on a fast CPU.
  The workbench also waits `AUTO_PLAY_DELAY_MS = 350` between auto moves so people can follow
  (`main.ts:42`).

---

## 11. Players that cannot run in the browser (and why we don't care)

The 5 players in `leaderboard.json` with `workbench_search: null` (`tools/lib/player_spec.py:274-287`:
"None for what it cannot run: a sampled policy, a Gumbel or PUCT search, a root whose leaves another network
reads"):
* three `~gumbel(sims=256|32,k=8|4,fpu=0.2)` players (E7, C++ MCTS tree, not exported to WASM);
* two E7 `~rollout(…,leaf_net=…A15-R52|R54…)` players (a second network reads the leaves).
None is near the top. Every E8 player has a browser `search=` string. The heaviest one we would run is the
#1 belief player (§7).

---

## 12. Risks and open questions

1. **Decision for the owner:** belief (#1 on the leaderboard) or no belief (#2, HF default, site default)?
   The same weights either way. Belief costs up to ~11 s per decision on a fast CPU (about 3x the total thinking time), has been measured
   worse at reading *people's* hands than the uniform prior, and is "maybe vulnerable to bluffing". Its +39
   model-scale Elo rests on one opponent.
2. **Latency on real devices is not measured.** Run `bench.mjs`-style timing in a real browser on a typical
   laptop and phone before deciding (1).
3. **Pin the model.** `main` on HF changes. Use commit `78708c9d…` plus the sha256 check, or self-host the file.
4. **Engine/model drift.** We must use the exact vendored engine build (fingerprint `134a592a…`, identical to
   the deployed DeepStruggle site). A rebuild from other sources could change the rules the model sees.
   `tools/lib/engine_behaviour.py` (needs the native Python build) produces the digest
   to compare with `leaderboard/epochs.json` E8 `behaviour`. I did not run it, because there is no native
   build here.
5. **Seat rules.** The human seat plays PERSON_RULES (adds OWN_EVENT_GATED and ALWAYS_ASK_DISCARD, which no
   network was trained with). This is what DeepStruggle's site does. ALWAYS_ASK_DISCARD can add forced
   one-option decisions on the AI side, and those skip the search.
6. **Belief needs a complete move log** from the first move: every `MicroAction` in order with the state before
   it. A game resumed from a saved position without its history starts with an empty tracker. That is
   legal, but weaker until the opponent moves.
7. Not covered here: verifying the tournament scoring-card-held-at-turn-end loss in the WASM engine
   (CLAUDE.md asks for it). That belongs in the rules-engine note.
