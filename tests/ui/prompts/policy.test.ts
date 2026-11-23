/**
 * The confirmation model (src/ui/prompts/policy.ts) against every row of ui-spec §8.2 / §8.3 / §8.6,
 * on hand-made prompts and on every recorded scene fixture.
 */
import { describe, expect, it } from "vitest";
import type { Prompt, PromptOption, Warning } from "../../../src/game/contract";
import {
  cardVerb, commitFor, endsThePlay, handPolicies, isFinalPoint, policiesOf, policyFor, severityOf, stampVerb, type PolicyContext,
} from "../../../src/ui/prompts/policy";
import { cost2Targets } from "../../../src/ui/prompts/costHint";
import { fixture, fixtureNames } from "../../fixtures/load";

function prompt(p: Partial<Prompt>): Prompt {
  return {
    kind: "action-card", promptId: 1, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 0, maxPerCountry: 0,
    options: [], cards: [], countries: [], title: { key: "prompt:title.actionCard" }, ...p,
  };
}
const opt = (kind: PromptOption["kind"], id: number, extra: Partial<PromptOption> = {}): PromptOption => ({ idx: 1000 + id, kind, id, ...extra });
const ON: PolicyContext = { settings: { confirmFinal: true }, cost2: new Set(), humanSide: "USSR" };
const OFF: PolicyContext = { settings: { confirmFinal: false }, cost2: new Set(), humanSide: "USSR" };
const commit = (p: Prompt, o: PromptOption, ctx = ON) => commitFor(p, o, ctx);

const W = {
  stranded: { code: "scoring-stranded", params: { scoring: 1, plays: 0 } } as Warning,
  opp: { code: "opponent-event", params: { card: 21, side: "US" } } as Warning,
  defcon6: { code: "defcon-suicide", params: { faces: 6 } } as Warning,
  defconAbsent: { code: "defcon-suicide" } as Warning,
  defcon2: { code: "defcon-suicide", params: { faces: 2 } } as Warning,
  cmc: { code: "cmc-suicide" } as Warning,
  endLose: { code: "game-ending", params: { winner: "US", reason: "vp20", faces: 6 } } as Warning,
  endWin: { code: "game-ending", params: { winner: "USSR", reason: "vp20", faces: 6 } } as Warning,
  endDraw: { code: "game-ending", params: { winner: "DRAW", reason: "held-scoring-both" } } as Warning,
  endSome: { code: "game-ending", params: { winner: "US", reason: "vp20", faces: 3 } } as Warning,
};

describe("§8.2 instant", () => {
  it("non-final influence / setup / bid / event-target points", () => {
    for (const kind of ["influence", "setup-place", "bid-place"] as const) {
      const p = prompt({ kind, remaining: 3 });
      expect(commit(p, opt("country", 25, { cost: 1, endsPlay: false }))).toBe("instant");
      expect(commit(p, opt("country", 25))).toBe("instant"); // fallback: remaining 3
    }
    const ev = prompt({ kind: "event-target", resolvingCard: 30, remaining: 3 });
    expect(commit(ev, opt("country", 53, { endsPlay: false }))).toBe("instant");
  });
  it("a hand card at action-card (not scoring, no warning; an opponent-event tag is only info)", () => {
    const p = prompt({ kind: "action-card" });
    expect(commit(p, opt("card", 74, { endsPlay: false }))).toBe("instant");
    expect(commit(p, opt("card", 6, { endsPlay: false }))).toBe("instant");
    expect(commit(p, opt("card", 21, { warnings: [W.opp] }))).toBe("instant");
  });
  it("play-mode Influence / Coup / Realign, op-mode modes, UN Intervention", () => {
    const pm = prompt({ kind: "play-mode", pendingCard: 74 });
    for (const id of [2, 3, 4]) expect(commit(pm, opt("mode", id, { endsPlay: false }))).toBe("instant");
    const om = prompt({ kind: "op-mode", pendingCard: 25, opsValue: 3 });
    for (const id of [0, 1, 2]) expect(commit(om, opt("op-mode", id, { endsPlay: false }))).toBe("instant");
    expect(commit(prompt({ kind: "play-mode", pendingCard: 100 }), opt("un-intervention", 32, { endsPlay: false }))).toBe("instant");
  });
});

