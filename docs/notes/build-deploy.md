# Build and deploy: the WASM engine and GitHub Pages

Scope: how to build DeepStruggle's (DS) `ts_engine_wasm` target, what the browser build needs,
how DS deploys its own page to GitHub Pages, and a recommended build and deploy setup for
`ChenAo-Phys/TS_playfield` (project page base `/TS_playfield/`).

Everything below was read from `vendor/DeepStruggle` at **commit `5b95e91b3e51494aa48958483e21fdf5996831ec`**
(2026-11-19, "engine: one function fires the Event a card spent for Operations owes"). That is
also upstream `main` as of 2026-11-22. Paths are relative to `vendor/DeepStruggle/` unless they
are written in full.

Verification status:
- VERIFIED means I checked it on this machine or against a live URL on 2026-11-22.
- I did **not** run cmake or emcc on the DS sources, as the task told me not to. I inspected the
  existing build in `vendor/DeepStruggle/build/wasm`, which another process made at 11:04 with
  `build_web.sh --engine`. I loaded its output in Node, which only reads it.

---

## 0. Key facts

| fact | value | status |
|---|---|---|
| CMake target | `ts_engine_wasm` (`bindings/CMakeLists.txt:25`) | read |
| outputs | `ts_engine.mjs` (17,973 B) + `ts_engine.wasm` (409,346 B) | VERIFIED |
| output dir | cache var `TS_WASM_OUTPUT_DIR`, default `<DS>/web/ui/public/engine` (`bindings/CMakeLists.txt:23`) | read |
| module format | ES module factory: `export default Module` (`-sMODULARIZE=1 -sEXPORT_ES6=1`) | VERIFIED |
| threads / SharedArrayBuffer | **none**: no `-pthread`, the heap is a plain `ArrayBuffer` | VERIFIED |
| memory | `-sALLOW_MEMORY_GROWTH=1`, initial heap 16,908,288 B | VERIFIED |
| env | `-sENVIRONMENT=web,worker,node`, so it also loads in Node (useful for CI checks) | VERIFIED |
| fingerprint baked in (DS HEAD) | `134a592a22473a8a12b694c93756f9ee33a88e62ad0c5ed8f65108eb7466eddf` | VERIFIED |
| reproducible? | the local build is **byte-identical** to the one DS's own CI deployed at `https://mihaild.github.io/DeepStruggle/engine/ts_engine.wasm` (sha256 `a86d9766…1a2a`, `.mjs` sha256 `862e1d11…8bac`) | VERIFIED |
| Emscripten | 6.0.10, pinned (`tools/scripts/install_emsdk.sh:14`, `.github/workflows/pages.yml:78`) | VERIFIED locally (`emcc 6.0.10 (d6c521a7…)`) |
| clang / LTO / nanobind / Python deps / struggler submodule | **none of them are needed** for the wasm target | read + existing build |
| COOP/COEP / coi-serviceworker | not used anywhere in DS; not needed | VERIFIED (grep + live headers) |
| HF CORS | OK: `access-control-allow-origin` echoed at huggingface.co, `*` at the CDN | VERIFIED |

---

## 1. Building only the WASM engine

### 1.1 What the CMake files do under `emcmake`

Top-level `CMakeLists.txt`:
- **L10-17**: the block that finds clang only runs when none of `CMAKE_CXX_COMPILER`, `$CXX` and
  `CMAKE_TOOLCHAIN_FILE` is set. `emcmake` passes
  `-DCMAKE_TOOLCHAIN_FILE=<emsdk>/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`,
  so the block is skipped.
- **L19**: `project(ts_ai CXX)`.
- **L21-29**: `if(NOT CMAKE_CXX_COMPILER_ID MATCHES "Clang") message(FATAL_ERROR ...)`. Under emcmake,
  CMake identifies `em++` as **`Clang`** (VERIFIED: the existing build's
  `CMakeFiles/*/CMakeCXXCompiler.cmake` has `set(CMAKE_CXX_COMPILER_ID "Clang")`). The rule
  that refuses non-clang compilers therefore passes, and no host clang is needed.
- **L38-40** `elseif(EMSCRIPTEN)`: `add_compile_options(-O3 -Wall -Wextra -Wpedantic -Wno-unused-parameter -Werror=unused-result)`.
- **L41-132** `else()`: native only. It holds `-march=native`, `option(TS_LTO ... ON)` (L54), the
  llvm-ar/ld.lld/LLVMgold lookups and the LTO link probe. **None of this runs under Emscripten**,
  so no LTO tools are needed.
- **L134-135**: `add_subdirectory(engine)` and `add_subdirectory(bindings)`.

`engine/CMakeLists.txt`:
- L12-14 has the same EMSCRIPTEN flags.
- L44 is `add_library(ts_engine_core STATIC ...)` with 16 sources (L25-42).
- It also defines `ts_tests`, `ts_fuzz`, `ts_fuzz_events` and `ts_benchmark` (L77-90). Those are
  configured but **not built** when you ask for `--target ts_engine_wasm`.

`bindings/CMakeLists.txt`:
- L5-15: the static libs `ts_state_json` (`state_json.cpp`) and `ts_rollout_batch`
  (`rollout_batch.cpp belief.cpp`).
- L18-58 `if(EMSCRIPTEN)`:
  - L21 `TS_ENGINE_FINGERPRINT` CACHE STRING, default `"unknown"`.
  - L23 `TS_WASM_OUTPUT_DIR` CACHE PATH, default `${CMAKE_SOURCE_DIR}/web/ui/public/engine`.
  - L25 `add_executable(ts_engine_wasm wasm/ts_engine_wasm.cpp)`.
  - L26 links `ts_state_json ts_rollout_batch ts_engine_core`.
  - L27 `TS_ENGINE_FINGERPRINT="${TS_ENGINE_FINGERPRINT}"` as a compile definition.
  - L28-49 `TS_WASM_EXPORTS`: 81 C functions plus `_malloc _free`.
  - L51-54 link options:
    ```
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1
    -sEXPORTED_FUNCTIONS=<list>
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,HEAPF32,UTF8ToString,stringToNewUTF8
    ```
  - L55-56 `OUTPUT_NAME ts_engine SUFFIX ".mjs" RUNTIME_OUTPUT_DIRECTORY "${TS_WASM_OUTPUT_DIR}"`.
  - **L57 `return()`**: the Python, nanobind and libgomp sections (L60-145) are never reached,
    so **no Python dev headers, nanobind or libgomp are needed**.
