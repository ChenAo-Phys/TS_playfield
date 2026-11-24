# QA round 3: Firefox and WebKit (r3-xbrowser)

Every earlier QA run used Chromium only. This round installs Playwright's Firefox and WebKit builds on this
machine (no root), teaches the two drivers `--browser`, plays and screenshots the app in both, checks
onnxruntime-web in each engine, and tries a build-only meta Content-Security-Policy (deferred D-001).

Status: done.

**Summary.** Firefox 159 and WebKit 27.2 run on this machine next to Chromium (`source scripts/pw-env.sh`; WebKit's
40 MB of user-space libraries in `~/.local/opt/pwlibs`), and `play.mjs` / `shoot.mjs` take `--browser`. Four full
autopilot games (WebKit 1440 en USSR #13, WebKit 390 zh touch US #1, Firefox 1440 zh US #3, Firefox 1024 en touch
USSR #16) ended exactly as in Chromium with 0 fallbacks and 0 mismatches; their 13 console errors were a driver
race (fixed). onnxruntime-web runs the same SIMD single-thread build in all three, as fast as in Chromium. Layout is
the same to a few pixels in all 60 probed pages. Two app findings: **F-X1 (major)** WebKit drops the first tap on a
map box (focus raises the box by moving its node), and **F-X2 (minor)** Firefox paints the "Toss a coin" seal in the
top-left corner. The **CSP is shipped** as a build-only `<meta>`: 0 violations from the app in Chromium, Firefox
and WebKit across boot, the real AI, cards, fonts, credits, settings, language switch, reload → Resume and the
game-over telex.

## 1. Browsers on this machine

Playwright 1.65.1. `npx playwright install firefox webkit` (downloads into `~/.cache/ms-playwright`; no npm
install) gave:

| Browser | Build | Playwright dir | UA |
|---|---|---|---|
| Chromium | 159.0.8154.6 (headless shell) | `chromium_headless_shell-1255` | (unchanged) |
| Firefox | 159.0 | `firefox-1572` | `Firefox/159.0` (X11; Linux) |
| WebKit | 27.2 (WPE MiniBrowser when headless) | `webkit-2388` | `Version/27.2 Safari/605.1.15` (Macintosh UA string) |

**Firefox** needed nothing: it preloads its own NSS/NSPR from its own directory (checked in `/proc/<pid>/maps`:
`libnss3`, `libnssutil3`, `libsoftokn3`, `libfreeblpriv3`, `libnspr4` all from `firefox-1572/firefox/`), so the
older NSS that `pw-env.sh` puts on `LD_LIBRARY_PATH` for Chromium does not get in its way, despite what `ldd` on
its `.so` files suggests.

**WebKit** was missing ~25 system libraries (GTK 4, graphene, libxslt, libevent, opus, GStreamer base/gl/bad,
webp mux/demux, AVIF, harfbuzz-icu, wayland-server, manette, enchant, secret, hyphen, GLESv2, x264, libsoup 3).
Fetched without root (`apt-get download`, Ubuntu 24.04 noble/noble-updates) and unpacked with `dpkg -x` into
`~/.local/opt/pwlibs/root`, iterating `ldd` over every executable and `.so` of both WebKit bundles
(`minibrowser-wpe`, `minibrowser-gtk`) and the extracted libs until nothing was "not found". 38 packages,
40 MB unpacked:

```
libabsl20220623t64 libavif16 libcairo-script-interpreter2 libdav1d7 libenchant-2-2 libevdev2 libevent-2.1-7t64
libgav1-1 libgles2 libgraphene-1.0-0 libgssdp-1.6-0 libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0
libgstreamer-plugins-base1.0-0 libgtk-4-1 libgudev-1.0-0 libgupnp-1.6-0 libgupnp-igd-1.6-0 libharfbuzz-icu0
libhyphen0 libmanette-0.2-0 libnice10 libopus0 liborc-0.4-0t64 librav1e0 libsecret-1-0 libsoup-3.0-0
libsvtav1enc1d1 libva-drm2 libva2 libwayland-server0 libwebpdemux2 libwebpmux3 libx264-164 libxcb-xkb1
libxkbcommon-x11-0 libxslt1.1 libyuv0
```

None of these libraries exists in the system's own lib dirs (checked file by file), so adding the directory to
`LD_LIBRARY_PATH` cannot change what any other program loads.

Two more obstacles, both handled in `scripts/pw-env.sh`:

1. The WebKit bundle's `MiniBrowser` wrapper (`minibrowser-{wpe,gtk}/MiniBrowser`) *replaces*
   `LD_LIBRARY_PATH` with its own two lib dirs, so nothing from the environment reaches it.
   `pw-env.sh` patches that one line (idempotently, and again for a new WebKit build after a reinstall) to
   append the inherited path: `export LD_LIBRARY_PATH="${MYDIR}/lib:${MYDIR}/sys/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"`.
2. Playwright's pre-launch host check looks for two `dlopen()`ed libraries (`libGLESv2.so.2`, `libx264.so`) in
   the system's `ldconfig -p` cache, which a user cannot extend; it refuses to launch WebKit even though the
   libraries load fine from `LD_LIBRARY_PATH`. `pw-env.sh` sets `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`.
   This only skips the check (one "Skipping host requirements validation" line on stderr per launch).

No `GST_PLUGIN_PATH` or fontconfig change was needed: the app plays no media, WebKit starts without GStreamer
plugins, and all three browsers find the user's CJK font (`~/.local/share/fonts`) through the normal fontconfig.

**Chromium unchanged:** chromelibs stays first on the path; a Chromium page with a WebGL context maps 52
libraries in its 4 processes, none from `pwlibs` (the same six from `chromelibs` as before:
`libasound`, `libnspr4`, `libnss3`, `libnssutil3`, `libplc4`, `libplds4`).

### Per-browser differences in Playwright (probed, 390×844)

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| `hasTouch` | yes | yes | yes |
| `isMobile` | yes | yes (Playwright 1.65; older builds rejected it) | yes |
| `(hover: none) and (pointer: coarse)` with hasTouch | true | true | true |
| `touchscreen.tap` → events | pointerdown/up `touch`, touchstart, mousedown, click `touch` | same | same, but `click.pointerType` is `mouse` |
| `navigator.maxTouchPoints` with hasTouch | 1 | 0 | 0 |
| `'ontouchstart' in window` | false | false | **true even without hasTouch** |
| CDP session | yes | no | no |
| `SharedArrayBuffer` (no COOP/COEP) | undefined | undefined | undefined |

The drivers (`play.mjs`, `shoot.mjs`) take `--browser chromium|firefox|webkit` (default chromium). A touch
hold in `play.mjs` used CDP touch events; in Firefox and WebKit it is now a synthetic touch `PointerEvent`
pair on the element under the point (`HoldButton` listens to pointer events), counted as `via.synthHold`.
Requests the page drops while reloading are recognised in each engine's wording (`net::ERR_ABORTED`,
`NS_BINDING_ABORTED`, WebKit "cancelled"). The `RESULT` JSON gains `browser`.

