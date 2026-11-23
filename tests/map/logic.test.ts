/**
 * Pure map logic: board values from the state, ghost markers, target looks, names and label
 * fitting, spatial navigation, hit tests, tooltip placement.
 */
import { describe, expect, it } from "vitest";
import { anchorOnMap, boardValues, ghostFor, popoversAfter, targetLook, TIP_CLOSED, tipAfterTap, withOverrides } from "../../src/ui/map/board";
import { countriesInCircle, countryAt, COUNTRY_LAYOUT, nameRoom, nearestInDirection, readingOrder } from "../../src/ui/map/layout";
import { placeTip } from "../../src/ui/map/MapTooltipHost";
import { fitLabel, fullName, mapLabel, MIN_FIT, shortName } from "../../src/ui/map/names";
import { influenceTargets, MIDGAME, sampleState, targetsOf } from "../../src/ui/map/demo/samples";

describe("board values", () => {
  it("joins state.countries (keyed by engine name) on id", () => {
    const v = boardValues(sampleState(MIDGAME, "USSR"));
    expect(v).toHaveLength(84);
    expect(v[1]).toEqual({ us: 5, ussr: 0, ctrl: "US" }); // UK
    expect(v[15]).toEqual({ us: 0, ussr: 4, ctrl: "USSR" }); // Poland
    expect(v[2]).toEqual({ us: 0, ussr: 0, ctrl: "NONE" }); // Norway
    expect(boardValues(null).every(b => b.us === 0 && b.ussr === 0 && b.ctrl === "NONE")).toBe(true);
  });

  it("applies overrides without touching the base", () => {
    const base = boardValues(sampleState(MIDGAME, "USSR"));
    const out = withOverrides(base, { 21: { us: 0, ussr: 2, ctrl: "NONE" } });
    expect(out[21]).toEqual({ us: 0, ussr: 2, ctrl: "NONE" });
    expect(base[21]).toEqual({ us: 0, ussr: 1, ctrl: "USSR" }); // Lebanon, stability 1
    expect(withOverrides(base, {})).toBe(base);
  });
});

describe("targets", () => {
  const t = targetsOf([24, 25, 26], { verb: "add", danger: new Set([25]) });

  it("looks: loud for ≤ 12 targets, quiet above, danger wins", () => {
    expect(targetLook(t, 24)).toBe("loud");
    expect(targetLook(t, 25)).toBe("danger");
    expect(targetLook(t, 7)).toBe("none");
    expect(targetLook(null, 24)).toBe("none");
    expect(targetLook(targetsOf(influenceTargets(MIDGAME, "USSR")), 24)).toBe("quiet");
  });

  it("ghost: the next numeral in the decider's slot; a struck −1 in the affected slot", () => {
    const v = { us: 2, ussr: 3, ctrl: "NONE" as const };
    expect(ghostFor(t, 24, v, "USSR")).toEqual({ side: "USSR", kind: "add", n: 4 });
    expect(ghostFor({ ...t, ghostSide: "US" }, 24, v, "USSR")).toEqual({ side: "US", kind: "add", n: 3 });
    const rm = targetsOf([24], { verb: "remove" });
    expect(ghostFor(rm, 24, v, "USSR")).toEqual({ side: "US", kind: "remove", n: 1 });
    // Only the human has influence there: the removal is the human's own.
    expect(ghostFor(rm, 24, { us: 0, ussr: 2, ctrl: "NONE" }, "USSR")).toEqual({ side: "USSR", kind: "remove", n: 1 });
    expect(ghostFor(rm, 24, { us: 0, ussr: 0, ctrl: "NONE" }, "USSR")).toBeNull();
    expect(ghostFor(targetsOf([24], { verb: "coup" }), 24, v, "US")).toBeNull();
    expect(ghostFor(t, 7, v, "US")).toBeNull();
  });
});

