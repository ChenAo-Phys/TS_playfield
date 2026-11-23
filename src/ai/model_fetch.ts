/**
 * Getting the model's bytes: the browser's model cache first (model_cache.ts), else each URL in turn
 * (self-hosted, then Hugging Face), streamed with progress, every candidate checked against the
 * pinned sha256 before it is used or cached. Runs in the AI worker (and in the inline path).
 */
import { withStage } from "./errors";
import { cachedModel, storeModel } from "./model_cache";
import { sha256Hex } from "./sha256";

export interface FetchProgress {
  stage: "model-download" | "model-verify";
  /** 0..1, or null when unknown. */
  fraction: number | null;
}

export interface ModelFetchOptions {
  urls: readonly string[];
  sha256: string;
  /** Expected size in bytes (progress when the server sends no usable Content-Length). */
  size?: number;
  /** Use the Cache API (default true). */
  useCache?: boolean;
  onProgress?: (p: FetchProgress) => void;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export interface FetchedModel {
  bytes: Uint8Array;
  fromCache: boolean;
  /** The URL the bytes came from ("" for a cache hit). */
  url: string;
}

/** Read a response body, reporting the fraction received. */
async function readWithProgress(res: Response, expected: number | undefined, onFraction: (f: number | null) => void): Promise<Uint8Array> {
  // Content-Length is the encoded size: with Content-Encoding it does not measure the decoded stream.
  const header = Number(res.headers.get("content-length") ?? "");
  const encoded = !!res.headers.get("content-encoding") && res.headers.get("content-encoding") !== "identity";
  const total = expected && expected > 0 ? expected : !encoded && Number.isFinite(header) && header > 0 ? header : 0;
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    onFraction(1);
    return b;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReport = -1;
  onFraction(total ? 0 : null);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) {
      const f = Math.min(1, received / total);
      // At most ~100 progress messages per download.
      if (f - lastReport >= 0.01 || f === 1) {
        lastReport = f;
        onFraction(f);
      }
    } else {
      onFraction(null);
    }
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  if (lastReport !== 1) onFraction(1);
  return out;
}

/**
 * The model's verified bytes. Throws (listing every URL's failure) when no source gives a file with the
 * pinned hash.
 */
export async function fetchModelBytes(opts: ModelFetchOptions): Promise<FetchedModel> {
  const { urls, sha256, size, onProgress } = opts;
  const useCache = opts.useCache ?? true;
  const doFetch = opts.fetchImpl ?? fetch;
  if (useCache) {
    const hit = await cachedModel(sha256).catch(() => null);
    if (hit) {
      onProgress?.({ stage: "model-download", fraction: 1 });
      return { bytes: hit, fromCache: true, url: "" };
    }
  }
  const failures: string[] = [];
  let mismatches = 0;
  for (const url of urls) {
    try {
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await readWithProgress(res, size, (fraction) => onProgress?.({ stage: "model-download", fraction }));
      onProgress?.({ stage: "model-verify", fraction: null });
      const got = await sha256Hex(bytes);
      if (got !== sha256) {
        mismatches++;
        throw new Error(`sha256 mismatch (got ${got.slice(0, 12)}…, ${bytes.length} bytes)`);
      }
      onProgress?.({ stage: "model-verify", fraction: 1 });
      // The cache only saves a download: a browser that will not keep the file still uses it.
      if (useCache) await storeModel(sha256, bytes).catch(() => false);
      return { bytes, fromCache: false, url };
    } catch (e) {
      failures.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Tagged with the stage that failed (src/ai/errors.ts): the check only when every source sent the wrong file.
  const e = new Error(`could not download the AI model:\n  ${failures.join("\n  ")}`);
  throw withStage(e, urls.length > 0 && mismatches === urls.length ? "model-verify" : "model-download");
}
