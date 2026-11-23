/**
 * The stage store (src/ui/stage/stageStore.ts): every beat handler's timing and end state, Skip,
 * Continue, the reveal dock's life (pin, avoidance, collapse into its pile), commits, the danger frame,
 * and the whole thing driven by the real FrameRunner over recorded sequences.
 */
import { describe, expect, it } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import type { Frame, GameEvent, PublicState } from "../../../src/game/contract";
import { createDirector } from "../../../src/ui/runner/director";
import { FrameRunner } from "../../../src/ui/runner/frameRunner";
import { StageStore, type StageEnv, type StageState } from "../../../src/ui/stage/stageStore";
import type { AnchorId, Beat, BeatContext, UiSettings } from "../../../src/ui/ui-contract";
import { DEFAULT_SETTINGS } from "../../../src/ui/ui-contract";
import { scoringSlot } from "../../../src/ui/stage/model";
import { fixture, fixtureIndex } from "../../fixtures/load";

const tick = () => new Promise<void>(r => setImmediate(r));
async function until(pred: () => boolean, max = 5000): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (pred()) return;
    await tick();
  }
  throw new Error("condition never met");
}

const base = fixture("prompt-midgame").frames[0]!;

interface Harness {
  store: StageStore;
  sleeps: number[];
  timers: { ms: number; fn: () => void }[];
  rects: Map<AnchorId, DOMRect>;
  states: StageState[];
}

