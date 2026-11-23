#!/usr/bin/env node
/**
 * Publishes THIRD_PARTY_LICENSES.md as public/THIRD_PARTY_LICENSES.txt, so the deployed site carries the notices of
 * everything it redistributes (QA Q-012); About & credits links it. `--check` exits 1 when the published copy is stale
 * (tests/i18n/data.test.ts checks the same).
 *
 *   node tools/build-licenses.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = "THIRD_PARTY_LICENSES.md";
export const OUTPUT = "public/THIRD_PARTY_LICENSES.txt";

/** The published text: the Markdown file as plain text (it reads as such), with a line saying what it is. */
export function build() {
  const md = readFileSync(join(ROOT, SOURCE), "utf8");
  return `Twilight Struggle Playfield -- third-party licenses (from ${SOURCE})\n\n${md}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = build();
  if (process.argv.includes("--check")) {
    let cur = "";
    try { cur = readFileSync(join(ROOT, OUTPUT), "utf8"); } catch { /* missing */ }
    if (cur !== text) {
      console.error(`${OUTPUT} is stale: run node tools/build-licenses.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(join(ROOT, OUTPUT), text);
    console.log(`wrote ${OUTPUT}`);
  }
}
