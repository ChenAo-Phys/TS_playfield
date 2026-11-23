/**
 * Code splitting (ui-shell §1): the start screen paints from a small entry chunk; the game screen (the map
 * geometry, the stage, the tray, the prompts, the console and rail…) and the start screen's map backdrop
 * are separate chunks.
 *
 * Each chunk is a `React.lazy` component whose loader is cached and may be called ahead (`load()`; the
 * start screen preloads the game when the browser is idle). Once a chunk is in, its lazy component renders
 * synchronously (the factory hands React an already-resolved thenable), so no Suspense fallback ever
 * flashes. The shell mounts a chunk's component only once it is `loaded()` (`useChunk`), which also keeps a
 * failed download (offline) from throwing inside the tree: the loader forgets the failure, and the next
 * `load()` retries.
 */
import { lazy, useEffect, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from "react";

export interface LazyChunk<P extends object> {
  /** The lazy component (render inside `<Suspense>`). */
  Component: LazyExoticComponent<ComponentType<P>>;
  /** Download and evaluate the chunk (cached; a failure is forgotten so the next call retries). */
  load(): Promise<ComponentType<P>>;
  loaded(): boolean;
  /** Called once the chunk is in. */
  subscribe(fn: () => void): () => void;
}

/** A thenable that calls back at once: React.lazy then resolves in the same render. */
function resolved<T>(value: T): Promise<T> {
  return { then: (ok: (v: T) => unknown) => { ok(value); } } as unknown as Promise<T>;
}

export function lazyChunk<M, P extends object>(importer: () => Promise<M>, pick: (m: M) => ComponentType<P>): LazyChunk<P> {
  let comp: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const listeners = new Set<() => void>();
  const load = () => (pending ??= importer().then(
    m => {
      comp = pick(m);
      for (const fn of [...listeners]) fn();
      return comp;
    },
    e => { pending = null; throw e; },
  ));
  const Component = lazy(() => (comp ? resolved({ default: comp }) : load().then(c => ({ default: c }))));
  return {
    Component,
    load,
    loaded: () => comp !== null,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** The game screen and everything only it uses. */
export const gameChunk = lazyChunk(() => import("./GameScreen"), m => m.GameScreen);

/** The real map, for the start screen's backdrop (the game chunk shares it). */
export const mapChunk = lazyChunk(() => import("../map"), m => m.MapView);

/**
 * Is the chunk in? While `want` is true and it is not, the download starts (`onError` hears a failure;
 * a later `load()` from anywhere retries).
 */
export function useChunk(chunk: Pick<LazyChunk<object>, "subscribe" | "loaded"> & { load(): Promise<unknown> }, want = true, onError?: (e: unknown) => void): boolean {
  const ready = useSyncExternalStore(chunk.subscribe, chunk.loaded, chunk.loaded);
  useEffect(() => {
    if (ready || !want) return;
    let live = true;
    chunk.load().catch(e => { if (live) onError?.(e); });
    return () => { live = false; };
    // `onError` is read when the download settles: a new callback does not restart it.
  }, [chunk, ready, want]); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}

/** Run `fn` when the browser is idle (a short timeout where requestIdleCallback is missing); returns a cancel. */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 300);
  return () => clearTimeout(id);
}
