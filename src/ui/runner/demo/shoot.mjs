#!/usr/bin/env node
// Screenshots of the runner demo (dev only). Starts a Vite dev server on a free port (cache dir
// node_modules/.vite-5182 unless TSP_VITE_CACHE is set), shoots with Playwright's Chromium, stops.
//
//   source scripts/pw-env.sh && node src/ui/runner/demo/shoot.mjs [outDir] [name...]
//
// Default outDir: docs/design/shots (files ui-runner-<name>.png).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, process.argv[2] ?? "docs/design/shots");
const only = new Set(process.argv.slice(3));
process.env.TSP_VITE_CACHE ??= "node_modules/.vite-5182";

// `at`: ms after load to shoot (mid-animation); `wait`: a selector to wait for first.
const SHOTS = [
  { name: "desktop-en", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&speed=slow", at: 2600 },
  { name: "desktop-zh", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=zh&speed=slow", at: 2600 },
  { name: "desktop-xa", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en-XA&speed=slow", at: 2600 },
  { name: "flight", w: 1440, h: 900, q: "scene=seq-play-discard&lang=en&speed=slow", at: 1500, flight: true, after: 300 },
  { name: "deal", w: 1440, h: 900, q: "scene=seq-turn-end&lang=en&speed=slow", at: 3000, flight: true, after: 250 },
  { name: "end-en", w: 1440, h: 900, q: "scene=seq-ai-turn&lang=en&speed=instant", at: 1500 },
  { name: "desktop-1366", w: 1366, h: 768, q: "scene=seq-opening-ussr&lang=en", at: 1800 },
  { name: "tablet-1024", w: 1024, h: 768, q: "scene=seq-ai-coup&lang=zh", at: 2400 },
  { name: "phone", w: 390, h: 844, q: "scene=seq-ai-turn&lang=en&speed=slow", at: 2600, mobile: true },
  { name: "phone-zh", w: 390, h: 844, q: "scene=seq-ai-turn&lang=zh&speed=slow", at: 2600, mobile: true },
  { name: "reduced", w: 1440, h: 900, q: "scene=seq-play-discard&lang=en&motion=reduce&speed=slow", at: 1650, flight: true, after: 60 },
];

const server = await createServer({ root, configFile: resolve(root, "vite.config.ts"), server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const port = server.httpServer.address().port;
const base = `http://localhost:${port}/TS_playfield/src/ui/runner/demo/index.html`;
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
    await page.goto(`${base}?${s.q}`, { waitUntil: "networkidle" });
    await page.waitForSelector("svg[role=application] [data-cid]");
    await page.evaluate(() => document.fonts.ready);
    if (s.flight) {
      // Replay from the base frame now that the page is ready, and catch the first flight.
      await page.waitForTimeout(1500);
      await page.click('button[title="replay from the base frame"]');
      await page.waitForSelector("[data-flight]", { state: "attached", timeout: s.at + 6000 }).catch(() => errors.push("no flight seen"));
      await page.waitForTimeout(s.after ?? 200);
      // Freeze every running animation so the shot shows the card mid-flight.
      await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    } else {
      await page.waitForTimeout(s.at);
    }
    const file = resolve(outDir, `ui-runner-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
