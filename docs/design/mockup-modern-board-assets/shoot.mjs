// Screenshots of the modern-board mockups. Run from the repo root:
//   source scripts/pw-env.sh && node docs/design/mockup-modern-board-assets/shoot.mjs [filter]
import { chromium } from "playwright";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const design = resolve(here, "..");
const shots = join(design, "shots");
const page = (file, q = "") => pathToFileURL(join(design, file)).href + q;
const JOBS = [
  ["desktop-en", page("mockup-modern-board.html", "?state=influence"), 1440, 900],
  ["desktop-zh", page("mockup-modern-board.html", "?state=influence&lang=zh"), 1440, 900],
  ["phone", page("mockup-modern-board.html", "?state=influence"), 390, 844, 3],
  ["phone-zh", page("mockup-modern-board.html", "?state=influence&lang=zh"), 390, 844, 3],
  ["start", page("mockup-modern-board-start.html"), 1440, 900],
  ["start-zh", page("mockup-modern-board-start.html", "?lang=zh"), 1440, 900],
  ["start-phone", page("mockup-modern-board-start.html"), 390, 844, 3],
  ["coup", page("mockup-modern-board.html", "?state=coup"), 1440, 900],
  ["ai-turn", page("mockup-modern-board.html", "?state=ai"), 1440, 900],
  ["scoring", page("mockup-modern-board.html", "?state=scoring"), 1440, 900],
  ["headline", page("mockup-modern-board.html", "?state=headline&lang=zh"), 1440, 900],
  ["defcon", page("mockup-modern-board.html", "?state=defcon"), 1440, 900],
  ["cardpick", page("mockup-modern-board.html", "?state=cardpick"), 1440, 900],
  ["gameover", page("mockup-modern-board.html", "?state=gameover"), 1440, 900],
  ["desktop-1920", page("mockup-modern-board.html", "?state=influence"), 1920, 1080],
  ["tablet", page("mockup-modern-board.html", "?state=influence"), 1180, 820],
  ["anatomy", page("mockup-modern-board-anatomy.html"), 1440, 900, 1, true],
  ["anatomy-zh", page("mockup-modern-board-anatomy.html", "?lang=zh"), 1440, 900, 1, true],
];
const filter = process.argv[2];
const browser = await chromium.launch();
for (const [name, url, w, h, dpr = 1, full = false] of JOBS) {
  if (filter && !name.includes(filter)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(url);
  await p.waitForTimeout(700);
  await p.screenshot({ path: join(shots, `modern-board-${name}.png`), fullPage: full });
  console.log(name, errors.length ? "ERRORS: " + errors.join(" | ") : "ok");
  await ctx.close();
}
await browser.close();
