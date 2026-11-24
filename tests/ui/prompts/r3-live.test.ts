/**
 * QA round 3, live site, L-2: a game started before the AI was ready. The slip's "GETTING THE AI READY… N%" counts
 * the load with a number that only rises; "Still thinking" and the one-time slow-device hint are for a real AI
 * decision, never the download (the prompt store's decision clock starts when the load is done).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import type { LoadProgress, ViewModel } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import { loadBar, loadPercent } from "../../../src/ui/common/loadBar";
import { OrdersSlip, promptStore, PromptStore, resetSlowHint, slowHintAvailable, type Timers } from "../../../src/ui/prompts";
import { bootProgress } from "../../../src/ui/screens/BootLine";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import { fixture } from "../../fixtures/load";

const h = createElement;

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

const vmOf = (o: Partial<ViewModel> = {}): ViewModel => ({
  status: "playing", humanSide: "US", frame: null, queued: 0, prompt: null, aiThinking: false, canUndo: false, log: [], ending: null,
  hasSavedGame: false, ...o,
});

function clock(start: number) {
  let now = start;
  const t: Timers & { advance(ms: number): void } = {
    setTimeout: () => 0, clearTimeout: () => undefined, now: () => now, advance: (ms: number) => { now += ms; },
  };
  return t;
}

/** The AI's load as the worker reports it: each stage's `fraction` starts again from 0. */
const LOAD: LoadProgress[] = [
  { stage: "model-download", fraction: 0 }, { stage: "model-download", fraction: 0.36 }, { stage: "model-download", fraction: 0.98 },
  { stage: "model-download", fraction: 1 }, { stage: "model-verify", fraction: null }, { stage: "model-verify", fraction: 1 },
  { stage: "ai-worker", fraction: 0 }, { stage: "ai-worker", fraction: 0.5 }, { stage: "ai-worker", fraction: 1 },
];

describe("the load's percentage only rises (L-2)", () => {
  it("over every stage, as the boot line's bar", () => {
    const pct = LOAD.map(loadPercent);
    for (let i = 1; i < pct.length; i++) expect(pct[i]).toBeGreaterThanOrEqual(pct[i - 1]!);
    // Not 98 % then 50 %: the raw fraction of the next stage would have fallen back.
    expect(pct).toEqual([15, 38, 79, 80, 84, 84, 90, 95, 100]);
    for (const l of LOAD) expect(bootProgress("menu", l, false).bar).toBe(loadBar(l));
    expect(loadPercent(undefined)).toBe(0);
  });
});

describe("the AI's decision clock waits for the load (L-2)", () => {
  it("does not run while the AI loads, and starts when the load is done", () => {
    const t = clock(1000);
    const s = new PromptStore(t);
    s.observe(vmOf({ aiThinking: true, load: { stage: "model-download", fraction: 0.1 } }));
    expect(s.get().aiSince).toBeNull();
    t.advance(30_000);
    s.observe(vmOf({ aiThinking: true, load: { stage: "ai-worker", fraction: 0.5 } }));
    expect(s.get().aiSince).toBeNull();
    t.advance(4000);
    s.observe(vmOf({ aiThinking: true }));
    expect(s.get().aiSince).toBe(35_000);
    s.observe(vmOf({ aiThinking: false }));
    expect(s.get().aiSince).toBeNull();
  });
});

/** The slip in AI mode with the AI still loading, `ms` after the store saw it think. */
function loadingSlipAt(ms: number, load: LoadProgress) {
  const fx = JSON.parse(JSON.stringify(fixture("prompt-influence"))) as Fixture;
  fx.final = { ...fx.final, prompt: null, aiThinking: true, load };
  const controller = new FixtureController(fx);
  const vm = controller.getSnapshot();
  const now = vi.spyOn(performance, "now").mockReturnValue(50_000);
  promptStore(controller);
  now.mockReturnValue(50_000 + ms);
  const html = renderToStaticMarkup(
    h(UiRootProvider, { controller, settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false },
      h(StaticShownProvider, { value: staticShown(vm.frame!.state, vm.frame!.regionScores) }, h(OrdersSlip, { variant: "desktop" }))),
  );
  now.mockRestore();
  return html;
}
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the slip while the AI loads (L-2)", () => {
  afterEach(async () => { resetSlowHint(); await setLanguage("en"); });
  it("no 'Still thinking' count and no slow-device hint, however long the download; the hint stays for a decision", async () => {
    await setLanguage("en");
    const at25 = loadingSlipAt(25_000, { stage: "model-download", fraction: 0.36 });
    expect(text(at25)).toContain("Getting the AI ready… 38%");
    expect(at25).not.toContain("data-still");
    expect(text(at25)).not.toContain("Still thinking");
    expect(text(at25)).not.toContain("up to a minute");
    expect(slowHintAvailable(123)).toBe(true);
    await setLanguage("zh-CN");
    const zh = text(loadingSlipAt(47_000, { stage: "ai-worker", fraction: 0.5 }));
    expect(zh).toContain("95%");
    expect(zh).not.toContain("仍在思考");
  });
});
