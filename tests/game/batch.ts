/**
 * Full games through the controller, as a scripted random human against the stub AI, with every
 * check of helpers.ts `drive` plus: the AI protocol (seed, belief move list), the previews leaving
 * the engine untouched, the ending classification against a counterfactual replay, and save/resume
 * reproducing the same engine save and log. Several test files run batches in parallel.
 */
import { expect } from "vitest";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import type { Ending, Prompt, Side, ViewModel } from "../../src/game/contract";
import { fromSavedStep, readSave, type SavedGame } from "../../src/game/persistence";
import { classifyEnding, forcedEventTarget, isScoringCard, otherSide, playerOf } from "../../src/game/rules";
import { renderEnglish } from "../../src/i18n";
import { drive, emptyChecks, loadEngine, makeController, mulberry32, type ChoiceChecks, type GameRecord, type Harness, StubAi } from "./helpers";

export interface Coverage {
  games: number;
  steps: number;
  prompts: number;
  undos: number;
  resumes: number;
  promptKinds: Map<string, number>;
  humanResolving: Map<number, number>;
  aiResolving: Map<number, number>;
  warnings: Map<string, number>;
  titles: Map<string, number>;
  optionKinds: Map<string, number>;
  endings: Map<string, number>;
  anomalies: number;
  coupOddsChecked: number;
  effectiveOpsChecked: number;
  realignOddsChecked: number;
  endingsVerified: number;
  checks: ChoiceChecks;
  /** Prompt build times (build + previews), ms, by kind: count, total, max, and the slowest prompt's size. */
  builds: Map<string, { n: number; total: number; max: number; maxOptions: number }>;
}

export function emptyCoverage(): Coverage {
  return {
    games: 0, steps: 0, prompts: 0, undos: 0, resumes: 0, promptKinds: new Map(), humanResolving: new Map(), aiResolving: new Map(),
    warnings: new Map(), titles: new Map(), optionKinds: new Map(), endings: new Map(), anomalies: 0, coupOddsChecked: 0, effectiveOpsChecked: 0,
    realignOddsChecked: 0, endingsVerified: 0, checks: emptyChecks(), builds: new Map(),
  };
}

function add<K>(m: Map<K, number>, k: K, n = 1): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

function merge(cov: Coverage, rec: GameRecord): void {
  cov.games++;
  cov.steps += rec.steps;
  cov.prompts += rec.prompts;
  cov.undos += rec.undos;
  for (const [k, v] of rec.promptKinds) add(cov.promptKinds, k, v);
  for (const [k, v] of rec.humanResolving) add(cov.humanResolving, k, v);
  for (const [k, v] of rec.warnings) add(cov.warnings, k, v);
  for (const [k, v] of rec.titles) add(cov.titles, k, v);
  for (const [k, v] of rec.optionKinds) add(cov.optionKinds, k, v);
  if (rec.ending) add(cov.endings, rec.ending.reason);
  const c = cov.checks;
  const r = rec.checks;
  c.endsPlay += r.endsPlay; c.ended += r.ended; c.endsPlayOther += r.endsPlayOther; c.cost += r.cost; c.realign += r.realign;
  c.playFrames += r.playFrames; c.plays += r.plays; c.aiStats += r.aiStats; c.savedGame += r.savedGame;
  c.handFrames += r.handFrames; c.dealt.US += r.dealt.US; c.dealt.USSR += r.dealt.USSR; c.gained += r.gained; c.reshuffles += r.reshuffles;
  c.scorings += r.scorings; c.zeroScorings += r.zeroScorings; c.fromHandMarks += r.fromHandMarks;
  for (const [k, v] of r.fromHandCauses) add(c.fromHandCauses, k, v);
  for (const [k, v] of r.effects) add(c.effects, k, v);
}

function mergeBuilds(cov: Coverage, h: Harness): void {
  for (const b of h.builds) {
    const g = cov.builds.get(b.kind) ?? { n: 0, total: 0, max: 0, maxOptions: 0 };
    g.n++;
    g.total += b.ms;
    if (b.ms > g.max) { g.max = b.ms; g.maxOptions = b.options; }
    cov.builds.set(b.kind, g);
  }
  h.builds.length = 0;
}

