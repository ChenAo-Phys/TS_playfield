/**
 * Where onnxruntime-web finds its runtime in the browser, and how it runs. Import this before the first
 * InferenceSession is created (src/ai/worker.ts does, at its top; the inline browser path imports it
 * lazily). Never imported under Node: there the `?url` imports would be dev-server paths, and
 * onnxruntime-web already finds its wasm next to its own bundle.
 *
 * - `?url` makes Vite serve the files from this site (dev: under /TS_playfield/node_modules/...; build:
 *   hashed copies in assets/, below the base path), not a CDN. The dep optimizer's pre-bundled copy of
 *   onnxruntime-web would otherwise look for its wasm next to the optimized chunk, where it is not.
 * - Single-threaded: GitHub Pages cannot send the COOP/COEP headers threads need (SharedArrayBuffer),
 *   and the search parallelises poorly over one position anyway. No proxy worker: this already runs in
 *   the AI's own worker.
 * - Only the plain SIMD build (ort-wasm-simd-threaded.wasm, ~14 MB raw, ~3.7 MB gzipped); the JSEP /
 *   JSPI / asyncify variants (WebGPU, WebNN) are never loaded.
 */
import * as ort from "onnxruntime-web/wasm";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import ortMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = "error";

export const ORT_WASM_URL: string = ortWasmUrl;
