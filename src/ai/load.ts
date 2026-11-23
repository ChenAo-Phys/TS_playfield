/**
 * Building an AiCore: the model's verified bytes (cache / self-hosted / Hugging Face), the AI's own
 * engine, and an onnxruntime session -- in a worker or inline. The engine loads while the model
 * downloads. Browser callers must have imported ./ort_env first.
 */
import { WasmEngine } from "../engine/wasm_engine";
import type { LoadProgress } from "../game/contract";
import { AiCore } from "./core";
import { withStage } from "./errors";
import { Model } from "./model";
import { fetchModelBytes } from "./model_fetch";
import { parseSearchParam } from "./rollout_spec";
import { sha256Hex } from "./sha256";

export interface LoadCoreOptions {
  engineBase: string;
  search: string;
  sha256: string;
  urls: readonly string[];
  size?: number;
  useCache?: boolean;
  /** Use these bytes instead of fetching (checked against `sha256` unless `trusted`). */
  bytes?: Uint8Array;
  /** `bytes` were verified already (a respawn with the bytes a previous load returned). */
  trusted?: boolean;
  onProgress?: (p: LoadProgress) => void;
  /** Awaited right before the onnxruntime session is created (the worker hands onnxruntime its prefetched wasm). */
  beforeSession?: () => Promise<void>;
}

export interface LoadedCore {
  core: AiCore;
  bytes: Uint8Array;
  fromCache: boolean;
}

/**
 * Every error it throws carries the stage that failed (src/ai/errors.ts): "model-download" / "model-verify" for the
 * model's bytes, "ai-worker" for the AI's start (its engine, the onnxruntime session).
 */
export async function loadCore(o: LoadCoreOptions): Promise<LoadedCore> {
  if (parseSearchParam(o.search) === undefined) throw withStage(new Error(`unknown AI search "${o.search}"`), "ai-worker");
  const enginePromise = WasmEngine.load(o.engineBase, {
    // The AI's engine never draws anything; its stderr is diagnostics only.
    printErr: (line) => console.warn(`[ai engine] ${line}`),
  });
  // Settled either way before anything awaits the model, so a failed download leaves no unhandled rejection.
  enginePromise.catch(() => undefined);

  let bytes: Uint8Array;
  let fromCache = false;
  if (o.bytes) {
    if (!o.trusted) {
      o.onProgress?.({ stage: "model-verify", fraction: null });
      const got = await sha256Hex(o.bytes);
      if (got !== o.sha256) throw withStage(new Error(`the AI model handed in does not match its sha256 (got ${got.slice(0, 12)}…)`), "model-verify");
    }
    bytes = o.bytes;
  } else {
    const f = await fetchModelBytes({
      urls: o.urls, sha256: o.sha256, size: o.size, useCache: o.useCache,
      onProgress: (p) => o.onProgress?.(p),
    });
    bytes = f.bytes;
    fromCache = f.fromCache;
  }

  o.onProgress?.({ stage: "ai-worker", fraction: 0 });
  try {
    const engine = await enginePromise;
    o.onProgress?.({ stage: "ai-worker", fraction: 0.5 });
    await o.beforeSession?.();
    const model = await Model.fromBytes(bytes, (f) => engine.obsSizeFor(f), engine.actionSize, engine.baseActionSize, "the AI model");
    const core = new AiCore(engine, model, o.search, o.sha256);
    o.onProgress?.({ stage: "ai-worker", fraction: 1 });
    return { core, bytes, fromCache };
  } catch (e) {
    throw withStage(e, "ai-worker");
  }
}