function harness(env: Partial<StageEnv> = {}, opts: { settings?: Partial<UiSettings>; realSleep?: boolean } = {}): Harness {
  const sleeps: number[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const rects = new Map<AnchorId, DOMRect>();
  const store = new StageStore({
    anchors: { ref: () => () => undefined, rect: id => rects.get(id) ?? null },
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
    sleep: async ms => { sleeps.push(ms); },
    later: (ms, fn) => { timers.push({ ms, fn }); },
    now: () => 0,
    ...env,
  });
  const states: StageState[] = [];
  store.subscribe(() => states.push(store.getState()));
  return { store, sleeps, timers, rects, states };
}

const rect = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect;

function ctx(over: Partial<BeatContext> = {}, events: GameEvent[] = [], patch: Partial<PublicState> = {}): BeatContext {
  const frame: Frame = { seq: 9, state: { ...base.state, ...patch } as PublicState, regionScores: base.regionScores, actor: "US", events, auto: false };
  return {
    frame, before: base.state, humanSide: "USSR", speed: { motion: 1, hold: 1 }, signal: new AbortController().signal,
    settings: { ...DEFAULT_SETTINGS, pauseOnReveals: false }, ...over,
  };
}

const run = <K extends Beat["k"]>(h: Harness, beat: Extract<Beat, { k: K }>, c: BeatContext) => {
  const entry = Object.values(h.store.handlers).find(x => x.kind === beat.k)!;
  return (entry.run as (b: Beat, c: BeatContext) => Promise<void>)(beat, c);
};

describe("reveal dock", () => {
  it("an AI card: enter (flight + caption) → hold → pinned; the timings follow the speed", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    const phases = h.states.map(s => s.dock?.phase);
    expect(phases).toEqual(["enter", "hold", "pinned"]);
    const d = h.store.getState().dock!;
    expect(d).toMatchObject({ card: 30, side: "US", how: "coup", from: "hand:US", note: "USSR", pos: "right", enterMs: 650, flightMs: 450, holdMs: 1100 });
    expect(h.sleeps).toEqual([650, 1100]);
    const fast = harness();
    await fast.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx({ speed: { motion: 0.55, hold: 0 } }));
    expect(fast.sleeps).toEqual([358]);
    expect(fast.store.getState().dock?.phase).toBe("pinned");
  });

  it("the human's card goes to the slip, not the dock; a headline card of either side does", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "USSR", card: 30, how: "influence", byHuman: true }, ctx());
    expect(h.store.getState().dock).toBeNull();
    await h.store.onReveal({ k: "reveal", side: "USSR", card: 18, how: "headline", byHuman: true }, ctx());
    expect(h.store.getState().dock).toMatchObject({ card: 18, from: "stage", holdMs: 0, phase: "pinned" });
  });

  it("reduced motion: a 150 ms fade, the same hold", async () => {
    const h = harness({ reduced: true });
    await h.store.onReveal({ k: "reveal", side: "US", card: 26, how: "event", byHuman: false }, ctx());
    expect(h.sleeps).toEqual([150, 1100]);
    expect(h.store.getState().dock).toMatchObject({ enterMs: 150, flightMs: 0 });
  });

  it("compact: no pinned dock, the reveal shrinks away after its hold", async () => {
    const h = harness({ layout: "compact" });
    await h.store.onReveal({ k: "reveal", side: "US", card: 26, how: "event", byHuman: false }, ctx());
    expect(h.store.getState().dock).toBeNull();
    expect(h.store.getState().leaving).toHaveLength(1);
    expect(h.store.getState().leaving[0]).toMatchObject({ phase: "leaving", to: null });
    h.timers.forEach(t => t.fn());
    expect(h.store.getState().leaving).toHaveLength(0);
    // The papers were the headline's reveal on a phone.
    await h.store.onReveal({ k: "reveal", side: "US", card: 26, how: "headline", byHuman: false }, ctx());
    expect(h.store.getState().dock).toBeNull();
  });

  it("Skip: jumps to pinned at once", async () => {
    const h = harness();
    const ac = new AbortController();
    ac.abort();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx({ signal: ac.signal }));
    expect(h.store.getState().dock?.phase).toBe("pinned");
  });

  it("moves top left when a changed box lies under it, and fills in the target", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    h.rects.set("dock", rect(800, 40, 236, 420));
    h.rects.set("country:59", rect(300, 500, 56, 36));
    h.rects.set("country:45", rect(900, 300, 56, 36));
    await h.store.onCountry({ k: "country", country: 59, influence: [] }, ctx());
    expect(h.store.getState().dock).toMatchObject({ pos: "right", country: 59 });
    await h.store.onCountry({ k: "country", country: 45, influence: [] }, ctx());
    expect(h.store.getState().dock).toMatchObject({ pos: "left", country: 59 });
  });

  it("a roll gives the target too", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    await h.store.onRoll({ k: "roll", roll: { type: "COUP", country_id: 23, roller: "US", roll1: 1, mod1: 3, total1: 4, total2: 8, mod2: 8 } }, ctx());
    expect(h.store.getState().dock?.country).toBe(23);
  });

  it("a rolled country under the dock moves it top left before the tray locks on; the whole dock counts (R-006)", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 95, how: "influence", byHuman: false }, ctx());
    // The card ends at y 292; its caption (name, how, the opponent-card note) runs on to 399.
    h.rects.set("dock", rect(1023, 124, 120, 168));
    h.rects.set("country:21", rect(1075, 330, 56, 30));
    await h.store.onRoll({ k: "roll", roll: { type: "WAR_EVENT", country_id: 21, roller: "USSR", roll1: 4 } }, ctx());
    expect(h.store.getState().dock).toMatchObject({ pos: "right", country: 21 });
    const whole = harness({ dockRect: () => rect(983, 92, 201, 307) });
    whole.rects.set("country:21", rect(1075, 330, 56, 30));
    await whole.store.onReveal({ k: "reveal", side: "US", card: 95, how: "influence", byHuman: false }, ctx());
    await whole.store.onRoll({ k: "roll", roll: { type: "WAR_EVENT", country_id: 21, roller: "USSR", roll1: 4 } }, ctx());
    expect(whole.store.getState().dock).toMatchObject({ pos: "left", country: 21 });
    expect(whole.store.getState().dice?.anchor).toBe("country:21");
  });

  it("a Space Race roll names no target: its record keeps the space box in country_id (R-007)", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "USSR", card: 30, how: "space", byHuman: false }, ctx());
    await h.store.onRoll({ k: "roll", roll: { type: "SPACE_RACE", country_id: 2, roller: "USSR", roll1: 6, mod1: 4, success: false } }, ctx());
    expect(h.store.getState().dock?.country).toBeNull();
    expect(h.store.getState().dice?.anchor).toBe("space:USSR");
  });

  it("a scoring sheet under the pinned dock moves it to the other corner, or folds it when there is no room (R-006)", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "USSR", card: 2, how: "event", byHuman: false }, ctx());
    const sheet = { x: 444, y: 74, w: 520, h: 646 };
    const here = { x: 728, y: 92, w: 200, h: 257 }, there = { x: 28, y: 92, w: 200, h: 257 };
    h.store.clearSheet(sheet, { pos: "right", here, there });
    expect(h.store.getState().dock).toMatchObject({ card: 2, pos: "left", phase: "pinned" });
    // Measured again before the dock is redrawn (React's dev double effects): it stays left.
    const before = h.store.getState();
    h.store.clearSheet(sheet, { pos: "right", here, there });
    expect(h.store.getState()).toBe(before);
    // Drawn in the left corner now, already clear: nothing changes.
    h.store.clearSheet(sheet, { pos: "left", here: there, there: here });
    expect(h.store.getState()).toBe(before);
    // A narrow table: neither corner is free, the dock folds into its pile.
    const narrow = harness();
    await narrow.store.onReveal({ k: "reveal", side: "US", card: 2, how: "event", byHuman: false }, ctx({}, [], { card_locations: { ...base.state.card_locations, 2: "DISCARD_PILE" } }));
    narrow.store.clearSheet({ x: 184, y: 70, w: 520, h: 600 }, { pos: "right", here: { x: 468, y: 88, w: 200, h: 257 }, there: { x: 28, y: 88, w: 200, h: 257 } });
    expect(narrow.store.getState().dock).toBeNull();
    expect(narrow.store.getState().leaving[0]).toMatchObject({ card: 2, phase: "leaving", to: "discard" });
    // Compact has no pinned dock to clear.
    const phone = harness({ layout: "compact" });
    phone.store.clearSheet(sheet, { pos: "right", here, there });
    expect(phone.store.getState().dock).toBeNull();
  });

  it("collapses into the pile its card went to at the next action round", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    await h.store.onDockTrack({ k: "track", event: { t: "action-round", ar: 4, side: "USSR" } }, ctx({}, [], { card_locations: { ...base.state.card_locations, 30: "REMOVED_FROM_GAME" } }));
    expect(h.store.getState().dock).toBeNull();
    expect(h.store.getState().leaving[0]).toMatchObject({ card: 30, phase: "leaving", to: "removed", leaveMs: 450 });
    expect(h.timers[0]!.ms).toBe(450);
  });

  it("syncDock: released when the runner unpins the card or a prompt opens", async () => {
    const h = harness();
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    h.store.syncDock(30, false, null);
    expect(h.store.getState().dock?.card).toBe(30);
    h.store.syncDock(0, false, { ...base.state, card_locations: { 30: "DISCARD_PILE" } } as PublicState);
    expect(h.store.getState().dock).toBeNull();
    expect(h.store.getState().leaving[0]?.to).toBe("discard");
    // A human headline in the dock ends with the next prompt.
    await h.store.onReveal({ k: "reveal", side: "USSR", card: 18, how: "headline", byHuman: true }, ctx());
    h.store.syncDock(0, false, null);
    expect(h.store.getState().dock?.card).toBe(18);
    h.store.syncDock(0, true, null);
    expect(h.store.getState().dock).toBeNull();
  });

  it("instant speed: the collapse is immediate", async () => {
    const h = harness({}, { settings: { speed: "instant" } });
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx({ speed: { motion: 0, hold: 0 } }));
    expect(h.sleeps).toEqual([0]);
    h.store.releaseDock();
    expect(h.store.getState().leaving).toHaveLength(0);
  });
});