## 2. Autopilot games (dev server, `?ai=policy`, speed fast)

Dev server with HMR off on port 5206; `play.mjs --browser … --until end --game-seed N`.

| Run | Result | Answers (input) | Fallbacks / mismatches / errors | Wall |
|---|---|---|---|---|
| Chromium 1440×900 en USSR, seed 13, to turn 2 (check after the pw-env change) | turn 2 reached, VP 1 | 38 (49 clicks) | 0 / 0 / 0 | 51 s |
| **WebKit** 1440×900 en USSR, seed 13 | final scoring, turn 10, US +7 (same as Chromium's reference run) | 287 (386 clicks) | 0 / 0 / 0 | 1092 s (Chromium: 541 s) |
| **WebKit** 390×844 zh `--touch` US, seed 1 | final scoring, turn 10, US +20 (same as Chromium's seed-1 game) | 295 (740 taps, 34 keys, 2 dialog) | 0 / 0 / 12 (driver artifact, see below) | 1120 s |
| Chromium 390×844 zh `--touch` US, seed 1 (baseline for the WebKit phone game) | final scoring, turn 10, US +20 | 295 (636 taps, 35 keys, 2 dialog) | 0 / 0 / 0 | 902 s |
| **Firefox** 1440×900 zh US, seed 3 | final scoring, turn 10, USSR +2 (VP before USSR +5; same as r2-long G1 in Chromium) | 292 (397 clicks) | 0 / 0 / 1 (driver artifact, see below) | 699 s |
| **Firefox** 1024×768 en `--touch` USSR, seed 16 | final scoring, turn 10, USSR +3 (VP before 0; same as qa-long-desktop game B) | 291 (386 taps, 2 dialog) | 0 / 0 / 0 | 539 s |

Every game ended exactly as in Chromium (the seed replays), every answer went through the real UI (0 fallbacks,
0 mismatches), and the autopilot's 1165 suggestions were all the AI's own. WebKit needs about twice
Chromium's wall time for the same game (1092 s vs 541 s, seed 13); Firefox about 1.3× (699 s vs 564 s for seed 3
in r2-long).

**The 13 errors were the driver's, not the app's (fixed in `play.mjs`).** With timestamps (new: every error carries
the log time, and a console error's `Error` arguments are spelled out, since Firefox's `text()` of
`console.error(err)` is just "Error"), the WebKit rerun (`--trace`) put all of them at 0.7 s after launch, before the
game: `play.mjs` reloads the page once at start (to apply the speed setting) while the first load's AI worker is
still fetching its modules. WebKit logs each module load it cancels in the dying worker ("Cannot load …/src/ai/rollout.ts
due to access control checks", trace: `FAILED … Load request cancelled`), and Firefox and WebKit then fire the
worker's `error` event, which the dying page reports ("the AI worker failed: could not start (module worker
unsupported?)", Firefox rerun at 2 s). Chromium drops both silently. `play.mjs` now waits for the boot line to reach
100 % before that reload; WebKit 390×844 seed 1 and Firefox 1440×900 seed 3 to turn 2: 0 errors. (Reruns of the two
full games, before the fix: same endings, same answers; WebKit 736 taps.)

Touch holds and undo in Firefox / WebKit (`--resign --undo --until 2`): WebKit 390×844 and Firefox 1024×768 touch
resigned through the synthetic touch hold (`synthHold 1`), Chromium 390×844 through CDP (`hold 1`); 0 errors each.

## 3. onnxruntime-web in each engine

Deterministic bench (`tests/ai/browser/index.html?n=20&seed=7&cancel=0` on the dev server: 20 full-strength
leaderboard-#1 decisions, AI = USSR, worker mode; a copy of `tests/ai/browser/run.mjs` with `--browser`,
`$SP/r3-xbrowser/tools/bench.mjs`):

| | Chromium 159 | Firefox 159 | WebKit 27.2 |
|---|---|---|---|
| `init` (engine + model from the Cache API + ORT session) | 232 ms | 325 ms | 246 ms |
| search compute, median / p90 / max | 796 / 4390 / 4488 ms | 801 / 4519 / 4582 ms | 722 / 4142 / 4232 ms |
| total compute (20 decisions) | 24.1 s | 24.5 s | 22.7 s |
| worker round-trip overhead, max | 2 ms | 6 ms | 3 ms |
| main thread while thinking: max timer gap, gaps > 50 ms | 19 ms, 0 | 23 ms, 0 | 93 ms, 1 |
| `crossOriginIsolated` / `SharedArrayBuffer` | false / undefined | false / undefined | false / undefined |
| WASM SIMD (`WebAssembly.validate` of a v128 module) | yes | yes | yes |
| console errors | none | none | none |

All three load the same files and nothing else: `ort-wasm-simd-threaded.wasm` + `.mjs` (the plain SIMD build,
single-threaded: `numThreads = 1`, no proxy worker, no blob worker), the engine's `ts_engine.{mjs,wasm}`, the
model once (then the Cache API). No JSEP / WebGPU / asyncify variant is requested, no worker, SharedArrayBuffer or
WebAssembly error appears in any engine. The AI is as fast in Firefox and WebKit as in Chromium: whatever makes
the autopilot games longer there (WebKit ~2×) is the UI under headless software rendering plus the driver's
round trips, not the AI (the games use `?ai=policy`).

Production preview with the real full-strength AI (section 4 runs, random human play, turn 1 + reload):

| | Chromium | Firefox | WebKit 1440×900 | WebKit 390×844 touch zh |
|---|---|---|---|---|
| boot to "Ready" (fresh profile, local preview) | 613 ms | 982 ms | 1204 ms | 1393 ms |
| AI searches in turn 1 | 32 | 33 | 33 | 29 |
| median / p90 / max | 570 / 5026 / 9108 ms | 700 / 5235 / 9039 ms | 492 / 782 / 2837 ms | 396 / 5762 / 8394 ms |

(Different random games, so only the order of magnitude compares; the bench above is the like-for-like number.)

## 4. CSP (deferred D-001): shipped as a build-only `<meta>`

`vite.config.ts` gains a small plugin (`tsp-csp-meta`, `apply: 'build'`, `transformIndexHtml`) that puts this
right after `<meta charset>` in the site's `index.html` only (not in the dev server, whose client injects inline
scripts; not in `tests/ai/browser`'s bench page, which has an inline `<style>`):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co; img-src 'self' data:;
style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

Why each part (checked in `src/` and in the built `dist/assets`):

- `script-src 'self' 'wasm-unsafe-eval'`: the engine (main thread) and onnxruntime (worker) compile WebAssembly.
  No `eval` / `new Function` anywhere in the bundle (grep of `dist/assets/*.js`), no inline script in the built page.
- `worker-src 'self'` without `blob:`: the only worker is `assets/worker-*.js`. onnxruntime's blob paths (its proxy
  worker, a cross-origin `.mjs`) are not taken: `proxy = false`, `numThreads = 1`, same-origin `wasmPaths`.
