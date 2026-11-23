// Screenshots of the mobile-clarity mockups. Run from the repo root:
//   source scripts/pw-env.sh && node docs/design/mockup-mobile-clarity-assets/shoot.mjs [filter]
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const root = process.cwd();
const base = "file://" + join(root, "docs/design");
const out = join(root, "docs/design/shots");
const D = { width: 1440, height: 900 }, P = { width: 390, height: 844 }, PL = { width: 844, height: 390 }, T = { width: 820, height: 1180 };
const shots = [
  ["desktop-influence", "mockup-mobile-clarity.html?state=influence", D],
  ["desktop-influence-zh", "mockup-mobile-clarity.html?state=influence&lang=zh", D],
  ["desktop-coup", "mockup-mobile-clarity.html?state=coup", D],
  ["desktop-card", "mockup-mobile-clarity.html?state=card", D],
  ["desktop-ai", "mockup-mobile-clarity.html?state=ai", D],
  ["desktop-headline", "mockup-mobile-clarity.html?state=headline", D],
  ["desktop-scoring-zh", "mockup-mobile-clarity.html?state=scoring&lang=zh", D],
  ["desktop-over", "mockup-mobile-clarity.html?state=over", D],
  ["phone-influence", "mockup-mobile-clarity.html?state=influence", P],
  ["phone-influence-zh", "mockup-mobile-clarity.html?state=influence&lang=zh", P],
  ["phone-card", "mockup-mobile-clarity.html?state=card", P],
  ["phone-ai", "mockup-mobile-clarity.html?state=ai", P],
  ["phone-landscape", "mockup-mobile-clarity.html?state=influence", PL],
  ["tablet-influence", "mockup-mobile-clarity.html?state=influence", T],
  ["start-desktop", "mockup-mobile-clarity-start.html", D],
  ["start-desktop-zh", "mockup-mobile-clarity-start.html?lang=zh", D],
  ["start-phone", "mockup-mobile-clarity-start.html", P],
];
const filter = process.argv[2];
const browser = await chromium.launch();
for (const [name, url, vp] of shots) {
  if (filter && !name.includes(filter)) continue;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vp.width < 900 ? 2 : 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(name, "pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error(name, "console:", m.text()); });
  await page.goto(`${base}/${url}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `mobile-clarity-${name}.png`) });
  console.log("shot", name);
  await ctx.close();
}
await browser.close();
