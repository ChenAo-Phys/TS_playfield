# QA: hidden information, cheating and static-site security (qa-hidden-info)

Scope: ways the human can learn hidden information (the AI's hand, the deck order, the AI's face-down headline, future
rolls) or cheat through the UI and ordinary browser features, plus security of the static site. Code review and runtime
probing on the dev server (port 5186, `TSP_NO_HMR=1`) and a production build (scratch dir, preview port 4186).

Scratch dir (scripts, logs, large screenshot sets):
`$SP/qa-hidden-info`

Progress: complete. F1-F5 confirmed (each reproduced at least twice or deterministic across two runs); checks without findings listed below.

## Findings

### F1. Coup-odds tooltip shows "ends the game" on every die when the AI holds a scoring card it can no longer play (blocker: hidden-information leak)

- **What leaks:** whether the AI's hidden hand holds a scoring card at the end of the turn. When the human's coup is
  the last action of the turn (the AI has no plays left), every die in the coup tooltip's odds strip is drawn as
  "boom" (hazard stripes, aria-label "Die: N, ends the game") if, and only if, the AI holds a scoring card. The human
  learns this one action before the turn end makes it public.
- **Cause:** `computeCoupOdds` (src/game/previews.ts, ~line 479) sets `endsGame: E.isTerminal()` after stepping the
  coup on the real, unredacted engine. When nothing else is left in the turn, the engine runs on through the turn-end
  held-scoring check with the AI's real hand. `attachPreviews` filters endings to `PUBLIC_ENDINGS` and drops endings
  reached through hidden information, but `computeCoupOdds` has no such filter. The file header and logic.md
  ("held scoring, final scoring are never previewed") say this must not happen. `CountryTooltip.tsx` (line 56) draws
  `face.endsGame` as `boom`. The same function serves the Che / Ortega event coups.
- **Repro (browser, dev server):**
  `node <scratch>/tools/coup-boom.mjs http://localhost:5186/TS_playfield/ 8 <shotsDir>` (1440×900, en, US, `?ai=policy&seed=8`).
  The script plays to the US's coup at turn 1, AR 6 (Defectors for a 2-Op coup, DEFCON 4, the USSR has 1 card left).
  It hovers Syria (22) and gets `fail fail ok ok ok ok`. It then swaps one AI card for Europe Scoring (#2; debug, hand size
  unchanged) and hovers Iraq (24): `boom ×6`. A control on the same page engine checks Iraq both ways: `ffffss` with
  the hand as dealt, `BBBBBB` with the scoring card. Ran twice, same result.
- **Natural occurrences (no debug edit):** `node <scratch>/tools/node-probes.mjs 30 both` runs 30 games through the
  real controller with the tests' random AI. Probe A1 found 4 last-action coups with no scoring card in the human's
  hand. In 2 of them (games 8 and 18) the AI held a scoring card, and every die already showed `endsGame` before any
  debug change. Two runs gave identical output (`node-probes-1.json`, `node-probes-2.json`).
- **Only this hover leaks:** `node <scratch>/tools/node-warn-probe.mjs 30` repeats the swap at every human prompt of
  the last action of a turn: 98 prompts, 1,235 options. `endingOutcomes` and `attachPreviews` (warnings and
  `endsPlay`) never changed, so the option warnings are clean.
- **Expected:** `endsGame` only for endings in `PUBLIC_ENDINGS` that follow from public facts and the forced die
  (DEFCON, Wargames, VP 20 …), never the held-scoring or final-scoring check, which depend on hands.
- **Actual:** see the screenshot: "Success 2/6" with all six dice striped as game-ending at DEFCON 4.
- **Evidence:** `docs/qa/shots/qa-hidden-info/coup-odds-held-scoring-s8.jpg`
- **Practical impact:** small. With the full-strength AI it needs an AI that is stuck with a scoring card (two
  scoring cards and one action round left, one received late, or a trap). It is still a direct leak of the AI's hand,
  and the fix is local: classify the terminal state the way `attachPreviews` does (`classifyEnding` ∈
  `PUBLIC_ENDINGS`, and not reached through the turn-end hand check). Otherwise report `endsGame: false`.
- **Files:** src/game/previews.ts (`computeCoupOdds`), src/ui/prompts/CountryTooltip.tsx (renders it).

### F2. A second tab (or "Duplicate tab") shows the next die roll and the AI's reply before you commit: save-scumming with no tools (blocker: hidden-information leak / cheat)