- `connect-src`: the self-hosted model, engine and ORT files, plus the Hugging Face fallback of `src/ai/index.ts`
  (`MODEL_HF_URL`, tried when the self-hosted model fails; `huggingface.co` answers 302 to a CDN host, today
  `us.aws.cdn.hf.co`, before that `cdn-lfs*.hf.co` / `cas-bridge.xethub.hf.co`: all `*.hf.co`). That fetch runs in the
  worker, and **no tested engine applies the page's meta CSP to the worker** (below), so the entry only matters for
  the inline (no-Worker) mode or an engine that lets workers inherit the page's policy. Kept for those.
- `img-src 'self' data:`: card WebPs, the map paper; `data:` for the inline favicon and one SVG `url(data:…)` in the CSS.
- `style-src 'self'` with **no** `'unsafe-inline'`: the app has no `<style>` element and no `style="…"` markup;
  React's `style` props are set through the CSSOM, which CSP does not govern. Zero `style-src` violations in all
  three engines confirms it (WebKit's two came from Playwright's screenshot, below).
- `font-src 'self'`: the self-hosted WOFF2 faces (5, plus their 5 ZH-stack faces) all reach `loaded`.
- `object-src 'none'; base-uri 'self'; form-action 'none'`: no plugins, no `<base>`, no form posts.
- Not included: `frame-ancestors`, `report-uri`/`report-to`, `sandbox` (a meta policy ignores them; Chromium warns),
  `upgrade-insecure-requests` (Pages is HTTPS anyway).

