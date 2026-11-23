/**
 * ui-spec §18.2 for src/ui/stage: no hex colours, no px font sizes outside the --ts-fs-* scale, no z-index
 * outside --ts-z-*, every var(--ts-…) used exists; and the ui_stage catalogs follow docs/glossary.md
 * (the i18n-owned checks skip the ui_* namespaces).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../src/i18n/locales/en/ui_stage.json";
import zh from "../../../src/i18n/locales/zh-CN/ui_stage.json";

const ROOT = resolve(__dirname, "../../..");
const DIRS = ["src/ui/stage", "src/ui/stage/demo"];
const files = DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith(".css")).map(f => join(d, f)));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = new Set(
  [...(readFileSync(join(ROOT, "src/ui/theme/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/ui/theme/fonts.css"), "utf8")).matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);

describe("stage stylesheets", () => {
  it("exist", () => { expect(files.length).toBeGreaterThanOrEqual(9); });

  for (const f of files) {
    const css = strip(readFileSync(join(ROOT, f), "utf8"));
    it(`${f}: no hex colours`, () => { expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]); });
    it(`${f}: font sizes only from --ts-fs-*`, () => {
      const bad = [...css.matchAll(/font-size\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !/^var\(--ts-fs-[a-z0-9]+\)$/.test(v) && v !== "inherit");
      const shorthand = [...css.matchAll(/\bfont\s*:\s*([^;}]+)/g)].map(m => m[1]!).filter(v => /\d(px|rem|em)\b/.test(v.split("/")[0]!.replace(/var\([^)]*\)/g, "")));
      expect([...bad, ...shorthand]).toEqual([]);
    });
    it(`${f}: z-index only from --ts-z-*`, () => {
      const bad = [...css.matchAll(/z-index\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !/^var\(--ts-z-[a-z-]+\)$/.test(v) && !/^-?[01]$/.test(v));
      expect(bad).toEqual([]);
    });
    it(`${f}: every --ts- token exists`, () => {
      const used = [...css.matchAll(/var\((--ts-[a-z0-9-]+)/g)].map(m => m[1]!);
      expect(used.filter(u => !tokens.has(u))).toEqual([]);
    });
  }

  it("reduced motion is handled in every animated stylesheet", () => {
    for (const f of files.filter(x => !x.includes("demo") && !x.endsWith("Stage.module.css"))) {
      const css = strip(readFileSync(join(ROOT, f), "utf8"));
      if (/animation\s*:/.test(css)) expect(css, f).toMatch(/data-reduced/);
    }
  });
});

type Tree = { [k: string]: string | Tree };
const flatten = (t: Tree, p = ""): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flatten(v, `${p}${k}.`)));

describe("ui_stage catalogs", () => {
  const zhAll = flatten(zh as Tree);
  const enAll = flatten(en as Tree);

  it("say “N 行动点” after a number and 对手, never 对方 / 行动点数 after a number / old terms", () => {
    expect(zhAll.filter(([, v]) => /(\d|\}\})\s*行动点数/.test(v) || /对方|稳定值|调整阵营|核危机等级|弃置|背面朝上/.test(v))).toEqual([]);
  });

  it("put one space between Han and Latin letters or numbers", () => {
    const bad = zhAll.filter(([, v]) => /[一-鿿][A-Za-z0-9]|[A-Za-z0-9][一-鿿]/.test(v.replace(/\{\{[^}]+\}\}/g, "")));
    expect(bad).toEqual([]);
  });

  it("use the real minus sign and no typed capitals in English labels", () => {
    expect(enAll.filter(([, v]) => /(^|\s)-\d/.test(v))).toEqual([]);
    expect(enAll.filter(([k, v]) => !k.startsWith("chart.") && /\b[A-Z]{4,}\b/.test(v.replace(/USSR|DEFCON/g, "")))).toEqual([]);
  });
});
