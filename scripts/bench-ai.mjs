#!/usr/bin/env node
/**
 * AI-vs-AI benchmark: one game between two AiPlayers (src/ai, inline mode, one per side, each with its
 * own engine, onnxruntime session and belief tracker), driven like the controller drives a game:
 * both seats seated (decider = model features, other side = person rules), single-legal decisions
 * auto-played and not recorded, every other move recorded for the beliefs. Reports every AI decision's
 * compute time and a summary.
 *
 * The TypeScript sources are loaded through Vite's SSR module loader, so this runs the same code as
 * the site (minus the worker). Single-threaded onnxruntime, as in the browser.
 *
 * usage: node scripts/bench-ai.mjs [--search top|nobelief|policy|<search string>] [--seed N]
 *                                  [--max-decisions N] [--json out.json] [--quiet]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const quiet = args.includes("--quiet");
const seed = Number(opt("seed", "7"));
const maxDecisions = Number(opt("max-decisions", "100000"));
const jsonOut = opt("json", "");

const server = await createServer({
  root, configFile: false, base: "/TS_playfield/", logLevel: "error", appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
});
let exitCode = 0;
try {
  const ai = await server.ssrLoadModule("/src/ai/index.ts");
  const cfg = await server.ssrLoadModule("/src/ai/config.ts");
  const { WasmEngine } = await server.ssrLoadModule("/src/engine/wasm_engine.ts");

  const searchArg = opt("search", "top");
  const search = searchArg === "top" ? cfg.SEARCH : searchArg === "nobelief" ? cfg.SEARCH_NO_BELIEF : searchArg;
  const publicUrl = pathToFileURL(path.join(root, "public") + "/").href;
  const modelBytes = new Uint8Array(readFileSync(path.join(root, "public", "models", cfg.MODEL_FILE)));
  const config = { modelUrl: "unused", modelSha256: cfg.MODEL_SHA256, search, minDelayMs: 0 };
  const mk = () => ai.createAiPlayer(config, { mode: "inline", engineBase: publicUrl, modelBytes: modelBytes.slice(), useCache: false, padSensitive: false });
  const players = { 1: mk(), [-1]: mk() };
  const t0 = performance.now();
  const [info] = await Promise.all([players[1].init(), players[-1].init()]);
  console.log(`model ${info.modelSha256.slice(0, 12)}…  features ${info.obsFeatures}  engine ${info.engineFingerprint.slice(0, 12)}…`);
  console.log(`search ${search}  game seed ${seed}  (two players loaded in ${Math.round(performance.now() - t0)} ms)`);

  const E = await WasmEngine.load(publicUrl, { printErr: () => undefined });
  const FEATURES = info.obsFeatures;
  E.newGame(seed);
  const moves = [];
  const rows = [];
  let step = 0, autoSteps = 0;
  const name = (p) => (p === 1 ? "US" : "USSR");
  while (!E.isTerminal() && rows.length < maxDecisions) {
    const p = E.decisionPlayer();
    if (p === 0) throw new Error("chance node outside step()");
    E.seat(p, FEATURES);
    E.seat(-p, E.currentRules);
    const mask = E.mask(false);
    let legal = 0, only = -1;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { legal++; only = i; }
    const before = E.snapshot();
    let idx;
    if (legal === 1) {
      idx = only;
      autoSteps++;
    } else {
      const d = E.display();
      const c = await players[p].choose({ state: before, seed: ((step + 1) * 1_000_003) >>> 0, moves });
      if (!mask[c.idx]) throw new Error(`illegal AI move ${c.idx}`);
      idx = c.idx;
      const r = { n: rows.length + 1, step, turn: d.turn, ar: d.action_round, phase: d.current_phase_name, side: name(p),
                  type: c.decision.decisionType, legal, source: c.source, ms: c.ms, rows: c.decision.rows,
                  beliefRows: c.decision.beliefRows };
      rows.push(r);
      if (!quiet) {
        console.log(`#${String(r.n).padStart(3)} T${r.turn} AR${r.ar} ${r.side.padEnd(4)} type ${r.type} legal ${String(legal).padStart(3)} `
          + `${r.source.padEnd(6)} ${String(r.ms).padStart(6)} ms  rows ${String(r.rows).padStart(6)}  belief ${r.beliefRows}`);
      }
    }
    const action = E.decodeFlat(idx);
    const why = E.step(action, 0);
    if (why) throw new Error(`step refused: ${why}`);
    if (legal > 1) moves.push({ before, action });
    step++;
  }

  const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0);
    return { n: s.length, median: q(0.5), p90: q(0.9), p99: q(0.99), max: s.length ? s[s.length - 1] : 0,
             total: s.reduce((a, b) => a + b, 0), over2s: s.filter((x) => x > 2000).length, over5s: s.filter((x) => x > 5000).length };
  };
  const searched = rows.filter((r) => r.source === "search");
  const all = stats(rows.map((r) => r.ms));
  const srch = stats(searched.map((r) => r.ms));
  const bySide = Object.fromEntries(["US", "USSR"].map((s) => [s, stats(rows.filter((r) => r.side === s).map((r) => r.ms))]));
  const d = E.display();
  const summary = {
    search, seed, decisions: rows.length, searched: searched.length, autoSteps, steps: step,
    finished: E.isTerminal(), ending: E.isTerminal() ? E.endingReason() : null, turn: d.turn, vp: d.victory_points,
    all, search_ms: srch, bySide, wallSeconds: Math.round((performance.now() - t0) / 1000),
  };
  console.log("\nsummary");
  console.log(`  decisions ${rows.length} (searched ${searched.length}), auto-played ${autoSteps}, game ${summary.finished ? `over: ${summary.ending}` : "unfinished"} at turn ${d.turn}, VP ${d.victory_points}`);
  console.log(`  per search: median ${srch.median} ms, p90 ${srch.p90} ms, p99 ${srch.p99} ms, max ${srch.max} ms; >2 s ${srch.over2s}, >5 s ${srch.over5s}`);
  for (const s of ["US", "USSR"]) console.log(`  ${s.padEnd(4)} thinking total ${(bySide[s].total / 1000).toFixed(1)} s over ${bySide[s].n} decisions`);
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ summary, decisions: rows }, null, 1));
    console.log(`  written ${jsonOut}`);
  }
  for (const p of Object.values(players)) p.dispose();
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);
