/** Fast checks of the AI's pieces that need no engine or network run. */
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BeliefSync, createAiPlayer } from "../../src/ai";
import { MODEL_FILE, MODEL_HF_URL, MODEL_SHA256, SEARCH, SEARCH_NO_BELIEF, hfFileUrl } from "../../src/ai/config";
import { WASM_SIMD_UNSUPPORTED, isWasmUnsupportedMessage, stageOf, supportsWasmSimd, wasmUnsupportedError, withStage } from "../../src/ai/errors";
import { fetchModelBytes, type FetchProgress } from "../../src/ai/model_fetch";
import { onnxMetadata } from "../../src/ai/onnx_meta";
import { parseSearchParam, rolloutParam } from "../../src/ai/rollout_spec";
import { sha256Hex, sha256Js } from "../../src/ai/sha256";
import type { AiMove } from "../../src/game/contract";
import { PUBLIC_URL, readModelBytes } from "./helpers";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const nodeSha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("sha256", () => {
  it("the JS fallback matches node:crypto at every padding boundary", () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 100_003]) {
      const b = new Uint8Array(randomBytes(n));
      expect(hex(sha256Js(b))).toBe(nodeSha(b));
    }
    expect(hex(sha256Js(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("the shipped model hashes to the pinned sha256", async () => {
    const bytes = readModelBytes();
    expect(await sha256Hex(bytes)).toBe(MODEL_SHA256);
    expect(hex(sha256Js(bytes))).toBe(MODEL_SHA256);
  });
});

describe("config", () => {
  it("pins the leaderboard #1 search and documents the no-belief fallback", () => {
    const top = parseSearchParam(SEARCH);
    expect(top).toMatchObject({ k: 4, worlds: 64, horizon: 4, rule: "z2", stop: "earlier", leaf: "own", keyed: true,
                                aligned: true, box4: true, belief: 2048, race: 16 });
    expect(rolloutParam(top!)).toBe(SEARCH);
    const hf = parseSearchParam(SEARCH_NO_BELIEF);
    expect(hf).toMatchObject({ ...top, belief: 0 });
    expect(rolloutParam(hf!)).toBe(SEARCH_NO_BELIEF);
  });

  it("encodes the Hugging Face URL at the pinned commit", () => {
    expect(MODEL_HF_URL).toBe("https://huggingface.co/mihaild/deepstruggle/resolve/78708c9d002f0a8b3a089ec4620b95b650ef7d63/"
      + "_models/E8.1-A8-R132-S45%4011160M%2B(S45%2C46%2C47)%4011520..11600M.onnx");
    expect(hfFileUrl("a/b", "main", "x y/z")).toBe("https://huggingface.co/a/b/resolve/main/x%20y/z");
    expect(MODEL_FILE).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("the model's metadata is what the search expects", () => {
    const meta = onnxMetadata(readModelBytes());
    expect(meta["ts.format"]).toBe("ts-onnx-v1");
    expect(meta["ts.obs_features"]).toBe("12");
    expect(meta["ts.obs_size"]).toBe("3824");
    expect(meta["ts.action_size"]).toBe("220");
    expect(meta["ts.merged_influence"]).toBe("false");
    expect(meta["ts.macro_influence"]).toBe("false");
    expect(meta["ts.label"]).toBe("E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M");
  });
});

describe("fetchModelBytes", () => {
  const good = new Uint8Array(randomBytes(70_000));
  const goodSha = nodeSha(good);
  const respond = (body: Uint8Array, init: ResponseInit = {}) => {
    // A stream in small chunks, so progress is reported along the way.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < body.length; i += 8192) c.enqueue(body.slice(i, i + 8192));
        c.close();
      },
    });
    return new Response(stream, init);
  };

  it("falls through failing and corrupt sources to a verified one, with progress", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url === "a") return new Response("nope", { status: 404 });
      if (url === "b") return respond(new Uint8Array(randomBytes(70_000)));
      return respond(good, { headers: { "content-length": String(good.length) } });
    }) as unknown as typeof fetch;
    const progress: FetchProgress[] = [];
    const r = await fetchModelBytes({ urls: ["a", "b", "c", "d"], sha256: goodSha, useCache: false, fetchImpl: fake,
                                      onProgress: (p) => progress.push(p) });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(r.url).toBe("c");
    expect(r.fromCache).toBe(false);
    expect(hex(r.bytes)).toBe(hex(good));
    const fr = progress.filter((p) => p.stage === "model-download" && p.fraction !== null).map((p) => p.fraction!);
    expect(fr.some((f) => f > 0 && f < 1)).toBe(true);
    expect(fr[fr.length - 1]).toBe(1);
    expect(progress.some((p) => p.stage === "model-verify")).toBe(true);
  });

  it("uses the known size for progress when there is no Content-Length", async () => {
    const fake = (async () => respond(good)) as unknown as typeof fetch;
    const progress: number[] = [];
    await fetchModelBytes({ urls: ["x"], sha256: goodSha, size: good.length, useCache: false, fetchImpl: fake,
                            onProgress: (p) => { if (p.stage === "model-download" && p.fraction !== null) progress.push(p.fraction); } });
    expect(progress.some((f) => f > 0 && f < 1)).toBe(true);
  });

  it("names every failed source when none works", async () => {
    const fake = (async (url: string) => {
      if (url === "a") throw new TypeError("network down");
      return respond(new Uint8Array(10));
    }) as unknown as typeof fetch;
    await expect(fetchModelBytes({ urls: ["a", "b"], sha256: goodSha, useCache: false, fetchImpl: fake }))
      .rejects.toThrow(/a: network down[\s\S]*b: sha256 mismatch/);
  });

  it("tags its failure with the stage that failed: the download, or the check when every source sent a wrong file (QA Q-010)", async () => {
    const blocked = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const e1 = await fetchModelBytes({ urls: ["a", "b"], sha256: goodSha, useCache: false, fetchImpl: blocked }).catch(e => e);
    expect(stageOf(e1)).toBe("model-download");
    const wrong = (async () => respond(new Uint8Array(10))) as unknown as typeof fetch;
    const e2 = await fetchModelBytes({ urls: ["a", "b"], sha256: goodSha, useCache: false, fetchImpl: wrong }).catch(e => e);
    expect(stageOf(e2)).toBe("model-verify");
  });
});

