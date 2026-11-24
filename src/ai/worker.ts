/**
 * The AI's module worker: its own engine, its own onnxruntime session, its own belief tracker. It
 * downloads (or reads from the Cache API) and verifies the model itself, so the page's thread never
 * touches onnxruntime. Protocol: src/ai/protocol.ts. Spawned by src/ai/index.ts with
 * `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`, which Vite bundles.
 *
 * One message at a time: a decision awaits the network between its batch steps, and the engine and its
 * rollout batch are this worker's only ones. Cancelling a decision terminates the worker (index.ts).
 */
import * as ort from "onnxruntime-web/wasm";
import { ORT_WASM_URL } from "./ort_env";
import { BeliefDesyncError, type AiCore } from "./core";
import { stageOf } from "./errors";
import { loadCore } from "./load";
import type { FromWorker, ToWorker } from "./protocol";
import { dropRuntime, runtimeBytes } from "./runtime_cache";

const scope = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

let core: AiCore | null = null;
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (ev) => {
  queue = queue.then(() => handle(ev.data));
};

async function handle(msg: ToWorker): Promise<void> {
  if (msg.type === "load") {
    // onnxruntime's WebAssembly (~3.7 MB compressed) downloads while the model does, not after it (QA Q-013): handed
    // to onnxruntime as bytes when it is in, else onnxruntime fetches it itself. In the production build it is kept in
    // Cache Storage under its content-hashed name, so a deploy does not make returning visitors download it again
    // (QA L-4); the dev server's URL names no version, so there it is a plain download.
    const keep = { keep: msg.useCache !== false && !import.meta.env.DEV };
    const runtime = runtimeBytes(ORT_WASM_URL, keep);
    try {
      const t0 = performance.now();
      const loaded = await loadCore({
        engineBase: msg.engineBase, search: msg.search, sha256: msg.sha256, urls: msg.urls, size: msg.size,
        useCache: msg.useCache, bytes: msg.bytes, trusted: msg.trusted,
        onProgress: (progress) => post({ type: "progress", progress }),
        beforeSession: async () => {
          const wasm = await runtime;
          if (wasm) ort.env.wasm.wasmBinary = new Uint8Array(wasm.bytes);
        },
      });
      ort.env.wasm.wasmBinary = undefined;
      core = loaded.core;
      // The session holds its own copy of the model; these bytes can go to the page for a respawn.
      const bytes = msg.wantBytes ? loaded.bytes : undefined;
      post({ type: "loaded", info: core.info(), bytes, fromCache: loaded.fromCache, ms: Math.round(performance.now() - t0) },
           bytes ? [bytes.buffer] : []);
    } catch (e) {
      ort.env.wasm.wasmBinary = undefined;
      // onnxruntime could not start from kept bytes: forget them, so a Retry downloads the file again.
      if (stageOf(e) === "ai-worker" && (await runtime)?.fromCache) await dropRuntime(ORT_WASM_URL, keep);
      post({ type: "error", message: e instanceof Error ? e.message : String(e), stage: stageOf(e), name: e instanceof Error ? e.name : undefined });
    }
    return;
  }
  try {
    if (!core) throw new Error("the AI worker has no model loaded");
    const decision = await core.decide({ state: msg.state, seed: msg.seed, belief: msg.belief });
    post({ type: "decision", id: msg.id, decision });
  } catch (e) {
    post({
      type: "error", id: msg.id, message: e instanceof Error ? e.message : String(e),
      code: e instanceof BeliefDesyncError ? "belief-desync" : undefined,
    });
  }
}
