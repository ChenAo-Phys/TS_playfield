/**
 * Markup of the stage components (react-dom/server, no DOM): the views for fixed states, in English,
 * Chinese and the pseudo-language; the containers render nothing when idle.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ending, PublicState, ViewModel } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import { StaticShownProvider, staticShown } from "../../../src/ui/runner/ShownContext";
import {
  DangerFrame, DiceTrayView, DockPanel, GameOverTelex, HeadlinePapersView, ScoringSheetView, ScoringTable, Stage, TelexSheet,
  TurnBannerView, VpChart, diceModel, type DockState, type OverState, type ScoringState, type TelexStats,
} from "../../../src/ui/stage";
import { OverlayContext, UiRootContext, type OverlayState } from "../../../src/ui/state/context";
import { DEFAULT_SETTINGS, type UiRoot } from "../../../src/ui/ui-contract";
import type { LayoutKind } from "../../../src/ui/theme";
import { fixture } from "../../fixtures/load";

const h = createElement;
const mid = fixture("prompt-midgame");
const state = mid.frames[0]!.state;
const scores = mid.frames[0]!.regionScores;

function wrap(el: ReactNode, o: { layout?: LayoutKind; state?: PublicState | null } = {}): string {
  const vm: ViewModel = {
    status: "playing", humanSide: "USSR", frame: mid.frames[0]!, queued: 0, prompt: null, aiThinking: false, canUndo: false,
    log: mid.final.log, ending: null, hasSavedGame: false,
  };
  const root: UiRoot = {
    controller: {} as never, vm, layout: o.layout ?? "desktop", settings: DEFAULT_SETTINGS, setSettings: () => undefined,
    anchors: { ref: () => () => undefined, rect: () => null }, director: { on: () => () => undefined, run: async () => undefined },
    zoomCard: () => undefined, toast: () => undefined,
  };
  const overlays: OverlayState = { toasts: [], dismissToast: () => undefined, zoom: null, closeZoom: () => undefined };
  const shown = staticShown(o.state === undefined ? state : o.state, scores);
  return renderToStaticMarkup(
    h(UiRootContext.Provider, { value: root }, h(OverlayContext.Provider, { value: overlays }, h(StaticShownProvider, { value: shown }, el))),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

const dock = (p: Partial<DockState> = {}): DockState => ({
  key: 1, card: 30, side: "US", how: "coup", byHuman: false, phase: "pinned", pos: "right", country: 59, note: "USSR", from: "hand:US",
  compact: false, enterMs: 650, flightMs: 450, holdMs: 1100, leaveMs: 0, to: null, ...p,
});

describe("Stage and DangerFrame", () => {
  it("the stage is a layer with the centre anchor, empty when idle", () => {
    const out = wrap(h(Stage, {}));
    expect(out).toContain('data-stage=""');
    expect(out).not.toContain("role=");
    expect(out).toContain('data-layout="wide"');
    expect(text(out).trim()).toBe("");
    expect(wrap(h(Stage, {}), { layout: "compact" })).toContain('data-layout="compact"');
  });

  it("the danger frame shows at DEFCON 2 only, decorative", () => {
    expect(wrap(h(DangerFrame), { state: { ...state, defcon: 2 } })).toMatch(/data-danger=""[^>]*|aria-hidden="true"/);
    expect(wrap(h(DangerFrame), { state: { ...state, defcon: 2 } })).toContain("ts-ambient");
    expect(wrap(h(DangerFrame), { state: { ...state, defcon: 3 } })).toBe("");
    expect(wrap(h(DangerFrame), { state: null })).toBe("");
  });

  it("the telex renders nothing before the game is over", () => {
    const ending: Ending = { winner: "US", reason: "vp20", vpBefore: 18, vpFinal: 20, turn: 5 };
    expect(wrap(h(GameOverTelex, { ending, humanSide: "USSR", onNewGame: () => undefined, onReview: () => undefined, onLog: () => undefined }))).toBe("");
  });
});

describe("reveal dock", () => {
  it("names the side, the card, how and where; notes an opponent card; registers its side", async () => {
    await setLanguage("en");
    const out = wrap(h(DockPanel, { dock: dock() }));
    const tx = text(out);
    expect(out).toContain('aria-label="Card played by the United States"');
    expect(tx).toContain("United States plays");
    expect(tx).toContain("Decolonization");
    expect(tx).toContain("Operations · Coup → Angola");
    expect(tx).toContain("2 Ops");
    expect(tx).toContain("USSR card: its event also happens, for the USSR.");
    expect(out).toContain('data-side="US"');
    expect(out).toContain('data-pinned="true"');
    expect(out).toContain('data-back=""');
  });

  it("a headline card: no back, the side's headline kicker; an event play: no Ops", () => {
    const hl = text(wrap(h(DockPanel, { dock: dock({ how: "headline", card: 18, side: "USSR", note: null, country: null }) })));
    expect(hl).toContain("USSR headline");
    expect(hl).toContain("Headline");
    expect(wrap(h(DockPanel, { dock: dock({ how: "headline" }) }))).not.toContain('data-back=""');
    const ev = text(wrap(h(DockPanel, { dock: dock({ how: "event", note: null, country: null }) })));
    expect(ev).toContain("Event");
    expect(ev).not.toMatch(/\bOps?\b/);
    expect(text(wrap(h(DockPanel, { dock: dock({ how: "pass", note: null, country: null }) })))).toContain("Pass");
  });

  it("speaks Chinese and the pseudo-language", async () => {
    await setLanguage("zh-CN");
    const zh = text(wrap(h(DockPanel, { dock: dock() })));
    expect(zh).toContain("美国打出");
    expect(zh).toContain("行动 · 政变 → 安哥拉");
    expect(zh).toContain("2 行动点");
    expect(zh).toContain("苏联卡牌：其事件同样发生，由苏联执行。");
    await setLanguage("en-XA");
    const xa = text(wrap(h(DockPanel, { dock: dock() })));
    expect(xa).toContain("⟦");
    expect(xa).not.toMatch(/United States plays(?!⟧)/);
    await setLanguage("en");
  });
});

describe("dice tray", () => {
  const model = () => diceModel({ type: "COUP", roller: "US", country_id: 71, roll1: 6, mod1: 3, total1: 9, mod2: 6, total2: 6, success: true },
    { ...mid.frames[0]!, events: [{ t: "influence", country: 71, side: "USSR", from: 3, to: 0 }] }, state);

  it("shows the die, then the maths and result once landed", async () => {
    await setLanguage("en");
    const landed = wrap(h(DiceTrayView, { model: model(), phase: "hold" }));
    expect(landed).toContain('aria-label="Coup · Cuba"');
    expect(landed).toContain('aria-label="US die: 6, success"');
    expect(text(landed)).toContain("6 + 3 Ops − 2×3 = 3");
    expect(text(landed)).toContain("USSR −3");
    expect(landed).toContain('data-ok="true"');
    const tumbling = wrap(h(DiceTrayView, { model: model(), phase: "tumble", tumbleMs: 700 }));
    expect(text(tumbling)).not.toContain("USSR −3");
  });

  it("two dice for a realignment, US first, with modifiers", () => {
    const m = diceModel({ type: "REALIGNMENT", country_id: 22, roll1: 5, mod1: 1, total1: 6, roll2: 2, mod2: 1, total2: 3 }, null, null);
    const out = wrap(h(DiceTrayView, { model: m, phase: "hold" }));
    expect(out.indexOf('aria-label="US die')).toBeLessThan(out.indexOf('aria-label="USSR die'));
    expect(text(out)).toContain("6 vs 3");
  });
});

describe("headline papers", () => {
  const papers = { key: 1, us: 24, ussr: 18, first: "US" as const, turn: 1, cancelled: 0, phase: "read" as const, ms: { drop: 500, stamp: 250, fold: 350 } };

  it("two papers, US left, mastheads, datelines, headlines, badges, the order caption", async () => {
    await setLanguage("en");
    const out = wrap(h(HeadlinePapersView, { papers, waiting: false, onContinue: () => undefined }));
    const tx = text(out);
    expect(out.indexOf('data-paper="US"')).toBeLessThan(out.indexOf('data-paper="USSR"'));
    expect(tx).toContain("The Washington Dispatch");
    expect(tx).toContain("ПРАВДА");
    expect(tx).toContain("US headline · Turn 1 · Ops 2");
    expect(tx).toContain("Indo-Pakistani War");
    expect(tx).toContain("Captured Nazi Scientist");
    expect(tx).toContain("1st");
    expect(tx).toContain("2nd");
    expect(tx).toContain("2 vs 1 Ops · United States resolves first");
    expect(out).toContain('role="group"');
    expect(tx).not.toContain("Continue");
  });

  it("a dialog with Continue while it waits; CANCELLED on a cancelled headline", () => {
    const waiting = wrap(h(HeadlinePapersView, { papers, waiting: true, onContinue: () => undefined }));
    expect(waiting).toContain('role="dialog"');
    expect(waiting).toContain('aria-modal="true"');
    expect(text(waiting)).toContain("Continue");
    expect(text(waiting)).toContain("Space");
    const cancelled = wrap(h(HeadlinePapersView, { papers: { ...papers, us: 103, ussr: 21, cancelled: 21 }, waiting: false, onContinue: () => undefined }));
    expect(text(cancelled)).toContain("Cancelled");
  });

  it("Chinese papers", async () => {
    await setLanguage("zh-CN");
    const tx = text(wrap(h(HeadlinePapersView, { papers, waiting: true, onContinue: () => undefined })));
    expect(tx).toContain("华盛顿快讯");
    expect(tx).toContain("真理报");
    expect(tx).toContain("美国头条 · 第 1 回合 · 2 行动点");
    expect(tx).toContain("第一");
    expect(tx).toContain("继续");
    expect(tx).toContain("空格");
    await setLanguage("en");
  });
});

describe("scoring sheet and table", () => {
  const me = scores.regions.find(r => r.slot === 2)!;
  const sheet = (p: Partial<ScoringState> = {}): ScoringState => ({
    key: 1, card: 3, slot: 2, vp: me.net, score: me, scores: null, by: "US", phase: "read", rows: 6, ms: { in: 360, row: 120, net: 300 }, ...p,
  });

  it("header, kicker, the table US | USSR, the result", async () => {
    await setLanguage("en");
    const out = wrap(h(ScoringSheetView, { sheet: sheet(), waiting: false, onContinue: () => undefined }));
    const tx = text(out);
    expect(tx).toContain("Middle East");
    expect(tx).toContain("Card #3");
    expect(tx).toContain("The United States played Middle East Scoring");
    for (const w of ["Status", "Countries", "Battlegrounds", "Adjacent to enemy superpower", "Status VP", "Total", "+1 each"]) expect(tx).toContain(w);
    expect(out).toContain('data-dock="left"');
    expect(out).toContain('aria-label="Middle East scoring"');
    expect(out).toContain("--reg:var(--ts-reg-me)");
  });

  it("the result bar names the scorer, or says Even; Europe control says game over", () => {
    const usssr = text(wrap(h(ScoringSheetView, { sheet: sheet({ vp: -3 }), waiting: false, onContinue: () => undefined })));
    expect(usssr).toContain("USSR scores");
    expect(usssr).toContain("Net USSR +3");
    const even = text(wrap(h(ScoringSheetView, { sheet: sheet({ vp: 0 }), waiting: false, onContinue: () => undefined })));
    expect(even).toContain("Even");
    const eu = scores.regions.find(r => r.slot === 0)!;
    const ctrl = text(wrap(h(ScoringSheetView, { sheet: sheet({ card: 2, slot: 0, score: { ...eu, wins: "USSR" }, vp: -20 }), waiting: true, onContinue: () => undefined })));
    expect(ctrl).toContain("Europe control: game over");
    expect(ctrl).toContain("Continue");
    // Before the rows and the net: no result yet.
    expect(text(wrap(h(ScoringSheetView, { sheet: sheet({ phase: "in" }), waiting: false, onContinue: () => undefined })))).not.toContain("Net");
  });

  it("you played it; the Americas dock right; the phone docks at the bottom", () => {
    const you = sheet({ card: 37, slot: 4, by: "USSR", score: scores.regions.find(r => r.slot === 4)! });
    const out = wrap(h(ScoringSheetView, { sheet: you, waiting: false, onContinue: () => undefined }));
    expect(text(out)).toContain("You played Central America Scoring");
    expect(out).toContain('data-dock="right"');
    expect(wrap(h(ScoringSheetView, { sheet: you, waiting: false, onContinue: () => undefined }), { layout: "compact" })).toContain('data-dock="bottom"');
  });

  it("the final scoring: one row per region, the China Card's +1, the total, the net with it", async () => {
    await setLanguage("en");
    // prompt-midgame: regions US 18 · USSR 16; the USSR holds the China Card → 18 / 17, net US +1.
    const final = sheet({ card: 0, slot: null, score: null, scores, by: null, china: "USSR", vp: 1 });
    const out = text(wrap(h(ScoringSheetView, { sheet: final, waiting: false, onContinue: () => undefined })));
    expect(out).toContain("Final scoring");
    for (const r of ["Europe", "Asia", "Middle East", "Africa", "Central America", "South America"]) expect(out).toContain(r);
    expect(out).not.toContain("Southeast Asia");
    // (RollingNumber prints its digit strip: each number three times.)
    expect(out).toMatch(/The China Card \+1 VP for its holder — 1 1 1 Total 18 18 18 17 17 17/);
    expect(out).toContain("Net US +1");
    expect(out).not.toContain("track stops");
    await setLanguage("zh-CN");
    const zh = text(wrap(h(ScoringSheetView, { sheet: final, waiting: false, onContinue: () => undefined })));
    expect(zh).toMatch(/中国牌 持有者 \+1 VP — 1/);
    expect(zh).toContain("净得 美国 +1");
    await setLanguage("en");
  });

  it("the VP track stopped the change at 20: the rows' net, and a line with what was applied", async () => {
    await setLanguage("en");
    const capped = text(wrap(h(ScoringSheetView, { sheet: sheet({ vp: -6, capped: -5 }), waiting: false, onContinue: () => undefined })));
    expect(capped).toContain("Net USSR +6");
    expect(capped).toContain("The VP track stops at 20: USSR +5 applied");
    expect(text(wrap(h(ScoringSheetView, { sheet: sheet({ vp: -6, capped: -5, phase: "rows" }), waiting: false, onContinue: () => undefined })))).not.toContain("track stops");
    await setLanguage("zh-CN");
    expect(text(wrap(h(ScoringSheetView, { sheet: sheet({ vp: -6, capped: -5 }), waiting: false, onContinue: () => undefined })))).toContain("VP 上限为 20：实际计入 苏联 +5");
    await setLanguage("en");
  });

  it("Shuttle Diplomacy's missing battleground is noted under the table (sheet and plate popover)", async () => {
    await setLanguage("en");
    const sd = { ...me, ussr: { ...me.ussr, shuttle_diplomacy: true } };
    const out = wrap(h(ScoringTable, { score: sd }));
    expect(out).toContain("<tfoot>");
    expect(text(out)).toContain("Shuttle Diplomacy: one USSR battleground is not counted");
    expect(wrap(h(ScoringTable, { score: { ...me, ussr: { ...me.ussr, shuttle_diplomacy: false } } }))).not.toContain("<tfoot>");
    await setLanguage("zh-CN");
    expect(text(wrap(h(ScoringSheetView, { sheet: sheet({ score: sd }), waiting: false, onContinue: () => undefined })))).toContain("穿梭外交：少计苏联一个战场国");
    await setLanguage("en");
  });

  it("ScoringTable alone (the plate popover); Southeast Asia lists countries", async () => {
    const sea = scores.regions.find(r => r.slot === 6)!;
    const out = text(wrap(h(ScoringTable, { score: sea })));
    expect(out).toContain("Total");
    const names = [...sea.us.controlled, ...sea.ussr.controlled].map(c => c.id);
    if (names.length) expect(out).toMatch(/Thailand|Vietnam|Burma|Laos|Malaysia|Indonesia|Philippines/);
    await setLanguage("zh-CN");
    const zh = text(wrap(h(ScoringTable, { score: me })));
    expect(zh).toContain("战场国");
    expect(zh).toContain("每个 +1");
    expect(zh).toContain("与敌方超级大国相邻");
    await setLanguage("en");
  });
});

describe("turn banner", () => {
  it("types the turn and era; the era stamp after the banner is in", async () => {
    await setLanguage("en");
    const b = { key: 1, kind: "turn" as const, turn: 4, era: "mid" as const, eraStamp: "mid" as const, phase: "hold" as const, ms: { in: 0, hold: 1300, out: 350 } };
    const out = wrap(h(TurnBannerView, { banner: b }));
    expect(text(out)).toContain("Turn 4 · Mid War");
    expect(text(out)).toContain("Mid War: new cards shuffled in");
    expect(out).toContain('role="status"');
    expect(text(wrap(h(TurnBannerView, { banner: { ...b, phase: "in" } })))).not.toContain("new cards");
    const ph = text(wrap(h(TurnBannerView, { banner: { ...b, kind: "phase", eraStamp: null } })));
    expect(ph).toContain("Headline phase");
  });
});

describe("game-over telex", () => {
  const over = (e: Ending): OverState => ({ key: 1, ending: e, phase: "shown", effect: null, ms: { beat: 600, rise: 480, stamp: 300, chart: 900 } });
  const stats: TelexStats = {
    points: [{ turn: 0, vp: 0 }, { turn: 1, vp: 3 }, { turn: 2, vp: -1 }, { turn: 3, vp: -20 }],
    coups: { US: 4, USSR: 6 }, ar: 5, playingMs: 83 * 60000, ai: { decisions: 120, ms: 4 * 60000 },
  };
  const telex = (e: Ending, human: "US" | "USSR" = "USSR", st: TelexStats = stats) =>
    wrap(h(TelexSheet, { over: over(e), ending: e, humanSide: human, stats: st, onNewGame: () => undefined, onReview: () => undefined, onLog: () => undefined }));

  it("held scoring: verdict, your stamp, the reason, the held card, the stats, the chart, the actions", async () => {
    await setLanguage("en");
    const e: Ending = { winner: "USSR", reason: "held-scoring", vpBefore: 1, vpFinal: -20, turn: 3, cards: [79] };
    const out = telex(e);
    const tx = text(out);
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Game over"');
    expect(out).toContain('data-winner="USSR"');
    expect(tx).toContain("USSR victory");
    expect(tx).toContain("You win");
    expect(tx).toContain("Africa Scoring");
    expect(tx).toContain("Held at the end of the turn");
    expect(out).toContain('data-card="79"');
    for (const w of ["Final VP", "USSR +20", "VP before the ruling", "US +1", "Turn 3 · AR 5", "US 4 · USSR 6", "1 h 23 min", "4 min · 120 decisions", "Victory points by turn"]) {
      expect(tx).toContain(w);
    }
    for (const w of ["New game", "Review board", "Full log"]) expect(tx).toContain(w);
  });

  it("the VP-before stat is named by the ending: the ruling, final scoring, else left out", async () => {
    await setLanguage("en");
    const fin = text(telex({ winner: "US", reason: "final-scoring", vpBefore: 9, vpFinal: 7, turn: 10 }));
    expect(fin).toContain("VP before final scoring");
    // Q-031: an ending at the turn's end names the turn's end, not the engine's counter ("Turn 8 · AR 9").
    const end = text(telex({ winner: "US", reason: "final-scoring", vpBefore: 9, vpFinal: 7, turn: 10 }, "US", { ...stats, ar: 0, turnEnd: true }));
    expect(end).toContain("End of turn 10");
    expect(end).not.toMatch(/AR \d/);
    expect(fin).not.toContain("VP before the ruling");
    for (const reason of ["vp20", "milops-vp20", "europe-control", "defcon", "wargames"] as const) {
      const tx = text(telex({ winner: "USSR", reason, vpBefore: -15, vpFinal: -20, turn: 3 }));
      expect(tx).not.toContain("VP before");
    }
    await setLanguage("zh-CN");
    expect(text(telex({ winner: "US", reason: "final-scoring", vpBefore: 1, vpFinal: -7, turn: 10 }))).toContain("最终计分前 VP");
    expect(text(telex({ winner: "USSR", reason: "held-scoring", vpBefore: 1, vpFinal: -20, turn: 3, cards: [79] }))).toContain("裁定前 VP");
    await setLanguage("en");
  });

  it("a draw in ink with a Draw stamp; resign without a stamp; no VP-before when equal; no time when unknown", async () => {
    await setLanguage("en");
    const draw = telex({ winner: "DRAW", reason: "held-scoring-both", vpBefore: 3, vpFinal: 3, turn: 6, cards: [1, 2] });
    expect(text(draw)).toContain("Draw");
    expect(draw).toContain('data-winner="DRAW"');
    expect(text(draw)).not.toContain("VP before the ruling");
    const resign = telex({ winner: "USSR", reason: "resign", vpBefore: 1, vpFinal: 1, turn: 2 }, "US", { ...stats, playingMs: null, ai: null, ar: 0 });
    const tx = text(resign);
    expect(tx).not.toMatch(/You (win|lose)/);
    expect(tx).toContain("Turn 2");
    expect(tx).not.toContain("Playing time");
    expect(tx).not.toContain("AI thinking");
    const lost = text(telex({ winner: "US", reason: "defcon", vpBefore: -6, vpFinal: 20, turn: 4 }));
    expect(lost).toContain("You lose");
    expect(lost).toContain("US victory");
  });

  it("Chinese and the pseudo-language", async () => {
    await setLanguage("zh-CN");
    const e: Ending = { winner: "USSR", reason: "vp20", vpBefore: -18, vpFinal: -20, turn: 5 };
    const still = text(wrap(h(TelexSheet, { over: { ...over(e), ms: { beat: 0, rise: 0, stamp: 0, chart: 0 } }, ending: e, humanSide: "USSR", stats, onNewGame: () => undefined, onReview: () => undefined, onLog: () => undefined })));
    expect(still).toContain("急电 · 急电 · 急电");
    const zh = text(telex(e));
    for (const w of ["苏联胜利", "你赢了", "最终 VP", "第 5 回合 · 第 5 行动轮", "美国 4 · 苏联 6", "1 小时 23 分钟", "各回合 VP", "新游戏"]) expect(zh).toContain(w);
    expect(zh).not.toContain("裁定前 VP");
    await setLanguage("en-XA");
    const xa = text(telex({ winner: "USSR", reason: "vp20", vpBefore: -18, vpFinal: -20, turn: 5 }));
    expect(xa).toContain("⟦");
    await setLanguage("en");
  });

  it("the beat before the telex: a white-out for nuclear war, nothing otherwise", async () => {
    const { TelexOverlay } = await import("../../../src/ui/stage");
    const e: Ending = { winner: "US", reason: "defcon", vpBefore: -6, vpFinal: 20, turn: 4 };
    const beat = (effect: OverState["effect"]) => wrap(h(TelexOverlay, { over: { ...over(e), phase: "beat", effect }, ending: e, humanSide: "USSR", stats, onNewGame: () => undefined, onReview: () => undefined, onLog: () => undefined }));
    expect(beat("whiteout")).toContain('aria-hidden="true"');
    expect(beat(null)).toBe("");
  });
});

describe("VP chart", () => {
  it("draws the line and names every point for screen readers", async () => {
    await setLanguage("en");
    const out = wrap(h(VpChart, { points: [{ turn: 0, vp: 0 }, { turn: 1, vp: 3 }, { turn: 2, vp: -2 }], drawMs: 900 }));
    expect(out).toContain('role="img"');
    expect(out).toMatch(/aria-label="Victory points by turn: Start: Even, Turn 1: US \+3, Turn 2: USSR \+2"/);
    expect(out).toContain("US ↑");
    expect(out).toContain("USSR ↓");
    expect(out).toContain('data-draw="true"');
    expect((out.match(/<circle/g) ?? []).length).toBe(3);
    expect(wrap(h(VpChart, { points: [] }))).toContain("<path");
  });

  it("separates the points in Chinese too", async () => {
    await setLanguage("zh-CN");
    const out = wrap(h(VpChart, { points: [{ turn: 0, vp: 0 }, { turn: 1, vp: 4 }, { turn: 2, vp: -2 }] }));
    expect(out).toContain('aria-label="各回合 VP：开局：持平；第 1 回合：美国 +4；第 2 回合：苏联 +2"');
    await setLanguage("en");
  });
});
