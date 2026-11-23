/**
 * QA round 1, fix group F3, the shared pieces: the turn / AR readout past the end (Q-031), the touch signal
 * (Q-032) and the bottom sheet in compact landscape (Q-028: over the left column; header controls are not the grab).
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Sheet, TOUCH_QUERY, createTouchSignal, displayTurnAr, lastActionRound } from "../../../src/ui/common";
import { mockRoot, withRoot } from "./mocks";

const st = (o: { turn: number; ar: number; phase: string; flags?: string[]; space?: { US: number; USSR: number } }) => ({
  turn: o.turn, action_round: o.ar, current_phase_name: o.phase, flags: o.flags ?? [], space: o.space ?? { US: 0, USSR: 0 },
});

describe("Q-031 displayTurnAr", () => {
  it("action rounds 1 … the turn's last: 6 in turns 1–3, 7 after, 8 with the perk", () => {
    expect(lastActionRound(st({ turn: 2, ar: 1, phase: "ACTION_ROUND" }))).toBe(6);
    expect(lastActionRound(st({ turn: 5, ar: 1, phase: "ACTION_ROUND" }))).toBe(7);
    expect(lastActionRound(st({ turn: 5, ar: 1, phase: "ACTION_ROUND", space: { US: 8, USSR: 2 } }))).toBe(8);
    expect(displayTurnAr(st({ turn: 3, ar: 6, phase: "ACTION_ROUND" }))).toEqual({ phase: "ar", turn: 3, ar: 6 });
    expect(displayTurnAr(st({ turn: 5, ar: 8, phase: "ACTION_ROUND", space: { US: 8, USSR: 2 } }))).toEqual({ phase: "ar", turn: 5, ar: 8 });
  });
  it("past the last round (the cleanup) is the end of the turn, not AR 7 / AR 9", () => {
    expect(displayTurnAr(st({ turn: 3, ar: 7, phase: "ACTION_ROUND" }))).toEqual({ phase: "end", turn: 3, ar: null });
    expect(displayTurnAr(st({ turn: 8, ar: 9, phase: "ACTION_ROUND" }), { turn: 8 })).toEqual({ phase: "end", turn: 8, ar: null });
    expect(displayTurnAr(st({ turn: 7, ar: 8, phase: "ACTION_ROUND" }), { turn: 7 })).toEqual({ phase: "end", turn: 7, ar: null });
    expect(displayTurnAr(st({ turn: 4, ar: 0, phase: "END_TURN" }))).toEqual({ phase: "end", turn: 4, ar: null });
  });
  it("final scoring: turn 10, not 11 · AR 0; an ending mid-round keeps its round", () => {
    expect(displayTurnAr(st({ turn: 11, ar: 0, phase: "HEADLINE" }), { turn: 10 })).toEqual({ phase: "end", turn: 10, ar: null });
    expect(displayTurnAr(st({ turn: 11, ar: 0, phase: "GAME_OVER" }))).toEqual({ phase: "end", turn: 10, ar: null });
    expect(displayTurnAr(st({ turn: 6, ar: 3, phase: "ACTION_ROUND" }), { turn: 6 })).toEqual({ phase: "ar", turn: 6, ar: 3 });
    expect(displayTurnAr(st({ turn: 5, ar: 0, phase: "HEADLINE" }), { turn: 5 })).toEqual({ phase: "headline", turn: 5, ar: null });
    expect(displayTurnAr(st({ turn: 1, ar: 0, phase: "SETUP" }))).toEqual({ phase: "setup", turn: 1, ar: null });
  });
});

describe("Q-032 the touch signal", () => {
  function fakeWindow(coarse: boolean) {
    const pointer = new Set<(e: { pointerType?: string }) => void>();
    const change = new Set<() => void>();
    const mql = { matches: coarse, addEventListener: (_: "change", fn: () => void) => { change.add(fn); }, removeEventListener: (_: "change", fn: () => void) => { change.delete(fn); } };
    return {
      win: {
        matchMedia: (q: string) => { expect(q).toBe(TOUCH_QUERY); return mql; },
        addEventListener: (_: "pointerdown", fn: (e: { pointerType?: string }) => void) => { pointer.add(fn); },
        removeEventListener: (_: "pointerdown", fn: (e: { pointerType?: string }) => void) => { pointer.delete(fn); },
      },
      press: (pointerType: string) => { for (const fn of [...pointer]) fn({ pointerType }); },
      listeners: () => pointer.size + change.size,
    };
  }
  it("the device's primary pointer until an input; then the last pointer used", () => {
    const f = fakeWindow(true);
    const s = createTouchSignal(f.win);
    expect(s.get()).toBe(true);
    let n = 0;
    const off = s.subscribe(() => { n++; });
    f.press("mouse");
    expect(s.get()).toBe(false);
    expect(n).toBe(1);
    f.press("mouse");
    expect(n).toBe(1); // no change, no notification
    f.press("pen");
    expect(s.get()).toBe(true);
    f.press("touch");
    expect(n).toBe(2);
    off();
    expect(f.listeners()).toBe(0);
  });
  it("a mouse device starts with mouse words; no window: mouse", () => {
    expect(createTouchSignal(fakeWindow(false).win).get()).toBe(false);
    expect(createTouchSignal(null).get()).toBe(false);
  });
});

describe("Q-028 the sheet in compact landscape", () => {
  it("opens over the left column (side class) and keeps header controls out of the grab", () => {
    const sheet = (layout: "compact" | "compact-landscape") => {
      const m = mockRoot({ layout });
      return renderToStaticMarkup(withRoot(h(Sheet, { open: true, onClose: () => undefined, height: "auto", label: "Hand" }, "x"), m.root, m.overlays) as never);
    };
    const side = sheet("compact-landscape");
    expect(side).toMatch(/class="_root_[^"]* _side_/);
    expect(side).toContain("data-sheet-grab");
    const portrait = sheet("compact");
    expect(portrait).not.toMatch(/_side_/);
    const css = readFileSync(new URL("../../../src/ui/common/Sheet.module.css", import.meta.url), "utf8");
    // The map column: the side column's width and the right safe area (the game grid pads the side column; Q-042).
    expect(css).toMatch(/\.side \.panel \{ width: calc\(100% - var\(--ts-c-side-col-w\) - var\(--ts-safe-right, 0px\)\);/);
  });
});
