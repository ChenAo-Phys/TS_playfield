/** Unit tests of the pure rule helpers (src/game/rules.ts) on synthetic display states. */
import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/engine/types";
import {
  classifyEnding, forcedEventTarget, maxActionRound, playsLeft, strandsScoring, suezSnapshot,
} from "../../src/game/rules";

/** A display state with only what the helpers read. */
type Overrides = Partial<Omit<GameState, "hands">> & { hands?: Partial<GameState["hands"]>; resolving?: number; dt?: number; remaining?: number };
function st(p: Overrides = {}): GameState {
  const { hands, resolving, dt, remaining, ...rest } = p;
  return {
    victory_points: 0, defcon: 3, mil_ops: { US: 5, USSR: 5 }, space: { US: 0, USSR: 0 }, turn: 3, action_round: 1,
    phasing_player: "USSR", current_phase: 2, current_phase_name: "ACTION_ROUND", headline_us_card: 0, headline_ussr_card: 0,
    forced_card_player: "NONE", forced_card_id: 0, space_turns_used: { US: 0, USSR: 0 }, china_card: { holder: "USSR", playable: true },
    flags: [], persistent_effects: 0, countries: {}, hands: { US: [], USSR: [], ...(hands ?? {}) }, discard_pile: [], removed_pile: [],
    draw_deck_count: 10, is_terminal: false, terminal_utility: 0,
    decision_context: {
      decision_player: "USSR", decision_type: dt ?? 1, pending_op_card: 0, pending_ops_value: 0, remaining_steps: remaining ?? 0,
      max_per_country: 0, allow_early_stop: false, resolving_card: resolving ?? 0, stack_depth: 0,
    },
    legal_actions: { decision_type: 1, decision_player: "USSR", valid_ids: [], allow_early_stop: false },
    ...rest,
  } as GameState;
}

describe("classifyEnding", () => {
  const before = st({ victory_points: 5 });
  it("names the special endings by their flags", () => {
    expect(classifyEnding(before, st({ is_terminal: true }), st({ is_terminal: true, victory_points: 20, flags: ["CMC_SUICIDE_LOSS"] }), "DEFCON 1 (own decision)").reason).toBe("cmc-suicide");
    expect(classifyEnding(before, st({ is_terminal: true }), st({ is_terminal: true, defcon: 1, victory_points: -20 }), "DEFCON 1 (own decision)"))
      .toMatchObject({ reason: "defcon", winner: "USSR", vpBefore: 5 });
    expect(classifyEnding(before, st({ is_terminal: true }), st({ is_terminal: true, victory_points: 20, flags: ["EUROPE_CONTROL_WIN"] }), "Europe Control").reason).toBe("europe-control");
  });

  it("finds a scoring card held at the end of the turn (reported as 20 VP / wargames)", () => {
    const settled = st({ victory_points: 3, turn: 4, action_round: 8 });
    const held = classifyEnding(before, settled, st({ is_terminal: true, victory_points: -20, turn: 4, hands: { US: [37, 50] } }), "20 VP");
    expect(held).toMatchObject({ reason: "held-scoring", winner: "USSR", cards: [37], vpBefore: 3 });
    const both = classifyEnding(before, settled, st({ is_terminal: true, victory_points: 0, turn: 4, hands: { US: [1], USSR: [81] } }), "wargames");
    expect(both).toMatchObject({ reason: "held-scoring-both", winner: "DRAW" });
  });

  it("tells the military-operations penalty from a held card", () => {
    // VP 18, DEFCON 3, the USSR short by 3 Military Operations: +3 to the US ends the game first.
    const settled = st({ victory_points: 18, defcon: 3, mil_ops: { US: 3, USSR: 0 } });
    const e = classifyEnding(before, settled, st({ is_terminal: true, victory_points: 20, hands: { US: [2] } }), "20 VP");
    expect(e.reason).toBe("milops-vp20");
    expect(e.winner).toBe("US");
  });

  it("treats the Eagle/Bear discard as the turn's cleanup", () => {
    const b = st({ resolving: 250, victory_points: -4 });
    const e = classifyEnding(b, st({ is_terminal: true, victory_points: 20 }), st({ is_terminal: true, victory_points: 20, hands: { USSR: [3] } }), "20 VP");
    expect(e).toMatchObject({ reason: "held-scoring", winner: "US", vpBefore: -4 });
  });

  it("keeps 20 VP mid-play, Wargames and final scoring", () => {
    // Terminal at the settled state: the game ended in play, whatever anyone holds.
    expect(classifyEnding(before, st({ is_terminal: true, victory_points: 20 }), st({ is_terminal: true, victory_points: 20, hands: { USSR: [1] } }), "20 VP").reason).toBe("vp20");
    expect(classifyEnding(before, st({ is_terminal: true, victory_points: -9 }), st({ is_terminal: true, victory_points: -9 }), "wargames").reason).toBe("wargames");
    const final = classifyEnding(st({ turn: 10 }), st({ turn: 10, action_round: 8 }), st({ is_terminal: true, turn: 11, victory_points: 20 }), "20 VP");
    expect(final).toMatchObject({ reason: "final-scoring", winner: "US", turn: 10 });
  });
});