describe("names", () => {
  it("standard detail uses the map-only abbreviations, detail the full names", () => {
    expect(mapLabel(9, "en", "standard")).toBe("Spain/Port.");
    expect(mapLabel(61, "en", "standard")).toBe("SE Afr. St.");
    expect(mapLabel(1, "en", "standard")).toBe("UK");
    expect(mapLabel(9, "zh", "standard")).toBe("西葡");
    expect(mapLabel(16, "zh", "standard")).toBe("捷克");
    expect(mapLabel(9, "en", "detail")).toBe("Spain/Portugal");
    expect(mapLabel(9, "en", "overview")).toBe("");
    expect(shortName(7, "en")).toBe("W. Germany");
    expect(fullName(44, "zh")).toBe("韩国");
  });

  it("fits a name: as is, squeezed down to 82 %, else the short name", () => {
    const room = nameRoom(false);
    const fixed = (w: number) => () => w;
    expect(fitLabel(2, "en", "detail", fixed(room - 1))).toEqual({ text: "Norway" });
    expect(fitLabel(2, "en", "detail", fixed(room / 0.9))).toEqual({ text: "Norway", textLength: room });
    // Too long at 82 %: the short name, squeezed if it must be.
    const byLen = (t: string) => t.length * 8;
    const l = fitLabel(9, "en", "detail", byLen);
    expect(l.text).toBe("Spain/Port.");
    expect(room / byLen("Spain/Portugal")).toBeLessThan(MIN_FIT);
    expect(fitLabel(9, "en", "overview", byLen)).toEqual({ text: "" });
    expect(nameRoom(true)).toBe(58);
    expect(nameRoom(false)).toBe(61);
  });
});

describe("navigation and hit tests", () => {
  it("arrow keys move to the nearest box in that direction", () => {
    expect(nearestInDirection(8, "right")).toBe(13); // France → Austria
    expect(nearestInDirection(8, "up")).toBe(6); // France → Benelux
    expect(nearestInDirection(25, "left")).toBe(24); // Iran → Iraq
    // Restricted to targets, a target is preferred even if farther.
    expect(nearestInDirection(8, "right", [17, 19])).toBe(17);
    expect(nearestInDirection(82, "down")).toBeNull(); // Argentina is the southernmost box
  });

  it("reading order is top-to-bottom, then left-to-right", () => {
    const order = readingOrder([24, 2, 25, 1]);
    expect(order[0]).toBe(2);
    expect(order.indexOf(24)).toBeLessThan(order.indexOf(25));
  });

  it("hit tests boxes and circles", () => {
    const c = COUNTRY_LAYOUT[25]!;
    expect(countryAt({ x: c.cx, y: c.cy })).toBe(25);
    expect(countryAt({ x: 2, y: 2 })).toBeNull();
    expect(countriesInCircle({ x: c.cx, y: c.cy }, 10, [24, 25, 26])).toEqual([25]);
    expect(countriesInCircle({ x: c.cx, y: c.cy }, 200, [24, 25, 26]).sort()).toEqual([24, 25, 26]);
  });
});

describe("tooltip placement", () => {
  it("prefers the side with more room, clamps to the window, arrow points at the box", () => {
    const right = placeTip({ left: 100, top: 300, width: 56, height: 36 }, 240, 120, 1440, 900);
    expect(right.placement).toBe("right");
    expect(right.left).toBe(100 + 56 + 12);
    expect(right.arrow).toBeCloseTo(318 - right.top);
    const left = placeTip({ left: 1300, top: 300, width: 56, height: 36 }, 240, 120, 1440, 900);
    expect(left.placement).toBe("left");
    expect(left.left).toBe(1300 - 12 - 240);
    const narrow = placeTip({ left: 100, top: 300, width: 190, height: 60 }, 240, 120, 390, 844);
    expect(narrow.placement).toBe("bottom");
    expect(narrow.left).toBeGreaterThanOrEqual(8);
    expect(narrow.left + 240).toBeLessThanOrEqual(390 - 8);
    const top = placeTip({ left: 300, top: 0, width: 56, height: 36 }, 240, 120, 1440, 900);
    expect(top.top).toBeGreaterThanOrEqual(8);
  });
});

