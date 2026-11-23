/** createDirector and createAnchorRegistry (ui-spec §9.1, §9.6, §15.1). */
import { describe, expect, it, vi } from "vitest";
import { ABORT_GRACE_MS, createDirector, type BeatRecord } from "../../../src/ui/runner/director";
import { createAnchorRegistry } from "../../../src/ui/runner/anchors";
import type { Beat, BeatContext } from "../../../src/ui/ui-contract";
import { DEFAULT_SETTINGS } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";

const fx = fixture("seq-ai-turn");
const ctx = (signal = new AbortController().signal): BeatContext => ({
  frame: fx.frames[1]!, before: fx.frames[0]!.state, humanSide: fx.humanSide, speed: { motion: 1, hold: 1 }, signal, settings: DEFAULT_SETTINGS,
});
const reshuffle: Beat = { k: "reshuffle" };

describe("createDirector", () => {
  it("resolves at once with no handler", async () => {
    const d = createDirector();
    await expect(d.run(reshuffle, ctx())).resolves.toBeUndefined();
    expect(d.count("reshuffle")).toBe(0);
  });

  it("runs every handler of the kind in parallel, only that kind, and unregisters", async () => {
    const d = createDirector();
    const seen: string[] = [];
    let release!: () => void;
    const off1 = d.on("reshuffle", () => new Promise<void>(r => { seen.push("a"); release = r; }));
    d.on("reshuffle", async () => { seen.push("b"); });
    d.on("deal", async () => { seen.push("deal"); });
    let done = false;
    const p = d.run(reshuffle, ctx()).then(() => { done = true; });
    await Promise.resolve();
    expect(seen).toEqual(["a", "b"]);
    expect(done).toBe(false);
    release();
    await p;
    expect(done).toBe(true);
    off1();
    expect(d.count("reshuffle")).toBe(1);
  });

  it("a throwing or rejecting handler counts as done (logged), never stalls the runner", async () => {
    const d = createDirector();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    d.on("reshuffle", () => { throw new Error("sync"); });
    d.on("reshuffle", async () => { throw new Error("async"); });
    await expect(d.run(reshuffle, ctx())).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("after abort, stops waiting for a handler that never resolves", async () => {
    vi.useFakeTimers();
    try {
      const d = createDirector();
      d.on("reshuffle", () => new Promise<void>(() => { /* never */ }));
      const ac = new AbortController();
      let done = false;
      const p = d.run(reshuffle, ctx(ac.signal)).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(5000);
      expect(done).toBe(false);
      ac.abort();
      await vi.advanceTimersByTimeAsync(ABORT_GRACE_MS + 1);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("observers see each beat start and end", async () => {
    const d = createDirector();
    const log: BeatRecord[] = [];
    const off = d.observe(r => log.push(r));
    d.on("reshuffle", async () => {});
    await d.run(reshuffle, ctx());
    off();
    await d.run(reshuffle, ctx());
    expect(log.map(r => `${r.beat.k}:${r.phase}:${r.handlers}`)).toEqual(["reshuffle:start:1", "reshuffle:end:1"]);
  });
});

/** A minimal element for the registry (Node has no DOM). */
function fakeEl(rect: { w: number; h: number; x?: number; y?: number }, opts: { connected?: boolean; visible?: boolean } = {}) {
  const el = {
    isConnected: opts.connected ?? true,
    checkVisibility: () => opts.visible ?? true,
    getBoundingClientRect: () => ({ left: rect.x ?? 0, top: rect.y ?? 0, width: rect.w, height: rect.h, right: (rect.x ?? 0) + rect.w, bottom: (rect.y ?? 0) + rect.h, x: rect.x ?? 0, y: rect.y ?? 0 }),
  };
  return el as unknown as Element & { isConnected: boolean };
}

describe("createAnchorRegistry", () => {
  it("returns one stable ref callback per id and the element's rect", () => {
    const a = createAnchorRegistry();
    expect(a.ref("deck")).toBe(a.ref("deck"));
    expect(a.rect("deck")).toBeNull();
    a.ref("deck")(fakeEl({ w: 60, h: 84, x: 10 }));
    expect(a.rect("deck")?.left).toBe(10);
    expect(a.has("deck")).toBe(true);
    expect(a.ids()).toEqual(["deck"]);
  });

  it("is null for zero-size, invisible or detached elements, and the latest visible element wins", () => {
    const a = createAnchorRegistry();
    a.ref("discard")(fakeEl({ w: 0, h: 0 }));
    expect(a.rect("discard")).toBeNull();
    a.ref("removed")(fakeEl({ w: 50, h: 50 }, { visible: false }));
    expect(a.rect("removed")).toBeNull();
    const first = fakeEl({ w: 10, h: 10, x: 1 });
    const second = fakeEl({ w: 10, h: 10, x: 2 });
    a.ref("card:5")(first);
    a.ref("card:5")(second);
    expect(a.rect("card:5")?.left).toBe(2);
    (second as { isConnected: boolean }).isConnected = false;
    a.ref("card:5")(null);
    expect(a.rect("card:5")?.left).toBe(1);
    (first as { isConnected: boolean }).isConnected = false;
    expect(a.rect("card:5")).toBeNull();
    expect(a.element("card:5")).toBeNull();
  });

  it("holds no element once its screen unmounts, though React detaches refs before removing the nodes (QA Q-011)", async () => {
    const a = createAnchorRegistry();
    // A game screen: many anchors, some ids with two elements.
    const els = Array.from({ length: 40 }, (_, i) => ({ id: `country:${i % 30}` as const, el: fakeEl({ w: 10, h: 10 }) }));
    for (const { id, el } of els) a.ref(id)(el);
    expect(a.retained()).toBe(40);
    // Unmount: React calls every ref with null while the nodes are still in the document, then removes them.
    for (const { id } of els) a.ref(id)(null);
    expect(a.retained()).toBe(40);
    for (const { el } of els) (el as { isConnected: boolean }).isConnected = false;
    await Promise.resolve();
    expect(a.retained()).toBe(0);
    expect(a.ids()).toEqual([]);
    // An element that stays (a re-render keeps it) is kept.
    const kept = fakeEl({ w: 5, h: 5 });
    a.ref("deck")(kept);
    a.ref("deck")(null);
    await Promise.resolve();
    expect(a.retained()).toBe(1);
    expect(a.element("deck")).toBe(kept);
  });
});