- **What leaks:** future die rolls, the next cards drawn and the AI's replies, before the human commits to a move.
  All randomness comes from `rng_state`, which is fixed by the saved `seed` plus the moves so far (DS engine draws and
  dice come from `Prng::random_index(state.rng_state, …)`). The AI is deterministic too (seed
  `(steps+1)*1_000_003`). So a second copy of the game at the same position rolls exactly the same next die, whatever
  the move.
- **How:** play to any decision, for example a coup target. Open the site in a second tab (Ctrl+click the address,
  "Duplicate tab", or just open the URL again) and press Resume. Make the move in tab B and watch the die, the draw or
  the AI's answer. Go back to tab A, which is still open at the same prompt and fully usable, and choose with that
  knowledge. Tab A then overwrites the save, so tab B's trial leaves no trace. Nothing notices: there is no `storage`
  listener, BroadcastChannel or Web Lock anywhere in src (`grep -rn "storage\"\|BroadcastChannel\|navigator.locks" src`
  finds nothing).
- **Repro (script, dev server, 1440×900, en):** `node <scratch>/tools/two-tabs.mjs http://localhost:5186/TS_playfield/ 21 USSR`
  gives: tab B coups country 0 and rolls **3**; tab A (prompt still open) coups country 1 and rolls **3**.
  `node <scratch>/tools/two-tabs-2.mjs http://localhost:5186/TS_playfield/ 5 US` gives: tab B coups 22 and rolls
  **6** (success); tab A coups 23 and rolls **6**. After A's move the save holds A's coup (`[5,23,0,0]`) and tab B
  keeps playing its own copy. No page errors in either tab.
- **Expected:** one live copy of a game. When another tab resumes (or writes) the saved game, the older tab stops
  accepting moves ("This game was continued in another tab", with Reload/Resume). Possible ways: a Web Lock held while
  playing, or a BroadcastChannel / `storage` event that compares the save's step count with the tab's own. A page restored
  from the back/forward cache would be the same stale copy in one tab (`pageshow` with `persisted`). I did not observe
  it: in headless Chromium on the dev server, Back reloaded the page instead (`bfcache.mjs`).
- **Actual:** both tabs stay live, and either one can commit after seeing the other's outcome.
- **Note:** reading the RNG out of the save with DevTools can't be fully prevented (see F4). This finding is about
  the no-tools path that any player can stumble on.
