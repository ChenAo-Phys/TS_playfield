/**
 * Touch or mouse wording (QA Q-032): instructions say "Tap" on a touch screen and "Click / Right-click /
 * Enter" with a mouse. The signal is the last pointer used (a tablet with a mouse, a touch laptop: the
 * input in hand wins); before any input, the device's primary pointer (`(hover: none) and (pointer:
 * coarse)`). Pen counts as touch (it taps).
 *
 *   const touch = useTouchUi();
 *   t(touch ? "ui_prompts:touch.dialogHint" : "ui_prompts:dialog.hint")
 *
 * `TouchUiContext` forces it (tests, demos); server rendering is "mouse".
 */
import { createContext, useContext, useSyncExternalStore } from "react";

/** The media query of a touch-first device. */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

interface WindowLike {
  matchMedia?(query: string): { matches: boolean; addEventListener?(type: "change", fn: () => void): void; removeEventListener?(type: "change", fn: () => void): void };
  addEventListener(type: "pointerdown", fn: (e: { pointerType?: string }) => void, opts?: { capture?: boolean; passive?: boolean }): void;
  removeEventListener(type: "pointerdown", fn: (e: { pointerType?: string }) => void, opts?: { capture?: boolean }): void;
}

export interface TouchSignal {
  get(): boolean;
  subscribe(fn: () => void): () => void;
}

/** A touch signal over a window (exported for tests; the app uses the page's). */
export function createTouchSignal(win: WindowLike | null): TouchSignal {
  let last: boolean | null = null;
  const listeners = new Set<() => void>();
  const media = (): boolean => {
    try {
      return !!win?.matchMedia?.(TOUCH_QUERY).matches;
    } catch {
      return false;
    }
  };
  const get = () => last ?? media();
  const notify = () => { for (const fn of [...listeners]) fn(); };
  const onPointer = (e: { pointerType?: string }) => {
    const type = e.pointerType;
    if (type !== "touch" && type !== "pen" && type !== "mouse") return;
    const before = get();
    last = type !== "mouse";
    if (get() !== before) notify();
  };
  let mql: ReturnType<NonNullable<WindowLike["matchMedia"]>> | null = null;
  return {
    get,
    subscribe(fn) {
      if (!win) return () => undefined;
      if (!listeners.size) {
        win.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
        try {
          mql = win.matchMedia?.(TOUCH_QUERY) ?? null;
          mql?.addEventListener?.("change", notify);
        } catch {
          mql = null;
        }
      }
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (!listeners.size) {
          win.removeEventListener("pointerdown", onPointer, { capture: true });
          mql?.removeEventListener?.("change", notify);
          mql = null;
        }
      };
    },
  };
}

let page: TouchSignal | null = null;
function pageSignal(): TouchSignal {
  if (!page) page = createTouchSignal(typeof window === "undefined" ? null : (window as unknown as WindowLike));
  return page;
}

/** Force touch (true) or mouse (false) wording below; null (default) follows the device. */
export const TouchUiContext = createContext<boolean | null>(null);

/** True when instructions should speak of taps (see the module comment). */
export function useTouchUi(): boolean {
  const forced = useContext(TouchUiContext);
  const signal = pageSignal();
  const auto = useSyncExternalStore(signal.subscribe, signal.get, () => false);
  return forced ?? auto;
}
