/**
 * The keymap registry (src/ui/common/keymap.ts): combo parsing and matching, input / control
 * filtering, auto-repeat, keyup, scopes (modal / non-modal), Esc closing the topmost scope.
 */
import { describe, expect, it } from "vitest";
import { comboLabel, isControlTarget, isTypingTarget, KeymapRegistry, matchCombo, parseCombo, type KeyEventLike } from "../../../src/ui/common/keymap";

function ev(key: string, o: Partial<KeyEventLike> = {}): KeyEventLike & { prevented: boolean } {
  const e = { key, prevented: false, ...o, preventDefault() { e.prevented = true; } };
  return e;
}
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: (n: string) => (extra[n] as string) ?? null, ...extra });

describe("combos", () => {
  it("parses modifiers and normalises key names", () => {
    expect(parseCombo("Mod+Z")).toMatchObject({ key: "z", mod: true, ctrl: false, shift: false });
    expect(parseCombo("Shift+Space")).toMatchObject({ key: "space", shift: true });
    expect(parseCombo("Esc").key).toBe("escape");
    expect(parseCombo("+")).toMatchObject({ key: "+", shift: null });
    expect(parseCombo("Shift++")).toMatchObject({ key: "+", shift: true });
    expect(parseCombo("?").shift).toBeNull();
  });

  it("matches letters exactly: plain z is not Shift+Z nor Ctrl+Z; Mod is Ctrl or ⌘", () => {
    const z = parseCombo("z"), mz = parseCombo("Mod+z");
    expect(matchCombo(z, ev("z"))).toBe(true);
    expect(matchCombo(z, ev("Z", { shiftKey: true }))).toBe(false);
    expect(matchCombo(z, ev("z", { ctrlKey: true }))).toBe(false);
    expect(matchCombo(mz, ev("z", { ctrlKey: true }))).toBe(true);
    expect(matchCombo(mz, ev("z", { metaKey: true }))).toBe(true);
    expect(matchCombo(mz, ev("z"))).toBe(false);
  });

  it("ignores Shift for symbols and falls back to the physical key on non-Latin layouts", () => {
    expect(matchCombo(parseCombo("?"), ev("?", { shiftKey: true }))).toBe(true);
    expect(matchCombo(parseCombo("+"), ev("+", { shiftKey: true }))).toBe(true);
    expect(matchCombo(parseCombo("z"), ev("я", { code: "KeyZ" }))).toBe(true);
    expect(matchCombo(parseCombo("Space"), ev(" "))).toBe(true);
  });

  it("labels combos for key caps", () => {
    expect(comboLabel("Mod+z", false)).toBe("Ctrl+Z");
    expect(comboLabel("Mod+z", true)).toBe("⌘Z");
    expect(comboLabel("Enter", false)).toBe("↵");
  });
});

describe("targets", () => {
  it("knows typing targets and controls", () => {
    expect(isTypingTarget(el("INPUT", { type: "text" }))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isControlTarget(el("BUTTON"))).toBe(true);
    expect(isControlTarget(el("SPAN", { role: "button" }))).toBe(true);
    expect(isControlTarget(el("DIV"))).toBe(false);
  });
});