describe("dice", () => {
  const coup = { type: "COUP", country_id: 71, roller: "US", roll1: 6, mod1: 3, total1: 9, mod2: 6, total2: 6, success: true } as const;

  it("lock → tumble → math → hold, then stays until the commit fades it", async () => {
    const h = harness();
    await h.store.onRoll({ k: "roll", roll: coup }, ctx({}, [{ t: "influence", country: 71, side: "USSR", from: 3, to: 0 }]));
    expect(h.states.map(s => s.dice?.phase)).toEqual(["lock", "tumble", "math", "hold"]);
    expect(h.sleeps).toEqual([250, 700, 200, 900]);
    expect(h.store.getState().dice).toMatchObject({ anchor: "country:71", phase: "hold" });
    h.store.commit({ ...ctx().frame, events: [] }, { log: [], humanSide: "USSR" });
    expect(h.store.getState().dice?.phase).toBe("out");
    h.timers.forEach(t => t.fn());
    expect(h.store.getState().dice).toBeNull();
  });

  it("realignment holds 600; reduced motion shows the face and maths at once, same hold", async () => {
    const h = harness({ reduced: true });
    await h.store.onRoll({ k: "roll", roll: { type: "REALIGNMENT", country_id: 22, roll1: 5, roll2: 2, total1: 6, total2: 3 } }, ctx());
    expect(h.states.map(s => s.dice?.phase)).toEqual(["math", "hold"]);
    expect(h.sleeps).toEqual([150, 600]);
  });

  it("Skip ends on the result", async () => {
    const h = harness();
    const ac = new AbortController();
    ac.abort();
    await h.store.onRoll({ k: "roll", roll: coup }, ctx({ signal: ac.signal }));
    expect(h.store.getState().dice?.phase).toBe("hold");
  });
});

