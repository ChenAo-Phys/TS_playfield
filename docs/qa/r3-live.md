# QA round 3: the live site (r3-live)

Agent: r3-live. Target: **https://chenao-phys.github.io/TS_playfield/**, deployed from commit `9ae8719` (Pages run
45246962887, success, 4 m 37 s). Local comparison: `npx vite build --outDir $SP/r3-live/dist` of the same commit (the
working tree differs only in a type-only `src/game/contract.ts` change and CI/doc edits; the hashed bundle names match
the live ones: `index-DGn6jNUN.js`, `vendor-DsarOu8v.js`, `index-CMGjXzTj.css`), preview on port 4205.
Scripts and raw logs: `$SP/r3-live/` (below `$S`). Screenshots: `docs/qa/shots/r3-live/` (git-ignored).

Progress: **done** (see the end). 7 findings: 1 major, 4 minor, 2 polish; no blocker.

## 0. Deploy

* `curl -sI https://chenao-phys.github.io/TS_playfield/` → `HTTP/2 200`, `<title>Twilight Struggle Playfield</title>`;
  `gh run list --workflow pages.yml --limit 1` → `completed success … 45246962887 4m37s` (19:15 UTC). No wait needed.

## 1. Delivery

`$S/delivery.sh` fetches each file with `Accept-Encoding: gzip, deflate, br, zstd` (as a browser) and records the
headers (`$S/delivery-live.txt`); `$S/dist` vs live: **all 248 files byte-identical** (sha256 of the decoded bodies).

| File | Status | Content-Type | Encoding | Cache-Control | Transfer | Decoded |
|---|---|---|---|---|---|---|
| `index.html` | 200 | text/html; charset=utf-8 | gzip | max-age=600 | 1 039 | 2 706 |
| `assets/index-DGn6jNUN.js` (entry) | 200 | application/javascript | gzip | max-age=600 | 113 535 | 359 273 |
| `assets/vendor-DsarOu8v.js` | 200 | application/javascript | gzip | max-age=600 | 60 178 | 186 150 |
| `assets/index-CMGjXzTj.css` | 200 | text/css | gzip | max-age=600 | 14 906 | 70 003 |
| `assets/index-CT9jf-Ge.js` (map) | 200 | application/javascript | gzip | max-age=600 | 68 103 | 188 679 |
| `assets/GameScreen-Blx2j3K-.js` / `.css` | 200 | js / css | gzip | max-age=600 | 89 201 / 23 554 | 269 299 / 130 070 |
| `assets/zh-CN-C_ZMSCwM.js` | 200 | application/javascript | gzip | max-age=600 | 27 212 | 76 466 |
| `assets/worker-CiiZe1Sb.js` | 200 | application/javascript | gzip | max-age=600 | 33 911 | 99 215 |
| `assets/ort-wasm-simd-threaded-DcHrbrbl.wasm` | 200 | **application/wasm** | **gzip** | max-age=600 | **3 722 335** | 14 239 897 |
| `assets/ort-wasm-simd-threaded-qyIweqWS.mjs` | 200 | text/javascript | gzip | max-age=600 | 9 095 | 24 381 |
| `engine/ts_engine.wasm` | 200 | **application/wasm** | gzip | max-age=600 | 149 140 | 409 346 |
| `engine/ts_engine.mjs` / `engine.json` | 200 | text/javascript / application/json | gzip / – | max-age=600 | 5 231 / 170 | 17 973 / 170 |
| `models/ds-e8.1-b6soup-70b117b5.onnx` | 200 | application/octet-stream | **gzip** | max-age=600 | **5 303 789** | 5 797 418 |
| fonts (5 × woff2), `paper-*.webp`, cards (`en/001`, `en/103`, `zh/006`, `zh/110`) | 200 | font/woff2, image/webp | – (already compressed) | max-age=600 | 18–36 kB each, cards 23–34 kB | same |
| `fonts/OFL.txt`, `THIRD_PARTY_LICENSES.txt` | 200 | text/plain; charset=utf-8 | gzip | max-age=600 | 2 169 / 1 996 | 4 920 / 9 117 |

* Both `.wasm` files are `application/wasm` (streaming compile works; onnxruntime's is fetched as bytes by
  `src/ai/worker.ts` anyway). The 14.2 MB ORT wasm goes over the wire gzipped as **3.7 MB**; the model as **5.3 MB**
  (float weights barely compress). Pages serves gzip only (no brotli, no zstd).
