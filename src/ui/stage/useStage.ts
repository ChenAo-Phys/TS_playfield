/**
 * React access to the stage store: one `StageStore` per UiRoot (keyed by its Director), so the
 * stage, the game-over telex, the danger frame and the slip's Continue button share it wherever the
 * shell mounts them.
 *
 *   const store = useStageStore();                       // inside <UiRootProvider>
 *   const dock = useStageState(s => s.dock);             // re-renders when that slice changes
 *   const { waiting, proceed } = useStageWaiting();      // the slip's "Continue ⎵"
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "../state/useReducedMotion";
import { useUiRoot } from "../state/context";
import type { Director } from "../ui-contract";
import { StageStore, type StageHandler, type StageState } from "./stageStore";

const stores = new WeakMap<Director, StageStore>();

/** The stage store of a director (created on first use). */
export function stageStoreFor(director: Director): StageStore {
  let s = stores.get(director);
  if (!s) {
    s = new StageStore();
    stores.set(director, s);
  }
  return s;
}

/** The stage store of the current UiRoot, its environment kept current (anchors, layout, settings, motion). */
export function useStageStore(): StageStore {
  const root = useUiRoot();
  const reduced = useReducedMotion();
  const store = stageStoreFor(root.director);
  store.configure({ anchors: root.anchors, layout: root.layout, settings: root.settings, reduced });
  return store;
}

/** A slice of the stage state; re-renders when it changes (selectors must return stable values). */
export function useStageState<T>(select: (s: StageState) => T, store?: StageStore): T {
  const own = useStageStore();
  const s = store ?? own;
  return useSyncExternalStore(s.subscribe, () => select(s.getState()), () => select(s.getState()));
}

/** Register the store's named handlers with the root's director while mounted. */
export function useStageBeats(names: readonly StageHandler[], store?: StageStore): void {
  const root = useUiRoot();
  const own = useStageStore();
  const s = store ?? own;
  const key = names.join(",");
  const list = useRef(names);
  list.current = names;
  useEffect(() => s.attach(root.director, list.current), [s, root.director, key]);
}

/**
 * The big moment waiting for Continue (`pauseOnReveals`): "headline" (the newspapers) or "scoring"
 * (the scoring sheet), else null; `proceed()` ends the wait. For the orders slip's "Continue ⎵" button.
 */
export function useStageWaiting(): { waiting: StageState["waiting"]; proceed(): void } {
  const store = useStageStore();
  const waiting = useStageState(s => s.waiting, store);
  return { waiting, proceed: store.proceed };
}
