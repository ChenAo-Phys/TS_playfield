/**
 * usePromptActions (ui-spec §8.2) against the FixtureController: each activation applies the option's
 * policy — instant choices call `choose` at once, staged ones need a second activation / confirm, hold
 * ones only the hold — and nothing is chosen while a frame animates. Also the hand / map wiring.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import {
  promptStore, useHandProps, usePromptActions, usePromptMapProps, type HandProps, type PromptActions, type PromptMapProps,
} from "../../../src/ui/prompts";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { UiSettings } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";

const h = createElement;

function grab(name: string, o: { busy?: boolean; settings?: Partial<UiSettings> } = {}) {
  const controller = new FixtureController(fixture(name));
  const vm = controller.getSnapshot();
  const out: { actions?: PromptActions; map?: PromptMapProps; hand?: HandProps } = {};
  const Probe = () => {
    out.actions = usePromptActions();
    out.map = usePromptMapProps();
    out.hand = useHandProps();
    return null;
  };
  const render = () => renderToStaticMarkup(
    h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, o.settings ?? {}), layout: "desktop", rootAttributes: false },
      h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores, { busy: !!o.busy, actor: o.busy ? "US" : null }) }, h(Probe))),
  );
  render();
  return { controller, store: promptStore(controller), get: () => { render(); return out as Required<typeof out>; } };
}
const chosen = (c: FixtureController) => c.choices.map(x => x.idx);

describe("usePromptActions", () => {
  it("instant: one click chooses", () => {
    const g = grab("prompt-influence");
    const p = g.get().actions.prompt!;
    const one = p.options.find(o => o.cost === 1)!;
    g.get().actions.activateCountry(one.id);
    expect(chosen(g.controller)).toEqual([one.idx]);
  });

  it("stage: the first click selects, the second (or confirm) commits; Esc (cancel) drops it", () => {
    const g = grab("prompt-coup-target");
    g.get().actions.activateCountry(25);
    expect(g.get().actions.staged).toEqual({ kind: "country", id: 25, idx: 141 });
    expect(g.get().map.selection).toBe(25);
    expect(chosen(g.controller)).toEqual([]);
    expect(g.get().actions.cancel()).toBe(true);
    expect(g.get().actions.staged).toBe(null);
    g.get().actions.activateCountry(25);
    g.get().actions.activateCountry(24); // another target replaces the selection
    expect(g.get().actions.staged?.id).toBe(24);
    g.get().actions.activateCountry(24);
    expect(chosen(g.controller)).toEqual([140]);
    g.get().actions.activateCountry(25);
    expect(g.get().actions.confirm()).toBe(true);
    expect(chosen(g.controller)).toEqual([140, 141]);
  });

  it("the final point stages under confirmFinal, and is instant without it", () => {
    const final = (g: ReturnType<typeof grab>) => g.get().actions.prompt!.options.find(o => o.cost === 2)!;
    const on = grab("prompt-influence");
    on.get().actions.activateCountry(final(on).id);
    expect(chosen(on.controller)).toEqual([]);
    const off = grab("prompt-influence", { settings: { confirmFinal: false } });
    off.get().actions.activateCountry(final(off).id);
    expect(chosen(off.controller)).toEqual([final(off).idx]);
  });

  it("hold: neither a second click nor confirm commits; the hold's commit does", () => {
    const g = grab("prompt-defcon-level");
    const one = g.get().actions.prompt!.options.find(o => o.id === 1)!;
    g.get().actions.activateOption(one.idx);
    g.get().actions.activateOption(one.idx);
    expect(g.get().actions.confirm()).toBe(false);
    expect(chosen(g.controller)).toEqual([]);
    g.get().actions.commit(one.idx);
    expect(chosen(g.controller)).toEqual([one.idx]);
  });

  it("done stages under confirmFinal; undo calls the controller when allowed", () => {
    const g = grab("prompt-realign-target");
    g.get().actions.done();
    expect(g.get().actions.staged).toEqual({ kind: "option", id: 208, idx: 208 });
    g.get().actions.done();
    expect(chosen(g.controller)).toEqual([208]);
    g.get().actions.undo();
    expect(g.controller.calls.some(c => c.fn === "undo")).toBe(true);
    const noUndo = grab("prompt-headline");
    noUndo.get().actions.undo();
    expect(noUndo.controller.calls.some(c => c.fn === "undo")).toBe(false);
  });

  it("a realignment roll keeps the country staged (the store carries it to the next prompt)", () => {
    const g = grab("prompt-realign-target");
    g.get().actions.activateCountry(24);
    g.get().actions.activateCountry(24);
    expect(chosen(g.controller)).toEqual([140]);
    expect(g.store.get().staged).toMatchObject({ kind: "country", id: 24 });
  });

  it("nothing is chosen or staged while a frame animates", () => {
    const g = grab("prompt-influence", { busy: true });
    expect(g.get().actions.interactive).toBe(false);
    expect(g.get().map.interactive).toBe(false);
    g.get().actions.activateCountry(2);
    g.get().actions.activateCountry(1);
    expect(chosen(g.controller)).toEqual([]);
    expect(g.store.get().staged).toBe(null);
  });

  it("hand wiring: offers, staged card, lifted-out card, mode, stamp, China slot", () => {
    const hl = grab("prompt-headline");
    expect(hl.get().hand.mode).toBe("active");
    expect(hl.get().hand.stamp).toBe("headline");
    expect([...hl.get().hand.offered.keys()]).toEqual(hl.get().actions.prompt!.cards);
    hl.get().hand.onActivate(31);
    expect(hl.get().hand.staged).toBe(31);
    const china = grab("prompt-action-card-china");
    expect(china.get().hand.china?.commit).toBe("instant");
    const pm = grab("prompt-play-mode");
    expect(pm.get().hand.liftedOut).toBe(28);
    expect(pm.get().hand.mode).toBe("passive");
    expect(pm.get().hand.offered.size).toBe(0);
  });

  it("map wiring: targets only for map prompts; region targets and focus for Chernobyl", () => {
    expect(grab("prompt-influence").get().map.targets?.verb).toBe("add");
    expect(grab("prompt-headline").get().map.targets).toBe(null);
    const r = grab("prompt-region");
    expect([...(r.get().map.regionTargets ?? [])].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    r.get().actions.hoverRegion(2);
    expect(r.get().map.focusRegion).toBe(2);
    r.get().actions.activateRegion(1);
    expect(r.get().map.focusRegion).toBe(1);
    expect(typeof r.get().map.renderTooltip).toBe("function");
  });
});
