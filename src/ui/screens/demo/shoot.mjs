#!/usr/bin/env node
// Screenshots of the composed app (dev only). The start screen comes from the real app; the game states
// from the shell demo on recorded fixtures, so every viewport shows the same moment.
//
//   TSP_VITE_CACHE=node_modules/.vite-5189 npx vite --port 5189 --strictPort &
//   source scripts/pw-env.sh && node src/ui/screens/demo/shoot.mjs [--out docs/design/shots] [--only coup,ai] [--vp 1440,390] [--lang en,zh,en-XA]
//
// Files: <out>/app-<state>-<w>x<h>-<lang>.png
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt("url", "http://localhost:5189/TS_playfield/");
const OUT = opt("out", "docs/design/shots");
const only = new Set((opt("only", "") || "").split(",").filter(Boolean));
const vpOnly = new Set((opt("vp", "") || "").split(",").filter(Boolean));
const langs = (opt("lang", "en,zh") || "en,zh").split(",");
const XA = !args.includes("--no-xa");

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1366, h: 768 },
  { w: 1024, h: 768 },
  { w: 390, h: 844, mobile: true },
  { w: 844, h: 390, mobile: true },
];
const DEMO = `${BASE}src/ui/screens/demo/index.html`;

/** Each state: the URL and how to reach the moment. */
const STATES = {
  start: {
    url: lang => `${BASE}?lang=${lang}`,
    ready: async page => {
      await page.evaluate(() => localStorage.removeItem("ts-playfield.game.v1"));
      await page.waitForFunction(() => document.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow") === "100", null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
  },
  influence: { url: lang => `${DEMO}?scene=prompt-influence&lang=${lang}`, ready: settle },
  coup: {
    url: lang => `${DEMO}?scene=prompt-coup-target&lang=${lang}`,
    ready: async page => {
      await settle(page);
      // A ringed target whose centre is really on screen (not under the sheet, not off the phone's map).
      const pt = await page.evaluate(() => {
        for (const el of document.querySelectorAll("svg[role=application] [role=button][data-cid]")) {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height * 0.7;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && el.contains(hit)) return { x, y };
        }
        return null;
      });
      if (!pt) throw new Error("no target on screen");
      if (page.viewportSize().width < 900 || page.viewportSize().height < 500) {
        // Phones: a tap selects (no hover); the staged country keeps its tooltip.
        await page.touchscreen.tap(pt.x, pt.y);
      } else {
        await page.mouse.move(pt.x, pt.y);
        await page.waitForTimeout(250);
        await page.mouse.click(pt.x, pt.y);
      }
      await page.waitForTimeout(1200);
    },
  },
  ai: {
    url: lang => `${DEMO}?scene=seq-ai-coup&lang=${lang}&speed=normal`,
    ready: async page => {
      await page.waitForSelector("[data-pinned]", { timeout: 20000 }).catch(() => {});
      await page.waitForSelector("[role=group][data-ok]", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(700);
    },
  },
  headline: {
    url: lang => `${DEMO}?scene=seq-headline&lang=${lang}&speed=fast`,
    ready: async page => {
      await page.waitForSelector("[data-paper]", { timeout: 20000 });
      await page.waitForTimeout(1600);
    },
  },
  scoring: {
    url: lang => `${DEMO}?scene=seq-ai-event&lang=${lang}&speed=fast`,
    ready: async page => {
      // The scoring sheet (its dock side); the slip's actions row also carries an empty data-dock.
      await page.waitForSelector("[data-dock=left], [data-dock=right], [data-dock=bottom]", { timeout: 30000 });
      await page.waitForTimeout(2200);
    },
  },
  over: {
    url: lang => `${DEMO}?scene=seq-over-vp20&start=end&lang=${lang}`,
    ready: async page => {
      await page.getByRole("button", { name: /New game|新游戏|新对局|⟦/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2600);
    },
  },
};

async function settle(page) {
  await page.waitForSelector("svg[role=application] [data-cid]", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const jobs = [];
for (const [state, def] of Object.entries(STATES)) {
  if (only.size && !only.has(state)) continue;
  for (const vp of VIEWPORTS) {
    if (vpOnly.size && !vpOnly.has(String(vp.w))) continue;
    for (const lang of langs) jobs.push({ state, def, vp, lang });
    if (XA && (vp.w === 1440 || vp.w === 390)) jobs.push({ state, def, vp, lang: "en-XA" });
  }
}
for (const { state, def, vp, lang } of jobs) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.mobile ? 2 : 1, hasTouch: !!vp.mobile, isMobile: !!vp.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const name = `app-${state}-${vp.w}x${vp.h}-${lang}`;
  try {
    // A phone has no mouse: keep Chromium's parked pointer (0, 0) off the map, or a box there gets a synthetic
    // "mouse" hover and its tooltip (the compact-landscape map reaches the top-left corner).
    if (vp.mobile) await page.mouse.move(vp.w - 1, vp.h - 1);
    await page.goto(def.url(lang), { waitUntil: "load" });
    if (vp.mobile) await page.mouse.move(vp.w - 1, vp.h - 1);
    await def.ready(page);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    // Horizontal page scroll is a layout bug at every size.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) problems.push(`${name}: page scrolls horizontally by ${over}px`);
  } catch (e) {
    problems.push(`${name}: ${String(e).slice(0, 200)}`);
  }
  if (errors.length) problems.push(`${name}: ${errors.join(" | ").slice(0, 300)}`);
  console.log(name, errors.length ? `(${errors.length} errors)` : "");
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems");
