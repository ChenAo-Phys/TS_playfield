# UI/UX proposal: "modern board"

Author: design-modern-board · 2026-11-22 · Status: proposal

This proposal covers the game screen and the start screen of the Twilight Struggle Playfield. The direction is a modern digital board game: crisp, information-first, flat with depth, built in **React 18 + SVG + CSS** (Web Animations API for motion).

| Artifact | Path |
|---|---|
| Game-screen mockup (all states) | `docs/design/mockup-modern-board.html?state=influence\|coup\|ai\|scoring\|headline\|defcon\|cardpick\|gameover&lang=en\|zh` |
| Start screen | `docs/design/mockup-modern-board-start.html?lang=en\|zh` |
| Component sheet (tokens, tile states, cards, tracks, **every PromptKind panel**) | `docs/design/mockup-modern-board-anatomy.html?lang=en\|zh` |
| Shared CSS (tokens are normative) / renderer / layout generator / screenshot script | `docs/design/mockup-modern-board-assets/{mockup.css,mockup.js,build-layout.mjs,layout.js,shoot.mjs}` |
| Screenshots | `docs/design/shots/modern-board-*.png` (desktop-en, desktop-zh, desktop-1920, tablet, phone, phone-zh, start, start-zh, start-phone, coup, ai-turn, scoring, headline, defcon, cardpick, gameover, anatomy, anatomy-zh) |

The mockups open from `file://` with no build step. They use the real card images (`public/cards/{en,zh}`) and the real country positions (`docs/notes/countries.json`). The continents are placeholder blobs; the map agent will replace them with real coastlines.

---

## 1. Principles

1. **West is left, East is right, everywhere.** US influence sits in the left half of a country tile and USSR influence in the right half. The same order holds for the VP bar (US side on the left), score tables, the headline reveal, dice trays (US die left) and the start-screen side picker. The rule matches the geography (the Americas are west of the USSR) and the physical board's marker halves. It is the main way to tell the sides apart without colour (§13).
2. **The board is the hero.** The map gets every pixel the chrome does not need. The HUD sits in the empty corners and edges where the physical board put its tracks.
3. **One place for "what do I do now".** The **command panel** (bottom right on desktop, a bottom sheet on phone) always holds the current decision, or the AI's activity when it is the AI's turn. It never moves.
4. **Spotlight, don't decorate.** When a decision targets countries, legal targets stay bright with a white ring and everything else dims. The highlight uses no hue, so it never collides with region or side colours.
5. **The engine is the source of truth.** The UI shows only legal options (`Prompt.options`) and engine-computed previews (`coupOdds`, `effectiveOps`, `Frame.regionScores`). It never re-implements a rule. The one exception is display-only derivation (control from influence and stability) for hover previews; §15 asks for an engine preview API so even that can go.
6. **Every motion carries information and can be skipped.** Animations explain what changed. Space or a click finishes them, and *Reduce motion* replaces them (§12).

---

## 2. Visual identity

### 2.1 Palette (CSS tokens; `mockup.css` §1 is the normative source)

Dark "ink" chrome around a deep-ocean map with bright, paper-like country tiles. The dark/light contrast puts the strongest hierarchy on the board.

```css
:root {
  /* Chrome */
  --ink-0:#070c12; --ink-1:#0d141d; --ink-2:#141e2a; --ink-3:#1c2836; --ink-4:#263547;
  --line-1:rgba(190,210,235,.08); --line-2:rgba(190,210,235,.16); --line-3:rgba(190,210,235,.28);
  --text-1:#eef2f7; --text-2:#a7b3c3; --text-3:#7b899c;
  /* Map */
  --ocean:#0b1621; --ocean-deep:#08111a; --graticule:rgba(140,175,210,.07); --land:#16212e;
  --edge:rgba(196,214,234,.34); --edge-inter:rgba(232,238,246,.78); --tile-ink:#121821;
  /* Sides */
  --us:#2f6bf0;  --us-deep:#1b47b5;  --us-ink:#1d4fc4;  --us-tint:#dce7ff;  --us-on-dark:#82a9ff;
  --ussr:#e0393e; --ussr-deep:#a71d27; --ussr-ink:#c42a30; --ussr-tint:#ffe0de; --ussr-on-dark:#ff8d86;
  /* Regions: hue (name strip) / deep (battleground strip) / body (tile fill) */
  --r-eu:#a395f2; --r-eu-deep:#5544b4; --r-eu-body:#ebe7fd; --r-ee-body:#f5f2ff;
  --r-me:#5cc3ea; --r-me-deep:#1b759d; --r-me-body:#e2f4fb;
  --r-as:#f39446; --r-as-deep:#b4521a; --r-as-body:#fdeadb; --r-sea:#f6c049;
  --r-af:#e9c95d; --r-af-deep:#8a690f; --r-af-body:#fbf3da;
  --r-ca:#a9d25b; --r-ca-deep:#527a18; --r-ca-body:#eff7e0;
  --r-sa:#52c48b; --r-sa-deep:#1b774a; --r-sa-body:#e0f5ea;
  --bg-chip:#ffcc47;                                       /* battleground stability chip */
  /* Threat scale */
  --defcon-5:#49b28a; --defcon-4:#9cc251; --defcon-3:#f2c14e; --defcon-2:#f08a3e; --defcon-1:#e5484d;
  /* Feedback */
  --warn:#f5b841; --danger:#ff5c61; --ok:#4fc98f; --focus:#fff;
  /* "Me" = the human's side colour (body.me-ussr swaps it): primary buttons, own-play highlights */
  --me:var(--us); --ai:var(--ussr);
  /* Shape, depth, motion */
  --r-sm:6px; --r-md:10px; --r-lg:14px; --r-xl:20px;
  --shadow-2:0 1px 0 rgba(255,255,255,.05) inset,0 6px 18px rgba(0,0,0,.45);
  --ease-out:cubic-bezier(.22,1,.36,1); --ease-in-out:cubic-bezier(.65,0,.35,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);
  --t-fast:120ms; --t-base:220ms; --t-slow:420ms;
}
```

* **Region colours come from the board** (Europe violet, Middle East sky blue, Asia orange, Africa sand, Central America lime, South America green). They are toned so that dark tile text passes ≥ 6.9:1 on every strip. Battleground strips use the `-deep` shade with white text.
* **Side colours.** The blue/red pair stays distinguishable under protanopia and deuteranopia, because blue keeps its hue and red turns dark olive. Side colour is never the only cue (§13).
* **`--me`** follows the human's side. Primary buttons, the human's "this play" markers and the command-panel accent all use it, so the human's own actions are always "their" colour. AI activity uses `--ai`.
* **No hue means "interactive".** Legal targets are white rings and focus is a white outline. Warnings are amber. Danger (game-ending) is coral red with a ⚠ icon and text, so it is not confused with the USSR.

