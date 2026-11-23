/**
 * Country names on the region bands, under the map's lamp (QA round 2): the lamp (--ts-map-lamp, a vignette multiplied
 * over the map viewport) darkens the bands near the viewport's edges. "Australia" (bottom right at 1440 × 900) measured
 * 4.45:1 in plain ink on its lamp-darkened Asia band (rgb 193,112,52 for the token's 205,119,55: × 0.94), and W. Europe
 * names at a phone's edge 4.2:1 (rgb 132,121,167 for 143,131,181: × 0.92). The `.name` fill of MapView.module.css is
 * a shade darker than the band-text ink, so every ink name keeps 4.5:1 there, measured as QA does (the name's own
 * colour against the darkened band).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseHex } from "../../src/ui/theme/contrast";

const root = resolve(__dirname, "../..");
const tokensCss = readFileSync(resolve(root, "src/ui/theme/tokens.css"), "utf8");
const mapCss = readFileSync(resolve(root, "src/ui/map/MapView.module.css"), "utf8");

/** Values of `--name: value;` in the first :root block (the defaults). */
function rootTokens(css: string): Map<string, string> {
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("\n}\n", start));
  return new Map([...block.matchAll(/(--ts-[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1]!, m[2]!.trim()]));
}
const T = rootTokens(tokensCss);

/** A token resolved through var() chains to its hex value. */
function val(name: string): string {
  let v = T.get(name);
  for (let i = 0; i < 10 && v; i++) {
    const m = /^var\((--ts-[\w-]+)\)$/.exec(v);
    if (!m) break;
    v = T.get(m[1]!);
  }
  if (!v) throw new Error(`missing token ${name}`);
  return v;
}

/** The fill of a rule of MapView.module.css, resolved to hex (a token, or a color-mix of two tokens in sRGB). */
function fillOf(selector: string): string {
  const rule = new RegExp(`\\n\\${selector} \\{([^}]*)\\}`).exec(mapCss)?.[1];
  const fill = rule && /(?:^|[;\s])fill:\s*([^;]+);/.exec(rule)?.[1]?.trim();
  if (!fill) throw new Error(`no fill in ${selector}`);
  const mix = /^color-mix\(in srgb, var\((--ts-[\w-]+)\) (\d+)%, var\((--ts-[\w-]+)\)\)$/.exec(fill);
  if (mix) return over(val(mix[1]!), Number(mix[2]) / 100, val(mix[3]!));
  const token = /^var\((--ts-[\w-]+)\)$/.exec(fill);
  if (token) return val(token[1]!);
  throw new Error(`unexpected fill ${fill}`);
}

/** The lamp's multiply: every channel × f. */
function dim(hex: string, f: number): string {
  return "#" + parseHex(hex).map(c => Math.round(c * f).toString(16).padStart(2, "0")).join("");
}

const INK_BANDS = ["euw", "me", "asia", "sea", "af", "ca", "sa"];

describe("country names under the map lamp (QA round 2, Australia)", () => {
  const name = fillOf(".name");

  it("the name ink is a shade of the band-text ink, never lighter, no visible change", () => {
    const ink = parseHex(val("--ts-band-text"));
    const mine = parseHex(name);
    for (let i = 0; i < 3; i++) {
      expect(mine[i]!).toBeLessThanOrEqual(ink[i]!);
      expect(ink[i]! - mine[i]!).toBeLessThanOrEqual(16);
    }
  });

  it("reproduces the finding: plain ink on the Asia band at Australia's lamp measures below 4.5:1", () => {
    expect(contrastRatio(val("--ts-band-text"), dim(val("--ts-reg-asia"), 0.94))).toBeLessThan(4.5);
  });

  for (const band of INK_BANDS) {
    it(`ink names on the ${band} band keep ≥ 4.5:1 through the lamp at a phone's edge (× 0.92)`, () => {
      expect(contrastRatio(name, val(`--ts-reg-${band}`))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(name, dim(val(`--ts-reg-${band}`), 0.92))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("paper names (E. Europe, battlegrounds) keep their own fill and only gain from the lamp", () => {
    expect(fillOf(".nameEUE")).toBe(val("--ts-band-text-eue"));
    expect(fillOf(".nameBG")).toBe(val("--ts-band-text-bg"));
    expect(contrastRatio(val("--ts-paper-50"), dim(val("--ts-reg-eue"), 0.92))).toBeGreaterThan(contrastRatio(val("--ts-paper-50"), val("--ts-reg-eue")));
  });
});
