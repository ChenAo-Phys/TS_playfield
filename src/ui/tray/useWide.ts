/**
 * `true` from 1600 CSS px wide (ui-spec §3.1: hand cards 112 × 157 there). False without a DOM.
 */
import { useSyncExternalStore } from "react";
import { WIDE_FROM } from "../theme";

const QUERY = `(min-width: ${WIDE_FROM}px)`;

function mq(): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

function subscribe(fn: () => void): () => void {
  const m = mq();
  m?.addEventListener?.("change", fn);
  return () => m?.removeEventListener?.("change", fn);
}

const get = () => !!mq()?.matches;
const getServer = () => false;

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, get, getServer);
}
