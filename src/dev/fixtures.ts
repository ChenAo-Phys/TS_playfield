/**
 * Loading the recorded UI fixtures (tests/fixtures/ui/*.json) in a Vite page or a vitest test
 * (dev only; never imported by production code). Each file is its own lazy chunk.
 *
 *   const fx = await loadFixture("prompt-coup-target");
 *   const ctrl = new FixtureController(fx);
 *
 * Names: tests/fixtures/ui/index.json (also `fixtureIndex()`); docs/handoff/ui-runner.md lists them.
 */
import { decodeFixture, type Fixture, type FixtureFile, type FixtureIndexRow } from "./fixtureFormat";
import indexRows from "../../tests/fixtures/ui/index.json";

const FILES = import.meta.glob<FixtureFile>(["../../tests/fixtures/ui/*.json", "!../../tests/fixtures/ui/index.json"], { import: "default" });

const cache = new Map<string, Promise<Fixture>>();

/** Every recorded fixture: name, kind, description, tags, frame count, size. */
export function fixtureIndex(): readonly FixtureIndexRow[] {
  return indexRows as FixtureIndexRow[];
}

export function fixtureNames(): string[] {
  return fixtureIndex().map(r => r.name);
}

/** The fixtures whose tags include every tag given (e.g. "prompt:coup-target", "event:roll"). */
export function findFixtures(...tags: string[]): FixtureIndexRow[] {
  return fixtureIndex().filter(r => tags.every(t => r.tags.includes(t)));
}

export function loadFixture(name: string): Promise<Fixture> {
  let p = cache.get(name);
  if (!p) {
    const load = FILES[`../../tests/fixtures/ui/${name}.json`];
    if (!load) return Promise.reject(new Error(`no UI fixture "${name}" (see tests/fixtures/ui/index.json)`));
    p = load().then(decodeFixture);
    cache.set(name, p);
  }
  return p;
}