- The real link line in the existing build is
  `build/wasm/bindings/CMakeFiles/ts_engine_wasm.dir/link.txt`. It is
  `em++ -O3 -DNDEBUG -sMODULARIZE=1 ... -o <out>/ts_engine.mjs`. The Release flags reach the
  link, so wasm-opt runs at `-O3`.
- Exports: `bindings/wasm/ts_engine_wasm.cpp:40` defines
  `#define TS_API extern "C" EMSCRIPTEN_KEEPALIVE`. Functions that are KEEPALIVE but missing from
  the list are **also** on `Module`. Example: `_ts_base_action_size` (cpp L171), which DS's
  `web/ui/src/engine/wasm_engine.ts:35` calls. VERIFIED: the built module has 83 `_ts_*` functions.

### 1.2 Requirements

| needed | why |
|---|---|
| emsdk **6.0.10**, activated (`source ~/.local/opt/emsdk/emsdk_env.sh`) | compiler. The pin matters because DS holds the wasm bit-identical to native (`tests/web/test_wasm_engine.py`) |
| `cmake >= 3.20` | `cmake_minimum_required(VERSION 3.20)`. The existing build used **cmake 4.4.5** from `~/.local/opt/ts-build-venv` and worked |
| `make` **or** `ninja` | the existing build used Unix Makefiles (`/usr/bin/gmake`). `ninja 1.13.2` is in the venv |
| `python3` (stdlib only) | `emcc` is a Python program (`upstream/emscripten/emcc` → `emcc.py`). `tools/lib/engine_fingerprint.py` imports only `hashlib json pathlib sys typing` |
| `node` | emsdk brings its own Node (`emsdk/node/24.19.0_64bit`) for emcc. Our Node runs the check script |

| NOT needed | why |
|---|---|
| host clang, llvm-ar, lld, LLVMgold | clang detection is skipped and LTO is native-only (L41-132) |
| nanobind, Python headers, libgomp, torch, `requirements.txt` | `bindings/CMakeLists.txt:57 return()` |
| `external/struggler` submodule | not referenced by any CMake file. DS's `deploy/web/Dockerfile:146-148` builds wasm with "No submodules" |
| `.venv` | `build_web.sh` falls back to `python3` (`build_web.sh:33-36`), and DS's CI sets `TS_PYTHON: python3` (`pages.yml:119`) |

### 1.3 Exact commands (out of tree, into a directory we choose)

DS's own `tools/scripts/build_web.sh --engine` does work, but it **writes into the vendor tree**:
- the build dir is hard-coded as `BUILD="$ROOT/build/wasm"` (L39);
- the output goes to the default `TS_WASM_OUTPUT_DIR` = `<DS>/web/ui/public/engine`;
- it does not pass `-G`, and it sends configure output to `/dev/null` (L63-64).

The current scaffold, `scripts/build-engine.sh`, calls it and copies
the outputs over. It works, but it breaks "vendor is read-only". Both paths are git-ignored by
DS's own `.gitignore` (`build*/` L15, `web/ui/public/engine/` L43), so the submodule stays clean
anyway. The equivalent out-of-tree build:

```bash
# one-time
source ~/.local/opt/emsdk/emsdk_env.sh                 # or EMSDK_QUIET=1 source ... >/dev/null
export PATH=~/.local/opt/ts-build-venv/bin:$PATH   # cmake 4.4.5, ninja 1.13.2

DS=$PWD/vendor/DeepStruggle
BUILD=$PWD/build/wasm             # our repo, git-ignored
OUT=$PWD/public/engine            # served as <base>engine/

FP="$(python3 -I "$DS/tools/lib/engine_fingerprint.py")"   # VERIFIED: prints 134a592a...6eddf

emcmake cmake -G Ninja -S "$DS" -B "$BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DTS_ENGINE_FINGERPRINT="$FP" \
  -DTS_WASM_OUTPUT_DIR="$OUT"
cmake --build "$BUILD" --target ts_engine_wasm -j"$(nproc)"
# -> $OUT/ts_engine.mjs, $OUT/ts_engine.wasm
```

These are the same flags as `build_web.sh:63-65` and `deploy/web/Dockerfile:155-157`, plus
`-DTS_WASM_OUTPUT_DIR` and `-G`. Configure writes nothing into the source tree, because the only
custom command that would (the nanobind stub) sits behind the `return()`.

Gotchas:
1. **Always re-run the configure step.** `TS_ENGINE_FINGERPRINT` is a CMake *cache* variable.
   After a submodule bump, a bare `cmake --build` recompiles the new sources but still bakes in
   the **old** fingerprint.
2. **Generator mismatch.** A build dir configured with Makefiles refuses `-G Ninja`. Use a fresh
   dir or `--fresh` (the draft script below handles this).
3. **A moved checkout or emsdk** makes CMake refuse a stale cache. `build_web.sh:43-62` handles
   that with `--fresh`.
4. **Timing.** Locally (32 cores) the objects compiled within about 4 s
   (11:04:38 to 11:04:42) and the link finished at 11:04:44. I could not measure a 4-core CI
   runner; my guess is under 1-2 minutes.

### 1.4 What the module looks like (VERIFIED by loading it in Node)

`node /tmp/.../scratchpad/probe.mjs` on the built `ts_engine.mjs` printed:

```json
{"fingerprint":"134a592a22473a8a12b694c93756f9ee33a88e62ad0c5ed8f65108eb7466eddf",
 "obs_size":3824,"action_size":304,"base_action_size":220,"state_size":1664,
 "heap_bytes":16908288,"has_sab":false,"n_exports":83,"obs_size_for_12":3824}
```

