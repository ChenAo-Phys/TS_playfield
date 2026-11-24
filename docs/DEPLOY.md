# Deploying the site

How `ChenAo-Phys/TS_playfield` is put on GitHub and published to
**https://chenao-phys.github.io/TS_playfield/**, and how to update the engine, cards and model later.
Background and history: `docs/notes/build-deploy.md` ("As decided (2026-11-23)" at the end).

## What is where

| | |
|---|---|
| Repository | `github.com/ChenAo-Phys/TS_playfield`, public, branch `main` |
| Hosting | GitHub Pages, Source = **GitHub Actions** (`.github/workflows/pages.yml`) |
| CI | on push to `main` or a manual dispatch: `npm ci` → `npx tsc --noEmit -p .` → `npx vitest run --maxWorkers=2` → `npx vite build` → upload `dist/` → deploy. No browser, no Emscripten, no submodule checkout. |
| Built assets (committed) | `public/engine/` (427 KB), `public/cards/` (6.2 MB, 220 WebP), `public/models/` (5.8 MB) |
| Submodule | `vendor/DeepStruggle` → `https://github.com/mihaild/DeepStruggle.git` at `5b95e91b3e51494aa48958483e21fdf5996831ec`, shallow, not recursive. Only needed to rebuild the engine. |
| Never in git | `game_resources/TS_Rules_Deluxe.pdf`, `game_resources/TS_map.jpg` (GMT material), `game_resources/{English,Chinese}_card_gallery/`, the screenshot sets (`docs/design/shots/*` except `final-*.png`, `docs/qa/shots/`), `node_modules/`, `dist/`, `build/` (see `.gitignore`) |

Expected size of the first commit: about 830 files and 23.8 MB (decimal MB; other work in progress moves this a little). The only file over 1 MB is the model
(`public/models/ds-e8.1-b6soup-70b117b5.onnx`, 5.8 MB); the next largest are `tests/fixtures/ui/game-full.json`
(0.9 MB) and `public/engine/ts_engine.wasm` (0.4 MB). The site itself (`dist/`) is 28 MB in 247 files.

## 1. First commit (local only)

Run from the project root. Nothing here talks to GitHub.

```bash
cd TS_playfield                               # the project root

# 0. The engine metadata and file mode. A rebuild is byte-identical to the committed engine; it adds
#    public/engine/engine.json and installs ts_engine.wasm as 644 (it is 755 now).
JOBS=8 bash scripts/build-engine.sh
bash scripts/build-engine.sh --check          # expect "public/engine matches a fresh build"
#    Without Emscripten, the same result by hand:
#    printf '{"fingerprint":"%s","deepstruggle_commit":"%s","emscripten":"%s"}\n' \
#      134a592a22473a8a12b694c93756f9ee33a88e62ad0c5ed8f65108eb7466eddf \
#      5b95e91b3e51494aa48958483e21fdf5996831ec 6.0.10 > public/engine/engine.json
#    chmod 644 public/engine/ts_engine.wasm
node scripts/check-engine.mjs                 # fingerprint 134a592a… and engine.json agree

# 1. The repository
git init -b main

# 2. The submodule. vendor/DeepStruggle is already a shallow clone at the pinned commit, so
#    `git submodule add` adopts it in place ("Adding existing repo at 'vendor/DeepStruggle' to the index").
test "$(git -C vendor/DeepStruggle rev-parse HEAD)" = 5b95e91b3e51494aa48958483e21fdf5996831ec
#    (if not: git -C vendor/DeepStruggle fetch --depth 1 origin 5b95e91b3e51494aa48958483e21fdf5996831ec
#             git -C vendor/DeepStruggle checkout --detach 5b95e91b3e51494aa48958483e21fdf5996831ec)
git submodule add https://github.com/mihaild/DeepStruggle.git vendor/DeepStruggle
git config -f .gitmodules submodule.vendor/DeepStruggle.shallow true
git submodule absorbgitdirs vendor/DeepStruggle    # move its .git into .git/modules (tidy, optional)
#    Do not recurse: DeepStruggle's own submodule (external/struggler) is not needed.
#    Its old in-tree build output (vendor/DeepStruggle/build/, web/ui/public/engine/) is ignored by
#    DeepStruggle's .gitignore, so the submodule stays clean. It can be deleted: the new script builds in build/wasm.

# 3. Stage everything else (.gitignore keeps the PDF, the map JPG, the galleries and the shots out)
git add -A
git status --short | wc -l                    # about 830 entries (files + .gitmodules + the gitlink)
```

### Pre-commit checklist

Each command should print what the comment says. Stop and fix anything else.

