#!/usr/bin/env bash
# Build DeepStruggle's C++ rules engine (CMake target ts_engine_wasm) as WebAssembly, OUT OF TREE:
# vendor/DeepStruggle is only read. The CMake build dir is build/wasm (git-ignored); the results
# are checked, then copied to public/engine/{ts_engine.mjs,ts_engine.wasm,engine.json} (committed).
#
#   bash scripts/build-engine.sh             build, check, then replace public/engine/   (npm run engine)
#   bash scripts/build-engine.sh --check     build and compare with public/engine/ by sha256; never writes it
#   TS_ENGINE_OUT=DIR  bash scripts/build-engine.sh        write the results to DIR instead of public/engine/
#   TS_WASM_BUILD_DIR=DIR, JOBS=N                          build dir (default build/wasm), parallel jobs
#
# Needs: the vendor/DeepStruggle submodule; Emscripten 6.0.10 (DS: tools/scripts/install_emsdk.sh), on PATH
# or in $EMSDK_DIR (default ~/.local/opt/emsdk); cmake >= 3.24; ninja or make; python3; node.
# Background: docs/notes/build-deploy.md §1 (flags, gotchas) and §5 (the fingerprint); docs/DEPLOY.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DS="$ROOT/vendor/DeepStruggle"
OUT="${TS_ENGINE_OUT:-$ROOT/public/engine}"
BUILD="${TS_WASM_BUILD_DIR:-$ROOT/build/wasm}"
STAGE="$BUILD/out"
WANT_EMSCRIPTEN="6.0.10"   # = vendor/DeepStruggle/tools/scripts/install_emsdk.sh; DS keeps wasm bit-identical to native
FILES=(ts_engine.mjs ts_engine.wasm engine.json)

die() { echo "build-engine: $*" >&2; exit 2; }
CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  "") ;;
  *) die "usage: bash scripts/build-engine.sh [--check]" ;;
esac

[[ -f "$DS/CMakeLists.txt" && -f "$DS/tools/lib/engine_fingerprint.py" ]] ||
  die "vendor/DeepStruggle is empty: git submodule update --init --depth 1 vendor/DeepStruggle"

# ── Tools ───────────────────────────────────────────────────────────────────────────────────
NODE="$(command -v node)" || die "node not found"
PY="${TS_PYTHON:-python3}"
if [[ -d "$HOME/.local/opt/ts-build-venv/bin" ]]; then PATH="$HOME/.local/opt/ts-build-venv/bin:$PATH"; fi
if ! command -v emcmake >/dev/null 2>&1; then
  set +u
  # shellcheck disable=SC1091
  EMSDK_QUIET=1 source "${EMSDK_DIR:-$HOME/.local/opt/emsdk}/emsdk_env.sh" >/dev/null 2>&1 || true
  set -u
fi
command -v emcmake >/dev/null 2>&1 || die "Emscripten not found (vendor/DeepStruggle/tools/scripts/install_emsdk.sh, or set EMSDK_DIR)"
EMSCRIPTEN="$(tr -d '"[:space:]' < "$(dirname "$(command -v emcc)")/emscripten-version.txt")"
[[ "$EMSCRIPTEN" == "$WANT_EMSCRIPTEN" ]] || die "Emscripten $EMSCRIPTEN, want $WANT_EMSCRIPTEN"
command -v cmake >/dev/null 2>&1 || die "cmake not found"
GEN="Unix Makefiles"; command -v ninja >/dev/null 2>&1 && GEN="Ninja"