describe("§8.2 stage (always)", () => {
  it("coup-target, realign-target, headline, event-card, branch, defcon-level, region — even without confirmFinal", () => {
    const rows: [Prompt, PromptOption][] = [
      [prompt({ kind: "coup-target", remaining: 1 }), opt("country", 25)],
      [prompt({ kind: "realign-target", remaining: 2 }), opt("country", 25, { endsPlay: false })],
      [prompt({ kind: "headline" }), opt("card", 31)],
      [prompt({ kind: "event-card", resolvingCard: 32 }), opt("card", 63, { endsPlay: false })],
      [prompt({ kind: "branch", resolvingCard: 16 }), opt("branch", 1, { endsPlay: false })],
      [prompt({ kind: "defcon-level", resolvingCard: 46 }), opt("defcon", 3)],
      [prompt({ kind: "region", resolvingCard: 94 }), opt("region", 1)],
    ];
    for (const [p, o] of rows) {
      expect(commit(p, o, OFF), p.kind).toBe("stage");
      expect(commit(p, o, ON), p.kind).toBe("stage");
    }
  });
  it("scoring cards and the Quagmire / Bear Trap escape at action-card", () => {
    const p = prompt({ kind: "action-card" });
    for (const id of [1, 2, 3, 37, 38, 79, 81]) expect(commit(p, opt("card", id), OFF)).toBe("stage");
    for (const key of ["prompt:title.actionCardQuagmire", "prompt:title.actionCardBearTrap"] as const) {
      expect(commit(prompt({ kind: "action-card", title: { key } }), opt("card", 74, { endsPlay: false }), OFF)).toBe("stage");
    }
  });
  it("event targets of war cards and of the event coups (Ortega, Che)", () => {
    for (const card of [11, 13, 24, 36, 102, 91, 107]) {
      expect(commit(prompt({ kind: "event-target", resolvingCard: card, remaining: 1 }), opt("country", 68, { endsPlay: false }), OFF), String(card)).toBe("stage");
    }
  });
  it("any option with scoring-stranded; a game end on some faces only", () => {
    expect(commit(prompt({ kind: "action-card" }), opt("card", 27, { warnings: [W.stranded] }), OFF)).toBe("stage");
    expect(commit(prompt({ kind: "play-mode" }), opt("mode", 2, { warnings: [W.stranded] }), OFF)).toBe("stage");
    expect(commit(prompt({ kind: "influence", remaining: 3 }), opt("country", 5, { warnings: [W.defcon2] }), OFF)).toBe("stage");
    expect(commit(prompt({ kind: "play-mode" }), opt("mode", 3, { warnings: [W.endSome] }), OFF)).toBe("stage");
  });
  it("a certain game end you win stages (it is final, not a danger)", () => {
    expect(commit(prompt({ kind: "action-card" }), opt("card", 2, { warnings: [W.endWin] }), OFF)).toBe("stage");
    expect(severityOf([W.endWin], "USSR")).toBe("caution");
  });
});

