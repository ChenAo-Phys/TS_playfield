# Twilight Struggle Playfield

Play **Twilight Struggle** in your browser against **DeepStruggle**, the top-rated Twilight Struggle AI,
always at full strength. English and 简体中文 (中文说明见下文).

**Play now: https://chenao-phys.github.io/TS_playfield/**

- You against the AI: pick the USSR, the US, or let a coin toss decide.
- Rules: the standard game with the optional cards (#104–110), the usual +2 US bid (ITS/ACTS: two extra
  influence in countries that already hold US influence), card text per the latest errata, and the
  tournament rule that a player holding a scoring card at the end of a turn loses.
- The rules engine is DeepStruggle's C++ engine compiled to WebAssembly; the AI is DeepStruggle's
  leaderboard #1 network and search, run by onnxruntime-web. Everything runs in your browser: this is a
  static site with no backend. The game autosaves in your browser so you can resume it later.
- The language follows your browser and can be switched at any time (`?lang=en` / `?lang=zh` also work).
- The rulebook is not hosted here. Read GMT Games' official living rules:
  https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf

## Run it locally

Needs Node.js 26 (the version CI uses) and npm.

```bash
npm ci
npm run dev                 # http://localhost:5173/TS_playfield/
```

Checks and a production build (the same steps as `.github/workflows/pages.yml`):

```bash
npx tsc --noEmit -p .
npx vitest run              # Node only, no browser needed (a few minutes)
npx vite build              # -> dist/ (base path /TS_playfield/)
npx vite preview            # http://localhost:4173/TS_playfield/
```

Development-only switches (dev server only, never in the production build): `?ai=policy` (a fast AI that
plays the network's policy without search), `?seed=N`, and `window.__tsp` / `window.__tspAuto` in the console
(the controller and the autopilot that `src/ui/screens/demo/play.mjs` drives).

### The built assets

The site's large generated assets are **committed**, so a clone builds and deploys with Node alone:

| path | what | regenerate with |
|---|---|---|
| `public/engine/` | DeepStruggle's rules engine as WebAssembly (`ts_engine.mjs`, `ts_engine.wasm`, `engine.json`) | `npm run engine` |
| `public/models/` | the AI network, pinned by Hugging Face commit and sha256 | `bash scripts/fetch-model.sh` |
| `public/cards/{en,zh}/` | the card images (WebP), English ones with errata overlays | `npm run cards` |

- **Engine.** DeepStruggle is a git submodule at `vendor/DeepStruggle`. The build needs Emscripten 6.0.10
  (`vendor/DeepStruggle/tools/scripts/install_emsdk.sh`), CMake ≥ 3.24 and Ninja or Make:
  ```bash
  git submodule update --init --depth 1 vendor/DeepStruggle
  npm run engine                          # = bash scripts/build-engine.sh (out of tree, in build/wasm)
  bash scripts/build-engine.sh --check    # rebuild and compare with the committed engine; writes nothing
  node scripts/check-engine.mjs           # load public/engine in Node and print its fingerprint
  ```
  The build is reproducible: a fresh build of the pinned sources is byte-identical to the committed files.
- **Cards.** `npm run cards` reads the original card galleries from
  `game_resources/English_card_gallery/` and `game_resources/Chinese_card_gallery/`, which are **not** in
  this repository. The card titles and texts come from `game_resources/card_text.json`.
- **Data and map.** `node tools/gen-data.mjs`, `node scripts/build-map.mjs`, `node tools/ui-keys.mjs`,
  `node tools/build-licenses.mjs`. Each takes `--check`, and the test suite fails when an output is stale.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how the code is organised),
[`docs/DEPLOY.md`](docs/DEPLOY.md) (publishing and updating the site),
[`tools/README.md`](tools/README.md) (the data generators).

## Credits and licences

- **DeepStruggle** by Mikhail Dektyarev ([mihaild](https://github.com/mihaild)):
  https://github.com/mihaild/DeepStruggle, MIT licence. Its rules engine, AI search, parts of its web client
  and its Chinese translations are used here. Ported files keep an MIT header.
- **The AI network** (`E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M`, leaderboard #1):
  https://huggingface.co/mihaild/deepstruggle, MIT licence, self-hosted in `public/models/`.
- **onnxruntime-web**, **React**, **i18next** and the **Emscripten** runtime: MIT licence.
- **Fonts:** Big Shoulders Stencil Display, Barlow Condensed and Courier Prime, under the SIL Open Font
  License 1.1 (`public/fonts/OFL.txt`).
- **Map:** land shapes derived from [Natural Earth](https://www.naturalearthdata.com) (public domain) via
  the `world-atlas` package (ISC licence), at build time.
- Full notices: [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md), published on the site as
  `THIRD_PARTY_LICENSES.txt` and linked from its credits.

No licence has been chosen yet for this project's own code.

## Twilight Struggle and GMT Games

Twilight Struggle® is a registered trademark of GMT Games, LLC. The game, its rules and its card and map
artwork are © GMT Games and their respective owners. This is an **unofficial, non-commercial fan project**,
not affiliated with or endorsed by GMT Games. The rulebook is not hosted here; the official living rules are
at https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf. If you enjoy the game, please support GMT Games.

---

## 中文说明

**冷战热斗 Playfield**：在浏览器中与 DeepStruggle AI 对战冷战热斗（Twilight Struggle）。AI 始终全力以赴，不设难度等级。

**在线游玩：https://chenao-phys.github.io/TS_playfield/**

- 你对战 AI：可选择扮演苏联、美国，或随机决定。
- 规则：标准游戏，含可选卡牌（#104–110）；美国获得 +2 影响力的竞价补偿（锦标赛标准，放在已有美国影响力的国家）；
  卡牌文字依照最新勘误；回合结束时仍持有计分牌的玩家输掉游戏。
- 规则引擎是 DeepStruggle 的 C++ 引擎（编译为 WebAssembly），AI 是 DeepStruggle 排行榜第一的模型与搜索。
  一切都在你的浏览器中运行，本站是没有后端的静态网站；对局自动保存在浏览器中，之后可以继续。
- 界面语言跟随浏览器设置，可随时在英文与简体中文之间切换。
- 本站不提供规则书，请阅读 GMT Games 官方最新规则：https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf

本地运行：`npm ci`，然后 `npm run dev`，打开 http://localhost:5173/TS_playfield/ 。

**声明：** 本项目是非官方、非商业的爱好者项目，与 GMT Games 无关联，亦未获其背书。Twilight Struggle® 是
GMT Games, LLC 的注册商标；游戏、规则以及卡牌与地图美术归 GMT Games 及其各自所有者所有。规则引擎与 AI 来自
[DeepStruggle](https://github.com/mihaild/DeepStruggle)（作者 mihaild，MIT 许可证），模型托管于
[Hugging Face mihaild/deepstruggle](https://huggingface.co/mihaild/deepstruggle)。其余第三方许可见
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)。
