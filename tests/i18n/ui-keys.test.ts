/**
 * The War Table UI keys (docs/design/ui-spec.md §14.1, §11.2, §12): each exists in English and
 * Chinese, the map finds its strings in the catalog (src/ui/map/strings.ts), the generated catalog
 * matches tools/ui-keys.mjs, the data carries the map's short names (§4.3), and the Chinese follows
 * the glossary's number rules.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../src/i18n/locales/en";
import zh from "../../src/i18n/locales/zh-CN";
import { COUNTRIES } from "../../src/data";
import { DEFAULT_SETTINGS } from "../../src/ui/ui-contract";
// @ts-expect-error -- plain ESM tool without types
import { UI_KEYS, catalogs, merge, retire, RETIRED_KEYS, SHORTCUT_ROWS } from "../../tools/ui-keys.mjs";

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

const enUi = flatten((en as unknown as Record<string, Tree>).ui!);
const zhUi = flatten((zh as unknown as Record<string, Tree>).ui!);
/** A key exists when it, or a plural form of it, is in the catalog. */
const has = (cat: Map<string, string>, key: string) =>
  cat.has(key) || cat.has(`${key}_one`) || cat.has(`${key}_other`);
const value = (cat: Map<string, string>, key: string) => cat.get(key) ?? cat.get(`${key}_other`);
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)/g)].map(m => m[1]).sort();

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}.${from + i}`);

/** ui-spec §14.1, expanded ("`a.b` / `.c`" = `a.c`; "`.values.0` … `.6`" = each). */
const SPEC_14_1 = [
  "slip.orders", "slip.ordersHeadline", "slip.stamp.you", "slip.stamp.ai",
  "slip.verb.influence", "slip.verb.coup-target", "slip.verb.realign-target",
  "slip.counter.ops", "slip.counter.left", "slip.counter.rolls",
  "slip.hint.influence", "slip.hint.headline", "slip.hint.coupFinal", "slip.hint.asiaBonus",
  "slip.confirm.coup", "slip.confirm.realign", "slip.confirm.headline", "slip.confirm.play", "slip.confirm.score",
  // §14.1's `slip.ai.stillThinking` is retired (R-005): the slip uses ui_prompts:ai.stillThinking / .stillThinkingSlow / .slowHint.
  "slip.ai.waiting", "slip.ai.plays", "slip.ai.preparing",
  "slip.skip", "slip.skipAll", "slip.continue", "slip.list",
  ...["headline", "discard", "give", "play", "committed", "revealed", "cancelled", "pass"].map(k => `stamp.${k}`),
  ...["howTitle", "event", "eventFirst", "operations", "space", "un", "back", "undoFree"].map(k => `mode.${k}`),
  ...range("track.defconRule", 1, 5), "track.milopsNeed", "track.short",
  "plate.ifScored", "plate.even", "plate.wins", ...range("plate.values", 0, 6),
  "plate.pres", "plate.dom", "plate.ctrl", "plate.none",
  "map.countryLabel", "map.cost2", "map.toUSA", "map.toJapan", "map.toControl", "map.zoomIn", "map.zoomOut", "map.world",
  "tip.stabilityRegion", "tip.you", "tip.costs2", "tip.success", "tip.battleground", "tip.battlegroundDefcon",
  "tip.keys.place", "tip.keys.coup",
  ...["title", "sub", "waiting", "thinking", "playing", "hand", "known", "china"].map(k => `adversary.${k}`),
  "effects.title", ...["PERMANENT", "TURN", "CONDITIONAL", "SPACE_PERK"].map(k => `effects.duration.${k}`),
  "log.title", "log.filter.all", "log.filter.plays", "log.filter.dice", "log.jump", "log.turnSep",
  "banner.turn", "banner.era.mid", "banner.era.late", "banner.headlinePhase",
  "toast.reshuffle", "toast.defcon2", "toast.china",
  ...["kickerYou", "kickerAi", "status", "countries", "battlegrounds", "adjacent", "base", "total", "net", "europeControl"]
    .map(k => `scoring.${k}`),
  "headline.papers.us", "headline.papers.ussr", "headline.order", "headline.dateline",
  ...["flash", "youWin", "youLose", "draw", "vpBefore", "chart", "review", "fullLog"].map(k => `over.${k}`),
  "start.classified", "start.kicker", "start.tagline", "start.pick.US", "start.pick.USSR", "start.pick.random",
  "start.take", "start.resume", "start.replaces", "start.rules", "start.fine",
  "start.chips.standard", "start.chips.bid", "start.chips.tournament", "start.chips.ai",
  "settings.language", "settings.cardImages", "settings.motion.label", "settings.confirmFinal", "settings.pauseOnReveals",
  "settings.mapLabels", "settings.patterns", "settings.followAction", "settings.sound",
  // Existing keys the spec says to reuse.
  "game.undo", "game.undoTitle", "game.resignConfirm.title", "game.newGameConfirm.title",
];

describe("ui-spec §14.1 keys", () => {
  it("exist in English and Chinese", () => {
    const missing = SPEC_14_1.flatMap(k => [
      ...(has(enUi, k) ? [] : [`en ${k}`]),
      ...(has(zhUi, k) ? [] : [`zh-CN ${k}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it("use the placeholders the spec gives", () => {
    const want: Record<string, string[]> = {
      "slip.orders": ["ar", "turn"], "slip.stamp.ai": ["side"], "slip.hint.influence": ["cost"],
      "slip.hint.coupFinal": ["country"], "slip.confirm.realign": ["country"], "slip.confirm.play": ["card"],
      "slip.confirm.score": ["region"], "slip.ai.plays": ["card", "side"], "slip.ai.preparing": ["percent"],
      "track.milopsNeed": ["n"], "track.short": ["n", "side"], "plate.wins": ["side"],
      "map.countryLabel": ["bg", "name", "region", "stab", "target", "us", "usCtrl", "ussr", "ussrCtrl"],
      "tip.costs2": ["side"], "tip.success": ["k"], "tip.battlegroundDefcon": ["from", "to"],
      "adversary.hand": ["count"], "adversary.known": ["count"], "adversary.china": ["where"],
      "log.turnSep": ["era", "turn"], "banner.turn": ["era", "turn"], "toast.china": ["side"],
      "scoring.kickerAi": ["card", "side"], "scoring.net": ["n", "side"],
      "headline.order": ["a", "b", "side"], "headline.dateline": ["ops", "side", "turn"],
    };
    for (const [k, ps] of Object.entries(want)) {
      expect(placeholders(value(enUi, k)!), `en ${k}`).toEqual(ps);
      expect(placeholders(value(zhUi, k)!), `zh ${k}`).toEqual(ps);
    }
  });

  it("keep console captions and button labels within the length budgets (§14)", () => {
    for (const k of range("track.defconRuleShort", 1, 5)) expect(enUi.get(k)!.length, k).toBeLessThanOrEqual(40);
    for (const k of ["slip.confirm.coup", "slip.confirm.headline", "slip.skip", "slip.skipAll", "slip.continue", "start.take",
      "start.resume", "start.startNew", "over.review", "over.fullLog", "game.undo"]) {
      expect(enUi.get(k)!.length, k).toBeLessThanOrEqual(22);
    }
  });

  it("pluralise the card count in English", () => {
    expect(enUi.get("adversary.hand_one")).toContain("{{count}} card ");
    expect(enUi.get("adversary.hand_other")).toContain("{{count}} cards ");
  });

  it("name every settings value of UiSettings", () => {
    const s = DEFAULT_SETTINGS;
    expect(Object.keys(s)).toEqual(expect.arrayContaining(["motion", "cardImages", "speed"]));
    for (const m of ["system", "reduce", "full"]) expect(has(enUi, `settings.motion.${m}`), m).toBe(true);
    for (const c of ["follow", "en", "zh"]) expect(has(enUi, `settings.cardImagesOption.${c}`), c).toBe(true);
    for (const sp of ["slow", "normal", "fast", "instant"]) expect(has(enUi, `settings.speed.${sp}`), sp).toBe(true);
  });

  it("give every shortcut row (ui-spec §12) a description and its keys", () => {
    expect(SHORTCUT_ROWS.length).toBeGreaterThanOrEqual(15);
    for (const r of SHORTCUT_ROWS as string[]) {
      for (const cat of [enUi, zhUi]) {
        expect(cat.get(`shortcuts.row.${r}`), r).toBeTruthy();
        expect(cat.get(`shortcuts.key.${r}`), r).toBeTruthy();
      }
    }
  });

  it("are written in sentence case with a real minus and the typographic ellipsis", () => {
    const leaves = [...flatten(catalogs().en as Tree)];
    const caps = leaves.filter(([k, v]) => /\b[A-Z]{4,}\b/.test(v.replace(/DEFCON|USSR|CCCP|ПРАВДА/g, "")) && !k.startsWith("shortcuts.key"));
    expect(caps).toEqual([]);
    const all = [...leaves, ...flatten(catalogs().zh as Tree)];
    expect(all.filter(([, v]) => /\.\.\./.test(v))).toEqual([]);
    expect(all.filter(([, v]) => /(^|\s)-\d/.test(v))).toEqual([]);
    // Chinese uses …… (two ellipsis characters), never a single one.
    expect([...flatten(catalogs().zh as Tree)].filter(([, v]) => /(?<!…)…(?!…)/.test(v))).toEqual([]);
  });
});

