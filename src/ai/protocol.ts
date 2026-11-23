/**
 * Messages between src/ai/index.ts (main thread) and src/ai/worker.ts (the AI's module worker).
 * One worker = one engine + one onnxruntime session + one belief tracker. The worker handles one
 * message at a time, in order.
 *
 *   main -> worker  { type: "load", ... }    -> "progress"* then "loaded" | "error" (no id)
 *   main -> worker  { type: "decide", id, ... } -> "decision" | "error" (with id)
 */
import type { AiInfo, LoadProgress } from "../game/contract";
import type { BeliefDelta, Decision } from "./core";

export interface LoadMessage {
  type: "load";
  /** Absolute URL of the directory holding engine/ts_engine.mjs (the site's base). */
  engineBase: string;
  search: string;
  sha256: string;
  /** Absolute model URLs, tried in order. */
  urls: string[];
  /** Expected model size in bytes (download progress). */
  size?: number;
  useCache: boolean;
  /** Known-good model bytes (a respawn after cancel, or bytes the page was handed): no download. */
  bytes?: Uint8Array;
  /** `bytes` came from a previous successful load (skip re-hashing them). */
  trusted: boolean;
  /** Send the verified bytes back with "loaded" (transferred), so a respawn need not download again. */
  wantBytes: boolean;
}

export interface DecideMessage {
  type: "decide";
  id: number;
  state: Uint8Array;
  seed: number;
  belief: BeliefDelta;
}

export type ToWorker = LoadMessage | DecideMessage;

export type FromWorker =
  | { type: "progress"; progress: LoadProgress }
  | { type: "loaded"; info: AiInfo; bytes?: Uint8Array; fromCache: boolean; ms: number }
  | { type: "decision"; id: number; decision: Decision }
  // A load error (no id) carries the stage it failed in and its name (src/ai/errors.ts).
  | { type: "error"; id?: number; message: string; code?: "belief-desync"; stage?: LoadProgress["stage"]; name?: string };
