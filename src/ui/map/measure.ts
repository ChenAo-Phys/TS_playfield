/**
 * Text widths for SVG labels, in map units. In the browser: canvas `measureText` with the real
 * font once the web fonts are ready (cached); elsewhere (server render, tests, fonts not loaded):
 * a per-character estimate for Barlow Condensed SemiBold caps and full-width CJK.
 */
import { useEffect, useState } from "react";

export type LabelFont = "name-en" | "name-zh" | "plate-en" | "plate-zh" | "chip-en" | "chip-zh" | "net-en" | "net-zh";

/** CSS font shorthand (size 100 px; widths scale linearly) and letter-spacing (em) per label kind. */
const FONTS: Readonly<Record<LabelFont, { css: string; tracking: number; upper: boolean }>> = {
  "name-en": { css: `600 100px "TS Condensed", "Barlow Condensed", "Arial Narrow", sans-serif`, tracking: 0.015, upper: true },
  "name-zh": { css: `700 100px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`, tracking: 0, upper: false },
  "plate-en": { css: `800 100px "TS Stencil", "Big Shoulders Stencil Display", "Arial Narrow", sans-serif`, tracking: 0.1, upper: true },
  "plate-zh": { css: `800 100px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`, tracking: 0.1, upper: false },
  "chip-en": { css: `700 100px "TS Condensed", "Barlow Condensed", "Arial Narrow", sans-serif`, tracking: 0.06, upper: true },
  "chip-zh": { css: `700 100px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`, tracking: 0, upper: false },
  "net-en": { css: `800 100px "TS Condensed", "Barlow Condensed", "Arial Narrow", sans-serif`, tracking: 0.04, upper: true },
  "net-zh": { css: `800 100px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`, tracking: 0, upper: false },
};

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

/** Advance widths (em) of Barlow Condensed SemiBold capitals, digits and punctuation (approximate). */
const NARROW_EM: Readonly<Record<string, number>> = {
  " ": 0.2, ".": 0.21, ",": 0.21, "/": 0.32, "-": 0.3, "'": 0.18, "·": 0.21, "(": 0.25, ")": 0.25,
  I: 0.22, J: 0.36, L: 0.39, T: 0.43, F: 0.41, E: 0.42, S: 0.45, P: 0.47, Z: 0.42, Y: 0.45, R: 0.48, B: 0.49,
  C: 0.46, K: 0.48, A: 0.5, V: 0.49, X: 0.48, G: 0.5, D: 0.5, H: 0.51, N: 0.51, U: 0.5, O: 0.5, Q: 0.5,
  M: 0.64, W: 0.7,
};

function estimateEm(text: string, kind: LabelFont): number {
  const f = FONTS[kind];
  const s = f.upper ? text.toUpperCase() : text;
  const stencil = kind.startsWith("plate-en");
  let w = 0;
  for (const ch of s) {
    if (CJK.test(ch)) w += 1;
    else if (/[0-9]/.test(ch)) w += 0.46;
    else w += (NARROW_EM[ch] ?? 0.5) * (stencil ? 1.08 : 1);
  }
  return w + [...s].length * f.tracking;
}

let ctx: CanvasRenderingContext2D | null | undefined;
let fontsReady = false;
const cache = new Map<string, number>();

function canvasEm(text: string, kind: LabelFont): number | null {
  if (!fontsReady || typeof document === "undefined") return null;
  if (ctx === undefined) {
    try {
      ctx = document.createElement("canvas").getContext("2d");
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return null;
  const f = FONTS[kind];
  const s = f.upper ? text.toUpperCase() : text;
  ctx.font = f.css;
  return ctx.measureText(s).width / 100 + [...s].length * f.tracking;
}

/** Natural width (map units) of `text` set at `size` map units in the label font `kind`. */
export function textWidth(text: string, kind: LabelFont, size: number): number {
  if (!text) return 0;
  const key = `${kind}\u0000${text}`;
  let em = cache.get(key);
  if (em === undefined) {
    em = canvasEm(text, kind) ?? estimateEm(text, kind);
    if (fontsReady) cache.set(key, em);
  }
  return em * size;
}

/**
 * Re-render once the page's web fonts have loaded, so labels are measured with the real fonts.
 * Returns a counter that changes when measurements may have changed.
 */
export function useFontsReady(): number {
  const [version, setVersion] = useState(fontsReady ? 1 : 0);
  useEffect(() => {
    if (fontsReady || typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    const wanted = [`600 15px "TS Condensed"`, `700 15px "TS Condensed"`, `800 22px "TS Stencil"`];
    void Promise.all(wanted.map(f => document.fonts.load(f).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => {
      if (!alive) return;
      fontsReady = true;
      cache.clear();
      setVersion(v => v + 1);
    });
    return () => { alive = false; };
  }, []);
  return version;
}