/** Checks of the AI protocol at every request: deterministic seed, belief-ready move list. */
function watchAi(h: Harness, ai: StubAi, check: WasmEngine, cov: Coverage, problems: string[]): void {
  ai.onRequest = req => {
    const actors = h.ctrl.stepActors();
    const expectSeed = ((actors.length + 1) * 1_000_003) >>> 0;
    if (req.seed !== expectSeed) problems.push(`AI seed ${req.seed} != ${expectSeed}`);
    const manual = actors.filter(s => !s.auto).length;
    if (req.moves.length !== manual) problems.push(`AI moves ${req.moves.length} != non-auto steps ${manual}`);
    // Each move is exactly decodeFlat of a legal index at its position (critique 3.3).
    const last = req.moves[req.moves.length - 1];
    for (const m of last ? [last] : []) {
      check.restore(m.before);
      const mask = check.mask(false);
      let found = false;
      for (let i = 0; i < check.layout.size && !found; i++) {
        if (!mask[i]) continue;
        const d = check.decodeFlat(i);
        found = d.decision_type === m.action.decision_type && d.primary_id === m.action.primary_id
          && d.secondary_id === (m.action.secondary_id ?? 0) && d.flags === (m.action.flags ?? 0);
      }
      if (!found) problems.push(`AI move ${JSON.stringify(m.action)} is not a decoded legal action`);
    }
    // The AI is never asked at a forced decision.
    check.restore(req.state);
    const d = check.display();
    const mask = check.mask(false);
    if (forcedEventTarget(d, mask, null) >= 0 && d.decision_context.resolving_card !== 28) problems.push("AI asked at a forced event target");
    add(cov.aiResolving, d.decision_context.resolving_card);
  };
}

/** At a prompt: the previews answer and leave the engine exactly as it was. */
function checkPreviews(h: Harness, p: Prompt, cov: Coverage, problems: string[]): void {
  const E = h.engine();
  const save0 = E.saveJson();
  if (p.kind === "coup-target") {
    for (const c of p.countries.slice(0, 3)) {
      const odds = h.ctrl.coupOdds(c);
      if (!odds || odds.faces.length !== 6) problems.push(`coupOdds(${c}) gave ${JSON.stringify(odds)}`);
      cov.coupOddsChecked++;
    }
    if (h.ctrl.effectiveOps(p.cards[0] ?? 6) !== null) problems.push("effectiveOps answered at a coup prompt");
  } else if (p.kind === "action-card") {
    for (const c of p.cards.slice(0, 3)) {
      const ops = h.ctrl.effectiveOps(c);
      if (ops !== null && (ops < 1 || ops > 5)) problems.push(`effectiveOps(${c}) = ${ops}`);
      cov.effectiveOpsChecked++;
    }
    if (h.ctrl.coupOdds(p.countries[0] ?? 0) !== null) problems.push("coupOdds answered at an action-card prompt");
  } else if (p.kind === "play-mode") {
    const ops = h.ctrl.effectiveOps(p.pendingCard);
    if (ops !== null && (ops < 1 || ops > 5)) problems.push(`effectiveOps(${p.pendingCard}) = ${ops}`);
    cov.effectiveOpsChecked++;
  } else if (p.kind === "realign-target") {
    for (const c of p.countries.slice(0, 3)) {
      const odds = h.ctrl.realignOdds(c);
      const sum = odds?.outcomes.reduce((s, o) => s + o.p, 0) ?? 0;
      if (!odds || Math.abs(sum - 1) > 1e-9 || odds.outcomes.some(o => o.p <= 0 || (o.side === "NONE") !== (o.amount === 0))) {
        problems.push(`realignOdds(${c}) gave ${JSON.stringify(odds)}`);
      }
      cov.realignOddsChecked++;
    }
  }
  if (p.kind !== "realign-target" && p.kind !== "event-target" && h.ctrl.realignOdds(p.countries[0] ?? 0) !== null) {
    problems.push(`realignOdds answered at a ${p.kind} prompt`);
  }
  if (E.saveJson() !== save0) problems.push(`previews changed the position at prompt ${p.promptId} (${p.kind})`);
}

/**
 * The ending, rebuilt from the save on a fresh engine: the controller's classification matches a
 * fresh classification of the last step, and a counterfactual -- the same last step with every held
 * scoring card discarded first -- confirms whether a held scoring card decided the game.
 */
