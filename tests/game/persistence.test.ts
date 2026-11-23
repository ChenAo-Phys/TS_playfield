/**
 * Save format v2 (QA round 2, OD-1): the stored value is "TSP2:" + base64url(XOR keystream over CRC-32 + UTF-8 JSON).
 * Round trip, nothing readable in the stored text, every one-character edit and every truncation refused, plain-JSON
 * v1 saves read and rewritten, and the controller's paths: boot (migration, an unreadable save reported once and
 * removed), resume (v1, v2, a save tampered with after boot), and two tabs (Q-002) with v1 / v2 / garbage writes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Side } from "../../src/game/contract";
import type { ControllerViewModel } from "../../src/game/controller";
import {
  MemoryStorage, SAVE_KEY, SAVE_PREFIX, SAVE_VERSION, crc32, decodeSave, encodeSave, inspectSave, migrateSave, readSave,
  writeSave, type SavedGame,
} from "../../src/game/persistence";
import { drive, loadEngine, makeController, mulberry32, tick } from "./helpers";

/** Real v1 saves harvested by QA round 1 (tests/fixtures/game/qa-saves.json; `_note` is a comment). */
const SAVES = Object.entries(JSON.parse(readFileSync(new URL("../fixtures/game/qa-saves.json", import.meta.url), "utf8")) as
  Record<string, unknown>).filter((e): e is [string, { side: Side; turn: number; save: SavedGame & { v: number } }] =>
  typeof e[1] === "object" && e[1] !== null && "save" in e[1]);

/** A save as the controller writes it (small and fixed, for the byte-level tests). */
const SAMPLE: SavedGame = {
  v: SAVE_VERSION, fingerprint: "fp-test", modelSha256: "ab".repeat(32), search: "rollout:x", seed: 123456789, humanSide: "USSR",
  steps: [[0, 22, 0, 0], [0, 25, 0, 0], [1, 103, 0, 0], [1, 17, 0, 0]], autoFlags: "0001", over: false, ending: null,
  savedAt: 1_763_000_000_000, turn: 1, ar: 0, aiStats: { decisions: 3, ms: 1234.5 }, writer: "abc-def",
};

const sv = (h: { ctrl: { getSnapshot(): unknown } }) => h.ctrl.getSnapshot() as ControllerViewModel;

/** The stored text with one character replaced by another of the base64url alphabet. */
function editAt(text: string, i: number): string {
  const c = text[i]!;
  const alt = c === "A" ? "B" : "A";
  return text.slice(0, i) + alt + text.slice(i + 1);
}

