// Screenshots of the final design mockup → docs/design/shots/final-*.png
//   source scripts/pw-env.sh && node docs/design/mockup-final-assets/shoot.mjs [name ...]
// Serves the repo root on an ephemeral port for the duration of the run, with /fonts/* mapped to
// public/fonts/* (as Vite serves public/), then stops the server.
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
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.startsWith("/fonts/")) path = "/public" + path;
    const p = join(root, path);
    if (!p.startsWith(root)) throw new Error("outside");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/docs/design/mockup-final.html`;

const SHOTS = {
  "desktop-en": { q: "scene=influence&lang=en", w: 1440, h: 900 },
  "desktop-zh": { q: "scene=influence&lang=zh", w: 1440, h: 900 },
  "phone": { q: "scene=influence&lang=en&view=compact", w: 390, h: 844, scale: 2 },
  "phone-zh": { q: "scene=influence&lang=zh&view=compact", w: 390, h: 844, scale: 2 },
  "start": { q: "scene=start&lang=en", w: 1440, h: 900 },
  "start-zh": { q: "scene=start&lang=zh", w: 1440, h: 900 },
  "playmode": { q: "scene=playmode&lang=en", w: 1440, h: 900 },
  "coup": { q: "scene=coup&lang=en", w: 1440, h: 900 },
  "ai": { q: "scene=ai&lang=en", w: 1440, h: 900 },
  "desktop-1366": { q: "scene=influence&lang=en", w: 1366, h: 768 },
};
const want = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const [name, s] of Object.entries(SHOTS)) {
    if (want.length && !want.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.scale || 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("requestfailed", (r) => errors.push("failed: " + r.url()));
    page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
    await page.goto(`${base}?${s.q}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
    const out = join(root, `docs/design/shots/final-${name}.png`);
    await sharp(await page.screenshot()).png({ palette: true, quality: 92, effort: 8 }).toFile(out);
    await page.close();
    console.log("wrote", out, "fonts:", [...new Set(fonts)].join(", ") || "none", errors.length ? "ERRORS: " + errors.join(" | ") : "");
  }
} finally {
  await browser.close();
  server.close();
}
