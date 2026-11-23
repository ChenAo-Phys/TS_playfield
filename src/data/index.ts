/**
 * Static game data and lookups: cards (src/data/cards.ts), countries / regions / subregions
 * (src/data/countries.ts), ongoing effects (src/data/effects.ts). Both generated modules come from
 * tools/gen-data.mjs.
 *
 * These are language-neutral: each name is `{ en, zh }`. For the current page language use the
 * i18n layer (`cardName`, `countryName`, `regionName` in src/i18n), which reads these.
 */
import { CARDS, type CardInfo } from "./cards";
import { COUNTRIES, REGIONS, SUBREGIONS, type CountryInfo, type RegionInfo, type SubregionInfo } from "./countries";

export * from "./cards";
export * from "./countries";
export * from "./effects";

/** The two card/country name sets we have. Every Chinese language tag maps to "zh". */
export type DataLang = "en" | "zh";

/** "zh", "zh-CN", "zh-Hans-SG", "zh-TW" -> "zh"; anything else -> "en". */
export function dataLang(lang: string | null | undefined): DataLang {
  return typeof lang === "string" && /^zh(?![a-z])/i.test(lang) ? "zh" : "en";
}

/** Card ids 1..110 in order. */
export const CARD_IDS: readonly number[] = Object.freeze(CARDS.map(c => c.id));

/** The China Card's engine id. */
export const CHINA_CARD = 6;

export function cardInfo(id: number): CardInfo | undefined {
  const c = CARDS[id - 1];
  return c && c.id === id ? c : undefined;
}

export function countryInfo(id: number): CountryInfo | undefined {
  const c = COUNTRIES[id];
  return c && c.id === id ? c : undefined;
}

const COUNTRY_BY_ENGINE_NAME: ReadonlyMap<string, CountryInfo> = new Map(COUNTRIES.map(c => [c.engineName, c]));

/** A country by the engine's name (the key of the display state's `countries`). */
export function countryByEngineName(name: string): CountryInfo | undefined {
  return COUNTRY_BY_ENGINE_NAME.get(name);
}

export function regionInfo(id: number): RegionInfo | undefined {
  const r = REGIONS[id];
  return r && r.id === id ? r : undefined;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const AREA_BY_NAME: ReadonlyMap<string, RegionInfo | SubregionInfo> = new Map([
  ...[...REGIONS, ...SUBREGIONS].flatMap(a => [[squash(a.name.en), a], [squash(a.key), a]] as const),
  // The engine's and DeepStruggle's other spellings of Southeast Asia ("SE_ASIA", "SE Asia").
  ["seasia", SUBREGIONS.find(s => s.key === "SOUTHEAST_ASIA")!],
]);

/**
 * A region or subregion by any of its names: English ("Middle East"), engine key ("MIDDLE_EAST"),
 * or the title-cased engine key DeepStruggle passes ("Middle East", "Se Asia"). Case and
 * punctuation are ignored.
 */
export function areaByName(name: string): RegionInfo | SubregionInfo | undefined {
  return AREA_BY_NAME.get(squash(name));
}

/**
 * The URL of a card's image (500x700 WebP in public/cards/), under the site's base path.
 * `lang` is a page language or a DataLang: any Chinese tag gets the Chinese card.
 */
export function cardImageUrl(id: number, lang: string): string {
  return `${baseUrl()}cards/${dataLang(lang)}/${String(id).padStart(3, "0")}.webp`;
}

function baseUrl(): string {
  let base = "/";
  try {
    base = import.meta.env?.BASE_URL ?? "/";
  } catch { /* not under Vite */ }
  return base.endsWith("/") ? base : `${base}/`;
}

/** A run of card text: plain, or italic (`*…*` in card_text.json). */
export interface CardTextSpan {
  readonly text: string;
  readonly em: boolean;
}

/**
 * Card text split into lines (at "\n") of spans (at "*"), for rendering with <em> and line breaks.
 * An unmatched "*" is kept as text.
 */
export function cardTextLines(text: string): CardTextSpan[][] {
  return text.split("\n").map(line => {
    const parts = line.split("*");
    if (parts.length % 2 === 0) return [{ text: line, em: false }];
    const spans: CardTextSpan[] = [];
    parts.forEach((part, i) => { if (part) spans.push({ text: part, em: i % 2 === 1 }); });
    return spans;
  });
}

/** Card text without markup ("*" dropped, line breaks kept). */
export function cardTextPlain(text: string): string {
  return cardTextLines(text).map(line => line.map(s => s.text).join("")).join("\n");
}
