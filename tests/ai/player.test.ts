/**
 * The AI player end to end in Node (inline mode): the engine and the model from public/, a random
 * "human", the controller's loop (tests/ai/helpers.ts TestGame). Full-strength search (belief).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiPlayer, isAbortError, type AiPlayerHandle } from "../../src/ai";
import { MODEL_SHA256, SEARCH, SEARCH_NO_BELIEF } from "../../src/ai/config";
import type { WasmEngine } from "../../src/engine/wasm_engine";
import type { AiConfig } from "../../src/game/contract";
import { PUBLIC_URL, TestGame, legalIndices, loadEngine, readModelBytes, rng, searchSeed } from "./helpers";

const USSR = -1, US = 1;

function player(search = SEARCH, minDelayMs = 0): AiPlayerHandle {
  const config: AiConfig = { modelUrl: "unused", modelSha256: MODEL_SHA256, search, minDelayMs };
  return createAiPlayer(config, { mode: "inline", engineBase: PUBLIC_URL, modelBytes: readModelBytes(), useCache: false });
}

let E: WasmEngine;
const players: AiPlayerHandle[] = [];
function track(p: AiPlayerHandle): AiPlayerHandle {
  players.push(p);
  return p;
}

beforeAll(async () => {
  E = await loadEngine();
});
afterAll(() => {
  for (const p of players) p.dispose();
});

/** Play `n` AI decisions in a new game; every answer must be legal on the main engine. */
async function playAiDecisions(ai: AiPlayerHandle, side: number, gameSeed: number, n: number): Promise<TestGame> {
  const g = new TestGame(E, side, gameSeed);
  const human = rng(gameSeed ^ 0x5eed);
  for (let i = 0; i < n; i++) {
    if (!g.advanceToAiChoice(human)) break;
    const legal = legalIndices(E.mask(false));
    const c = await ai.choose({ state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves });
    expect(legal).toContain(c.idx);
    expect(c.decision.side).toBe(side);
    expect(c.decision.reseated).toBe(false);
    g.apply(c.idx, true);
  }
  return g;
}