How the `.mjs` finds the `.wasm` (from the emitted code):

```js
function findWasmBinary(){if(Module["locateFile"]){return locateFile("ts_engine.wasm")}
  return new URL("ts_engine.wasm",import.meta.url).href}
function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}
  return scriptDirectory+path}
```

So by default the `.wasm` must sit **next to** the `.mjs`. A `locateFile(path, dir)` option passed
to the factory overrides that, which we use for cache-busting (§4.4). The `.mjs` also contains
`if(ENVIRONMENT_IS_NODE){... await import("node:module") ...}`. **Keep it in `public/` and load
it with a dynamic `import(/* @vite-ignore */ absoluteUrl)`**, as DS does in
`web/ui/src/engine/wasm_engine.ts:47-57`, so Rollup never bundles it. Use an absolute URL: DS
notes at L42-46 that Vite's dev server rejects a path-only dynamic import of a `public/` file
with a 500.

### 1.5 Draft `scripts/build-engine.sh` (replaces the current one)

This is syntax-checked with `bash -n` but **not run**: running it would mean running cmake/emcc
on the DS sources.

```bash
#!/usr/bin/env bash
# Build DeepStruggle's rules engine (CMake target ts_engine_wasm) OUT OF TREE into public/engine/.
# vendor/DeepStruggle is only read: the build dir and the outputs live in this repo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DS="$ROOT/vendor/DeepStruggle"
OUT="$ROOT/public/engine"
BUILD="${TS_WASM_BUILD_DIR:-$ROOT/build/wasm}"
WANT_EMSCRIPTEN="6.0.10"   # = vendor/DeepStruggle/tools/scripts/install_emsdk.sh and DS's pages.yml

if [[ -d "$HOME/.local/opt/ts-build-venv/bin" ]]; then PATH="$HOME/.local/opt/ts-build-venv/bin:$PATH"; fi
if ! command -v emcmake >/dev/null; then
    # shellcheck disable=SC1091
    EMSDK_QUIET=1 source "${EMSDK_DIR:-$HOME/.local/opt/emsdk}/emsdk_env.sh" >/dev/null 2>&1 || true
fi
command -v emcmake >/dev/null || { echo "build-engine: Emscripten not found (vendor/DeepStruggle/tools/scripts/install_emsdk.sh)" >&2; exit 2; }
have="$(tr -d '"[:space:]' < "$(dirname "$(command -v emcc)")/emscripten-version.txt")"
[[ "$have" == "$WANT_EMSCRIPTEN" ]] || { echo "build-engine: Emscripten $have, want $WANT_EMSCRIPTEN" >&2; exit 2; }

FP="$(python3 -I "$DS/tools/lib/engine_fingerprint.py")"

GEN="Unix Makefiles"; command -v ninja >/dev/null && GEN="Ninja"
FRESH=()
if [[ -f "$BUILD/CMakeCache.txt" ]]; then
    cached_gen="$(sed -n 's/^CMAKE_GENERATOR:INTERNAL=//p' "$BUILD/CMakeCache.txt")"
    [[ "$cached_gen" == "$GEN" ]] || FRESH=(--fresh)
fi
# Configure EVERY time: TS_ENGINE_FINGERPRINT is a cache variable (see gotcha 1).
emcmake cmake ${FRESH[@]+"${FRESH[@]}"} -G "$GEN" -S "$DS" -B "$BUILD" \
    -DCMAKE_BUILD_TYPE=Release \
    -DTS_ENGINE_FINGERPRINT="$FP" \
    -DTS_WASM_OUTPUT_DIR="$OUT" >/dev/null
cmake --build "$BUILD" --target ts_engine_wasm -j "$(nproc)"

DS_COMMIT="$(git -C "$DS" rev-parse HEAD 2>/dev/null || echo unknown)"
printf '{"fingerprint":"%s","deepstruggle_commit":"%s","emscripten":"%s"}\n' "$FP" "$DS_COMMIT" "$have" > "$OUT/engine.json"
node "$ROOT/scripts/check-engine.mjs" "$OUT/ts_engine.mjs" "$FP"
echo "build-engine: $FP -> public/engine/{ts_engine.mjs,ts_engine.wasm,engine.json}"
```

`scripts/check-engine.mjs` was tested: it exits 0 on the current `public/engine/ts_engine.mjs`.

```js
// Usage: node scripts/check-engine.mjs <path/to/ts_engine.mjs> <expected-fingerprint>
import { pathToFileURL } from 'node:url';
const [mjs, want] = process.argv.slice(2);
if (!mjs || !want) { console.error('usage: check-engine.mjs <ts_engine.mjs> <fingerprint>'); process.exit(2); }
const M = await (await import(pathToFileURL(mjs).href)).default();
const have = M.UTF8ToString(M._ts_fingerprint());
console.log(JSON.stringify({ fingerprint: have, obs_size: M._ts_obs_size(), action_size: M._ts_action_size(),
                             base_action_size: M._ts_base_action_size() }));
if (have !== want) { console.error(`engine fingerprint ${have} != sources ${want}`); process.exit(1); }
```

---

## 2. Threads, SharedArrayBuffer, COOP/COEP

- **The engine is single-threaded.** There is no `-pthread`, `-sUSE_PTHREADS` or
  `-sPROXY_TO_PTHREAD` in any CMake file, and the emitted `.mjs` contains no `SharedArrayBuffer`,
  `pthread` or `Worker(` (VERIFIED by grep). `HEAPU8.buffer instanceof SharedArrayBuffer ===
  false` (VERIFIED in Node).
