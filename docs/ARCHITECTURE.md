# Architecture

A static site (GitHub Pages, base `/TS_playfield/`) to play Twilight Struggle against DeepStruggle's
strongest AI, in English or Chinese. Vite + TypeScript + React 18. No backend.

```
src/
  engine/      DeepStruggle's WASM engine wrapper (ported, MIT): wasm_engine.ts, layout.ts, types.ts
  game/        Pure game logic, no DOM. contract.ts (THE interface), controller, redaction, rules helpers,
               log generation (ported DS describe/log), persistence. Runs under Node for tests.
  ai/          AiPlayer: Web Worker with its own engine + onnxruntime-web session + DS rollout/belief search.
  i18n/        i18next (DS's module + catalogs, MIT) + our `ui` namespace; browser-language detection;
               React hook. Card/country names come from here.
  data/        Static data: countries/map layout, card metadata, card text (from game_resources/card_text.json).
  ui/          React components (map, cards, tracks, prompts, log, dialogs, animation layer).
public/
  engine/      ts_engine.mjs + ts_engine.wasm (scripts/build-engine.sh)
  cards/{en,zh}/NNN.webp (scripts/build-cards.mjs from game_resources/)
  models/      the pinned ONNX model (self-hosted; sha256-checked)
docs/notes/    Research notes on DeepStruggle (engine-api, ai-pipeline, rules-compliance, ui-flow,
               map-i18n-assets, build-deploy, critique). critique.md corrects the others; read it.
vendor/DeepStruggle  Pinned at 5b95e91 (read-only; never edit).
```

## Decisions (2026-11-22)

| Topic | Decision | Source |
|---|---|---|
| AI | Leaderboard #1: network `E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M`, search `rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16`. One constant in `src/ai/config.ts`; the HF-default search (same string without `:belief2048`) is the fallback if devices prove too slow. | CLAUDE.md "single highest-rated"; ai-pipeline §1 |
| Seats | After every `newGame` / `loadSaveJson`: AI seat = model `obs_features` (12), human seat = `engine.currentRules` (1544). | engine-api §6, critique §1.2 |
| Human actions | Every action is `engine.decodeFlat(idx)` of a legal `mask(false)` index, sent unchanged, forcedDie 0. Never hand-build MicroActions. | critique §3.3 |
| Forced moves | Single-legal decisions and forced event targets (critique §3.1) are auto-played for both sides (UI animates them). They are NOT fed to the belief tracker. | critique §3.1 |
| Undo | Only back to the start of the human's current play, only while `"rng_state":<digits>` in `saveJson()` is unchanged, no AI decision was taken, and no AI card became known. | critique §3.7 |
| Hidden info | Every state that reaches the UI is redacted (port DS game/view.ts), including settled and first-headline previews. | engine-api §7, critique §3.10 |
| Endings | Classify with critique §3.2 (engine reports held-scoring as "20 VP"). | critique §3.2 |
| AI timing | Constant minimum delay for every AI decision; pad Blockade/LADC/Missile Envy decisions. | critique §3.9 |
| Persistence | localStorage `ts-playfield.game.v1` = "TSP2:" + base64url(XOR keystream over CRC-32 + UTF-8 JSON `{v:2, fingerprint, modelSha256, search, seed, humanSide, steps:[[t,p,s,f],...], autoFlags, …}`); resume = newGame(seed) → seat → replay. A v1 plain-JSON save is read and migrated; a tampered or corrupted save is reported as `incompatibleSave` (`reason: "unreadable"`) and discarded; obfuscation only (About says so). Details: `docs/handoff/logic.md` "Save format v2". | critique §3.7, QA round 2 (OD-1) |
| Language | `?lang=` → localStorage → `navigator.languages` (zh* → zh) → en. Switchable any time. Chinese terms follow our card images: DEFCON, 调整, 战争早期/中期/晚期. Our `card_text.json` titles win over DS's. | CLAUDE.md, map-i18n §3 |
| Rulebook | Never published; link https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf | CLAUDE.md |
| Model hosting | Self-host the pinned ONNX in `public/models/` (sha256 `70b117b5…f09e`), HF as a fallback URL. | build-deploy §4 |

## UI phase (from 2026-11-22)

