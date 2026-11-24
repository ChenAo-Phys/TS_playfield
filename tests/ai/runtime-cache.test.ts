/**
 * QA round 3, L-4: onnxruntime's WebAssembly is kept in Cache Storage under its content-hashed URL (src/ai/runtime_cache.ts),
 * so a deploy -- which gives every file on GitHub Pages a new ETag -- does not make a returning visitor download its
 * 3.7 MB again. A fake CacheStorage stands in for the browser's.
 */
import { describe, expect, it } from "vitest";
import { dropRuntime, keepRuntime, looksLikeWasm, RUNTIME_CACHE_NAME, runtimeBytes } from "../../src/ai/runtime_cache";

const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x2a]).buffer;
const URL_A = "https://example.org/TS_playfield/assets/ort-wasm-simd-threaded-AAAAAAAA.wasm";
const URL_B = "https://example.org/TS_playfield/assets/ort-wasm-simd-threaded-BBBBBBBB.wasm";

/** Just enough of the Cache API: named caches of url → bytes. */
function fakeCaches() {
  const stores = new Map<string, Map<string, ArrayBuffer>>();
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      put: async (url: string, r: Response) => { m.set(url, await r.arrayBuffer()); },
      keys: async () => [...m.keys()].map(url => ({ url }) as Request),
      delete: async (k: string | Request) => m.delete(typeof k === "string" ? k : k.url),
      match: async (url: string) => (m.has(url) ? new Response(m.get(url)!.slice(0)) : undefined),
    };
  };
  const api = {
    open: async (name: string) => cache(name),
    match: async (url: string, o?: { cacheName?: string }) => (stores.has(o?.cacheName ?? "") ? cache(o!.cacheName!).match(url) : undefined),
  } as unknown as CacheStorage;
  return { api, stores };
}

function counter(body: ArrayBuffer = WASM, ok = true) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => { calls.push(url); return new Response(body.slice(0), { status: ok ? 200 : 404 }); };
  return { calls, fetchFn };
}

const settle = () => new Promise(r => setTimeout(r, 0));

describe("onnxruntime's WebAssembly in Cache Storage (L-4)", () => {
  it("downloads once, keeps it, and reads it back on the next load without the network", async () => {
    const { api, stores } = fakeCaches();
    const net = counter();
    const first = await runtimeBytes(URL_A, { keep: true, api, fetchFn: net.fetchFn });
    expect(first?.fromCache).toBe(false);
    expect(new Uint8Array(first!.bytes)).toEqual(new Uint8Array(WASM));
    await settle();
    expect([...stores.get(RUNTIME_CACHE_NAME)!.keys()]).toEqual([URL_A]);
    const second = await runtimeBytes(URL_A, { keep: true, api, fetchFn: net.fetchFn });
    expect(second?.fromCache).toBe(true);
    expect(new Uint8Array(second!.bytes)).toEqual(new Uint8Array(WASM));
    expect(net.calls).toEqual([URL_A]);
  });

  it("keeps one entry: a new onnxruntime (another hashed name) replaces the old one", async () => {
    const { api, stores } = fakeCaches();
    await keepRuntime(api, URL_A, WASM);
    await keepRuntime(api, URL_B, WASM);
    expect([...stores.get(RUNTIME_CACHE_NAME)!.keys()]).toEqual([URL_B]);
  });

  it("never keeps or trusts what is not WebAssembly, and drops a bad entry", async () => {
    const { api, stores } = fakeCaches();
    const html = new TextEncoder().encode("<!doctype html><title>404</title>").buffer as ArrayBuffer;
    expect(looksLikeWasm(WASM)).toBe(true);
    expect(looksLikeWasm(html)).toBe(false);
    // A page in place of the file (a proxy, a captive portal): handed on (onnxruntime reports it), not kept.
    await runtimeBytes(URL_A, { keep: true, api, fetchFn: counter(html).fetchFn });
    await settle();
    expect(stores.get(RUNTIME_CACHE_NAME)?.size ?? 0).toBe(0);
    // A damaged entry is dropped and the file downloaded again.
    stores.set(RUNTIME_CACHE_NAME, new Map([[URL_A, html]]));
    const net = counter();
    const got = await runtimeBytes(URL_A, { keep: true, api, fetchFn: net.fetchFn });
    expect(got?.fromCache).toBe(false);
    expect(net.calls).toEqual([URL_A]);
    await settle();
    expect(new Uint8Array(stores.get(RUNTIME_CACHE_NAME)!.get(URL_A)!)).toEqual(new Uint8Array(WASM));
    // The worker forgets an entry onnxruntime could not start from.
    await dropRuntime(URL_A, { keep: true, api });
    expect(stores.get(RUNTIME_CACHE_NAME)!.size).toBe(0);
  });

  it("is a plain download when not kept (dev server), without the Cache API, or when storage throws", async () => {
    const { api, stores } = fakeCaches();
    const net = counter();
    expect((await runtimeBytes(URL_A, { keep: false, api, fetchFn: net.fetchFn }))?.fromCache).toBe(false);
    await settle();
    expect(stores.size).toBe(0);
    expect((await runtimeBytes(URL_A, { keep: true, api: null, fetchFn: net.fetchFn }))?.fromCache).toBe(false);
    const broken = { match: async () => { throw new Error("SecurityError"); }, open: async () => { throw new Error("SecurityError"); } } as unknown as CacheStorage;
    expect((await runtimeBytes(URL_A, { keep: true, api: broken, fetchFn: net.fetchFn }))?.fromCache).toBe(false);
    expect(net.calls).toHaveLength(3);
  });

  it("returns null when the file cannot be had (onnxruntime then fetches it itself)", async () => {
    const { api } = fakeCaches();
    expect(await runtimeBytes(URL_A, { keep: true, api, fetchFn: counter(WASM, false).fetchFn })).toBeNull();
    expect(await runtimeBytes(URL_A, { keep: true, api, fetchFn: async () => { throw new TypeError("offline"); } })).toBeNull();
  });
});
