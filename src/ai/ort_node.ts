/**
 * onnxruntime-web under Node (tests, the benchmark): hand the runtime its wasm binary read from disk.
 * Its own lookup (a `fetch` of a URL next to its bundle) fails when the bundle is loaded through a
 * test runner's module graph. Only imported dynamically by the inline path when it runs under Node;
 * the builtins are imported by computed names so no browser bundle ever sees them.
 */
import * as ort from "onnxruntime-web/wasm";

let done: Promise<void> | null = null;

export function configureOrtForNode(): Promise<void> {
  done ??= (async () => {
    const fsName = "node:fs/promises";
    const moduleName = "node:module";
    const fs = (await import(/* @vite-ignore */ fsName)) as { readFile(p: string): Promise<Uint8Array> };
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      createRequire(url: string): { resolve(id: string): string };
    };
    const require = mod.createRequire(import.meta.url);
    const wasmPath = require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm");
    const bin = await fs.readFile(wasmPath);
    ort.env.wasm.wasmBinary = new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = "error";
  })();
  return done;
}