describe("headline papers", () => {
  it("drop → read → fold with a hold when not pausing", async () => {
    const h = harness();
    await h.store.onHeadline({ k: "headline-reveal", us: 24, ussr: 18, first: "US" }, ctx());
    expect(h.states.map(s => s.papers?.phase ?? null)).toEqual(["drop", "read", "fold", null]);
    expect(h.sleeps).toEqual([750, 1600, 350]);
  });

  it("waits for Continue with pauseOnReveals, then folds", async () => {
    const h = harness();
    const c = ctx({ settings: { ...DEFAULT_SETTINGS, pauseOnReveals: true } });
    let done = false;
    const p = h.store.onHeadline({ k: "headline-reveal", us: 24, ussr: 18, first: "US" }, c).then(() => { done = true; });
    await tick();
    expect(h.store.getState().waiting).toBe("headline");
    expect(h.store.getState().papers?.phase).toBe("read");
    expect(done).toBe(false);
    h.store.proceed();
    await p;
    expect(h.store.getState().waiting).toBeNull();
    expect(h.store.getState().papers).toBeNull();
  });

  it("Skip while waiting resolves and clears", async () => {
    const h = harness();
    const ac = new AbortController();
    const p = h.store.onHeadline({ k: "headline-reveal", us: 24, ussr: 18, first: "US" }, ctx({ signal: ac.signal, settings: { ...DEFAULT_SETTINGS, pauseOnReveals: true } }));
    await tick();
    expect(h.store.getState().waiting).toBe("headline");
    ac.abort();
    await p;
    expect(h.store.getState()).toMatchObject({ waiting: null, papers: null });
  });

  it("marks a headline cancelled in the frame", async () => {
    const h = harness();
    const events: GameEvent[] = [{ t: "card-played", side: "US", card: 103, how: "headline" }, { t: "card-moved", card: 21, from: "HEADLINE_COMMITTED", to: "DISCARD_PILE" }];
    let seen = 0;
    h.store.subscribe(() => { seen = h.store.getState().papers?.cancelled ?? seen; });
    await h.store.onHeadline({ k: "headline-reveal", us: 103, ussr: 21, first: "US" }, ctx({}, events));
    expect(seen).toBe(21);
  });
});

