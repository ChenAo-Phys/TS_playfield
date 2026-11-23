/**
 * Shared helpers for the AI tests (Node, inline mode): the engine and the model from public/, a
 * seeded random "human", and a game driver that mirrors the controller's loop (seat both sides,
 * auto-play single-legal decisions without recording them, record every other move for the belief).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WasmEngine } from "../../src/engine/wasm_engine";
import type { AiMove } from "../../src/game/contract";
import { MODEL_FILE } from "../../src/ai/config";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(here, "../../public");
/** file:// URL of public/, the AI's `engineBase` under Node. */
export const PUBLIC_URL = pathToFileURL(PUBLIC_DIR + "/").href;
export const MODEL_PATH = path.join(PUBLIC_DIR, "models", MODEL_FILE);

let modelBytes: Uint8Array | null = null;
export function readModelBytes(): Uint8Array {
  modelBytes ??= new Uint8Array(readFileSync(MODEL_PATH));
  return modelBytes.slice();
}

export async function loadEngine(): Promise<WasmEngine> {
  return WasmEngine.load(PUBLIC_URL, { printErr: () => undefined });
}

export function legalIndices(mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

/** mulberry32: a small deterministic PRNG for the random "human". */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The search seed the controller derives from the step index (DS main.ts seedFor). */
export function searchSeed(stepIndex: number): number {
  return ((stepIndex + 1) * 1_000_003) >>> 0;
}

export const MODEL_FEATURES = 12;

/** A game as the controller holds it: the main engine, the AI's side, the recorded moves. */
export class TestGame {
  readonly moves: AiMove[] = [];
  stepIndex = 0;

  constructor(readonly E: WasmEngine, readonly ai: number, seed: number) {
    E.newGame(seed);
    this.seat();
  }

  /** AI = model features, human = person rules (ARCHITECTURE "Seats"). Idempotent. */
  seat(): void {
    this.E.seat(this.ai, MODEL_FEATURES);
    this.E.seat(-this.ai, this.E.currentRules);
  }

  get over(): boolean {
    return this.E.isTerminal();
  }

  /** Apply legal flat index `idx`; recorded for the belief unless auto-played. */
  apply(idx: number, record: boolean): void {
    const before = this.E.snapshot();
    const action = this.E.decodeFlat(idx);
    const why = this.E.step(action, 0);
    if (why) throw new Error(`step ${idx} refused: ${why}`);
    this.stepIndex++;
    if (record) this.moves.push({ before, action });
  }

  /**
   * Play the human (uniformly random legal moves from `human`) and every single-legal decision until
   * the AI has a real choice (>= 2 legal moves). False if the game ended first.
   */
  advanceToAiChoice(human: () => number, maxSteps = 5000): boolean {
    for (let n = 0; n < maxSteps; n++) {
      if (this.E.isTerminal()) return false;
      const p = this.E.decisionPlayer();
      if (p === 0) throw new Error("a chance node outside step()");
      const legal = legalIndices(this.E.mask(false));
      if (legal.length === 0) throw new Error("no legal move");
      if (legal.length === 1) {
        this.apply(legal[0], false);
        continue;
      }
      if (p === this.ai) return true;
      this.apply(legal[Math.floor(human() * legal.length)], true);
    }
    throw new Error("the game did not reach an AI decision");
  }
}
