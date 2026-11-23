# Handoff: console + rail (W5, `ui-console`)

Owner: **console**. Files: `src/ui/console/**` (incl. dev-only `demo/`), `src/ui/rail/**`, `tests/ui/console/**`,
`tests/ui/rail/**`, `src/i18n/locales/{en,zh-CN}/ui_console.json`. Spec: `docs/design/ui-spec.md` §5, §6, §9.4 (track /
effect / hand-revealed (AI) / headline-chosen (AI) rows), §11.4, §15.3 "W5".

## What was built

| File | Exports | Notes |
|---|---|---|
| `console/Console.tsx` | `Console`, `needsAttention`, `ConsoleVariant` | The instrument bar in four variants (desktop / condensed 1200–1439 / tablet / compact). Reads `useShown().state` + the running track beats' overrides; calls `useTrackBeats` itself |
| `console/TurnTrack.tsx` | `TurnTrack`, `TurnReadout`, `TurnTip` | 10 cells (gaps before 4 and 8), the lit cell slides on a turn change, era row; condensed "6/10 · Mid War". Tooltip: era, when its cards were shuffled in, hand size |
| `console/ArTrack.tsx` | `ArTrack`, `ArReadout` | Pips from `maxActionRound` (6/7, dashed 8th when only one side has AR 8), US half left · USSR half right; readout "AR 3 · USSR (you)"; Headline / Setup / "End of turn N". Tooltip: round of max, "AR 8 available to the US (North Sea Oil)" |
| `console/DefconGauge.tsx` | `DefconGauge`, `DefconTip` | Numeral in its lamp colour, 5 lamps, caption `ui:track.defconRuleShort.N`; compact numeral + "DEFCON". Tooltip: the full rule |
| `console/VpGauge.tsx` | `VpGauge`, `VpLead`, `VpSparkline`, `vpLeadText` | US 20 left → USSR 20 right, ticks, needle `50 % − vp × 2.5 %`, rolling lead "USSR +2" / "Even", ends "★ US 20 / USSR 20 ☭"; mini variant. Tooltip: VP by turn end (sparkline + list) |
| `console/MilOpsTrack.tsx` | `MilOpsTrack`, `MilOpsTip` | 2 rows × 5 cells (USSR chamfered), required level outlined; tooltip "USSR short by 2" (display only, G10) |
| `console/SpaceTrack.tsx` | `SpaceTrack`, `SpaceTip`, `useBoxName` | 2 rows × 8 cells; hop on a `space` beat; privilege note for 2 s. Tooltip: each side's box, the next box's Ops / roll / VP (`engineLayout().space_boxes`, when loaded), privilege boxes reached |
| `console/LangToggle.tsx` | `LangToggle`, `useSwitchLanguage`, `switchLanguage` | segmented "EN \| 中文" or one button with the other language; `setLang`, no reload; a failed Chinese download (offline) is a warning toast, never an unhandled rejection (the settings dossier uses the same hook) |
| `console/StatusPanel.tsx` | `StatusPanel` | every instrument stacked (tablet flyout, compact sheet); `after` slot for the piles |
| `console/Instrument.tsx` | `Instrument`, `useAnchorRef` | focusable group + aria summary + anchor + room tooltip (hover 250 ms or focus; Esc hides; `aria-describedby`) |
| `console/useTrackBeats.ts` | `useTrackBeats`, `registerTrackHandlers`, `useTrackValues`, `trackValues`, `useVpHistory`, `chipSource`, `flyChipDom` | the `track` beat handler (§9.4 rows action-round, vp, defcon, milops, space) |
| `console/trackStore.ts` | `trackStoreFor`, `useTrackView`, `createTrackStore`, … | per-Director overrides + animation state, cleared at each commit |
| `console/model.ts`, `slots.ts`, `shared.ts` | `arModel`, `vpHistory`, `eraOf`, `vpLead`, `vpNeedle`, … · `slot`, `fillSlots`, `emphasizeNumber` · `shareRegistration` | pure helpers |
| `rail/Rail.tsx` | `Rail` | desktop rail: dossier, In effect, Dispatches; collapsed = the 60 px strip; the `›` handle and **L** toggle it |
| `rail/AdversaryDossier.tsx` | `AdversaryDossier`, `miniStep` | header + round, seal, name, sub, status chip (Waiting / Thinking with a phosphor dot / Playing), backs + known cards (one "Known" tag) + China mini, committed headline slot; reveal flips and stamps |
| `rail/EffectsStrip.tsx` | `EffectsStrip`, `effectChips` | chips from `state.flags` with `effectInfo`, ordered this turn → conditional → permanent → perks; hover/focus = description, click = card zoom; pin / tear-off animations |
| `rail/Dispatches.tsx` | `Dispatches`, `LOG_WINDOW`, `tapeMove`, `tapeRefs` | the teleprinter tape: time codes, side glyph + bar (US solid, USSR dashed, system thin), `MessageText` refs, details with die chips, turn separators, play-in-progress wash + caret, All / Plays / Dice, follow-unless-scrolled-up + "Jump to latest ↓". **One Tab stop** (the tape); the names by arrows (QA fix round below). No live region (the game screen's `AiAnnouncer` is the one) |
| `rail/Announcer.tsx` | `AiAnnouncer`, `announcedLines`, `announcementText`, `plainText` | the screen-reader mirror of the log (§12): one polite `role="log"` region the **game screen** mounts in every arrangement; each new AI entry read once, main line + every detail; the headline reveal from any side's entry |
| `console/squeeze.ts` | `useSqueeze`, `nextSqueeze`, `squeezeKey`, `isCut`, `SQUEEZE_STEPS` | the compact console's measured fit (QA fix round below) |
| `rail/RailStrip.tsx` | `RailStrip` | tablet strip (and collapsed rail): 4 buttons with badges / unread dot; stands in as anchor (`hand:<ai>`, `effects`, mil ops, space) while its panel is closed |
| `rail/RailFlyout.tsx` | `RailFlyout` | tablet 320 px flyout (z sheet), Esc / × close |
| `rail/sections.tsx` | `RailPanel`, `AdversarySection`, `EffectsSection`, `DispatchesSection`, `RailPanelName` | connected sections for the compact sheets and flyouts |
| `rail/useRailBeats.ts`, `railStore.ts`, `useRailData.ts`, `logModel.ts` | `useRailBeats`, `registerRailHandlers`, `useRailView`, `railStoreFor`, `useRailData`, `logRows`, `timeCodes`, `passesFilter`, `isDiceEntry`, `diceOf` | beats, store, data hook, pure log model |
| `*/index.ts` | everything above | barrels |

## Public API (props)

```tsx
import { Console, StatusPanel, useVpHistory, vpHistory } from "./ui/console";
import { Rail, RailStrip, RailFlyout, AdversarySection, EffectsSection, DispatchesSection } from "./ui/rail";

<Console variant="desktop" | "condensed" | "tablet" | "compact"
         onSettings?={() => …} onMenu?={(anchor: Element) => …} menuOpen?={bool} menuAlert?={bool} />
<Rail collapsed={settings.railCollapsed} onToggle={() => setSettings({ railCollapsed: !settings.railCollapsed })} />
<RailStrip open={panel | null} onOpen={p => …} />          {panel && <RailFlyout panel={panel} onClose={…} />}
<StatusPanel after?={<Piles …/>} heading?={bool} />
// compact sheets: Adversary = <AdversarySection/><EffectsSection/>, Log = <DispatchesSection bare/>, Status = <StatusPanel after={…}/>
```

Spec props are all there: `TurnTrack {turn, condensed}`, `ArTrack {state, humanSide}` (+ `ar?`, `readoutOnly?`),
`DefconGauge {defcon, variant}` (+ `caption?`), `VpGauge {vp, width, variant}` (+ `history?`), `MilOpsTrack {milOps, required}`,
`SpaceTrack {space}`, `LangToggle {variant}`, `AdversaryDossier {state, aiSide, status}`, `EffectsStrip {flags}` (+ `bare?`),
`Dispatches {log, humanSide, current}` (+ `bare?`), `RailStrip {open, onOpen}`, `useTrackBeats(director)`,
`useRailBeats(director, aiSide)`. Every component also takes `className`.

* **Beats.** `Console` registers the `track` handler, `Rail` / `RailStrip` / the sections register `hand-revealed` (AI only),
  `headline-chosen` (AI only) and `effect`. Several mounts share one handler (`shareRegistration`): the first registers, the
  last to unmount unregisters. Handlers write an override first (Skip lands on the final value), animate for the catalogue
  time × `ctx.speed.motion`, and the overrides are dropped at the commit (`useOnCommit`). Reduced motion: no travel, short
  cross-fades / flashes, stamps without the thunk.
* **VP chip** (`vp` beat): from `source.country` → `country:<id>`; a scoring card's `source.card` → the scoring sheet's net bar
  (`scoring`, registered by the stage) while it is mounted, else `card:<id>`; else the frame's last country beat, else the
  centre of the `stage` anchor; to the `vp` anchor; then the needle swings (600 + 600 ms at 1×).
* **DEFCON 2 toast** (`ui:toast.defcon2`) is raised by the console's `defcon` beat.
* **Anchors registered:** `turn`, `ar`, `defcon`, `vp`, `milops:US/USSR`, `space:US/USSR` (instruments), `hand:<ai>`,
  `china:<ai>` (the China mini while the AI holds it, else the hand row, so a China Card passing to the AI slides there),
  `headline:<ai>` (while the AI headline is face down), `effects` (section header); the strip buttons stand in for
  `hand:<ai>` + `china:<ai>`, `effects`, mil ops and space while their panel is closed (the compact dock's Adversary button
  likewise). The rail has **no `china` handler**: the tray alone raises `ui:toast.china` (one toast; checked in the app).
* **Hidden information:** the dossier draws only `aiHandCount`, `aiKnownCards`, `aiHeadlineHidden`, the China Card holder,
  and the cards a `hand-revealed` beat is revealing (the next committed state lists them). A test renders the dossier for
  every recorded frame of every fixture and checks that no other card id appears and that the backs equal
  `aiHandCount − aiKnownCards.length`.

## How to test / demo

* `npx tsc --noEmit -p .` (clean) · `npx vitest run tests/ui/console tests/ui/rail tests/i18n tests/theme` → 11 files, 264 tests
  (mine: 3 files, 59 tests: models, markup of all four console variants and the rail in en / zh, a pseudo-language sweep
  (no word on screen without ⟦…⟧ except data names and SVG artwork), the beat handlers with a real Director (overrides,
  durations, abort, toasts, chip source, shared registration), the hidden-information sweep, and the §18.2 stylesheet rules).
* Demo: `TSP_VITE_CACHE=node_modules/.vite-5186 npx vite --port 5186 --strictPort`, then
  `http://localhost:5186/TS_playfield/src/ui/console/demo/index.html?scene=prompt-midgame&lang=en`. Real fixtures through
  the real runner with the real map, flights, toasts, card zoom. Extra parameters: `page=variants` (all four consoles,
  status panel, sections, strip + flyouts), `flyout=adversary|effects|log|status` (tablet), `sheet=adversary|log|status`
  (phone), `rail=collapsed`, `toolbar=off`. Good scenes: `prompt-midgame` (long log), `prompt-action-card` (DEFCON 2, known
  AI cards, face-down China), `prompt-region` (10 effects), `seq-ai-turn&think=3000` (thinking, reveal, committed headline),
  `seq-over-vp20` (VP chip, space hop), `seq-ai-coup` (DEFCON flicker + console flash).
* Screenshots: `source scripts/pw-env.sh && node src/ui/console/demo/shoot.mjs [name…]` (server running) →
  `docs/design/shots/ui-console-*.png` (24 files: desktop en / zh / en-XA, DEFCON 2, effects, thinking, VP chip in flight,
  DEFCON flicker, reveal, VP and space tooltips, 1366 condensed en / zh and collapsed rail, 1024 tablet flyouts en / zh /
  en-XA, phone console + adversary / log / status sheets, the variants pages en / zh, reduced motion).
* Checked in Chromium (Playwright): Tab reaches the wordmark then the instruments, focus opens the tooltip
  (`aria-describedby`), Esc hides it; a known card and an effect chip open the card zoom; the Dice filter narrows the
  tape; scrolling up shows "Jump to latest", which returns to the newest entry; L collapses / expands the rail; EN | 中文
  switches the page (and `<html lang>`) and back; the tablet strip opens flyouts, Esc closes them. No console errors.

## Deviations from the spec (with reasons)

1. **Log side word → side glyph.** The controller's log messages already begin with the side ("USSR plays Card: …"), so a
   side word before them would repeat it. Each entry shows the side's glyph (★ / hammer and sickle, in side ink) plus the
   side bar (solid / dashed), which keeps side identity without colour.
2. **Dice filter** keeps entries with a `log:roll.*` detail as well as `kind === "roll"`: the controller writes rolls as
   details of the play and never emits `kind: "roll"` entries, so the literal filter would always be empty.
3. **Log window:** the newest 240 rows are drawn, with "Show earlier dispatches" above them (a whole game logs ~1500
   entries of hoverable refs).
4. **Space tooltip** lists the privilege *boxes reached* by name, not who holds a privilege: that would restate the
   "first to reach, cancelled when both reach" rule. The next box's Ops / roll / VP appear when the engine layout is loaded.
5. **Turn tooltip** shows the hand size (8 in the early war, 9 later) and the era shuffle turns (4, 8) as §5 asks; they are
   printed board facts, not computed rules.
6. **Font sizes snap to the token scale:** wordmark 19 px (mockup 21), 16 px condensed / tablet (17–18), turn and AR cell
   numerals 10.5 px (10), the "Known" tag 9.5 px (8.5).
7. **One "Known" tag** under the group of known AI cards: with the cards overlapping, per-card tags were hidden. The China mini
   comes after the known cards (spec: "after the backs"), and the overlap tightens for large hands (`miniStep`) so 8–9 cards
   still fit next to the meta text.
8. **"End of turn N"** readout (`log:session.endOfTurn`) when the round counter has passed the last AR (the moment between
   the last AR and the cleanup frame); the engine reports e.g. "AR 7" in a 6-AR turn there.
9. **VP chip then needle** run one after the other (600 + 600 ms at 1×).
10. **DEFCON 2 toast** is raised by the console's `defcon` handler (stage's DangerFrame only reads the state).
11. **Privilege note:** under the Space instrument for 2 s; when that instrument is not on screen (tablet, compact) a toast.
12. **VP title** is `ui_console:vp.title` ("Victory points" / "VP"): the glossary keeps 胜利点数 for long labels only, and the
    mockup's Chinese console says VP.