The UI spec is `docs/design/ui-spec.md` ("War Table", authoritative); pixel reference `docs/design/mockup-final.html`
and `docs/design/shots/final-*.png`. Shared UI interfaces: `src/ui/ui-contract.ts` (spec §15.1) and the React
contexts in `src/ui/state/context.ts` (`useUiRoot`, `useVm`, `useOverlays`), both coordinator-owned.

| Workstream | Owns | i18n namespace |
|---|---|---|
| common + cards | `src/ui/common/**` (incl. `keymap.ts`: `useKey`, `KeymapProvider`), `src/ui/cards/**`, `tests/ui/common`, `tests/ui/cards` | `ui_common` |
| runner + state | `src/ui/runner/**`, `src/ui/state/**` except `context.ts`, `src/dev/**` (demo kit, fixture controller), `tests/fixtures/**`, `tests/ui/runner`, `tests/ui/state` | `ui_runner` |
| console + rail | `src/ui/console/**`, `src/ui/rail/**`, `tests/ui/console`, `tests/ui/rail` | `ui_console` |
| tray | `src/ui/tray/**`, `tests/ui/tray` | `ui_tray` |
| prompts | `src/ui/prompts/**`, `tests/ui/prompts` | `ui_prompts` |
| stage | `src/ui/stage/**`, `tests/ui/stage` | `ui_stage` |
| shell | `src/main.tsx`, `index.html`, `src/ui/App.tsx`, `src/ui/screens/**`, `src/ui/compact/**`, `tests/ui/shell`; integration fixes anywhere in `src/ui` once the others are done | `ui_shell` (+ `ui` after the i18n pass) |
| map | `src/ui/map/**`, `scripts/build-map.mjs`, `tests/map` | `ui` (`ui:map.*`, `ui:plate.*`, `ui:tip.*`) |

Contract gaps G1/G2/G3/G5/G7/G8/G11 (spec §16) are optional fields in `src/game/contract.ts`
(`PromptOption.cost/endsPlay`, `Frame.playId`, `Prompt.effect`, `realignOdds`, vp `source`, `ViewModel.aiStats/savedGame`).
The controller now always provides them (semantics: `docs/handoff/logic.md`, "Contract gap fields"); previews also hide outcomes that
depend on the AI's face-down headline or other hidden information. The UI keeps the spec's fallback only for absent fields. Dev-only switches (`import.meta.env.DEV`) may exist for QA
(e.g. a fast policy-only AI); production always plays leaderboard #1.

**As built (2026-11-22).** `src/main.tsx` (theme CSS, `initLanguage()`) renders `App`, which creates the controller once
(`src/ui/screens/appController.ts`) and composes the providers: `KeymapProvider` → `UiRootProvider` → `ShownProvider` (frame
runner) → `ShellContext`, then routes to `StartScreen` (boot / loading / menu / error, side choice) or `GameScreen` (playing /
over: console, map + stage, rail, tray or compact sheets, dialogs, `FlightLayer`, `DangerFrame`, `GameOverTelex`); details in
`docs/handoff/ui-shell.md` §1. Spec deviations accepted at integration are recorded in `ui-spec.md` ("As built" notes, §15.3).
Dev tools (dev server only, never in production): `?ai=policy` and `window.__tsp`; `src/dev/DemoHarness.tsx` over a
`FixtureController` replaying `tests/fixtures/ui/*.json`; per-workstream fixture demos (e.g. `src/ui/screens/demo/index.html?scene=…`
for the composed `GameScreen`; see each `docs/handoff/ui-*.md`); `src/ui/screens/demo/play.mjs`, a Playwright driver that plays
the real app by clicking the real UI (fails on any prompt the UI could not answer); `src/ui/screens/demo/shoot.mjs`, the
screenshot matrix (7 states × 5 viewports × en / zh, + en-XA) into `docs/design/shots/app-*.png`. QA reports go in `docs/qa/`.

## Conventions

- Code ported from DeepStruggle keeps a two-line MIT header (see `src/engine/wasm_engine.ts`).
- The UI restates no rules: legality comes from the engine mask; previews (coup odds, effective Ops,
  suicide warnings) come from snapshot → step → restore on the main engine (critique §3.6).
- Workstreams own disjoint directories. Don't edit another stream's files; don't edit
  `package.json` (ask the coordinator), `src/game/contract.ts` (coordinator only), or `vendor/`.
- Tests: `npx vitest run` (Node). Engine-backed tests load `public/engine/ts_engine.mjs` directly.
- Typecheck: `npx tsc --noEmit -p .`
