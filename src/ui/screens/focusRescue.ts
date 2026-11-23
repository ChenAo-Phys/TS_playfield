/**
 * Lost-focus rescue for the game screen (ui-spec §12; QA Q-043). Many controls disappear the moment they
 * are used: a play-mode row, Continue on the headline papers or the scoring sheet, Review board on the telex,
 * a card going back to the hand. The browser then drops focus to `<body>`, and a keyboard or screen-reader
 * user starts again from the top of the page every action round.
 *
 * The rescue watches the document: when the element that had focus is removed and focus is left on `<body>`,
 * it moves focus to a stable place (the orders slip, else the map). It never takes focus from anything: a
 * control that keeps focus, a dialog that focuses itself, or a click on empty space (the old element is still
 * there) are left alone. Components that hand focus on explicitly (a dialog returning focus to its opener)
 * run before it and win.
 */
import { useEffect, useRef } from "react";

/** Should focus be rescued? Only when it was lost by removal: nothing (or `<body>`) has it and the last
 *  focused element left the document. */
export function focusLost(active: Element | null, last: Element | null, body: Element | null): boolean {
  if (active && active !== body && active !== body?.ownerDocument?.documentElement) return false;
  return !!last && last !== body && !last.isConnected;
}

/**
 * Make `el` focusable by script (tabindex −1 unless it has one; marked `data-focus-region`, which base.css rings
 * when keyboard-focused) and focus it without scrolling.
 */
export function focusQuietly(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (!el.hasAttribute("tabindex") && el.tabIndex < 0) {
    el.setAttribute("tabindex", "-1");
    el.setAttribute("data-focus-region", "");
  }
  el.focus({ preventScroll: true });
  return el.ownerDocument.activeElement === el;
}

/**
 * While mounted, give lost focus to `fallback()` (an element, or null to try again on the next change).
 * `fallback` is read when needed, so it may close over refs.
 */
export function useFocusRescue(fallback: () => HTMLElement | null, enabled = true): void {
  const pick = useRef(fallback);
  pick.current = fallback;
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    let last: Element | null = document.activeElement;
    const onIn = (e: FocusEvent) => { last = e.target as Element | null; };
    // A blur that leaves the element in the page (a click on empty space, another window) is deliberate.
    const onOut = (e: FocusEvent) => {
      const el = e.target as Element | null;
      queueMicrotask(() => {
        if (el && el.isConnected && last === el && document.activeElement !== el) last = null;
      });
    };
    const check = () => {
      if (!focusLost(document.activeElement, last, document.body)) return;
      const el = pick.current();
      if (el && focusQuietly(el)) last = el;
    };
    document.addEventListener("focusin", onIn, true);
    document.addEventListener("focusout", onOut, true);
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("focusin", onIn, true);
      document.removeEventListener("focusout", onOut, true);
      mo.disconnect();
    };
  }, [enabled]);
}
