/**
 * The global keymap (ui-spec §12): `useKey(combo, handler, opts)` binds a key anywhere in the app,
 * `<KeyScope>` makes an open dialog capture keys, and Esc closes the topmost scope.
 *
 *   useKey("z", undo);                        // plain key (no modifiers, Shift not held)
 *   useKey(["Mod+z", "z"], undo);             // Mod = Ctrl or ⌘
 *   useKey("Shift+Space", skipToMyTurn);
 *   useKey("Enter", startHold, { event: "keydown" }); useKey("Enter", stopHold, { event: "keyup" });
 *   <KeyScope modal onEscape={close}>…</KeyScope>   // Dossier / Sheet (modal) or Popover (not modal)
 *
 * One window listener per registry dispatches every key. Rules:
 *  - Keys typed into an input, textarea, select or contenteditable are ignored (`allowInInputs`).
 *  - Enter / Space while a button, link or other control has focus belong to that control
 *    (`allowOnControls` to override); events an element handler already `preventDefault`ed are ignored.
 *  - Auto-repeat is ignored unless `repeat: true`; IME composition is always ignored.
 *  - Scopes stack in the order they open. Dispatch walks from the topmost scope down: the most recently
 *    registered matching binding of a scope runs first; a handler returning `false` passes the key on.
 *    Unhandled Esc closes the scope (`onEscape`). A modal scope stops the walk (only `global` bindings
 *    below it still run); a non-modal scope (a popover) claims Esc and lets other keys through.
 *
 * Works without a provider (a shared registry on `window`); `<KeymapProvider>` gives a subtree its own
 * registry (wrap the whole app in one, so every scope and binding meet in the same place).
 */
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// ── Combos ──────────────────────────────────────────────────────────────────────────────────
export interface Combo {
  /** Normalised key: a lower-case character, or a lower-case key name ("enter", "space", "arrowleft"). */
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  /** Ctrl or ⌘ ("Mod+"). */
  mod: boolean;
  /** true: Shift required; false: Shift must be up (letters, digits, named keys); null: either (symbols). */
  shift: boolean | null;
}

const KEY_ALIASES: Record<string, string> = {
  esc: "escape", escape: "escape", return: "enter", enter: "enter", space: "space", spacebar: "space", " ": "space",
  up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright",
  plus: "+", minus: "-", "−": "-", del: "delete", tab: "tab",
};

/** A key name or `KeyboardEvent.key` in the form combos use. */
export function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

const isSymbol = (k: string) => k.length === 1 && !/[a-z0-9]/.test(k);

/** "Mod+Shift+Z" → Combo. The key is the last part ("+" itself may be the key: "Shift++" or "+"). */
export function parseCombo(text: string): Combo {
  const raw = text.trim();
  const parts = raw === "+" ? ["+"] : raw.endsWith("++") ? [...raw.slice(0, -2).split("+"), "+"] : raw.split("+");
  const key = normalizeKey(parts.pop() ?? "");
  const mods = new Set(parts.map(p => p.trim().toLowerCase()));
  const shift = mods.has("shift") ? true : isSymbol(key) ? null : false;
  return {
    key,
    ctrl: mods.has("ctrl") || mods.has("control"),
    alt: mods.has("alt") || mods.has("option"),
    meta: mods.has("meta") || mods.has("cmd") || mods.has("command"),
    mod: mods.has("mod"),
    shift,
  };
}

/** The subset of KeyboardEvent the keymap reads (tests pass plain objects). */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
  preventDefault?(): void;
}

export function matchCombo(c: Combo, e: KeyEventLike): boolean {
  let key = normalizeKey(e.key);
  // Non-Latin layouts: letters by physical key ("KeyZ") when the produced character is not a-z.
  if (/^[a-z]$/.test(c.key) && !/^[a-z]$/.test(key) && e.code && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  if (key !== c.key) return false;
  const ctrl = !!e.ctrlKey, meta = !!e.metaKey;
  if (c.mod) {
    if (!(ctrl || meta)) return false;
  } else if (ctrl !== c.ctrl || meta !== c.meta) return false;
  if (!!e.altKey !== c.alt) return false;
  if (c.shift !== null && !!e.shiftKey !== c.shift) return false;
  return true;
}

// ── Targets ─────────────────────────────────────────────────────────────────────────────────
interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  getAttribute?(name: string): string | null;
}
const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number", "date", "time", "datetime-local", "month", "week"]);
const CONTROL_ROLES = new Set(["button", "link", "menuitem", "menuitemradio", "menuitemcheckbox", "option", "radio", "tab", "checkbox", "switch", "slider", "spinbutton"]);

/** True when keys typed here are text (inputs, textareas, selects, contenteditable). */
export function isTypingTarget(t: unknown): boolean {
  const el = t as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
  return false;
}

