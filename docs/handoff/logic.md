# Handoff: logic (`src/game/`, `src/engine/` extensions)

Owner: **logic**. Files: `src/game/**` (except `contract.ts`), `src/engine/**`, `tests/game/**`,
`src/i18n/locales/{en,zh-CN}/prompt.json`.

## What was built

| file | what |
|---|---|
| `src/game/controller.ts` | `TsGameController implements GameController` + `createGameController(deps)`. The loop, frames, log, prompts, AI calls, undo, autosave/resume, resign, previews. |
| `src/game/view.ts` | DS `redactState` port → `PublicState` (`aiHandCount`, `aiKnownCards`, `aiHeadlineHidden`); `secretCards(raw, human)`; `aiHeadlineFaceDown`. |
| `src/game/describe.ts`, `log.ts`, `branches.ts` | DS describe/log/branches ports (MIT header), reading **redacted** states only; card moves worded as DS `log_view` does; AI draws told by count only. |
| `src/game/events.ts` | `buildFrameEvents(before, after, …)`: GameEvents from two redacted states + dice + event tracks + draw counts; `scoringEvents`; `vpSource` (G7). |
| `src/game/draws.ts` | `drawCounts(b, a, taken)` on **raw** states: the cards each side drew (deck, new era's cards, reshuffled discard pile), whether the discard pile was reshuffled. Only counts and the human's own ids leave the controller. |
| `src/game/prompt.ts` | `classifyPrompt`, `classifyOption`, `buildPrompt` (kind, options from `mask(false)`, `doneMeaning`, title/detail Messages). |
| `src/game/previews.ts` | `attachPreviews` (= `attachWarnings`): warnings, `cost`, `endsPlay`, `effect` for every option of a prompt; `computeCoupOdds`, `computeRealignOdds`, `computeEffectiveOps`, `endingOutcomes`. All snapshot → stepDice (forced dice) → restore. |
| `src/game/rules.ts` | `forcedEventTarget` (critique §3.1), `classifyEnding` (§3.2), AR counting (§3.8), `strandsScoring`, plays (`isCardChoice`, `crossesPlay`), constants. |
| `src/game/messages.ts` | `warningMessage(w)`, `doneLabel(prompt)` (with the ui-spec §8.4 per-context labels), `endingReasonMessage`, `endingMessage` for the UI. |
| `src/game/persistence.ts` | Save format, `readSave/writeSave/clearSave`, `saveSummary`, `MemoryStorage`, `browserStorage()`. |
| `src/game/index.ts` | Barrel: contract types + everything the UI needs. |
| `src/engine/wasm_engine.ts` | `load(base, {printErr, print, maxAnomalies})` (file URL under Node, BASE_URL in the page; `moduleUrl`), `diagnostics` (anomaly dumps → buffer, other stderr → `printErr`/console), `firstHeadline(a)`, `stepDice`, `rngState()`, `seatRules`, debug `cardLocation/setCardLocation`. Existing exports unchanged. |
| `src/engine/types.ts` | Optional `can_decline`, `un_intervention`, `event_ready`, `chernobyl_region`. |
| `prompt.json` (en, zh-CN) | 175 keys (en 191 with plural forms): titles/details per kind and per card (every ui-flow §3 decision), done labels (`done.*` per meaning, `doneFor.*` per context, ui-spec §8.4), warnings, ending reasons, our log lines. zh follows `docs/glossary.md` (DEFCON, 政变, 调整/调整掷骰, 稳定度, N 行动点…). Plurals `_one/_other` (zh `_other`). |

## Wiring (UI)

```ts
import { createGameController, browserStorage } from "./game";
import { WasmEngine } from "./engine/wasm_engine";
import { createAiPlayer, AI_CONFIG } from "./ai";
const controller = createGameController({
  loadEngine: () => WasmEngine.load(), ai: createAiPlayer(), storage: browserStorage(), minAiDelayMs: AI_CONFIG.minDelayMs,
});
await controller.boot();   // status boot → loading → menu; the AI loads in the background (vm.load)
```
`boot()` is memoised once the engine has loaded; a failed load (status `"error"`) forgets the attempt, so calling
`boot()` again (or `newGame` / `resume`, which call it) retries from `"loading"` with the error cleared.
`useSyncExternalStore(controller.subscribe, controller.getSnapshot)`. Never pass `deps.debug` in the page.

## Semantics the UI should know

- **Frames**: one per applied step; the end-of-turn cleanup gets its own frame (`actor: null`); a headline
  pair is split with `firstHeadline` (frame 1 = reveal + first headline, frame 2 = second). Undo pushes a
  frame whose events are the diff back. `auto` = forced move (single legal / forced event target, both sides).
- **Event order** in a frame: own action (card-played, headline-chosen/reveal) → rolls → scoring →
  influence → control → milops → space → defcon → vp → effects → reshuffle/deal/hand-revealed/card-moved
  → china-card → turn-start/phase/action-round; cleanup frames: vp → milops → effects → defcon → turn-start
  → cards → phase. `card-played` for an AR card comes with its **mode step** (`how` = event/space/
  influence/coup/realign); at selection only scoring/pass/trap-discard. The AI's selected card is
  `state.decision_context.pending_op_card`; it stays `UNSEEN` in `card_locations` until it leaves the
  hand (the engine keeps it there during the play).
- **Cards into hands** (fixed 2026-11-22, see "Deal, scoring, reveals" below): `deal {side, count}` counts
  every card drawn into that hand in the frame -- from the deck, from the new era's cards (turns 4 and 8:
  they go `UNAVAILABLE` → hand in one engine step) and from the reshuffled discard pile -- for **both** sides,
  the AI's by count only. The human's drawn cards also have their `card-moved` (from `UNSEEN`, `UNAVAILABLE`
  or `DISCARD_PILE`). Every other card that enters a hand has a `card-moved` (Missile Envy, Grain Sales,
  SALT, undo). Per side and frame: hand-size increase = deal + other cards moved in − cards that left.
