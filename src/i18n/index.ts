// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The page's languages, with i18next. English is the default and the source: every message is an id
 * in locales/en/<namespace>.json (`t("ui:menu.newGame")`), and another language is the same ids in
 * locales/<lang>/, loaded only when it is chosen, with English for whatever it lacks.
 *
 * Card, country and region names are not in the catalogs: they come from src/data (our
 * card_text.json titles, reviewed country names) through `cardName`, `countryName`, `regionName`.
 * Engine names, enum values and saves stay as they are; only what the page shows is translated.
 *
 * The language is, in order: `?lang=` when the link names one (en, zh, zh-CN, ...), else the one
 * chosen last in this browser (localStorage "tsp.lang"), else the browser's preferred languages
 * (`navigator.languages`, first match wins: any zh* is Simplified Chinese, any en* English), else
 * English. Choosing one does not put it in the address, so a shared link keeps the reader's own.
 *
 * React components use `useI18n()` from ./react, which re-renders on a switch.
 *
 * `?lang=en-XA` is the pseudo-language: English with every message marked `⟦…⟧`, so text the page
 * shows unmarked was never translated. It is never offered in the language menu.
 */
import i18next from "i18next";
import type { ParseKeys } from "i18next";
import en from "./locales/en";
import { areaByName, cardInfo, cardTextPlain, countryInfo, dataLang, regionInfo, type DataLang } from "../data";

/** Each language by its own name, as the language menu offers it. A new one also goes in LOADERS. */
export const LANGUAGES = { en: "English", "zh-CN": "简体中文" } as const;
export const PSEUDO = "en-XA";
export type Language = keyof typeof LANGUAGES | typeof PSEUDO;

type Bundle = Record<string, object>;
/** A language's catalogs (locales/<lang>/index.ts), imported only when it is chosen. */
const LOADERS: Partial<Record<Language, () => Promise<{ default: Bundle }>>> = {
  "zh-CN": () => import("./locales/zh-CN"),
};
/** localStorage key of the language chosen last in this browser. */
export const STORAGE_KEY = "tsp.lang";

i18next.use({
  type: "postProcessor",
  name: "pseudo",
  process: (value: string) => (i18next.language === PSEUDO ? `⟦${value}⟧` : value),
});
void i18next.init({
  lng: "en",
  fallbackLng: "en",
  supportedLngs: [...Object.keys(LANGUAGES), PSEUDO],
  resources: { en },
  ns: Object.keys(en),
  defaultNS: "common",
  initAsync: false,
  // Messages are rendered as text by React (which escapes), or into innerHTML by callers that escape
  // parameters themselves (`render(m, { text: escapeHtml })`); never escaped twice.
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  postProcess: ["pseudo"],
});

/** The typed `t`: a key the English catalog lacks does not compile. */
export const t = i18next.t.bind(i18next) as typeof i18next.t;
/** `t` for an id built at run time (a card's, a country's); `fallback` when no language has it. */
const tDynamic = (key: string, fallback: string): string =>
  (i18next.t as unknown as (k: string, o: object) => string)(key, { defaultValue: fallback });

export function language(): Language {
  return i18next.language as Language;
}

/** True while the page is in Chinese. */
export function isChinese(): boolean {
  return language() === "zh-CN";
}

/** The data name set (src/data) for the current language. */
export function currentDataLang(): DataLang {
  return dataLang(language());
}

const isLanguage = (v: unknown): v is Language =>
  typeof v === "string" && (Object.hasOwn(LANGUAGES, v) || v === PSEUDO);

/**
 * A BCP 47 tag or a code as a page language: "en-XA" is the pseudo-language, any zh* (zh, zh-CN,
 * zh-Hans, zh-TW, zh_HK) is Simplified Chinese, any en* English; null for anything else.
 */
export function normalizeLanguage(tag: string | null | undefined): Language | null {
  if (typeof tag !== "string") return null;
  const v = tag.trim();
  if (v.toLowerCase() === PSEUDO.toLowerCase()) return PSEUDO;
  if (/^zh(?![a-z])/i.test(v)) return "zh-CN";
  if (/^en(?![a-z])/i.test(v)) return "en";
  return null;
}

