/**
 * The message catalogs: zh-CN covers every English key with the same placeholders and markup, the
 * glossary (docs/glossary.md) holds, and the `ui` namespace covers what the contract and our card
 * labels need.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../src/i18n/locales/en";
import zh from "../../src/i18n/locales/zh-CN";
import { REGIONS, SUBREGIONS } from "../../src/data";

const ROOT = join(__dirname, "..", "..");
type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
/** Keys with plural suffixes folded to their base id; values of all forms joined. */
function byBase(tree: Tree): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [k, v] of flatten(tree)) {
    const base = k.replace(PLURAL, "");
    out.set(base, [...(out.get(base) ?? []), v]);
  }
  return out;
}

const placeholders = (vs: string[]) => new Set(vs.flatMap(v => [...v.matchAll(/\{\{\s*([\w.-]+)[^}]*\}\}/g)].map(m => m[1])));
const tags = (vs: string[]) => vs.flatMap(v => [...v.matchAll(/<\/?([a-z]+)[^>]*>/g)].map(m => m[0].startsWith("</") ? `/${m[1]}` : m[1])).sort();

const enBundle = en as unknown as Record<string, Tree>;
const zhBundle = zh as unknown as Record<string, Tree>;
const namespaces = Object.keys(enBundle);

describe("catalogs", () => {
  it("register the same namespaces in both languages", () => {
    expect(Object.keys(zhBundle).sort()).toEqual([...namespaces].sort());
  });

  for (const ns of namespaces) {
    describe(ns, () => {
      const enKeys = byBase(enBundle[ns]!);
      const zhKeys = byBase(zhBundle[ns]!);

      it("zh-CN has every English key and no other", () => {
        const missing = [...enKeys.keys()].filter(k => !zhKeys.has(k));
        const extra = [...zhKeys.keys()].filter(k => !enKeys.has(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it("zh-CN uses the same placeholders and markup", () => {
        const bad: string[] = [];
        for (const [k, enValues] of enKeys) {
          const zhValues = zhKeys.get(k);
          if (!zhValues) continue;
          const pe = placeholders(enValues), pz = placeholders(zhValues);
          // `count` may be dropped in a language whose only plural form does not print the number.
          const same = [...pe].every(p => pz.has(p) || p === "count") && [...pz].every(p => pe.has(p));
          if (!same) bad.push(`${ns}:${k} placeholders ${[...pe]} vs ${[...pz]}`);
          const te = tags(enValues.slice(-1)), tz = tags(zhValues.slice(-1));
          if (te.join() !== tz.join()) bad.push(`${ns}:${k} markup ${te} vs ${tz}`);
        }
        expect(bad).toEqual([]);
      });

      it("has no empty messages", () => {
        const empty = [...flatten(enBundle[ns]!), ...flatten(zhBundle[ns]!)].filter(([, v]) => v.trim() === "").map(([k]) => k);
        expect(empty).toEqual([]);
      });
    });
  }
});

describe("glossary (docs/glossary.md) in zh-CN", () => {
  const all = namespaces.flatMap(ns => [...flatten(zhBundle[ns]!)].map(([k, v]) => [`${ns}:${k}`, v] as const));
  /** Superseded wording -> what the cards say. */
  const BANNED: [RegExp, string][] = [
    [/核危机等级/, "DEFCON"],
    [/调整阵营/, "调整 / 调整掷骰"],
    [/冷战(早|中|晚)期/, "战争早期/中期/晚期"],
    [/稳定值/, "稳定度 (owner decision 2026-11-22; card #36 says 稳定度)"],
    [/弃置/, "弃掉"],
    [/背面朝上/, "正面朝下"],
    [/(?<![抽弃此])牌堆/, "抽牌堆"],
    [/胜利点数/, "VP (胜利点数 only as a long label)"],
    // DeepStruggle's card titles where ours (on the card images) differ.
    [/北大西洋公约组织|华沙条约组织|美日共同防卫协定|阿拉伯—以色列战争|战略武器限制谈判|首脑峰会|局部战争/, "our card title"],
    [/我们会埋葬你们|向苏联出售谷物|拉丁美洲敢死队|我们的人在德黑兰|奥德里奇·艾姆斯|石油输出国组织|穆斯林革命/, "our card title"],
    [/花朵力量|U-2击坠|伊朗门丑闻|改革家|开放政策|<em>封锁<\/em>|<em>星球大战<\/em>/, "our card title"],
  ];
  const LONG_VP_LABELS = new Set(["tracks:label.victoryPoints", "ui:track.vpLong"]);

  it("uses the card terminology", () => {
    const bad: string[] = [];
    for (const [key, value] of all) {
      for (const [re, want] of BANNED) {
        if (re.test(value) && !(want.startsWith("VP") && LONG_VP_LABELS.has(key))) bad.push(`${key}: ${value}  (use ${want})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("spaces Latin terms and numbers off Chinese like the cards (DEFCON, VP)", () => {
    const bad = all.filter(([, v]) => /[一-鿿](DEFCON|VP)|(DEFCON|VP)[一-鿿]/.test(v)).map(([k, v]) => `${k}: ${v}`);
    expect(bad).toEqual([]);
  });
});

describe("ui namespace", () => {
  const enUi = flatten(enBundle.ui!);
  const zhUi = flatten(zhBundle.ui!);
  const contract = readFileSync(join(ROOT, "src/game/contract.ts"), "utf8");
  const union = (name: RegExp) => {
    const m = contract.match(name);
    expect(m, `contract.ts ${name}`).not.toBeNull();
    return [...m![1]!.matchAll(/"([^"]+)"/g)].map(x => x[1]!);
  };

  it("has a text for every EndingReason in contract.ts", () => {
    const reasons = union(/export type EndingReason =([^;]+);/);
    expect(reasons.length).toBeGreaterThanOrEqual(10);
    for (const r of reasons) {
      expect(enUi.has(`ending.reason.${r}`), r).toBe(true);
      expect(zhUi.has(`ending.reason.${r}`), r).toBe(true);
    }
  });

  it("has a text for every loading stage in contract.ts", () => {
    const stages = union(/stage:([^;]+);/);
    expect(stages).toContain("model-download");
    for (const s of stages) expect(enUi.has(`loading.${s}`), s).toBe(true);
  });

  it("has every side choice", () => {
    const choices = [...union(/export type Side = ([^;]+);/), "random"];
    for (const c of choices) expect(enUi.has(`menu.side.${c}`), c).toBe(true);
  });

  it("links the official living rules", () => {
    expect(enUi.get("links.rules")).toBe("https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf");
    expect(zhUi.get("links.rules")).toBe(enUi.get("links.rules"));
    for (const [k, v] of enUi) if (k.startsWith("links.")) expect(zhUi.get(k)).toBe(v);
  });

  it("names each language in its own language in both catalogs", () => {
    expect(enUi.get("language.zh-CN")).toBe("简体中文");
    expect(zhUi.get("language.en")).toBe("English");
  });

  it("card labels are the ones printed on our cards (card_text.json labels)", () => {
    const labels = JSON.parse(readFileSync(join(ROOT, "game_resources/card_text.json"), "utf8")).labels as { en: string; zh: string }[];
    const keys = ["card.era.early", "card.era.mid", "card.era.late", "card.optional", "card.removeAfterEvent",
      "card.removeAfterScoring", "card.mayNotBeHeld", "card.bothSidesScore"];
    expect(labels.length).toBe(keys.length);
    keys.forEach((k, i) => {
      expect(enUi.get(k), k).toBe(labels[i]!.en);
      expect(zhUi.get(k), k).toBe(labels[i]!.zh);
    });
  });

  it("region names match src/data", () => {
    for (const area of [...REGIONS, ...SUBREGIONS]) {
      expect(enUi.get(`region.${area.key}`)).toBe(area.name.en);
      expect(zhUi.get(`region.${area.key}`)).toBe(area.name.zh);
    }
  });
});
