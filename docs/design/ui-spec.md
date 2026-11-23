# UI specification — "War Table" (final, authoritative)

Owner: design-synth · 2026-11-22 · Status: **normative**. It supersedes the three proposals in this folder. Where it is
silent, follow `proposal-situation-room.md`, the base design. Read `judging.md` for why things are the way they are.

| Normative artefact | Path |
|---|---|
| Design tokens (colour, type scale, space, radii, shadows, durations, easings, z-index) | `src/ui/theme/tokens.css` |
| Fonts and font stacks (self-hosted Latin, system CJK) | `src/ui/theme/fonts.css`, `public/fonts/*.woff2`, `public/fonts/OFL.txt` |
| Base element styles | `src/ui/theme/base.css` |
| JS mirrors: motion timings, speed maths, z-index, breakpoints, contrast helpers | `src/ui/theme/{motion,layout,contrast,index}.ts` (tests: `tests/theme/tokens.test.ts`) |
| Pixel reference (static, real cards, real names) | `docs/design/mockup-final.html` (`?scene=influence|playmode|coup|ai|start&lang=en|zh&view=desktop|compact`) |
| Screenshots to match | `docs/design/shots/final-{desktop-en,desktop-zh,phone,phone-zh,start,start-zh,playmode,coup,ai,desktop-1366}.png` |
| Component styling reference | `docs/design/mockup-final-assets/final.css` (section 7 holds the synthesis changes) |

Re-shoot: `source scripts/pw-env.sh && node docs/design/mockup-final-assets/shoot.mjs [name…]`. The script serves the repo,
maps `/fonts/` to `public/fonts/` the way Vite does, and stops the server afterwards.

Words: **MUST** / **MUST NOT** are requirements. **Should** is the default; deviate only with a reason written in your handoff.
"u" = map units (SVG user units of the map viewBox). "px" = CSS pixels.

---

## 0. The design in one page

**Concept: you stand at the war table.** The map is a printed paper chart lit from above. It is the brightest object on screen and
the only one in colour. Everything around it is a dark room: an instrument **console** across the top, a dossier **rail**
on the right (the adversary, effects in play, a teleprinter log), and the near edge of the table at the bottom (the **tray**),
holding your **orders slip**, your hand, the China Card on green felt, and the piles. The adversary's cards are face-down files.

Principles, in priority order:

1. **The board is the hero.** It gets the largest area at every breakpoint. Chrome is dark and recedes.
2. **One question, one place.** The orders slip (a bottom sheet on phones) is the only place that asks you something. It always
   says *who acts, what to do, how much is left, how to undo*. The map rings and the hand glow say *where*.
3. **Only actionable things look actionable.** During a decision, non-targets dim. **Brass** is the only "click here"
   colour, and it belongs to neither side.
4. **Fixed political axis.** US is always on the left (or top), USSR always on the right (or bottom): in country boxes, the VP gauge,
   mil-ops rows, dice trays, scoring sheets, headlines and the start screen. Together with **shape** (US square, USSR chamfered),
   **glyph** (★ / hammer and sickle) and **words**, side never depends on colour.
5. **Engine truth only.** Legality comes from `Prompt.options`, previews from the controller (`coupOdds`, `effectiveOps`,
   `Frame.regionScores`, option `warnings`). The UI restates no rules. The two display-only exceptions are listed in §16.
6. **Every motion explains a change and can be skipped.** Skipping always lands on the same final state and log.
   Reduced motion keeps every piece of information.

Where the pieces come from (see `judging.md`): Situation Room gives identity, desktop grid, map, slip, play-mode stage, big
moments, confirmation model and animation backbone. Mobile Clarity gives the whole compact layout, theatre chips with counts,
tap safety, the target list, big counter, breadcrumb, cost tags on exceptions and the AI recap ticker. Modern Board gives "if
scored now" plates, reveal-dock avoidance, speed control, the beat model and anchor registry, delta pills, hand order,
the VP chart and the start-screen rule chips.

---

## 1. Global conventions

* **Stack:** React 18 function components, CSS Modules (`*.module.css`) on top of the global theme files, SVG for the
  map, Web Animations API (`element.animate`) for motion. No CSS-in-JS runtime, no animation library, no new npm
  packages.
* **Theme import order** (once, in the app root): `fonts.css` → `tokens.css` → `base.css`.
* **No hex values in components.** Use `var(--ts-…)`. Semantic tokens (section B of `tokens.css`) come before primitives.
* **Side colours are only for sides.** Danger is `--ts-danger` (alert orange) plus hazard stripes or ⚠. It is never red.
* **Text is never baked into images.** Card titles, names and numbers on cards are HTML/SVG text in the UI language.
* **Language:** read through `useI18n()` (`src/i18n/react`). Never concatenate translated fragments. Use full-sentence keys with
  params. Messages from the controller (`Prompt.title`, `LogEntry.text`, …) are rendered at display time with
  `<MessageText>` (§15) so a language switch redraws them.
* **Root attributes** (set by the shell on `<html>`): `lang` (by i18n), `data-human="US|USSR"` (switches `--ts-me/--ts-ai`),
  `data-motion="reduce|full"` (settings override; absent = follow the system), `data-labels="115|130"`,
  `data-patterns="on"`, inline `--ts-speed`.
* **Hidden information:** the UI only ever sees `PublicState`. It MUST NOT keep or show anything the redaction removed. Unknown
  AI cards are always backs.

---

## 2. Visual identity

### 2.1 Colour

All values are in `src/ui/theme/tokens.css`. The groups and their jobs:

| Group | Tokens | Use |
|---|---|---|
| Room | `--ts-room-950…500` | chrome surfaces, from the page background to raised controls |
| Steel | `--ts-steel-400…100` | text on room (400 = labels ≥ 10 px, 300 = secondary, 100 = values) |
| Paper / ink | `--ts-paper-50…300`, `--ts-ink-900/700/500`, `--ts-folder` | map boxes, slip, tape, tooltips, dossiers; ink is text on paper |
| Sea / land | `--ts-sea-*`, `--ts-land-*` | map water and land masses (board heritage, desaturated) |
| Region inks | `--ts-reg-euw/eue/me/asia/sea/af/ca/sa` | country name bands, region plates, scoring-sheet header |
| Band text | `--ts-band-text`, `--ts-band-text-eue`, `--ts-band-text-bg` | ink on every band except E. Europe and battlegrounds (paper) |
| Battleground | `--ts-bg-band`, `--ts-bg-stab` | dark plum band, red stability box (board heritage) |
| US / USSR | `--ts-us-800…100`, `--ts-ussr-800…100`, `--ts-ussr-gold` | sides only; gold = numerals/glyphs on solid USSR fills |
| Me / AI | `--ts-me*`, `--ts-ai*` | follow `[data-human]`: your stamp, your pencil marks, AI accents |
| Brass | `--ts-brass-700…100`, `--ts-act*`, `--ts-focus*` | interaction: legal targets, focus, selection, primary on dark, counters |
| Signals | `--ts-alert-*`, `--ts-ok-*`, `--ts-phosphor`, `--ts-felt-*`, `--ts-walnut-*` | warnings with stripes, dice success, console readouts, felt, table edge |
| DEFCON lamps | `--ts-defcon-5…1` | the DEFCON numeral and lamps only |

Measured contrast (pinned by `tests/theme/tokens.test.ts`): ink on paper 15.5:1. Steel-400 labels on room-800 ≥ 4.5:1. US / USSR
numerals on paper 9.0 / 6.7:1. Gold on USSR-600 ≥ 4.5:1. Every region band with its band-text colour ≥ 4.5:1. Alert-700 on paper and
on the warning panel ≥ 4.5:1. The two-tone target ring's ink edge is ≥ 3:1 against the sea and every land tint (WCAG 1.4.11).

### 2.2 Materials (all static: no live SVG filters in production)

| Material | Where | Recipe |
|---|---|---|
| Paper | map, boxes, slip, tape, tooltips, dossiers | flat paper token + one grain texture `public/textures/paper.webp` (≤ 30 KB, multiply 6–9 %). Map agent produces it |
| Bakelite | console, rail, buttons | `--ts-surface-console` / `--ts-surface-rail`, 1 px top highlight, brass hairline under the console (`--ts-shadow-console`) |
| Grain | console, rail | `.ts-grain` (base.css): a tiny data-URI noise, static |
| Walnut | bottom 64 px of the tray | `--ts-surface-walnut` with a 1 px brass top line |
| Felt | China slot, dice tray | `--ts-surface-felt`, inset shadow |
| Lamp light | over the map viewport | `--ts-map-lamp` as an overlay div (`pointer-events:none`) |

Shadows exist only on country boxes (1.6/2.4 u offset), markers (sheen + dark edge), cards (`--ts-shadow-card`), slip
(`--ts-shadow-slip`), popovers and stage objects.

### 2.3 Typography

Families (from `fonts.css`; the Latin files total 117 KB, all SIL OFL):

| Token | Family | Use | Weights |
|---|---|---|---|
| `--ts-font-stencil` | Big Shoulders Stencil Display | wordmark, DEFCON numeral, region names, big counters, verdicts, card names on stage | 700–800 |
| `--ts-font-ui` | Barlow Condensed | labels, buttons, map names, tracks, chips | 600 / 700 |
| `--ts-font-num` | Barlow Condensed (Latin only, both languages) | every changing number, with `font-variant-numeric: tabular-nums` (`.ts-num`) | 700 |
| `--ts-font-body` | system-ui stack | tooltips, descriptions, card text, hints | 400–700 |
| `--ts-font-type` | Courier Prime | teleprinter log, crumbs on tape, telex, boot line | 400 / 700 |
| `--ts-font-news` | Times / Georgia (zh: Song) | headline newspapers only | 900 |
| `--ts-font-serif-zh` | Songti / Noto Serif CJK | Chinese card names at ≥ 19 px only | 700–900 |

**Chinese never downloads a font.** Under `:lang(zh)`, every stack switches to the "… ZH" registrations, which carry Latin-1 only, so
full-width quotes “” and ellipses …… come from the CJK font. CJK system fonts follow next.

Type scale (`--ts-fs-*`; Chinese raises the small sizes automatically):

| Token | en px | zh px | Typical use |
|---|---|---|---|
| micro | 9.5 | 11 | console sub-labels (caps) |
| xs | 10.5 | 11.5 | labels, chips, panel headers |
| s | 11.5 | 12 | hints, log details |
| m | 12.5 | 13 | tooltips, small body |
| body | 14 | 14 | body |
| l | 16 | 16 | mode titles, adversary name |
| xl | 19 | 19 (17 for slip titles) | slip title |
| 2xl | 24 | 24 | dossier titles |
| 3xl | 30 | 30 | reveal banner, scoring header |
| 4xl | 38 | 38 | DEFCON numeral, big counter (36) |
| 5xl | 64 | 54 | game-over verdict |
| hero | 104 | 104 (Latin) + 42 (冷战热斗) | start title |

Rules:

* Latin labels use `text-transform: var(--ts-caps)` (uppercase in English, `none` in Chinese) and
  `letter-spacing: var(--ts-track-caps|wide|tight)`. **Every caps style MUST use these tokens**, which have Chinese overrides.
* Chinese map names: body font, weight 700, 14.6 u. English map names: `--ts-font-ui` 600, 15 u, caps.
* Minimum on-screen text: 9.5 px Latin caps (console sub-labels only), 10 px elsewhere, 11 px CJK. Map names at the
  1440×900 fit are about 9.6 px (Latin) and 9.3 px (CJK). This is acceptable only because the map can zoom and the *Map labels* setting adds 15/30 %.
* Numbers that change MUST use `.ts-num` (tabular), so counters don't jitter.

### 2.4 Glyphs, icons, assets

* **Side glyphs** (24-unit paths, `fill: currentColor`). They MUST be used verbatim; they live in `src/ui/common/glyphs.ts`:
  * US star: `M12 1.6l2.9 7.1 7.6.5-5.9 4.9 1.9 7.4L12 17.4l-6.4 4.1 1.9-7.4-5.9-4.9 7.6-.5z`
  * USSR hammer and sickle: `M14.6 3.2c3.9 1.1 6.6 4.7 6.6 8.8 0 5-4.1 9.1-9.1 9.1-2.6 0-4.9-1.1-6.6-2.8l-2.2 2.2-1.4-1.4 2.2-2.2C2.9 15.2 2.4 13.5 2.4 12c0 0 1.6 4.1 6 5.4 4.6 1.3 9.7-1.6 10.2-6.6.3-3.3-1.4-6.2-4-7.6z M6.1 4.3l2.6-2.6 4.6 4.6-1.6 1.6 7.8 7.8-1.5 1.5-7.8-7.8-1.6 1.6z`
    (simplified. A cleaner redraw for sizes ≥ 40 px is an open asset task.)
* **Seals** (48×48): US = navy disc, dashed pale ring, white star. USSR = red disc, dashed gold ring, gold hammer and sickle + small star.
  SVG markup is in `mockup-final-assets/final.js` (`seal()`); port it to `src/ui/common/Seal.tsx`.
* **Line icons** (24 grid, 2 px stroke, `currentColor`): event (newspaper), influence (plus in box), coup (crosshair), realign
  (opposed arrows), space (rocket), log (tape), status (bars), gear, menu, undo, skip (⏭), chevron-up. Paths are in `final.js` `ICON`.
* **Card back** (CSS, no asset): navy diagonal hatch, brass ring and "TS" roundel, brass inner rim (`.card-back` in
  `final.css`). **China Card face-down** (SVG to produce): red lacquer, gold rim, "THE CHINA CARD / 中国牌", ribbon "FACE
  DOWN". **Dice** (CSS): 3×3 pip grid; side dice in side colours (`--ts-die-us/ussr`), neutral dice in paper.
* **Stamps:** stencil words in a 1.5 px border, rotated −3…−9°, at most one on screen at a time ("YOUR MOVE", "REVEALED",
  "COMMITTED", "YOU WIN"…).

---

## 3. Layout

`layoutFor(width, height)` in `src/ui/theme/layout.ts` is the single source of the arrangement. The same React tree renders
all four arrangements. They differ in CSS grid placement, in a few components that only exist in one arrangement, and in
camera behaviour.

| Kind | Condition | Reference |
|---|---|---|
| `desktop` | width ≥ 1200 and height ≥ 640 | 1440×900 (`final-desktop-en.png`), 1366×768 (`final-desktop-1366.png`) |
| `tablet` | 700 ≤ width < 1200 in landscape, or width ≥ 1200 with height < 640 | 1024×768 |
| `compact` | width < 700, or width < 1200 in portrait | 390×844 (`final-phone.png`), 820×1180 |
| `compact-landscape` | height < 500 and width > height | 844×390 |

The page never scrolls (`body { overflow: hidden }`). Panels scroll inside. Browser zoom up to 200 % reflows into the next
arrangement, because the breakpoints are in CSS px.

### 3.1 Desktop

```
┌──────────────────────────────── console 58 px ────────────────────────────────────────────────────┐
│ WORDMARK │ TURN │ ACTION ROUND │ DEFCON │ VICTORY POINTS │ MIL OPS │ SPACE │ ……… │ EN|中文 │ ⚙ │ ☰ │
├───────────────────────────────────────────────────────────────────────┬──────── rail 288 ──────────┤
│  table (map viewport, inset 10 px)                          [+][−][⤢] │ ADVERSARY dossier           │
│                                                                       │ IN EFFECT chips             │
│                                                                       │ DISPATCHES (teleprinter)    │
│                                                                       │   … flex, scrolls …         │
├──── tray clamp(152px, 18.5vh, 184px), overlays the table bottom ──────┤                             │
│ ORDERS SLIP 344 │        HAND (fanned, fits)       │ CHINA 118 │ PILES 104 │                         │
└───────────────────────────────────────────────────────────────────────┴─────────────────────────────┘
```

* Grid: `grid-template-columns: minmax(0,1fr) var(--ts-rail-w)` (288 px; **336 px at ≥ 1600 px wide**).
  Rows: `var(--ts-console-h) minmax(0,1fr) var(--ts-tray-h)`. Areas: `"console console" "table rail" "tray rail"`.
  The table spans rows 2–3. The tray sits on top of the table's bottom band (z 15) with a gradient fade
  `transparent → room-900 70 %` and the walnut edge.
* **Map fit:** `fitScale()` (layout.ts). Width-bound at every desktop size. The map's bottom band may slide up to 64 px under the tray
  (only sea and the S. America plate are there). At 1440×900 the scale is 0.638 (box ≈ 56×36 px).
* **Console instruments**, left to right, separated by a 1 px dark rule with a 1 px highlight, padding 0 11 px:
  wordmark (≈ 170 px) · Turn (track of 10 cells 15×18 + era row) · Action round (pips 20×18 + readout) · DEFCON
  (numeral 38 px + 5 lamps 22 px + restriction caption, max 132 px) · VP gauge (224 px) · Mil ops (2 rows × 5 cells 9 px) ·
  Space (2 rows × 8 cells) · flex spacer · language toggle · settings (32×32) · menu (32×32).
* **1200–1439 px wide (condensed console):** the turn track and era row collapse to a readout "5/10 · Mid War". The VP gauge narrows to 176 px,
  the DEFCON caption to 112 px, the wordmark to 18 px.
* **Rail** (`--ts-surface-rail`, z 20): Adversary dossier (≈ 150 px), In-effect chips (auto height, max 4 rows, then the
  section scrolls), Dispatches (flex 1). The rail collapses to a 60 px icon strip with the `›` handle (setting
  `railCollapsed`). The map scale then grows by about 15 %.
* **Tray** (z 15): padding `0 12px 10px`, gap 14 px, items aligned to the bottom. Slip 344 px wide, stretched to the tray height
  minus 4 px. Hand flex 1 (min 0). China slot 118 px. Piles 104 px.
* **Hand cards:** 104×146 px (**112×157 at ≥ 1600 px**). Cards may rise above the tray top (over the ocean).
* **Stage overlays** (play-mode, reveal dock, dice, headline, scoring, banners) live **inside the table area** (z 40). They
  never cover the rail or the slip.

### 3.2 Tablet

As desktop, with:

* Columns `minmax(0,1fr) 60px`, rows `54px minmax(0,1fr) clamp(132px, 18vh, 150px)`.
* The rail becomes the **rail strip** (60 px): four 42×42 buttons. Adversary (seal + hand-count badge), In effect (count badge),
  Dispatches (unread dot), Status (bars: mil ops + space). Each opens a 320 px **flyout** over the map's right edge (z 60) with
  the same component as the desktop rail section. Only one flyout is open at a time, and Esc closes it.
* Console: the wordmark subtitle, Mil ops, Space and the DEFCON caption are hidden (the Status flyout has them). Turn uses the condensed
  readout. VP is 170 px. The language toggle becomes one 32×32 button showing the *other* language ("中" / "EN").
* Slip 296 px without the clipped card thumbnail. Hand cards 86×120. China slot 96 (card 78×109). Piles icon-only 76 px.
* *As built (QA round 2):* each flyout ends above the tray row (`.flyoutHost { bottom: var(--ts-tray-h) }`), so the hand, the
  China slot and the piles stay visible. A press anywhere on the game screen outside the flyout and the strip closes it (touch
  screens have no Esc); the press also acts on what it hit (R-017). On coarse pointers (an iPad in landscape) the tablet layout's
  controls keep their look and answer 44 px hit areas (R-010): the strip buttons, the flyout's ×, the console's language, ⚙ and ☰
  (their gap grows to 12 px), the map zoom buttons (36 px, 8 px apart), the slip's action and tool buttons (44 px tall; icon-only
  buttons and the speed segment 44 px wide), the region buttons, play-mode Back to hand, the piles and the toast close.
  Neighbouring areas split the gap. Where the 126 px slip's content already overflows (setup-place) its edge clips the area to 36 px.

### 3.3 Compact (phones, portrait tablets) — `final-phone.png`, `final-phone-zh.png`

```
┌ console 48: TURN 5 · MID WAR / AR 3 · USSR (YOU) │ 3 DEFCON │ VP ━━┃━━ USSR +2 │ ☰ ┐
├ theatre bar 36: [EUROPE 19] [MIDDLE EAST 10] [ASIA 5] [SE ASIA 4] … [⤢ WORLD]        ┤
├ table (flex): ticker (last AI play, 6 s) · map (pan / pinch) · [+][−][⤢] bottom-right ┤
├ sheet (auto, radius 14, overlaps the map by 14 px): grab · ORDERS SLIP              ┤ thumb zone
├ dock 60 + safe area: [▣▣▣ HAND · 5 ^] │ ADVERSARY ⑤ │ LOG ② │ STATUS                ┤
└──────────────────────────────────────────────────────────────────────────────────────┘
```

* Grid rows: `var(--ts-c-console-h) var(--ts-c-theatre-h) minmax(0,1fr) auto calc(var(--ts-c-dock-h) + env(safe-area-inset-bottom))`.
  One column. Height `100dvh`.