/** What `detectLanguage` looks at; each field is optional (missing = nothing there). */
export interface LanguageEnvironment {
  /** `location.search`, e.g. "?lang=zh". */
  search?: string;
  /** The stored choice (localStorage "tsp.lang"). */
  stored?: string | null;
  /** `navigator.languages`, most preferred first. */
  languages?: readonly string[];
}

/** The language to start in: `?lang=` -> stored choice -> browser languages (first match) -> en. */
export function detectLanguage(env: LanguageEnvironment): Language {
  let fromLink: string | null = null;
  try {
    fromLink = new URLSearchParams(env.search ?? "").get("lang");
  } catch { /* malformed search */ }
  const linked = normalizeLanguage(fromLink);
  if (linked) return linked;
  const stored = env.stored;
  if (isLanguage(stored)) return stored;
  for (const tag of env.languages ?? []) {
    const lang = normalizeLanguage(tag);
    // The pseudo-language is for testers, who ask for it by link only.
    if (lang && lang !== PSEUDO) return lang;
  }
  return "en";
}

/**
 * The page's localStorage, or null. Under Node (no `window`) the global's own `localStorage` getter
 * is left alone: Node 26 defines one that only warns. A test's stubbed value is used.
 */
function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  const d = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (!d) return null;
  if (!("value" in d) && typeof window === "undefined") return null;
  return (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem"> }).localStorage ?? null;
}

/** This browser's environment for `detectLanguage` (empty under Node). */
export function browserEnvironment(): LanguageEnvironment {
  const env: LanguageEnvironment = {};
  try { env.search = globalThis.location?.search ?? ""; } catch { /* no location */ }
  try { env.stored = storage()?.getItem(STORAGE_KEY) ?? null; } catch { /* storage blocked */ }
  try {
    const nav = globalThis.navigator;
    if (nav) env.languages = nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [];
  } catch { /* no navigator */ }
  return env;
}

async function use(lang: Language): Promise<void> {
  const load = LOADERS[lang];
  if (load && !i18next.hasResourceBundle(lang, "common")) {
    const { default: bundle } = await load();
    for (const [ns, messages] of Object.entries(bundle)) i18next.addResourceBundle(lang, ns, messages, true, true);
  }
  await i18next.changeLanguage(lang);
}

/** Before the page draws: the language the link, this browser's choice or its settings ask for. */
export async function initLanguage(env: LanguageEnvironment = browserEnvironment()): Promise<Language> {
  try {
    await use(detectLanguage(env));
  } catch (e) {
    console.warn(`i18n: could not load the language, English stands: ${e instanceof Error ? e.message : e}`);
    await i18next.changeLanguage("en");
  }
  applyDocument();
  return language();
}

/**
 * Switch the page's language and remember it in this browser. Everything subscribed through
 * `onLanguageChange` (and every `useI18n()` component) redraws. A `?lang=` the page was opened with
 * is dropped from the address, so a reload keeps the choice.
 */
export async function setLanguage(lang: Language): Promise<void> {
  try { storage()?.setItem(STORAGE_KEY, lang); } catch { /* storage blocked */ }
  try {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.delete("lang");
      globalThis.history.replaceState(globalThis.history.state, "", url);
    }
  } catch { /* no location: under node */ }
  await use(lang);
}

/** Called after every switch, once the document is updated; returns an unsubscribe. */
export function onLanguageChange(listener: () => void): () => void {
  const wrapped = () => listener();
  i18next.on("languageChanged", wrapped);
  return () => i18next.off("languageChanged", wrapped);
}

/** The `<html lang>` for a page language. */
export function htmlLang(lang: Language): string {
  return lang === PSEUDO ? "en" : lang;
}

/** `<html lang>` and the window title follow the language. */
function applyDocument(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = htmlLang(language());
  document.title = t("ui:app.documentTitle");
  applyStatic(document);
}
// First, so the document is in the new language before any component redraws.
i18next.on("languageChanged", applyDocument);