describe("§8.2 stage under confirmFinal (the action that ends your play)", () => {
  it("the final point of a placement run: endsPlay, else cost, else the spec fallback", () => {
    const p = prompt({ kind: "influence", remaining: 2 });
    const final = opt("country", 21, { cost: 2, endsPlay: true });
    const notFinal = opt("country", 22, { cost: 1, endsPlay: false });
    expect(commit(p, final)).toBe("stage");
    expect(commit(p, final, OFF)).toBe("instant");
    expect(commit(p, notFinal)).toBe("instant");
    // cost only
    expect(isFinalPoint(p, opt("country", 21, { cost: 2 }), new Set())).toBe(true);
    expect(isFinalPoint(p, opt("country", 22, { cost: 1 }), new Set())).toBe(false);
    // the fallback: remaining 1, or remaining 2 in a cost2 country
    expect(isFinalPoint(prompt({ kind: "influence", remaining: 1 }), opt("country", 3), new Set())).toBe(true);
    expect(isFinalPoint(p, opt("country", 21), new Set([21]))).toBe(true);
    expect(isFinalPoint(p, opt("country", 22), new Set([21]))).toBe(false);
    // the US's 7th setup point does not end the play (the bid follows): endsPlay false wins
    expect(commit(prompt({ kind: "setup-place", remaining: 1 }), opt("country", 5, { cost: 1, endsPlay: false }))).toBe("instant");
    // an event placement's last point
    expect(commit(prompt({ kind: "event-target", resolvingCard: 30, remaining: 1 }), opt("country", 53, { endsPlay: true }))).toBe("stage");
  });
  it("play-mode Event and Space; Event that leads to more decisions stays instant", () => {
    const p = prompt({ kind: "play-mode", pendingCard: 28 });
    expect(commit(p, opt("mode", 0, { endsPlay: true }))).toBe("stage");
    expect(commit(p, opt("mode", 1, { endsPlay: true }))).toBe("stage");
    expect(commit(p, opt("mode", 1))).toBe("stage");
    expect(commit(p, opt("mode", 0, { endsPlay: false }))).toBe("instant");
    expect(commit(p, opt("mode", 0, { endsPlay: true }), OFF)).toBe("instant");
    // a Coup mode whose single target is auto-played ends the play too
    expect(commit(p, opt("mode", 3, { endsPlay: true }))).toBe("stage");
  });
  it("every done press", () => {
    for (const [kind, meaning] of [["action-card", "pass"], ["realign-target", "stop"], ["op-mode", "decline"], ["event-card", "skip"]] as const) {
      const done = opt("done", 0, { idx: 208, endsPlay: false });
      const p = prompt({ kind, done, doneMeaning: meaning, options: [done] });
      expect(commit(p, done), kind).toBe("stage");
      expect(commit(p, done, OFF), kind).toBe("instant");
      expect(endsThePlay(p, done, new Set())).toBe(true);
    }
  });
});

describe("§8.2 hold", () => {
  it("a certain defcon-suicide / cmc-suicide / losing game end (faces absent or 6)", () => {
    for (const w of [W.defcon6, W.defconAbsent, W.cmc, W.endLose, W.endDraw]) {
      expect(commit(prompt({ kind: "coup-target", remaining: 1 }), opt("country", 25, { warnings: [w] }), OFF), w.code).toBe("hold");
      expect(commit(prompt({ kind: "action-card" }), opt("card", 74, { warnings: [w] }), OFF), w.code).toBe("hold");
    }
  });
  it("Wargames' end the game; DEFCON 1", () => {
    expect(commit(prompt({ kind: "branch", resolvingCard: 100 }), opt("branch", 0))).toBe("hold");
    expect(commit(prompt({ kind: "branch", resolvingCard: 100 }), opt("branch", 1))).toBe("stage");
    expect(commit(prompt({ kind: "branch", resolvingCard: 16 }), opt("branch", 0))).toBe("stage");
    expect(commit(prompt({ kind: "defcon-level", resolvingCard: 46 }), opt("defcon", 1), OFF)).toBe("hold");
    expect(commit(prompt({ kind: "defcon-level", resolvingCard: 45 }), opt("defcon", 2), OFF)).toBe("stage");
  });
});

describe("§8.3 severity", () => {
  it("fatal > caution > info > none", () => {
    expect(severityOf(undefined)).toBe("none");
    expect(severityOf([W.opp])).toBe("info");
    expect(severityOf([W.opp, W.stranded])).toBe("caution");
    expect(severityOf([W.stranded, W.defcon2])).toBe("fatal");
    expect(severityOf([W.endLose], "USSR")).toBe("fatal");
    expect(severityOf([W.endDraw], "USSR")).toBe("fatal");
    expect(policyFor(prompt({ kind: "action-card" }), opt("card", 21, { warnings: [W.opp] }), ON)).toMatchObject({ commit: "instant", severity: "info" });
  });
});