- **onnxruntime-web runs single-threaded on purpose.** `web/ui/src/analysis/model.ts:26-29`:
  ```ts
  // The runtime is served from this build, not a CDN, and single-threaded: GitHub Pages cannot send
  // the cross-origin-isolation headers threads need, and one position is well under a millisecond.
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
  ort.env.wasm.numThreads = 1;
  ```
  The file is still `ort-wasm-simd-threaded.wasm`, the default CPU build of ORT 1.30. The
  `.jsep`, `.jspi` and `.asyncify` variants are for the WebGPU/WebNN paths, which DS does not
  use. With `numThreads = 1` it never needs SharedArrayBuffer. It does need WebAssembly SIMD,
  which every current browser has.
- **Parallelism comes from a Web Worker, not threads.**
  `web/ui/src/analysis/rollout_runner.ts:49` does
  `new Worker(new URL("./rollout_worker.ts", import.meta.url), { type: "module" })`. The worker
  loads its own engine (`rollout_worker.ts:42 WasmEngine.load(msg.base)`) and its own ORT
  session. Data is passed by `postMessage` copies. That needs no cross-origin isolation. Our
  `vite.config.ts` already sets `worker: { format: 'es' }`, which this needs because the worker
  uses dynamic `import()`.
- **DS does not use coi-serviceworker** (no match for `coi`, `Cross-Origin-Embedder`,
  `crossOriginIsolated` or `SharedArrayBuffer` in `web/`, `bindings/`, `engine/`, `tools/` or
  `.github/`).
- Live headers from DS's Pages site (VERIFIED): `server: GitHub.com`, `cache-control: max-age=600`,
  **no COOP/COEP headers**, and the page works.

Conclusion: GitHub Pages is fine as is. Do not add COOP/COEP. A coi-serviceworker would only
add risk, because COEP `require-corp` would break the cross-origin HF fetches unless they are
CORP-tagged.

---

## 3. How DS's Pages workflow builds and deploys

`.github/workflows/pages.yml`:
- **Triggers** L12-15: `push` to `main` and `workflow_dispatch`.
- **Permissions** L17-20: `contents: read`, `pages: write`, `id-token: write`.
- **Concurrency** L22-24: `group: pages`, `cancel-in-progress: true`.
- **Job `playdek`** (L27-70): fits a "Playdek scale" from a Cloudflare D1 stats DB using
  secrets. **Not relevant to us.**
- **Job `build`** (L72-129), on `ubuntu-24.04`:
  - L78: `EMSDK_VERSION: "6.0.10"`.
  - L80: `actions/checkout@v7`, **with no submodules**.
  - L82-86: `actions/setup-node@v7` with `node-version: "22"`, `cache: npm`,
    `cache-dependency-path: web/ui/package-lock.json`.
  - L88-92: `actions/cache@v6` with `path: ~/.local/opt/emsdk`, `key: emsdk-${{ env.EMSDK_VERSION }}`.
    The cached directory is **1.7 GB** (601 MB of it is the emscripten sysroot cache; measured
    locally).
  - L94-95: `tools/scripts/install_emsdk.sh`. It clones emsdk `--depth 1` into
    `~/.local/opt/emsdk`, runs `emsdk install 6.0.10` and `activate` (a no-op after a cache hit),
    then sources the env.
  - L115-124: the step "Build the engine (WebAssembly) and the page", with env:
    - `TS_WEB_BASE: /${{ github.event.repository.name }}/`, which is the **base path**. Vite reads
      it at `web/ui/vite.config.ts:23` (`base: process.env.TS_WEB_BASE || '/'`).
    - `TS_PYTHON: python3`, the runner's Python. Only stdlib is needed for the fingerprint and
      the leaderboard fit.
    - `TS_STATS_ENDPOINT` and `TS_PLAYDEK_ESTIMATE`, which we don't need.
    - It runs `tools/scripts/build_web.sh` (the full mode): wasm engine →
      `tools/leaderboard.py fit` → `npm ci` → `npm run build` (`tsc && vite build`) →
      `web/ui/dist`.
  - L126-129: `actions/configure-pages@v6`, then `actions/upload-pages-artifact@v5` with
    `path: web/ui/dist`.
- **Job `deploy`** (L131-140): `environment: github-pages`, `actions/deploy-pages@v5`.
- **One-time setup** (comment at L9): *Settings → Pages → Source: GitHub Actions*.

`.github/workflows/web.yml` is CI only. It also caches the emsdk, runs `build_web.sh`, then
Playwright with `pytest tests/web`. Its `test_wasm_engine.py` checks the wasm engine plays
bit-identical games to the native one. That needs the native build, torch and so on, so we
should **not** copy it. We trust DS's CI for engine parity.

Where the files come from:
- **The engine**: `public/engine/ts_engine.{mjs,wasm}` is copied to `dist/engine/` unhashed and
  loaded at runtime from `${BASE_URL}engine/ts_engine.mjs`. On Pages (VERIFIED):
  `content-type: application/wasm`, `content-encoding: gzip`, 149,140 B on the wire.
  `.mjs` is served as `text/javascript`.
- **onnxruntime-web .wasm**: from the npm package (`onnxruntime-web` 1.30.0, locked in
  `web/ui/package-lock.json`), through Vite `?url` imports (`model.ts:19-21`):
  ```ts
  import * as ort from "onnxruntime-web/wasm";
  import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
  import ortMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
  ```
  They end up as hashed assets, for example `/DeepStruggle/assets/ort-wasm-simd-threaded-DcHrbrbl.wasm`
  (VERIFIED in the live bundle). Sizes: 14,239,897 B raw and 3,722,335 B gzipped as served by
  Pages (VERIFIED). **No CDN.**
- **Models**: fetched at runtime from Hugging Face, never bundled.
  `web/ui/src/analysis/hf_catalog.ts:8-10`:
  ```ts
  `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${path.split("/").map(encodeURIComponent).join("/")}`
  ```
  `DEFAULT_HF_REPO = "mihaild/deepstruggle"` and `DEFAULT_HF_REVISION = "main"` (L14-15). The
  catalogue comes from `models.json` (schema 1: `default`, `default_search`,
  `models[{path,date,sha256,size}]`, L85-115). The byte cache is keyed by sha256 from the
  `paths-info` API, POSTed as a form body so it is a CORS "simple" request with no preflight
  (`analysis/model_cache.ts:31-41`).
