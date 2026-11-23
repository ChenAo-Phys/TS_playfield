# Proposal: "Situation Room" — UI/UX design for the game and start screens

Author: design-situation-room · 2026-11-22 · Status: proposal (one of several design angles)

Mockup: `docs/design/mockup-situation-room.html` (static HTML/CSS/SVG, real card images, real country data).
Open it over http (fonts need it): `source scripts/pw-env.sh && node docs/design/mockup-situation-room-assets/shoot.mjs`
regenerates every screenshot in `docs/design/shots/situation-room-*.png`; scenes are `?scene=action|influence|playmode|coup|ai|headline|scoring|defcon|picker|over|start&lang=en|zh&view=desktop|phone`.

| Shot | What it shows |
|---|---|
| `situation-room-desktop-en.png` | **Hero.** 1440×900, Turn 5 AR 3, human = USSR, *place influence* prompt open (2 of 4 Ops left), hover preview on Iran (cost 2), grease-pencil marks on this play's placements, last AI play marked |
| `situation-room-desktop-zh.png` | 1440×900 Chinese, *play-mode* prompt: the chosen card staged, Event / Operations / Space, opponent-event warning |
| `situation-room-desktop-zh-influence.png` | the hero shot in Chinese |
| `situation-room-phone.png`, `-phone-zh.png` | 390×844 portrait, same influence prompt, theatre tabs, auto-framed Middle East |
| `situation-room-start.png`, `-start-zh.png` | start screen: side dossiers, coin toss, resume, model download line |
| `situation-room-action-zoom(.zh).png` | *action-card* prompt, card zoom with crisp errata text and play notes |
| `situation-room-coup.png` | *coup-target*: few targets → loud rings, coup-odds dice strip, reticle, staged confirm |
| `situation-room-ai-reveal.png` | the AI's card reveal dock + die tray at the target |
| `situation-room-headline.png` | headline reveal as two newspapers with resolution order |
| `situation-room-scoring.png` | Middle East scoring sheet docked away from the scored region |
| `situation-room-defcon-choice.png` | *defcon-level* (How I Learned…): lamp tiles, DEFCON 1 hazard + hold-to-confirm |
| `situation-room-card-picker.png` | *event-card* from the discard pile (SALT Negotiations) |
| `situation-room-game-over.png` | game-over telex, rubber stamp, VP-by-turn line |
| `situation-room-tablet.png` | 1024×768: rail collapsed to an icon strip, compact console |

---

## 1. Concept

**You are standing at the war table.** The map is a printed paper chart lit from above, the brightest object on screen
and the only one with colour. Everything around it is the dark room: a bakelite instrument console above, a dossier rail
on the right (the adversary, effects in play, a teleprinter), and the near edge of the table below, where your hand of
cards and your *orders slip* sit. The adversary plays from the far side; its cards are face-down files.

Principles, in priority order:

1. **The board is the hero.** It gets the largest area at every breakpoint; chrome is dark and recedes. Nothing
   permanent covers the map except the tray's soft fade over the empty South Atlantic.
2. **Clarity beats theatre.** Every flourish (paper, lamp light, stamps, newspapers) is skippable, reducible and never
   hides game state. A decision is always readable in one glance: *what* to do (slip), *where* (rings on the map or
   glow in the hand), *how much is left* (Ops chips).
3. **One place per job.** Your orders: the slip (bottom-left). Your cards: the tray. The adversary: the rail top. The
   record: the teleprinter. Global tracks: the console. A player learns the layout once.
4. **Fixed political axis.** US always on the left, USSR always on the right — in country boxes (as on the board), VP
   gauge, mil-ops rows, dice trays, scoring sheets. Combined with shape and glyph, side never depends on colour.
5. **Engine truth only.** The UI restates no rules: legality = prompt options, previews = controller previews.
   Rules text appears only as i18n copy.

---

## 2. Visual identity

### 2.1 Palette (CSS custom properties, `src/ui/theme/tokens.css`)

All values are in `docs/design/mockup-situation-room-assets/sr.css` §1 and should be copied verbatim.

| Group | Tokens | Use |
|---|---|---|
| Room | `--sr-room-950 #06080a` · `-900 #0b0f12` · `-850 #10151a` · `-800 #151c22` · `-700 #1d262d` · `-600 #29343c` · `-500 #3a4851` | chrome surfaces, from page background to raised controls |
| Steel | `--sr-steel-400 #808f99` · `-300 #98a6ae` · `-200 #c2ccd1` · `-100 #e3e8ea` | text on room surfaces (400 = labels, 100 = values) |
| Paper | `--sr-paper-50 #fbf7ec` · `-100 #f3ead3` · `-200 #e6d9b8` · `-300 #d2c096` | map boxes, slips, teletype tape, dialogs |
| Ink | `--sr-ink-900 #221e18` · `-700 #4a4236` · `-500 #7a6f5c` | text on paper |
| Sea | `--sr-sea-500 #8fa5a8` · `-600` · `-700` | map water + engraved line pattern |
| Land tints | `--sr-land-euw #d9d0e6` `-eue #c3b6d9` `-me #c4dfe6` `-asia #efcca6` `-sea #f1dc9b` `-china #ead2c2` `-af #efe0b0` `-ca #dfe4ad` `-sa #c4dcae` `-usa #c6cfdc` `-ussr #e6b5a8` `-na #e7e0cd` | land masses (board heritage, desaturated) |
| Region inks | `--sr-reg-euw #8f83b5` `-eue #6b5d97` `-me #4d93ab` `-asia #cd7737` `-sea #d6a12c` `-af #c19a3a` `-ca #8fa243` `-sa #578f5f` | country name bands, region plates |
| Battleground | `--sr-bg-band #3a2140` · `--sr-bg-stab #c8432b` | BG name band (heritage: dark strip, light text) and stability chip |
| US | `--sr-us-800 #10254a` `-700 #173262` `-600 #1f4382` `-500 #2f5ba6` `-300 #93acd8` `-100 #dde6f5` | **only** US things |
| USSR | `--sr-ussr-800 #5e120d` `-700 #7f1a13` `-600 #a8231a` `-500 #c9372b` `-300 #eaa096` `-100 #f7ddd7` · `--sr-ussr-gold #f3c84b` | **only** USSR things (gold = numerals on flipped markers, as on the physical counters) |
| Brass (interaction) | `--sr-brass-700 #876520` `-500 #d3a240` `-400 #e6bd5f` `-300 #f2d68f` | focus, legal targets, "your move", selected tabs — neutral between the sides |
| Signals | `--sr-alert-500 #ff6b3d` · `-700 #b8401c` · `--sr-ok-500 #6bb784` · `--sr-phosphor #a7e8b7` | warnings (always with the hazard-stripe texture), success on dice, console readouts |

Rules: side colours are never used for anything but sides. Danger is *orange + hazard stripes*, never plain red, so it
cannot be confused with the USSR. Brass is the only "click here" colour.
Validator (dataviz skill, `validate_palette.js`) on the side pair `#1f4382 / #a8231a`: CVD ΔE 17.2 (protan, worst),
normal-vision ΔE 27.1, both ≥ 3:1 on paper — distinct for colour-blind players even before the non-colour cues of §12.

### 2.2 Materials and light

| Material | Where | Recipe (cheap, static) |
|---|---|---|
| Paper | map, boxes, slip, tape, dialogs | flat paper token + one pre-rendered noise texture (≤ 30 KB WebP, multiply, 6–9 %) — not a live SVG filter |
| Bakelite | console, rail, buttons | vertical gradient room-800→850, 1 px top highlight `rgba(255,255,255,.05)`, 1 px brass hairline under the console |
| Walnut | table edge under the hand | 64 px band `#2a1d14→#1a120c` with faint grain stripes and a brass top line |
| Felt | China Card slot, dice tray | green radial gradient with inset shadow |
| Lamp light | over the map | one radial multiply overlay, centre clear, edges −30 %; never over the tray or rail |