- **Files:** src/game/controller.ts (resume / save / `drive`), src/game/persistence.ts, src/ui/App.tsx (a "taken over
  in another tab" state).

### F3. Forced AI card choices from its hidden hand are instant: Quagmire / Bear Trap escape and UN Intervention leak the hand by timing (major)

- **What leaks:** whether the AI had a choice, and so what else is in its hand.
  - **Quagmire / Bear Trap:** when the trapped AI has exactly one card worth 2+ effective Ops (action_mask.cpp: scoring
    cards are not eligible while a 2-Op card is held), the discard is applied at once. There is no THINKING status in
    the adversary dossier and no 600 ms minimum. The human learns that every other card in the AI's hand is a 1-Op card
    or a scoring card.
  - **UN Intervention:** when the AI plays UN Intervention, the card it pairs with is chosen at once if it holds exactly
    one card with the human's Event. The human learns that it holds no other such card.
- **Cause:** `drive()` (src/game/controller.ts ~531-543) auto-plays every forced AI step at once and pads only
  `TIMING_PADDED_CARDS` = {10 Blockade, 49 Missile Envy, 95 LADC} (src/game/rules.ts:21). A real AI decision always
  shows `aiThinking` for at least `MIN_DELAY_MS` = 600 ms, so the difference shows in the rail
  (`useRailData`: waiting → playing instead of waiting → thinking → playing) and in the slip.
- **Repro:** `node <scratch>/tools/node-probes.mjs 30 both` (real controller, the tests' random AI, sleeps recorded).
  Probe A2 lists forced AI `SELECT_CARD` steps whose legal set comes from the AI's own hand:
  - game 1 (AI = US, Quagmire): turn 5, AR 6 (card 53) and AR 7 (card 37), legal = 1, **not padded**;
  - game 19 (AI = US, turn 9 AR 4, UN Intervention + #104) and game 28 (AI = USSR, turn 3 AR 5, UN Intervention + #105):
    legal = 1, **not padded**;
  - for comparison, Blockade (games 7, 13) and Missile Envy (games 16, 29), legal = 1: padded.
  Two runs, identical (`node-probes-1.json`, `node-probes-2.json`).
- **Expected:** every forced AI decision whose legal set depends on the AI's unseen hand looks like a real decision:
  `aiThinking` on, padded with `paddingMs()`. The simplest rule is to pad every forced AI `SELECT_CARD` step except
  the ones whose options are public (Star Wars / SALT from the discard pile, Aldrich Ames from the human's revealed
  hand), or to add 32 and the trapped action-round case to the padded set.
- **Actual:** instant, with no thinking state.
- **Files:** src/game/controller.ts (`drive`), src/game/rules.ts (`TIMING_PADDED_CARDS`), src/ai/config.ts
  (`SENSITIVE_RESOLVING_CARDS`, the same list).

### F4. The autosave is plain JSON that names the AI's face-down headline and holds the seed (owner decision)

- **What a reader of localStorage learns** (DevTools → Application → Local Storage, `ts-playfield.game.v1`; no code
  needed for the first point):
  - **The AI's headline before the reveal.** At the human's headline prompt the AI (as US it picks first) has already
    committed, and its choice is the last saved step: `steps.at(-1) = [1, <card id>, 0, 0]`. Seen in the browser at all
    3 USSR headline prompts of `dom-scan.mjs … 31 USSR en` (cards 23, 25, 3) and 1 of `… 32 USSR zh` (card 3). The
    Node probe A3 found it at 67 of 67 face-down headline prompts.
  - **The seed** (`seed`, a 53-bit integer) and every move. With the site's own engine (`/engine/ts_engine.wasm` is
    public), replaying them gives the AI's whole hand, the deck and all future dice (every draw and roll comes from
    `rng_state`).
  - Editing the save on resume is checked only for format and legality (`readSave`, then replaying through
    `E.step`). Any edited move list that replays legally is accepted, AI moves included. Flipping `humanSide`
    works: on the production preview, a turn-2 USSR save with `humanSide: "US"` resumes with the human playing the
    US mid-game, holding what was the AI's hand (`tamper.mjs`, variant `flippedSide`). `fingerprint` is checked;
    `modelSha256` and `search` are stored but not checked, which is harmless because the AI config is fixed in code.
  - **Without the save:** in the production build the controller can be reached from the DevTools console through
    React's fiber tree (`#root.__reactContainer$…`, 6 fibers deep, `prod-fiber.mjs`). Its public
    `engineForDiagnostics.display()` then returns the whole unredacted state, including the AI's 8 card ids. This
    is expected in a client-side game; it is listed only so the owner knows how short the path is.
- **Why it is an owner decision:** a static, client-side game must keep the engine state (or seed + moves) to resume,
  so a determined player with DevTools can always recover it. Options, cheapest first:
  1. Do nothing, and say on the About page that the AI plays fair but the browser can't hide its hand from DevTools.
  2. Don't save an AI step that isn't public yet. Keep the AI's face-down headline in memory only; on resume the
     AI picks again with the same seed and should get the same card. The AI seed is `(steps+1)*1_000_003`, and
     Node replays match the browser exactly in policy mode; check this for the full search before relying on it.
     This removes the zero-effort leak (reading the headline id) at little cost.
  3. Obfuscate the save (for example XOR with a per-build key plus base64, and a checksum). This stops casual reading
     and editing, not a determined user.
  4. Re-key the RNG from fresh entropy at each human decision and save `rng_state` instead of only the seed. This
     makes future dice unknowable from the save, but needs engine changes (the 64-bit RNG state, `rng_state` in
     `saveJson`) and makes undo and replay more complex.
- **Files:** src/game/persistence.ts, src/game/controller.ts (`save`, `resume`).

### F5. No Content-Security-Policy, and the GitHub Pages origin is shared (polish)

- `dist/index.html` has no `<meta http-equiv="Content-Security-Policy">`. GitHub Pages can't send headers. I found no
  injection sink: there is no `dangerouslySetInnerHTML`, and the only `innerHTML` is `select.innerHTML = ""` in
  src/i18n/index.ts. URL parameters (`lang` only in production), saves and settings are never rendered as HTML.
  A tampered save with HTML/script in `ending`, `search` and `tsp.lang` executed nothing (`tamper.mjs`). So this is
  defence in depth only. A meta CSP such as `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'
  blob:; connect-src 'self' https://huggingface.co https://*.hf.co; img-src 'self' data: blob:; style-src 'self'
  'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'` would block any future injection or
  third-party script. Check ORT's worker and blob needs, and the Hugging Face redirect host, before using it.
- `https://chenao-phys.github.io` is one origin for every Pages site of the account. Any other project page of
  `ChenAo-Phys` can read and write this site's localStorage (the save) and Cache Storage. The model cache is safe
  because hits are re-hashed against `MODEL_SHA256` (src/ai/model_cache.ts:34). Keep the `ts-playfield.` key
  prefix, and remember this if other repos ever host untrusted content.
- **Files:** index.html, src/ai/model_cache.ts.

## Checked, no finding

- **DOM at prompts (dev, 1440×900):** `dom-scan.mjs` checks the full `outerHTML` (text, attributes, aria labels,
  titles, `data-*`, SVG) and resource timing at every prompt against the unredacted engine. It looks for the AI's
  face-down headline (image URL, `data-card`, en and zh name) and the AI's unseen hand and draw deck (image URL and
  `data-card`; names in turns 1–3). Runs: seed 31 USSR en (61 prompts, 3 face-down headlines), seed 31 US en (58), seed
  32 USSR zh (22, 1 headline). The only hits were log-history entries for cards played earlier and reshuffled; I
  checked each line. No hidden card's image was requested. No third-party origin and no page errors.