- **CORS** (VERIFIED with `Origin: https://example.github.io`):
  - `huggingface.co/.../resolve/main/models.json` returns `307` with
    `access-control-allow-origin: <origin>`, `access-control-expose-headers: ...ETag,Link,...,X-Repo-Commit,...,X-Linked-Size,...`
    and `x-repo-commit: 78708c9d002f0a8b3a089ec4620b95b650ef7d63`.
  - The `.onnx` returns `302` to `https://us.aws.cdn.hf.co/xet-bridge-us/...`, which answers
    `206/200` with `access-control-allow-origin: *`.
  - **Browser fetches from a github.io origin work.**
- **Fonts**: `web/ui/index.html:7-9` loads Google Fonts (Inter, JetBrains Mono, Cinzel). See
  risk R2 for China.
- **The rules JSON** (`rules/map.json`, `rules/cards.json`) is imported from outside `web/ui`
  (`vite.config.ts:35-36` `fs.allow: ['../..']`, `deploy/web/Dockerfile:165-166`). If we
  import these from `vendor/DeepStruggle/rules/`, that is inside our project root, so no
  `fs.allow` change is needed.

---

## 4. Recommended build and deploy design for `ChenAo-Phys/TS_playfield`

### 4.1 Pin DS as a git submodule

The project root is **not a git repo yet**. `vendor/DeepStruggle` is a plain shallow
clone (depth 1) at `5b95e91`.

```bash
cd TS_playfield                               # the project root
git init -b main
# Adds the existing clone in place ("Adding existing repo at 'vendor/DeepStruggle' to the index"):
git submodule add https://github.com/mihaild/DeepStruggle.git vendor/DeepStruggle
git -C vendor/DeepStruggle rev-parse HEAD     # expect 5b95e91b3e51494aa48958483e21fdf5996831ec
git config -f .gitmodules submodule.vendor/DeepStruggle.shallow true
git add .gitmodules vendor/DeepStruggle
```

- **Do not recurse.** DS has its own submodule `external/struggler`
  (`https://github.com/mihaild/struggler`), which only its differential tests use. Use
  `submodules: true` in CI, not `recursive`.
- **Consider pointing the submodule at a fork** (`https://github.com/ChenAo-Phys/DeepStruggle.git`).
  DS keeps `tools/scripts/rewrite_history_for_publish.sh`. It is written to be deterministic and
  fast-forward only, but if upstream ever force-pushed, our pinned SHA would become unfetchable
  and every CI run would fail. A fork removes that risk and keeps MIT attribution simple.
- To bump the pin:
  ```bash
  git -C vendor/DeepStruggle fetch --depth 1 origin <sha>
  git -C vendor/DeepStruggle checkout <sha>
  npm run engine
  ```
  Then re-check the model (§5), play-test locally, and `git add vendor/DeepStruggle`.

### 4.2 Build the engine in CI or commit it?

**Recommendation: build in CI, and cache the *built engine* keyed on its fingerprint.**

- The build is reproducible byte for byte: the build on this machine has the same sha256 as
  DS's CI-built file on Pages. A CI build therefore produces exactly what we test locally.
- The fingerprint is computable in milliseconds with `python3 -I` and no emsdk. A cache keyed on
  `engine-<emsdk>-<fingerprint>-<hash(build-engine.sh)>` means **ordinary UI pushes skip the
  emsdk entirely**. The 1.7 GB emsdk cache is restored only when the submodule moves.
- `public/engine/` is already in our `.gitignore`, which matches this design.

Alternative B, if the emsdk in CI becomes a nuisance: commit `public/engine/{ts_engine.mjs,ts_engine.wasm,engine.json}`
(430 KB) and remove `public/engine/` from `.gitignore`. CI then only runs
`node scripts/check-engine.mjs public/engine/ts_engine.mjs "$(python3 -I vendor/DeepStruggle/tools/lib/engine_fingerprint.py)"`,
which fails the build if someone bumps the submodule without rebuilding. This is simpler and
safe, but it puts binary churn in git.

A third option is a job with `container: emscripten/emsdk:6.0.10`, the image DS's Dockerfile
uses (`deploy/web/Dockerfile:140`). It works, but it pulls a large image every run unless it is
cached, so it is no better than the actions/cache route.

### 4.3 Model hosting: self-host the pinned ONNX (recommended) instead of fetching from HF at runtime

- **huggingface.co is widely reported to be blocked in mainland China.** Our UI is bilingual
  EN/ZH, so fetching the model from HF at runtime would break the game for a large share of the
  Chinese audience. I have not verified this from here. github.io is generally reachable.
- The model repo is MIT-licensed. VERIFIED: the HF API returns `cardData.license: "mit"`, and
  `README.md` front-matter has `license: mit`. Redistributing the file is fine with attribution.
- Size: 5,797,418 B. Gzip saves almost nothing (5,296,576 B), so Pages traffic is about 5.8 MB
  per cold visitor, plus 3.7 MB for ORT. That fits under the Pages soft limit of 100 GB/month
  (about 10k cold loads; per GitHub docs, not re-verified).
- **Pin by HF commit and check sha256.** These are the values for the *current* `models.json`
  default. Picking the model is the model/AI note's call; this only shows the mechanism.
  ```json
  // src/config/model.lock.json  (read by both the fetch script and the app)
  {
    "repo": "mihaild/deepstruggle",
    "revision": "78708c9d002f0a8b3a089ec4620b95b650ef7d63",
    "path": "_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.onnx",
    "sha256": "70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e",
    "size": 5797418
  }
  ```
  VERIFIED: downloading
  `https://huggingface.co/mihaild/deepstruggle/resolve/78708c9d002f0a8b3a089ec4620b95b650ef7d63/_models/E8.1-A8-R132-S45%4011160M%2B%28S45%2C46%2C47%29%4011520..11600M.onnx`
  gives exactly that sha256.