describe("load errors (QA Q-005, Q-010)", () => {
  it("keeps the innermost stage and reads only known stages", () => {
    const e = withStage(new Error("x"), "model-download");
    expect(withStage(e, "ai-worker")).toBe(e);
    expect(stageOf(e)).toBe("model-download");
    expect(stageOf(withStage("plain", "ai-worker"))).toBe("ai-worker");
    expect(stageOf(Object.assign(new Error("y"), { stage: "nonsense" }))).toBeUndefined();
    expect(stageOf(null)).toBeUndefined();
  });

  it("marks only the real \"no WebAssembly SIMD\" error, never onnxruntime's errors that name its simd files", () => {
    const e = wasmUnsupportedError();
    expect(isWasmUnsupportedMessage(e.message)).toBe(true);
    expect(e.message.startsWith(WASM_SIMD_UNSUPPORTED)).toBe(true);
    expect(stageOf(e)).toBe("ai-worker");
    // What onnxruntime-web reports when its WebAssembly download fails (QA r-fail ortwasm).
    const ort = "no available backend found. ERR: [wasm] TypeError: Failed to fetch dynamically imported module: "
      + "http://localhost:4189/TS_playfield/assets/ort-wasm-simd-threaded-BfXyZ.wasm";
    expect(isWasmUnsupportedMessage(ort)).toBe(false);
    expect(isWasmUnsupportedMessage("could not start onnxruntime for the AI model: " + ort)).toBe(false);
    expect(isWasmUnsupportedMessage(undefined)).toBe(false);
    // This runtime has SIMD, so onnxruntime's failures are never rewritten into the SIMD message here.
    expect(supportsWasmSimd()).toBe(true);
  });
});

describe("BeliefSync", () => {
  const mv = (n: number, tag = 0): AiMove => ({
    before: new Uint8Array([n, tag, 7]),
    action: { decision_type: 1, primary_id: n, secondary_id: 0, flags: 0 },
  });

  it("sends only new moves while the game extends what was seen, else everything with a reset", () => {
    const s = new BeliefSync();
    const g = [mv(1), mv(2), mv(3)];
    expect(s.delta([])).toEqual({ reset: true, moves: [] });
    expect(s.delta(g.slice(0, 2))).toEqual({ reset: false, moves: g.slice(0, 2) });
    expect(s.delta(g)).toEqual({ reset: false, moves: [g[2]] });
    expect(s.delta(g)).toEqual({ reset: false, moves: [] });
    // The controller rebuilt the list: equal content is the same history.
    expect(s.delta([mv(1), mv(2), mv(3), mv(4)]).reset).toBe(false);
    // Undo: shorter than what was seen.
    const undo = s.delta([mv(1), mv(2)]);
    expect(undo.reset).toBe(true);
    expect(undo.moves).toHaveLength(2);
    // Same length, different last move (undo, then another choice).
    expect(s.delta([mv(1), mv(9), mv(5)]).reset).toBe(true);
    // A different action at an identical position is a different history.
    s.delta([mv(1)]);
    expect(s.delta([{ ...mv(1), action: { ...mv(1).action, flags: 128 } }]).reset).toBe(true);
    s.invalidate();
    expect(s.delta([mv(1)])).toEqual({ reset: true, moves: [mv(1)] });
  });
});

describe("createAiPlayer", () => {
  it("refuses model bytes that do not match the sha256", async () => {
    const ai = createAiPlayer({ modelUrl: "unused", modelSha256: MODEL_SHA256, search: SEARCH, minDelayMs: 0 },
      { mode: "inline", engineBase: PUBLIC_URL, modelBytes: new Uint8Array(100), useCache: false });
    await expect(ai.init()).rejects.toThrow(/does not match its sha256/);
    ai.dispose();
  });

  it("refuses an unknown search", async () => {
    const ai = createAiPlayer({ modelUrl: "unused", modelSha256: MODEL_SHA256, search: "mcts:9", minDelayMs: 0 },
      { mode: "inline", engineBase: PUBLIC_URL, modelBytes: readModelBytes(), useCache: false });
    await expect(ai.init()).rejects.toThrow(/unknown AI search/);
    ai.dispose();
  });
});
