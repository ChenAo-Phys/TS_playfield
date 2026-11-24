# Handoff: UI common + cards (W3)

Owner: **common**. Files: `src/ui/common/**` (incl. `keymap.ts`, dev-only `demo/`), `src/ui/cards/**`, `tests/ui/common/**`,
`tests/ui/cards/**`, `src/i18n/locales/{en,zh-CN}/ui_common.json`. Spec: `docs/design/ui-spec.md` §2.4, §7.1, §7.5, §7.6,
§8.2 (hold), §8.3 (warning styling), §12 (keyboard), §15.3 "W3", §17.

## What was built

| File | Exports | Notes |
|---|---|---|
| `common/glyphs.ts` | `STAR_PATH`, `HAMMER_SICKLE_PATH`, `HAMMER_SICKLE_PATH_LARGE`, `LARGE_GLYPH_PX` (40), `glyphPath(side, px)` | spec paths verbatim; **new large hammer-and-sickle redraw** (§17 optional asset) used from 40 px |
| `common/SideGlyph.tsx` | `SideGlyph` | `{ side; size?; title?; className? }`; decorative unless `title` |
| `common/Seal.tsx` | `Seal` | `{ side; size? (40); className? }`; `role="img"`, side name in the UI language |
| `common/Icon.tsx` | `Icon`, `IconName`, `ICON_NAMES` | `{ name; size?; className? }`; the 16 names of §15.3, always `aria-hidden` |
| `common/Button.tsx` | `Button` (forwardRef) | spec props + `className`, `aria-label`, `aria-describedby`, `keyshortcuts`, `type`, `autoFocus`. Variants primary / ghost / brass / dark / danger × `onPaper`; sizes s (26) / m (30) / touch (44) |
| `common/HoldButton.tsx` | `HoldButton` (forwardRef), `HOLD_MS` | spec props + `globalEnter`, `disabled`, `onPaper` (default true), `onHoldChange`, `autoFocus` (focus on mount without scrolling; give it a `key` per option). Pointer, Enter, Space; danger ring via `stroke-dashoffset`; linear fill under reduced motion; visible "Press and hold to confirm" |
| `common/Stamp.tsx` | `Stamp` | spec props + `size` s/m/l, `glyph`, `animate` |
| `common/MessageText.tsx` | `MessageText`, `messageParts`, `parseParts`, `partsText`, `renderWithSentinels`, `MessagePart` | `{ message; refs? = true }`. No `innerHTML`: private-use sentinels split card/country params into `<CardRef>`/`<CountryRef>`; catalog markup `<strong> <em> <b> <i> <small> <br>` becomes elements; parameter text can never open a tag (tested) |
| `common/CardRef.tsx`, `CountryRef.tsx` | same | hover 250 ms → `zoomCard` (closes on leave) / pulse; click, Enter, Space too. Plain text outside a UiRoot / without a map |
| `common/countryPulse.ts` | `CountryPulseContext`, `useCountryPulse`, `CountryPulse` | `(country) => void`; no-op without a provider |
| `common/Popover.tsx` | `Popover` | spec props (`anchor` may also be `null` = centred) + `avoid` rects, `gap`, `role`, `label`, `passThrough`, `className`, `id`. Portal, `position: fixed`, flips, Esc (non-modal key scope), outside press closes |
| `common/placement.ts` | `placePopover`, `placeCentered`, `intersects` | pure, tested |
| `common/Dossier.tsx` | `Dossier`, `trapTab`, `useFocusReturn` | spec props + `compact`, `className`. Folder + tab + paper sheet, scrim, focus moves in / trapped / returned, Esc and scrim close only when `onClose` given; full-screen sheet when `UiRoot.layout` is compact |
| `common/Sheet.tsx` | `Sheet`, `swipeCloses` | spec props + `header`, `className`. Slide-up, grab (tap / swipe down / Esc / scrim), exit animation, focus in and back |
| `common/Toaster.tsx` | `Toaster`, `useToast` | renders `useOverlays().toasts`; per-toast countdown (`item.ms`, paused on hover/focus) → fade → `dismissToast(id)`; warn = hazard triangle; polite live region. Absolute in its container by default, `fixed` prop for the viewport |
| `common/Die.tsx` | `Die`, `PIPS` | spec props + `numeral` (flat odds face), `tilt`. aria-label names side and result ("USSR die: 6, success") |
| `common/RollingNumber.tsx` | `RollingNumber` | odometer roll (WAAPI), instant under reduced motion; `.ts-num` |
| `common/format.ts` | `formatSigned`, `formatNumber`, `MINUS` | U+2212 minus |
| `common/hooks.ts` | `useHoverIntent(ms, {onStart, onEnd, enabled})`, `useLongPress(ms, cb, opts)`, `usePrefersReducedMotion()`, `prefersReducedMotion()` | reduced motion = `settings.motion` → `<html data-motion>` → system query |
| `common/keymap.ts` | `useKey`, `KeymapProvider`, `KeyScope`, `KeymapRegistry`, `useKeymap`, `sharedKeymap`, `parseCombo`, `matchCombo`, `comboLabel`, … | see below |
| `common/index.ts` | everything above | |
| `cards/CardFace.tsx` | `CardFace`, `CARD_RATIO`, `opsSide` | spec props + `eager`, `imageLang`, `className`. Caption (ops badge: US square / USSR chamfered / neutral paper), `--ov` padding, dims, tags slot, cross-fade on image-language change, paper placeholder if the image fails. The name wraps **whole words** on two lines (a word wider than the line ends in "…"); the caption is a size container: content ≤ 70 px → one line with "…", ≤ 44 px → the Ops badge alone (the name stays in the card's accessible name and zoom) |
| `cards/CardBack.tsx` | `CardBack` | SVG (≈1 KB); `{ width; label?; className? }` |
| `cards/ChinaCardFace.tsx` | `ChinaCardFace` | spec props + face-up passthroughs (`caption`, `dim`, `tags`, `eager`, `className`). Face down: lacquer SVG, gold rim, five stars, "THE CHINA CARD / 中国牌" (both from `src/data`), HTML ribbon `ui:china.faceDown` |
| `cards/CardTags.tsx` | `CardTag`, `CardTags`, `cardTagKinds` | SCORING, STRANDS A SCORING CARD, "<side> EVENT", KNOWN TO AI; `CardTags({ card, warnings?, known?, noScoring?, compact? })` → pass to `CardFace.tags`. `compact` (a narrow overlapped strip): KNOWN TO AI is the eye alone (`data-compact`, the words in its `title` and a `ts-vh` span); `CardTag` takes `compact` / `title` |
| `cards/CardZoom.tsx` | `CardZoomHost`, `CardZoomContent` | `CardZoomHost({ actions? })` reads `useOverlays().zoom`; desktop = paper popover above the source, avoiding `anchors.rect("slip")`, pointer passes through; compact = `CardSheet` with `actions(card)` |
| `cards/CardDetails.tsx` | `CardMeta`, `CardText`, `PlayNotesList`, `useCardPlayNotes` | shared by zoom and sheet |
| `cards/CardSheet.tsx` | `CardSheet` | `{ card; onClose; actions? }` |
| `cards/playNotes.ts` | `cardPlayNotes`, `promptConcernsCard` | pure: event side, effective Ops (controller), next space box (engine layout), China Asia bonus, option warnings |
| `cards/sortHand.ts` | `sortHand`, `compareHand`, `mergeHandOrder` | `mergeHandOrder(prev, cards)` keeps the order stable within a turn (§7.2) |
| `cards/cardImages.ts` | `cardImageLang`, `useCardImageLang`, `useCardImageUrl` | `settings.cardImages` follow/en/zh; en-XA → en |
| `cards/index.ts` | everything above | |

### Keymap (`common/keymap.ts`)

```ts
useKey("z", undo);  useKey(["Mod+z"], undo);  useKey("Shift+Space", skipToMyTurn);
useKey("Enter", onUp, { event: "keyup" });            // opts: enabled, event, repeat, allowInInputs, allowOnControls, preventDefault, global
<KeymapProvider><App/></KeymapProvider>                // one per app (works without it: a shared registry on window)
<KeyScope modal onEscape={close}>…</KeyScope>           // Dossier/Sheet use it (modal); Popover uses modal={false}
```

* Ignores keys typed in inputs/textareas/selects/contenteditable, IME composition, auto-repeat, and events an element handler
  already `preventDefault`ed (so the map's own arrows/Enter never double-fire). Enter/Space on a focused button or link
  belong to that control.
* Dispatch walks scopes from the top: the latest matching binding runs first; returning `false` passes the key on.
  Unhandled Esc calls the topmost scope's `onEscape`. A modal scope blocks everything below it except `global` bindings; a
  non-modal scope (popover, card zoom) only claims Esc. So "Esc: cancel staging → close popover/dialog → back" works by
  having the prompts register Esc handlers that return `false` when there is nothing to cancel.
* `comboLabel("Mod+z")` → "Ctrl+Z" / "⌘Z" for key caps.

## How to test / demo

* `npx tsc --noEmit -p .` (clean) · `npx vitest run tests/ui/common tests/ui/cards tests/i18n tests/theme` → 14 files, 295 tests
  (common + cards: 6 files, 90 tests: keymap registry, placement, MessageText incl. injection and en-XA, component markup in
  en/zh, cards, play notes, hand order, zoom host desktop/compact, and a stylesheet rule test: no hex, font sizes only
  `--ts-fs-*`, z-index only `--ts-z-*`, every `--ts-` token exists).
* Demo (component sheet with a local UiRoot/overlay mock and a mock engine layout):
  `TSP_VITE_CACHE=node_modules/.vite-5181 npx vite --port 5181 --strictPort` →
  `http://localhost:5181/TS_playfield/src/ui/common/demo/index.html?lang=en` (`lang=en|zh|en-XA`,
  `open=dossier|sheet|zoom|popover|toasts`, `motion=reduce`, `side=US|USSR`, `layout=compact`). Key `t` shows a toast.
* Screenshots: `source scripts/pw-env.sh && node src/ui/common/demo/shoot.mjs` (server must be running) →
  `docs/design/shots/ui-common-{sheet-en,sheet-zh,sheet-xa,zoom-en,zoom-zh,dossier-en,dossier-zh-1024,toasts,popover,phone,phone-zh-sheet,phone-cardsheet,phone-dossier-xa}.png`.
* Checked in Chromium (Playwright): Dossier focus moves in, Tab stays inside, Esc closes and focus returns to the opener;
  a modal Sheet blocks global keys and closes on Esc; card zoom opens on click and hover-intent, closes on Esc and on
  leave; HoldButton confirms after 1.2 s of Enter or pointer and not on a short press; en-XA marks every component string
  (unmarked: the bilingual China Card artwork and the "TS" logo on card backs, by design).

## Deviations from the spec (with reasons)

* **Space Race note** uses `space_boxes[space[me] + 1]`, not `space_boxes[space[me]]` as §7.5 says: the engine
  (`SpaceRace::attempt_space`) tests the roll against the *next* box. The note shows "Box 2 → 3 · roll 1–3" and
  "Needs 2 Ops" without judging whether the card qualifies (no rules restated).
* **Errata label** is shown whenever the card images are English (there is no per-card list of which English images differ;
  every English image is a pre-errata printing, and the text panel is always the current errata).
* **Card zoom** lets the pointer through (`passThrough`) so a hover peek never blocks the hand; it closes on Esc, a press
  elsewhere, or (hover-opened) when the source's pointer leaves. Its source must do the leave part: `CardRef` does; the tray
  must too.
* `CardZoomHost` takes an optional `actions(card)` prop for the compact card sheet's answers (the prompts layer owns them).
* `Popover.anchor` also accepts `null` (centred), used when a zoom has no source element.
* `useLongPress(ms, callback, opts)` takes a callback (the spec lists only `ms`).
* **Caption names** (prep pass): `overflow-wrap: normal` + `text-overflow: ellipsis` replace `overflow-wrap: anywhere`, which split
  words on overlapped hand cards ("CONTAIN MENT"); narrow captions fall back to one line with "…", then to the badge alone
  (`@container` queries on `.cap`; checked in en / zh / en-XA at 1024–1600 px).
* Caption and button font sizes snap to the token scale: caption `--ts-fs-xs` (10.5 px en / 11.5 zh, mockup 11 px), button m
  `--ts-fs-s` (en) / `--ts-fs-m` (zh). Colours with alpha are `color-mix()` on tokens (no rgba literals).
* The face-down China Card titles come from `cardInfo(6).title.{en,zh}` (bilingual artwork, as §17 asks), not `cardName`.
* Tests are `.test.ts` with `createElement` (vitest only collects `*.test.ts`).
* The keymap lives in `src/ui/common/keymap.ts` (moved from §15.3's `src/ui/state/keymap.ts`, as ARCHITECTURE.md says).

## Requests / notes for other owners

1. **shell**: wrap the app in one `<KeymapProvider>`; provide `<CountryPulseContext.Provider value={id => mapRef.current?.pulse(id)}>`;
   render `<Toaster/>` inside the table container (or `fixed`) and one `<CardZoomHost actions={card => …prompts' answers…}/>`.
   Don't create `src/ui/state/keymap.ts`.
2. **runner + state** (`UiRootProvider`): keep `ZoomState.from` exactly the element passed to `zoomCard` (hover peeks close by
   identity); default toast `ms` = `TIMING.toast.default` (3000); `zoomCard` on the same card may simply replace the state.
3. **tray**: build hand cards from `CardFace` (`caption`, `overlapRight`, `dim`, `eager`) + `CardTags` (`warnings` from the
   card's option, `known` from `HAND_<human>_KNOWN`), order with `mergeHandOrder`, China slot with `ChinaCardFace`, pile
   thumbnails with `CardBack`/`CardFace`. Open zooms with `useHoverIntent(250, { onStart: el => root.zoomCard(id, el), onEnd: closeIfMine })`.
4. **prompts**: Esc handlers via `useKey("Escape", …)` returning `false` when nothing is staged; hold options with
   `HoldButton` (`globalEnter` for the slip's primary); the compact card-sheet answers through `CardZoomHost.actions`.
   Warnings render with `MessageText` of `warningMessage(w)`; the zoom already lists them.
5. **map** (`src/ui/map/glyphs.ts`): may re-export `STAR_PATH`/`HAMMER_SICKLE_PATH` from `src/ui/common/glyphs.ts`, and use
   `glyphPath(side, px)` for large marks (superpower plates) to get the redraw.
6. **coordinator / spec**: §7.5 "`space_boxes[space[me]]`" should read `[space[me] + 1]`.

## QA round 1 fixes (fix group F3, 2026-11-23)

* **`turnAr.ts`** (Q-031): `displayTurnAr(state, ending?) → { phase: "setup" | "headline" | "ar" | "end", turn, ar }` and
  `lastActionRound(state)`. The engine's counters run past the last round played (turn 3 "AR 7" in the cleanup, "AR 9" after
  the turn-8 mil-ops check, "turn 11 · AR 0" after final scoring); every turn / AR readout should ask this helper. Used by the
  slip head; the console readout and tracks (F4) and the telex stats (F2) are requested to.
* **`touch.ts`** (Q-032): `useTouchUi()` — true when the last pointer was touch / pen, else (before any input) when
  `(hover: none) and (pointer: coarse)` matches; `TouchUiContext` forces it (tests, demos); server render = mouse.
  `createTouchSignal(window)` for tests.
* **`Sheet`** (Q-028 / Q-029, §3.4): in compact landscape the panel opens over the left (map) column only
  (`width: calc(100% - var(--ts-c-side-col-w))`), the side column stays in view under the scrim. A control in the sheet header
  (the hand drawer's done button) is no longer taken for the grab: a tap on it closed the sheet (`data-sheet-grab` marks the grab).
* **Cards** (Q-029): the compact card sheet's answer is a sticky footer (in view at 844 × 390); the play-mode rows (tall) scroll.
* Tests: `tests/ui/common/qa-fixes.test.ts`.

## QA round 2 (r2-hand-wait, 2026-11-23)

* **`CardFace spine`** (cards, owner decision OD-3): with `caption`, an overlapped hand card draws its name as a spine
  — `<span class="spine spine_<side>" aria-hidden><span class="spineText">name</span></span>`, the face marked
  `data-spine` / `.spined`. CSS (`cards.module.css`): absolute band 19 px wide (`--spine-w`; `.small` 17 px with
  `--ts-fs-micro` en / `--ts-fs-xs` zh and less tracking) from the top edge to 3 px above the Ops badge, centred over it;
  `writing-mode: vertical-rl`, `text-orientation: mixed` (Latin turned to read top to bottom, CJK upright);
  `--ts-font-ui` caps in en, `--ts-font-body` in zh; one line, `text-overflow: ellipsis`; side tones = the Ops badge's
  (US `--ts-us-700` + paper, USSR `--ts-ussr-700` + gold, neutral `--ts-ink-900` + paper) with a hairline and shadow to
  lift it off the art; dims follow `dim_passive` / `dim_unplayable`; a border in forced colours.
  **`--spine-on`** (default 1): the band's opacity; the caption's name gets `1 − --spine-on`, so a host that sets
  `--spine-on: 0` (the tray, on a hovered / focused / staged card) cross-fades to the normal caption. The caption keeps
  the Ops badge either way. The image's `alt` (the name) is unchanged.
* Tests: `tests/ui/cards/cards.test.ts` ("spine": markup per side, needs the caption and ≥ 64 px, alt unchanged; the
  stylesheet's vertical writing, ellipsis, fonts, side tones, dims and the `--spine-on` switch).

## QA round 2 fixes (fix group F3, 2026-11-23)

* **`Button`** (R-011): the `kbd` cap renders only when `useTouchUi()` is false (no key hints on touch screens, ui-spec
  §3.3 as built Q-032); `aria-keyshortcuts` stays. This covers every Button user (the slip, dialog parts, the hand
  prompt bar, the scoring sheet's and headline papers' Continue, the play-mode Back to hand).
* **`displayTurnAr`** (R-014): phase GAME_OVER with the ending in the state's turn (or no ending given) and the AR
  counter within 1 … the turn's last round is that round (`phase: "ar"`), the game-over telex's rule
  (`GameOverTelex.tsx` `inRound`): 20 VP in AR 2 of turn 5 reads "Turn 5 · AR 2" in the slip head and the console,
  as the telex. A held scoring card / military-ops ending (counter past the last round) and final scoring stay "End
  of turn N". The telex may call `displayTurnAr` instead of its copy (F2, optional).
* **`Toaster`** (R-010): the 26 px close answers a 44 px hit area on coarse pointers (`::after`).
* Tests: `tests/ui/common/round2.test.ts` (the five recorded endings against the telex's rule, GAME_OVER past the last
  round / after final scoring, the Button on touch / mouse, the toast's stylesheet).

## QA round 2 integration (integrator, 2026-11-23)

* **`Button`**: without an explicit `keyshortcuts`, `aria-keyshortcuts` is derived from a single-key cap
  (`kbdShortcut(kbd)`: a Latin letter as is, "↵" → Enter, "Esc" → Escape; translated caps such as Space / 空格 give
  none). R-011 hid the cap on touch screens and most Buttons had no `keyshortcuts`, so on touch the shortcut was no longer
  exposed at all (and `play.mjs`, which found done / primary buttons by their cap, could not answer a touch game's
  done prompts: 3 fallbacks at 390×844 zh). `play.mjs` now finds them by cap or by `aria-keyshortcuts`
  (`keyButton`). Tests: `tests/ui/prompts/r2-integrate.test.ts`.


## QA round 3 integration (integrator, 2026-11-23)

* **`Sheet`** (R3-09, F4's request): on coarse pointers a full-height sheet (`height="full"`: the compact-landscape
  play-mode sheet) starts at the screen's top, where the grab's 12 px reach above the sheet was off-screen (grab at
  y 1, area from −11 at 844 × 390). `.h_full .grab` is 44 px tall and its `::after` area starts at the sheet's top;
  other sheets keep the 12 px reach over the scrim. Measured at 844 × 390 and 640 × 360: grab 44 px, area 45 px from
  y 0; Event · Operations · Space race · Back to hand still fit without scrolling at 640 × 360 … 926 × 428 (en / zh /
  en-XA); keyboard Enter on the grab still returns the card to the hand with focus on it (D-201).
