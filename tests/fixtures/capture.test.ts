/**
 * Records the UI fixtures in tests/fixtures/ui/ from real games: the real controller and engine, a
 * seeded random human and the seeded stub AI of tests/game/helpers.ts. Only what the UI receives is
 * written (redacted Frames, LogEntries, the ViewModel, previews). Deterministic: fixed seeds.
 *
 *   TSP_CAPTURE=1 npx vitest run tests/fixtures/capture.test.ts
 *
 * Skipped unless TSP_CAPTURE is set (the normal suite never rewrites fixtures). The format is
 * src/dev/fixtureFormat.ts; tests/ui/runner/fixtures.test.ts checks the files. The stub AI answers
 * at once and reports 1200 ms per decision (ViewModel.aiStats), so the output is reproducible.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CoupOdds, Ending, Frame, GameEvent, LogEntry, Prompt, RealignOdds, Side, ViewModel } from "../../src/game/contract";
import { TsGameController } from "../../src/game/controller";
import { MemoryStorage } from "../../src/game/persistence";
import { otherSide } from "../../src/game/rules";
import {
  encodeFrames, FIXTURE_VERSION, idRanges, type FixtureFile, type FixtureIndexRow, type FrameVm,
} from "../../src/dev/fixtureFormat";
import { loadEngine, mulberry32, StubAi, tick } from "../game/helpers";

const OUT_DIR = new URL("./ui/", import.meta.url);
const MAX_GAMES = 80;
const FIXED_NOW = 1_795_000_000_000;
/** Scenes keep the last LOG_KEEP log entries (the mid-game scene and full games keep all). */
const LOG_KEEP = 40;
const MAX_BYTES = 3_000_000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface PromptRec {
  /** Index (in GameRec.frames) of the frame on screen with the prompt. */
  frame: number;
  vm: ViewModel;
  coupOdds: Record<string, CoupOdds | null>;
  effectiveOps: Record<string, number | null>;
  realignOdds: Record<string, RealignOdds | null>;
  chosen?: number;
  /** What the choice did to influence (event-target prompts): add / remove / neither. */
  did?: "add" | "remove" | "target";
}

