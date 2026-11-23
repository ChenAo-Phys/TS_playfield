#!/usr/bin/env node
/**
 * Dev-only: open tests/ai/browser/index.html in headless Chromium (Playwright), wait for the AI bench to
 * finish, print a summary and save the raw results. Start a server first (dev: `npx vite --port 5181`;
 * build: see docs/handoff/ai.md), and `source scripts/pw-env.sh` in the same shell.
 *
 * usage: node tests/ai/browser/run.mjs <page url> [--throttle 4] [--runs 1] [--out results.json] [--shot page.png]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args[0];
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const throttle = Number(opt("throttle", "1"));
const runs = Number(opt("runs", "1"));
const out = opt("out", "");
const shot = opt("shot", "");
if (!url) { console.error("usage: run.mjs <url> [...]"); process.exit(2); }

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0);
  return { n: s.length, median: q(0.5), p90: q(0.9), max: s.length ? s[s.length - 1] : 0, total: s.reduce((a, b) => a + b, 0) };
};

const browser = await chromium.launch();
const context = await browser.newContext();
const results = [];
try {
  for (let run = 1; run <= runs; run++) {
    // Runs share the context: run 2+ shows the Cache API hit (no model download).
    const page = await context.newPage();
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("worker", (w) => requests.push(`[worker] ${w.url()}`));
    const consoleLines = [];
    page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
    if (throttle > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    }
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.__aiBench?.done === true, null, { timeout: 30 * 60_000, polling: 500 });
    const bench = await page.evaluate(() => window.__aiBench);
    if (shot) await page.screenshot({ path: run === 1 ? shot : shot.replace(/\.png$/, `.${run}.png`), fullPage: true });
    await page.close();
    const ortReqs = requests.filter((u) => /ort-wasm|ort\.wasm|onnxruntime/.test(u));
    const modelReqs = requests.filter((u) => /\.onnx/.test(u));
    const engineReqs = requests.filter((u) => /ts_engine/.test(u));
    const workerReqs = requests.filter((u) => u.startsWith("[worker]"));
    const searches = bench.decisions.filter((d) => d.source === "search");
    const summary = {
      run, throttle, wallMs: Date.now() - t0, error: bench.error ?? null, initMs: bench.initMs,
      progressStages: [...new Set(bench.progress.map((p) => p.stage))],
      decisions: bench.decisions.length, compute: stats(searches.map((d) => d.ms)),
      roundTripOverhead: stats(bench.decisions.map((d) => d.elapsedMs - d.ms)),
      cancel: bench.cancel ?? null, frames: bench.frames, engineMatches: bench.engineMatches,
      crossOriginIsolated: bench.crossOriginIsolated, cacheKeys: bench.cacheKeys,
      ortRequests: ortReqs, modelRequests: modelReqs, engineRequests: engineReqs, workers: workerReqs,
      consoleErrors: consoleLines.filter((l) => /^(error|pageerror)/.test(l)),
    };
    results.push({ summary, bench, console: consoleLines });
    console.log(JSON.stringify(summary, null, 1));
  }
} finally {
  await browser.close();
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
process.exit(results.some((r) => r.summary.error) ? 1 : 0);
