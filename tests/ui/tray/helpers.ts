/**
 * Test helpers for the tray: a UiRoot / overlay double on a recorded fixture, the Shown context, and a
 * fake director that records handlers.
 */
import { createElement, type ReactNode } from "react";
import type { Frame, Prompt, PublicState, ViewModel } from "../../../src/game/contract";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { OverlayContext, UiRootContext, type OverlayState, type ZoomState } from "../../../src/ui/state/context";
import { DEFAULT_SETTINGS, type AnchorId, type Beat, type BeatContext, type BeatHandler, type BeatKind, type Director, type OptionPolicy, type Shown, type UiRoot, type UiSettings } from "../../../src/ui/ui-contract";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

export interface TrayEnv {
  root: UiRoot;
  overlays: OverlayState;
  shown: Shown;
  state: PublicState;
  prompt: Prompt | null;
  calls: { zoom: [number, Element | null][]; toasts: unknown[]; anchors: AnchorId[] };
}

export function env(name: string, o: { layout?: LayoutKind; settings?: Partial<UiSettings>; vm?: Partial<ViewModel>; shown?: Partial<Shown>; zoom?: ZoomState | null; state?: PublicState } = {}): TrayEnv {
  const fx = fixture(name);
  const frame = fx.frames[fx.frames.length - 1]!;
  const state = o.state ?? frame.state;
  const vm: ViewModel = { ...fx.final, frame: { ...frame, state }, ...o.vm };
  const calls = { zoom: [] as [number, Element | null][], toasts: [] as unknown[], anchors: [] as AnchorId[] };
  const root: UiRoot = {
    // Enough of a controller for the prompt layer's store (the drawer's HandPromptBar): the fixture's view model.
    controller: { getSnapshot: () => vm, subscribe: () => () => undefined, effectiveOps: () => null, coupOdds: () => null } as unknown as UiRoot["controller"],
    vm,
    layout: o.layout ?? "desktop",
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    setSettings: () => undefined,
    anchors: { ref: id => { calls.anchors.push(id); return () => undefined; }, rect: () => null },
    director: { on: () => () => undefined, run: async () => undefined },
    zoomCard: (card, from) => { calls.zoom.push([card, from ?? null]); },
    toast: m => { calls.toasts.push(m); },
  };
  const overlays: OverlayState = { toasts: [], dismissToast: () => undefined, zoom: o.zoom ?? null, closeZoom: () => undefined };
  const shown = staticShown(state, frame.regionScores, o.shown);
  return { root, overlays, shown, state, prompt: vm.prompt, calls };
}

export function wrap(e: TrayEnv, el: ReactNode): ReactNode {
  return createElement(UiRootContext.Provider, { value: e.root },
    createElement(OverlayContext.Provider, { value: e.overlays },
      createElement(StaticShownProvider, { value: e.shown }, el)));
}

/** The prompt's card options as the prompt layer would pass them (instant, severity from warnings). */
export function offeredOf(prompt: Prompt | null): Map<number, OptionPolicy> {
  const m = new Map<number, OptionPolicy>();
  for (const option of prompt?.options ?? []) {
    if (option.kind !== "card") continue;
    const sev = option.warnings?.some(w => w.code === "scoring-stranded") ? "caution" : option.warnings?.length ? "info" : "none";
    m.set(option.id, { option, commit: sev === "caution" ? "stage" : "instant", severity: sev });
  }
  return m;
}

/** A director that keeps handlers per kind and runs them like the runner's. */
export function fakeDirector(): Director & { count(k: BeatKind): number } {
  const map = new Map<BeatKind, Set<BeatHandler>>();
  return {
    on(kind, handler) {
      const set = map.get(kind) ?? new Set();
      set.add(handler as BeatHandler);
      map.set(kind, set);
      return () => { set.delete(handler as BeatHandler); };
    },
    async run(beat, ctx) {
      await Promise.all([...(map.get(beat.k) ?? [])].map(h => (h as (b: Beat, c: BeatContext) => Promise<void>)(beat, ctx)));
    },
    count(k) { return map.get(k)?.size ?? 0; },
  };
}

export function ctxOf(frame: Frame, before: PublicState, o: { motion?: number; signal?: AbortSignal; humanSide?: "US" | "USSR" } = {}): BeatContext {
  return {
    frame, before, humanSide: o.humanSide ?? frame.state.humanSide,
    speed: { motion: o.motion ?? 1, hold: 1 },
    signal: o.signal ?? new AbortController().signal,
    settings: DEFAULT_SETTINGS,
  };
}
