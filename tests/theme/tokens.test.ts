/**
 * The design tokens (src/ui/theme): CSS and TypeScript mirrors agree, the measured contrast claims
 * of docs/design/ui-spec.md §2 hold, fonts referenced by fonts.css exist, and the layout / speed
 * helpers behave as the spec says.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DUR, EASE, Z, TIMING, frameSpeed, dur, SPEED_FACTOR } from "../../src/ui/theme/motion";
import { layoutFor, fitScale, trayHeight, mapDetail, DESKTOP } from "../../src/ui/theme/layout";
import { contrastRatio, over, parseHex } from "../../src/ui/theme/contrast";

const root = resolve(__dirname, "../..");
const tokensCss = readFileSync(resolve(root, "src/ui/theme/tokens.css"), "utf8");
const fontsCss = readFileSync(resolve(root, "src/ui/theme/fonts.css"), "utf8");

/** Values of `--name: value;` in the first :root block (the defaults). */
function rootTokens(css: string): Map<string, string> {
  const start = css.indexOf(":root {");
  const end = css.indexOf("\n}\n", start);
  const block = css.slice(start, end);
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--ts-[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}
const T = rootTokens(tokensCss);

/** Resolve var(--x) chains to a literal. */
function val(name: string): string {
  let v = T.get(name);
  for (let i = 0; i < 10 && v; i++) {
    const m = /^var\((--ts-[\w-]+)\)$/.exec(v);
    if (!m) return v;
    v = T.get(m[1]!);
  }
  if (!v) throw new Error(`missing token ${name}`);
  return v;
}
const ms = (s: string) => Number(/^(\d+)ms$/.exec(s)?.[1]);

describe("tokens.css ↔ motion.ts", () => {
  it("durations match", () => {
    expect(ms(val("--ts-dur-xs"))).toBe(DUR.xs);
    expect(ms(val("--ts-dur-s"))).toBe(DUR.s);
    expect(ms(val("--ts-dur-m"))).toBe(DUR.m);
    expect(ms(val("--ts-dur-l"))).toBe(DUR.l);
    expect(ms(val("--ts-dur-xl"))).toBe(DUR.xl);
    expect(ms(val("--ts-hold-read"))).toBe(DUR.holdRead);
    expect(ms(val("--ts-hold-long"))).toBe(DUR.holdLong);
  });
  it("easings match", () => {
    const norm = (s: string) => s.replace(/\s+/g, "");
    expect(norm(val("--ts-ease-out"))).toBe(norm(EASE.out));
    expect(norm(val("--ts-ease-in"))).toBe(norm(EASE.in));
    expect(norm(val("--ts-ease-in-out"))).toBe(norm(EASE.inOut));
    expect(norm(val("--ts-ease-thunk"))).toBe(norm(EASE.thunk));
    expect(norm(val("--ts-ease-back"))).toBe(norm(EASE.back));
  });
  it("z-index layers match and are strictly ordered", () => {
    const names: Record<keyof typeof Z, string> = {
      map: "--ts-z-map", mapHud: "--ts-z-map-hud", tray: "--ts-z-tray", rail: "--ts-z-rail", console: "--ts-z-console",
      stage: "--ts-z-stage", flight: "--ts-z-flight", sheet: "--ts-z-sheet", modal: "--ts-z-modal",
      popover: "--ts-z-popover", toast: "--ts-z-toast", gameover: "--ts-z-gameover", danger: "--ts-z-danger",
    };
    for (const [k, css] of Object.entries(names)) expect(Number(val(css))).toBe(Z[k as keyof typeof Z]);
    const order = Object.values(Z);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  });
  it("layout sizes match", () => {
    expect(val("--ts-console-h")).toBe(`${DESKTOP.consoleH}px`);
    expect(val("--ts-rail-w")).toBe(`${DESKTOP.railW}px`);
    expect(val("--ts-slip-w")).toBe(`${DESKTOP.slipW}px`);
  });
  it("every timing is a non-negative number", () => {
    for (const row of Object.values(TIMING)) for (const v of Object.values(row)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("contrast (WCAG 2.x) of the token pairs the spec relies on", () => {
  const AA = 4.5;
  const NON_TEXT = 3;
  const cases: [string, string, string, number][] = [
    ["text-1 on room-800", "--ts-steel-100", "--ts-room-800", 7],
    ["text-2 on room-800", "--ts-steel-300", "--ts-room-800", AA],
    ["text-3 (labels) on room-800", "--ts-steel-400", "--ts-room-800", AA],
    ["text-3 on room-900", "--ts-steel-400", "--ts-room-900", AA],
    ["US on room", "--ts-us-300", "--ts-room-800", AA],
    ["USSR on room", "--ts-ussr-300", "--ts-room-800", AA],
    ["brass text on room", "--ts-brass-300", "--ts-room-800", AA],
    ["ink on paper", "--ts-ink-900", "--ts-paper-50", 12],
    ["ink-700 on paper", "--ts-ink-700", "--ts-paper-50", 7],
    ["ink-500 on paper", "--ts-ink-500", "--ts-paper-50", AA],
    ["ink-500 on tape", "--ts-ink-500", "--ts-paper-100", AA],
    ["US numeral on paper", "--ts-us-600", "--ts-paper-50", 7],
    ["USSR numeral on paper", "--ts-ussr-600", "--ts-paper-50", AA],
    ["white on US", "#ffffff", "--ts-us-600", AA],
    ["gold on USSR", "--ts-ussr-gold", "--ts-ussr-600", AA],
    ["alert text on paper", "--ts-alert-700", "--ts-paper-50", AA],
    ["alert text on warning panel", "--ts-alert-700", "--ts-alert-100", AA],
    ["alert on hazard black", "--ts-alert-500", "#1b1b1b", AA],
    ["band text on W. Europe", "--ts-ink-900", "--ts-reg-euw", AA],
    ["band text on E. Europe", "--ts-paper-50", "--ts-reg-eue", AA],
    ["band text on Middle East", "--ts-ink-900", "--ts-reg-me", AA],
    ["band text on Asia", "--ts-ink-900", "--ts-reg-asia", AA],
    ["band text on SE Asia", "--ts-ink-900", "--ts-reg-sea", AA],
    ["band text on Africa", "--ts-ink-900", "--ts-reg-af", AA],
    ["band text on C. America", "--ts-ink-900", "--ts-reg-ca", AA],
    ["band text on S. America", "--ts-ink-900", "--ts-reg-sa", AA],
    ["name on battleground band", "--ts-paper-50", "--ts-bg-band", AA],
    ["numeral on battleground stability", "--ts-paper-50", "--ts-bg-stab", AA],
    ["brass on room (non-text)", "--ts-brass-400", "--ts-room-900", NON_TEXT],
    ["ink on brass button", "--ts-ink-900", "--ts-brass-500", AA],
    ["phosphor on room", "--ts-phosphor", "--ts-room-900", AA],
  ];
  const hex = (s: string) => (s.startsWith("#") ? s : val(s));
  for (const [label, fg, bg, min] of cases) {
    it(`${label} ≥ ${min}:1`, () => {
      expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(min);
    });
  }
  it("two-tone target ring: the ink edge stands out on sea and on every land tint (≥ 3:1)", () => {
    const edge = over("#221e18", 0.85, val("--ts-sea-500"));
    expect(contrastRatio(edge, val("--ts-sea-500"))).toBeGreaterThanOrEqual(NON_TEXT);
    for (const land of ["euw", "eue", "me", "asia", "sea", "af", "ca", "sa"]) {
      const bg = val(`--ts-land-${land}`);
      expect(contrastRatio(over("#221e18", 0.85, bg), bg)).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });
  it("controlled markers differ in greyscale by numeral colour too (white vs gold), not only by shape", () => {
    // The fills are close in luminance (≈1.3:1): shape, glyph and position carry the side (ui-spec §12).
    expect(contrastRatio("#ffffff", val("--ts-ussr-gold"))).toBeGreaterThan(1.5);
  });
  it("parseHex rejects non-hex", () => {
    expect(() => parseHex("rgb(1,2,3)")).toThrow();
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
  });
});

describe("fonts.css", () => {
  it("references only files that exist in public/fonts, all small", () => {
    const urls = [...fontsCss.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map(m => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    let total = 0;
    for (const f of new Set(urls)) {
      const p = resolve(root, "public/fonts", f);
      expect(existsSync(p), f).toBe(true);
      total += statSync(p).size;
    }
    expect(total).toBeLessThan(130 * 1024);
    expect(existsSync(resolve(root, "public/fonts/OFL.txt"))).toBe(true);
  });
  it("Chinese stacks end in system CJK fonts and never download a CJK web font", () => {
    expect(fontsCss).toMatch(/--ts-font-cjk:[^;]*"PingFang SC"[^;]*"Microsoft YaHei"[^;]*"Noto Sans CJK SC"/);
    expect(fontsCss).not.toMatch(/url\([^)]*(cjk|sc|han|hei|song)[^)]*\.woff2/i);
  });
  it("every font-face has font-display: swap and a Latin unicode-range", () => {
    const faces = fontsCss.split("@font-face").slice(1);
    for (const f of faces) {
      expect(f).toMatch(/font-display:\s*swap/);
      expect(f).toMatch(/unicode-range:\s*U\+0/);
    }
  });
});

describe("layout helpers", () => {
  it("picks the arrangement per viewport", () => {
    expect(layoutFor(1440, 900)).toBe("desktop");
    expect(layoutFor(1920, 1080)).toBe("desktop");
    expect(layoutFor(1366, 768)).toBe("desktop");
    expect(layoutFor(1280, 600)).toBe("tablet");
    expect(layoutFor(1024, 768)).toBe("tablet");
    expect(layoutFor(820, 1180)).toBe("compact");
    expect(layoutFor(390, 844)).toBe("compact");
    expect(layoutFor(844, 390)).toBe("compact-landscape");
  });
  it("tray height is clamped", () => {
    expect(trayHeight(900, "desktop")).toBe(167);
    expect(trayHeight(600, "desktop")).toBe(152);
    expect(trayHeight(1440, "desktop")).toBe(184);
  });
  it("fit scale at 1440×900 shows boxes of about 56×36 px", () => {
    const s = fitScale({ tableW: 1440 - 288, tableH: 900 - 58, trayH: trayHeight(900, "desktop"), pad: 10, overlap: 64, mapW: 1775, mapH: 1090 });
    expect(s).toBeGreaterThan(0.62);
    expect(s).toBeLessThan(0.66);
    expect(mapDetail(s)).toBe("standard");
    expect(mapDetail(1.05)).toBe("detail");
    expect(mapDetail(0.22)).toBe("overview");
  });
});

describe("frame speed", () => {
  it("instant and skipping zero everything", () => {
    expect(frameSpeed({ speed: "instant", auto: false, byHuman: false, queued: 0 })).toEqual({ motion: 0, hold: 0 });
    expect(frameSpeed({ speed: "normal", auto: false, byHuman: false, queued: 0, skipping: true })).toEqual({ motion: 0, hold: 0 });
  });
  it("auto frames drop holds; the human's own moves keep them", () => {
    expect(frameSpeed({ speed: "normal", auto: true, byHuman: false, queued: 0 })).toEqual({ motion: 0.6, hold: 0 });
    expect(frameSpeed({ speed: "normal", auto: false, byHuman: true, queued: 0 })).toEqual({ motion: 0.6, hold: 1 });
  });
  it("long queues catch up", () => {
    expect(frameSpeed({ speed: "normal", auto: false, byHuman: false, queued: 3 }).motion).toBeCloseTo(0.6);
    expect(frameSpeed({ speed: "normal", auto: false, byHuman: false, queued: 7 })).toEqual({ motion: 0.3, hold: 0 });
  });
  it("slow is slower, fast is faster", () => {
    expect(SPEED_FACTOR.slow).toBeGreaterThan(1);
    expect(SPEED_FACTOR.fast).toBeLessThan(1);
    expect(dur(260, 0.5)).toBe(130);
    expect(dur(260, 0)).toBe(0);
  });
});
