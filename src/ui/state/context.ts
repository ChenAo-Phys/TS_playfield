/**
 * The React contexts every src/ui component reads. The provider (src/ui/state/UiRootProvider.tsx)
 * supplies both; components only consume. Coordinator-owned like ui-contract.ts: change it only
 * together with docs/design/ui-spec.md §15.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ViewModel } from "../../game/contract";
import type { UiRoot } from "../ui-contract";

export const UiRootContext = createContext<UiRoot | null>(null);

export function useUiRoot(): UiRoot {
  const root = useContext(UiRootContext);
  if (!root) throw new Error("useUiRoot() used outside <UiRootProvider>");
  return root;
}

/** The controller's current ViewModel (re-renders on every controller change). */
export function useVm(): ViewModel {
  return useUiRoot().vm;
}

// ── Overlay state held by the provider: UiRoot.toast() / UiRoot.zoomCard() write it, ─────────────
// ── common/Toaster and cards/CardZoomHost render it. ───────────────────────────────────────────────
export interface ToastItem {
  id: number;
  message: ReactNode;
  tone: "info" | "warn";
  ms: number;
}
export interface ZoomState {
  card: number;
  /** Element the zoom opened from (popover anchor / focus return), if any. */
  from: Element | null;
}
export interface OverlayState {
  toasts: readonly ToastItem[];
  dismissToast(id: number): void;
  zoom: ZoomState | null;
  closeZoom(): void;
}

export const OverlayContext = createContext<OverlayState | null>(null);

export function useOverlays(): OverlayState {
  const o = useContext(OverlayContext);
  if (!o) throw new Error("useOverlays() used outside <UiRootProvider>");
  return o;
}
