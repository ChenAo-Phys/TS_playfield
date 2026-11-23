/**
 * ui-spec §18.2 for the shell's stylesheets (src/ui/screens, src/ui/compact): no hex colours, font sizes
 * only from the --ts-fs-* scale (a calc() of a scale token is fine, no px literal), z-index only from
 * --ts-z-*, every var(--ts-…) used exists, every CSS-module class a component uses exists; and the
 * ui_shell catalogs follow docs/glossary.md.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../src/i18n/locales/en/ui_shell.json";
import zh from "../../../src/i18n/locales/zh-CN/ui_shell.json";

const ROOT = resolve(__dirname, "../../..");
const DIRS = ["src/ui/screens", "src/ui/compact"];
const css = DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith(".css")).map(f => join(d, f)));
const tsx = DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith(".tsx")).map(f => join(d, f)));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = new Set(
  [...(readFileSync(join(ROOT, "src/ui/theme/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/ui/theme/fonts.css"), "utf8")).matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);
/** Custom properties the shell defines itself (layout overrides, per-element variables). */
const LOCAL = new Set(["--i"]);

describe("shell stylesheets", () => {
  it("exist", () => { expect(css.length).toBeGreaterThanOrEqual(5); });

  for (const f of css) {
    const src = strip(readFileSync(join(ROOT, f), "utf8"));
    it(`${f}: no hex colours`, () => { expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]); });
    it(`${f}: font sizes only from --ts-fs-*`, () => {
      const sizes = [...src.matchAll(/font-size\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim());
      const bad = sizes.filter(v => v !== "inherit" && (!/var\(--ts-fs-[a-z0-9]+\)/.test(v) || /\d(px|rem|em)\b/.test(v.replace(/var\([^)]*\)/g, ""))));
      const shorthand = [...src.matchAll(/\bfont\s*:\s*([^;}]+)/g)].map(m => m[1]!).filter(v => /\d(px|rem|em)\b/.test(v.split("/")[0]!.replace(/var\([^)]*\)/g, "")));
      expect([...bad, ...shorthand]).toEqual([]);
    });
    it(`${f}: z-index only from --ts-z-*`, () => {
      const bad = [...src.matchAll(/z-index\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !/^var\(--ts-z-[a-z-]+\)$/.test(v) && !/^-?[01]$/.test(v));
      expect(bad).toEqual([]);
    });
    it(`${f}: every --ts- token exists`, () => {
      const used = [...src.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]!);
      expect(used.filter(u => !tokens.has(u) && !LOCAL.has(u))).toEqual([]);
    });
  }

  it("every CSS-module class a component uses exists", () => {
    const missing: string[] = [];
    for (const f of tsx) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const imp = src.match(/import (\w+) from "\.\/([\w.]+\.module\.css)"/);
      if (!imp) continue;
      const [, name, file] = imp;
      const classes = new Set([...strip(readFileSync(join(ROOT, f.replace(/[^/]+$/, file!)), "utf8")).matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]));
      for (const m of src.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, "g"))) if (!classes.has(m[1]!)) missing.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(new RegExp(`\\b${name}\\[\`(\\w+)_`, "g"))) if (![...classes].some(c => c.startsWith(`${m[1]}_`))) missing.push(`${f}: ${m[1]}_*`);
    }
    expect(missing).toEqual([]);
  });

  it("reduced motion: every animation has a reduced variant", () => {
    for (const f of css) {
      const src = strip(readFileSync(join(ROOT, f), "utf8"));
      if (/animation\s*:/.test(src)) expect(src, f).toMatch(/reduce/);
    }
  });
});

type Tree = { [k: string]: string | Tree };
const flatten = (t: Tree, p = ""): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flatten(v, `${p}${k}.`)));

describe("ui_shell catalogs", () => {
  const zhAll = flatten(zh as Tree);
  const enAll = flatten(en as Tree);

  it("have the same keys and placeholders (plural forms folded: Chinese has only _other)", () => {
    const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, "");
    const keys = (all: [string, string][]) => [...new Set(all.map(([k]) => base(k)))].sort();
    expect(keys(zhAll)).toEqual(keys(enAll));
    expect(zhAll.filter(([k]) => /_(one|two|few|many|zero)$/.test(k))).toEqual([]);
    const ph = (v: string) => [...v.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
    const zhMap = new Map(zhAll.map(([k, v]) => [base(k), v]));
    for (const [k, v] of enAll) expect(ph(zhMap.get(base(k))!), k).toEqual(ph(v));
  });

  it("follow the glossary (no superseded terms, “N 行动点” after a number, 对手)", () => {
    expect(zhAll.filter(([, v]) => /(\d|\}\})\s*行动点数/.test(v) || /对方|稳定值|调整阵营|核危机等级|弃置|背面朝上/.test(v))).toEqual([]);
  });

  it("put one space between Han and Latin letters or numbers", () => {
    const bad = zhAll.filter(([, v]) => /[一-鿿][A-Za-z0-9]|[A-Za-z0-9][一-鿿]/.test(v.replace(/\{\{[^}]+\}\}/g, " ")));
    expect(bad).toEqual([]);
  });

  it("English labels are sentence case with the real minus sign", () => {
    expect(enAll.filter(([, v]) => /(^|\s)-\d/.test(v))).toEqual([]);
    expect(enAll.filter(([, v]) => /\b[A-Z]{4,}\b/.test(v.replace(/USSR|DEFCON|SIL|OFL/g, "")))).toEqual([]);
  });
});
