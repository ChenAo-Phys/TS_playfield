// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The policy/value network: an ONNX export of a DeepStruggle checkpoint (tools/export_onnx.py) run by
 * onnxruntime-web's single-threaded wasm backend. Adapted from DS web/ui/src/analysis/model.ts: the
 * site runs one pinned model whose bytes come from src/ai/model_fetch.ts, so DS's model sources
 * (local server, Hugging Face catalogue, dropped file) are gone.
 *
 * The runtime's own files (ort-wasm-simd-threaded.{wasm,mjs}) are located by src/ai/ort_env.ts, which
 * the browser paths import before the first session is created. This module does not set them, so it
 * also runs under Node (tests, benchmark), where onnxruntime-web finds its wasm next to its bundle.
 *
 * The file carries its own description (metadata_props, see onnx_meta.ts). The observation width is
 * checked before anything runs: a model handed an observation of another width does not fail, it reads
 * fixed slices and misreads them.
 */
import * as ort from "onnxruntime-web/wasm";
import { supportsWasmSimd, wasmUnsupportedError, withStage } from "./errors";
import { onnxMetadata } from "./onnx_meta";

/** The obs_features bits a model reads: ts.obs_features in the export; 0 for the base layout and for
 *  exports made before the key existed. */
function featureBits(raw: Record<string, string>): number {
  const v = Number(raw["ts.obs_features"] ?? "0");
  return Number.isFinite(v) ? v >>> 0 : 0;
}

export interface ModelMeta {
  label: string;
  mergedInfluence: boolean;
  /** P42: decides in the macro view; its logits are the engine's full width. */
  macroInfluence: boolean;
  obsSize: number;
  actionSize: number;
  engineFingerprint: string;
  checkpoint: string;
  raw: Record<string, string>;
}

export interface Forward {
  logits: Float32Array; // rows * engine action size
  vWin: Float32Array; //   rows
  vVp: Float32Array; //    rows
}

export class Model {
  private constructor(
    readonly meta: ModelMeta,
    private readonly session: ort.InferenceSession,
    /** The engine's mask width: masks come in this wide and logits go out this wide. */
    readonly engineActionSize: number,
  ) {}

  /**
   * Build from the file's bytes. `obsSizeFor` is the engine's width for a feature set
   * (WasmEngine.obsSizeFor) and `actionSize` its action space; a model whose width is not the one this
   * engine writes for the model's own obs_features, or that reads a feature bit this engine does not
   * know, is refused here, with the reason, before it can misread a single observation. A base network's
   * logits are the base slots (`baseActionSize`); `run` pads them to the engine's width.
   */
  static async fromBytes(bytes: Uint8Array, obsSizeFor: (features: number) => number, actionSize: number,
                         baseActionSize = 220, label = "the model"): Promise<Model> {
    let raw: Record<string, string>;
    try {
      raw = onnxMetadata(bytes);
    } catch (e) {
      throw new Error(`${label} is not an ONNX model (${e instanceof Error ? e.message : e})`);
    }
    if (raw["ts.format"] !== "ts-onnx-v1") {
      throw new Error(`${label} was not exported by DeepStruggle's tools/export_onnx.py (no ts.format metadata)`);
    }
    const meta: ModelMeta = {
      label: raw["ts.label"] || label,
      mergedInfluence: raw["ts.merged_influence"] === "true",
      macroInfluence: raw["ts.macro_influence"] === "true",
      obsSize: Number(raw["ts.obs_size"]),
      actionSize: Number(raw["ts.action_size"]),
      engineFingerprint: raw["ts.engine_fingerprint"] || "",
      checkpoint: raw["ts.checkpoint"] || "",
      raw,
    };
    const features = featureBits(raw);
    let obsSize: number;
    try {
      obsSize = obsSizeFor(features);
    } catch {
      throw new Error(`${meta.label} reads observation features 0x${features.toString(16)}, which this engine does not `
        + `know: it was exported next to a newer engine.`);
    }
    const width = meta.macroInfluence ? actionSize : baseActionSize;
    if (meta.obsSize !== obsSize || (meta.actionSize !== width && meta.actionSize !== actionSize)) {
      throw new Error(`${meta.label} reads ${meta.obsSize} observation floats and ${meta.actionSize} actions; `
        + `this engine has ${obsSize} and ${actionSize} for its features. It was trained on another layout and would `
        + `misread every position.`);
    }
    let session: ort.InferenceSession;
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Only a browser that really lacks SIMD: onnxruntime's own errors name its ort-wasm-simd-threaded files, so a
      // failed download of its WebAssembly mentions "simd" too (QA Q-005).
      if (!supportsWasmSimd()) throw wasmUnsupportedError();
      throw withStage(new Error(`could not start onnxruntime for ${meta.label}: ${msg}`), "ai-worker");
    }
    return new Model(meta, session, actionSize);
  }

  /** The obs_features bits the network reads (ts.obs_features in the export; 0 for the base layout
   *  and for exports made before the key existed). */
  get obsFeatures(): number {
    return featureBits(this.meta.raw);
  }

  /** One forward over `rows` positions: observations and masks row-major, masks at the engine's width. A base
   *  network sees the base slots of each mask and its logits are padded with the mask's fill (P42). */
  async run(obs: Float32Array, masks: Uint8Array, rows: number): Promise<Forward> {
    const own = this.meta.actionSize, full = this.engineActionSize;
    let m = masks;
    if (own < full) {
      m = new Uint8Array(rows * own);
      for (let r = 0; r < rows; r++) m.set(masks.subarray(r * full, r * full + own), r * own);
    }
    const out = await this.session.run({
      obs: new ort.Tensor("float32", obs, [rows, this.meta.obsSize]),
      mask: new ort.Tensor("uint8", m, [rows, own]),
    });
    let logits = out.logits.data as Float32Array;
    if (own < full) {
      const padded = new Float32Array(rows * full).fill(-1e9);
      for (let r = 0; r < rows; r++) padded.set(logits.subarray(r * own, r * own + own), r * full);
      logits = padded;
    }
    return {
      logits,
      vWin: out.v_win.data as Float32Array,
      vVp: out.v_vp.data as Float32Array,
    };
  }

  /** Free the onnxruntime session (its wasm memory). The model cannot run afterwards. */
  async release(): Promise<void> {
    await this.session.release();
  }
}