Depth: country boxes cast a 1.6/2.4 unit shadow, markers have a top sheen and a 1 px dark edge (cardboard counters),
cards cast `--sr-shadow-card`. Nothing else has shadows.

### 2.3 Typography (no multi-MB webfonts)

Self-hosted Latin subsets only (SIL OFL, `unicode-range` limited to Latin-1 + punctuation; ≈140 KB total, cached):

| Role | Family | Weights | Size range | Notes |
|---|---|---|---|---|
| Display / stencil | Big Shoulders Stencil Display (variable) | 700–800 | 22–104 px | wordmark, DEFCON numeral, region names, banners. Cold-War stencil like the board's "U.S.S.R." |
| UI condensed | Barlow Condensed | 500/600/700 | 10–19 px | labels, buttons, map names, numbers. Uppercase + 0.04–0.2 em tracking in Latin |
| Typewriter | Courier Prime | 400/700 | 11–14 px | teleprinter log, slip sub-lines, telex |
| Body | system-ui stack | 400–700 | 12–15 px | tooltips, descriptions, card text |

CJK never downloads a font. Every stack ends with
`"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif`;
display headings in zh use the serif stack `"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif`
only at ≥ 19 px (card names, newspaper headlines), because thin Song at small sizes is unreadable on Windows.
Because the Latin `@font-face` rules carry a `unicode-range`, mixed strings ("DEFCON 3 · 苏联") render Latin in Barlow and
Han in the system font automatically.

`:root[lang="zh"]` overrides: no `text-transform`, tracking 0–0.08 em, +1 px on body sizes ≤ 13 px, line-height 1.5 in
prose, `font-weight: 700` for map names (CJK at 9–10 px needs weight). Numerals stay Barlow in both languages.

Minimum on-screen sizes at the 1440×900 fit zoom: map names 9.6 px Latin / 9.4 px CJK (15 / 14.6 SVG units ×0.64),
influence numerals 13.4 px, everything in chrome ≥ 10 px.

### 2.4 Iconography and glyphs

* Sides: **US = five-point star**, **USSR = hammer-and-sickle** (24-unit paths in `sr.js` `STAR`, `HS`). Used in seals,
  marker corners, log, tabs, VP gauge ends.
* Line icons (2 px stroke, 24 grid): event (newspaper), influence (plus in box), coup (crosshair), realign (opposed
  arrows), space (rocket), map, adversary (two cards), log (tape), status (bars), gear, menu.
* Stamps: rotated (−3…−9°) stencil words in a 1.5 px border — "YOUR MOVE", "REVEALED", "YOU WIN". Max one per view.

---

## 3. Layout

### 3.1 Desktop (reference 1440×900; applies ≥ 1200 px wide and ≥ 640 px tall)

```
┌──────────────────────────────── console 58 px ────────────────────────────────────────┐
│ WORDMARK │ TURN 1–10 / era │ AR pips (USSR|US halves) │ DEFCON lamps │ VP gauge │ MIL OPS │ SPACE │ EN|中文 ⚙ ☰ │
├────────────────────────────────────────────────────────────────┬──────────── rail 288 ─┤
│                                                                │ ADVERSARY dossier     │
│                       MAP (SVG, fit-to-width)                  │  seal · status · hand  │
│                                                                │ IN EFFECT chips        │
│                                                     [+][−][⤢]  │ DISPATCHES (teletype)  │
│                                                                │   … fills the rest …   │
├──────────── tray 162 px (overlays the empty map bottom) ──────┤                        │
│ ORDERS slip 330 │      HAND (fanned, fit)      │ CHINA slot │ piles │                  │
└────────────────────────────────────────────────────────────────┴────────────────────────┘
```

* Grid: `columns: minmax(0,1fr) 288px; rows: 58px minmax(0,1fr) 162px`. The map viewport spans rows 2–3 and is
  aligned to the top; the tray overlays its bottom with a fade (only ocean is there at fit zoom).
* The map is width-bound at every desktop size (viewBox 1775×1090 → ×0.64 at 1440). The rail can be collapsed with a
  `›` handle to a 60 px strip (+15 % map scale) — remembered per device.
* **≥ 1600 px:** rail 320 px, tray 176 px, hand cards 112×157.
* Centre-stage overlays (play-mode, headline, scoring, AI reveal) live inside the map viewport, never over the rail.

### 3.2 Tablet landscape / small laptop (700–1199 px wide)

As desktop, with: rail collapsed to a 60 px icon strip (Adversary with hand-count badge, In-effect with count, Dispatches
with unread dot) whose buttons open 300 px flyouts over the map's right edge; console hides wordmark subtitle, mil-ops
and space (moved to the Status flyout), the turn track becomes "5/10 · MID WAR", DEFCON loses its subtext, the language
toggle becomes one button showing the *other* language ("中" / "EN"). Tray 146 px, hand cards 86×120, slip 286 px
without the clipped card and hint, piles icon-only. See `situation-room-tablet.png`.

### 3.3 Tablet portrait (600–899 px wide, portrait)

Stacked: console (54) · theatre chips (34) · map (≈ 55 vh, pan/zoom) · slip (full width) · hand strip (horizontal
scroll, 92×129 cards) · bottom tab bar (Map / Adversary / Dispatches / Status, 52 px). Adversary, log and status open as
bottom sheets at 60 % height over the map; the slip and hand stay visible.

### 3.4 Phone portrait (< 600 px) — `situation-room-phone.png`

`rows: 50px 34px minmax(0,1fr) auto auto 52px` = console · theatres · map · slip · hand · tabs.

* Console: "TURN 5 · MID WAR / AR 3 · USSR (YOU)", DEFCON numeral, mini VP gauge with readout, ☰ (language, settings,
  rules, resign live there; language also reachable from the start screen).
* Theatre chips: EUROPE … S. AMERICA + ⤢ (world). The chip of a region containing legal targets gets a brass underline;
  the map auto-frames the bounding box of all legal targets when a prompt opens (if they span several regions, it
  frames them all at a minimum box width of 52 px on screen; tapping a chip pans there).
* A one-line teletype ticker over the map's top edge shows the last AI action (tap → log sheet), auto-hides after 6 s.
* Map: pinch-zoom 1–4×, one-finger pan, double-tap zoom. No hover: tap on a legal target **acts**, long-press
  (350 ms) opens the country inspect sheet (stability, influence, BG, adjacency, preview of the +1).
* Hand: horizontal scroll strip of 74×104 cards with captions, China Card last. Tap → card sheet (zoom + crisp text +
  the mode buttons when the prompt is `play-mode`).
* Touch targets ≥ 44×44 px: at the default phone framing a country box is ≈ 100×64 px.

### 3.5 Phone landscape (height < 500 px)

Console collapses to a 40 px strip; map takes the left ≈ 70 %; a 240 px right column holds the slip (top) and the hand as
compact rows (ops badge + name, 40 px each, tap = card sheet). Tabs move into the ☰ menu.

### 3.6 Z-layers (one scale, used by every component)

