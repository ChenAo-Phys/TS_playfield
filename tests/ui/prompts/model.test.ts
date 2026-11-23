/**
 * The prompt layer's pure parts: cost hints (G1 display), event verbs (G3 fallback), decision runs
 * (counter totals, cap tags, picker counts), the prompt store (staging, the realignment carry, the
 * 6 s timeout), map targets and region helpers — on hand-made prompts and recorded fixtures.
 */
import { describe, expect, it } from "vitest";
import type { Prompt, PromptOption, PublicState, ViewModel } from "../../../src/game/contract";
import { controlAfter, cost2Targets, countryFacts, pointCost, realignFacts, wouldTakeControl } from "../../../src/ui/prompts/costHint";
import { effectOf, ghostSideFor, removeAmount, verbFor } from "../../../src/ui/prompts/eventVerbs";
import { groupByRegion, regionTargetsOf, slotOfCountry } from "../../../src/ui/prompts/regions";
import { nextRun, runCardPicks, runPlaced, runTotalOf } from "../../../src/ui/prompts/runTotals";
import { PromptStore, STAGE_TIMEOUT_MS, type Timers } from "../../../src/ui/prompts/store";
import { stagedFor } from "../../../src/ui/prompts/useStaging";
import { promptTargets } from "../../../src/ui/prompts/usePromptTargets";
import { slipMode } from "../../../src/ui/prompts/OrdersSlip";
import { promptSurface, isHandPicker, handOffers } from "../../../src/ui/prompts/wiring";
import { fixture } from "../../fixtures/load";

const scene = (name: string) => {
  const fx = fixture(name);
  return { fx, p: fx.final.prompt!, state: fx.final.frame!.state, human: fx.humanSide };
};

function prompt(p: Partial<Prompt>): Prompt {
  return {
    kind: "influence", promptId: 1, decisionType: 5, resolvingCard: 0, pendingCard: 44, opsValue: 3, remaining: 3, maxPerCountry: 0,
    options: [], cards: [], countries: [], title: { key: "prompt:title.influence", params: { count: 3 } }, ...p,
  };
}

describe("costHint", () => {
  it("cost2 = targets the decider's opponent controls (influence-type prompts only)", () => {
    const { p, state } = scene("prompt-influence");
    const c2 = cost2Targets(p, state);
    const expected = Object.values(state.countries).filter(c => p.countries.includes(c.id) && c.controlled_by === "US").map(c => c.id).sort((a, b) => a - b);
    expect([...c2].sort((a, b) => a - b)).toEqual(expected);
    expect(c2.size).toBeGreaterThan(0);
    // the controller's own costs agree: a cost-2 option is opponent-controlled (no China Card here)
    for (const o of p.options) if (o.cost === 2) expect(c2.has(o.id)).toBe(true);
    const coup = scene("prompt-coup-target");
    expect(cost2Targets(coup.p, coup.state).size).toBe(0);
  });
  it("pointCost uses the option's cost, capped at what is left", () => {
    const p = prompt({ remaining: 2 });
    expect(pointCost(p, { idx: 1, kind: "country", id: 3, cost: 2 }, new Set())).toBe(2);
    expect(pointCost(p, { idx: 1, kind: "country", id: 3 }, new Set([3]))).toBe(2);
    expect(pointCost(p, { idx: 1, kind: "country", id: 3 }, new Set())).toBe(1);
    expect(pointCost(prompt({ remaining: 1 }), { idx: 1, kind: "country", id: 3, cost: 3 }, new Set())).toBe(1);
  });
  it("control after a point (display only)", () => {
    const f = { id: 25, us: 2, ussr: 0, ctrl: "US" as const, stability: 2, battleground: true };
    expect(controlAfter(f, "USSR", 1)).toBe("NONE"); // 2 vs 1 at stability 2: control is broken
    expect(controlAfter(f, "US", 1)).toBe("US");
    expect(wouldTakeControl({ ...f, us: 0, ctrl: "NONE" }, "USSR", 1)).toBe(false);
    expect(wouldTakeControl({ ...f, us: 0, ussr: 1, ctrl: "NONE" }, "USSR", 1)).toBe(true);
    const { state } = scene("prompt-influence");
    const facts = countryFacts(state, 25);
    expect(facts.stability).toBe(2);
    expect(realignFacts(state, 24).superpower).toBe(null);
    expect(realignFacts(state, 5).superpower).toBe("USSR"); // Finland touches the USSR
  });
});

