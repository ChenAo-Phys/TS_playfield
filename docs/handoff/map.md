# Handoff: map (`src/ui/map/**`)

Owner: **map**. Files: `src/ui/map/**` (incl. the dev-only demo `src/ui/map/demo/`), `scripts/build-map.mjs`,
`tests/map/**`, screenshots `docs/design/shots/map-*.png`. Spec: `docs/design/ui-spec.md` §4 (+ §9.4 influence/control
rows, §15.1 map types).

## What was built

| File | What |
|---|---|
| `scripts/build-map.mjs` | Reproducible generator. Box centres from `docs/notes/countries.json` board positions (`(x−30)·0.75, (y−60)·0.75`, Europe widened 4–5 %), relaxed so 88×56 boxes keep ≥ 7 u apart (max shift 58.7 u ≤ 60, mean 13 u). Plates at the spec centres, nudged until ≥ 8 u clear of every box. Land: Natural Earth **1:50m** (`world-atlas`, public domain) merged per land class with `topojson-client`, projected with `d3-geo` Mercator (antimeridian-clipped), warped onto the board by a regularised thin-plate spline (84 country anchors + board anchors + far-field affine frame), clipped, Douglas–Peucker simplified (0.45 u), relative paths at 1 decimal. Internal borders as a separate dashed path. Also writes the tileable paper grain (`src/ui/map/assets/paper.webp`, 4.4 KB). `--check` exits 1 when the committed output is stale. |
| `geometry.generated.ts` | `GEOMETRY` (128 KB < 150 KB budget): viewBox `0 0 1775 1090`, box 88×56, `countries[id]` centres, `board[id]` (unrelaxed, tests only), `superpowers`, `plates[slot]`, `links` `[a, b, inter]` (112, 8 inter-regional), `land[class]` (12 classes), `borders`. |
| `layout.ts` | Pure layout: `BOX` anatomy constants, `COUNTRY_LAYOUT[id]` (centre, rect, scoring slot, band kind), `LINKS`, `SUPERPOWER_LINKS`, `JAPAN_WRAP`, `PLATES`, `SUPERPOWER_PLATES`, `LETTERING`, `areaRect(slot | "WESTERN_EUROPE" | "EASTERN_EUROPE")`, `countriesOfSlot`, `boundsOf`, `nearestInDirection`, `readingOrder`, hit tests. |
| `camera.ts` / `useCamera.ts` | Camera maths (fit with tray overlap, limits, clamp, zoom-around, frame, visibility) + the DOM hook: wheel 1.15×/notch around the cursor, drag with 6 px slop, pinch, double-click / double-tap 2×, animated viewBox (350 ms ease-in-out; cut under reduced motion). The viewBox is written straight to the SVG; React re-renders only when a gesture settles (detail level). |
| `MapView.tsx` | `MapView = forwardRef<MapHandle, MapViewProps>`: SVG root, all layers in spec paint order, 84 `CountryBox`es, plates, annotations, tooltip host, keyboard model, follow camera, region prompt, the imperative handle. |
| `CountryBox.tsx` | Box anatomy §4.3 and every §4.4 state: control tint/border + flipped counter, battleground band + stub + red stability box, Austria/Finland split band, quiet/loud/danger/hover rings (two-tone, marching under `--ts-ambient-state`), dimmed non-targets, ghost marker (+n / struck −1), empty-slot glyph hints at detail level, overview dots, hatch (`patterns`), touch-padded hit area, focus ring, pulse rect. US square / USSR chamfered counters, glyph + position + words → side never by colour alone. |
| `Plates.tsx` | Region plates ("if scored now": name, IF SCORED + net / "wins" with hazard underline, US-first standing chips, values; SE Asia line) and superpower plates. |
| `Layers.tsx` | Defs, sea + line pattern, two coast water lines, land, dashed borders, paper grain (static texture, multiply 7 %), U.S.A./U.S.S.R. lettering, links (regular, dotted inter-regional, US dashed / USSR dash-dot, Japan ↔ USA wrap arrows), region tint, annotations (pencil marks, delta pills, 2-Ops cost tags, cap tags, reticle). |
| `MapTooltipHost.tsx` | Portal popover (z popover, 200–260 px, 7 px arrow, side with more room) + default country content (§4.8) and default plate content (scoring breakdown table). |
| `useMapBeats.ts` | `useMapBeats(ref, director, { layout })` registers the `country` beat; `countryBeatHandler` (pure). |
| `names.ts`, `strings.ts`, `measure.ts`, `board.ts`, `motion.ts`, `glyphs.ts`, `contract.ts` | Map-only abbreviations + fitting (§4.3), map strings (EN/ZH with catalog override), canvas text measurement after fonts load, state → box values / ghost / target look, reduced-motion + waits, side glyphs, the map's types. |
| `demo/` | `index.html`, `main.tsx`, `samples.ts`, `demo.css`, `shoot.mjs` (dev only; not a build input). |

