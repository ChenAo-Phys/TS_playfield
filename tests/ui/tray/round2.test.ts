/**
 * QA round 2, fix group F3: R-016 (Esc / Back to hand after the China Card focuses the China Card) and R-010 (the
 * piles' 44 px hit areas on coarse pointers).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chinaFocusReady, serveFocusRequest } from "../../../src/ui/tray";
import { PromptStore } from "../../../src/ui/prompts/store";

const css = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");

describe("R-016 the China Card serves the focus request for card 6", () => {
  const ready = { view: "faceUp" as const, lifted: false, interactive: true, mode: "active" as const };
  it("only for card 6, face up, back from the stage, clickable, while the hand chooses again", () => {
    expect(chinaFocusReady(6, ready)).toBe(true);
    expect(chinaFocusReady(28, ready)).toBe(false); // a hand card: the hand serves it
    expect(chinaFocusReady(null, ready)).toBe(false);
    expect(chinaFocusReady(6, { ...ready, lifted: true })).toBe(false); // still on the stage
    expect(chinaFocusReady(6, { ...ready, interactive: false })).toBe(false); // the undo frame still plays
    expect(chinaFocusReady(6, { ...ready, mode: "passive" })).toBe(false);
    expect(chinaFocusReady(6, { ...ready, view: "faceDown" })).toBe(false);
    expect(chinaFocusReady(6, { ...ready, view: "withAi" })).toBe(false);
  });
  it("serving focuses the card without a scroll jump and clears the request (the store's one-shot)", () => {
    const store = new PromptStore();
    store.setFocusCard(6);
    const calls: string[] = [];
    const el = { focus: (o?: { preventScroll?: boolean }) => { calls.push(`focus ${o?.preventScroll}`); }, scrollIntoView: () => { calls.push("scroll"); } };
    expect(serveFocusRequest(store, el)).toBe(true);
    expect(calls).toEqual(["focus true", "scroll"]);
    expect(store.get().focusCard).toBeNull();
    // no element yet: the request waits (and lapses on its own timeout)
    store.setFocusCard(6);
    expect(serveFocusRequest(store, null)).toBe(false);
    expect(store.get().focusCard).toBe(6);
    store.setFocusCard(null);
  });
  it("ChinaSlot and Hand both serve through it", () => {
    expect(css("tray/ChinaSlot.tsx")).toMatch(/chinaFocusReady\(focusReq, \{ view, lifted, interactive, mode \}\)/);
    expect(css("tray/ChinaSlot.tsx")).toMatch(/serveFocusRequest\(prompts, el\.current\)/);
    expect(css("tray/Hand.tsx")).toMatch(/serveFocusRequest\(prompts, els\.current\.get\(focusReq\) \?\? null\)/);
  });
});

describe("R-010 piles on coarse pointers", () => {
  it("Discard and Removed answer 44 px tall areas: the 5 px gap split, Discard up over the deck, Removed down", () => {
    const s = css("tray/Piles.module.css");
    const coarse = s.slice(s.indexOf("@media (pointer: coarse)"));
    expect(coarse).toMatch(/\.button::after \{ content: ""; position: absolute; left: 0; right: 0; top: -2\.5px; bottom: -2\.5px; \}/);
    // tablet: 34 px rows → 8 + 34 + 2.5 = 44.5; desktop: 38 px rows → 4 + 38 + 2.5 = 44.5
    expect(coarse).toMatch(/\.tablet \.button\[data-pile="discard"\]::after \{ top: -8px; \}/);
    expect(coarse).toMatch(/\.tablet \.button\[data-pile="removed"\]::after \{ bottom: -8px; \}/);
    expect(coarse).toMatch(/\.button\[data-pile="discard"\]::after \{ top: -4px; \}/);
    expect(coarse).toMatch(/\.panel \.button::after \{ inset: 0; \}/);
  });
});