- Draft `scripts/fetch-model.sh`. It writes `public/models/<sha256[:16]>.onnx`, a
  content-addressed name that avoids the `@+(,` characters and makes cache-busting free.
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  LOCK="$ROOT/src/config/model.lock.json"
  URL="$(python3 -I - "$LOCK" <<'PY'
  import json, sys, urllib.parse
  d = json.load(open(sys.argv[1]))
  print(f"https://huggingface.co/{d['repo']}/resolve/{d['revision']}/{urllib.parse.quote(d['path'], safe='/')}")
  PY
  )"
  SHA="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$LOCK")"
  OUT="$ROOT/public/models/${SHA:0:16}.onnx"
  [[ -f "$OUT" ]] && echo "$SHA  $OUT" | sha256sum -c --quiet - && exit 0
  mkdir -p "$(dirname "$OUT")"
  curl -fsSL --retry 3 -o "$OUT.part" "$URL"
  echo "$SHA  $OUT.part" | sha256sum -c --quiet -
  mv "$OUT.part" "$OUT"
  echo "model -> public/models/${SHA:0:16}.onnx"
  ```
  Add `public/models/` and `build/` to `.gitignore`. In the app, load
  `${BASE_URL}models/${lock.sha256.slice(0,16)}.onnx`. HF (`resolve/<revision>/...`) can serve
  as an optional fallback. Keep DS-style checks before running the model (§5).

### 4.4 Cache-busting the unhashed engine files

Pages sends `cache-control: max-age=600` for everything (VERIFIED). Vite hashes our JS, but
`public/engine/*` keeps fixed names. For up to 10 minutes after a deploy, a browser could pair
new JS with an old `ts_engine.wasm` (missing exports, wrong rules). Fix:

```ts
// vite.config.ts (additions)
import { readFileSync } from 'node:fs';
const engine = JSON.parse(readFileSync(new URL('./public/engine/engine.json', import.meta.url), 'utf8'));
// defineConfig({ ..., define: { __ENGINE_FINGERPRINT__: JSON.stringify(engine.fingerprint),
//                                __DS_COMMIT__: JSON.stringify(engine.deepstruggle_commit) } })

// src/engine/load.ts
declare const __ENGINE_FINGERPRINT__: string;
export async function loadEngineModule() {
  const v = __ENGINE_FINGERPRINT__.slice(0, 12);
  const url = new URL(`${import.meta.env.BASE_URL}engine/ts_engine.mjs?v=${v}`, self.location.href).href;
  const create = (await import(/* @vite-ignore */ url)).default;
  const M = await create({ locateFile: (p: string, dir: string) => `${dir}${p}?v=${v}` });
  if (M.UTF8ToString(M._ts_fingerprint()) !== __ENGINE_FINGERPRINT__) throw new Error('stale engine; reload');
  return M;
}
```

- `self.location` works in both the window and the worker.
- `scriptDirectory` is `new URL(".", import.meta.url)`, which drops the `?v=` query, so the
  `.wasm` URL comes out right.
- The model path is content-addressed already (§4.3).

### 4.5 Draft `.github/workflows/pages.yml`

The action versions copy DS's `pages.yml` at `5b95e91`, which is in production use. Bump them
together if any of them is retired.

```yaml
# Build the static site (DeepStruggle's engine as WebAssembly + our Vite app + the pinned ONNX model)
# and publish it to GitHub Pages at https://chenao-phys.github.io/TS_playfield/.
# One-time: Settings -> Pages -> Build and deployment -> Source: GitHub Actions.
name: pages

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  EMSDK_VERSION: "6.0.10"   # = vendor/DeepStruggle/tools/scripts/install_emsdk.sh; scripts/build-engine.sh checks it

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: true        # vendor/DeepStruggle only -- NOT recursive (external/struggler is unused)

      - uses: actions/setup-node@v7
        with:
          node-version: "22"
          cache: npm

      - name: Engine fingerprint of the pinned DeepStruggle sources
        id: fp
        run: echo "fp=$(python3 -I vendor/DeepStruggle/tools/lib/engine_fingerprint.py)" >> "$GITHUB_OUTPUT"

      # Most pushes change only the UI: the built engine is restored and the emsdk is never touched.
      - name: Restore the built engine
        id: engine
        uses: actions/cache@v6
        with:
          path: public/engine
          key: engine-${{ env.EMSDK_VERSION }}-${{ steps.fp.outputs.fp }}-${{ hashFiles('scripts/build-engine.sh') }}

      - name: Cache Emscripten
        if: steps.engine.outputs.cache-hit != 'true'
        uses: actions/cache@v6
        with:
          path: ~/.local/opt/emsdk
          key: emsdk-${{ env.EMSDK_VERSION }}-${{ runner.os }}

      - name: Install Emscripten
        if: steps.engine.outputs.cache-hit != 'true'
        run: EMSDK_VERSION="$EMSDK_VERSION" vendor/DeepStruggle/tools/scripts/install_emsdk.sh

      - name: Build the WebAssembly engine
        if: steps.engine.outputs.cache-hit != 'true'
        run: bash scripts/build-engine.sh

      - name: Check the engine was built from the pinned sources
        run: node scripts/check-engine.mjs public/engine/ts_engine.mjs "${{ steps.fp.outputs.fp }}"

      - name: Restore the model
        id: model
        uses: actions/cache@v6
        with:
          path: public/models
          key: model-${{ hashFiles('src/config/model.lock.json') }}

      - name: Fetch the pinned model (sha256-checked)
        if: steps.model.outputs.cache-hit != 'true'
        run: bash scripts/fetch-model.sh

      - run: npm ci --no-audit --no-fund
      - run: npm run build          # vite.config.ts: base '/TS_playfield/', outDir 'dist'

      - uses: actions/configure-pages@v6
        if: github.event_name != 'pull_request'
      - uses: actions/upload-pages-artifact@v5
        if: github.event_name != 'pull_request'
        with:
          path: dist

  deploy:
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Notes:
- **Base path.** Our `vite.config.ts` hard-codes `base: '/TS_playfield/'`. That is fine, but the
  casing must match the repo name exactly. DS instead derives it as
  `/${{ github.event.repository.name }}/`.