- **Log**: one entry per step (+ turn end, + game over). Entries are released with their frame
  (`vm.log` never runs ahead of the board).
- **Prompts**: released only when every frame is acked. `options` = exactly the legal `mask(false)`.
  `warnings` params: `scoring-stranded {scoring, plays}`, `defcon-suicide`/`cmc-suicide {faces}`,
  `game-ending {winner, reason, faces}`, `opponent-event {card, side}` — render with `warningMessage`.
  `faces` = die faces of 6 (dice are enumerated with forced dice; outcomes that depend on hidden
  randomness or the AI's hand — held scoring, final scoring — are never previewed; neither is anything behind
  the AI's face-down headline). Done label: `doneLabel`. Option previews `cost`/`endsPlay` and the
  event-target `effect`: see the next section.
- **Previews**: `coupOdds(c)` at coup-target prompts and Che/Ortega event coups; `realignOdds(c)` at
  realign-target prompts (and event-target prompts whose click is a realignment roll); `effectiveOps(card)` at
  action-card / play-mode prompts, without the region-conditional bonuses (China +1 Asia, Vietnam Revolts).
  All three return null outside their prompt and are cached per prompt (compute on hover).
- **Undo**: anchor = each action-card/headline prompt, or the first human prompt after anything the human
  can't take back. Allowed while every step since is the human's, `rng_state` is unchanged, the AI hand's
  signature (unknown count, known ids, peeked ids) is unchanged, and no Cambridge Five event was played.
- **Save**: `localStorage["ts-playfield.game.v1"]` holds `{v, fingerprint, modelSha256, search, seed, humanSide,
  steps: [[t,p,s,f]…], autoFlags: "0101…", over, ending, savedAt, turn, ar, aiStats, writer}` (turn, ar, aiStats,
  writer optional), **encoded as format v2** since QA round 2 (see "Save format v2" below). Resume = newGame(seed) →
  seat → replay (log rebuilt). A save that doesn't replay is deleted. Finished games are not resumable.
- **AI**: forced moves auto-played (not in `moves`); forced AI answers whose forcedness rests on the AI's unseen hand
  padded like a real decision (`rules.ts padsForcedAiDecision`: Blockade/LADC/Missile Envy, a card choice whose one legal
  card is in the AI's hand -- Quagmire / Bear Trap escapes, UN Intervention's pairing --, a trapped AI's card choice even
  when it passes; QA Q-004)
  (`ai.thinkingDelayMs()` when the AiPlayer has it, else recent times, never under `minAiDelayMs`); every AI decision ≥ `minAiDelayMs`
  from its start; seed `((steps+1)*1_000_003)>>>0`; 3 attempts, then status `error`.

## Contract gap fields (G1, G2, G3, G5, G7, G8, G11) — exact semantics

All of them are always present where this section says so; the UI keeps its spec §16 fallback only for
`deps.previews: false` (tests) or an older controller.

**How options are previewed.** At every human prompt, each option is applied to the main engine with the dice
forced (`stepDice`), read, and the engine restored: state and `rng_state` are untouched afterwards (checked at
every one of ~10k prompts in the random batches: `saveJson()` at the prompt = at the last frame). A click that
rolls one die is tried on its faces; an opposed roll (realignment, Summit, Olympic Games) on 11 pairs that cover
every dice difference −5…5 (the engine decides these by the difference alone). Shortcut: when the extreme dice
(1 and 6; for opposed rolls the biggest win each way) give the same ending and the same `endsPlay`, and the click
rolls nothing else, the dice in between are not tried (their results lie between the extremes). The human's
forced follow-ups (single legal action, forced event target) are played after the option, as the controller would.
No preview may depend on hidden information: when the option's outcome moved the RNG without a die (a random
discard, a draw), or brought something hidden to light (a card leaving the draw deck or the AI's unseen hand, the
AI's face-down headline), it gets no game-ending warning and `endsPlay: true`.

- **`PromptOption.endsPlay`** (G1) — on every option of every prompt (true/false). True when, after this option
  and the human's auto-played forced follow-ups, for at least one die outcome the human has **no further
  decision in this play**: the game ends; or the AI decides next (any AI step, forced or not — after it undo is
  gone); or the human's next decision is a card choice (action-round card, headline, Eagle/Bear discard), which
  starts a new play; or the turn/phase changes, or a headline starts resolving (except the first headline in the
  very step of a headline pick, which belongs to that pick's play); or the answer would rest on hidden
  information (see above). Examples: the last influence point → true; a 1-Op point with 2 Ops left → false;
  a 2-Op point with 2 left → true; an action-card card → false (play-mode follows), a scoring card or pass → true;
  play-mode Influence/Coup/Realign → false; Event → true unless the human then decides something; every headline
  pick → true; the US's 7th setup point → false (the bid follows, same play); the last bid point → true.
  Verified on 10.2k choices: whenever the play actually ended, `endsPlay` was true; `endsPlay` true and the play
  went on only where a die, the RNG or a reveal decided it (74 cases).
- **`PromptOption.cost`** (G1) — only on `country` options of `setup-place`, `bid-place`, `influence` (undefined
  on every other option, `done` included). = how much `remaining` drops: the point's Ops (1, or 2 where the
  opponent has control) **plus** a conditional bonus it forfeits (the China Card's +1 for all-Asia: the first
  point outside Asia drops `remaining` by 2, a 2-Op one by 3), and all of `remaining` when the point ends the
  run. Verified against the real drop on 2.0k placements. Final point = `remaining === cost` (or use `endsPlay`).
- **`Prompt.effect`** (G3) — on every `event-target` prompt (never elsewhere). From the engine's own result of the
  first country options (dice 1/1): `{verb: "target", side: <human>}` when a die is rolled for that country
  (coups: Che, Ortega; wars: Brush War, Indo-Pakistani, Iran-Iraq…) or its influence does not change; otherwise
  `"add"` with the side whose influence rises (the human's own: Marshall Plan, COMECON, Junta, LADC, NORAD…) or
  `"remove"` with the side whose influence falls (the AI's: Truman, EEU, Suez, Voice of America, Socialist
  Governments…; the human's own: De-Stalinization's removal, the Cuban Missile Crisis payoff). Verified against
  the board's change on every chosen option (30 resolving cards seen).
- **`Frame.playId`** (G2) — a play starts with the frame of (a) the answer to a card choice (an action-round
  card or pass, a headline pick, the Eagle/Bear discard), (b) a headline starting to resolve (`card-played`
  `how: "headline"`; when it is in the same frame as the pick, one id), (c) a side's first setup point (each
  side's setup is one play; the US bid belongs to the US setup). Every later frame — the mode, targets, dice,
  the opponent's responses and forced moves inside it — carries the same id, until the next start. Ids strictly
  increase from play to play. **Undefined** on system frames (`actor: null`: new game, resume, undo, the turn's
  cleanup) and on the resignation frame; the turn's end closes the play. After an undo the redo continues the
  play's id, or (redoing a card choice) gets a new one. AI frames during the human's play (its responses) carry
  the human's play id.
- **vp `source`** (G7) — on a `vp` event when an Event moved the VP in that frame: `{card}` = the Event (scoring
  cards included) whose record moved VP most; plus `country` when that Event's die was rolled for a country
  (wars). Absent for Space Race VP, the mil-ops penalty, final scoring, undo frames.
- **`ViewModel.savedGame`** (G11) — `{turn, ar, humanSide, savedAt}` iff `hasSavedGame` and the save carries the
  summary (saves written before this change resume fine but have none). `ar` = the action round, 0 in setup and
  the headline phase; `savedAt` = `Date.now()` of the last autosave (every step). Read at boot, updated on every
  save, removed by `discardSave()` / a finished game.
- **`ViewModel.aiStats`** (G8) — `{decisions, ms}` whenever a game exists (`humanSide !== null`). `decisions`
  = AI moves chosen by the AiPlayer (forced AI moves and the padding of Blockade/LADC/Missile Envy not
  counted); `ms` = the sum of the AI's reported thinking time (`choose().ms`, its search time), else the
  measured answer time; the minimum-delay padding is not included. Saved with the game, restored on resume.
- **`GameController.realignOdds(country)`** (G5) — implemented (the wrapper forces both dice:
  `stepDice(a, die, oppDie)`). All 36 pairs; `outcomes` = `{side, amount, p}` with `side` = whose influence is
  removed (`"NONE"`, amount 0, for a tie or nothing to remove), `p` = pairs/36, sums to 1, sorted US, USSR,
  NONE then amount. Exactly the engine's roll record (`total1` US, `total2` USSR, `net_delta` removed). Checked:
  every one of 1.26k real realignment rolls was one of the listed outcomes.
- **`doneLabel(prompt)`** — returns the ui-spec §8.4 per-context label (`prompt:doneFor.*`) when it applies, else
  `prompt:done.<meaning>`. The UI calls `doneLabel` only (no `messageIfKnown` lookup). Overrides: AR8 pass
  (`title.key === prompt:title.actionCardAr8`) "Skip action round 8"; pass with only the China Card
  (`cards == [6]`) "Pass (keep the China Card)"; Eagle/Bear (250) "Keep my hand"; realign stop "Stop
  realigning"; decline at 40 "Keep the crisis — play on", 10 "Discard nothing — lose West Germany influence"
  (a `{country}` param), 95 "Discard nothing", op-mode of Junta/TDTW "Skip the free operation"; return at 67
  "Return it — take 2 Ops", 108 "Done — return the rest"; skip at 43/85 "Take no card". Our Man in Tehran's
  `doneMeaning` is now `"return"` (was `"stop"`).

**Prompt build time** (build + all previews, warm, this machine — a fast desktop core; expect 3–5× on phones).
Largest prompts found in 12 random games: influence 54 options 13 ms; event-target 83 options 22 ms;
realign-target 23 options 10 ms; coup-target 23 options 3 ms; setup/bid 14–15 options 4 ms; action-card 9 options
2.4 ms; play-mode 1.5 ms. In the 64-game batches (4 files in parallel): mean 1–10 ms per kind, max 20–60 ms,
except a rare worst case ≈ 140 ms — a die deciding the game on every option of a ~50-option prompt (Brush War or
an opponent's war card after the last Op, at 19 VP), where every face is classified. The build runs when the
prompt is opened, i.e. while the previous frame animates. `deps.debug.onPromptBuilt(prompt, ms)` reports it.

## Deal, scoring, reveals (2026-11-22)

Bugs found by the runner workstream, fixed, and the same class hunted across `events.ts`:

- **Deal counts** (`draws.ts`): the old count saw only `DRAW_DECK` → hand, so at turns 4/8 the era cards
  dealt straight from `UNAVAILABLE` were missed (fixture `seq-turn-end` seq 180: `deal USSR 2` for 7 cards, no
  deal for the AI's 8). Now: deck, `UNAVAILABLE`, and `DISCARD_PILE` when the deck was reshuffled in the span
  (seen as discarded cards back in the deck or in Our Man in Tehran's peek; a SALT take and a headline Missile
  Envy going from the discard pile to the giver's hand are not draws). Regenerated: seq 180 = `deal US 8`,
  `deal USSR 7`.
- **Log draw lines** agree with the deals: the human's draws are one `log:card.draws` line naming every drawn
  card (era and reshuffled ones included; they were `toHand` lines before), the AI's `prompt:log.drawsHidden`
  (now plural `_one/_other`) counts the same cards; `log:card.newEra` / `log:card.reshuffled` count the era /
  pile whole (dealt cards included). A card taken out of a hand is `prompt:log.takenFrom` ("X taken from the
  USSR hand into the US hand": Grain Sales), never a draw (it was "US draws 1 card: X" when it came from the
  AI's unseen hand). An event's card choice that already says where the card went (discards / removes /
  returns / takes / gives / SALT, Grain Sales' return) no longer repeats it in a detail line.
- **Scoring**: `{t: "scoring", card, vp}` for every scoring card played -- `how` scoring, headline, or event
  (Grain Sales' drawn card) -- `vp` from the card's track, **0 when the engine recorded none** (it records no
  track for a net-0 Event: fixture `seq-event-scoring` seq 228, Europe Scoring with no event). Headline scoring
  plays were affected the same way.
- **Reveals**: an AI card shown in place (CIA Created, Lone Gunman, Aldrich Ames, Our Man in Tehran's
  reshuffle) is `hand-revealed` only; the extra `card-moved UNSEEN → HAND_<ai>_KNOWN` (a flight from the deck)
  is kept only when the AI also drew in the span (then which cards were held is not public). The Cambridge
  Five's Event (AR event or headline) always has `hand-revealed {side: "US", cards}` = the US scoring cards now
  known, **empty when the US holds none** (before: no event at all, nothing to show).
- **card-played labels**: `discard` / `give` only for a card out of the actor's own hand: Missile Envy's given
  card is `give` even when its Event fires for the taker and it ends in the discard pile (was `discard`); Our
  Man in Tehran's discards from the peek and Aldrich Ames' pick from the US hand get no `card-played` (their
  `card-moved` says it; before, the dock showed "US plays X" for a peeked card); Star Wars' card from the
  discard pile is `card-played how: "event"` (was `discard`).

**`card-moved.fromHand`** (contract field, set since the coordinator added it): a card leaving the AI's **unseen**
hand for a public place still reads `from: "UNSEEN"` (redacted diff), and now carries `fromHand: <ai side>`, so the
UI flies it from `hand:<ai>` (`src/ui/runner/locations.ts` `flightFor`) instead of the deck. The controller sets it
per frame part from the raw card locations the part's diff starts from (`markHandOrigins` in `events.ts`, called in
`applyStep`): Five Year Plan / Terrorism random discards (also when the AI's own headline or play of the card made
it discard), Grain Sales takes, the AI's discards by choice (Blockade, LADC, Ask Not...), and a card going from the
AI's unseen hand into the human's. Not set on the AI's own played card -- its card in play or resolving when the
step starts, its headline, its action-round / headline card choice, a card it plays in the frame -- since the
reveal dock shows that one; **except** when that card lands in the human's hand (the AI's Missile Envy after the
exchange: the human's `give` reveal has cleared the dock by then, so without `fromHand` it flew from the deck).
The decision context is the step's own (the second part of a first-headline split borrows the settled state's,
which may already be the next card's Event: Five Year Plan discarding Truman Doctrine). A human's Missile Envy
take is usually a known card already (`from: HAND_<ai>_KNOWN`), no mark needed. The Cambridge Five played **for
Ops by the US** fires the USSR's Event somewhere in the play; with no US scoring card nothing shows (the human
sees no influence prompt) -- not detectable from the states without engine help.

## Run / test

`npx vitest run tests/game` (~40 s, 12 files): 64 full random games (4 parallel batches: **`card-moved.fromHand`**
on every frame against the raw state (only on a move out of the AI's unseen hand to a public place, never on the
AI's own played card unless it lands in the human's hand; always on a move from the AI's unseen hand into the
human's and on the random discards / takes while Five Year Plan, Terrorism, Grain Sales or Missile Envy is in play),
leaks vs. the unredacted state of every frame/log entry/prompt, option legality, influence events = board
deltas, **hand accounting per side and frame** (hand-size increase = `deal` + cards moved in visibly − cards
that left; `deal` = the cards drawn from deck / era / reshuffled pile; the human sees each card it draws; a
reshuffle event iff discarded cards went back into the deck; `discard`/`give` only of the actor's own cards),
**every scoring-card play has exactly one `scoring` event** (and back), **the log's draw lines total the deal
events** per side (the AI's by count only), headline announcements, AI protocol (seed, belief list = decoded legal actions, never at forced
nodes), previews leave the engine untouched (on-demand ones, and the prompt build: `saveJson()` at each prompt =
at the last frame), every chosen option's `endsPlay`/`cost`/`effect`/realignment roll against what happened,
`playId` rules on every frame, `aiStats` and `savedGame` at every prompt, prompt build time, endings re-classified
on a fresh replay + held-scoring counterfactual, 16 mid-game save/resume with identical `saveJson()` and log),
unit tests (rules, engine wrapper, controller behaviour incl. stats/summary across resume and old saves, padding
with `thinkingDelayMs`, targeted prompts: Grain Sales + UN Intervention, TDTW/Junta decline, DEFCON-suicide coup,
influence costs with a controlled country and the China Card bonus, realignment odds, done labels, vp sources,
no headline warning behind the AI's face-down headline; `events.test.ts`: draw counts with era / reshuffled /
taken cards, deal events, scoring events at net 0 (AR, headline, Grain Sales event), reveals, The Cambridge Five
with none, the log's draw / takenFrom lines, `markHandOrigins` on synthetic frames, and seeded real games checking
the turn-4 and turn-8 deals and their log entry, net-0 scoring plays in an AR and as a headline, and `fromHand` on
Five Year Plan / Terrorism discards, Grain Sales takes and the AI's Missile Envy exchanged (seeds 5, 4, 9)), boot
(memoised; retried after a failed engine load, also through `newGame`), i18n (both catalogs, all emitted messages
and every done label render in en + zh-CN), and 2 games against the real network (`search: "policy"`, inline).
With `tests/i18n`: 19 files, 213 tests.
`npx tsc --noEmit -p .` passes.

Hand/scoring coverage (one run, 64 games): 21.0k frames accounted, dealt US 2128 / USSR 2072, 112 cards gained
otherwise, 71 reshuffles, 411 scoring plays (147 net 0). `fromHand` (2026-11-22 run): 65 moves marked; random
discards / takes checked by cause: Five Year Plan 16, Grain Sales 12, Terrorism 1 (a 400-game search found no
UNSEEN Missile Envy take by the human: the engine shows the given card first).

Coverage (one run, 64 games): 10.2k choices checked for `endsPlay` (3.0k ended the play), 2.0k costs, 1.26k
realignment rolls, 5.8k plays over 21k frames; event-target effects on 30 cards (add own, remove opponent,
remove own for 33 and 40, target for 24, 36, 91, 102, 107). Earlier coverage notes still hold: all 14
PromptKinds; endings defcon / held-scoring / vp20 / final-scoring / milops-vp20 / wargames / cmc-suicide.

## Known issues

- `ts_first_headline_json` writes anomaly dumps (58 in 64 games); they go to `engine.diagnostics`.
- Previews force both dice; a further roll in the same click (realignment + an opponent's war card) takes
  the acting die's value, so its faces are covered but not independently of the realignment's dice. `faces`
  for opposed rolls is the share of the 36 pairs, rounded (6 only when certain); Olympic Games ties go to the
  opponent under forced dice (real play re-rolls them).
- The extreme-dice shortcut and the realignment pair set rely on the engine resolving coups, wars and
  realignments monotonically in the dice (difference) — true in `ops.cpp` / `card_dispatcher.cpp` at 5b95e91.
- Random play ends games early (DEFCON); late-war decisions are exercised less often than early ones. The dev
  autopilot (docs/handoff/ai.md) plays the human's side like the AI, so live play-throughs now reach turn 10.
- ~~`endsPlay` is true on the last point of an Event when the Cuban Missile Crisis cancel window opens next~~ --
  fixed (K-002, 2026-11-23): `crossesPlay` no longer counts the headline phase ending into the action rounds as a play
  boundary (the controller shows it inside the step's frame, same play id), so the second headline's last point before
  the human's cancel window is `endsPlay: false` (seeds 72 and 126, tests/game/qa-fixes.test.ts).

## Contract gaps

1. `Warning.params` can't hold card refs/Messages → ids and side strings; use `warningMessage`.
2. No `PlayHow` for card selection or "take" (SALT/Star Wars) → see event rules above.
3. ~~`AiPlayer` has no `thinkingDelayMs`~~ — typed now, called directly.
4. `effectiveOps` returns one number; region-conditional bonuses are left out (documented).
5. No `ViewModel` field for engine diagnostics → `controller.engineForDiagnostics.diagnostics`.
6. G1/G2/G3/G5/G7/G8/G11: implemented (section above). G4 (`shortTitle`), G6 (`handNotes`), G9 (`Ending.loser`),
   G10 (mil-ops penalty preview) are not.
7. ~~`card-moved.from` is the redacted location~~ -- `card-moved.fromHand` is implemented (see "Deal, scoring,
   reveals"); one deliberate extension of the contract comment: the AI's own played card is marked when it lands
   in the human's hand (the AI's Missile Envy). The beat type in `src/ui/ui-contract.ts` has no `fromHand` yet;
   `beats.ts` carries it on the beat object anyway (requests).

## Dev / QA hooks

- `TsGameController.humanDecisionForDiagnostics()` → `{ promptId, state, seed, moves }` at a visible human prompt
  (null otherwise): the UNREDACTED engine snapshot and the game's move list, as an AI request. Only the dev
  autopilot (`src/dev/autopilot.ts`, `window.__tspAuto`, docs/handoff/ai.md) calls it; never the UI.
- `src/ui/screens/appController.ts` (DEV only): `?seed=<n>` gives the controller a seeded random source (the game
  seed and the coin of a random side), so with `?ai=policy` and the autopilot a whole game replays exactly.

## Fixtures (2026-11-22 regeneration)

`tests/fixtures/ui/` was regenerated once with the capture after these fixes. Event changes: `seq-turn-end` seq
180 (deals US 8 / USSR 7), `seq-ai-event` seq 410 and `seq-play-space` seq 96 (net-0 `scoring` events), and in
`game-full`: deals at the era turn, net-0 scorings, a pure reveal without its deck flight, The Cambridge Five's
empty `hand-revealed`, Missile Envy's `give`, Our Man in Tehran's discards without `card-played`. Log details
changed in ~20 entries (draw lines, `takenFrom`, no repeated destination lines). `tests/ui` (23 files, 370 tests)
passed on those fixtures unchanged.

Second regeneration (2026-11-22, prep-logic): the capture now always writes **`seq-event-scoring`** = the first
scoring-card play with a non-zero net (Asia Scoring, +3 VP, turn 1; 2 frames); `seq-ai-event` keeps its net-0
South America Scoring. The same games otherwise: the only event change is `card-moved.fromHand` (one move in
`game-full`). 44 fixtures, 2.57 MB.

## QA round 1 fixes (group F1, 2026-11-23)

Regression tests: `tests/game/qa-fixes.test.ts` (real QA saves in `tests/fixtures/game/qa-saves.json`), plus
`tests/ai/unit.test.ts`, `tests/i18n/data.test.ts`, `tests/ui/runner/director.test.ts`.

- **Coup odds (Q-001)**: `computeCoupOdds` sets `endsGame` only for a public ending (`PUBLIC_ENDINGS`, nothing hidden
  revealed on the way), as the option warnings do; a coup on the turn's last action no longer shows six "ends the game"
  dice when the AI holds a scoring card (held-scoring / final scoring turn on the AI's hand). The other `isTerminal()`
  uses in previews.ts were audited: `settle` (ends the play: the safe answer), `positionKey` (a cache key) and `run`
  (classified, then filtered by `endingsOf`) leak nothing.
- **One live copy of a game (Q-002)**: the save carries `writer` (a random id per controller instance). `StorageLike`
  gained an optional `subscribe(onChange)`: `browserStorage()` now returns a wrapper over localStorage that calls it on
  the `storage` event for the save key, on `pageshow` with `persisted`, and on `visibilitychange` to visible;
  `MemoryStorage(shared?)` instances on one map notify each other (tests' "tabs"). When another tab writes the save
  (resume, new game, any move), a playing controller is **superseded**: gen bumped (AI drive stopped, AI cancelled),
  prompt withdrawn, `choose` / `undo` / `resign` ignored, the save never written again, `vm.superseded = true` (status
  stays "playing"). `newGame` / `resume` write the save at once (claim) and clear the flag. Missed events are covered
  too: `choose`/`undo`/`resign` and every save first check that the stored save is still this page's. On the start
  screen (no live game) a change re-reads the resumable save (`hasSavedGame` / `savedGame` follow the other tab).
- **Incompatible save (Q-014)**: at boot, an unfinished save of another engine build is reported as
  `vm.incompatibleSave = { savedAt }` and removed from storage (only at boot: a later re-read never deletes another
  tab's save). Cleared when a game starts.
- `superseded` and `incompatibleSave` are optional fields of `ViewModel` in contract.ts (added at integration);
  `ControllerViewModel` is now an alias of `ViewModel`. The shell shows the blocking "continued in another tab" dossier
  and the start-screen notice.
- **Defectors (Q-003)**: a USSR headline cancelled by Defectors (US headline Defectors, or Defectors' Event fired in the
  headline phase -- Five Year Plan's random discard, Grain Sales, Star Wars) gets **no** `card-played` (the stage's
  `cancelledHeadline` stamps it CANCELLED: card to the discard pile unplayed in one frame), and the step's log entry
  gets `prompt:log.headlineCancelled` ("USSR headline X (#n) is cancelled by Defectors: discarded without its Event"),
  right after the line that fired Defectors. `ussrHeadlineCancelled(d, us, ussr)` (exported) reads it from the
  engine's headline slots. `drive()` accepts the cancellation (and checks one log line per cancelled headline).
- **Turn's end with the Eagle / Bear Has Landed discard (Q-007)**: the step that ends the last action round and pauses
  the turn's end at the box-6 discard now counts as `crossed`: a system frame (`actor: null`, the mil-ops penalty's
  vp / milops events; its `action-round` 8 event dropped) -- before, the penalty had no event and no log line at all.
  Its log lines wait; the discard step's entry keeps only the discard (`log:action.eagleBearLandedDiscard` says where
  the card went), then one **"End of turn N"** entry holds the penalty and the rest of the turn's end (effects, DEFCON,
  deals -- or the game's end). Final scoring: the turn entry's Victory Points line keeps the cleanup's own change and a
  `prompt:log.finalScoring` line carries the scoring's (split with `Ending.vpBefore`), also without the discard.
  Mid-turn endings (DEFCON, 20 VP, Europe Control, the Cuban Missile Crisis, Wargames) write no "End of turn" entry;
  what the ending changed (VP set to +-20) goes into the step's own entry.
- **Game over line (Q-008)**: `prompt:log.gameOver` = "Game over: the {{winner}} wins — {{reason}}. VP {{vp}}, turn
  {{turn}}." (zh "游戏结束：{{winner}}获胜——…"), `prompt:log.gameOverDraw` for a draw; `vp` is the side-labelled
  `vpScore` message ("+1 (US)"). The seven fixtures with a game-over line were patched to the new params.
- **LADC (Q-009)**: an event-target prompt uses `prompt:card.<rc>.detailTarget` (count = remaining) before the card's
  `detail`; card 95 has one ("Pick up to 2 South American countries…"). Audit: 95 is the only card whose `detail` is
  written for another of its decisions.
- **AI load stage (Q-010)**: `ensureAi` reports `{stage: "model-download", fraction: 0}` before `ai.init`, and on a
  failure keeps the stage the error carries (`stage` on the error, src/ai/errors.ts) in `vm.load` with status "error",
  so the boot line names the failed step even when no progress came first.

### QA round 1 integration (integrator, 2026-11-23)

- **Coup Ops and modifier (Q-038)**: `computeCoupOdds` also returns `ops` and `modifier` (optional `CoupOdds` fields). The
  engine records one combined `mod1` (= Ops + roll modifiers, ops.cpp `execute_coup`); `coupRollModifier(flags, region,
  side)` (exported) rebuilds the public roll modifiers in force at the click (SALT −1; Latin American Death Squads +1 for
  the side whose effect it is, −1 for the other, in Central / South America) and `ops = mod1 − modifier` (the China
  Card's +1 only in Asia, Vietnam Revolts only in Southeast Asia). Test: every face's success is `die + ops + modifier −
  2 × stability > 0` over three games, two of them with modified coups.
- **How I Learned (Q-025)**: the defcon-level prompt's detail is `prompt:card.46.detailWin` ("…and you would win: the
  phasing player loses") when the AI is the phasing player (the card came through the AI's Star Wars), else
  `prompt:card.46.detail` ("…you would lose"). Test on QA's game-359 save (`defcon1WinHilswUS` in qa-saves.json).

## Save format v2 (QA round 2, OD-1; 2026-11-23)

The v1 save was plain JSON: DevTools › Application showed the AI's face-down headline (`steps.at(-1)` at the human's
headline prompt) and the seed, and any edited move list that replayed legally was accepted (a flipped `humanSide` gave
the human the AI's hand). Decision: obfuscate + checksum, and say plainly that it is not tamper-proof.

- **Format** (`src/game/persistence.ts`): the key stays `ts-playfield.game.v1` (one key across formats: the two-tab
  logic watches one key). The value is `"TSP2:" + base64url(payload XOR keystream)` (no padding), payload = CRC-32 (IEEE, big-endian,
  4 bytes) of the UTF-8 JSON + the UTF-8 JSON (`v: 2`, otherwise the v1 fields). The keystream is mulberry32 seeded
  with FNV-1a of a fixed key string in persistence.ts (`OBFUSCATION_KEY`; changing it makes every v2 save unreadable).
  The key ships with the page: anyone with developer tools can decode, edit and re-encode a save. The About dialog
  says so (`ui_shell:about.save`).
- **API**: `encodeSave(save)` / `decodeSave(text)` → `SaveRead` = `{kind:"none"}` | `{kind:"ok", save, legacy}` |
  `{kind:"unreadable"}`; `inspectSave(storage)` (the same for what storage holds); `readSave` (unchanged: the save or
  null; v1 is upgraded to the v2 shape); `writeSave` (always v2); `migrateSave(storage)` (v1 → v2 in place, same
  fields, `writer` and `savedAt` kept); `crc32(bytes)`; constants `SAVE_KEY`, `SAVE_VERSION = 2`,
  `LEGACY_SAVE_VERSION = 1`, `SAVE_PREFIX`.
- **v1 migration**: a plain-JSON value (`{"v":1,…}`, checked field by field as before, no checksum) reads as
  `legacy`; at boot the controller rewrites it as v2 (unless it is reported below), and a resume writes v2 anyway.
- **Unreadable** = a v2 value whose base64url or checksum fails (tampered with, corrupted), truncated data, plain JSON
  that is not a v1 save (a v2 JSON in clear included), garbage, an unknown prefix. At boot it takes the Q-014 path:
  `vm.incompatibleSave = { savedAt: 0, reason: "unreadable" }` (0: the save's own time cannot be trusted; the start
  screen shows its one `ui_shell:error.saveUnreadable` toast per value, R-018), the save removed, no Resume. An
  unfinished save of another engine build is `{ savedAt: save.savedAt, reason: "build" }` (`ui:error.saveIncompatible`).
  `reason` is the contract's optional field (R-018); the shell still treats a missing `reason` with `savedAt` 0 as
  unreadable. If it becomes unreadable after boot (edited
  in DevTools on the start screen: no `storage` event in the same page), `resume()` removes it and returns false (the
  shell's resume toast). A later re-read (another tab's `storage` event) never removes it: `hasSavedGame` turns false,
  and a playing tab keeps the game (an unreadable value is "no other writer") and overwrites it on its next save.
- **Across the deploy**: a tab of the old (v1) site still open reads a v2 value as "no save", so a new-site tab does
  not supersede it; its next move writes v1 over the save, and the new-site tab (which reads v1) is superseded then.
  One live copy still holds; only the new tab's moves since its resume are lost, and only for tabs open across the
  deploy (a changed engine fingerprint makes the old game incompatible anyway).
- **Cost**: encode + decode of a turn-10 save (~25 KB) is well under a millisecond; the save is still written after
  every step and read before every move (Q-002).
- Tests: `tests/game/persistence.test.ts` (round trip, nothing readable, every one-character edit and every truncation
  refused, v1 read / refused / migrated, the controller's boot / resume / unreadable paths, two tabs with v1, v2 and
  garbage writes), plus the Q-002 / Q-014 tests in `qa-fixes.test.ts` and `controller.test.ts` now on v2.

## QA round 2 fixes (group F1, 2026-11-23)

- **Coup military operations (R-002)**: `computeCoupOdds` also returns `milOps`, the military operations the coup
  credits (`coupEarnsMilOps(E)`, the engine's `free_action::coup_earns_no_military_ops`, ops.cpp `execute_coup` step 2):
  0 for an Event's own free coup (Junta and Tear Down This Wall when the Event granted the Ops, i.e. the frame's
  `event_granted_ops` is set; Ortega Elected in Nicaragua), `ops` for every other coup (Junta / Tear Down played for
  Ops, Che, the China Card, Vietnam Revolts). The display has no `event_granted_ops`, so the open decision's frame is
  read from `E.saveJson()` (`ctx_stack[ctx_stack_depth]`); `milOps` is absent when the save has no such frame. Not the
  probe's `mil_ops` change: it is 0 for a side already at 5, and a coup on the turn's last action runs the turn's end,
  which clears the track. The UI shows "Mil ops +N" from `milOps` when it is defined and > 0, for coup-target and event
  coups alike (CountryTooltip; contract `CoupOdds.milOps?`, added by the integrator). Tests: `tests/game/r2-fixes.test.ts` (Junta USSR / US, Tear Down This
  Wall, Junta for Ops, an ordinary coup, the China Card outside Asia, Che, Ortega: `milOps` equals the real coup step's
  credit; a side at 5 still sees the credit).
- **Two tabs after a refused write (R-003)**: `ownsSave()` keys on `claimStored` (this page's save of the current game
  is in storage: set by the game's first write that went through, reset by `newGame` / `resume`) instead of the last
  write's result. Once a claim was stored, a stored save with another writer is a takeover even while this page's own
  writes are refused (storage full), so the older tab stops when another tab resumes. Before the claim is stored,
  another writer's save may be an older game, not a takeover (unchanged). Tests: `tests/game/r2-fixes.test.ts` (r2-review's
  quota scenario, seeds 6 and 9; a game whose first write was refused). The silent no-storage-at-load case is D-203.
- **Discarded-save reason (R-018, applied by the integrator)**: `readResumable` sets `{ savedAt: 0, reason:
  "unreadable" }` and `{ savedAt: save.savedAt, reason: "build" }` (contract `ViewModel.incompatibleSave.reason?`); see
  "Save format v2". The contract's `CoupOdds.milOps?` (R-002) landed too; `computeCoupOdds` now returns plain
  `CoupOdds`.

## QA round 3 fixes (group F1, 2026-11-23)

- **Autosave unavailable (D-203, R3-01)**: the controller sets `ViewModel.saveUnavailable = true` (contract field added
  by the coordinator) while a game is `playing`, the page is not superseded, and either `deps.storage` is null
  (`browserStorage()`'s probe write failed at load: storage blocked, privacy mode) or the last `writeSave` returned
  false (quota). A later write that goes through clears it (each write is followed by an emit, so subscribers hear the
  change); so do game over / resign (status `over`), the start screen, a new game or resume whose first write is
  taken, and supersession (that page has its own notice). Field: `saveRefused` (set from every `save()` write,
  reset by `reset()`); `saveUnavailable()` derives the flag in `buildViewModel`. The shell (F4) shows one toast per
  page session when it becomes true. Tests: `tests/game/r3-fixes.test.ts` (no storage; storage that takes every
  write; a refusing storage mid-game then freed; a refused first write; a superseded page whose last write was
  refused; a resume whose claim is refused; `browserStorage()` over a node `localStorage` stub that refuses writes /
  throws on access). Browser (dev, 1440×900): with `Storage.prototype.setItem` throwing from load, `saveUnavailable`
  is absent on the menu, true after `newGame` and after moves, absent after resign; with it throwing mid-game, absent
  → true after the next answers → absent once `setItem` is restored, no page errors (`$SP/r3-fix-F1/save-unavail.mjs`).
- **Coup prompt Ops (D-202, R3-02)**: `prompt:title.coup` / `prompt:detail.coup` stated `pending_ops_value`, which
  holds the region-conditional bonuses (the China Card's +1 in Asia, Vietnam Revolts' +1 in Southeast Asia for the
  USSR; ops.cpp `budget_if_spent_in`), so "(5 Ops)" was wrong for a China Card coup outside Asia. A surface does print
  the title: the target-list dossier (`OrdersSlip`, key T / the List button) is titled with `Prompt.title`
  ("CHOOSE A COUNTRY TO COUP (5 OPS)" at a China Card coup, before). The coup-target words now use new keys
  `prompt:title.coupUpTo` / `prompt:detail.coupUpTo` ("up to N Ops" / "最多 N 行动点") exactly when the engine's
  own test for a regional bonus holds (`pending_op_card` is the China Card, or the human is the USSR and
  `VIETNAM_REVOLTS_ACTIVE`); otherwise the Ops are the same in every country and the old keys stay ("(N Ops)").
  Deviation from the item's simplest option (always "up to N"): "up to" only where it can be less, so an ordinary
  coup keeps its exact number. Tests: `tests/game/r3-fixes.test.ts` (an ordinary card: every target's
  `CoupOdds.ops` equals the stated N; the China Card: `coupUpTo`, max N and min N − 1 over the targets; Vietnam
  Revolts: `coupUpTo` for the USSR, `coup` for the US). Shots: `docs/qa/shots/r3-fix-F1/{before,after}-coup-list-{en,zh}.jpg`.