describe("hand offers and verbs", () => {
  it("handPolicies maps card ids of hand prompts only", () => {
    const p = prompt({ kind: "action-card", options: [opt("card", 1), opt("card", 6), opt("card", 74), opt("done", 0)] });
    const m = handPolicies(p, ON);
    expect([...m.keys()]).toEqual([1, 6, 74]);
    expect(m.get(1)!.commit).toBe("stage");
    expect(m.get(6)!.commit).toBe("instant");
    expect(handPolicies(prompt({ kind: "influence", options: [opt("country", 4)] }), ON).size).toBe(0);
    expect(handPolicies(null, ON).size).toBe(0);
  });
  it("stamps: headline, discard (trap escapes, discards), give, play", () => {
    expect(stampVerb(prompt({ kind: "headline" }))).toBe("headline");
    expect(stampVerb(prompt({ kind: "action-card" }))).toBe("play");
    expect(stampVerb(prompt({ kind: "action-card", title: { key: "prompt:title.actionCardQuagmire" } }))).toBe("discard");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 49 }))).toBe("give");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 10 }))).toBe("discard");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 250 }))).toBe("discard");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 43 }))).toBe("play");
    expect(cardVerb(prompt({ kind: "event-card", resolvingCard: 43 }))).toBe("take");
    expect(cardVerb(prompt({ kind: "event-card", resolvingCard: 32 }))).toBe("play");
  });
});

describe("recorded scenes (§8.6)", () => {
  const expectations: Record<string, (c: Map<string, string>) => void> = {
    "prompt-coup-target": c => expect(new Set(c.values())).toEqual(new Set(["stage"])),
    "prompt-realign-target": c => { expect(c.get("country:24")).toBe("stage"); expect(c.get("done:0")).toBe("stage"); },
    "prompt-headline": c => expect(new Set(c.values())).toEqual(new Set(["stage"])),
    "prompt-defcon-level": c => { expect(c.get("defcon:1")).toBe("hold"); expect(c.get("defcon:3")).toBe("stage"); },
    "prompt-region": c => expect(new Set(c.values())).toEqual(new Set(["stage"])),
    "prompt-branch": c => expect(new Set(c.values())).toEqual(new Set(["stage"])),
    "prompt-play-mode": c => { expect(c.get("mode:0")).toBe("stage"); expect(c.get("mode:1")).toBe("stage"); expect(c.get("mode:2")).toBe("instant"); },
    "prompt-op-mode": c => { expect(c.get("op-mode:0")).toBe("instant"); expect(c.get("op-mode:2")).toBe("instant"); },
    "prompt-action-card-warning": c => { expect(c.get("card:27")).toBe("stage"); expect(c.get("card:3")).toBe("stage"); },
    "prompt-action-card": c => expect(c.get("card:25")).toBe("instant"),
    "prompt-event-target-other": c => expect(c.get("country:68")).toBe("stage"),
    "prompt-influence": c => {
      // two Ops left: a 2-Op point (opponent control) ends the play and stages, a 1-Op point does not
      expect(c.get("country:1")).toBe("stage");
      expect(c.get("country:2")).toBe("instant");
    },
    "prompt-influence-start": c => expect(new Set(c.values())).toEqual(new Set(["instant"])),
    "prompt-setup-place-us": c => expect(new Set(c.values())).toEqual(new Set(["instant"])),
  };
  for (const name of fixtureNames("scene")) {
    it(name, () => {
      const fx = fixture(name);
      const p = fx.final.prompt!;
      const state = fx.final.frame!.state;
      const ctx: PolicyContext = { settings: { confirmFinal: true }, cost2: cost2Targets(p, state), humanSide: fx.humanSide };
      const map = policiesOf(p, ctx);
      expect(map.size).toBe(p.options.length);
      const byKey = new Map(p.options.map(o => [`${o.kind}:${o.id}`, map.get(o.idx)!.commit]));
      // Every option gets exactly one of the three commits; hand prompts expose only card options.
      for (const v of byKey.values()) expect(["instant", "stage", "hold"]).toContain(v);
      expectations[name]?.(byKey);
    });
  }
});
