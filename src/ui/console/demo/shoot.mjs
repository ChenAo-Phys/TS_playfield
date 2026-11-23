#!/usr/bin/env node
// Screenshots of the console + rail demo (dev only). Needs the dev server:
//   TSP_VITE_CACHE=node_modules/.vite-5186 npx vite --port 5186 --strictPort
//   source scripts/pw-env.sh && node src/ui/console/demo/shoot.mjs [name...]
// Writes docs/design/shots/ui-console-<name>.png. BASE overrides the server URL.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, "docs/design/shots");
const base = (process.env.BASE ?? "http://localhost:5186") + "/TS_playfield/src/ui/console/demo/index.html";
const only = new Set(process.argv.slice(2));

// at: ms after the page settles; hover: a selector to hover (tooltips); click: a selector to click first.
const SHOTS = [
  { name: "desktop-en", w: 1440, h: 900, q: "scene=prompt-midgame&lang=en" },
  { name: "desktop-zh", w: 1440, h: 900, q: "scene=prompt-midgame&lang=zh" },
  { name: "desktop-xa", w: 1440, h: 900, q: "scene=prompt-midgame&lang=en-XA" },
  { name: "defcon2-en", w: 1440, h: 900, q: "scene=prompt-action-card&lang=en" },
  { name: "effects-zh", w: 1440, h: 900, q: "scene=prompt-region&lang=zh" },
  { name: "thinking-en", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&think=60000&speed=fast", at: 2500 },
  { name: "beat-vp", w: 1440, h: 900, q: "scene=seq-over-vp20&lang=en&speed=slow", waitFor: "[class*=vpChip]", freeze: true },
  { name: "beat-defcon", w: 1440, h: 900, q: "scene=seq-ai-coup&lang=en&speed=slow", waitFor: "[class*=lampFlicker]", freeze: true },
  { name: "reveal-en", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&speed=slow", waitFor: "[class*=stampAt]", freeze: true },
  { name: "tip-vp", w: 1440, h: 900, q: "scene=prompt-midgame&lang=en", hover: "[data-variant=desktop] [data-vp]" },
  { name: "tip-space-zh", w: 1440, h: 900, q: "scene=prompt-midgame&lang=zh", hover: "[data-variant=desktop] [aria-label^='太空竞赛']" },
  { name: "condensed-1366", w: 1366, h: 768, q: "scene=prompt-action-card&lang=en" },
  { name: "condensed-1366-zh", w: 1366, h: 768, q: "scene=prompt-midgame&lang=zh" },
  { name: "collapsed-1366", w: 1366, h: 768, q: "scene=prompt-midgame&lang=en&rail=collapsed" },
  { name: "tablet-1024", w: 1024, h: 768, q: "scene=prompt-midgame&lang=en&flyout=adversary" },
  { name: "tablet-1024-log-zh", w: 1024, h: 768, q: "scene=prompt-midgame&lang=zh&flyout=log" },
  { name: "tablet-1024-status-xa", w: 1024, h: 768, q: "scene=prompt-region&lang=en-XA&flyout=status" },
  { name: "phone", w: 390, h: 844, q: "scene=prompt-midgame&lang=en", mobile: true },
  { name: "phone-zh-adversary", w: 390, h: 844, q: "scene=prompt-region&lang=zh&sheet=adversary", mobile: true },
  { name: "phone-log", w: 390, h: 844, q: "scene=prompt-midgame&lang=en&sheet=log", mobile: true },
  { name: "phone-status-xa", w: 390, h: 844, q: "scene=prompt-action-card&lang=en-XA&sheet=status", mobile: true },
  { name: "variants-en", w: 1460, h: 1300, q: "scene=prompt-region&lang=en&page=variants", full: true },
  { name: "variants-zh", w: 1460, h: 1300, q: "scene=prompt-action-card&lang=zh&page=variants", full: true },
  { name: "reduced", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&motion=reduce&speed=slow", at: 6000 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const s of SHOTS) {
    if (only.size && !only.has(s.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, hasTouch: !!s.mobile, isMobile: !!s.mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${base}?toolbar=off&${s.q}`, { waitUntil: "networkidle" });
    await page.waitForSelector("header[data-variant]");
    await page.evaluate(() => document.fonts.ready);
    if (s.waitFor) {
      await page.waitForSelector(s.waitFor, { state: "attached", timeout: 15000 }).catch(() => errors.push(`no ${s.waitFor}`));
      await page.waitForTimeout(250);
      if (s.freeze) await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    } else {
      await page.waitForTimeout(s.at ?? 900);
      if (s.freeze) await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    }
    if (s.hover) {
      await page.hover(s.hover).catch(e => errors.push(String(e)));
      await page.waitForTimeout(500);
    }
    const file = resolve(outDir, `ui-console-${s.name}.png`);
    await page.screenshot({ path: file, fullPage: !!s.full });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
}
