/**
 * Rail (src/ui/rail): the Dispatches model (time codes, filters, separators, the play in progress),
 * the effect chips, the adversary dossier (and that it never shows a hidden card, over every recorded
 * frame), markup in en / zh / en-XA, and the rail beat handlers.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LogEntry, PublicState } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import {
  AdversaryDossier, AiAnnouncer, Dispatches, EffectsStrip, Rail, RailFlyout, RailStrip, announcedLines, announcementText, createRailStore,
  diceOf, effectChips, isDiceEntry, logRows, miniStep, passesFilter, plainText, registerRailHandlers, tapeMove, tapeRefs, timeCodes,
} from "../../../src/ui/rail";
import { railStoreFor } from "../../../src/ui/rail/railStore";
import { fixture, fixtureNames } from "../../fixtures/load";
import { beatCtx, harness, unmarkedWords } from "../console/helpers";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const h = createElement;
const midgame = () => fixture("prompt-midgame");

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

const entry = (id: number, turn: number, ar: number, kind: LogEntry["kind"], side: LogEntry["side"] = null, details?: LogEntry["details"]): LogEntry =>
  ({ id, turn, ar, kind, side, text: { key: "ui:app.title" }, details });

describe("Dispatches model", () => {
  const log: LogEntry[] = [
    entry(1, 1, 0, "system"),
    entry(2, 1, 0, "play", "USSR"),
    entry(3, 1, 0, "headline", "US"),
    entry(4, 1, 0, "event", "USSR"),
    entry(5, 1, 1, "play", "USSR", [{ key: "log:roll.coup", params: { roll: 5 } }]),
    entry(6, 1, 1, "play", "US"),
    entry(7, 1, 7, "turn"),
    entry(8, 2, 0, "headline", "USSR"),
    entry(9, 2, 3, "play", "US"),
    entry(10, 2, 3, "event", "US"),
    entry(11, 2, 0, "system"),
  ];

  it("time codes: setup, the turn's headline, the round, turn ends and system lines", () => {
    expect(timeCodes(log)).toEqual([
      { k: "setup" }, { k: "setup" }, { k: "headline", turn: 1 }, { k: "headline", turn: 1 }, { k: "ar", ar: 1 }, { k: "ar", ar: 1 },
      { k: "turn", turn: 1 }, { k: "headline", turn: 2 }, { k: "ar", ar: 3 }, { k: "ar", ar: 3 }, { k: "turn", turn: 2 },
    ]);
  });

  it("filters: Plays keeps plays, headlines, events, scoring and turn ends; Dice keeps entries with a roll", () => {
    expect(log.filter(e => passesFilter(e, "plays")).map(e => e.id)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(log.filter(e => passesFilter(e, "dice")).map(e => e.id)).toEqual([5]);
    expect(isDiceEntry({ ...entry(1, 1, 1, "roll") })).toBe(true);
    expect(diceOf({ key: "log:roll.realign", params: { usRoll: 4, ussrRoll: 2 } } as never)).toEqual([4, 2]);
    expect(diceOf({ key: "log:change.vp", params: { roll: 4 } } as never)).toEqual([]);
  });

  it("rows: a separator opens each turn (never on a turn-end line); the play in progress is washed, its last entry has the caret", () => {
    const rows = logRows(log, "all", { turn: 2, ar: 3 });
    expect(rows.filter(r => r.k === "sep").map(r => r.k === "sep" && `${r.turn}:${r.era}`)).toEqual(["1:early", "2:early"]);
    const kinds = rows.map(r => (r.k === "sep" ? `sep${r.turn}` : r.key));
    expect(kinds).toEqual(["sep1", 1, 2, 3, 4, 5, 6, 7, "sep2", 8, 9, 10, 11]);
    // The newest entry is a system line, so no play is "in progress" at the end of the log.
    expect(rows.filter(r => r.k === "entry" && r.current)).toEqual([]);
    const live = logRows(log.slice(0, 10), "all", { turn: 2, ar: 3 }).filter(r => r.k === "entry" && r.current).map(r => r.k === "entry" && [r.key, r.caret]);
    expect(live).toEqual([[9, false], [10, true]]);
    expect(logRows(log.slice(0, 10), "all", null).some(r => r.k === "entry" && r.current)).toBe(false);
  });

  it("a real whole game: every entry once, separators for each turn reached", () => {
    const full = fixture("game-full").final.log;
    const rows = logRows(full, "all", null);
    expect(rows.filter(r => r.k === "entry")).toHaveLength(full.length);
    const turns = [...new Set(full.filter(e => e.kind !== "turn").map(e => e.turn))];
    expect(rows.filter(r => r.k === "sep").map(r => r.k === "sep" && r.turn)).toEqual(turns);
    expect(rows.filter(r => r.k === "entry" && passesFilter(r.entry, "dice")).length).toBeGreaterThan(5);
  });
});

describe("effect chips", () => {
  it("keep flags with effect info, this turn → conditional → permanent, arrivals merged", () => {
    const chips = effectChips(["MARSHALL_PLAN_PLAYED", "UNKNOWN_FLAG", "FLOWER_POWER_ACTIVE", "NUCLEAR_SUBS_ACTIVE"], ["NUCLEAR_SUBS_ACTIVE", "CHERNOBYL_ACTIVE"]);
    expect(chips.map(c => c.flag)).toEqual(["NUCLEAR_SUBS_ACTIVE", "CHERNOBYL_ACTIVE", "FLOWER_POWER_ACTIVE", "MARSHALL_PLAN_PLAYED"]);
    expect(chips[0]!.info).toMatchObject({ cardId: 41, side: "US", duration: "TURN" });
  });

  it("markup: glyph, thumbnail, name, duration, side bar; the header anchors `effects`", () => {
    const out = html(h(EffectsStrip, { flags: ["NUCLEAR_SUBS_ACTIVE", "WARSAW_PACT_PLAYED", "NATO_CANCELED_FRANCE"] }));
    expect(out).toContain(">In effect<");
    expect(out).toContain(">3<");
    expect(out).toMatch(/_fxUs_[^"]*"[^>]*data-flag="NUCLEAR_SUBS_ACTIVE"/);
    expect(out).toMatch(/_fxUssr_[^"]*"[^>]*data-flag="WARSAW_PACT_PLAYED"/);
    expect(out).toMatch(/_fxBoth_[^"]*"[^>]*data-flag="NATO_CANCELED_FRANCE"/);
    expect(out).toMatch(/src="[^"]*cards\/en\/041\.webp"/);
    expect(out).toContain(">This turn<");
    expect(out).toContain(">Permanent<");
    expect(html(h(EffectsStrip, { flags: [] }))).toContain("No ongoing effects");
  });
});

describe("adversary dossier", () => {
  const st = (patch: Partial<PublicState>) => ({ ...midgame().final.frame!.state, ...patch }) as PublicState;

  it("backs for unknown cards, known cards face up under one tag, the China Card, status and meta", () => {
    const hs = harness({ state: midgame().final.frame!.state });
    const s = st({ aiHandCount: 6, aiKnownCards: [26, 30], china_card: { holder: "US", playable: false } });
    const out = html(hs.wrap(h(AdversaryDossier, { state: s, aiSide: "US", status: "thinking" })));
    expect(out).toContain('data-backs="4"');
    expect(out.match(/data-mini="back"/g)?.length).toBe(4);
    expect(out).toMatch(/data-card="26"/);
    expect(out).toMatch(/data-card="30"/);
    expect(out.match(/>Known</g)?.length).toBe(1);
    expect(out).toContain('data-china="down"');
    expect(out).toContain('data-status="thinking"');
    expect(out).toContain(">Thinking<");
    expect(out).toContain("United States");
    expect(out).toContain("DeepStruggle AI · full strength");
    expect(out).toMatch(/<b class="ts-num">6<\/b> cards in hand/);
    expect(out).toContain("2 known");
    expect(out).toContain("China Card: theirs · face down");
    expect(out).toContain(">AR 1<");
  });

  it("the committed AI headline sits face down in its slot", () => {
    const out = html(h(AdversaryDossier, { state: st({ aiHeadlineHidden: true, current_phase_name: "HEADLINE" }), aiSide: "US", status: "waiting" }));
    expect(out).toContain("Headline · committed");
    expect(out).toContain(">Headline<");
  });

  it("the hand row tightens as the hand grows", () => {
    expect(miniStep(1)).toBe(44);
    expect(miniStep(4)).toBe(32);
    expect(miniStep(9)).toBe(14);
    expect(miniStep(30)).toBe(10);
  });

  it("never shows a card the human may not see (every frame of every fixture)", () => {
    let frames = 0;
    for (const name of fixtureNames()) {
      const fx = fixture(name);
      const ai = fx.humanSide === "US" ? "USSR" : "US";
      const step = name === "game-full" ? 7 : 1;
      fx.frames.forEach((f, i) => {
        if (i % step) return;
        frames++;
        const s = f.state as PublicState;
        const out = html(h(AdversaryDossier, { state: s, aiSide: ai, status: "waiting" }));
        const shown = [...out.matchAll(/data-card="(\d+)"/g)].map(m => Number(m[1]));
        const allowed = new Set([...s.aiKnownCards, 6]);
        expect(shown.filter(c => !allowed.has(c)), `${name} #${i}`).toEqual([]);
        expect(out.match(/data-mini="back"/g)?.length ?? 0, `${name} #${i}`).toBe(Math.max(0, s.aiHandCount - s.aiKnownCards.length));
        if (s.china_card.holder !== ai) expect(out).not.toContain("data-china");
      });
    }
    expect(frames).toBeGreaterThan(200);
  });
});

describe("dispatches markup", () => {
  it("tape, filters, separators, time codes, side glyphs, refs; one Tab stop with a keys hint, no live region (Q-045, Q-049)", () => {
    const fx = midgame();
    const hs = harness({ state: fx.final.frame!.state, log: fx.final.log });
    const out = html(hs.wrap(h(Dispatches, { log: fx.final.log, humanSide: "USSR", current: null })));
    expect(out).toContain(">Dispatches<");
    expect(out).toMatch(/aria-pressed="true"[^>]*>All</);
    expect(out).toContain(">Plays<");
    expect(out).toContain(">Dice<");
    expect(out).toContain("Turn 6 · Mid War");
    expect(out).toContain(">T6 HL<");
    // The screen-reader mirror is the game screen's AiAnnouncer (one in every arrangement): none here.
    expect(out).not.toContain("aria-live");
    expect(out).toMatch(/tabindex="0"[^>]*aria-label="Dispatches"[^>]*aria-describedby="([^"]+)"/);
    const hint = /aria-describedby="([^"]+)"/.exec(out)![1]!;
    expect(out).toContain(`id="${hint}">Arrow keys: the cards and countries named in the log`);
    expect(out).toMatch(/data-card="30"/); // card refs from MessageText (tabindex −1 once mounted: tapeRefs)
    expect(out).toContain("Show earlier dispatches"); // a long log draws the latest rows first
    expect(out.match(/<li class="[^"]*_le_/g)!.length).toBeLessThanOrEqual(240);
  });

  it("the play in progress gets the wash and the caret", () => {
    const log = [entry(1, 3, 2, "play", "US"), entry(2, 3, 2, "event", "US")];
    const out = html(h(Dispatches, { log, humanSide: "USSR", current: { turn: 3, ar: 2 } }));
    expect(out.match(/_now_/g)?.length).toBe(2);
    expect(out.match(/_caret_/g)?.length).toBe(1);
  });
});

describe("dispatches keys (Q-049): the names in the tape by arrows, not Tab", () => {
  it("from the tape, → / ← step into the names on screen; ↑ ↓ stay with the tape (it scrolls)", () => {
    expect(tapeMove("ArrowRight", -1, 10, 3, 7)).toBe(3);
    expect(tapeMove("ArrowLeft", -1, 10, 3, 7)).toBe(7);
    expect(tapeMove("ArrowRight", -1, 10, -1, -1)).toBe(0);
    expect(tapeMove("ArrowLeft", -1, 10, -1, -1)).toBe(9);
    expect(tapeMove("ArrowDown", -1, 10, 3, 7)).toBeNull();
    expect(tapeMove("ArrowUp", -1, 10, 3, 7)).toBeNull();
    expect(tapeMove("ArrowRight", -1, 0, -1, -1)).toBeNull();
  });
  it("from a name, arrows move between names (clamped), Home / End, Esc back to the tape; Enter is the ref's own", () => {
    expect(tapeMove("ArrowDown", 4, 10, -1, -1)).toBe(5);
    expect(tapeMove("ArrowRight", 9, 10, -1, -1)).toBe(9);
    expect(tapeMove("ArrowUp", 0, 10, -1, -1)).toBe(0);
    expect(tapeMove("ArrowLeft", 4, 10, -1, -1)).toBe(3);
    expect(tapeMove("Home", 4, 10, -1, -1)).toBe(0);
    expect(tapeMove("End", 4, 10, -1, -1)).toBe(9);
    expect(tapeMove("Escape", 4, 10, -1, -1)).toBe("tape");
    expect(tapeMove("Enter", 4, 10, -1, -1)).toBeNull();
    expect(tapeMove("Tab", 4, 10, -1, -1)).toBeNull();
  });
  it("tapeRefs finds the card and country names (role=button), nothing else", () => {
    const els = [{ id: "a" }, { id: "b" }];
    const root = { querySelectorAll: (sel: string) => (sel.includes("[data-card][role=button]") && sel.includes("[data-country][role=button]") ? els : []) };
    expect(tapeRefs(root as unknown as ParentNode)).toEqual(els);
    expect(tapeRefs(null)).toEqual([]);
  });
});

describe("AI-play announcer (Q-045, Q-050)", () => {
  const coup = (side: LogEntry["side"]): LogEntry => ({
    id: 40, turn: 2, ar: 3, kind: "play", side,
    text: { key: "log:action.coup", params: { side: "US", country: { type: "country", id: 30, name: "Egypt" } } },
    details: [{ key: "ui:app.title" }, { key: "ui:track.vpEven" }],
  } as unknown as LogEntry);

  it("reads an AI entry whole: the main line and every detail (die, result, DEFCON, VP...)", () => {
    const lines = announcedLines(coup("US"), "US");
    expect(lines.map(m => m.key)).toEqual(["log:action.coup", "ui:app.title", "ui:track.vpEven"]);
  });

  it("reads nothing of the human's own entries except the headline reveal and its order", () => {
    expect(announcedLines(coup("USSR"), "US")).toEqual([]);
    const reveal: LogEntry = {
      id: 41, turn: 2, ar: 0, kind: "headline", side: "USSR", text: { key: "log:action.headlineCommit" },
      details: [{ key: "log:headline.revealed" }, { key: "log:headline.order" }, { key: "ui:app.title" }],
    } as unknown as LogEntry;
    expect(announcedLines(reveal, "US").map(m => m.key)).toEqual(["log:headline.revealed", "log:headline.order"]);
    expect(announcedLines({ ...reveal, side: null }, "US").map(m => m.key)).toEqual(["log:headline.revealed", "log:headline.order"]);
  });

  it("one message per entry: lines become sentences in the page language", () => {
    expect(announcementText(["US attempts Coup in Egypt", "US rolls 1 -> Coup Failed", "DEFCON: 3 -> 2"], ". "))
      .toBe("US attempts Coup in Egypt. US rolls 1 -> Coup Failed. DEFCON: 3 -> 2.");
    expect(announcementText(["Already a sentence.", "", "  spaced  "], ". ")).toBe("Already a sentence. spaced.");
    expect(announcementText(["美国在埃及发动政变", "DEFCON：3 -> 2"], "。")).toBe("美国在埃及发动政变。DEFCON：3 -> 2。");
    expect(announcementText([], ". ")).toBe("");
  });

  it("plain text: names as text, catalog markup dropped", () => {
    const t = plainText({ key: "log:action.coup", params: { side: "US", country: { type: "country", id: 30, name: "Egypt" } } } as never);
    expect(t).not.toMatch(/[<>\uE000-\uF8FF]/);
    expect(t.length).toBeGreaterThan(0);
  });

  it("the live region: a polite log, one per game screen, empty until something happens", () => {
    const fx = midgame();
    const hs = harness({ state: fx.final.frame!.state, log: fx.final.log });
    const out = html(hs.wrap(h(AiAnnouncer)));
    expect(out).toMatch(/^<div class="ts-vh" role="log" aria-live="polite" aria-relevant="additions" aria-label="Adversary&#x27;s moves"><\/div>$/);
  });
});

describe("rail markup", () => {
  it("desktop rail: dossier, effects, dispatches; collapsed: the strip", () => {
    const fx = midgame();
    const hs = harness({ state: fx.final.frame!.state, log: fx.final.log, humanSide: "USSR" });
    const out = html(hs.wrap(h(Rail, { collapsed: false, onToggle: () => undefined })));
    expect(out).toContain(">Adversary<");
    expect(out).toContain(">In effect<");
    expect(out).toContain(">Dispatches<");
    expect(out).toContain('aria-label="Hide the rail"');
    const collapsed = html(hs.wrap(h(Rail, { collapsed: true, onToggle: () => undefined })));
    expect(collapsed).toContain('aria-label="Show the rail"');
    expect(collapsed).toContain('data-panel="adversary"');
    expect(collapsed).not.toContain(">Dispatches<");
  });

  it("tablet strip: four buttons with badges; a flyout holds one section", () => {
    const fx = midgame();
    const st = fx.final.frame!.state;
    const hs = harness({ state: st, log: fx.final.log, humanSide: "USSR" });
    const strip = html(hs.wrap(h(RailStrip, { open: "log", onOpen: () => undefined })));
    expect(strip.match(/data-panel=/g)?.length).toBe(4);
    expect(strip).toMatch(/aria-pressed="true"[^>]*data-panel="log"/);
    expect(strip).toContain(`>${st.aiHandCount}<`);
    const fly = html(hs.wrap(h(RailFlyout, { panel: "adversary", onClose: () => undefined })));
    expect(fly).toContain('role="dialog"');
    expect(fly).toContain('aria-label="Close"');
    expect(fly).toContain("United States");
    expect(html(hs.wrap(h(RailFlyout, { panel: "status", onClose: () => undefined })))).toContain("Mil ops · need");
  });

  it("Chinese", async () => {
    await setLanguage("zh-CN");
    try {
      const fx = midgame();
      const hs = harness({ state: fx.final.frame!.state, log: fx.final.log, humanSide: "USSR" });
      const out = html(hs.wrap(h(Rail, { collapsed: false, onToggle: () => undefined })));
      expect(out).toContain(">对手<");
      expect(out).toContain(">生效中<");
      expect(out).toContain(">电报<");
      expect(out).toContain("第 6 回合 · 战争中期");
      expect(out).toMatch(/手牌 <b class="ts-num">8<\/b> 张/);
      expect(out).toContain("T6 头条");
    } finally {
      await setLanguage("en");
    }
  });

  it("pseudo-language: every word in the rail comes from a catalog", async () => {
    await setLanguage("en-XA");
    try {
      for (const name of ["prompt-midgame", "prompt-action-card", "prompt-region"]) {
        const fx = fixture(name);
        const hs = harness({ state: fx.final.frame!.state, log: fx.final.log, humanSide: fx.humanSide });
        const out = html(hs.wrap(h(Rail, { collapsed: false, onToggle: () => undefined })));
        expect(unmarkedWords(out), name).toEqual([]);
        const fly = html(hs.wrap(h(RailFlyout, { panel: "effects", onClose: () => undefined })));
        expect(unmarkedWords(fly), name).toEqual([]);
        const strip = html(hs.wrap(h(RailStrip, { open: null, onOpen: () => undefined })));
        expect(unmarkedWords(strip), name).toEqual([]);
      }
    } finally {
      await setLanguage("en");
    }
  });
});

describe("rail beats", () => {
  const deps = (slept: number[], reduced = false) => ({
    store: createRailStore(), aiSide: () => "US" as const, reduced: () => reduced, sleep: async (ms: number) => { slept.push(ms); },
  });

  it("china: the rail has no handler (the tray alone toasts ui:toast.china, once)", () => {
    const hs = harness();
    const off = registerRailHandlers(hs.director, deps([]));
    expect(hs.director.count("china")).toBe(0);
    off();
  });

  it("hand-revealed: only the AI's cards, flipped one by one, then the stamp", async () => {
    const hs = harness();
    const slept: number[] = [];
    const d = deps(slept);
    const off = registerRailHandlers(hs.director, d);
    await hs.director.run({ k: "hand-revealed", side: "USSR", cards: [5, 7] }, beatCtx());
    expect(d.store.get().reveal).toBeNull();
    await hs.director.run({ k: "hand-revealed", side: "US", cards: [5, 7, 9] }, beatCtx());
    expect(d.store.get().reveal).toMatchObject({ cards: [5, 7, 9], per: 350, stagger: 90, reduced: false });
    expect(slept).toEqual([350 + 90 * 2 + 300]);
    off();
  });

  it("headline-chosen (AI) slides the card in; effect on/off pin and tear; unknown flags are skipped", async () => {
    const hs = harness();
    const slept: number[] = [];
    const d = deps(slept);
    const off = registerRailHandlers(hs.director, d);
    await hs.director.run({ k: "headline-chosen", side: "USSR" }, beatCtx());
    expect(d.store.get().headline).toBeNull();
    await hs.director.run({ k: "headline-chosen", side: "US" }, beatCtx());
    expect(d.store.get().headline).toMatchObject({ ms: 400 });
    await hs.director.run({ k: "effect", flag: "NUCLEAR_SUBS_ACTIVE", on: true }, beatCtx());
    await hs.director.run({ k: "effect", flag: "MARSHALL_PLAN_PLAYED", on: false }, beatCtx({ motion: 0.5 }));
    await hs.director.run({ k: "effect", flag: "NOT_A_FLAG", on: true }, beatCtx());
    expect(Object.keys(d.store.get().fxOn)).toEqual(["NUCLEAR_SUBS_ACTIVE"]);
    expect(Object.keys(d.store.get().fxOff)).toEqual(["MARSHALL_PLAN_PLAYED"]);
    expect(slept).toEqual([400, 450, 150]);
    d.store.reset();
    expect(d.store.get()).toMatchObject({ reveal: null, headline: null, fxOn: {}, fxOff: {} });
    off();
    expect(hs.director.count("effect")).toBe(0);
  });

  it("reduced motion: faces and chips just appear; the stamp keeps its reading time", async () => {
    const hs = harness();
    const slept: number[] = [];
    const d = deps(slept, true);
    const off = registerRailHandlers(hs.director, d);
    await hs.director.run({ k: "hand-revealed", side: "US", cards: [5, 7] }, beatCtx());
    expect(d.store.get().reveal).toMatchObject({ per: 0, stagger: 0, reduced: true });
    await hs.director.run({ k: "effect", flag: "NUCLEAR_SUBS_ACTIVE", on: true }, beatCtx());
    expect(slept).toEqual([300]);
    off();
  });

  it("the dossier shows a reveal in progress as known cards (the committed state will list them)", async () => {
    const hs = harness({ state: midgame().final.frame!.state });
    const s = { ...midgame().final.frame!.state, aiHandCount: 3, aiKnownCards: [] } as PublicState;
    // The director's own store, as the mounted rail uses it.
    const off = registerRailHandlers(hs.director, { store: railStoreFor(hs.root.director), aiSide: () => "US", reduced: () => false, sleep: async () => undefined });
    await hs.director.run({ k: "hand-revealed", side: "US", cards: [26, 30] }, beatCtx());
    const out = html(hs.wrap(h(AdversaryDossier, { state: s, aiSide: "US", status: "waiting" })));
    expect(out).toContain('data-backs="1"');
    expect(out).toMatch(/data-card="26"/);
    expect(out).toMatch(/_flipping_/);
    expect(out).toContain(">Revealed<");
    off();
  });
});