describe("scoring sheet", () => {
  it("uses the board before the frame (the last commit), spotlights the region, rows then net then hold", async () => {
    const h = harness();
    const earlier = { ...base, seq: 5, regionScores: { ...base.regionScores } };
    h.store.commit(earlier, { log: [], humanSide: "USSR" });
    await h.store.onScoring({ k: "scoring", card: 3, vp: -1, scores: { regions: [], ignored_flags: [] } }, ctx({}, [{ t: "card-played", side: "US", card: 3, how: "scoring" }]));
    const sheet = h.store.getState().scoring!;
    expect(sheet).toMatchObject({ card: 3, slot: 2, vp: -1, capped: null, by: "US", phase: "read", rows: 6 });
    expect(sheet.score).toBe(earlier.regionScores.regions.find(r => r.slot === 2));
    expect(h.states.some(s => s.focusRegion === 2)).toBe(true);
    expect(h.sleeps).toEqual([360, 720, 300, 2000]);
    h.store.commit({ ...ctx().frame, seq: 10 }, { log: [], humanSide: "USSR" });
    expect(h.store.getState()).toMatchObject({ focusRegion: null });
    expect(h.store.getState().scoring?.phase).toBe("out");
  });

  it("falls back to the beat's scores, waits for Continue with pauseOnReveals", async () => {
    const h = harness();
    const p = h.store.onScoring({ k: "scoring", card: 38, vp: 2, scores: base.regionScores }, ctx({ settings: { ...DEFAULT_SETTINGS, pauseOnReveals: true } }));
    await tick();
    expect(h.store.getState().waiting).toBe("scoring");
    expect(h.store.getState().scoring?.score?.slot).toBe(6);
    h.store.proceed();
    await p;
    expect(h.store.getState().scoring?.phase).toBe("read");
  });
});

describe("scoring sheet: the net is the rows'", () => {
  // The Asia score of QA Q-019 (T3 AR6, VP USSR +15): totals 4 / 10, the track takes 5 of the 6.
  const asia = { ...base.regionScores.regions.find(r => r.slot === 1)!, net: -6 };
  asia.us = { ...asia.us, vp: 4 };
  asia.ussr = { ...asia.ussr, vp: 10 };
  const scores = { regions: base.regionScores.regions.map(r => (r.slot === 1 ? asia : r)), ignored_flags: [] };

  it("a scoring the VP track stops at 20: the rows' net, and what was applied", async () => {
    const h = harness();
    h.store.commit({ ...base, seq: 5, regionScores: scores }, { log: [], humanSide: "USSR" });
    await h.store.onScoring({ k: "scoring", card: 1, vp: -5, scores }, ctx({}, [{ t: "card-played", side: "US", card: 1, how: "scoring" }], { victory_points: -20 }));
    expect(h.store.getState().scoring).toMatchObject({ card: 1, slot: 1, vp: -6, capped: -5 });
  });

  it("not capped: no note; Europe control (VP set to ±20) is no stop either", async () => {
    const h = harness();
    h.store.commit({ ...base, seq: 5, regionScores: scores }, { log: [], humanSide: "USSR" });
    await h.store.onScoring({ k: "scoring", card: 1, vp: -6, scores }, ctx({}, [], { victory_points: -12 }));
    expect(h.store.getState().scoring).toMatchObject({ vp: -6, capped: null });
    const eu = { ...base.regionScores.regions.find(r => r.slot === 0)!, net: 7, wins: "US" as const };
    const euScores = { regions: base.regionScores.regions.map(r => (r.slot === 0 ? eu : r)), ignored_flags: [] };
    h.store.commit({ ...base, seq: 6, regionScores: euScores }, { log: [], humanSide: "USSR" });
    await h.store.onScoring({ k: "scoring", card: 2, vp: 23, scores: euScores }, ctx({}, [], { victory_points: 20 }));
    expect(h.store.getState().scoring).toMatchObject({ slot: 0, vp: 7, capped: null });
  });

  it("the board before the frame unless only the frame's agrees with the engine", async () => {
    const h = harness();
    h.store.commit({ ...base, seq: 5 }, { log: [], humanSide: "USSR" });
    // The last commit says Asia nets 0, the frame's board −6, the engine moved −6: the frame's.
    await h.store.onScoring({ k: "scoring", card: 1, vp: -6, scores }, ctx({}, [], { victory_points: -8 }));
    expect(h.store.getState().scoring?.score).toBe(asia);
  });
});

