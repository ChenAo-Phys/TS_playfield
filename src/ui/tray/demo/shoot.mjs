#!/usr/bin/env node
// Screenshots of the tray demo (dev only), against a running dev server:
//
//   TSP_VITE_CACHE=node_modules/.vite-5188 npx vite --port 5188 --strictPort
//   source scripts/pw-env.sh && node src/ui/tray/demo/shoot.mjs [name...]
//
// Writes docs/design/shots/ui-tray-<name>.png. TSP_DEMO_URL overrides the server URL.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, "docs/design/shots");
const only = new Set(process.argv.slice(2));
const base = process.env.TSP_DEMO_URL ?? "http://localhost:5188/TS_playfield/src/ui/tray/demo/index.html";

// hover: a card id to hover (zoom); wait: ms after ready; replay: restart the sequence and shoot at `at`.
const SHOTS = [
  { name: "desktop-en", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en" },
  { name: "desktop-zh", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=zh" },
  { name: "desktop-xa", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en-XA" },
  { name: "staged-en", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en&staged=21&drop=25,26,31" },
  { name: "warning-en", w: 1440, h: 900, q: "scene=prompt-action-card-warning&lang=en&staged=27" },
  { name: "eventcard-zh", w: 1440, h: 900, q: "scene=prompt-event-card&lang=zh" },
  { name: "headline-en", w: 1440, h: 900, q: "scene=prompt-headline&lang=en&staged=31" },
  { name: "committed-en", w: 1440, h: 900, q: "variant=committed&lang=en" },
  { name: "playmode-en", w: 1440, h: 900, q: "scene=prompt-play-mode&lang=en" },
  { name: "neutral-en", w: 1440, h: 900, q: "variant=neutral&lang=en" },
  { name: "reshuffle-en", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&start=end" },
  { name: "zoom-en", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en", hover: 25 },
  { name: "desktop-1366", w: 1366, h: 768, q: "scene=prompt-headline&lang=en" },
  { name: "desktop-1366-zh", w: 1366, h: 768, q: "scene=prompt-action-card-china&lang=zh" },
  { name: "tablet-1024", w: 1024, h: 768, q: "scene=prompt-action-card-china&lang=en" },
  { name: "tablet-1024-zh", w: 1024, h: 768, q: "scene=prompt-headline&lang=zh" },
  { name: "phone-drawer", w: 390, h: 844, q: "scene=prompt-action-card-china&lang=en", mobile: true },
  { name: "phone-drawer-zh", w: 390, h: 844, q: "scene=prompt-headline&lang=zh&staged=31", mobile: true },
  { name: "phone-drawer-xa", w: 390, h: 844, q: "scene=prompt-action-card-warning&lang=en-XA", mobile: true },
  { name: "phone-closed", w: 390, h: 844, q: "scene=prompt-influence&lang=en", mobile: true, ready: "[data-pile]" },
  { name: "reduced", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en&motion=reduce", hover: 21 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const s of SHOTS) {
    if (only.size && !only.has(s.name)) continue;
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, hasTouch: !!s.mobile, isMobile: !!s.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${base}?${s.q}&shot=1`, { waitUntil: "networkidle" });
    await page.waitForSelector(s.ready ?? "[data-hand-card]", { timeout: 15000 }).catch(() => errors.push("not ready"));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(s.wait ?? 900);
    if (s.hover) {
      await page.hover(`[data-hand-card][data-card="${s.hover}"]`);
      await page.waitForTimeout(700);
    }
    const file = resolve(outDir, `ui-tray-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
}
