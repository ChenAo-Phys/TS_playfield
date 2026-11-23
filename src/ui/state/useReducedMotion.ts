/**
 * Reduced motion (ui-spec §9.3): on when the system asks for it (`prefers-reduced-motion: reduce`)
 * unless the setting says "full", or when the setting says "reduce".
 *
 * Inside <UiRootProvider> the setting comes from the root; outside, from the page settings store.
 */
import { useContext, useEffect, useState } from "react";
import type { UiSettings } from "../ui-contract";
import { UiRootContext } from "./context";
import { createSettingsStore, settingsStore, useSettings } from "./settings";

/** Outside a root the page store decides; inside, the root's settings (this one is never read). */
const UNUSED = createSettingsStore(null);

const QUERY = "(prefers-reduced-motion: reduce)";

/** The rule itself (pure). */
export function isReducedMotion(setting: UiSettings["motion"], systemPrefersReduced: boolean): boolean {
  return setting === "reduce" || (setting === "system" && systemPrefersReduced);
}

export function systemPrefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** The system preference, live. */
export function useSystemReducedMotion(): boolean {
  const [reduce, setReduce] = useState(systemPrefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

export function useReducedMotion(): boolean {
  const root = useContext(UiRootContext);
  const [pageSettings] = useSettings(root ? UNUSED : settingsStore());
  const system = useSystemReducedMotion();
  return isReducedMotion((root?.settings ?? pageSettings).motion, system);
}
