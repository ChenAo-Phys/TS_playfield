// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The model this browser has already downloaded, kept so that opening the page again does not fetch
 * it again. Adapted from DeepStruggle's web/ui/src/analysis/model_cache.ts: the site pins one model
 * by its sha256 (src/ai/config.ts), so the Hugging Face `paths-info` lookup DS needs to learn a
 * branch's current hash is gone, and the key is the pinned hash itself.
 *
 * A file is kept under its content (its sha256), not under its URL, and the bytes are hashed before
 * they are kept and again when they are read back, so a corrupted entry is dropped, never used.
 *
 * The Cache API exists only in a secure context (https, localhost) and in browsers; elsewhere (Node,
 * plain http) every load is a download, as before.
 */
import { sha256Hex } from "./sha256";

const CACHE_NAME = "ts-playfield-models-v1";
/** The site ships one model; a few old ones may linger across model upgrades. */
const MAX_MODELS = 2;
/** Cache keys must be http(s) URLs; this one is never fetched. */
const KEY_PREFIX = "https://model-cache.invalid/sha256/";

function cacheApi(): CacheStorage | null {
  return typeof caches !== "undefined" ? caches : null;
}

/** The cached bytes whose sha256 is `sha256`, or null (no Cache API, no entry, or a corrupt entry, which is removed). */
export async function cachedModel(sha256: string): Promise<Uint8Array | null> {
  const api = cacheApi();
  if (!api) return null;
  const hit = await api.match(KEY_PREFIX + sha256, { cacheName: CACHE_NAME });
  if (!hit) return null;
  const bytes = new Uint8Array(await hit.arrayBuffer());
  if ((await sha256Hex(bytes)) === sha256) return bytes;
  await (await api.open(CACHE_NAME)).delete(KEY_PREFIX + sha256);
  return null;
}

/** Keep `bytes` if they are the file whose sha256 is `sha256`; returns whether they were kept. */
export async function storeModel(sha256: string, bytes: Uint8Array): Promise<boolean> {
  const api = cacheApi();
  if (!api || (await sha256Hex(bytes)) !== sha256) return false;
  const cache = await api.open(CACHE_NAME);
  await cache.put(KEY_PREFIX + sha256, new Response(bytes as Uint8Array<ArrayBuffer>));
  // keys() lists in insertion order, so the front is the oldest download.
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_MODELS))) await cache.delete(k);
  return true;
}

/** The number of models kept; 0 where there is no Cache API. Asking creates no cache. */
export async function cachedModelCount(): Promise<number> {
  const api = cacheApi();
  if (!api || !(await api.has(CACHE_NAME))) return 0;
  return (await (await api.open(CACHE_NAME)).keys()).length;
}

export async function clearModelCache(): Promise<void> {
  await cacheApi()?.delete(CACHE_NAME);
}