```bash
# a) No GMT reference material, no card gallery, no screenshot set staged. Expect: nothing.
git diff --cached --name-only | grep -iP '\.(pdf|jpe?g)$|_card_gallery/|^docs/qa/shots/|^docs/design/shots/(?!final-)'

# b) The submodule is a gitlink at the pinned commit. Expect: "160000 5b95e91b3e51494aa48958483e21fdf5996831ec 0	vendor/DeepStruggle".
git ls-files -s vendor/DeepStruggle
cat .gitmodules                               # path, url, shallow = true

# c) No file over 50 MB (GitHub warns at 50 MB, rejects at 100 MB); the largest files and the staged size.
#    Expect: the model (5,797,418 B) first, then "0 files over 50 MB, about 23.8 MB staged".
git ls-files -s | awk '$1 != "160000" {print $4}' | xargs stat -c '%s %n' | sort -rn | head -5
git ls-files -s | awk '$1 != "160000" {print $4}' | xargs stat -c '%s' \
  | awk '{s += $1} $1 > 50e6 {n++} END {printf "%d files over 50 MB, %.1f MB staged\n", n, s/1e6}'

# d) No secrets. Expect: nothing.
git grep --cached -I -n -E '(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|hf_[A-Za-z0-9]{30,}|(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
git ls-files | grep -iE '(^|/)\.env|\.pem$|\.key$|id_rsa|credentials|settings\.local\.json'
#    and no e-mail addresses. Expect: nothing.
git grep --cached -I -n -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[a-z]{2,}' -- ':!package-lock.json'

# e) The generated files a clean checkout needs are staged. Expect: 7 lines, then 110 and 110.
git ls-files src/data/cards.ts src/data/countries.ts src/ui/map/geometry.generated.ts src/ui/map/assets/paper.webp \
  public/THIRD_PARTY_LICENSES.txt public/engine/engine.json public/models/ds-e8.1-b6soup-70b117b5.onnx
git ls-files public/cards/en | wc -l; git ls-files public/cards/zh | wc -l
```

### The commit

```bash
# Append the attribution trailer your commit rules ask for as a last -m paragraph.
git commit -m "Twilight Struggle Playfield: first public version" -m "Play Twilight Struggle against the DeepStruggle AI in the browser (English / 中文).
Static Vite + React app for GitHub Pages; DeepStruggle (MIT) pinned as a submodule at 5b95e91."
git log --stat --oneline | tail -3
```

**Stop here and ask the owner before anything is pushed.**

## 2. Publish (only after the owner's OK)

```bash
# 0. gh is logged in as ChenAo-Phys with the `repo` and `workflow` scopes (the push contains a workflow file).
gh auth status
#    (if `workflow` is missing: gh auth refresh -h github.com -s workflow)

# 1. Create the public repository from this directory and push main.
gh repo create ChenAo-Phys/TS_playfield --public --source . --push
gh repo edit ChenAo-Phys/TS_playfield \
  --description "Play Twilight Struggle against the DeepStruggle AI in your browser (English / 中文)" \
  --homepage https://chenao-phys.github.io/TS_playfield/

# 2. Enable Pages with GitHub Actions as the source (once). Do it right after the push: the first
#    run's deploy job needs it, and its build job takes a few minutes.
gh api -X POST repos/ChenAo-Phys/TS_playfield/pages -f build_type=workflow
#    (if Pages already exists: gh api -X PUT repos/ChenAo-Phys/TS_playfield/pages -f build_type=workflow)
gh api repos/ChenAo-Phys/TS_playfield/pages --jq '{build_type, html_url}'
#    expect {"build_type":"workflow","html_url":"https://chenao-phys.github.io/TS_playfield/"}

# 3. Watch the run.
gh run list --workflow pages.yml --limit 3
gh run watch "$(gh run list --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
#    If the deploy job failed because Pages was not enabled yet:
#    gh run rerun <run-id> --failed        (or: gh workflow run pages.yml --ref main)
```

### Verify the live site