* Every file, hashed or not, is `cache-control: max-age=600` with a weak ETag `W/"<deploy mtime>-<size>"` and
  `Last-Modified` = the deploy time (19:19:40 GMT). Revalidation works (`If-None-Match` / `If-Modified-Since` → 304,
  0 B), but the ETag changes with **every deploy** even for an unchanged file (see finding 4).
* **Not reachable** (404): `game_resources/TS_Rules_Deluxe.pdf`, `game_resources/TS_map.jpg`,
  `game_resources/card_text.json`, `src/ui/screens/demo/play.mjs`, `src/dev/autopilot.ts`, `demo.html`,
  `tests/fixtures/ui/game-full.json`, every `assets/*.js.map`, `package.json`, `vite.config.ts`, `.git/HEAD`,
  `.gitmodules`, `node_modules/.vite/`, `docs/…`, `CLAUDE.md`, `THIRD_PARTY_LICENSES.md`, `vendor/…`, `@vite/client`.
  (`src/main.tsx` and `src/ui/screens/demo/` answer **503** "Unicorn!" from GitHub's Varnish instead of 404, repeatably;
  the files are not in the artifact (`$S/dist` has no `src/`), so this is a GitHub quirk for those paths, not exposure.)
* **Bundle:** no `__tsp`, `__tspAuto`, `autopilot`, `ai=policy`, `sourceMappingURL`, `localhost`, `import.meta.env` or
  `TSP_` in any served JS/HTML/CSS; the only `?`-parameter the app reads is `lang` (removed from the address bar after
  boot). `/home/web_user` in the ORT/worker chunks is Emscripten's virtual FS default, not a leak. `chenao-phys` appears
  only in `og:url`. The root `/favicon.ico` is never requested (inline SVG icon).

## 2. First load and returning visits