**Evidence** (`vite build` to `$SP/r3-xbrowser/dist-csp`, `vite preview --port 4206`; a production driver,
`$SP/r3-xbrowser/tools/prodplay.mjs` = `play.mjs` + a React DevTools hook to read the controller without dev
switches + a `securitypolicyviolation` listener on `document`/`window` + every console message mentioning
CSP / Refused; fresh profile; random human play against the **real full-strength AI**): boot to Ready, the
credits dialog (7 links: rules PDF, GitHub, leaderboard, Hugging Face, `fonts/OFL.txt`, `THIRD_PARTY_LICENSES.txt`,
Natural Earth), headline + action rounds, language switch to 中文 at AR2, **reload at AR3 → "Resume game"**
(save `TSP2:…`, v2) → resumed at turn 1 AR3, switch back to English at AR4, on to turn 2; then the checks.

| Run | Violations from the app | Probe: page → other origin | Probe: AI worker → other origin | Images broken | Fonts not loaded |
|---|---|---|---|---|---|
| Chromium 1440×900 en | **0** | blocked (`Refused to connect…`) | allowed (opaque) | 0 / 5 | 0 / 10 |
| Firefox 1440×900 en | **0** | blocked (`NetworkError`, CSP console error) | allowed (opaque) | 0 / 6 | 0 / 10 |
| WebKit 1440×900 en (with screenshots) | 0 (6 `style-src-elem` from Playwright's screenshots) | blocked | allowed | 0 / 4 | 0 / 10 |
| WebKit 1440×900 en (no screenshots) | **0** | blocked | allowed | 0 / 5 | 0 / 10 |
| WebKit 390×844 zh touch, US (no screenshots) | **0** | blocked | allowed | 0 / 1 | 0 / 10 |

A second round with the final build adds the settings dialog (25 controls) and a resignation (hold) → the
game-over telex with its VP chart, again with reload → Resume and the language switch: **0 violations** from the app
in Chromium, Firefox and WebKit (no screenshots), every run `status: over (resign)`, 0 broken images.

The probe (a `no-cors` fetch to the dev server's origin, after the game) proves the policy is live and the listener
works: the page's fetch is refused and counted (2 events), the worker's goes through. WebKit's six `style-src-elem`
violations came only from Playwright: `page.screenshot()` injects a caret-hiding `<style>` that WebKit's CSP refuses
(reproduced on the start screen: 0 violations before the screenshot, 2 after; 1 with `caret: 'initial'`; Chromium
and Firefox inject it without CSP). Every run: 0 fallbacks, 0 mismatches; the only console errors were the probe's.

Caveat: `'wasm-unsafe-eval'` exists from Chrome/Edge 97, Firefox 102, Safari 16. Chrome/Edge 91–96 have the
WebAssembly SIMD the AI needs but, before 97, asked for `'unsafe-eval'` to compile WebAssembly under a CSP, so the
rules engine would no longer load there (2021 browsers; not tested here). Firefox before 102 did not apply CSP to
WebAssembly at all, and Safari got SIMD only in 16.4, after `'wasm-unsafe-eval'`, so neither loses anything.

## 5. Screenshot matrix and layout in Firefox and WebKit

`shoot.mjs --browser chromium|firefox|webkit` on the same dev server within 25 minutes (7 states × 5 viewports ×
en/zh + en-XA at 1440 and 390 = 84 shots each, `$SP/r3-xbrowser/shots/<browser>/`; Chromium re-shot from the same
tree rather than compared with the older `docs/design/shots/app-*.png`). All three runs: no page errors, no
horizontal page scroll. Then a DOM probe (`$SP/r3-xbrowser/tools/geom.mjs`) per browser over 6 states × 5 viewports ×
en/zh (60 pages): rects of the map, console, slip, docks, dialogs, hand cards; text clipped by its box; buttons /
headings crossing the right edge; fonts not loaded; page scroll. And a pixel diff of each shot against Chromium's at
360 px wide (`tools/diff.mjs`), with side-by-side montages of the largest differences.

- **Geometry is the same in all three engines**: every landmark rect within 6 px of Chromium's in all 60 pages,
  same hand-card count and span, no extra clipped text, no new overflow, all web fonts `loaded` (incl. the ZH
  subsets), 0 page errors. The only DOM difference: Firefox measures the compact header's zh action-round line
  (`第 2 行动轮 · 苏联（你）`) 3 px taller than its box (CJK font metrics); nothing is cut visibly (checked by eye).
  (Chromium alone lists the en "C. America" theatre chip at 390 px as 3 px past the edge: it is in the
  horizontally scrolling chip strip.)
- **CSS features**: container queries (card captions), `:has()` (slip, card sheet), `color-mix()` (160 uses),
  vertical `writing-mode` hand spines, `clip-path`, `mask-image`, `dvh`, `inset`, line clamps, `scrollbar-width`
  render alike; the largest desktop pixel differences (≤ 7 / 255 mean) are font antialiasing, a log scrolled to a
  different line and the timing of the AI-sequence scenes. `backdrop-filter` is not used anywhere.
- **Firefox: the "Toss a coin" seal is painted in the page's top-left corner** (over "TOP SECRET · EYES ONLY" /
  "绝密 · 仅限阅览"), at every size, while its layout box is in the button: F-X2.
- **WebKit touch: the first tap on a map box is lost**: the coup scene at 390×844 and 844×390 shows no staged
  target after shoot.mjs's one tap (Chromium and Firefox stage it): F-X1.
- **Not a finding (headless WebKit only)**: Playwright's WPE WebKit ignores `backface-visibility: hidden`. A
  canonical CSS card flip (`perspective` → `preserve-3d` → two `backface-visibility: hidden` faces, the back turned
  180°) shows the *back* in every case in WebKit (static, after a WAAPI flip, under `opacity`), the front in
  Chromium and Firefox (`tools/flipmin.mjs`). So the AI's played card in the reveal dock (and the Rail /
  FlightLayer flips) show a mirrored card back in WebKit shots (`docs/qa/shots/r3-xbrowser/wk-vs-cr-ai-1024-backface-artifact.jpg`).
  Real Safari composites 3D on the GPU; this needs a check on an Apple device, not a code change.