describe("banners", () => {
  it("turn 4: era stamp, longer hold; turn 6 plain; the headline phase plate", async () => {
    const h = harness();
    await h.store.onBanner({ k: "banner", kind: "turn", turn: 4 }, ctx());
    expect(h.states[0]!.banner).toMatchObject({ turn: 4, era: "mid", eraStamp: "mid", phase: "in" });
    expect(h.sleeps).toEqual([350, 1300, 350]);
    expect(h.store.getState().banner).toBeNull();
    const g = harness();
    await g.store.onBanner({ k: "banner", kind: "turn", turn: 6 }, ctx());
    expect(g.sleeps).toEqual([350, 900, 350]);
    expect(g.states[0]!.banner).toMatchObject({ era: "mid", eraStamp: null });
    const p = harness();
    await p.store.onBanner({ k: "banner", kind: "phase", phase: "HEADLINE" }, ctx());
    expect(p.sleeps).toEqual([250, 700, 250]);
    const none = harness();
    await none.store.onBanner({ k: "banner", kind: "turn", turn: 6 }, ctx({ speed: { motion: 0, hold: 0 } }));
    expect(none.states).toHaveLength(0);
  });
});

describe("game over", () => {
  const ending = { winner: "USSR", reason: "held-scoring", vpBefore: 1, vpFinal: -20, turn: 7, cards: [79] } as const;

  it("the beat, then the telex", async () => {
    const h = harness();
    await h.store.onGameOver({ k: "game-over", ending }, ctx());
    expect(h.states[0]!.over).toMatchObject({ phase: "beat", effect: null });
    expect(h.store.getState().over).toMatchObject({ phase: "shown", ending });
    expect(h.sleeps).toEqual([600, 780]);
  });

  it("nuclear war: white-out; Europe control: Europe lit during the beat", async () => {
    const h = harness();
    await h.store.onGameOver({ k: "game-over", ending: { ...ending, reason: "defcon" } }, ctx());
    expect(h.states[0]!.over?.effect).toBe("whiteout");
    expect(h.sleeps[0]).toBe(2000);
    const e = harness();
    await e.store.onGameOver({ k: "game-over", ending: { ...ending, reason: "europe-control" } }, ctx());
    expect(e.states[0]).toMatchObject({ focusRegion: 0 });
    expect(e.store.getState().focusRegion).toBeNull();
  });

  it("final scoring: the combined sheet first, with the China Card's +1 in its net", async () => {
    // A final-scoring frame: the board of prompt-midgame, the China Card with the USSR. Regions net
    // 0 + 0 − 1 + 8 − 5 + 0 = +2, the China Card −1: +1 (VP −2 → −1).
    const h = harness();
    h.store.commit(base, { log: [], humanSide: "USSR" });
    const regions = base.regionScores.regions.filter(r => r.slot <= 5).reduce((n, r) => n + r.net, 0);
    const final = { ...ending, reason: "final-scoring" as const, winner: "USSR" as const, cards: undefined, turn: 10, vpBefore: -2, vpFinal: -2 + regions - 1 };
    const over: Frame = { seq: 99, state: { ...base.state, turn: 11, china_card: { holder: "USSR", playable: true } }, regionScores: base.regionScores, actor: "USSR", events: [{ t: "game-over", ending: final }], auto: false };
    await h.store.onGameOver({ k: "game-over", ending: final }, ctx({ frame: over }));
    const sheet = h.states.find(s => s.scoring)?.scoring;
    expect(sheet).toMatchObject({ card: 0, slot: null, scores: base.regionScores, china: "USSR", vp: regions - 1, capped: null, rows: 8 });
    expect(sheet!.vp).toBe(final.vpFinal - final.vpBefore);
    expect(h.store.getState().scoring).toBeNull();
    expect(h.store.getState().over?.phase).toBe("shown");
  });

  it("final scoring past 20: the rows' net and what the track took", async () => {
    const h = harness();
    const regions = base.regionScores.regions.filter(r => r.slot <= 5).reduce((n, r) => n + r.net, 0);
    const final = { ...ending, reason: "final-scoring" as const, winner: "US" as const, cards: undefined, turn: 10, vpBefore: 19, vpFinal: 20 };
    const over: Frame = { seq: 99, state: { ...base.state, turn: 11, china_card: { holder: "US", playable: true } }, regionScores: base.regionScores, actor: "US", events: [{ t: "game-over", ending: final }], auto: false };
    await h.store.onGameOver({ k: "game-over", ending: final }, ctx({ frame: over }));
    expect(h.states.find(s => s.scoring)?.scoring).toMatchObject({ china: "US", vp: regions + 1, capped: 1 });
  });

  it("a committed game-over frame shows the telex even without a beat; showEnded too", () => {
    const h = harness();
    h.store.commit({ ...base, seq: 77, events: [{ t: "game-over", ending }] }, { log: [], humanSide: "USSR" });
    expect(h.store.getState().over).toMatchObject({ phase: "shown", ending });
    const g = harness();
    g.store.showEnded(ending);
    expect(g.store.getState().over?.phase).toBe("shown");
  });
});

