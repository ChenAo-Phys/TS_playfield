/**
 * What the console shows while a `track` beat animates (ui-spec §9.4 rows action-round, vp, defcon,
 * milops, space). The runner commits `frame.state` only after a frame's beats, so a beat handler
 * moves an instrument ahead of `Shown.state` by writing an override here; the override is dropped at
 * the commit, when `Shown.state` has caught up (same values, so nothing jumps).
 *
 * One store per Director (a WeakMap), so every mounted instrument -- the console, the tablet Status
 * flyout, the compact Status sheet -- reads the same overrides; the handlers are shared too (shared.ts).
 */
import { useContext, useSyncExternalStore } from "react";
import type { Side } from "../../game/contract";
import { UiRootContext } from "../state/context";
import type { Director } from "../ui-contract";

export interface TrackOverrides {
  vp?: number;
  defcon?: number;
  milOps?: Partial<Record<Side, number>>;
  space?: Partial<Record<Side, number>>;
  ar?: { ar: number; side: Side };
}

export type TrackAnimKey = "vp" | "defcon" | "ar" | "milops:US" | "milops:USSR" | "space:US" | "space:USSR";

export interface TrackAnim {
  /** Motion duration at the beat's speed (0 = jump). */
  ms: number;
  /** Increases with every beat, so a repeated change restarts the CSS animation. */
  seq: number;
  from: number;
  to: number;
  /** Reduced motion: no travel, a short cross-fade / flash only. */
  reduced: boolean;
}

export interface TrackView {
  over: TrackOverrides;
  anim: Readonly<Partial<Record<TrackAnimKey, TrackAnim>>>;
  /** The console border's alert flash (DEFCON degraded): its seq, 0 = none. */
  flash: number;
  /** A privilege box just reached: the Space instrument shows it for a moment. */
  perk: { side: Side; box: number; seq: number } | null;
}

export const EMPTY_TRACK_VIEW: TrackView = Object.freeze({ over: {}, anim: {}, flash: 0, perk: null }) as TrackView;

export interface TrackStore {
  get(): TrackView;
  subscribe(fn: () => void): () => void;
  update(fn: (v: TrackView) => TrackView): void;
  /** Drop overrides and animations (after a commit). The perk note outlives the commit. */
  reset(): void;
  nextSeq(): number;
}

export function createTrackStore(): TrackStore {
  let view: TrackView = EMPTY_TRACK_VIEW;
  let seq = 0;
  const subs = new Set<() => void>();
  const emit = () => { for (const fn of [...subs]) fn(); };
  return {
    get: () => view,
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    update(fn) {
      const next = fn(view);
      if (next !== view) {
        view = next;
        emit();
      }
    },
    reset() {
      if (!Object.keys(view.over).length && !Object.keys(view.anim).length && !view.flash) return;
      view = { over: {}, anim: {}, flash: 0, perk: view.perk };
      emit();
    },
    nextSeq: () => ++seq,
  };
}

const stores = new WeakMap<Director, TrackStore>();

/** The store shared by everything that animates with `director`. */
export function trackStoreFor(director: Director): TrackStore {
  let s = stores.get(director);
  if (!s) {
    s = createTrackStore();
    stores.set(director, s);
  }
  return s;
}

const noopSubscribe = () => () => undefined;
const emptyView = () => EMPTY_TRACK_VIEW;

/** The current overrides and animations (empty outside a UiRoot: stills, markup tests). */
export function useTrackView(): TrackView {
  const root = useContext(UiRootContext);
  const store = root ? trackStoreFor(root.director) : null;
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.get ?? emptyView, store?.get ?? emptyView);
}