`$S/load.mjs` (Chromium 1.65 headless, a fresh incognito context per cold run; CDP `Network.emulateNetworkConditions`
on the page **and on the AI worker** through `Target.setAutoAttach`, checked: the worker's downloads slow down too).
Fast 4G = 9 Mbps down / 1.5 up / 170 ms; Slow 4G = 1.6 / 0.75 / 150 ms. Phone = 390×844, touch, isMobile, DPR 3.
Ready = the boot line's bar at 100 ("Ready"). Logs: `$S/load/*.json`.

| Run | First paint (FCP) | Boot line shown | Side folders enabled | **Ready** | Transfer | Requests | Errors |
|---|---|---|---|---|---|---|---|
| Desktop 1440×900, unthrottled, cold | 0.25 s | 0.21 s | 0.31 s | **0.72 s** | 9.70 MB | 22 | 0 |
| Desktop, warm reload | 0.21 s | 0.13 s | 0.13 s | **0.34 s** | 0 B | 21 (all cache) | 0 |
| Desktop, Fast 4G, cold | 0.72 s | 0.67 s | 1.29 s | **10.15 s** | 9.73 MB | 22 | 0 |
| Desktop, Slow 4G, cold | 1.75 s | 1.69 s | 3.86 s | **49.9 s** | 9.73 MB | 22 | 0 |
| Phone 390×844, unthrottled, cold | 0.27 s | 0.23 s | 0.35 s | **0.99 s** | 9.70 MB | 22 | 0 |
| Phone, warm reload | 0.21 s | 0.13 s | 0.13 s | **0.44 s** | 0 B | 21 | 0 |
| Phone, Fast 4G, cold | 0.71 s | 0.74 s | 1.25 s | **10.02 s** | 9.73 MB | 22 | 0 |
| Phone, Fast 4G, warm reload | 0.36 s | 0.28 s | 0.28 s | **0.59 s** | 0 B | 21 | 0 |
| Phone, Slow 4G, cold | 1.72 s | 1.70 s | 3.84 s | **49.9 s** | 9.73 MB | 22 | 0 |

* **What blocks Ready** (Fast 4G waterfall): `index` + `vendor` JS (0.23–0.63 s) → map + GameScreen chunks
  (0.67–1.06 s) → the page's `ts_engine.wasm` (0.87–1.18 s; the side folders enable here) → the AI worker starts at
  1.38 s and downloads **onnxruntime's wasm (3.72 MB, 1.40–8.18 s) and the model (5.31 MB, 1.40–9.60 s) in parallel**
  → `ort-wasm-simd-threaded.mjs` (9 kB, 9.66–9.84 s) → session start → Ready 10.0–10.2 s. The two downloads are 93 % of
  the bytes, so Ready ≈ 9.7 MB ÷ bandwidth + ~1.4 s. On Slow 4G the big downloads only start at 4.1 s.
* **What the player sees** (`$S/load/phone-slow4g-montage.jpg`): a dark page until 1.7 s, then the start screen with
  the side folders (enabled from 3.8 s) and the boot line counting the model "AI MODEL 0.9 / 5.8 MB … 4.9 / 5.8 MB"
  (a sample every ~0.2 s on Fast 4G, so it visibly moves), "VERIFY ✓", "START AI ✓", "READY", with the note "The first
  visit downloads about 10 MB (the AI model is 5.8 MB of it); your browser keeps it for next time." (accurate: 9.7 MB).
  The ORT download has no counter of its own but runs in parallel and ends before the model.
* **Starting before Ready** (`$S/early.mjs`, phone Slow 4G, side pressed at 3.8 s): as the **USSR** the setup prompt
  is up at once and the player places influence while the AI downloads. As the **US** the slip reads "GETTING THE AI
  READY… N%" for 46 s, then the AI sets up (≈ 4 s) and the US prompt comes at 56 s. Two problems there: finding 2.
* **Warm reload / new tab in the same profile:** 0 bytes; every request is served from the HTTP cache, and the model
  is not requested at all: the worker reads it from Cache Storage `ts-playfield-models-v1` (one entry,
  `https://model-cache.invalid/sha256/70b117b5…`, 5 797 418 B; `navigator.storage.estimate().usage` 5.8 MB) and
  reports `fromCache: true` (0.39 s to load the AI).
* **Returning visit after the 10-minute `max-age`** (`$S/revisit.mjs`, a persistent profile, first visit 19:32, revisit
  19:46, same deploy): 21 conditional requests answered 304 (≈ 2 kB in all), the model again from Cache Storage, Ready in
  0.70 s. **After a new deploy** every ETag and Last-Modified changes (they carry 19:19:40 = the moment `deploy-pages`
  unpacked the artifact; the build's own files were written at 19:19:14–18), so the revalidation of every unchanged file
  returns a full 200: finding 4.

## 3. Playing on the live site (full-strength AI)

Driver: `$S/live-play.mjs` = the committed `src/ui/screens/demo/play.mjs` (9ae8719) patched by `$S/patch-live.py`, with
round 2's `prod-hooks.js` injected by `addInitScript` (a React DevTools hook hands the harness the controller to *read*
the prompt and choose what to click; Worker wrapper times every AI decision). Every answer goes through the real UI
(clicks / taps / holds); `--policy random` (exercises coups, realignments, events, scoring cards); extras: Settings, About
(`$S/extras.mjs`), language switch, reload → Resume, resign → result telex → New game. The live site has no dev hooks
(`window.__tspAuto` absent, no `?ai`, no `?seed`).

| Session | Viewport / input / lang | Side | Speed | Played | Answers | Exercised | Fallbacks / mismatches | Console errors / failed requests | Hosts contacted |
|---|---|---|---|---|---|---|---|---|---|
| D1 | 1440×900, mouse, en | USSR | normal | T1–T2, to the start of T3 (236 s) | 47 (75 clicks, 1 hold) | headline, coup, realign, event, scoring card, Continue, lang en→zh→en, reload → Resume, Settings, About, resign, New game | 0 / 0 | 0 / 0 (no 4xx/5xx) | `chenao-phys.github.io` only (137 requests) |
| P1 | 390×844, touch, isMobile, zh | US | fast | T1–T2, to the start of T3 (263 s) | 64 (124 taps, 1 hold) | headline, coup, realign, event with targets, scoring card, Continue, lang zh→en→zh, reload → Resume, Settings, About, resign, New game | 0 / 0 | 0 / 0 | `chenao-phys.github.io` only (115) |

* **AI decision times** (after the reload; this machine, an i9 shared with other agents, headless): D1 23 decisions
  (all from the full `search`, none a fallback), median **0.82 s**, p90 6.9 s, max **9.7 s**
  (belief search, 45 k rows); P1 21 decisions, median **0.74 s**, p90 6.3 s, max **7.3 s**. Telex totals: D1 "2 min · 57
  decisions", P1 "2 分钟 · 71 次决策". "Still thinking · 8 s / 9 s" showed on D1's two decisions over 8 s; the 20 s hint
  never came (no decision reached 20 s); AI ready after the reload from Cache Storage in 0.39 / 0.53 s (`fromCache`).
* **Reload → Resume** (D1 at T2 AR1, P1 at T2 AR1): the start screen offers "RESUME GAME · Turn 2 · AR 1 · you are the
  USSR · this minute" / "继续对局 · 第 2 回合 · 第 1 行动轮 · 你执美国 · 此刻"; after Resume the state (turn, AR, VP,
  DEFCON, influence, both hands, the open prompt and its option count) is identical to the one before the reload.