Contrast (WCAG 2.x, computed): on `--ink-1`, text-1 is 16.5:1, text-2 8.7:1, text-3 5.2:1 (4.7:1 on `--ink-2`), `--us-on-dark` 8.0:1 and `--ussr-on-dark` 8.3:1. Tile names in `--tile-ink` on the light strips are ≥ 6.9:1 (Europe, the lowest) and up to 11:1 (Africa). White on the deep battleground strips is ≥ 5.0:1. On tile bodies, `--us-ink` numerals are ≥ 5.9:1 and `--ussr-ink` ≥ 4.7:1. White numerals on the `--us`/`--ussr` control fills are 4.7:1 / 4.35:1; they are ≥ 14 px bold, so the large-text 3:1 threshold applies.

### 2.2 Typography

No multi-MB webfonts. System stacks, plus **one optional small Latin condensed face** for the map.

```css
--font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Ubuntu Sans", Roboto,
  "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei",
  "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif;
--font-display: "Bahnschrift SemiCondensed", "Bahnschrift", "DIN Alternate", "Barlow Semi Condensed", "Roboto Condensed",
  "Avenir Next Condensed", "Ubuntu Sans", "Arial Narrow", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC",
  "WenQuanYi Micro Hei", sans-serif;          /* titles, numerals, tile names; used with font-stretch: condensed */
```

* **Recommendation:** self-host **Barlow Semi Condensed** (SIL OFL), weights 700 and 800, Latin subset only, about 18 KB each as woff2, with `font-display: swap`. Put it first in `--font-display`. Tile names then fit the same way on every OS, because condensed system faces vary. Chinese always uses system fonts. CJK glyph widths are fixed, and 2–4 character names fit without help.
* Numerals use `font-variant-numeric: tabular-nums` (influence, VP, counters).
* Scale (px): micro 11 (CJK 12), small 12, body 14, lead 16, h3 18, prompt title 19, h2 22–24, display 30–76.
* `:lang(zh)` turns off uppercase and wide letter-spacing, and raises the minimum size to 12 px. Every caps label in the CSS has a `:lang(zh)` override.

### 2.3 Iconography and emblems

* **US emblem:** five-point star. **USSR emblem:** hammer and sickle (stroke-drawn, legible at 11 px; `mockup.js` `I.sickle`). They appear on side badges, log avatars, controlled tiles (semantic zoom ≥ 0.8), track tags and effect chips.
* Mode icons: Event = bolt, Influence = ⊕, Coup = crosshair, Realign = ⇄, Space = rocket. Other icons: undo, warn, info, eye (known card), radar (AI avatar), dice faces (SVG, pips).
* **Ops badge.** The card idiom of a star with the ops numeral: white star on US cards, red on USSR cards, half-and-half on neutral cards, and a "VP" tab on scoring cards.
* **Card back** (no asset needed): navy diagonal weave with a soft central disc. **China Card face-down:** deep red with a gold disc and 中.

---

## 3. Layout

### 3.1 Desktop ≥ 1280 px (reference 1440×900; screenshot `modern-board-desktop-en.png`)

```
┌ top bar 56 ─ brand │ Turn 6/10 MID WAR │ AR pips │ VP tug bar │ DEFCON │ Mil ops │ Space │ ···· EN|中文 ☰log ⚙ ⋮ ┐
├──────────────────────────────────────────────────────────────┬───────── rail 290 ──────────┤
│ effects chips (top-left)                  piles (top-right) │ Opponent card (AI)          │
│                                                              │  avatar · status · backs ·  │
│                         MAP  (fit)                           │  known cards · China Card   │
│                                                              ├─────────────────────────────┤
│                                         zoom ⊕ ⊖ ⤢ ⓘ (BR)   │ Game log (grouped, live)    │
├──────────────────────────────────────────────┬───────────────┴─────────────────────────────┤
│ dock 168: YOUR HAND · China Card │ hand cards │ COMMAND PANEL 430 (prompt / AI activity)    │
└──────────────────────────────────────────────┴─────────────────────────────────────────────┘
```

* CSS grid: `grid-template-columns: minmax(0,1fr) var(--rail-w)`; rows `56px 1fr 168px`.
* At 1440×900 the map viewport is about 1150×676, which gives a board scale of about 0.49 (tile ≈ 47×31 px; tile names ≈ 10 px; influence numerals ≈ 15 px). At 1920×1080 the scale is about 0.63. Below 0.55 the map uses semantic zoom (§4.3).
* At ≥ 1600 px the dock grows to 190 px, hand cards to 120 px, the rail to 330 px and the command panel to 470 px (`modern-board-desktop-1920.png`).
* The rail can be collapsed (log button, `L`); it is open by default at ≥ 1280 px. With the board this wide, the map is height-limited at 1440×900, so the rail costs only about 1% of map scale.
* The map HUD floats over ocean: active-effect chips top-left, deck/discard/removed piles top-right (click opens the pile viewer sheet), zoom cluster bottom-right. The map key (legend) is behind ⓘ. It is not shown by default because it would cover Chile and Argentina.

### 3.2 Tablet 761–1279 px (landscape 1180×820, `modern-board-tablet.png`; portrait uses the phone layout scaled up)

* The rail is hidden. The log opens as a right drawer (360 px, over the map) and the opponent summary moves into the top bar's right side.
* The brand word and track separators are dropped. The VP bar narrows to 170 px. The dock is 172 px tall, with 94 px hand cards and a 380 px command panel whose help line is hidden.
* Portrait tablets (e.g. 820×1180) use the phone grid (§3.3) with a taller map (default zoom 0.55, i.e. about half the board) and 110 px hand cards.

### 3.3 Phone ≤ 760 px portrait (390×844, `modern-board-phone.png`, `-phone-zh.png`)

```
top bar 48   ☰ │ Turn 6 · AR 2  [US] MID WAR │ VP ★+3 │ DEFCON 3 │ log
tracks 30    Mil ★0/3 ☭3/3 │ Space ★3 ☭4 │ Deck 34
opponent 44  ◎ DeepStruggle [USSR] · waiting… · ▮▮▮▮▮▮ 6
MAP (flex)   region chips row (with legal-target counts) · minimap (BL) · pan/pinch
command      prompt bottom sheet (title, counter, warning, Undo); swipe up for detail
hand ~150    horizontal scroll strip, China Card first
```

