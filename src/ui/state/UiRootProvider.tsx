/**
 * The root of the React UI (ui-spec §15.3 W1 state rows): supplies `UiRootContext` and
 * `OverlayContext` (src/ui/state/context.ts).
 *
 *  - `vm`: `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`;
 *  - persisted settings (settings.ts), the layout (useLayout.ts, or a fixed `layout` prop);
 *  - one anchor registry and one Director (src/ui/runner) for the whole tree;
 *  - the toast queue (the Toaster dismisses each after its `ms`) and the card-zoom state;
 *  - `<html data-human data-motion data-labels data-patterns>` and the inline `--ts-speed`.
 *
 * The frame runner is a separate provider (`ShownProvider` from src/ui/runner) inside this one.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { GameController } from "../../game/contract";
import { createAnchorRegistry } from "../runner/anchors";
import { createDirector } from "../runner/director";
import { SPEED_FACTOR, TIMING, type LayoutKind } from "../theme";
import type { UiRoot, UiSettings } from "../ui-contract";
import { OverlayContext, UiRootContext, type OverlayState, type ToastItem, type ZoomState } from "./context";
import { settingsStore as pageSettingsStore, useSettings, type SettingsStore } from "./settings";
import { useLayout } from "./useLayout";

export { useUiRoot, useVm, useOverlays } from "./context";

/** At most this many toasts at once; the oldest goes first. */
export const MAX_TOASTS = 3;

export interface UiRootProviderProps {
  controller: GameController;
  children?: ReactNode;
  /** A fixed arrangement (demos, tests); default: from the viewport. */
  layout?: LayoutKind;
  /** Where settings live (default: the page store over localStorage). */
  settingsStore?: SettingsStore;
  /** Write the root attributes on <html> (default true; tests and embedded demos may turn it off). */
  rootAttributes?: boolean;
}

/** The `--ts-speed` value for a speed setting (never 0, so CSS `calc()` never divides by zero). */
export function cssSpeed(speed: UiSettings["speed"]): string {
  const f = SPEED_FACTOR[speed];
  return String(f > 0 ? f : 0.0001);
}

/** The <html> attributes for these settings and side (null = remove). */
export function rootAttributes(settings: UiSettings, humanSide: string | null): Record<string, string | null> {
  return {
    "data-human": humanSide,
    "data-motion": settings.motion === "system" ? null : settings.motion,
    "data-labels": settings.mapLabels === 100 ? null : String(settings.mapLabels),
    "data-patterns": settings.patterns ? "on" : null,
  };
}

export function UiRootProvider(props: UiRootProviderProps) {
  const { controller } = props;
  // Bound here: controllers are classes, their methods are not bound.
  const subscribe = useCallback((l: () => void) => controller.subscribe(l), [controller]);
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const vm = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const store = props.settingsStore ?? pageSettingsStore();
  const [settings, setSettings] = useSettings(store);
  const viewportLayout = useLayout();
  const layout = props.layout ?? viewportLayout;
  const anchors = useMemo(() => createAnchorRegistry(), []);
  const director = useMemo(() => createDirector(), []);

  // ── toasts ──
  // The provider only stores and removes them: the Toaster (src/ui/common) runs each toast's countdown and
  // calls dismissToast, pausing it while the pointer or focus is on the toast.
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const dismissToast = useCallback((id: number) => {
    setToasts(list => list.filter(x => x.id !== id));
  }, []);
  const toast = useCallback<UiRoot["toast"]>((message, opts = {}) => {
    const item: ToastItem = { id: nextId.current++, message, tone: opts.tone ?? "info", ms: opts.ms ?? TIMING.toast.default };
    setToasts(list => [...list, item].slice(-MAX_TOASTS));
  }, []);

  // ── card zoom ──
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const zoomCard = useCallback<UiRoot["zoomCard"]>((card, from) => setZoom({ card, from: from ?? null }), []);
  const closeZoom = useCallback(() => setZoom(null), []);

  // ── root attributes ──
  const writeRoot = props.rootAttributes ?? true;
  useEffect(() => {
    if (!writeRoot || typeof document === "undefined") return;
    const html = document.documentElement;
    for (const [k, v] of Object.entries(rootAttributes(settings, vm.humanSide))) {
      if (v === null) html.removeAttribute(k);
      else html.setAttribute(k, v);
    }
    html.style.setProperty("--ts-speed", cssSpeed(settings.speed));
  }, [writeRoot, settings, vm.humanSide]);
  useEffect(() => {
    if (!writeRoot || typeof document === "undefined") return;
    return () => {
      const html = document.documentElement;
      for (const k of ["data-human", "data-motion", "data-labels", "data-patterns"]) html.removeAttribute(k);
      html.style.removeProperty("--ts-speed");
    };
  }, [writeRoot]);

  const root = useMemo<UiRoot>(
    () => ({ controller, vm, layout, settings, setSettings, anchors, director, zoomCard, toast }),
    [controller, vm, layout, settings, setSettings, anchors, director, zoomCard, toast],
  );
  const overlays = useMemo<OverlayState>(() => ({ toasts, dismissToast, zoom, closeZoom }), [toasts, dismissToast, zoom, closeZoom]);

  return (
    <UiRootContext.Provider value={root}>
      <OverlayContext.Provider value={overlays}>{props.children}</OverlayContext.Provider>
    </UiRootContext.Provider>
  );
}
