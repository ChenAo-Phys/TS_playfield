/**
 * UI settings, persisted per device (ui-spec §11.2, §15.1 `UiSettings`): localStorage
 * "ts-playfield.ui.v1", merged over `DEFAULT_SETTINGS`, each field validated (a bad or old value
 * falls back to its default). Storage may be missing or throw (private mode): settings still work
 * for the session.
 *
 * One store per page: every `useSettings()` caller sees the same values.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, type UiSettings } from "../ui-contract";

export const SETTINGS_KEY = "ts-playfield.ui.v1";

/** The subset of Storage the settings need (tests pass a Map-backed one). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SettingsStorage | null {
  if (typeof window === "undefined") return null; // Node: no page storage (and no warning)
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

const ALLOWED: { [K in keyof UiSettings]: (v: unknown) => v is UiSettings[K] } = {
  speed: (v): v is UiSettings["speed"] => v === "slow" || v === "normal" || v === "fast" || v === "instant",
  motion: (v): v is UiSettings["motion"] => v === "system" || v === "reduce" || v === "full",
  confirmFinal: (v): v is boolean => typeof v === "boolean",
  pauseOnReveals: (v): v is boolean => typeof v === "boolean",
  sound: (v): v is boolean => typeof v === "boolean",
  mapLabels: (v): v is UiSettings["mapLabels"] => v === 100 || v === 115 || v === 130,
  patterns: (v): v is boolean => typeof v === "boolean",
  railCollapsed: (v): v is boolean => typeof v === "boolean",
  followAction: (v): v is boolean => typeof v === "boolean",
  cardImages: (v): v is UiSettings["cardImages"] => v === "follow" || v === "en" || v === "zh",
};

/** `raw` (anything) as valid settings: known fields with valid values, defaults elsewhere. */
export function sanitizeSettings(raw: unknown): UiSettings {
  const out: UiSettings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(ALLOWED) as (keyof UiSettings)[]) {
    if (ALLOWED[key](r[key])) (out as unknown as Record<string, unknown>)[key] = r[key];
  }
  return out;
}

export function loadSettings(storage: SettingsStorage | null = defaultStorage()): UiSettings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return text ? sanitizeSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: UiSettings, storage: SettingsStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s)));
  } catch {
    /* storage full or blocked: the settings still apply for this session */
  }
}

// ── The page's settings store ─────────────────────────────────────────────────────────────────

export interface SettingsStore {
  get(): UiSettings;
  set(patch: Partial<UiSettings>): void;
  subscribe(listener: () => void): () => void;
}

/** A settings store over `storage` (null = memory only). Writes are persisted at once. */
export function createSettingsStore(storage: SettingsStorage | null = defaultStorage(), initial?: Partial<UiSettings>): SettingsStore {
  let value = sanitizeSettings({ ...loadSettings(storage), ...initial });
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch) {
      const next = sanitizeSettings({ ...value, ...patch });
      if (JSON.stringify(next) === JSON.stringify(value)) return;
      value = next;
      saveSettings(value, storage);
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

let pageStore: SettingsStore | null = null;

/** The page-wide store (created on first use, over localStorage). */
export function settingsStore(): SettingsStore {
  pageStore ??= createSettingsStore();
  return pageStore;
}

/** The page's settings and a setter (re-renders on change). */
export function useSettings(store: SettingsStore = settingsStore()): [UiSettings, (patch: Partial<UiSettings>) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [value, store.set];
}
