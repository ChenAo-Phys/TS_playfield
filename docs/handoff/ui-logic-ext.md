# Handoff: logic extensions for the UI phase ("logic-ext")

Owner: **logic-ext** (continuing **logic**). The full, normative semantics are in
[`docs/handoff/logic.md`](logic.md), section "Contract gap fields" — read that one; this note is the summary.

## What was built

| Gap | Field / API | Where |
|---|---|---|
| G1 | `PromptOption.endsPlay` (every option) and `PromptOption.cost` (country options of setup-place / bid-place / influence) | `src/game/previews.ts` `attachPreviews` |
| G2 | `Frame.playId` (undefined on system frames) | `src/game/controller.ts` `stepStartsPlay` / `assignPlays`, rules `isCardChoice` / `crossesPlay` |
| G3 | `Prompt.effect` on every event-target prompt | `previews.ts` `effectOf` |
| G5 | `GameController.realignOdds(country)` (36 forced pairs) | `previews.ts` `computeRealignOdds`, controller |
| G7 | `vp` event `source: {card?, country?}` | `src/game/events.ts` `vpSource` |
| G8 | `ViewModel.aiStats: {decisions, ms}` (saved with the game) | controller `askAi`, persistence |
| G11 | `ViewModel.savedGame: {turn, ar, humanSide, savedAt}` | `src/game/persistence.ts` `saveSummary`, controller |
| — | `AiPlayer.thinkingDelayMs` used directly (typed in the contract) | controller `paddingMs` |
| §8.4 | `doneLabel(prompt)` returns the per-context label (`prompt:doneFor.*`, en + zh-CN) | `src/game/messages.ts`, `prompt.json` |

Also: no game-ending preview (and `endsPlay: true`) for an option whose outcome depends on hidden information —
this closes a leak where the human's headline pick warned "this ends the game" because of the AI's face-down
headline. Our Man in Tehran's `doneMeaning` is now `"return"` (ui-spec §8.4). The zh-CN `prompt.json` had no
头条卡牌 left. New debug hook `deps.debug.onPromptBuilt(prompt, ms)`; `debug.onFrame` gets the step
(`{before, part}`) as a third argument (tests only).

### 2026-11-22, second round (prep-logic)

| Item | What | Where |
|---|---|---|
| `card-moved.fromHand` | set on a card leaving the AI's unseen hand for a public place (Five Year Plan / Terrorism random discards, Grain Sales takes, the AI's discards, the AI's Missile Envy landing in your hand); the flight starts at `hand:<ai>` | `src/game/events.ts` `markHandOrigins`, controller `markHandOrigins`; `src/ui/runner/locations.ts` `flightFor`, `beats.ts` carries it on the beat |
| `boot()` retry | a failed engine load forgets the attempt (a later `boot()` / `newGame` retries, error cleared); after a failed AI load before any game, `boot()` loads the AI again | controller `boot` |
| dev autopilot | `window.__tspAuto` (DEV only): the human's move as the AI would choose it; `?seed=<n>` (DEV only) seeds the controller | `src/dev/autopilot.ts`, `src/ui/screens/appController.ts`, docs/handoff/ai.md |
| diagnostics | `TsGameController.humanDecisionForDiagnostics()` (the autopilot's request; unredacted, never for the UI) | controller |

## Public API for the UI

```ts
vm.prompt.options[i].endsPlay   // boolean: stage this option as the "final point" (spec §8.2)
vm.prompt.options[i].cost       // number | undefined: pulse this many Ops coins; cost2 = cost >= 2
vm.prompt.effect                // {verb: "add" | "remove" | "target", side} on event-target prompts
vm.frame.playId                 // number | undefined
GameEvent vp.source             // {card?, country?} | undefined
vm.savedGame / vm.aiStats       // see logic.md
GameEvent card-moved.fromHand   // Side | undefined: fly from hand:<side> instead of the deck (flightFor does it)
controller.realignOdds(country) // RealignOdds | null, at realign-target prompts
doneLabel(prompt)               // Message | null — the only call needed for the done button
```

## How to test

`npx tsc --noEmit -p .` and `npx vitest run tests/game tests/i18n` (~40 s for tests/game). The random batches
assert every new field against what the chosen option actually did, at every prompt and frame; the coverage
summary they print includes the prompt build times.

## Prompt build time (this machine, warm)

influence 54 options 13 ms · event-target 83 options 22 ms · realign-target 23 options 10 ms · coup-target 23
options 3 ms · others ≤ 4 ms. Batch maxima 20–60 ms, rare worst case ≈ 140 ms (a die deciding the game on every
option of a ~50-option prompt). Details in logic.md.

## Deviations

- `cost` is the real drop of `remaining`, so it includes a forfeited China Card Asia bonus (a 1-Op point outside
  Asia shows cost 2), and equals `remaining` when the point ends the run. The contract comment says "1, or 2";
  the UI should treat it as "coins this click spends".
- `endsPlay` is conservative (true) whenever the honest answer would depend on hidden information (random
  discard, draw, revealed cards, the AI's face-down headline) — so every headline pick is `endsPlay: true`.
- Done-label keys are `prompt:doneFor.<context>`, not `prompt:done.<meaning>.<card>` as ui-spec §8.4 suggests
  (i18next cannot nest keys under the existing `done.<meaning>` strings). The UI must not look them up itself.
- Opposed rolls are previewed on 11 dice pairs (every difference), and options whose extreme dice agree are not
  enumerated further; both rest on the engine resolving dice monotonically (documented in logic.md).

## Requests

- `docs/design/ui-spec.md` §8.4 (coordinator): replace "The UI uses per-card overrides when the key exists
  (`messageIfKnown("prompt:done.<meaning>.<resolvingCard>")`)" with "`doneLabel(prompt)` already returns the
  per-context label", and §16 G1/G2/G3/G5/G7/G8/G11: mark as implemented (fallbacks remain for safety).
- `src/game/contract.ts` (coordinator), `PromptOption.cost` comment: "how much `remaining` drops: the point's Ops
  (1, or 2 in a country the opponent controls) plus any conditional bonus it forfeits (China Card outside Asia);
  all of `remaining` when it ends the run" — matches the implementation.
- `docs/ARCHITECTURE.md` (coordinator), "UI phase": the contract gaps G1/G2/G3/G5/G7/G8/G11 are implemented by
  the controller (see docs/handoff/logic.md).
