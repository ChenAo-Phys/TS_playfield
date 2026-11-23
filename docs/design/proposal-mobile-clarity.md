# UI/UX proposal: "Mobile clarity"

Design angle: **mobile-first and accessibility-first.** One-handed phone play, progressive disclosure, large touch targets,
and zero ambiguity about what to do next, scaling up to a full desktop layout. Everything here is buildable with
React 18 + SVG + CSS (+ Web Animations API), against `src/game/contract.ts` as it stands. Where the contract falls short,
§15 lists the gaps and the fallbacks this design uses until they close.

| Mockup | File | Screenshots (`docs/design/shots/`) |
|---|---|---|
| Game screen (responsive, all states) | `docs/design/mockup-mobile-clarity.html?state=…&lang=en\|zh` | `mobile-clarity-desktop-influence.png` (1440×900, AR prompt open), `…-desktop-influence-zh.png`, `…-desktop-coup.png`, `…-desktop-card.png`, `…-desktop-ai.png`, `…-desktop-headline.png`, `…-desktop-scoring-zh.png`, `…-desktop-over.png`, `…-phone-influence.png` (390×844), `…-phone-influence-zh.png`, `…-phone-card.png`, `…-phone-ai.png`, `…-phone-landscape.png` (844×390), `…-tablet-influence.png` (820×1180) |
| Start screen | `docs/design/mockup-mobile-clarity-start.html?lang=en\|zh&save=0\|1` | `mobile-clarity-start-desktop.png`, `…-start-desktop-zh.png`, `…-start-phone.png` |

The mockups are static HTML that work from `file://` (no build step). The mockup map uses blob continents as
placeholders, the real country positions from `docs/notes/countries.json` (`ref_x/ref_y`, boxes enlarged to 104×70 with
three 2–3 unit nudges), and the real card images in `public/cards/{en,zh}/`. Regenerate the data with
`node docs/design/mockup-mobile-clarity-assets/build-data.mjs`. Re-shoot with
`source scripts/pw-env.sh && node docs/design/mockup-mobile-clarity-assets/shoot.mjs [name-filter]`.

---

## 0. Principles (the rules every screen follows)

1. **One question at a time, asked in one place.** The *Action panel* (bottom sheet on phones, bottom of the right rail on
   desktop) is the only place that asks something. It always shows **who acts**, **what to do** (verb first:
   "Place influence"), **how much is left** (a big counter) and **how to undo**. Nothing else on screen ever looks
   clickable unless it is an answer to that question.
2. **Only actionable things look actionable.** During a map decision, non-targets dim to 34% and lose saturation. The
   hand dims when it isn't being asked about. Legal targets get a halo. Illegal cards get a lock.
3. **Undoable = one tap. Irreversible = two taps in the same spot.** Placing influence, picking a card, and picking a mode
   can be undone, so they act on the first tap. Anything that rolls a die, reveals hidden information or commits a
   headline asks once more. The second tap lands **where the first one was**: the same button turns into its confirmation,
   or you tap the selected country again, so a thumb never has to travel. Choices that end the game need a 1.2 s
   press-and-hold.
4. **Progressive disclosure.** Glanceable first (counter, VP, DEFCON), details on demand (tooltips, sheets, the log,
   the scoring breakdown). The phone shows three track pills. The full tracks are one tap away.
5. **Everything happens in the thumb zone on a phone.** The action panel, hand bar, undo, confirm, zoom controls and region
   jump all sit in the bottom 45% of a 390×844 screen or on the right edge. The top of the screen is read-only status.
6. **Side identity never relies on colour alone.** US: blue, **left/top**, rounded-square token, ★. USSR: red,
   **right/bottom**, chamfered-octagon token, hammer & sickle. Text labels go with every glyph.
7. **The UI restates no rules.** Legality, costs, odds and warnings come from the controller (`Prompt`, `CoupOdds`,
   `effectiveOps`, `regionScores`, `Warning`). Where the contract does not provide something yet, the fallback is marked.
8. **The same component tree at every size.** Phone, tablet and desktop differ in CSS grid placement and in map zoom level.
   They do not have separate UIs.

---

## 1. Visual identity: "Ink & Paper"

The **board is paper**: a light, calm, board-faithful map with the game's region colours. The **chrome is ink**: deep navy
panels that frame the board without competing with it. Amber means "you can act here". It belongs to neither side.

### 1.1 Palette (CSS custom properties, normative)

Source of truth: `docs/design/mockup-mobile-clarity-assets/mc.css` `:root`.

```css
:root {
  /* Ink — chrome */
  --ink-950:#0a111d; --ink-900:#0f1828; --ink-850:#131f33; --ink-800:#18263d; --ink-750:#1d2d47;
  --ink-700:#243755; --ink-600:#33496c; --ink-500:#4b6389; --ink-400:#7086a8; --ink-300:#9badc8;
  --ink-200:#c6d2e4; --ink-100:#e9eef6; --ink-0:#ffffff;
  /* Paper — board */
  --paper-ocean:#d5dee2; --paper-ocean-line:#c5d0d5; --land-neutral:#e9e4d6;
  --land-us:#cfdbee; --land-ussr:#ecc9c4; --map-ink:#1d2430;
  /* Sides */
  --us-900:#0d2a5a; --us-700:#1c4e9e; --us-600:#2762c4; --us-400:#6d9ae6; --us-100:#dde8fb;
  --ussr-900:#5c0c14; --ussr-700:#a5142a; --ussr-600:#cf2a36; --ussr-400:#f07279; --ussr-100:#fbe0de;
  /* Action (neither side) */
  --act-600:#e59500; --act-500:#ffb21e; --act-400:#ffc552; --act-100:#fff2d3; --act-ink:#1d1400;
  /* Status */
  --ok-500:#34a466; --warn-500:#f59e0b; --warn-100:#fff4dc; --fatal-ink:#141414;
  /* DEFCON (each with a numeral colour that passes 4.5:1) */
  --defcon-5:#2f7a50; --defcon-5-ink:#fff;   --defcon-4:#7f9a35; --defcon-4-ink:#1d2430;
  --defcon-3:#d8a10a; --defcon-3-ink:#1d2430; --defcon-2:#e5650f; --defcon-2-ink:#1d2430;
  --defcon-1:#1b1b1b; --defcon-1-ink:#fff;
  /* Regions (board heritage) */
  --rg-we:#cfc2ea; --rg-ee:#ae9bdc; --rg-me:#a8dcf1; --rg-as:#f5a54c; --rg-sea:#f8cf52;
  --rg-af:#f5e6a6; --rg-ca:#d9e59e; --rg-sa:#abd597;
  /* Country box furniture: battleground = indigo (never red: red is the USSR) */
  --strip-plain:#fff7d4; --strip-bg:#2b3685; --stab-plain:#f8d448; --stab-bg:#2b3685;
}
```

Rules:
- **Red and blue are reserved for the two sides.** Warnings are amber (`--warn-500`). Game-ending warnings use black and
  amber hazard stripes, never red, so a warning can't be read as "USSR".
- The board's region colours are kept, so TS players recognise them, with two changes: Western/Eastern Europe get two
  lavender shades (setup prompts refer to them), and countries in both (Austria, Finland) show a diagonal split.
- **Dark chrome is the only theme in v1.** The paper board stays light in every theme (that is the identity). A
  "dim board" option can lower the paper luminance 12% for night play, as a filter on the map layer.

### 1.2 Typography (system fonts only, no multi-MB web fonts)

