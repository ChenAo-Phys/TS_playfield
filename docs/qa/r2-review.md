# QA round 2: r2-review (adversarial code review)

Scope: the code changed since integration (round-1 fixes + round-2 items r2-hand-wait and r2-save), for correctness,
hidden-information leaks and robustness. Ports: dev 5186, preview 4186. Scratch: `$SP/r2-review`
(`$SP` = the QA session's scratch directory (not in the repository)).
Node probes load the project sources through Vite's SSR loader (`$SP/r2-review/tools/ssr.mjs`); run them from the repo root.

Progress: done. 4 findings (1 major, 2 minor, 1 polish), all reproduced at least twice; coverage notes below. All servers and browsers stopped.

## Findings

### R2R-1 (major) Free event coups show "Mil ops +2 / +3" that the engine never credits (Junta, Tear Down This Wall); Che's credited mil ops are not shown
- Files: `src/ui/prompts/CountryTooltip.tsx` (`CoupSection`, line 87: `ops > 0 && prompt.kind === "coup-target"`), `src/game/previews.ts`
  (`computeCoupOdds`: `ops = mod1 − modifier`); engine `vendor/DeepStruggle/engine/include/ts/constants.hpp`
  (`free_action::coup_earns_no_military_ops`: Junta #47 and Tear Down This Wall #96 granted Ops, Ortega #91) and `ops.cpp` `execute_coup` step 2.
- Repro (Node, repo root): `node $SP/r2-review/tools/freecoup.mjs 3`. It plays random games to the human's first action-card prompt, puts
  the card in the human's hand (debug `setCardLocation`), plays its Event and, for Junta / Tear Down, takes the free Coup, then compares
  `computeCoupOdds().ops` (what the tooltip prints as "Mil ops +N") with the `mil_ops` change of a real coup step.
  In the app: play Junta as Event, place the 2 influence, choose Coup, hover a Latin-American target (any viewport / language).
- Expected: no "Mil ops" line for a coup that earns none (the engine: "a coup made with an event's own free attempt earns no military
  operations"); for Che (#107, whose coups do earn them) a "Mil ops +3" line like any other coup.
- Actual: 7 of 7 free coups reached (Junta as USSR ×3, Junta as US ×1, Tear Down This Wall ×3): prompt kind `coup-target`
  (`resolving_card` is 0 once the event grants its Ops), `ops` 2 / 3, so the tooltip says "Mil ops +2" / "Mil ops +3" ("军事行动 +2"),
  while `mil_ops` stays 0 after the coup. Control rows (ordinary Ops coups ×4): shown = credited. Che (`$SP/r2-review/tools/che.mjs`):
  the coup is an `event-target` prompt, so no line, while the engine credits 3 (USSR 0 → 3).
- Why it matters: the line is how a player plans the turn-end military-ops requirement; trusting it after a Junta coup costs VP at the
  end of the turn. Pre-existing (before Q-038 the line used `prompt.opsValue`), but it sits in the Q-038 code and the number is wrong.
- Fix idea: carry "earns mil ops" from the controller (e.g. an optional `CoupOdds.milOps`, from the engine's `mil_ops` delta in the probe
  `computeCoupOdds` already runs, die 1 face), and let the tooltip print it for `coup-target` and the event coups alike.

### R2R-2 (polish) Esc / "Back to hand" after playing the China Card: focus goes to the orders slip, not the China Card
- Files: `src/ui/prompts/PlayModeStage.tsx` (`backToHand`: `store.setFocusCard(prompt.pendingCard)`), `src/ui/tray/Hand.tsx`
  (the focus effect only looks in the hand's own `order`), `src/ui/tray/ChinaSlot.tsx` (no matching effect).
- Repro: `node $SP/r2-review/tools/esc-china.mjs http://localhost:5186/TS_playfield/ 1 1440 900` (dev, `?ai=policy&seed=1`, en,
  USSR; settings fast, no reveal pauses). At the T1 action-card prompt it clicks the China Card, waits for the play-mode stage,
  presses Esc and samples `document.activeElement` at 0.1 / 0.4 / 1 / 3.5 s; then the same with a hand card (Korean War), then the
  China Card again on the next action round. Two runs: 1440×900 seed 1 (`$SP/r2-review/esc-china-run1.log`) and 1024×768 seed 3
  (`… 3 1024 768`, `$SP/r2-review/esc-china-run2.log`), same result.
- Expected (round-2 item 4): focus on the card that went back, i.e. the China Card button (`[data-card="6"]` in the China slot), with
  the tab stop there.
- Actual: China Card ×4 (2 per run) → `section[aria-label=Orders]` (the round-1 fallback) at every sample; hand card → `button[data-card=11]`
  with tabindex 0, as designed. The China Card's request (card 6) is never served: the hand's `order` does not contain it, so it
  waits out `FOCUS_TIMEOUT_MS` and is dropped.
- Fix idea: let `ChinaSlot` serve `focusCard === 6` the same way (or have the tray resolve the request through the `card:<id>` anchor).

### R2R-3 (minor) Realignment with the China Card (or with Vietnam Revolts in effect): "5/5 rolls left" drops to 3 after one roll outside Asia, unexplained
- Files: `src/ui/prompts/OrdersSlip.tsx` (`bonusHints`: the conditional-bonus hint is shown for `influence` runs only), `src/game/prompt.ts`
  (realign title / `remaining` = the engine budget with the bonus); engine `ops.cpp` `budget_if_spent_in` (the +1 holds only if every
  roll is in Asia / Southeast Asia).
- Repro (UI): `node $SP/r2-review/tools/china-realign-ui.mjs http://localhost:5186/TS_playfield/ en $SP/r2-review/china-realign-en.jpg`
  (dev `?ai=policy&seed=1`, 1440×900, USSR): T1 AR1, China Card → Realign. Slip before: "The China Card › Realign · 5 Ops · 5/5 ROLLS LEFT ·
  Each click rolls once in the chosen country; press Done to stop early." One roll in Iran. Slip after: "· 4 Ops · 3/5 ROLLS LEFT".
  Node, 4 more games: `node $SP/r2-review/tools/chinarealign.mjs` (Realign (5) → one roll in Canada / Israel → 3, every time).
- Expected: as for influence since Q-037 ("The China Card gives +1 Op if every point goes to Asia."), the realign slip says the 5th roll
  holds only in Asia before the first roll (Vietnam Revolts: Southeast Asia), so the drop is not a surprise.
- Actual: no hint; two rolls vanish at the first roll outside Asia (rules-correct, but the slip promised 5). Evidence:
  `docs/qa/shots/r2-review/r2r3-china-realign-3-of-5.jpg` (slip bottom left: "→ Iran · 4 Ops · 3/5 ROLLS LEFT").
- Related, coups: `prompt:title.coup` / `prompt:detail.coup` are built from `pending_ops_value` ("(5 Ops)", "Roll + 5 Ops must beat …";
  `node $SP/r2-review/tools/chinacrumb.mjs`, `vietnam.mjs`: 4 Ops / 3 Ops for every target outside Asia / SE Asia). The desktop slip does
  not print them (it shows "Coup" and, once a target is staged, the right Ops from `CoupOdds`), so only the unstaged crumb "Coup · 5 Ops"
  shows the maximum; the strings still sit in the prompt for any surface that prints `title` / `detail`.

### R2R-4 (minor) After one refused save write (storage full), a tab ignores other tabs: two live copies, and the older tab later overwrites the newer one
- Files: `src/game/controller.ts` (`ownsSave`: `if (!this.wroteSave) return true;`, `save()`: `this.wroteSave = written`).
- Repro (Node, repo root): `SEED=6 node $SP/r2-review/tools/quota.mjs` and `SEED=9 …` (real controllers, one engine each, a shared
  `MemoryStorage` whose `setItem` throws `QuotaExceededError` while `full`). Tab A plays, storage fills, A plays 3–6 more steps (writes
  refused), storage has room again, tab B boots and resumes the last good save, then A answers its open prompt.
- Expected (Q-002): B's resume (a claim, writer B) stops A: one live copy; B's game is the one that goes on.
- Actual (both seeds): after B's resume A is **not** superseded and keeps its prompt (A at 23 / 19 steps, B at 20 / 13). A's next move
  is accepted and written (writer A, 24 / 25 steps), which supersedes **B** and throws away B's resumed game. Between the two, both tabs
  take moves, so B can replay a decision whose outcome A already showed (the Q-002 preview, in this condition).
- Why: a single failed write sets `wroteSave = false`, and `ownsSave()` then answers "mine" whatever the stored writer is. The guard is
  needed only while this page has never stored its own claim (a refused `newGame` / `resume` write leaves the previous game's save with
  another writer); once a claim of this page was stored, a stored save with another writer means another tab took over, whether or not
  the latest write went through.
- Likelihood: needs a full origin storage. D-001 notes that every ChenAo-Phys Pages project shares the `chenao-phys.github.io` origin and
  its ~5 MB localStorage, so another project can fill it; then also `browserStorage()`'s probe write fails at load and the page runs with
  no storage at all (no autosave, no tab detection), silently.
- Fix idea: keep "this page's claim was stored" (set on the first successful write of a game, reset by `newGame` / `resume`) and use it
  instead of the last write's result.

## Checked, no finding

- **Save v2** (`src/game/persistence.ts`, controller boot / resume): envelope, base64url (leftover bits, impossible lengths), CRC over the
  JSON, field checks. `node $SP/r2-review/tools/saveprobe.mjs`: re-encoded saves with an illegal step (ids 60000, decision type 99, one
  step too many) are refused at Resume, removed, and a new game starts (no crash loop); a flipped side or a plain v1 JSON save loads (the
  documented honest limit: it needs the plaintext steps and the engine fingerprint, i.e. code); `primary_id + 256` replays as the
  uint8-wrapped id (only through re-encoding). Blocked storage (getItem / setItem throw): the game plays, nothing saved, no error.
  The production bundle carries the obfuscation key (expected) and no dev hooks.
- **Two tabs** (`node $SP/r2-review/tools/twotabs.mjs http://localhost:5186/TS_playfield/ 13 USSR`, and `3 US`): tab B presses Resume while
  tab A's AI is thinking. A is superseded at the same step count (the AI's answer is never applied), shows the blocking notice with focus
  on Reload; resign / undo from the stale tab write nothing; the stored value stays v2 and decodes to B's game (57 / 58 steps).
  Back/forward cache: not testable here (Playwright's headless Chromium runs with `--disable-back-forward-cache`).
- **Coup odds** (`coupRollModifier`, `computeCoupOdds`): the modifier matches `ops.cpp execute_coup` (Latin American Death Squads, both
  flags, Central / South America; SALT −1; no other roll modifier exists in the engine), and `ops = mod1 − modifier` is the engine's
  `ops_value` (China Card +1 only in Asia, Vietnam Revolts +1 only in Southeast Asia, Brezhnev / Containment / Red Scare-Purge via
  `combine_ops`), read case by case. The tooltip and the staged crumb print it (`china-coup-ui.mjs`: Iran "4 Ops + ⚀ − 2×2", Japan "5 Ops + ⚀ − 2×4",
  staged crumb "→ Iran · 4 Ops"). `computeEffectiveOps` agrees with `combine_ops` for each combination worked through by hand; with Purge + Vietnam Revolts a
  1-Op card yields 0 → null and the stage falls back to the printed 1, which happens to be right.
- **Hidden information, live sweep** (`node $SP/r2-review/tools/sweep.mjs <url> <seed> <side> <lang> <untilTurn> [W H touch]`; dev, policy AI
  and autopilot, sampled every 300 ms through AI turns and prompts): seed 1 USSR en 1440 (twice, to T5), seed 3 US zh 1440 (to T6),
  seed 13 US zh 390×844 touch (to T7): 2,482 samples, 584 prompts. No AI card that was never public appeared in the DOM (data-card,
  image URLs, names in text / aria-label / title / alt), in fetched resources or in the public frame state; the save was never plain
  text. The only hits were the AI's face-down headline being a card the human already knew (CIA Created in the known-cards set,
  Containment in an older log line): not a leak, and the known card stays shown in the hand while face down (no tell).
- **Hidden information, fixture sweep** (`ONLY=… node $SP/r2-review/tools/fixture-sweep.mjs <url> 1440 900 en`, every fixture through the
  shell demo, scenes at the end, sequences at both ends, 62 renders, 730 card elements): one hit, Kitchen Debates in
  `prompt-headline`'s slip ("Space Race privilege: the US headline is Kitchen Debates.") — public by the box-4 rule.
- **New round-2 code**: the AI-wait clock (`aiSince`) starts on `vm.aiThinking` for every AI decision, padded forced answers included,
  and adds nothing a stopwatch on the "thinking" state would not; the tap queue is dropped when the AI starts thinking or the game
  ends and applies only to a continuing run that still offers the country (dice events stage, never commit); `displayTurnAr`,
  `markHandOrigins` (`fromHand` only for moves whose origin the rules make public), the superseded notice and the About save line show
  nothing hidden. Esc "Back to hand" works for hand cards (R2R-2 covers the China Card).
- **Boot / chunk failures** (production preview :4186, `node $SP/r2-review/tools/chunkfail.mjs`): with `assets/GameScreen-*.js` aborted,
  picking a side shows one toast for ~2.7 s, the start screen stays with "Resume game" (the game has started and its save is written);
  with the network back, Resume opens the game screen. Q-004 forced-AI padding and Q-005 / K-001 retry paths reviewed in code.