```bash
SITE=https://chenao-phys.github.io/TS_playfield/
curl -sI "$SITE" | head -1                                   # HTTP/2 200
curl -s "$SITE" | grep -o '<title>[^<]*'                     # <title>Twilight Struggle Playfield
for p in engine/ts_engine.mjs engine/ts_engine.wasm engine/engine.json models/ds-e8.1-b6soup-70b117b5.onnx \
         cards/en/001.webp cards/zh/110.webp fonts/OFL.txt THIRD_PARTY_LICENSES.txt; do
  curl -s -o /dev/null -w "%{http_code} %{size_download} $p\n" "$SITE$p"    # 200 each; wasm 409346, model 5797418
done
curl -s -o /dev/null -w "%{http_code} rulebook\n" "${SITE}game_resources/TS_Rules_Deluxe.pdf"   # 404

# In a browser: the boot line reaches "Ready", with no errors and no CSP violations. Headless (Playwright, this
# machine; BROWSER=chromium, firefox or webkit, section 5):
source scripts/pw-env.sh && BROWSER=chromium node --input-type=module -e '
import * as pw from "playwright";
const b = await pw[process.env.BROWSER].launch();
try {
  const p = await b.newPage(), errors = [];
  p.on("pageerror", e => errors.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.addInitScript(() => { window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  const t0 = Date.now();
  await p.goto(process.argv[1] + "?lang=en");
  await p.waitForFunction(() => document.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow") === "100", null, { timeout: 120000 });
  console.log({ browser: process.env.BROWSER, readyMs: Date.now() - t0, note: await p.textContent("[role=progressbar] + *"),
                csp: await p.evaluate(() => !!document.querySelector("meta[http-equiv=Content-Security-Policy]")),
                violations: await p.evaluate(() => window.__csp),
                devHooks: await p.evaluate(() => "__tsp" in window || "__tspAuto" in window), errors });
} finally { await b.close(); }' "$SITE"
# expect { browser, readyMs: …, note: "Ready", csp: true, violations: [], devHooks: false, errors: [] }
```

Then play a few moves by hand in English and Chinese, on a desktop and on a phone.

## 3. Everyday updates

Test locally first (CLAUDE.md), then push to `main`; the workflow deploys:

```bash
npx tsc --noEmit -p . && npx vitest run && npx vite build && npx vite preview   # http://localhost:4173/TS_playfield/
git push
gh run watch "$(gh run list --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

- Deployments queue (`concurrency: pages`, no cancelling). A manual redeploy: `gh workflow run pages.yml --ref main`.
- Rolling back: `git revert <bad commit> && git push`. A faster way: re-run the last good run
  (`gh run rerun <good-run-id>`), which builds and deploys that run's commit.
- Pages serves everything with `cache-control: max-age=600`: a new deploy can take up to 10 minutes to reach a
  returning visitor.
- The built `index.html` carries a Content-Security-Policy `<meta>` (`tsp-csp-meta` in `vite.config.ts`, build
  only). A change that loads something from a new origin, or adds an inline `<script>` / `<style>`, must extend it;
  check the preview for `securitypolicyviolation` events / "Refused to …" console errors in Chromium, Firefox and
  WebKit (section 5, `docs/qa/r3-xbrowser.md`). On the live site: `curl -s "$SITE" | grep -o 'Content-Security-Policy'`.
- `npm ci` (npm 11) warns that the install scripts of `esbuild` and `protobufjs` are "not yet covered by
  allowScripts". That is harmless: the build and the tests pass without them (checked 2026-11-23).

## 4. Updating the engine, cards and model

All three are committed build outputs: regenerate them, test, then commit them along with their inputs.

### The engine (a DeepStruggle bump)

Needs Emscripten 6.0.10 (`vendor/DeepStruggle/tools/scripts/install_emsdk.sh`; on this machine
`~/.local/opt/emsdk`), CMake ≥ 3.24 and Ninja or Make (here `~/.local/opt/ts-build-venv/bin`).

```bash
git submodule update --init --depth 1 vendor/DeepStruggle      # on a fresh clone; never --recursive
NEW=<full commit sha>
git -C vendor/DeepStruggle fetch --depth 1 origin "$NEW"
git -C vendor/DeepStruggle checkout --detach "$NEW"
JOBS=8 bash scripts/build-engine.sh        # out of tree (build/wasm) -> public/engine/{ts_engine.mjs,ts_engine.wasm,engine.json}
node scripts/check-engine.mjs              # prints the new fingerprint
npx vitest run --maxWorkers=4              # engine-backed tests use public/engine
# play-test locally (npm run dev), incl. a resumed save: saves are tied to the engine fingerprint
git add vendor/DeepStruggle public/engine
git commit -m "Engine: DeepStruggle <short sha>"
```

Before you bump, read `docs/notes/build-deploy.md` §5 (the fingerprint and the model) and check what changed
upstream. Our ported code and data copies are pinned to `5b95e91` too (`src/engine/`, `src/data/ds/*.json`, the
MIT headers, `THIRD_PARTY_LICENSES.md`). CLAUDE.md: do not move the engine's rules away from what the model was
trained on. To check that the committed engine is a faithful build of the pinned sources, run
`bash scripts/build-engine.sh --check`, which writes nothing.

### The cards

The original galleries are not in git. Put them back in `game_resources/English_card_gallery/` and
`game_resources/Chinese_card_gallery/` (`NNN_<slug>.jpg`), then:

```bash
npm run cards                              # scripts/build-cards.mjs -> public/cards/{en,zh}/NNN.webp (incl. the errata overlays)
npx vitest run tests/i18n --maxWorkers=4   # every card has an image in both languages
git add public/cards && git commit -m "Cards: <what changed>"
```

The card titles and texts are `game_resources/card_text.json` (committed). After editing it, run
`node tools/gen-data.mjs` and commit both.

### The model

The model is pinned in two places that must agree: `scripts/fetch-model.sh` (`REPO`, `REVISION`, `ENCODED_PATH`,
`SHA256`, `OUT_NAME`) and `src/ai/config.ts` (`MODEL_LABEL`, `MODEL_FILE`, `MODEL_SHA256`, `MODEL_BYTES`, `MODEL_HF_*`, and `SEARCH` if the
leaderboard's search changes).
Use the single highest-rated model on https://mihaild.github.io/DeepStruggle/leaderboard.html (CLAUDE.md).

```bash
bash scripts/fetch-model.sh                # downloads public/models/<name>.onnx and checks its sha256
git rm public/models/<old name>.onnx       # keep only the model the app loads
npx vitest run --maxWorkers=4 && npm run dev   # then play a game against it
git add public/models scripts/fetch-model.sh src/ai/config.ts && git commit -m "Model: <network name>"
```

A new model can need a different engine fingerprint (`docs/notes/build-deploy.md` §5).

## 5. Firefox and WebKit on this machine

QA runs Playwright's own browser builds; besides Chromium, Firefox and WebKit (Safari's engine) are installed
(`npx playwright install firefox webkit` → `~/.cache/ms-playwright/firefox-*`, `webkit-*`; not an npm install).
There is no root, so their missing system libraries live in user space, like Chromium's:

| Browser | Extra libraries | How it finds them |
|---|---|---|
| Chromium | `libnss3`, `libnspr4`, `libasound2` in `~/.local/opt/chromelibs/root` | `LD_LIBRARY_PATH` (unchanged) |
| Firefox | none (it loads its own NSS from its own directory) | – |
| WebKit | 38 Ubuntu 24.04 packages (GTK 4, GStreamer base/gl/bad, libsoup 3, AVIF, …) in `~/.local/opt/pwlibs/root` | `LD_LIBRARY_PATH`, see below |

`source scripts/pw-env.sh` before any Playwright command sets all of it up. For WebKit it also
(1) patches the WebKit bundle's `MiniBrowser` wrapper, which would otherwise replace `LD_LIBRARY_PATH`, to append
the inherited path (idempotent; it redoes this for a new WebKit build), and (2) sets
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`, because Playwright's pre-launch check looks for two `dlopen()`ed
libraries only in the system's `ldconfig` cache (each launch prints one "Skipping host requirements validation"
line). Nothing Chromium loads changes. To redo the WebKit libraries on a fresh machine (no root needed):

```bash
mkdir -p /tmp/debs && cd /tmp/debs
apt-get download libabsl20220623t64 libavif16 libcairo-script-interpreter2 libdav1d7 libenchant-2-2 libevdev2 \
  libevent-2.1-7t64 libgav1-1 libgles2 libgraphene-1.0-0 libgssdp-1.6-0 libgstreamer-gl1.0-0 \
  libgstreamer-plugins-bad1.0-0 libgstreamer-plugins-base1.0-0 libgtk-4-1 libgudev-1.0-0 libgupnp-1.6-0 \
  libgupnp-igd-1.6-0 libharfbuzz-icu0 libhyphen0 libmanette-0.2-0 libnice10 libopus0 liborc-0.4-0t64 librav1e0 \
  libsecret-1-0 libsoup-3.0-0 libsvtav1enc1d1 libva-drm2 libva2 libwayland-server0 libwebpdemux2 libwebpmux3 \
  libx264-164 libxcb-xkb1 libxkbcommon-x11-0 libxslt1.1 libyuv0
for d in *.deb; do dpkg -x "$d" ~/.local/opt/pwlibs/root; done
# check: no "not found" left
source scripts/pw-env.sh
W=$(ls -d ~/.cache/ms-playwright/webkit-*/minibrowser-wpe | tail -1)
for f in $(find "$W" -type f \( -name '*.so*' -o -perm -u+x \)); do
  LD_LIBRARY_PATH="$W/lib:$W/sys/lib:$LD_LIBRARY_PATH" ldd "$f" 2>/dev/null; done | grep 'not found'
```

The QA drivers take `--browser chromium|firefox|webkit` (default chromium):

```bash
source scripts/pw-env.sh
node src/ui/screens/demo/play.mjs --browser webkit --url http://localhost:PORT/TS_playfield/ --side USSR --until end
node src/ui/screens/demo/shoot.mjs --browser firefox --url http://localhost:PORT/TS_playfield/ --out <dir>
```

Playwright's WebKit is WebKitGTK/WPE on Linux, not Apple's Safari: it shares the engine (layout, CSS, JavaScript,
WebAssembly), not the iOS/macOS font stack, scrolling or touch gestures. Results: `docs/qa/r3-xbrowser.md`.