describe("action rounds", () => {
  it("counts 6 / 7 / 8 action rounds", () => {
    expect(maxActionRound(st({ turn: 2 }), "US")).toBe(6);
    expect(maxActionRound(st({ turn: 5 }), "USSR")).toBe(7);
    expect(maxActionRound(st({ turn: 5, flags: ["NORTH_SEA_OIL_ACTIVE"] }), "US")).toBe(8);
    expect(maxActionRound(st({ turn: 5, flags: ["NORTH_SEA_OIL_ACTIVE"] }), "USSR")).toBe(7);
    expect(maxActionRound(st({ turn: 5, space: { US: 2, USSR: 8 } }), "USSR")).toBe(8);
    expect(maxActionRound(st({ turn: 3, space: { US: 2, USSR: 8 } }), "USSR")).toBe(6);
  });

  it("counts the plays left including the one being chosen", () => {
    expect(playsLeft(st({ turn: 2, action_round: 1, phasing_player: "USSR" }), "USSR")).toBe(6);
    expect(playsLeft(st({ turn: 2, action_round: 1, phasing_player: "US" }), "US")).toBe(6);
    expect(playsLeft(st({ turn: 2, action_round: 1, phasing_player: "US" }), "USSR")).toBe(5);
    expect(playsLeft(st({ turn: 5, action_round: 7, phasing_player: "US" }), "US")).toBe(1);
    expect(playsLeft(st({ turn: 5, current_phase_name: "HEADLINE" }), "US")).toBe(7);
  });

  it("warns when a choice strands a scoring card (rule 9.5 for the China Card)", () => {
    const d = st({ turn: 2, action_round: 6, phasing_player: "USSR", hands: { USSR: [1, 40] } });
    expect(strandsScoring(d, "USSR", 6).stranded).toBe(true);   // China Card: Asia Scoring left, no play left
    expect(strandsScoring(d, "USSR", 40).stranded).toBe(true);
    expect(strandsScoring(d, "USSR", 1).stranded).toBe(false);  // playing the scoring card itself
    const early = st({ turn: 2, action_round: 4, phasing_player: "USSR", hands: { USSR: [1, 40] } });
    expect(strandsScoring(early, "USSR", 40).stranded).toBe(false);
    const hl = st({ turn: 2, current_phase_name: "HEADLINE", hands: { US: [1, 2, 3, 37, 38, 79, 81, 40] } });
    expect(strandsScoring(hl, "US", 40)).toMatchObject({ stranded: true, scoring: 7, plays: 6 });
  });
});

describe("forcedEventTarget", () => {
  const mask = (...idx: number[]) => { const m = new Uint8Array(304); for (const i of idx) m[i] = 1; return m; };
  it("Muslim Revolution takes the first country in the engine's order when every target must go", () => {
    const d = st({ dt: 5, resolving: 56, remaining: 2 });
    // Iran (25) and Egypt (29) both hold US influence: both must be cleared, Iran first.
    expect(forcedEventTarget(d, mask(116 + 29, 116 + 25), null)).toBe(116 + 25);
    expect(forcedEventTarget(st({ dt: 5, resolving: 56, remaining: 1 }), mask(116 + 29, 116 + 25), null)).toBe(-1);
    expect(forcedEventTarget(d, mask(208), null)).toBe(208);
  });

  it("East European Unrest and other cards", () => {
    expect(forcedEventTarget(st({ dt: 5, resolving: 29, remaining: 3 }), mask(116 + 12, 116 + 4), null)).toBe(116 + 4);
    expect(forcedEventTarget(st({ dt: 5, resolving: 7, remaining: 3 }), mask(116 + 12, 116 + 4), null)).toBe(-1);
    expect(forcedEventTarget(st({ dt: 1, resolving: 56, remaining: 3 }), mask(116 + 12), null)).toBe(-1);
  });

  it("Suez Crisis counts what is left of each country's 2", () => {
    const country = (id: number, name: string, us: number) => ({ [name]: { id, name, stability: 3, battleground: true, region: 0, us_influence: us, ussr_influence: 0, controlled_by: "NONE" as const } });
    const at = (uk: number, fr: number, il: number, remaining: number) =>
      st({ dt: 5, resolving: 28, remaining, countries: { ...country(1, "United Kingdom", uk), ...country(8, "France", fr), ...country(23, "Israel", il) } });
    const start = at(5, 1, 1, 4);
    const snap = suezSnapshot(start);
    // UK can lose 2, France 1, Israel 1 = 4 = remaining: forced, UK first.
    expect(forcedEventTarget(start, mask(117, 124, 139), snap)).toBe(117);
    // After two UK removals the UK is spent: France next.
    expect(forcedEventTarget(at(3, 1, 1, 2), mask(117, 124, 139), snap)).toBe(124);
    // More capacity than removals: a real choice.
    expect(forcedEventTarget(at(5, 2, 1, 4), mask(117, 124, 139), suezSnapshot(at(5, 2, 1, 4)))).toBe(-1);
    expect(forcedEventTarget(start, mask(117), null)).toBe(-1);
  });
});
