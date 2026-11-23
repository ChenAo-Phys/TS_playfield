/**
 * QA round 2 (r2-hand-wait), the prompt layer: the AI's wait ("Still thinking · 14 s", the one-time slow-device
 * hint; owner decision OD-2), the queued quick second tap during your own placement's animation, and Esc
 * "Back to hand" asking the hand to focus the returned card. Pure parts on hand-made prompts, the hooks over
 * the FixtureController with react-dom/server.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import type { Prompt, PromptOption, Side, ViewModel } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import {
  backToHand, claimSlowHint, elapsedSeconds, FOCUS_TIMEOUT_MS, msToNextSecond, OrdersSlip, promptStore, PromptStore, QUEUE_KINDS,
  QUEUE_TIMEOUT_MS, resetSlowHint, SLOW_HINT_S, slowHintAvailable, slowHintClaimedBy, STILL_THINKING_S, usePromptActions,
  usePromptMapProps, type PromptActions, type PromptMapProps, type Timers,
} from "../../../src/ui/prompts";
import { splitAt } from "../../../src/ui/prompts/OrdersSlip";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import { fixture } from "../../fixtures/load";

const h = createElement;

function fakeTimers(start = 1000) {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let seq = 0;
  let clock = start;
  const t: Timers & { fire(): void; count(): number; advance(ms: number): void; delays(): number[] } = {
    setTimeout: (fn: () => void, ms: number) => { pending.set(++seq, { fn, ms }); return seq; },
    clearTimeout: (id: unknown) => { pending.delete(id as number); },
    now: () => clock,
    fire: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach(f => f.fn()); },
    count: () => pending.size,
    advance: (ms: number) => { clock += ms; },
    delays: () => [...pending.values()].map(p => p.ms),
  };
  return t;
}

function promptOf(p: Partial<Prompt>): Prompt {
  return {
    kind: "influence", promptId: 1, decisionType: 5, resolvingCard: 0, pendingCard: 44, opsValue: 3, remaining: 3, maxPerCountry: 0,
    options: [], cards: [], countries: [], title: { key: "prompt:title.influence", params: { count: 3 } }, ...p,
  };
}
const countries = (ids: number[], base = 100): PromptOption[] => ids.map(id => ({ idx: base + id, kind: "country", id }));
const vmOf = (p: Prompt | null, o: Partial<ViewModel> = {}): ViewModel => ({
  status: "playing", humanSide: "USSR", frame: null, queued: 0, prompt: p, aiThinking: false, canUndo: true, log: [], ending: null,
  hasSavedGame: false, ...o,
});

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("the AI's decision clock (prompt store)", () => {
  it("starts when the AI begins to think and stops when it ends, for every decision alike", () => {
    const t = fakeTimers(5000);
    const s = new PromptStore(t);
    s.observe(vmOf(null));
    expect(s.get().aiSince).toBeNull();
    s.observe(vmOf(null, { aiThinking: true }));
    expect(s.get().aiSince).toBe(5000);
    t.advance(3000);
    s.observe(vmOf(null, { aiThinking: true })); // still the same decision
    expect(s.get().aiSince).toBe(5000);
    s.observe(vmOf(null, { aiThinking: false }));
    expect(s.get().aiSince).toBeNull();
    t.advance(500);
    s.observe(vmOf(null, { aiThinking: true })); // the next decision starts its own count
    expect(s.get().aiSince).toBe(8500);
    // with a prompt open too (the store follows every ViewModel)
    s.observe(vmOf(promptOf({ promptId: 9 }), { aiThinking: false }));
    expect(s.get().aiSince).toBeNull();
  });
});

describe("the AI's wait (aiWait)", () => {
  afterEach(() => resetSlowHint());
  it("counts whole seconds and ticks on the second", () => {
    expect(elapsedSeconds(null, 99_000)).toBe(0);
    expect(elapsedSeconds(1000, 1999)).toBe(0);
    expect(elapsedSeconds(1000, 15_000)).toBe(14);
    expect(elapsedSeconds(1000, 500)).toBe(0);
    expect(msToNextSecond(1000, 15_200)).toBe(800);
    expect(msToNextSecond(1000, 15_000)).toBe(1000);
    expect(STILL_THINKING_S).toBe(8);
    expect(SLOW_HINT_S).toBe(20);
  });
  it("the slow-device hint: once per page session, kept by the decision that showed it", () => {
    expect(slowHintAvailable(100)).toBe(true);
    expect(slowHintAvailable(200)).toBe(true);
    claimSlowHint(100);
    expect(slowHintClaimedBy(100)).toBe(true);
    expect(slowHintAvailable(100)).toBe(true); // the same decision keeps it
    expect(slowHintAvailable(200)).toBe(false); // no later decision gets it
    claimSlowHint(100);
    expect(slowHintClaimedBy(200)).toBe(false);
    resetSlowHint();
    expect(slowHintAvailable(200)).toBe(true);
  });
  it("splits a translated sentence around the count", () => {
    expect(splitAt("Still thinking · #N s", "#N")).toEqual(["Still thinking · ", " s"]);
    expect(splitAt("仍在思考 · #N 秒。在这台设备上……", "#N")).toEqual(["仍在思考 · ", " 秒。在这台设备上……"]);
    expect(splitAt("no mark", "#N")).toEqual([null, null]);
  });
});

/** The slip in AI mode, `ms` into the AI's decision (performance.now is the store's clock). */
function slipAt(ms: number, lang: "en" | "zh-CN") {
  const fx = JSON.parse(JSON.stringify(fixture("prompt-influence"))) as Fixture;
  fx.final = { ...fx.final, prompt: null, aiThinking: true };
  const controller = new FixtureController(fx);
  const vm = controller.getSnapshot();
  const now = vi.spyOn(performance, "now").mockReturnValue(50_000);
  promptStore(controller); // attaches: the AI's decision began at 50 000
  now.mockReturnValue(50_000 + ms);
  const html = renderToStaticMarkup(
    h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false },
      h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores) }, h(OrdersSlip, { variant: "desktop" }))),
  );
  now.mockRestore();
  return html;
}
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the slip's still-thinking note", () => {
  afterEach(async () => { resetSlowHint(); await setLanguage("en"); });
  it("nothing before 8 s; then the elapsed seconds in a fixed-width span", async () => {
    await setLanguage("en");
    expect(slipAt(5_000, "en")).not.toContain("data-still");
    const at14 = slipAt(14_300, "en");
    expect(at14).toContain('data-still=""');
    expect(at14).toMatch(/<span class="[^"]*secs[^"]*" data-seconds="14">14<\/span>/);
    expect(text(at14)).toContain("Still thinking · 14 s");
    expect(text(at14)).not.toContain("up to a minute");
    expect(at14).toContain('title="Still thinking · 14 s"');
  });
  it("past 20 s (first time in the session): the slow-device sentence follows the count", async () => {
    await setLanguage("en");
    const at21 = slipAt(21_000, "en");
    expect(text(at21)).toContain("Still thinking · 21 s. At full strength the AI can take up to a minute per move on this device.");
    expect(at21).toContain('data-slow-hint="true"');
    await setLanguage("zh-CN");
    const zh = slipAt(21_000, "zh-CN");
    expect(text(zh)).toContain("仍在思考 · 21 秒。在这台设备上，全力以赴的 AI 每步最多可能需要一分钟。");
    expect(text(slipAt(9_000, "zh-CN"))).toContain("仍在思考 · 9 秒");
  });
  it("once another decision has shown it, a later long wait shows the count alone", async () => {
    await setLanguage("en");
    claimSlowHint(-1);
    const at30 = slipAt(30_000, "en");
    expect(text(at30)).toContain("Still thinking · 30 s");
    expect(text(at30)).not.toContain("up to a minute");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("a quick second tap during your own placement (prompt store)", () => {
  const p1 = promptOf({ promptId: 1, remaining: 3, countries: [24, 25], options: countries([24, 25]) });
  const p2 = promptOf({ promptId: 2, remaining: 2, countries: [24, 25], options: countries([24, 25]) });
  it("queues one tap on a country the prompt offered, for placement runs only", () => {
    expect([...QUEUE_KINDS].sort()).toEqual(["bid-place", "event-target", "influence", "setup-place"]);
    const s = new PromptStore(fakeTimers());
    s.observe(vmOf(p1));
    s.observe(vmOf(null)); // your click animates
    expect(s.queue(p1, 99)).toBe(false); // not offered
    expect(s.queue(promptOf({ kind: "coup-target", options: countries([24]) }), 24)).toBe(false);
    expect(s.queue(p1, 24)).toBe(true);
    expect(s.queue(p1, 25)).toBe(false); // one at a time
    expect(s.get().queued).toMatchObject({ kind: "country", id: 24, from: 1, to: null });
  });
  it("applies to the next prompt when it continues the run and offers the country", () => {
    const s = new PromptStore(fakeTimers());
    s.observe(vmOf(p1));
    s.observe(vmOf(null));
    s.queue(p1, 24);
    s.observe(vmOf(p2));
    expect(s.get().queued?.to).toBe(2);
    expect(s.takeQueued(p1)).toBeNull();
    expect(s.takeQueued(p2)).toMatchObject({ id: 24 });
    expect(s.get().queued).toBeNull();
    expect(s.takeQueued(p2)).toBeNull(); // taken once
  });
  it("is dropped silently otherwise: another decision, the country gone, the AI's turn, the time out", () => {
    const timers = fakeTimers();
    const s = new PromptStore(timers);
    const drop = (next: ViewModel) => {
      s.observe(vmOf(p1));
      s.observe(vmOf(null));
      expect(s.queue(p1, 24)).toBe(true);
      s.observe(next);
      expect(s.get().queued).toBeNull();
      s.observe(vmOf(null));
    };
    drop(vmOf(promptOf({ kind: "action-card", promptId: 3 })));
    drop(vmOf(promptOf({ promptId: 4, remaining: 2, countries: [25], options: countries([25]) })));
    drop(vmOf(promptOf({ promptId: 5, remaining: 3, countries: [24], options: countries([24]) }))); // not fewer points left: a new run
    drop(vmOf(promptOf({ kind: "event-target", promptId: 6, remaining: 2, countries: [24], options: countries([24]) })));
    drop(vmOf(null, { aiThinking: true }));
    drop(vmOf(null, { status: "over" }));
    s.observe(vmOf(p1));
    s.observe(vmOf(null));
    s.queue(p1, 24);
    expect(timers.delays()).toContain(QUEUE_TIMEOUT_MS);
    timers.fire();
    expect(s.get().queued).toBeNull();
  });
  it("a tap aimed at the prompt just opened (its frame still finishing) waits for that prompt only", () => {
    const s = new PromptStore(fakeTimers());
    s.observe(vmOf(p2));
    expect(s.queue(p2, 25)).toBe(true);
    expect(s.get().queued?.to).toBe(2);
    s.observe(vmOf(promptOf({ promptId: 7, remaining: 1, countries: [25], options: countries([25]) })));
    expect(s.get().queued).toBeNull();
  });
});

/** usePromptActions / usePromptMapProps over a recorded prompt, rendered with a frame animating or not. */
function grab(name: string, o: { busy?: boolean; actor?: Side | null } = {}) {
  const controller = new FixtureController(fixture(name));
  const vm = controller.getSnapshot();
  const out: { actions?: PromptActions; map?: PromptMapProps } = {};
  const Probe = () => { out.actions = usePromptActions(); out.map = usePromptMapProps(); return null; };
  let busy = !!o.busy;
  const render = () => renderToStaticMarkup(
    h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false },
      h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores, { busy, actor: busy ? o.actor ?? null : null }) }, h(Probe))),
  );
  render();
  return {
    controller, store: promptStore(controller), human: vm.humanSide!,
    get: () => { render(); return out as Required<typeof out>; },
    settle: () => { busy = false; },
  };
}

