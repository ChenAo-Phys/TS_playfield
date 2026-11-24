/**
 * onnxruntime's WebAssembly (`ORT_WASM_URL`: ~14 MB, 3.7 MB gzipped over the wire), kept in Cache Storage like the
 * model (src/ai/model_cache.ts), so a returning visitor does not download it again after a deploy (QA L-4). GitHub
 * Pages stamps every file with the deploy's time (`ETag`, `Last-Modified`), so after each push the HTTP cache's
 * revalidation of an unchanged file gets the whole file again; this file's name carries a hash of its content, so
 * the URL itself is the key. One entry: storing one drops any other (an older onnxruntime).
 *
 * Only for content-hashed URLs (the production build; the dev server's URL names no version). The bytes read back
 * must look like WebAssembly, and the worker drops the entry when onnxruntime could not start from it, so a bad
 * entry costs one download, never a stuck AI. The Cache API exists only in a secure context and in browsers;
 * elsewhere this is a plain download.
 */

export const RUNTIME_CACHE_NAME = "ts-playfield-runtime-v1";

export interface RuntimeBytes {
  bytes: ArrayBuffer;
  /** Read from Cache Storage (not downloaded). */
  fromCache: boolean;
}

export interface RuntimeCacheOptions {
  /** Keep / read the file in Cache Storage (false: a plain download, as on the dev server). */
  keep: boolean;
  /** Tests: the Cache API (default: the global `caches`, if any). */
  api?: CacheStorage | null;
  /** Tests: the network (default: the global `fetch`). */
  fetchFn?: (url: string) => Promise<Response>;
}

function cacheApi(o: RuntimeCacheOptions): CacheStorage | null {
  if (!o.keep) return null;
  if (o.api !== undefined) return o.api;
  return typeof caches !== "undefined" ? caches : null;
}

/** Cache keys are absolute URLs: `url` against the page's / worker's own address. */
function absolute(url: string): string {
  try { return new URL(url, globalThis.location?.href).href; } catch { return url; }
}

/** A WebAssembly module's first bytes: "\0asm". */
export function looksLikeWasm(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 8) return false;
  const b = new Uint8Array(bytes, 0, 4);
  return b[0] === 0x00 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d;
}

/**
 * The file at `url`: from Cache Storage when it is there, else downloaded (and then kept, in the background); null
 * when it cannot be had (onnxruntime then fetches it itself).
 */
export async function runtimeBytes(url: string, o: RuntimeCacheOptions): Promise<RuntimeBytes | null> {
  const api = cacheApi(o);
  if (api) {
    try {
      const hit = await api.match(absolute(url), { cacheName: RUNTIME_CACHE_NAME });
      if (hit) {
        const bytes = await hit.arrayBuffer();
        if (looksLikeWasm(bytes)) return { bytes, fromCache: true };
        await dropRuntime(url, o);
      }
    } catch { /* storage blocked or broken: download */ }
  }
  let bytes: ArrayBuffer;
  try {
    const r = await (o.fetchFn ?? ((u: string) => fetch(u)))(url);
    if (!r.ok) return null;
    bytes = await r.arrayBuffer();
  } catch {
    return null;
  }
  if (api && looksLikeWasm(bytes)) void keepRuntime(api, url, bytes);
  return { bytes, fromCache: false };
}

/** Stores a copy of `bytes` under `url` and drops every other entry; failures (quota, private mode) are ignored. */
export async function keepRuntime(api: CacheStorage, url: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const key = absolute(url);
    const cache = await api.open(RUNTIME_CACHE_NAME);
    await cache.put(key, new Response(bytes.slice(0)));
    for (const k of await cache.keys()) if (k.url !== key) await cache.delete(k);
  } catch { /* not kept: downloaded again next time */ }
}

/** Forgets `url` (onnxruntime could not start from the kept bytes). */
export async function dropRuntime(url: string, o: RuntimeCacheOptions): Promise<void> {
  const api = cacheApi(o);
  if (!api) return;
  try { await (await api.open(RUNTIME_CACHE_NAME)).delete(absolute(url)); } catch { /* ignore */ }
}
