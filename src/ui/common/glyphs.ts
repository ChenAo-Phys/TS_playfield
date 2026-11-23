/**
 * Side glyphs (ui-spec §2.4): 24-unit paths drawn with `fill: currentColor`. The two base paths are
 * normative and used verbatim everywhere (the map keeps an identical copy in src/ui/map/glyphs.ts).
 * HAMMER_SICKLE_PATH_LARGE is the cleaner redraw for sizes of 40 px and up (same box, same weight).
 */
import type { Side } from "../../game/contract";

export const STAR_PATH = "M12 1.6l2.9 7.1 7.6.5-5.9 4.9 1.9 7.4L12 17.4l-6.4 4.1 1.9-7.4-5.9-4.9 7.6-.5z";

export const HAMMER_SICKLE_PATH =
  "M14.6 3.2c3.9 1.1 6.6 4.7 6.6 8.8 0 5-4.1 9.1-9.1 9.1-2.6 0-4.9-1.1-6.6-2.8l-2.2 2.2-1.4-1.4 2.2-2.2C2.9 15.2 2.4 13.5 2.4 12c0 0 1.6 4.1 6 5.4 4.6 1.3 9.7-1.6 10.2-6.6.3-3.3-1.4-6.2-4-7.6z M6.1 4.3l2.6-2.6 4.6 4.6-1.6 1.6 7.8 7.8-1.5 1.5-7.8-7.8-1.6 1.6z";

/**
 * The hammer and sickle redrawn for large sizes (≥ LARGE_GLYPH_PX), same 24-unit box (ui-spec §17,
 * optional asset): a true crescent blade between two circles that meet at the tip (outer r 8.8 about
 * (12.6, 11.2), the inner one offset up-left so the blade tapers from 0 at the tip to ~3 units at the
 * lower right), a separate grip, a 2-unit handle at 45° and a hammer head square to it with a bevelled
 * peen. All subpaths fill with the non-zero rule.
 */
export const HAMMER_SICKLE_PATH_LARGE =
  "M12.29 2.41A8.8 8.8 0 1 1 5.67 16.62L5.88 15.13A7.59 7.59 0 1 0 12.29 2.41zM6.98 16.5L4.04 19.5L2.18 17.68L5.12 14.68zM7.54 6.06L17.02 15.53L15.53 17.02L6.06 7.54zM10.34 4.68L8.36 2.7L3.48 7.58L3.19 8.85L4.68 10.34z";

/** From this rendered size (CSS px) up, SideGlyph uses the large redraw. */
export const LARGE_GLYPH_PX = 40;

/** The path for a side at a rendered size (px); the simplified hammer and sickle below 40 px. */
export function glyphPath(side: Side, px = 24): string {
  if (side === "US") return STAR_PATH;
  return px >= LARGE_GLYPH_PX ? HAMMER_SICKLE_PATH_LARGE : HAMMER_SICKLE_PATH;
}