describe("tools/ui-keys.mjs", () => {
  it("is merged into both ui.json catalogs (run node tools/ui-keys.mjs)", () => {
    const cats = catalogs();
    for (const [lang, file] of [["en", "src/i18n/locales/en/ui.json"], ["zh", "src/i18n/locales/zh-CN/ui.json"]] as const) {
      const raw = readFileSync(join(ROOT, file), "utf8");
      expect(JSON.stringify(retire(merge(JSON.parse(raw), cats[lang])), null, 2) + "\n", file).toBe(raw);
    }
  });

  it("removes the retired keys from both catalogs, and no source names them (R-005)", () => {
    expect(RETIRED_KEYS).toContain("slip.ai.stillThinking");
    for (const k of RETIRED_KEYS as string[]) {
      expect(has(enUi, k), `en ${k}`).toBe(false);
      expect(has(zhUi, k), `zh-CN ${k}`).toBe(false);
    }
    const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
    for (const rel of ["src/ui/prompts/OrdersSlip.tsx", "src/ui/prompts/aiWait.ts"]) {
      for (const k of RETIRED_KEYS as string[]) expect(src(rel), rel).not.toContain(`ui:${k}`);
    }
    // The AI wait strings that replaced it (F3's ui_prompts catalog).
    for (const cat of [en, zh] as unknown as Record<string, Record<string, Record<string, string>>>[]) {
      for (const k of ["stillThinking", "stillThinkingSlow", "slowHint"]) expect(cat.ui_prompts!.ai![k], k).toBeTruthy();
    }
    expect(retire({ a: { b: { c: "x" } }, d: "y" }, ["a.b.c", "q.r"])).toEqual({ d: "y" });
  });

  it("lists each leaf in both languages (except plural forms Chinese does not have)", () => {
    const bad: string[] = [];
    const walk = (node: Record<string, unknown>, path: string) => {
      for (const [k, v] of Object.entries(node)) {
        if (Array.isArray(v)) {
          if (typeof v[0] !== "string") bad.push(`${path}${k}: en`);
          if (typeof v[1] !== "string" && !/_(one|two|few|many)$/.test(k)) bad.push(`${path}${k}: zh`);
        } else walk(v as Record<string, unknown>, `${path}${k}.`);
      }
    };
    walk(UI_KEYS, "");
    expect(bad).toEqual([]);
  });
});