const ATTRIBUTES = ["title", "placeholder", "aria-label"] as const;

/**
 * DOM-only helper, not needed by the React UI: `data-i18n="ns:key"` sets an element's text,
 * `data-i18n-title` (and `-placeholder`, `-aria-label`) the attribute.
 */
export function applyStatic(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => {
    el.textContent = tDynamic(el.dataset.i18n!, el.textContent ?? "");
  });
  for (const attr of ATTRIBUTES) {
    root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`).forEach(el => {
      el.setAttribute(attr, tDynamic(el.getAttribute(`data-i18n-${attr}`)!, el.getAttribute(attr) ?? ""));
    });
  }
  root.querySelectorAll<HTMLSelectElement>("select[data-language-select]").forEach(s => { s.value = language(); });
}

/**
 * DOM-only helper, not needed by the React UI: fill and wire every `<select data-language-select>`
 * with each language under its own name (and the pseudo-language while it is on).
 */
export function bindLanguageSelects(root: ParentNode = document): void {
  const offered: [string, string][] = Object.entries(LANGUAGES);
  if (language() === PSEUDO) offered.push([PSEUDO, `⟦${LANGUAGES.en}⟧`]);
  root.querySelectorAll<HTMLSelectElement>("select[data-language-select]").forEach(select => {
    select.innerHTML = "";
    for (const [code, name] of offered) select.add(new Option(name, code));
    select.value = language();
    select.addEventListener("change", () => { if (isLanguage(select.value)) void setLanguage(select.value); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Names of cards, countries, regions and sides
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A name from src/data in the current language, marked in the pseudo-language. */
function named(name: { en: string; zh: string }): string {
  const lang = language();
  if (lang === PSEUDO) return `⟦${name.en}⟧`;
  return name[dataLang(lang)];
}

/**
 * A card's title by id, in the current language (our card_text.json titles, which the Chinese card
 * images carry). `english` (the engine's name) is used only for an id we have no card for.
 */
export function cardName(id: number, english?: string): string {
  const c = cardInfo(id);
  return c ? named(c.title) : english ?? `#${id}`;
}
/** A card's Event text by id, in the current language, as plain text (line breaks kept). */
export function cardDescription(id: number, english?: string): string {
  const c = cardInfo(id);
  if (!c) return english ?? "";
  return cardTextPlain(named(c.text));
}
/** A country's name by engine id, in the current language; `english` only for an unknown id. */
export function countryName(id: number, english?: string): string {
  const c = countryInfo(id);
  return c ? named(c.name) : english ?? `#${id}`;
}
/** A country's short label for tight map boxes ("UK", "W. Germany", 沙特). */
export function countryShortName(id: number, english?: string): string {
  const c = countryInfo(id);
  return c ? named(c.short) : english ?? `#${id}`;
}
/**
 * A region or subregion by its English name ("Middle East", "Southeast Asia") or engine key
 * ("MIDDLE_EAST"), as rules/map.json and the engine's layout name them; anything else unchanged.
 */
