#!/usr/bin/env node
// Screenshots of the prompts demo (dev only). The dev server must be running:
//   TSP_VITE_CACHE=node_modules/.vite-5185 npx vite --port 5185 --strictPort
//   source scripts/pw-env.sh && node src/ui/prompts/demo/shoot.mjs [name…]
// Writes docs/design/shots/ui-prompts-<name>.png. PORT=… overrides the port.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(root, "docs/design/shots");
const only = new Set(process.argv.slice(2));
const port = process.env.PORT ?? "5185";
const base = `http://localhost:${port}/TS_playfield/src/ui/prompts/demo/index.html`;

const box = id => `svg[role=application] [data-cid="${id}"]`;
// Each shot: url query, viewport, optional steps (hover / click / key / wait).
const SHOTS = [
  { name: "influence-en", w: 1440, h: 900, q: "scene=prompt-influence&lang=en", steps: [["hover", box(21)], ["wait", 600]] },
  { name: "influence-zh", w: 1440, h: 900, q: "scene=prompt-influence&lang=zh", steps: [["hover", box(21)], ["wait", 600]] },
  { name: "influence-xa", w: 1440, h: 900, q: "scene=prompt-influence&lang=en-XA", steps: [["hover", box(21)], ["wait", 600]] },
  { name: "coup-en", w: 1440, h: 900, q: "scene=prompt-coup-target&lang=en", steps: [["click", box(25)], ["mouse", 20, 20], ["wait", 700]] },
  { name: "coup-tip", w: 1440, h: 900, q: "scene=prompt-coup-target&lang=en", steps: [["click", box(25)], ["wait", 900]] },
  { name: "coup-zh", w: 1440, h: 900, q: "scene=prompt-coup-target&lang=zh", steps: [["click", box(25)], ["mouse", 20, 20], ["wait", 700]] },
  { name: "coup-hold", w: 1440, h: 900, q: "scene=prompt-coup-target&lang=en&variant=hold", steps: [["click", box(25)], ["mouse", 20, 20], ["wait", 700]] },
  { name: "realign-en", w: 1440, h: 900, q: "scene=prompt-realign-target&lang=en", steps: [["hover", box(63)], ["wait", 700]] },
  { name: "playmode-en", w: 1440, h: 900, q: "scene=prompt-play-mode-opponent&lang=en", steps: [["wait", 500]] },
  { name: "playmode-zh", w: 1440, h: 900, q: "scene=prompt-play-mode&lang=zh", steps: [["wait", 500]] },
  { name: "playmode-xa", w: 1440, h: 900, q: "scene=prompt-play-mode&lang=en-XA", steps: [["wait", 500]] },
  { name: "playmode-staged", w: 1440, h: 900, q: "scene=prompt-play-mode&lang=en", steps: [["key", "e"], ["wait", 400]] },
  { name: "opmode-en", w: 1440, h: 900, q: "scene=prompt-op-mode&lang=en", steps: [["wait", 500]] },
  { name: "headline-staged", w: 1440, h: 900, q: "scene=prompt-headline&lang=en", steps: [["click", "[data-mode] button:nth-child(3)"], ["mouse", 700, 300], ["wait", 500]] },
  { name: "actioncard-score", w: 1440, h: 900, q: "scene=prompt-action-card-china&lang=en", steps: [["click", "[data-mode] button:nth-child(1)"], ["mouse", 700, 300], ["wait", 500]] },
  { name: "branch-en", w: 1440, h: 900, q: "scene=prompt-branch&lang=en", steps: [["wait", 500]] },
  { name: "wargames-hold", w: 1440, h: 900, q: "scene=prompt-branch&lang=en&variant=wargames", steps: [["click", "[role=dialog] button[aria-pressed]"], ["wait", 400]] },
  { name: "defcon-zh", w: 1440, h: 900, q: "scene=prompt-defcon-level&lang=zh", steps: [["wait", 500]] },
  { name: "defcon-en", w: 1440, h: 900, q: "scene=prompt-defcon-level&lang=en", steps: [["click", "[role=dialog] button[aria-label^='DEFCON 4']"], ["wait", 400]] },
  { name: "picker-en", w: 1440, h: 900, q: "scene=prompt-event-card&lang=en&variant=picker", steps: [["click", "[role=dialog] button[aria-pressed]"], ["mouse", 20, 20], ["wait", 500]] },
  { name: "pile-zh", w: 1440, h: 900, q: "scene=prompt-midgame&lang=zh&variant=pile", steps: [["wait", 600]] },
  { name: "region-en", w: 1440, h: 900, q: "scene=prompt-region&lang=en", steps: [["click", "[role=group] button:nth-child(3)"], ["wait", 500]] },
  { name: "event-add-en", w: 1440, h: 900, q: "scene=prompt-event-target-add&lang=en", steps: [["hover", box(66)], ["wait", 600]] },
  { name: "list-en", w: 1440, h: 900, q: "scene=prompt-coup-target&lang=en", steps: [["key", "t"], ["wait", 500]] },
  { name: "ai-en", w: 1440, h: 900, q: "scene=seq-ai-coup&lang=en&speed=slow", steps: [["press", "button[title='replay from the base frame']"], ["wait", 300]] },
  { name: "ai-waiting", w: 1440, h: 900, q: "scene=prompt-influence&lang=en&variant=ai", steps: [["wait", 600]] },
  { name: "ai-thinking-zh", w: 1440, h: 900, q: "scene=prompt-influence&lang=zh&variant=ai", steps: [["wait", 600]] },
  { name: "desktop-1366", w: 1366, h: 768, q: "scene=prompt-influence-us&lang=en", steps: [["hover", box(29)], ["wait", 600]] },
  { name: "tablet-1024", w: 1024, h: 768, q: "scene=prompt-coup-target-us&lang=zh", steps: [["click", box(81)], ["mouse", 20, 20], ["wait", 600]] },
  { name: "tablet-playmode", w: 1024, h: 768, q: "scene=prompt-play-mode&lang=en", steps: [["wait", 500]] },
  { name: "phone-en", w: 390, h: 844, q: "scene=prompt-influence&lang=en", mobile: true, steps: [["wait", 900]] },
  { name: "phone-zh", w: 390, h: 844, q: "scene=prompt-influence&lang=zh", mobile: true, steps: [["wait", 900]] },
  { name: "phone-list", w: 390, h: 844, q: "scene=prompt-coup-target&lang=en", mobile: true, steps: [["tap", "button[aria-label=expand]"], ["wait", 600]] },
  { name: "phone-playmode", w: 390, h: 844, q: "scene=prompt-play-mode&lang=zh", mobile: true, steps: [["wait", 900]] },
  { name: "phone-branch", w: 390, h: 844, q: "scene=prompt-branch&lang=en", mobile: true, steps: [["wait", 900]] },
  { name: "phone-ai", w: 390, h: 844, q: "scene=prompt-influence&lang=zh&variant=ai", mobile: true, steps: [["wait", 900]] },
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
    await page.goto(`${base}?${s.q}`, { waitUntil: "networkidle" });
    await page.waitForSelector("svg[role=application] [data-cid]");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    for (const [op, a, b] of s.steps ?? []) {
      try {
        if (op === "hover") await page.hover(a, { timeout: 4000 });
        else if (op === "click") { await page.hover(a, { timeout: 4000 }); await page.waitForTimeout(150); await page.click(a, { timeout: 4000 }); }
        else if (op === "tap") await page.tap(a, { timeout: 4000 });
        else if (op === "press") await page.click(a, { timeout: 4000 });
        else if (op === "key") await page.keyboard.press(a);
        else if (op === "mouse") await page.mouse.move(a, b);
        else if (op === "wait") await page.waitForTimeout(a);
      } catch (e) {
        errors.push(`${op} ${a}: ${String(e).split("\n")[0]}`);
      }
    }
    const file = resolve(outDir, `ui-prompts-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log(file, errors.length ? `ERRORS: ${errors.join(" | ")}` : "");
    await ctx.close();
  }
} finally {
  await browser.close();
}