```css
--font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Ubuntu Sans", "Helvetica Neue", Arial,
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC",
  "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif;
--font-cond: "Bahnschrift SemiCondensed", "Bahnschrift", "Roboto Condensed", "Arial Narrow", "Ubuntu Sans",
  system-ui, "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
--stretch-cond: 82%;  /* font-stretch, honoured by variable fonts (Bahnschrift, Ubuntu Sans, Roboto Flex) */
:root:lang(zh-CN) { --font-ui: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei",
  "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

- **`--font-ui`** for prose, buttons and the log. **`--font-cond`** (condensed, bold, tabular numerals) for numbers,
  country names on the map, eyebrows and track labels. Its look follows the board's stencil-ish condensed titling at no
  download cost.
- Chinese: the stack puts CJK fonts first so punctuation and quotes are full-width; no letter-spacing on CJK;
  no `text-transform` reliance (uppercase eyebrows are Latin only); line-height 1.5 for CJK prose; **CJK text never
  below 12 px** (`--fs-xs` is 12 under `:lang(zh-CN)`).
- Scale: 11 / 12.5 / 14 (body) / 17 / 22 (prompt title) / 30 px; counters 34–40 px condensed. `font-variant-numeric:
  tabular-nums` everywhere numbers change.
- Optional later: self-host a **Latin-only** condensed subset (≤ 25 KB woff2) for the display face. Never a CJK web font.

### 1.3 Shape, depth, iconography

Radii 6/10/16/22 px. Three shadows (`--shadow-1..3`). Icons are 24-unit stroked SVG symbols (2–2.4 px stroke). The two
side glyphs (★ and a simplified hammer & sickle) are one `<symbol>` each and are used in every place a side is named:
log, badges, effect chips, avatars, VP pill, the superpower nodes. Brand mark: a globe split blue/red.

---

## 2. Layout per breakpoint

One React tree: `<TopBar/>` (desktop) or `<StatusBar/>` (compact), `<Map/>`, `<HandDock/>`, `<Rail>` (`<Opponent/>`,
`<Log/>`, `<ActionPanel/>`), plus the layers in §11.3. CSS grid areas move the pieces. JS reads one boolean,
`compact = (max-width: 699px), (max-height: 500px) and (orientation: landscape)`, for map camera behaviour and to
choose sheet vs docked panel.

### 2.1 Desktop ≥ 1100 px (designed at 1440×900, see `desktop-influence.png`)

```
┌ TopBar 56: brand │ DEFCON │ VP │ Turn │ AR │ Mil ops │ Space │ EN|中文  rules  ⚙ ───────────────┐
├──────────────────────────────── Map (fills) ─────────────────────────────┬ Rail 360 ──────────┤
│  world fit, semantic zoom L1, region chips with live "if scored" values    │ Opponent (AI hand) │
│                                               zoom +/−/fit (bottom right)  │ Log (flex, scroll) │
├ HandDock 214: "Your hand" │ in-play card │ hand (real card art) │ In effect + Deck/Discard/Removed ┤
└────────────────────────────────────────────────────────────────────────────┴ Action panel ──────┘
```
- The action panel sits at the **bottom** of the rail, like the phone sheet. History reads top to bottom: opponent,
  log, then the question.
- Hand cards are real card images, 136 px wide, cut off 26 px at the bottom edge. They rise fully on hover or focus,
  with a 300 px preview after 250 ms.
- Rail 360 px fixed. Above 1600 px the rail grows to 400 and the dock cards to 150 px. At 1920×1080 the world fits at
  about 68 px per box (level L2 text).

### 2.2 Tablet 700–1099 px (portrait and landscape taller than 500, see `tablet-influence.png`)

- The top bar becomes the **status bar with five pills** (DEFCON, VP, Turn·AR, Mil ops, Space) plus ☰.
- Map full width, world fit (L1).
- Bottom row: hand dock (left, 300 px tall) and the rail (right, 360 px) with opponent and action panel. The log
  opens from ☰ or by swiping up on the action panel (a sheet).
- The *In effect* list moves into the tracks sheet (☰).

### 2.3 Phone portrait < 700 px (designed at 390×844, see `phone-influence.png`)

```
┌ Status 56: [DEFCON 3 · no coups EU·AS] [★ VP +3] [Turn·AR 4·3/7] [☰•] ┐  read-only
├ Opponent 50: ☭ USSR·AI · state       [backs][known][China]            ┤
├ Map (flex): region jump chips with target counts │ mini-map │ zoom      ┤  smart focus, L2
├ Action panel (sheet, overlaps map by 18 px, radius 20):                 ┤
│   recap of the AI's last play (1 line) │ YOUR MOVE · breadcrumb         │  thumb zone
│   Title + big counter │ ops bar │ hint │ placed chips  [Undo] [List]    │
├ Hand bar 60: thumbnails · "Your hand · 4 — not needed right now"  [^]   ┤
└──────────────────────────────────────────────────────────────────────────┘
```
- **The hand collapses to a bar** whenever the prompt is not about cards. When the prompt is about cards
  (`headline`, `action-card`, `event-card`), the hand bar expands into a sheet of large cards and the action panel
  carries the instructions.
- The **status bar is read-only** and tappable as a whole (→ tracks sheet). The ☰ button gets an amber dot when
  something needs attention: a mil-ops shortfall or a stranded scoring card.
- The log is a sheet (☰ → Log, or tap the recap line).

### 2.4 Phone landscape (height ≤ 500 px, see `phone-landscape.png`)

Map on the left (full height). Everything the thumb touches is on the right in a 340 px column: status pills, opponent
strip, action panel (scrolls; recap hidden), hand bar. Region chips stay on top of the map; the mini-map is hidden.

### 2.5 Safe areas, orientation, zoom

`env(safe-area-inset-*)` pads the status bar and the hand bar. The page never scrolls (the app is a fixed grid). Browser
zoom up to 200% reflows into the tablet or phone layout. All sizes are in px tokens that scale with zoom. Pinch-zoom on
the map is handled by the map. The page sets `touch-action: none` on the SVG only.

---

## 3. The map

### 3.1 Style

- Ocean: `--paper-ocean` with a faint 120-unit grid. Land: the map agent's SVG, tinted per region at low saturation
  (the mockup uses metaball placeholders). The USA landmass is tinted `--land-us`, the USSR `--land-ussr`, like the
  board's flags.
- **Superpower nodes**: rounded 190×74 plates in side colour with glyph and name, at the board positions (USA ≈ 262,520;
  USSR ≈ 1462,330 in board units).
- **Connections** (behind boxes): intra-region `--map-ink` at 50% opacity, 2.6 u. **Inter-regional**: red-brown
  `#b3261e`, 4.5 u, dashed 9/7 (board convention). **Superpower adjacency**: 7 u solid in the side colour at 70–75%
  opacity to the node. **Japan ↔ USA wrap**: a line from Japan off the right edge with "to USA ▸", and from the USA off
  the left edge with "◂ to Japan".
- **Region chips** (where the board has its scoring boxes): region name plus a live line "if scored: USSR +7 / Even"
  from `frame.regionScores` (`net`, `wins`). Tapping one expands a breakdown (standing, countries, battlegrounds,
  adjacent) for both sides. If the human holds that region's scoring card, a mini card with an amber outline sits on the
  chip's corner (Africa in the mockup). During coup or realign prompts, regions closed by DEFCON show a lock line
  ("No coups · DEFCON 3").
- Subregion labels in italic condensed (Western Europe / Eastern Europe / Southeast Asia · subregion of Asia).

### 3.2 Country box anatomy (104 × 70 map units)

```
 ┌───────────────────────────────┐  ← 1.6 u ink outline, radius 6
 │ Iran                          │  name strip, 25–27 u. Cream = normal; INDIGO + white bold = battleground
 ├───────────────┬───────────────┤
 │   [ 1 ]      (2)     [   ]    │  body = region colour (EU: W lighter / E darker / both: diagonal split)
 │   US token  stability USSR    │  US token LEFT (rounded square) · stability circle on the divider · USSR RIGHT (chamfered)
 └───────────────┴───────────────┘
```