* **Console (48 px):** turn/AR readout · DEFCON numeral (30 px) + caption "DEFCON" · mini VP gauge (flex, readout above the bar,
  needle without its head) · ☰ 40×40. The ☰ menu holds language, settings, rules, new game and resign. It also has an amber dot
  when a warning needs attention (a `scoring-stranded` warning on any option, or a mil-ops shortfall in the last 2 ARs).
  *As built (QA round 1, Q-041):* when the bar is too narrow it squeezes in steps before any text is cut: the VP readout's side
  word becomes its glyph ("☭ +13"), then the DEFCON caption goes, then the AR readout's side word becomes its glyph, then the
  VP label goes; only after that may the turn lines ellipsize (full text in the instrument's name and tooltip).
  `console/squeeze.ts` measures the bar. The VP number is never cut.
* **Theatre bar (36 px):** chips in board order: Europe, Middle East, Asia, SE Asia, Africa, C. America, S. America, then
  "⤢ World". Each chip shows a brass count badge of `prompt.countries` in that region (SE Asia counted separately, and also in
  Asia) while a map prompt is open. Chips without targets are dimmed. The chip of the framed region is pressed (brass). Tapping
  a chip frames that region (350 ms). The bar scrolls horizontally, keeping the pressed chip visible.
  *As built:* the pressed chip follows the camera (`docs/handoff/ui-shell.md` §5, deviation 6); a tapped chip stays pressed while the view is that
  tap's own framing (also through orders-sheet resizes), and a pan, zoom or follow-camera move hands it back to the camera; a tall
  portrait view is judged by the region area centred nearest the view's centre (Q-047). On touch screens each chip has a 44 px
  tall hit area (the bar's box is 8 px taller than the 36 px it paints, transparent over the map; Q-048).
* **Map:** pan with one finger, pinch, double-tap zooms 2×, and +/−/⤢ buttons (40×40, bottom-right, 26 px above the sheet).
  The buttons are required: pinch is a multipoint gesture (WCAG 2.5.1). `touch-action: none` on the SVG only.
* **Ticker:** a paper strip at the top of the map, typewriter 11.5 px, with the AI's side glyph and a left border in `--ts-ai`. It shows the
  AI's last completed play in one line (from the last `LogEntry` with `side === ai`). Tap → log sheet. It auto-hides after 6 s and
  when the human acts.
* **Sheet:** contains the orders slip (§8.1) at full width minus 16 px. Grab handle 40×4. Swipe up or tap the grab to expand to
  60 % height, which shows the **target list** for map prompts (§8.13) or the prompt detail. Swipe down collapses it.
  *As built:* on touch screens the orders-sheet grab is a full-width strip with a 44 px zone, and every bottom sheet's grab has a
  44 px tall hit area (Q-048). Controls in a sheet's header (the hand drawer's done button) are not the grab (`data-sheet-grab`
  marks it), so tapping them does not close the sheet.
* **Dock (60 px):** Hand (1.5 fr: three stacked thumbnails, "HAND · n", chevron) · Adversary (AI seal + hand count) · Log
  (unread count) · Status (tracks). Each opens a bottom sheet (z 60):
  * Hand → **hand drawer** (224 px, horizontal scroll, cards 112×157, captions). It opens automatically when the prompt is
    card-based (`headline`, `action-card`, in-hand `event-card`) and closes when the prompt changes to a non-card prompt.
    *As built (Q-028):* the drawer's header carries the hand prompt's one-line title and, when the prompt has `done`, its done
    button (`HandPromptBar`: the slip's label and policy), so a Blockade discard shows its question and "Discard nothing" while
    the drawer covers the slip.
  * Adversary → adversary dossier + In effect. Log → Dispatches (full height). Status → all tracks at full size (the
    desktop console instruments, stacked) + piles.
* **Touch targets** are ≥ 44×44 px. At the default compact framing a country box is ≥ 75×48 px (scale ≥ 0.85).
* *As built (QA round 1):* **safe areas** (Q-042): tokens `--ts-safe-left/right/bottom` (`env(safe-area-inset-*)`, with
  `viewport-fit=cover`). The game grid pads left and right; compact landscape keeps the map full-bleed on the left (sea under the
  notch) and insets the theatre bar, ticker and skip link; the start screen's foreground, bottom sheets and full-screen dossiers
  pad by the insets. **Touch targets** (Q-048): on `(pointer: coarse)` the slip's actions, Undo play and speed segment, the
  papers' and scoring sheet's Continue, the telex buttons, dossier footers, settings segments and the menu rows are ≥ 44 px; a
  control that must stay small visually (the dossier's close ×, sheet grabs, theatre chips) gets an invisible 44 px hit area.
  **Touch wording** (Q-032): instructions say "Tap" on touch screens (`useTouchUi()` in `src/ui/common/touch.ts`: the last
  pointer used, else `(hover: none) and (pointer: coarse)`); no right-click / Space / key hints there.
* *As built (QA round 2):* **no key caps on touch screens** (R-011): `Button` drops its `<kbd>`, the play-mode rows their letter
  chip (and its column), the staged region button its ↵, the ☰ menu its "?"; `aria-keyshortcuts` stays (a `Button` derives it
  from its single-key cap: "D", "↵" → Enter, "Esc" → Escape). The zoom buttons (40 px)
  and the play-mode sheet's Back to hand answer 44 px hit areas (R-010). The dock calls the log 电报, as the glossary (R-019).

### 3.4 Compact landscape

Columns `minmax(0,1fr) var(--ts-c-side-col-w)` (300 px). Left: the map at full height, with the theatre bar overlaid at its top
(transparent background) and the zoom buttons at bottom-right. Right column: the compact console (44 px), then the slip (scrolls),
then the dock (52 px, icons only). Sheets open over the left column.

*As built (QA round 1):* every sheet (hand drawer, card sheet, log…) covers the map column only, the side column stays in view
under the scrim; the play-mode sheet is full height there (Q-029). The side-column slip (`.side`) shows the List link and `T`
opens the target list (§8.13, as a full-screen sheet; Q-030); its title and hint take up to 4 lines over the full width and the
crumb wraps between its parts (Q-033). Map tooltips stay inside the map column (`MapTooltipHost bounds`; Q-032).

### 3.5 Z-layers

One scale (`--ts-z-*` / `Z` in motion.ts). Nothing else may set a z-index above 0, except local stacking inside a component.

| z | Layer | Contents |
|---|---|---|
| 0 | map | sea, land, links, plates, boxes, annotations (SVG order inside) |
| 10 | map HUD | zoom buttons, theatre bar overlay, ticker, rail handle |
| 15 | tray | slip, hand, China slot, piles; compact sheet |
| 20 | rail | rail, rail strip |
| 30 | console | console |
| 40 | stage | play-mode stage + scrim, reveal dock, dice trays, scoring sheet, headline papers, turn banner, region hit overlay |
| 50 | flight | cards/chips in flight (portal, `position: fixed`) |
| 60 | sheet | compact sheets and drawers, tablet flyouts |
| 70 | modal | dossiers with scrim: branch, DEFCON level, card picker, pile viewer, settings, confirm-resign |
| 80 | popover | map tooltip, card zoom, menus (above modals so a picker can zoom a card) |
| 90 | toast | toasts |
| 95 | game over | telex + scrim |
| 100 | danger | DEFCON-2 frame; `pointer-events: none` |

Inside the map SVG (paint order): sea → sea lines → coast water lines → land → paper grain → super lettering → links →
region plates → superpower plates → boxes (non-targets, then targets, then the hovered/selected box last) →
annotations (cost tags, pencil marks, delta pills, reticle) → lamp overlay (HTML).

---

## 4. The map (owner: map agent, `src/ui/map/**`)

This section is the **visual and props contract** for the map agent. The map agent owns the geometry, land art and
rendering. Everything else talks to the map only through `MapViewProps` and `MapHandle` (§15.1).

### 4.1 Coordinate system and geometry

* **viewBox `0 0 1775 1090`** (aspect 1.628). It is our own space, not the board photo's. Generate it from
  `docs/notes/countries.json`: board positions (`ref_x/ref_y`, 2448×1584) mapped by `(x − 30) × 0.75, (y − 60) × 0.75`, then
  Europe widened by 4–5 % around (675, 90), then relaxed so that **88×56 u boxes keep ≥ 7 u apart** with a maximum shift of
  60 u from the board position. The exact algorithm, and a working result, is
  `docs/design/mockup-situation-room-assets/build-board.mjs` → `board-data.js` (`countries[i].x/y` = box centre). The map agent
  SHOULD port this generator to `src/ui/map/build/build-map.mjs` (a Node script; output `src/ui/map/geometry.generated.ts`,
  committed) and MAY improve the relaxation, as long as every country stays recognisably where it is on the board.
* **Superpower plates:** 112×48 u, centres US (145, 400) and USSR (1111, 242).
* **Region plates:** 196×58 u, centres EU (474, 112), ME (1227, 645), Asia (1446, 470), SE Asia (1356, 784), Africa
  (1112, 930), C. America (102, 778), S. America (168, 910). They may move to keep ≥ 8 u clear of every box and ≤ 140 u from
  their region.
* **Big lettering:** "U.S.A." stencil 78 u at (26, 342) and "U.S.S.R." 92 u at (1250, 150), side ink at 20 %
  (`--ts-map-super-label-*`).
* **Land:** real coastlines warped so each country's real location sits under its box. A thin-plate spline from Natural Earth 110 m
  (`world-atlas`, `topojson-client`, both installed) is in `build-board.mjs`. Classes and fills: `euw eue me asia sea china af ca
  sa usa ussr neutral` → `--ts-land-*`. Antarctica dropped; latitudes south of −58° clipped.
* **Shipped size:** geometry + land paths ≤ 160 KB minified (the mockup's is 143 KB). Use 1 decimal place.

### 4.2 Map style

| Element | Spec |
|---|---|
| Sea | `--ts-map-sea` + pattern of horizontal lines 12×7 u, `--ts-map-sea-line` 0.7 u at 35 % |
| Coast | two "water lines" under the land: 15 u at 9 % and 7 u at 22 % (`--ts-map-coast`), then land stroke 0.7 u `--ts-map-land-stroke` |
| Paper grain | `public/textures/paper.webp` as a full-size `<image>` with `mix-blend-mode: multiply`, opacity .07 (static, ≤ 30 KB) |
| Intra-region links | 1.6 u `--ts-map-link` at 55 %, centre to centre, under boxes |
| Inter-region links (8) | 2.4 u **dotted** (dash 1, gap 5.5, round caps) `--ts-map-link-inter` at 90 %. The pattern carries the meaning |
| Superpower links | US: 3.2 u dashes 10/5 `--ts-us-600` 75 %. USSR: 3.2 u dash-dot 10/4/2/4 `--ts-ussr-600` 75 %. From the plate centre |
| Japan ↔ USA wrap | from Japan's box east edge, a dashed line to x = 1769 with an arrowhead and the label "TO USA" (12 u, caps). From the US plate's west edge, a line to x = 8 with "TO JAPAN". Never a long curve |
| Superpower plate | side-700 fill, 1.5 u darker stroke, dashed inner rim, glyph 24 u + "USA"/"USSR" stencil 25 u (white / gold) |
| Focus mode | while targets exist: links 25 % (inter 40 %), region plates 70 % |

### 4.3 Country box (88 × 56 u) — anatomy

```
 x: 0                                         70  72      88
 ┌────────────────────────────────────────────┬──────────┐ y 0
 │ W. GERMANY                                 │  4  │    │ ← band 19 u: region ink; BG = --ts-bg-band + 3 u region stub at left
 ├──────────────────────┬─────────────────────┴──────────┤ y 19   name: x 5.5 (BG 8.5), baseline 14.4
 │  ┌────┐              ┆              ┌────┐            │        stability box 16×15 at (70, 2), numeral 13.5 u
 │  │★ 4 │   US slot    ┆  USSR slot   │1 ☭ │            │ ← markers 31×30 at (6, 22.5) and (50, 22.5)
 │  └────┘              ┆              └────┘            │        divider: x 44, y 22→53, dashed 2/2.5
 └──────────────────────┴────────────────────────────────┘ y 56
```

* **Body:** `--ts-map-box`, stroke 1.1 u `--ts-map-box-stroke`, rx 3. Shadow rect offset (1.6, 2.4) `--ts-map-box-shadow`.
* **Band:** fill by subregion: W. Europe `--ts-reg-euw`, E. Europe `--ts-reg-eue` (name in `--ts-band-text-eue`), Austria and
  Finland split at x = 44 (left W, right E), SE Asia `--ts-reg-sea`, else the region ink. **Battleground:** band
  `--ts-bg-band` with a 5 u region-ink stub at the left, name in `--ts-band-text-bg`. Stability box `--ts-bg-stab` with a paper
  numeral (non-BG: paper box, ink numeral, 0.8 u ink stroke).
* **Name:** English `--ts-font-ui` 600, 15 u, caps, tracking .015em. Chinese `--ts-font-body` 700, 14.6 u. Both × label scale
  (`--ts-map-label-scale`). Width available = 88 − (BG 9 : 6) − 21 u. Fitting: `textLength` + `spacingAndGlyphs` when the
  measured width exceeds the room, never below 82 %. Below 82 %, use the short name.
* **Name source:** at *standard* detail use `countryShortName(id)` (`src/data`), except for these map-only abbreviations, which
  are added as data `short` values by the i18n owner (until then, a local table in `src/ui/map/names.ts`):
  EN `9 Spain/Port.`, `35 Laos/Camb.`, `49 W. Afr. St.`, `50 Saharan St.`, `61 SE Afr. St.`, `63 S. Africa`, `7 W. Germany`,
  `14 E. Germany`, `43 N. Korea`, `44 S. Korea`. ZH `9 西葡`, `16 捷克`, `35 老挝柬埔寨`, `50 撒哈拉`, `61 东南非`. At *detail*,
  use `countryName(id)` with fitting.
* **Markers (cardboard counters):** US = square (rx 2.5). USSR = chamfered (6 u cut at top-left and bottom-right). 31×30 u.
  * *Unflipped* (influence, no control): paper face, 1.7 u side-600 edge, side-600 numeral (21 u, `--ts-font-num` 700),
    corner glyph at 36 % scale (US top-left, USSR top-right), sheen gradient.
  * *Flipped* (this side controls the country): solid side-600 face, side-800 edge, numeral and glyph white (US) / gold (USSR).
  * 0 influence = empty slot. At *detail* level, the empty slot shows the side glyph at 18 % as a hint.
* **Controlled box:** body tint side-100, stroke side-600 2.6 u. Control is read from `controlled_by` in the state (the
  engine computes it).

### 4.4 Country states

| State | Visual | Driven by |
|---|---|---|
| default | as §4.3 | — |
| controlled | side-100 tint, 2.6 u side border, flipped marker | `state.countries[*].controlled_by` |
| **target, quiet** | two-tone ring at inset −3.5 u, rx 5: ink edge 4.6 u `--ts-map-ring-edge`, then brass 2.4 u `--ts-map-ring-quiet` | `targets.ids` and `targets.tone === "quiet"` (> 12 options) |
| **target, loud** | ring at inset −5.5 u, rx 6: ink edge 5.2 u dashed 7/4 + brass 3 u `--ts-map-ring` dashed 7/4, both marching (`stroke-dashoffset` −22 over 1.4 s linear, `.ts-ambient`) + a pre-blurred glow stroke | `tone === "loud"` (≤ 12) |
| target, danger | as loud, but the brass stroke becomes `--ts-danger`, dashes 4/4, not marching | `targets.danger` |
| non-target during a map prompt | opacity `--ts-map-dim-opacity` (.42) + `saturate(.3)`. Compact: opacity only (no filter). Still hoverable/inspectable | `targets` set and id not in it |
| hover / keyboard focus (target) | edge 7.4 u solid, ring 5 u `--ts-map-ring-hover` solid, shadow offset (2, 4). **Ghost marker** in the slot the click affects: dashed outline, the next numeral (`verb === "add"`), or a struck-through "−1" (`"remove"`) | pointer / focus |
| selected (staged) | four corner brackets 15 u long, 10 u outside the box, 3.5 u `--ts-select`, square caps. Tooltip pinned | `selection` |
| placed this play | grease-pencil ellipse (rx 13, ry 10.5, rotated −12°) centred at (89, −3) in `--ts-map-pencil` with a 1.6 u `--ts-map-pencil-ink` stroke, text "+n" typewriter 15 u | `placed[id]` |
| last opponent play | one pill per changed side at the top-left corner (25×15 u at (−6, −9), the second pill 27 u to the right): side-600 fill, paper stroke 1.2 u, text "+n"/"−n" 12 u white (US) / gold (USSR) | `lastOpponent[id]` |
| cost 2 | tag "2 OPS"/"2 点" 38×15 u (zh 30×15) at (−5, 48): `--ts-brass-400` fill, 1 u ink stroke, 11 u ink text | `targets.cost2` |
| cap progress | tag "1/2" at the bottom-right corner (same style, ink fill, paper text) | `targets.cap` |
| region focus | boxes of the region at full strength, others dimmed as non-targets, plate highlighted | `focusRegion` |
| region prompt | each offered region's plate gets a loud ring, and hovering a plate or chip tints the region's land 10 % brass and dims the rest | `regionTargets` |
| just changed | ring pulse in the actor's colour (part of the influence/control beats) | `MapHandle.playCountry` |

Paint rule: rings are drawn **before** the box body inside the box group, so the box covers the ring's inner half. Targets render
above non-targets. The hovered or selected box renders last.

### 4.5 Region plates ("if scored now")

Paper plate 196×58 u (`--ts-map-plate`, 0.8 u ink stroke) with a 5 u region-ink bar at the left.

* Row 1: region name (stencil 22 u, caps; zh body 800 18 u) at (12, 24). At the right: "IF SCORED" label (10 u caps,
  `--ts-text-ink-3`) above the **net** (15 u, 800): "US +3" in `--ts-us-600`, "USSR +2" in `--ts-ussr-600`, "Even" in ink-500.
  If `wins` is set (Europe control), the net reads "US wins"/"USSR wins" with a hazard underline.
* Row 2: two standing chips, US first: side-600 fill (presence at 82 %, none = ink 16 %), glyph + PRES/DOM/CTRL (zh
  存在/支配/控制, "—" for none). The values at the right: "3·5·7" (Europe "3·7·★"). SE Asia: "1 VP each · Thailand 2" instead
  of chips.
* Data: `regionScores.regions[slot]` → `us.status`, `ussr.status`, `net`, `wins`. Values text is static i18n
  (`ui:plate.values.<slot>`).
* Click or Enter on a plate opens the scoring breakdown popover (the same table as the scoring sheet, §10.2) and spotlights the
  region for 2 s. During a region prompt, the plate is the activation target.
* *As built (Q-021, WCAG AA):* the presence chip is at full opacity (gold on USSR red is 4.5:1 only at 100 %), the "If scored"
  caption and the "Even" net use ink-700; the sea labels "To USA" / "To Japan" use board ink (the arrows keep the US colour).
* *As built (QA round 2, R-008):* the plate popover, like a pinned or tapped tooltip (§4.8), is transient. It closes on a new
  prompt (the targets change, or `promptKey` = `vm.prompt?.promptId`), when the runner takes the map (frames) or the layout
  changes, on any press outside the map, on a click / tap on the popover itself (on the click, so the tap never falls through to
  the box under it), and when its plate leaves the view; a resize within a layout re-anchors it (`docs/handoff/map.md`).

### 4.6 Detail levels (scale s = CSS px per u)

| Level | s | Names | Markers | Extras |
|---|---|---|---|---|
| overview | < 0.4 | hidden | numerals hidden; flipped markers become solid 14 u dots, unflipped become ring dots | plates ×1.4, targets still ringed |
| standard | 0.4 – 0.9 | short names | full | — |
| detail | ≥ 0.9 | full names (fitted) | full + empty-slot glyph hints | — |

Recompute the level only at the end of a zoom gesture, not on every wheel tick.

### 4.7 Camera

* Desktop/tablet: starts at **fit** (`fitScale`). Wheel zooms 1.15× per notch around the cursor, range [fit, fit × 4]. Drag pans
  (6 px slop, so a click still clicks). Double-click zooms 2×. Keys `+` `−` `0`. Buttons [+][−][⤢] at the top right of the table
  (30×30, 4 px gap). Transitions animate the viewBox over 350 ms `--ts-ease-in-out`. Reduced motion cuts.
* Desktop **Follow action** (setting, default off): when zoomed in, frame off-screen targets when a prompt opens, and pan to
  off-screen countries before AI beats.
* Compact: always follows. When a map prompt opens, frame (1) all targets if they fit at scale ≥ 0.85; else (2) the region of the
  human's last placement in this play; else (3) the region with the most targets. Before each AI country beat, if
  `!isVisible(country)`, pan there (350 ms) first. Never move the camera while a finger is on the map, or within 3 s of a
  manual pan/zoom.
* **Tap safety (compact, s < 0.6):** a tap whose 48 px circle covers ≥ 2 targets zooms in ×2 around the tap instead of
  activating.
* Hit areas: the box rect. On touch, it is padded by 6 u on each side (≥ 48 px at s ≥ 0.85).
* **As built:** a programmatic `frame()` (follow camera, theatre chips, region keys) marks the view as chosen, so it keeps its
  centre and scale across container resizes, like a manual pan/zoom (the compact orders sheet changes height with every prompt).
* **As built (Q-017):** double-tap / double-click zooms 2× only **off the active targets**: a tap or click on a box or plate the
  prompt offers is always a click and never starts a double-tap (`nextTap()` in `camera.ts`, `useCamera({ isTarget })`), so two
  quick taps on a ringed box place two points; the browser's `dblclick` after two touch taps never zooms. The camera keys
  `+ = − _ 0` work anywhere on the game screen (not in text inputs; a focused map box handles them first; Q-054).

### 4.8 Map tooltip host

The map positions an HTML popover (portal, z 80) next to the hovered/focused/inspected box. It prefers the side with more free space,
then the sea. It has a 7 px arrow and is 200–260 px wide, styled as paper (`--ts-shadow-pop`). Hover delay 300 ms (mouse), immediate for keyboard
focus, long-press 350 ms on touch (which opens the content in a bottom sheet in compact instead). Its **content** is
`props.renderTooltip(country)` (owned by the prompts layer, §8.12). The map supplies the default content when there is no prompt:
name + BG chip, stability · region, US row, USSR row (the human's side marked "(you)"), and a key hint.

*As built (QA round 1):* on touch there is no hover, so a tap decides (`tipAfterTap()`, Q-020): a tap on a non-target box opens
its tooltip, a second tap closes it, a tap on another box moves it, a tap on a target closes another box's tooltip, and a tap on the
sea closes the tooltip and the plate popover (for the mouse too). Focus caused by a finger does not open tooltips; a prompt change
closes a tapped one. Long-press pins the tooltip on compact as well (GameScreen passes no `onInspect`, so there is no bottom
sheet). On touch the default key hint reads "Tap elsewhere to close" (`ui:tip.keys.inspectTouch`, Q-032). In compact landscape
the popover is placed inside the map column (`MapTooltipHost` `bounds`), never over the side column.

*As built (QA round 2, R-008):* a pinned or tapped tooltip closes with the same rules as the plate popover (§4.5): a new prompt
(`promptKey`), frames, a layout change, a press outside the map, a tap on the popover itself, its box leaving the view. A
hover or focus tooltip follows the pointer / focus and only hides while its box is out of view.

### 4.9 Map accessibility

* `<svg role="application" aria-label="Map">`. Each box group is focusable (`tabIndex = 0` only for targets during a map prompt,
  otherwise `-1`, with roving focus) and has `role="button"` (targets) or `role="img"`. Its `aria-label` is: "Iran, Middle East,
  battleground, stability 2, US 2 controlled, USSR 0" + ", legal target: costs 2 Ops" when applicable. Labels are i18n
  `ui:map.countryLabel` with params.
* Keys inside the map: arrows move focus spatially (nearest box in that direction, targets first), `[`/`]` cycle targets only,
  `1`–`7` jump to regions (board order), `Enter` = `onActivate`, `Space` = `onInspect`, `+`/`−`/`0` camera.
* `patterns` setting: USSR flipped markers and USSR control tint get a 45° hatch (`<pattern>` 4 u, 25 % paper).

---

## 5. Console and tracks (`src/ui/console/**`)

All values come from the **shown** state (`useShown().state`), never from the queued frame. Each instrument registers its anchor
(`vp`, `defcon`, `turn`, `ar`, `milops:US/USSR`, `space:US/USSR`) and its beat handler (§9).

| Instrument | Anatomy (desktop) | Data | Interactions |
|---|---|---|---|
| **Wordmark** | "TWILIGHT STRUGGLE" stencil 21 px paper-100, tracking .07em; sub "PLAYFIELD · VS DEEPSTRUGGLE" 9.5 px brass-400 caps | static | click → menu |
| **Turn** | label; 10 cells 15×18 (gap 2, extra 5 px before 4 and 8): past = steel-400 on room-900, current = brass-400 fill + glow, future = dim; era row EARLY / MID / LATE (current era brass-300). Condensed: "5/10 · Mid War" | `turn` | tooltip: era, "Mid War cards were shuffled in at turn 4", hand size |
| **Action round** | 6 pips (turns 1–3) or 7 (4–10) of 20×18, each split **US half left · USSR half right** (the fixed axis; move order is shown by which half is lit, not by position), + dashed 8th pip if `hasAr8(state, side)` for either side; done halves in side tints, current half brass-400 + glow; readout "AR 3 · USSR (YOU)" (13 px; the side word in side-on-room colour, "(you)" brass-300). Headline phase: readout "HEADLINE" | `action_round`, `phasing_player`, `current_phase_name`; AR count from `maxActionRound` (`src/game/rules`) | tooltip: "AR 8 available to the US (North Sea Oil)" |
| **DEFCON** | numeral stencil 38 px in `--ts-defcon-N` with glow; 5 lamps 22 px (5 → 1), the current one lit in its colour; caption (≤ 132 px, 9.5 px caps): the restriction for the level (static i18n `ui:track.defconRule.N`) | `defcon` | tooltip: full restriction text; at 2 the danger frame (§10.5) |
| **VP gauge** | 224 px. Bar 8 px from **US 20 (left) to USSR 20 (right)**, gradient us-600 → room → ussr-600; ticks every 5, the centre tick taller; needle (2 px paper line + triangle head) at `left = 50 % − vp × 2.5 %`; header: "VICTORY POINTS" + readout "USSR +2" / "US +3" / "Even" (side-on-room colour, never colour alone); ends "★ US 20" / "USSR 20 ☭" | `victory_points` (positive = US) | tooltip: VP sparkline of turn ends (kept by the UI from frames) |
| **Mil ops** | label "MIL OPS · NEED 3"; two rows (US first) of 5 cells 9×9: filled = side-500, US square, USSR chamfered; the required level (= DEFCON, display-only) outlined in brass-500; side tags "★ 2" / "☭ 1" | `mil_ops`, `defcon` | tooltip: "USSR short by 2" (display-only, no VP preview, gap G10) |
| **Space** | label; two rows (US first) of 8 cells 8×9; side tags with the box number | `space` | tooltip: per box: min Ops, max roll, VP 1st/2nd (`engineLayout().space_boxes`), perks reached |
| **Language** | segmented EN \| 中文 (12 px, the pressed one brass-500 with ink text) | `useI18n().lang` | `setLang` (§11.4) |
| **Settings / Menu** | 32×32 icon buttons (`--ts-shadow-button`) | — | open the Settings dossier / menu popover |

Compact console: §3.3. Compact **Status sheet**: every instrument above at desktop size, stacked, plus the piles and the
In-effect chips.

*As built (Q-031):* the turn readout, the turn track and the AR readout show `displayTurnAr(state, vm.ending)`
(`src/ui/common/turnAr.ts`), never the engine's counters past the end: "End of turn 3" in the cleanup after the turn's last
round, "End of turn 8" after the turn-8 mil-ops check (not "AR 9"), turn 10 after final scoring (not "Turn 11"). A game that ends
inside a round keeps its played AR pips. The slip head and the game-over telex use the same helper.
*As built (QA round 2, R-014):* a game that ends inside an action round (20 VP, DEFCON 1) reads that round, "Turn 5 · AR 2", in
the console, the slip head and the telex alike (the telex now calls `displayTurnAr` too); a held scoring card, a mil-ops loss and
final scoring read "End of turn N".

---

## 6. The rail (`src/ui/rail/**`)

### 6.1 Adversary dossier

* Panel header "ADVERSARY" + "AR 3" (11 px caps, steel-300).
* Identity row: AI seal 40 px · name ("UNITED STATES" / "SOVIET UNION", 16 px caps paper-100) · sub "DeepStruggle AI · full
  strength" (11.5 px steel-300) · **status chip** at the right: WAITING (steel), THINKING (phosphor with a blinking dot, `.ts-ambient`),
  PLAYING (AI side-on-room colour).
* Hand row (66 px): unknown cards as **backs** 44×62 overlapping by 12 px (count = `aiHandCount − aiKnownCards.length`), then the known
  cards (`aiKnownCards`) as face-up minis lifted 4 px with a brass "KNOWN" tag. Click → card zoom. Meta text: "**5** cards in
  hand · 1 known · China Card: yours / theirs · face down".
* If the AI holds the China Card: a 33×46 China mini after the backs (face up, or the face-down design).
* Headline phase: when `aiHeadlineHidden`, a face-down card sits in a "HEADLINE · COMMITTED" slot (anchor `headline:<ai>`).
* Anchors: `hand:<ai>`, `china:<ai>` (when it holds it), `headline:<ai>`.

### 6.2 In effect

Chips from `state.flags`, keeping only flags with `effectInfo(flag)` (`src/data/effects.ts`). Each chip has the side glyph
(effect side; BOTH/NEUTRAL → no glyph), an 18×25 card thumbnail (`cardImageUrl(info.cardId)`, top crop), the short name
(`effectText(flag).short`), and the duration ("PERMANENT", "THIS TURN", "CONDITIONAL", "SPACE PERK" from `info.duration`). A 3 px left
bar in the side colour. Order: this turn → conditional → permanent → perks. Hover → tooltip with `effectText(flag).description`.
Click → card zoom. Anchor: `effects` (the section header).

### 6.3 Dispatches (the log)

* Teleprinter tape: `--ts-surface-tape`, perforations on both edges (radial-gradient dots every 11 px), a top fade of 40 px,
  newest at the **bottom**. It auto-scrolls unless the user has scrolled up; then a "Jump to latest ↓" pill appears.
* Entry = one `LogEntry`: time code (`T5 HL`, `AR1`; 10.5 px bold ink-500) · side glyph in side ink (★ / hammer and sickle; no
  second side word, since the controller's messages already begin with the side) · `text` via `<MessageText>` · `details` below
  (10.5 px ink-700). Side bar at the left: US solid 3 px, USSR dashed 3 px (pattern, not only
  colour), system 1 px ink-500. Turn separators: "— TURN 5 · MID WAR —". The current play's entry (`kind === "play"` with the
  current turn/AR/side) has a brass wash and a blinking caret while it is still filling.
* Refs: card params → dotted-underlined `<CardRef>` (hover 250 ms or focus → card zoom). Country params → `<CountryRef>` (hover →
  `map.pulse(id)`, click → compact: frame it).
* Filters (segmented, 10 px caps): All / Plays (`kind ∈ play, headline, event, score, turn`) / Dice (entries with a `log:roll.*`
  detail, or `kind === "roll"`: the controller writes rolls as details of the play).
* As built: only the newest 240 entries are drawn, with "Show earlier dispatches" above them (a whole game logs ~1500 entries).
* Typewriter 11.5 px (zh 12 px, line-height 1.5).
* Screen readers: a visually hidden `aria-live="polite"` region announces each new AI entry once, as plain text (`render(text)`).

---

## 7. Cards and the tray (`src/ui/cards/**`, `src/ui/tray/**`)

### 7.1 Card faces

* Images: `cardImageUrl(id, lang)` (500×700 WebP), language per the `cardImages` setting (follow / en / zh). `loading="lazy"`,
  `decoding="async"`. Preload the human's hand and the zoomed card. When the language changes, cross-fade the old and new image
  over 150 ms.
* At hand size the printed text is unreadable, so every hand card carries an HTML **caption** over its bottom 40 %: a gradient
  `transparent → rgba(10,13,16,.92)`, an ops badge 17×17 (US square us-600 / white; USSR chamfered ussr-600 / gold; neutral
  paper-200 / ink), and the name (`cardName(id)`, 11 px caps, 2-line clamp; zh 11.5 px). The caption's right padding reserves
  the strip covered by the next card (`--ov`).
* *As built (cards):* the name wraps by **whole words** on two lines (a word wider than the line ends in "…", never split
  mid-word); the caption is a size container: when it is narrow (≤ 70 px of content) the name is one line with "…", and on a
  narrow overlapped strip (≤ 44 px) only the Ops badge shows (the name stays in the card's accessible name and the zoom).
  `CardTags({ …, compact })` for such strips: KNOWN TO AI becomes the eye alone (the words in its `title` and a hidden span).
* *As built (QA round 2):* an overlapped hand card shows its name as a **spine** instead of the caption's name (§7.2).
* Tags hang from the top edge, centred, rotated 4°: **SCORING** (hazard: black stripes + alert text) on scoring cards; option warnings
  `STRANDS A SCORING CARD`, `OPPONENT EVENT` (amber on hazard); "KNOWN TO AI" (eye icon) when the card's location is
  `HAND_<human>_KNOWN`.

### 7.2 Hand (desktop/tablet)

* **Order:** scoring cards first, then Ops descending, then id. The order is stable within a turn: a card keeps its index until it leaves.
* **Fan:** rotation `(i − (n−1)/2) × 2.2°` around the bottom centre. **Fit:** a ResizeObserver computes the overlap
  `ov = max(−8, (n·w − avail) / (n − 1))` px, capped at `0.55·w`. When the capped hand still does not fit, only the remainder
  scrolls horizontally (24 px edge fades; the wheel scrolls sideways). Coordinator decision: never drop the overlap to scroll,
  which showed only ~4 cards of a 9-card hand at 1366×768 (`fitHand` in `tray/trayModel.ts`). *As built:* past the 55 % cap the
  hand **keeps the 55 % overlap and scrolls the rest**; it never stops overlapping in order to scroll.
* As built: the human's **headline slot** is its own flex item between the slip and the hand (84×118, tablet 70×98, on a dashed
  mat labelled HEADLINE), not a card in the fan.
* *As built (QA round 2, owner decision OD-3):* every card the next one covers by ≥ 12 % of its width wears a **spine**: its
  name as a vertical label in a 19 px band (17 px on 86 px tablet cards) in the card's side tone (the Ops badge's palette), from
  the top edge down to the Ops badge; never on the rightmost card. Hover, keyboard focus and staging cross-fade to the normal
  caption (`--spine-on: 0`). No smaller cards. English reads top to bottom in caps and ends in "…"; Chinese is upright, cut to
  whole characters and followed by three drawn dots, with "/" shown as "／" (R-013). `spineOf` / `SPINE_FROM` in
  `tray/trayModel.ts`, `CardFace spine` (cards).
* *As built (QA round 2):* Esc / Back to hand on the play-mode stage focuses the card that went back: a hand card, or the China
  Card in its slot (R-016). The compact drawer does not do this yet (D-201).
* **States:**

| State | Visual | When |
|---|---|---|
| neutral | as dealt | no prompt / not busy |
| **playable** | lifted 10 px, `--ts-glow-act` | card in `prompt.cards` (headline, action-card, in-hand event-card) |
| not playable | `saturate(.25) brightness(.62)`, caption 75 % | a card prompt is open and the card is not an option |
| **passive** | `saturate(.7) brightness(.8)` | the prompt is about something else (map, mode, branch…), or the AI is moving |
| hovered/focused | lifted 22 px, scale 1.06, z above neighbours; zoom after 250 ms | pointer / focus |
| lifted out | its slot shows a dashed brass outline | the card is on the stage (play-mode) or in the slip clip |
| staged | lifted 22 px + brass 3 px ring + a verb stamp ("HEADLINE", "DISCARD", "GIVE", "PLAY") | first click of a staged choice |

* Keys: `←`/`→` move focus, `Enter` chooses (or stages), `Space` toggles the zoom. `Z` is reserved for undo.
* Anchors: `hand:<human>` (the hand container) and `card:<id>` per card.

### 7.3 China Card slot

Felt (118×128 px) with the card tilted −3° at 92×129. Label under it (9.5 px caps, `#a9cdb2`): "CHINA CARD · FACE UP" /
"FACE DOWN". States: face up and an option → playable glow; face up not offered → passive; **face down** → the face-down
design, desaturated, not clickable, tooltip "Cannot be played until next turn"; **held by the AI** → an outline "China Card:
with the US (face up)" and the card sits in the adversary dossier. Anchor `china:<human>`. Zoom notes: "+1 Op if all spent in Asia"
(i18n).

### 7.4 Piles

Three stacked buttons, 104 px wide: thumbnail 22×30 (deck = card back; discard = top card `discard_pile[last]`; removed = top
card, greyscale) · label (DECK / DISCARD / REMOVED) · count (`draw_deck_count`, `discard_pile.length`, `removed_pile.length`).
Discard and Removed open the **pile viewer** (the card picker dossier in browse mode, §8.10). Deck shows its count tooltip only.
When the deck count is ≤ 2 before a deal, the count pulses once. Anchors: `deck`, `discard`, `removed`.

### 7.5 Card zoom (shared)

Popover (z 80): the image 292×409 + a paper text panel 236 px: title (zh serif ≥ 19 px), meta "#74 · ★ US · 2 OPS · MID WAR",
**card text from data** (`cardTextLines(id, lang)`; it is the current errata, so the label "Text shown is the current errata" applies
when the English image differs), and **play notes** when a prompt is open: Event ("happens for the US" / "yours"), Effective
Ops (`controller.effectiveOps(card)` when non-null), Space race requirement (`engineLayout().space_boxes[space[me] + 1]`: the engine tests the roll against the next box), and
the option's warnings (`warningMessage`). It opens above its source, flips to stay on screen, never covers the slip, and `Esc` closes it.
Compact: the **card sheet** (bottom sheet, 80 % height) shows the same content, plus the prompt's answers for that card: "Play
this card" (action-card), "Headline this card", or the mode rows at play-mode.

### 7.6 Compact hand drawer

224 px sheet over the dock: header "YOUR HAND · 5" + China Card status, then a horizontal scroll of cards 112×157 with captions
and tags (China Card last), with scroll-snap. A tap opens the card sheet (§7.5). The playable/passive states are the same as on desktop.

---

## 8. Prompts (`src/ui/prompts/**`)

### 8.1 The orders slip (shared shell)

Paper slip (`--ts-surface-slip`, `--ts-shadow-slip`, radius 2/3 px). Desktop 344 px wide × the tray height − 4 px. Tablet 296 px.
Compact: full sheet width. Padding 9 px 12 px. Anatomy (top to bottom):

```
ORDERS · TURN 5 · AR 3                          [YOUR MOVE]  ← head 14 px: 10 px caps ink-700 · stamp in --ts-me (AI frames: --ts-ai)
════════════════════════════════════════════════════════════  ← typed rule (1 px ink 50 % + 1 px ink 20 %)
┌clip┐ PLACE INFLUENCE                              2 /4      ← title (19 px caps; zh 17 px body 700) · BIG COUNTER (stencil 36 px)
│card│ “We Will Bury You” › Influence             OPS LEFT     ← crumb (13 px ui; zh 12.5 px) · counter label (9.5 px caps)
│56× │ ⊘ ⊘ ● ●                       [↶ UNDO PLAY  Z]          ← ops chips (19 px brass coins; spent = struck outline) · undo
└78──┘ Click a ringed country: +1 influence. [2 OPS] …         ← hint (11 px body ink-500, 2-line clamp; 1 line if height < 820)
       [primary ↵]  [secondary]  [done label]                  ← actions row (only when the prompt needs buttons)
```

* **Card clip:** 56×78 thumbnail of `prompt.pendingCard || prompt.resolvingCard` (none → no clip), rotated −2.5°, with a paper clip.
  Click → card zoom. Anchor `slip`.
* **Title:** for `influence`, `coup-target`, `realign-target`: the short verb `ui:slip.verb.<kind>` ("Place influence", "Coup",
  "Realign"), because their `prompt.title` only restates the counter. For `play-mode`: `ui:mode.howTitle` ("How will you play
  it?"; the crumb names the card). For every other kind: `prompt.title` rendered. (Gap G4 asks for `Prompt.shortTitle`.)
* **Crumb:** the play so far: card name › mode › target, e.g. "Brezhnev Doctrine › Coup · 3 Ops", "Decolonization (event)".
  Built by the UI from the prompt (pendingCard / resolvingCard, kind, opsValue) and the staged selection.
* **Big counter:** `remaining` / total, with the label `ui:slip.counter.<kind>` ("OPS LEFT", "LEFT", "ROLLS LEFT"). Shown for
  `setup-place`, `bid-place`, `influence`, `realign-target`, and `event-target` when `remaining > 1`. The total is the
  `remaining` seen at the first prompt of this run. Keep it per run in UI state, keyed by `pendingCard|resolvingCard|kind`, reset when the run ends.
* **Ops chips:** one coin per point of the run total, **for `influence` (Ops placement) only**; setup / bid / realign / event runs
  show the counter alone. Spent = outline with a strike. They sit beside the big counter on wide slips and are
  hidden in compact-landscape. The coins the hovered target would spend pulse (`option.cost`; `cost2` fallback).
  As built: the counter total also uses `prompt.opsValue`, so a run first seen mid-way after a reload still shows the right total.
* **Undo:** shown while `vm.canUndo`. Label "UNDO PLAY" (`ui:game.undo`), tooltip `ui:game.undoTitle`, shortcut `Z` /
  `Ctrl+Z` / `⌘Z`. It reverts to the start of the current play. The pencil marks clear with an eraser wipe (200 ms).
* **Hint:** `prompt.detail` rendered when present, else `ui:slip.hint.<kind>`. Inline tokens: a "2 OPS" chip
  (`.cost-chip`) where the hint names the exception.
* **Warnings** (from the options the hint concerns, or the staged option): a warning panel `--ts-warn-bg` with alert-700 text and a hazard
  triangle, copy from `warningMessage(w)` (`src/game/messages`). It replaces the hint while something is staged.
* **Actions:** primary = ink-900 button (paper text, `kbd ↵`). Secondary = ghost. `done` = ghost with the label from
  `doneLabel(prompt)` (`src/game/messages`) plus per-card overrides (§8.4). The hold button is described in §8.2.
* **AI mode** (no prompt, `aiThinking` or an AI frame animating): stamp "US · AI" in `--ts-ai`. Title "Waiting for the United
  States…" with a blinking caret (thinking), or "United States plays Decolonization" (animating). The crumb shows the AI play's
  card › mode → target as beats arrive. Actions: **speed segment** [1× | 2× | ⏭] (maps to normal / fast / instant; ⏭ = skip to my
  turn) and **Skip** (`kbd Space`). If the model is still loading: "Getting the AI ready… 62 %" (`vm.load`). As built: ⏭ calls
  `skipToMyTurn()` once (it shows pressed while the speed setting is instant). While the stage waits for Continue (headline
  papers, scoring sheet: `useStageWaiting().waiting`), **Continue** (`ui:slip.continue`, key cap `ui:shortcuts.key.space`)
  replaces Skip, in AI mode and in the frozen slip.
* **Tight slip heights (as built):** the List link is an icon (named for screen readers), hidden while something is staged;
  undo shrinks to its icon when the actions row also holds a primary or done button; the actions row docks to the bottom.
* **Fit (as built):** the note under the title (the hint, or the staged choice's consequence) keeps only the **whole lines
  that fit** beside everything else (`useFitLines`: 2, 1 or none), never a line cut in half. Every line that can be clamped or
  ellipsized carries its full text as a `title` tooltip (title, crumb, hint, consequence, "still thinking", the ending reason,
  region buttons). The **crumb stays on one line**: the card name gives way first ("苏伊士运河… › 政变 → 以色列 · 3 行动点"), a long
  target is capped at 45 %, the mode and Ops stay whole.
* **As built (QA round 1):** on desktop / tablet a staged warning panel takes the crumb's line (the clip and the primary name the
  play), so the panel (never below one whole line) and the actions fit the 152 px slip (Q-039). The head uses
  `displayTurnAr` ("Orders · End of turn 3"; Q-031). Conditional Ops bonuses lead the influence hint (§8.6). On touch the hints
  say "Tap" (§3.3). Compact landscape: §3.4.
* **As built (QA round 2):** **AI wait** (owner decision OD-2): from 8 s of one wait the note under the AI title reads "Still
  thinking · 14 s" (`ui_prompts:ai.stillThinking`; the seconds in a fixed-width tabular span). Past 20 s, the first such wait of
  the page session adds one sentence, "At full strength the AI can take up to a minute per move on this device."
  (`ai.stillThinkingSlow`), where the slip has room for two lines; elsewhere (tablet slips) the sentence comes once as a 9 s toast
  (`ai.slowHint`). See §9.5. **Title** (R-012): up to 4 lines where the slip has room beside everything but the note under it (2
  at least; 1 beside the region grid). A cut title or crumb becomes a toggle (`role="button"`, `aria-expanded`; a tap / click on
  the title block, or Enter / Space on the title) that shows the whole text in place and wraps the crumb; a new prompt starts
  folded. This is the touch path to text that `title` tooltips give the mouse (§12). **Head** (R-014): a game that ended inside a
  round reads "Orders · Turn 5 · AR 2", as the telex. **AI crumb** (R-007): a roll names a target only for a coup, realignment or
  war ("OAS Founded › Space race", never "→ Norway"). Touch targets and key caps: §3.2 / §3.3.
* **Game over (as built):** the slip shows **New game** and **Result** (reopens the telex), once the last frames have played.
* **Human frame animating** (your own click resolving): the slip keeps the last prompt's content, frozen and non-interactive. No flicker.
* `aria-live="polite"` on the title and counter. The new title is announced, focus is never stolen.

### 8.2 Confirmation model

Every option gets a **commit policy** (`OptionPolicy`, computed by `policyFor(prompt, option, settings)` in
`src/ui/prompts/policy.ts`, a pure, unit-tested function):

| Commit | Behaviour | Applies to |
|---|---|---|
| **instant** | one click / tap / Enter calls `choose(promptId, idx)` | non-final influence / setup / bid / event-target points; hand card at `action-card` (non-scoring, no warning); play-mode Influence / Coup / Realign; `op-mode` modes; `un-intervention` |
| **stage** | 1st activation selects (reticle on the map / lifted card + verb stamp / pressed button). The slip shows the consequence and a primary button. The **2nd activation on the same thing** (same country, same card, same button), `Enter`, or the slip's primary commits. `Esc`, clicking elsewhere, or 6 s without action cancels | always: `coup-target`, `realign-target`, `headline`, `event-card`, `branch`, `defcon-level`, `region`, scoring cards and Quagmire/Bear Trap escape at `action-card`, event-target when `resolvingCard` is a war card (`cardInfo(id).war`) or in `EVENT_COUP_CARDS`, any option with `scoring-stranded`, any game-ending warning that applies on only some die faces (`params.faces < 6`). If `settings.confirmFinal`: the **final point** of a placement run, play-mode **Event** and **Space**, every `done` press |
| **hold** | press and hold 1.2 s (a ring fills around the button / box, `--ts-danger`). Keyboard: hold Enter. Release early cancels. Reduced motion: the ring fills without easing | options whose `defcon-suicide`, `cmc-suicide` or `game-ending` warning is certain (`faces` absent or 6), Wargames "end the game", DEFCON 1 at `defcon-level` |

* **"Final point"** = the click that ends the human's play: `remaining === 1`, or `remaining === 2` and the target is in `cost2`
  (contract gap G1: the exact answer should come from the controller). After the final point the AI moves and **undo is gone**,
  so this is the click that deserves a second look.
* **As built (`confirmFinal` follows `option.endsPlay`):** with the setting on, any option with `endsPlay: true` stages (the final
  point, every done press, play-mode Space, a play-mode Coup whose only target is auto-played…). A play-mode **Event** stages
  only when `endsPlay !== false` (an Event that asks for targets next keeps undo, so it is instant).
* **As built (wins):** a certain game end that the human **wins** (`params.winner`) stages, with severity "caution" and no hazard
  ring; hold, the hazard ring and "fatal" are for losses and draws. A win is final but not a danger.
* **As built (hold on map / hand targets):** the first activation selects; focus moves to the slip's hold button, which confirms.
  Map boxes and hand cards have no hold ring of their own. In dossiers and on the play-mode stage the hold button is in place. The
  hold label is `warningMessage(w)` with "Press and hold to confirm" under it; the warning panel is not repeated.
* **As built (timeout):** the 6 s staging timeout pauses while the pointer is over the slip and restarts when the staged country is
  hovered.
* Realign: after a roll, the selection **stays** on that country, so "again in Iran" is one more activation of the staged pair.
* Staging is local UI state (`useStaging()`), cleared whenever `prompt.promptId` changes.
* Stamps on staged hand cards: headline → "HEADLINE", discard prompts → "DISCARD", give (Missile Envy) → "GIVE", other → "PLAY".
* **As built (QA round 2, tap queue):** the one exception to "activations are ignored while a frame animates" (§9.1) is a map
  tap during your own placement frame (the ~250 ms control-flip beat before the next point's prompt opens). It is queued
  (`PromptStore.queue`: one at a time, only in setup-place / bid-place / influence / event-target runs, only for a country that
  prompt offered) and applied to the next prompt when that is unambiguous: the prompt continues the same run and offers the
  country. It then does exactly what a tap would (an instant point places, the final point stages). It is dropped otherwise, when
  the AI thinks, when the game ends, and after 2.5 s. Coups and realignments never queue.

### 8.3 Warnings

| `WarningCode` | Severity | Where it shows | Policy |
|---|---|---|---|
| `opponent-event` | info | tag on the hand card ("US EVENT" with glyph); footer of the Operations group on the play-mode stage; line in zoom/tooltip | instant (no extra step) |
| `scoring-stranded` | caution | hazard tag "STRANDS A SCORING CARD" on the card; warning panel when staged; amber dot on the compact ☰ | stage |
| `defcon-suicide` / `cmc-suicide` / `game-ending` (some faces) | fatal-probable | hazard ring on the map target; hazard footer on the mode button; tooltip line "On 2 of 6 rolls…" | stage |
| `defcon-suicide` / `cmc-suicide` / `game-ending` (certain) | fatal | hazard ring; button in hazard stripes, label "This ends the game — you lose" / "— {winner} wins" | hold |
| `game-ending` (certain) that the human wins | caution | warning panel when staged; no hazard ring | stage |

Copy: always `warningMessage(w)` (src/game). Never write warning text in the UI.

### 8.4 `done` labels

`doneLabel(prompt)` (src/game/messages.ts) returns the label for the context, per-card overrides included (keys
`prompt:doneFor.<context>`; i18next cannot nest them under the `prompt:done.<meaning>` strings). The UI only calls `doneLabel`; it never
looks these keys up itself. The contexts implemented (as requested here):

| Context | EN | ZH |
|---|---|---|
| pass, AR8 (title key `actionCardAr8`) | Skip action round 8 | 放弃第 8 行动轮 |
| pass, only the China Card left | Pass (keep the China Card) | 跳过（保留中国牌） |
| stop, realign | Stop realigning | 停止调整 |
| decline, 40 (CMC payoff) | Keep the crisis — play on | 保留危机——继续 |
| decline, 10 (Blockade) | Discard nothing — lose W. Germany influence | 不弃牌——失去西德影响力 |
| decline, 95 (LADC) | Discard nothing | 不弃牌 |
| decline, Junta / Tear Down This Wall free ops | Skip the free operation | 放弃免费行动 |
| return, 67 (Grain Sales) | Return it — take 2 Ops | 退回——改用 2 行动点 |
| return, Our Man in Tehran | Done — return the rest | 完成——其余放回 |
| skip, SALT / Star Wars | Take no card | 不拿牌 |
| pass, 250 (Eagle/Bear discard) | Keep my hand | 保留手牌 |

`D` is the keyboard shortcut for done. It stages per §8.2.

### 8.5 Map prompts: shared behaviour

For `setup-place`, `bid-place`, `influence`, `coup-target`, `realign-target`, `event-target`:

1. Build `MapTargets` with `usePromptTargets(prompt, shown.state)`: `ids = prompt.countries`, `tone`, `danger` (options with
   fatal warnings), `cost2` (influence-type kinds only: targets whose `controlled_by` is the opponent of
   `decision_context.decision_player`; display-only, isolated in `src/ui/prompts/costHint.ts`, gap G1), `verb`
   (`influence/setup/bid` → add; `coup-target` → coup; `realign-target` → realign; `event-target` → add/remove/target from
   `prompt.title.key` / card table `src/ui/prompts/eventVerbs.ts` until the contract gives `Prompt.effect`, gap G3), and `cap`.
2. The map enters focus mode. Compact frames the targets (§4.7) and fills the theatre-chip counts.
3. Hover/focus → tooltip (§8.12) + ghost marker. Activate → policy (§8.2).
4. After `choose`, the human frame animates fast (motion × 0.6). Meanwhile the rings stay frozen from the previous prompt (no flash). When the
   next prompt arrives, rings that are still targets stay, new ones fade in over 120 ms, and removed ones fade out.
5. Pencil marks accumulate in `Shown.placedThisPlay` (from the human's `influence` events since the play's first prompt) and clear
   at play end / undo.

### 8.6 Per `PromptKind`

| Kind | Where | Answer | Commit | Specifics |
|---|---|---|---|---|
| `setup-place` | map + slip | click a ringed country, +1 each | instant; the last point stages | Title from `prompt.title` ("Place your starting influence in Eastern Europe"). The subregion's land gets a 10 % brass tint and its plate a loud ring. Counter "6 /6 LEFT". After the human's setup, the AI's animates as one batch (stagger 120 ms) |
| `bid-place` | map + slip | same | same | Title "US bid: place 2 extra influence"; detail "Only in countries that already have US influence" (from the prompt). It never says "Western Europe" |
| `headline` | hand (+ slip) | click a card → it lifts with a "HEADLINE" stamp; the slip shows "Commit headline: *Card*" (primary) | **stage** | Slip hint `ui:slip.hint.headline` ("The AI chooses at the same time. Higher Ops resolves first; the US on a tie."). If `aiHeadlineHidden`, the adversary's headline slot shows a committed back. If the AI's headline is visible (space-race perk), the face-up mini sits there with "REVEALED". After commit, the card turns face down in a **headline slot** at the left end of the hand (anchor `headline:<human>`) |
| `action-card` | hand + China slot | click a playable card | instant → play-mode follows. **Scoring card / trap escape / warned: stage** | Slip title from the prompt (it covers AR8 / Missile Envy / Quagmire / Bear Trap). Detail gives plays left and scoring cards in hand. A scoring card's staged slip shows "Score *Middle East* now · if scored: USSR +2" from `regionScores`. `done` = pass when offered (staged) |
| `play-mode` | **stage** (centre of the table) + slip | mode buttons | Influence/Coup/Realign: instant. Event/Space: stage (setting; Event only when `endsPlay !== false`, §8.2). `un-intervention`: instant | §8.7 |
| `op-mode` | stage panel without the card's Event/Space rows | 3 mode buttons | instant | Header names the source card (`prompt.pendingCard`): "Free Ops from *CIA Created* · 1 Op", "*Junta*: free coup or realignment", "*Tear Down This Wall*: Ops in Europe". `done` = decline when offered (staged) |
| `influence` | map + slip | click a ringed country | instant; final point stages | §8.5. Counter `remaining / runTotal` "OPS LEFT", ops coins. Hint "Click a ringed country: +1 influence. **2 OPS** marks opponent control: a point there costs 2." China Card / Vietnam Revolts bonus: the hint adds `ui:slip.hint.asiaBonus` when `pendingCard === 6` |
| `coup-target` | map + slip | click → reticle + pinned tooltip with the odds strip | **stage** | Slip title "Coup → *Iran*", crumb card › Coup · n Ops, primary "Launch coup ↵", hint "A coup is final once the die is rolled." The tooltip odds come from `controller.coupOdds(id)` (§8.12) |
| `realign-target` | map + slip | click → reticle | **stage** (selection stays after a roll) | Counter "ROLLS LEFT". Primary "Roll in *Iran*". `done` (stop) = "Stop realigning". Tooltip: influence of both sides, adjacent controlled countries, superpower adjacency (facts from state + `src/data` neighbours), plus the odds from `realignOdds` (G5, as built) |
| `event-target` | map + slip | click | instant; final point / war / coup-cards stage | Title from the prompt (per-card). Ghost: "+1" in the decider's slot, or a struck "−1" in the affected side's slot for removals. `maxPerCountry` → cap tags "1/2", and the ring disappears when capped (the mask drops it). **CMC payoff** (`resolvingCard === 40`): title from the prompt, done = "Keep the crisis — play on" |
| `event-card` | in-hand: hand with verb stamps; otherwise: **card picker** dossier (§8.10) | select a card, then confirm | **stage** | Location tags per card ("Hand", "Discard pile", "Drawn", "US hand"), from the redacted `card_locations`. Repeating pickers (Ask Not, Our Man in Tehran) show a counter "Discarded 1". `done` labels per §8.4 |
| `branch` | **branch dossier** (§8.8) | one tile per option | **stage**; Wargames end = **hold** | Tile text from `branchMeta(card, idx, state)` (`src/game/branches`): `title` + `desc` |
| `defcon-level` | **DEFCON dossier** (§8.9) | lamp tiles 5…1 | **stage**; level 1 = **hold** | Only offered levels are enabled. Labels from `branchMeta` (improve / unchanged / degrade / ends game) |
| `region` | map region mode + slip list | click a region plate / theatre chip / slip row | **stage** | §8.11 |

*As built (QA round 1):* **influence**: conditional bonuses lead the hint (`bonusHints`: the China Card in Asia, Vietnam Revolts
in Southeast Asia for the USSR, `ui_prompts:hint.seAsiaBonus`), so they are in the lines that fit (Q-037). **coup-target**: the
tooltip formula ("4 Ops + ⚀ − 1 − 2×2"), the mil-ops line and the staged crumb use `CoupOdds.ops` / `CoupOdds.modifier` (the
engine's: the China Card's +1 only in Asia, Vietnam Revolts only in Southeast Asia; SALT −1, Latin American Death Squads ±1),
else the prompt's Ops (Q-038). **defcon-level**: level 1 holds only when it loses (§8.9).

*As built (QA round 2, R-015):* **realign-target** and **coup-target** get the conditional-bonus hints too
(`ui_prompts:hint.asiaBonusRealign` / `.seAsiaBonusRealign` / `.asiaBonusCoup` / `.seAsiaBonusCoup`). They lead the hint and,
for a staged realignment (its country stays staged across rolls), its consequence, so "5/5 → 3/5 rolls left" after a roll outside
Asia is explained. The unstaged coup crumb drops its Ops while such a bonus applies (the prompt's Ops are a maximum); the staged
crumb keeps `CoupOdds.ops`.

### 8.7 Play-mode stage (`final-playmode.png`)

* A scrim over the table (`--ts-scrim-stage`, z 40). The chosen card flies from the hand to the stage (300 ms × 0.6) and sits at
  262×367, rotated −2°, with a 2 px brass rim. Its hand slot shows the dashed outline.
* Panel 392 px (`--ts-surface-panel`, brass top highlight), gap 26 px to the card:
  * Kicker "HOW WILL YOU PLAY IT?" (13 px caps brass-300, tracking .24em).
  * Card name (stencil 34 px caps; zh serif 900 30 px).
  * Meta: side glyph + "Opponent's card · 2 Ops" / "Your card · 3 Ops" / "Neutral · 2 Ops". Ops = `effectiveOps(card)` when
    non-null, else printed.
  * **Event** row (paper button, 34 px icon tile, title 16 px caps, description 11.5 px): own/neutral card → "Resolve the event";
    opponent's card → "Event first: the US event resolves for the US, then you spend 2 Ops" (from the prompt detail key
    `playModeOpponent`). Key `E`.
  * **Operations** group (outlined): header "OPERATIONS · 2 OPS", three equal buttons Influence `I` / Coup `C` / Realign `R`, and one
    shared footer for `opponent-event`: "Then the US event happens: …" (warning text). Hazard footers on individual buttons carry
    their own fatal warnings.
  * **Space race** row: "Discard for a launch: box 2 → 3, roll 1–3. No event." (box data from `engineLayout().space_boxes`). Key `S`.
  * Grain Sales: an extra row **"Play UN Intervention on it"** (`un-intervention` option), and `done` (return) at the bottom.
  * Footer: "Esc · Back to hand" (= `undo()`, shown when `canUndo`) and "Undo is free until a die is rolled".
* Options not offered render disabled (40 %, `aria-disabled`) so the panel never reflows. Keyboard: `E I C R S`, arrows,
  `Enter`. Focus starts on the first enabled mode.
* Hidden for scoring cards (they resolve on choice).
* Compact: the same rows in the **card sheet** under the card image (MC `phone-card.png` layout): rows ≥ 56 px, the card image at 46 %
  width.
* As built: the slip's title is `ui:mode.howTitle` (§8.1). The stage hides the big card on narrow / short tables (≤ 1199 px wide
  or ≤ 760 px high) so the panel fits. Play-mode Event stages per §8.2 (`endsPlay`).
* As built (QA round 1): the letters `E I C R S` (also by physical key) move focus to the row they stage, so `Enter` commits that
  row (Q-026). The Event row of an opponent's card always says `prompt:detail.playModeOpponent`; a play-mode with its own title
  (Grain Sales) shows its detail under the panel's header (Q-036). Compact: on short viewports (≤ 560 px high) the card is a 52 px
  thumbnail beside its name and the rows 44 px, so Event · Operations · Space race · Back to hand fit at 844 × 390 (Q-029); below
  480 px wide the Operations buttons stack icon over word (Q-035); the compact card sheet's answer is a sticky footer.

### 8.8 Branch dossier (modal, z 70)

Folder (`--ts-folder`, tab with the event name) around a paper inner panel 640 px wide (compact: full-screen sheet). Event card
92 px at the left of the header. Title from `prompt.title`. One large tile per option (min 120 px tall): icon, `branchMeta.title`
(16 px caps), `desc` (12.5 px). The fatal one is in hazard stripes with the warning text and a hold button. Selection = brass ring.
Primary "Confirm ↵". Focus trapped, `Esc` = back (undo, when `canUndo`).

As built (Q-039): a tile whose option ends the game says so: a loss in the hazard line, a win in a caution line (`.tileCaution`,
no stripes).

### 8.9 DEFCON dossier (modal, `situation-room-defcon-choice.png` geometry)

Five lamp tiles (5 → 1, each 1 fr × 92 px): the level numeral (stencil 40 px) in its DEFCON colour, the caption "CURRENT" /
"IMPROVE" / "DEGRADE" / "ENDS THE GAME — YOU LOSE". Disabled when not offered. Level 1 is hazard-striped and needs a hold. The restriction text of the
selected level goes under the tiles (`ui:track.defconRule.N`).

As built (Q-025): the lamp captions come from the options' warnings (`defconCaption`): "Ends the game — you lose" for a loss,
"Ends the game — you win" when DEFCON 1 would make the human win (the phasing player loses: How I Learned in the AI's round, a
Summit won in the AI's round), else the relative caption. A level 1 the human wins is staged with a brass caution ring and the
warning's words under the rule line; hazard stripes and the hold are for a loss only. How I Learned's slip detail says "…and you
would win" in that case (`prompt:card.46.detailWin`).

### 8.10 Card picker / pile viewer (modal; geometry of `situation-room-card-picker.png`, labels of `modern-board-cardpick.png`)

Dossier 860 px wide (compact: full-screen sheet). Header: event card name tab + instruction (`prompt.title`, `prompt.detail`). A grid of
cards at 132×185 (compact 2 columns), each with its location tag under it. Hover → zoom. Single selection with a brass ring
(Ask Not / multi-step pickers stay single per decision). Footer: `done` (ghost, left) + "Double-click a card or press Enter" + primary
"Take *OPEC* ↵" / "Discard *…*" / "Give *…*". **Browse mode** (piles): read-only, with filters (side, era, Ops) and sorted by id.

As built (Q-040): the compact grid is `repeat(auto-fill, minmax(148px, 1fr))` (4 columns on a portrait tablet, 2 on phones).

### 8.11 Region prompt (Chernobyl)

The map enters region mode. The six offered regions' plates get loud rings and act as buttons, and so do the theatre chips (compact). Hovering one tints
that region's land 10 % brass and dims the other regions' boxes. The slip lists the regions as rows (keyboard). Staged: "USSR may not place
influence with Ops in **Asia** this turn" (`branchMeta`). After the commit, the region's plate carries a hatched "CHERNOBYL" band until
the effect ends.

As built: on desktop/tablet slips the regions are a **dense 3×2 grid** (`RegionChoice dense`: short plate names, the full names as
labels); the staged button is the primary (ink, ↵); no crumb and one consequence line (full text in its title). Compact keeps the
rows + primary, with the short names too, on up to two lines (the full name as label / title; Q-034).

As built (QA round 2, R-009): on desktop / tablet slips **Undo play stands beside the 3×2 grid** (icon only, the height of both
rows, no Z cap; its title and `aria-keyshortcuts` keep the shortcut), so it stays inside the 120–138 px slips. The one line under
the grid shows the staged region's consequence, else the prompt's detail, only where it fits (desktop slips; not tablet slips).
The region buttons use tighter tracking, so "MIDDLE EAST" stays whole in their 69 px columns.

### 8.12 Country tooltip content (`CountryTooltip`, given to the map as `renderTooltip`)

Paper card, 12.5 px body:

1. Header: country name (15 px caps / zh 14 px) + "BATTLEGROUND" chip (`--ts-bg-band`).
2. Rows: "Stability · Region" → value. US row (glyph, `--ts-us-600`) → influence + "· control". USSR row → same. The human's
   side is marked "(you)".
3. Prompt section (dashed rule above), by kind:
   * add influence: "+1 → USSR 0 → 1" (+ "→ CONTROL" when `cost2`-style derivation says it flips: display-only, G1),
     cost line "Costs **2 Ops** (US-controlled)" for `cost2` targets.
   * remove: "−1 → US 2 → 1".
   * coup: formula "3 Ops + ⚀ − 2×2" (from opsValue and stability), "**Success 4/6**" (stencil 18 px), then the **odds strip**: six
     26 px dice 1…6 (green `--ts-die-ok` = success with "+n" net below, grey `--ts-die-fail` = fail, hazard = `endsGame`), then
     consequences: battleground → "Battleground: DEFCON 3 → 2" with a hazard triangle (display), "Mil ops +3".
     **`controller.coupOdds(id)`** is called on hover (debounced 120 ms, cached per promptId). Never call it for all targets at once.
   * realign: both sides' influence and the facts (adjacent controlled countries per side, superpower adjacency); as built, also the
     odds from `controller.realignOdds(id)` (G5 implemented).
   * event target: the verb line from the prompt.
   * warnings for this option: `warningMessage` in alert-700 with a hazard triangle.
4. Key hint (11 px ink-500): "Click place · Right-click details" / "Click select · Click again to launch".
   As built (Q-032): touch wording on touch screens ("Tap to place", "Tap again to launch", `ui_prompts:touch.*`).
   As built (QA round 2, R-002): "Mil ops +N" prints `CoupOdds.milOps`, what the engine credits
   (`free_action::coup_earns_no_military_ops`): no line for an Event's own free coup (Junta and Tear Down This Wall when the
   Event granted the Ops, Ortega Elected), "+3" on Che's event coups, the Ops for any other coup. Without the field: the coup's
   Ops on coup-target prompts only.

### 8.13 Target list (accessible alternative: compact expanded sheet; desktop key `T`)

The list of `prompt.countries` grouped by region (board order), rows 52 px: name · stability · BG chip · US/USSR influence ·
cost tag · action button ("+1", "Coup", "Roll", "Select"). Activating a row calls the same policy as the map. Screen readers use this list
(`role="listbox"`, `aria-activedescendant`). Desktop: opened with `T` or from the slip's "List" link. Compact: shown when the sheet is
expanded. As built: on desktop the list opens in a dossier titled with the prompt; rows stage / commit with the same policy (the
confirm words replace the action pill once staged).
As built (QA round 1): the active row is kept by country id across placements (a second Enter places in the same country; a
row that leaves the list moves to the next target in board order), and rows are named "Finland, stability 4, US 0, USSR 1 —
place 1 influence" (Q-027). Compact landscape opens the list from the side-column slip (§3.4; Q-030).

---

## 9. Animation

### 9.1 The frame runner (`src/ui/runner/**`)

The controller hands the UI one `Frame` at a time (`vm.frame`) and releases the next only after `ackFrame(seq)`. Prompts appear
only when the queue is drained and the current frame is acked. The runner:

```
useFrameRunner():
  on vm.frame.seq change (frame F, previous committed state S):
    if S is null (first frame of a game / resume):   commit(F) → ack(F.seq); return
    speed  = frameSpeed({ speed: settings.speed, auto: F.auto,
                          byHuman: F.actor === humanSide && !F.auto, queued: vm.queued,
                          skipping: skipToMyTurn, boost: shiftHeld })
    groups = buildBeats(F, S, humanSide)     // pure: src/ui/runner/beats.ts (unit-tested)
    for group in groups:                     // sequential
       await Promise.all(group.map(b => director.run(b, ctx)))   // parallel inside a group
       if aborted: break                     // Skip
    commit(F)                                // Shown.state = F.state, Shown.regionScores = F.regionScores
    map.clearOverrides(); others clear overrides on commit
    ack(F.seq)
```

* **Director** (`Director.on(kind, handler)`): components register a handler per beat kind (§15.1). A beat with no handler
  resolves at once. Handlers MUST resolve; on `signal.abort` they jump to their end state within one frame and resolve.
* **Overrides:** during a beat, a component may show a value newer than `Shown.state` (e.g. a box's numeral after its influence
  beat). Every override is dropped on commit, when `Shown.state` catches up.
* **Never animate stale data:** a beat handler reads only the beat payload and `ctx.before`, never `vm`.
* **Skip** (`Space`, `Esc` when no dialog is open, a click on the table during an animation, the slip's Skip button): aborts the current
  frame (→ commit → ack). Later frames play normally. **Skip to my turn** (`Shift+Space`, the ⏭ segment): `skipping = true`
  until the next human prompt, `game-over`, or (when `pauseOnReveals`) a `headline-reveal` / `scoring` beat.
* **Shift held:** boost (× 1/3 durations).
* While `Shown.busy`: map activation and hand clicks are ignored (`cursor: progress` on the table), but hover, zoom, tooltips,
  log, card zoom and the menus all work.
* `document.hidden`: when the tab is hidden, finish the current frame instantly and keep acking (no animations off-screen).

### 9.2 Speed

`frameSpeed()` in `src/ui/theme/motion.ts` is normative:

| Input | Motion factor | Hold factor |
|---|---|---|
| setting slow / normal / fast / instant | 1.4 / 1 / 0.55 / 0 | same |
| `frame.auto` | × 0.6 | 0 |
| the human's own frame | × 0.6 | unchanged (the dice still get read) |
| `vm.queued > 2` / `> 6` | × 0.6 / × 0.3 | × 0.6 / 0 |
| Shift held | ÷ 3 | ÷ 3 |
| skipping | 0 | 0 |

`dur(base, factor)` gives a duration. `0` means: apply the end state with no animation. CSS animations use `--ts-speed`, which the
shell writes inline from the setting (`0.0001` for instant, so `calc()` never divides by zero).

### 9.3 Reduced motion

Active when `prefers-reduced-motion: reduce` (unless the setting says `full`) or the setting says `reduce`. The shell sets
`data-motion`, and `useReducedMotion()` returns the boolean. Under reduced motion every handler uses its **reduced variant** (the right
column of §9.4):

* No translation, rotation, flip, tumble, camera easing, shake, flash or marching dashes. Cross-fades ≤ 150 ms, plus position
  cuts.
* **Holds stay** (reading time is not motion). "Pause on reveals" keeps working.
* Dice show the final face immediately, with the maths line.
* Ambient loops stop (`--ts-ambient-state: paused`): rings are static, the caret is static, the DEFCON-2 frame is a static orange
  inset border.
* Nothing moves more than 8 px.

### 9.4 Catalogue (one row per `GameEvent`; durations at 1× from `TIMING` in motion.ts)

`buildBeats` turns events into beat **groups** in this order (it matches `src/game/events.ts`, which emits cause before effect):

1. `card-played` / `headline-chosen` / `headline-reveal` (each its own group)
2. each `roll` (its own group, in order)
3. each `scoring` (its own group)
4. one group of **country beats**: `influence` + `control` events merged per country, staggered 120 ms by board order
   (compact: a camera pan before off-screen countries)
5. one group of **track beats**: `milops`, `space`, `defcon`, `vp` (in parallel)
6. one group of `effect-on/off`
7. `reshuffle` → `deal` → `hand-revealed` → `card-moved` (staggered 60 ms), each its own group
8. `china-card`
9. `turn-start` → `phase` → `action-round` (end-of-turn frames: the events module already orders vp → milops → … →
   turn-start; keep its order and only merge the country beats)
10. `game-over`

| Event | Beat handler (owner) | Animation | Duration · easing | Reduced variant |
|---|---|---|---|---|
| `turn-start` | banner (stage) | Paper banner across the table's upper third, "TURN 6 · MID WAR" types in (typewriter, 18 ms/char), the console turn cell slides one step. Turns 4 and 8 add an era stamp "MID WAR — NEW CARDS SHUFFLED IN" and a deck pulse | in 350 `out` · hold 900 (era 1300) · out 350 `in` | fade 150, same hold |
| `phase` HEADLINE | banner | plate "HEADLINE PHASE" | in 250 · hold 700 · out 250 | fade |
| `phase` SETUP / ACTION_ROUND / GAME_OVER | — | none (SETUP: the start of the game shows the setup plate via the prompt title) | — | — |
| `action-round` | track (console) | the AR half-pip floods brass (scale .6 → 1), the readout cross-fades, the slip/adversary stamps swap side | 300 `out` | instant |
| `deal` | tray / rail | cards fly deck → hand: yours face up (flip at mid-flight), the AI's as backs to the dossier. Batches > 4: 4 flights, then the rest appear | 280 each, stagger 70, max 1400 · `in-out` | counts update + 150 fade-in |
| `reshuffle` | tray (piles) + toast | the discard stack slides onto the deck as 3 offset ghost cards. Toast "Deck exhausted: discards reshuffled. Cards still in hands are now known to both sides" | 900 `in-out`, toast 3000 | toast only |
| `hand-revealed` | rail (AI) / tray (human) | AI: backs flip one by one to faces + "REVEALED" stamp on the dossier. Human: the "KNOWN TO AI" eye tag blinks on the cards | 350 each, stagger 90, stamp 300 | faces appear, tag appears |
| `card-played` (AI) | stage (reveal dock) | a back leaves the dossier, flies to the **reveal dock** and flips at mid-flight; the caption types: kicker "UNITED STATES PLAYS", name (stencil 24 px; zh serif), how line "OPERATIONS · COUP → ANGOLA · 1 OP" (fills in as later beats arrive), and for an opponent card a note "USSR card: its event also happens, for the USSR" (as built: no "after the coup", the UI cannot know the AI's order; the how line's Ops are the printed Ops). Hold, then the dock stays **pinned** for the rest of the play (§9.5) | flight 450 `out` · flip 300 `in-out` · caption 200 · hold 1100 | dock appears with the face (fade 150), same hold |
| `card-played` (human) | tray → slip | the card glides from the hand or stage into the slip clip; stamp "OPS · INFLUENCE" / "EVENT" on the slip | 300 `out` | instant |
| `card-played` how=space | stage + console | the card slides to the space instrument; the `roll` beat shows the dice there; on success the marker advances (`space` beat) | 450 + roll | result text |
| `card-played` how=scoring | stage | the card to the centre, then the scoring sheet (`scoring` beat). As built: the AI's scoring card shows in the reveal dock, then the sheet | 400 | sheet fades |
| `card-played` how=discard / give / pass | tray / rail | discard: to the discard pile. Give: across to the other hand (flips to a back if hidden from the human). Pass: a "PASS" stamp on the slip or dock | 450 `in-out` · stamp 300 | fade / text |
| `card-moved` | flight layer | a generic arc flight (40 px lift, quadratic) between anchors (§9.6); a removed card ends with a grey wash; unknown AI cards fly as backs | 450 `in-out`, stagger 60, max 1200 | fade at source + fade at destination |
| `headline-chosen` | tray (human) / rail (AI) | a face-down card slides into that side's headline slot; "COMMITTED" stamp | 400 `out` | instant |
| `headline-reveal` | stage (§10.1) | the newspapers | drop 500 · stamps 250 · hold 1600 (or wait) · fold 350 | papers appear, no motion |
| `influence` (+) | map | a counter drops 14 u from above onto its slot, scales 1.15 → 1 (thunk), a ring ripple in the side colour, the numeral rolls old → new; a "+n" chip floats 22 u up and fades | 260 `thunk`, float 700 (par) | numeral cross-fade 120 + static ring 400 |
| `influence` (−) | map | the counter lifts 6 u and fades, a strike flash, the numeral rolls down, "−n" floats | 220 `in`, float 700 | cross-fade |
| `control` | map | 80 ms after its influence beat: the box border sweeps to the new colour and the marker **flips** (rotateY 180°, face swap at 90°); micro-stamp "CONTROL"/"LOST" for 600 ms | 350 `in-out` | instant swap + 1 s outline pulse |
| `roll` | stage (dice tray) | a felt **dice tray** beside the target box (never over it; anchor `country:<id>` for COUP / REALIGNMENT / WAR_EVENT with a country, `space:<side>` for SPACE_RACE, `stage` for OLYMPIC_GAMES / SUMMIT / TRAP_ESCAPE / others). A reticle locks on, the die tumbles (3 turns, faces flicker every 80 ms) and lands on `roll1` with a settle bounce, then the maths line types in ("5 + 1 Op − 2×1 = **4**") and the result ("USSR −2 · US +2"). Two dice when `roll2` is present: **US die left, USSR die right**, modifiers under each. Success tints the result `--ts-ok-500`, failure steel | lock 250 · tumble 700 `out` · math 200 · hold 900 (realign 600) | the static face + maths, same hold |
| `vp` | console | a "+3" chip flies from the source (the box, sheet or dock; else the table centre) to the gauge; the needle swings with a slight overshoot; the readout rolls | chip 600 `out`, needle 600 `back` | needle jumps, readout flash 150 |
| `defcon` (down) | console + danger frame | the new lamp flickers twice and lights; the console border flashes alert; at **2**: the danger frame starts (§10.5) and a toast "DEFCON 2 — a battleground coup now ends the game"; at **1**: handled by game over | flicker 300 `steps(2)` + light 400 | lamp change, static frame |
| `defcon` (up) | console | calm cross-fade of the lamps | 400 `out` | instant |
| `milops` | console | cells fill or empty left to right | 300 `out`, stagger 40 | instant |
| `space` | console | the marker hops one box (small arc); on reaching a perk box, a tooltip shows the perk for 2 s | 600 `in-out` | instant + tooltip |
| `scoring` | stage (§10.2) | the scoring sheet | in 360 · rows 120 each · net 300 · hold 2000 (or wait) | sheet appears, no count-up |
| `effect-on` | rail | the card (from the dock/slip or the stage) shrinks into the In-effect strip with a pin; map overlays for located effects (Chernobyl region hatch; NATO brass rim on W. Europe for 1.5 s) | 450 `in-out` | chip appears |
| `effect-off` | rail | the chip tears off (scaleY 1 → 0 with a 6° skew) | 300 `in` | chip disappears |
| `china-card` | tray / rail | the China Card slides between the slots and flips face down if `!playable` (face up again at turn start); toast "The China Card passes to the US — face down until next turn" | 700 `in-out` + flip 300, toast 2500 | instant swap + toast |
| `game-over` | stage (§10.4) | the telex sequence | 600 beat + rise 480 + stamp 300 + chart 900 | fade only |

### 9.5 AI turn presentation

* **Thinking** (`vm.aiThinking`): the adversary chip shows THINKING (phosphor dot). The slip switches to AI mode with "Waiting for the United States…" and a caret. **No
  elapsed timer, no progress bar** (timing must reveal nothing; the controller pads every decision). After 8 s of a single
  wait, the slip adds "Still thinking: the AI searches deeper in sharp positions." The board stays fully inspectable.
  *As built (QA round 2, owner decision OD-2):* from 8 s the note shows the elapsed seconds ("Still thinking · 14 s"). Every AI
  decision is counted alike, the padded forced answers included, so the count reveals nothing the THINKING state does not. Past
  20 s, once per page session (sessionStorage `ts-playfield.aiSlowHint`), the slow-device sentence follows: in the slip where it
  has room, else as a toast (tablet slips); §8.1. `ui:slip.ai.stillThinking` is retired (R-005).
* **Reveal dock** (desktop/tablet): 236 px, at the **top right of the table** (right 64 px, top 34 px; over Siberia, where no boxes
  are). Before each country beat of the same play, if the beat's box intersects the dock rect, the dock slides to the
  **top left** (350 ms) and stays there for that play. The dock stays pinned (compact form: 120 px card + caption) until the next
  `card-played`, `action-round` or human prompt. It then collapses into the anchor of the card's current location (discard /
  removed / effects).
  *As built (QA round 2, R-006, R-007):* avoidance uses the whole dock (card + caption), and a **rolled** country (coup,
  realignment, war) under it moves it top left too. When a scoring sheet opens (desktop / tablet) under the pinned dock, the dock
  moves to the other top corner for the rest of the play, or folds into its pile at once when the table cannot hold both (e.g.
  an 800×600 tablet); the sheet's kicker still names the play. An AI space-race dice tray hangs under the space track beside the
  dock, never under it. The stage paints banner, dock, dice trays, sheet, papers in that order, so the dock never covers a tray
  or the sheet. A space-race roll names no country: the dock reads "SPACE RACE · 1 OP".
* **Play identity** (gap G2 fallback): AI frames belong to the play opened by the last AI `card-played`. `Shown.aiPlayCard` holds
  that card until the dock collapses.
* **Compact:** the reveal shows centred at 200 px for its hold, then shrinks into a **play banner** at the top of the map (the
  ticker strip, 72 px: thumbnail + "USSR · ACTION ROUND 4" + name + the how-chip), so the map stays visible while the effects
  play (MC `phone-ai.png`).
* **Pacing:** the beats of one AI play chain with no extra pause (country stagger 120 ms). Before the `card-played` beat of a
  new AI play there is a 400 ms lead-in rest (as built: none before AI headline reveals; the papers already pace that moment).
* **Last-move markers:** after the AI's play, every country it changed keeps its delta pills (`Shown.lastOpponent`) until the
  human's next play starts (the first human `choose` of the next play).

### 9.6 Flights and anchors

The flight layer (`src/ui/runner/FlightLayer.tsx`, portal, `position: fixed`, z 50) draws a card image (60×84) or a back from
`anchors.rect(from)` to `anchors.rect(to)` along a quadratic arc. Location strings of `card-moved` map to anchors:

| Location | Anchor |
|---|---|
| `DRAW_DECK`, `UNSEEN` (not the AI's played card) | `deck` |
| `HAND_US_*` / `HAND_USSR_*` | `card:<id>` when mounted, else `hand:US` / `hand:USSR` |
| `DISCARD_PILE` | `discard` |
| `REMOVED_FROM_GAME` | `removed` |
| `ONGOING_EVENT` | `effects` (the China Card never moves this way: it has its own `china-card` beat) |
| `PEEKED_TEMP` | `stage` (the table centre: Grain Sales' drawn card, Our Man in Tehran's five) |
| `HEADLINE_COMMITTED` | `headline:<side>`, with the side from the previous location |
| `UNAVAILABLE` | no flight |
| `UNSEEN` with `card-moved.fromHand` set (a card leaving the AI's hidden hand for a public place: Five Year Plan / Terrorism random discards, Grain Sales / Missile Envy takes) | `hand:<fromHand>` |
| the AI's just-played card (`UNSEEN` → pile in the same frame as its `card-played`) | from `stage` (the dock) |

If either rect is null (e.g. a collapsed rail), skip the flight.

As built (runner): `buildBeats` drops silent beats: moves to/from `UNAVAILABLE`, `DISCARD_PILE → UNSEEN` in a reshuffle frame,
deck → hand moves in a frame with a deal to that hand (the deal beat flies them), moves into `HEADLINE_COMMITTED` next to a
`headline-chosen`, and phase banners other than HEADLINE. The pinned AI play card does not fly to its pile (the reveal dock
collapses into it). Stagger is applied by the runner (`STAGGER`, `staggerOffset`). A frame whose seq is not the last committed + 1
(restart, new game) commits at once; a hidden tab aborts the current frame and plays later ones at speed 0.
As built (QA round 2, R-004): in a frame with a headline reveal, the cancelled headline's move to a pile is silent too (the
CANCELLED paper slides there itself), whether it was the AI's hidden card (`UNSEEN`), a known AI card or the human's.

### 9.7 Ambient (not frame events)

The loud target ring march (1.4 s), the thinking dot blink (1 s), the teletype caret (1 s), and the DEFCON-2 frame pulse (2.4 s). All use
`.ts-ambient`, pause under reduced motion and when `document.hidden`, and stop while a modal is open (except the caret).

---

## 10. Big moments

### 10.1 Headline reveal (`situation-room-headline.png`)

After both commits (`headline-reveal`): the stage scrim, then two **newspapers** drop in, **US left** ("THE WASHINGTON DISPATCH", rotated −2°)
and **USSR right** ("ПРАВДА", +1.6°). Each is 330 px paper `#efe8d6`: a masthead (news font 26 px, double rule), a dateline ("US HEADLINE · TURN 6 · 2
OPS"), the headline = the card name (news 900 30 px caps; zh 32 px serif), the card image 140×196 as the photo, and the card text
(`cardTextLines`) as the column (10.5 px). A 52 px round brass-rimmed badge "1ST"/"2ND" is stamped on the top-right corner. Caption under them
"3 vs 2 Ops · USSR resolves first" (12 px caps steel-300). It waits for Continue (Space / click) when `pauseOnReveals`, else holds 1600.
Then the first paper folds into the reveal dock and its event plays; the second follows (both sides' headline cards pass through
the dock, the human's too). Defectors cancelling a headline: the
cancelled paper gets a "CANCELLED" stamp and slides to the discard pile. Compact: the papers stack vertically at 92 % width,
US on top.

### 10.2 Scoring sheet (`situation-room-scoring.png`, `mobile-clarity-desktop-scoring-zh.png`)

* Desktop: a 520 px paper sheet docked inside the table **on the side away from the region**: Europe, Middle East, Africa, Asia,
  SE Asia → left (left 28 px, top 120 px). C. & S. America → right. The scored region is spotlit (`focusRegion`). Compact: a
  bottom sheet over the slip, bottoming at `--stage-bottom` (14 px on compact, where the orders sheet overlaps the map).
* As built: the side is checked against the map (`pickSheetSide`): the other side is used when the specified one would cover
  clearly less of the region's boxes (< 60 %); on today's map Africa and Europe dock right. Waiting overlays (papers, sheet) stop
  above the tray on desktop/tablet (`--stage-bottom`, default `--ts-tray-h`), so the slip's Continue stays visible.
* Header bar in the region ink: the name (stencil 30 px; zh body 800) + "CARD #3". Kicker: "You played Middle East Scoring" /
  "The USSR played…".
* Table, columns **US | USSR**: Status chip (Presence / Domination / Control / —), Countries, Battlegrounds (+1 each), Adjacent to
  the enemy superpower (+1 each), Status VP (base), **Total**. Source: `Shown.regionScores` (the board before scoring;
  `RegionSideScore` fields `status, countries, battlegrounds, adjacent, base_vp, vp`). SE Asia: one row per controlled
  country with its VP (Thailand 2).
* Result bar (ink): "USSR SCORES" + "NET +3 USSR" (stencil 28 px in the side-on-room colour). Then a "+3" chip flies to the VP gauge
  (`vp` beat). Europe control: "EUROPE CONTROL — GAME OVER" with the hazard underline; the telex follows.
* Rows fill top-down 120 ms apart with rolling numerals. It waits for Continue when `pauseOnReveals` (button "Continue ⎵" in the slip
  and on the sheet; in the slip it replaces Skip, §8.1), else holds 2000. **Final scoring** (after turn 10): one combined sheet, a
  region per row with subtotals (as built: the six regions, no SE Asia row, each with its VP per side, then the total). The
  Continue key cap reads `ui:shortcuts.key.space` ("Space" / 空格; the ⎵ glyph is missing in our fonts).
* As built (prep-ui): the sheet's **body scrolls under a fixed Continue footer** (Continue is outside the scrolling body, so it is
  always on screen however tall the table; the body scrolls to the net bar), on compact too.
* As built (QA round 1): the result bar's net is **the rows' net**; when the VP track stops the change at ±20 (not a Europe-control
  win) a line under the bar says what was applied ("The VP track stops at 20: USSR +5 applied", `ui_stage:scoring.capped`; Q-019).
  The final scoring sheet has a row "The China Card · +1 VP for its holder" and uses the game-over frame's board (Q-016). When
  Shuttle Diplomacy took out a USSR battleground, a footer line says so, on the sheet and in the plate popover (Q-023).
* As built (QA round 2, R-006): the sheet is never under the AI's pinned reveal dock (§9.5). In practice the dock goes top left
  for the Europe, Africa, Central and South America sheets (which dock right).

### 10.3 Turn banner

Paper strip 60 % of the table wide at 28 % height, a typewriter line + a ruled underline. Era turns (4, 8) add a rubber stamp. See §9.4.

### 10.4 Game over (`situation-room-game-over.png`)

After a 600 ms beat: the scrim `--ts-scrim-gameover` (z 95), then a **telex sheet** 700 px (compact: full width) with perforated
edges rises: "FLASH · FLASH · FLASH" (typewriter 12 px), the verdict (stencil 64 px: "USSR VICTORY", in the winner's side colour on
paper; a draw in ink), a **rubber stamp** from your perspective ("YOU WIN" / "YOU LOSE" / "DRAW", rotated −9°), the reason sentence
(`endingMessages(ending, humanSide)` from `src/i18n/endings`, 15 px), stats (final VP, with `vpBefore` when it differs: "VP
before the ruling"; turn · AR; coups by side; playing time (as built: only when this page saw the game from its start; saves
carry no start time), all kept by the UI from frames and log), a **VP-by-turn chart**
(single ink line; US wash above 0, USSR wash below; the axis words "US ↑" / "USSR ↓"), and actions **New game** (primary),
**Review board** (closes the telex, leaves a "Game over · New game" chip in the slip), **Full log** (closes the telex too).

As built (QA round 1): the "VP before" stat shows only when a rule replaced or added to the VP: held scoring card → "VP before the
ruling", final scoring → "VP before final scoring", otherwise left out (Q-022). "Ended" reads "Turn 5 · AR 3" for a game that ended
inside a round and "End of turn 8" / "End of turn 10" for an ending at a turn's end (never the engine's "AR 9"; Q-031). The VP
chart's label separates its points with `ui_stage:chart.sep` (Q-024).

| Reason | Special presentation |
|---|---|
| `vp20`, `milops-vp20` | the VP needle slams to the end first; for milops the mil-ops row is highlighted |
| `europe-control` | Europe lit, everything else dark during the beat |
| `defcon`, `cmc-suicide` | a white-out flash of 120 ms then a long fade to near-black (2 s) while the teletype types the line. Reduced motion: fade only |
| `held-scoring`, `held-scoring-both` | the offending card(s) (`ending.cards`) shown on the telex |
| `final-scoring` | the final scoring sheet first |
| `wargames`, `resign` | no stamp animation (resign: no stamp) |

### 10.5 DEFCON 2 danger frame

An inset frame over the whole app (z 100, `pointer-events: none`): 2 px alert border + a 60 px inner glow, pulsing 2.4 s
(`.ts-ambient`). Reduced motion: static. It shows whenever `Shown.state.defcon === 2`.

---

## 11. Start screen, loading, settings, menus, language

### 11.1 Start screen (`final-start.png`, `final-start-zh.png`)

* Background: a dark wall (`radial-gradient(52% 60% at 50% 46%, #2b2a24, #15181a 55%, #07090b)`) and the **real map** (the
  `MapView` with an empty state, non-interactive, plates shown) on a table in perspective: 1640×960, `perspective(1300px)
  rotateX(52deg)`, centred at 77 % height, opacity .62, under a lamp pool (screen blend) and a vignette. Reduced motion:
  static. Otherwise it may drift ±8 px over 30 s.
* Top bar (20 px from the edges): "TOP SECRET · EYES ONLY" (11 px caps steel-400, tracking .3em) at the left; the language toggle +
  gear at the right.
* Centre: kicker "THE COLD WAR, 1945–1989" (12 px caps brass-400, tracking .5em) · title "TWILIGHT / STRUGGLE" (stencil 104 px,
  two lines, paper-50) · "冷战热斗" (serif 30 px, tracking .5em; **42 px when the page is Chinese**) · tagline (typewriter 14 px):
  "You command one superpower. DeepStruggle commands the other."
* **Side dossiers** (folders with tabs, 250 / 200 / 250 px, gap 22): **United States** (blue folder, seal, "US" stamp; "Moves second
  each action round. Sets up 7 in Western Europe, then the +2 bid.") · **Toss a coin** (grey, half-blue/half-red coin; "Let history
  decide.") · **Soviet Union** (red folder, seal, "CCCP" stamp; "Moves first each action round. Starts with the China Card and 6 in
  Eastern Europe."). Each ends with "TAKE COMMAND →". Hover/focus lifts 6 px and rotates −.6°. **One click starts**
  `controller.newGame({ side })`. The coin plays a 900 ms flip landing on the drawn side (reduced motion: instant) *after* the
  controller has chosen. The UI reads the side from `vm.humanSide`. `role="group"`, arrow keys move between the folders.
* Row: **Resume game** (brass, when `vm.hasSavedGame`; sub-line "Turn 5 · AR 3 · you are the USSR · 2 h ago" from the save summary,
  gap G11 if unavailable: show just "Resume game") · **Rules (GMT living rules) ↗** (opens
  `https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf` in a new tab; never hosted) · **Settings**. With a saved game, a
  side choice first asks in place: "This replaces your saved game. [Start new] [Cancel]".
* **Rule chips** (11.5 px, outlined brass 30 %): "Standard rules + optional cards #104–110" · "US bid +2" · "Tournament rule:
  holding a scoring card at turn end loses" · "AI at full strength · no difficulty levels".
* **Boot line** (bottom centre, 680 px, typewriter 12 px phosphor): "> LINKING WITH DEEPSTRUGGLE · RULES ENGINE ✓ · AI MODEL 3.6 /
  5.8 MB · VERIFY · START AI", driven by `vm.load` (`stage`: engine → model-download (fraction + MB) → model-verify → ai-worker;
  `ui:loading.*`), with a 3 px phosphor bar. A side can be chosen as soon as the engine is ready. Until the worker is up, the first AI decision
  shows "Getting the AI ready…" in the slip. Note under the bar: `ui:loading.firstTime`.
* **Error** (`vm.status === "error"`): the boot line turns alert orange with the message (`ui:error.*`) and a **Retry** button,
  plus a disclosure with `vm.error`. As built (K-001): while no game is in progress, Retry **calls `controller.boot()` again**,
  which retries a failed engine load or a failed pre-game AI load in place (no reload); a mid-game AI failure **reloads the page**,
  which resumes the game from its autosave. The message names the step that failed (`vm.load` keeps the failed stage with status
  "error"; Q-010); "This browser cannot run WebAssembly" only for the AI's stable no-SIMD marker (`isWasmUnsupportedMessage`) or a
  browser without WebAssembly (Q-005). After an error the side folders dim (not-allowed cursor; Q-052). The first-visit note gives
  the real download (~10 MB: the model plus onnxruntime's wasm, fetched in parallel; Q-013).
* As built (QA round 1): an unfinished save of another engine build found at boot is discarded and the start screen says so once
  (`vm.incompatibleSave` → toast `ui:error.saveIncompatible`; Q-014). When another tab resumes, starts or writes this page's saved
  game, the controller takes no more moves here (`vm.superseded`) and a blocking dossier "This game continued in another tab" offers
  **Reload** (`ui_shell:superseded.*`; Q-002). The backdrop map is `inert` (the first Tab lands on the language switch; Q-051).
* As built (QA round 2): **save format v2** (owner decision OD-1): `localStorage["ts-playfield.game.v1"]` = "TSP2:" +
  base64url(XOR keystream over CRC-32 + UTF-8 JSON `{v: 2, fingerprint, modelSha256, search, seed, humanSide, steps, autoFlags,
  …}`). A plain-JSON v1 save is read, resumed and rewritten as v2 at boot. It is obfuscation only, and About says so
  (`ui_shell:about.save`). A tampered, corrupted or truncated save is discarded at boot with its own toast,
  `ui_shell:error.saveUnreadable` ("Your saved game could not be read (it was changed or damaged) and was discarded.";
  `incompatibleSave.reason: "unreadable"`), and a resume refused after boot says the same; another engine build's save keeps
  `ui:error.saveIncompatible` (`reason: "build"`; R-018). Once this page's save of the game is in storage, a save by another tab
  supersedes this page even while its own writes are refused (storage full; R-003). Details: `docs/handoff/logic.md` "Save
  format v2".
* Fine print (bottom right, 11 px steel-400): "Fan-made, free, no ads. Twilight Struggle © GMT Games. AI & rules engine:
  DeepStruggle (MIT)." + link "Credits & licences" (opens About).
* Compact: everything stacks: title 56 px; dossiers become three full-width 84 px rows (seal, name, one line, chevron), US first;
  resume first when present; the boot line sits at the bottom, wrapping.
* As built: the coin spins while the controller draws, then lands (900 ms) on the drawn side's seal; the screen stays up for the
  landing (+350 ms). Menu → New game confirms once (`ui:game.newGameConfirm`); the start screen then starts without the second
  "replaces your saved game" prompt, and its Resume returns to the running game.

### 11.2 Settings dossier (modal, ⚙)

| Setting | Values (default first) | Key |
|---|---|---|
| Language | English / 中文 (follows the browser on first visit) | `ui:settings.language` |
| Card images | follow language / English / 中文 | `ui:settings.cardImages` |
| Animation speed | Normal · Slow · Fast · Instant | `ui:settings.speed.*` |
| Motion | follow system · reduce · full | `ui:settings.motion.*` |
| Confirm the action that ends your play | on / off (dice and game-ending choices always confirm) | `ui:settings.confirmFinal` |
| Pause on headlines and scoring | on / off | `ui:settings.pauseOnReveals` |
| Map labels | 100 % · 115 % · 130 % | `ui:settings.mapLabels` |
| Side patterns (for monochrome viewing) | off / on | `ui:settings.patterns` |
| Follow the action with the camera (desktop) | off / on | `ui:settings.followAction` |

As built: **no Sound row** until sounds exist (§13 is optional; a switch would do nothing). `UiSettings.sound` stays in the contract.

Stored in `localStorage["ts-playfield.ui.v1"]` (`UiSettings`, merged over `DEFAULT_SETTINGS`; unknown keys dropped). This is UI
preference only. The game save is the controller's.

### 11.3 Menu (☰ popover; compact: sheet with 52 px rows)

New game (confirm: `ui:game.newGameConfirm`) · Resign (hold 1.2 s; `ui:game.resignConfirm`) · Settings · Keyboard
shortcuts (`?`) · Rules (GMT living rules ↗) · About & credits (DeepStruggle MIT, OFL fonts, GMT disclaimer) · compact only:
Language EN | 中文.

As built (Q-046): one `role="menu"`; the first item gets focus once the popover is shown, ↑ ↓ Home End move, items are `tabindex
−1`; `Esc` **and `Tab`** close it and return focus to ☰ / the wordmark (the menu is portalled to the end of the page, so the APG's
"Tab moves on" would leave the page). About & credits also links the third-party licence notices
(`THIRD_PARTY_LICENSES.txt`, shipped from `public/`; Q-012).

### 11.4 Language switch

`EN | 中文` segmented control (console, start screen); one button showing the other language on tablets; inside ☰ on compact.
`setLang()` switches instantly with no reload. `<html lang>` updates, so every `:lang(zh)` rule (fonts, caps, sizes) applies at once. Card
images cross-fade 150 ms (when `cardImages === "follow"`). Map names re-fit (recompute `textLength` per language, cached). Messages
re-render. The URL is not changed. Glossary: `docs/glossary.md` (DEFCON stays "DEFCON"; 调整; 稳定度; 战争早期/中期/晚期; 抽牌堆; 弃掉…).

---

## 12. Accessibility

* **Side without colour:** (1) position, US left/top everywhere; (2) shape, US square counters/badges/cells and USSR chamfered; (3)
  glyph, ★ / hammer and sickle on markers, seals, log, chips, tags; (4) words, every tooltip, log line and sheet names the side;
  (5) optional hatch (`patterns`). Control = flipped (solid) vs unflipped (outlined) counter + box border.
* **Contrast:** §2.1 (tested). Non-text: the two-tone ring is ≥ 3:1 on the sea and every land tint. Dimmed non-targets are not
  interactive and keep legible names on hover/focus.
* **Keyboard** (global keymap, `src/ui/common/keymap.ts`; shown by `?`):

| Key | Action |
|---|---|
| Tab / Shift+Tab | console → map → slip → hand → rail (skip link "Skip to map" first) |
| arrows (map) | spatial focus, targets first · `[` `]` cycle targets · `1`–`7` regions |
| Enter | activate / confirm a staged choice; hold Enter = hold-to-confirm |
| Space | inspect (map) · zoom (card) · **skip animation** when busy |
| Shift+Space | skip to my turn |
| Esc | cancel staging → close popover/dialog → back (undo) on the play-mode stage |
| Z, Ctrl/⌘+Z | undo play |
| D | done / pass (stages) |
| E I C R S | play-mode modes |
| T | target list |
| L | toggle rail / open log (compact) |
| + − 0 | camera |
| ? | shortcut sheet |

* Visible focus everywhere: `--ts-focus-ring` (brass 2 px at a 2 px offset; on paper, the ink variant), never removed.
* **Screen readers:** the map (§4.9) and target list (§8.13). The slip title + counter in an `aria-live="polite"` region. A log mirror
  that announces each AI play once. Dialogs are `role="dialog"` with a focus trap and focus returned to the opener. Stage overlays
  that wait (headline, scoring) are dialogs too. New prompts announce, they don't steal focus.
* **Pointer:** touch targets ≥ 44×44 px; hover-only information is always reachable by focus (+ Space) or long-press (350 ms,
  with `navigator.vibrate(10)` where available).
  *As built (QA round 2):* on coarse pointers every tablet control answers a 44 px hit area (§3.2), there are no key caps (§3.3),
  and a cut slip title or crumb is a tap-to-expand toggle (§8.1). Esc / Back to hand focuses the returned card, the China Card
  included (§7.2).
* **Timing (WCAG 2.2.1):** no decision has a time limit. Auto-advancing holds can be turned into explicit Continue steps
  (`pauseOnReveals`). The staging timeout (6 s) only cancels a selection; it never acts.
* **Zoom/reflow:** works up to 200 % browser zoom (the arrangements change). The map label setting goes up to 130 %.
* **Forced colours:** focus outlines become `CanvasText`. Rings keep their ink edge.
* **As built (QA round 1):** focus lost because the focused element was removed (a play-mode row, Continue, Review board, a card
  going back to the hand) goes to the orders slip, else the table (`screens/focusRescue.ts`; it never takes focus from anything);
  the game screen focuses its table when it opens (Q-043). A dialog gives focus back to its opener only when focus was lost with it
  (`useFocusReturn`), so a dialog opening in the same commit keeps it. **Skip to map** focuses the first legal target, else the table
  (Q-044). One AI announcer (`AiAnnouncer`) in every layout, one message per AI entry with its die / result, DEFCON, VP and space
  details and the headline reveal (Q-045, Q-050); Dispatches has no live region and is **one Tab stop** (arrow keys reach its
  names, Enter opens, Esc returns; Q-049). Camera keys work anywhere on the game screen (§4.7).

---

## 13. Sound (optional, off by default)

If built: `public/sounds/sprite.webm` + `.mp3` fallback, ≤ 120 KB total, lazy-loaded when first enabled, played with the Web
Audio API at −12 dB, never during reduced-motion "instant" catch-up. Cues: `thunk` (influence +, 60 ms), `lift` (influence −),
`flip` (control / card flip), `die` (rattle 600 ms), `stamp` (rubber stamp), `teletype` (log tick, rate-limited to 8/s),
`klaxon` (DEFCON 2, once), `paper` (sheets), `telex` (game over). No music. Sounds are a nice-to-have. No component may
depend on them.

---

## 14. Copy guidelines

* **Voice:** short, concrete, imperative for instructions ("Choose a card", "Place influence"), declarative for results
  ("USSR −2 · US +2"). No exclamation marks, no jokes in instructions, no blame. The war-room flavour lives in labels (ORDERS,
  DISPATCHES, ADVERSARY, TAKE COMMAND), never in rules text.
* **The UI restates no rules.** Rules text appears only as i18n copy written for a specific prompt or warning (owned by
  `src/game` for `prompt:*`).
* **Sides:** "US" / "USSR" in labels, "the United States" / "the Soviet Union" in sentences, "you" for the human, "the AI" or
  "DeepStruggle" for the opponent. Chinese: 美国 / 苏联 / 你 / AI.
* **Numbers:** Arabic numerals; signed deltas with a real minus "−" (U+2212) and "+"; VP lead "USSR +2", never "−2"; "Even" when 0.
* **Capitalisation:** English labels are written in sentence case in the catalog and uppercased by CSS (`--ts-caps`), never
  typed in caps. Chinese has no caps.
* **Chinese:** follow `docs/glossary.md`. One space between Han and Latin/numbers ("DEFCON 降低 1 级", "第 3 行动轮"),
  full-width punctuation, …… for ellipsis, “” for quotes. Card titles always via `cardName(id)`.
* **Length budgets** (Chinese is usually shorter, English is the constraint): slip title ≤ 2 lines at 19 px in 270 px; button
  labels ≤ 22 characters; console sub-labels ≤ 40 characters (2 lines of 132 px); chip labels ≤ 18 characters.
* **Pseudo-language:** every new component MUST be checked once with `?lang=en-XA` (the i18n layer marks each string ⟦…⟧) to
  catch hard-coded text.

### 14.1 New `ui:` keys (to add in en + zh-CN; the i18n owner applies the glossary)

Implemented (2026-11-22) in `tools/ui-keys.mjs` → `ui.json`; the full key tree is in `docs/handoff/ui-i18n-ext.md`. Where the
shorthand below was ambiguous the keys are: `ui:track.short`, `ui:log.jump`, `ui:log.turnSep`, `ui:headline.order`,
`ui:headline.dateline`. The coup consequence line is `ui:tip.battlegroundDefcon` (`ui:tip.battleground` is the plain chip); the console's
DEFCON caption uses `ui:track.defconRuleShort.N`. A sentence `{{side}}` takes `t("ui:side.long.<side>")`. The catalog's Chinese follows
`docs/glossary.md` where it differs from this table (稳定度; "N 行动点" after a number).

| Key | EN | ZH |
|---|---|---|
| `ui:slip.orders` | Orders · Turn {{turn}} · AR {{ar}} | 指令 · 第 {{turn}} 回合 · 第 {{ar}} 行动轮 |
| `ui:slip.ordersHeadline` | Orders · Turn {{turn}} · Headline | 指令 · 第 {{turn}} 回合 · 头条 |
| `ui:slip.stamp.you` | Your move | 轮到你 |
| `ui:slip.stamp.ai` | {{side}} · AI | {{side}} · AI |
| `ui:slip.verb.influence` / `.coup-target` / `.realign-target` | Place influence / Coup / Realign | 放置影响力 / 政变 / 调整 |
| `ui:slip.counter.ops` / `.left` / `.rolls` | Ops left / Left / Rolls left | 剩余点数 / 剩余 / 剩余次数 |
| `ui:slip.hint.influence` | Click a ringed country: +1 influence. {{cost}} marks opponent control: a point there costs 2. | 点击带圈的国家：+1 影响力。标有 {{cost}} 的国家由对手控制，每点需 2 行动点。 |
| `ui:slip.hint.headline` | The AI chooses at the same time. Higher Ops resolves first; the US on a tie. | AI 同时选择。行动点数高者先结算，相同时美国先结算。 |
| `ui:slip.hint.coupFinal` | A coup is final once the die is rolled. Click {{country}} again or press Enter. | 政变一经掷骰便无法撤销。再次点击{{country}}或按回车确认。 |
| `ui:slip.hint.asiaBonus` | The China Card gives +1 Op if every point goes to Asia. | 若全部点数用于亚洲，中国牌额外 +1 行动点。 |
| `ui:slip.confirm.coup` / `.realign` / `.headline` / `.play` / `.score` | Launch coup / Roll in {{country}} / Commit headline / Play {{card}} / Score {{region}} now | 发动政变 / 在{{country}}调整 / 确定头条 / 打出{{card}} / 立即计分{{region}} |
| `ui:slip.ai.waiting` / `.plays` / `.preparing` | Waiting for the {{side}}… / {{side}} plays {{card}} / Getting the AI ready… {{percent}}% | 等待{{side}}…… / {{side}}打出{{card}} / 正在准备 AI…… {{percent}}% |
| `ui:slip.skip` / `.skipAll` / `.continue` | Skip / Skip to my turn / Continue | 跳过 / 跳到我的回合 / 继续 |
| `ui:slip.list` | List | 列表 |
| `ui:stamp.headline` / `.discard` / `.give` / `.play` / `.committed` / `.revealed` / `.cancelled` / `.pass` | Headline / Discard / Give / Play / Committed / Revealed / Cancelled / Pass | 头条 / 弃掉 / 给出 / 打出 / 已提交 / 已揭晓 / 已取消 / 放弃 |
| `ui:mode.howTitle` / `.event` / `.eventFirst` / `.operations` / `.space` / `.un` / `.back` / `.undoFree` | How will you play it? / Event / Event first / Operations / Space race / Play UN Intervention on it / Back to hand / Undo is free until a die is rolled | 如何使用这张牌？ / 事件 / 先结算事件 / 行动 / 太空竞赛 / 对其打出联合国干预 / 放回手牌 / 掷骰之前均可撤销 |
| `ui:track.defconRule.5` … `.1` | (none) / No coups or realignments in Europe / … in Europe, Asia / … in Europe, Asia, Middle East / Nuclear war | （无） / 欧洲禁止政变与调整 / 欧洲、亚洲禁止政变与调整 / 欧洲、亚洲、中东禁止政变与调整 / 核战争 |
| `ui:track.milopsNeed` / `.short` | Mil ops · need {{n}} / {{side}} short by {{n}} | 军事行动 · 需 {{n}} / {{side}}还差 {{n}} |
| `ui:plate.ifScored` / `.even` / `.wins` / `.values.0` … `.6` | If scored / Even / {{side}} wins / 3·7·★ … / 1 VP each · Thailand 2 | 若计分 / 持平 / {{side}}获胜 / … / 每国 1 VP · 泰国 2 |
| `ui:plate.pres` / `.dom` / `.ctrl` / `.none` | Pres / Dom / Ctrl / — | 存在 / 支配 / 控制 / — |
| `ui:map.countryLabel` | {{name}}, {{region}}{{bg}}, stability {{stab}}, US {{us}}{{usCtrl}}, USSR {{ussr}}{{ussrCtrl}}{{target}} | {{name}}，{{region}}{{bg}}，稳定度 {{stab}}，美国 {{us}}{{usCtrl}}，苏联 {{ussr}}{{ussrCtrl}}{{target}} |
| `ui:map.cost2` / `.toUSA` / `.toJapan` / `.toControl` | 2 Ops / To USA / To Japan / → control | 2 点 / 往美国 / 往日本 / → 控制 |
| `ui:map.zoomIn` / `.zoomOut` / `.world` | Zoom in / Zoom out / World | 放大 / 缩小 / 全图 |
| `ui:tip.stabilityRegion` / `.you` / `.costs2` / `.success` / `.battleground` / `.keys.place` / `.keys.coup` | Stability · {{region}} / (you) / Costs 2 Ops ({{side}}-controlled) / Success {{k}}/6 / Battleground: DEFCON {{from}} → {{to}} / Click place · Right-click details / Click select · Click again to launch | 稳定度 · {{region}} / （你） / 需 2 行动点（{{side}}控制） / 成功 {{k}}/6 / 战场国：DEFCON {{from}} → {{to}} / 点击放置 · 右键详情 / 点击选中 · 再次点击发动 |
| `ui:adversary.title` / `.sub` / `.waiting` / `.thinking` / `.playing` / `.hand` / `.known` / `.china` | Adversary / DeepStruggle AI · full strength / Waiting / Thinking / Playing / {{count}} cards in hand / {{count}} known / China Card: {{where}} | 对手 / DeepStruggle AI · 全力以赴 / 等待中 / 思考中 / 出牌中 / 手牌 {{count}} 张 / 已知 {{count}} 张 / 中国牌：{{where}} |
| `ui:effects.title` / `.duration.PERMANENT` / `.TURN` / `.CONDITIONAL` / `.SPACE_PERK` | In effect / Permanent / This turn / Conditional / Space perk | 生效中 / 持续 / 本回合 / 条件 / 太空特权 |
| `ui:log.title` / `.filter.all` / `.plays` / `.dice` / `.jump` / `.turnSep` | Dispatches / All / Plays / Dice / Jump to latest / Turn {{turn}} · {{era}} | 电报 / 全部 / 出牌 / 掷骰 / 跳到最新 / 第 {{turn}} 回合 · {{era}} |
| `ui:banner.turn` / `.era.mid` / `.era.late` / `.headlinePhase` | Turn {{turn}} · {{era}} / Mid War: new cards shuffled in / Late War: new cards shuffled in / Headline phase | 第 {{turn}} 回合 · {{era}} / 战争中期：新卡牌洗入 / 战争晚期：新卡牌洗入 / 头条阶段 |
| `ui:toast.reshuffle` / `.defcon2` / `.china` | Deck exhausted: discards reshuffled. Cards still in hands are now known to both sides. / DEFCON 2: a battleground coup now ends the game. / The China Card passes to the {{side}}, face down until next turn. | 抽牌堆耗尽：弃牌堆已洗入。手中剩余的牌双方均已知晓。 / DEFCON 2：此时对战场国政变将结束游戏。 / 中国牌交给{{side}}，正面朝下，下回合才能打出。 |
| `ui:scoring.kickerYou` / `.kickerAi` / `.status` / `.countries` / `.battlegrounds` / `.adjacent` / `.base` / `.total` / `.net` / `.europeControl` | You played {{card}} / The {{side}} played {{card}} / Status / Countries / Battlegrounds / Adjacent to enemy superpower / Status VP / Total / Net {{side}} +{{n}} / Europe control: game over | 你打出{{card}} / {{side}}打出{{card}} / 状态 / 国家 / 战场国 / 邻接敌方超级大国 / 状态 VP / 合计 / 净得 {{side}} +{{n}} / 控制欧洲：游戏结束 |
| `ui:headline.papers.us` / `.ussr` / `.order` / `.dateline` | The Washington Dispatch / ПРАВДА / {{a}} vs {{b}} Ops · {{side}} resolves first / {{side}} headline · Turn {{turn}} · {{ops}} Ops | 华盛顿快讯 / 真理报 / {{a}} 对 {{b}} 行动点 · {{side}}先结算 / {{side}}头条 · 第 {{turn}} 回合 · {{ops}} 行动点 |
| `ui:over.flash` / `.youWin` / `.youLose` / `.draw` / `.vpBefore` / `.chart` / `.review` / `.fullLog` | Flash · Flash · Flash / You win / You lose / Draw / VP before the ruling / Victory points by turn / Review board / Full log | 急电 · 急电 · 急电 / 你赢了 / 你输了 / 平局 / 裁定前 VP / 各回合 VP / 查看地图 / 完整电报 |
| `ui:start.classified` / `.kicker` / `.tagline` / `.pick.US` / `.pick.USSR` / `.pick.random` / `.take` / `.resume` / `.replaces` / `.rules` / `.chips.*` / `.fine` | Top secret · Eyes only / The Cold War, 1945–1989 / You command one superpower. DeepStruggle commands the other. / … (copy in `mockup-final-assets/final.js` `T`) | (same file) |
| `ui:settings.cardImages` / `.motion.*` / `.confirmFinal` / `.pauseOnReveals` / `.mapLabels` / `.patterns` / `.followAction` | per §11.2 | per §11.2 |
| `ui:shortcuts.*` | the rows of §12 | — |

*As built (QA round 2):* `ui:slip.ai.stillThinking` is retired (R-005; `tools/ui-keys.mjs` `RETIRED_KEYS` deletes it): the AI wait
uses `ui_prompts:ai.stillThinking` / `ai.stillThinkingSlow` / `ai.slowHint` (§8.1, §9.5). The log is 电报 in Chinese everywhere
(`ui:over.fullLog` 完整电报, `ui:shortcuts.row.log` "… · 打开电报", the `ui_shell` dock and ticker; R-019).

Existing keys that MUST be reused: `ui:game.undo`, `ui:game.undoTitle`, `ui:game.resignConfirm.*`, `ui:game.newGameConfirm.*`,
`ui:ai.*`, `ui:track.*`, `ui:pile.*`, `ui:china.*`, `ui:headline.*`, `ui:settings.speed.*`, `ui:loading.*`, `ui:error.*`, `ui:links.*`,
`ui:about.*`; `prompt:*` (titles, details, done, warnings, endings) via the src/game helpers.

---

## 15. Component plan

### 15.1 The shared UI interface: `src/ui/ui-contract.ts`

Create this file **verbatim** before the parallel work starts. Owner: the shell workstream (or the coordinator). It is typechecked
against the current `src/game/contract.ts` (`tsc --noEmit` passes with it in place). Change it only together with this spec.

```ts
/**
 * Shared interfaces of the React UI (docs/design/ui-spec.md §15.1). Every src/ui workstream codes
 * against this file; it imports only the game contract, engine types and the theme constants.
 * Change it only together with the spec.
 */
import type { ReactNode } from "react";
import type { DieRollState, RegionScores } from "../engine/types";
import type { Ending, Frame, GameController, GameEvent, PlayHow, Prompt, PromptOption, PublicState, Side, ViewModel } from "../game/contract";
import type { FrameSpeed, LayoutKind, SpeedSetting } from "./theme";

// ── Settings (persisted per device: localStorage "ts-playfield.ui.v1") ─────────────────────────
export interface UiSettings {
  speed: SpeedSetting; //                      "normal"
  motion: "system" | "reduce" | "full"; //      "system"
  /** Stage the action that ends your play (last point, Event, Space, done). Dice always stage. */
  confirmFinal: boolean; //                     true
  /** Headline reveal and scoring wait for Continue. */
  pauseOnReveals: boolean; //                   true
  sound: boolean; //                            false
  mapLabels: 100 | 115 | 130; //                100
  patterns: boolean; //                         false
  railCollapsed: boolean; //                    false
  /** Desktop camera follows prompts and AI moves when zoomed in (compact: always on). */
  followAction: boolean; //                     false
  cardImages: "follow" | "en" | "zh"; //        "follow"
}
export const DEFAULT_SETTINGS: UiSettings = {
  speed: "normal", motion: "system", confirmFinal: true, pauseOnReveals: true, sound: false,
  mapLabels: 100, patterns: false, railCollapsed: false, followAction: false, cardImages: "follow",
};

// ── Regions as the scoring slots of RegionScore (0..5 engine Region, 6 = Southeast Asia) ───────
export type RegionSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ── Anchors: where things are on screen (flights, dice trays, tooltips, chips) ─────────────────
export type AnchorId =
  | "deck" | "discard" | "removed" | "effects" | "stage" | "slip" | "dock"
  | "hand:US" | "hand:USSR" | "china:US" | "china:USSR" | "headline:US" | "headline:USSR"
  | "vp" | "defcon" | "turn" | "ar" | "milops:US" | "milops:USSR" | "space:US" | "space:USSR"
  | "scoring" //                                                  the scoring sheet's net bar (stage registers it)
  | `card:${number}` | `country:${number}` | `plate:${RegionSlot}`;

export interface AnchorRegistry {
  /** Ref callback: `ref={anchors.ref("deck")}`. */
  ref(id: AnchorId): (el: Element | null) => void;
  /** Viewport rect, or null when the anchor is not mounted / not visible. */
  rect(id: AnchorId): DOMRect | null;
}

// ── The frame runner: beats and the director ───────────────────────────────────────────────────
/** A unit of animation. The runner plays groups of beats in order; beats in one group run together. */
export type Beat =
  | { k: "reveal"; side: Side; card: number; how: PlayHow; byHuman: boolean }
  | { k: "headline-chosen"; side: Side }
  | { k: "headline-reveal"; us: number; ussr: number; first: Side }
  | { k: "roll"; roll: DieRollState }
  | { k: "scoring"; card: number; vp: number; scores: RegionScores }
  | { k: "country"; country: number; influence: { side: Side; from: number; to: number }[]; control?: { from: Side | "NONE"; to: Side | "NONE" } }
  | { k: "track"; event: Extract<GameEvent, { t: "vp" | "defcon" | "milops" | "space" | "action-round" }> }
  | { k: "effect"; flag: string; on: boolean }
  | { k: "reshuffle" }
  | { k: "deal"; side: Side; count: number }
  | { k: "hand-revealed"; side: Side; cards: number[] }
  | { k: "card-moved"; card: number; from: string; to: string }
  | { k: "china"; holder: Side; playable: boolean }
  | { k: "banner"; kind: "turn" | "phase"; turn?: number; phase?: "SETUP" | "HEADLINE" | "ACTION_ROUND" | "GAME_OVER" }
  | { k: "game-over"; ending: Ending };
export type BeatKind = Beat["k"];

export interface BeatContext {
  frame: Frame;
  /** The state shown before this frame (what is on screen when the beat starts). */
  before: PublicState;
  humanSide: Side;
  speed: FrameSpeed;
  /** Aborted on Skip: finish instantly (jump to the end state) and resolve. */
  signal: AbortSignal;
  settings: UiSettings;
}
export type BeatHandler<K extends BeatKind = BeatKind> = (beat: Extract<Beat, { k: K }>, ctx: BeatContext) => Promise<void>;

export interface Director {
  /**
   * Add a handler for one beat kind; returns the unregister function. Several handlers may share a
   * kind (e.g. "hand-revealed": the rail animates the AI's cards, the tray the human's): they run in
   * parallel and each ignores beats that are not its own. A kind with no handler resolves at once.
   */
  on<K extends BeatKind>(kind: K, handler: BeatHandler<K>): () => void;
  /** Run every handler of the beat's kind (the runner calls this). */
  run(beat: Beat, ctx: BeatContext): Promise<void>;
}

/** What the runner exposes to every component (React context from src/ui/runner). */
export interface Shown {
  /** The last fully animated frame's state: what static UI draws. Null before the first frame. */
  state: PublicState | null;
  regionScores: RegionScores | null;
  /** True while a frame is animating (clicks on map/hand are ignored then). */
  busy: boolean;
  /** Actor of the frame being animated (null when idle). */
  actor: Side | null;
  /** The AI card pinned in the reveal dock for the current AI play (0 = none). */
  aiPlayCard: number;
  /** Countries changed by the opponent's last play: id → deltas. Cleared when the human's next play starts. */
  lastOpponent: Readonly<Record<number, { us: number; ussr: number }>>;
  /** Countries placed into by the human in the current play (pencil marks). Cleared at play end / undo. */
  placedThisPlay: Readonly<Record<number, number>>;
  skip(): void;
  skipToMyTurn(): void;
}

// ── Map (src/ui/map) ───────────────────────────────────────────────────────────────────────────
export interface MapTargets {
  /** prompt.countries */
  ids: ReadonlySet<number>;
  /** ≤ 12 targets → "loud" (dashed marching ring), otherwise "quiet" (solid thin ring). */
  tone: "quiet" | "loud";
  /** Options carrying defcon-suicide / cmc-suicide / game-ending: hazard ring. */
  danger: ReadonlySet<number>;
  /** Influence-type prompts: countries where a point costs 2 Ops (contract gap G1 fallback). */
  cost2: ReadonlySet<number>;
  /** What a click does, for the ghost marker: add the decider's influence, remove, or a die roll. */
  verb: "add" | "remove" | "coup" | "realign" | "target";
  /** Event placements with prompt.maxPerCountry: placed so far in this run per country. */
  cap?: { max: number; placed: Readonly<Record<number, number>> };
  /** Whose counter the ghost marker previews (event removals); from Prompt.effect when present. */
  ghostSide?: Side;
}

export interface MapViewProps {
  state: PublicState;
  regionScores: RegionScores;
  humanSide: Side;
  layout: LayoutKind;
  targets: MapTargets | null;
  /** Chernobyl: the regions offered (region prompt). */
  regionTargets: ReadonlySet<RegionSlot> | null;
  /** Staged country (reticle). */
  selection: number | null;
  placed: Readonly<Record<number, number>>;
  lastOpponent: Readonly<Record<number, { us: number; ussr: number }>>;
  /** Spotlight a region (scoring, region-prompt hover): its boxes full colour, the rest dimmed. */
  focusRegion: RegionSlot | null;
  /** False while frames animate: hover/zoom/inspect still work, activation does not. */
  interactive: boolean;
  labelScale: number;
  patterns: boolean;
  onActivate(country: number): void;
  onInspect(country: number): void;
  onHover(country: number | null): void;
  onRegionActivate(slot: RegionSlot): void;
  onRegionHover(slot: RegionSlot | null): void;
  /** Tooltip body for a hovered/focused/inspected country (positioned by the map). */
  renderTooltip(country: number): ReactNode;
}

export interface MapHandle {
  /** Animate one country beat; the box then shows `to` until clearOverrides(). */
  playCountry(beat: Extract<Beat, { k: "country" }>, speed: FrameSpeed, signal: AbortSignal): Promise<void>;
  /** Drop per-country overrides (the runner calls it after committing frame.state). */
  clearOverrides(): void;
  /** Camera: frame these countries (padding 80 u), or the whole world. */
  frame(countries: readonly number[] | "world", opts?: { animate?: boolean }): Promise<void>;
  /** Is the country's box fully inside the map viewport? */
  isVisible(country: number): boolean;
  /** 1 s attention ring (log hover, tooltips elsewhere). */
  pulse(country: number): void;
}

// ── Prompt layer helpers (src/ui/prompts) ──────────────────────────────────────────────────────
export type Commit = "instant" | "stage" | "hold";
export interface OptionPolicy {
  option: PromptOption;
  commit: Commit;
  /** Most severe warning on the option, for styling. */
  severity: "none" | "info" | "caution" | "fatal";
}

// ── Root context (src/ui/state) ────────────────────────────────────────────────────────────────
export interface UiRoot {
  controller: GameController;
  vm: ViewModel;
  layout: LayoutKind;
  settings: UiSettings;
  setSettings(patch: Partial<UiSettings>): void;
  anchors: AnchorRegistry;
  director: Director;
  /** Open the shared card zoom (desktop popover / compact sheet). */
  zoomCard(card: number, from?: Element | null): void;
  toast(message: ReactNode, opts?: { tone?: "info" | "warn"; ms?: number }): void;
}

/** Convenience: the current prompt or null (shape re-exported for components). */
export type CurrentPrompt = Prompt | null;
```

Contract additions since the first draft (2026-11-22): `AnchorId` `"scoring"` and `MapTargets.ghostSide` (above, in this file);
in `src/game/contract.ts`, `card-moved.fromHand?: Side` (set when a card leaves the AI's hidden hand, `from: "UNSEEN"`, for a
public place and it is not the AI's own play; the flight may start at `hand:<fromHand>`, §9.6). The global keymap is
`src/ui/common/keymap.ts` (owned by common), not `src/ui/state`.

### 15.2 Directory ownership and parallel waves

Every directory has one owner. **All eight workstreams can run in parallel** once `ui-contract.ts` exists, because each one
codes against §15.1 and against the exact export names below (stub a missing import locally with the same signature until it
lands). `common` + `cards` should merge first, since they are the most imported.

| # | Workstream | Owns | Depends on (interfaces only) |
|---|---|---|---|
| W1 | **shell** | `src/ui/ui-contract.ts`, `src/ui/App.tsx`, `src/ui/state/**`, `src/ui/screens/**`, `src/ui/compact/**`, `src/main.tsx`, `index.html` (title, font preloads) | everything (composes it) |
| W2 | **map** (dedicated agent) | `src/ui/map/**`, `public/textures/**` | contract, theme, `src/data` |
| W3 | **common + cards** | `src/ui/common/**`, `src/ui/cards/**` | contract, theme, i18n, data |
| W4 | **runner** | `src/ui/runner/**` | contract, theme, common (Die not needed) |
| W5 | **console + rail** | `src/ui/console/**`, `src/ui/rail/**` | common, cards, runner (`useShown`, `Director`) |
| W6 | **tray** | `src/ui/tray/**` | common, cards, runner, prompts (`usePromptActions`) |
| W7 | **prompts** | `src/ui/prompts/**` | common, cards, runner, map (props only) |
| W8 | **stage** | `src/ui/stage/**` | common, cards, runner |

Tests: pure modules get Node unit tests in `tests/ui/<dir>/*.test.ts` (vitest, node environment). Components get markup
tests with `react-dom/server` `renderToStaticMarkup` (as `tests/i18n/react.test.ts` does; no DOM library is installed). Each
workstream adds Playwright screenshots against `npx vite` (port 5173, stopped afterwards) for its visible states, compared by
eye with the `final-*.png` references.

### 15.3 Files, exports and props

**W1 shell**

| File | Exports | Responsibility |
|---|---|---|
| `src/main.tsx` | — | `await initLanguage()`, import `fonts.css`, `tokens.css`, `base.css`, render `<App/>` |
| `src/ui/App.tsx` | `App` | create the controller (`createGameController` with the engine and AiPlayer deps) once; `UiRootProvider`; route by `vm.status`: boot/loading/menu → `StartScreen`, playing/over → `GameScreen`, error → `StartScreen` with the error line |
| `src/ui/state/UiRootProvider.tsx` | `UiRootProvider`, `useUiRoot(): UiRoot`, `useVm(): ViewModel` | `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`; settings; anchors (`createAnchorRegistry` from runner); director (`createDirector` from runner); card zoom state; toasts; sets `<html data-human data-motion data-labels data-patterns>` and `--ts-speed` |
| `src/ui/state/settings.ts` | `loadSettings(): UiSettings`, `saveSettings(s)`, `useSettings()` | localStorage `ts-playfield.ui.v1`, merge over `DEFAULT_SETTINGS`, try/catch |
| `src/ui/state/useLayout.ts` | `useLayout(): LayoutKind` | `layoutFor(innerWidth, innerHeight)` on resize/orientation (rAF-throttled) |
| ~~`src/ui/state/keymap.ts`~~ | moved to `src/ui/common/keymap.ts` (`useKey`, `KeymapProvider`, `KeyScope`), owned by common | the global keymap (§12), focus-aware (ignores typing in inputs, defers to an open dialog) |
| `src/ui/state/useReducedMotion.ts` | `useReducedMotion(): boolean` | system query × setting |
| `src/ui/screens/GameScreen.tsx` | `GameScreen` | the grid per layout (§3); composes Console, MapView (+ `useMapBeats`), Stage, Rail/RailStrip, Tray/compact parts, prompt dossiers, FlightLayer, DangerFrame, GameOverTelex; feeds MapView from `usePromptTargets`, `useStaging`, `useShown` |
| `src/ui/screens/StartScreen.tsx` | `StartScreen` | §11.1 |
| `src/ui/screens/BootLine.tsx` | `BootLine({ load, error, onRetry })` | §11.1 |
| `src/ui/screens/SettingsDossier.tsx`, `Menu.tsx`, `AboutDossier.tsx`, `ShortcutsSheet.tsx` | same names | §11.2–11.3, §12 |
| `src/ui/compact/TheatreBar.tsx` | `TheatreBar({ targets: MapTargets \| null, framed: RegionSlot \| null, onFrame(slot \| "world") })` | §3.3 |
| `src/ui/compact/BottomDock.tsx` | `BottomDock({ open, onOpen(panel) })` | §3.3 |
| `src/ui/compact/Ticker.tsx` | `Ticker({ entry: LogEntry \| null, aiPlayCard: number })` | ticker + compact play banner (§9.5) |
| `src/ui/compact/CompactSheets.tsx` | `CompactSheets` | hosts the hand drawer, adversary, log, status sheets |

*As built (W1, `docs/handoff/ui-shell.md` §1–§2):* the app is `main.tsx` → `App({ controller? })` → `KeymapProvider` →
`UiRootProvider` → `ShownProvider` → `ShellContext` (`useShell()`: open(dialog), toStart, showResult, gameKey, telexKey; in
`screens/shellContext.ts`) → `StartScreen` / `GameScreen`. The `src/ui/state/**` files are owned by the runner workstream. Extra
exports / props: `appController()`, `pageAiConfig()` (`screens/appController.ts`; dev-only `?ai=policy` and `window.__tsp`);
`StartScreen({ coin, confirmReplace, inGame, onPick(side), onResume(), onSettings(), onAbout() })`, `COIN_MS`, `agoText`;
`BootLine({ load?, error?, onRetry(), status, aiReady, failedStage?, className? })`, `bootProgress`, `errorKey`;
`consoleVariant(layout, width)` (desktop ≥ 1440, condensed 1200–1439), `useViewport()`; `ConfirmDossier({ kind: "newGame" |
"resign", onConfirm, onClose })`, `SHORTCUT_ROWS`; `Menu({ anchor, onClose, onOpen(dialog), onNewGameNow })`; `Segmented`;
`TheatreBar` + `regionTargets?`, `stagedRegion?`, `onRegionActivate?`, `onRegionHover?`, `overlay?`, `THEATRE_ORDER`,
`theatreCounts`, `framedSlot` (the pressed chip follows the camera); `BottomDock({ open, onOpen, iconsOnly? })`, `DockPanel`;
`Ticker({ entry, aiPlayCard, aiSide?, how?, ar?, quiet?, onOpenLog? })`, `TICKER_MS`; `CompactSheets({ panel, onClose, offered,
staged, onActivateCard, onOpenPile })`; `src/ui/map/contract.ts` (map props widened for the shell). The compact orders sheet expands
to 60 dvh with its grab; the hand drawer also closes when the card prompt ends.
**Code splitting** (`src/ui/screens/lazyChunks.ts`): `gameChunk` (`import("./GameScreen")`) and `mapChunk` (`import("../map")`,
the start screen's backdrop), each a `React.lazy` component with a cached `load()`, plus `useChunk(chunk, want?, onError?)` and
`whenIdle(fn)`. The start screen loads the game chunk when idle; the app keeps the start screen until it is in (no loading
fallback); a failed download toasts once, from the player's own action (Q-055). QA round 1 adds `SupersededDossier`
(`screens/SupersededDossier.tsx`, Q-002), `retryBoot(controller, humanSide)` in `App.tsx` (K-001), `useFocusRescue`
(`screens/focusRescue.ts`, Q-043), `AiAnnouncer` (`rail/Announcer.tsx`, mounted by GameScreen, Q-045) and `useSqueeze`
(`console/squeeze.ts`, Q-041); `StartScreen` takes `onRetry?()`.

**W2 map** (§4)

| File | Exports | Props / signature |
|---|---|---|
| `map/MapView.tsx` | `MapView` = `forwardRef<MapHandle, MapViewProps>` | §15.1 `MapViewProps` |
| `map/geometry.generated.ts` | `GEOMETRY: { viewBox: [number, number, number, number]; box: { w: 88; h: 56 }; countries: readonly { id: number; x: number; y: number }[]; superpowers: Record<Side, { x: number; y: number }>; plates: Record<RegionSlot, { x: number; y: number }>; links: readonly [number, number, boolean][]; land: Readonly<Record<string, string>> }` | generated by `map/build/build-map.mjs` |
| `map/CountryBox.tsx`, `Marker.tsx`, `RegionPlate.tsx`, `SuperpowerPlate.tsx`, `Links.tsx`, `Land.tsx` (memoised, static) | — | internal |
| `map/useCamera.ts` | internal | fit, wheel/drag/pinch, animated viewBox, `frame()` |
| `map/MapTooltipHost.tsx` | internal | §4.8 |
| `map/useMapBeats.ts` | `useMapBeats(ref: RefObject<MapHandle>, director: Director)` | registers the `country` beat (and the compact camera pan before off-screen beats) |
| `map/names.ts` | `mapLabel(id, lang, detail)` | §4.3 name source |
| `public/textures/paper.webp` | asset | ≤ 30 KB |

**W3 common + cards**

| File | Exports | Props |
|---|---|---|
| `common/glyphs.ts` | `STAR_PATH`, `HAMMER_SICKLE_PATH` | §2.4 |
| `common/SideGlyph.tsx` | `SideGlyph` | `{ side: Side; size?: number; title?: string }` |
| `common/Seal.tsx` | `Seal` | `{ side: Side; size?: number }` |
| `common/Icon.tsx` | `Icon`, `IconName` | `{ name: "event"\|"influence"\|"coup"\|"realign"\|"space"\|"log"\|"status"\|"gear"\|"menu"\|"undo"\|"skip"\|"chevron-up"\|"close"\|"external"\|"eye"\|"list"; size?: number }` |
| `common/Button.tsx` | `Button` | `{ variant: "primary"\|"ghost"\|"brass"\|"dark"\|"danger"; size?: "s"\|"m"\|"touch"; onPaper?: boolean; icon?: IconName; kbd?: string; pressed?: boolean; disabled?: boolean; title?: string; onClick(): void; children: ReactNode }` |
| `common/HoldButton.tsx` | `HoldButton` | `{ ms?: number /* 1200 */; onConfirm(): void; children: ReactNode; label: string }`: pointer + Enter hold, fill ring, reduced-motion variant |
| `common/Stamp.tsx` | `Stamp` | `{ children: ReactNode; side?: Side \| null; tilt?: number; tone?: "ink"\|"alert" }` |
| `common/MessageText.tsx` | `MessageText` | `{ message: Message; refs?: boolean }`: renders via `render(m, { card, country })` with private-use sentinels, splits into text + `<CardRef>`/`<CountryRef>` elements, no `innerHTML` |
| `common/CardRef.tsx`, `CountryRef.tsx` | same | `{ card \| country: number; children: ReactNode }`: hover 250 ms → `zoomCard` / `onCountryPulse` from context |
| `common/Popover.tsx` | `Popover` | `{ anchor: DOMRect \| Element; placement?: "auto"\|"top"\|"bottom"\|"left"\|"right"; tone: "paper"\|"room"; arrow?: boolean; onClose?(): void; children: ReactNode }` |
| `common/Dossier.tsx` | `Dossier` | modal: `{ tab: ReactNode; title: ReactNode; width?: number; onClose?(): void; children: ReactNode; footer?: ReactNode }`: focus trap, Esc, scrim, compact = full-screen sheet |
| `common/Sheet.tsx` | `Sheet` | `{ open: boolean; onClose(): void; height: "auto"\|"60%"\|"80%"\|"full"; label: string; children: ReactNode }`: drag handle, swipe down |
| `common/Toaster.tsx` | `Toaster`, `useToast()` | toast queue at z 90, top centre of the table, 3 s default |
| `common/Die.tsx` | `Die` | `{ face: number; side: Side \| "neutral"; size?: number; result?: "ok"\|"fail"\|"boom" }` |
| `common/RollingNumber.tsx` | `RollingNumber` | `{ value: number; ms?: number; signed?: boolean }`: vertical roll, `.ts-num` |
| `common/hooks.ts` | `useHoverIntent(ms)`, `useLongPress(ms)`, `usePrefersReducedMotion()` | |
| `cards/CardFace.tsx` | `CardFace` | `{ card: number; width: number; caption?: boolean; tags?: ReactNode; dim?: "none"\|"passive"\|"unplayable"; overlapRight?: number }` |
| `cards/CardBack.tsx` | `CardBack` | `{ width: number }` |
| `cards/ChinaCardFace.tsx` | `ChinaCardFace` | `{ faceUp: boolean; width: number }` |
| `cards/CardZoom.tsx` | `CardZoomHost` | reads the zoom state from `UiRoot`; play notes from the current prompt + `controller.effectiveOps` |
| `cards/CardSheet.tsx` | `CardSheet` | `{ card: number; onClose(): void; actions?: ReactNode }` (compact) |
| `cards/sortHand.ts` | `sortHand(cards: readonly number[]): number[]` | scoring first, then Ops descending, then id |

*As built (W3, `docs/handoff/ui-common.md`):* every component also takes `className`. Extras: `Button` is a `forwardRef` (+
`aria-*`, `keyshortcuts`, `type`, `autoFocus`); `HoldButton` is a `forwardRef` too, with `autoFocus` (the slip, the dossiers'
confirm and the play-mode hold row use `<HoldButton key={option.idx} autoFocus …>`), + `globalEnter`, `disabled`, `onPaper`,
`onHoldChange`, `HOLD_MS`;
`Stamp` + `size`, `glyph`, `animate`; `Popover.anchor` may be `null` (centred) + `avoid`, `gap`, `role`, `label`, `passThrough`
(the card zoom lets the pointer through); `Dossier` + `compact`; `Sheet` + `header`; `Toaster` + `fixed`; `Die` + `numeral`,
`tilt`; `useHoverIntent(ms, { onStart, onEnd, enabled })`, `useLongPress(ms, callback, opts)`; `common/glyphs.ts` +
`HAMMER_SICKLE_PATH_LARGE`, `glyphPath(side, px)`; `common/countryPulse.ts` (`CountryPulseContext`, `useCountryPulse`);
`common/keymap.ts` (`useKey`, `KeymapProvider`, `KeyScope`, `comboLabel`, …); `common/format.ts`, `common/placement.ts`;
`CardZoomHost({ actions?(card) })` (compact card-sheet answers), `CardZoomContent`; `cards/CardTags.tsx` (`CardTags({ card,
warnings?, known?, noScoring?, compact? })`), `cards/CardDetails.tsx`, `cards/playNotes.ts`, `cards/cardImages.ts`; `CardFace` + `eager`,
`imageLang`; `mergeHandOrder(prev, cards)`. The errata label shows whenever the card images are English; the face-down China Card
titles come from `cardInfo(6).title`.
QA round 1: `common/turnAr.ts` (`displayTurnAr(state, ending?)`, `lastActionRound`; every turn / AR readout), `common/touch.ts`
(`useTouchUi()`, `TouchUiContext`, `createTouchSignal`), `useFocusReturn(active?, within?)` (returns focus only when it was lost
with the dialog), `Sheet` covers the map column only in compact landscape and marks its grab `data-sheet-grab`.

**W4 runner** (§9)

| File | Exports | Notes |
|---|---|---|
| `runner/beats.ts` | `buildBeats(frame: Frame, before: PublicState, humanSide: Side): Beat[][]` | pure; groups per §9.4; merges influence + control per country; staggering is applied by handlers via the index |
| `runner/director.ts` | `createDirector(): Director` | multiple handlers per kind, `Promise.all` |
| `runner/useFrameRunner.ts` | `useFrameRunner(root: UiRoot): Shown` | §9.1: commit, ack, skip, skip-to-my-turn, Shift boost, hidden tab |
| `runner/ShownContext.tsx` | `ShownProvider`, `useShown(): Shown` | |
| `runner/anchors.ts` | `createAnchorRegistry(): AnchorRegistry` | |
| `runner/lastPlay.ts` | `reduceLastPlay(prev, frame, humanSide): { lastOpponent; placedThisPlay }` | pure: pencil marks and delta pills (§4.4, §9.5) |
| `runner/FlightLayer.tsx` | `FlightLayer` | registers `card-moved`, `deal`, `reshuffle`; §9.6 mapping |
| `runner/locations.ts` | `anchorForLocation(loc: string, card: number, ctx): AnchorId \| null` | §9.6 table, pure |

*As built (runner, `docs/handoff/ui-runner.md` §2):* the runner also owns `src/ui/state/**` (except `context.ts`) and `src/dev/**`.
`UiRootProvider` binds `controller.subscribe/getSnapshot` itself and takes optional `layout`, `settingsStore`, `rootAttributes`;
`ShownProvider({ onCommit? })` + `useOnCommit(fn)` (override clearing after the commit, before the ack); `flightFor`,
`dealtCards(frame, side)`, `STAGGER` / `staggerOffset`, `staticShown`, `StaticShownProvider`; `useOverlays()`. Skip keys are bound
by the shell (`shown.skip()`, `shown.skipToMyTurn()`); the runner detects the Shift boost. Dev kit: `src/dev/FixtureController.ts`,
`src/dev/DemoHarness.tsx`, fixtures `tests/fixtures/ui/*.json`.

**W5 console + rail** (§5, §6)

| File | Exports | Props |
|---|---|---|
| `console/Console.tsx` | `Console` | `{ variant: "desktop"\|"condensed"\|"tablet"\|"compact" }` |
| `console/TurnTrack.tsx` | `TurnTrack` | `{ turn: number; condensed: boolean }` |
| `console/ArTrack.tsx` | `ArTrack` | `{ state: PublicState; humanSide: Side }` |
| `console/DefconGauge.tsx` | `DefconGauge` | `{ defcon: number; variant: "full"\|"compact" }` |
| `console/VpGauge.tsx` | `VpGauge` | `{ vp: number; width: number; variant: "full"\|"mini" }` |
| `console/MilOpsTrack.tsx` | `MilOpsTrack` | `{ milOps: { US: number; USSR: number }; required: number }` |
| `console/SpaceTrack.tsx` | `SpaceTrack` | `{ space: { US: number; USSR: number } }` |
| `console/LangToggle.tsx` | `LangToggle` | `{ variant: "segmented"\|"single" }` |
| `console/useTrackBeats.ts` | `useTrackBeats(director)` | `track` beats (needle, lamps, cells, AR pip); the VP chip flight |
| `console/StatusPanel.tsx` | `StatusPanel` | all instruments stacked (tablet flyout, compact sheet) |
| `rail/Rail.tsx` | `Rail` | `{ collapsed: boolean; onToggle(): void }` |
| `rail/AdversaryDossier.tsx` | `AdversaryDossier` | `{ state: PublicState; aiSide: Side; status: "waiting"\|"thinking"\|"playing" }` |
| `rail/EffectsStrip.tsx` | `EffectsStrip` | `{ flags: readonly string[] }` |
| `rail/Dispatches.tsx` | `Dispatches` | `{ log: readonly LogEntry[]; humanSide: Side; current: { turn: number; ar: number } \| null }` |
| `rail/RailStrip.tsx` | `RailStrip` | `{ open: "adversary"\|"effects"\|"log"\|"status"\|null; onOpen(p) }` (tablet) |
| `rail/useRailBeats.ts` | `useRailBeats(director, aiSide)` | `hand-revealed` (AI), `headline-chosen` (AI), `effect` |

*As built (W5, `docs/handoff/ui-console.md`):* `Console` + `onSettings?()`, `onMenu?(anchor)`, `menuOpen?`, `menuAlert?`;
`DefconGauge.caption?`; `VpGauge.history?`; `ArTrack.ar?`, `readoutOnly?`; `StatusPanel.after?`, `heading?`; `EffectsStrip.bare?`;
`Dispatches.bare?`; `RailFlyout({ panel, onClose })` (tablet flyout); the connected sections `AdversarySection`,
`EffectsSection`, `DispatchesSection` (compact sheets); `useVpHistory(turn, vp)` / `vpHistory(log, { turn, vp })`. The DEFCON 2 toast is
raised by the console's `defcon` beat; the VP chip runs before the needle (600 + 600 ms).

**W6 tray** (§7)

| File | Exports | Props |
|---|---|---|
| `tray/Tray.tsx` | `Tray` | `{ variant: "desktop"\|"tablet" }`: slip slot (renders `<OrdersSlip/>`), hand, China, piles |
| `tray/Hand.tsx` | `Hand` | `{ cards: readonly number[]; offered: ReadonlyMap<number, OptionPolicy>; staged: number \| null; liftedOut: number \| null; mode: "neutral"\|"active"\|"passive"; onActivate(card: number): void }` |
| `tray/HandCard.tsx` | `HandCard` | `{ card: number; state; tags; overlapRight: number; onActivate() }` |
| `tray/ChinaSlot.tsx` | `ChinaSlot` | `{ china: PublicState["china_card"]; humanSide: Side; policy: OptionPolicy \| null; onActivate(): void }` |
| `tray/Piles.tsx` | `Piles` | `{ deck: number; discard: readonly number[]; removed: readonly number[]; onOpen(pile: "discard"\|"removed"): void }` |
| `tray/HeadlineSlot.tsx` | `HeadlineSlot` | `{ card: number \| null; faceDown: boolean }` |
| `tray/HandDrawer.tsx` | `HandDrawer` | compact (§7.6) |
| `tray/useTrayBeats.ts` | `useTrayBeats(director, humanSide)` | `reveal` (human: card → slip), `hand-revealed` (human), `headline-chosen` (human), `china` |

*As built (W6, `docs/handoff/ui-tray.md`):* `Tray({ variant, slip, offered, staged, onActivateCard(card), onOpenPile(pile),
className? })` takes the slip as a slot and does not import `src/ui/prompts`; it derives the hand's mode, the lifted-out card and
the stamp verb itself, and keeps the last prompt's look (inert) while your own frames resolve. `HandDrawer({ open, onClose,
offered, staged, onActivateCard })`; `Hand` + `variant?`, `humanSide?`, `known?`, `gone?`, `blink?`, `verb?`, `interactive?`;
`HandCard` / `ChinaSlot` likewise; `Piles.variant?: "desktop" | "tablet" | "panel"` (short labels Deck / Discard / Removed);
`HeadlineSlot` + `variant?`, `humanSide?`; `TrayBeatsProvider({ humanSide? })`; `isHandPrompt(prompt, hand)` (compact drawer
auto-open). `tray/trayModel.ts` holds `fitHand` (§7.2).

**W7 prompts** (§8)

| File | Exports | Props / signature |
|---|---|---|
| `prompts/policy.ts` | `policyFor(prompt: Prompt, option: PromptOption, ctx: { settings: UiSettings; cost2: ReadonlySet<number> }): OptionPolicy`, `isFinalPoint(prompt, option, cost2): boolean` | pure, tested against every row of §8.2/§8.6 |
| `prompts/usePromptTargets.ts` | `usePromptTargets(prompt: Prompt \| null, state: PublicState \| null): MapTargets \| null` | freezes the last targets while a human frame animates (§8.5.4) |
| `prompts/costHint.ts` | `cost2Targets(prompt: Prompt, state: PublicState): Set<number>` | display-only, G1 |
| `prompts/eventVerbs.ts` | `verbFor(prompt: Prompt): MapTargets["verb"]` | G3 fallback |
| `prompts/useStaging.ts` | `useStaging(prompt): { staged: { kind: "country"\|"card"\|"option"; id: number; idx: number } \| null; stage(...); clear() }` | cleared on promptId change, 6 s timeout |
| `prompts/usePromptActions.ts` | `usePromptActions(): { activateCountry(id), activateCard(id), activateOption(idx), done(), undo(), confirm() }` | applies the policy; calls `controller.choose(promptId, idx)` |
| `prompts/OrdersSlip.tsx` | `OrdersSlip` | `{ variant: "desktop"\|"tablet"\|"compact" }`: reads vm/shown; §8.1 |
| `prompts/PlayModeStage.tsx` | `PlayModeStage` | `{ prompt: Prompt }` (`play-mode` and `op-mode`) |
| `prompts/BranchDossier.tsx`, `DefconDossier.tsx` | same | `{ prompt: Prompt }` |
| `prompts/CardPicker.tsx` | `CardPicker` | `{ prompt: Prompt } \| { browse: "discard"\|"removed"; onClose(): void }` (also the pile viewer) |
| `prompts/RegionChoice.tsx` | `RegionChoice` | `{ prompt: Prompt }` (slip rows) + `regionTargetsOf(prompt): Set<RegionSlot>` |
| `prompts/CountryTooltip.tsx` | `CountryTooltip` | `{ country: number; prompt: Prompt \| null; state: PublicState; humanSide: Side }` (calls `coupOdds`, debounced, cached) |
| `prompts/TargetList.tsx` | `TargetList` | `{ prompt: Prompt; state: PublicState }` |
| `prompts/doneText.ts` | `doneText(prompt: Prompt): Message \| null` | `doneLabel` + overrides (§8.4) |
| `prompts/runTotals.ts` | `useRunTotal(prompt): number` | the counter's total (§8.1) |

*As built (W7, `docs/handoff/ui-prompts.md`):* staging is shared through `promptStore(controller)` (no provider). Extras:
`OrdersSlip({ variant, expanded? })`, `slipMode`, `playModeKeys`; `PlayModeRows` (compact card sheet); `RegionChoice({ prompt,
dense? })`; `usePromptActions()` + `activateRegion`, `hoverCountry`, `hoverRegion`, `cancel`, `commit`, `policyOf`, `stagedOption`;
`wiring.tsx`: `usePromptMapProps()`, `useHandProps()`, `handOffers`, `promptSurface`, `isHandPicker`, `CardSheetActions`,
`PromptStage` (play-mode / op-mode stage in the table), `PromptDialogs` (branch, DEFCON, picker); `dialogParts.tsx`:
`DialogKeys`, `ConfirmButton`, `DoneButton`, `FocusHold`, `useCardPeek`; `previews.ts` (`usePreview`: `coupOdds` /
`realignOdds`); `labels.ts`, `regions.ts`; `doneText` only wraps `doneLabel` (the §8.4 labels live in `src/game`).

**W8 stage** (§9.5, §10)

| File | Exports | Beat |
|---|---|---|
| `stage/Stage.tsx` | `Stage` | container inside the table (z 40); hosts the children below; registers anchor `stage` |
| `stage/RevealDock.tsx` | `RevealDock` | `reveal` (AI): dock, pinning, avoidance, collapse (§9.5). It reads `Shown.aiPlayCard`; the runner sets it on an AI `reveal` beat and clears it at the next `card-played` / `action-round` / human prompt |
| `stage/DiceTray.tsx` | `DiceTray` | `roll` |
| `stage/HeadlinePapers.tsx` | `HeadlinePapers` | `headline-reveal` (waits for Continue when `pauseOnReveals`) |
| `stage/ScoringSheet.tsx` | `ScoringSheet` | `scoring` (+ the plate breakdown popover reuses its table: export `ScoringTable({ score: RegionScore })`) |
| `stage/TurnBanner.tsx` | `TurnBanner` | `banner` |
| `stage/DangerFrame.tsx` | `DangerFrame` | — (reads `Shown.state.defcon`) |
| `stage/GameOverTelex.tsx` | `GameOverTelex` | `game-over`; `{ ending: Ending; humanSide: Side; onNewGame(); onReview(); onLog() }` |
| `stage/VpChart.tsx` | `VpChart` | `{ points: readonly { turn: number; vp: number }[] }` |

*As built (W8, `docs/handoff/ui-stage.md`):* the beat handlers live in a framework-free `StageStore` (one per UiRoot;
`useStageStore`, `useStageBeats([...])`, `stageStoreFor`); each component attaches the handlers of its beat. Extras:
`Stage({ onFocusRegion?(slot | null), className? })` (sets `--stage-bottom`); `GameOverTelex` + `stats?: Partial<TelexStats>`
(mount per game, `key` = the game); `ScoringTable({ score, fill?: "all" | "none" | "timed", rowMs? })`;
`useStageWaiting(): { waiting: "headline" | "scoring" | null, proceed() }` (the slip's Continue); `DockPanel` and the `…View`
components (`DiceTrayView`, `HeadlinePapersView`, `ScoringSheetView`, `TurnBannerView`, `TelexSheet`) for demos and tests.
Anchors: `stage`, `dock`, `card:<id>` on the dock's card; `scoring` (the sheet's net bar) is in the contract for the VP chip.
The deck pulse on era turns is a ring over `anchors.rect("deck")`; no sound ships.

---

## 16. Contract gaps and the fallbacks this spec uses

Nothing below blocks implementation. Each gap has a working fallback, and the fallback lives in one named place, so it can be deleted when
the contract grows.

**Status (2026-11-22):** G1, G2, G3, G5, G7, G8 and G11 are implemented by the controller and always present (exact semantics:
`docs/handoff/logic.md`, "Contract gap fields"). Keep the fallbacks only as a guard for absent fields. Notes: `PromptOption.cost` is how
much `remaining` drops, so it can exceed 2 (a point outside Asia forfeits the China Card bonus; the last point of a run costs all of
`remaining`). The "2 Ops" map tag means opponent control, so derive it from control (or `cost === 2` without a pending China Card bonus),
not from `cost >= 2` alone. `endsPlay` is conservative: true whenever the answer depends on hidden information (every headline pick).
G9 is moot (the loser is always the non-winner); G4, G6, G10 and G12 keep their fallbacks (G12: the data `short` fields now hold the map
abbreviations).

| # | Gap | Why the UI wants it | Suggested contract change | Fallback now (where) |
|---|---|---|---|---|
| G1 | No generic option preview | influence cost 1/2, "→ control", whether a click ends the play (staging the final point), the after-state in tooltips | `previewOption(promptId, idx): { endsPlay: boolean; cost?: number; countries: {id, us, ussr, controlledBy}[]; warnings } \| null` by snapshot → step → restore | `cost2` = targets controlled by the decider's opponent; final point = `remaining === 1 \|\| (remaining === 2 && cost2)`; "→ control" from stability (display-only, `prompts/costHint.ts`) |
| G2 | No play identity on AI frames | keep the reveal dock pinned for one card play; the crumb | `Frame.playId` (monotonic per card play) | a play = the frames after an AI `card-played` until the next `card-played` / `action-round` / human prompt (runner) |
| G3 | Event-target semantics are only in the title Message | ghost "+1" vs "−1", whose slot | `Prompt.effect?: { verb: "add" \| "remove" \| "target"; side: Side }` | table by `resolvingCard` in `prompts/eventVerbs.ts`, default "target" (no ghost) |
| G4 | No short prompt title | the slip title duplicates the big counter | `Prompt.shortTitle?: Message` | `ui:slip.verb.<kind>` for influence / coup / realign (§8.1) |
| G5 | No realignment odds | parity with the coup tooltip | `realignOdds(country)` over the 36 die pairs (`ts_step_dice`) | tooltip lists the facts, no odds |
| G6 | No reasons for unplayable hand cards | "Missile Envy must be played", "Quagmire: discard 2+ Ops" | `Prompt.handNotes?: { card: number; reason: Message }[]` | the prompt title/detail already explains the forced cases; other dimmed cards say "Can't be played now" |
| G7 | No source per `vp` event | the VP chip flies from the right place | `{ t: "vp"; …; source?: { card?: number; country?: number } }` | the chip starts from the reveal dock / scoring sheet / last country beat of the frame, else the table centre |
| G8 | AI thinking time not accumulated | game-over stats | `ViewModel.aiStats?: { decisions: number; ms: number }` | stat omitted |
| G9 | `Ending` doesn't say who caused a DEFCON / CMC loss | the telex sentence | `Ending.loser?: Side` | i18n assumes loser = the non-winner (already done by `endingMessages`) |
| G10 | No mil-ops penalty preview | console tooltip | `PublicState.milOpsPenalty?: { US: number; USSR: number }` | show only the shortfall "short by n"; required = DEFCON shown as the board prints it |
| G11 | No save summary for the start screen | "Turn 5 · AR 3 · you are the USSR · 2 h ago" | `ViewModel.savedGame?: { turn; ar; humanSide; savedAt }` | "Resume game" without details |
| G12 | Map-only short names are not in `src/data` | §4.3 abbreviations | the i18n owner adds them to the data `short` fields | `src/ui/map/names.ts` local table |

Resolved by existing code (no gap): effect metadata (`src/data/effects.ts` `effectInfo`, `effectText`), the space box table
(`engineLayout().space_boxes`), plays left (`prompt.detail` for `actionCard`; `playsLeft` in `src/game/rules` if needed),
card location names (§9.6), undo semantics (`ARCHITECTURE.md`: back to the start of the current play, only while a human prompt is
open), warnings text (`warningMessage`), done labels (`doneLabel`), ending text (`endingMessages`), branch text (`branchMeta`).

---

## 17. Assets to produce

| Asset | Owner | Spec |
|---|---|---|
| Map land paths + geometry | map (W2) | §4.1. Port `build-board.mjs` |
| `public/textures/paper.webp` | map (W2) | 512×512 tileable paper grain, ≤ 30 KB, neutral grey on white (multiply) |
| Card back | common (W3) | CSS (`final.css` `.card-back`) or an SVG ≤ 3 KB |
| China Card face-down | common (W3) | SVG ≤ 6 KB: red lacquer `#7f1a13 → #5e120d`, gold rim `--ts-ussr-gold`, "THE CHINA CARD / 中国牌" (text as SVG text, language-neutral bilingual), ribbon "FACE DOWN"/"正面朝下" from i18n as an HTML overlay |
| Seals, glyphs, icons | common (W3) | §2.4 (paths in `final.js`) |
| Dice faces | common (W3) | CSS 3×3 pip grid |
| Hammer-and-sickle redraw for ≥ 40 px | common (W3), optional | same 24-unit box, same visual weight |
| Sounds | stage (W8), optional | §13 |
| Fonts | done (design-synth) | `public/fonts/` (5 files, 117 KB) + `OFL.txt`; **add the OFL notice to `THIRD_PARTY_LICENSES.md`** (owner of that file) |

---

## 18. Acceptance checklist (every workstream, before handoff)

1. `npx tsc --noEmit -p .` passes; `npx vitest run tests/ui tests/theme` passes.
2. No hex colours, no px font sizes outside the `--ts-fs-*` scale, and no z-index values outside `--ts-z-*` in your CSS
   (`grep -nE '#[0-9a-fA-F]{3,6}\b' src/ui/<dir>` returns only comments).
3. Renders in **English, Chinese, and `?lang=en-XA`** without clipping at 1440×900, 1366×768, 1024×768 and 390×844. Screenshots
   are compared with `docs/design/shots/final-*.png`.
4. Reduced motion (`data-motion="reduce"`): no movement over 8 px, no loops, all information still shown.
5. Keyboard: every action reachable, visible focus, Esc works, no traps outside dialogs.
6. Side identity never by colour alone (check in greyscale).
7. Hidden information: nothing outside `PublicState` is rendered or logged.
8. Handoff note in `docs/handoff/<name>.md`: what you built, the public API, how to test, deviations from this spec with reasons.

---

## Appendix A. Reference numbers at 1440×900 (desktop, `final-desktop-en.png`)

| Thing | Value |
|---|---|
| Console | 1440×58 |
| Rail | 288×842 at x 1152 |
| Table | 1152×842 at (0, 58); map frame inset 10 |
| Map scale (fit) | 0.638 px/u → box 56×36 px, name 9.6 px, numeral 13.4 px |
| Tray | 1152×167 at y 733 (overlaps the table's bottom 167 px; the map runs under it by ≤ 64 px) |
| Slip | 344×153 at (12, 737) (tray 167 − 4 top margin − 10 bottom padding) |
| Hand card | 104×146, fan ±2.2°/card, playable lift 10 px |
| China slot | 118 wide, card 92×129 rotated −3° |
| Piles | 104 wide, 3 rows of 38 px |
| Reveal dock | 236 wide at the table's top right (right 64, top 34) |
| Play-mode stage | card 262×367 + panel 392 wide, gap 26, centred in the table |
| Tooltip | 200–260 wide, 12 px from the box |
| Scoring sheet | 520 wide at (28, 120) of the table (left dock) |
| Game-over telex | 700 wide, centred |
