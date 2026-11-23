/**
 * Popover placement (src/ui/common/placement.ts).
 */
import { describe, expect, it } from "vitest";
import { intersects, placeCentered, placePopover } from "../../../src/ui/common/placement";

const VP = { width: 1440, height: 900 };
const size = { width: 528, height: 409 };

describe("placePopover", () => {
  it("opens above the anchor when asked and there is room", () => {
    const anchor = { left: 600, top: 740, width: 104, height: 146 };
    const p = placePopover(anchor, size, VP, { placement: "top" });
    expect(p.placement).toBe("top");
    expect(p.top + size.height).toBeLessThanOrEqual(anchor.top - 12 + 0.01);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });

  it("flips to the other side when the preferred one has no room", () => {
    const anchor = { left: 600, top: 40, width: 104, height: 40 };
    expect(placePopover(anchor, size, VP, { placement: "top" }).placement).toBe("bottom");
  });

  it("keeps off an avoid rect (the slip) when another side allows it", () => {
    const anchor = { left: 300, top: 470, width: 60, height: 40 };
    const slip = { left: 12, top: 30, width: 344, height: 860 };
    const p = placePopover(anchor, { width: 300, height: 300 }, VP, { placement: "left", avoid: [slip] });
    expect(intersects({ left: p.left, top: p.top, width: 300, height: 300 }, slip)).toBe(false);
  });

  it("clamps into the viewport and keeps the arrow on the anchor", () => {
    const anchor = { left: 1400, top: 450, width: 30, height: 20 };
    const p = placePopover(anchor, { width: 240, height: 160 }, VP, { placement: "auto" });
    expect(p.placement).toBe("left");
    expect(p.left + 240).toBeLessThanOrEqual(1400);
    expect(p.arrow).toBeGreaterThanOrEqual(12);
  });

  it("auto prefers the roomier horizontal side", () => {
    expect(placePopover({ left: 100, top: 400, width: 50, height: 50 }, { width: 200, height: 100 }, VP).placement).toBe("right");
    expect(placePopover({ left: 1300, top: 400, width: 50, height: 50 }, { width: 200, height: 100 }, VP).placement).toBe("left");
  });

  it("centres without an anchor", () => {
    expect(placeCentered({ width: 400, height: 300 }, VP)).toMatchObject({ left: 520, top: 300, placement: "center" });
  });
});
