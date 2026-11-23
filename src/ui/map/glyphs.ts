/**
 * Side glyphs (24-unit paths, ui-spec §2.4): the shared copy in src/ui/common/glyphs.ts. The map draws
 * them at box size (well under 40 px), so it keeps the simplified hammer and sickle; `glyphPath(side, px)`
 * picks the large redraw from 40 px when a caller passes its size.
 */
export { STAR_PATH, HAMMER_SICKLE_PATH, glyphPath } from "../common/glyphs";
