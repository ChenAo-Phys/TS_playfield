/**
 * What went wrong while the AI loads, in a form the page can tell apart (QA Q-005, Q-010):
 *
 * - Every load error carries the stage it failed in (`stage`, a LoadProgress stage): the model's download, its
 *   check, or the AI's start (its worker, engine, onnxruntime). The worker sends it across with the message, and
 *   the controller keeps it in `vm.load` with status "error", so the boot line names the step that failed -- even
 *   when it failed before reporting any progress (a blocked model file, a worker script that did not load).
 * - "This browser cannot run the AI" (no WebAssembly SIMD) is said only when the browser really lacks it
 *   (`supportsWasmSimd()`), and its message starts with WASM_SIMD_UNSUPPORTED, a stable marker
 *   (`isWasmUnsupportedMessage`). onnxruntime's own errors name its `ort-wasm-simd-threaded` files, so a failed
 *   download of those must not be read as a missing feature.
 *
 * Pure and DOM-free: imported by the worker, the inline path and the page.
 */
import type { LoadProgress } from "../game/contract";

export type AiLoadStage = LoadProgress["stage"];

const STAGES: ReadonlySet<string> = new Set<AiLoadStage>(["engine", "model-download", "model-verify", "ai-worker"]);

/** The start of the AI's "this browser lacks WebAssembly SIMD" message: match it with `isWasmUnsupportedMessage`. */
export const WASM_SIMD_UNSUPPORTED = "This browser does not support WebAssembly SIMD";

/** Whether this browser runs WebAssembly SIMD, which onnxruntime-web 1.30 requires. */
export function supportsWasmSimd(): boolean {
  try {
    // (module (func (result v128) i32.const 0 i8x16.splat i8x16.popcnt)) -- wasm-feature-detect's probe.
    return typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]));
  } catch {
    return false;
  }
}

/** The error for a browser without WebAssembly SIMD (stage "ai-worker"; its message starts with the marker). */
export function wasmUnsupportedError(): Error {
  const e = new Error(`${WASM_SIMD_UNSUPPORTED}, which the AI needs. `
    + "Please use a current version of Chrome, Edge, Firefox or Safari (16.4 or later).");
  e.name = "WasmUnsupportedError";
  return withStage(e, "ai-worker");
}

/** Whether an error message (e.g. `vm.error`) is the AI's "this browser lacks WebAssembly SIMD" error. */
export function isWasmUnsupportedMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith(WASM_SIMD_UNSUPPORTED);
}

/** `e` as an Error carrying `stage`, unless it already carries one (the innermost stage wins). */
export function withStage(e: unknown, stage: AiLoadStage): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  if (!stageOf(err)) (err as Error & { stage?: AiLoadStage }).stage = stage;
  return err;
}

/** The load stage an error was tagged with, if any. */
export function stageOf(e: unknown): AiLoadStage | undefined {
  const s = typeof e === "object" && e !== null ? (e as { stage?: unknown }).stage : undefined;
  return typeof s === "string" && STAGES.has(s) ? (s as AiLoadStage) : undefined;
}
