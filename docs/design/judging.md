# Judging the three design proposals

Judge: design-synth · 2026-11-22 · Inputs: `proposal-{situation-room,modern-board,mobile-clarity}.md`, all 52 screenshots
in `docs/design/shots/` (18 + 18 + 17 images, each one viewed), the mockup sources, `src/game/contract.ts`,
`docs/ARCHITECTURE.md` and `docs/notes/critique.md`.

Scores are 1–10 per criterion. A 10 means that nothing better is needed for the site's goal (better animations and a better
interface than the existing DeepStruggle front ends), not that nothing could be improved.

## Scorecard

| Criterion | Situation Room | Modern Board | Mobile Clarity |
|---|:-:|:-:|:-:|
| 1. Game state at a glance | 8 | 8 | **9** |
| 2. Beauty / atmosphere | **10** | 7 | 6 |
| 3. Animation potential | **9** | 8 | 7 |
| 4. Decision UX (every `PromptKind`) | **9** | **9** | **9** |
| 5. Phone usability | 6 | 7 | **9** |
| 6. Bilingual robustness (zh lengths, CJK fonts) | **8** | **8** | **8** |
| 7. Accessibility | 8 | 8 | **9** |
| 8. React / SVG feasibility | 8 | **9** | 8 |
| **Total (of 80)** | **66** | 64 | 65 |

The totals are close. They don't pick the base. The base is chosen by the criteria that are hardest to graft on later:
identity (2) and motion (3) shape every component, while phone layout (5) and accessibility (7) are mostly
arrangement and behaviour that can be specified on top of any identity. **Base: Situation Room.** Its phone layout is
replaced by Mobile Clarity's, and several Modern Board systems are grafted in (see `ui-spec.md` §0).

---

## Situation Room — 66

**What it is.** A lit paper chart on a dark war table. A console of instruments runs along the top, a dossier rail on the right, and a
tray at the near edge with an orders slip, the hand, the China Card on felt, and the piles.

1. **Clarity 8.** The map is the only bright, coloured object. That one decision makes the board readable at a glance
   in every shot (`situation-room-desktop-en.png`). Country boxes keep the physical board's grammar (region band,
   stability box, two counter slots), so veterans read them without learning anything. The orders slip answers
   *what / how much is left / undo* in one place. Weak spots: the console's 9.5 px caps sub-labels are at the edge of
   legibility, and the region plates show standing (PRES/DOM) but no "if scored now" net, which Modern Board has.
2. **Beauty 10.** The strongest identity of the three, and the only one that looks like no other TS client: paper grain,
   stencil type, cardboard counters that *flip* to the solid side when controlled, newspapers for headlines, a telex
   for game over, and a teleprinter log. It is consistent everywhere: the start screen's dossiers and the coin are part
   of the same world. It is also restrained. Chrome is dark and recedes, and there is one stamp per view at most.
3. **Animation 9.** The metaphor supplies the motions for free: counters drop with a "thunk", markers flip on
   control, newspapers drop and fold into a reveal dock, rubber stamps land, the teleprinter types, DEFCON lamps
   flicker. The catalogue (§11) covers all 22 events, with grouping rules (merge influence + control on one country,
   120 ms stagger between countries) and a speed formula. Each motion has a reduced-motion variant that keeps the
   information.
4. **Decision UX 9.** The most careful confirmation model: instant for undoable clicks, staged select-then-confirm
   for dice and play-ending actions, a 1.2 s hold for game-ending ones. Play-mode as a centre-stage card with a grouped Operations row and
   one shared `opponent-event` footer is the best treatment of that prompt in any proposal. Branch, DEFCON-level and picker dossiers
   are drawn. It docks a point for the "stage the last point" rule, which needs per-click cost data the contract
   lacks (its own gap G1).
5. **Phone 6.** A phone layout exists (`situation-room-phone.png`) and the auto-framed Middle East reads well, but
   the stack of console + theatre chips + slip + hand strip + a 52 px tab bar leaves the map about 45 % of the
   height. The hand strip is always open even when the prompt is not about cards. Theatre chips have no target
   counts. There is no tap-safety rule for dense clusters at low zoom.