function verifyEnding(save: SavedGame, ending: Ending, E: WasmEngine, problems: string[]): void {
  if (ending.reason === "resign") return;
  const human = save.humanSide;
  const replayTo = (n: number) => {
    E.newGame(save.seed);
    E.seat(playerOf(otherSide(human)), 12);
    E.seat(playerOf(human), E.currentRules);
    for (let i = 0; i < n; i++) {
      const why = E.step(fromSavedStep(save.steps[i]), 0);
      if (why) throw new Error(`replay refused step ${i}: ${why}`);
    }
  };
  const n = save.steps.length;
  replayTo(n - 1);
  const snap = E.snapshot();
  const before = E.display();
  const last = fromSavedStep(save.steps[n - 1]);
  E.step(last, 0);
  if (!E.isTerminal()) { problems.push("the save's last step does not end the game"); return; }
  const fresh = classifyEnding(before, E.settledDisplay(), E.display(), E.endingReason());
  if (fresh.reason !== ending.reason || fresh.winner !== ending.winner) problems.push(`ending ${ending.reason}/${ending.winner} != fresh ${fresh.reason}/${fresh.winner}`);
  const after = E.display();
  const held = [...after.hands.US, ...after.hands.USSR].filter(isScoringCard);
  if (held.length === 0) {
    if (ending.reason === "held-scoring" || ending.reason === "held-scoring-both") problems.push("held-scoring ending with no held scoring card");
    return;
  }
  // Counterfactual: discard the held scoring cards before the last step.
  E.restore(snap);
  for (const c of held) E.setCardLocation(c, 6);
  const why = E.step(last, 0);
  if (why) return; // the step needed one of those cards: no counterfactual
  const cfTerminal = E.isTerminal();
  const cf = cfTerminal ? classifyEnding(before, E.settledDisplay(), E.display(), E.endingReason()) : null;
  if (ending.reason === "held-scoring" || ending.reason === "held-scoring-both") {
    // Without the held cards the game goes on (or, after turn 10, ends by final scoring).
    if (cf && cf.reason !== "final-scoring") problems.push(`counterfactual still ends (${cf.reason})`);
  } else if (!cf || cf.winner !== ending.winner) {
    problems.push(`${ending.reason}: without the held scoring cards the game would not end the same way (${JSON.stringify(cf)})`);
  }
}

export interface BatchOptions {
  batch: number;
  games: number;
  /** Every n-th game is saved mid-game and resumed on a fresh controller. */
  resumeEvery?: number;
}

/** Plays `games` full games; returns the merged coverage. Asserts everything. */
export async function runBatch(opts: BatchOptions): Promise<Coverage> {
  const cov = emptyCoverage();
  const engine = await loadEngine();
  const check = await loadEngine();
  for (let g = 0; g < opts.games; g++) {
    const id = opts.batch * 1000 + g;
    const side: Side = g % 2 ? "US" : "USSR";
    const problems: string[] = [];
    const ai = new StubAi(id * 7919 + 1);
    const h = makeController({ engine, ai, seed: id + 17 });
    watchAi(h, ai, check, cov, problems);
    await h.ctrl.boot();
    await h.ctrl.newGame({ side, seed: 100_000 + id });
    const rand = mulberry32(id * 31 + 3);
    const resumeAt = opts.resumeEvery && g % opts.resumeEvery === 0 ? 30 + Math.floor(rand() * 150) : undefined;
    const onPrompt = (p: Prompt) => checkPreviews(h, p, cov, problems);
    let rec = await drive(h, { rand, avoidWarned: 0.95, undoRate: 0.08, stopAfterPrompts: resumeAt, onPrompt });
    let active = h;
    if (resumeAt !== undefined && h.ctrl.getSnapshot().status === "playing") {
      // Save/resume: a fresh controller and engine replay the autosave to the same position.
      const saveBefore = h.engine().saveJson();
      const logBefore = h.ctrl.getSnapshot().log.map(e => renderEnglish(e.text));
      const ai2 = new StubAi(id * 7919 + 1);
      const h2 = makeController({ engine: await loadEngine(), ai: ai2, storage: h.storage, seed: id + 99 });
      watchAi(h2, ai2, await loadEngine(), cov, problems);
      await h2.ctrl.boot();
      expect(h2.ctrl.getSnapshot().hasSavedGame).toBe(true);
      expect(await h2.ctrl.resume()).toBe(true);
      expect(h2.engine().saveJson()).toBe(saveBefore);
      const logAfter = h2.ctrl.getSnapshot().log.map(e => renderEnglish(e.text));
      expect(logAfter.slice(0, logBefore.length)).toEqual(logBefore);
      cov.resumes++;
      mergeBuilds(cov, h);
      merge(cov, rec);
      cov.games--; // the same game continues
      rec = await drive(h2, { rand, avoidWarned: 0.95, undoRate: 0.08, onPrompt: p => checkPreviews(h2, p, cov, problems) });
      active = h2;
    }
    merge(cov, rec);
    mergeBuilds(cov, active);
    const vm: ViewModel = active.ctrl.getSnapshot();
    expect(rec.leaks, `game ${id} leaks`).toEqual([]);
    expect([...rec.problems, ...problems], `game ${id} problems`).toEqual([]);
    expect(vm.status, `game ${id} status`).toBe("over");
    expect(vm.ending, `game ${id} ending`).not.toBeNull();
    const save = readSave(active.storage)!;
    expect(save.over).toBe(true);
    expect(vm.hasSavedGame).toBe(false);
    expect(vm.savedGame).toBeUndefined();
    const endProblems: string[] = [];
    verifyEnding(save, vm.ending!, check, endProblems);
    expect(endProblems, `game ${id} ending`).toEqual([]);
    cov.endingsVerified++;
  }
  cov.anomalies = engine.diagnostics.anomalyCount;
  // Building a prompt (every option stepped on the engine) stays quick: ~25 ms at most on a desktop
  // (docs/handoff/logic.md); this bound only catches a gross regression on a loaded machine.
  for (const [kind, b] of cov.builds) expect(b.max, `${kind} prompt build ms`).toBeLessThan(1000);
  return cov;
}

