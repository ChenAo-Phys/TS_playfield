/**
 * Console (src/ui/console): instrument models, markup of the four variants in en / zh / en-XA, the
 * track beat handlers (overrides, timings, abort, toasts, the VP chip, shared registration), VP history.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameEvent, LogEntry, PublicState } from "../../../src/game/contract";
import { setLanguage } from "../../../src/i18n";
import {
  ArTrack, Console, DefconGauge, LangToggle, MilOpsTrack, SpaceTrack, StatusPanel, TurnTrack, VpGauge,
  arModel, chipSource, createTrackStore, eraOf, fillSlots, emphasizeNumber, milOpsShort, needsAttention, perksReached,
  registerTrackHandlers, slot, slotText, trackValues, vpHistory, vpLead, vpNeedle, type TrackHandlerDeps,
} from "../../../src/ui/console";
import { arReadoutText } from "../../../src/ui/console/ArTrack";
import { sharers } from "../../../src/ui/console/shared";
import { isCut, nextSqueeze, SQUEEZE_STEPS, squeezeKey } from "../../../src/ui/console/squeeze";
import { fixture } from "../../fixtures/load";
import { beatCtx, harness, rect, unmarkedWords } from "./helpers";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const h = createElement;
const midgame = () => fixture("prompt-midgame").final.frame!.state;
const withState = (patch: Partial<PublicState>): PublicState => ({ ...midgame(), ...patch }) as PublicState;

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("model", () => {
  it("eras by turn and the VP lead / needle", () => {
    expect([1, 3, 4, 7, 8, 10].map(eraOf)).toEqual(["early", "early", "mid", "mid", "late", "late"]);
    expect(vpLead(3)).toEqual({ side: "US", n: 3 });
    expect(vpLead(-2)).toEqual({ side: "USSR", n: 2 });
    expect(vpLead(0)).toEqual({ side: null, n: 0 });
    expect(vpNeedle(0)).toBe(50);
    expect(vpNeedle(20)).toBe(0); // US 20 at the left end (fixed political axis)
    expect(vpNeedle(-20)).toBe(100);
    expect(vpNeedle(-35)).toBe(100);
    expect(milOpsShort(1, 3)).toBe(2);
    expect(milOpsShort(4, 3)).toBe(0);
    expect(perksReached(5)).toEqual([2, 4]);
  });

  it("AR pips: US half left, USSR half right; the USSR moves first in a round", () => {
    const base = { turn: 2, current_phase_name: "ACTION_ROUND", flags: [], space: { US: 0, USSR: 0 } };
    const ussr = arModel({ ...base, action_round: 3, phasing_player: "USSR" } as unknown as PublicState);
    expect(ussr.pips).toHaveLength(6);
    expect(ussr.pips[1]).toMatchObject({ US: "done", USSR: "done" });
    expect(ussr.pips[2]).toMatchObject({ US: "future", USSR: "now" });
    const us = arModel({ ...base, action_round: 3, phasing_player: "US" } as unknown as PublicState);
    expect(us.pips[2]).toMatchObject({ US: "now", USSR: "done" });
    expect(us.pips[3]).toMatchObject({ US: "future", USSR: "future" });
    const head = arModel({ ...base, action_round: 0, phasing_player: "USSR", current_phase_name: "HEADLINE" } as unknown as PublicState);
    expect(head.phase).toBe("headline");
    expect(head.pips.every(p => p.US === "future" && p.USSR === "future")).toBe(true);
    const end = arModel({ ...base, action_round: 7, phasing_player: "USSR" } as unknown as PublicState);
    expect(end.phase).toBe("end");
    expect(end.pips.every(p => p.US === "done" && p.USSR === "done")).toBe(true);
  });

  it("after the game ends: the end of the ending's turn, never the counters past it (Q-031)", () => {
    const base = { flags: [], space: { US: 0, USSR: 0 }, phasing_player: "USSR" };
    const final = arModel({ ...base, turn: 11, current_phase_name: "GAME_OVER", action_round: 0 } as unknown as PublicState, null, { turn: 10 });
    expect(final).toMatchObject({ phase: "end", turn: 10 });
    const milops = arModel({ ...base, turn: 8, current_phase_name: "GAME_OVER", action_round: 9 } as unknown as PublicState, null, { turn: 8 });
    expect(milops).toMatchObject({ phase: "end", turn: 8 });
    expect(milops.pips.every(p => p.US === "done" && p.USSR === "done")).toBe(true);
    // Ended inside a round (DEFCON, 20 VP): that round, as the telex and the slip read it (R-014: displayTurnAr), not
    // "End of turn 5"; the played pips stay as they were (the USSR, phasing, has played its half of AR 3).
    const mid = arModel({ ...base, turn: 5, current_phase_name: "GAME_OVER", action_round: 3 } as unknown as PublicState, null, { turn: 5 });
    expect(mid.phase).not.toBe("end");
    expect(mid).toMatchObject({ ar: 3, turn: 5, side: "USSR" });
    expect(mid.pips[1]).toMatchObject({ US: "done", USSR: "done" });
    expect(mid.pips[2]).toMatchObject({ US: "future", USSR: "done" });
    expect(mid.pips[3]).toMatchObject({ US: "future", USSR: "future" });
    // The last frames of turn 10 still read as that round.
    const playing = arModel({ ...base, turn: 10, current_phase_name: "ACTION_ROUND", action_round: 7 } as unknown as PublicState, null, { turn: 10 });
    expect(playing).toMatchObject({ phase: "ar", ar: 7, turn: 10 });
  });

  it("AR 8 (North Sea Oil): a dashed 8th pip, only the US half available", () => {
    const m = arModel({ turn: 6, current_phase_name: "ACTION_ROUND", action_round: 8, phasing_player: "US", flags: ["NORTH_SEA_OIL_ACTIVE"], space: { US: 0, USSR: 0 } } as unknown as PublicState);
    expect(m.pips).toHaveLength(8);
    expect(m.pips[7]).toEqual({ n: 8, US: "now", USSR: "na", optional: true });
    expect(m.pips[6]).toMatchObject({ US: "done", USSR: "done", optional: false });
  });

  it("an action-round override moves the round ahead of the shown state", () => {
    const m = arModel(withState({ current_phase_name: "HEADLINE", action_round: 0 } as Partial<PublicState>), { ar: 1, side: "USSR" });
    expect(m.phase).toBe("ar");
    expect(m.pips[0]).toMatchObject({ USSR: "now", US: "future" });
  });

  it("VP history from the log's VP lines, closed by each turn's end", () => {
    const vp = (from: unknown, to: unknown): LogEntry["text"] => ({ key: "log:change.vp", params: { from, to, delta: "" } } as never);
    const us = (n: number) => ({ key: "log:vpScore.us", params: { n } });
    const ussr = (n: number) => ({ key: "log:vpScore.ussr", params: { n } });
    const log: LogEntry[] = [
      { id: 1, turn: 1, ar: 1, side: "USSR", kind: "play", text: { key: "ui:app.title" }, details: [vp({ key: "log:vpScore.tie" }, ussr(2))] },
      { id: 2, turn: 1, ar: 7, side: null, kind: "turn", text: { key: "log:session.endOfTurn", params: { turn: 1 } } },
      { id: 3, turn: 2, ar: 2, side: "US", kind: "event", text: vp(ussr(2), us(1)) },
      { id: 4, turn: 2, ar: 7, side: null, kind: "turn", text: { key: "log:session.endOfTurn", params: { turn: 2 } }, details: [vp(us(1), us(3))] },
    ];
    expect(vpHistory(log)).toEqual([{ turn: 1, vp: -2 }, { turn: 2, vp: 3 }]);
    expect(vpHistory(log, { turn: 3, vp: 4 })).toEqual([{ turn: 1, vp: -2 }, { turn: 2, vp: 3 }, { turn: 3, vp: 4 }]);
    // The real game's log (a whole game) yields one point per finished turn, in order.
    const full = fixture("game-full");
    const points = vpHistory(full.final.log);
    expect(points.map(p => p.turn)).toEqual([...new Set(full.final.log.filter(e => e.kind === "turn").map(e => e.turn))]);
  });

  it("slots keep full-sentence keys", () => {
    const parts = fillSlots(`AR 3 · ${slot("side")} ${slot("you")}`, { side: h("b", null, "USSR"), you: "(you)" });
    expect(html(h("p", null, parts))).toBe("<p>AR 3 · <b>USSR</b> (you)</p>");
    expect(slotText(`a ${slot("x")} b`, { x: "X" })).toBe("a X b");
    expect(html(h("p", null, emphasizeNumber("手牌 5 张", 5, n => h("b", null, n))))).toBe("<p>手牌 <b>5</b> 张</p>");
  });
});

describe("console markup", () => {
  it("desktop: wordmark, turn track + eras, AR readout, DEFCON caption, VP, mil ops, space, language, buttons", () => {
    const hs = harness({ state: midgame(), humanSide: "USSR" });
    const out = html(hs.wrap(h(Console, { variant: "desktop" })));
    expect(out).toContain('data-variant="desktop"');
    expect(out).toContain("Twilight Struggle");
    expect(out).toContain("Playfield · vs DeepStruggle");
    expect(out.match(/<i class="[^"]*"[^>]*>\d+<\/i>/g)?.length).toBe(10);
    expect(out).toContain(">Early<");
    expect(out).toMatch(/AR 1 · <span class="[^"]*sideUssr[^"]*">USSR<\/span> <span class="[^"]*you[^"]*">\(you\)<\/span>/);
    expect(out).toContain("No coups/realigns: Europe"); // DEFCON 4 caption
    expect(out).toContain('aria-label="DEFCON 4: No coups or realignments in Europe"');
    expect(out).toMatch(/USSR \+<span[^>]*>.*2/); // the lead with a rolling number
    expect(out).toContain("Mil ops · need 4");
    expect(out).toContain("Space Race");
    expect(out).toContain('aria-label="Space race: US box 2, USSR box 4"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>EN</);
    expect(out).toContain('aria-label="Settings"');
    expect(out).toContain('aria-label="Menu"');
  });

  it("condensed: the turn readout instead of the track; tablet: no mil ops / space / caption, one language button", () => {
    const hs = harness({ state: midgame() });
    const condensed = html(hs.wrap(h(Console, { variant: "condensed" })));
    expect(condensed).toMatch(/<b class="ts-num">6<\/b>\/10 · Mid War/);
    expect(condensed).not.toContain(">Early<");
    expect(condensed).toContain("Mil ops · need 4");
    const tablet = html(hs.wrap(h(Console, { variant: "tablet" })));
    expect(tablet).not.toContain("Mil ops");
    expect(tablet).not.toContain("Space Race");
    expect(tablet).not.toContain("No coups/realigns");
    expect(tablet).not.toContain("Playfield · vs DeepStruggle");
    expect(tablet).toMatch(/aria-label="Switch to 简体中文"[^>]*>中</);
  });

  it("compact: turn/AR readout, DEFCON numeral + word, mini VP, the menu only", () => {
    const hs = harness({ state: midgame(), layout: "compact" });
    const out = html(hs.wrap(h(Console, { variant: "compact" })));
    expect(out).toContain("Turn 6 · Mid War");
    expect(out).toMatch(/>DEFCON</);
    expect(out).toMatch(/class="[^"]*vpMini/);
    expect(out).not.toContain("Twilight Struggle");
    expect(out).not.toContain('aria-label="Settings"');
    expect(out).toContain('aria-label="Menu"');
  });

  it("compact fit (Q-041): both forms of the side (word + glyph) for the squeeze, measured turn lines named in full", () => {
    const hs = harness({ state: midgame(), layout: "compact" });
    const out = html(hs.wrap(h(Console, { variant: "compact" })));
    // The VP readout carries the side word and its glyph (CSS shows one per squeeze level), never an ellipsis class.
    const vp = /<span class="[^"]*_vpRead_[^"]*">(.*?)<\/span><\/div>/.exec(out)?.[1] ?? "";
    expect(vp).toMatch(/_vpWord_[^"]*">USSR<\/span><svg class="[^"]*_vpGlyph_[^"]*"[^>]*data-side="USSR"/);
    // The turn lines are measured (data-fit) and hidden from AT: the instrument's name holds their full text.
    expect(out.match(/data-fit=""/g)?.length).toBe(2);
    expect(out).toMatch(/aria-label="Turn 6 of 10, Mid War · AR 1 · USSR \(you\)"/);
    expect(out).toMatch(/_arWord_[^"]*">USSR<\/span><svg class="[^"]*_arGlyph_/);
    expect(out).toContain('data-squeeze="0"');
    // The desktop console has no squeeze and no glyph forms.
    const desk = html(hs.wrap(h(Console, { variant: "desktop" })));
    expect(desk).not.toContain("data-squeeze");
    expect(desk).not.toMatch(/_vpGlyph_|_arGlyph_|data-fit/);
  });

  it("squeeze steps: one more per measurement while a line is cut, up to 4; a new width or text starts over", () => {
    expect(SQUEEZE_STEPS).toBe(4);
    expect(nextSqueeze(0, true)).toBe(1);
    expect(nextSqueeze(3, true)).toBe(4);
    expect(nextSqueeze(4, true)).toBe(4); // then the turn lines ellipsize
    expect(nextSqueeze(2, false)).toBe(2);
    expect(squeezeKey(299.6, "AR 2")).toBe("300|AR 2");
    expect(squeezeKey(300, "AR 2")).not.toBe(squeezeKey(300, "AR 3"));
    const el = (sw: number, cw: number, kids: { scrollWidth: number; clientWidth: number }[] = []) =>
      ({ scrollWidth: sw, clientWidth: cw, querySelectorAll: (q: string) => (q === "[data-fit]" ? kids : []) }) as unknown as Element;
    expect(isCut(el(300, 300, [{ scrollWidth: 142, clientWidth: 142 }]))).toBe(false);
    expect(isCut(el(300, 300, [{ scrollWidth: 142, clientWidth: 115 }]))).toBe(true);
    expect(isCut(el(320, 300))).toBe(true);
    expect(isCut(el(300.4, 300))).toBe(false); // sub-pixel rounding is not a cut
  });

  it("the AR readout as text (names, tooltips)", () => {
    const st = midgame();
    const { t } = { t: ((k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ""}`) as never };
    expect(arReadoutText(t, arModel(st, null), "USSR")).toBe('ui_console:ar.readoutYou{"ar":1,"side":"ui:side.USSR","you":"ui:tip.you"}');
    expect(arReadoutText(t, arModel(st, null), "US")).toBe('ui_console:ar.readout{"ar":1,"side":"ui:side.USSR"}');
    expect(arReadoutText(t, { ...arModel(st, null), phase: "headline" }, "US")).toBe("ui:track.headline");
  });

  it("compact menu dot: a scoring-stranded warning on the prompt, or a mil-ops shortfall in the last 2 ARs", () => {
    const st = midgame();
    const vm = harness({ state: st }).root.vm;
    expect(needsAttention(vm, "USSR")).toBe(false);
    const warned = { ...vm, prompt: { options: [{ idx: 1, kind: "card", id: 7, warnings: [{ code: "scoring-stranded" }] }] } } as never;
    expect(needsAttention(warned, "USSR")).toBe(true);
    const late = { ...vm, frame: { ...vm.frame!, state: { ...st, action_round: 6, mil_ops: { US: 0, USSR: 1 }, defcon: 3 } } } as never;
    expect(needsAttention(late, "USSR")).toBe(true);
    const hs = harness({ state: st, layout: "compact", prompt: warned.prompt });
    expect(html(hs.wrap(h(Console, { variant: "compact" })))).toMatch(/alertDot/);
  });

  it("before the first frame: chrome only", () => {
    const hs = harness({ state: null });
    const out = html(hs.wrap(h(Console, { variant: "desktop" })));
    expect(out).toContain("Twilight Struggle");
    expect(out).not.toContain("DEFCON");
  });

  it("Chinese", async () => {
    await setLanguage("zh-CN");
    try {
      const hs = harness({ state: midgame() });
      const out = html(hs.wrap(h(Console, { variant: "desktop" })));
      expect(out).toMatch(/第 1 行动轮 · <span[^>]*>苏联<\/span><span[^>]*>（你）<\/span>/);
      expect(out).toContain("军事行动 · 需 4");
      expect(out).toContain("欧洲禁止政变与调整");
      expect(out).toContain(">早期<");
      expect(out).toMatch(/aria-pressed="true"[^>]*>中文</);
      const compact = html(hs.wrap(h(Console, { variant: "compact" })));
      expect(compact).toContain("第 6 回合 · 战争中期");
    } finally {
      await setLanguage("en");
    }
  });

  it("pseudo-language: every word the console shows comes from a catalog", async () => {
    await setLanguage("en-XA");
    try {
      const hs = harness({ state: midgame() });
      for (const variant of ["desktop", "condensed", "tablet", "compact"] as const) {
        const out = html(hs.wrap(h(Console, { variant })));
        expect(unmarkedWords(out), variant).toEqual([]);
      }
      const panel = html(hs.wrap(h(StatusPanel, {})));
      expect(unmarkedWords(panel)).toEqual([]);
    } finally {
      await setLanguage("en");
    }
  });

  it("instruments alone (spec props), without a UiRoot", () => {
    expect(html(h(TurnTrack, { turn: 4, condensed: false }))).toMatch(/turnLit[^>]*transform:translateX\(56px\)[^>]*>4</);
    expect(html(h(DefconGauge, { defcon: 2, variant: "full" }))).toContain("No coups/realigns: Europe, Asia, M. East");
    expect(html(h(DefconGauge, { defcon: 2, variant: "full", caption: false }))).not.toContain("No coups/realigns");
    const vp = html(h(VpGauge, { vp: 3, width: 224, variant: "full" }));
    expect(vp).toContain("left:42.5%");
    expect(vp).toContain("US 20");
    expect(vp).toContain("USSR 20");
    expect(html(h(VpGauge, { vp: 0, width: 0, variant: "mini" }))).toContain(">Even<");
    const mo = html(h(MilOpsTrack, { milOps: { US: 2, USSR: 1 }, required: 3 }));
    expect(mo.match(/<i class="_f_/g)?.length).toBe(3);
    expect(mo.match(/_req_/g)?.length).toBe(2);
    expect(html(h(SpaceTrack, { space: { US: 3, USSR: 2 } })).match(/<i class="_f_/g)?.length).toBe(5);
    expect(html(h(ArTrack, { state: midgame(), humanSide: "USSR", readoutOnly: true }))).toMatch(/AR 1 · /);
    expect(html(h(LangToggle, { variant: "segmented" }))).toMatch(/role="group" aria-label="Language"/);
  });
});

describe("track beats", () => {
  function deps(over: Partial<TrackHandlerDeps> = {}): TrackHandlerDeps & { slept: number[]; toasts: string[]; chips: { text: string; ms: number }[] } {
    const slept: number[] = [];
    const toasts: string[] = [];
    const chips: { text: string; ms: number }[] = [];
    return {
      store: createTrackStore(),
      anchors: () => ({ ref: () => () => undefined, rect: id => (id === "vp" ? rect(800, 10) : id === "country:24" ? rect(500, 400) : id === "space:US" ? rect(1100, 10) : null) }),
      toast: m => { toasts.push(m); },
      text: { defcon2: () => "DEFCON 2!", vpChip: (side, n) => `${side} +${n}`, perk: (side, box) => `${side} perk ${box}` },
      reduced: () => false,
      sleep: async ms => { slept.push(ms); },
      flyChip: async spec => { chips.push({ text: spec.text, ms: spec.ms }); },
      slept, toasts, chips,
      ...over,
    };
  }
  const track = (event: Extract<GameEvent, { t: "vp" | "defcon" | "milops" | "space" | "action-round" }>) => ({ k: "track" as const, event });

  it("writes the override first, animates for the catalogue time, and clears the animation", async () => {
    const hs = harness();
    const d = deps();
    const off = registerTrackHandlers(hs.director, d);
    await hs.director.run(track({ t: "milops", side: "US", from: 0, to: 3 }), beatCtx());
    expect(d.store.get().over.milOps).toEqual({ US: 3 });
    expect(d.slept).toEqual([300 + 40 * 2]);
    expect(d.store.get().anim["milops:US"]).toBeUndefined();
    await hs.director.run(track({ t: "action-round", ar: 2, side: "US" }), beatCtx({ motion: 0.5 }));
    expect(d.store.get().over.ar).toEqual({ ar: 2, side: "US" });
    expect(d.slept[1]).toBe(150);
    d.store.reset();
    expect(d.store.get().over).toEqual({});
    off();
  });

  it("vp: the chip flies from the event's country to the gauge, then the needle swings", async () => {
    const hs = harness();
    const d = deps();
    const off = registerTrackHandlers(hs.director, d);
    await hs.director.run(track({ t: "vp", from: 0, to: -2, source: { card: 13, country: 24 } }), beatCtx());
    expect(d.chips).toEqual([{ text: "USSR +2", ms: 600 }]);
    expect(d.slept).toEqual([600]);
    expect(d.store.get().over.vp).toBe(-2);
    off();
  });

  it("vp chip source: event country → card → last country of the frame → table centre", () => {
    const anchors = { ref: () => () => undefined, rect: (id: string) => (id === "country:9" ? rect(1, 2) : id === "card:13" ? rect(3, 4) : id === "stage" ? rect(0, 0, 100, 50) : null) } as never;
    const frame = (events: GameEvent[]) => ({ events } as never);
    expect(chipSource({ t: "vp", from: 0, to: 1, source: { country: 9 } }, frame([]), anchors)?.left).toBe(1);
    expect(chipSource({ t: "vp", from: 0, to: 1, source: { card: 13 } }, frame([]), anchors)?.left).toBe(3);
    expect(chipSource({ t: "vp", from: 0, to: 1 }, frame([{ t: "influence", country: 9, side: "US", from: 0, to: 1 }]), anchors)?.left).toBe(1);
    expect(chipSource({ t: "vp", from: 0, to: 1 }, frame([]), anchors)?.left).toBe(49);
  });

  it("vp chip source of a scoring card: the scoring sheet's net bar while mounted, else the card, else the table", () => {
    const rects: Record<string, DOMRect> = { scoring: rect(7, 8), "card:1": rect(3, 4), "card:13": rect(5, 6), stage: rect(0, 0, 100, 50) };
    const anchors = { ref: () => () => undefined, rect: (id: string) => rects[id] ?? null } as never;
    const frame = { events: [] } as never;
    expect(chipSource({ t: "vp", from: 0, to: 3, source: { card: 1 } }, frame, anchors)?.left).toBe(7); // Asia Scoring
    expect(chipSource({ t: "vp", from: 0, to: 3, source: { card: 13 } }, frame, anchors)?.left).toBe(5); // not a scoring card
    delete rects.scoring;
    expect(chipSource({ t: "vp", from: 0, to: 3, source: { card: 1 } }, frame, anchors)?.left).toBe(3);
    delete rects["card:1"];
    expect(chipSource({ t: "vp", from: 0, to: 3, source: { card: 1 } }, frame, anchors)?.left).toBe(49);
  });

  it("reduced motion: no chip, a 150 ms readout flash; speed 0: no waiting at all", async () => {
    const hs = harness();
    const d = deps({ reduced: () => true });
    const off = registerTrackHandlers(hs.director, d);
    await hs.director.run(track({ t: "vp", from: 0, to: 3 }), beatCtx());
    expect(d.chips).toEqual([]);
    expect(d.slept).toEqual([150]);
    off();
    const d2 = deps();
    const off2 = registerTrackHandlers(harness().director, d2);
    off2();
    const hs3 = harness();
    const d3 = deps();
    const off3 = registerTrackHandlers(hs3.director, d3);
    await hs3.director.run(track({ t: "vp", from: 0, to: 3 }), beatCtx({ motion: 0 }));
    expect(d3.chips).toEqual([]);
    expect(d3.slept).toEqual([]);
    expect(d3.store.get().over.vp).toBe(3);
    off3();
  });

  it("defcon: degrading flashes the console and at 2 toasts; improving does neither", async () => {
    const hs = harness();
    const d = deps();
    const off = registerTrackHandlers(hs.director, d);
    await hs.director.run(track({ t: "defcon", from: 3, to: 2 }), beatCtx());
    expect(d.toasts).toEqual(["DEFCON 2!"]);
    expect(d.store.get().flash).toBeGreaterThan(0);
    expect(d.slept).toEqual([700]);
    d.store.reset();
    await hs.director.run(track({ t: "defcon", from: 2, to: 3 }), beatCtx());
    expect(d.toasts).toHaveLength(1);
    expect(d.store.get().flash).toBe(0);
    expect(d.slept[1]).toBe(400);
    off();
  });

  it("space: a privilege box shows its privilege (or toasts when the track is off screen)", async () => {
    const hs = harness();
    const d = deps();
    const off = registerTrackHandlers(hs.director, d);
    await hs.director.run(track({ t: "space", side: "US", from: 1, to: 2 }), beatCtx());
    expect(d.store.get().perk).toMatchObject({ side: "US", box: 2 });
    await hs.director.run(track({ t: "space", side: "USSR", from: 3, to: 4 }), beatCtx());
    expect(d.toasts).toEqual(["USSR perk 4"]);
    d.store.reset();
    expect(d.store.get().perk).toMatchObject({ side: "US", box: 2 }); // the note outlives the commit
    expect(d.store.get().over).toEqual({});
    off();
  });

  it("Skip: an aborted beat lands on the final value at once", async () => {
    const hs = harness();
    const d = deps({ sleep: undefined, flyChip: undefined });
    const off = registerTrackHandlers(hs.director, d);
    const ac = new AbortController();
    ac.abort();
    const t0 = Date.now();
    await hs.director.run(track({ t: "vp", from: 0, to: 5 }), beatCtx({ signal: ac.signal }));
    expect(Date.now() - t0).toBeLessThan(400);
    expect(d.store.get().over.vp).toBe(5);
    off();
  });

  it("one handler however many consoles register; it stays until the last leaves", () => {
    const hs = harness();
    const store = createTrackStore();
    const a = registerTrackHandlers(hs.director, { ...deps(), store });
    const b = registerTrackHandlers(hs.director, { ...deps(), store });
    expect(hs.director.count("track")).toBe(1);
    expect(sharers(store)).toBe(2);
    a();
    expect(hs.director.count("track")).toBe(1);
    b();
    expect(hs.director.count("track")).toBe(0);
    b();
    expect(sharers(store)).toBe(0);
  });

  it("trackValues: overrides on top of the shown state", () => {
    const st = midgame();
    expect(trackValues(st, {})).toMatchObject({ vp: st.victory_points, defcon: st.defcon, ar: null });
    expect(trackValues(st, { vp: 7, milOps: { USSR: 2 }, ar: { ar: 2, side: "US" } })).toMatchObject({
      vp: 7, milOps: { US: st.mil_ops.US, USSR: 2 }, ar: { ar: 2, side: "US" },
    });
  });
});