13. **Wordmark** stays the uppercase logo "TWILIGHT STRUGGLE" in Chinese too (as the mockup), with the subtitle
    "对战 DeepStruggle".
14. **Collapsed desktop rail:** clicking a strip icon expands the rail (the flyouts are the tablet's).
15. **Extensions** beyond §15.3: `Console.onSettings/onMenu/menuOpen/menuAlert`, `DefconGauge.caption`, `VpGauge.history`,
    `ArTrack.ar/readoutOnly`, `StatusPanel.after/heading`, `EffectsStrip.bare`, `Dispatches.bare`, `RailFlyout`, the connected
    sections, `useVpHistory` / `vpHistory`.
16. Effect chips for BOTH / NEUTRAL effects get a steel side bar and no glyph.

## QA fix round 1 (fix group F4, 2026-11-22)

Items from `docs/qa/TRIAGE.md` (console + rail part; the shell part is in `ui-shell.md` §9):

* **Q-041 compact VP readout never cut.** `.vpMini .vpRead` no longer ellipsizes; the mini gauge keeps its readout's width
  (`flex: 1 0 auto`, ≥ 56 px). When the compact bar is too narrow, `useSqueeze` (`console/squeeze.ts`) takes measured steps,
  cumulative CSS classes on the bar (`data-squeeze` 0–4): **1** the VP lead's side word → its glyph ("☭ +13"); **2** no
  "DEFCON" caption; **3** the AR readout's side word → its glyph ("第 4 行动轮 · ★（你）"); **4** no "VP" label. Only then do
  the turn lines ellipsize. Measurement: the two turn lines carry `data-fit`; after every render (layout effect, before
  paint) a line whose text overflows takes one more step; a new bar width (ResizeObserver), new text or late fonts start
  again from 0. Both forms of each side (word + glyph) are always rendered, so the steps never change the bar's text.
  The compact turn instrument's name (and tooltip) now include the AR readout ("Turn 6 of 10, Mid War · AR 1 · USSR (you)").
  Measured (fixture `prompt-influence`, all fit, nothing cut): 360 zh step 1, 360 en-XA step 2, 390 / 412 zh and en step 0,
  390 en-XA step 1, 844×390 zh step 3, live 844×390 zh at USSR +13 step 4 ("☭ +13", turn line whole).
* **Q-045 / Q-050 announcer.** Moved out of Dispatches into `rail/Announcer.tsx` (`AiAnnouncer`, mounted once by
  `GameScreen`): every arrangement has exactly one (desktop rail open or collapsed, tablet, phone); an AI entry is read
  with all its details (die and result, DEFCON, VP, space race...), and the headline reveal / resolution order lines are read
  from whichever side's entry holds them. One `<p>` per entry in a `role="log"` region (the last 8 kept). Keyboard play
  at 1024×768 now announces 62 changes over two turns (0 before). New `ui_console` keys `log.announcer`, `log.announceStop`.
* **Q-049 log Tab stops.** The tape is one Tab stop (was 274 by turn 3: every card / country name). The shared
  `CardRef` / `CountryRef` render `tabIndex=0`; inside the tape a MutationObserver sets them to −1 (request to common
  below for a prop instead). Keys on the tape: → / ← step into the names on screen, then ↑ ↓ ← → move between names, Home /
  End, Enter / Space open (the refs' own), Esc back to the tape; ↑ ↓ on the tape still scroll it. Described by a hidden hint
  (`ui_console:log.keysHint`). Measured at turn 3: 0 Tab stops inside the list (274 before), 1 Tab from the tape leaves the rail.
* **Q-056** `LangToggle` (console, start screen, compact menu) and the settings dossier switch through `useSwitchLanguage`.
* **Q-053** zh wordmark name follows the page title: "冷战热斗 · AI 对战：打开菜单".
* `Dispatches` no longer reads its `humanSide` prop (kept for the API).

## Requests (files I do not own)

1. **shell** (`src/ui/screens/GameScreen.tsx`, `src/ui/compact/*`):
   * Console variant: `desktop` at ≥ 1440 px wide, `condensed` at 1200–1439, `tablet`, `compact` (both compact layouts). Pass
     `onSettings` (Settings dossier) and `onMenu(anchor)` (menu popover / sheet) and `menuOpen`; `menuAlert` defaults to the
     §3.3 rule.
   * Desktop: `<Rail collapsed={settings.railCollapsed} onToggle={…}/>`; when collapsed the grid column is
     `var(--ts-rail-strip-w)`. The Rail binds **L**; on compact bind L to the log sheet yourself.
   * Tablet: `<RailStrip open onOpen/>` in the rail column and `<RailFlyout panel onClose/>` inside an absolutely positioned
     host over the table's right edge (it fills its containing block's height, right-aligned, z sheet).
   * Compact sheets: Adversary = `<AdversarySection/><EffectsSection/>`, Log = `<DispatchesSection bare/>`, Status =
     `<StatusPanel after={<Piles …/>}/>`. While the sheets are closed, register `hand:<ai>` on the dock's Adversary button and
     `milops:US/USSR`, `space:US/USSR` on its Status button (`root.anchors.ref(id)`), so deal flights still land.
   * Provide `CountryPulseContext` (common's request) so country refs in the log pulse the map.
2. **stage** (`src/ui/stage/RevealDock.tsx`, `ScoringSheet.tsx`): register `root.anchors.ref(\`card:${card}\`)` on the big
   card, so the VP chip starts from the dock / sheet (gap G7 `source.card`); don't raise the DEFCON 2 toast again (the
   console does). `VpChart` can take its points from `vpHistory(vm.log, { turn, vp })` / `useVpHistory(turn, vp)`.
3. **coordinator** (`docs/design/ui-spec.md` §6.3): Dice filter = entries with a `log:roll.*` detail (no `kind: "roll"`
   entries exist); the entry shows the side glyph, not a second side word (deviations 1–2). §15.3 W5: list the extensions
   above (`RailFlyout`, sections, `Console` callbacks).
4. **common** (optional, QA round 1): `MessageText` could take `refTabIndex?: 0 | -1` (passed to `CardRef` / `CountryRef`), so
   the Dispatches tape renders its names out of the Tab order instead of correcting them after mount.
5. **coordinator** (`docs/design/ui-spec.md` §3.3 / §12, QA round 1): the compact console's squeeze steps (side glyphs, no
   DEFCON caption, no VP label before any ellipsis); the AI announcer is the game screen's, not the Dispatches'.

