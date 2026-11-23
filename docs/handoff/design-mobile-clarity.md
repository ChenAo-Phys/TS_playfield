# Handoff: design-mobile-clarity

## What I built
A complete UI/UX design proposal for the game screen and the start screen, with the angle **mobile-first and
accessibility-first**: one-handed phone play, progressive disclosure, large touch targets, and zero ambiguity about what
to do next. It scales up to a full desktop layout.

| file | what |
|---|---|
| `docs/design/proposal-mobile-clarity.md` | **The spec.** Principles; palette as CSS tokens; typography with CJK stacks (system fonts only); layout for desktop, tablet, phone portrait and phone landscape; map style; country-box anatomy and the semantic zoom levels L0/L1/L2; box states (target, hover, selected, cost, odds, cap); camera and smart focus; hand, China Card and AI hand (backs + known); the shared Action-panel anatomy; UX for all 14 PromptKinds plus the step-by-step influence flow; done labels by `doneMeaning`; warning styles; AI-turn presentation and pacing; tracks; log; headline reveal; scoring popup; game over with a sentence per `EndingReason`; an animation catalogue covering all 22 `GameEvent` types (duration, easing, layer, hold, skip, reduced-motion variant) and a z-order; reduced motion; accessibility with measured contrast ratios; language switch; settings; start screen; contract gaps G1–G12 with fallbacks; React implementation notes |
| `docs/design/mockup-mobile-clarity.html` | Static responsive game-screen mockup (works from `file://`). `?state=influence\|card\|coup\|ai\|headline\|scoring\|over`, `?lang=en\|zh`, `?focus=world\|auto` |
| `docs/design/mockup-mobile-clarity-start.html` | Start screen. `?lang=en\|zh`, `?save=0\|1` |
| `docs/design/mockup-mobile-clarity-assets/mc.css` | Design tokens (normative) + mockup layout/components |
| `docs/design/mockup-mobile-clarity-assets/mc-app.js` | Mockup renderer (vanilla JS: SVG map, boxes with L1/L2 levels, panels, overlays) |
| `docs/design/mockup-mobile-clarity-assets/mc-data.js` | GENERATED: 84 countries (board positions, short names EN/ZH, stability, BG, region, subregions, neighbours, superpower adjacency normalised to "US"/"USSR") + 110 card titles/meta |
| `docs/design/mockup-mobile-clarity-assets/build-data.mjs` | Generator for `mc-data.js` from `docs/notes/countries.json` + `cards_meta.json`; it also holds the proposed short-name tables (move them into i18n `map:short.<id>`) |
| `docs/design/mockup-mobile-clarity-assets/shoot.mjs` | Playwright screenshot script |
| `docs/design/shots/mobile-clarity-*.png` | 17 screenshots: desktop 1440×900 (influence EN/ZH, coup, card, ai, headline, scoring-zh, over), phone 390×844 (influence EN/ZH, card, ai), phone landscape 844×390, tablet 820×1180, start (desktop EN/ZH, phone) |

## How to run
```bash
node docs/design/mockup-mobile-clarity-assets/build-data.mjs          # regenerate mc-data.js
source scripts/pw-env.sh && node docs/design/mockup-mobile-clarity-assets/shoot.mjs [filter]   # e.g. "phone"
# or open docs/design/mockup-mobile-clarity.html?state=coup&lang=zh in a browser
```

## Key decisions other workstreams should know
- **Side grammar**: US = blue, LEFT/top, rounded-square token, ★. USSR = red, RIGHT/bottom, chamfered-octagon token,
  hammer & sickle. This includes the VP bar (US on the left).
- **Country box 104×70 map units** in the board's 2448×1584 space (`ref_x/ref_y`). **Stability sits between the two
  tokens on the divider** (a deliberate change from the board) so the name gets the full strip. Battleground = indigo
  strip + indigo stability circle (never red). Control = solid token + 4 u inner frame in the controller's colour.
  World-fit viewBox `40 56 2376 1384`. The map agent's land should use the same unit space.
- **Amber (`--act-500`) means "you can act here"** and is never a side colour. Warnings are amber; game-ending
  warnings use hazard stripes plus press-and-hold.
- **Interaction rule**: undoable actions take one tap; irreversible ones (dice, reveals, headline) take two taps in the
  same spot; game-ending ones take a 1.2 s hold.

## Known issues / limits of the mockup
- Continents are metaball placeholders (an SVG filter, which is mockup-only and not for production). Legal targets,
  scoring numbers and odds are hand-made to look plausible.
- Not drawn, only specified: the event-card picker grid, the branch/DEFCON/region panels, the L0 overview, the settings
  and menu sheets, and the target-list sheet.
- `npx tsc --noEmit -p .` passes (I own no TS files).

## Contract gaps (details and fallbacks in proposal §15)
G1 `PromptOption.irreversible` · G2 influence cost per option · G3 event placement `effect`/`affects`/`placedThisRun` ·
G4 `playModes(card)` preview · G5 `CoupOdds` lacks `defconAfter`/`milOpsAfter`; no realign/space odds · G6 `undo()`
granularity unspecified · G7 is undo allowed (and does it cancel the AI) while the AI is thinking? · G8 no reason for
illegal cards · G9 effect metadata (flag → card/side/duration) not in the contract or data · G10 the AI's `card-played` arrives before
its mode and target · G11 per-event VP source · G12 a short and a long prompt text.