## Public API (`src/ui/map/index.ts`)

```tsx
import { MapView, useMapBeats, type MapHandle } from "./ui/map";
const map = useRef<MapHandle>(null);
useMapBeats(map, root.director, { layout });           // "country" beats (compact: pans to off-screen boxes first)
<MapView ref={map}
  state={shown.state} regionScores={shown.regionScores} humanSide={humanSide} layout={layout}
  targets={targets} regionTargets={regionTargets} selection={staged?.kind === "country" ? staged.id : null}
  placed={shown.placedThisPlay} lastOpponent={shown.lastOpponent} focusRegion={focusRegion}
  interactive={!shown.busy} labelScale={settings.mapLabels / 100} patterns={settings.patterns}
  onActivate={actions.activateCountry} onInspect={…} onHover={…} onRegionActivate={…} onRegionHover={…}
  renderTooltip={id => <CountryTooltip country={id} prompt={prompt} state={shown.state} humanSide={humanSide} />}
  // extensions:
  insets={{ bottom: trayH - pad }} insetOverlap={64 /* tablet 48, compact 0 */} anchors={root.anchors}
  follow={settings.followAction} renderPlateTooltip={slot => <ScoringTable score={…} />} promptKey={vm.prompt?.promptId ?? null} />
// after committing a frame: map.current?.clearOverrides()
```

* **Chunk** (prep-ui code split): `src/ui/map` is its own lazy chunk (`mapChunk` in `src/ui/screens/lazyChunks.ts`, 186 kB,
  65 kB gzip, + 17 kB CSS): the start screen loads it for its backdrop and the game chunk imports it. Nothing in the entry may
  import `src/ui/map` statically (that would pull the geometry back into the first paint).
