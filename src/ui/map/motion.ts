/**
 * Small motion helpers for the map: the reduced-motion switch (ui-spec §9.3) and abortable waits.
 */

/** Reduced motion: `data-motion="reduce"`, or the system preference unless `data-motion="full"`. */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const m = document.documentElement.dataset.motion;
  if (m === "reduce") return true;
  if (m === "full") return false;
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Resolves after `ms`, or at once when the signal aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Run a WAAPI animation if the element supports it; returns it (or null). */
export function animate(el: Element | null | undefined, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== "function") return null;
  try {
    return (el as HTMLElement).animate(keyframes, opts);
  } catch {
    return null;
  }
}