describe("a quick second tap (usePromptActions over a recorded influence prompt)", () => {
  it("lands while your placement's frame finishes: queued, then applied once the prompt is interactive", () => {
    const fx = fixture("prompt-influence");
    const g = grab("prompt-influence", { busy: true, actor: fx.humanSide });
    const p = g.get().actions.prompt!;
    const one = p.options.find(o => o.kind === "country" && o.cost === 1)!;
    expect(g.get().map.interactive).toBe(true); // the frozen rings stay live for the tap
    g.get().actions.activateCountry(one.id);
    expect(g.controller.choices).toEqual([]);
    expect(g.store.get().queued).toMatchObject({ id: one.id, to: p.promptId });
    expect(g.get().actions.flushQueued()).toBe(false); // still animating
    g.settle();
    expect(g.get().actions.flushQueued()).toBe(true);
    expect(g.controller.choices).toEqual([{ promptId: p.promptId, idx: one.idx }]);
    expect(g.get().actions.flushQueued()).toBe(false); // applied once
  });
  it("is not queued while someone else's frame animates, and the map stays inert then", () => {
    const fx = fixture("prompt-influence");
    const ai: Side = fx.humanSide === "US" ? "USSR" : "US";
    const g = grab("prompt-influence", { busy: true, actor: ai });
    const one = g.get().actions.prompt!.options.find(o => o.kind === "country")!;
    expect(g.get().map.interactive).toBe(false);
    g.get().actions.activateCountry(one.id);
    expect(g.store.get().queued).toBeNull();
    expect(g.controller.choices).toEqual([]);
  });
  it("a coup's frame never queues (it ends the play)", () => {
    const fx = fixture("prompt-coup-target");
    const g = grab("prompt-coup-target", { busy: true, actor: fx.humanSide });
    expect(g.get().map.interactive).toBe(false);
    g.get().actions.activateCountry(g.get().actions.prompt!.countries[0]!);
    expect(g.store.get().queued).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("Esc \"Back to hand\" focuses the returned card", () => {
  it("asks the hand (through the store) to focus the play-mode card, and undoes", () => {
    const s = new PromptStore(fakeTimers());
    const undo = vi.fn();
    backToHand(s, { undo }, promptOf({ kind: "play-mode", pendingCard: 28 }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(s.get().focusCard).toBe(28);
    backToHand(s, { undo }, promptOf({ kind: "op-mode", pendingCard: 0 }));
    expect(undo).toHaveBeenCalledTimes(2);
  });
  it("the request lapses after a while; null clears it", () => {
    const timers = fakeTimers();
    const s = new PromptStore(timers);
    s.setFocusCard(28);
    expect(timers.delays()).toEqual([FOCUS_TIMEOUT_MS]);
    timers.fire();
    expect(s.get().focusCard).toBeNull();
    s.setFocusCard(21);
    s.setFocusCard(null);
    expect(s.get().focusCard).toBeNull();
    expect(timers.count()).toBe(0);
  });
});