- **No `.nojekyll`.** With Source = GitHub Actions the artifact is published as is and Jekyll
  never runs. My understanding is that underscore paths are only a problem for branch-based
  deploys.
- **Cards.** `public/cards/` is git-ignored in our `.gitignore`, so CI would have to run
  `npm run cards` (sharp + `game_resources/*_card_gallery`, 19 MB). That only works if the
  galleries are committed. The alternative is to commit the generated WebP files (en 3.5 MB +
  zh 2.9 MB) and leave sharp out of CI. **Decide which.**
- **Site size** is roughly 14 MB (ORT) + 0.4 MB (engine) + 5.8 MB (model) + 6.4 MB (cards) + JS,
  well under the Pages 1 GB site limit (per GitHub docs).
- **Emsdk install** pulls about 1.7 GB on a cold cache. The time is unmeasured; expect a few
  minutes, and seconds once cached.

### 4.6 Local loop ("test locally first, then push")

```bash
npm run engine                       # scripts/build-engine.sh  -> public/engine/
bash scripts/fetch-model.sh          # -> public/models/<sha16>.onnx
npm run dev                          # http://localhost:5173/TS_playfield/
npm run build && npx vite preview    # production bundle with the real base path: http://localhost:4173/TS_playfield/
```

---

## 5. The engine fingerprint

**What it is.** `tools/lib/engine_fingerprint.py:67-76`:

```python
digest = hashlib.sha256()
for path in source_files(base):            # sorted pathlib.Paths (L42-64)
    digest.update(str(path.relative_to(base)).encode()); digest.update(b"\0")
    digest.update(hashlib.sha256(path.read_bytes()).hexdigest().encode()); digest.update(b"\0")
return digest.hexdigest()
```

- `source_files` covers: the root `CMakeLists.txt`, plus every file under `engine/` and
  `bindings/` whose suffix is `.cpp`, `.h` or `.hpp` or whose name is `CMakeLists.txt` (L36-37).
- The hash depends only on file contents (not mtimes). It is independent of the compiler and the
  Emscripten version, so **a new emsdk produces the same fingerprint**. That is why the CI cache
  key above includes `EMSDK_VERSION` separately.
- It reaches the binary via `-DTS_ENGINE_FINGERPRINT=...` (`bindings/CMakeLists.txt:21,27`),
  and JS reads it with `UTF8ToString(_ts_fingerprint())` (`ts_engine_wasm.cpp:165-167`).
- `python3 -I engine_fingerprint.py` prints it; `--stamp <dir>` writes `.engine_fingerprint`
  (L165-175).

**What it is in DS.** It guards the native Python training stack against stale builds
(`require_fresh`). The page shows it, and DS's local server compares it with the sources
(`web/ui/src/main.ts:380-397`). Each ONNX export records the fingerprint it was made next to in
its metadata (`ts.engine_fingerprint`). The page **shows a mismatch as a warning and does not
refuse the model** (`model.ts:15-17` comment, `main.ts:968-969` `t("app:model.otherEngine", ...)`).
The hard checks are elsewhere (`model.ts:127-150`):
- `ts.format === "ts-onnx-v1"`;
- `obsSizeFor(ts.obs_features)` must succeed (an unknown feature bit is refused) and must equal
  `ts.obs_size`;
- `ts.action_size` must be the base 220 or the full 304.

**The current case** (VERIFIED by reading the ONNX tail and hashing every DS commit since
2026-11-01 with a script, `$SP/scripts/fp_history.py`;
the output is in `.../scratchpad/fp_history.txt`).

The model's metadata:

| key | value |
|---|---|
| `ts.obs_size` | 3824 |
| `ts.action_size` | 220 |
| `ts.obs_features` | 12 (= `HEADLINE_REVEAL` bit 2 + `OPP_EVENT_GATED` bit 3) |
| `ts.merged_influence` | false |
| `ts.macro_influence` | false |
| `ts.engine_fingerprint` | `82878d47f04e9c861fad0bdcf5153b3ccc5a5bc0ac6e5dc3b0eded8d0d6ddba2` |

How that compares with the engine:
- Fingerprint `82878d47` covers DS commits `b5c07d7020e6` (2026-11-16) through `02768b9d24e6`
  (2026-11-18 18:24).
- Our pin `5b95e91` is `134a592a`. It is **7 engine commits later**, all of them rule and
  errata fixes:
  - `f7f957737a5c`: Missile Envy under Quagmire/Bear Trap
  - `f08881664c9b`: Missile Envy ALWAYS_ASK_DISCARD
  - `4ef7a6aa9914`: Star Wars may not take UN Intervention in a headline
  - `4dd0ead4662e`: Missile Envy uses effective Ops
  - `2f35bf304d24` and `00c694ca359e`: Grain Sales
  - `5b95e91b3e51`: fire_owed_event
- DS's leaderboard records such in-place fixes as `also_accepts` builds of epoch E8
  (`leaderboard/epochs.json:55+`).
- **DS's own live site runs exactly our engine (`134a592a`) with this model.**
- The hard checks pass: the engine's `obs_size_for(12) = 3824`, `base_action_size = 220`
  (VERIFIED in Node).

**What our frontend must do:**
1. **Must** run the hard compatibility checks above before using any model. That is what stops
   a model from silently misreading inputs.
2. **Must not** refuse on a fingerprint mismatch. It is routine and expected. Show it in an
   "About / diagnostics" panel, not to players.
3. **Should** use the fingerprint for build consistency:
   - the cache-busting `?v=` parameter (§4.4);
   - the runtime check that the loaded engine is the one the JS was built for;
   - the CI check (`check-engine.mjs`) that the built engine matches the submodule sources.