6. **Bilingual 8.** Explicit Chinese rules: no caps, reduced tracking, +1 px under 13 px, weight 700 for map names,
   serif only at ≥ 19 px, and short names as i18n keys. `unicode-range` Latin subsets let mixed strings render
   correctly. One bug: the Latin subset includes U+2018–201E and U+2026, so Chinese curly quotes and ellipses would
   render in Barlow instead of the CJK font. Fixed in the final fonts.css with a separate Latin-1-only registration for
   `:lang(zh)`.
7. **Accessibility 8.** Side never by colour alone (position, shape, glyph, word, optional hatch). The two-tone target
   ring was measured and fixed against the sea (1.1:1 → 6.4:1 with the ink edge). Spatial arrow-key navigation, a
   screen-reader label for every country, and a log mirror. It loses points for small console text and for having no
   list alternative for picking map targets.
8. **Feasibility 8.** Plain SVG plus CSS plus WAAPI, with a sensible component sketch. It needs care: the paper grain and glow
   are live SVG filters in the mockup and must become a static texture and pre-blurred strokes. 140 KB of fonts is acceptable
   but can be trimmed (the final design ships 117 KB).

## Modern Board — 64

**What it is.** A polished digital board game: dark ink chrome, a deep-ocean map with bright tiles, hue-free white
spotlight targeting, and a fixed command panel at the bottom right.

1. **Clarity 8.** The "if scored now" region scorecards are the best single information feature across the
   proposals: the player sees the consequence of the board, not only its state. The hover tooltip with before → after
   mini tiles is excellent. But tile names at board scale 0.49 are about 10 px, and the fully saturated controller halves
   plus region strips make the board loud at the world view (`modern-board-desktop-en.png`). The eye has no
   resting place.
2. **Beauty 7.** Competent and clean, with good dark-UI craft, but generic: it would look the same for any card game,
   and the goo-blob continents make the mockup look unfinished. The start screen (the tilted live map) is its best
   piece.
3. **Animation 8.** The catalogue is complete and *engineered*: blocking versus parallel steps, an anchor registry for
   flights (`deck`, `hand:US`, `tile:<id>`…), and "every animation's end state equals the next rendered state". Smart
   placement puts the AI reveal on the half of the map away from the affected countries. That is a key idea for the AI turn,
   and the final design adopts it.
4. **Decision UX 9.** One panel per `PromptKind`, all drawn on the anatomy sheet (`modern-board-anatomy.png`), so it is the
   only proposal that *shows* every kind. Per-card `done` labels (Blockade, SALT, Our Man in Tehran, Eagle/Bear, the CMC
   payoff) and a clear warning policy. Its confirm *dialogs* for `scoring-stranded` are heavier than they need to be.
5. **Phone 7.** Pan/zoom, region chips with target counts, a minimap, and a bottom-sheet command panel. But the hand
   strip at the bottom is permanently open and large, and four stacked bars (top bar, track strip, opponent bar, chips)
   eat the top third.
6. **Bilingual 8.** Good Chinese short forms (西葡, 比荷卢, 东南非 …), 12 px CJK minimum, `:lang(zh)` overrides on every caps
   label. With system condensed fonts only, tile names fit differently per OS (the proposal says so itself and
   recommends a small self-hosted face).
7. **Accessibility 8.** "West is left" everywhere is a strong rule. Rings with dimming, keyboard, and SR labels are all good. Risk:
   the danger colour (coral `#ff5c61`) is close to the USSR red (`#e0393e`). It is paired with ⚠ and text, but a red
   hazard next to red markers is the confusion the other two proposals designed out.
8. **Feasibility 9.** Flat SVG tiles, no textures, no filters in production, clear component tree, VP-bar maths,
   sequencer design. The easiest to build.

## Mobile Clarity — 65

**What it is.** Mobile-first and accessibility-first: "one question, one place". A light paper map, deep navy chrome,
amber meaning "you can act here", and a thumb-zone action panel.

1. **Clarity 9.** The action panel is the clearest decision surface across the proposals: a who-line, a breadcrumb
   (`AR 3 › Shuttle Diplomacy › Influence`), a big counter, an ops bar, a one-line hint, progress chips, and undo. Only the
   *exception* to the influence cost gets a tag ("2 OPS"), which teaches the rule exactly where it applies. The recap
   line of the AI's last play is a simple, high-value idea. Moving stability between the two tokens is clever but
   breaks the board's grammar, and veterans would find it odd.
2. **Beauty 6.** Clean and friendly, but generic app chrome. The thick box borders and halos make the map heavy at
   the phone zoom (`mobile-clarity-phone-influence.png`).
