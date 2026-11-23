/**
 * Country names on the map (ui-spec §4.3 "Name source") and the text-fitting rule.
 *
 * Standard detail uses short names: the data's `short` (src/data), which holds the map abbreviations
 * of ui-spec §4.3 (gap G12). Detail level uses the full name, fitted; below 82 % it falls back to the
 * short one.
 */
import { COUNTRIES, type DataLang } from "../../data";
import type { MapDetail } from "../theme";
import { nameRoom } from "./layout";

/** The map's short name: the data's `short`, which carries the ui-spec §4.3 map abbreviations (gap G12). */
export function shortName(id: number, lang: DataLang): string {
  return COUNTRIES[id]?.short[lang] ?? String(id);
}

export function fullName(id: number, lang: DataLang): string {
  return COUNTRIES[id]?.name[lang] ?? String(id);
}

/** The label at a detail level, before fitting (overview shows no names). */
export function mapLabel(id: number, lang: DataLang, detail: MapDetail): string {
  if (detail === "overview") return "";
  return detail === "detail" ? fullName(id, lang) : shortName(id, lang);
}

/** Never squeeze a name below this fraction of its natural width (ui-spec §4.3). */
export const MIN_FIT = 0.82;

/** Name font sizes in map units (before the label-scale setting). */
export const NAME_SIZE: Readonly<Record<DataLang, number>> = { en: 15, zh: 14.6 };

export interface FittedLabel {
  text: string;
  /** Set when the text must be squeezed to this length (SVG textLength, spacingAndGlyphs). */
  textLength?: number;
}

/**
 * Choose and fit a country's label. `measure(text)` returns the natural width in map units at the
 * final font size (label scale included).
 */
export function fitLabel(
  id: number,
  lang: DataLang,
  detail: MapDetail,
  measure: (text: string) => number,
): FittedLabel {
  const room = nameRoom(COUNTRIES[id]?.battleground ?? false);
  const fit = (text: string): FittedLabel | null => {
    const w = measure(text);
    if (w <= room) return { text };
    if (room / w >= MIN_FIT) return { text, textLength: room };
    return null;
  };
  if (detail === "overview") return { text: "" };
  if (detail === "detail") {
    const full = fit(fullName(id, lang));
    if (full) return full;
  }
  const short = shortName(id, lang);
  // The short name is the last resort: squeeze it whatever it takes.
  return fit(short) ?? { text: short, textLength: room };
}
