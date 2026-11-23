/**
 * UI root state (ui-spec §15.3, W1 state rows): the providers and hooks every component reads.
 *
 *   <UiRootProvider controller={controller}> … </UiRootProvider>
 *   const root = useUiRoot(); const vm = useVm(); const { toasts, zoom } = useOverlays();
 */
export { UiRootProvider, cssSpeed, rootAttributes, MAX_TOASTS, type UiRootProviderProps } from "./UiRootProvider";
export { useUiRoot, useVm, useOverlays, UiRootContext, OverlayContext, type OverlayState, type ToastItem, type ZoomState } from "./context";
export {
  loadSettings, saveSettings, sanitizeSettings, useSettings, settingsStore, createSettingsStore, SETTINGS_KEY,
  type SettingsStore, type SettingsStorage,
} from "./settings";
export { useLayout, currentLayout } from "./useLayout";
export { useReducedMotion, isReducedMotion, systemPrefersReducedMotion, useSystemReducedMotion } from "./useReducedMotion";