| z | Layer |
|---|---|
| 0 | map paper, land, links |
| 10 | country boxes |
| 12 | map annotations (pencil marks, last-play dots, reticles), region plates |
| 15 | tray (hand, slip, piles) |
| 20 | rail, map tooltip / inspect |
| 24 | dice trays, flying chips (VP, influence) |
| 25 | centre stage (play-mode, headline, scoring); 26 reveal dock |
| 30 | console; 40 card zoom; flying cards |
| 50 | toasts |
| 60 | modal dossiers (branch, defcon, picker, settings) |
| 90 | game-over |
| 100 | danger frame (DEFCON 2 pulse), never interactive |

---

## 4. The map

### 4.1 Geometry

* Own coordinate system: viewBox `0 0 1775 1090`, generated by
  `docs/design/mockup-situation-room-assets/build-board.mjs` from `docs/notes/countries.json`: board positions scaled
  ×0.75, Europe given 4–5 % air, then relaxed so 88×56 boxes keep ≥ 7 units apart (max shift 59 units ≈ ⅔ box).
  The board's relative layout is preserved; veterans find every country where they expect it.
* Placeholder land: Natural Earth 110 m warped with a thin-plate spline so each country's real location sits under its
  box (147 control points incl. anchors). It reads as a recognisable world map and could be a starting point for the
  map agent's redraw (same script, swap the line style).
* Superpower plates (112×48, dark side fill, glyph + "USA"/"USSR" stencil): USA west of Canada/Mexico/Cuba, USSR in
  Russia between Finland/Poland/Romania/Afghanistan/N. Korea. Big low-contrast map lettering "U.S.A." and "U.S.S.R."
  (side ink at 20 %) as on the board.

### 4.2 Map style

Sea `--sr-sea-500` with an engraved horizontal line pattern (12×7, 0.7 unit, 35 %). Land: region tints (§2.1) with a
0.7 unit ink coast line and two soft "water lines" (7 and 15 unit strokes at 22 % / 9 %) like an old chart.
USA/USSR tinted in their side's pale colour; China and non-TS land neutral. One paper-grain texture over everything.
Light: radial lamp over the map centre.

### 4.3 Country box anatomy (88 × 56 units ≈ 56 × 36 px at 1440 fit)

```
 ┌───────────────────────────────────┬────┐  ← name band, 19 u: region ink (BG: --sr-bg-band + 3 u region stub)
 │ W. GERMANY                        │ 4  │  ← name 15 u Barlow 600 caps (zh 14.6 u, 700), fitted with textLength
 ├─────────────────┬─────────────────┴────┤     stability chip 16×15 u: paper/ink, BG = --sr-bg-stab/paper
 │ ┌───┐           ┆           ┌───┐      │
 │ │★4 │  US slot  ┆ USSR slot │1☭ │      │  ← markers 31×30 u, centred in the 37 u body; dashed centre divider
 │ └───┘           ┆           └───┘      │
 └─────────────────┴──────────────────────┘  ← body: paper; controlled = side-100 tint + 2.6 u side border
```

* **Markers** (cardboard counters): US = square chip, USSR = chamfered chip (top-left and bottom-right corners cut).
  *Unflipped* (influence, no control): paper face, 1.7 u side-coloured edge, side-coloured numeral. *Flipped*
  (control): solid side face, numeral white (US) / gold (USSR) — exactly how the physical counters flip. Corner glyph
  ★ / ☭ at 36 %. 0 influence = empty slot.
* **Name fitting:** Latin uses the short names table (UK, W. Germany, Czechoslov., Spain/Port., Laos/Camb., W. Afr.
  States, Saharan St., SE Afr. St., S. Africa, Dominican R., N./S. Korea); anything wider than the band compresses with
  `textLength` (never below 82 %). zh uses full names ≤ 5 characters; overrides: 西葡, 老挝柬埔寨, 东南非诸国, 多米尼加;
  6+ characters compress. These short names belong in the i18n catalog (`map.short.<id>`), not in code.
* **Subregions:** W. Europe band `--sr-reg-euw`, E. Europe band `--sr-reg-eue`, Austria/Finland split diagonally
  (half each), SE Asia band `--sr-reg-sea` inside orange Asia. Region plates repeat the region ink as a 5 u left bar.

### 4.4 Country states

| State | Visual | When |
|---|---|---|
| default | as above | always |
| controlled | side-100 body tint, 2.6 u side border, flipped marker | `controlled_by` |
| battleground | dark band, light name, red stability chip | static |
| **legal target (quiet)** | 2.4 u solid brass line on a 4.6 u ink edge, 3.5 u outside the box | prompt has > 12 country options |
| **legal target (loud)** | 3 u brass dashes, each with an ink edge (5.2 u), 5.5 u outside, marching (1.4 s loop), soft glow | ≤ 12 options (rarer, more important) |
| non-target during a map prompt | 42 % opacity, saturation 30 % (phones: opacity only) | `prompt.countries` non-empty |
| hover / keyboard focus | 5 u solid brass-300 ring, shadow deepens; ghost marker shows the result (+1 dashed counter); tooltip after 300 ms | target under pointer/focus |
| selected (staged) | orange 3.5 u corner-bracket reticle; tooltip pinned | coup / realign / region / last point awaiting confirm |
| warning target | ring drawn in hazard stripes, tooltip headline in alert ink | option has `defcon-suicide` / `cmc-suicide` / `game-ending` |
| placed this play | grease-pencil ellipse "+1" (brass-300 fill, ink stroke) at the top-right corner; counts up per click | from the human's influence/event-target clicks since the play began; cleared when the play ends |
| last opponent play | 6.5 u side-coloured dot with a white "+" at the top-left corner | countries whose influence changed in the AI's last play; cleared when the human's next play starts |
| region focus (scoring / Chernobyl) | region boxes full colour, others dimmed | §8.3, §6.14 |

### 4.5 Connections

* Intra-region: 1.6 u solid ink at 55 %, drawn centre-to-centre beneath boxes.
* Inter-region (8 edges: France–Algeria, Spain/Port.–Morocco, Turkey–Syria, Egypt–Sudan, Libya–Tunisia,
  Iran–Afghanistan, Iran–Pakistan, Panama–Colombia): 2.4 u **dotted** (1/5.5 round dots) dark crimson — the pattern,
  not the colour, carries the meaning.
* Superpower: US 3.2 u long dashes (10/5) in US-600; USSR 3.2 u dash-dot (10/4/2/4) in USSR-600; drawn from the plate.
  Japan–USA wraps: a dashed stub with arrowhead off the right edge "TO USA" and one off the left edge of the USA plate
  "TO JAPAN" (board convention) — no long curve across the map.
* During map prompts links fade to 25 % (inter-region 40 %) so the rings read.

### 4.6 Region plates

Paper plate 164×56 u in an empty sea area near each region: stencil region name, scoring values ("3·5·7", Europe
"3·7·★", SE Asia "1 VP each · Thailand 2"), and one chip per side with the current standing from
`frame.regionScores` (— / PRES / DOM / CTRL, side glyph + word, presence at 80 % opacity). Clicking a plate filters the
map to that region for a moment (non-region dim for 2 s) and opens its scoring preview in the tooltip.

### 4.7 Camera

Desktop default: fit the world. Wheel zoom 1.15×/notch towards the cursor (1×–3×), drag to pan, `+`/`−`/`0`, ⤢ button
resets. No automatic camera on desktop (the world is always visible), except an optional setting "Follow the action"
that pans to off-screen targets when zoomed in. Phones: automatic framing as in §3.4; transitions 450 ms ease-in-out,
instant with reduced motion.

### 4.8 Map tooltip (desktop hover / phone inspect sheet)

Paper card 190–250 px, arrow to the box, placed on the side with more free space (prefers sea). Content: name + BG chip,
stability, US/USSR influence with control word, and for an open prompt the **preview**: "+1 → USSR 0 → 1", cost
("Costs 2 Ops (US-controlled)"), "→ CONTROL" when the click flips control, coup odds (§6.8), warnings. Key hints
"Click place · Right-click details". Right-click / long-press opens the full country inspect (adjacency list, region,
last changes).

