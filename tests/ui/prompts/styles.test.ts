/**
 * ui-spec §18.2 for src/ui/prompts: no hex colours, font sizes only from --ts-fs-*, z-index only from
 * --ts-z-*, every var(--ts-…) exists; and every CSS-module class a component uses is defined.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const DIR = "src/ui/prompts";
const files = readdirSync(join(ROOT, DIR));
const css = files.filter(f => f.endsWith(".css"));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = new Set(
  [...(readFileSync(join(ROOT, "src/ui/theme/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/ui/theme/fonts.css"), "utf8")).matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);

describe("prompts stylesheets", () => {
  it("exist", () => { expect(css.length).toBeGreaterThanOrEqual(6); });
  for (const f of css) {
    const text = strip(readFileSync(join(ROOT, DIR, f), "utf8"));
    it(`${f}: no hex colours`, () => { expect(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]); });
    it(`${f}: font sizes only from --ts-fs-*`, () => {
      const bad = [...text.matchAll(/font-size\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !/^var\(--ts-fs-[a-z0-9]+\)$/.test(v) && v !== "inherit");
      const shorthand = [...text.matchAll(/\bfont\s*:\s*([^;}]+)/g)].map(m => m[1]!).filter(v => /\d(px|rem|em)\b/.test(v.split("/")[0]!.replace(/var\([^)]*\)/g, "")));
      expect([...bad, ...shorthand]).toEqual([]);
    });
    it(`${f}: z-index only from --ts-z-*`, () => {
      const bad = [...text.matchAll(/z-index\s*:\s*([^;}]+)/g)].map(m => m[1]!.trim()).filter(v => !/^var\(--ts-z-[a-z-]+\)$/.test(v) && !/^-?[01]$/.test(v));
      expect(bad).toEqual([]);
    });
    it(`${f}: every --ts- token exists`, () => {
      const used = [...text.matchAll(/var\((--ts-[a-z0-9-]+)/g)].map(m => m[1]!);
      expect(used.filter(u => !tokens.has(u))).toEqual([]);
    });
  }
});

describe("CSS-module classes used by the components exist", () => {
  for (const f of files.filter(x => x.endsWith(".tsx"))) {
    const src = readFileSync(join(ROOT, DIR, f), "utf8");
    const imp = src.match(/import s from "\.\/([^"]+\.module\.css)"/);
    if (!imp) continue;
    it(f, () => {
      const sheet = strip(readFileSync(join(ROOT, DIR, imp[1]!), "utf8"));
      const defined = new Set([...sheet.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map(m => m[1]!));
      const used = new Set([...src.matchAll(/\bs\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map(m => m[1]!));
      for (const m of src.matchAll(/s\[`([a-z]+)\$\{/g)) for (const c of defined) if (c.startsWith(m[1]!)) used.delete(c);
      expect([...used].filter(c => !defined.has(c))).toEqual([]);
    });
  }
});