describe("eventVerbs", () => {
  it("prefers Prompt.effect (G3)", () => {
    const add = scene("prompt-event-target-add");
    expect(add.p.effect).toEqual({ verb: "add", side: "USSR" });
    expect(verbFor(add.p, "USSR")).toBe("add");
    expect(ghostSideFor(add.p, "USSR")).toBe("USSR");
    const rem = scene("prompt-event-target-remove");
    expect(verbFor(rem.p, "USSR")).toBe("remove");
    expect(ghostSideFor(rem.p, "USSR")).toBe("US");
    const other = scene("prompt-event-target-other");
    expect(verbFor(other.p, "USSR")).toBe("target");
    expect(ghostSideFor(other.p, "USSR")).toBeUndefined();
  });
  it("falls back to the card table without Prompt.effect", () => {
    const base = { kind: "event-target" as const, effect: undefined };
    expect(effectOf(prompt({ ...base, resolvingCard: 30 }), "USSR")).toEqual({ verb: "add", side: "USSR" });
    expect(effectOf(prompt({ ...base, resolvingCard: 19 }), "US")).toEqual({ verb: "remove", side: "USSR" });
    expect(effectOf(prompt({ ...base, resolvingCard: 40 }), "US")).toEqual({ verb: "remove", side: "US" });
    expect(effectOf(prompt({ ...base, resolvingCard: 36 }), "US")).toEqual({ verb: "target", side: "US" });
    expect(effectOf(prompt({ ...base, resolvingCard: 16, title: { key: "prompt:card.16.targetAdd" } }), "USSR")).toEqual({ verb: "add", side: "USSR" });
    expect(effectOf(prompt({ ...base, resolvingCard: 999 }), "US")).toBe(null);
    expect(verbFor(prompt({ ...base, resolvingCard: 999 }), "US")).toBe("target");
    expect(verbFor(prompt({ kind: "coup-target" }))).toBe("coup");
    expect(verbFor(prompt({ kind: "realign-target" }))).toBe("realign");
    expect(verbFor(prompt({ kind: "setup-place" }))).toBe("add");
  });
  it("removal amounts (display only)", () => {
    expect(removeAmount(prompt({ kind: "event-target", title: { key: "prompt:card.56.target" } }), 3)).toBe(3);
    expect(removeAmount(prompt({ kind: "event-target", resolvingCard: 40, title: { key: "prompt:card.40.target" } }), 3)).toBe(2);
    expect(removeAmount(prompt({ kind: "event-target", title: { key: "prompt:card.74.target" } }), 3)).toBe(1);
  });
});

