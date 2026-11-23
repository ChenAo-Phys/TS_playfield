/**
 * src/data: the generated card and country modules are up to date and agree with DeepStruggle's
 * rules data and our card_text.json; lookups and helpers behave.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM generator without type declarations
import { OUTPUTS } from "../../tools/gen-data.mjs";
import {
  CARDS,
  CHINA_CARD,
  COUNTRIES,
  EFFECT_FLAGS,
  EFFECT_INFO_MAP,
  REGIONS,
  SUBREGIONS,
  areaByName,
  cardImageUrl,
  cardInfo,
  cardTextLines,
  cardTextPlain,
  countryByEngineName,
  countryInfo,
  dataLang,
  effectInfo,
  regionInfo,
} from "../../src/data";
import { CARDS_METADATA, MAP_METADATA } from "../../src/data/metadata";

const ROOT = join(__dirname, "..", "..");

describe("generated modules", () => {
  it("are up to date with tools/gen-data.mjs", () => {
    for (const [rel, build] of Object.entries(OUTPUTS as Record<string, () => string>)) {
      expect(readFileSync(join(ROOT, rel), "utf8"), `${rel} is stale: run node tools/gen-data.mjs`).toBe(build());
    }
  });
});

describe("cards", () => {
  const text = JSON.parse(readFileSync(join(ROOT, "game_resources/card_text.json"), "utf8")).cards as
    { id: number; title_en: string; title_zh: string; text_en: string; text_zh: string }[];

  it("has the 110 cards in id order", () => {
    expect(CARDS.map(c => c.id)).toEqual(Array.from({ length: 110 }, (_, i) => i + 1));
    expect(cardInfo(0)).toBeUndefined();
    expect(cardInfo(111)).toBeUndefined();
    expect(cardInfo(CHINA_CARD)?.title.en).toBe("The China Card");
  });

  it("takes titles and texts from card_text.json", () => {
    for (const t of text) {
      const c = cardInfo(t.id)!;
      expect(c.title).toEqual({ en: t.title_en, zh: t.title_zh });
      expect(c.text).toEqual({ en: t.text_en, zh: t.text_zh });
    }
  });

  it("agrees with DeepStruggle's rules/cards.json", () => {
    const side = { us: "US", ussr: "USSR", neutral: "NEUTRAL" } as const;
    const era = { "early war": "early", "middle war": "mid", "late war": "late" } as Record<string, string>;
    for (const d of CARDS_METADATA) {
      const c = cardInfo(d.id)!;
      expect(c.ops, `#${d.id}`).toBe(d.ops);
      expect(c.side, `#${d.id}`).toBe(side[d.side]);
      expect(c.era, `#${d.id}`).toBe(era[(d as unknown as { age: string }).age]);
      expect(c.starred, `#${d.id}`).toBe((d as unknown as { one_time: boolean }).one_time);
      expect(c.title.en, `#${d.id}`).toBe(d.name);
    }
  });

  it("flags scoring, war and optional cards", () => {
    expect(CARDS.filter(c => c.scoring).map(c => c.id)).toEqual([1, 2, 3, 37, 38, 79, 81]);
    expect(CARDS.filter(c => c.war).map(c => c.id)).toEqual([11, 13, 24, 36, 102]);
    expect(CARDS.filter(c => c.optional).map(c => c.id)).toEqual([104, 105, 106, 107, 108, 109, 110]);
    expect(CARDS.filter(c => c.scoring).every(c => c.ops === 0 && c.side === "NEUTRAL")).toBe(true);
    expect(cardInfo(38)!.starred).toBe(true); // Southeast Asia Scoring: removed after scoring
    expect(CARDS.filter(c => c.side === "US").length).toBe(42);
    expect(CARDS.filter(c => c.side === "USSR").length).toBe(40);
    expect(CARDS.filter(c => c.starred).length).toBe(70);
  });

  it("builds image URLs under the base path, Chinese for any zh tag", () => {
    expect(cardImageUrl(6, "en")).toMatch(/\/cards\/en\/006\.webp$/);
    expect(cardImageUrl(104, "zh-CN")).toMatch(/\/cards\/zh\/104\.webp$/);
    expect(cardImageUrl(21, "zh")).toMatch(/\/cards\/zh\/021\.webp$/);
    expect(cardImageUrl(21, "en-XA")).toMatch(/\/cards\/en\/021\.webp$/);
    for (const c of CARDS) {
      for (const lang of ["en", "zh"]) {
        const rel = cardImageUrl(c.id, lang).replace(/^.*\/cards\//, "public/cards/");
        expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      }
    }
  });

  it("splits card text markup", () => {
    expect(cardTextLines("a *b* c\nd")).toEqual([
      [{ text: "a ", em: false }, { text: "b", em: true }, { text: " c", em: false }],
      [{ text: "d", em: false }],
    ]);
    expect(cardTextLines("odd * star")).toEqual([[{ text: "odd * star", em: false }]]);
    expect(cardTextPlain("若美国持有*“中国牌”*(#6)")).toBe("若美国持有“中国牌”(#6)");
    for (const c of CARDS) {
      expect(cardTextPlain(c.text.zh)).not.toContain("*");
      expect(cardTextLines(c.text.en)).toHaveLength(1);
    }
  });

  // R-001: these English texts are transcribed from the printed (errata) cards, not DeepStruggle's
  // rules/cards.json, which lacks the clauses below. A regeneration from DeepStruggle's text must not drop them.
  it("keeps the errata clauses printed on the cards (R-001)", () => {
    const pins: [number, RegExp, RegExp][] = [
      [6, /Cancels effect of “#35 – Formosan Resolution” if this card is played by the US/, /取消“台湾决议案”\(#35\)/],
      [35, /or during Final Scoring at the end of Turn 10\. Taiwan is not a Battleground country for any other game purpose/,
        /第 10 回合结束进行最终计分时.*台湾在游戏的其他方面不是战场国/],
      [73, /Does not count for Final Scoring at the end of Turn 10\./, /对第 10 回合结束时的最终计分无效/],
      [87, /Improves effect of “#90 – Glasnost” Event\./, /增强“公开性”\(#90\) 事件的效果/],
      [100, /\(without Final Scoring Phase\)/, /（不进行最终计分）/],
      [103, /\(unless played on the Space Race\)/, /（用于太空竞赛时除外）/],
    ];
    for (const [id, en, zh] of pins) {
      const c = cardInfo(id)!;
      expect(c.text.en, `#${id} en`).toMatch(en);
      expect(cardTextPlain(c.text.zh), `#${id} zh`).toMatch(zh);
      // The guard's premise: DeepStruggle's description lacks the clause (if it ever gains it, R-001 can be revisited).
      const ds = (CARDS_METADATA as unknown as { id: number; description: string }[]).find(d => d.id === id)!;
      expect(ds.description, `#${id} ds`).not.toMatch(en);
    }
    expect(cardInfo(73)!.text.en).not.toContain("which ever");
  });

  it("maps language tags to card sets", () => {
    expect(dataLang("zh-CN")).toBe("zh");
    expect(dataLang("zh")).toBe("zh");
    expect(dataLang("zh-TW")).toBe("zh");
    expect(dataLang("en")).toBe("en");
    expect(dataLang("fr")).toBe("en");
    expect(dataLang(null)).toBe("en");
  });
});

describe("countries", () => {
  it("has the 84 countries in id order, matching DeepStruggle's rules/map.json", () => {
    expect(COUNTRIES.map(c => c.id)).toEqual(Array.from({ length: 84 }, (_, i) => i));
    const ds = MAP_METADATA.countries as unknown as { id: number; name: string; stability: number; battleground: boolean; superpower_adjacent: string | null }[];
    for (const d of ds) {
      const c = countryInfo(d.id)!;
      expect(c.engineName).toBe(d.name);
      expect(c.stability).toBe(d.stability);
      expect(c.battleground).toBe(d.battleground);
      expect(c.superpowerAdjacent).toBe(d.superpower_adjacent === "USA" ? "US" : d.superpower_adjacent);
      expect(countryByEngineName(d.name)).toBe(c);
    }
  });

  it("normalises superpower adjacency to US / USSR", () => {
    const adj = (sp: string) => COUNTRIES.filter(c => c.superpowerAdjacent === sp).map(c => c.id);
    expect(adj("US")).toEqual([0, 45, 64, 71]);
    expect(adj("USSR")).toEqual([5, 15, 19, 31, 43]);
    expect(COUNTRIES.some(c => (c.superpowerAdjacent as string) === "USA")).toBe(false);
  });

  it("has symmetric adjacency, 112 edges, 29 battlegrounds", () => {
    let edges = 0;
    for (const c of COUNTRIES) for (const n of c.neighbours) {
      expect(countryInfo(n)!.neighbours).toContain(c.id);
      edges++;
    }
    expect(edges / 2).toBe(112);
    expect(COUNTRIES.filter(c => c.battleground).length).toBe(29);
  });

  it("groups countries into regions and subregions by the engine's Region enum", () => {
    expect(REGIONS.map(r => r.key)).toEqual(["EUROPE", "ASIA", "MIDDLE_EAST", "AFRICA", "CENTRAL_AMERICA", "SOUTH_AMERICA"]);
    for (const r of REGIONS) {
      expect(regionInfo(r.id)).toBe(r);
      for (const id of r.countries) expect(countryInfo(id)!.region).toBe(r.id);
      expect(cardInfo(r.scoringCard)!.scoring).toBe(true);
    }
    expect(REGIONS.reduce((n, r) => n + r.countries.length, 0)).toBe(84);
    expect(SUBREGIONS.find(s => s.key === "SOUTHEAST_ASIA")!.countries).toEqual([34, 35, 36, 37, 38, 39, 40]);
    expect(countryInfo(13)!.subregions).toEqual(["WESTERN_EUROPE", "EASTERN_EUROPE"]); // Austria
    expect(areaByName("Southeast Asia")!.key).toBe("SOUTHEAST_ASIA");
    expect(areaByName("central_america")!.key).toBe("CENTRAL_AMERICA");
  });

  it("follows the glossary's Chinese names", () => {
    expect(countryInfo(6)!.name.zh).toBe("比荷卢");
    expect(countryInfo(50)!.name.zh).toBe("撒哈拉国家");
    expect(countryInfo(61)!.name.zh).toBe("东南非洲国家");
    expect(new Set(COUNTRIES.map(c => c.name.zh)).size).toBe(84);
  });
});

describe("third-party licences (QA Q-012)", () => {
  it("are published in public/ (up to date) and name every package the page ships", async () => {
    // @ts-expect-error -- plain ESM script without type declarations
    const { build, OUTPUT } = await import("../../tools/build-licenses.mjs");
    const published = readFileSync(join(ROOT, OUTPUT as string), "utf8");
    expect(published, "run node tools/build-licenses.mjs").toBe((build as () => string)());
    const deps = Object.keys((JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies);
    const names: Record<string, RegExp> = { react: /## React\b/, "react-dom": /React DOM/, i18next: /## i18next/, "onnxruntime-web": /## onnxruntime-web/ };
    for (const d of deps) expect(published, d).toMatch(names[d] ?? new RegExp(d));
    for (const notice of ["Copyright (c) Microsoft Corporation.", "Copyright (c) Facebook, Inc. and its affiliates.", "Copyright (c) 2011-present i18next",
      "Emscripten authors", "Rich Felker", "Mikhail Dektyarev"]) expect(published).toContain(notice);
    expect(published.split("Permission is hereby granted").length - 1).toBeGreaterThanOrEqual(6);
  });
});

describe("effects", () => {
  it("names a real card for every flag and has catalog words for it", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "src/i18n/locales/en/effects.json"), "utf8")) as Record<string, { name?: string }>;
    for (const flag of EFFECT_FLAGS) {
      const info = effectInfo(flag)!;
      expect(info.cardName).toBe(cardInfo(info.cardId)!.title.en);
      expect(en[flag]?.name, flag).toBeTruthy();
    }
    expect(EFFECT_INFO_MAP.NATO_ACTIVE!.cardId).toBe(21);
    expect(effectInfo("toString")).toBeNull();
  });

  it("names every flag the engine can put in the display state, except the bookkeeping ones (QA Q-006)", () => {
    // bindings/state_json.cpp at 5b95e91: every CHECK_FLAG bit, plus the Missile Envy obligation it adds after them.
    const BOOKKEEPING = /^(SPACE_(US|USSR)_ATTEMPT_\d|DEFCON_SUICIDE_PROVOKED|CMC_SUICIDE_LOSS|EUROPE_CONTROL_WIN)$/;
    const src = join(ROOT, "vendor/DeepStruggle/bindings/state_json.cpp");
    const engineFlags = existsSync(src)
      ? [...readFileSync(src, "utf8").matchAll(/CHECK_FLAG\((\w+)\)/g)].map(m => m[1]!).filter(f => f !== "f")
      : [...EFFECT_FLAGS.filter(f => !f.startsWith("MISSILE_ENVY_")), "SPACE_US_ATTEMPT_1", "CMC_SUICIDE_LOSS"];
    if (existsSync(src)) {
      expect(readFileSync(src, "utf8")).toContain('"MISSILE_ENVY_US" : "MISSILE_ENVY_USSR"');
      expect(engineFlags.length).toBe(47);
    }
    const flags = [...engineFlags, "MISSILE_ENVY_US", "MISSILE_ENVY_USSR"];
    const catalogs = ["en", "zh-CN"].map(lang =>
      JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${lang}/effects.json`), "utf8")) as Record<string, { name?: string }>);
    for (const flag of flags) {
      if (BOOKKEEPING.test(flag)) continue;
      expect(effectInfo(flag), flag).not.toBeNull();
      for (const c of catalogs) expect(c[flag]?.name, flag).toBeTruthy();
    }
    expect(effectInfo("MISSILE_ENVY_USSR")).toMatchObject({ cardId: 49, side: "USSR", duration: "CONDITIONAL" });
  });
});
