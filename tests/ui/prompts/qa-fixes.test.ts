/**
 * QA round 1, fix group F3 (docs/qa/TRIAGE.md Q-025 … Q-040): the prompt layer's fixes, on hand-made prompts
 * and on recorded scenes patched to the situation QA found (react-dom/server, as components.test.ts).
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Fixture } from "../../../src/dev/fixtureFormat";
import { WasmEngine } from "../../../src/engine/wasm_engine";
import type { CoupOdds, Prompt, PromptOption, Warning } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import { TouchUiContext } from "../../../src/ui/common/touch";
import {
  BranchDossier, CardPicker, CountryTooltip, DefconDossier, OrdersSlip, PlayModeStage, PromptStore, TargetList, commitFor,
  defconCaption, ordersHead, previewNow, promptStore, type PolicyContext,
} from "../../../src/ui/prompts";
import { coupNumbers, tooltipKeysKey } from "../../../src/ui/prompts/CountryTooltip";
import { bonusHints } from "../../../src/ui/prompts/OrdersSlip";
import { letterOf, opponentEventDetail } from "../../../src/ui/prompts/PlayModeStage";
import { gameEndOf } from "../../../src/ui/prompts/policy";
import { activeRow } from "../../../src/ui/prompts/TargetList";
import { t as appT } from "../../../src/i18n";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";
import type { UiSettings } from "../../../src/ui/ui-contract";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

const h = createElement;
const PUBLIC_BASE = new URL("../../../public/", import.meta.url).href;

interface Opts {
  layout?: LayoutKind;
  settings?: Partial<UiSettings>;
  touch?: boolean;
  patch?(fx: Fixture): void;
  before?(c: FixtureController): void;
}

function setup(name: string, o: Opts = {}) {
  const fx = JSON.parse(JSON.stringify(fixture(name))) as Fixture;
  o.patch?.(fx);
  const controller = new FixtureController(fx);
  o.before?.(controller);
  const vm = controller.getSnapshot();
  return { controller, fx, vm, prompt: vm.prompt as Prompt, state: vm.frame!.state };
}

function render(name: string, el: (x: ReturnType<typeof setup>) => ReactNode, o: Opts = {}) {
  const x = setup(name, o);
  const shown = staticShown(x.state, x.vm.frame!.regionScores);
  const tree = h(UiRootProvider, { controller: x.controller, settingsStore: createSettingsStore(null, o.settings ?? {}), layout: o.layout ?? "desktop", rootAttributes: false },
    h(StaticShownProvider, { value: shown }, el(x)));
  return renderToStaticMarkup(o.touch === undefined ? tree : h(TouchUiContext.Provider, { value: o.touch }, tree));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
const opt = (kind: PromptOption["kind"], id: number, extra: Partial<PromptOption> = {}): PromptOption => ({ idx: 1000 + id, kind, id, ...extra });
const promptOf = (p: Partial<Prompt>): Prompt => ({
  kind: "action-card", promptId: 1, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 0, maxPerCountry: 0,
  options: [], cards: [], countries: [], title: { key: "prompt:title.actionCard" }, ...p,
});
const css = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");

const WIN_USSR: Warning = { code: "game-ending", params: { winner: "USSR", reason: "defcon", faces: 6 } };
const LOSE: Warning = { code: "defcon-suicide", params: { faces: 6 } };

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await WasmEngine.load(PUBLIC_BASE, { printErr: () => undefined });
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("Q-025 DEFCON 1 the human wins (the phasing player takes the loss)", () => {
  const ctx: PolicyContext = { settings: { confirmFinal: true }, cost2: new Set(), humanSide: "USSR" };
  const p = promptOf({ kind: "defcon-level", resolvingCard: 45 });
  it("policy: a winning DEFCON 1 stages; a losing one (or one with no warning) needs the hold", () => {
    expect(commitFor(p, opt("defcon", 1, { warnings: [WIN_USSR] }), ctx)).toBe("stage");
    expect(commitFor(p, opt("defcon", 1, { warnings: [LOSE] }), ctx)).toBe("hold");
    expect(commitFor(p, opt("defcon", 1), ctx)).toBe("hold");
    expect(gameEndOf([WIN_USSR], "USSR")).toBe("win");
    expect(gameEndOf([WIN_USSR], "US")).toBe("lose");
    expect(gameEndOf([LOSE], "USSR")).toBe("lose");
    expect(gameEndOf([], "USSR")).toBeNull();
  });
  it("caption from the option's own warnings", () => {
    expect(defconCaption(1, 2, [WIN_USSR], "USSR")).toBe("endsWin");
    expect(defconCaption(1, 2, [LOSE], "USSR")).toBe("ends");
    expect(defconCaption(1, 2, [], "USSR")).toBe("degrade");
    expect(defconCaption(2, 2)).toBe("current");
    expect(defconCaption(3, 2)).toBe("improve");
  });
  const winning = (fx: Fixture) => { fx.final.prompt!.options.find(o => o.kind === "defcon" && o.id === 1)!.warnings = [WIN_USSR]; };
  it("the dossier: 'ends the game — you win', no hazard stripes, the warning's words once staged, no hold", () => {
    const html = render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }), { patch: winning });
    expect(text(html)).toContain("Ends the game — you win");
    expect(text(html)).not.toContain("you lose");
    const lamp1 = html.match(/<button[^>]*aria-label="DEFCON 1[^"]*"[^>]*>/)![0];
    expect(lamp1).not.toMatch(/_hazard_/);
    expect(lamp1).toMatch(/_win_/);
    expect(lamp1).toContain('title="This ends the game: the USSR wins."');
    const staged = render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }), {
      patch: winning, before: c => promptStore(c).stage({ kind: "option", id: 209, idx: 209, promptId: 110 }),
    });
    expect(text(staged)).toContain("This ends the game: the USSR wins.");
    expect(text(staged)).not.toContain("Press and hold");
    expect(text(staged)).toMatch(/DEFCON 1 ↵/);
  });
  it("a losing DEFCON 1 is unchanged (hazard, 'you lose', hold); Chinese", async () => {
    const html = render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }));
    expect(html.match(/<button[^>]*aria-label="DEFCON 1[^"]*"[^>]*>/)![0]).toMatch(/_hazard_/);
    expect(text(html)).toContain("Ends the game — you lose");
    await setLanguage("zh-CN");
    try {
      expect(text(render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }), { patch: winning }))).toContain("游戏结束——你赢了");
    } finally {
      await setLanguage("en");
    }
  });
});

describe("Q-039 a game end on a branch tile", () => {
  it("a win: a caution line on the tile, no hazard; a loss keeps the hazard line", () => {
    const html = render("prompt-branch", x => h(BranchDossier, { prompt: x.prompt }), {
      patch: fx => { fx.final.prompt!.options[0]!.warnings = [{ code: "game-ending", params: { winner: "USSR", reason: "vp20", faces: 6 } }]; },
    });
    const tile = html.match(/<button[^>]*aria-pressed[^>]*>.*?<\/button>/g)![0]!;
    expect(text(tile)).toContain("This ends the game: the USSR wins.");
    expect(tile).toMatch(/_tileCaution_/);
    expect(tile).not.toMatch(/_hazard_/);
    const lose = render("prompt-branch", x => h(BranchDossier, { prompt: x.prompt }), {
      patch: fx => { fx.final.prompt!.options[0]!.warnings = [{ code: "game-ending", params: { winner: "US", reason: "vp20", faces: 6 } }]; },
    });
    expect(lose.match(/<button[^>]*aria-pressed[^>]*>/)![0]).toMatch(/_hazard_/);
  });
  it("the slip: the warning panel is never squeezed below a line, and takes the crumb's line on desktop", () => {
    const warn = css("prompts/OrdersSlip.module.css").match(/\.warn \{[^}]*\}/)![0];
    expect(warn).toContain("min-height: calc(1.25em + 10px)");
    const staged = render("prompt-branch", () => h(OrdersSlip, { variant: "desktop" }), {
      patch: fx => { fx.final.prompt!.options[0]!.warnings = [{ code: "game-ending", params: { winner: "USSR", reason: "vp20", faces: 6 } }]; },
      before: c => promptStore(c).stage({ kind: "option", id: 200, idx: 200, promptId: 34 }),
    });
    expect(text(staged)).toContain("This ends the game: the USSR wins.");
    expect(staged).not.toMatch(/aria-label="This play so far"/);
  });
});

describe("Q-026 play-mode letters", () => {
  it("read the letter, also by physical key on other layouts", () => {
    expect(letterOf({ key: "S" })).toBe("s");
    expect(letterOf({ key: "ы", code: "KeyS" })).toBe("s");
    expect(letterOf({ key: "Enter", code: "Enter" })).toBe("enter");
  });
});

describe("Q-027 target list", () => {
  it("the active row is kept by country id; a row that left the list moves on in board order", () => {
    expect(activeRow([3, 4, 5], 4, null)).toBe(4);
    expect(activeRow([3, 4, 5], null, 5)).toBe(5);
    expect(activeRow([3, 4, 5], null, null)).toBe(3);
    // Europe (ids 0–20) in id order: UK (1) capped → the next target after it; past the last target → the last row
    expect(activeRow([0, 7, 9], 1, null)).toBe(7);
    expect(activeRow([0, 7, 9], 12, null)).toBe(9);
    expect(activeRow([], 4, null)).toBeNull();
  });
  it("the store remembers it across prompts of the map, forgets it on close and off the map", () => {
    const st = new PromptStore({ setTimeout: () => 0, clearTimeout: () => undefined });
    const vm = (p: Prompt) => ({ prompt: p, frame: null } as never);
    st.observe(vm(promptOf({ kind: "setup-place", promptId: 1 })));
    st.setListActive(16);
    st.observe(vm(promptOf({ kind: "setup-place", promptId: 2 })));
    expect(st.get().listActive).toBe(16);
    st.setListOpen(true);
    st.setListOpen(false);
    expect(st.get().listActive).toBeNull();
    st.setListActive(16);
    st.observe(vm(promptOf({ kind: "action-card", promptId: 3 })));
    expect(st.get().listActive).toBeNull();
  });
  it("each row's accessible name says the country, stability, influence and the action", () => {
    const html = render("prompt-coup-target", x => h(TargetList, { prompt: x.prompt, state: x.state }));
    expect(html).toMatch(/role="option" aria-label="Iran, battleground, stability 2, US \d, USSR \d — coup"/);
    const inf = render("prompt-influence", x => h(TargetList, { prompt: x.prompt, state: x.state }));
    expect(inf).toMatch(/aria-label="[^"]+, stability \d, US \d, USSR \d — place 1 influence, costs 2 Ops"/);
    expect(inf).toMatch(/aria-label="[^"]+, stability \d, US \d, USSR \d — place 1 influence"/);
  });
});

describe("Q-030 the target list in the compact-landscape side column", () => {
  it("the List link and the dossier (a full-screen sheet there); compact portrait keeps its expanded sheet", () => {
    const side = render("prompt-influence", () => h(OrdersSlip, { variant: "compact" }), { layout: "compact-landscape" });
    expect(side).toMatch(/_side_/);
    expect(side).toContain('title="Targets"');
    const portrait = render("prompt-influence", () => h(OrdersSlip, { variant: "compact" }), { layout: "compact" });
    expect(portrait).not.toContain('title="Targets"');
    const open = render("prompt-influence", () => h(OrdersSlip, { variant: "compact" }), { layout: "compact-landscape", before: c => promptStore(c).setListOpen(true) });
    expect(open).toContain('role="listbox"');
  });
});

describe("Q-031 the slip head past the turn's last round", () => {
  const t = appT as never;
  it("end of turn instead of AR 7 in turn 3 / AR 9; the ending's turn after final scoring", () => {
    const base = { flags: [], space: { US: 0, USSR: 0 }, phase_name: undefined } as const;
    expect(ordersHead(t, { ...base, turn: 3, action_round: 7, current_phase_name: "ACTION_ROUND" } as never)).toBe("Orders · End of turn 3");
    expect(ordersHead(t, { ...base, turn: 3, action_round: 6, current_phase_name: "ACTION_ROUND" } as never)).toBe("Orders · Turn 3 · AR 6");
    expect(ordersHead(t, { ...base, turn: 11, action_round: 0, current_phase_name: "HEADLINE" } as never, { turn: 10 })).toBe("Orders · End of turn 10");
    expect(ordersHead(t, { ...base, turn: 4, action_round: 0, current_phase_name: "HEADLINE" } as never)).toBe("Orders · Turn 4 · Headline");
  });
});

describe("Q-032 touch wording", () => {
  it("tooltip keys by policy, mouse or touch", () => {
    expect(tooltipKeysKey(null, false, null, false)).toBe("ui:tip.keys.inspect");
    expect(tooltipKeysKey(null, false, null, true)).toBe("ui_prompts:touch.inspect");
    expect(tooltipKeysKey("stage", true, "coup", true)).toBe("ui_prompts:touch.coup");
    expect(tooltipKeysKey("instant", false, "add", true)).toBe("ui_prompts:touch.place");
    expect(tooltipKeysKey("instant", false, "add", false)).toBe("ui:tip.keys.place");
    expect(tooltipKeysKey("hold", false, null, true)).toBe("ui_prompts:touch.hold");
  });
  it("tooltip, slip, dossiers and picker say Tap on touch, never right-click / Enter", () => {
    const tip = text(render("prompt-coup-target", x => {
      previewNow(x.controller, x.prompt, "coup", 25);
      return h(CountryTooltip, { country: 25, prompt: x.prompt, state: x.state, humanSide: "USSR" });
    }, { touch: true }));
    expect(tip).toContain("Tap to select · Tap again to launch");
    const slip = text(render("prompt-influence", () => h(OrdersSlip, { variant: "compact" }), { layout: "compact", touch: true }));
    expect(slip).toContain("Tap a ringed country");
    expect(slip).not.toMatch(/Click|Right-click/);
    expect(text(render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }), { touch: true }))).toContain("Tap again to confirm");
    expect(text(render("prompt-event-card", x => h(CardPicker, { prompt: x.prompt }), { touch: true }))).toContain("Tap a card twice to choose it");
    const coup = text(render("prompt-coup-target", () => h(OrdersSlip, { variant: "compact" }), {
      layout: "compact", touch: true, before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: 117 }),
    }));
    expect(coup).toContain("Tap Iran again to launch");
    // and the mouse words stay with a mouse
    expect(text(render("prompt-defcon-level", x => h(DefconDossier, { prompt: x.prompt }), { touch: false }))).toContain("Click again or press Enter to confirm");
  });
});

describe("Q-036 Grain Sales with an opponent's card", () => {
  const grain = (fx: Fixture) => {
    const p = fx.final.prompt!;
    p.title = { key: "prompt:card.67.playMode", params: { card: { card: 21, name: "NATO" } } };
    p.detail = { key: "prompt:card.67.detail" };
    p.resolvingCard = 67;
  };
  it("the Event row explains the opponent's Event; the header keeps Grain Sales' instruction", () => {
    const html = render("prompt-play-mode-opponent", x => h(PlayModeStage, { prompt: x.prompt }), { patch: grain });
    const event = text(html.match(/<button[^>]*data-mode="event"[^>]*>.*?<\/button>/)![0]);
    expect(event).toContain("A US card: if you use it for Operations, its Event happens for the US");
    expect(event).not.toContain("Grain Sales");
    expect(text(html)).toContain("Play it now, or return it to the USSR and use Grain Sales' 2 Ops.");
    expect(opponentEventDetail("US")).toEqual({ key: "prompt:detail.playModeOpponent", params: { side: { side: "US" } } });
  });
  it("ordinary play-mode: unchanged words, no header detail", () => {
    const html = render("prompt-play-mode-opponent", x => h(PlayModeStage, { prompt: x.prompt }));
    expect(text(html.match(/<button[^>]*data-mode="event"[^>]*>.*?<\/button>/)![0])).toContain("A US card");
    expect(html).not.toMatch(/_headDetail_/);
  });
});

describe("Q-037 conditional Ops bonuses in the influence hint", () => {
  const i18n = { t: appT as never, cardName: (c: number) => (c === 9 ? "Vietnam Revolts" : String(c)) };
  it("Vietnam Revolts for the USSR, the China Card's Asia bonus", () => {
    const inf = { kind: "influence" as const, pendingCard: 4 };
    expect(bonusHints(inf, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "USSR", i18n)).toEqual(["Vietnam Revolts gives +1 Op if every point goes to Southeast Asia."]);
    expect(bonusHints(inf, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "US", i18n)).toEqual([]);
    expect(bonusHints({ kind: "influence", pendingCard: 6 }, { flags: [] }, "US", i18n)).toEqual(["The China Card gives +1 Op if every point goes to Asia."]);
    // coups and realignments have hints of their own since QA round 2 (R-015, round2-f3.test.ts)
    expect(bonusHints({ kind: "event-target", pendingCard: 6 }, { flags: ["VIETNAM_REVOLTS_ACTIVE"] }, "USSR", i18n)).toEqual([]);
  });
  it("the slip says it first (the hint keeps the lines that fit)", () => {
    const t = text(render("prompt-influence", () => h(OrdersSlip, { variant: "desktop" }), {
      patch: fx => {
        for (const f of [...fx.frames, fx.final.frame!]) (f.state as { flags: string[] }).flags = [...f.state.flags, "VIETNAM_REVOLTS_ACTIVE"];
      },
    }));
    expect(t).toMatch(/Vietnam Revolts gives \+1 Op if every point goes to Southeast Asia\. Click a ringed country/);
  });
});

describe("Q-038 the coup's numbers from the engine", () => {
  const odds = (fx: Fixture) => fx.previews.coupOdds![25] as CoupOdds;
  it("credited Ops and the roll modifier when the controller gives them; the prompt's Ops otherwise", () => {
    expect(coupNumbers(null, { opsValue: 5 })).toEqual({ ops: 5, modifier: 0 });
    expect(coupNumbers({ country: 1, faces: [], ops: 4, modifier: -1 } as CoupOdds, { opsValue: 5 })).toEqual({ ops: 4, modifier: -1 });
  });
  it("formula, mil ops and the staged crumb follow them", () => {
    const patch = (fx: Fixture) => { Object.assign(odds(fx), { ops: 4, modifier: -1 }); };
    const tip = text(render("prompt-coup-target", x => {
      previewNow(x.controller, x.prompt, "coup", 25);
      return h(CountryTooltip, { country: 25, prompt: x.prompt, state: x.state, humanSide: "USSR" });
    }, { patch }));
    expect(tip).toContain("4 Ops + ⚀ − 1 − 2×2");
    expect(tip).toContain("Mil ops +4");
    const slip = text(render("prompt-coup-target", x => {
      previewNow(x.controller, x.prompt, "coup", 25);
      return h(OrdersSlip, { variant: "desktop" });
    }, { patch, before: c => promptStore(c).stage({ kind: "country", id: 25, idx: 141, promptId: 117 }) }));
    expect(slip).toMatch(/Iran · 4 Ops/);
  });
});

describe("layout fixes (stylesheets)", () => {
  it("Q-033 side-column slip: full-width title up to 4 lines, hint 4, the crumb wraps", () => {
    const s = css("prompts/OrdersSlip.module.css");
    expect(s).toMatch(/\.side \.title \{ grid-column: 1 \/ -1; -webkit-line-clamp: 4; \}/);
    expect(s).toMatch(/\.side \.hint \{ -webkit-line-clamp: 4; \}/);
    expect(s).toMatch(/\.side \.crumb \{ flex-wrap: wrap;/);
  });
  it("Q-034 compact region buttons: short names on two lines", () => {
    expect(css("prompts/OrdersSlip.module.css")).toMatch(/\.compact \.regionName \{ display: -webkit-box; -webkit-line-clamp: 2;/);
  });
  it("Q-029 / Q-035 play-mode sheet: thumbnail card on short screens, stacked Ops buttons on narrow phones", () => {
    const s = css("prompts/PlayModeStage.module.css");
    expect(s).toMatch(/@media \(max-height: 560px\) \{[^@]*\.sheetCard \{ width: 52px !important; \}/);
    expect(s).toMatch(/@media \(max-width: 480px\) \{[^@]*\.compactRows \.narrow \.t \{ flex-direction: column;/);
  });
  it("Q-029 card sheet: a sticky answer; Q-040 pile viewer fills the sheet", () => {
    expect(css("cards/cards.module.css")).toMatch(/\.sheetActions \{[^}]*position: sticky;/);
    expect(css("prompts/CardPicker.module.css")).toMatch(/\.compact \{ grid-template-columns: repeat\(auto-fill, minmax\(148px, 1fr\)\);/);
  });
});
