#!/usr/bin/env node
// Screenshots of the stage demo (dev only). Uses a running dev server (default http://localhost:5187;
// start it with `TSP_VITE_CACHE=node_modules/.vite-5187 npx vite --port 5187 --strictPort`), shoots with
// Playwright's Chromium.
//
//   source scripts/pw-env.sh && node src/ui/stage/demo/shoot.mjs [name...]
//
// Files: docs/design/shots/ui-stage-<name>.png. STAGE_DEMO_URL overrides the server.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, process.env.SHOTS_DIR ?? "docs/design/shots");
const only = new Set(process.argv.slice(2));
const base = process.env.STAGE_DEMO_URL ?? "http://localhost:5187/TS_playfield/src/ui/stage/demo/index.html";

const D = { w: 1440, h: 900 };
// `at`: ms after the board is up; moments start 700 ms after it. `pause`: freeze animations first.
const SHOTS = [
  { name: "headline-en", ...D, q: "moment=headline&lang=en", at: 2200 },
  { name: "headline-zh", ...D, q: "moment=headline&lang=zh", at: 2200 },
  { name: "headline-xa", ...D, q: "moment=headline&lang=en-XA", at: 2200 },
  { name: "headline-defectors", ...D, q: "moment=headline-defectors&lang=en", at: 2200 },
  { name: "scoring-eu-en", ...D, q: "moment=scoring-2&lang=en", at: 2600 },
  { name: "scoring-me-zh", ...D, q: "moment=scoring-3&lang=zh", at: 2600 },
  { name: "scoring-sea-en", ...D, q: "moment=scoring-38&lang=en", at: 2600 },
  { name: "scoring-ca-xa", ...D, q: "moment=scoring-37&lang=en-XA", at: 2600 },
  { name: "banner-t4-en", ...D, q: "moment=banner-4&lang=en&hold=8", at: 1900 },
  { name: "banner-t8-zh", ...D, q: "moment=banner-8&lang=zh&hold=8", at: 1900 },
  { name: "banner-headline", ...D, q: "moment=banner-headline&lang=en&hold=8", at: 1500 },
  { name: "dice-coup-en", ...D, q: "moment=dice-coup&lang=en&hold=20", at: 2600 },
  { name: "dice-realign-zh", ...D, q: "moment=dice-realign&lang=zh&hold=20", at: 2600 },
  { name: "dice-war-en", ...D, q: "moment=dice-war&lang=en&hold=20", at: 2600 },
  { name: "dice-space-en", ...D, q: "moment=dice-space&lang=en&hold=20", at: 2600 },
  { name: "dice-olympics-xa", ...D, q: "moment=dice-olympics&lang=en-XA&hold=20", at: 2600 },
  { name: "dice-tumble", ...D, q: "moment=dice-coup&lang=en&speed=slow", at: 1500, pause: true },
  { name: "dock-en", ...D, q: "moment=dock-coup&lang=en", at: 4100 },
  { name: "dock-zh", ...D, q: "moment=dock-coup&lang=zh", at: 4100 },
  { name: "dock-reveal-en", ...D, q: "moment=dock-coup&lang=en&hold=20", at: 3200 },
  { name: "dock-flight", ...D, q: "moment=dock-pinned&lang=en&speed=slow", at: 420, pause: true },
  { name: "dock-avoid", ...D, q: "moment=dock&lang=en&hold=4", at: 6200 },
  { name: "over-held-en", ...D, q: "moment=over-held&lang=en", at: 3500 },
  { name: "over-draw-zh", ...D, q: "moment=over-draw&lang=zh", at: 3500 },
  { name: "over-defcon-flash", ...D, q: "moment=over-defcon&lang=en", at: 1200, pause: true },
  { name: "over-defcon", ...D, q: "moment=over-defcon&lang=en", at: 5200 },
  { name: "over-final-sheet", ...D, q: "moment=over-final&lang=en&hold=8", at: 3000 },
  { name: "over-resign-xa", ...D, q: "moment=over-resign&lang=en-XA", at: 3500 },
  { name: "danger", ...D, q: "moment=danger&lang=en", at: 1200, pause: true },
  { name: "reduced-dock", ...D, q: "moment=dock-coup&lang=en&motion=reduce", at: 4100 },
  { name: "reduced-headline", ...D, q: "moment=headline&lang=en&motion=reduce", at: 1400 },
  { name: "seq-headline", ...D, q: "scene=seq-headline&start=begin&lang=en", at: 2600 },
  { name: "seq-over-defcon", ...D, q: "scene=seq-over-defcon&start=begin&lang=en", at: 9000 },
  { name: "seq-over-ended", ...D, q: "scene=seq-over-vp20&start=end&lang=zh", at: 1500 },
  { name: "seq-ai-coup", ...D, q: "scene=seq-ai-coup&start=begin&lang=zh&speed=slow", at: 5200 },
  { name: "1366-scoring", w: 1366, h: 768, q: "moment=scoring-79&lang=en", at: 2600 },
  { name: "1024-headline", w: 1024, h: 768, q: "moment=headline&lang=zh", at: 2200 },
  { name: "1024-over", w: 1024, h: 768, q: "moment=over-vp20&lang=en", at: 3500 },
  { name: "phone-headline", w: 390, h: 844, mobile: true, q: "moment=headline&lang=en&view=compact&chrome=0", at: 2200 },
  { name: "phone-scoring-zh", w: 390, h: 844, mobile: true, q: "moment=scoring-2&lang=zh&view=compact&chrome=0", at: 2600 },
  { name: "phone-over", w: 390, h: 844, mobile: true, q: "moment=over-held&lang=en&view=compact&chrome=0", at: 3500 },
  { name: "phone-dice-zh", w: 390, h: 844, mobile: true, q: "moment=dice-coup&lang=zh&view=compact&chrome=0&hold=20", at: 2600 },
  { name: "phone-dock", w: 390, h: 844, mobile: true, q: "moment=dock-pinned&lang=en&view=compact&chrome=0&hold=20", at: 1900 },
  { name: "phone-banner-zh", w: 390, h: 844, mobile: true, q: "moment=banner-4&lang=zh&view=compact&chrome=0&hold=8", at: 1900 },
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
    const scene = s.q.includes("scene=") ? "" : "scene=prompt-midgame&";
    await page.goto(`${base}?${scene}${s.q}`, { waitUntil: "networkidle" });
    await page.waitForSelector("svg[role=application] [data-cid]");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(s.at);
    if (s.pause) await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    const file = resolve(outDir, `ui-stage-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
}