/** True when Enter / Space activate the focused element itself (buttons, links, ARIA controls). */
export function isControlTarget(t: unknown): boolean {
  const el = t as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "BUTTON" || tag === "SUMMARY" || tag === "SELECT") return true;
  if (tag === "A" && el.getAttribute?.("href") != null) return true;
  if (tag === "INPUT") return !TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
  const role = el.getAttribute?.("role");
  return !!role && CONTROL_ROLES.has(role);
}

const isActivationKey = (k: string) => k === "enter" || k === "space";

// ── Registry ────────────────────────────────────────────────────────────────────────────────
/** Return `false` to pass the key on (not handled); anything else handles it. */
export type KeyHandler = (e: KeyboardEvent) => void | boolean;

export interface KeyOptions {
  /** Default true. */
  enabled?: boolean;
  /** Default "keydown". */
  event?: "keydown" | "keyup";
  /** Fire on auto-repeat (default false). */
  repeat?: boolean;
  /** Also while typing in an input / textarea (default false). */
  allowInInputs?: boolean;
  /** Enter / Space even when a button or link has focus (default false). */
  allowOnControls?: boolean;
  /** Call preventDefault() when handled (default true). */
  preventDefault?: boolean;
  /** Stay active under a modal scope (default false). */
  global?: boolean;
}

interface Binding {
  id: number;
  combos: Combo[];
  handler: KeyHandler;
  opts: KeyOptions;
  scope: number;
}

interface Scope {
  id: number;
  modal: boolean;
  onEscape?: () => void;
}

/** The root scope (bindings outside any `<KeyScope>`). */
export const ROOT_SCOPE = 0;

export class KeymapRegistry {
  private seq = 0;
  private scopeSeq = 0;
  private readonly bindings = new Map<number, Binding>();
  private readonly scopes: Scope[] = [];

  /** Add a binding; returns the function that removes it. */
  register(combos: readonly (string | Combo)[], handler: KeyHandler, opts: KeyOptions = {}, scope = ROOT_SCOPE): () => void {
    const id = ++this.seq;
    this.bindings.set(id, { id, combos: combos.map(c => (typeof c === "string" ? parseCombo(c) : c)), handler, opts, scope });
    return () => { this.bindings.delete(id); };
  }

  /** A fresh scope id (not open yet). */
  newScopeId(): number {
    return ++this.scopeSeq;
  }

  /** Open (push) a scope; returns the function that closes it. Re-opening an open id updates it. */
  openScope(id: number, opts: { modal: boolean; onEscape?: () => void }): () => void {
    const existing = this.scopes.find(s => s.id === id);
    if (existing) Object.assign(existing, opts);
    else this.scopes.push({ id, ...opts });
    return () => {
      const i = this.scopes.findIndex(s => s.id === id);
      if (i >= 0) this.scopes.splice(i, 1);
    };
  }

  /** Ids of the open scopes, topmost last. */
  openScopes(): number[] {
    return this.scopes.map(s => s.id);
  }

  /** True while a modal scope is open (a dialog has the keyboard). */
  hasModal(): boolean {
    return this.scopes.some(s => s.modal);
  }

  /** Run the bindings for one key event; true when something handled it. */
  dispatch(e: KeyEventLike, type: "keydown" | "keyup" = "keydown"): boolean {
    if (e.isComposing || e.key === "Process" || e.key === "Dead" || e.defaultPrevented) return false;
    const key = normalizeKey(e.key);
    const typing = isTypingTarget(e.target);
    const onControl = isControlTarget(e.target);
    const layers: (Scope | null)[] = [...this.scopes].reverse();
    layers.push(null); // root
    let blocked = false;
    for (const layer of layers) {
      const scopeId = layer ? layer.id : ROOT_SCOPE;
      if (this.runLayer(scopeId, e, type, key, typing, onControl, blocked)) return true;
      if (blocked) continue;
      if (layer && type === "keydown" && key === "escape" && layer.onEscape && !e.repeat) {
        e.preventDefault?.();
        layer.onEscape();
        return true;
      }
      if (layer?.modal) blocked = true; // below a modal scope only global bindings run
    }
    return false;
  }

  private runLayer(scope: number, e: KeyEventLike, type: string, key: string, typing: boolean, onControl: boolean, globalOnly: boolean): boolean {
    const candidates = [...this.bindings.values()]
      .filter(b => b.scope === scope && (b.opts.event ?? "keydown") === type && (!globalOnly || b.opts.global))
      .sort((a, b) => b.id - a.id);
    for (const b of candidates) {
      if (b.opts.enabled === false) continue;
      if (!b.combos.some(c => matchCombo(c, e))) continue;
      if (e.repeat && !b.opts.repeat) continue;
      if (typing && !b.opts.allowInInputs) continue;
      if (onControl && isActivationKey(key) && !b.opts.allowOnControls) continue;
      const r = b.handler(e as KeyboardEvent);
      if (r === false) continue;
      if (b.opts.preventDefault !== false) e.preventDefault?.();
      return true;
    }
    return false;
  }

