#!/usr/bin/env node
// Screenshots of the common + cards component sheet (dev only). Expects the dev server on port 5181:
//   TSP_VITE_CACHE=node_modules/.vite-5181 npx vite --port 5181 --strictPort
//   source scripts/pw-env.sh && node src/ui/common/demo/shoot.mjs [outDir] [name...]
// Default outDir: docs/design/shots (files ui-common-<name>.png).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, process.argv[2] ?? "docs/design/shots");
const only = new Set(process.argv.slice(3));
const base = `http://localhost:${process.env.PORT ?? 5181}/TS_playfield/src/ui/common/demo/index.html`;

const SHOTS = [
  { name: "sheet-en", w: 1440, h: 900, q: "lang=en", full: true },
  { name: "sheet-zh", w: 1440, h: 900, q: "lang=zh", full: true },
  { name: "sheet-xa", w: 1440, h: 900, q: "lang=en-XA", full: true },
  { name: "zoom-en", w: 1440, h: 900, q: "lang=en&open=zoom" },
  { name: "zoom-zh", w: 1366, h: 768, q: "lang=zh&open=zoom" },
  { name: "dossier-en", w: 1440, h: 900, q: "lang=en&open=dossier" },
  { name: "dossier-zh-1024", w: 1024, h: 768, q: "lang=zh&open=dossier" },
  { name: "toasts", w: 1440, h: 900, q: "lang=en&open=toasts" },
  { name: "popover", w: 1440, h: 900, q: "lang=en&open=popover" },
  { name: "phone", w: 390, h: 844, q: "lang=en", mobile: true, full: true },
  { name: "phone-zh-sheet", w: 390, h: 844, q: "lang=zh&open=sheet", mobile: true },
  { name: "phone-cardsheet", w: 390, h: 844, q: "lang=en&open=zoom", mobile: true },
  { name: "phone-dossier-xa", w: 390, h: 844, q: "lang=en-XA&open=dossier", mobile: true },
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
    await page.goto(`${base}?${s.q}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".demo-head");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(outDir, `ui-common-${s.name}.png`), fullPage: !!s.full });
    if (errors.length) console.log(s.name, "errors:", errors.join("\n"));
    console.log("shot", s.name);
    await ctx.close();
  }
} finally {
  await browser.close();
}