describe("save format v2: encoding", () => {
  it("round-trips, and the stored text shows nothing of the game", () => {
    const text = encodeSave(SAMPLE);
    expect(text.startsWith(SAVE_PREFIX)).toBe(true);
    expect(text.slice(SAVE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    const r = decodeSave(text);
    expect(r).toEqual({ kind: "ok", save: SAMPLE, legacy: false });
    // No JSON, field name, side, fingerprint or step in clear.
    for (const s of ["{", "fingerprint", "humanSide", "USSR", "fp-test", "103", "steps", "abc-def"]) expect(text).not.toContain(s);
    // Plain base64 of the JSON does not appear either (the keystream is applied).
    expect(text).not.toContain(Buffer.from(JSON.stringify(SAMPLE)).toString("base64url").slice(0, 12));
  });

  it("round-trips any UTF-8 and every length mod 3 (base64url without padding)", () => {
    for (let extra = 0; extra < 6; extra++) {
      const save = { ...SAMPLE, search: "é漢字🙂".repeat(extra) + "x".repeat(extra) };
      expect(decodeSave(encodeSave(save))).toEqual({ kind: "ok", save, legacy: false });
    }
  });

  it("checks the CRC-32 the standard way", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("refuses every one-character edit (tampering, corruption)", () => {
    const text = encodeSave(SAMPLE);
    for (let i = SAVE_PREFIX.length; i < text.length; i++) {
      expect(decodeSave(editAt(text, i)).kind, `edit at ${i}`).toBe("unreadable");
    }
    // A character outside the alphabet, an inserted or a removed character.
    const body = SAVE_PREFIX.length + 10;
    expect(decodeSave(text.slice(0, body) + "=" + text.slice(body + 1)).kind).toBe("unreadable");
    expect(decodeSave(text.slice(0, body) + "A" + text.slice(body)).kind).toBe("unreadable");
    expect(decodeSave(text.slice(0, body) + text.slice(body + 1)).kind).toBe("unreadable");
    // Another prefix (a future or unknown format).
    expect(decodeSave("TSP3:" + text.slice(SAVE_PREFIX.length)).kind).toBe("unreadable");
  });

  it("refuses every truncation", () => {
    const text = encodeSave(SAMPLE);
    for (let n = 1; n < text.length; n++) expect(decodeSave(text.slice(0, n)).kind, `first ${n} chars`).toBe("unreadable");
    expect(decodeSave("").kind).toBe("none");
    expect(decodeSave(null).kind).toBe("none");
  });

  it("is obfuscation, not security: a save decoded, edited and encoded again with this code is accepted", () => {
    // The limit the About dialog states: with the page's code (developer tools) anyone can rewrite a save.
    const edited = { ...SAMPLE, humanSide: "US" as const };
    expect(decodeSave(encodeSave(edited))).toMatchObject({ kind: "ok", save: { humanSide: "US" } });
  });
});

describe("save format v1 (plain JSON): read and migrated", () => {
  const v1 = (s: SavedGame) => JSON.stringify({ ...s, v: 1 });

  it("reads a v1 save as legacy and upgrades it to the v2 shape", () => {
    const r = decodeSave(v1(SAMPLE));
    expect(r).toEqual({ kind: "ok", save: SAMPLE, legacy: true });
    // A QA save harvested from the v1 site.
    const qa = SAVES[0]![1].save;
    expect(qa.v).toBe(1);
    expect(decodeSave(JSON.stringify(qa))).toMatchObject({ kind: "ok", legacy: true, save: { v: SAVE_VERSION, seed: qa.seed } });
  });

  it("refuses plain JSON that is not a v1 save", () => {
    expect(decodeSave(JSON.stringify(SAMPLE)).kind).toBe("unreadable"); // v2 fields in clear: never written
    expect(decodeSave(JSON.stringify({ ...SAMPLE, v: 1, humanSide: "XX" })).kind).toBe("unreadable");
    expect(decodeSave(JSON.stringify({ ...SAMPLE, v: 1, autoFlags: "01" })).kind).toBe("unreadable");
    expect(decodeSave(v1(SAMPLE).slice(0, -5)).kind).toBe("unreadable");
    expect(decodeSave("not a save").kind).toBe("unreadable");
    expect(decodeSave("null").kind).toBe("unreadable");
  });

  it("migrateSave rewrites a v1 save as v2 with the same fields, once", () => {
    const storage = new MemoryStorage();
    expect(migrateSave(storage)).toBe(false); // nothing stored
    storage.setItem(SAVE_KEY, v1(SAMPLE));
    expect(migrateSave(storage)).toBe(true);
    const text = storage.getItem(SAVE_KEY)!;
    expect(text.startsWith(SAVE_PREFIX)).toBe(true);
    expect(inspectSave(storage)).toEqual({ kind: "ok", save: SAMPLE, legacy: false });
    expect(migrateSave(storage)).toBe(false); // already v2
    expect(storage.getItem(SAVE_KEY)).toBe(text);
  });

  it("writeSave always writes v2; a storage that throws reads as none", () => {
    const storage = new MemoryStorage();
    expect(writeSave(storage, SAMPLE)).toBe(true);
    expect(storage.getItem(SAVE_KEY)!.startsWith(SAVE_PREFIX)).toBe(true);
    expect(readSave(storage)).toEqual(SAMPLE);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(inspectSave(broken).kind).toBe("none");
    expect(writeSave(broken, SAMPLE)).toBe(false);
  });
});

describe("the controller and save v2", () => {
  it("writes v2 from the first step, and resumes it after a reload", async () => {
    const h = makeController({ aiSalt: 2 });
    await h.ctrl.newGame({ side: "US", seed: 77 });
    expect(h.storage.getItem(SAVE_KEY)!.startsWith(SAVE_PREFIX)).toBe(true);
    await drive(h, { rand: mulberry32(5), stopAfterPrompts: 10, timeoutMs: 60_000 });
    const text = h.storage.getItem(SAVE_KEY)!;
    expect(text.startsWith(SAVE_PREFIX)).toBe(true);
    expect(text).not.toMatch(/"steps"|humanSide/);
    const saved = readSave(h.storage)!;
    expect(saved.steps.length).toBeGreaterThan(10);

    const h2 = makeController({ storage: new MemoryStorage(h.storage.map), aiSalt: 2 });
    await h2.ctrl.boot();
    expect(h2.ctrl.getSnapshot()).toMatchObject({ hasSavedGame: true, savedGame: { humanSide: "US" } });
    expect(sv(h2).incompatibleSave).toBeUndefined();
    expect(await h2.ctrl.resume()).toBe(true);
    expect(h2.engine().saveJson()).toBe(h.engine().saveJson());
    expect(readSave(h2.storage)!.steps).toEqual(saved.steps);
  });

  it("resumes a v1 save and rewrites it as v2 at boot, keeping its writer", async () => {
    const h = makeController({ aiSalt: 3 });
    await h.ctrl.newGame({ side: "USSR", seed: 78 });
    await drive(h, { rand: mulberry32(6), stopAfterPrompts: 8, timeoutMs: 60_000 });
    const saved = readSave(h.storage)!;
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...saved, v: 1 }));

    const h2 = makeController({ storage, aiSalt: 3 });
    await h2.ctrl.boot();
    const vm = sv(h2);
    expect(vm).toMatchObject({ hasSavedGame: true, savedGame: { humanSide: "USSR", turn: saved.turn, ar: saved.ar } });
    expect(vm.incompatibleSave).toBeUndefined();
    // Rewritten as v2 before any resume: same game, same writer.
    expect(storage.getItem(SAVE_KEY)!.startsWith(SAVE_PREFIX)).toBe(true);
    expect(inspectSave(storage)).toEqual({ kind: "ok", save: saved, legacy: false });
    const before = h.engine().saveJson();
    expect(await h2.ctrl.resume()).toBe(true);
    expect(h2.engine().saveJson()).toBe(before);
    const after = inspectSave(storage);
    expect(after).toMatchObject({ kind: "ok", legacy: false, save: { steps: saved.steps } });
  });

  it("resumes a v1 QA save written straight into storage (no boot migration) and rewrites it on resume", async () => {
    const [, entry] = SAVES.find(([k]) => k === "t10EagleBearUSSR")!;
    const h = makeController({ aiSalt: 1 });
    await h.ctrl.boot();
    h.storage.setItem(SAVE_KEY, JSON.stringify({ ...entry.save, fingerprint: h.engine().fingerprint }));
    expect(await h.ctrl.resume()).toBe(true);
    expect(h.ctrl.getSnapshot().humanSide).toBe(entry.side);
    expect(h.storage.getItem(SAVE_KEY)!.startsWith(SAVE_PREFIX)).toBe(true);
    expect(readSave(h.storage)!.steps).toEqual(entry.save.steps);
  });

  for (const how of ["tampered", "truncated", "garbage"] as const) {
    it(`reports a ${how} save once at boot, removes it and offers no Resume`, async () => {
      const h = makeController();
      await h.ctrl.newGame({ side: "US", seed: 79 });
      const text = h.storage.getItem(SAVE_KEY)!;
      const bad = how === "tampered" ? editAt(text, text.length - 7) : how === "truncated" ? text.slice(0, Math.floor(text.length / 2)) : "{oops";
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, bad);
      const h2 = makeController({ storage });
      await h2.ctrl.boot();
      const vm = sv(h2);
      expect(vm.status).toBe("menu");
      expect(vm.hasSavedGame).toBe(false);
      expect(vm.savedGame).toBeUndefined();
      expect(vm.incompatibleSave).toEqual({ savedAt: 0, reason: "unreadable" });
      expect(storage.getItem(SAVE_KEY)).toBeNull();
      expect(await h2.ctrl.resume()).toBe(false);
      // A new game clears the report and writes a good save.
      await h2.ctrl.newGame({ side: "USSR", seed: 80 });
      expect(sv(h2).incompatibleSave).toBeUndefined();
      expect(readSave(storage)!.humanSide).toBe("USSR");
    });
  }

  it("refuses and removes a save tampered with after boot, when Resume is pressed", async () => {
    const h = makeController();
    await h.ctrl.newGame({ side: "USSR", seed: 81 });
    const storage = new MemoryStorage(new Map(h.storage.map));
    const h2 = makeController({ storage });
    await h2.ctrl.boot();
    expect(h2.ctrl.getSnapshot().hasSavedGame).toBe(true);
    // Edited in developer tools: no storage event in the same page.
    storage.map.set(SAVE_KEY, editAt(storage.map.get(SAVE_KEY)!, SAVE_PREFIX.length + 3));
    expect(await h2.ctrl.resume()).toBe(false);
    const vm = sv(h2);
    expect(vm.status).toBe("menu");
    expect(vm.hasSavedGame).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it("a finished game's v1 save is migrated, not reported, and not resumable", async () => {
    const { fingerprint } = await loadEngine();
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...SAMPLE, v: 1, fingerprint, over: true }));
    const h = makeController({ storage });
    await h.ctrl.boot();
    expect(sv(h).incompatibleSave).toBeUndefined();
    expect(sv(h).hasSavedGame).toBe(false);
    expect(inspectSave(storage)).toMatchObject({ kind: "ok", legacy: false, save: { over: true } });
  });
});

