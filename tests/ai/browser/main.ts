/**
 * Dev-only page: the worker AiPlayer in a real browser. Plays `n` AI decisions (AI = USSR, a seeded
 * random "human" as US) on a main-thread engine, the way the controller will, and records timings,
 * load progress, main-thread frame gaps and a cancel/respawn round trip into `window.__aiBench`.
 *
 *   /TS_playfield/tests/ai/browser/index.html?n=20&seed=7&search=top|nobelief&cancel=1
 */
import { createAiPlayer, isAbortError } from "../../../src/ai";
import { AI_CONFIG, SEARCH, SEARCH_NO_BELIEF } from "../../../src/ai/config";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { AiMove, LoadProgress } from "../../../src/game/contract";

interface DecisionRow {
  n: number; turn: number; ar: number; legal: number; type: number; source: string;
  ms: number; elapsedMs: number; rows: number; beliefRows: number;
}

interface Bench {
  done: boolean;
  error?: string;
  params: { n: number; seed: number; search: string };
  userAgent: string;
  crossOriginIsolated: boolean;
  progress: (LoadProgress & { t: number })[];
  initMs: number;
  info?: unknown;
  engineMatches?: boolean;
  decisions: DecisionRow[];
  cancel?: { aborted: boolean; abortAfterMs: number; respawnElapsedMs: number; respawnComputeMs: number; beliefReplayed: number; moves: number };
  frames: { count: number; maxGapMs: number; gapsOver50: number; gapsOver100: number };
  cacheKeys: string[];
  totalMs: number;
}

const params = new URLSearchParams(location.search);
const n = Number(params.get("n") ?? "20");
const seed = Number(params.get("seed") ?? "7");
const search = params.get("search") === "nobelief" ? SEARCH_NO_BELIEF : SEARCH;
const doCancel = params.get("cancel") !== "0";
/** "inline": the AI on the page's own thread (CPU throttling surely applies there). */
const mode = params.get("mode") === "inline" ? "inline" : "auto";

const bench: Bench = {
  done: false, params: { n, seed, search }, userAgent: navigator.userAgent, crossOriginIsolated: self.crossOriginIsolated,
  progress: [], initMs: 0, decisions: [], frames: { count: 0, maxGapMs: 0, gapsOver50: 0, gapsOver100: 0 }, cacheKeys: [],
  totalMs: 0,
};
(window as unknown as { __aiBench: Bench }).__aiBench = bench;

const logEl = document.getElementById("log")!;
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  logEl.textContent = lines.slice(-40).join("\n");
};

// Main-thread responsiveness while the AI thinks: the largest gap between timer ticks.
let last = performance.now();
const ticker = setInterval(() => {
  const t = performance.now();
  const gap = t - last;
  last = t;
  bench.frames.count++;
  bench.frames.maxGapMs = Math.max(bench.frames.maxGapMs, Math.round(gap));
  if (gap > 50) bench.frames.gapsOver50++;
  if (gap > 100) bench.frames.gapsOver100++;
}, 16);

function legalOf(mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

function rng(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const T0 = performance.now();
  const ai = createAiPlayer({ ...AI_CONFIG, search, minDelayMs: 0 }, { mode });
  log(`mode ${ai.mode}, search ${search}`);
  const info = await ai.init((p) => {
    bench.progress.push({ ...p, t: Math.round(performance.now() - T0) });
    if (p.stage !== "model-download" || p.fraction === 1 || p.fraction === null) log(`progress ${p.stage} ${p.fraction}`);
  });
  bench.initMs = Math.round(performance.now() - T0);
  bench.info = info;
  log(`init ${bench.initMs} ms: ${JSON.stringify(info)}`);

  const E = await WasmEngine.load();
  bench.engineMatches = E.fingerprint === info.engineFingerprint;
  const AI = -1; // USSR
  E.newGame(seed);
  const seat = () => { E.seat(AI, info.obsFeatures); E.seat(-AI, E.currentRules); };
  seat();
  const moves: AiMove[] = [];
  let step = 0;
  const human = rng(seed ^ 0x5eed);
  const apply = (idx: number, record: boolean) => {
    const before = E.snapshot();
    const action = E.decodeFlat(idx);
    const why = E.step(action, 0);
    if (why) throw new Error(`step refused: ${why}`);
    step++;
    if (record) moves.push({ before, action });
  };
  /** Human + forced moves until the AI has a real choice; false at the game's end. */
  const toAiChoice = (): boolean => {
    for (let k = 0; k < 5000; k++) {
      if (E.isTerminal()) return false;
      const legal = legalOf(E.mask(false));
      if (legal.length === 1) { apply(legal[0], false); continue; }
      if (E.decisionPlayer() === AI) return true;
      apply(legal[Math.floor(human() * legal.length)], true);
    }
    throw new Error("no AI decision reached");
  };

  for (let i = 0; i < n && toAiChoice(); i++) {
    const d = E.display();
    const mask = E.mask(false);
    const c = await ai.choose({ state: E.snapshot(), seed: ((step + 1) * 1_000_003) >>> 0, moves });
    if (!mask[c.idx]) throw new Error(`illegal AI move ${c.idx}`);
    const row: DecisionRow = { n: i + 1, turn: d.turn, ar: d.action_round, legal: c.decision.legal, type: c.decision.decisionType,
      source: c.source, ms: c.ms, elapsedMs: c.elapsedMs, rows: c.decision.rows, beliefRows: c.decision.beliefRows };
    bench.decisions.push(row);
    log(`#${row.n} T${row.turn} AR${row.ar} legal ${row.legal} ${row.source} ${row.ms} ms (round trip ${row.elapsedMs} ms) rows ${row.rows} belief ${row.beliefRows}`);
    apply(c.idx, true);
  }

  if (doCancel && toAiChoice()) {
    const req = { state: E.snapshot(), seed: ((step + 1) * 1_000_003) >>> 0, moves };
    const t = performance.now();
    const pending = ai.choose(req);
    await new Promise((r) => setTimeout(r, 120));
    ai.cancel();
    let aborted = false;
    try { await pending; } catch (e) { aborted = isAbortError(e); }
    const abortAfterMs = Math.round(performance.now() - t);
    const c = await ai.choose(req);
    bench.cancel = { aborted, abortAfterMs, respawnElapsedMs: c.elapsedMs, respawnComputeMs: c.ms,
                     beliefReplayed: c.decision.beliefObserved, moves: moves.length };
    log(`cancel: aborted ${aborted} after ${abortAfterMs} ms; respawn + replay(${c.decision.beliefObserved}/${moves.length}) + search ${c.elapsedMs} ms (search ${c.ms} ms)`);
  }

  if (typeof caches !== "undefined") {
    for (const name of await caches.keys()) {
      for (const k of await (await caches.open(name)).keys()) bench.cacheKeys.push(`${name}: ${k.url}`);
    }
  }
  ai.dispose();
  bench.totalMs = Math.round(performance.now() - T0);
}

main().then(
  () => { clearInterval(ticker); bench.done = true; log(`done in ${bench.totalMs} ms`); },
  (e: unknown) => {
    clearInterval(ticker);
    bench.error = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    bench.done = true;
    log(`ERROR ${bench.error}`);
  },
);
