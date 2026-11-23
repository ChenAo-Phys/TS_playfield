/**
 * What the rail shows while its beats animate (ui-spec §9.4 rows `hand-revealed` (AI), `headline-chosen`
 * (AI), `effect-on` / `effect-off`). Like the console's track store: one per Director, written by the
 * beat handlers ahead of `Shown.state`, cleared at the commit (when the state has the same facts).
 */
import { useContext, useSyncExternalStore } from "react";
import { UiRootContext } from "../state/context";
import type { Director } from "../ui-contract";

export interface RailView {
  /** AI cards being revealed: backs flip to faces one by one, a "Revealed" stamp. */
  reveal: { cards: readonly number[]; seq: number; per: number; stagger: number; reduced: boolean } | null;
  /** The AI's headline card sliding into its slot, a "Committed" stamp. */
  headline: { seq: number; ms: number; reduced: boolean } | null;
  /** Effects arriving (flag → beat seq) and leaving (torn off, then hidden until the commit). */
  fxOn: Readonly<Record<string, { seq: number; ms: number; reduced: boolean }>>;
  fxOff: Readonly<Record<string, { seq: number; ms: number; reduced: boolean }>>;
}

export const EMPTY_RAIL_VIEW: RailView = Object.freeze({ reveal: null, headline: null, fxOn: {}, fxOff: {} }) as RailView;

export interface RailStore {
  get(): RailView;
  subscribe(fn: () => void): () => void;
  update(fn: (v: RailView) => RailView): void;
  reset(): void;
  nextSeq(): number;
}

export function createRailStore(): RailStore {
  let view: RailView = EMPTY_RAIL_VIEW;
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
      if (view === EMPTY_RAIL_VIEW) return;
      view = EMPTY_RAIL_VIEW;
      emit();
    },
    nextSeq: () => ++seq,
  };
}

const stores = new WeakMap<Director, RailStore>();

export function railStoreFor(director: Director): RailStore {
  let s = stores.get(director);
  if (!s) {
    s = createRailStore();
    stores.set(director, s);
  }
  return s;
}

const noopSubscribe = () => () => undefined;
const emptyView = () => EMPTY_RAIL_VIEW;

export function useRailView(): RailView {
  const root = useContext(UiRootContext);
  const store = root ? railStoreFor(root.director) : null;
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.get ?? emptyView, store?.get ?? emptyView);
}