describe("danger frame and commits", () => {
  it("DEFCON to 2 turns it on before the commit, up from 2 off; the commit hands back to Shown", async () => {
    const h = harness();
    await h.store.onDangerTrack({ k: "track", event: { t: "defcon", from: 3, to: 2 } });
    expect(h.store.getState().danger).toBe(true);
    await h.store.onDangerTrack({ k: "track", event: { t: "defcon", from: 2, to: 3 } });
    expect(h.store.getState().danger).toBe(false);
    await h.store.onDangerTrack({ k: "track", event: { t: "vp", from: 0, to: 1 } });
    expect(h.store.getState().danger).toBe(false);
    h.store.commit(base, { log: [], humanSide: "USSR" });
    expect(h.store.getState().danger).toBeNull();
  });

  it("another game clears the stage and the record", async () => {
    const h = harness();
    const logA = [{ id: 1, turn: 1, ar: 0, side: null, kind: "system", text: { key: "ui:app.title" } }] as const;
    const logB = [{ id: 900, turn: 1, ar: 0, side: null, kind: "system", text: { key: "ui:app.title" } }] as const;
    h.store.commit(base, { log: logA as never, humanSide: "USSR" });
    await h.store.onReveal({ k: "reveal", side: "US", card: 30, how: "coup", byHuman: false }, ctx());
    expect(h.store.getState().dock).not.toBeNull();
    h.store.commit({ ...base, seq: 1 }, { log: logB as never, humanSide: "US" });
    expect(h.store.getState().dock).toBeNull();
  });
});

