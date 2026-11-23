#!/usr/bin/env node
// Load a built DeepStruggle engine in Node and check its baked-in fingerprint.
//
//   node scripts/check-engine.mjs [DIR] [--expect FINGERPRINT]
//
// DIR (default public/engine) holds ts_engine.mjs + ts_engine.wasm (+ engine.json). The check fails (exit 1)
// when the module does not load, or its fingerprint differs from --expect or from DIR/engine.json.
// The fingerprint of the pinned sources: python3 -I vendor/DeepStruggle/tools/lib/engine_fingerprint.py
// (docs/notes/build-deploy.md §5). Needs no browser and no vendor/DeepStruggle.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--expect");
const expect = at >= 0 ? args.splice(at, 2)[1] : null;
if (at >= 0 && !expect) { console.error("usage: check-engine.mjs [DIR] [--expect FINGERPRINT]"); process.exit(2); }
const dir = resolve(args[0] ?? join(ROOT, "public/engine"));
const mjs = join(dir, "ts_engine.mjs");

const M = await (await import(pathToFileURL(mjs).href)).default();
const fingerprint = M.UTF8ToString(M._ts_fingerprint());
const info = {
  dir,
  fingerprint,
  obs_size: M._ts_obs_size(),
  action_size: M._ts_action_size(),
  base_action_size: M._ts_base_action_size(),
  exports: Object.keys(M).filter(k => k.startsWith("_ts_")).length,
};
console.log(JSON.stringify(info));

const problems = [];
if (expect && fingerprint !== expect) problems.push(`fingerprint ${fingerprint} != expected ${expect}`);
const meta = join(dir, "engine.json");
if (existsSync(meta)) {
  const recorded = JSON.parse(readFileSync(meta, "utf8")).fingerprint;
  if (recorded !== fingerprint) problems.push(`fingerprint ${fingerprint} != engine.json ${recorded}`);
}
if (problems.length) {
  for (const p of problems) console.error(`check-engine: ${p}`);
  process.exit(1);
}