describe("map strings (src/ui/map/strings.ts) come from the catalog", () => {
  const src = readFileSync(join(ROOT, "src/ui/map/strings.ts"), "utf8");
  const block = (name: string) => src.slice(src.indexOf(`const ${name}`), src.indexOf("};", src.indexOf(`const ${name}`)));
  const entries = (b: string) => new Map([...b.matchAll(/^\s+"([\w.-]+)":\s*"((?:[^"\\]|\\.)*)"/gm)].map(m => [m[1]!, m[2]!]));
  const local = { en: entries(block("EN")), zh: entries(block("ZH")) };

  it("finds the map's keys", () => {
    expect(local.en.size).toBeGreaterThan(40);
    expect([...local.zh.keys()].sort()).toEqual([...local.en.keys()].sort());
  });

  it("resolves through mapText from the catalog (pseudo-language marks it)", async () => {
    const { setLanguage } = await import("../../src/i18n");
    const { mapText } = await import("../../src/ui/map/strings");
    try {
      await setLanguage("zh-CN");
      expect(mapText("zh", "tip.stabilityRegion", { region: "中东" })).toBe(zhUi.get("tip.stabilityRegion")!.replace("{{region}}", "中东"));
      expect(mapText("zh", "plate.values.6")).toBe(zhUi.get("plate.values.6"));
      await setLanguage("en-XA");
      expect(mapText("en", "map.zoomIn")).toMatch(/^⟦.*⟧$/);
    } finally {
      await setLanguage("en");
    }
  });

  it("has every key the map looks up, with the same placeholders", () => {
    const bad: string[] = [];
    for (const [lang, cat] of [["en", enUi], ["zh", zhUi]] as const) {
      for (const [k, v] of local[lang]) {
        const c = cat.get(k);
        if (c === undefined) bad.push(`${lang} ui:${k} missing`);
        else if (placeholders(c).join() !== placeholders(v).join()) bad.push(`${lang} ui:${k} placeholders`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("map short names (ui-spec §4.3) are data", () => {
  const SPEC: Record<"en" | "zh", Record<number, string>> = {
    en: { 9: "Spain/Port.", 35: "Laos/Camb.", 49: "W. Afr. St.", 50: "Saharan St.", 61: "SE Afr. St.", 63: "S. Africa",
      7: "W. Germany", 14: "E. Germany", 43: "N. Korea", 44: "S. Korea" },
    zh: { 9: "西葡", 16: "捷克", 35: "老挝柬埔寨", 50: "撒哈拉", 61: "东南非" },
  };
  it("in COUNTRIES[id].short", () => {
    for (const lang of ["en", "zh"] as const) {
      for (const [id, s] of Object.entries(SPEC[lang])) expect(COUNTRIES[Number(id)]!.short[lang], `${lang} ${id}`).toBe(s);
    }
  });
  it("never longer than the full name", () => {
    for (const c of COUNTRIES) for (const lang of ["en", "zh"] as const) {
      expect(c.short[lang].length, `${lang} ${c.id}`).toBeLessThanOrEqual(c.name[lang].length);
    }
  });
});

describe("Chinese number words (docs/glossary.md)", () => {
  // The i18n-owned catalogs. The per-workstream `ui_*` namespaces and `prompt` follow the same
  // glossary but are checked by their owners (they change while the UI is being built).
  const all = Object.entries(zh as unknown as Record<string, Tree>)
    .filter(([ns]) => !ns.startsWith("ui_") && ns !== "prompt")
    .flatMap(([ns, tree]) => [...flatten(tree)].map(([k, v]) => [`${ns}:${k}`, v] as const));
  it("say “N 行动点” after a number, as the cards do (行动点数 without one)", () => {
    expect(all.filter(([, v]) => /(\d|\}\})\s*行动点数/.test(v)).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
  it("say 对手 for the opponent and write numbers as digits", () => {
    expect(all.filter(([, v]) => /对方|第[一二三四五六七八九十]+(行动轮|回合)/.test(v)).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
});
