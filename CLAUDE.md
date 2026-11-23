# Twilight Struggle Playfield

A website for playing the board game Twilight Struggle online against an AI (PvE only, no PvP).

## Project goals
Existing sites already let people play against DeepStruggle (its own demo, twilightstruggle.app/ai, ts.soyoling.top). This project differs by offering:
- A bilingual UI (English / Chinese)
- Better game animations and interface

## Website
- Hosted on GitHub Pages as a project page: `https://chenao-phys.github.io/TS_playfield/` (GitHub account `ChenAo-Phys`). The site is static, so there is no backend.
- Workflow: test the site locally first, then push to GitHub.
- Language: chosen automatically from the browser language, and the player can switch between English and Chinese at any time.
- Do not host the rulebook on the site. Link to the official living rules instead: https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf

## Game AI and rules engine
- Use [DeepStruggle](https://github.com/mihaild/DeepStruggle) (MIT license) for both the rules engine and the AI:
  - Rules engine: DeepStruggle's C++ engine compiled to WebAssembly. Do not write our own rules engine.
  - AI: ONNX models run in the browser. The models are on Hugging Face at `mihaild/deepstruggle`.
- Model: use the single highest-rated model and weights on the [leaderboard](https://mihaild.github.io/DeepStruggle/leaderboard.html). There are no difficulty levels; the AI always plays at full strength.
- The model was trained under the rules below, so do not change engine rules in ways that would put the model out of distribution.

## Rules
- Standard game, with the optional cards (#104-110).
- US bid: the US gets +2 influence, placed in countries that already contain US influence (the usual ITS/ACTS tournament bid)
- Card text follows the latest errata.
- Tournament rule: a player loses if they hold a scoring card at the end of a turn. This should already be handled by the WASM engine; verify that it is.
- Side selection: the human picks USSR or US, or chooses "random".

## Game resources
- Rulebook (reference only, not published): `game_resources/TS_Rules_Deluxe.pdf`
- Map: redraw it as an SVG, using `game_resources/TS_map.jpg` only as a reference. The SVG may rearrange spacing for a better on-screen layout.
- Cards (English): use the original card designs, adjusted to match the errata. Card gallery: https://twilightstrategy.com/card-list/
- Cards (Chinese): we will most likely draw our own Chinese card versions.
