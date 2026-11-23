/**
 * Card, country, region and side names in both languages, and Messages rendered with them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PSEUDO,
  cardDescription,
  cardName,
  countryName,
  countryShortName,
  effectText,
  language,
  message,
  regionName,
  regionNameById,
  render,
  renderEnglish,
  setLanguage,
  sideName,
  t,
} from "../../src/i18n";
import { enumLabel } from "../../src/i18n/enums";
import { CARDS, CARD_IDS, COUNTRIES, EFFECT_FLAGS, REGIONS, SUBREGIONS } from "../../src/data";

const CJK = /[一-鿿]/;

describe("names in English", () => {
  beforeAll(async () => { await setLanguage("en"); });

  it("starts in English", () => {
    expect(language()).toBe("en");
  });

  it("names every card by our English title", () => {
    expect(CARD_IDS).toEqual(Array.from({ length: 110 }, (_, i) => i + 1));
    for (const c of CARDS) {
      expect(cardName(c.id, "engine name")).toBe(c.title.en);
      expect(cardName(c.id)).toBe(c.title.en);
      expect(cardDescription(c.id)).toBe(c.text.en);
    }
    expect(cardName(6)).toBe("The China Card");
    expect(cardName(250, "Eagle/Bear Landed discard")).toBe("Eagle/Bear Landed discard");
    expect(cardName(999)).toBe("#999");
  });

  it("names every country by its engine name", () => {
    expect(COUNTRIES.length).toBe(84);
    for (const c of COUNTRIES) {
      expect(countryName(c.id)).toBe(c.engineName);
      expect(countryShortName(c.id).length).toBeGreaterThan(0);
    }
    expect(countryShortName(1)).toBe("UK");
    expect(countryName(84, "Nowhere")).toBe("Nowhere");
  });

  it("names regions by English name, engine key, or DeepStruggle's spellings", () => {
    expect(regionName("Middle East")).toBe("Middle East");
    expect(regionName("MIDDLE_EAST")).toBe("Middle East");
    expect(regionName("Se Asia")).toBe("Southeast Asia");
    expect(regionName("SE_ASIA")).toBe("Southeast Asia");
    expect(regionName("Atlantis")).toBe("Atlantis");
    expect(regionNameById(1)).toBe("Asia");
    expect(regionNameById(2)).toBe("Middle East");
    expect(enumLabel("region", "CENTRAL_AMERICA")).toBe("Central America");
  });

  it("names sides", () => {
    expect(sideName("US")).toBe("US");
    expect(sideName("USSR")).toBe("USSR");
    expect(sideName("NONE")).toBe("NONE");
  });
});

describe("names in Chinese", () => {
  beforeAll(async () => { await setLanguage("zh-CN"); });
  afterAll(async () => { await setLanguage("en"); });

  it("switches to zh-CN", () => {
    expect(language()).toBe("zh-CN");
    expect(t("ui:menu.newGame")).toBe("新游戏");
  });

  it("names every card by our Chinese title (the one on our card images)", () => {
    for (const c of CARDS) {
      const name = cardName(c.id, c.title.en);
      expect(name).toBe(c.title.zh);
      expect(name).toMatch(CJK);
      const text = cardDescription(c.id);
      expect(text).toMatch(CJK);
      expect(text).not.toContain("*");
    }
    expect(cardName(21)).toBe("北约"); // DeepStruggle: 北大西洋公约组织
    expect(cardName(76)).toBe("珍宝岛事件"); // DeepStruggle: 乌苏里江冲突
    expect(cardName(104)).toBe("剑桥五人组");
    expect(cardName(6)).toBe("中国牌");
  });

  it("names every country in Chinese", () => {
    for (const c of COUNTRIES) {
      expect(countryName(c.id, c.engineName)).toBe(c.name.zh);
      expect(c.name.zh).toMatch(CJK);
      expect(countryShortName(c.id)).toMatch(CJK);
    }
    expect(countryName(7)).toBe("西德");
    expect(countryName(61)).toBe("东南非洲国家"); // as card #52 says
    expect(countryShortName(73)).toBe("多米尼加");
  });

  it("names regions and subregions", () => {
    for (const area of [...REGIONS, ...SUBREGIONS]) {
      expect(regionName(area.name.en)).toBe(area.name.zh);
      expect(regionName(area.key)).toBe(area.name.zh);
    }
    expect(regionName("Middle East")).toBe("中东");
    expect(regionNameById(0)).toBe("欧洲");
    expect(enumLabel("region", "SOUTH_AMERICA")).toBe("南美洲");
  });

  it("names sides", () => {
    expect(sideName("US")).toBe("美国");
    expect(sideName("USSR")).toBe("苏联");
  });

  it("renders Messages with card, country, region and side parameters in Chinese, English on demand", () => {
    const m = message("log:roll.coup", {
      country: { country: 7, name: "West Germany" },
      roller: { side: "USSR" },
      roll: 4, mod: 3, total: 7, defense: 8, stability: 4,
      result: message("log:roll.coupFailed"),
    });
    const zh = render(m);
    expect(zh).toContain("西德");
    expect(zh).toContain("苏联");
    expect(zh).toContain("稳定度");
    const en = renderEnglish(m);
    expect(en).toContain("West Germany");
    expect(en).toContain("USSR");
    expect(en).not.toMatch(CJK);

    const card = message("log:eventTrack.vp", { card: { card: 21, name: "NATO" }, id: 21, side: { side: "US" }, vp: 1 });
    expect(render(card)).toContain("北约");
    expect(render(card, { card: (id, name) => `[${id}:${name}]` })).toContain("[21:北约]");
    expect(renderEnglish(card)).toContain("NATO");
  });

  it("names every ongoing effect", () => {
    for (const flag of EFFECT_FLAGS) {
      const text = effectText(flag);
      expect(text, flag).not.toBeNull();
      expect(text!.name).toMatch(CJK);
    }
    expect(effectText("NOT_A_FLAG")).toBeNull();
  });
});

describe("pseudo-language", () => {
  afterAll(async () => { await setLanguage("en"); });

  it("marks catalog messages and names", async () => {
    await setLanguage(PSEUDO);
    expect(t("ui:menu.newGame")).toBe("⟦New game⟧");
    expect(cardName(21)).toBe("⟦NATO⟧");
    expect(countryName(7)).toBe("⟦West Germany⟧");
    expect(regionName("Asia")).toBe("⟦Asia⟧");
    expect(renderEnglish(message("ui:menu.newGame"))).toBe("New game");
  });
});
