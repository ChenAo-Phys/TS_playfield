/**
 * Test doubles for the console + rail markup and beat tests: a UiRoot over a real Director, a recording
 * anchor registry, the overlay context and a static `Shown`.
 */
import { createElement, type ReactNode } from "react";
import type { Frame, GameController, LogEntry, Prompt, PublicState, Side, ViewModel } from "../../../src/game/contract";
import { createDirector, type RunnerDirector } from "../../../src/ui/runner/director";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { OverlayContext, UiRootContext, type OverlayState } from "../../../src/ui/state/context";
import type { LayoutKind } from "../../../src/ui/theme";
import { DEFAULT_SETTINGS, type AnchorId, type BeatContext, type Shown, type UiRoot, type UiSettings } from "../../../src/ui/ui-contract";

export interface Harness {
  root: UiRoot;
  director: RunnerDirector;
  calls: { zoom: number[]; toasts: unknown[] };
  wrap(el: ReactNode, shown?: Partial<Shown>): ReactNode;
}

export function harness(o: {
  state?: PublicState | null;
  log?: readonly LogEntry[];
  humanSide?: Side;
  prompt?: Prompt | null;
  aiThinking?: boolean;
  layout?: LayoutKind;
  settings?: Partial<UiSettings>;
  rects?: Partial<Record<AnchorId, DOMRect>>;
} = {}): Harness {
  const director = createDirector();
  const calls = { zoom: [] as number[], toasts: [] as unknown[] };
  const state = o.state ?? null;
  const vm: ViewModel = {
    status: "playing", humanSide: o.humanSide ?? state?.humanSide ?? "USSR",
    frame: state ? ({ seq: 1, state, regionScores: [] as never, actor: null, events: [], auto: false } as Frame) : null,
    queued: 0, prompt: o.prompt ?? null, aiThinking: o.aiThinking ?? false, canUndo: false, log: o.log ?? [], ending: null, hasSavedGame: false,
  };
  const controller = {
    subscribe: () => () => undefined, getSnapshot: () => vm, boot: async () => undefined, newGame: async () => undefined,
    resume: async () => false, choose: () => undefined, undo: () => undefined, resign: () => undefined, ackFrame: () => undefined,
    coupOdds: () => null, effectiveOps: () => null,
  } as GameController;
  const root: UiRoot = {
    controller, vm, layout: o.layout ?? "desktop", settings: { ...DEFAULT_SETTINGS, ...o.settings }, setSettings: () => undefined,
    anchors: { ref: () => () => undefined, rect: id => o.rects?.[id] ?? null },
    director,
    zoomCard: card => { calls.zoom.push(card); },
    toast: m => { calls.toasts.push(m); },
  };
  const overlays: OverlayState = { toasts: [], dismissToast: () => undefined, zoom: null, closeZoom: () => undefined };
  const wrap = (el: ReactNode, shown: Partial<Shown> = {}) =>
    createElement(UiRootContext.Provider, { value: root },
      createElement(OverlayContext.Provider, { value: overlays },
        createElement(StaticShownProvider, { value: staticShown(state, null, shown) }, el)));
  return { root, director, calls, wrap };
}

/** A beat context (speed 1 unless given; never aborted unless `signal` says so). */
export function beatCtx(o: { motion?: number; hold?: number; signal?: AbortSignal; events?: Frame["events"]; humanSide?: Side } = {}): BeatContext {
  const frame = { seq: 2, state: {} as PublicState, regionScores: [] as never, actor: null, events: o.events ?? [], auto: false } as Frame;
  return {
    frame, before: {} as PublicState, humanSide: o.humanSide ?? "USSR", speed: { motion: o.motion ?? 1, hold: o.hold ?? 1 },
    signal: o.signal ?? new AbortController().signal, settings: DEFAULT_SETTINGS,
  };
}

/** A DOMRect stand-in for Node. */
export function rect(x: number, y: number, w = 20, h = 20): DOMRect {
  return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => null } as DOMRect;
}

/** Visible text of server markup, one string per text run (tags removed, entities decoded). */
export function textRuns(html: string): string[] {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .split(/<[^>]+>/)
    .map(s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim())
    .filter(Boolean);
}

/** Text runs a translator would have to have written: anything with a letter or a CJK character. */
export function wordyRuns(html: string): string[] {
  return textRuns(html).filter(s => /[A-Za-z一-鿿]/.test(s));
}

/**
 * Pseudo-language check: the visible text with every ⟦…⟧ region (nested ones included) removed, and
 * SVG artwork dropped (the card back's "TS" logo, the face-down China Card's bilingual title). Anything
 * wordy left was not looked up in a catalog.
 */
export function unmarkedWords(html: string): string[] {
  const text = textRuns(html.replace(/<svg[\s\S]*?<\/svg>/g, "")).join(" ");
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "⟦") depth++;
    else if (ch === "⟧") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out.split(/\s+/).filter(w => w && w !== "TS" && /[A-Za-z\u4e00-\u9fff]/.test(w));
}