interface GameRec {
  game: number;
  seed: number;
  humanSide: Side;
  frames: Frame[];
  frameVm: FrameVm[];
  log: Map<number, LogEntry>;
  /** vm right after frame i was acked, when frame i was still current (no queued frame). */
  afterAck: Map<number, ViewModel>;
  prompts: PromptRec[];
  ending: Ending | null;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** A ViewModel copy with the wall-clock save time fixed (two hours before FIXED_NOW). */
function vmCopy(vm: ViewModel): ViewModel {
  const c = clone(vm);
  if (c.savedGame) c.savedGame = { ...c.savedGame, savedAt: FIXED_NOW - 7_200_000 };
  return c;
}

function influenceDid(frames: readonly Frame[]): "add" | "remove" | "target" {
  for (const f of frames) {
    for (const e of f.events) {
      if (e.t !== "influence") continue;
      return e.to > e.from ? "add" : "remove";
    }
  }
  return "target";
}

const FATAL = new Set(["defcon-suicide", "cmc-suicide", "game-ending"]);

interface Plan {
  /** Undo once at the first mid-run influence prompt after turn 1. */
  undoOnce?: boolean;
  /** Resign at the first action-card prompt of this turn. */
  resignAtTurn?: number;
}

function pick(p: Prompt, vm: ViewModel, rand: () => number): number {
  const defcon = vm.frame?.state.defcon ?? 5;
  let pool = p.options;
  if (rand() < 0.97) {
    const safe = pool.filter(o => !(o.warnings ?? []).some(w => FATAL.has(w.code) && !(w.code === "game-ending" && w.params?.winner === vm.humanSide)));
    if (safe.length) pool = safe;
  }
  if (defcon <= 2) {
    const noCoup = pool.filter(o => !((o.kind === "mode" && o.id === 3) || (o.kind === "op-mode" && o.id === 1)));
    if (noCoup.length) pool = noCoup;
  }
  // Events first now and then: they open the rarer prompts (branch, DEFCON level, region, cards).
  if (p.kind === "play-mode" && rand() < 0.45) {
    const ev = pool.filter(o => o.kind === "mode" && o.id === 0);
    if (ev.length) pool = ev;
  }
  if (pool.length > 1 && p.done && rand() < 0.75) pool = pool.filter(o => o.kind !== "done");
  return pool[Math.floor(rand() * pool.length)]!.idx;
}

/** The stub AI with a fixed "thinking time" per decision, so ViewModel.aiStats is reproducible. */
class CaptureAi extends StubAi {
  override async choose(req: Parameters<StubAi["choose"]>[0]): Promise<{ idx: number; ms: number }> {
    const r = await super.choose(req);
    return { idx: r.idx, ms: 1200 };
  }
}

async function playGame(game: number, engine: Awaited<ReturnType<typeof loadEngine>>, aiEngine: Awaited<ReturnType<typeof loadEngine>>, plan: Plan): Promise<GameRec> {
  const ai = new CaptureAi(game * 7919 + 1);
  ai.engine = aiEngine;
  const ctrl = new TsGameController({
    loadEngine: async () => engine, ai, storage: new MemoryStorage(), random: mulberry32(game + 17), minAiDelayMs: 0,
    sleep: async () => { /* no delay */ }, clock: { now: () => FIXED_NOW }, onError: () => { /* status error */ },
  });
  const seed = 100_000 + game;
  const humanSide: Side = game % 2 ? "US" : "USSR";
  await ctrl.boot();
  await ctrl.newGame({ side: humanSide, seed });
  const rec: GameRec = { game, seed, humanSide, frames: [], frameVm: [], log: new Map(), afterAck: new Map(), prompts: [], ending: null };
  const rand = mulberry32(game * 31 + 3);
  let lastSeq = 0;
  let lastPrompt = 0;
  let undone = !plan.undoOnce;
  const seen = (vm: ViewModel) => { for (const e of vm.log) if (!rec.log.has(e.id)) rec.log.set(e.id, clone(e)); };
  for (let it = 0, idle = 0; it < 3_000_000; it++) {
    let vm = ctrl.getSnapshot();
    if (vm.status === "error") throw new Error(`game ${game}: controller error ${vm.error}`);
    // Every frame, in order, acked as soon as it is recorded (what the UI does after animating it).
    while (vm.frame && vm.frame.seq > lastSeq) {
      const f = vm.frame;
      lastSeq = f.seq;
      seen(vm);
      rec.frames.push(clone(f));
      rec.frameVm.push({ log: idRanges(vm.log.map(e => e.id)), queued: vm.queued, status: vm.status });
      ctrl.ackFrame(f.seq);
      vm = ctrl.getSnapshot();
      if (vm.frame?.seq === f.seq) rec.afterAck.set(rec.frames.length - 1, vmCopy({ ...vm, frame: null, log: [] }));
    }
    if (vm.status === "over") { rec.ending = clone(vm.ending); break; }
    const p = vm.prompt;
    if (!p || p.promptId === lastPrompt) {
      if (++idle > 200_000) throw new Error(`game ${game} stalled`);
      await tick();
      continue;
    }
    idle = 0;
    lastPrompt = p.promptId;
    seen(vm);
    const pr: PromptRec = { frame: rec.frames.length - 1, vm: vmCopy(vm), coupOdds: {}, effectiveOps: {}, realignOdds: {} };
    for (const c of p.countries) {
      const odds = ctrl.coupOdds(c);
      if (odds) pr.coupOdds[c] = clone(odds);
      const r = ctrl.realignOdds?.(c);
      if (r) pr.realignOdds[c] = clone(r);
    }
    for (const card of new Set([...p.cards, p.pendingCard].filter(Boolean))) {
      const ops = ctrl.effectiveOps(card);
      if (ops !== null) pr.effectiveOps[card] = ops;
    }
    rec.prompts.push(pr);
    const turn = vm.frame?.state.turn ?? 1;
    if (plan.resignAtTurn && turn >= plan.resignAtTurn && p.kind === "action-card") {
      ctrl.resign();
      continue;
    }
    if (!undone && vm.canUndo && p.kind === "influence" && turn > 1 && p.remaining < p.opsValue) {
      undone = true;
      ctrl.undo();
      continue;
    }
    const idx = pick(p, vm, rand);
    pr.chosen = idx;
    ctrl.choose(p.promptId, idx);
    // The step's frames are released at once (nothing queued while a prompt is open).
    const after = ctrl.getSnapshot();
    if (p.kind === "event-target" && after.frame && after.frame.seq > lastSeq) pr.did = influenceDid([after.frame]);
  }
  return rec;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────────────────────────────

const EVENT_TYPES: GameEvent["t"][] = [
  "turn-start", "phase", "action-round", "deal", "reshuffle", "hand-revealed", "card-played", "card-moved", "headline-chosen",
  "headline-reveal", "influence", "control", "roll", "vp", "defcon", "milops", "space", "scoring", "effect-on", "effect-off",
  "china-card", "game-over",
];
const HOWS = ["event", "space", "influence", "coup", "realign", "headline", "scoring", "discard", "give", "pass"] as const;

function eventTags(frames: readonly Frame[]): string[] {
  const tags = new Set<string>();
  for (const f of frames) {
    for (const e of f.events) {
      tags.add(`event:${e.t}`);
      if (e.t === "card-played") tags.add(`how:${e.how}`);
      if (e.t === "game-over") tags.add(`ending:${e.ending.reason}`);
      if (e.t === "phase") tags.add(`phase:${e.phase}`);
    }
    if (f.auto) tags.add("auto");
    if (f.actor === null) tags.add("actor:none");
  }
  return [...tags].sort();
}

function logOf(g: GameRec, ranges: readonly [number, number][], keep = Infinity): { log: LogEntry[]; ranges: [number, number][] } {
  const ids: number[] = [];
  for (const [a, b] of ranges) for (let i = a; i <= b; i++) ids.push(i);
  const kept = ids.slice(Math.max(0, ids.length - keep));
  return { log: kept.map(id => g.log.get(id)!).filter(Boolean), ranges: idRanges(kept) };
}

function finalVm(vm: ViewModel): FixtureFile["final"] {
  const { frame: _f, log: _l, queued: _q, ...rest } = vm;
  void _f; void _l; void _q;
  return rest;
}

function sceneFile(g: GameRec, pr: PromptRec, name: string, description: string, opts: { fullLog?: boolean; tags?: string[] } = {}): FixtureFile {
  const frame = g.frames[pr.frame]!;
  const fv = g.frameVm[pr.frame]!;
  const { log, ranges } = logOf(g, idRanges(pr.vm.log.map(e => e.id)), opts.fullLog ? Infinity : LOG_KEEP);
  const p = pr.vm.prompt!;
  const tags = [
    `prompt:${p.kind}`, `human:${g.humanSide}`, `turn:${frame.state.turn}`, ...(opts.tags ?? []),
    ...(p.cards.includes(6) ? ["china-offered"] : []),
    ...p.options.flatMap(o => (o.warnings ?? []).map(w => `warning:${w.code}`)),
  ];
  const file: FixtureFile = {
    v: FIXTURE_VERSION, name, kind: "scene", description, tags: [...new Set(tags)].sort(), humanSide: g.humanSide,
    source: { game: g.game, seed: g.seed, seqs: [frame.seq, frame.seq] },
    frames: encodeFrames([frame]), frameVm: [{ ...fv, log: ranges }], log, final: finalVm(pr.vm),
  };
  const previews: NonNullable<FixtureFile["previews"]> = {};
  if (Object.keys(pr.coupOdds).length) previews.coupOdds = pr.coupOdds;
  if (Object.keys(pr.effectiveOps).length) previews.effectiveOps = pr.effectiveOps;
  if (Object.keys(pr.realignOdds).length) previews.realignOdds = pr.realignOdds;
  if (Object.keys(previews).length) file.previews = previews;
  if (pr.chosen !== undefined) file.chosen = pr.chosen;
  return file;
}

/** Frames a..b of a game: a = the base (on screen before), a+1..b animate. */
function sequenceFile(g: GameRec, a: number, b: number, name: string, description: string, opts: { fullLog?: boolean } = {}): FixtureFile {
  const frames = g.frames.slice(a, b + 1);
  const pr = g.prompts.find(p => p.frame === b);
  const after = g.afterAck.get(b);
  const vm: ViewModel = pr?.vm ?? after ?? {
    status: g.frameVm[b]!.status, humanSide: g.humanSide, frame: null, queued: 0, prompt: null, aiThinking: false,
    canUndo: false, log: [], ending: g.frameVm[b]!.status === "over" ? g.ending : null, hasSavedGame: false,
  };
  // Every frame's log; old entries trimmed to what the window needs plus LOG_KEEP of history.
  const firstIds = g.frameVm[a]!.log;
  const keepFrom = opts.fullLog ? -Infinity : (() => {
    const ids: number[] = [];
    for (const [x, y] of firstIds) for (let i = x; i <= y; i++) ids.push(i);
    return ids[Math.max(0, ids.length - LOG_KEEP)] ?? 0;
  })();
  const frameVm: FrameVm[] = g.frameVm.slice(a, b + 1).map(fv => {
    const ids: number[] = [];
    for (const [x, y] of fv.log) for (let i = x; i <= y; i++) if (i >= keepFrom) ids.push(i);
    return { ...fv, log: idRanges(ids) };
  });
  const allIds = new Set<number>();
  for (const fv of frameVm) for (const [x, y] of fv.log) for (let i = x; i <= y; i++) allIds.add(i);
  const log = [...allIds].sort((x, y) => x - y).map(id => g.log.get(id)!).filter(Boolean);
  const tags = [
    `human:${g.humanSide}`, `turn:${frames[0]!.state.turn}`, ...eventTags(frames.slice(1)),
    ...(vm.prompt ? [`prompt:${vm.prompt.kind}`] : []),
  ];
  const file: FixtureFile = {
    v: FIXTURE_VERSION, name, kind: "sequence", description, tags: [...new Set(tags)].sort(), humanSide: g.humanSide,
    source: { game: g.game, seed: g.seed, seqs: [frames[0]!.seq, frames[frames.length - 1]!.seq] },
    frames: encodeFrames(frames), frameVm, log, final: finalVm(vm),
  };
  if (pr) {
    const previews: NonNullable<FixtureFile["previews"]> = {};
    if (Object.keys(pr.coupOdds).length) previews.coupOdds = pr.coupOdds;
    if (Object.keys(pr.effectiveOps).length) previews.effectiveOps = pr.effectiveOps;
    if (Object.keys(pr.realignOdds).length) previews.realignOdds = pr.realignOdds;
    if (Object.keys(previews).length) file.previews = previews;
  }
  return file;
}

const has = (f: Frame, pred: (e: GameEvent) => boolean) => f.events.some(pred);

/** The index of the first prompt whose frame is ≥ i, or the game's last frame. */
function nextPromptFrame(g: GameRec, i: number): number {
  return g.prompts.find(p => p.frame >= i)?.frame ?? g.frames.length - 1;
}

interface SceneWant {
  name: string;
  description: string;
  pick: (pr: PromptRec, g: GameRec) => number | false;
  fullLog?: boolean;
}

const turnOf = (pr: PromptRec) => pr.vm.frame?.state.turn ?? 1;
const kindIs = (pr: PromptRec, k: Prompt["kind"]) => pr.vm.prompt?.kind === k;
/** Score helper: prefer later turns up to `t`. */
const upTo = (pr: PromptRec, t: number) => Math.min(turnOf(pr), t);

const SCENES: SceneWant[] = [
  { name: "prompt-setup-place-ussr", description: "Setup: the USSR (you) places 6 influence in Eastern Europe; 2 placed already.",
    pick: pr => kindIs(pr, "setup-place") && pr.vm.humanSide === "USSR" && pr.vm.prompt!.remaining === 4 ? 1 : false },
  { name: "prompt-setup-place-us", description: "Setup: the US (you) places 7 influence in Western Europe, after the USSR's setup.",
    pick: pr => kindIs(pr, "setup-place") && pr.vm.humanSide === "US" && pr.vm.prompt!.remaining === 7 ? 1 : false },
  { name: "prompt-bid-place", description: "The US bid: +2 influence where the US already has influence.",
    pick: pr => kindIs(pr, "bid-place") ? 1 : false },
  { name: "prompt-headline-t1", description: "Turn 1 headline: choose a card from the opening hand.",
    pick: pr => kindIs(pr, "headline") && turnOf(pr) === 1 ? 1 : false },
  { name: "prompt-headline", description: "A later headline (turn 4+: Mid War cards in hand).",
    pick: pr => kindIs(pr, "headline") && turnOf(pr) >= 4 ? 10 - turnOf(pr) : false },
  { name: "prompt-action-card", description: "Choose the card for an action round (turn 2+).",
    pick: pr => kindIs(pr, "action-card") && turnOf(pr) >= 2 && !pr.vm.prompt!.cards.includes(6) ? upTo(pr, 3) : false },
  { name: "prompt-action-card-china", description: "Choose a card while holding the playable China Card.",
    pick: pr => kindIs(pr, "action-card") && pr.vm.prompt!.cards.includes(6) ? upTo(pr, 3) : false },
  { name: "prompt-action-card-warning", description: "Choose a card where some options carry warnings (scoring stranded / opponent event).",
    pick: pr => kindIs(pr, "action-card") && pr.vm.prompt!.options.some(o => o.warnings?.some(w => w.code === "scoring-stranded")) ? 1 : false },
  { name: "prompt-play-mode", description: "How to play your own card: Event / Space / Influence / Coup / Realign.",
    pick: pr => kindIs(pr, "play-mode") && !pr.vm.prompt!.options.some(o => o.warnings?.length) ? upTo(pr, 3) : false },
  { name: "prompt-play-mode-opponent", description: "How to play an opponent's card (its event fires for the opponent if played for Ops).",
    pick: pr => kindIs(pr, "play-mode") && pr.vm.prompt!.options.some(o => o.warnings?.some(w => w.code === "opponent-event")) ? upTo(pr, 3) : false },
  { name: "prompt-op-mode", description: "Deferred Ops: Influence / Coup / Realign.",
    pick: pr => kindIs(pr, "op-mode") ? 1 : false },
  { name: "prompt-influence", description: "Placing Ops influence mid-run (some points placed already), turn 2+.",
    pick: pr => kindIs(pr, "influence") && turnOf(pr) >= 2 && pr.vm.prompt!.remaining < pr.vm.prompt!.opsValue
      ? upTo(pr, 4) + (pr.vm.prompt!.options.some(o => o.cost === 2) ? 5 : 0) : false },
  { name: "prompt-influence-start", description: "Placing Ops influence: the first point of the run.",
    pick: pr => kindIs(pr, "influence") && turnOf(pr) >= 2 && pr.vm.prompt!.remaining === pr.vm.prompt!.opsValue && pr.vm.prompt!.opsValue >= 3 ? upTo(pr, 4) : false },
  { name: "prompt-coup-target", description: "Pick the coup target (coup odds per target in previews).",
    pick: pr => kindIs(pr, "coup-target") ? upTo(pr, 4) + (pr.vm.prompt!.options.some(o => o.warnings?.length) ? 3 : 0) : false },
  { name: "prompt-realign-target", description: "Pick a realignment target (one roll per click).",
    pick: pr => kindIs(pr, "realign-target") ? upTo(pr, 4) : false },
  { name: "prompt-event-target-add", description: "An event places influence (a click adds a point).",
    pick: pr => kindIs(pr, "event-target") && (pr.vm.prompt!.effect?.verb ?? pr.did) === "add" ? upTo(pr, 4) : false },
  { name: "prompt-event-target-remove", description: "An event removes influence (a click removes a point).",
    pick: pr => kindIs(pr, "event-target") && (pr.vm.prompt!.effect?.verb ?? pr.did) === "remove" ? upTo(pr, 4) : false },
  { name: "prompt-event-target-other", description: "An event targets a country without placing or removing (e.g. an event coup).",
    pick: pr => kindIs(pr, "event-target") && (pr.vm.prompt!.effect?.verb ?? pr.did) === "target" ? upTo(pr, 4) : false },
  { name: "prompt-event-card", description: "An event asks for a card (discard, give, retrieve...).",
    pick: pr => kindIs(pr, "event-card") ? upTo(pr, 4) : false },
  { name: "prompt-branch", description: "An event branch choice (Warsaw Pact, Olympic Games, Wargames...).",
    pick: pr => kindIs(pr, "branch") ? 1 : false },
  { name: "prompt-defcon-level", description: "Choose a DEFCON level (Summit / How I Learned to Stop Worrying).",
    pick: pr => kindIs(pr, "defcon-level") ? 1 : false },
  { name: "prompt-region", description: "Chernobyl: choose a region.",
    pick: pr => kindIs(pr, "region") ? 1 : false },
  { name: "prompt-action-card-us", description: "Choose the card for an action round, you are the US (turn 3+).",
    pick: pr => kindIs(pr, "action-card") && pr.vm.humanSide === "US" && turnOf(pr) >= 3 ? upTo(pr, 5) : false },
  { name: "prompt-influence-us", description: "Placing Ops influence mid-run, you are the US.",
    pick: pr => kindIs(pr, "influence") && pr.vm.humanSide === "US" && turnOf(pr) >= 2 && pr.vm.prompt!.remaining < pr.vm.prompt!.opsValue ? upTo(pr, 5) : false },
  { name: "prompt-coup-target-us", description: "Pick the coup target, you are the US (coup odds in previews).",
    pick: pr => kindIs(pr, "coup-target") && pr.vm.humanSide === "US" ? upTo(pr, 5) : false },
  { name: "prompt-midgame", description: "Mid-game board (turn 5-7) at an action-card prompt, with the whole log.", fullLog: true,
    pick: pr => kindIs(pr, "action-card") && turnOf(pr) >= 5 && turnOf(pr) <= 7 ? 10 - Math.abs(turnOf(pr) - 6) : false },
];

describe.skipIf(!process.env.TSP_CAPTURE)("capture UI fixtures", () => {
  it("plays seeded games and writes tests/fixtures/ui", async () => {
    const engine = await loadEngine();
    const aiEngine = await loadEngine();
    const games: GameRec[] = [];
    const sceneBest = new Map<string, { g: GameRec; pr: PromptRec; score: number }>();
    const endings = new Map<string, GameRec>();
    for (let game = 0; game < MAX_GAMES; game++) {
      const plan: Plan = { undoOnce: game === 0, resignAtTurn: game === 3 ? 2 : undefined };
      const g = await playGame(game, engine, aiEngine, plan);
      games.push(g);
      for (const pr of g.prompts) {
        for (const w of SCENES) {
          const s = w.pick(pr, g);
          if (s === false) continue;
          const cur = sceneBest.get(w.name);
          if (!cur || s > cur.score) sceneBest.set(w.name, { g, pr, score: s });
        }
      }
      if (g.ending && !endings.has(g.ending.reason)) endings.set(g.ending.reason, g);
      const missing = SCENES.filter(w => !sceneBest.has(w.name)).map(w => w.name);
      const longest = Math.max(...games.map(x => x.frames[x.frames.length - 1]!.state.turn));
      if (game >= 12 && missing.length === 0 && endings.size >= 5 && longest >= 8) break;
    }
    // Free memory of games no fixture uses later is not needed: a game is a few MB at most.

    const files: FixtureFile[] = [];
    // Scenes.
    for (const w of SCENES) {
      const best = sceneBest.get(w.name);
      if (!best) { console.warn(`no prompt for scene ${w.name}`); continue; }
      files.push(sceneFile(best.g, best.pr, w.name, w.description, { fullLog: w.fullLog }));
    }

    // Sequences.
    const covered = new Set<string>();
    const addSeq = (g: GameRec, a: number, b: number, name: string, description: string, opts: { fullLog?: boolean } = {}) => {
      const f = sequenceFile(g, Math.max(0, a), b, name, description, opts);
      files.push(f);
      for (const t of f.tags) covered.add(t);
    };
    const ussr = games.find(g => g.humanSide === "USSR")!;
    const us = games.find(g => g.humanSide === "US")!;
    for (const g of [ussr, us]) {
      const hl = g.prompts.find(p => kindIs(p, "headline"))!;
      addSeq(g, 0, hl.frame, `seq-opening-${g.humanSide.toLowerCase()}`,
        `Game start to the first headline prompt, you are the ${g.humanSide}: setup placements of both sides and the US bid.`);
    }
    // Headline: from the human's headline prompt to the first action-card prompt after the reveal.
    {
      const g = ussr;
      const hl = g.prompts.find(p => kindIs(p, "headline"))!;
      const ar = g.prompts.find(p => p.frame > hl.frame && kindIs(p, "action-card"))!;
      const reveal = g.frames.findIndex((f, i) => i > hl.frame && has(f, e => e.t === "headline-reveal"));
      const end = g.prompts.find(p => p.frame >= reveal && g.frames.slice(reveal, p.frame + 1).some(f => has(f, e => e.t === "action-round")))?.frame ?? ar.frame;
      addSeq(g, hl.frame, end, "seq-headline", "Turn 1 headline: both choose, the papers reveal, both events resolve, AR 1 begins.");
    }
    // AI action rounds.
    const aiRounds: { g: GameRec; a: number; b: number; how: string; turn: number }[] = [];
    for (const g of games.slice(0, 20)) {
      const ai = otherSide(g.humanSide);
      g.frames.forEach((f, i) => {
        if (!has(f, e => e.t === "action-round" && e.side === ai)) return;
        const b = nextPromptFrame(g, i + 1);
        if (b <= i || b - i > 14) return;
        const play = g.frames.slice(i + 1, b + 1).flatMap(x => x.events).find(e => e.t === "card-played" && e.side === ai);
        if (play && play.t === "card-played") aiRounds.push({ g, a: i, b, how: play.how, turn: f.state.turn });
      });
    }
    const aiPick = (how: string, minTurn = 2) => aiRounds.filter(r => r.how === how && r.turn >= minTurn).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    const aiInf = aiPick("influence");
    if (aiInf) addSeq(aiInf.g, aiInf.a, aiInf.b, "seq-ai-turn", "An AI action round: the AI plays a card for influence, then your next prompt.");
    const aiCoup = aiPick("coup");
    if (aiCoup) addSeq(aiCoup.g, aiCoup.a, aiCoup.b, "seq-ai-coup", "An AI action round: the AI coups (die roll), then your next prompt.");
    const aiEvent = aiPick("event");
    if (aiEvent) addSeq(aiEvent.g, aiEvent.a, aiEvent.b, "seq-ai-event", "An AI action round: the AI plays a card for its event, then your next prompt.");
    // The end of a turn: into turn 4 if possible (Mid War: new cards, era stamp).
    {
      const cands = games.slice(0, 20).flatMap(g => g.frames.map((f, i) => ({ g, f, i })).filter(x => has(x.f, e => e.t === "turn-start")));
      const t4 = cands.find(x => has(x.f, e => e.t === "turn-start" && e.turn === 4)) ?? cands[0]!;
      addSeq(t4.g, t4.i - 1, nextPromptFrame(t4.g, t4.i), "seq-turn-end", `The end of turn ${t4.f.state.turn - 1}: mil-ops, turn start, the deal, the next headline.`);
    }
    // Undo (game 0).
    {
      const g = games[0]!;
      const i = g.frames.findIndex((f, k) => k > 0 && f.actor === null && has(f, e => e.t === "influence") && !has(f, e => e.t === "turn-start"));
      if (i > 0) {
        let a = i - 1;
        while (a > 0 && g.frames[a]!.actor === g.humanSide && g.frames[a - 1]!.actor === g.humanSide) a--;
        addSeq(g, Math.max(0, a - 1), nextPromptFrame(g, i), "seq-undo", "You place influence, then undo the play: the undo frame takes the points back.");
      }
    }
    // A scoring card that scores: the first scoring-card play with a non-zero net (the scoring sheet with a result),
    // always written under this name (the generic "event:scoring" window below may find a net-0 play first).
    {
      const scores = (f: Frame) => f.events.some(e => e.t === "card-played" && ["scoring", "headline", "event"].includes(e.how)
        && f.events.some(x => x.t === "scoring" && x.card === e.card && x.vp !== 0));
      let found: { g: GameRec; i: number } | null = null;
      for (const g of games) {
        const i = g.frames.findIndex((f, k) => k > 0 && scores(f));
        if (i > 0) { found = { g, i }; break; }
      }
      if (!found) console.warn("no scoring-card play with a non-zero net");
      else {
        const { g, i } = found;
        let a = i - 1;
        while (a > 0 && i - a < 6 && !has(g.frames[a]!, e => e.t === "action-round" || e.t === "turn-start" || e.t === "phase")) a--;
        const b = Math.min(nextPromptFrame(g, i), i + 8);
        const sc = g.frames[i]!.events.find(e => e.t === "scoring" && e.vp !== 0);
        addSeq(g, a, b, "seq-event-scoring", `A scoring card played with a non-zero net (${sc && sc.t === "scoring" ? `card ${sc.card}, ${sc.vp > 0 ? "+" : ""}${sc.vp} VP` : ""}, turn ${g.frames[i]!.state.turn}).`);
      }
    }
    // Every GameEvent type and every PlayHow, by the shortest window around its first occurrence (turn ≥ 2 first).
    const wantTags = [...EVENT_TYPES.map(t => `event:${t}`), ...HOWS.map(h => `how:${h}`)];
    for (const tag of wantTags) {
      if (covered.has(tag) || tag === "event:game-over") continue;
      const [kind, val] = tag.split(":") as [string, string];
      const match = (f: Frame) => kind === "event" ? has(f, e => e.t === val) : has(f, e => e.t === "card-played" && e.how === val);
      let found: { g: GameRec; i: number } | null = null;
      for (const pass of [2, 1]) {
        for (const g of games) {
          const i = g.frames.findIndex((f, k) => k > 0 && f.state.turn >= pass && match(f));
          if (i > 0) { found = { g, i }; break; }
        }
        if (found) break;
      }
      if (!found) { console.warn(`no frame with ${tag}`); continue; }
      const { g, i } = found;
      // Back to the start of the play (the AR / headline / turn boundary), forward to the next prompt.
      let a = i - 1;
      while (a > 0 && i - a < 6 && !has(g.frames[a]!, e => e.t === "action-round" || e.t === "turn-start" || e.t === "phase")) a--;
      const b = Math.min(nextPromptFrame(g, i), i + 8);
      addSeq(g, a, b, `seq-${kind === "event" ? "event" : "play"}-${val}`, `Frames around the first ${kind === "event" ? `"${val}" event` : `card played as "${val}"`} (turn ${g.frames[i]!.state.turn}).`);
    }
    // Endings: the last frames of one game per reason.
    for (const [reason, g] of [...endings].sort()) {
      const last = g.frames.length - 1;
      addSeq(g, Math.max(0, last - 4), last, `seq-over-${reason}`, `The last frames of a game that ends by "${reason}" (turn ${g.ending!.turn}, ${g.ending!.winner}).`);
    }
    // One whole game: the longest that ends after turn 7.
    {
      const g = [...games].sort((x, y) => y.frames.length - x.frames.length).find(x => x.frames.length < 700)!;
      addSeq(g, 0, g.frames.length - 1, "game-full", `A whole game, you are the ${g.humanSide}: ${g.frames.length} frames, ending "${g.ending?.reason}" in turn ${g.ending?.turn}.`, { fullLog: true });
    }

    // Write.
    const dir = OUT_DIR.pathname;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith(".json")) rmSync(dir + f);
    const index: FixtureIndexRow[] = [];
    let total = 0;
    for (const f of files) {
      const text = JSON.stringify(f);
      total += text.length;
      writeFileSync(`${dir}${f.name}.json`, text);
      index.push({ name: f.name, kind: f.kind, description: f.description, tags: f.tags, frames: f.frames.length, bytes: text.length });
    }
    writeFileSync(`${dir}index.json`, JSON.stringify(index, null, 1));
    const missingTypes = wantTags.filter(t => !covered.has(t) && !index.some(r => r.tags.includes(t)));
    console.log(`games ${games.length}; fixtures ${files.length}; ${(total / 1e6).toFixed(2)} MB; endings ${[...endings.keys()].join(", ")}; not covered: ${missingTypes.join(", ") || "none"}`);
    for (const r of index) console.log(`${r.name.padEnd(30)} ${String(r.frames).padStart(4)} frames ${String(Math.round(r.bytes / 1024)).padStart(5)} KB`);
    expect(total).toBeLessThan(MAX_BYTES);
  }, 900_000);
});
