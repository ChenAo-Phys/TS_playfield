/**
 * The tray's beat handlers (src/ui/tray/trayBeats.ts) on a fake director, with recorded frames: the
 * overrides each beat leaves until the commit, the China toast, AI beats ignored, Skip, unregister.
 * (No DOM here: nothing animates, the handlers only apply their end state.)
 */
import { describe, expect, it } from "vitest";
import type { Frame, PublicState, Side } from "../../../src/game/contract";
import { chosenHeadline, NO_OVERRIDES, registerTrayBeats, TrayStore } from "../../../src/ui/tray/trayBeats";
import type { Beat } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";
import { ctxOf, fakeDirector } from "./helpers";

function setup(human: Side = "USSR") {
  const director = fakeDirector();
  const store = new TrayStore();
  const toasts: [string, number][] = [];
  const off = registerTrayBeats({
    director,
    store,
    anchors: { ref: () => () => undefined, rect: () => null },
    humanSide: () => human,
    reduced: () => false,
    toast: (m, ms) => { toasts.push([m, ms]); },
    chinaToast: holder => `china→${holder}`,
    nextPaint: () => Promise.resolve(),
  });
  return { director, store, toasts, off };
}

const seqHeadline = fixture("seq-headline");
const frame1 = seqHeadline.frames[1]!;
const before1 = seqHeadline.frames[0]!.state;

describe("registration", () => {
  it("registers the tray's beat kinds and unregisters them", () => {
    const { director, off } = setup();
    for (const k of ["reveal", "hand-revealed", "headline-chosen", "china", "deal", "banner"] as const) expect(director.count(k)).toBe(1);
    off();
    for (const k of ["reveal", "hand-revealed", "headline-chosen", "china", "deal", "banner"] as const) expect(director.count(k)).toBe(0);
  });
});

describe("reveal (human card-played)", () => {
  it("the card leaves the hand (lifted out until the commit); the AI's reveal is not ours", async () => {
    const { director, store } = setup("USSR");
    await director.run({ k: "reveal", side: "US", card: 24, how: "headline", byHuman: false }, ctxOf(frame1, before1));
    expect(store.get()).toBe(NO_OVERRIDES);
    await director.run({ k: "reveal", side: "USSR", card: 25, how: "influence", byHuman: true }, ctxOf(frame1, before1));
    expect([...store.get().gone]).toEqual([25]);
    store.reset();
    expect(store.get()).toBe(NO_OVERRIDES);
  });
});

describe("hand-revealed (human)", () => {
  it("adds the KNOWN tags with a staggered blink; the AI's hand is the rail's", async () => {
    const fx = fixture("seq-ai-turn");
    const f = fx.frames[7]!;
    const ev = f.events.find(e => e.t === "hand-revealed" && e.side === fx.humanSide);
    expect(ev).toBeTruthy();
    const { director, store } = setup(fx.humanSide);
    const cards = (ev as Extract<typeof ev, { t: "hand-revealed" }>)!.cards;
    const done = director.run({ k: "hand-revealed", side: fx.humanSide, cards }, ctxOf(f, fx.frames[6]!.state, { motion: 0.01 }));
    expect([...store.get().known]).toEqual(cards);
    expect(store.get().blink.get(cards[0]!)).toBe(0);
    expect(store.get().blinkMs).toBeGreaterThan(0);
    await done;
    expect(store.get().blink.size).toBe(0);
    expect([...store.get().known]).toEqual(cards);
    await director.run({ k: "hand-revealed", side: "US", cards: [11, 12] }, ctxOf(f, fx.frames[6]!.state));
    expect(store.get().known.has(11)).toBe(false);
  });
  it("instant speed or reduced motion: tags appear, no blink", async () => {
    const { director, store } = setup("USSR");
    await director.run({ k: "hand-revealed", side: "USSR", cards: [105] }, ctxOf(frame1, before1, { motion: 0 }));
    expect(store.get().known.has(105)).toBe(true);
    expect(store.get().blink.size).toBe(0);
  });
});

describe("headline-chosen (human)", () => {
  it("finds the committed card in the frame and puts it face down in the slot", async () => {
    const beat = { k: "headline-chosen", side: "USSR" } as const;
    expect(chosenHeadline(beat, { frame: frame1 })).toBe(18);
    const { director, store } = setup("USSR");
    await director.run({ k: "headline-chosen", side: "US" }, ctxOf(frame1, before1));
    expect(store.get().headline).toBeNull();
    await director.run(beat, ctxOf(frame1, before1));
    expect(store.get().headline).toEqual({ card: 18, faceDown: true });
    expect(store.get().gone.has(18)).toBe(true);
  });
  it("falls back to the frame state's headline id", () => {
    const frame = { ...frame1, events: [] } as Frame;
    expect(chosenHeadline({ k: "headline-chosen", side: "USSR" }, { frame })).toBe(18);
    expect(chosenHeadline({ k: "headline-chosen", side: "US" }, { frame })).toBe(24);
  });
});

describe("china", () => {
  const st = (holder: Side, playable: boolean) => ({ ...before1, china_card: { holder, playable } }) as PublicState;
  it("passing to the AI: override + toast; passing to you: the same; face up again: no toast", async () => {
    const { director, store, toasts } = setup("USSR");
    await director.run({ k: "china", holder: "US", playable: false }, ctxOf(frame1, st("USSR", true)));
    expect(store.get().china).toEqual({ holder: "US", playable: false });
    expect(toasts).toEqual([["china→US", 2500]]);
    store.reset();
    await director.run({ k: "china", holder: "USSR", playable: false }, ctxOf(frame1, st("US", true)));
    expect(store.get().china).toEqual({ holder: "USSR", playable: false });
    expect(toasts.length).toBe(2);
    store.reset();
    await director.run({ k: "china", holder: "USSR", playable: true }, ctxOf(frame1, st("USSR", false)));
    expect(store.get().china).toEqual({ holder: "USSR", playable: true });
    expect(toasts.length).toBe(2);
  });
  it("the AI's own China Card turning face up is not ours", async () => {
    const { director, store, toasts } = setup("USSR");
    await director.run({ k: "china", holder: "US", playable: true }, ctxOf(frame1, st("US", false)));
    expect(store.get().china).toBeNull();
    expect(toasts).toEqual([]);
  });
  it("Skip: jumps to the end state", async () => {
    const { director, store } = setup("USSR");
    const ac = new AbortController();
    ac.abort();
    await director.run({ k: "china", holder: "US", playable: false }, ctxOf(frame1, st("USSR", true), { signal: ac.signal }));
    expect(store.get().china).toEqual({ holder: "US", playable: false });
  });
});

describe("deck pulse", () => {
  it("deal and era banners resolve at once (the pulse never blocks)", async () => {
    const { director } = setup();
    const low = { ...before1, draw_deck_count: 1 } as PublicState;
    const beats: Beat[] = [{ k: "deal", side: "USSR", count: 2 }, { k: "banner", kind: "turn", turn: 4 }, { k: "banner", kind: "phase", phase: "HEADLINE" }];
    for (const b of beats) await expect(director.run(b, ctxOf(frame1, low))).resolves.toBeUndefined();
  });
});

describe("store", () => {
  it("notifies subscribers on patch / reset and keeps stable refs", () => {
    const store = new TrayStore();
    let n = 0;
    const off = store.subscribe(() => { n++; });
    store.patch({ gone: new Set([1]) });
    store.reset();
    store.reset();
    off();
    store.patch({ gone: new Set([2]) });
    expect(n).toBe(2);
    expect(store.ref("china")).toBe(store.ref("china"));
    expect(store.el("china")).toBeNull();
  });
});