export function formatCoverage(cov: Coverage): string {
  const sorted = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => (a[0] as number) > (b[0] as number) ? 1 : -1)
    .map(([k, v]) => `${k}:${v}`).join(" ");
  return [
    `games ${cov.games}, steps ${cov.steps}, prompts ${cov.prompts}, undos ${cov.undos}, resumes ${cov.resumes}`,
    `prompt kinds: ${sorted(cov.promptKinds)}`,
    `human resolving cards: ${sorted(cov.humanResolving)}`,
    `AI resolving cards: ${sorted(cov.aiResolving)}`,
    `warnings: ${sorted(cov.warnings)}`,
    `option kinds: ${sorted(cov.optionKinds)}`,
    `prompt titles: ${sorted(cov.titles)}`,
    `engine anomalies routed to diagnostics: ${cov.anomalies}`,
    `endings: ${sorted(cov.endings)} (verified ${cov.endingsVerified})`,
    `coupOdds checked ${cov.coupOddsChecked}, effectiveOps checked ${cov.effectiveOpsChecked}, realignOdds checked ${cov.realignOddsChecked}`,
    `choices checked: endsPlay ${cov.checks.endsPlay} (ended ${cov.checks.ended}, announced but decided by chance ${cov.checks.endsPlayOther}),`
      + ` cost ${cov.checks.cost}, realignment rolls ${cov.checks.realign}, aiStats ${cov.checks.aiStats}, savedGame ${cov.checks.savedGame}`,
    `plays: ${cov.checks.plays} over ${cov.checks.playFrames} frames`,
    `hands accounted over ${cov.checks.handFrames} frames: dealt US ${cov.checks.dealt.US} / USSR ${cov.checks.dealt.USSR},`
      + ` gained otherwise ${cov.checks.gained}, reshuffles ${cov.checks.reshuffles};`
      + ` scoring plays ${cov.checks.scorings} (net 0: ${cov.checks.zeroScorings})`,
    `card-moved fromHand: ${cov.checks.fromHandMarks} marked; random discards / takes checked by card: ${sorted(cov.checks.fromHandCauses)}`,
    `event-target effects (card:verb:side): ${sorted(cov.checks.effects)}`,
    `prompt build ms (n/mean/max@options): ${[...cov.builds.entries()].sort().map(([k, b]) =>
      `${k} ${b.n}/${(b.total / b.n).toFixed(2)}/${b.max.toFixed(1)}@${b.maxOptions}`).join(", ")}`,
  ].join("\n");
}