* **Props** = ui-spec §15.1 `MapViewProps`, widened (state/regionScores may be null, callbacks optional) plus optional
  `lang`, `follow`, `insets`, `insetOverlap`, `anchors` (registers `country:<id>` / `plate:<slot>`), `controls`,
  `renderPlateTooltip`, `flashChanges` (default true: a box whose numbers change outside a beat gets a short ring),
  `onCamera`, `promptKey` (the open prompt's id: a change closes the transient popovers, R-008), `className`.
  `MapTargets` gains optional `ghostSide`.
* **Handle** = §15.1 `MapHandle` (`playCountry`, `clearOverrides`, `frame`, `isVisible`, `pulse`) plus `reveal(id)`
  (pan keeping zoom; respects the 3 s manual hold), `frameRegion(slot)`, `getCountryAnchor(id)` →
  `{ svg, rect, client }` (flights / dice trays / chips), `getPlateRect(slot)`, `zoomBy(f)`, `scale()`.
* `playCountry` follows §9.4: drop + thunk + ripple + floating ±n per influence step, then (80 ms) the control flip
  (scaleX through 0, border sweep, CONTROL/LOST micro-stamp); reduced variant = numeral cross-fade + static ring /
  1 s outline pulse; `speed.motion = 0` or abort → end state at once. Overrides persist until `clearOverrides()`.
* Keyboard (focus in the map): arrows = spatial focus (targets first), `[`/`]` cycle targets, `1`–`7` frame regions
  (board order), Enter = activate, Space = inspect/pin, Esc = unpin, `+`/`−`/`0` camera. Right-click / long-press
  (350 ms, touch) = inspect. Compact tap safety at scale < 0.6 (≥ 2 targets under the 48 px tap → zoom 2×).
* Follow camera (compact always, desktop with `follow`): §4.7 rules, keyed on the target set's contents.

## Run / test

* `node scripts/build-map.mjs` (regenerate) · `node scripts/build-map.mjs --check` (staleness; also run by the tests).
* `npx vitest run tests/map` — 5 files, 50 tests: every id 0..83 has a box, no overlaps (min gap ≥ 6.9 u), ≤ 60 u
  from the board, every adjacency (112) has exactly one line + correct inter flag, superpower adjacency drawn,
  plates clear of boxes and within 140 u of the spec, land path validity/bounds, size budgets (geometry < 150 KB,
  texture ≤ 30 KB), generator freshness, camera maths (fit = theme `fitScale`), names/fitting, ghosts, navigation,
  tooltip placement, beat handler, strings, `MapView` markup in EN/ZH (states, roles, tabindex, aria labels, annotations).
* Demo: `npx vite` → `http://localhost:5173/TS_playfield/src/ui/map/demo/index.html?scene=influence&lang=en`
  (`scene=influence|coup|region|setup|idle|empty`, `lang=en|zh|en-XA`, `view=desktop|compact`, `labels=115|130`,
  `patterns=on`). Buttons: scenes, language, patterns, label scale, a `country` beat, pulse, region focus, keys 1–7, world.
* Screenshots: `source scripts/pw-env.sh && node src/ui/map/demo/shoot.mjs` → `docs/design/shots/map-{desktop-en,
  desktop-zh,desktop-coup,desktop-region,desktop-1366,desktop-zoom-zh,phone,phone-zh,phone-idle}.png`.
* Checked in Chromium: hover ghost + tooltip, click activate / inspect, drag doesn't click, wheel, keyboard, region
  keys, plate popover, beats, touch tap / long-press / tap safety, `en-XA` marks every map string.

## Deviations from the spec (with reasons)

* Generator at `scripts/build-map.mjs` (my task), not `src/ui/map/build/`. Paper texture at
  `src/ui/map/assets/paper.webp` (imported, hashed by Vite) instead of `public/textures/` (outside my ownership).
* Compact zoom floor is **cover** (the map always fills the phone; no letterboxed 0.2× world). "World" on a phone shows
  the widest cover view. Desktop/tablet: `[fit, fit × 4]` as specified, top-aligned with the tray overlap.
* Land from 1:50m instead of 110m (better coastlines at the same byte budget), merged per class; country borders inside
  a class are a separate faint dashed path.
* "TO USA" label sits under Japan's box (Japan reaches almost to the map edge, the label would be hidden).
* Overview plates (×1.4) are kept on the chart but may overlap text-less boxes.
* **Touch double-tap (§3.3) only off the targets** (QA Q-017): a tap on an active target (a box or region plate the
  prompt offers, while `interactive`) is always a click: it never zooms and never starts a double-tap, so two quick taps
  on a ringed box place two points. Double-tap still zooms 2× on the sea, non-target boxes and labels. Pure rule:
  `nextTap()` in `camera.ts`; `useCamera({ isTarget })`. The same holds for the mouse (§4.7 "double-click zooms 2×"):
  a double-click on an active target is two clicks, not a zoom; and the `dblclick` the browser synthesises after two
  touch taps never zooms (touch has its own double-tap). A tap that lands before the next placement prompt is open
  (e.g. during a ~250 ms control-flip frame) cannot place: that is the runner's / prompts' timing, not the camera.
* **Touch tooltips** (§4.8; QA Q-020): touch has no hover, so a tap decides (`tipAfterTap()` in `board.ts`): a tap on a
  non-target box opens its tooltip, a second tap on it closes it, a tap on another box moves it; a tap on a target (it
  plays) closes another box's tooltip; a tap on the sea (anything that is not a box or plate) closes the tooltip and the
  plate popover (also for the mouse). Focus that a finger causes no longer opens the tooltip (only keyboard focus does).
  Long-press pins the tooltip, on compact too unless the app passes `onInspect` (§4.8's bottom sheet; GameScreen does not
  wire it). A prompt change also closes a tapped tooltip.
* **Transient popovers** (R-008; `popoversAfter()` / `anchorOnMap()` in `board.ts`): a pinned or tapped tooltip and a
  region plate's "if scored now" popover belong to the moment. They close (the pinned tooltip and the plate popover; a
  tapped tooltip on touch, while a mouse's hover / a keyboard's focus tooltip follows the pointer / focus):
  * on a new prompt: the targets change, or the new optional prop **`promptKey`** (`vm.prompt?.promptId`) changes, which
    also covers prompts that offer nothing on the map (headline → action card → play-mode);
  * when the runner takes the map (`interactive` changes: the AI's or your play's frames) and on a layout change (rotation);
  * on any press outside the map (a hand card, the hand drawer or a dock button, a sheet; capture-phase `pointerdown` on
    the document while one is open); presses on the map stay the map's own (sea, box, plate, zoom buttons);
  * on a click / tap on the pinned popover itself (`MapTooltipHost onClose`; on its click, not its press, so the tap
    never falls through to the box under it; the popover carries `data-no-skip`);
  * when its box or plate leaves the map's view after the camera settles (a resize, a pan): the plate popover and a
    pinned tooltip close, a hover / focus tooltip hides until its box is back. Within a layout a resize re-anchors it
    beside its plate (the camera settles after every resize).