describe("with the frame runner on recorded sequences", () => {
  function drive(name: string, settings: Partial<UiSettings> = {}) {
    const fx = fixture(name);
    const controller = new FixtureController(fx);
    const director = createDirector();
    const all: UiSettings = { ...DEFAULT_SETTINGS, pauseOnReveals: false, ...settings };
    const h = harness({ settings: all, later: (_ms, fn) => fn() });
    const runner = new FrameRunner({ controller, director, settings: () => all, sleep: async () => undefined, onCommit: f => h.store.commit(f, controller.getSnapshot()) });
    h.store.attach(director, ["reveal", "country", "dockTrack", "roll", "headline", "scoring", "banner", "gameOver", "dangerTrack"]);
    runner.subscribe(() => { const s = runner.getShown(); h.store.syncDock(s.aiPlayCard, !!controller.getSnapshot().prompt, s.state); });
    return { fx, controller, runner, h };
  }

  it("an AI coup: the dock pins the card, the dice show, the dock collapses at the action round", async () => {
    const { controller, runner, h } = drive("seq-ai-coup");
    runner.start();
    await until(() => controller.position.done);
    const docks = h.states.map(s => s.dock?.card ?? 0);
    expect(docks).toContain(28);
    expect(h.states.some(s => s.dice?.anchor === "country:23")).toBe(true);
    expect(h.store.getState().dock).toBeNull();
    runner.stop();
  });

  it("the headline: papers, then each headline through the dock", async () => {
    const { controller, runner, h } = drive("seq-headline");
    runner.start();
    await until(() => controller.position.done);
    expect(h.states.some(s => s.papers?.us === 24 && s.papers.ussr === 18 && s.papers.first === "US")).toBe(true);
    const docked = [...new Set(h.states.map(s => s.dock?.card).filter(Boolean))];
    expect(docked).toEqual([24, 18]);
    runner.stop();
  });

  it("pauseOnReveals: the runner waits on the papers until Continue", async () => {
    const { controller, runner, h } = drive("seq-headline", { pauseOnReveals: true });
    runner.start();
    await until(() => h.store.getState().waiting === "headline");
    for (let i = 0; i < 20; i++) await tick();
    expect(controller.position.done).toBe(false);
    h.store.proceed();
    await until(() => controller.position.done);
    runner.stop();
  });

  it("a scoring card: the sheet on the board before it", async () => {
    // A short sequence with a scoring event (the fixture set is regenerated from time to time).
    const name = fixtureIndex().find(r => r.kind === "sequence" && r.name !== "game-full" && r.tags.includes("event:scoring"))!.name;
    const { controller, runner, h, fx } = drive(name);
    runner.start();
    await until(() => controller.position.done);
    const i = fx.frames.findIndex(f => f.events.some(e => e.t === "scoring"));
    const ev = fx.frames[i]!.events.find(e => e.t === "scoring")!;
    if (ev.t !== "scoring") throw new Error("no scoring");
    const sheet = h.states.find(s => s.scoring)?.scoring;
    const slot = scoringSlot(ev.card)!;
    expect(sheet).toMatchObject({ card: ev.card, slot, vp: ev.vp });
    expect(sheet!.score).toBe(fx.frames[i - 1]!.regionScores.regions.find(r => r.slot === slot));
    runner.stop();
  });

  it("the end of a turn: banner (era 4), headline plate", async () => {
    const { controller, runner, h } = drive("seq-turn-end");
    runner.start();
    await until(() => controller.position.done);
    const banners = h.states.map(s => s.banner).filter(Boolean).map(b => `${b!.kind}:${b!.turn}:${b!.eraStamp}`);
    expect([...new Set(banners)]).toEqual(["turn:4:mid", "phase:4:null"]);
    runner.stop();
  });

  for (const name of ["seq-over-defcon", "seq-over-held-scoring", "seq-over-vp20", "seq-over-milops-vp20", "seq-over-resign"]) {
    it(`${name}: ends on the telex with the recorded ending`, async () => {
      const { controller, runner, h, fx } = drive(name);
      runner.start();
      await until(() => controller.position.done);
      expect(h.store.getState().over).toMatchObject({ phase: "shown", ending: fx.final.ending });
      runner.stop();
    });
  }

  it("DEFCON 2 on the board: the frame's override clears at the commit", async () => {
    const { controller, runner, h } = drive("seq-turn-end");
    runner.start();
    await until(() => controller.position.done);
    expect(h.store.getState().danger).toBeNull();
    expect(h.states.some(s => s.danger === false)).toBe(true);
    runner.stop();
  });
});