- **Stability sits on the dashed divider, between the two tokens.** This is a deliberate change from the board, where it
  is in the name strip's corner. Two reasons: the name gets the whole strip (so it stays readable at laptop zoom), and
  "US | stability | USSR" *is* the control comparison players make. Battleground stability is an indigo circle with a
  white numeral, matching the battleground strip. Non-battleground is the board's yellow with an ink numeral. Red is
  never used for battlegrounds because red means USSR.
- **Tokens**: influence numeral in condensed 800. Not controlled: white fill, 3 u side-colour outline, side-colour
  numeral. **Controlled: solid side fill, white numeral, and a 4 u inner frame in the controller's colour around the
  whole box.** Zero influence: no token. At L2 a faint glyph (★ / ☭, 18% opacity) marks the empty half so newcomers
  learn "US left, USSR right".
- The shapes differ (rounded square vs chamfered octagon), so control reads in greyscale and for any colour-vision type.

**Semantic zoom levels** (chosen from the current map scale `s` = screen px per map unit):

| level | when | name | tokens | other |
|---|---|---|---|---|
| L0 overview | s < 0.30 (phone world view) | hidden | box filled with the controller's colour (or the region colour) | region chips double in size and show the standings; tapping a region zooms to it |
| L1 compact | 0.30 ≤ s < 0.62 (laptop world fit, tablet) | **short name**, 23.5 u (zh 23 u) | 37 u tokens, 30 u numerals | stability 19 u; no empty-half glyphs |
| L2 detail | s ≥ 0.62 (phone focus, zoomed desktop, ≥1920 fit) | full name, 18.5 u (zh 19.5 u) | 35 u / 27 u | empty-half glyphs, cost tags, "+N placed" badge |

At 1440×900 world fit, s ≈ 0.455: names render at ≈ 10.7 px and numerals at ≈ 13.6 px. At phone focus, s ≈ 0.63–0.7:
boxes are ≈ 70×46 px with a hit area ≥ 48 px. Short names: EN ≤ ~11 condensed chars ("W. Germany", "Czechoslov.",
"Laos/Camb.", "SE African St."); ZH ≤ 4 glyphs (比荷卢, 捷克, 西葡, 撒哈拉, 东南非, 多米尼加, 老挝柬埔寨, 沙特, 印尼).
Anything longer is squeezed with `textLength` down to 80%. The tables are in `build-data.mjs`; the i18n workstream
should own them as `map:short.<id>`.

### 3.3 Box states

| state | trigger | rendering |
|---|---|---|
| default | — | as above |
| **legal target** | `prompt.countries` includes the id | 10 u white halo + 3.5 u ink ring around the box; box at full colour; drawn above non-targets |
| **non-target** | a map prompt is open and the id is not a target | opacity .34, `saturate(.25)`. Still long-pressable for info, never actionable |
| hover / keyboard focus | pointer over a target, or focus | ring becomes 6 u `--act-600`, dashed 14/7 and marching (static under reduced motion); tooltip after 250 ms (desktop) |
| **selected** (confirm flows) | first tap on a coup/realign/irreversible target | 7 u solid amber ring + 13 u ink halo; reticle badge above the box; panel shows the confirm card |
| cost exception | influence prompt, the placement costs 2 Ops | amber tag "2 OPS" / "2 点" on the bottom-left corner. Only the exception is labelled; cost 1 is the default |
| odds | coup/realign prompt | dark tag with "50%" on the bottom-right corner (from `coupOdds`; computed lazily for visible targets on desktop, for the selected one on phones) |
| placed this prompt | this decision run placed N here | amber "+N" badge on the US/USSR token corner |
| per-country cap | event placement with `maxPerCountry` | tag "1/2"; at the cap the target ring disappears (the engine mask drops it) |
| just changed | `influence`/`control` events | side-coloured ring pulse (§11) |
| region closed | DEFCON or Chernobyl restriction | handled on the region chip, not per box |

### 3.4 Camera (pan, zoom, smart focus)

- Pointer events with one-finger pan, pinch, wheel zoom around the cursor, and double-tap zoom. **+ / − / fit buttons are
  always present**, because pinch is a multipoint gesture (WCAG 2.5.1). Zoom range: world fit × [1, 4]. Inertia off
  under reduced motion.
- **Smart focus** (on by default when compact, setting on desktop): when a map prompt opens, the camera eases (450 ms) to
  frame either (a) the targets if they lie within one region cluster, or (b) the region of the last action plus its
  targets. Otherwise it keeps the user's view and the **region jump bar** shows each region with its target count
  ("Middle East 6 · Europe 15 · Asia 13 …"). The camera never moves while the user is touching the map, nor within
  3 s of a manual pan or zoom.
- **Tap safety on touch**: at L1 or L0, a tap on a cluster where two or more targets fall within 48 px **zooms in first**
  instead of acting. A target with no other target within 48 px acts directly.
- The mini-map (phone, top-right of the map) shows the viewport rectangle; tapping it returns to world fit.

---

## 4. Hand and cards

### 4.1 The human hand

- **Desktop/tablet dock**: real card art (`public/cards/<lang>/NNN.webp`, 5:7). The in-play card sits first with an
  amber tag "In play · 3 Ops". Tags hang from the top edge:
  `SCORING` (white), `USSR EVENT` / `US EVENT` (opponent's card, side colour + glyph), `MUST PLAY` (amber, when
  `scoring-stranded` applies), `AI KNOWS` (eye icon, when the AI has seen the card).
- **States**: *active* (the prompt asks for a card: full colour, lifts 8 px on hover/focus); *passive* (the prompt is about
  something else: 78% brightness, 60% saturation, no lift; hovering restores colour for reading); *locked* (offered as an
  action-card answer but not legal: greyscale 55% + lock; tooltip "Can't be played now"); *selected* (amber 3 px outline,
  lifted 14 px).
- **Phone**: the collapsed **hand bar** (stacked thumbnails, label, expand chevron) is always visible. Expanded, the hand
  is a horizontal carousel of cards 46% of screen width, snapping, with tags as above. **Tapping a card opens the card sheet**
  (`phone-card.png`): the art, the title and text in the UI language (selectable HTML, so screen readers and
  translation tools can read it), ops / side / era chips, warnings, and the answer options of the current prompt.
- **Card zoom anywhere**: card references in the log, region chips, opponent strip and effects all open the same preview
  (desktop: hover after 250 ms, click to pin; touch: tap → sheet). Esc or swipe-down closes it.

### 4.2 The China Card

- Held by the human: its own slot left of the hand. **Face up**: the real image #6 with a note "+1 Ops if all in Asia".
  **Face down**: our designed back with "The China Card · face down · playable next turn" and a lock. The flip is
  animated (§11).
- Held by the AI: a mini card in the opponent strip, face up or face down, with a label on desktop.

### 4.3 The AI hand

- The opponent strip shows `aiHandCount` **card backs** (our back: blue/red diagonal split with a white seam and globe
  rings). `aiKnownCards` are shown **face up** to the right of the backs with an amber outline and the label
  "Known: Southeast Asia Scoring" (desktop). Tapping any known card opens its preview.
- After `hand-revealed` or a reshuffle reveal, the strip briefly fans the known cards open (§11). The unknown/known
  split then stays visible.
- While the AI's first headline is face down (`aiHeadlineHidden`), a face-down card sits on the opponent avatar with
  the label "Headline chosen".

---

## 5. The Action panel: shared anatomy

Every prompt renders into the same frame (`desktop-influence.png`, right; `phone-influence.png`, bottom):

1. **Recap line** — the AI's last completed play in one line ("☭ USSR played *Vietnam Revolts* · Event · Vietnam +2").
   It comes from the last `LogEntry` with `side === ai` and `kind` in `play|headline|event`. Tapping it opens the log.
   It disappears once the human acts.
