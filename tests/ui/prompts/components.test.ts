/**
 * Prompt components rendered with react-dom/server on recorded scenes (the real UiRootProvider over a
 * FixtureController, a static Shown): the slip in every mode and variant, the play-mode stage, the
 * dossiers, the card picker and pile viewer, the country tooltip and the target list — in English,
 * Chinese and the pseudo-language (every visible string comes from a catalog or the data).
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { Prompt } from "../../../src/game/contract";
import { CARDS, COUNTRIES, REGIONS, SUBREGIONS } from "../../../src/data";
import { setLanguage } from "../../../src/i18n";
import {
  BranchDossier, CardPicker, CardSheetActions, CountryTooltip, DefconDossier, OrdersSlip, PlayModeStage, PromptDialogs, PromptStage,
  TargetList, previewNow, promptStore,
} from "../../../src/ui/prompts";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { Shown, UiSettings } from "../../../src/ui/ui-contract";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;

interface Opts {
  layout?: LayoutKind;
  settings?: Partial<UiSettings>;
  shown?: Partial<Shown>;
  patch?(fx: Fixture): Fixture;
  before?(c: FixtureController): void;
}

function setup(name: string, o: Opts = {}) {
  const fx = o.patch ? o.patch(fixture(name)) : fixture(name);
  const controller = new FixtureController(fx);
  o.before?.(controller);
  const vm = controller.getSnapshot();
  return { controller, fx, vm, prompt: vm.prompt as Prompt, state: vm.frame!.state };
}

function render(name: string, el: (x: ReturnType<typeof setup>) => ReactNode, o: Opts = {}) {
  const x = setup(name, o);
  const shown = staticShown(x.state, x.vm.frame!.regionScores, o.shown);
  return renderToStaticMarkup(
    h(UiRootProvider, { controller: x.controller, settingsStore: createSettingsStore(null, o.settings ?? {}), layout: o.layout ?? "desktop", rootAttributes: false },
      h(StaticShownProvider, { value: shown }, el(x))),
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
const slip = (variant: "desktop" | "tablet" | "compact" = "desktop", expanded = false) => () => h(OrdersSlip, { variant, expanded });

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined }); // the engine layout: branch names, space boxes
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("OrdersSlip — prompts", () => {
  it("influence: head, short verb, crumb, counter, coins, undo, hint with the 2 Ops chip, list link", () => {
    const html = render("prompt-influence", slip());
    const t = text(html);
    expect(t).toMatch(/Orders · Turn 6 · AR \d/);
    expect(t).toContain("Your move");
    expect(t).toContain("Place influence");
    expect(t).toMatch(/Bear Trap › Influence · 3 Ops/);
    expect(html).toMatch(/<b class="ts-num">2<\/b><small class="ts-num">\/3<\/small>/);
    expect(t).toContain("Ops left");
    expect((html.match(/class="_coin_[^"]*"/g) ?? []).length).toBe(3);
    expect((html.match(/coinSpent/g) ?? []).length).toBe(1);
    expect(t).toContain("Undo play");
    expect(html).toMatch(/costChip[^>]*>2 Ops</);
    expect(t).toContain("marks opponent control");
    expect(t).toContain("List");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-mode="prompt"');
  });

  it("Chinese", async () => {
    await setLanguage("zh-CN");
    const t = text(render("prompt-influence", slip()));
    expect(t).toMatch(/指令 · 第 6 回合 · 第 \d 行动轮/);
    expect(t).toContain("轮到你");
    expect(t).toContain("放置影响力");
    expect(t).toContain("剩余点数");
    expect(t).toContain("撤销本次出牌");
    expect(t).toContain("3 行动点");
    await setLanguage("en");
  });

  it("a staged coup: title names the country, primary launches, the hint says it is final", () => {
    const html = render("prompt-coup-target", slip(), {
      before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: c.getSnapshot().prompt!.promptId }),
    });
    const t = text(html);
    expect(t).toContain("Coup → Iran");
    expect(t).toContain("Launch coup");
    expect(t).toContain("A coup is final once the die is rolled. Click Iran again or press Enter.");
    expect(t).toMatch(/Socialist Governments › Coup → Iran · 3 Ops/);
  });

  it("headline: the space-race detail when present; staged: commit headline", () => {
    const t = text(render("prompt-headline", slip()));
    expect(t).toContain("Choose your headline card");
    expect(t).toMatch(/Space Race privilege: the US headline is Kitchen Debates ?\./);
    const staged = text(render("prompt-headline", slip(), { before: c => promptStore(c).stage({ kind: "card", id: 31, idx: 30, promptId: 82 }) }));
    expect(staged).toContain("Commit headline");
    expect(staged).toContain("Red Scare/Purge");
    const t1 = text(render("prompt-headline-t1", slip()));
    expect(t1).toContain("The AI chooses at the same time.");
  });

  it("a staged scoring card: score now, with the net if scored", () => {
    const t = text(render("prompt-action-card-china", slip(), { before: c => promptStore(c).stage({ kind: "card", id: 1, idx: 0, promptId: 56 }) }));
    expect(t).toContain("Score Asia now");
    expect(t).toMatch(/Asia if scored now: (US|USSR) \+\d|Asia if scored now: Even/);
  });

  it("warnings replace the hint while staged (scoring stranded)", () => {
    const x = setup("prompt-action-card-warning");
    const o = x.prompt.options.find(o => o.id === 27)!;
    const html = render("prompt-action-card-warning", slip(), { before: c => promptStore(c).stage({ kind: "card", id: 27, idx: o.idx, promptId: x.prompt.promptId }) });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("holding a scoring card at the end of the turn");
  });

  it("realignment: rolls counter, stop button with its §8.4 label", () => {
    const t = text(render("prompt-realign-target", slip()));
    expect(t).toContain("Realign");
    expect(t).toContain("Rolls left");
    expect(t).toContain("Stop realigning");
  });

  it("setup / bid / event placement titles and counters come from the prompt", () => {
    expect(text(render("prompt-setup-place-ussr", slip()))).toMatch(/Orders · Setup.*Place your starting influence in Eastern Europe.*4 \/4 Left/);
    // seen from the run's first prompt, the total is the run's
    const fromStart = render("prompt-setup-place-ussr", slip(), {
      before: c => {
        const store = promptStore(c);
        const vm = c.getSnapshot();
        store.observe({ ...vm, prompt: { ...vm.prompt!, promptId: 1, remaining: 6 } });
        store.observe(vm);
      },
    });
    expect(text(fromStart)).toMatch(/4 \/6 Left/);
    expect(text(render("prompt-bid-place", slip()))).toContain("US bid: place 2 extra influence");
    const ev = text(render("prompt-event-target-add", slip()));
    expect(ev).toContain("Liberation Theology: add USSR influence in Central America");
    expect(ev).toMatch(/3 \/3 Left/);
  });

  it("region prompt: one button per region, staged consequence from branchMeta", () => {
    const stage = (c: FixtureController) => promptStore(c).stage({ kind: "region", id: 1, idx: 215, promptId: 216 });
    // desktop: a dense grid (short names, full names as labels); the staged button is the primary
    const html = render("prompt-region", slip(), { before: stage });
    for (const r of ["Europe", "Middle East", "Asia", "Africa", "Central America", "South America"]) expect(html).toContain(`aria-label="${r}"`);
    expect(html).toMatch(/aria-pressed="true" aria-label="Asia"[^>]*>.*?Asia.*?↵/);
    expect(text(html)).toContain("The USSR may not place influence in Asia with Ops for the rest of the turn.");
    // compact: rows with the short names too (touch has no tooltip, QA Q-034), full names as labels; the primary button
    const compactHtml = render("prompt-region", slip("compact"), { before: stage, layout: "compact" });
    const compact = text(compactHtml);
    expect(compact).toContain("C. America");
    expect(compact).toContain("S. America");
    expect(compact).not.toContain("Central America");
    expect(compactHtml).toContain('aria-label="Central America"');
    expect(compact).toContain("Choose Asia");
  });

  it("a certain loss staged on the slip needs the hold", () => {
    const html = render("prompt-defcon-level", slip(), { before: c => promptStore(c).stage({ kind: "option", id: c.getSnapshot().prompt!.options[0]!.idx, idx: c.getSnapshot().prompt!.options[0]!.idx, promptId: 110 }) });
    expect(html).toMatch(/class="_hold_/);
    expect(html).toContain('aria-label="This drops DEFCON to 1 on your action: you lose the game."');
    expect(text(html)).toContain("Press and hold");
  });

  it("variants: tablet has no clip, compact expanded shows the target list", () => {
    expect(render("prompt-influence", slip("desktop"))).toContain("paperclip");
    expect(render("prompt-influence", slip("tablet"))).not.toContain("paperclip");
    const compact = render("prompt-influence", slip("compact", true), { layout: "compact" });
    expect(compact).toContain('role="listbox"');
    expect(compact).not.toContain(">List<");
  });

  it("every line that can be cut carries its full text as a tooltip (title, crumb, hint, consequence, regions)", () => {
    const influence = render("prompt-influence", slip());
    expect(influence).toMatch(/class="_title_[^"]*" title="Place influence"/);
    expect(influence).toMatch(/class="_crumb_[^"]*"[^>]*title="Bear Trap › Influence · 3 Ops"/);
    expect(influence).toMatch(/class="_hint_[^"]*"[^>]*title="Click a ringed country: \+1 influence\.[^"]*2 Ops[^"]*"/);
    const event = render("prompt-event-target-remove", slip());
    expect(event).toContain('title="Muslim Revolution: remove all US influence from one of the listed countries"');
    const coup = render("prompt-coup-target", slip(), {
      before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: c.getSnapshot().prompt!.promptId }),
    });
    expect(coup).toMatch(/class="_consequence_[^"]*" title="A coup is final once the die is rolled\. Click Iran again or press Enter\."/);
    expect(render("prompt-region", slip())).toContain('title="Central America"');
    // The AI's crumb: card › mode → target · Ops in one line, whole in its title.
    expect(text(render("prompt-influence", slip(), { patch: fx => ({ ...fx, final: { ...fx.final, prompt: null, aiThinking: true } }) }))).toContain("Waiting for the United States…");
  });

  it("frozen on the last prompt while your own click animates", () => {
    const html = render("prompt-influence", slip(), {
      before: c => { promptStore(c); c.getSnapshot(); },
      patch: fx => ({ ...fx, final: { ...fx.final, prompt: fx.final.prompt, frame: { ...fx.final.frame!, actor: "USSR" } } }),
      shown: { busy: true, actor: "USSR" },
    });
    expect(html).toContain('data-mode="frozen"');
    expect(html).toContain('aria-disabled="true"');
    expect(text(html)).toContain("Place influence");
  });
});

describe("OrdersSlip — AI mode", () => {
  const ai = (patch: Partial<Fixture["final"]>) => (fx: Fixture): Fixture => ({ ...fx, final: { ...fx.final, prompt: null, ...patch } });
  it("waiting with a caret, the AI stamp, speed segment and Skip", () => {
    const html = render("prompt-influence", slip(), { patch: ai({ aiThinking: true }) });
    const t = text(html);
    expect(html).toContain('data-mode="ai"');
    expect(t).toContain("US · AI");
    expect(t).toContain("Waiting for the United States…");
    expect(html).toContain("caret");
    expect(t).toContain("1×");
    expect(t).toContain("2×");
    expect(t).toContain("Skip");
    expect(html).toContain('aria-label="Skip to my turn"');
  });
  it("the AI's play while it animates", async () => {
    const t = text(render("prompt-influence", slip(), { patch: ai({}), shown: { busy: true, actor: "US", aiPlayCard: 30 } }));
    expect(t).toContain("United States plays Decolonization");
    await setLanguage("zh-CN");
    const zh = text(render("prompt-influence", slip(), { patch: ai({ aiThinking: true }) }));
    expect(zh).toContain("等待美国……");
    expect(zh).toContain("美国 · AI");
    await setLanguage("en");
  });
  it("loading the model", () => {
    const t = text(render("prompt-influence", slip(), { patch: ai({ aiThinking: true, load: { stage: "model-download", fraction: 0.62 } }) }));
    expect(t).toContain("Getting the AI ready… 62%");
  });
});

describe("PlayModeStage", () => {
  it("your own card: event, operations with effective Ops, space race with the next box, back to hand", () => {
    const html = render("prompt-play-mode", x => h(PlayModeStage, { prompt: x.prompt }));
    const t = text(html);
    expect(t).toContain("How will you play it?");
    expect(t).toContain("Suez Crisis");
    expect(t).toMatch(/Your card · \d Ops/);
    expect(t).toContain("Resolve the event");
    expect(t).toMatch(/Operations \d Ops/);
    for (const k of ["Influence", "Coup", "Realign", "Space race"]) expect(t).toContain(k);
    expect(t).toMatch(/Discard for a launch: box \d → \d, roll 1–\d\. No event\./);
    expect(t).toContain("Back to hand");
    expect(t).toContain("Undo is free until a die is rolled");
    for (const k of ["E", "I", "C", "R", "S"]) expect(html).toContain(`aria-keyshortcuts="${k}"`);
  });
  it("an opponent's card: event first, the shared opponent-event footer", () => {
    const t = text(render("prompt-play-mode-opponent", x => h(PlayModeStage, { prompt: x.prompt })));
    expect(t).toContain("Event first");
    expect(t).toContain("Opponent's card");
    expect(t).toContain("NATO is a US card: its Event will happen for the US.");
  });
  it("op-mode: only the three Operations, headed by the prompt", () => {
    const t = text(render("prompt-op-mode", x => h(PlayModeStage, { prompt: x.prompt })));
    expect(t).toContain("Use the Operations of Containment (3 Ops)");
    expect(t).not.toContain("Space race");
    expect(t).not.toContain("Resolve the event");
  });
  it("compact: a sheet with the card and the same rows; PromptStage picks it for play-mode prompts only", () => {
    const html = render("prompt-play-mode", x => h(PlayModeStage, { prompt: x.prompt }), { layout: "compact" });
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain("Space race");
    expect(render("prompt-play-mode", () => h(PromptStage))).toContain("How will you play it?");
    expect(render("prompt-influence", () => h(PromptStage))).toBe("");
  });
});

describe("dossiers and the picker", () => {
  it("branch: one tile per option from branchMeta, confirm disabled until staged", () => {
    const t = text(render("prompt-branch", x => h(BranchDossier, { prompt: x.prompt })));
    expect(t).toContain("Warsaw Pact Formed");
    expect(t).toContain("Remove US influence");
    expect(t).toContain("Add USSR influence");
    expect(t).toContain("Confirm");
    expect(render("prompt-branch", () => h(PromptDialogs))).toContain('role="dialog"');
  });
  it("DEFCON: five lamps, captions, level 1 hazard, the rule of the shown level", () => {
    const html = render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }));
    const t = text(html);
    for (const n of ["5", "4", "3", "2", "1"]) expect(html).toContain(`>${n}</span>`);
    expect(t).toContain("Current");
    expect(t).toContain("Ends the game — you lose");
    expect(t).toContain("No coups or realignments in Europe, Asia");
  });
  it("card picker: location tags, the hint, done on the left", () => {
    const html = render("prompt-event-card", x => h(CardPicker, { prompt: x.prompt }));
    const t = text(html);
    expect(t).toContain("UN Intervention: choose an opponent's card to play for Operations");
    expect((t.match(/Hand/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(t).toContain("Double-click a card or press Enter");
    const staged = text(render("prompt-event-card", x => h(CardPicker, { prompt: x.prompt }), { before: c => promptStore(c).stage({ kind: "card", id: 63, idx: 62, promptId: 95 }) }));
    expect(staged).toContain("Play Colonial Rear Guards");
  });
  it("pile viewer: filters, sorted by id", () => {
    const html = render("prompt-coup-target", () => h(CardPicker, { browse: "discard", onClose: () => undefined }));
    const t = text(html);
    expect(t).toMatch(/Discard pile · \d+ cards/);
    for (const k of ["Side", "Era", "Ops", "All", "Neutral", "Early War"]) expect(t).toContain(k);
    const ids = [...html.matchAll(/data-card="(\d+)"/g)].map(m => Number(m[1]));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids.length).toBeGreaterThan(5);
  });
  it("compact card sheet answers", () => {
    expect(text(render("prompt-action-card", () => h(CardSheetActions, { card: 25 }), { layout: "compact" }))).toContain("Play Containment");
    expect(text(render("prompt-headline", () => h(CardSheetActions, { card: 31 }), { layout: "compact" }))).toContain("Commit headline");
    expect(text(render("prompt-play-mode", () => h(CardSheetActions, { card: 28 }), { layout: "compact" }))).toContain("Space race");
    expect(render("prompt-influence", () => h(CardSheetActions, { card: 25 }))).toBe("");
  });
});

describe("CountryTooltip and TargetList", () => {
  it("coup: formula, success k/6, six dice, battleground DEFCON line, mil ops", () => {
    const html = render("prompt-coup-target", x => {
      previewNow(x.controller, x.prompt, "coup", 25);
      return h(CountryTooltip, { country: 25, prompt: x.prompt, state: x.state, humanSide: "USSR" });
    });
    const t = text(html);
    expect(t).toContain("Coup · Iran");
    expect(t).toContain("Battleground");
    expect(t).toContain("3 Ops + ⚀ − 2×2");
    expect(t).toContain("Success 5/6");
    expect((html.match(/data-face=/g) ?? []).length).toBe(6);
    expect(t).toMatch(/Battleground: DEFCON 4 → 3/);
    expect(t).toContain("Mil ops +3");
    expect(t).toContain("Click select · Click again to launch");
  });
  it("influence: +1 line, → control, cost on opponent control; the human side is marked", () => {
    const x = setup("prompt-influence");
    const c2 = x.prompt.options.find(o => o.cost === 2)!.id;
    const html = render("prompt-influence", y => h(CountryTooltip, { country: c2, prompt: y.prompt, state: y.state, humanSide: "USSR" }));
    const t = text(html);
    expect(t).toMatch(/\+1 → USSR \d → \d/);
    expect(t).toContain("Costs 2 Ops (US-controlled)");
    expect(t).toContain("USSR (you)");
  });
  it("realignment: outcome odds and the facts", () => {
    const t = text(render("prompt-realign-target", x => {
      previewNow(x.controller, x.prompt, "realign", 63);
      return h(CountryTooltip, { country: 63, prompt: x.prompt, state: x.state, humanSide: "USSR" });
    }));
    expect(t).toMatch(/US −1 11%/);
    expect(t).toContain("No change");
    expect(t).toMatch(/Adjacent controlled: US \d · USSR \d/);
  });
  it("no prompt: the plain rows and the inspect hint", () => {
    const t = text(render("prompt-headline", x => h(CountryTooltip, { country: 7, prompt: null, state: x.state, humanSide: "USSR" })));
    expect(t).toContain("West Germany");
    expect(t).toContain("Right-click or Space: keep this open");
  });
  it("target list: grouped in board order, actions by verb", () => {
    const html = render("prompt-coup-target", x => h(TargetList, { prompt: x.prompt, state: x.state }));
    expect(html).toContain('role="listbox"');
    expect((html.match(/role="option"/g) ?? []).length).toBe(18);
    const groups = [...html.matchAll(/role="group" aria-label="([^"]+)"/g)].map(m => m[1]);
    expect(groups[0]).toBe("Middle East");
    expect(text(html)).toContain("Coup");
    const inf = text(render("prompt-influence", x => h(TargetList, { prompt: x.prompt, state: x.state })));
    expect(inf).toContain("+1");
    expect(inf).toContain("2 Ops");
  });
});

describe("pseudo-language (en-XA): no hard-coded text", () => {
  const leftover = (html: string) => {
    const noKbd = html.replace(/<kbd[^>]*>[^<]*<\/kbd>/g, " ").replace(/<span class="[^"]*crumbCard[^"]*">[^<]*<\/span>/g, " ");
    let t = text(noKbd);
    for (let prev = ""; prev !== t;) { prev = t; t = t.replace(/⟦[^⟦⟧]*⟧/g, " "); }
    return t.replace(/[\s\d·›→/+−×↵⚀.,:%()\-–|]+/g, " ").trim();
  };
  it("slip, stage, dossiers, tooltip, list", async () => {
    await setLanguage("en-XA");
    try {
      // Names come from the data (cards, countries, regions); everything else must be marked.
      const names = [...CARDS.map(c => c.title.en), ...COUNTRIES.flatMap(c => [c.name.en, c.short.en]), ...REGIONS.map(r => r.name.en), ...SUBREGIONS.map(r => r.name.en)]
        .sort((a, b) => b.length - a.length);
      const stripNames = (t: string) => names.reduce((acc, n) => acc.split(n).join(" "), t);
      const cases: string[] = [
        render("prompt-influence", slip()),
        render("prompt-coup-target", slip(), { before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: 117 }) }),
        render("prompt-play-mode", x => h(PlayModeStage, { prompt: x.prompt })),
        render("prompt-branch", x => h(BranchDossier, { prompt: x.prompt })),
        render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt })),
        render("prompt-event-card", x => h(CardPicker, { prompt: x.prompt })),
        render("prompt-coup-target", x => { previewNow(x.controller, x.prompt, "coup", 25); return h(CountryTooltip, { country: 25, prompt: x.prompt, state: x.state, humanSide: "USSR" }); }),
        render("prompt-coup-target", x => h(TargetList, { prompt: x.prompt, state: x.state })),
      ];
      for (const html of cases) {
        const rest = stripNames(leftover(html)).replace(/[\s\d·›→/+−×↵⚀.,:%()\-–|“”"]+/g, " ").trim();
        expect(rest).toBe("");
      }
    } finally {
      await setLanguage("en");
    }
  });
});
