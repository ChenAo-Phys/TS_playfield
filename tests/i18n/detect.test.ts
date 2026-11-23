/**
 * Language detection order (?lang= -> localStorage "tsp.lang" -> navigator.languages -> en), the
 * browser environment it reads, and what a switch does to the document and the stored choice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PSEUDO,
  STORAGE_KEY,
  browserEnvironment,
  detectLanguage,
  htmlLang,
  initLanguage,
  language,
  normalizeLanguage,
  onLanguageChange,
  setLanguage,
} from "../../src/i18n";

afterEach(async () => {
  vi.unstubAllGlobals();
  await setLanguage("en");
});

describe("normalizeLanguage", () => {
  it.each([
    ["en", "en"], ["en-US", "en"], ["EN-gb", "en"],
    ["zh", "zh-CN"], ["zh-CN", "zh-CN"], ["zh-TW", "zh-CN"], ["zh-Hans-SG", "zh-CN"], ["zh_HK", "zh-CN"], ["ZH", "zh-CN"],
    ["en-XA", PSEUDO], ["en-xa", PSEUDO],
    ["fr", null], ["zhx", null], ["english", null], ["", null], [null, null], [undefined, null],
  ] as const)("%s -> %s", (tag, want) => {
    expect(normalizeLanguage(tag)).toBe(want);
  });
});

describe("detectLanguage", () => {
  it("defaults to English", () => {
    expect(detectLanguage({})).toBe("en");
    expect(detectLanguage({ languages: [] })).toBe("en");
    expect(detectLanguage({ languages: ["de-DE", "fr"] })).toBe("en");
  });

  it("1. ?lang= wins over everything", () => {
    expect(detectLanguage({ search: "?lang=zh", stored: "en", languages: ["en-US"] })).toBe("zh-CN");
    expect(detectLanguage({ search: "?lang=en", stored: "zh-CN", languages: ["zh-CN"] })).toBe("en");
    expect(detectLanguage({ search: "?foo=1&lang=zh-TW" })).toBe("zh-CN");
    expect(detectLanguage({ search: "?lang=en-XA" })).toBe(PSEUDO);
  });

  it("an unknown ?lang= is ignored", () => {
    expect(detectLanguage({ search: "?lang=fr", stored: "zh-CN" })).toBe("zh-CN");
    expect(detectLanguage({ search: "?lang=", languages: ["zh"] })).toBe("zh-CN");
  });

  it("2. the stored choice wins over the browser's languages", () => {
    expect(detectLanguage({ stored: "en", languages: ["zh-CN"] })).toBe("en");
    expect(detectLanguage({ stored: "zh-CN", languages: ["en-US"] })).toBe("zh-CN");
  });

  it("an invalid stored value is ignored", () => {
    expect(detectLanguage({ stored: "klingon", languages: ["zh-HK"] })).toBe("zh-CN");
    expect(detectLanguage({ stored: null, languages: ["zh-HK"] })).toBe("zh-CN");
  });

  it("3. the browser's languages: the first one we have wins, any zh* is Chinese", () => {
    expect(detectLanguage({ languages: ["zh-CN", "en"] })).toBe("zh-CN");
    expect(detectLanguage({ languages: ["zh-TW"] })).toBe("zh-CN");
    expect(detectLanguage({ languages: ["fr-FR", "zh-Hant", "en"] })).toBe("zh-CN");
    expect(detectLanguage({ languages: ["en-GB", "zh-CN"] })).toBe("en");
    expect(detectLanguage({ languages: ["ja", "en-US", "zh"] })).toBe("en");
  });

  it("the pseudo-language comes only from a link", () => {
    expect(detectLanguage({ languages: ["en-XA", "zh"] })).toBe("zh-CN");
    expect(detectLanguage({ stored: PSEUDO })).toBe(PSEUDO);
  });
});

/** A tiny localStorage. */
function fakeStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    data,
  };
}

/** Just enough document for the i18n layer: <html lang>, the title and an empty querySelectorAll. */
function fakeDocument() {
  return { documentElement: { lang: "en" }, title: "", querySelectorAll: () => [] };
}

describe("browser environment", () => {
  it("reads location.search, localStorage tsp.lang and navigator.languages", () => {
    vi.stubGlobal("location", { search: "?lang=zh", href: "https://example.org/TS_playfield/?lang=zh" });
    vi.stubGlobal("localStorage", fakeStorage({ [STORAGE_KEY]: "en" }));
    vi.stubGlobal("navigator", { languages: ["zh-CN", "en"], language: "zh-CN" });
    expect(browserEnvironment()).toEqual({ search: "?lang=zh", stored: "en", languages: ["zh-CN", "en"] });
    expect(STORAGE_KEY).toBe("tsp.lang");
  });

  it("falls back to navigator.language", () => {
    vi.stubGlobal("location", { search: "" });
    vi.stubGlobal("localStorage", fakeStorage());
    vi.stubGlobal("navigator", { languages: [], language: "zh-SG" });
    const env = browserEnvironment();
    expect(env.languages).toEqual(["zh-SG"]);
    expect(detectLanguage(env)).toBe("zh-CN");
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } });
    vi.stubGlobal("navigator", { languages: ["zh"] });
    expect(detectLanguage(browserEnvironment())).toBe("zh-CN");
  });
});

describe("initLanguage / setLanguage", () => {
  it("starts in the detected language and updates <html lang> and the title", async () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const lang = await initLanguage({ languages: ["zh-TW"] });
    expect(lang).toBe("zh-CN");
    expect(language()).toBe("zh-CN");
    expect(doc.documentElement.lang).toBe("zh-CN");
    expect(doc.title).toBe("冷战热斗 · AI 对战");
    await setLanguage("en");
    expect(doc.documentElement.lang).toBe("en");
    expect(doc.title).toBe("Twilight Struggle Playfield");
  });

  it("remembers the choice, drops ?lang= from the address, and notifies subscribers", async () => {
    const storage = fakeStorage();
    const replaced: string[] = [];
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("location", { href: "https://example.org/TS_playfield/?lang=en&x=1", search: "?lang=en&x=1" });
    vi.stubGlobal("history", { state: null, replaceState: (_s: unknown, _t: string, url: URL) => { replaced.push(String(url)); } });
    let calls = 0;
    const off = onLanguageChange(() => { calls++; });
    await setLanguage("zh-CN");
    off();
    await setLanguage("en");
    expect(storage.data.get(STORAGE_KEY)).toBe("en");
    expect(replaced[0]).toBe("https://example.org/TS_playfield/?x=1");
    expect(calls).toBe(1);
  });

  it("html lang of the pseudo-language is English", () => {
    expect(htmlLang(PSEUDO)).toBe("en");
    expect(htmlLang("zh-CN")).toBe("zh-CN");
  });
});
