/**
 * The anchor registry (ui-spec §9.6, §15.1 `AnchorRegistry`): components register the elements
 * flights, dice trays and chips start from or land on; `rect(id)` is the element's viewport rect,
 * or null when it is not mounted or not visible (zero size, `display: none`, hidden).
 *
 * `ref(id)` returns the same callback for the same id, so React does not detach and re-attach it on
 * every render. Several elements may register one id (a card in the hand and in the slip clip): the
 * most recent visible one wins. Detached elements are dropped lazily, and after every detach: React 18
 * calls a ref with null before it removes the host node (the element is still connected then), so the
 * registry prunes again once the commit is over (a microtask). Otherwise every finished game's screen
 * stayed reachable from the registry (QA Q-011).
 */
import type { AnchorId, AnchorRegistry } from "../ui-contract";

export interface RunnerAnchors extends AnchorRegistry {
  /** The registered element (connected), if any. */
  element(id: AnchorId): Element | null;
  /** Whether `id` has a visible element (rect non-null). */
  has(id: AnchorId): boolean;
  /** Every id with a connected element (debugging, demo). */
  ids(): AnchorId[];
  /** How many elements the registry holds, connected or not, without pruning (tests, leak checks). */
  retained(): number;
}

const later: (fn: () => void) => void = typeof queueMicrotask === "function" ? queueMicrotask : fn => { void Promise.resolve().then(fn); };

function visibleRect(el: Element): DOMRect | null {
  if (!el.isConnected) return null;
  const html = el as HTMLElement;
  if (typeof html.checkVisibility === "function" && !html.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions)) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

export function createAnchorRegistry(): RunnerAnchors {
  const els = new Map<AnchorId, Element[]>();
  const refs = new Map<AnchorId, (el: Element | null) => void>();
  const live = (id: AnchorId): Element[] => {
    const list = (els.get(id) ?? []).filter(e => e.isConnected);
    if (list.length) els.set(id, list);
    else els.delete(id);
    return list;
  };
  return {
    ref(id) {
      let cb = refs.get(id);
      if (!cb) {
        cb = (el: Element | null) => {
          if (el) {
            const list = (els.get(id) ?? []).filter(e => e !== el);
            list.push(el);
            els.set(id, list);
          } else {
            live(id);
            later(() => live(id));
          }
        };
        refs.set(id, cb);
      }
      return cb;
    },
    rect(id) {
      const list = live(id);
      for (let i = list.length - 1; i >= 0; i--) {
        const r = visibleRect(list[i]!);
        if (r) return r;
      }
      return null;
    },
    element(id) {
      const list = live(id);
      return list[list.length - 1] ?? null;
    },
    has(id) {
      return this.rect(id) !== null;
    },
    ids() {
      return [...els.keys()].filter(id => live(id).length > 0);
    },
    retained() {
      let n = 0;
      for (const list of els.values()) n += list.length;
      return n;
    },
  };
}