describe("touch taps and the country tooltip (ui-spec §4.8, QA Q-020)", () => {
  const SWEDEN = 3, BENELUX = 6, UK = 1;
  it("a non-target tap opens its tooltip, a second tap on it closes it, another box moves it", () => {
    const open = tipAfterTap(TIP_CLOSED, { box: SWEDEN, target: false });
    expect(open).toEqual({ pinned: null, tipFor: SWEDEN });
    expect(tipAfterTap(open, { box: SWEDEN, target: false })).toEqual(TIP_CLOSED);
    expect(tipAfterTap(open, { box: BENELUX, target: false })).toEqual({ pinned: null, tipFor: BENELUX });
    // A pinned one (long-press) closes the same way.
    expect(tipAfterTap({ pinned: SWEDEN, tipFor: SWEDEN }, { box: SWEDEN, target: false })).toEqual(TIP_CLOSED);
  });

  it("a tap on the sea closes it; a target's tap (it plays) closes another box's tooltip and keeps its own", () => {
    expect(tipAfterTap({ pinned: SWEDEN, tipFor: SWEDEN }, { box: null, target: false })).toEqual(TIP_CLOSED);
    expect(tipAfterTap({ pinned: null, tipFor: SWEDEN }, { box: null, target: false })).toEqual(TIP_CLOSED);
    expect(tipAfterTap({ pinned: null, tipFor: SWEDEN }, { box: UK, target: true })).toEqual(TIP_CLOSED);
    const own = { pinned: UK, tipFor: UK };
    expect(tipAfterTap(own, { box: UK, target: true })).toBe(own);
    expect(tipAfterTap(TIP_CLOSED, { box: UK, target: true })).toBe(TIP_CLOSED);
  });
});

describe("transient popovers (R-008)", () => {
  const plate = { pinned: null, tipFor: null, plateTip: 0 as const };

  it("a plate popover opened at the headline prompt is gone at the next prompt, by touch or mouse", () => {
    expect(popoversAfter(plate, "context", true)).toEqual({ pinned: null, tipFor: null, plateTip: null });
    expect(popoversAfter(plate, "context", false)).toEqual({ pinned: null, tipFor: null, plateTip: null });
  });

  it("a new context closes a pinned tooltip, and a tapped one on touch; a mouse's hover tooltip stays", () => {
    expect(popoversAfter({ pinned: 5, tipFor: 5, plateTip: null }, "context", false)).toEqual({ pinned: null, tipFor: 5, plateTip: null });
    expect(popoversAfter({ pinned: null, tipFor: 7, plateTip: null }, "context", true)).toEqual({ pinned: null, tipFor: null, plateTip: null });
    const hover = { pinned: null, tipFor: 7, plateTip: null };
    expect(popoversAfter(hover, "context", false)).toBe(hover);
  });

  it("a press outside the map (a card, a drawer, a sheet, the popover) closes everything", () => {
    expect(popoversAfter(plate, "outside", true)).toEqual({ pinned: null, tipFor: null, plateTip: null });
    expect(popoversAfter({ pinned: 3, tipFor: 3, plateTip: null }, "outside", false)).toEqual({ pinned: null, tipFor: null, plateTip: null });
    const closed = { pinned: null, tipFor: null, plateTip: null };
    expect(popoversAfter(closed, "outside", true)).toBe(closed);
  });

  it("an anchor off the map closes the plate popover and a pinned tooltip; a hover / focus one only hides", () => {
    expect(popoversAfter(plate, "off-map", true)).toEqual({ pinned: null, tipFor: null, plateTip: null });
    const focus = { pinned: null, tipFor: 12, plateTip: null };
    expect(popoversAfter(focus, "off-map", false)).toBe(focus);
    const view = { left: 0, top: 54, width: 768, height: 700 };
    expect(anchorOnMap({ left: 207, top: 105, width: 108, height: 34 }, view)).toBe(true);
    // The phone after a rotation (r2-tablet-touch F5): the plate at x −24, y −41.
    expect(anchorOnMap({ left: -24, top: -41, width: 108, height: 34 }, view)).toBe(false);
    expect(anchorOnMap({ left: 700, top: 300, width: 60, height: 30 }, view)).toBe(true);
    expect(anchorOnMap({ left: 760, top: 300, width: 60, height: 30 }, view)).toBe(false);
  });
});
