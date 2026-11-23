// Screenshots of the situation-room mockup.
//   source scripts/pw-env.sh && node docs/design/mockup-situation-room-assets/shoot.mjs [name ...]
// Serves the repo root on an ephemeral port for the duration of the run (fonts need http), then stops.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(root)) throw new Error("outside");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/docs/design/mockup-situation-room.html`;

const SHOTS = {
  "desktop-en": { q: "scene=influence&lang=en", w: 1440, h: 900 },
  "desktop-zh": { q: "scene=playmode&lang=zh", w: 1440, h: 900 },
  "desktop-zh-influence": { q: "scene=influence&lang=zh", w: 1440, h: 900 },
  "phone": { q: "scene=influence&lang=en&view=phone", w: 390, h: 844, scale: 2 },
  "phone-zh": { q: "scene=influence&lang=zh&view=phone", w: 390, h: 844, scale: 2 },
  "start": { q: "scene=start&lang=en", w: 1440, h: 900 },
  "start-zh": { q: "scene=start&lang=zh", w: 1440, h: 900 },
  "action-zoom": { q: "scene=action&lang=en", w: 1440, h: 900 },
  "action-zoom-zh": { q: "scene=action&lang=zh", w: 1440, h: 900 },
  "playmode-en": { q: "scene=playmode&lang=en", w: 1440, h: 900 },
  "coup": { q: "scene=coup&lang=en", w: 1440, h: 900 },
  "ai-reveal": { q: "scene=ai&lang=en", w: 1440, h: 900 },
  "headline": { q: "scene=headline&lang=en", w: 1440, h: 900 },
  "scoring": { q: "scene=scoring&lang=en", w: 1440, h: 900 },
  "defcon-choice": { q: "scene=defcon&lang=en", w: 1440, h: 900 },
  "card-picker": { q: "scene=picker&lang=en", w: 1440, h: 900 },
  "game-over": { q: "scene=over&lang=en", w: 1440, h: 900 },
  "tablet": { q: "scene=influence&lang=en", w: 1024, h: 768 },
};
const want = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const [name, s] of Object.entries(SHOTS)) {
    if (want.length && !want.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.scale || 1 });
    await page.goto(`${base}?${s.q}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = join(root, `docs/design/shots/situation-room-${name}.png`);
    // Palette-quantised PNG keeps the shots ~4x smaller with no visible loss at review size.
    await sharp(await page.screenshot()).png({ palette: true, quality: 92, effort: 8 }).toFile(out);
    await page.close();
    console.log("wrote", out);
  }
} finally {
  await browser.close();
  server.close();
}
