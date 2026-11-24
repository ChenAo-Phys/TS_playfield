# Handoff: AI (`src/ai/`)

Owner: **ai**. Implements contract.ts `AiPlayer` with DeepStruggle's leaderboard #1 player at full strength:
network `E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M`, search
`rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16`. It runs in a module worker with its own
engine, its own onnxruntime-web session (single-threaded wasm, no COOP/COEP) and the belief tracker.

## Files

| file | what |
|---|---|
| `src/ai/config.ts` | Constants: `MODEL_FILE`, `MODEL_URL` (`${BASE_URL}models/…`), `MODEL_HF_URL` (pinned commit), `MODEL_SHA256`, `MODEL_BYTES`, `SEARCH` (belief, used), `SEARCH_NO_BELIEF` (HF default, documented fallback, unused), `MIN_DELAY_MS` = 600, `SENSITIVE_RESOLVING_CARDS` = [10, 49, 95], `AI_CONFIG: AiConfig`. |
| `src/ai/index.ts` | `createAiPlayer(config = AI_CONFIG, options?) → AiPlayerHandle`, `BeliefSync`, `isAbortError`, `supportsWasmSimd`. Main-thread side; never imports onnxruntime statically. |
| `src/ai/worker.ts` | The module worker (`new Worker(new URL("./worker.ts", import.meta.url), {type: "module"})`). |
| `src/ai/protocol.ts` | Worker messages (`load` → `progress`* → `loaded`; `decide` → `decision` / `error`). |
| `src/ai/core.ts` | `AiCore.decide`: restore → seat → belief delta → single-legal / search / policy fallback. Shared by worker and inline mode. |
| `src/ai/load.ts` | `loadCore`: model bytes + own `WasmEngine` (loaded in parallel) + ORT session. |
| `src/ai/model_fetch.ts` | Cache API → self-hosted URL → HF URL, streamed with progress, sha256-checked. |
| `src/ai/runtime_cache.ts` | onnxruntime's wasm in Cache Storage `ts-playfield-runtime-v1`, keyed by its content-hashed URL (production build only; one entry; bytes must start `\0asm`; the worker drops the entry when onnxruntime could not start from it). A deploy gives every Pages file a new ETag, so without it returning visitors downloaded the 3.7 MB (gzip) again after each push (QA r3 L-4). |
| `src/ai/model_cache.ts`, `onnx_meta.ts`, `model.ts`, `rollout_spec.ts`, `rollout.ts` | DS ports (MIT header). `rollout.ts` = `rolloutRoot`, `playOut`, `weighBelief` unchanged, plus `policyArgmax`; `SearchResult` gained `beliefRows`. |
| `src/ai/ort_env.ts` | Browser ORT setup: `?url` imports of `ort-wasm-simd-threaded.{wasm,mjs}`, `numThreads = 1`, `proxy = false`. |
| `src/ai/ort_node.ts` | Node ORT setup (`env.wasm.wasmBinary` from node_modules); dynamically imported by inline mode under Node only. |
| `src/ai/sha256.ts` | WebCrypto SHA-256, with a pure-JS fallback for insecure contexts (plain-http LAN testing). |
| `scripts/fetch-model.sh` | Downloads the pinned model to `public/models/ds-e8.1-b6soup-70b117b5.onnx` and checks its sha256. Idempotent. Already run. |
| `scripts/bench-ai.mjs` | AI-vs-AI game in Node (sources loaded through Vite's SSR loader), per-decision timing. |
| `tests/ai/*.test.ts` | Vitest (Node, inline). `tests/ai/browser/` = dev-only bench page + Playwright runner + temp build config. |

## Public API (for the controller)

```ts
import { createAiPlayer, isAbortError } from "../ai";
const ai = createAiPlayer();                 // AI_CONFIG; worker in browsers, inline where there is no Worker
const info = await ai.init(p => setLoad(p)); // LoadProgress: model-download (fraction) → model-verify → ai-worker
// at each AI decision with ≥ 2 legal moves that is not a forced event target:
const { idx, ms } = await ai.choose({ state: engine.snapshot(), seed, moves });
engine.step(engine.decodeFlat(idx), 0);
```

- `choose` resolves to a legal index of `mask(false)` at the requested state after seating (AI seat = model
  `obs_features` 12, other seat = `engine.currentRules`). It re-seats the state itself; if the controller
  already seated it the same way (it must, so the masks agree), nothing changes (`decision.reseated` false).
- The AI's side is the state's decider. `moves` = all non-auto-played moves of the game, both sides, in
  order, each `{before: snapshot, action: decodeFlat(idx)}`. The tracker gets only the new moves when the
  list extends the one last seen (compared by identity, then by bytes), otherwise reset + full replay
  (undo, resume, new game, respawned worker). Do not mutate AiMove objects after passing them.
- Answer: `AiChoice {idx, ms (compute), elapsedMs (with padding), source: single|search|policy|fallback, decision}`.
- Timing: every `choose` takes ≥ `minDelayMs` (600 ms). Decisions with `resolving_card ∈ {10, 49, 95}` are
  padded to a delay sampled from the AI's recent search times. **Controller:** for AI decisions you
  auto-play at those cards (single legal / no decision), wait `ai.thinkingDelayMs()` so the speed does not
  reveal that the AI had no choice.
- `cancel()`: pending `choose` calls reject with an AbortError (`isAbortError(e)`); a search in flight
  terminates the worker; the next `choose` spawns a new one with the kept model bytes (~0.2 s + belief
  replay). A model download in progress is not interrupted. Use it on undo / new game / resign while
  the AI thinks. `dispose()` ends everything.
- Errors: `init()` rejects with a readable message (no WebAssembly SIMD, model unreachable/corrupt on
  both URLs, engine missing). A worker crash is replaced on the next call. A failed search falls back to
  the network's argmax (`source: "fallback"`, `decision.error`), so `choose` only rejects on abort or
  an unusable request (terminal state, chance node).
- Seeds: tests and DS use `((stepIndex + 1) * 1_000_003) >>> 0`. Same state + seed + history → same move.

## How to run / test

```sh
bash scripts/fetch-model.sh                      # once (already done); CI must run it or the .onnx must be committed
npx vitest run tests/ai                          # ~85 s: unit + full-strength inline games + the dev autopilot
node scripts/bench-ai.mjs [--search top|nobelief|policy] [--seed 7] [--max-decisions N] [--json out.json]
# real browser (dev):
npx vite --port 5181 &   source scripts/pw-env.sh
node tests/ai/browser/run.mjs "http://localhost:5181/TS_playfield/tests/ai/browser/index.html?n=20&seed=7" --runs 2 [--throttle 4]
#   page params: n, seed, search=top|nobelief, cancel=0|1, mode=inline (AI on the page thread)
# production build check (temp outDir; never the site's build):
npx vite build   --config tests/ai/browser/vite.build.config.ts --outDir /tmp/ai-dist --emptyOutDir
npx vite preview --config tests/ai/browser/vite.build.config.ts --outDir /tmp/ai-dist --port 5182
```

## Dev autopilot (QA): `src/dev/autopilot.ts`

A second AI player that picks the **human's** move at the open prompt the way the AI would, so live play-throughs
reach turn 10 and final scoring (the random driver lost by turn 2-3). Dev only: `src/ui/screens/appController.ts`
installs it as `window.__tspAuto` behind `import.meta.env.DEV` through a dynamic import, so a production build holds
no autopilot code (checked: no `__tspAuto` / `autopilot` in `dist/`).

```ts
await __tspAuto.ready();            // loads its own worker + model (~0.3 s, cached)
const s = await __tspAuto.suggest(); // null without a visible prompt, else
// { promptId, kind, option: {idx, kind, id}, via: "ai" | "fallback", aiIdx, reason?, source, ms }
await __tspAuto.step();              // suggest + controller.choose (no UI; quick runs)
__tspAuto.stats();                   // { suggestions, ai, unmapped, errors, stale, ms, recent[] }
__tspAuto.setSearch("full");         // or ?auto=full in the URL: leaderboard #1's search instead of the argmax
```

- It asks `createAiPlayer({...AI_CONFIG, search: "policy" | SEARCH, minDelayMs: 0}, {padSensitive: false})` with the
  controller's **unredacted** position and move list (`TsGameController.humanDecisionForDiagnostics()`): a test
  tool, it may see everything.
- Seats: `core.ts` seats the decider (here the human's side) with the model's bits (OPP_EVENT_GATED) and the other
  with the person rules, while the controller seats the human with the person rules (adds OWN_EVENT_GATED and
  ALWAYS_ASK_DISCARD). ALWAYS_ASK only adds forced decisions (auto-played, never a prompt); OWN_EVENT_GATED only
  removes dead own Events (One Small Step when not behind, Wargames away from DEFCON 2). So the AI's index is an
  option of the prompt except in those cases; then `fallbackOption` answers (deterministic: no option that loses
  on the spot, play-mode Influence > Realign > Space > Coup > Event, op-mode Influence > Realign > Coup, else the
  first non-done option), the line is logged (`[autopilot] …`, console.warn) and counted (`unmapped`). An AI
  failure falls back the same way (`errors`). It never throws at a prompt.
- Tests: `tests/ai/autopilot.test.ts` (fallback rules; mapping / fallback / failure with a stub AI; two whole games
  in Node, policy vs policy through the real controller, 0 unmapped).
- **Seed finder** (`tests/ai/autopilot-seeds.test.ts`, skipped unless `TSP_SEEDS` is set): plays in Node exactly the
  game a dev play-through with `?ai=policy&seed=<n>` and `play.mjs --policy ai --game-seed <n>` plays (same seeded
  controller random, the argmax on both sides; checked: seeds 11 USSR and 12 US end identically, same answer
  count), ~2.5 s a game: `TSP_SEEDS=1-40 TSP_SIDE=US npx vitest run tests/ai/autopilot-seeds.test.ts --silent=false`.
  With both seats on the policy a seed gives the same game for either human side. Seeds 1-40: 23 reach turn 8+,
  14 turn 10; endings vp20 24, wargames 8, final-scoring 6 (seeds 1, 3, 13, 16, 30, 38), defcon 2; the earliest
  ends are turn 3 (seed 12) and 4 (seed 8). 2 of 80 games had one unmapped answer (seat rules), answered by the
  fallback.

### The play-through driver with the autopilot (`src/ui/screens/demo/play.mjs`)

```sh
# a dev server whose page cannot be reloaded by other agents' edits (HMR and file watching off; restart it after
# your own edits): TSP_NO_HMR=1 (vite.config.ts then sets server: { hmr: false, watch: null })
TSP_NO_HMR=1 TSP_VITE_CACHE=node_modules/.vite-PORT npx vite --port PORT --strictPort &
source scripts/pw-env.sh
node src/ui/screens/demo/play.mjs --url http://localhost:PORT/TS_playfield/ --side USSR|US|random --until end \
     [--policy ai|random] [--auto policy|full] [--game-seed n] [--w 390 --h 844] [--touch] [--lang zh] \
     [--undo --switch-lang --reload --resign] [--shots dir] [--json file] [--speed fast] \
     [--browser chromium|firefox|webkit]
```

- `--policy ai` (default): each prompt's option comes from `__tspAuto.suggest()`; the driver still answers it by
  clicking / tapping the real UI (map box at an uncovered, settled point; hand card at a visible point of the fan;
  play-mode rows; dossier tiles and lamps; the dossier's or the slip's Done; Continue; a hold button held 1.6 s;
  the keyboard -- a focused box + Enter -- only when no pointer reaches the target). `--policy random`: the old
  random play (exercises coups / realignments / events; games end by turn 2-3).
- `--until end` plays to the game over (Continue past the final scoring sheet, then a `game-over.png` of the telex,
  taken once the telex is up and settled -- `telexSettled`; no telex within 90 s is an error).
- `--game-seed n` adds the dev `?seed=n`: with `?ai=policy` (the driver's default `--ai policy`) the game replays
  exactly and the seed finder above predicts it. `--auto full` runs the autopilot on leaderboard #1's search.
- `--touch` (default below 700 px wide): `hasTouch` + `isMobile`, taps (no hover), sheets closed by their grab, a
  hold through CDP touch events in Chromium, a synthetic touch PointerEvent pair (`via.synthHold`) in Firefox /
  WebKit.
- `--browser` (default chromium): Playwright's Firefox or WebKit build (`source scripts/pw-env.sh` first; DEPLOY.md
  §5). The driver waits for the boot line to reach 100 % before its start-up reload (WebKit / Firefox otherwise log
  the dying worker's cancelled module loads as errors).
- Checks: a **fallback** = the UI did not answer (the driver then calls `__tsp.choose` and fails); a **mismatch** =
  the UI answered a different option than the one pressed for (the driver spies on `__tsp.choose`); page errors;
  a 25 s stall watchdog. Exit 1 on any. The last line is `RESULT {json}` (also `--json file`): final turn, ending,
  answers, how they went (click / tap / key / hold / dialog), fallbacks, mismatches, autopilot stats, wall time.

Verified 2026-11-22 (dev server with HMR off, `?ai=policy`, speed fast, autopilot policy; every game ended exactly
as the Node seed finder predicted):

| Run | Result | Answers | Fallbacks / mismatches / errors | Wall |
|---|---|---|---|---|
| 1440×900 en, USSR, seed 13 | final scoring, turn 10, US +7 | 287 (383 clicks) | 0 / 0 / 0 | 541 s |
| 1440×900 en, US, seed 13 | final scoring, turn 10, US +7 | 296 | 0 / – / 0 | 524 s |
| 1440×900 en, USSR, seed 1 | final scoring, turn 10, US +20 | 308 | 0 / – / 0 | 545 s |
| 1440×900 en, USSR, seed 11 | Wargames (US), turn 10 | 256 | 2 / – / 0 (fan-overlapped hand cards; driver fixed since) | 517 s |
| 1440×900 en, US, seed 12 | VP 20 (USSR), turn 3 | 76 | 0 / – / 0 | 142 s |
| 390×844 touch, US, seed 12 | VP 20 (USSR), turn 3 | 76 (152 taps, 15 keys, 1 hold) | 0 / 0 / 0 | 230 s |
| 1440×900, random side, `--policy random --undo --switch-lang` | mil ops + VP 20, turn 2 | 65 | 0 / 0 / 0 | 108 s |

("–": the run predates the mismatch check; its identical outcome to the Node replay shows the UI answered every
option the autopilot chose.) The autopilot's answers were the AI's own in every browser game (0 unmapped).

## Measurements (2026-11-22, i9-14900HX, headless Chromium via Playwright, full-strength search)

Browser, worker mode, dev server and production build alike (AI = USSR vs. a random US, first 12-20 AI
decisions of turn 1):

| | value |
|---|---|
| `init` first visit (local server) | 0.36-0.43 s: download + sha256 ~0.1 s, engine + ORT session ~0.25 s |
| `init` repeat visit | 0.23 s: Cache API hit, no `.onnx` request |
| per search | median ~0.9 s, p90 ~3.6-5.1 s, max 5.3 s (the belief decisions: 18-29k likelihood rows, D = 9-14 opponent clicks this turn) |
| main-thread jank while thinking | none: max timer gap 17-20 ms, 0 gaps > 50 ms |
| worker round-trip overhead | ≤ 1 ms per decision |
| cancel mid-search → respawn + replay of 22-34 moves + search | abort 120 ms after the call; respawn adds ~0.15 s |
| CPU throttling 4x (`Emulation.setCPUThrottlingRate`) | Chromium refuses it for workers ("only supported for pages"), so it was measured with `mode=inline`: ×4.1-4.3 everywhere. Turn-1 median 3.8 s, the headline/AR1 belief decisions **14-15 s** (vs 3.4 s unthrottled). |

Node AI-vs-AI full game (`node scripts/bench-ai.mjs --seed 7`, belief search, one core; Node ≈ browser
speed, compare the turn-1 numbers above): 540 AI decisions (+10 auto-played), game over at the final
scoring. Per decision: **median 0.44 s, p90 5.1 s, p99 8.8 s, max 10.1 s**; 113 > 2 s, 55 > 5 s;
**~371 s of thinking per side per game**. Card choices (SELECT_CARD) median 3.1 s, influence points /
play modes median ~0.25 s. The 134 decisions that weighed the belief (median 4.5 s) take 82 % of the time.
Rough slow-device estimate (×4): card choices ~12 s median, worst ~40 s; ~25 min of AI thinking per game.

**Assessment.** On a fast desktop the belief search is fine (median < 1 s; a few 3-9 s card decisions per
turn). On a ~4x slower phone/laptop its card decisions after many opponent clicks reach ~15-40 s. If that
proves too slow on real devices, switch `SEARCH` → `SEARCH_NO_BELIEF` in `src/ai/config.ts` (one
line; leaderboard #2, ~1/3 of the time, same network) — an owner decision (CLAUDE.md says "highest-rated").

## Known issues / notes

- Inline mode (no Worker; Node) runs the search on the calling thread: a browser page freezes while it
  thinks, and `cancel()` only takes effect before the search starts. It is a fallback; every target
  browser has module workers.
- After a reset + replay (undo, resume, respawn) the belief's temperature evidence from earlier turns
  starts again (DS behaviour; documented in DS rollout_runner.ts). Same answer as a fresh player, which
  the tests check, but not necessarily the answer an uninterrupted player would have given.
- Forced event targets (critique §3.1) are the controller's job; if `choose` is called at one it searches
  (legal, just slower). Single-legal decisions are answered without a network call.
- The worker's engine prints anomaly lines with `console.warn("[ai engine] …")` (none seen in testing).
- Production bundle: worker chunk 98 KB, ORT wasm 14.2 MB raw (3.7 MB gzip), ORT `.mjs` 24 KB, model 5.8 MB.
  The inline-mode chunks (`load`, `ort_env`, `ort_node`, ORT bundle) are lazy and never fetched in worker mode.
- `public/models/*.onnx` (5.8 MB) must be deployed: commit it or run `scripts/fetch-model.sh` in CI.
  The HF fallback URL keeps the site working if it is missing, at the cost of a cross-origin download.

## Contract gaps (worked around locally)

1. `AiConfig` has no fallback URL list / expected size / mode → `AiPlayerOptions` (second argument).
2. `AiPlayer.choose` returns `{idx, ms}` only; the handle returns `AiChoice` (superset, assignable).
   `ms` = compute time; padding is inside the promise.
3. The timing side channel for AI answers that never reach the AI (auto-played) needs the controller:
   `AiPlayerHandle.thinkingDelayMs()` is the extension for it.
4. `cancel()` semantics for `init()` are unspecified: a download is not cancelled; only `choose` aborts.

## QA round 1 fixes (group F1, 2026-11-23)

- **`src/ai/errors.ts`** (new, DOM-free): `supportsWasmSimd()` (moved here from index.ts, still re-exported),
  `wasmUnsupportedError()` / `WASM_SIMD_UNSUPPORTED` / `isWasmUnsupportedMessage(msg)` (the message starts with the
  marker), `withStage(e, stage)` / `stageOf(e)`. Every load error now carries the `LoadProgress` stage it failed in:
  `fetchModelBytes` → "model-download" ("model-verify" when every source sent a wrong file), `loadCore`'s engine /
  onnxruntime session → "ai-worker", a worker that fails to start → "ai-worker"; the worker sends `stage` (and `name`)
  with its load error (protocol.ts). The controller keeps it in `vm.load` (QA Q-010).
- **No false "no WebAssembly" (Q-005)**: `Model.fromBytes` rewrites an onnxruntime failure into the SIMD message only when
  `!supportsWasmSimd()`; otherwise "could not start onnxruntime for …" (stage "ai-worker"). onnxruntime's own errors
  name its `ort-wasm-simd-threaded` files, which matched the old `/SIMD/i` test. The boot line must match
  `isWasmUnsupportedMessage` instead of `/WebAssembly|SIMD/i` (request to F4/BootLine).
- **ORT wasm in parallel (Q-013)**: the worker fetches onnxruntime's WebAssembly (`ORT_WASM_URL`, ~3.7 MB gzip) as soon as
  it gets "load", while the model downloads, and hands the bytes to onnxruntime (`env.wasm.wasmBinary`, cleared after the
  session is made); if the prefetch fails onnxruntime fetches the file itself. Measured on a Pages-like server at
  1.6 Mbps / 150 ms (my build): the model's progress moves the whole time (0 → 5.8 MB in ~50 s, sharing the link), Ready
  ~1 s after the model, no ~20 s stall at "Start AI 95 %"; one request for the wasm on a fresh profile. The first-visit
  note says ~10 MB (`ui:loading.firstTime`, tools/ui-keys.mjs).
- **Forced AI answers (Q-004)**: see logic.md ("AI"): the controller now pads every forced AI card choice out of its
  hand (`rules.ts padsForcedAiDecision`), not only 10/49/95.
