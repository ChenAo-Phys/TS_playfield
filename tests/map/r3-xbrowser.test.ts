/**
 * QA round 3, cross-browser (docs/qa/r3-xbrowser.md), X-1: in WebKit the first tap on a map box did nothing. The tap's
 * synthetic mousedown focuses the box, raising it (drawn last) moved its node between mousedown and mouseup, and WebKit
 * sends no click for a press whose node left the document. A box a finger focused is raised only after the tap's click.
 * Browser check: `coup-tap.mjs` (the coup scene, one tap) stages the target in WebKit, Chromium and Firefox.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { raisedBox } from "../../src/ui/map/board";

const BURMA = 34, LAOS = 35;

describe("raising a box (X-1)", () => {
  it("the hovered box, else the focused one, but not one a finger focused until its tap's click", () => {
    expect(raisedBox(null, null, null)).toBeNull();
    expect(raisedBox(BURMA, null, null)).toBe(BURMA);
    expect(raisedBox(null, BURMA, null)).toBe(BURMA); // keyboard focus, or a finger's after the click
    expect(raisedBox(null, BURMA, BURMA)).toBeNull(); // a finger's, before the click: the node stays put
    expect(raisedBox(LAOS, BURMA, BURMA)).toBe(LAOS); // a mouse's hover still raises
    expect(raisedBox(null, LAOS, BURMA)).toBe(LAOS); // the hold is for the tapped box only
  });

  it("a finger's press on a second box keeps the first one raised until the click (round-3 integration)", () => {
    // Burma was focused (raised); a tap on Laos focuses it: lowering Burma would move the nodes after Burma's slot,
    // Laos among them, between mousedown and mouseup, and WebKit would drop the tap's click. Nothing moves until it.
    expect(raisedBox(null, LAOS, LAOS, BURMA)).toBe(BURMA);
    expect(raisedBox(null, LAOS, null, BURMA)).toBe(LAOS); // the click: Laos is raised now
    expect(raisedBox(null, LAOS, LAOS, null)).toBeNull(); // nothing was raised: nothing is
    expect(raisedBox(LAOS, BURMA, BURMA, null)).toBe(LAOS); // a hover still raises at once
  });

  it("MapView holds a finger's focus until the click, and lets go on the click and on blur", () => {
    const src = readFileSync(join(__dirname, "../../src/ui/map/MapView.tsx"), "utf8");
    expect(src).toMatch(/const raised = raisedBox\(hover, focused, touchHeld, raisedBefore\.current\);/);
    expect(src).toMatch(/useEffect\(\(\) => \{ raisedBefore\.current = raised; \}, \[raised\]\);/);
    expect(src).toMatch(/new Set\(\[raised, selection, pinned\]/);
    expect(src).toMatch(/const finger = touchPress\(\);\s*setTouchHeld\(finger \? id : null\);/);
    expect(src).toMatch(/const onBoxClick = \(e: ReactMouseEvent\) => \{[^}]*setTouchHeld\(null\);/);
    expect(src).toMatch(/const onBoxBlur = \(e: ReactFocusEvent\) => \{\s*setTouchHeld\(null\);/);
  });
});