* **Contrast** (QA Q-021, WCAG AA ≥ 4.5:1): the sea labels "To USA" / "To Japan" are in board ink (`--ts-text-ink`, the
  US blue was 3.7:1 on the sea pattern; the arrows keep the US colour); the plate's "If scored" caption and the "Even" net
  use ink-700; the presence chip is no longer faded (`.chipPres` opacity 1: gold on USSR red is 4.5:1 only at full
  opacity).

## Gaps / for other owners

* ~~**shell (R-008, F4):** pass `promptKey={vm.prompt?.promptId ?? null}` to `<MapView>` in `GameScreen.tsx`.~~ Done by
  the round-2 integrator. Also added then (R-010): the zoom buttons' coarse-pointer 44 px hit areas
  (`MapView.module.css`: tablet buttons 36 px, 8 px apart, `::after` −4 px; compact 40 px, `::after` −2 px).

* **`src/ui/ui-contract.ts` does not exist yet.** `src/ui/map/contract.ts` mirrors its map types (same shapes, wider);
  when the shell lands it, re-export from there.
* **i18n owner:** map strings live in `src/ui/map/strings.ts` with EN/ZH defaults; add `ui:map.*`, `ui:plate.*`,
  `ui:tip.*`, `ui:side.*` (keys listed there; a catalog entry wins automatically). Map-only short names (G12) are in
  `names.ts` `MAP_SHORT`.
* **common owner:** glyph paths are duplicated in `src/ui/map/glyphs.ts` until `src/ui/common/glyphs.ts` exists.
* **G3:** the ghost side for event removals is a heuristic (opponent, unless only the human has influence);
  `MapTargets.ghostSide` overrides it when the prompts layer knows.
* Setup-place "subregion land tint" (§8.6) is not wired: tinting works per `RegionSlot` (`focusRegion`), not per subregion.
* Theatre-bar counts: use `countriesOfSlot(slot)` ∩ `targets.ids` (Asia includes SE Asia).

## Known issues

* One map per page (fixed SVG ids `tsm-*`; a second copy defines identical ids, so it still renders correctly).
* A pinned tooltip re-anchors when the camera settles, not during a drag.
* Label widths come from canvas `measureText` after the web fonts load (estimates before that / under SSR).
* The demo's `createRoot` warning appears only when Vite re-optimises deps and reloads the page (dev only).