describe("decision runs", () => {
  const st = scene("prompt-influence-start").state;
  it("the total is the remaining of the run's first prompt; a null prompt keeps the run", () => {
    let run = nextRun(null, prompt({ promptId: 10, remaining: 4 }), st);
    expect(run!.total).toBe(4);
    run = nextRun(run, null, st);
    run = nextRun(run, prompt({ promptId: 11, remaining: 3 }), st);
    run = nextRun(run, prompt({ promptId: 12, remaining: 1 }), st);
    expect(run!.total).toBe(4);
    expect(runTotalOf(run, prompt({ promptId: 12, remaining: 1 }))).toBe(4);
    expect(runTotalOf(run, prompt({ promptId: 99, remaining: 2, opsValue: 0 }))).toBe(2);
    // an Ops run first seen mid-way knows its size from opsValue
    expect(runTotalOf(null, prompt({ promptId: 99, remaining: 2, opsValue: 3 }))).toBe(3);
  });
  it("a new decision or a rise in remaining (undo) starts a new run", () => {
    let run = nextRun(null, prompt({ promptId: 10, remaining: 4 }), st);
    run = nextRun(run, prompt({ promptId: 11, remaining: 4 }), st);
    expect(run!.promptId).toBe(11);
    run = nextRun(run, prompt({ promptId: 12, remaining: 2 }), st);
    run = nextRun(run, prompt({ promptId: 13, kind: "realign-target", remaining: 2 }), st);
    expect(run!.total).toBe(2);
    expect(run!.key).toContain("realign-target");
  });
  it("cap tags: per-country change of the affected side since the run began", () => {
    const { p, state } = scene("prompt-event-target-add");
    const run = nextRun(null, p, state);
    expect(runPlaced(run, state, "USSR")).toEqual({});
    const later = structuredClone(state) as PublicState;
    const k = Object.keys(later.countries).find(n => later.countries[n]!.id === 64)!;
    (later.countries[k] as { ussr_influence: number }).ussr_influence += 2;
    expect(runPlaced(run, later, "USSR")).toEqual({ 64: 2 });
    expect(runPlaced(run, later, "US")).toEqual({});
  });
  it("picker counts: cards offered at the start that have moved since", () => {
    const { p, state } = scene("prompt-event-card");
    const run = nextRun(null, p, state);
    expect(runCardPicks(run, state)).toBe(0);
    const later = structuredClone(state) as PublicState;
    later.card_locations![String(p.cards[0])] = "DISCARD_PILE";
    expect(runCardPicks(run, later)).toBe(1);
  });
});