2. **Who-line** — a "★ YOUR MOVE" badge in the human's side colour, then a **breadcrumb** of the current play:
   `AR 3 › Shuttle Diplomacy › Influence`. Each crumb is a step of the play. While `canUndo`, tapping an earlier crumb
   undoes back to it.
3. **Title** — `prompt.title` rendered by i18n, verb first. **Counter** on the right: `remaining` large with
   "of `opsValue` Ops left" for influence/realign, "N left" for event placements, hidden otherwise.
4. **Ops bar** — one segment per Op of `opsValue`: used (side colour) vs left (amber).
5. **Hint** — one sentence with the key interaction and the one exception to know (`prompt.detail` if present).
6. **Progress chips** — placements made in this run ("Iran +1").
7. **Warnings** — §5.2.
8. **Actions row** — secondary on the left (Undo, Back, Target list), primary on the right (thumb). The `done` option
   renders as a labelled button (§5.1). Every button is ≥ 44 px tall; the primary confirm is 54 px.

When it is not the human's turn, the panel turns into a **status card** ("USSR's move · AR 4 — USSR is playing…",
[⏩ Skip to my turn], [Speed]). On phones it shrinks to one line plus Skip (`phone-ai.png`).

### 5.1 `done` labels (`prompt.doneMeaning` × context)

| doneMeaning | default label | context-specific labels |
|---|---|---|
| `pass` | "Pass — play no card" | AR8: "Skip action round 8"; China-only hand: "Pass (keep the China Card)"; Eagle/Bear (250): "Keep my hand" |
| `stop` | "Stop here" | realign: "Stop realigning"; event placements with early stop: "Done placing (N unused)" |
| `decline` | "Decline" | CMC payoff (40): "Keep the crisis — play on"; Junta/TDTW/Ortega/Che free op: "Skip the free coup"; Blockade (10): "Discard nothing — lose all US influence in W. Germany (N)"; LADC (95): "Discard nothing — the USSR doubles influence in 2 countries" |
| `return` | "Return" | Our Man in Tehran: "Done — return the rest to the deck"; Grain Sales (67): "Return it — take 2 Ops instead" |
| `skip` | "Skip" | SALT: "Take no card" |

Context comes from `prompt.resolvingCard`. The copy lives in the `prompt` i18n namespace (`prompt:done.<meaning>[.<card>]`).

### 5.2 Warnings (`PromptOption.warnings`)

| code | where | style |
|---|---|---|
| `opponent-event` | on the option (and once as a banner in the card sheet: "USSR card. After Influence, Coup or Realign, *U-2 Incident* fires for the USSR") | amber line with ⚠ |
| `scoring-stranded` | on the option, plus a `MUST PLAY` tag on scoring cards in the hand and a dot on ☰ | amber banner: "You hold 2 scoring cards and have 2 rounds left — holding one at turn end loses the game" |
| `defcon-suicide`, `cmc-suicide`, `game-ending` | on the option | **hazard-striped** button; label "This ends the game — you lose" or "… — `{winner}` wins"; needs a **1.2 s press-and-hold** with a progress fill; keyboard: hold Enter |

---

## 6. UX for every PromptKind

Legend: **1-tap** = acts immediately (undoable). **Confirm** = first tap selects, second tap on the same spot commits.
**Hold** = press-and-hold (game-ending).

