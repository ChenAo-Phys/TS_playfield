/**
 * src/ui/state: settings persistence, reduced motion, root attributes, and the providers rendered on
 * real fixtures (react-dom/server: no DOM in Node).
 */
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import { FlightLayer } from "../../../src/ui/runner/FlightLayer";
import { ShownProvider, StaticShownProvider, staticShown, useShown } from "../../../src/ui/runner/ShownContext";
import { useOverlays, useUiRoot, useVm } from "../../../src/ui/state/context";
import {
  SETTINGS_KEY, createSettingsStore, loadSettings, sanitizeSettings, saveSettings, type SettingsStorage,
} from "../../../src/ui/state/settings";
import { UiRootProvider, cssSpeed, rootAttributes } from "../../../src/ui/state/UiRootProvider";
import { isReducedMotion, useReducedMotion } from "../../../src/ui/state/useReducedMotion";
import { currentLayout } from "../../../src/ui/state/useLayout";
import { DEFAULT_SETTINGS } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";

class MapStorage implements SettingsStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe("settings", () => {
  it("merge over the defaults and drop invalid or unknown fields", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ speed: "fast", mapLabels: 130, patterns: true, motion: "loud", bogus: 1, sound: "yes" }))
      .toEqual({ ...DEFAULT_SETTINGS, speed: "fast", mapLabels: 130, patterns: true });
  });

  it("load / save through storage, surviving broken JSON and throwing storage", () => {
    const s = new MapStorage();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, speed: "slow" }, s);
    expect(JSON.parse(s.m.get(SETTINGS_KEY)!).speed).toBe("slow");
    expect(loadSettings(s).speed).toBe("slow");
    s.m.set(SETTINGS_KEY, "{not json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    const bad: SettingsStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, bad)).not.toThrow();
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("a store notifies on real changes only and persists them", () => {
    const s = new MapStorage();
    const store = createSettingsStore(s, { patterns: true });
    let n = 0;
    store.subscribe(() => n++);
    store.set({ patterns: true });
    expect(n).toBe(0);
    store.set({ railCollapsed: true });
    expect(n).toBe(1);
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, patterns: true, railCollapsed: true });
    expect(loadSettings(s).railCollapsed).toBe(true);
  });
});

describe("root attributes and motion", () => {
  it("--ts-speed never reaches 0", () => {
    expect(cssSpeed("normal")).toBe("1");
    expect(cssSpeed("slow")).toBe("1.4");
    expect(cssSpeed("instant")).toBe("0.0001");
  });

  it("<html> attributes follow the settings and the human side", () => {
    expect(rootAttributes(DEFAULT_SETTINGS, null)).toEqual({ "data-human": null, "data-motion": null, "data-labels": null, "data-patterns": null });
    expect(rootAttributes({ ...DEFAULT_SETTINGS, motion: "reduce", mapLabels: 115, patterns: true }, "USSR"))
      .toEqual({ "data-human": "USSR", "data-motion": "reduce", "data-labels": "115", "data-patterns": "on" });
  });

  it("reduced motion = system unless the setting overrides", () => {
    expect(isReducedMotion("system", true)).toBe(true);
    expect(isReducedMotion("system", false)).toBe(false);
    expect(isReducedMotion("full", true)).toBe(false);
    expect(isReducedMotion("reduce", false)).toBe(true);
  });

  it("the layout is desktop without a window", () => {
    expect(currentLayout()).toBe("desktop");
  });
});

function Probe() {
  const root = useUiRoot();
  const vm = useVm();
  const shown = useShown();
  const overlays = useOverlays();
  const reduced = useReducedMotion();
  return h("p", null, [
    root.layout, root.settings.speed, vm.prompt?.kind ?? "none", shown.state?.turn ?? "-", String(shown.busy),
    String(overlays.toasts.length), String(overlays.zoom), String(reduced), String(typeof root.anchors.ref("deck")), String(root.director.count?.("country") ?? "?"),
  ].join("|"));
}

const providers = (controller: FixtureController, child: ReactNode, settings = createSettingsStore(null, { speed: "fast", motion: "reduce" })) =>
  h(UiRootProvider, { controller, settingsStore: settings, layout: "compact", rootAttributes: false }, h(ShownProvider, null, child));

describe("UiRootProvider + ShownProvider", () => {
  it("render a scene: vm, settings, layout, overlays and the shown board are all available", () => {
    const fx = fixture("prompt-coup-target");
    const html = renderToStaticMarkup(providers(new FixtureController(fx), h(Probe)));
    expect(html).toBe(`<p>compact|fast|coup-target|${fx.frames[0]!.state.turn}|false|0|null|true|function|0</p>`);
  });

  it("render a sequence at its base frame (the board before the first animated frame)", () => {
    const fx = fixture("seq-ai-turn");
    const html = renderToStaticMarkup(providers(new FixtureController(fx), h(Probe)));
    expect(html).toContain(`|none|${fx.frames[0]!.state.turn}|false|`);
  });

  it("FlightLayer renders nothing on the server", () => {
    const html = renderToStaticMarkup(providers(new FixtureController(fixture("seq-ai-turn")), h(FlightLayer)));
    expect(html).toBe("");
  });

  it("hooks outside the providers fail loudly; StaticShownProvider serves a fixed Shown", () => {
    expect(() => renderToStaticMarkup(h(Probe))).toThrow(/UiRootProvider/);
    const st = fixture("prompt-midgame").frames[0]!;
    const Show = () => h("i", null, String(useShown().state?.turn));
    expect(renderToStaticMarkup(h(StaticShownProvider, { value: staticShown(st.state, st.regionScores) }, h(Show)))).toBe(`<i>${st.state.turn}</i>`);
  });
});