describe("prompt store", () => {
  function fakeTimers() {
    const pending = new Map<number, () => void>();
    let seq = 0;
    const t: Timers & { fire(): void; count(): number } = {
      setTimeout: (fn: () => void) => { pending.set(++seq, fn); return seq; },
      clearTimeout: (id: unknown) => { pending.delete(id as number); },
      fire: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach(f => f()); },
      count: () => pending.size,
    };
    return t;
  }
  const vmOf = (p: Prompt | null, state: PublicState | null = null): ViewModel => ({
    status: "playing", humanSide: "USSR", frame: state ? { seq: 1, state, regionScores: { regions: [], ignored_flags: [] }, actor: null, events: [], auto: false } : null,
    queued: 0, prompt: p, aiThinking: false, canUndo: true, log: [], ending: null, hasSavedGame: false,
  });
  const realign = (promptId: number, countries: number[], remaining: number) => prompt({
    kind: "realign-target", promptId, remaining, countries,
    options: countries.map((id, i) => ({ idx: 100 + i + promptId, kind: "country", id }) as PromptOption),
  });

  it("stages, clears, and times out after 6 s without activity", () => {
    const timers = fakeTimers();
    const s = new PromptStore(timers);
    const p = realign(1, [24, 25], 2);
    s.observe(vmOf(p));
    s.stage({ kind: "country", id: 24, idx: 101, promptId: 1 });
    expect(stagedFor(s.get().staged, p)).toEqual({ kind: "country", id: 24, idx: 101 });
    expect(timers.count()).toBe(1);
    timers.fire();
    expect(s.get().staged).toBe(null);
    s.stage({ kind: "country", id: 25, idx: 102, promptId: 1 });
    expect(s.clear()).toBe(true);
    expect(s.clear()).toBe(false);
    expect(STAGE_TIMEOUT_MS).toBe(6000);
  });
  it("pausing holds the timeout; hovering the staged country restarts it", () => {
    const timers = fakeTimers();
    const s = new PromptStore(timers);
    s.observe(vmOf(realign(1, [24], 1)));
    s.stage({ kind: "country", id: 24, idx: 101, promptId: 1 });
    s.pause(true);
    expect(timers.count()).toBe(0);
    s.pause(false);
    expect(timers.count()).toBe(1);
    s.setHover(24);
    expect(timers.count()).toBe(1);
    expect(s.get().hover).toBe(24);
  });
  it("drops the selection on a new prompt, but a realignment keeps its country after a roll", () => {
    const s = new PromptStore(fakeTimers());
    s.observe(vmOf(realign(1, [24, 25], 2)));
    s.stage({ kind: "country", id: 25, idx: 102, promptId: 1 });
    s.observe(vmOf(null)); // the roll animates
    s.observe(vmOf(realign(2, [24, 25], 1)));
    expect(s.get().staged).toMatchObject({ kind: "country", id: 25, promptId: 2, idx: 103 });
    s.observe(vmOf(prompt({ kind: "action-card", promptId: 3 })));
    expect(s.get().staged).toBe(null);
    // another kind never carries
    s.observe(vmOf(prompt({ kind: "coup-target", promptId: 4, countries: [25], options: [{ idx: 141, kind: "country", id: 25 }] })));
    s.stage({ kind: "country", id: 25, idx: 141, promptId: 4 });
    s.observe(vmOf(prompt({ kind: "coup-target", promptId: 5, countries: [25], options: [{ idx: 141, kind: "country", id: 25 }] })));
    expect(stagedFor(s.get().staged, prompt({ promptId: 5 }))).toBe(null);
  });
  it("tracks the run and the last prompt; closes the target list off-map", () => {
    const s = new PromptStore(fakeTimers());
    const st = scene("prompt-influence-start").state;
    s.observe(vmOf(prompt({ promptId: 1, remaining: 3 }), st));
    s.setListOpen(true);
    s.observe(vmOf(prompt({ promptId: 2, remaining: 2 }), st));
    expect(s.get().run!.total).toBe(3);
    expect(s.get().listOpen).toBe(true);
    expect(s.get().lastPrompt!.promptId).toBe(2);
    s.observe(vmOf(prompt({ kind: "action-card", promptId: 3 }), st));
    expect(s.get().listOpen).toBe(false);
  });
  it("attaches to a controller and follows its snapshots", () => {
    let vm = vmOf(realign(1, [24], 1));
    const listeners = new Set<() => void>();
    const s = new PromptStore(fakeTimers());
    s.attach({ subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => vm });
    expect(s.get().promptId).toBe(1);
    vm = vmOf(realign(7, [24], 1));
    listeners.forEach(f => f());
    expect(s.get().promptId).toBe(7);
    s.detach();
    expect(listeners.size).toBe(0);
  });
});

describe("map targets", () => {
  it("influence: quiet ring (> 12), opponent control, ghost on your side", () => {
    const { p, state, human } = scene("prompt-influence");
    const t = promptTargets(p, state, human)!;
    expect(t.ids.size).toBe(p.countries.length);
    expect(t.tone).toBe("quiet");
    expect(t.verb).toBe("add");
    expect(t.ghostSide).toBe("USSR");
    expect([...t.cost2]).toEqual([...cost2Targets(p, state)]);
    expect(t.danger.size).toBe(0);
    expect(t.cap).toBeUndefined();
  });
  it("coup, realign (loud ring ≤ 12), event placements with caps, removals", () => {
    const coup = scene("prompt-coup-target");
    expect(promptTargets(coup.p, coup.state, coup.human)!.verb).toBe("coup");
    const re = scene("prompt-realign-target");
    const rt = promptTargets(re.p, re.state, re.human)!;
    expect(rt).toMatchObject({ tone: "loud", verb: "realign" });
    const add = scene("prompt-event-target-add");
    const at = promptTargets(add.p, add.state, add.human, nextRun(null, add.p, add.state))!;
    expect(at.cap).toEqual({ max: 2, placed: {} });
    const rem = scene("prompt-event-target-remove");
    expect(promptTargets(rem.p, rem.state, rem.human)).toMatchObject({ verb: "remove", ghostSide: "US" });
  });
  it("hazard rings for options that may lose the game; none for prompts off the map", () => {
    const { p, state } = scene("prompt-coup-target");
    const risky = { ...p, options: p.options.map((o, i) => (i === 0 ? { ...o, warnings: [{ code: "defcon-suicide" as const, params: { faces: 2 } }] } : o)) };
    expect([...promptTargets(risky, state, "USSR")!.danger]).toEqual([p.options[0]!.id]);
    const hl = scene("prompt-headline");
    expect(promptTargets(hl.p, hl.state, hl.human)).toBe(null);
    expect(promptTargets(null, state, "USSR")).toBe(null);
  });
});