* **Language switch** in game (D1 by the console toggle 0.46 s / 0.32 s; P1 through ☰ → 语言, 2.1 s including closing
  the auto-opened hand drawer): the whole UI and the card images follow; no raw i18n keys; the zh catalog chunk (27 kB)
  loads on demand.
* **Settings** (D1 a centred 600×617 dossier, P1 a full-screen 390×844 sheet): language, card images, animation speed,
  motion, confirm-before-ending-the-play, pause on headlines and scoring, map labels, side patterns, follow the action;
  nothing overflows horizontally and no control is outside the viewport, in en and zh.
* **About & credits** (D1 640×731 dossier; P1 full screen, from the start screen's footer, `$S/phone-about.mjs`): all 7
  links answer 200 (checked by request: GMT living rules → `application/pdf`; DeepStruggle on GitHub; the leaderboard;
  the model on Hugging Face; `fonts/OFL.txt` and `THIRD_PARTY_LICENSES.txt` on the site; Natural Earth), open in a new
  tab (`target=_blank rel=noopener noreferrer`; a real click on "Third-party licences" and a real tap on "DeepStruggle
  排行榜" opened them). The menu's "Rules (GMT living rules)" is the same PDF link; the rulebook is not hosted. On the
  phone the links are 18 px tall: finding 7.
* **Resign → result → New game:** hold-to-resign works with mouse and touch; the telex reads "US VICTORY · The USSR
  resigned · FINAL VP US +12 · ENDED Turn 3 · COUPS US 3 · USSR 1" / "苏联胜利 · 美国认输。· 最终 VP 苏联 +6 …" with
  the VP chart and NEW GAME / REVIEW BOARD / FULL LOG; New game returns to the start screen (no Resume for the finished
  game). There the boot line is wrong: finding 1. A second game started from that screen plays normally (the AI's
  USSR setup came 7.2 s after the side was picked).
* Nothing else looked wrong in the screenshots taken (`docs/qa/shots/r3-live/desk/`, `…/phone/`: menu, settings,
  about, resume start screen, both language states, telex, the start screen after New game). Transient: a game toast
  (the draw-pile reshuffle notice, "抽牌堆耗尽：弃牌堆已洗入…" on the phone) sat over the top of the About dossier for a few seconds at
  the start of turn 3.

## 4. Shared origin (`chenao-phys.github.io`)

Keys the app uses (bundle grep + after both sessions): localStorage `ts-playfield.ui.v1` (settings, written once one is
changed), `ts-playfield.game.v1` (the save, `TSP2:…`), `ts-playfield.probe` (written and removed at boot), **`tsp.lang`**
(written on a language switch); sessionStorage `ts-playfield.aiSlowHint`; Cache Storage `ts-playfield-models-v1` (one
entry keyed by the model's sha256; pruning only touches this cache's own keys). No IndexedDB, no cookies, no service
worker; nothing iterates or clears the origin's storage. Only `tsp.lang` is outside the `ts-playfield.` prefix:
finding 6.

`$S/shared.mjs`: first opens a non-existent path on the same origin and seeds unrelated data (`theme`, `lang`,
`tsp`, a 100 kB `other-app.state`, a sessionStorage key, a Cache Storage cache `other-site-v1` with an entry, an
IndexedDB database), then loads the app, starts a game as the USSR and plays the setup:

* **Plain** (`$S/shared/plain.json`): Ready in 1.0 s, English (a foreign `lang=de` is ignored), the game is saved
  (`TSP2:…`), every foreign key, the foreign cache and the database are untouched; after a reload the save is
  resumable. No error from the app.
* **Foreign localStorage at the quota** (5.14 MB of other sites' data, `$S/shared/full.json`): the app boots and plays
  (Ready 0.7 s), but **no save is written and nothing tells the player**; after a reload there is no Resume: finding 5.

## 5. Live vs a local build of the same commit

`$S/dist` (built from the working tree at 9ae8719 plus a type-only `contract.ts` edit) is byte-identical to the live
site (248 files). With `vite preview --port 4205`: the New game boot line (`$S/probe-local/`) and the early-start slip
(`$S/load/early-US-local-fast4g.json`) behave exactly as live, so findings 1 and 2 are app problems, not deploy
problems. Locally (preview serves the 14 MB ORT wasm uncompressed, 20.7 MB in all) the early-start slip even sits at
"GETTING THE AI READY… 50%" for 8 s while onnxruntime's wasm finishes; live the gzipped wasm ends first, so 50 % only
flashes. The `503` answers for `src/main.tsx` / `/some-other-site/` and the 9.7 MB transfer are deploy-side (GitHub).
The preview on 4205 was stopped; no browser left open.

## Findings

### 1. After "New game" the start screen's boot line is stuck at "AI MODEL", 15 %, with the first-visit note (major)

* **Repro (live, en and zh, desktop and phone):** open the site, wait for Ready, pick a side; ☰ → Resign (hold) → in the
  result telex press **New game**. Or, during a game, ☰ → New game → "Abandon this game?" → New game.
* **Expected:** the boot line says Ready (the AI is loaded and stays loaded; the second game's AI answers at once).
* **Actual:** "> LINKING WITH DEEPSTRUGGLE · RULES ENGINE ✓ · AI MODEL · VERIFY · START AI", bar at 15 %
  (`aria-valuenow="15"`), and "The first visit downloads about 10 MB (the AI model is 5.8 MB of it); your browser keeps
  it for next time." / "首次访问约需下载 10 MB…" — it never moves (sampled 6 s; `vm.load` stays undefined, so nothing
  can move it). It reads as a stalled 10 MB download after every game. The side folders work and the next game plays
  normally. Same on the local build of the commit.
* **Evidence:** `$S/probe/probe.json` (live), `$S/probe-local/probe.json` (local), screenshots
  `docs/qa/shots/r3-live/desk/after-new-game.jpg`, `docs/qa/shots/r3-live/phone/after-new-game.jpg`,
  `$S/probe/probe-after-telex-newgame.jpg`, `$S/probe/probe-after-menu-newgame.jpg`.
* **Cause:** `src/ui/screens/StartScreen.tsx` `useAiReady()` keeps "progress was seen" in a `useRef`, i.e. per mount.
  The start screen mounts again after a game, sees no load progress (the AI is already up), so `ready` stays false and
  `bootProgress()` (`BootLine.tsx`) falls to its default `{ step: "model", bar: 0.15 }`.
* **Fix:** keep the flag for the page, not the mount: a module-level `let aiLoaded = false` that `useAiReady` sets when
  progress was seen and `vm.load` cleared without an error (and resets on `status === "error"`), or a controller fact
  (`vm.aiReady`, an additive contract request). Add a shell test: mount, load, unmount, mount again with
  `load: undefined` → "Ready".

### 2. Starting before the AI is ready: the slip counts the download as thinking and spends the one-time slow-device hint on it (minor)

* **Repro (live):** a cold visit on a slow connection (phone, CDP Slow 4G; also Fast 4G), pick **United States** as
  soon as the folders enable (3.8 s), before "Ready".
* **Expected:** "GETTING THE AI READY… N%" with a steadily rising number; "Still thinking" and the "can take up to a
  minute per move" hint only for a real AI decision.
* **Actual:** from 8 s after the click the slip adds "Still thinking · 8 s" under "GETTING THE AI READY… 14%", and at
  20 s "Still thinking · 20 s. At full strength the AI can take up to a minute per move on this device." while it is
  still downloading (36 %); the count runs on to 47 s. The hint is false (it is the network, not the device) and, being
  once per session (`sessionStorage ts-playfield.aiSlowHint`), it is used up, so it does not come for a genuinely slow
  decision later. The percentage also jumps back from 98 % to 50 % when the download ends (the slip shows the raw
  `vm.load.fraction`, which restarts at each stage; on the local preview it sat at 50 % for 8 s).
* **Evidence:** `$S/load/early-US.json` (live, Slow 4G), `$S/load/early-montage.jpg` (8 s / 20 s / USSR),
  `$S/load/early-US-local-fast4g.json` (local).
* **Fix:** `src/ui/prompts/OrdersSlip.tsx` `AiBody`: compute `loading` first and gate the note on it
  (`const long = thinking && wait.still && !loading;`, so no count and no hint claim while loading); start the wait
  clock when the load ends (reset the prompt store's `aiSince` when `vm.load` clears, `src/ui/prompts/aiWait.ts` /
  `useAiWait`); show a monotonic percentage, e.g. `Math.round(bootProgress(vm.status, vm.load, false).bar * 100)` from
  `BootLine.tsx`, instead of `vm.load.fraction`. (As the USSR the player places the setup while the AI downloads, so
  only the US side waits.)

### 3. First visit: 9.7 MB and 10.0–10.2 s to Ready on Fast 4G, 50 s on Slow 4G (minor, performance)

* **Repro:** cold cache, `$S/load.mjs --throttle fast4g` (desktop and phone), `--throttle slow4g`.
* **Expected:** under ~10 s to Ready on Fast 4G (the round-3 bar).
* **Actual:** Ready at 10.15 s (desktop) / 10.02 s (phone) on Fast 4G, 49.9 s on Slow 4G; 9.73 MB, of which
  onnxruntime's wasm (3.72 MB gzipped, 14.2 MB raw) and the model (5.31 MB) are 93 %. The side folders are usable from
  1.3 s / 3.8 s, so a USSR player starts at once; a US player waits for the AI (with finding 2's slip).
* **Also:** the AI's downloads only start after the page's own engine has loaded (`src/game/controller.ts` `boot()`
  calls `ensureAi()` after `loadEngine()`): at 1.38 s on Fast 4G, 4.1 s on Slow 4G.
* **Evidence:** `$S/load/desk-fast4g.json`, `phone-fast4g.json`, `desk-slow4g.json`, `phone-slow4g.json`.
* **Fix:** (a) start `ensureAi()` together with `loadEngine()` in `GameController.boot()` (the worker fetches its own
  copy of the 0.15 MB engine; today that is a cache hit because the page's came first), which moves both big
  downloads ~0.7 s (Fast 4G) to ~2.4 s (Slow 4G) earlier and should bring Fast 4G under 10 s; (b) the real lever
  is the 14.2 MB onnxruntime wasm: a reduced-operator
  onnxruntime-web build containing only the model's operators (a build change in `scripts/`, outside this QA's
  measurement). Shrinking the model itself (fp16 / quantisation) would change its outputs, so that is an owner
  decision, not recommended here (CLAUDE.md: full strength, the leaderboard model).

### 4. Returning visitors re-download ~4.4 MB after every deploy (minor, performance)

* **Repro:** inferred from the headers: every file's `ETag` is `W/"<time>-<size>"` and `Last-Modified` the same time,
  19:19:40, the moment `deploy-pages` ran (the build wrote the files at 19:19:14–18, `gh run view 45246962887`). Within a
  deploy a revisit after the 10-minute `max-age` costs 21 × 304 (≈ 2 kB, `$S/load/revisit.json`); after the next deploy
  the same conditional requests get full 200s for unchanged files.
* **Expected:** an unchanged, content-hashed file is not downloaded again.
* **Actual:** the model is safe (Cache Storage, keyed by sha256), but onnxruntime's wasm (3.72 MB), the JS/CSS (≈ 0.45
  MB), the fonts and `ts_engine.wasm` (0.15 MB) come again: ≈ 4 s on Fast 4G, ≈ 21 s on Slow 4G, after every push.
* **Fix:** keep onnxruntime's wasm in Cache Storage like the model: in `src/ai/worker.ts`, look up `ORT_WASM_URL` (a
  content-hashed name) in a `ts-playfield-runtime-v1` cache before `fetch`, `put` it after a download, delete other
  keys. (Touching file mtimes in CI would not help: Pages stamps the deploy time itself.) A service worker would do the
  same for every asset but is a bigger change.

### 5. Shared origin: when other sites have filled localStorage, the game is silently not saved (minor)

* **Repro:** `$S/shared.mjs <site> full`: other paths of `chenao-phys.github.io` fill the origin's localStorage (5.14
  MB); open the site, start a game, play; reload.
* **Expected:** the player is told the game cannot be saved (or it is saved elsewhere).
* **Actual:** no save (`ts-playfield.game.v1` absent), no toast, no Resume after the reload: `browserStorage()`'s boot
  probe or `writeSave()` fails and both swallow the error (`src/game/persistence.ts`). Everything else works.
* **Evidence:** `$S/shared/full.json`, `$S/shared/full.jpg`.
* **Fix:** the working tree already adds `ViewModel.saveUnavailable` (D-203, `src/game/contract.ts`), which covers this;
  it is not in the deployed commit. Optionally save to IndexedDB, whose quota is not localStorage's 5 MB.

### 6. `tsp.lang` is the one storage key outside the `ts-playfield.` namespace (polish)

* **Where:** `src/i18n/index.ts` `STORAGE_KEY = "tsp.lang"`; all other keys are `ts-playfield.*` (and the cache
  `ts-playfield-models-v1`).
* **Why it matters:** the origin is shared with every Pages site of the account; a short generic key is the kind another
  site could use (it would then pick our language, or we theirs). A foreign `lang=de` / `tsp={…}` did not disturb the
  app (`$S/shared/plain.json`).
* **Fix:** `STORAGE_KEY = "ts-playfield.lang"`, reading `tsp.lang` once as a fallback and removing it.

### 7. Phone: the About dossier's links are 18 px tall (polish)

* **Repro:** 390×844 touch, start screen footer → 关于与致谢; `$S/phone-about.mjs`.
* **Expected:** coarse-pointer targets ≥ 44 px (round 1's Q-048 rule, as for the sheets and chips).
* **Actual:** the 7 links are inline text 18 px tall, two to a line (e.g. "DeepStruggle 排行榜" 137×18 px); they work
  (a tap opened the leaderboard).
* **Fix:** in `src/ui/screens/AboutDossier.tsx`'s link list (its CSS module), under `@media (pointer: coarse)` give
  `li a` `display: inline-flex; align-items: center; min-height: 44px`, one link per line.

## Other observations (not filed)

* On a warm load the boot line shows "AI MODEL 0.0 / 5.8 MB" and the first-visit note for ~0.4 s before Ready, though
  nothing is downloaded (the model comes from Cache Storage).
* GitHub answers some non-existent paths with `503` ("Unicorn!") instead of `404` (`src/main.tsx`, `/some-other-site/`
  once); nothing of ours.
* Pages serves gzip only; brotli would cut the ORT wasm further but is not available on Pages.

## Coverage

* Delivery: 32 representative files with full headers, all 248 files hashed against the local build; 27 forbidden /
  dev paths probed; the bundle grepped for dev hooks.
* First load: 9 runs (desktop / phone × unthrottled / Fast 4G / Slow 4G, cold, plus 3 warm reloads), 2 early-start runs
  (US / USSR on phone Slow 4G) + 1 local, a persistent-profile revisit after cache expiry.
* Play: 2 live sessions with the full-strength AI (desktop en USSR, phone zh US), 111 answers through the real UI,
  2 turns each, every feature asked for (headline, coup, realignment, events, scoring card, reload → Resume, language
  switch both ways, Settings, About + all links, resign → telex → New game), plus a New game probe on live and local.
* Shared origin: 2 runs (foreign keys; localStorage at the quota).
* Not covered: real devices / real networks (all throttling is CDP emulation), browsers other than Chromium (another
  agent's area), a full game to turn 10 on the live site, the effect of an actual redeploy (finding 4 is inferred from
  headers and run timings).

Progress: **done.** Preview 4205 stopped, no browser left open. Scripts: `$S/delivery.sh`, `$S/load.mjs`,
`$S/early.mjs`, `$S/revisit.mjs`, `$S/live-play.mjs` (+ `patch-live.py`, `prod-hooks.js`, `extras.mjs`),
`$S/newgame-probe.mjs`, `$S/shared.mjs`, `$S/phone-about.mjs`, `$S/montage.mjs`.
