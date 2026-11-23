/**
 * Controller previews for the country tooltip (ui-spec §8.12): coup odds (`coupOdds`) and
 * realignment odds (`realignOdds`, gap G5), asked for one country at a time on hover (debounced
 * 120 ms, never for every target at once) and cached per controller and promptId.
 */
import { useEffect, useState } from "react";
import type { CoupOdds, GameController, Prompt, RealignOdds } from "../../game/contract";

export type PreviewKind = "coup" | "realign";
type Value = CoupOdds | RealignOdds | null;

const caches = new WeakMap<object, { promptId: number; values: Map<string, Value> }>();

/** Debounce of a hover before a preview is computed (ms). */
export const PREVIEW_DEBOUNCE_MS = 120;

function cacheOf(controller: GameController, promptId: number): Map<string, Value> {
  let c = caches.get(controller);
  if (!c || c.promptId !== promptId) {
    c = { promptId, values: new Map() };
    caches.set(controller, c);
  }
  return c.values;
}

/** The cached preview, or undefined when it has not been asked for yet. */
export function cachedPreview(controller: GameController, prompt: Prompt, kind: PreviewKind, country: number): Value | undefined {
  return cacheOf(controller, prompt.promptId).get(`${kind}:${country}`);
}

/** Ask the controller now (and cache the answer). */
export function previewNow(controller: GameController, prompt: Prompt, kind: "coup", country: number): CoupOdds | null;
export function previewNow(controller: GameController, prompt: Prompt, kind: "realign", country: number): RealignOdds | null;
export function previewNow(controller: GameController, prompt: Prompt, kind: PreviewKind, country: number): Value;
export function previewNow(controller: GameController, prompt: Prompt, kind: PreviewKind, country: number): Value {
  const cache = cacheOf(controller, prompt.promptId);
  const key = `${kind}:${country}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let v: Value = null;
  try {
    v = kind === "coup" ? controller.coupOdds(country) : controller.realignOdds?.(country) ?? null;
  } catch {
    v = null;
  }
  cache.set(key, v);
  return v;
}

/** A preview for `country`: cached at once, else after the debounce; undefined while pending. */
export function usePreview<K extends PreviewKind>(controller: GameController, prompt: Prompt | null, kind: K | null, country: number): (K extends "coup" ? CoupOdds : RealignOdds) | null | undefined {
  type R = (K extends "coup" ? CoupOdds : RealignOdds) | null | undefined;
  const cached = prompt && kind ? cachedPreview(controller, prompt, kind, country) : undefined;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!prompt || !kind || cached !== undefined) return;
    const id = setTimeout(() => {
      previewNow(controller, prompt, kind, country);
      bump(n => n + 1);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [controller, prompt, kind, country, cached]);
  return cached as R;
}
