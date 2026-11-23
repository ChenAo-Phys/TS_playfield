#!/usr/bin/env node
// Screenshots of the map demo (dev only). Starts a Vite dev server on a free port, shoots with
// Playwright's Chromium, and stops the server.
//
//   source scripts/pw-env.sh && node src/ui/map/demo/shoot.mjs [outDir] [name...]
//
// Default outDir: docs/design/shots (files map-<name>.png).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, process.argv[2] ?? "docs/design/shots");
const only = new Set(process.argv.slice(3));

const SHOTS = [
  { name: "desktop-en", w: 1440, h: 900, q: "scene=influence&lang=en" },
  { name: "desktop-zh", w: 1440, h: 900, q: "scene=influence&lang=zh" },
  { name: "desktop-coup", w: 1440, h: 900, q: "scene=coup&lang=en", hover: 25 },
  { name: "desktop-region", w: 1440, h: 900, q: "scene=region&lang=en" },
  { name: "desktop-1366", w: 1366, h: 768, q: "scene=setup&lang=en" },
  { name: "desktop-zoom-zh", w: 1440, h: 900, q: "scene=influence&lang=zh", zoom: 2.4, hover: 24 },
  { name: "phone", w: 390, h: 844, q: "scene=influence&lang=en", mobile: true },
  { name: "phone-zh", w: 390, h: 844, q: "scene=influence&lang=zh", mobile: true },
  { name: "phone-idle", w: 390, h: 844, q: "scene=idle&lang=en", mobile: true },
];

const server = await createServer({ root, configFile: resolve(root, "vite.config.ts"), server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const port = server.httpServer.address().port;
const base = `http://localhost:${port}/TS_playfield/src/ui/map/demo/index.html`;
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
    await page.waitForTimeout(500);
    if (s.zoom) {
      const box = await page.locator(`[data-cid="${s.hover ?? 7}"]`).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < Math.round(Math.log(s.zoom) / Math.log(1.15)); i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(16); }
      await page.waitForTimeout(400);
    }
    if (s.hover !== undefined) {
      const box = await page.locator(`[data-cid="${s.hover}"]`).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
    }
    const file = resolve(outDir, `map-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
