#!/usr/bin/env bash
# Download the pinned DeepStruggle network (MIT) from Hugging Face into public/models/ and verify it.
#
#   network   E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M  ("B6 soup", leaderboard #1 weights)
#   repo      mihaild/deepstruggle @ 78708c9d002f0a8b3a089ec4620b95b650ef7d63 (pinned commit, not `main`)
#   sha256    70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e (5,797,418 bytes)
#
# The served file name is URL-safe (no @ + , ( )) and must match MODEL_FILE in src/ai/config.ts.
# Idempotent: an existing file with the right hash is kept. Usage: bash scripts/fetch-model.sh
set -euo pipefail

REPO="mihaild/deepstruggle"
REVISION="78708c9d002f0a8b3a089ec4620b95b650ef7d63"
# _models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.onnx, each path segment URL-encoded
ENCODED_PATH="_models/E8.1-A8-R132-S45%4011160M%2B(S45%2C46%2C47)%4011520..11600M.onnx"
SHA256="70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e"
OUT_NAME="ds-e8.1-b6soup-70b117b5.onnx"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/models"
OUT="$OUT_DIR/$OUT_NAME"
URL="https://huggingface.co/$REPO/resolve/$REVISION/$ENCODED_PATH"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$OUT_DIR"
if [[ -f "$OUT" && "$(sha256_of "$OUT")" == "$SHA256" ]]; then
  echo "ok: $OUT already present (sha256 $SHA256)"
  exit 0
fi

TMP="$(mktemp "$OUT_DIR/.download.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
echo "downloading $URL"
curl --fail --location --retry 3 --retry-delay 2 --silent --show-error --output "$TMP" "$URL"
GOT="$(sha256_of "$TMP")"
if [[ "$GOT" != "$SHA256" ]]; then
  echo "error: sha256 mismatch: expected $SHA256, got $GOT" >&2
  exit 1
fi
chmod 644 "$TMP"
mv "$TMP" "$OUT"
trap - EXIT
echo "ok: $OUT ($(wc -c <"$OUT") bytes, sha256 $SHA256)"