- **Undo:** code review of `anchorValid` (src/game/controller.ts ~1029). Undo is refused after any AI step,
  a change of `rng_state` (dice, draws and random discards all use it; DS `Prng::random_index`), a change of the AI
  hand signature (unknown count, known ids, peeked ids), or Cambridge Five. Blockade and LADC can't sneak through
  without an AI step: the human seat's rules (1544) include `ALWAYS_ASK_DISCARD` (bit 10), so the engine always gives
  the AI the decision (late_war.cpp:206). Reload + Resume never re-rolls: the replay from `seed` gives the same dice,
  draws and (deterministic) AI moves. The leak is the other way round (F2).
- **Tampered saves (production preview):** garbage JSON gives no Resume button and no error. An illegal step,
  or 300,000 bogus steps, gives Resume, a single console warning, the save deleted, and back to the menu with no crash
  loop. HTML in fields: nothing runs. Garbage UI settings or `tsp.lang`: ignored. (`tamper.mjs`)
- **Production build** (`npx vite build` into the scratch dir, preview on 4186):
  - no `__tsp`, `__tspAuto`, `autopilot`, `get("ai"|"seed"|"auto"|"think")`, fixtures, demo harness or source maps;
    the only URL parameter read is `lang`;
  - `?ai=policy&seed=3&auto=full` is ignored: the save's `search` is
    `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16` (leaderboard #1); the model is
    `ds-e8.1-b6soup-70b117b5.onnx` with sha256 `70b117b5…`; two `?seed=3` games got seeds 6977961454920966 and
    2019214863423560;
  - every request (42) is same-origin GET with no body; the model comes from `/TS_playfield/models/` (Hugging Face is
    used only as a fallback); fonts are self-hosted; no service worker; Cache Storage holds only the hashed model;
    localStorage holds only `ts-playfield.game.v1` (plus settings and language);
  - console: only the worker start, no game data. The bundle's `console.warn` calls are error paths only;
  - dist holds no PDF, JPEG/PNG map reference, `.env`, JSON fixtures or extra HTML (types: css, html, js, mjs, onnx,
    txt (font OFL), wasm, webp, woff2).
- **External links:** rulebook (Menu, StartScreen) and About links use `target="_blank" rel="noopener noreferrer"`;
  hrefs come from the catalog only. No `window` `message` listener; the AI worker is a dedicated same-origin worker.
- **Rules in effect (engine level):** the US bid is 7 setup points then a `bid-place` prompt with `remaining: 2`
  whose options are exactly the countries with US influence (3 games, `bid-probe.mjs`). The held-scoring loss
  ends real engine games (`held-scoring` endings in `node-probes.mjs` games 0, 2, 5, 6, 7, 8, …), and
  tests/game/rules.test.ts covers the classification, both-held draw included.
- **Timing of the padded set:** Blockade, Missile Envy and LADC forced AI answers are padded with `aiThinking` on
  (probe A2: 4 of 4 padded). Every non-forced AI decision is at least 600 ms (`askAi`).

## Scripts (scratch dir `tools/`)

`node-probes.mjs` (A1 coup odds, A2 timing, A3 save at headline), `node-warn-probe.mjs` (warnings vs AI hand),
`coup-boom.mjs` (F1 in the browser), `two-tabs.mjs` / `two-tabs-2.mjs` (F2), `bfcache.mjs`, `dom-scan.mjs`,
`tamper.mjs`, `prod-probe.mjs`, `prod-seed.mjs`, `prod-fiber.mjs`, `bid-probe.mjs`, `ssr.mjs` (Vite SSR loader). Run
browser scripts after `source scripts/pw-env.sh`, Node probes from the repo root.
