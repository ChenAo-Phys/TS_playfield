/**
 * ui-spec §18.2 for src/ui/tray: no hex colours, no px font sizes outside the --ts-fs-* scale, no
 * z-index outside --ts-z-* (local 0 / ±1 allowed), every var(--ts-…) used exists in tokens.css / fonts.css,
 * and reduced motion is handled wherever something transitions or animates.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const DIR = "src/ui/tray";
const files = readdirSync(join(ROOT, DIR)).filter(f => f.endsWith(".css")).map(f => join(DIR, f));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = new Set(
  [...(readFileSync(join(ROOT, "src/ui/theme/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/ui/theme/fonts.css"), "utf8")).matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);

describe("tray stylesheets", () => {
  it("exist", () => { expect(files.length).toBeGreaterThanOrEqual(6); });

  for (const f of files) {
    const css = strip(readFileSync(join(ROOT, f), "utf8"));
    it(`${f}: no hex colours`, () => { expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]); });
    it(`${f}: no rgb()/hsl() literals`, () => { expect(css.match(/\b(rgba?|hsla?)\(/g) ?? []).toEqual([]); });
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
    it(`${f}: transitions and animations have a reduced-motion rule`, () => {
      if (!/\b(transition|animation)\s*:/.test(css)) return;
      expect(css).toMatch(/data-motion="reduce"/);
      expect(css).toMatch(/prefers-reduced-motion: reduce/);
    });
  }
});
