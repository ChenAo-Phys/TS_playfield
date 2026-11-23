# Handoff: design-modern-board

## What I built
A complete UI/UX proposal for the game and start screens in the **modern board** direction (a polished digital board game: dark ink chrome, a deep-ocean map, bright paper country tiles, hue-free white "spotlight" targeting, and the rule "West is left": US always left, USSR always right). The proposal comes with static, clickable-looking mockups rendered from the real card images and real country positions.

| File | What |
|---|---|
| `docs/design/proposal-modern-board.md` | **The spec**: tokens, typography (CJK stacks, no big webfonts), layouts per breakpoint (desktop ≥1280 / ≥1600, tablet, phone portrait and landscape), map geometry and tile anatomy and states, connections, camera, region scorecards, hand/cards/China Card/AI hand, the UX of **every PromptKind**, warnings and confirmation policy, AI turn presentation and pacing, tracks, log, scoring/headline/game-over, an **animation catalogue per GameEvent** (duration, easing, layer, block, skippable), reduced motion, accessibility, language and settings, contract gaps, React implementation notes |
| `docs/design/mockup-modern-board.html` | Game screen. `?state=influence` (default) `\|coup\|ai\|scoring\|headline\|defcon\|cardpick\|gameover`, `&lang=zh`, `&rail=0`. Responsive: desktop / tablet / phone layouts via CSS |
| `docs/design/mockup-modern-board-start.html` | Start screen (`?lang=zh`) |
| `docs/design/mockup-modern-board-anatomy.html` | Component sheet: palette, type, emblems, dice, ops badges, annotated tile, 13 tile states, 11 card states, tracks, **12 command-panel variants covering every PromptKind + AI thinking**, banners/toasts |
| `docs/design/mockup-modern-board-assets/mockup.css` | Tokens (§1 is normative) + component CSS |
| `docs/design/mockup-modern-board-assets/mockup.js` | Vanilla renderer (`window.TSM`: `tileSVG`, `mapSVG`, `miniCard`, `opsBadge`, icons incl. the hammer-and-sickle path, VP bar maths, region-scorecard positions `CARD_POS`) |
| `docs/design/mockup-modern-board-assets/build-layout.mjs` → `layout.js` | Generates the map data (world crop, tile size, countries, edges, card titles) from `docs/notes/*.json` |
| `docs/design/mockup-modern-board-assets/shoot.mjs` | Playwright screenshots of all states (18 PNGs) |
| `docs/design/shots/modern-board-*.png` | desktop-en, desktop-zh, desktop-1920, tablet, phone, phone-zh, start, start-zh, start-phone, coup, ai-turn, scoring, headline, defcon, cardpick, gameover, anatomy, anatomy-zh |

## How to run
* Open any mockup HTML directly (`file://`); no build step and no network needed.
* Regenerate the layout data: `node docs/design/mockup-modern-board-assets/build-layout.mjs`
* Screenshots: `source scripts/pw-env.sh && node docs/design/mockup-modern-board-assets/shoot.mjs [name-filter]`

## Notes for implementers
* Map geometry for the map agent: world = reference-board coordinates (`ref_x/ref_y`), viewBox `{30,72,2342,1374}`, tile 96×64 u (strip 26 u), no overlaps (tightest gaps: S. Korea–Japan 5 u, El Salvador–Costa Rica 1 u horizontal). Scorecard positions are in the spec §4.1. The land in the mockup is placeholder goo-filter blobs.
* Fonts: the spec recommends self-hosting Barlow Semi Condensed 700/800 Latin subset (~36 KB) for tile names; everything else uses system stacks.
* The mockup's scenario logic (legal targets, region scoring) is an approximation for illustration only. The real UI must use `Prompt.options`, `coupOdds`, `effectiveOps` and `Frame.regionScores`.

## Contract gaps (details in proposal §15)
1. No generic option preview (influence cost and after-state, event-target ±1, realign odds). Suggest `previewOption(promptId, idx)` (snapshot→step→restore).
2. No structured event-target semantics (add/remove, whose influence). Suggest `Prompt.effect`.
3. No way to know that consecutive AI frames belong to one card play. Suggest `Frame.playId`.
4. The `card-moved.from/to` vocabulary is undocumented (needed for flight anchors).
5. Effect flag metadata (side, duration) is needed for effect chips; it could be a shared static table.
6. AI thinking-time stats for the game-over screen (`ms` from `AiPlayer.choose`, accumulated).

## Known issues / not done
* Continents are placeholders; Japan↔USA wrap arrows and region scorecard positions assume the reference-board layout.
* The mockups are static states, not a working prototype (no real animation timeline). The motion design is specified in the catalogue, not demonstrated.
* `npx tsc --noEmit -p .` passes; I wrote no TypeScript (mockups are plain JS/HTML under docs/).
