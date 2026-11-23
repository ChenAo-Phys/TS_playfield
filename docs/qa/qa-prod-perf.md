# QA: production build, performance and robustness (`qa-prod-perf`)

Date: 2026-11-22. Build: `npx vite build --outDir <scratch>/dist` of the current tree, served with `npx vite preview`
(port 4189, base `/TS_playfield/`) and, for transfer / caching / 404 / offline checks, with a small static server that
copies GitHub Pages' behaviour (`tools/ghserver.mjs`: `cache-control: max-age=600`, gzip for html/js/css/wasm/txt,
`application/wasm`, ETag + 304, a real 404; the headers were checked against DeepStruggle's own live Pages site, which
serves `ts_engine.wasm` gzip-compressed as `application/wasm`). Headless Chromium (Playwright 1.65.1), i9-14900HX
(32 threads, shared with other agents; load average and a CPU calibration loop recorded with every timing run).

Scratch dir (all scripts, logs and raw JSON):
`$SP/qa-prod-perf/`
(`tools/`, `out/`). Production has no `__tsp`; the harness gets the controller through an injected React DevTools hook
(`tools/hooks.js`, test-side only; the build is unchanged) and times every AI decision by wrapping `Worker`
(`decide` → `decision` round trip and the worker's own `decision.ms`).

Progress: complete (build sizes, GitHub Pages and licence checks, AI timing at 1× and 4× as USSR and US, first /
repeat visit timing and transfer, boot failures, corrupted and blocked storage, reload during AI thinking, two tabs,
offline, memory over 4 + 3 consecutive games). All servers stopped.

Summary, most severe first:
- **F4 major**: a failed onnxruntime download says "This browser cannot run WebAssembly" (regex matches the file name).
- **F10 minor**: each finished / abandoned game's screen stays in memory (anchor registry); ~3k DOM nodes, ~1 MB per game.
- **F5 minor**: model or worker download failures say "The rules engine could not be loaded".
- **F1 minor**: licence notices not shipped; onnxruntime-web not credited.
- **F3 minor, owner decision**: at ~4× slower CPU the AI's card choices take ~17 s median, up to ~48 s.
- **F8 minor, owner decision**: two tabs overwrite each other's save silently.
- **F2, F6, F7, F9 polish**: no favicon / Open Graph; duplicate game-chunk toast; 20-s progress stall on slow first
  visits and "5.8 MB" understated; offline language switch fails silently. **F11 polish, owner decision**: saves from an
  older engine vanish without a notice.
- Fine: first visit 10.2 MB / 20 requests, Ready in 0.6-0.7 s locally and 52 s at 1.6 Mbps (a game can start at 3.6 s);
  repeat visit 0 requests; reload during AI thinking resumes; corrupted saves and blocked storage are handled; no worker
  leak; no COOP/COEP needed; no dev switches in production.

## Findings

### F1 (minor) Third-party licence notices are not shipped, and onnxruntime-web is not credited

- **Repro:** `npx vite build --outDir DIR`; `ls DIR` / `grep -rl "Permission is hereby granted" DIR` → nothing. Open
  the app → Menu → About & credits.
- **Expected:** the deployed site carries the licence notices of what it redistributes: DeepStruggle (MIT: the engine
  `engine/ts_engine.wasm` + `.mjs`, ported search / view / i18n code), onnxruntime-web (MIT, Microsoft: the 14.2 MB
  `ort-wasm-simd-threaded-*.wasm`, `ort.wasm.bundle.min-*.js`, part of `worker-*.js`), React / react-dom / i18next
  (MIT), the Emscripten runtime glue (MIT), the fonts' OFL. The MIT licence asks for "the above copyright notice and this
  permission notice" in all copies.
- **Actual:** `THIRD_PARTY_LICENSES.md` sits in the repo root only (not in `public/`, so not in the build) and the About
  dialog does not link it (the catalog key `ui:about.licenses` "Third-party licenses" exists but is unused). About names
  DeepStruggle "(MIT License)" and links its GitHub repo, and links `fonts/OFL.txt` (shipped, 200 OK). onnxruntime-web is
  not mentioned anywhere (not in About, not in `THIRD_PARTY_LICENSES.md`); in the bundle only the one-line
  "Copyright (c) Microsoft Corporation … Licensed under the MIT License" header survives minification; React keeps its
  `@license React` comments, i18next keeps nothing.
- **Likely fix:** add onnxruntime-web, React, i18next and Emscripten to `THIRD_PARTY_LICENSES.md`, ship it (e.g. copy to
  `public/THIRD_PARTY_LICENSES.txt`) and link it from `src/ui/screens/AboutDossier.tsx` with the existing
  `ui:about.licenses` key. Files: `THIRD_PARTY_LICENSES.md`, `public/`, `src/ui/screens/AboutDossier.tsx`.

### F2 (polish) No favicon and no social-preview tags in the page head

- **Repro:** `DIR/index.html` of the build.
- **Actual:** title (`Twilight Struggle Playfield`), bilingual description, `theme-color`, `color-scheme` are fine. There
  is no `<link rel="icon">`, so browsers ask for `https://chenao-phys.github.io/favicon.ico` (the domain root, outside
  the project) → 404 and a generic tab icon; no `og:title` / `og:description` / `og:image` / `twitter:card`, so a link
  pasted into a chat app or forum shows no card. `<html lang="en">` is static in the file (the app updates it at
  runtime; crawlers see `en`).
- **Expected:** a small icon under the base path (e.g. an inline SVG data-URI or `public/favicon.svg` linked with
  `%BASE_URL%`), and Open Graph tags (an image needs an absolute URL, e.g.
  `https://chenao-phys.github.io/TS_playfield/og.png`). File: `index.html` (+ `public/`).

### F3 (minor, owner decision) Full-strength AI on a ~4× slower device: card choices take ~17 s median, up to ~48 s

- **Repro:** production build on `vite preview`, no `?ai`. `tools/runai.sh <name> USSR|US 1|4 <seed>` (drives the real UI
  with `prodplay.mjs --policy random --until 3`, a copy of `play.mjs` that reads the controller through the DevTools
  hook; `--throttle 4` slows the whole renderer process, page **and** AI worker, with a SIGSTOP/SIGCONT duty cycle of
  10/30 ms, because Chromium rejects `Emulation.setCPUThrottlingRate` for workers: "Operation is only supported for
  pages, not workers". Calibrated: a 3·10⁸-step loop in the worker took 0.98 s → 4.0 s, in the page 0.93 s → 4.2 s).
- **Numbers** (seconds of AI compute per decision, `decision.ms`; the visible wait is ≥ 0.6 s more for fast decisions
  because of the minimum delay; round trip = compute + ≤ 1 ms):

  | Run (turns 1-2) | decisions | median | p90 | max | card choice median | > 8 s | > 20 s | "Still thinking" shown | total |
  |---|---|---|---|---|---|---|---|---|---|
  | USSR, 1× | 67 | 0.74 | 7.6 | 12.0 | 4.6 | 6 | 0 | 5× | 134 s |
  | US, 1× | 69 | 0.62 | 6.2 | 9.0 | 4.5 | 2 | 0 | 1× | 116 s |
  | USSR, 4× | 68 | 2.3 | 24.8 | 48.2 | 17.3 | 14 | 8 | 14× | 457 s |
  | US, 4× (game ended turn 2, Europe control) | 46 | 3.2 | 25.3 | 36.2 | 16.9 | 10 | 6 | 10× | 328 s |

  Load average 3-10 on 32 threads during the runs; the calibration loop stayed at 0.82-1.03 s (idle ≈ 0.95 s), so the
  machine was not the bottleneck. Raw: `out/ai-*.json`, `out/ai-*.log`. One worker for the whole session, never
  respawned; no errors; no external request.
- **What it means:** the slow decisions are the belief-weighing ones (card choices / headline and the first point of an
  operation late in a turn: 45-63 k likelihood rows after 22-31 opponent clicks in the turn). Here turn 1-2 already
  reach 9-12 s at 1× on a fast desktop (higher than ai.md's 5.3 s turn-1 max; ai.md measured the first 12-20
  decisions only, and the belief grows with every opponent click in the turn, so late-turn decisions cost more). At 4× (a mid-range phone /
  old laptop), every AI card play waits ~17 s, the worst ~48 s, and the "Still thinking" note shows 10-14 times in two
  turns: about 7-8 minutes of waiting per two turns, ~25-35 min per 10-turn game. The note itself appears as specified
  (after 8 s, every time). Nothing breaks; it is slow.
- **Owner decision:** keep leaderboard #1 everywhere (CLAUDE.md), or fall back to `SEARCH_NO_BELIEF` (`src/ai/config.ts`,
  leaderboard #2, ~1/3 of the time per ai.md) on slow devices, e.g. when a calibration loop at boot, or the first
  belief decisions, exceed a threshold. A per-decision time cap is not possible without changing the search.

### F4 (major) A failed download of the onnxruntime WebAssembly is reported as "This browser cannot run WebAssembly"

- **Repro:** `tools/r-fail.mjs ortwasm` (production preview, 1440×900, en): a fresh profile with
  `context.route(/ort-wasm-simd-threaded.*\.wasm/, abort)`, i.e. what a dropped connection, a captive portal or a
  proxy does to the 14 MB file. Reproduced twice.
- **Expected:** the boot line names a download / start-up failure of the AI (`ui:error.worker` or
  `ui:error.modelDownload`), Retry.
- **Actual:** "THIS BROWSER CANNOT RUN WEBASSEMBLY, WHICH THE GAME NEEDS." with details "This browser does not support
  WebAssembly SIMD, which the AI needs. Please use a current version of Chrome, Edge, Firefox or Safari (16.4 or
  later)." in a current Chromium. The user is told to change browsers when a Retry would fix it (Retry did: Ready).
  Screenshot (first row): `docs/qa/shots/qa-prod-perf/boot-errors-wrong-cause.jpg`.
- **Cause:** `src/ai/model.ts` (`Model.create`) rewrites any `InferenceSession.create` error whose message matches
  `/SIMD/i` into the SIMD message; onnxruntime's network error contains the file name `ort-wasm-simd-threaded-….wasm`
  ("Aborted(NetworkError: Failed to execute 'send' on 'XMLHttpRequest': Failed to load '…/ort-wasm-simd-threaded-
  DcHrbrbl.wasm')"), so it always matches. `errorKey` in `src/ui/screens/BootLine.tsx` then picks
  `ui:error.webassembly` from the word "WebAssembly". Fix: decide with `supportsWasmSimd()` (already in
  `src/ai/index.ts`) instead of the message text, or exclude network errors.

### F5 (minor) An AI model download failure or a worker load failure says "The rules engine could not be loaded"

- **Repro:** `tools/r-fail.mjs onnx` (self-hosted `.onnx` aborted; the Hugging Face fallback is blocked by the harness,
  as in a network where huggingface.co is unreachable) and `tools/r-fail.mjs worker` (`assets/worker-*.js` aborted).
  Fresh profile, production preview, en. Reproduced twice each.
- **Expected:** `ui:error.modelDownload` ("could not download the AI model…") and `ui:error.worker`.
- **Actual:** both show "THE RULES ENGINE COULD NOT BE LOADED." (rows 2-3 of
  `docs/qa/shots/qa-prod-perf/boot-errors-wrong-cause.jpg`), although the rules engine had loaded (the side buttons were
  enabled at ~175 ms, then disabled by the error). The details disclosure has the right raw text; Retry works (Ready).
- **Cause:** `StartScreen`'s `useAiReady` passes the last `vm.load.stage` it saw as `failedStage`. A fast failure
  sends no progress first (`fetchModelBytes` reports `model-download` only once a response arrives; a worker that fails
  to load reports nothing), so the last stage seen is still `engine`. Files: `src/ui/screens/StartScreen.tsx`
  (`useAiReady`), `src/ui/screens/BootLine.tsx` (`errorKey`), or the controller could report the failed stage with the
  error (`src/game/controller.ts`, coordinator for `contract.ts`). A first-time visitor who is offline, or whose network
  blocks GitHub Pages' large files and Hugging Face, gets the wrong explanation.

### F6 (polish) A failed game-chunk download shows the same toast twice

- **Repro:** `tools/r-fail.mjs game`: `assets/GameScreen-*.js` aborted, wait for Ready, click "Soviet Union".
  Reproduced twice.
- **Actual:** the start screen stays (correct) and the toast region holds two identical toasts "The game screen could
  not be loaded. Check your connection and try again." Unblocking and clicking again shows the game (correct).
- **Likely cause:** `src/ui/App.tsx`: both `startGame`'s `retryChunk()` and `useChunk(gameChunk, inGame, onError)` toast
  for the same rejected `load()`.

### F7 (polish) Slow first visit: the boot line sits at 95 % "Start AI" for ~20 s while 3.7 MB more downloads

- **Repro:** `tools/slowboot.mjs` (first visit, fresh profile, CDP `Network.emulateNetworkConditions` 1.6 Mbps down /
  150 ms, Pages-like server, en). Twice, plus the load matrix below.
- **Actual:** the AI model bar counts 0 → 5.8 MB from 4 s to 33 s, then "Start AI" stays at 95 % with no movement from
  34 s to 52-55 s: the worker only now downloads onnxruntime's wasm (3.70 MB gzip of 14.2 MB), after the model. 40 % of
  the wait shows no progress. The note under the bar says "The AI model (about 5.8 MB) is downloaded once", but a first
  visit downloads 10.2 MB. Screenshot: `docs/qa/shots/qa-prod-perf/slow-network-start-ai-stall.jpg`. Nothing blocks:
  the side buttons are enabled at 3.6 s and a game can start while the AI loads.
- **Suggestion:** fetch the ORT wasm in parallel with the model (or warm the HTTP cache with a `fetch` at load start)
  and count both in the bar (`MODEL_BYTES` + the ORT size), and say "about 10 MB" in `ui:loading.firstTime`. Files:
  `src/ai/load.ts` / `src/ai/worker.ts`, `src/ui/screens/BootLine.tsx`, `src/i18n/locales/*/ui.json`.

### F8 (minor, owner decision) Two tabs on the same save overwrite each other's autosave without a word

- **Repro:** `tools/r-tabs.mjs` (production preview, one browser profile, en). Reproduced twice.
  1. Tab A: new game (USSR), play to turn 1 AR 2. 2. Tab B: open the site → "Resume game · Turn 1 · AR 2" → Resume.
  3. Play in A, then in B: the save is whichever tab moved last (A's 2 answers were overwritten by B's: 27 → 27 steps
  of B's line; run 2: 34 → 42). 4. B: Menu → New game → United States (save: 1 step). 5. One more move in A: the save is
  A's game again (30 / 46 steps). B keeps playing a game that is no longer saved; reloading B offers A's game.
- **Expected (suggestion):** a tab notices that another tab took over the save (`storage` event or a BroadcastChannel /
  `navigator.locks`) and says so ("This game continues in another tab"), or at least the later "New game" is not undone
  silently by the older tab.
- **Actual:** no cross-tab handling (`src/game/controller.ts` writes `ts-playfield.game.v1` on every step; nothing listens
  for `storage`). No errors, no corrupted save (each write is a whole save), but progress made in one tab is silently
  lost. Owner decision whether this deserves handling.

### F9 (polish) Switching to Chinese while offline fails silently with an unhandled promise rejection

- **Repro:** `tools/r-offline2.mjs` (Pages-like server, en, new game, `context.setOffline(true)` at turn 1 AR 1, then
  the console's 中文 toggle). Reproduced twice (`r-offline.mjs`, `r-offline2.mjs`).
- **Actual:** the `zh-CN` catalog is a lazy chunk (`assets/zh-CN-*.js`) that was never loaded; the switch throws
  `TypeError: Failed to fetch dynamically imported module …zh-CN-*.js` as an uncaught `pageerror`; the UI stays English
  with EN still pressed (consistent) and no message. Back online, the same click works (no cached failure).
- **Expected:** a toast ("Chinese could not be loaded; check your connection"). Files: `src/ui/console/LangToggle.tsx`
  (`void setLang(...)`), `src/i18n/index.ts` (`setLanguage` / `use`). A Chinese-speaking player on a flaky connection is
  the likely case.

### F10 (minor) Every finished or abandoned game's screen stays in memory (anchor registry keeps detached elements)

- **Repro:** `tools/mem.mjs 4 3` (production preview, 1440×900, en, speed instant: four games in a row, each to its end
  or turn 3, then New game) and `tools/mem2.mjs 3` (three games, Menu → New game while the AI thinks). Counters after
  two forced GCs (`HeapProfiler.collectGarbage`), always on the same start screen (1,630 layout objects each time):

  | On the start screen after | DOM nodes | JS listeners | JS heap |
  |---|---|---|---|
  | boot | 1,668 | 181 | 5.2 MB |
  | game 1 | 4,816 / 4,227 | 501 / 430 | 9.4 / 8.7 MB |
  | game 2 | 9,084 / 6,880 | 792 / 522 | 10.9 / 9.7 MB |
  | game 3 | 9,640 / 9,421 | 855 / 626 | 11.3 / 10.5 MB |
  | game 4 | 13,409 / – | 1,115 / – | 12.0 MB / – |

  (`mem.mjs` / `mem2.mjs`.) ~2,600-4,300 detached DOM nodes, ~60-290 listeners and ~0.5-1.5 MB of JS heap stay behind
  per game; the renderer's RSS went 288 → 503 → 546 → 557 → 581 MB.
- **Cause (heap snapshot, `tools/heapsnap.mjs`, two games):** 4,632 detached DOM nodes; the strong paths from the GC
  roots run `UiRoot context value .anchors .ref → (closure) els Map → [element]`: the console instruments (turn, AR,
  DEFCON, VP, mil ops, space), hand cards, card boxes, the headline card and map `<g>` anchors of earlier games. One
  retained element keeps its whole detached tree (parent links), so in practice each old `GameScreen` (`DIV._game`, one
  per earlier game in `DOM.getDetachedDomNodes`) stays alive. In `src/ui/runner/anchors.ts` the shared ref callback, when
  React calls it with `null`, prunes with `e.isConnected`, but React 18 detaches refs **before** it removes the host nodes,
  so the element is still connected and stays in the map; ids that are never queried again (most `card:<id>`, map
  anchors) are never pruned ("Detached elements are dropped lazily").
- **Expected:** after leaving a game, the counters return near the boot values. Fix: prune after the commit (e.g.
  `queueMicrotask(() => live(id))` in the `null` branch), or give each element its own callback so `null` removes exactly
  that element. Owner: runner (`src/ui/runner/anchors.ts`).
- AI worker: no leak. One worker serves consecutive games; a New game during a search terminates it and starts one
  (`mem2.mjs`: made 3, terminated 2, one alive); its JS heap stays 2.6 MB.

### F11 (polish, owner decision) After an engine update, an unfinished game disappears from the start screen silently

- **Repro:** `tools/r-storage.mjs corrupt`, variant `otherEngine`: a real save whose `fingerprint` differs from the
  loaded engine's (what every visitor with a game in progress sees after a deploy that rebuilds the engine, e.g. a
  DeepStruggle pin bump).
- **Actual:** no Resume button and no notice; the save stays in storage. The catalog already has
  `ui:error.saveIncompatible` ("Your saved game was made with another version of the engine or AI and cannot be
  resumed."), but it is only toasted when Resume is clicked, and Resume is hidden for this case
  (`readResumable` in `src/game/controller.ts`).
- **Suggestion:** show the Resume card disabled with that sentence, or toast it once on the start screen, then discard
  the save. Rare (engine bumps only), so an owner call.

## Measurements

### Build output (`vite build`, 246 files, 28.2 MB raw)

Every file over 50 kB. "gzip" is what GitHub Pages sends (it compresses html/js/css/wasm/txt, checked on a live Pages
site; zlib level 6 here); `.onnx`, `.webp`, `.woff2` go as they are.

| File | raw | gzip on the wire | loaded |
|---|---|---|---|
| `assets/ort-wasm-simd-threaded-*.wasm` (onnxruntime) | 14,239.9 kB | 3,695.9 kB | AI worker, after the model |
| `models/ds-e8.1-b6soup-70b117b5.onnx` | 5,797.4 kB | (as is) | AI worker; then Cache Storage |
| `engine/ts_engine.wasm` | 409.3 kB | 149.4 kB | page + worker (one download, HTTP cache) |
| `assets/index-*.js` (entry) | 342.2 kB | 107.2 kB | boot |
| `assets/GameScreen-*.js` (game chunk) | 242.9 kB | 79.1 kB | idle preload on the start screen |
| `assets/vendor-*.js` (react, react-dom, i18next) | 186.2 kB | 59.6 kB | boot (modulepreload) |
| `assets/index-*.js` (map chunk) | 185.9 kB | 65.0 kB | start screen backdrop |
| `assets/GameScreen-*.css` | 115.8 kB | 20.6 kB | with the game chunk |
| `assets/worker-*.js` (AI worker) | 98.2 kB | 33.6 kB | AI load |
| `assets/zh-CN-*.js` (Chinese catalogs) | 73.0 kB | 26.5 kB | only in Chinese |
| `assets/ort.wasm.bundle.min-*.js` | 72.4 kB | 24.4 kB | never in worker mode (inline fallback) |
| `assets/index-*.css` (entry) | 67.4 kB | 14.2 kB | boot |
| `cards/en/059.webp`, `cards/en/040.webp` | 50.4 / 50.1 kB | (as is) | on demand (220 card images, 6.16 MB in all, en + zh) |

All 246 files on the wire: 16.4 MB; largest file 14.2 MB (far from GitHub's 100 MB limit). No source maps.

### First and repeat visit (Pages-like server, `tools/load.mjs`, `tools/runload.sh`; raw: `out/load/*.json`)

1440×900, en, fresh persistent profile for "first", the same profile for "repeat" (HTTP cache + Cache Storage kept).
Times in ms from navigation start: first contentful paint, side buttons enabled (= rules engine loaded, a game can
start), boot line "Ready" (AI loaded). CPU ×4 = CDP `Emulation.setCPUThrottlingRate 4` on the page (Chromium does not
apply it to the AI worker); slow = CDP `Network.emulateNetworkConditions` 1.6 Mbps down / 0.75 up / 150 ms (it does
apply to the worker's fetches: the model took 29 s).

| Visit | CPU | network | FCP | sides enabled | Ready | requests | bytes on the wire |
|---|---|---|---|---|---|---|---|
| first (×2) | 1× | local | 196-204 | 232-234 | 629-732 | 20 | 10.16 MB |
| first (×2) | 4× | local | 316-364 | 605-667 | 1032-1044 | 20 | 10.16 MB |
| first (×2) | 1× | slow | 1636-1692 | 3598-3680 | 52198-52255 | 20 | 10.16 MB |
| first | 4× | slow | 1784 | 3688 | 52299 | 20 | 10.16 MB |
| repeat < 10 min (×2) | 1× | local | 132-156 | 156-184 | 431-486 | **0** | 0 |
| repeat < 10 min (×2) | 4× | local | 264-368 | 492-756 | 857-1136 | 0 | 0 |
| repeat < 10 min (×2) | 1× | slow | 136-168 | 159-209 | 459-559 | 0 | 0 |
| repeat < 10 min | 4× | slow | 292 | 521 | 811 | 0 | 0 |
| repeat after max-age (server `max-age=0`) | 1× | local | 120 | 136 | 408 | 21 × 304 | ~0 (headers only) |
| `vite preview`, first / repeat | 1× | local | 164 / 128 | 181 / 157 | 606 / 407 | 22 / 21 × 304 | (preview sends no gzip for wasm) |

- First visit = 10.16 MB in 20 requests: model 5.80 MB, onnxruntime wasm 3.70 MB, engine wasm 0.15 MB, JS 0.36 MB,
  fonts 0.12 MB, CSS 0.04 MB. What the start screen needs before a game can start is ~0.5 MB.
- Repeat visit: within GitHub Pages' `max-age=600` nothing is requested; after it, every file revalidates with a 304.
  The model is read from Cache Storage (`ts-playfield-models-v1`, 5.80 MB) and never re-requested; everything else,
  including the 14.2 MB onnxruntime wasm, lives in the HTTP cache only (fine on desktop; on a phone with a small HTTP
  cache it may be evicted and re-downloaded, 3.7 MB; not testable here).
- Slow network, first visit: the screen is usable at 3.6 s (a game can start; the AI keeps loading), the AI is ready at
  ~52 s (F7 for the 20-s stretch without progress).
- The game chunk is preloaded while idle in every run (no request when a side is picked); the engine is downloaded once
  (the worker's copy comes from the HTTP cache).
- The page is not cross-origin isolated (`crossOriginIsolated` false, `typeof SharedArrayBuffer` "undefined") and the AI
  works: no COOP/COEP needed.

### AI speed

See F3 for the table (production build, full-strength search, both sides, 1× and 4×). Per decision type at 1× (USSR
run): card choices (decision type 1) median 4.6 s, max 9.4 s; influence points (type 5) median 0.8 s, max 12.0 s (the
first point of an operation late in a turn weighs the belief); play modes (type 2) median 0.3 s. The worker's compute
time equals the round trip within 1 ms; the main thread stays free. `aiStats` in the save matched the sum of the
measured decisions exactly (e.g. 67 decisions, 134,057 ms). CDP CPU throttling alone does **not** slow the AI (it only
applies to pages), so a DevTools "4× slowdown" test of this site shows desktop AI speed; the 4× rows use the duty cycle.

### Memory

See F10. Apart from the retained game screens, the JS heap of a running game is 7-14 MB, the AI worker's JS heap
2.1-2.6 MB (its WebAssembly memory is outside that; the renderer RSS is ~290 MB at boot, 500-600 MB in games).
One `Worker` for a whole session unless a search is cancelled; cancelled workers are terminated (no leak).

### Robustness

| Check | Result | Script / raw |
|---|---|---|
| Reload while the AI thinks (turn 1 AR 2 as US and as USSR; turn 2 headline as USSR) | **OK.** The start screen offers "Resume game · Turn 1 · AR 2"; Resume replays the save (same step count), the AI thinks again and plays (6 decisions to the next prompt; 1 for the headline); no errors. | `tools/r-reload.mjs`, `out/r-reload*.log` |
| Two tabs, same save | Last writer wins, silently (F8). No corruption, no errors. | `tools/r-tabs.mjs`, `out/r-tabs*.log` |
| Offline after the first load, without reloading | **Game continues**: the AI and engine are loaded; turn 1 → 3 offline. Cards not yet seen have no image (31 failed `cards/en/*.webp`); `CardFace` shows its placeholder (Ops + name), the event text is then unreadable until online. Switching to Chinese fails (F9). | `tools/r-offline*.mjs`, `out/offline-turn2.png` |
| Offline reload | Fails (`net::ERR_INTERNET_DISCONNECTED`, the browser's offline page): a reload revalidates the document. A new navigation to the URL within GitHub Pages' 10-minute `max-age` works offline (all from the HTTP cache, model from Cache Storage, Ready in 525 ms, the save offered); after that it fails. No service worker, so no offline play by design; making it work offline (and installable) would need one (~16 MB precache): owner decision, not filed. | `tools/r-offline.mjs` |
| Engine `.wasm` / `.mjs` download fails | "The rules engine could not be loaded." + Retry; Retry (a page reload) reaches Ready. Emscripten falls back from streaming to ArrayBuffer compilation as it should. | `tools/r-fail.mjs wasm,mjs` |
| Model download fails (self-hosted + Hugging Face) | Error + Retry works, but the wrong message (F5). The Hugging Face fallback URL is tried (seen in the details). | `tools/r-fail.mjs onnx` |
| onnxruntime wasm download fails | Error + Retry works, but "This browser cannot run WebAssembly" (F4). | `tools/r-fail.mjs ortwasm` |
| AI worker script fails | Error + Retry works, wrong message (F5). | `tools/r-fail.mjs worker` |
| Game chunk fails | Start screen stays, toast (twice, F6); picking a side again once online shows the game. | `tools/r-fail.mjs game` |
| Chinese catalog fails at boot (`?lang=zh`) | Falls back to English silently, Ready, no alert (acceptable). | `tools/r-fail.mjs zh` |
| Corrupted save: not JSON, `{}`, `null`, `[]`, wrong version, truncated JSON, finished game, garbage settings / language | **OK.** No Resume offered, no errors, a new game starts. | `tools/r-storage.mjs corrupt` |
| Save that parses but does not replay (illegal step, altered step, extra steps) | **OK.** Resume is offered (summary from the save), clicking it toasts `ui:error.saveIncompatible`, clears the save, the start screen stays usable, no errors (a `console.warn` names the refused step). A save from another engine build: F11. | same |
| `localStorage` throwing `SecurityError` (and also `sessionStorage`, `indexedDB`, `caches` on the page) | **OK.** Boots to Ready, a game plays to turn 1 AR 2, no errors; after a reload there is (correctly) nothing to resume. No notice that progress is not saved (acceptable). | `tools/r-storage.mjs blocked` |

### GitHub Pages readiness

| Check | Result |
|---|---|
| URLs under the base | Every request in all runs was under `/TS_playfield/` (183 logged, 0 outside, 0 404). HTML, CSS `url()`s, the worker, the ORT files, the engine and the model are all `/TS_playfield/…`. |
| MIME / compression | Pages serves `.wasm` as `application/wasm` with gzip, `.mjs` as `text/javascript` (checked live on DeepStruggle's Pages site); `.onnx` goes as `application/octet-stream`, fine for `fetch`. Both Emscripten modules (engine, ORT) fall back to ArrayBuffer compilation if streaming fails. |
| SharedArrayBuffer / COOP-COEP | Not needed: the page is not cross-origin isolated and the AI runs single-threaded in its worker. |
| File sizes | Largest 14.2 MB (ORT wasm); whole build 28.2 MB raw, 16.4 MB on the wire; far below 100 MB / 1 GB. |
| Caching | Hashed assets + Pages' `max-age=600`: a repeat visit within 10 min makes 0 requests, later all 304. The model has a content-addressed name and its own Cache Storage copy. `engine/ts_engine.{mjs,wasm}` and `cards/*` are not hashed (a deploy that changes them is picked up within 10 min; a save from the old engine then becomes unresumable, F11). |
| 404 | No `404.html`; the app has no client routes (only `?lang=`), so only mistyped URLs hit GitHub's generic 404. Acceptable. |
| Head | Title, description, theme-color OK; no favicon, no Open Graph tags (F2). |
| Dev switches | None in production: the only query parameter read is `lang` (`get("lang")`); no `__tsp`, `__tspAuto`, `autopilot`, `?ai`, `?seed`, `?auto` in `dist/`. |
| Licences | F1. |
| Deployment | No `.github/workflows` yet and `.gitignore` excludes `public/engine/` and `public/cards/`, so a Pages build from the repository must run `scripts/build-engine.sh` (emsdk) and `scripts/build-cards.mjs` (from `game_resources/`), as `docs/notes/build-deploy.md` §4 plans; `public/models/*.onnx` (5.8 MB) must be committed or fetched. Not a defect today, a reminder for the deploy step. |

### Not covered

Real phones / Safari / Firefox (container queries, `requestIdleCallback` fallback, Android's HTTP cache size for the
14 MB ORT wasm), GPU / rendering performance of the map under throttling, very long sessions (> 4 games).