  /** Listen on a window (or any event target); returns the function that stops listening. */
  attach(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
    const down = (e: Event) => { this.dispatch(e as KeyboardEvent, "keydown"); };
    const up = (e: Event) => { this.dispatch(e as KeyboardEvent, "keyup"); };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
    };
  }
}

// ── React ───────────────────────────────────────────────────────────────────────────────────
const KeymapContext = createContext<KeymapRegistry | null>(null);
const ScopeContext = createContext<number>(ROOT_SCOPE);

let shared: KeymapRegistry | null = null;
/** The registry used without a provider (attached to `window` on first use in a browser). */
export function sharedKeymap(): KeymapRegistry {
  if (!shared) {
    shared = new KeymapRegistry();
    if (typeof window !== "undefined") shared.attach(window);
  }
  return shared;
}

/** The registry in effect here (the nearest provider's, else the shared one; null under SSR). */
export function useKeymap(): KeymapRegistry | null {
  const fromContext = useContext(KeymapContext);
  if (fromContext) return fromContext;
  return typeof window === "undefined" ? null : sharedKeymap();
}

/** Bind a key (or several combos) for as long as the component is mounted. */
export function useKey(combo: string | readonly string[], handler: KeyHandler, opts: KeyOptions = {}): void {
  const registry = useKeymap();
  const scope = useContext(ScopeContext);
  const ref = useRef(handler);
  ref.current = handler;
  const combos = typeof combo === "string" ? combo : combo.join("\u0000");
  const { enabled = true, event = "keydown", repeat = false, allowInInputs = false, allowOnControls = false, preventDefault = true, global = false } = opts;
  useEffect(() => {
    if (!registry || !enabled) return;
    const list = combos.split("\u0000");
    return registry.register(list, e => ref.current(e), { event, repeat, allowInInputs, allowOnControls, preventDefault, global }, scope);
  }, [registry, scope, combos, enabled, event, repeat, allowInInputs, allowOnControls, preventDefault, global]);
}

export interface KeyScopeProps {
  /** Default true. An inactive scope is transparent. */
  active?: boolean;
  /** Modal scopes (dialogs, sheets) keep keys from the rest of the app. Default true. */
  modal?: boolean;
  /** Esc when nothing in the scope handled it (normally: close). */
  onEscape?: () => void;
  children?: ReactNode;
}

/** A keyboard scope: an open dialog captures keys; Esc closes the topmost scope. */
export function KeyScope({ active = true, modal = true, onEscape, children }: KeyScopeProps) {
  const registry = useKeymap();
  const [id] = useState(() => (registry ? registry.newScopeId() : -1));
  const esc = useRef(onEscape);
  esc.current = onEscape;
  const hasEscape = onEscape !== undefined;
  useEffect(() => {
    if (!registry || !active) return;
    return registry.openScope(id, { modal, onEscape: hasEscape ? () => esc.current?.() : undefined });
  }, [registry, id, active, modal, hasEscape]);
  return createElement(ScopeContext.Provider, { value: active ? id : ROOT_SCOPE }, children);
}

export interface KeymapProviderProps {
  children?: ReactNode;
  /** Where to listen (default `window`). */
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
}

/** Give a subtree its own keymap registry, listening on `window` (wrap the whole app in one). */
export function KeymapProvider({ children, target }: KeymapProviderProps) {
  const [registry] = useState(() => new KeymapRegistry());
  useEffect(() => {
    const t = target ?? (typeof window !== "undefined" ? window : null);
    if (!t) return;
    return registry.attach(t);
  }, [registry, target]);
  return createElement(KeymapContext.Provider, { value: registry }, children);
}

/** How a combo is written on screen (`kbd`): "⌘Z" on Apple platforms, "Ctrl+Z" elsewhere. */
export function comboLabel(text: string, apple = isApple()): string {
  const c = parseCombo(text);
  const names: Record<string, string> = { escape: "Esc", enter: "↵", space: "Space", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓" };
  const key = names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  const mods: string[] = [];
  if (c.mod) mods.push(apple ? "⌘" : "Ctrl");
  if (c.ctrl) mods.push(apple ? "⌃" : "Ctrl");
  if (c.alt) mods.push(apple ? "⌥" : "Alt");
  if (c.shift) mods.push(apple ? "⇧" : "Shift");
  if (c.meta) mods.push(apple ? "⌘" : "Meta");
  return apple ? mods.join("") + key : [...mods, key].join("+");
}

function isApple(): boolean {
  try {
    const nav = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
    const p = nav?.userAgentData?.platform ?? nav?.platform ?? "";
    return /mac|iphone|ipad|ipod/i.test(p);
  } catch {
    return false;
  }
}
