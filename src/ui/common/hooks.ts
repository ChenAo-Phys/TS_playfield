/**
 * Small interaction hooks shared by the UI (ui-spec §12 "Pointer"):
 *  - useHoverIntent(ms): hover (mouse / pen) held for `ms` → active (card zoom after 250 ms).
 *  - useLongPress(ms): touch / pen press held for `ms` without moving → callback (350 ms, vibrate 10 ms);
 *    the click that follows a long press is swallowed.
 *  - usePrefersReducedMotion(): the effective reduced-motion flag (settings × system).
 */
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { UiRootContext } from "../state/context";

// ── Hover intent ────────────────────────────────────────────────────────────────────────────
export interface HoverIntentOptions {
  /** Called once the pointer has rested for `ms`. */
  onStart?(el: Element): void;
  /** Called when the pointer leaves after onStart ran. */
  onEnd?(): void;
  /** Default true. */
  enabled?: boolean;
}

export interface HoverIntent {
  /** True between onStart and the pointer leaving. */
  active: boolean;
  bind: {
    onPointerEnter(e: ReactPointerEvent<Element>): void;
    onPointerLeave(e: ReactPointerEvent<Element>): void;
    onPointerDown(e: ReactPointerEvent<Element>): void;
  };
  /** Cancel a pending intent (and end an active one). */
  cancel(): void;
}

export function useHoverIntent(ms = 250, opts: HoverIntentOptions = {}): HoverIntent {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const cancel = useCallback(() => {
    clear();
    if (activeRef.current) {
      activeRef.current = false;
      setActive(false);
      optsRef.current.onEnd?.();
    }
  }, []);
  useEffect(() => cancel, [cancel]);

  const bind = {
    onPointerEnter(e: ReactPointerEvent<Element>) {
      if (e.pointerType === "touch" || optsRef.current.enabled === false) return;
      const el = e.currentTarget;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        activeRef.current = true;
        setActive(true);
        optsRef.current.onStart?.(el);
      }, ms);
    },
    onPointerLeave() {
      cancel();
    },
    onPointerDown(e: ReactPointerEvent<Element>) {
      // A press is not a hover: don't open a peek under the finger / while dragging.
      if (e.pointerType === "touch") clear();
    },
  };
  return { active, bind, cancel };
}

// ── Long press ──────────────────────────────────────────────────────────────────────────────
export interface LongPressOptions {
  /** Movement (px) that cancels the press. Default 8. */
  tolerance?: number;
  /** navigator.vibrate(10) when it fires. Default true. */
  vibrate?: boolean;
  /** Also for a mouse (default false: a mouse has right-click). */
  mouse?: boolean;
  enabled?: boolean;
}

export interface LongPress {
  bind: {
    onPointerDown(e: ReactPointerEvent<Element>): void;
    onPointerMove(e: ReactPointerEvent<Element>): void;
    onPointerUp(): void;
    onPointerCancel(): void;
    onPointerLeave(): void;
    onContextMenu(e: ReactMouseEvent<Element>): void;
    onClickCapture(e: ReactMouseEvent<Element>): void;
  };
}

export function useLongPress(ms = 350, onLongPress: (el: Element) => void, opts: LongPressOptions = {}): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onLongPress);
  cb.current = onLongPress;
  const { tolerance = 8, vibrate = true, mouse = false, enabled = true } = opts;

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => clear, []);

  return {
    bind: {
      onPointerDown(e) {
        if (!enabled || (e.pointerType === "mouse" && !mouse) || e.button > 0) return;
        clear();
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        const el = e.currentTarget;
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          if (vibrate) {
            try { globalThis.navigator?.vibrate?.(10); } catch { /* not allowed */ }
          }
          cb.current(el);
        }, ms);
      },
      onPointerMove(e) {
        const s0 = start.current;
        if (!s0) return;
        if (Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > tolerance) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu(e) {
        // Touch browsers open a context menu on a long press: ours replaces it.
        if (fired.current || timer.current !== null) e.preventDefault();
      },
      onClickCapture(e) {
        if (fired.current) {
          fired.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}

// ── Reduced motion ──────────────────────────────────────────────────────────────────────────
const QUERY = "(prefers-reduced-motion: reduce)";

function systemReduced(): boolean {
  try {
    return !!globalThis.matchMedia?.(QUERY).matches;
  } catch {
    return false;
  }
}

function subscribeSystem(listener: () => void): () => void {
  let mq: MediaQueryList | null = null;
  try { mq = globalThis.matchMedia?.(QUERY) ?? null; } catch { mq = null; }
  mq?.addEventListener?.("change", listener);
  // The settings override is an attribute on <html> (set by the shell): follow it too.
  let mo: MutationObserver | null = null;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(listener);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  }
  return () => {
    mq?.removeEventListener?.("change", listener);
    mo?.disconnect();
  };
}

function htmlMotion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute("data-motion");
}

/** Reduced motion now, outside React: `<html data-motion>` (settings) wins, else the system preference. */
export function prefersReducedMotion(): boolean {
  const attr = htmlMotion();
  if (attr === "reduce") return true;
  if (attr === "full") return false;
  return systemReduced();
}

/**
 * The effective reduced-motion flag: the settings' `motion` ("reduce" / "full") when a UiRoot is
 * mounted, else `<html data-motion>`, else the system preference. Re-renders when any of them changes.
 */
export function usePrefersReducedMotion(): boolean {
  const root = useContext(UiRootContext);
  const fromSystem = useSyncExternalStore(subscribeSystem, prefersReducedMotion, () => false);
  const setting = root?.settings.motion;
  if (setting === "reduce") return true;
  if (setting === "full") return false;
  return fromSystem;
}
