/**
 * QA round 2 fixes in src/ui/common (fix group F3).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Button, TouchUiContext, displayTurnAr, lastActionRound } from "../../../src/ui/common";
import { fixture } from "../../fixtures/load";

const h = createElement;
const css = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");

/** The game-over telex's rule (GameOverTelex.tsx): the ending's round when it ended inside one. */
function telexRound(st: Parameters<typeof displayTurnAr>[0], endingTurn: number): number {
  const inRound = st.turn === endingTurn && st.action_round >= 1 && st.action_round <= lastActionRound(st)
    && (st.current_phase_name === "ACTION_ROUND" || st.current_phase_name === "GAME_OVER");
  return inRound ? st.action_round : 0;
}

describe("R-014 displayTurnAr: a game that ends inside an action round reads that round", () => {
  const cases: [string, ReturnType<typeof displayTurnAr>][] = [
    ["seq-over-vp20", { phase: "ar", turn: 5, ar: 2 }],
    ["seq-over-defcon", { phase: "ar", turn: 4, ar: 7 }],
    ["seq-over-resign", { phase: "ar", turn: 2, ar: 1 }],
    ["seq-over-held-scoring", { phase: "end", turn: 7, ar: null }],
    ["seq-over-milops-vp20", { phase: "end", turn: 8, ar: null }],
  ];
  for (const [name, want] of cases) {
    it(`${name}: ${want.phase === "ar" ? `turn ${want.turn} · AR ${want.ar}` : `end of turn ${want.turn}`}, as the telex says`, () => {
      const fx = fixture(name);
      const st = fx.frames[fx.frames.length - 1].state;
      const ending = fx.final.ending!;
      const at = displayTurnAr(st, ending);
      expect(at).toEqual(want);
      // one answer everywhere: the telex's "Turn N · AR M" round is the slip's / console's
      expect(at.ar ?? 0).toBe(telexRound(st, ending.turn));
      // without the ending (frames before the ViewModel says it): the same
      expect(displayTurnAr(st)).toEqual(want);
    });
  }

  it("GAME_OVER past the turn's last round, or after final scoring, stays the end of the turn", () => {
    const st = (turn: number, ar: number) => ({ turn, action_round: ar, current_phase_name: "GAME_OVER", flags: [], space: { US: 0, USSR: 0 } });
    expect(displayTurnAr(st(3, 7), { turn: 3 })).toEqual({ phase: "end", turn: 3, ar: null });
    expect(displayTurnAr(st(11, 0), { turn: 10 })).toEqual({ phase: "end", turn: 10, ar: null });
    expect(displayTurnAr(st(6, 0), { turn: 6 })).toEqual({ phase: "end", turn: 6, ar: null });
    // the ending recorded for an earlier turn than the counter: the end of that turn, whatever the round
    expect(displayTurnAr(st(7, 2), { turn: 6 })).toEqual({ phase: "end", turn: 6, ar: null });
    expect(displayTurnAr(st(6, 4), { turn: 6 })).toEqual({ phase: "ar", turn: 6, ar: 4 });
  });
});

describe("R-011 Button: no key cap on touch screens", () => {
  const button = (touch: boolean | null) => renderToStaticMarkup(h(TouchUiContext.Provider, { value: touch },
    h(Button, { variant: "ghost", size: "s", onPaper: true, icon: "undo", kbd: "Z", keyshortcuts: "Z Control+Z Meta+Z", onClick: () => undefined }, "Undo play")));
  it("mouse (or the server default) shows the cap; touch hides it and keeps aria-keyshortcuts", () => {
    expect(button(false)).toMatch(/<kbd[^>]*aria-hidden="true"[^>]*>Z<\/kbd>/);
    expect(button(null)).toMatch(/<kbd[^>]*>Z<\/kbd>/);
    const touch = button(true);
    expect(touch).not.toContain("<kbd");
    expect(touch).toContain('aria-keyshortcuts="Z Control+Z Meta+Z"');
    expect(touch).toContain("Undo play");
  });
});

describe("R-010 the toast's close on coarse pointers", () => {
  it("keeps its 26 px look and answers a 44 px hit area", () => {
    expect(css("common/Toaster.module.css")).toMatch(/@media \(pointer: coarse\) \{\s*\.close \{ position: relative; \}\s*\.close::after \{ content: ""; position: absolute; inset: -9px; \}/);
  });
});
