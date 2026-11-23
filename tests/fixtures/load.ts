/**
 * Synchronous fixture loading for Node tests (vitest):
 *
 *   import { fixture, fixtureNames } from "../../fixtures/load";
 *   const fx = fixture("prompt-coup-target");         // decoded: frames, logs, final ViewModel
 *   const ctrl = new FixtureController(fx);
 *
 * Browser pages use src/dev/fixtures.ts `loadFixture` instead (lazy chunks).
 */
import { readFileSync } from "node:fs";
import { decodeFixture, type Fixture, type FixtureFile, type FixtureIndexRow } from "../../src/dev/fixtureFormat";

const DIR = new URL("./ui/", import.meta.url);
const cache = new Map<string, Fixture>();

export function fixtureIndex(): FixtureIndexRow[] {
  return JSON.parse(readFileSync(new URL("index.json", DIR), "utf8")) as FixtureIndexRow[];
}

export function fixtureNames(kind?: "scene" | "sequence"): string[] {
  return fixtureIndex().filter(r => !kind || r.kind === kind).map(r => r.name);
}

export function fixtureFile(name: string): FixtureFile {
  return JSON.parse(readFileSync(new URL(`${name}.json`, DIR), "utf8")) as FixtureFile;
}

export function fixture(name: string): Fixture {
  let f = cache.get(name);
  if (!f) {
    f = decodeFixture(fixtureFile(name));
    cache.set(name, f);
  }
  return f;
}
