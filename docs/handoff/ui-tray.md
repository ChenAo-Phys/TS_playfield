# Handoff: UI tray (W6)

Owner: **tray**. Files: `src/ui/tray/**` (dev-only `demo/`), `tests/ui/tray/**`, `src/i18n/locales/{en,zh-CN}/ui_tray.json`.
Spec: `docs/design/ui-spec.md` §7.2–§7.4, §7.6, §10.1 (headline slot), the tray rows of §9.4, §15.3 "W6 tray" (with the
brief's deviation: the tray never imports `src/ui/prompts`; the shell passes `offered` / `staged` / the slip).

## What was built

| File | Exports | Notes |
|---|---|---|
| `tray/Tray.tsx` | `Tray`, `useHandView`, `computeHandView`, `HandView`, `HandViewInput` | The near edge of the table (z tray): fade + walnut edge; slip slot · headline slot · hand · China slot · piles. Draws `Shown.state` + beat overrides. Keeps the last prompt's look, inert, while your own frames resolve (no flicker) |
| `tray/Hand.tsx` | `Hand`, `moveCardFocus` | Order via `mergeHandOrder`; fan ±2.2°; ResizeObserver fit; overlap capped at 55 % of a card, past which a scroller (no fan, 24 px edge fades, the wheel scrolls it) holds the remainder; roving tab stop; ←/→; anchors `hand:<human>`, `card:<id>` |
| `tray/HandCard.tsx` | `HandCard` | `CardFace` (caption, `overlapRight`, dim, eager) + `CardTags`; states neutral / playable / unplayable / passive / lifted / staged (+ verb `Stamp` in `--ts-me`); hover 250 ms zoom (closes its own peek), Space toggles the zoom, long press on touch, click/Enter activates a playable or staged card, any other click pins the zoom |
| `tray/ChinaSlot.tsx` | `ChinaSlot` | Felt 118 (tablet 96), card 92 (78) at −3°; face up offered → glow; face up not offered → passive; face down → lacquer back, desaturated, `title` "Cannot be played until next turn"; with the AI → dashed outline "With the US"; staged / lifted states; anchor `china:<human>` |
| `tray/Piles.tsx` | `Piles` | Deck (count tooltip only) · Discard · Removed (buttons → `onOpen`); thumbnails = `CardBack` / top `CardFace` (removed greyscale); `RollingNumber` counts; anchors `deck`, `discard`, `removed`; variants `desktop`, `tablet` (icon only, 76 px), `panel` (a row, for the compact Status sheet) |
| `tray/HeadlineSlot.tsx` | `HeadlineSlot` | Your committed headline at the left end of the hand: face down + COMMITTED, then face up + REVEALED until it resolves; zoomable (you know the card); anchor `headline:<human>`; renders nothing when `card` is null |
| `tray/HandDrawer.tsx` | `HandDrawer` | Compact (§7.6): common `Sheet` with header "Your hand · n" + China status, scroll-snapping strip of 112 × 157 cards (China Card last); tap = card sheet (the shared zoom, which carries the prompt's answers via `CardZoomHost.actions`); Enter on an offered card activates; Space zooms; ←/→ |
| `tray/trayBeats.ts` | `registerTrayBeats`, `TrayStore`, `NO_OVERRIDES`, `chosenHeadline`, `play`, `wait`, types | The beat handlers without React (Node-tested) |
| `tray/useTrayBeats.tsx` | `useTrayBeats(director, humanSide)`, `TrayBeatsProvider`, `WithTrayBeats`, `TrayStoreContext`, `useTrayOverrides`, `useTrayStore` | §15.3 `useTrayBeats`; overrides dropped on every commit (`useOnCommit`) |
| `tray/trayModel.ts` | `fitHand`, `fanAngle`, `handMode`, `handCardState`, `handOffered`, `stampVerb`, `liftedOutCard`, `isHandPrompt`, `knownToAi`, `locationOf`, `headlineSlotOf`, `pileTop`, `chinaView`, `handCardWidth`, `chinaCardWidth`, constants | Pure model |
| `tray/useWide.ts` | `useWide()` | ≥ 1600 px (112 × 157 hand cards) |
| `tray/index.ts` | everything above | |

### Beats (registered once per provider; ui-spec §9.4)

| Beat | What the tray does | Reduced motion / Skip |
|---|---|---|
| `reveal` (your card-played) | the hand card glides (WAAPI, 300 ms `out`, × speed) into the `slip` anchor and fades; its slot then shows the dashed "lifted out" outline until the commit. A card already lifted out (on the stage) does not glide | state only |
| `hand-revealed` (your side) | KNOWN TO AI tags appear and blink one by one (350 ms each, stagger 90) | tags appear |
| `headline-chosen` (your side) | the chosen card (from the frame's `card-moved` → `HEADLINE_COMMITTED`) leaves the hand; the headline slot appears face down with COMMITTED and slides in from the card's place (400 ms `out`) | slot appears |
| `china` (you give / get it, or it turns over) | toast `ui:toast.china` when the holder changes (2500 ms; **the tray owns this toast**); leaving: slides toward `china:<ai>` (else up-right) and fades; arriving: from `china:<ai>`; same holder: flips (rotateY, 300 ms). A China Card already played out of the slot doesn't slide | toast + swap |
| `deal` with `before.draw_deck_count ≤ 2`, `banner` turn 4 / 8 | the deck count pulses once per frame (never blocks) | opacity flash |

The AI-side halves (adversary hand-revealed / headline-chosen) are the rail's; `card-moved` / `deal` / `reshuffle` flights are the
runner's `FlightLayer` (they use the anchors above).

## Public API (props)

```tsx
<Tray
  variant="desktop" | "tablet"
  slip={<OrdersSlip variant="desktop" />}             // placed in a slot of width var(--ts-slip-w) (tablet 296), stretched
  offered={Map<cardId, OptionPolicy>}                  // the prompt's card options (hand cards and 6); empty when none
  staged={number | null}                               // the staged card
  onActivateCard={(card) => …}                         // click / Enter on an offered or staged card (and the China Card)
  onOpenPile={(pile: "discard" | "removed") => …}      // open the pile viewer (CardPicker browse)
  className?
/>
<HandDrawer open onClose offered staged onActivateCard className? />   // keep mounted; `open` from the shell
<Hand cards offered staged liftedOut mode onActivate  variant? humanSide? known? gone? blink? blinkMs? verb? interactive? className? />
<HandCard card state tags overlapRight onActivate  width? angle? offset? verb? side? interactive? blink? tabIndex? onFocus? known? elRef? className? />
<ChinaSlot china humanSide policy onActivate  variant? mode? staged? lifted? verb? interactive? tabIndex? className? />
<Piles deck discard removed onOpen  variant?: "desktop" | "tablet" | "panel"  className? />
<HeadlineSlot card faceDown  variant? humanSide? className? />
<TrayBeatsProvider humanSide?>…</TrayBeatsProvider>   // optional, see below
isHandPrompt(vm.prompt, hand)                          // compact: auto-open the drawer on headline / action-card / in-hand event-card
```

`Tray` and `HandDrawer` mount their own `TrayBeatsProvider` when none is above. Wrapping the whole game screen in one
`<TrayBeatsProvider>` keeps the handlers running even when neither is mounted (compact with the drawer unmounted).

## How to test / demo

* `npx tsc --noEmit -p .` — clean for `src/ui/tray` and `tests/ui/tray` (other workstreams' in-progress files had errors at the time).
* `npx vitest run tests/ui/tray tests/i18n tests/theme` → 12 files, 290 tests (tray: 5 files, 85 tests: model incl. fixtures,
  the freeze logic, beat handlers on recorded frames, markup in en / zh on fixtures, the §18.2 stylesheet rules + reduced-motion
  rules).
* Demo: `TSP_VITE_CACHE=node_modules/.vite-5188 npx vite --port 5188 --strictPort` →
  `http://localhost:5188/TS_playfield/src/ui/tray/demo/index.html?scene=prompt-action-card-china&lang=en`.
  The real Tray / HandDrawer on fixtures inside a stand-in game grid (real map, `FlightLayer`, `CardZoomHost`, a stub slip,
  a local stand-in policy so staging and `choose` can be tried; the rail panel logs the recorded calls). Parameters:
  DemoHarness's (`scene`, `lang=en|zh|en-XA`, `view`, `speed`, `motion`, `start`…) plus `staged=<card>`, `drop=25,26`
  (unplayable cards), `variant=committed` (your headline face down) / `variant=neutral` (no prompt), `drawer=closed`, `shot=1`.
  Good scenes: `prompt-action-card-china`, `prompt-action-card-warning`, `prompt-event-card`, `prompt-headline`, `prompt-play-mode`,
  `seq-ai-turn&start=end` (8 cards after a reshuffle), sequences `seq-undo` (glide), `seq-ai-turn` (blink), `seq-headline`
  (headline slot), `seq-over-vp20` (China Card passes + toast).
* Screenshots: `source scripts/pw-env.sh && node src/ui/tray/demo/shoot.mjs [name…]` (server running) →
  `docs/design/shots/ui-tray-*.png`: desktop en / zh / en-XA, staged, warning, event-card zh, headline, committed, play-mode,
  neutral, reshuffle, zoom, 1366 en / zh, tablet 1024 en / zh, phone drawer en / zh / en-XA, phone closed, reduced motion.
* Checked in Chromium (Playwright): the glide, blink, headline slot and China pass all run on the recorded sequences with no
  console errors; Tab lands on one card, ←/→ move (on to the China Card), Space opens the zoom, Esc closes it, Enter plays;
  hover opens the zoom after 250 ms and leaving closes it; a scoring card stages on the first click and is chosen on the
  second; at 1366 × 768 a 9-card hand switches to the scroller (55 % overlap) and the wheel scrolls it. In en-XA every tray string is marked.

## Deviations from the spec (with reasons)

1. **Props** (brief): `Tray({ variant, slip, offered, staged, onActivateCard, onOpenPile })`; `HandDrawer` likewise; no import of
   `src/ui/prompts`. The tray derives the hand's mode, the lifted-out card (`prompt.pendingCard` still in hand and not an
   option) and the stamp verb itself.
2. **Freeze**: while your own frames resolve (no prompt, no AI activity) the tray keeps the last prompt's look, inert (§8.1's
   "no flicker" applied to the hand). The memory is dropped as soon as the AI thinks or animates.
3. **Scroll mode** (coordinator decision on §7.2, prep-ui pass): the overlap is capped at 55 % of a card (`fitHand` returns
   `{ ov: 0.55·w, scroll: true }`) and only the remainder scrolls (no fan, 24 px edge fades); the scroller extends 34 px above the
   tray for the lift and tags, and the wheel scrolls it sideways. Measured in the app: 1366 × 768 with the 9-card headline hand
   (hand 446 px) shows ~8 cards (was ~4 with the old 8 px gaps); 1440 × 900 with 8 cards beside the headline slot (hand 410 px)
   shows ~7. Screenshots: `hand-1366-headline9-en.png`, `hand-1440-committed8-en.png` (prep-ui scratch; the shell demo's new
   `variant=committed` still is the 1440 case).
4. **Tags on overlapped cards** are centred on the visible strip; where that strip is under 84 px the KNOWN TO AI tag shrinks to
   its eye (`CardTags compact`; the tray's own eye tag is gone). Captions on overlapped cards: whole words, one line with "…"
   on a narrow strip, the Ops badge alone at the 55 % cap (common's `@container` rules). A hovered / focused / staged card's
   caption uses the full width.
5. **Headline slot** is its own flex item between the slip and the hand (84 × 118, tablet 70 × 98, on a dashed mat labelled
   HEADLINE), not a card inside the fan. Size not in the spec.
6. **Stamp verbs**: a display-only table — discard for event-card prompts of cards 10, 77, 95, 98, 108, 250 and for the
   Quagmire / Bear Trap action-card titles; give for 49; else play.
7. **China slot with the AI**: a dashed outline "With the US" (side short name) and the usual label "China Card · face up/down".
8. **Pile labels**: new short keys "Deck / Discard / Removed" (the `ui:pile.*` long names are used in the accessible names and
   tooltips).
9. **Deck pulse** also on the turn 4 / 8 banner (§9.4 `turn-start` row asks for "a deck pulse").
10. **Drawer** is the common modal `Sheet` (scrim); its height is ~233 px (grab + header + 112 × 157 strip), close to the 224 px.
11. Clicking a non-playable card pins its zoom (useful on touch and without hover); a long press zooms on touch.

## i18n

`ui_tray` (en + zh-CN): `hand.{label, empty, region}`, `card.{ops, aria, ariaKnown, state.*}`, `china.{label.*, withSide, aria.*}`,
`pile.{short.*, count, group, open}`, `headline.aria.*`, `drawer.{label, title}`. Reused: `ui:stamp.*`, `ui:pile.*`,
`ui:china.*`, `ui:headline.title`, `ui:card.scoring`, `ui:side.*`, `ui:toast.china`, `ui:adversary.china(Where)`.

## Requests (files I do not own)

1. **shell** (`src/ui/screens/GameScreen.tsx`, `src/ui/compact/**`): render `<Tray variant slip={<OrdersSlip variant/>} offered
   staged onActivateCard={usePromptActions().activateCard} onOpenPile={p => open <CardPicker browse={p}/>}/>` in grid area
   `tray` (desktop / tablet). `offered` = the current prompt's `kind: "card"` options as `Map<id, policyFor(...)>` (headline,
   action-card, event-card), `staged` = `staging.staged?.kind === "card" ? staging.staged.id : null`. Compact: keep
   `<HandDrawer open={panel === "hand"} …/>` mounted and open it when `isHandPrompt(vm.prompt, hand)` becomes true (close it on a
   non-card prompt); put `<Piles variant="panel" …/>` in the Status sheet; register `hand:<human>` on the dock's Hand button
   (`root.anchors.ref`) so deal flights land there while the drawer is closed. Optionally wrap the screen in
   `<TrayBeatsProvider>`.
2. **prompts** (`OrdersSlip`): fill the tray's slip slot (`height: 100%` / flex 1; no own width on desktop / tablet, the slot is
   `--ts-slip-w` / 296 px) and register the anchor `slip` on the card clip (the tray glides your played card there). The
   play-mode stage owns the stage → slip motion for a card that is lifted out (the tray only glides cards still in the fan).
3. ~~**rail**: no China toast; `china:<ai>` anchor~~ — checked / done (prep-ui): the rail has no `china` handler (one toast,
   seen in the app on `seq-over-vp20`, desktop and phone); `china:<ai>` is the China mini while the AI holds it, else the
   dossier's hand row, and the collapsed rail / tablet strip's and the compact dock's Adversary button while that panel is closed.
4. ~~**common + cards**: caption word splitting; `CardTags compact`~~ — done (prep-ui).
5. **runner** (note): the tray's `reveal` handler marks your played card as gone; `FlightLayer` still flies `card-moved` from
   `card:<id>` (now an outline) to the pile, which reads fine.
6. ~~**coordinator / spec §7.2** (decision)~~ — decided and done: cap at 55 %, scroll the remainder (deviation 3). The spec's
   §7.2 "stop overlapping and scroll" should read "keep the 55 % overlap and scroll the rest".

## QA round 1 fixes (fix group F3, 2026-11-23)

* **Q-028** The compact hand drawer's header carries the hand prompt's question and its done button (`HandPromptBar` from the
  prompts layer, above "YOUR HAND · n"): Blockade's "Discard nothing — lose West Germany influence" is in view when the drawer
  opens by itself (§3.3 auto-open kept). New dependency **tray → prompts** (`HandDrawer` imports `prompts/HandPromptBar`; the
  prompts layer never imports the tray). In compact landscape the drawer, like every sheet, covers the map column only (common).
* **Q-032** The staged card's state words say "tap again to confirm" on touch (`cardStateKey(state, touch)`,
  `ui_tray:card.state.stagedTouch`) in the hand, the drawer and the China slot.
* Tests: `tests/ui/tray/components.test.ts` (the drawer with a Blockade prompt, no bar without a hand prompt),
  `model.test.ts` (`cardStateKey`); `helpers.ts`' controller double now has `getSnapshot` / `subscribe` (the prompt store).

## QA round 2 (r2-hand-wait, 2026-11-23)

### Spines on overlapped hand cards (owner decision OD-3)

Real hands hold 6–9 cards, and at 1280–1440 px the 55 % overlap cap left each covered card a ~47–72 px strip whose
caption showed "NUCLEA…" or only the Ops badge. Now **every card the next one covers wears a spine**: its name as a
vertical label in a 19 px band (17 px on 86 px tablet cards) along the visible strip's left edge, running from the top
edge down to the Ops badge and centred over it, like a book spine.

* Model: `spineOf(i, n, fit, w)` / `SPINE_FROM` (0.12) in `trayModel.ts`: a spine when the next card covers at least
  12 % of the card (below that the caption's two-line name still fits); never on the rightmost card. `Hand` passes
  `spine` to `HandCard` → `CardFace spine` (cards; see ui-common.md for the CSS).
* Look: the band is in the card's **side tone** — the Ops badge's palette (US navy `--ts-us-700` / paper text, USSR
  `--ts-ussr-700` / gold, neutral ink `--ts-ink-900` / paper). The printed faces have one teal era band for all three
  eras, so era carries no colour of its own; the side is what a player scans a hand for (whose event). English:
  `--ts-font-ui` (Barlow Condensed) caps, reading top to bottom; Chinese: the CJK stack (`--ts-font-body`), upright.
  Names longer than the band end in "…" (1440 × 900: 0–1 per hand in en / zh; tablet: 1; en-XA's marks: 3–4).
* States: hover, keyboard focus and staging show the normal caption (`Hand.module.css` sets `--spine-on: 0` with the
  existing `--ov: 0`, a 220 ms cross-fade); dims (passive / unplayable) filter the band like the image; a lifted-out
  card hides it with the face; tags (SCORING, the KNOWN TO AI eye) and staged stamps sit above it; the accessible name
  and the hover zoom are unchanged (the spine is `aria-hidden`).
* **Smaller cards were not needed**: the spine reads at 104 and 86 px; shrinking the cards would only shrink the art and
  the badge, not lengthen the spine. Checked at 1280 × 720, 1366 × 768, 1440 × 900, 1920 × 1080 (no spines: 112 px
  cards fit with ≥ 108 px strips) and 1024 × 768 tablet, with 5 / 7 / 9 cards and 8 + the headline slot
  (`prompt-coup-target-us`, `prompt-coup-target`, `prompt-headline`, `?variant=committed`), en / zh / en-XA: every
  overlapped card has a spine, no spine is covered by its neighbour (elementFromPoint along it), every Ops badge is
  visible (fan mode), no card has spine and caption name at once, a hovered card shows its caption, no page scroll,
  no console errors. Montages: `docs/qa/shots/r2-hand-wait/spines-matrix.png` (5 viewports × 4 hands),
  `spines-detail.png` (1440 en, 1366 zh, 1280 en-XA, 1024 en at 1×).
* The play-through driver needed no change: it clicks a visible point of the card button, and the spine is inside it
  (`play.mjs --side USSR --until 4 --game-seed 1 --w 1440 --h 900`: 87 answers, 114 clicks, 0 fallbacks, 0
  mismatches, 0 errors).

### Esc "Back to hand" focuses the returned card

`Hand` follows the prompt store's `focusCard` (set by the play-mode stage's Esc / Back to hand, `backToHand` in
prompts): once that card is in the hand, not lifted, and the hand is active and interactive, it is focused (the
roving tab stop moves there) and the request is cleared (it lapses after 3 s otherwise). New dependency
**tray → prompts/store** (`promptStore`). Checked in the real app at 1440 × 900: after Esc (keyboard or mouse play)
and after the Back to hand button, `document.activeElement` is the card (`esc-back-to-hand-focus.png`).

### Tests

`model.test.ts` (`spineOf` on hand-made fits and the widths measured in the app), `components.test.ts` ("spines":
markup in en / zh, accessible name unchanged, dims / staged keep the element, the Hand.module.css `--spine-on: 0`
rule for hover / focus-visible / staged).

## QA round 2 fixes (fix group F3, 2026-11-23)

### R-013 Chinese spines end in whole characters and drawn dots

On 86 px tablet cards the zh band holds 7 upright characters; the browser's `text-overflow: ellipsis` (and any
typed "…") is drawn *into* the last upright glyph in vertical text: 我们在德黑兰 read "我们在德黑羊", 红色恐慌/大 read
"红色恐慌 太". Now (`CardFace`, cards):

* `spineName(name, cjk)`: in Chinese a "/" becomes the upright full-width "／".
* `useSpineText` (Chinese only): renders the whole name, measures each character's end along the band with a `Range`
  (no DOM writes), and keeps the longest run of whole characters that leaves room for the dots (`cutSpine`, pure),
  again when the name, card width or language changes. A cut name is followed by `.spineMore`: three small dots drawn
  with a gradient (no font involved), .75 em long, half an em after the text, centred across the band.
* `:root:lang(zh) .spine { text-overflow: clip }`: a name that still overflows is clipped, never deformed.
* English keeps the CSS ellipsis ("COLONIAL REAR GUAR…").

Result at 1024 × 768 zh (`?scene=prompt-headline`): "我们在德黑兰︙", "红色恐慌／大︙", the 7-character 殖民地后卫部队
whole; checked at DSF 1, 2, 8. Tests: `tests/ui/cards/round2.test.ts` (the two names at 86 px cards from the CSS
model, the slash, a name that fits, measured ends, the SSR markup, the stylesheet), the updated zh spine expectation
in `tests/ui/tray/components.test.ts`.

### R-016 Esc / Back to hand after the China Card focuses the China Card

`ChinaSlot` serves the prompt store's `focusCard === 6` as `Hand` serves its own cards: `chinaFocusReady(request,
{ view, lifted, interactive, mode })` (face up, back from the stage, clickable, the hand choosing again) and
`serveFocusRequest(store, el)` (clear the request, focus without scrolling, then into view), both in `trayModel.ts`;
`Hand` uses the same helper. Checked in the real app (dev, `esc-china.mjs`, seeds 1 and 3, 1440 × 900 and 1024 × 768):
after Esc on the stage `document.activeElement` is `[data-card="6"]` in the China slot at 0.1 / 0.4 / 1 / 3.5 s, in
both China Card cases; a hand card still gets its own focus. The compact drawer stays deferred (D-201).

### R-010 Piles on coarse pointers

Discard and Removed keep their look and answer 44 px tall hit areas (`::after`): the 5 px gap between them splits,
Discard reaches up over the deck row (not a control), Removed down into the piles' bottom padding (tablet 34 px rows:
8 / 2.5 px; desktop 38 px rows: 4 / 2.5 px); the compact Status panel's tiles are 44 px already.

Tests: `tests/ui/tray/round2.test.ts`.