4. **Should** store the fingerprint with every saved game in localStorage. DS saves
   `{seed, steps[]}` and replays them (`web/ui/src/game/saved_game.ts`, key `ts.workbench.game.v1`).
   After a deploy that changes the engine, a replay can diverge or a step can be refused. On a
   mismatch, try the replay and, if `_ts_step` refuses a step, tell the player the save is from
   an older engine instead of showing a corrupt game. Raw `GameState` snapshots (`_ts_state_ptr`,
   1664 B) must **never** be used across fingerprints.

---

## 6. Risks and open questions

- **R1. Pin choice and model distribution.**
  - Pinning `02768b9d24e6` would match the model's engine fingerprint exactly, but it drops 7
    errata fixes.
  - Pinning `5b95e91` (recommended) matches what DS ships to its users.
  - The owner should confirm. Either way, re-check after every bump.
- **R2. China reachability.**
  - HF is likely blocked, so self-host the model (§4.3).
  - Google Fonts (DS `index.html:7-9`) is likely blocked too, so self-host any fonts.
  - Not verified from inside China.
- **R3. Pages caching.** Everything has `max-age=600`, and `public/` files are unhashed. Use the
  `?v=fingerprint` + `locateFile` scheme (§4.4). A stale `index.html` can also point at hashed
  JS from the previous deploy that no longer exists. Consider catching the dynamic-import error
  and reloading once.
- **R4. Upstream history rewrite** could orphan the pinned SHA. Mitigate with a fork (§4.1).
- **R5. Copyright.** `game_resources/TS_Rules_Deluxe.pdf` is **not in `.gitignore`**. A
  `git add .` would push GMT's rulebook to the public repo, which contradicts CLAUDE.md ("do not
  host the rulebook"). Add it, and probably `TS_map.jpg`, to `.gitignore` before the first
  commit. Card art redistribution is the owner's existing decision.
- **R6. The current `scripts/build-engine.sh`** builds inside `vendor/DeepStruggle` (through
  `build_web.sh`). Replace it with the out-of-tree draft (§1.5).
- **R7. Unverified items:**
  - the draft `build-engine.sh` was never run end to end;
  - CI timings;
  - whether the ubuntu-24.04 image ships ninja (the script falls back to make);
  - GitHub Pages size and bandwidth limits, which are quoted from memory of GitHub docs.
- **R8.** ORT 1.30 needs WebAssembly SIMD. Very old browsers (for example Safari before 16.4)
  cannot run the AI.

---

## As decided (2026-11-23)

The owner's decisions supersede §4.2 (build in CI), §4.5 (the draft workflow) and R5-R7 above.
The procedure is `docs/DEPLOY.md`; the front page is `README.md`.

- **Repository:** `ChenAo-Phys/TS_playfield`, public, branch `main`. GitHub Pages with Source = GitHub
  Actions (`.github/workflows/pages.yml`).
- **Built assets are committed** (§4.2 "alternative B"): `public/engine/` (427 KB:
  `ts_engine.mjs`, `ts_engine.wasm`, `engine.json`), `public/cards/` (6.2 MB, incl. the errata
  overlays) and `public/models/` (5.8 MB). The first commit is about 830 files and 23.8 MB. CI only installs, checks and builds. There is no Emscripten,
  no submodule checkout and no model download in CI, so no caches are needed and R7's CI-timing
  questions are moot.
- **Workflow:** push to `main` or `workflow_dispatch`. One `build` job runs `actions/checkout@v7` without
  submodules, `actions/setup-node@v7` (Node 26, npm cache), `npm ci`, `npx tsc --noEmit -p .`,
  `npx vitest run --maxWorkers=2`, `npx vite build` and `actions/upload-pages-artifact@v5` (`dist`). A
  `deploy` job then runs `actions/deploy-pages@v5` in the `github-pages` environment. Concurrency group
  `pages`, no cancelling. The first deploy (2026-11-23, v4/v3 majors) warned that those target the deprecated
  Node 20, so the workflow moved to the majors DS's own workflow uses at `5b95e91`.
- **The test suite needs no browser.** The Playwright scripts (`src/**/demo/*.mjs`,
  `tests/ai/browser/run.mjs`) are not vitest files. Two test files are gated on env vars CI does not
  set: `TSP_CAPTURE` (`tests/fixtures/capture.test.ts`) and `TSP_SEEDS` (`tests/ai/autopilot-seeds.test.ts`).
  The engine-backed tests load the committed `public/engine/` and `public/models/`.
  `tests/i18n/data.test.ts` reads `vendor/DeepStruggle/bindings/state_json.cpp` only if it exists,
  and falls back otherwise.
- **`scripts/build-engine.sh` builds out of tree** (§1.5, R6 resolved). It configures every time,
  builds in `build/wasm` (git-ignored), stages to `build/wasm/out`, checks the module with
  `scripts/check-engine.mjs` and only then installs to `public/engine/`. `--check` rebuilds and
  compares by sha256 without writing anything. VERIFIED 2026-11-23: a fresh build (Emscripten 6.0.10,
  cmake 4.4.5, Ninja, about 8 s with 8 jobs) is byte-identical to the committed `ts_engine.mjs`
  (`862e1d11…`) and `ts_engine.wasm` (`a86d9766…`). It wrote nothing into `vendor/DeepStruggle`.
  `engine.json` records `{fingerprint, deepstruggle_commit, emscripten}`. The DS commit is read from
  the git metadata files, not from `git`.
- **Out of git:** the rulebook PDF and `TS_map.jpg` (R5 resolved), the two original card galleries,
  the screenshot sets (`docs/design/shots/*` except the approved `final-*.png`, and `docs/qa/shots/`),
  plus build output, logs, `.env*` and editor files. `game_resources/card_text.json` stays in, as
  the text source of `tools/gen-data.mjs`.
- **Still open:** R3, the cache-busting of the unhashed `public/engine/*`, is not implemented. It
  matters only for the 10 minutes after a deploy that changes the engine. R4: if upstream rewrote
  history, only a rebuild of the engine would be affected, not CI.