## Findings

### F-X1 (major) WebKit touch: the first tap on a map box is swallowed

- **Repro:** dev server on PORT, from the project root:
  `source scripts/pw-env.sh && TSP_URL=http://localhost:PORT/TS_playfield/ node $SP/r3-xbrowser/tools/coup-tap.mjs webkit 390 844 3000 2`
  (chromium / firefox for comparison; the demo scene `?scene=prompt-coup-target`, phone context with hasTouch + isMobile; it waits for the map to
  settle, taps the first ringed target once, then once more). Or by hand on an iPhone / iPad: in a coup, influence
  or event-target prompt, tap a country box that the pointer has not touched yet.
- **Expected:** the first tap stages the box (Chromium and Firefox: "Coup → Burma", the box tooltip), a second
  tap commits.
- **Actual (WebKit 27.2):** the first tap does nothing; the second stages; a third commits. Event trace of the
  first tap: `pointerdown/touchstart/pointerup/touchend` → synthetic `mousedown` → the box takes focus →
  `MapView`'s `onBoxFocus` sets `focused` → `order` puts the focused box last ("front" boxes are drawn on top), so
  React **moves the box's `<g>`** (MutationObserver: removed + added) → `mouseup` → **no `click`**. WebKit's
  EventHandler forgets the pressed node when it leaves the document, so it dispatches no click; Chromium sends its
  click anyway (same trace, same move). The second tap finds the box already in front: no move, a click.