## QA fix round 2 (fix group F4, 2026-11-23)

Items from `docs/qa/r2-TRIAGE.md` (console + rail part; the shell part is in `ui-shell.md` §12):

* **R-017 / R-010 (F4 part), touch areas** under `@media (pointer: coarse)`, every control keeping its look:
  * rail strip buttons (42 px, 8 px apart): `::after` 1 px all round → 44 × 44;
  * flyout × (28 px at top 5 / right 6): `::after` reaching the flyout's top and right edges → its top-right 44 × 44 (the
    flyout clips overflow, so the area stays inside it); the header's controls (log filters, "AR 3") end 48 px from the
    right edge instead of 40, clear of it;
  * console language (tablet "中" / "EN"), ⚙ and ☰ (32 px): `::after` −6 px → 44 × 44, the gap between them 6 → 12 px so the
    areas meet but never overlap; the compact ☰ (40 px) −2 px; the segmented EN | 中文 (desktop, start screen) halves are at
    least 44 px wide with a 44 px tall area (the switch no longer clips, the halves round their own outer corners).
  Measured with `elementFromPoint` at 1024×768 and 1366×1024 touch: no console, strip or × control under 44 px; the × area
  steals no other control's centre in any panel (1024×768, 1280×600, 720×520, 1194×834).
* Not changed: the log filters (All / Plays / Dice, 17 px tall) stay small on touch; a 44 px area would overlap the tape and
  the flyout's top edge. Worth a look with a taller flyout header on touch.
* `tests/ui/console/console.test.ts`: a game that ended inside a round now reads that round (F3's R-014 in `displayTurnAr`;
  `arModel` unchanged: phase "other", readout "AR 3 · USSR", the played pips kept).