describe("KeymapRegistry", () => {
  it("runs the latest matching binding; false passes the key on; handled keys are prevented", () => {
    const r = new KeymapRegistry();
    const seen: string[] = [];
    r.register(["d"], () => { seen.push("first"); });
    r.register(["d"], () => { seen.push("second"); return false; });
    const e = ev("d");
    expect(r.dispatch(e)).toBe(true);
    expect(seen).toEqual(["second", "first"]);
    expect(e.prevented).toBe(true);
  });

  it("unregisters, ignores typing, repeats, composition and already-prevented events", () => {
    const r = new KeymapRegistry();
    let n = 0;
    const off = r.register(["z"], () => { n++; });
    expect(r.dispatch(ev("z", { target: el("INPUT", { type: "text" }) }))).toBe(false);
    expect(r.dispatch(ev("z", { repeat: true }))).toBe(false);
    expect(r.dispatch(ev("z", { isComposing: true }))).toBe(false);
    expect(r.dispatch(ev("z", { defaultPrevented: true }))).toBe(false);
    expect(r.dispatch(ev("z"))).toBe(true);
    off();
    expect(r.dispatch(ev("z"))).toBe(false);
    expect(n).toBe(1);
    r.register(["z"], () => { n++; }, { allowInInputs: true, repeat: true });
    expect(r.dispatch(ev("z", { target: el("TEXTAREA"), repeat: true }))).toBe(true);
  });

  it("leaves Enter / Space on a focused control to that control", () => {
    const r = new KeymapRegistry();
    let n = 0;
    r.register(["Enter"], () => { n++; });
    expect(r.dispatch(ev("Enter", { target: el("BUTTON") }))).toBe(false);
    expect(r.dispatch(ev("Enter", { target: el("DIV") }))).toBe(true);
    r.register(["Space"], () => { n++; }, { allowOnControls: true });
    expect(r.dispatch(ev(" ", { target: el("BUTTON") }))).toBe(true);
    expect(n).toBe(2);
  });

  it("keyup bindings only see keyup", () => {
    const r = new KeymapRegistry();
    const seen: string[] = [];
    r.register(["Enter"], () => { seen.push("down"); });
    r.register(["Enter"], () => { seen.push("up"); }, { event: "keyup" });
    r.dispatch(ev("Enter"), "keydown");
    r.dispatch(ev("Enter"), "keyup");
    expect(seen).toEqual(["down", "up"]);
  });

  it("a modal scope captures keys; Esc closes the topmost scope; global bindings still run", () => {
    const r = new KeymapRegistry();
    const seen: string[] = [];
    r.register(["d"], () => { seen.push("root d"); });
    r.register(["?"], () => { seen.push("root ?"); }, { global: true });
    r.register(["Escape"], () => { seen.push("root esc"); });
    const a = r.newScopeId(), b = r.newScopeId();
    const closeA = r.openScope(a, { modal: true, onEscape: () => seen.push("close a") });
    r.register(["x"], () => { seen.push("a x"); }, {}, a);
    expect(r.dispatch(ev("d"))).toBe(false); // blocked by the dialog
    expect(r.dispatch(ev("?"))).toBe(true); // global
    expect(r.dispatch(ev("x"))).toBe(true);
    const closeB = r.openScope(b, { modal: true, onEscape: () => seen.push("close b") });
    expect(r.dispatch(ev("x"))).toBe(false); // a is below a modal now
    r.dispatch(ev("Escape"));
    closeB();
    r.dispatch(ev("Escape"));
    closeA();
    r.dispatch(ev("Escape"));
    expect(seen).toEqual(["root ?", "a x", "close b", "close a", "root esc"]);
    expect(r.openScopes()).toEqual([]);
  });

  it("a non-modal scope (popover) claims Esc and lets other keys through", () => {
    const r = new KeymapRegistry();
    const seen: string[] = [];
    r.register(["e"], () => { seen.push("root e"); });
    const p = r.newScopeId();
    r.openScope(p, { modal: false, onEscape: () => seen.push("close popover") });
    expect(r.hasModal()).toBe(false);
    r.dispatch(ev("e"));
    r.dispatch(ev("Escape"));
    expect(seen).toEqual(["root e", "close popover"]);
  });

  it("a scope's own Esc binding wins over closing it", () => {
    const r = new KeymapRegistry();
    const seen: string[] = [];
    const s = r.newScopeId();
    r.openScope(s, { modal: true, onEscape: () => seen.push("close") });
    r.register(["Escape"], () => { seen.push("unstage"); }, {}, s);
    r.dispatch(ev("Escape"));
    expect(seen).toEqual(["unstage"]);
  });
});