# ── The DeepStruggle commit (read from the git metadata: works for a clone and a submodule) ──
ds_commit() {
  local gd="$DS/.git" head ref
  if [[ -f "$gd" ]]; then gd="$(sed -n 's/^gitdir: //p' "$gd")"; [[ "$gd" == /* ]] || gd="$DS/$gd"; fi
  [[ -f "$gd/HEAD" ]] || { echo unknown; return; }
  head="$(tr -d '[:space:]' < "$gd/HEAD")"
  if [[ "$head" != ref:* ]]; then echo "$head"; return; fi
  ref="${head#ref:}"
  if [[ -f "$gd/$ref" ]]; then tr -d '[:space:]' < "$gd/$ref"; return; fi
  awk -v r="$ref" '$2 == r { print $1; found = 1 } END { if (!found) print "unknown" }' "$gd/packed-refs" 2>/dev/null || echo unknown
}
DS_COMMIT="$(ds_commit)"

# ── Configure (EVERY time: TS_ENGINE_FINGERPRINT is a CMake cache variable) and build ─────────
FP="$("$PY" -I "$DS/tools/lib/engine_fingerprint.py")"
[[ "$FP" =~ ^[0-9a-f]{64}$ ]] || die "bad engine fingerprint: $FP"
FRESH=()
if [[ -f "$BUILD/CMakeCache.txt" ]]; then
  cached_gen="$(sed -n 's/^CMAKE_GENERATOR:INTERNAL=//p' "$BUILD/CMakeCache.txt")"
  cached_src="$(sed -n 's/^CMAKE_HOME_DIRECTORY:INTERNAL=//p' "$BUILD/CMakeCache.txt")"
  # A different generator, or a moved checkout / emsdk, makes CMake refuse the old cache.
  [[ "$cached_gen" == "$GEN" && "$cached_src" == "$DS" ]] || FRESH=(--fresh)
fi
mkdir -p "$BUILD"
rm -rf "$STAGE"
echo "build-engine: DeepStruggle ${DS_COMMIT:0:12}, fingerprint ${FP:0:16}…, Emscripten $EMSCRIPTEN, $GEN, build dir $BUILD"
if ! emcmake cmake ${FRESH[@]+"${FRESH[@]}"} -G "$GEN" -S "$DS" -B "$BUILD" \
      -DCMAKE_BUILD_TYPE=Release \
      -DTS_ENGINE_FINGERPRINT="$FP" \
      -DTS_WASM_OUTPUT_DIR="$STAGE" > "$BUILD/configure.log" 2>&1; then
  tail -n 40 "$BUILD/configure.log" >&2
  die "configure failed (full log: $BUILD/configure.log)"
fi
cmake --build "$BUILD" --target ts_engine_wasm -j "${JOBS:-$(nproc)}"

printf '{"fingerprint":"%s","deepstruggle_commit":"%s","emscripten":"%s"}\n' \
  "$FP" "$DS_COMMIT" "$EMSCRIPTEN" > "$STAGE/engine.json"
"$NODE" "$ROOT/scripts/check-engine.mjs" "$STAGE" --expect "$FP"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# ── --check: compare with the committed engine, write nothing ──────────────────────────────
if (( CHECK )); then
  differ=0
  for f in "${FILES[@]}"; do
    new="$(sha "$STAGE/$f")"
    old="$( [[ -f "$OUT/$f" ]] && sha "$OUT/$f" || echo missing )"
    if [[ "$new" == "$old" ]]; then echo "same     $f  $new"
    else echo "DIFFERS  $f  built $new, $OUT has $old"; differ=1; fi
  done
  (( differ == 0 )) || { echo "build-engine: $OUT differs from a fresh build (built files: $STAGE)" >&2; exit 1; }
  echo "build-engine: $OUT matches a fresh build"
  exit 0
fi

# ── Install ────────────────────────────────────────────────────────────────────────────────
mkdir -p "$OUT"
for f in "${FILES[@]}"; do
  cp "$STAGE/$f" "$OUT/$f.tmp"; chmod 644 "$OUT/$f.tmp"; mv "$OUT/$f.tmp" "$OUT/$f"
  printf '%10s  %s  %s\n' "$(wc -c < "$OUT/$f")" "$(sha "$OUT/$f")" "$f"
done
echo "build-engine: -> ${OUT#"$ROOT/"}/{ts_engine.mjs,ts_engine.wasm,engine.json}"