---

## 5. Cards and the hand

### 5.1 Card faces

Use the 500×700 WebP images in the UI language (`public/cards/{en,zh}`), swapped with a 150 ms cross-fade on language
change. At hand size (104×146) the printed text is unreadable, so every hand card carries an HTML **caption** over its
bottom 40 %: ops badge (US square / USSR chamfered / neutral paper, same shapes as markers) and the name in the UI
language, 2-line clamp. Captions reserve the part of the card covered by its neighbour.

### 5.2 Hand tray

* Fanned (±2.2° per card from the centre), overlapping only as much as needed to fit (ResizeObserver; max overlap 55 % of
  card width, beyond that the hand scrolls horizontally with edge fades).
* States: **playable** — lifted 10 px, brass 2 px outline + glow; **not playable** (prompt open, card not an option) —
  saturation 25 %, brightness 62 %; **hovered/focused** — lifted 22 px, scale 1.06, zoom after 250 ms;
  **lifted out** — while a card is in play its slot shows a dashed brass outline; **warning** — a hazard tag on top
  ("SCORING" always on scoring cards; "STRANDS A SCORING CARD", "OPPONENT EVENT" etc. from option warnings).
* Verb styling: when the prompt's cards are to be *discarded* or *given* (event-card prompts), hovering shows a stamp
  "DISCARD"/"GIVE"/"EXCHANGE" over the card instead of the lift, so play and discard never look alike.
* Keyboard: `←`/`→` move focus, `Enter` chooses, `Space` or `Z` toggles the zoom.

### 5.3 Card zoom (`situation-room-action-zoom.png`)