describe("AiPlayer (inline, full strength)", () => {
  it("init reports the model and the engine it plays with", async () => {
    const ai = track(player());
    const info = await ai.init();
    expect(info).toEqual({ modelSha256: MODEL_SHA256, search: SEARCH, obsFeatures: 12, engineFingerprint: E.fingerprint });
    expect(ai.mode).toBe("inline");
    expect(await ai.init()).toBe(info); // idempotent
  });

  it("chooses a legal move at every AI decision, as USSR and as US", async () => {
    const ai = track(player());
    const g1 = await playAiDecisions(ai, USSR, 11, 8);
    expect(g1.moves.length).toBeGreaterThan(8);
    const g2 = await playAiDecisions(ai, US, 12, 8); // a new game: the tracker resets by itself
    expect(g2.moves.length).toBeGreaterThan(8);
    expect(ai.recentSearchMs().length).toBeGreaterThan(0);
  });

  it("seats an unseated state before deciding (AI = model features, other = person rules)", async () => {
    const ai = track(player(SEARCH_NO_BELIEF));
    E.newGame(5); // seats are 0/0 after newGame
    const c = await ai.choose({ state: E.snapshot(), seed: 1, moves: [] });
    expect(c.decision.reseated).toBe(true);
    const g = new TestGame(E, USSR, 5);
    expect(legalIndices(E.mask(false))).toContain(c.idx);
    const c2 = await ai.choose({ state: E.snapshot(), seed: 1, moves: g.moves });
    expect(c2.decision.reseated).toBe(false);
    expect(c2.idx).toBe(c.idx);
  });

  it("is deterministic for a fixed state, seed and history", async () => {
    const a = track(player()), b = track(player());
    const g = new TestGame(E, USSR, 21);
    const human = rng(99);
    let checked = 0, withBelief = 0;
    for (let i = 0; i < 10 && g.advanceToAiChoice(human); i++) {
      const req = { state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves };
      const ca = await a.choose(req);
      const cb = await b.choose(req);
      expect(cb.idx).toBe(ca.idx);
      expect(cb.decision.q).toEqual(ca.decision.q);
      expect(cb.decision.rows).toBe(ca.decision.rows);
      if (ca.decision.beliefRows > 0) withBelief++;
      checked++;
      g.apply(ca.idx, true);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
    expect(withBelief).toBeGreaterThan(0);
  });

  it("replays the belief after an undo and then answers as a fresh player would", async () => {
    const ai = track(player());
    const g = new TestGame(E, USSR, 31);
    const human = rng(7);
    let replayChecked = false;
    for (let round = 0; round < 30 && !replayChecked; round++) {
      // Advance to a human decision with at least two options (the start of the human's play).
      if (!g.advanceToAiChoice(human)) break;
      const c = await ai.choose({ state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves });
      g.apply(c.idx, true);
      if (E.isTerminal()) break;
      const legal = legalIndices(E.mask(false));
      if (E.decisionPlayer() !== -g.ai || legal.length < 2) continue;

      // The human plays, the AI answers (its tracker sees the human's move)...
      const mark = { state: E.snapshot(), moves: g.moves.length, step: g.stepIndex };
      g.apply(legal[0], true);
      if (!g.advanceToAiChoice(human)) break;
      const first = await ai.choose({ state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves });
      expect(first.decision.beliefObserved).toBeLessThan(g.moves.length);

      // ...then the human takes the play back and plays something else.
      E.restore(mark.state);
      g.moves.length = mark.moves;
      g.stepIndex = mark.step;
      g.apply(legal[legal.length - 1], true);
      if (!g.advanceToAiChoice(human)) break;
      const req = { state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves };
      const replayed = await ai.choose(req);
      // Not an extension of what it saw: reset, and the whole game replayed into the tracker.
      expect(replayed.decision.beliefObserved + replayed.decision.beliefRefused).toBe(g.moves.length);
      expect(replayed.decision.beliefRefused).toBe(0);
      const fresh = await track(player()).choose(req);
      expect(replayed.idx).toBe(fresh.idx);
      expect(replayed.decision.q).toEqual(fresh.decision.q);
      if (replayed.decision.source === "search" && round >= 6) replayChecked = true;
      g.apply(replayed.idx, true);
    }
    expect(replayChecked).toBe(true);
  });

  it("cancel aborts a running search; the next call starts over and replays the game", async () => {
    const ai = track(player());
    const g = new TestGame(E, USSR, 41);
    const human = rng(3);
    for (let i = 0; i < 3; i++) {
      expect(g.advanceToAiChoice(human)).toBe(true);
      g.apply((await ai.choose({ state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves })).idx, true);
    }
    expect(g.advanceToAiChoice(human)).toBe(true);
    const req = { state: E.snapshot(), seed: searchSeed(g.stepIndex), moves: g.moves };
    // Cancelled before the search starts: aborted, nothing else changes.
    const early = ai.choose(req);
    ai.cancel();
    await expect(early).rejects.toSatisfy(isAbortError);
    // Cancelled once the decision is on the backend (inline: before its first network call; a
    // worker is terminated mid-search): the backend is dropped and the next call builds a new one.
    const pending = ai.choose(req);
    await new Promise((r) => setTimeout(r, 0));
    ai.cancel();
    await expect(pending).rejects.toSatisfy(isAbortError);
    const again = await ai.choose(req);
    expect(again.decision.beliefObserved).toBe(g.moves.length);
    const fresh = await track(player()).choose(req);
    expect(again.idx).toBe(fresh.idx);
  });

  it("takes at least minDelayMs, and reports compute time separately", async () => {
    const ai = track(player("policy", 250));
    const g = new TestGame(E, USSR, 51);
    expect(g.advanceToAiChoice(rng(1))).toBe(true);
    const c = await ai.choose({ state: E.snapshot(), seed: 1, moves: g.moves });
    expect(c.source).toBe("policy");
    expect(c.elapsedMs).toBeGreaterThanOrEqual(245);
    expect(c.ms).toBeLessThan(c.elapsedMs);
    expect(ai.thinkingDelayMs()).toBeGreaterThanOrEqual(250);
  });
});