- **Evidence:** `coup-tap.mjs` traces (webkit / chromium, in this report's run); the screenshot matrix's coup scene
  at 390×844 and 844×390 (`docs/qa/shots/r3-xbrowser/wk-vs-cr-coup-390x844-first-tap-lost.jpg`); the same game
  (seed 1, 390×844 zh, US) needed 740 taps in WebKit vs 636 in Chromium (both 0 fallbacks: `play.mjs` re-taps).
  With a mouse nothing is lost (the hover raises the box before the press): the 1440×900 WebKit game needed 386 clicks
  for 287 answers, Chromium 383.
- **Scope / fix hint (MapView.tsx, not owned here):** do not reorder on a focus that comes from a finger
  (`touchPress()` is already there for the tooltip), e.g. keep `focused` out of `front` while `touchPress()`, or
  raise the box with a `<use href>` copy instead of moving the node. Whether real iOS Safari focuses the `<g
  tabindex>` on a tap the same way could not be checked here; the WebCore click logic is shared.

### F-X2 (minor) Firefox: the "Toss a coin" seal is painted in the page's top-left corner

- **Repro:** `source scripts/pw-env.sh && node src/ui/screens/demo/shoot.mjs --browser firefox --only start --url
  http://localhost:PORT/TS_playfield/ --out <dir>`, any viewport and language; or open the start screen in Firefox.
- **Expected:** the half-blue/half-red coin sits in the "Toss a coin" button, as in Chromium and WebKit.
- **Actual (Firefox 159):** the button has no coin; the coin is drawn at the viewport's top-left corner, over the
  "TOP SECRET · EYES ONLY" / "绝密 · 仅限阅览" line. Its layout box is right (getBoundingClientRect inside the button),
  only the painting is displaced.
- **Cause / fix (StartScreen.module.css, not owned here):** `.coinWrap { transform-style: preserve-3d }`. With it
  overridden to `flat` the coin paints in its box (`TSP_URL=… node $SP/r3-xbrowser/tools/coinfix.mjs`: 278 brass
  pixels in the box vs 0). The coin has a single, non-3D child, so `preserve-3d` does nothing useful there (the spin is a transform on the wrap
  itself). A minimal page with the same nesting does not reproduce it, so it takes the start screen's context.
- **Evidence:** `docs/qa/shots/r3-xbrowser/ff-coin-top-left.jpg` (Firefox 390 zh, Firefox 1440 zh, WebKit 390 zh),
  `ff-vs-cr-start-390x844-zh.jpg`.

## 6. Focus

Keyboard walk (14 × Tab) on the start screen and in the influence prompt at 1440×900, and a mouse click on a
button (`tools/focus.mjs`): the same order in all three engines (language, settings, the three sides, rules link,
credits, …; in the prompt: the focused map box, zoom, slip, hand, piles, rail), every stop matches
`:focus-visible` and draws a ring; a mouse click focuses the button without `:focus-visible` everywhere. Only
difference: Firefox also stops on the scrollable "In effect" rail section (Firefox makes scroll containers
focusable; it has a ring). Playwright's Linux WebKit tabs to buttons and focuses them on click; Safari on macOS does
neither by default (Tab skips buttons unless "Press Tab to highlight each item" is on; a click does not focus a
button), so focus restoration (D-201) is worth one look on a Mac.

## What could not be checked here

Playwright's WebKit is WPE/GTK on Linux with software rendering, not Apple's Safari: no iOS font stack, no
iOS gesture recognisers (double-tap zoom, the "content change" hover-then-click rule), no GPU compositing (hence
the `backface-visibility` artifact), no iOS soft keyboard or safe-area insets, and its UA string claims macOS.
F-X1 (WebKit's click logic) and the focus behaviour above are the two places where a real iPhone / iPad / Mac
should confirm. Firefox is the real Gecko (159), headless with software WebRender.