export function regionName(english: string): string {
  const area = areaByName(english);
  return area ? named(area.name) : english;
}
/** A region by the engine's Region enum (EUROPE 0, ASIA 1, MIDDLE_EAST 2, AFRICA 3, CA 4, SA 5). */
export function regionNameById(id: number): string {
  const r = regionInfo(id);
  return r ? named(r.name) : `#${id}`;
}
/** A side as the engine names it ("US", "USSR"); anything else unchanged. */
export function sideName(side: string): string {
  return tDynamic(`common:side.${side}`, side);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Any message id of the English catalog, `ns:dotted.id` (a plural by its base id). */
export type MessageKey = ParseKeys<(keyof typeof en)[]>;

/**
 * A message kept to be rendered later, in whatever language is current then: its id and its
 * parameters, never its text. Built where the words are decided (the action log, a prompt's title),
 * rendered where they are shown -- so a language switch redraws it, and code that needs to know
 * what was said reads the id and the ids in its parameters, never the words.
 */
export interface Message {
  key: MessageKey;
  params?: Record<string, MessageArg>;
}
/**
 * A parameter: text or a number as it is, a nested message, or a card / country / region / side by
 * what the engine calls it, named in the current language when rendered (`name` is the English).
 */
export type MessageArg =
  | string | number | Message
  | { card: number; name: string }
  | { country: number; name: string }
  | { region: string }
  | { side: string };

export function message(key: MessageKey, params?: Record<string, MessageArg>): Message {
  return params ? { key, params } : { key };
}

/** How a rendering shows each kind of parameter; by default plain names and text as it is. */
export interface MessageFormat {
  /** Text and numbers: `escapeHtml` for innerHTML. */
  text?: (s: string) => string;
  /** A card by id and its name in the current language: the log's hoverable reference. */
  card?: (id: number, name: string) => string;
  country?: (id: number, name: string) => string;
}

const isMessage = (a: MessageArg): a is Message => typeof a === "object" && "key" in a;

/** What `renderEnglish` asks of every lookup: English, and unmarked even in the pseudo-language. */
const ENGLISH = { lng: "en", applyPostProcessor: false } as const;

/** A message id with its values, in the current language or (`english`) in English. */
function lookup(key: string, values: object, english: boolean): string {
  return (i18next.t as unknown as (k: string, o: object) => string)(key, english ? { ...values, ...ENGLISH } : values);
}

function formatArg(a: MessageArg, how: MessageFormat, english: boolean): string {
  const text = how.text ?? ((s: string) => s);
  if (typeof a === "string" || typeof a === "number") return text(String(a));
  if (isMessage(a)) return renderIn(a, how, english);
  if ("card" in a) {
    const name = english ? cardInfo(a.card)?.title.en ?? a.name : cardName(a.card, a.name);
    return how.card ? how.card(a.card, name) : text(name);
  }
  if ("country" in a) {
    const name = english ? countryInfo(a.country)?.name.en ?? a.name : countryName(a.country, a.name);
    return how.country ? how.country(a.country, name) : text(name);
  }
  if ("region" in a) return text(english ? areaByName(a.region)?.name.en ?? a.region : regionName(a.region));
  return text(english ? lookup(`common:side.${a.side}`, { defaultValue: a.side }, true) : sideName(a.side));
}

function renderIn(m: Message, how: MessageFormat, english: boolean): string {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) {
    values[k] = k === "count" && typeof v === "number" ? v : formatArg(v, how, english);
  }
  return lookup(m.key, values, english);
}

/**
 * A message in the current language. `count` stays a number (it picks the plural form); every other
 * parameter is formatted by `how` -- for innerHTML, `{ text: escapeHtml }`, and the catalog's own
 * markup is kept.
 */
export function render(m: Message, how: MessageFormat = {}): string {
  return renderIn(m, how, false);
}

/**
 * A message in English whatever the page's language, unmarked even in the pseudo-language, with its
 * cards, countries and regions under their English names. Only for text kept as English data (tests,
 * debug output, anything stored).
 */
export function renderEnglish(m: Message, how: MessageFormat = {}): string {
  return renderIn(m, how, true);
}

/**
 * A message id built at run time (a flag's, an enum name's) as a Message, or null when the English
 * catalog has no such id -- the caller then shows what it showed before there was a catalog.
 */
export function messageIfKnown(key: string, params?: Record<string, MessageArg>): Message | null {
  return i18next.exists(key, { lng: "en" }) ? message(key as MessageKey, params) : null;
}

/** An ongoing effect's words (`effects:<FLAG>.*`) in the current language, or null if unknown. */
export function effectText(flag: string): { name: string; short: string; description: string } | null {
  const name = messageIfKnown(`effects:${flag}.name`);
  if (!name) return null;
  const short = messageIfKnown(`effects:${flag}.short`) ?? name;
  const description = messageIfKnown(`effects:${flag}.description`);
  return { name: render(name), short: render(short), description: description ? render(description) : "" };
}