| PromptKind | Where it shows | How to answer | Commit | Notes and special cases |
|---|---|---|---|---|
| `setup-place` | Panel + map; camera frames Europe; the WE or EE zone gets a hatched outline | Tap targets, +1 each; counter "6 left / 7 left" | 1-tap per point; undo per point | Title "Set up: place 6 influence in Eastern Europe". After the last point, a 600 ms "Setup complete" before the AI moves; undo is still offered while `canUndo` |
| `bid-place` | Same | Tap countries that already hold US influence (they are the only targets) | 1-tap | Title "Tournament bid: place 2 more US influence" + detail "only where you already have influence". **Never** says "Western Europe" (DS bug, ui-flow §3.5.3) |
| `headline` | Hand expands (desktop: dock active; phone: hand sheet); panel title "Choose your headline" | Tap card → card sheet with **[Headline this card]** | **Confirm** (commits a secret) | Card sheet shows effective ops and warnings. If the AI's headline is already visible (Man in Earth Orbit), show it face up on the opponent strip with "Revealed". Scoring cards show "Scoring now: US +3" from `regionScores` |
| `action-card` | Hand active; panel "Action round 3: play a card" + "4 cards · 5 rounds left incl. this one" | Tap card → card sheet (desktop: the sheet docks into the rail, `desktop-card.png`) | Normal card: 1-tap "Play this card" (undoable; the mode comes next). **Scoring card: Confirm** ("Score Africa now · Even (0)"). **Trap escape** (Quagmire/Bear Trap): Confirm "Discard to escape — roll 1–4" | The China Card is in its slot with effective Ops (`effectiveOps(6)`). `done`=pass appears only when legal. Forced Missile Envy (only card 49 legal) explains itself: "Missile Envy must be played this round". Locked cards: lock + tooltip |
| `play-mode` | Same card sheet, now listing the modes | Big option rows: icon, label with **effective Ops** (`opsValue`/`effectiveOps`), one-line consequence | Influence/Coup/Realign: 1-tap (they lead to another prompt). **Event** and **Space Race**: Confirm (inline: the row turns into "Roll for space · 1–4 (67%) — tap again") | Opponent card: one banner says the event will fire, and each row ends "· then USSR event". Event-first row: "USSR +1 VP now, then you spend 3 Ops". Grain Sales drawn card: the options are the drawn card's modes, plus **"Play UN Intervention on it"** (`un-intervention` option), plus `done=return` |
| `op-mode` | Panel | Rows Influence / Coup / Realign with "`opsValue` Ops from *ABM Treaty*" (`pendingCard` names the source) | 1-tap | `done=decline` as "Skip the free coup" (Junta, Tear Down This Wall). Region limits appear in the subtitle ("Europe only") from `prompt.detail` |
| `influence` | Panel + map (`desktop-influence.png`, `phone-influence.png`) | Tap targets; each tap = one point | 1-tap per point | Flow in §6.1 |
| `coup-target` | Panel + map with odds tags | Tap target → **selected**; the panel becomes the odds card (`desktop-coup.png`): six die faces coloured success/fail with net results, "3 Ops + die vs 2 × stability 3 = 6", **50%**, DEFCON and mil-ops effects, warnings | **Confirm**: [Roll for Iraq] or tap Iraq again; Back = pick another | Suicide (`defcon-suicide`, `cmc-suicide`) → hazard + Hold. The CMC payment POINT_NODE before a US coup gets its own title: "Cuban Missile Crisis: remove 2 influence from W. Germany or Turkey first" |
| `realign-target` | Panel + map; counter "3 rolls left" | Tap target → selected; panel shows both sides' modifiers (adjacent controlled, more influence, superpower adjacency) once the contract provides them (§15), else just the country | **Confirm** per roll; after the roll the selection stays, so "Again in Iran" is one tap | `done=stop`: "Stop realigning (2 unused)". Each roll animates (§11) before the next prompt |
| `event-target` | Panel + map; title from `prompt.title` ("Decolonization: add 1 USSR influence in 4 countries in Africa or SE Asia") | Tap targets; the counter shows `remaining`; tags show "1/`maxPerCountry`" | 1-tap per point **unless the option is irreversible** (war cards, free coups, Che, Brush War) → Confirm | Add vs remove shown with a "+" or "−" glyph on the tag (needs `effect` from the contract, §15). CMC payoff (resolvingCard 40): title "End the Cuban Missile Crisis? Remove 2 influence from Cuba", `done` "Keep the crisis — play on". Forced targets the controller auto-plays are animated, not asked |
| `event-card` | Panel + a **card picker sheet** (grid of real card images with a location tag: "Discard pile", "Drawn", "US hand") | Tap card → selected (outline) → primary "Discard *Duck and Cover*" / "Take *…*" / "Give *…*" | **Confirm** (sheet lists are easy to mis-tap) | Blockade, LADC, Missile Envy giver, Aldrich Ames, SALT, Star Wars, Our Man in Tehran (repeat; counter "discarded 1"), Ask Not (repeat; counter), Eagle/Bear (250, `done` "Keep my hand"), UN Intervention (pick the opponent card to neutralise) |
| `branch` | Panel with 2 big option cards | Each card: title + consequence ("Participate: both roll, sponsor +2, winner 2 VP" / "Boycott: DEFCON −1, sponsor plays 4 Ops") | **Confirm**; Wargames "End the game" = **Hold** (game-ending warning) | Warsaw Pact (16), Olympic Games (20, asked of the opponent of the sponsor: title "The USSR invites you to the Olympic Games"), Wargames (100) |
| `defcon-level` | Panel with a 5-cell DEFCON dial (current marked "now") | Tap a legal level; illegal levels greyed | **Confirm**; level 1 = Hold ("You lose") | Summit (45) shows "You won the Summit roll"; How I Learned (46). Labels: "Lower to 2 / Keep 3 / Raise to 4" |
| `region` | Panel with 6 region buttons (colour swatch, name, the USSR's current influence total there) + the map highlights the hovered region | Tap a region | **Confirm** | Chernobyl (94): "The USSR may not place influence with Ops in this region for the rest of the turn". After commit, the region chip shows a hatched "Chernobyl" band until the turn ends |

### 6.1 The influence-placement flow (step by step)

1. The `influence` prompt opens (after mode = Influence). On phones the camera smart-focuses (§3.4) and the region jump
   bar shows target counts per region. The panel shows **"Place influence — 3 of 3 Ops left"**, the ops bar, and the hint
   "Tap a highlighted country (+1 each). **2 OPS** costs 2."
2. Targets have halos; the 2-cost exceptions carry the amber "2 OPS" tag; non-targets dim.
3. **Tap = place.** The UI calls `choose(promptId, idx)` at once and shows the result optimistically within 100 ms: the
   token numeral ticks up, a "+1" floats off, the counter drops (3→2) and an ops-bar segment turns used, and a chip
   "Iran +1" appears (repeat taps merge: "Iran +2"). The engine's next prompt replaces the optimistic state. If its
   `promptId` does not follow, the UI rolls back the optimistic display.
4. A control change animates (token flip + frame wipe, §11) and is announced ("US now controls Iran").
5. **New targets** (adjacency grows) fade their halos in over 200 ms, so the eye catches the new options. Targets that
   became illegal (for example a 2-cost country with 1 Op left) lose their halo.
6. **Undo** (button, Z, Ctrl/Cmd+Z, or tapping a chip's ×) steps back one placement while `canUndo`. If the controller
   only supports undo-to-start-of-play, the button reads "Restart placement" (§15).
7. When `remaining` reaches 0 the prompt ends by itself. The panel shows "Play complete ✓" for 600 ms, and **Undo stays
   available** as long as `canUndo` (the controller cancels a running AI search on undo). Then any opponent event that the
   play triggers animates, then the AI turn.
8. **Accessible alternative**: [List] opens the target list sheet: rows grouped by region, 52 px tall, each with name,
   stability, battleground, both influences, cost, and a "+1" button. It drives the same `choose()`. Screen readers use
   this list.

---

## 7. AI turn presentation

| phase | what the human sees | timing (Normal speed) |
|---|---|---|
| Thinking | Opponent strip: the dot pulses amber, "Thinking…". After 4 s an elapsed counter appears ("Thinking · 6 s"). The panel shows the status card with [Skip to my turn]. The board stays fully explorable: hover, zoom, log, card previews | shown 300 ms after `aiThinking` turns true (no flicker on fast moves) |
| Card reveal (`card-played`, AI side) | **Desktop**: the card flies from the opponent strip to the map stage **on the side away from its target** (`desktop-ai.png`), flips face up, and a ribbon appears under it: "⌖ COUP · 3 OPS → IRAN" / "⚡ EVENT" / "🚀 SPACE RACE" / "＋ INFLUENCE · 4 OPS". **Phone**: the same reveal at 200 px, then it shrinks into a **play banner** at the top of the map (`phone-ai.png`), so the map stays visible while the effects play | fly 420 ms, flip 280 ms, ribbon 200 ms, hold 1 200 ms (tap to continue now) |
| Effects | Camera eases to the target if it is off screen (phone). Influence ticks, control flips, the die bubble appears next to the country with the equation "5 + 3 = 8 vs 4 → +4" and the result line | §11 |
| Wrap-up | The banner and card shrink into the log's newest entry. The recap line appears in the panel. If the next decision is the human's, the panel animates into the prompt (title slides up 220 ms) | 350 ms |

Pacing rules:
- AI micro-steps of one play (each influence point, each realign roll) play back-to-back with 120–250 ms gaps. The whole
  AI play reads as one sequence, not a stutter of separate moves.
- The controller's constant minimum AI delay (critique §3.9) is fine with this: "Thinking" covers it.
- `frame.auto` (forced moves) plays at ×0.6 duration with no holds.
- If `vm.queued > 2`, everything runs at ×0.6. If `> 6`, at ×0.3 with holds skipped (catch-up after resume).
- **Skip**: tap or click the stage, or press Space, to finish the current frame instantly (jump to its end state,
  `ackFrame`). "Skip to my turn" (⏩, or Shift+Space) plays every frame at Instant speed until a prompt or a must-see
  reveal (scoring, game over) arrives.

---

## 8. Tracks

| track | desktop top bar | compact (pills / tracks sheet) |
|---|---|---|
| **DEFCON** | 5 cells 5→1 in the DEFCON colours, numerals always shown; the current cell scales 1.12 with a ring. Tooltip: restrictions ("No coups or realignments in Europe, Asia") | Pill: square in the DEFCON colour + "no coups EU·AS". Sheet: full dial + restriction text |
| **VP** | Bar −20…+20, **US on the left** (consistent with "US = left" everywhere); a marker with the signed value in the leader's colour and glyph; ticks at ±10, 0 | Pill "★ +3" (side glyph + colour of the leader; "Even 0" when tied) |
| **Turn** | 1–10 cells banded Early (1–3) / Mid (4–7) / Late (8–10); past cells dimmed, current inverted; label "4/10 · Mid War" | Pill "Turn·AR 4 · 3/7" |
| **Action round** | 7 (or 8) cells, each split: top half USSR (moves first), bottom half US; done halves filled in side colours; the current half pulses amber; label "3/7" (8 when someone has AR8) | in the same pill |
| **Military ops** | Two rows of 5 pips (US above, USSR below; US pips rounded, USSR pips chamfered), "need N" = DEFCON; a shortfall shows ▼N in amber ("would give the opponent N VP at turn end") | tracks sheet + amber dot on ☰ |
| **Space race** | Two rows 0–8; label shows the human's next requirement "next: 2 Ops · 1–4" | tracks sheet |
| **Effects** | Not a track: the "In effect" list on the right of the dock: chip = side glyph + name + "permanent / this turn"; turn-limited chips have an amber outline | tracks sheet |
| **Decks** | Deck / Discard / Removed counters as buttons; Discard and Removed open card grids | tracks sheet |

Every track change animates (§11), and the leader's colour never stands alone: there is always a glyph or a text label.

---

## 9. Log panel

- Desktop: the middle of the rail. Compact: a sheet (☰ → Log, or tap the recap). **Newest at the bottom** (chat order,
  next to the panel). Auto-scrolls unless the user has scrolled up, in which case a "Jump to latest ↓" pill appears.
- **Grouped by play** (`LogEntry`): side glyph tile, eyebrow "USSR · AR 2" (`turn`/`ar`/`side`), main line "*Muslim
  Revolution* · Event", detail chips: influence ("Iran −1" with the side stripe on the correct edge: left = US,
  right = USSR), VP ("VP +1 → US +3"), dice ("⚅ 4+2 = 6 vs 2 → +4"), DEFCON, effects. Turn separators: "Turn 4 · Mid War ·
  DEFCON 3 → 4".
- The **current human play** is the last entry, highlighted with an amber edge and "· now". It updates live.
- Card names are links (preview). Country names highlight the box on the map on hover/focus (pulse ring) and pan to it on
  tap.
- Filter: **Plays** (default: one line per play) / **All** (every decision and roll).
- Language switch re-renders the same `Message`s (no rebuild).
- `aria-live="polite"`: each AI play is announced once as one sentence built from its log entry.

---

## 10. Big moments

### 10.1 Headline reveal (`desktop-headline.png`)
`headline-chosen` (AI) puts a face-down card on the opponent avatar. On `headline-reveal` both cards fly to the stage,
**US left, USSR right**, and flip together. Order badges appear under the cards ("1st" amber, "2nd" ink) with an arrow
pointing from the first. The caption plate reads "Headlines revealed — USSR resolves first" with the reason ("Brezhnev
Doctrine (3 Ops) beats John Paul II (2 Ops). Ties go to the US."). It **waits for a tap** (Continue / Space) unless
"Pause on reveals" is off. Then the first card moves to the play banner and its effects play, then the second.
Defectors cancelling a headline: the cancelled card greys out with a "Cancelled by Defectors" ribbon.

### 10.2 Scoring popup (`desktop-scoring-zh.png`)
Desktop: a modal docked **left**, so the scored region stays visible. The region spotlights: its boxes get target
halos and everything else dims. Phone: a bottom sheet over the panel. Content: the scoring card mini, the title "Middle
East scored", the card's thresholds line, a table with US and USSR columns: standing (+VP), countries controlled,
battlegrounds (+N), adjacent to the enemy superpower (+N), total. Then a **net bar** in the gainer's colour ("USSR gains
7 VP · VP track US +3 → USSR +4") and [Continue]. Data: `regionScores` of the frame before the `scoring` event, and the
`scoring` event's `vp`. Rows count up 120 ms apart. Final scoring (end of turn 10) chains all regions in one sheet with
a per-region subtotal and the final sum. Europe Control win: the net bar reads "US controls Europe — game over".

### 10.3 Game over (`desktop-over.png`)
A full-screen scrim with a result card that rises in. The hero band is in the winner's colour and glyph (a draw uses a
split band): **VICTORY / DEFEAT / DRAW**, then **one sentence explaining why** (table below), then stats: final VP
(`vpBefore` when it differs from `vpFinal`), turns played, DEFCON. Buttons: [View final board] (closes the card: board,
log and hand stay browsable, and a "Game over · New game" bar replaces the panel) and [New game].

| `Ending.reason` | sentence (winner perspective handled by i18n) |
|---|---|
| `vp20` | "{winner} reached 20 VP on Turn {turn}." |
| `europe-control` | "{winner} controlled Europe when it was scored." |
| `defcon` | "DEFCON reached 1 on {loser}'s action — nuclear war. {loser} loses." |
| `cmc-suicide` | "{loser} attempted a coup during the Cuban Missile Crisis — nuclear war." |
| `held-scoring` | "{loser} held *{card}* at the end of Turn {turn}. Holding a scoring card past the end of a turn loses the game (tournament rule)." |
| `held-scoring-both` | "Both sides held a scoring card at the end of Turn {turn}: the game is drawn." |
| `milops-vp20` | "The military-operations penalty at the end of Turn {turn} pushed VP to {±20}." |
| `final-scoring` | "Final scoring after Turn 10: {winner} wins with {vp}." / draw: "Final scoring after Turn 10 ends level." |
| `wargames` | "{player} played *Wargames*: the opponent took 6 VP and the game ended." |
| `resign` | "{loser} resigned on Turn {turn}." |

---

## 11. Animation catalogue

Durations are at **Normal** speed (×1). The user speed multiplier `--speed` is Relaxed 1.4 / Normal 1 / Fast 0.55 /
Instant 0. Easing tokens: `out` = cubic-bezier(.2,.8,.2,1), `inout` = (.65,0,.35,1), `spring` = (.34,1.56,.64,1).
"Hold" = time the result stays readable before the next event; holds marked ⏸ wait for a tap when "Pause on reveals"
is on. **Every animation is skippable** (tap stage / Space jumps to the end state). Implementation: one `Timeline` per
`Frame`: an ordered list of steps, each a set of Web Animations started together, awaited with `Promise.all(a.finished)`,
then `ackFrame(seq)`.

| GameEvent `t` | animation | duration · easing | layer | hold | reduced motion |
|---|---|---|---|---|---|
| `turn-start` | Full-width banner sweeps across the map: "Turn 5 · Mid War" (+ "Mid War cards added" on turns 4/8); turn cell advances | 300 in · 500 hold · 300 out · out/inout | stage | — | banner fades 150 ms, no sweep |
| `phase` | Phase pill cross-fades (Setup → Headline → Action rounds); in HEADLINE the hand becomes active | 220 · out | chrome | — | instant |
| `action-round` | AR half-cell fills in the side colour; the current half starts pulsing; status text "USSR's action round 4" | 300 · out | chrome | — | no pulse |
| `deal` | Cards fly deck → hand, 70 ms stagger; human cards flip face up on landing (200 ms); AI cards land as backs in the strip; >4 cards: batch the rest in one move | 260 each · out | flight | — | cards appear with a 150 ms fade |
| `reshuffle` | Discard pile riffles into the deck (3 card ghosts); toast "Deck reshuffled — cards still in hands are now known to both players" | 700 · inout | flight + toast | toast 3 s | toast only |
| `hand-revealed` | (AI side) the strip's backs flip to faces in a fan, stagger 60 ms, then settle as "known"; (human side) the human's cards get the "AI knows" eye tag with a blink | 450 + 60·n · spring | chrome | 1 500 ⏸ | swap without flip |
| `card-played` | AI: §7 reveal (fly, flip, ribbon). Human: card glides from hand to the in-play slot. `how` sets the ribbon (Event / Space / Influence / Coup / Realign / Headline / Scoring / Discard / Give / Pass) | AI 420 + 280 + 200 · out; human 300 · out | flight → stage | AI 1 200 ⏸ | AI card fades in already face up; same hold |
| `card-moved` | Card ghost flies from→to (discard, removed, ongoing → effect chip, hand ↔ hand for Missile Envy/Grain Sales); several moves stagger 60 ms; unknown AI cards fly as backs | 380 · out | flight | — | counters update with a 150 ms fade |
| `headline-chosen` | A face-down card slides onto the side's avatar/slot | 350 · out | flight | — | fade |
| `headline-reveal` | §10.1: both fly to the stage, flip together, order badges pop | 400 fly · 400 flip · 250 badges (spring) | stage | 1 600 ⏸ (default waits) | appear face up, badges fade |
| `influence` | Numeral counts (to−from) in 90 ms ticks; ring pulse in the actor's colour (scale 1→1.35, fade); "+N/−N" floats up 24 px; several countries in one frame stagger 90 ms. Phone: camera eases to the country if it is off screen | ring 450 · out; float 600 · out | map FX | — | numeral swaps, static ring 400 ms |
| `control` | The controlling token flips (scaleX 1→0→1) to its solid state; the box frame wipes in the new colour; lost control: reverse; announced to screen readers | 300 + 250 · inout | map FX | — | cross-fade 150 ms |
| `roll` | A die tumbles next to the country (rotating, faces cycling every 80 ms) and lands with a spring on `roll1`; the equation bubble appears ("5 + 3 = 8 vs 4 → +4"); realignment and Summit show two dice (US left, USSR right); success border in the roller's colour, failure grey "no effect" | 650 tumble · 200 land (spring) · 250 bubble | map overlay | 900 (coup/war/space), 600 (realign) | die shows its face at once; same hold |
| `vp` | The VP marker slides to the new value; delta label floats ("−7"); the phone pill pulses once | 500 · inout; float 700 | chrome | — | jump + fade |
| `defcon` | The DEFCON marker moves cell to cell; dropping to 2: one amber vignette pulse on the map edge; to 1: the board darkens before game over | 450 · inout; vignette 800 | chrome + stage | — | colour swap, no vignette |
| `milops` | Pips fill or empty one by one; a shortfall ▼N fades in or out | 200 each, 60 stagger · out | chrome | — | swap |
| `space` | The marker hops to the next box along an arc; a failed attempt shakes the marker ±4 px three times | 450 · spring; shake 300 | chrome | — | swap |
| `scoring` | §10.2: region spotlight, modal in, rows count up, net bar | 300 in · 120/row · 300 bar | stage | ⏸ waits (Continue) | no count-up |
| `effect-on` | The chip drops into "In effect" (scale .8→1, spring); if a card goes to ONGOING, its ghost flies into the chip; region chips update (e.g. Chernobyl hatch) | 300 · spring | chrome | — | fade |
| `effect-off` | The chip shrinks and collapses its row | 250 · in | chrome | — | fade |
| `china-card` | The China Card flies between holders, then flips face down (`playable=false`) or face up; toast "The China Card passes to the US — face down until next turn" | 550 · inout + flip 300 | flight | toast 2.5 s | swap + toast |
| `game-over` | The board dims; the result card rises (translateY 24→0, scale .96→1) | 500 dim · 450 rise (spring) | top | until dismissed | fade |

**Layering (z-order)**: 0 paper and land · 1 connections · 2 country boxes · 3 map FX (halos, pulses, tags, reticles)
· 4 map overlays (die bubbles, tooltips, play banner) · 5 chrome (bars, rail, dock) · 6 flight layer (cards and pieces
crossing between chrome and map, positioned with `getBoundingClientRect`) · 7 stage (reveals, headline, scoring) ·
8 sheets and modals · 9 toasts · 10 game over.

**Ordering inside a frame**: card-played → (roll) → influence/control (parallel per country) → vp/defcon/milops/space →
card-moved → effects → china-card. Events marked ⏸ end their step. The next frame starts only after `ackFrame`.

---

## 12. Reduced motion

Driven by `prefers-reduced-motion` with a Settings override (System / Reduce / Full):
- No translation, flip, tumble, camera easing, vignette or marching dashes. Cross-fades of 120–150 ms only.
- **Holds stay.** They exist so the human can read what happened. Reduced motion is not the same as less information.
  "Pause on reveals" stays available.
- Dice show their final face immediately, with the equation bubble.
- The thinking indicator is a static "Thinking…" with a non-animated progress dot.
- Smart focus jumps (cut) instead of easing.

---

## 13. Accessibility

- **Side identity without colour** (WCAG 1.4.1): position (US left/top, USSR right/bottom in boxes, tracks, VP bar, the
  headline layout and the AR cells' halves), token shape (rounded square vs chamfered octagon, the same in mil-ops
  pips), glyphs (★ / hammer & sickle in every badge, chip and log tile) and text ("US", "USSR"). In greyscale,
  controlled tokens differ by shape and the frame by luminance (us-700 L=0.08 vs ussr-600 L=0.15). Setting "High-contrast
  markers" adds a diagonal hatch to USSR fills.
- **Contrast** (measured): white on `--us-700` 7.98, white on `--ussr-600` 5.20, `--ink-100` on `--ink-900` 15.3,
  `--ink-300` on `--ink-900` 7.8 (secondary text), `--ink-400` 4.8 (tertiary, ≥ 12 px only), `--act-ink` on `--act-500`
  10.1, ink on the region colours ≥ 6.3, white on the battleground indigo 10.7. DEFCON numerals use per-level ink tokens
  (all ≥ 4.6:1).
- **Touch targets** ≥ 44×44 px (WCAG 2.5.5 AAA). Country hit areas extend 10 map units around the box (≥ 48 px at
  L2). "Zoom before acting" applies at L1/L0 (§3.4). Primary confirm 54 px. Buttons sit ≥ 8 px apart.
- **Keyboard**: Tab cycles panel → map targets → hand → log. On the map, **arrow keys move between legal targets
  spatially** (nearest target in that direction), Enter acts (or selects, then Enter again confirms), Esc
  backs out of a selection or closes a sheet. Z / Ctrl+Z undo. 1–9 focus hand cards. Space continues/skips. Shift+Space
  skips to your turn. L opens the log, T the tracks, ? the shortcut sheet. Focus rings: 3 px amber + 2 px ink offset.
- **Screen readers**: the map is `role="application"` with an off-screen **target list** (`role="listbox"`) that mirrors
  the prompt: "Iran, Middle East, battleground, stability 2, US 1, USSR 0, costs 1". The panel title is an `h2` that
  takes focus when a new prompt appears (announced). The log is `aria-live="polite"` (one sentence per AI play). Game over
  and scoring are `role="dialog"` with focus trapped. Card images carry the title and full text as HTML (no
  information only in the image).
- **No hover-only information**: everything hover shows is reachable by focus (keyboard) and long-press (touch, 450 ms,
  with haptic `navigator.vibrate(10)` where available).
- **Text resize** to 200% reflows to the tablet or phone layout, with no clipped controls. Language changes set `<html
  lang>`.
- **Timing** (WCAG 2.2.1): no decision has a time limit. Reveal holds auto-advance, but "Pause on reveals" turns them
  into explicit Continue steps.

---

## 14. Language, settings, menus

### 14.1 Language switch
- A segmented control **EN | 中文** in the desktop top bar, on the start screen, and in the phone ☰ menu. It switches
  instantly, with no reload: i18n `changeLanguage`, `<html lang>`, the font stack (via `:lang`), card images
  (`/cards/en` ↔ `/cards/zh`), country names and short names, and the log (re-rendered from `Message`s). Stored in
  localStorage. First visit follows ARCHITECTURE: `?lang=` → stored → `navigator.languages` → en.
- Chinese terms follow the card art (ARCHITECTURE "Language"): DEFCON stays "DEFCON", 调整, 战争早期/中期/晚期, 行动点数,
  影响力, 战场国, 稳定度, 中国牌. Compact UI may use 点 for Ops ("2 点"). Card titles come from our `card_text.json`.
- Setting **Card images**: follow language (default) / always English / always Chinese (bilingual players often know
  one set of cards).

### 14.2 Settings sheet (⚙, desktop; ☰ → Settings, phone)
| setting | values (default) |
|---|---|
| Language | EN / 中文 (auto) |
| Card images | follow language / English / 中文 |
| Animation speed | Relaxed / **Normal** / Fast / Instant |
| Motion | **System** / Reduce / Full |
| Pause on reveals (headline, scoring, AI card) | off (headline and scoring always wait) |
| Confirm irreversible actions | **on** (desktop power users may turn it off; game-ending holds always stay) |
| Smart map focus | **on** for touch, off for mouse |
| Show coup odds on the map | **on** |
| Show "if scored" on region chips | **on** |
| High-contrast markers (hatch USSR fills) | off |
| Board brightness | normal / dim |
| — | Resign game (Hold), New game, Delete saved game, Credits & licences, Official rules (PDF ↗) |

### 14.3 Phone ☰ menu (sheet)
Tracks (full) · Log · Discard / Removed · Settings · EN|中文 · Rules PDF ↗ · Resign. Items are 52 px rows.

### 14.4 Start screen (`start-desktop.png`, `start-phone.png`)
- Header: brand mark, EN|中文, ⚙. Hero: "TWILIGHT STRUGGLE · vs. DeepStruggle AI" (zh subtitle 冷战热斗 · 人机对战) and one
  sentence on the rules set (standard + optional cards, +2 US bid, tournament rules).
- **Continue** card when a save exists: "Turn 4 · AR 3 · you are the US — VP US +3 · DEFCON 3 · saved 2 h ago". It is the
  primary action.
- **New game — choose your side**: three large buttons (≥ 78 px tall): *Play the USSR* (red, ☭, "Moves first; starts with
  the China Card"), *Play the US* (blue, ★, "Sets up 7 in Western Europe, then +2 bid"), *Random side* (split). One tap
  starts. With a save, the heading says "replaces the saved game" and the tap asks to confirm in place.
- **Opponent card**: "DeepStruggle AI — top of the leaderboard, always full strength, runs on your device, a few seconds
  per move". It includes the **load progress** from `vm.load` (`stage`, `fraction`): Rules engine ✓ · AI model 62% (3.6 /
  5.8 MB) · Verify · Start AI. A game can start before the AI has loaded. The first AI decision then shows "Getting the AI
  ready…" in the thinking indicator.
- Footer: the official rules (GMT living rules PDF ↗, never hosted), credits & licences, the unofficial-fan-project
  notice with the DeepStruggle MIT credit.
- Note: "New to the game? Read the official rules first — the site teaches the interface, not the rules."

### 14.5 First-game coach marks (optional, dismissible)
Three one-line coach marks on the first game only: (1) the panel: "This is where every question appears", (2) a
halo: "Highlighted countries are your options", (3) undo. They are stored as seen and never shown again.

---

## 15. Contract gaps (with fallbacks used by this design)

| # | gap | why the UI needs it | fallback |
|---|---|---|---|
| G1 | `PromptOption.irreversible?: boolean` (option consumes RNG or reveals hidden info; the controller can detect it by snapshot → step → compare `rng_state` / card locations → restore) | Decides 1-tap vs confirm (§0.3) without restating rules | Confirm for: coup-target, realign-target, play-mode EVENT/SPACE, scoring-card and trap selections in action-card, headline, event-card, branch, defcon-level, region, and event-target when `resolvingCard` ∈ war cards / free-coup cards |
| G2 | Influence cost per country option (`PromptOption.cost?: 1 \| 2`) | "2 OPS" tag without restating the control rule | Derive from `state.countries[*].controlled_by === opponent` (a small rule restatement; isolate it in one helper) |
| G3 | Event placement semantics: `Prompt.effect?: "add" \| "remove" \| "target"`, `Prompt.affects?: Side`, `placedThisRun: Record<country, number>` | "+"/"−" glyph on targets, "1/2" cap progress, chips | Show the controller's title only; count placements from this run's `influence` events |
| G4 | Legal play modes for a card before choosing it (`playModes(card): {mode, opsValue, warnings}[]` via snapshot) | A one-step card sheet (card → mode in one view) | Two steps: [Play this card] (1-tap, undoable) → the same sheet lists the modes from the `play-mode` prompt |
| G5 | `CoupOdds.faces[]` lacks `defconAfter`, `milOpsAfter`; no realign or space odds (`realignOdds(country)` via `ts_step_dice`, `spaceOdds()`) | The odds card's DEFCON/mil-ops lines; realign modifiers; "1–4 (67%)" on Space | Show only what `coupOdds` gives; omit realign modifiers; Space shows the box requirement from the space track data |
| G6 | `undo()` granularity is unspecified (one human decision vs back to the start of the play) | The label "Undo" vs "Restart placement"; breadcrumb jumps | Assume one decision per call while `canUndo`. If not, relabel |
| G7 | Undo while the AI is thinking: is `canUndo` true until the AI's first decision is applied, and does `undo()` cancel the search? | The post-play "Undo" grace (§6.1 step 7) for phone mis-taps | If not, show "Play complete" with no undo, and keep confirms on |
| G8 | No reason for illegal cards at an action-card prompt (cards not in `prompt.cards`) | The "Can't be played now — because …" tooltip | Generic "Can't be played now" |
| G9 | Effect metadata (flag → card id, side, duration) is not in the contract | "In effect" chips with glyph and "permanent/this turn" | Port DS `EFFECT_INFO_MAP` into `src/data` (ui-flow §5.1) and key it by `effect-on.flag` |
| G10 | `card-played.how` for Ops plays arrives before the mode decision (`play-mode` is a separate step) | The AI reveal ribbon wants "COUP · 3 OPS → IRAN" in one go | The ribbon updates in place: the card shows first, then the mode, then the target, as their events arrive. Optionally the controller could batch an AI play's frames (card + mode + first target) so the reveal has all three |
| G11 | No per-event VP source (which card or scoring caused a `vp` event when several happen in one frame) | Floating labels "+2 Kitchen Debates" | Use the frame's log entry details |
| G12 | `Prompt.title` is the only instruction; the panel also needs a short title and a longer hint | Phone brevity | Use `title` as the title and `detail` as the hint; the i18n namespace `prompt` should provide `.short` variants |

None of these block implementation. Each has a working fallback above.

---

## 16. Implementation notes (React + SVG + CSS)

- **Components**: `GameScreen` (grid) → `TopBar | StatusBar`, `OpponentStrip`, `MapView` (SVG: `Land`, `Connections`,
  `RegionChips`, `CountryBox`×84 memoised by `(id, us, ussr, control, stateFlags, level)`, `FxLayer`), `HandDock |
  HandBar + HandSheet`, `Log`, `ActionPanel` (switch on `prompt.kind` into the 14 prompt components with a shared shell),
  `Stage` (reveal, headline, scoring), `Sheets` (card, target list, settings, menu, tracks, log), `Toasts`, `GameOver`.
- **State**: `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`. Local UI state lives in a small
  reducer: `selection` (country or card for confirm flows), `optimistic` (pending placements), `camera`, `sheet`,
  `speed`, `paused`. Clear the selection whenever `prompt.promptId` changes.
- **Animation**: `useFrameTimeline(frame)` builds the steps from `frame.events` (§11 ordering), runs Web Animations on
  refs (country `<g>`, track nodes, a portal flight layer), honours `speed`/reduced motion/skip, then calls
  `ackFrame(frame.seq)`. The component renders `frame.state` only **after** the timeline finishes, keeping the previous
  frame's state during animation, so numerals tick from old to new.
- **Map perf**: one static SVG layer (land, connections) cached; boxes re-render only on change; halos use CSS classes;
  the level (L0/L1/L2) is recomputed on zoom end (not every wheel tick). `will-change: transform` on the camera group
  only while it moves. No SVG filters in production (the mockup's metaball filter is placeholder-only).
- **Coordinates**: board units from `countries.json` `ref_x/ref_y` (2448×1584 reference), boxes 104×70; viewBox for world
  fit `40 56 2376 1384`. The map agent's SVG land should use the same unit space.
- **i18n**: new keys in `ui` and `prompt` namespaces (panel copy, done labels, warnings, tracks, settings, endings
  sentences, short names). Never concatenate translated fragments: use full-sentence keys with params.

---

## 17. What the mockup does and does not show

Shown: desktop influence prompt (EN and ZH) with tooltip, coup confirm with odds, card sheet with modes (desktop rail and
phone sheet), AI turn (desktop stage and phone banner with dice bubble), headline reveal, scoring popup (ZH), game over,
phone portrait (EN and ZH), phone landscape, tablet portrait, start screen (EN and ZH desktop, phone). Not drawn (specified
above): event-card picker grid, branch/DEFCON/region panels, the L0 overview, settings and menu sheets, the target list.
The mockup's legal targets and scoring numbers are hand-made to look plausible. The real ones come from the engine.
