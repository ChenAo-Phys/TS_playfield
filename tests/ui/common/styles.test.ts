/**
 * ui-spec §18.2 for src/ui/common and src/ui/cards: no hex colours, no px font sizes outside the
 * --ts-fs-* scale, no z-index outside --ts-z-*, and every var(--ts-…) used exists in tokens.css / fonts.css.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const DIRS = ["src/ui/common", "src/ui/cards"];
const files = DIRS.flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith(".css")).map(f => join(d, f)));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = new Set(
  [...(readFileSync(join(ROOT, "src/ui/theme/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/ui/theme/fonts.css"), "utf8")).matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);

describe("common + cards stylesheets", () => {
  it("exist", () => { expect(files.length).toBeGreaterThanOrEqual(6); });

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
});