3. **Animation 7.** The catalogue is complete and sensible (ordering inside a frame, catch-up speeds when the queue grows,
   "skip to my turn"), but there is little to *love*. Nothing in the motion language is specific to this game.
4. **Decision UX 9.** Same-spot second tap for confirmation (the thumb never travels), the hold for game-ending
   choices, the card sheet that lists every mode with its consequence line, and a target-list alternative for map
   prompts. Branch, DEFCON-level, region and picker panels are specified but not drawn. It assumed per-point undo,
   which the contract does not offer (undo goes back to the start of the play), and an optimistic placement display
   that the synchronous controller makes unnecessary.
5. **Phone 9.** The best by a margin: thumb zone, a hand that collapses to a bar when not needed, smart camera focus,
   region chips with counts, **tap safety** (zoom before acting on a dense cluster at low zoom), +/− buttons as the
   multipoint-gesture alternative, a phone-landscape layout, and safe-area handling.
6. **Bilingual 8.** A CJK-first stack under `:lang(zh)`, a 12 px minimum, and short-name tables proposed as i18n keys. The Chinese
   screenshots hold up (`mobile-clarity-phone-influence-zh.png`).
7. **Accessibility 9.** The target-list sheet (an accessible alternative to the map, and what screen readers use), measured
   contrast, 44 px targets, timing (WCAG 2.2.1: "Pause on reveals"), and hazard stripes instead of red for danger.
8. **Feasibility 8.** Straightforward, but the optimistic UI with rollback and the three-level semantic zoom add state.
   The final design keeps the zoom levels (reduced to label and detail switches) and drops the optimism.

---

## What the synthesis takes from each

| From | Taken into the final design (`ui-spec.md`) |
|---|---|
| **Situation Room (base)** | Identity and materials, tokens, typography, desktop grid (console / table / rail / tray), country-box anatomy and counter shapes, two-tone brass rings (quiet > 12 targets / loud ≤ 12), grease-pencil marks, orders slip, play-mode stage, newspapers, scoring sheet, telex game over, dossier modals, the confirmation model, and the animation table as the backbone of the catalogue |
| **Mobile Clarity** | The whole compact (phone) layout: thumb-zone sheet, collapsed hand in a bottom dock, theatre chips **with target counts**, smart camera focus, tap safety, +/− buttons, target-list sheet, the big remaining counter and breadcrumb inside the slip, "2 OPS" tags on exception targets only, the AI recap ticker, same-spot second tap, the card sheet with modes on touch, `done` labels by `doneMeaning` × card, "Pause on reveals" and the speed set (slow / normal / fast / instant) |
| **Modern Board** | "If scored now" net on region plates, smart placement of the AI reveal away from the affected countries, the speed control and Skip in the slip during AI turns, the sequencer's block/par model and anchor registry, delta pills (+n / −n in the actor's colour) for the AI's last play instead of anonymous dots, hand ordering (scoring cards first), the pile viewer = card picker, the VP-by-turn chart on game over, the rule chips and save summary on the start screen |

## Corrections made while synthesizing

* **Undo granularity** (MC G6/G7): the contract's undo goes back to the **start of the current play**, only while a human
  prompt is open (`ViewModel.canUndo` is false otherwise; see `controller.ts` `undoAllowed`). The label is always "Undo
  play". There is no per-point undo and no undo while the AI thinks.
* **No optimistic UI** (MC §6.1 step 3): `choose()` applies the step synchronously and emits a frame, so the UI animates
  the real result within one tick.
* **Curly quotes and ellipses in Chinese** (SR fonts): see criterion 6 above. Fixed in `src/ui/theme/fonts.css`.
* **Region band contrast:** SR's South America band (`#578f5f`) gave ink names 4.3:1, below AA. It is now `#64a06b` (5.2:1).
  The Eastern Europe band uses paper text (5.9:1). Both are pinned by `tests/theme/tokens.test.ts`.
* **Tray height:** SR's 162 px tray clipped the slip hint at 1366×768. The final tray is `clamp(152px, 18.5vh, 184px)`,
  and below 820 px of height the hint clamps to one line.
* **Console overflow 1200–1439 px:** the full console needs about 1420 px. Between 1200 and 1439 px the turn track collapses to
  "5/10 · Mid War" and the VP gauge narrows (`final-desktop-1366.png`).
