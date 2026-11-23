# Handoff: design-situation-room

## What I built

A complete UI/UX proposal for the game and start screens in the "situation room / war table" direction, plus a static
mockup that renders it with the real card images and real country data.

| File | What |
|---|---|
| `docs/design/proposal-situation-room.md` | **The spec.** Identity (tokens, materials, type with CJK stacks), layouts per breakpoint, map + country-box anatomy and states, cards/hand/China Card/AI hand, UX for every `PromptKind` (+ `done` meanings, warnings, staged and hold-to-confirm), AI turn presentation, tracks, log, headline/scoring/game-over/start, language switch, settings, animation catalogue per `GameEvent`, reduced motion, accessibility, React component sketch, contract gaps G1–G8 |
| `docs/design/mockup-situation-room.html` | Static mockup shell (no engine, no React) |
| `docs/design/mockup-situation-room-assets/sr.css` | Design tokens (§1 — copy verbatim into `src/ui`) and all component styles incl. breakpoints |
| `docs/design/mockup-situation-room-assets/sr.js` | Scene renderer: map SVG, console, rail, tray, slip, prompts, overlays, start, game over; EN/ZH strings |
| `docs/design/mockup-situation-room-assets/board-data.js` | Generated: 84 relaxed box positions (viewBox 1775×1090, box 88×56), edges, warped land paths per region class, card meta |
| `docs/design/mockup-situation-room-assets/build-board.mjs` | Generator for the above (board positions ×0.75 + overlap relaxation; Natural Earth 110 m land warped by a thin-plate spline onto the boxes) |
| `docs/design/mockup-situation-room-assets/shoot.mjs` | Serves the repo on an ephemeral port, screenshots every scene, quantises PNGs, stops the server |
| `docs/design/mockup-situation-room-assets/fonts/` | 6 OFL Latin WOFF2 subsets (≈140 KB) + `fonts.css` + `LICENSES.txt` |
| `docs/design/shots/situation-room-*.png` | 18 screenshots (5.1 MB): desktop EN/ZH, phone EN/ZH, start EN/ZH, tablet, action+zoom, play-mode, coup, AI reveal, headline, scoring, DEFCON choice, card picker, game over |

## How to run

```sh
source scripts/pw-env.sh
node docs/design/mockup-situation-room-assets/shoot.mjs            # all shots
node docs/design/mockup-situation-room-assets/shoot.mjs desktop-en # one shot
node docs/design/mockup-situation-room-assets/build-board.mjs      # regenerate board-data.js
```

To browse it interactively, serve the repo root over http (fonts don't load from `file://`) and open
`/docs/design/mockup-situation-room.html?scene=influence&lang=zh` (scenes: action, influence, playmode, coup, ai,
headline, scoring, defcon, picker, over, start; `&view=phone` for the phone layout).

## Reusable for implementers

* Tokens: `sr.css` §1. Country box constants: 88×56 units, band 19, markers 31×30, US square / USSR chamfered chip.
* Glyph paths `STAR` and `HS` (hammer & sickle) in `sr.js`; seals; card back and China face-down are CSS (to be made SVG).
* `build-board.mjs`: the relaxed layout and TPS-warped continents may help the map agent (it reads
  `docs/notes/countries.json`, `world-atlas`, `topojson-client`; output is a plain JSON blob).
* Hand fit algorithm (`fitHand` in `sr.js`): overlap only as much as needed; captions reserve the covered strip.

## Known issues / limits

* Static mockup: the scene states are hand-made (Turn 5, human = USSR); some scenes reuse the hero's console values
  (e.g. headline shows "AR 3" while the papers say Turn 6). Region standings, scoring numbers and log lines are mocked.
* The hammer-and-sickle path is a simplified drawing; fine at 7–24 px, worth a proper redraw for large seals.
* The mockup's map uses SVG filters (paper grain, glow) — the spec says to replace them with static textures and
  pre-blurred strokes in production for phone performance.
* Fonts: if shipped, add the OFL text + notices to `THIRD_PARTY_LICENSES.md` (owner: whoever owns that file).
* `npx tsc --noEmit -p .` passes (it only covers `src/`; my files are docs and plain JS).

## Gaps in the contract (details in the spec §15)

G1 generic option preview (influence cost 1 vs 2, control flip, "this click ends the run" for staged confirm);
G2 reason codes for non-playable hand cards; G3 realignment odds; G4 plays left this turn; G5 mil-ops penalty preview;
G6 effect metadata for `effect-on` flags (port DS `EFFECT_INFO_MAP`); G8 space-race box table via `src/data`.
G7 (last AI play countries) is derivable from frames. None blocks the design.