describe("two tabs on a v2 save (Q-002)", () => {
  it("a v1 write by a tab of the old site supersedes this tab's game", async () => {
    const shared = new MemoryStorage();
    const A = makeController({ storage: shared, aiSalt: 5 });
    await A.ctrl.newGame({ side: "US", seed: 82 });
    await drive(A, { rand: mulberry32(7), stopAfterPrompts: 4, timeoutMs: 60_000 });
    const mine = readSave(shared)!;
    const oldTab = new MemoryStorage(shared.map);
    oldTab.setItem(SAVE_KEY, JSON.stringify({ ...mine, v: 1, writer: "old-site-tab" }));
    expect(sv(A).superseded).toBe(true);
    expect(sv(A).prompt).toBeNull();
    // A writes nothing more: the old tab's save stays as it wrote it.
    expect(readSave(shared)!.writer).toBe("old-site-tab");
  });

  it("a tab booting while another plays neither migrates nor disturbs it", async () => {
    const shared = new MemoryStorage();
    const A = makeController({ storage: shared, aiSalt: 6 });
    await A.ctrl.newGame({ side: "USSR", seed: 83 });
    await drive(A, { rand: mulberry32(8), stopAfterPrompts: 4, timeoutMs: 60_000 });
    const text = shared.getItem(SAVE_KEY);
    const B = makeController({ storage: new MemoryStorage(shared.map), aiSalt: 6 });
    await B.ctrl.boot();
    expect(B.ctrl.getSnapshot()).toMatchObject({ hasSavedGame: true, savedGame: { humanSide: "USSR" } });
    expect(shared.getItem(SAVE_KEY)).toBe(text);
    expect(sv(A).superseded).toBeUndefined();
    await drive(A, { rand: mulberry32(9), stopAfterPrompts: 2, timeoutMs: 60_000 });
    expect(sv(A).superseded).toBeUndefined();
    // B, on its start screen, follows A's writes.
    expect(B.ctrl.getSnapshot().savedGame).toEqual(A.ctrl.getSnapshot().savedGame);
    // B resumes: A stops.
    expect(await B.ctrl.resume()).toBe(true);
    expect(sv(A).superseded).toBe(true);
  });

  it("an unreadable value written by another tab does not stop the game; the next save replaces it", async () => {
    const shared = new MemoryStorage();
    const A = makeController({ storage: shared, aiSalt: 7 });
    await A.ctrl.newGame({ side: "US", seed: 84 });
    await drive(A, { rand: mulberry32(10), stopAfterPrompts: 3, timeoutMs: 60_000 });
    const menu = makeController({ storage: new MemoryStorage(shared.map) });
    await menu.ctrl.boot();
    expect(menu.ctrl.getSnapshot().hasSavedGame).toBe(true);
    new MemoryStorage(shared.map).setItem(SAVE_KEY, "TSP2:corrupted");
    await tick();
    expect(sv(A).superseded).toBeUndefined();
    // The start-screen tab no longer offers it, but only boot removes a save.
    expect(menu.ctrl.getSnapshot().hasSavedGame).toBe(false);
    expect(shared.getItem(SAVE_KEY)).toBe("TSP2:corrupted");
    await drive(A, { rand: mulberry32(11), stopAfterPrompts: 2, timeoutMs: 60_000 });
    expect(sv(A).superseded).toBeUndefined();
    expect(inspectSave(shared)).toMatchObject({ kind: "ok", legacy: false, save: { humanSide: "US" } });
    expect(menu.ctrl.getSnapshot().hasSavedGame).toBe(true);
  });
});