* **The map is pan/zoom, not fit.** The default zoom shows about a quarter of the board (tile ≈ 55 px). Region chips ("C. America 8", "Europe 19") jump the camera and show how many legal targets each region holds. The minimap shows where the viewport is and is tap-to-jump.
* **The camera follows the action.** For a prompt, the camera frames the region with the most legal targets (or the one containing the previous placement). For AI moves, it pans to each affected tile before animating it (§10). A "fit" double-tap shows the whole board.
* The command sheet drops the help line. It has two states: compact (shown) and expanded (swipe up) with the help text and the option list for non-map prompts.
* The log opens full-screen from the top bar. Settings, menu and language are under ☰.

### 3.4 Phone landscape (≈ 844×390)

The map is full height. A left mini-rail (52 px) stacks VP, DEFCON, AR and the log button. The command panel floats as a pill at the top centre (title + counter + Undo), and the hand is a bottom drawer that peeks 44 px (titles only) and opens to 140 px. Modal sheets use 90% of the height.

### 3.5 Start screen (`modern-board-start.png`, `-start-zh.png`, `-start-phone.png`)

* Background: the real map, tilted in perspective (`rotateX(30deg) rotateZ(-6deg)`, 60% opacity) and fading into ink on the left. The game is visible before it starts. With reduced motion it is static; otherwise it can drift ±8 px over 30 s.
* Hero: the kicker "1945 – 1989 · The Cold War", then the title (EN "Twilight / Struggle" with a blue-to-red gradient on the first word; ZH 冷战热斗 / PLAYFIELD), then a one-paragraph lede.
* **Side picker:** three cards, US | Random | USSR (west-left), each with an emblem, name and one-line role ("Moves second · starts with the +2 influence bid"). Selection is a white ring and tick (`role="radiogroup"`, arrow keys). Picking Random plays a 600 ms coin-flip reveal of the side before the game opens.
* CTA "Start game" (`--me`) plus "Continue game" showing turn, AR, side and age, present only when `ViewModel.hasSavedGame`.
* **Loading** from `ViewModel.load`: one thin bar plus stage chips (Rules engine ✓ · Model 3.6 / 5.8 MB · AI worker). Start is enabled once the engine is ready. The AI keeps loading in the background, and the first AI decision shows "Preparing the AI…" if needed. On error, the bar turns red, a "Retry" button appears, and the details are in a disclosure.
* Footer: rule chips (Standard + optional cards #104–110 · US bid +2 · Tournament held-scoring rule · AI full strength, no difficulty levels) and the GMT disclaimer. The top right holds the rules link (external, GMT living-rules PDF), About and the language switch.

---

## 4. The map

### 4.1 Geometry (for the map agent)

* **World coordinates = the reference board** (`countries.json` `ref_x/ref_y`, 2448×1584). The viewBox is cropped to the country area: `{x:30, y:72, w:2342, h:1374}`. The tracks move into the HUD.
* **Tile 96×64 u**, name strip 26 u, corner radius 8 u. The tightest pairs are S. Korea–Japan (5 u vertical gap) and El Salvador–Costa Rica (1 u horizontal gap, 4 u vertical), so nothing overlaps. Keep these positions or re-space by region, as long as tiles keep ≥ 4 u gaps.
* **Region scorecards**, 196×96 u, sit in free ocean near the board's own scoring boxes (found by a no-overlap search): EU (612,144), Asia (1781,600), ME (1531,806), Africa (852,986), CA (496,651), SA (591,944), SE Asia (1750,950).
* Superpower nodes: USA (255,530) and USSR (1440,320), each 230×84 u with emblem and name. The Japan–USA wrap is drawn as an arrow off Japan's east edge ("TO USA") and one off the USA's west side ("TO JAPAN"), as on the board.
* The land layer here is placeholder blobs (goo filter). The final layer should be real coastlines in the same muted style: `--land` mixed with 14–22% of the region hue, Eastern Europe slightly stronger, Southeast Asia using `--r-sea`, and the US/USSR homelands tinted with their side colour. Add a 150 u graticule and an edge vignette.

### 4.2 Country tile anatomy (component sheet, "Country tile anatomy")

```
┌──────────────────────────────┐  ← 1 u dark outline; 3 u side-colour outline when controlled
│ France                   [3] │  strip 26 u: region hue (light) / region deep + white text (battleground)
├──────────────┬───────────────┤  name: display font, 21 u, condensed, left; stability chip 19.5×19 u right
│      4       ┆       1       │  body: US numeral left, USSR right, 31 u, centred in each half; dashed divider
└──────────────┴───────────────┘  controller's half = solid side colour, white numeral (+ emblem at zoom ≥ 0.8)
```

* **Stability chip:** white with dark numeral. **Battleground:** gold chip (`--bg-chip`) and the deep strip. The two cues are redundant, and the luminance difference also works in greyscale.
* **Subregions:** Eastern Europe tiles use the lighter `--r-ee-body`. Austria and Finland (both subregions) have a diagonally split body. Southeast Asia tiles carry a 3.5 u amber rule under the strip. Italic subregion labels ("Western Europe", "Eastern Europe", "Southeast Asia") sit on the land.
* **Zero influence shows no numeral**, which keeps the board quiet. Tooltips and screen-reader labels still say "0".
* **Names:** English uses compact forms only where needed (W. Germany, Spain/Port., Laos/Camb., N. Korea, S. Africa, Saharan St., …). Chinese uses common short forms (西葡, 比荷卢, 捷克, 多米尼加, 沙特, 印尼, 东南非, 西非, 撒哈拉). Full names appear in tooltips, the log and at zoom ≥ 0.8. Overflow handling is: shrink the font to 80%, then `textLength` squeeze (`fitNames`).

### 4.3 Tile states (component sheet, "Tile states")

| State | Visual | Trigger |
|---|---|---|
| Normal | as above | — |
| Controlled | controller half solid side colour + white numeral + 3 u outline; emblem at zoom ≥ 0.8 | `controlled_by` |
| Legal target | white 3 u ring at +4 u, plus a 7 u white halo that "breathes" (opacity .35↔.95, 2.2 s) | country in `prompt.countries` |
| Not a target (during a targeting prompt) | opacity .34, saturate .25; its edges dim too | spotlight mode |
| Hover / keyboard focus | 5 u ring; **ghost result** in the human's half (dashed box + next numeral); tooltip with before→after mini tiles, cost, and "gains control" | pointer / focus |
| Locked (coup target selected) | four white corner brackets (reticle) + odds popover | first click in coup-target |
| Last opponent move | pill at the top-right corner, "+2"/"−1", in the actor's colour | influence events of the AI's last play; cleared when the human's next play ends |
| This play so far | same pill in `--me` | the human's own placements in the current play; cleared by Undo or at play end |
| Region focus (scoring, Chernobyl hover) | the region's tiles at full strength, others dimmed, region land brightened | scoring / region prompt |
| Changed just now | 1 s white ring ripple (part of the influence/control animations) | events |

**Semantic zoom.** Below scale 0.55 the tile shows strip, name and numerals only, with region scorecards at full opacity. From 0.8, the control emblem, full names and dashed influence boxes appear. From 1.4, a tooltip-free mode adds a small "BG" caption and the adjacency count. Hit areas are never smaller than 40×40 CSS px: on touch, the hit rect pads the tile.

### 4.4 Connections

* Same-region: solid `--edge`, 2.6 u.
* **Inter-regional** (8 links): dotted `--edge-inter`, 5 u round dots every 11 u. This keeps the board's red-dotted idea without red, which means USSR here.
* **Superpower adjacency:** 7 u lines in the side colour at 55% opacity from the USA/USSR node to each adjacent country. Japan–USA uses the wrap arrows.
* In spotlight mode, edges that do not touch a legal target dim to 35–45%.

### 4.5 Camera

Desktop starts at "fit". Wheel zooms 1.15× per notch around the cursor (fit to 3×). Drag pans (6 px slop so clicks still work), double-click zooms 2× and `0` fits. Touch uses pinch, pan and double-tap. Camera moves animate the `viewBox` over 350 ms ease-in-out; with reduced motion they cut. **Auto-framing:** when a prompt's targets lie in one region (setup, bid, most events) and the current scale is < 0.6, the camera frames the target bounding box plus 80 u. It is always on for phones and a setting for desktop.

### 4.6 Region scorecards ("if scored now")

Each card shows the region name in its hue and two pills: US (left) and USSR (right). A pill holds the status letter and VP ("D 7", "P 3"; ZH "支配 7", "存在 3"), or "–" with no presence. Southeast Asia shows the VP per side. The data comes from `Frame.regionScores`. Hovering a card shows the breakdown table from the scoring popup (§8) and highlights the region. During a targeting prompt the cards drop to 55% opacity.

---

## 5. Hand and cards

### 5.1 Mini card (hand, pickers)

The top 56% of the real card art (ops star, era band, picture) sits above a **localized title plate**: two-line title in the UI font, a meta row (side or "Scoring", ★ = removed after event, #id), and a 3 px side stripe (blue / red / split). The card image's own title is unreadable at 104 px and the English art carries pre-errata text, so the UI renders titles itself. Sizes: desktop 104 px wide, tablet 94, phone 86, picker 138.

| State | Visual |
|---|---|
| Playable (in `prompt.cards`) | full colour; hover lifts 14 px and scales 1.04 with a white ring |
| Not playable during a card prompt | opacity .42, desaturated, `cursor:not-allowed` |
| Selected (headline, touch first tap, pickers) | lifted 18 px, 3 px `--me` ring |
| Warning on its option | amber ⚠ badge, top right; its text in the zoom and in the confirm dialog |
| Scoring card | red "MAY NOT BE HELD / 不得持有" band (card-art wording) |
| Modified Ops | chip "2→3" from `effectiveOps(card)` (green if up, red if down) |
| China Card | first slot, divided from the hand: art plus "PLAYABLE" (green), or the face-down design with "FACE DOWN", tooltip "playable next turn" |

* **Order:** scoring cards first (urgent), then Ops descending, then id. The order is stable within a turn, so cards do not jump around.
* **Overflow:** when cards plus gaps exceed the dock, cards overlap evenly (at least 64 px visible). Hover spreads the neighbours ±18 px.
* **Zoom:** desktop hover (350 ms delay), `Z` on the focused card, touch long-press (400 ms) or tap outside a card prompt. A 300×420 card appears anchored above the source (it flips to stay on screen) with an info strip: number, side, era, Ops, effective Ops now, "removed after event", and the warning text if any. In ZH the Chinese card image is used.

### 5.2 Opponent (AI) hand and the China Card

In the rail's opponent card: the avatar (radar, with a sweep while thinking), name, side badge, status line, a row of **card backs** (count = `aiHandCount`), and **known cards** (`aiKnownCards`) as chips with an eye icon. Clicking a chip zooms the card. Known cards also sort first in the backs row, drawn face-up at 22 px. The China Card status is "held by US / face down / playable". When the AI holds the China Card, a 22 px China mini-card appears next to its backs. When a reshuffle reveals hands (critique §3.4), the backs flip face up one by one (§11).

### 5.3 Piles

Deck / Discard / Removed chips at the map's top right show counts. A click opens the **pile viewer sheet**: a grid of mini cards with filters (side, era, Ops), sorted by id, plus "Removed (★)" and "Ongoing effects" tabs. It is read-only, and the same component serves as the event card picker (§6, event-card).

---

## 6. Prompts: the command panel, one design per `PromptKind`

Each prompt has the same skeleton (desktop 430×168, phone bottom sheet):

```
[card thumb 50×70]  KICKER: side emblem · AR n · card name (resolvingCard || pendingCard)      COUNTER (if remaining)
                    TITLE (prompt.title, rendered)                                               2/3  OPS LEFT  ●●○
                    sub/help (prompt.detail or the per-kind help)
[inline options or note]                                                      [secondary]  [PRIMARY ↵]   [Undo play Z]
```

* The panel border/top accent is `--me`, or `--ai` when the AI is acting. `aria-live="polite"` announces the new title.
* **Undo** ("Undo play", `Z` / Ctrl+Z) shows whenever `ViewModel.canUndo`. It always means "back to the start of this play" (the contract's undo), never one point.
* **Done** shows only if `prompt.done` exists. Its label comes from `doneMeaning`, with per-card overrides: pass → "Pass" ("Pass — keep the China Card" when only the China Card is left; "Skip action round 8" at AR8). stop → "Stop" (realign: "Stop realigning"; events: "Stop — leave the rest"). decline → "Decline". return → "Return the card" (Grain Sales). skip → "Skip". Overrides: Blockade "Lose W. Germany influence", SALT "Take no card", Our Man in Tehran "Done — return the rest", Star Wars "Continue (no card)", Eagle/Bear "Keep all cards", CMC payoff "Keep the crisis going".
* **Warnings (`option.warnings`):**
  * `opponent-event`: inline amber note, no dialog.
  * `scoring-stranded`: amber ⚠ badge on the option, plus a **confirm dialog** ("You would hold 2 scoring cards with 1 action round left; holding a scoring card at turn end loses the game").
  * `defcon-suicide`, `cmc-suicide`, `game-ending`: red ⚠ badge, plus a **blocking dialog** in danger style. "Cancel" is the default focus; the destructive button reads "Lose the game" / "End the game".
* **Confirmation policy:** mouse click = act, except where an action is irreversible *and* rolls dice (coup, space race) or the choice is committed blind (headline). Touch: the first tap selects and previews, a second tap or the primary button acts. Setting "Confirm before rolling dice" defaults to on.
* **Keyboard:** Tab/Shift+Tab walks legal targets (region order, then name), arrow keys move spatially between tiles, Enter chooses, 1–5 choose modes, Esc means back/cancel (never Done), Space skips animation.

| PromptKind | Where it appears | How the human chooses | Panel specifics |
|---|---|---|---|
| `setup-place` | map (camera auto-frames E. or W. Europe) | click a highlighted country, 1 influence per click | Title "Place 7 influence in Western Europe" / "6 in Eastern Europe"; counter `remaining`/total with pips; finishes at 0; Undo resets. |
| `bid-place` | map | same | **Own title:** "Bid: +2 influence — only where you already have influence" (avoids DS bug §3.5.3). |
| `headline` | hand | select a card (lifts into the panel's slot), then "Headline *card* ↵" | Two-step because it is blind. If `aiHeadlineHidden`, a face-down AI card sits in the panel. If the opponent must reveal first (Man in Earth Orbit perk), the AI card shows face up with "revealed". |
| `action-card` | hand (+ China Card) | click a playable card (touch: tap + Play) | Warnings shown on cards. Pass only if offered. Special copy by flag: **Quagmire/Bear Trap** "Discard a 2+ Ops card and roll 1–4 to escape" (dice → confirm); **Missile Envy** "You must play Missile Envy this round"; **AR8** "Optional extra action round". Persistent amber note when scoring cards ≥ rounds left. |
| `play-mode` | panel | **five mode tiles** in fixed order: Event, Influence, Coup, Realign, Space (keys 1–5) | Each tile shows effective Ops or the Space roll needed (from `effectiveOps`). Illegal modes stay visible but disabled. On an opponent card: Event = "their event, then your Ops"; Ops modes get the `opponent-event` ⚠. Space shows an inline confirm. A 6th tile, **UN Intervention**, appears for `un-intervention` options (Grain Sales). "Back" = Undo. |
| `op-mode` | panel | 3 mode tiles | Kicker names the granting card (Junta, CIA Created, ABM Treaty, Olympic boycott, Tear Down This Wall, Grain Sales return, UN Intervention…). "Decline" when `done` is offered. |
| `influence` | map | click a highlighted country; each click places 1 (costs 2 Ops in an enemy-controlled country) | **Counter "2/3 OPS LEFT"** with pips (`remaining`/`opsValue`). The hover tooltip shows before→after mini tiles, cost and "gains control". Your placements this play get `--me` pills. The China Card / Vietnam Revolts bonus is explained in the sub line when the card is the China Card. Done is absent unless the engine offers it. |
| `coup-target` | map | click a target to **lock** it (reticle + odds popover), then "Coup *country* ↵" or click again | The popover shows six die faces from `coupOdds` (USSR −n / US +n per face), "Success k/6", "*Side* takes control k/6", warnings (battleground → DEFCON drop and what it forbids; mil-ops progress) and red ⚠ for `endsGame` faces. Esc unlocks. Under Cuban Missile Crisis the warning is red. |
| `realign-target` | map | click a highlighted country; **each click rolls** | Counter "Rolls left n/N". The hover tooltip shows modifiers per side (adjacent control, more influence, superpower adjacency) once the engine provides them (gap §15). "Stop realigning" = done. |
| `event-target` | map | click; each click is one point | The title always says **verb, side, area and cap** ("Add USSR influence · Africa or SE Asia · max 1 per country"; "Remove US influence"). The ghost shows +1 or −1 accordingly. Counter `remaining`. Done only when `allow_early_stop`. **CMC payoff** (resolvingCard 40) has its own copy: "Cuban Missile Crisis is active. Remove 2 influence from Cuba to end it?" with "Keep the crisis going". |
| `event-card` | ≤ 4 options: inline chips in the panel; more: the **card picker sheet** (centred, scrim, `modern-board-cardpick.png`) | select a card (ring), then confirm; double-click/Enter | Location labels per card (Hand / Discard / Drawn). Picker title from the card (SALT, Star Wars, Aldrich Ames, Missile Envy giver, UN Intervention, Our Man in Tehran, Ask Not, Blockade, LADC, Eagle/Bear end-of-turn). The done label comes from doneMeaning plus overrides. |
| `branch` | panel (2 options) or sheet (> 2) | one button per branch with its consequence text | Warsaw Pact "Remove all US influence from 4 countries" / "Add 5 USSR influence (max 2 each)"; Olympics "Participate (dice, sponsor +2)" / "Boycott (DEFCON −1; sponsor gets 4 Ops)"; **Wargames** "End the game — opponent +6 VP" (red, double confirm) / "Continue". |
| `defcon-level` | **DEFCON sheet** (`modern-board-defcon.png`) | five big level tiles; illegal ones disabled | Each tile shows the level in its threat colour, its restriction text, and "improve / CURRENT / degrade". Level 1 carries a red ⚠ ("You lose") and a second confirmation. Summit shows only the ±1 levels the engine offers. |
| `region` (Chernobyl) | **map region mode** plus region chips in the panel | hover lights a whole region (land + tiles), click chooses; or chips | Sub: "The USSR cannot place Ops influence there for the rest of the turn." |

Forced and single-option decisions are auto-played by the controller (`Frame.auto`). The UI animates them with a small "auto" tag in the log and no prompt.

---

## 7. AI turn presentation

1. **Thinking** (`aiThinking`): the opponent card's avatar shows a radar sweep and the status reads "Thinking… 6 s" (seconds appear after 2 s). The command panel switches to AI mode: `--ai` accent, "USSR · Action round 3 / DeepStruggle is thinking…" and an **indeterminate** shimmer bar (never fake progress). The board stays fully inspectable (hover, zoom, log, card zoom). Because the contract's `minDelayMs` applies to every decision, the indicator appears on every AI decision and timing reveals nothing.
2. **Card reveal** (`card-played` by the AI; `modern-board-ai-turn.png`): a card back flies from the opponent card to the **stage** (450 ms), flips (380 ms) and holds next to a glass info panel: ribbon "USSR action round 3", title, mode chip (EVENT / INFLUENCE 3 / COUP 3 …), event summary, live result chips (+1 Guatemala, +2 El Salvador) and a progress hairline. **Smart placement:** the stage sits on the half of the map *away from* the affected countries, with a scrim only behind the stage, so the board animation stays visible next to the reveal. The hold is ≥ 1100 ms at 1× speed, then the card shrinks into the command panel thumbnail (350 ms) while the effects play.
3. **Effects** play in event order (§11). Follow-up AI decisions inside the same play (targets, modes) do not re-reveal the card. The command panel shows "Choosing targets…" and the stage stays pinned.
4. **Pacing controls** in the command panel during AI activity: speed segmented control (1×, 2×, Instant; default 1×) and **Skip ▸▸ (Space)**. Skip completes the current frame instantly. Shift+Space ("Skip to my turn") plays everything instantly until the next prompt. When `ViewModel.queued > 2`, the sequencer automatically speeds up by 1.6×.
5. **Last-move markers:** after the AI's play, every tile it changed keeps a delta pill until the human's next play ends. The log entry for the AI's play stays highlighted.

---

## 8. Scoring, headline, game over

* **Scoring popup** (`modern-board-scoring.png`). The sheet (440 px) slides in from the side of the map that does not cover the scored region (Middle East → over the Americas). Contents:
  * region-colour header bar, kicker "SCORING · *who*", title;
  * a table with US and USSR columns: Status pill, Countries, Battlegrounds, Status VP, Battleground VP, Adjacency VP (when > 0), VP total;
  * a net banner ("USSR +4") with a mini VP bar animating from the old to the new value;
  * "Continue (Space)".

  The region's tiles are spotlit and its scorecard is highlighted. The sheet auto-continues after 3.5 s at 1× unless "Pause on scoring" is on (default on for the human's own plays, off for the AI's). **Europe Control** and **final scoring** (after turn 10) run each region for 1.2 s, then the total. Southeast Asia lists its countries with per-country VP (Thailand 2).
* **Headline reveal** (`modern-board-headline.png`). A full-stage scrim holds two cards, **US left, USSR right**. Both flip together (520 ms). A "1 · RESOLVES FIRST" pill pops on the first card (ties: US), with the note "Higher Ops resolves first; on a tie the US goes first." Hold 1.4 s. The first card then moves to the command slot and resolves; the second follows. A face-down AI headline shows as a card back with "DeepStruggle chose its headline" while the human picks.
* **Game over** (`modern-board-gameover.png`). After a 600 ms beat, a blur scrim and a centred sheet: the side emblem tile with glow, kicker "Game over · Turn 8, action round 5", **Victory / Defeat / Draw** (56 px), the reason sentence, a **VP-over-the-game chart** (US up, USSR down, turn ticks), stats (final VP, cards played, coups per side, AI thinking time) and actions: Review the board (closes the sheet, board stays inspectable, a small "Game over · New game" chip remains), Copy game record, New game (primary). Reason copy per `EndingReason`:

| reason | EN | ZH |
|---|---|---|
| vp20 | "{side} reached 20 victory points." | "{side}达到 20 胜利点数。" |
| europe-control | "{side} controls Europe at Europe scoring." | "{side}在欧洲计分时控制欧洲。" |
| defcon | "DEFCON reached 1 on {loser}'s action: nuclear war." | "{loser}的行动使 DEFCON 降至 1：核战争爆发。" |
| cmc-suicide | "{loser} launched a coup during the Cuban Missile Crisis." | "{loser}在古巴导弹危机期间发动政变。" |
| held-scoring | "{loser} held {card} at the end of the turn." | "{loser}在回合结束时持有{card}。" |
| held-scoring-both | "Both sides held a scoring card at turn end: draw." | "双方在回合结束时都持有计分牌：平局。" |
| milops-vp20 | "The military-operations penalty pushed VP to 20." | "军事行动惩罚使 VP 达到 20。" |
| final-scoring | "Final scoring after turn 10: {side} +{n}." | "第 10 回合后最终计分：{side} +{n}。" |
| wargames | "Wargames ended the game: {side} +6 VP, then VP decides." | "战争游戏结束对局：{side} +6 VP 后按 VP 判定。" |
| resign | "{loser} resigned." | "{loser}认输。" |

---

## 9. Tracks (top bar)

| Track | Design | Interactions |
|---|---|---|
| Turn | "6 /10" + era pill (EARLY/MID/LATE WAR in the cards' teal; ZH 战争早期/中期/晚期) | Tooltip: era deck info, hand size, ARs this turn |
| Action round | 7 pairs of slots (USSR slot then US slot per AR), plus a dashed 8th for AR8. Past slots tinted by side, current slot = phasing side colour with a white ring; label "AR 2" (headline: "HEADLINE") | Tooltip: who has AR8 and why |
| VP | 230 px tug bar from US 20 (left) to USSR 20 (right), quarter ticks, centre line; fill from 0 to the puck in the leader's colour; puck shows \|VP\|; label "US +3" / "USSR +1" / "Even" | Tooltip: VP history sparkline; the puck animates (§11) |
| DEFCON | five 22 px chips 5→1, current lit in threat colour with ring and glow; DEFCON 1 numeral always red | Tooltip: restrictions ("No coups or realignments in Europe, Asia"); at ≤ 2 the chip pulses slowly |
| Mil ops | two 5-segment meters (★ US, ☭ USSR), required count (= DEFCON) as outlined segments; amber dot when the human is short in the last 2 ARs | Tooltip: penalty preview ("You would give the USSR 2 VP") |
| Space race | two 9-step tracks (0–8), marker ring at the current box | Tooltip: next box needs, roll, VP for first/second, privileges reached |

Phone condenses these: the top bar keeps turn/AR, VP (★ +3) and DEFCON; a 30 px strip holds mil ops, space and deck count. Tapping either opens the full tracks sheet.

---

## 10. Log panel

* Grouped by turn with sticky turn headers ("Turn 6 · Mid War"). Each **play is one entry**: 26 px side avatar (★/☭ on side colour; clock for system), "HL / AR3" tag, card name (hover = zoom; the card ref is underlined dotted), mode tag (icon + EVENT/INFLUENCE/COUP…), VP change chip. Details are compact chips: aggregated influence deltas per country (+2 Angola), dice (face icon + "2 +3 −6 = −1 · fail"), mil ops, effects started.
* The **live entry** (play in progress) has a 2 px left border in the actor's colour and fills in as frames arrive.
* System lines: turn start (DEFCON +1, deal), reshuffle (and what was revealed), mil-ops penalty, China Card passes, held-card end-of-turn, game over.
* Filters: All / Plays / Dice. Hovering a country chip pulses its tile on the map. Clicking a card ref zooms it. Auto-scroll to newest unless the user scrolled up, in which case a "Jump to latest" pill appears. "Copy log" is in the menu.
* Text comes from `LogEntry.text/details` (Messages rendered with the current language). Card and country params render as hoverable refs.

---

## 11. Animation catalogue (`GameEvent` → motion)

Durations are at 1× speed. 2× halves them; Instant swaps state and writes the log only. Layers: **map** (z 0) < **map overlays** (rings, ghosts, pills, dice tray anchors; z 5) < **HUD** (z 10) < **chrome** (top bar, dock, rail; z 20) < **flight layer** (cards, chips in flight; z 30) < **stage + scrim** (z 40) < **banners/toasts** (z 44) < **sheets** (z 45–50) < **tooltips/card zoom** (z 60). "Block" means the sequencer waits for the animation before the next event. "Par" means it runs in parallel with what follows.

| GameEvent | Animation | Duration / easing | Block | Skippable |
|---|---|---|---|---|
| `turn-start` | Full-width banner "TURN 4 OF 10 / MID WAR" through the map's middle; turns 4 and 8 add "Mid/Late War cards added to the deck" | in 350 ease-out, hold 900 (era turns 1300), out 350 ease-in | block | yes |
| `phase` HEADLINE | toast "Headline phase" | 1600 total | par | yes |
| `phase` ACTION_ROUND | none (AR events cover it) | — | — | — |
| `phase` GAME_OVER | 600 ms beat, then game-over sheet | sheet rise 480 spring, chart draw 900 | block | the beat only |
| `action-round` | AR slot fills (scale 0.6→1), phasing highlight glides, panel kicker crossfades | 280 ease-out | par | yes |
| `deal` | cards fly deck→hand (human) / backs fly to the opponent card (AI) | 380 each ease-out, stagger 70; total ≤ 1400 | block | yes |
| `reshuffle` | discard chip riffles into the deck chip (3 offset copies) + toast | 700 ease-in-out; toast 2400 | par | yes |
| `hand-revealed` | AI backs flip face up one by one (rotateY with the face swapped at 90°) + toast "Remaining hands are known" | 420 each, stagger 90 | block | yes |
| `card-played` (AI) | back flies to the stage → flip → reveal panel → hold → shrink into the command thumb | 450 + 380 + hold ≥ 1100 + 350, ease-out / ease-in-out | block | yes |
| `card-played` (human) | card glides from hand to the command slot | 280 ease-out | block | yes |
| `card-played` how=scoring | as above, then the scoring popup (§8) | popup in 360, rows count 600, hold 3500 or click | block | yes |
| `card-moved` | arc flight (quadratic, 40 px lift) to the pile chip / effects strip / hand / opponent card; source fades | 420 ease-in-out; batches stagger 60 | par (block if into a hand) | yes |
| `headline-chosen` | the chosen card (human) or a back (AI) slides into the headline slot | 360 ease-out | par | yes |
| `headline-reveal` | two-card stage, simultaneous flip, "first" pill pops | flip 520 (cubic-bezier .2,.7,.2,1), pill 200 spring, hold 1400 | block | yes |
| `influence` | tile pulse (scale 1→1.08→1), rolling numeral, floating "+n"/"−n" in the side colour rising 22 u, side-colour ripple ring; phone camera pans first if off-screen (350) | pulse 260 spring, numeral 220, float 700 (par), ripple 500; multi-country frames stagger 140 | block on the pulse only | yes |
| `control` | controller half **wipes** out from the divider, outline flash, emblem pop; loss = reverse wipe + desaturate | 320 ease-out (loss 240) | block | yes |
| `roll` | **dice tray** anchored to the target tile (coup/realign/war) or centre-stage (space, Olympics, Summit, trap escape). Coup: reticle lock-on 250, then the die tumbles (rotate ±540° with face flicker, landing on the real face), then the math line types in ("4 + 3 − 2 = 5"), success/fail tint. Realign: two dice, US left / USSR right, with modifiers | lock 250, tumble 650 ease-out, math 200, hold 900 | block | yes |
| `vp` | puck slides; fill grows or switches colour across 0; floating "+n US" under the bar | 520 ease-out-back; float 900 par | block | yes |
| `defcon` | lit chip moves; on reaching 2, one orange edge-vignette pulse + toast "DEFCON 2 — a coup in a battleground would end the game"; on 1, white flash 120 → red glow 900 (reduced motion: static red frame) | 400 ease-in-out; vignette 900 | block | yes |
| `milops` | segments fill left to right | 240, stagger 40 | par | yes |
| `space` | marker hops one box with a small arc and sparkle; a first-to-box VP event follows | 420 ease-out | block | yes |
| `scoring` | see popup; region spotlight 300 | — | block | yes |
| `effect-on` | chip flies from the stage/command thumb to the effects strip and settles with a spring; "THIS TURN" tag for turn-limited effects | 420 + 200 spring | par | yes |
| `effect-off` | chip fades and collapses its width | 260 ease-in | par | yes |
| `china-card` | the China Card flies between the players' areas, flipping to face down when not playable + toast | 600 ease-in-out | block | yes |
| `game-over` | see phase GAME_OVER; the VP chart line draws | 900 | block | the beat only |

**Sequencer (React):** a `useFrameSequencer(frame)` hook turns `Frame.events` into steps of `{run(): Animation[], block: boolean}` using WAAPI `element.animate(...)` and awaits `Promise.all(anim.finished)` for blocking steps. When the steps finish it swaps in `frame.state`, then calls `controller.ackFrame(seq)`. Skip calls `anim.finish()` on everything running and runs the remaining steps at Instant. Map-anchored effects render in an SVG overlay group inside the map (same coordinates). Flights render in a fixed HTML layer, with endpoints from `getBoundingClientRect` of the registered anchors (`deck`, `discard`, `removed`, `hand:US`, `hand:USSR`, `opp`, `command`, `effects`, `headline:US/USSR`, `tile:<id>`). Every animation's end state equals the next rendered state, so a skipped or cancelled animation can never leave stale DOM.

---

## 12. Reduced motion

Active when the OS asks for it (`prefers-reduced-motion: reduce`) or Settings › Motion = Reduced (system / reduced / full).

* Flights become a fade-out at the source plus a fade-in at the destination (150 ms). Flips become cross-fades. Dice show the final face with the math line (fade 150). There are no camera pans (cuts), no breathing halo (static ring), no vignettes, flashes or radar sweep (a static "Thinking…" dot), and count-ups are instant.
* **Holds stay**, because they are reading time, not motion. The default speed stays 1×, and "Fast" is suggested in the settings hint.
* The start-screen table is static. No element moves more than 8 px.

---

## 13. Accessibility

* **US vs USSR without colour:**
  * **position:** West-left everywhere (§1);
  * **emblem:** ★ vs ☭ on every side badge, log avatar, track tag, effect chip and controlled tile (zoom ≥ 0.8);
  * **words:** US/USSR (美国/苏联) on badges, tooltips, log and score tables;
  * **luminance:** the controlled half is solid with white numerals, against coloured numerals on a light body.

  Optional **Patterns** setting: USSR fills get a 45° hatch, US fills stay solid.
* Battleground is gold chip **and** dark strip. Legal targets are white ring **and** dimming of the rest. Warnings are icon **and** text **and** colour.
* **Keyboard:** everything is reachable (§6 keys; `?` lists shortcuts). The focus ring is a 2 px white outline at 2 px offset, or the 5 u tile ring on the map.
* **Screen readers:** each tile is a `role="button"` (only while it is a legal target; otherwise `role="img"`) with a label such as "Angola, Africa, stability 1, battleground, US 0, USSR 2, USSR controls, legal target". The command panel is a labelled region with `aria-live="polite"` for the prompt title. AI plays and dice results are announced through a polite live region ("USSR played Liberation Theology as an event: Guatemala +1, El Salvador +2"). Dialogs trap focus and return it afterwards. New prompts announce rather than steal focus.
* Touch targets are ≥ 40×40 px (tiles get padded hit rects). Text is ≥ 11 px (CJK 12 px). Body contrast is ≥ 4.5:1 (§2.1). No information depends on hover alone: every tooltip is also reachable by focus or long-press.

---

## 14. Language switch and settings

* **Language:** an `EN | 中文` segmented control in the top bar (desktop) or under ☰ (phone), and on the start screen. It switches instantly without reload, re-renders Messages, swaps card images (`/cards/zh/`; the other language is prefetched at idle) and persists (`localStorage`, behind `?lang=`). The layout tolerates both languages: Chinese titles are shorter, CJK gets a minimum of 12 px, and caps/letter-spacing are turned off under `:lang(zh)`. The glossary follows ARCHITECTURE.md (DEFCON, 调整, 战争早期/中期/晚期, 不得持有).
* **Menu ⋮:** New game · Resign (confirm) · Settings · Copy game record · Rules (GMT living rules ↗) · About & credits (DeepStruggle MIT, GMT disclaimer).
* **Settings** (right drawer, 360 px):

| Group | Setting |
|---|---|
| Language | EN / 中文 |
| Animation | speed 1×/2×/Instant; motion system/reduced/full; pause on scoring (on) |
| Play | confirm before rolling dice (on); confirm risky moves (always on for game-ending warnings, toggleable for scoring-stranded); auto-frame camera on desktop (off); show coup odds (on) |
| Display | region "if scored now" cards (on); last-move markers (on); patterns for colour-blind play (off); log open by default (on ≥ 1280 px) |

---

## 15. Contract gaps found while designing (for the coordinator)

1. **Option preview.** The design shows hover previews (influence cost 1 or 2, the after-state "gains control", event-target +1/−1, realignment modifiers and odds). The contract offers only `coupOdds` and `effectiveOps`. Proposal: `previewOption(promptId, idx): { state: PublicState; rolls?: DieRollState[] } | null`, a generic snapshot → step → restore that also covers realign odds (36 die pairs) and event targets. Until it exists, the UI derives cost and control from stability and control status, which restates the rule.
2. **Event-target semantics.** `Prompt` has no structured verb or side for POINT_NODE events: add or remove, whose influence. The UI needs them for the ghost and the title, and they are only inside the `title` Message. Proposal: `effect?: { verb: "add" | "remove"; side: Side; area?: Message }`.
3. **AI decision context.** The UI cannot tell whether the AI's upcoming frames belong to the same play, which decides whether to re-reveal the card. Proposal: `Frame.playId` (monotonic per card play), or `aiPlayCard` on the ViewModel.
4. **Card-location vocabulary.** `card-moved.from/to` strings need a documented enum (DRAW_DECK, DISCARD_PILE, REMOVED_FROM_GAME, ONGOING_EVENT, HAND_US_*, HAND_USSR_*, HEADLINE_*, PEEKED_TEMP) so the flight layer can map them to anchors.
5. **Effect metadata.** `effect-on/off.flag` needs a side and duration (permanent / this turn / until event) for the chip's emblem and the "THIS TURN" tag. This can be a static table in the UI layer (i18n `effects` already has names), but it should be shared.
6. **Thinking time.** `aiThinking` is a boolean. The UI times it itself, which is fine; the game-over "AI thinking" stat needs the per-move `ms` (`AiPlayer.choose` returns it) to be accumulated by the controller (e.g. `ViewModel.aiStats`).

---

## 16. Implementation notes (React + SVG + CSS)

* **Component tree:** `App` → `StartScreen` | `GameScreen` { `TopBar`(`TurnTrack`, `ArTrack`, `VpBar`, `DefconTrack`, `MilOps`, `SpaceTrack`, `LangSwitch`), `MapView`(`Camera`, `LandLayer`, `EdgeLayer`, `RegionCards`, `TileLayer`→`Tile`×84 memoized by `(influence, control, state flags)`, `OverlayLayer`), `Rail`(`OpponentCard`, `LogPanel`), `Dock`(`Hand`→`MiniCard`, `CommandPanel`→per-kind body), `Stage`, `Sheets`(`CardPicker`, `DefconSheet`, `ScoringSheet`, `HeadlineStage`, `GameOverSheet`, `PileViewer`, `Settings`), `FlightLayer`, `Toasts` }.
* **Map rendering:** a single `<svg>` with the viewBox as the camera, `vector-effect` not needed. Tiles are plain SVG (no `foreignObject`). Text fitting runs once per language: measure with `getComputedTextLength`, cache the per-country font size and `textLength`. Spotlight is a CSS class on the tile group, so there is no re-layout.
* **Performance:** 84 tiles + 112 edges is light. Breathing halos use CSS opacity animation on ≤ 84 elements and pause when `document.hidden`. Avoid SVG filters on animated elements; the goo/blur filters here are static placeholder land.
* **Theming:** all colours via the tokens; `body.me-ussr` swaps `--me/--ai`. No inline hex in components (the mockup's inline styles are mockup-only).
* **Files to reuse from the mockup:** tokens (`mockup.css` §1), tile geometry (`tileSVG`), region scorecard positions (`CARD_POS`), the hammer-and-sickle path (`I.sickle`), ops badge (`opsBadge`), card back and China face-down CSS, VP bar maths (`50 − vp/20·50 %`).

## 17. Open questions

1. Self-host Barlow Semi Condensed (about 36 KB) for consistent tile names, or rely on system condensed faces?
2. Should "if scored now" scorecards be on by default for new players (information-forward), or off (the pure board look)? This proposal says on.
3. Is the stage reveal hold (≥ 1.1 s) right for experienced players? The 2× speed preset may be the better default once tested.
4. Errata: the English card images are pre-errata (map-i18n §6.1). The zoom info strip can carry an "Errata" note per card until the images are redrawn.
