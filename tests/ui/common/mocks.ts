/**
 * Test doubles for the UiRoot / overlay contexts (no provider exists in these tests).
 */
import { createElement, type ReactNode } from "react";
import type { GameController, Prompt, PublicState, Side, ViewModel } from "../../../src/game/contract";
import { OverlayContext, UiRootContext, type OverlayState, type ToastItem, type ZoomState } from "../../../src/ui/state/context";
import { DEFAULT_SETTINGS, type UiRoot, type UiSettings } from "../../../src/ui/ui-contract";
import type { LayoutKind } from "../../../src/ui/theme";

export interface MockOptions {
  layout?: LayoutKind;
  prompt?: Prompt | null;
  humanSide?: Side;
  space?: { US: number; USSR: number };
  effectiveOps?: (card: number) => number | null;
  settings?: Partial<UiSettings>;
  zoom?: ZoomState | null;
  toasts?: ToastItem[];
}

export function mockRoot(o: MockOptions = {}): { root: UiRoot; overlays: OverlayState; calls: { zoom: [number, Element | null][]; toasts: unknown[]; closed: number; dismissed: number[] } } {
  const calls = { zoom: [] as [number, Element | null][], toasts: [] as unknown[], closed: 0, dismissed: [] as number[] };
  const state = { space: o.space ?? { US: 2, USSR: 1 } } as unknown as PublicState;
  const vm: ViewModel = {
    status: "playing", humanSide: o.humanSide ?? "USSR",
    frame: { seq: 1, state, regionScores: [] as never, actor: null, events: [], auto: false },
    queued: 0, prompt: o.prompt ?? null, aiThinking: false, canUndo: false, log: [], ending: null, hasSavedGame: false,
  };
  const controller = {
    subscribe: () => () => undefined, getSnapshot: () => vm, boot: async () => undefined, newGame: async () => undefined,
    resume: async () => false, choose: () => undefined, undo: () => undefined, resign: () => undefined, ackFrame: () => undefined,
    coupOdds: () => null, effectiveOps: o.effectiveOps ?? (() => null),
  } as GameController;
  const root: UiRoot = {
    controller, vm, layout: o.layout ?? "desktop", settings: { ...DEFAULT_SETTINGS, ...o.settings }, setSettings: () => undefined,
    anchors: { ref: () => () => undefined, rect: () => null },
    director: { on: () => () => undefined, run: async () => undefined },
    zoomCard: (card, from) => { calls.zoom.push([card, from ?? null]); },
    toast: m => { calls.toasts.push(m); },
  };
  const overlays: OverlayState = {
    toasts: o.toasts ?? [], dismissToast: id => { calls.dismissed.push(id); },
    zoom: o.zoom ?? null, closeZoom: () => { calls.closed++; },
  };
  return { root, overlays, calls };
}

/** Wrap an element in both contexts. */
export function withRoot(el: ReactNode, root: UiRoot, overlays: OverlayState): ReactNode {
  return createElement(UiRootContext.Provider, { value: root }, createElement(OverlayContext.Provider, { value: overlays }, el));
}

/** A minimal prompt. */
export function prompt(p: Partial<Prompt>): Prompt {
  return {
    kind: "action-card", promptId: 1, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 1, maxPerCountry: 0,
    options: [], cards: [], countries: [], title: { key: "ui:app.title" }, ...p,
  };
}