describe("regions and surfaces", () => {
  it("region targets, SE Asia grouping, board order", () => {
    const { p } = scene("prompt-region");
    expect([...regionTargetsOf(p)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(slotOfCountry(39)).toBe(6);
    expect(slotOfCountry(25)).toBe(2);
    expect(groupByRegion([39, 25, 4, 60]).map(g => g.slot)).toEqual([0, 2, 6, 3]);
  });
  it("where each recorded prompt is answered", () => {
    const want: Record<string, string> = {
      "prompt-influence": "map", "prompt-coup-target": "map", "prompt-headline": "hand", "prompt-action-card": "hand",
      "prompt-play-mode": "stage", "prompt-op-mode": "stage", "prompt-branch": "branch", "prompt-defcon-level": "defcon",
      "prompt-region": "region", "prompt-event-card": "hand",
    };
    for (const [name, surface] of Object.entries(want)) {
      const { p, state, human } = scene(name);
      expect(promptSurface(p, state, human), name).toBe(surface);
    }
    const ec = scene("prompt-event-card");
    expect(isHandPicker(ec.p, ec.state, ec.human)).toBe(true);
    const fromDiscard = { ...ec.p, resolvingCard: 43, options: ec.state.discard_pile.slice(0, 3).map((id, i) => ({ idx: 400 + i, kind: "card" as const, id })) };
    expect(promptSurface(fromDiscard, ec.state, ec.human)).toBe("picker");
  });
  it("hand offers: only for prompts answered from the hand", () => {
    const ac = scene("prompt-action-card-china");
    const offers = handOffers(ac.p, ac.state, ac.human, true);
    expect([...offers.keys()]).toEqual(ac.p.cards);
    expect(offers.get(1)!.commit).toBe("stage"); // Asia Scoring
    expect(offers.get(6)!.commit).toBe("instant");
    const inf = scene("prompt-influence");
    expect(handOffers(inf.p, inf.state, inf.human, true).size).toBe(0);
  });
  it("slip modes: prompt, frozen on your own frame, AI, over", () => {
    const p = prompt({});
    const base = { status: "playing", aiThinking: false, frame: { actor: null } };
    expect(slipMode({ ...base, prompt: p }, null, "USSR", p)).toBe("prompt");
    expect(slipMode({ ...base, prompt: null, frame: { actor: "USSR" } }, { busy: true, actor: "USSR" }, "USSR", p)).toBe("frozen");
    expect(slipMode({ ...base, prompt: null, aiThinking: true, frame: { actor: "USSR" } }, { busy: false, actor: null }, "USSR", p)).toBe("ai");
    expect(slipMode({ ...base, prompt: null, frame: { actor: "US" } }, { busy: true, actor: "US" }, "USSR", p)).toBe("ai");
    expect(slipMode({ ...base, status: "over", prompt: null }, null, "USSR", p)).toBe("over");
    // The last frames of a finished game still play first (shell integration fix).
    expect(slipMode({ ...base, status: "over", prompt: null, frame: { actor: "US" } }, { busy: true, actor: "US" }, "USSR", p)).toBe("ai");
    expect(slipMode({ ...base, status: "over", prompt: null, frame: { actor: "US" }, queued: 2 }, { busy: false, actor: null }, "USSR", p)).toBe("ai");
  });
});