Image 292×409 + a paper text panel 236 px wide: title (zh serif), "#74 · ★ US · 2 OPS · MID WAR", the **crisp card
text from our i18n catalog** (latest errata; the printed English images may be pre-errata — the label "Text shown is the
current errata" says which wins), and *play notes* from the controller: Event ("fires for the US"/"yours"), Effective Ops
(`controller.effectiveOps(card)`), Space race requirement, plus warning lines from the prompt option. Opens above the
card, never covering the slip; `Esc` closes. Also used for any card reference (log, effects chips, piles, picker).

### 5.4 The China Card

A dedicated green-felt slot to the right of the hand, the card tilted −3°:

* **Face up, held by you:** the real card image, playable glow when it is an option; label "CHINA CARD · FACE UP"; zoom
  notes "+1 Op if all spent in Asia".
* **Face down, held by you:** a custom back (red lacquer, gold rim, "THE CHINA CARD / 中国牌", ribbon "FACE DOWN — next
  turn"), desaturated, not clickable.
* **Held by the adversary:** your slot shows an outline "China Card: with the US (face up/down)"; the adversary dossier
  shows the card (face up mini or the back) beside its hand.
* Passing animates the card across the table and flips it (§11, `china-card`).

### 5.5 Adversary hand (rail top)

* Seal, "UNITED STATES / DeepStruggle AI · full strength", status chip (WAITING / THINKING with a blinking phosphor dot /
  PLAYING in the side colour).
* Unknown cards as **card backs** (dark navy, diagonal hatch, brass rim, "TS" roundel), 44×62, overlapping; **known**
  cards (`state.aiKnownCards`) as face-up minis lifted 4 px with a brass "KNOWN" tag, zoomable. Count text "5 cards in
  hand · 1 known · China Card: yours".
* On `hand-revealed` the backs flip one by one to the revealed faces (§11).
* During headline: a face-down card leaves the hand into a slot labelled "HEADLINE · committed" when `headline-chosen`.

### 5.6 Piles

Right end of the tray: three compact buttons (Deck 21, Discard 14, Removed 9) with a thumbnail of the top card. Discard
and Removed open the picker dossier in browse mode (sorted by era/side, with search); Deck shows only its count and era
composition. Draw-deck count pulses when a reshuffle is near (≤ 2 cards).

---

## 6. Prompts — the UX for every `PromptKind`

### 6.1 The orders slip (common shell)

Bottom-left of the tray (desktop 330×≈150 px; phones full width). Typed paper with a rule under the header.

```
ORDERS · TURN 5 · AR 3                    [YOUR MOVE]   ← header + stamp (side colour of the decider)
┌clip┐ PLACE INFLUENCE                                  ← prompt.title (i18n Message), 19 px caps / zh 17 px
│card│ "We Will Bury You" · 4 Ops                       ← pendingCard / resolvingCard + opsValue (typewriter)
└────┘ ⊘ ⊘ ● ●  2 of 4 left              [↶ UNDO]       ← remaining counter (Ops chips) + undo when canUndo
       Click a ringed country for +1. …                 ← prompt.detail (hint), 11 px
       [primary action] [done/decline/pass…]            ← only when the prompt needs buttons
```

* The paper-clipped mini card is the card in play (zoomable).
* `done` renders as a ghost button labelled by `doneMeaning`: pass → "Pass", stop → "Stop here", decline → "Decline",
  return → "Return the card", skip → "Skip" (zh: 放弃行动 / 到此为止 / 拒绝 / 退回该牌 / 跳过). Shortcut `D`.
* **Undo** (`canUndo`): "Undo play" returns to the start of your current play. Shortcut `Z` / `Ctrl+Z`.
* When no prompt is open the slip shows the frame narrative ("United States plays Decolonization · Operations · Coup ·
  Space / click: skip · Shift: faster") or "WAITING FOR THE UNITED STATES…" while `aiThinking`.
* `aria-live="polite"`: the title and remaining count are announced on change.

### 6.2 Confirmation model

* **Instant:** ordinary influence points, event-target points, hand-card choices that lead to another prompt
  (play-mode follows), mode buttons. These are cheap to revert with Undo.
* **Staged (select → confirm):** anything that rolls a die or ends your play irreversibly once the AI moves: coup,
  realignment, the *last* point of an influence/setup/bid/event run, headline commit, region, branch, DEFCON level.
  First click selects (reticle / highlight + slip shows the consequence), second click on the same target, `Enter`, or the
  slip's primary button confirms; `Esc` / click elsewhere cancels. Setting "Confirm final actions" (default on) can turn
  staging off for influence/headline; dice actions always stage.
* **Hold-to-confirm (1.2 s, ring fills; keyboard: hold Enter):** any option with warning `game-ending`,
  `defcon-suicide`, `cmc-suicide`, Wargames "end the game", DEFCON 1 in Summit/How I Learned.
* Knowing whether a click is the last one needs the cost of that click (2 Ops in opponent-controlled countries); the UI
  must not restate that rule — see contract gap G1.

### 6.3 Warnings (`WarningCode`)

Rendered where the option is: on a hand card (hazard tag + line in the zoom), on a mode button (hazard footer), on a map
target (hazard ring + tooltip line), in dialogs (hazard tile). Copy (en / zh):

| Code | Text | Severity |
|---|---|---|
| `scoring-stranded` | "Leaves {n} scoring card(s) for {k} play(s) left — you lose at turn end if one is still held" | caution (stage) |
| `defcon-suicide` | "DEFCON drops to 1 on your turn — you lose" | fatal (hold) |
| `cmc-suicide` | "Coup during the Cuban Missile Crisis — you lose" | fatal (hold) |
| `game-ending` | "Ends the game: {winner} wins" | fatal (hold) |
| `opponent-event` | "{Side} card: its event still happens for the {side}" | info (shown, no extra step) |

### 6.4 `setup-place` (USSR 6 in Eastern Europe / US 7 in Western Europe)

Map prompt, influence flow (§6.7) with the subregion highlighted: the target subregion's boxes ring (quiet), its land tint
deepens and a "WESTERN EUROPE · place 7" plate appears. Counter "7 of 7". Staged last point. The AI's setup plays
afterwards as one animated batch (stagger 120 ms).

### 6.5 `bid-place` (US +2 where it already has influence)

Same flow, title "Bid: +2 influence", detail "Only where the US already has influence"; counter of 2; staged last point.
(This is the prompt DS mislabels as "Western Europe" — ours names the bid.)

### 6.6 `headline`

Hand rises (all options glow); slip: "Choose your headline · the AI chooses at the same time; higher Ops resolves first,
US on ties". Click → the card flies to a **headline slot** at the left end of the hand, face up with a "FACE DOWN TO THE
AI" ribbon; slip primary "Commit headline" (staged). After commit: the card turns face-down in its slot; the adversary
slot shows "committed" when the AI's `headline-chosen` arrives. Reveal: §8.2.

### 6.7 `influence` — the placement flow (hero shot)

1. Prompt opens: map enters focus mode (targets ringed; quiet when > 12), the slip shows the card, "PLACE INFLUENCE",
   Ops chips = `opsValue`, spent chips struck through, "{remaining} of {opsValue} left".
2. Hover a target: ghost counter in your slot with the next number, tooltip "+1 → USSR 0 → 1", cost line, "→ CONTROL" if
   it flips control; the chips that the click would spend pulse.
3. Click: marker thunks (§11), chip strikes through, pencil "+1" appears/increments, counter decrements; aria-live says
   "Iraq: USSR 3, controlled. 2 Ops left."
4. Targets update from the new prompt (`promptId` changes; rings cross-fade 120 ms — no flashing).
5. The last point is staged (§6.2). `Undo play` reverts the whole play (pencil marks clear with an eraser wipe).
6. `prompt.maxPerCountry` (events) shows as "max 2 per country" in the detail line and a pencil tally "+2/2" on the box,
   whose ring disappears when capped.

### 6.8 `coup-target` (`situation-room-coup.png`)

Map prompt, loud/quiet rings by count. Hover → tooltip "COUP · IRAN · BATTLEGROUND", formula line from data
("3 Ops + die − 2×2"), a **six-die strip** from `controller.coupOdds(country)` (grey = fail, green = success with net
gain below, hazard = ends the game), "4 / 6", and consequences (BG → "DEFCON 3 → 2", "Mil ops +3"). Click selects
(reticle), slip: "COUP → IRAN · Brezhnev Doctrine · 3 Ops", primary **Launch coup** (`Enter`), hint "A coup is final".
Fatal options use hold-to-confirm.

### 6.9 `realign-target`

Like coup, slip "REALIGN · rolls left {remaining}", `done` = "Stop here". Each confirmed target rolls the two-dice tray
(US die left, USSR right, modifiers listed under each, net result). Odds are not shown until the controller offers them
(gap G3); the tooltip lists the current influence and adjacency facts from data. Option "Quick realign" in settings
removes the staging for realignments after the first.

### 6.10 `event-target`

Slip shows the *resolving* event card clipped, its title from `prompt.title` (the i18n message says add/remove and
where), counter for `remaining`, `maxPerCountry` cap, `done` when offered. Adds use your marker ghost; removals show the
opponent's (or your) counter with a red strike-through ghost "−1". Fixed-target events need no prompt (they animate).
Cuban Missile Crisis payoff (`resolvingCard 40`) gets its own wording: "Pay 2 influence to end the Cuban Missile Crisis?"
with `done` = "Keep playing".

### 6.11 `action-card` (`situation-room-action-zoom.png`)

Hand rises, options glow (China Card in its slot too), slip "CHOOSE A CARD · Action round 3 · 5 plays left incl. this
one" (count from the controller/frame; see gap G4). `done` "Pass" when legal. Special titles come from the prompt
Message: Quagmire/Bear Trap ("Discard a card worth 2+ Ops and roll 1–4 to escape"), forced Missile Envy ("You must play
Missile Envy"). A scoring card resolves immediately on choice (animation §8.3). Warnings per card (§6.3).

### 6.12 `play-mode` (`situation-room-desktop-zh.png`)

The chosen card flies from the hand to centre stage (262×367, −2°, brass rim); the map dims behind (radial scrim).
A dark panel to its right:

* kicker "HOW WILL YOU PLAY IT?", card name (stencil / zh serif 30 px), side + effective Ops
  (`controller.effectiveOps`).
* **Event** row (description from i18n: own card "Resolve the event" / opponent card "US event resolves for the US, then
  you spend 2 Ops").
* **Operations** group with three equal buttons Influence / Coup / Realign and one shared footer for `opponent-event`
  ("Then the US event fires: …" with the event's one-line summary).
* **Space race** row with the target box and roll range (from engine layout `space_boxes`).
* Grain Sales: extra row **"Play UN Intervention on it"** (`un-intervention` option) and `done` = "Return it — you get
  2 Ops".
* Options not offered render disabled (40 %) so the panel never reflows. Keys `E I C R S`, `Esc` = "Back to hand"
  (undo). Hidden for scoring cards (they resolve on choice).

### 6.13 `op-mode`

Same panel without Event/Space; header names the source: "Free Ops from CIA Created · 1 Op", "Junta: free coup or
realign in Central/South America", "Tear Down This Wall: 3 Ops in Europe". `done` = "Decline" (Junta/TDTW) — the decline
DS forgot.

### 6.14 `event-card`

* All offered cards in your hand (Blockade, UN Intervention, Ask Not, Five Year Plan-style choices, Missile Envy give):
  pick in the tray with verb stamps (§5.2). Ask Not counts "discard up to 3"; Blockade's `done` = "Lose West German
  influence".
* Otherwise (discard pile — SALT, Star Wars; drawn cards — Our Man in Tehran, Grain Sales; opponent hand — Aldrich Ames):
  a **dossier modal** (`situation-room-card-picker.png`): tab with the event name, instruction, a grid of offered cards
  with their location tag ("Discard", "Drawn", "US hand"), hover zoom, single selection with brass ring, Confirm +
  `done` button ("Take no card", "Return the rest to the deck").

### 6.15 `branch`

Dossier modal with one large option tile per branch (title, one-paragraph consequence from branch metadata, icon).
Olympic Games: "Participate (roll, sponsor +2)" / "Boycott (DEFCON −1, sponsor gets 4 Ops)" with the DEFCON consequence
in hazard if it is fatal. Warsaw Pact: "Remove all US influence in 4 E. European countries" / "Add 5 USSR influence".
Wargames: "End the game — give the opponent 6 VP" (shows the resulting winner; hold-to-confirm) / "Continue".

### 6.16 `defcon-level` (`situation-room-defcon-choice.png`)

Dossier with the event card and five lamp tiles 5…1: legal levels enabled, current marked "CURRENT", others "raise"/
"lower" captions, DEFCON 1 in hazard with "Ends the game — you lose" and hold-to-confirm. Summit offers only current±1.

### 6.17 `region` (Chernobyl)

Map prompt: region plates become big buttons (brass ring), hovering one tints the whole region (land + boxes) and dims
the rest; the slip lists the six regions as buttons too (keyboard). Staged confirm: "USSR may not place influence with
Ops in ASIA this turn".

### 6.18 Prompt-less time

While frames animate, clicks on the map/hand are ignored (cursor `progress`), but hover, zoom, log and tooltips work.
`Space`/click on the stage skips (§11.1).

---

## 7. AI turn presentation

* **Thinking:** adversary chip "THINKING" (phosphor dot), slip "WAITING FOR THE UNITED STATES…" with a teletype caret,
  console AR readout shows "AR 3 · US (AI)". No progress bar or elapsed time (timing must reveal nothing; the controller
  pads decisions to `minDelayMs`). The human can hover, zoom, read the log, open cards. If the model is still
  downloading: "Establishing link… 62 %".
* **Card reveal (`card-played`, AI):** a card back leaves the adversary hand, flies to the **reveal dock** (top-right of
  the map, 236 px, `situation-room-ai-reveal.png`), flips at mid-flight, and the caption types in: "UNITED STATES PLAYS ·
  DECOLONIZATION · Operations · Coup → Angola · 1 Op" plus a note for opponent cards ("USSR card: its event fires after
  the coup"). Hold 900 ms, then the map acts. The dock stays pinned (compact, 120 px card) for the rest of that play so
  the player can relate each change to its card; it collapses into the discard pile when the next play starts.
* **Map action:** reticle on the target, the die tray appears beside the target (never over it), influence counters
  change, control flips, tracks update — each per §11.
* **Pacing:** AI micro-steps of one play are chained without extra pauses (each influence point 260 ms + 120 ms gap).
  Between plays: 400 ms rest. Auto-played frames (`frame.auto`) run at 0.6×. When `vm.queued > 3` the runner switches to
  0.5×; the player can always skip.
* **Your own actions** get immediate feedback (no reveal, 0.6× durations) — you just made them.

---

## 8. Tracks, log and big moments

### 8.1 Console instruments

| Instrument | Design | Interactions |
|---|---|---|
| Turn | 10 cells, current brass-lit, era groups EARLY 1–3 / MID 4–7 / LATE 8–10 | hover: era notes ("Mid War cards were shuffled in at turn 4") |
| Action round | 7–8 pips, each split USSR \| US halves (USSR moves first), current half brass, AR 8 dashed when not available; readout "AR 3 · USSR (YOU)" | hover: "AR 8 available to the US (North Sea Oil)" |
| DEFCON | big stencil numeral (5 blue, 4 green, 3 amber, 2 orange, 1 white-hot) + five lamps + restriction text ("No coups or realigns in Europe, Asia") | at DEFCON 2 the frame pulses (§11) |
| VP | horizontal gauge US 20 ← 0 → USSR 20 (US left, as everywhere), needle, ticks every 5, readout "USSR +2" | hover: VP history sparkline |
| Mil ops | two rows of 5 cells (US square cells, USSR chamfered), required level outlined in brass, "MIL OPS · NEED 3" | hover: penalty preview "USSR short by 2 → US +2 VP at turn end" (from frame data, gap G5) |
| Space race | two rows of 8 cells, numbers | hover: full track with box names, privileges and next attempt odds |

### 8.2 Headline reveal (`situation-room-headline.png`)

After both commits: map dims, two **newspapers** (US "The Washington Dispatch", USSR "ПРАВДА") drop in rotated
(−2° / +1.6°), each with the card as photo, the card name as headline (serif caps / zh serif 32 px), the event's real
text as the column, dateline "US HEADLINE · TURN 6 · 2 OPS", and a round brass-rimmed order badge "1st"/"2nd" stamped
on. Caption "3 vs 2 Ops · USSR resolves first". Hold 1.6 s or until click; then the first paper folds into the reveal
dock and its event animates, then the second. Defectors cancelling a headline: the cancelled paper gets a "CANCELLED"
stamp and slides to the discard pile. If `ts_first_headline_json` splitting is available the two resolutions animate
separately; otherwise in order within one frame.

### 8.3 Scoring (`situation-room-scoring.png`)

On `scoring`: the region's boxes stay lit, others dim; the **scoring sheet** docks on the side of the map away from the
region (Europe/Middle East/Africa → left; Americas → right; Asia/SE Asia → left) so the scored countries stay visible.
Header in region ink, rows US | USSR: status chip (Presence/Domination/Control), level VP, battlegrounds, adjacent to
enemy superpower, total; result bar "USSR SCORES · NET +3 USSR". Rows fill top-down 120 ms each with counting numerals,
then a "+3" chip flies to the VP gauge and the needle swings. Data: `frame.regionScores` for the region. Europe control:
the result bar reads "EUROPE CONTROL — GAME OVER" and leads into the game-over sequence. SE Asia sheet lists the
controlled countries. Final scoring (end of turn 10): all six sheets as a quick sequence (or one combined table).
Setting "Pause on scoring" (default on): waits for a click / Space ("Continue").

### 8.4 Dispatches (log)

A teleprinter tape: paper strip with perforations, Courier Prime 11.5 px (zh 12 px), newest at the bottom with a blinking
caret; the top fades. One entry per `LogEntry`: time code ("T5 HL", "AR1"), side bar (US solid / USSR dashed — not only
colour), side word in side ink, the main line; `details` in smaller ink below; dice as inverted digit chips. Card and
country refs are dotted-underlined: hover a card → zoom; hover a country → its box pulses on the map. Turn separators
"— TURN 5 · MID WAR —". Filters: All / Plays / Dice. The entry of the current play is highlighted. Re-renders instantly
on language change (entries are `Message`s). Screen readers: a visually hidden `aria-live` mirror announces new entries
in plain sentences.

### 8.5 Game over (`situation-room-game-over.png`)

A telex sheet (perforated edges) over a dark red-black scrim: "FLASH · FLASH · FLASH", winner in stencil ("USSR
VICTORY"), a rubber stamp from your perspective (YOU WIN / YOU LOSE / DRAW), the reason sentence by `EndingReason`
(below), stats (final VP, turn·AR, coups by side, play time), a VP-by-turn line (single neutral ink line, US wash above
0, USSR wash below — polarity by position and words, not colour alone), actions New game / Review board / Full dispatch
log.

| `reason` | Sentence (en) | Special presentation |
|---|---|---|
| vp20 | "Victory points reached 20 during Turn {t}, AR {ar}." | VP needle slams to the end |
| europe-control | "{Side} controls Europe at Europe Scoring." | Europe region lit, others dark |
| defcon | "DEFCON 1 — global thermonuclear war. {Side} caused it and loses." | white-out flash 120 ms → long fade to black, teletype types the line (reduced motion: fade only) |
| cmc-suicide | "A coup during the Cuban Missile Crisis — {side} loses." | as defcon, shorter |
| held-scoring / -both | "{Side} held {card} at the end of the turn (tournament rule)." | the offending card(s) shown in the telex |
| milops-vp20 | "Military operations penalty pushed VP to 20." | mil-ops row highlighted |
| final-scoring | "Final scoring after Turn 10: {Side} +{vp}." | final sheets first |
| wargames | "Wargames: {side} ended the game." | — |
| resign | "{Side} resigned." | no stamp animation |

### 8.6 Start screen (`situation-room-start.png`)

Dark wall with the stencil title, Chinese title 冷战热斗 (larger in zh), tagline; below it the war table in perspective
(the real map, no influence) lit by a lamp pool. Three **dossiers** lying on the table: United States (blue folder,
star seal, "Move second each AR; the edge in the Late War"), Toss a coin (half-blue/half-red coin), Soviet Union (red
folder, "Move first, start with the China Card"). Hover lifts a folder; click starts. Row: Resume game · Turn 5 (when
`hasSavedGame`), Rules (GMT living rules ↗, opens the PDF link, never hosted), Settings. Top: "TOP SECRET · EYES ONLY",
language toggle, gear. Bottom: boot line `> ESTABLISHING LINK WITH DEEPSTRUGGLE … MODEL 14.2 / 23 MB` with a phosphor
progress bar driven by `LoadProgress` (engine → model-download → model-verify → ai-worker), credits (fan-made, GMT ©,
DeepStruggle MIT). Choosing a side works before the model finishes; the first AI decision then waits with the
"Establishing link" status. Coin toss: a 900 ms coin flip that lands on the chosen side (reduced motion: instant).
Errors (`status: "error"`): the boot line turns alert-orange with the message and a Retry button.

---

## 9. Language switch

`EN | 中文` segmented toggle in the console (desktop) / start screen; a single "中"/"EN" button on tablets; inside ☰ on
phones. Switching is instant, no reload: i18next language change, `<html lang>` updates (all CJK typography rules key off
it), card images cross-fade 150 ms, map names re-fit, the log re-renders from Messages, the URL is not changed. Choice
persists in localStorage (ARCHITECTURE: `?lang=` → localStorage → `navigator.languages` → en). Proper nouns follow our
card images' Chinese terms (DEFCON stays "DEFCON", 调整, 战争早期/中期/晚期).

## 10. Settings (gear → dossier)

| Setting | Values (default first) |
|---|---|
| Language | follows browser / English / 中文 |
| Animation speed | Standard 1× · Cinematic 1.25× · Brisk 0.6× · Instant |
| Reduced motion | Follow system · On · Off |
| Confirm final actions | On · Off (dice actions always confirm) |
| Pause on scoring and headlines | On · Off |
| Sound | Off · On (teleprinter ticks, die rattle, marker thunk, klaxon at DEFCON 2; ≤ 120 KB total, lazy) |
| Map labels | 100 % · 115 % · 130 % (scales name/marker text inside boxes) |
| Card text | Show crisp text in zoom · Image only |
| Side patterns | Off · On (adds a fine hatch to USSR markers/areas for monochrome viewing) |
| Rail | Expanded · Collapsed |

Stored per device in localStorage (UI preferences only; game state persistence is the controller's).

---

## 11. Animation catalogue

### 11.1 Runner

`useFrameRunner(vm.frame)`: when `frame.seq` changes, play `frame.events` in order, then render `frame.state` and call
`ackFrame(seq)`. Implementation: Web Animations API on DOM/SVG nodes (transforms + opacity only), one `AbortController`
per frame. Durations are `base × speed` where `speed = setting × (frame.auto ? 0.6 : 1) × (vm.queued > 3 ? 0.5 : 1)`;
human-caused frames ×0.6. **Skip:** click on the map stage, `Space` or `Esc` → `finish()` all running animations, apply the
final state, ack. **Hold Shift:** ×3 speed. Grouping: consecutive `influence` + `control` on the same country merge into
one beat; beats on different countries in the same frame stagger 120 ms; track events (`vp`, `defcon`, `milops`, `space`)
run in parallel with the beat that caused them; `card-moved` runs after `card-played`. Total budget for a typical AI play:
2.5–4 s at 1×, < 1 s at Brisk.

### 11.2 Per event

| GameEvent `t` | Animation | Duration (1×) | Easing | Layer | Skippable | Reduced motion |
|---|---|---|---|---|---|---|
| `turn-start` | teletype banner across the map top "TURN 6 · MID WAR" types in, turn marker slides one cell; at turns 4/8 an era stamp "MID WAR — new cards shuffled in" + deck pulse | 1400 | ease-out | 25 | yes | banner fades in/out 200 |
| `phase` | HEADLINE: "HEADLINE PHASE" plate (600); ACTION_ROUND: none; SETUP: intro plate; GAME_OVER: handled by `game-over` | 0–600 | ease-out | 25 | yes | fade |
| `action-round` | AR pip half lights (brass flood 250), adversary/slip stamps swap side | 300 | ease-out | 30 | yes | instant |
| `deal` | cards fly deck → hand one by one (yours face up, flipping mid-air; the AI's as backs to the rail) | 280 each, stagger 70 | ease-in-out | 40 | yes | count change + fade-in |
| `reshuffle` | discard stack slides onto the deck with a riffle (3 offset copies), toast "Deck exhausted: discards reshuffled — held hands are now known" | 900 | ease-in-out | 40 | yes | toast only |
| `hand-revealed` | AI backs flip one by one to faces, "REVEALED" stamp on the dossier | 350 each, stagger 90 | ease-in-out | 20 | yes | faces appear |
| `card-played` (AI) | back flies to the reveal dock, flips, caption types, hold | 450 + 900 hold | ease-out (flight), ease-in-out (flip) | 26/40 | yes | dock appears with the face (150 fade) |
| `card-played` (you) | card from stage/hand to the slip clip, caption stamp "OPS · INFLUENCE" | 300 | ease-out | 40 | yes | instant |
| `card-played` how=space | card slides to the space track instrument, die tray at the console, rocket marker advances on success | 450 + die 700 | ease-out | 24 | yes | result text |
| how=scoring | card to centre, then scoring sheet (§8.3) | 400 + sheet | ease-out | 25 | yes | sheet fades |
| how=discard / give | card slides to the discard pile / across to the other hand (flip to back if hidden) | 450 | ease-in-out | 40 | yes | fade |
| how=pass | "PASS" stamp on the slip/dock | 300 | thunk | 26 | yes | text |
| `card-moved` | generic card flight between zone anchors (hand-us, hand-ussr, deck, discard, removed, effects strip, headline slots, dock); removed-from-game gets a grey wash | 450, stagger 60 | ease-in-out | 40 | yes | fade |
| `headline-chosen` | face-down card slides into that side's headline slot, "COMMITTED" stamp | 400 | ease-out | 40 | yes | instant |
| `headline-reveal` | newspapers sequence (§8.2) | ≈ 2400 incl. hold | ease-out + thunk | 25 | yes | papers appear, no motion |
| `influence` (+) | counter drops 14 u from above onto the slot, scales 1.15 → 1 with a thunk and a ring ripple in side colour; numeral rolls old → new | 260 | `--sr-ease-thunk` | 10–12 | yes | numeral cross-fade 120 |
| `influence` (−) | counter lifts 6 u and fades, red strike flash; numeral rolls down | 220 | ease-in | 10–12 | yes | cross-fade |
| `control` | box border sweeps to the new colour, the marker flips (rotateY 180°, face swap at 90°), "CONTROL"/"LOST" micro-stamp | 350 | ease-in-out | 10 | yes | instant swap + 1 s outline pulse |
| `roll` | die tray beside the target (never over it): die tumbles (3 rotations) and lands; modifiers and result type in; coup = 1 die (roller's colour), realign/summit/olympics = two dice US left · USSR right; war cards and trap escape likewise | 700 + 600 read | ease-out + settle bounce | 24 | yes | static die face + text |
| `vp` | "+3" chip flies from the source (box / sheet / dock) to the VP gauge; needle swings with slight overshoot | 600 | ease-out-back | 24/30 | yes | needle jumps, readout flash |
| `defcon` (down) | lamp flickers twice then lights; console border flashes alert; at 2 the frame starts its slow pulse; at 1 → game over | 700 | steps(2) + ease-out | 30/100 | yes | lamp changes, no flicker/pulse |
| `defcon` (up) | calm cross-fade of lamps | 400 | ease-out | 30 | yes | instant |
| `milops` | cells fill left → right | 300 | ease-out | 30 | yes | instant |
| `space` | rocket marker advances along the cells; on reaching a privilege box a tooltip shows the privilege for 2 s | 600 | ease-in-out | 30 | yes | instant + tooltip |
| `scoring` | scoring sheet (§8.3) | ≈ 2000 + hold | ease-out | 25 | yes | sheet appears |
| `effect-on` | the event card shrinks into the In-effect strip with a pin; map overlays for located effects (Chernobyl region hatch, Quagmire/Bear Trap tag on the AR track, NATO brass rim on W. Europe for 1.5 s) | 450 | ease-in-out | 20 | yes | chip appears |
| `effect-off` | chip tears off (scaleY 1 → 0 with skew) | 300 | ease-in | 20 | yes | chip disappears |
| `china-card` | card slides from one side's slot to the other's, flips face down if `!playable`, flips up at turn end | 700 | ease-in-out | 40 | yes | instant swap |
| `game-over` | §8.5 sequence | 1200–3000 | per reason | 90 | yes (to the telex) | fade only |

### 11.3 Ambient (not frame events)

Target ring march (1.4 s loop, only ≤ 12 targets), THINKING dot blink (1 s), teletype caret, DEFCON 2 frame pulse (2.4 s).
All stop under reduced motion; none runs while the tab is hidden.

## 12. Reduced motion

Triggered by `prefers-reduced-motion: reduce` or the setting. Movement becomes cross-fades ≤ 150 ms, flights become fades
at the destination, flips become face swaps, no camera moves, no screen flashes or shake, no looping animations
(rings static, caret static, DEFCON 2 shows a static orange frame). Information is never lost: every animated change also
lands as a log line and leaves its static marker (pencil, last-play dot, reticle) for the rest of the play.

## 13. Accessibility

* **Side without colour:** (1) position — US left, USSR right in every box, gauge, row, dice tray and table; (2) shape —
  US square counters/badges/cells, USSR chamfered; (3) glyph — ★ vs ☭ on markers, seals, log, tags; (4) words — log and
  tooltips always name the side; optional (5) hatch pattern setting. Control = flipped (solid) vs unflipped (outlined)
  counter, plus the box border.
* **Contrast (measured):** ink-900 on paper-50 15.5:1; steel-300 on room-800 6.9:1; steel-400 labels 5.2:1 (raised from
  #71818b, which was 4.3:1); US-600 / USSR-600 on paper 9.0 / 6.7:1; gold numerals on USSR-600 4.5:1. Brass alone on the
  sea is only 1.1–1.5:1, so every target ring is two-tone: brass over an ink edge (ink vs sea 6.4:1, vs land ≥ 9:1,
  WCAG 1.4.11). Dimmed non-targets are not interactive at that moment; their names stay legible on hover.
* **Keyboard:** Tab order console → map → slip → hand → rail. On the map, arrow keys move focus spatially between
  countries (nearest box in that direction, legal targets first), `Enter` acts, `Space` inspects, `[`/`]` cycle legal
  targets only, `1`–`6` jump to regions. Global: `Z` undo, `D` done/pass, `E I C R S` modes, `Esc` cancel/close/skip,
  `?` shortcut sheet. Visible focus = brass ring, never removed.
* **Screen readers:** the SVG map is `role="application"` with each country a focusable `role="button"` labelled
  "Iran, battleground, stability 2, US 2 controlled, USSR 0, legal target: costs 2 Ops". Prompt title/remaining in an
  `aria-live` region; log mirror in another; dialogs trap focus.
* **Pointer:** targets ≥ 44 px on touch (phone framing), hover-only information is always reachable by long-press or
  focus + Space.
* **Text size:** UI respects browser zoom up to 200 % (rail collapses first, then the layout switches to the tablet
  arrangement); map label setting up to 130 %.

## 14. Implementation notes (React 18 + SVG + CSS)

Suggested components (`src/ui/`):

```
App ── StartScreen (Dossiers, BootLine) | GameScreen
GameScreen
 ├─ Console (TurnTrack, ArTrack, DefconLamps, VpGauge, MilOps, SpaceRace, LangToggle, Menu)
 ├─ MapView (svg)  ── Land (static <path>s, memo) · Links · RegionPlates · CountryBox×84 (memo by id+influence+state)
 │                    · Annotations · Overlays (rings/reticles) · MapTooltip (HTML portal) · Camera (viewBox state)
 ├─ Stage (PlayModePanel, RevealDock, HeadlinePapers, ScoringSheet, DiceTray)
 ├─ Rail (AdversaryDossier, EffectsStrip, Teleprinter) | RailStrip (≤1199 px)
 ├─ Tray (OrdersSlip, Hand, ChinaSlot, Piles)
 ├─ Dialogs (BranchDossier, DefconDossier, CardPicker, Settings, Confirm/Hold)
 ├─ CardZoom (portal)
 └─ GameOverTelex
hooks: useViewModel (useSyncExternalStore), useFrameRunner, usePromptTargets, useHandFit (ResizeObserver),
       useHoverIntent(300 ms), useKeymap, useReducedMotion, useI18n
```

* `MapView` re-renders only changed boxes; animations act on refs (WAAPI), then React state catches up on ack.
* Avoid live SVG filters on 84 groups on phones: focus dimming uses opacity only below 900 px; the paper grain is a
  static background image; glows are pre-blurred strokes.
* Card images: `loading="lazy"`, `decoding="async"`; preload the hand and the zoomed card in both languages.
* Fonts: four WOFF2 files, `font-display: swap`, preloaded only `BarlowCondensed-600` and the stencil.
* Tokens: copy §1 of `sr.css`; component CSS in modules; no CSS-in-JS runtime needed.
* Assets still to make (not in the repo): card back (SVG), China Card face-down (SVG), seals (SVG, in `sr.js`), die
  faces (CSS), optional sound sprites.

## 15. Contract gaps and data needs (for the coordinator)

| # | Gap | Why the UI needs it | Suggestion |
|---|---|---|---|
| G1 | No preview for a map option except `coupOdds` | influence cost (1 vs 2 Ops), "→ control" hint, knowing whether a click ends the run (staged confirm), event-target removal amount | `previewOption(promptId, idx): { remaining, endsPrompt, changes: {country, us, ussr, controlledBy}[], warnings }` via snapshot→step→restore |
| G2 | No reason codes for non-playable hand cards | explain dimmed cards ("Missile Envy must be played", "Quagmire: discard 2+ Ops") | optional `Prompt.handNotes?: {card, reason: Message}[]` |
| G3 | No realignment odds | realign tooltip parity with coup | `realignOdds(country)` over the 36 dice pairs (critique §3.6, untested) |
| G4 | "plays left this turn" not exposed | slip text, scoring-stranded explanation | `Prompt.playsLeft` or a field on PublicState (critique §3.8 formula, engine-derived) |
| G5 | Mil-ops penalty preview | console hover | derivable in UI from `mil_ops` + `defcon` (it restates a rule) — better a `Frame`/state field |
| G6 | Effect metadata (side, duration, card) for `effect-on` flags | In-effect chips and map overlays | export DS `EFFECT_INFO_MAP` as `src/game/effects.ts` (ui-flow §5) |
| G7 | Which countries changed in the AI's last play | last-play dots | derivable from frames (UI keeps them), fine as is |
| G8 | Space-race box table (needed Ops / roll / privileges) | space row text, mode panel | from `engine/layout` `space_boxes` (data, not a rule) — expose via `src/data` |

None of these block the design: the mockup degrades to "no preview" text where data is missing.

## 16. What this proposal deliberately does not do

* No 3D, no particle effects, no autoplaying music, no animated backgrounds behind text.
* No map rotation/tilt in game (only on the start screen backdrop).
* No information hidden behind animation: skipping always shows the same final state and log.
* No rules restated in code; DEFCON restriction captions and scoring numbers are static i18n copy.
