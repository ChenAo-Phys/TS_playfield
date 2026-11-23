/**
 * Sample board states for the map demo (dev only). Ids are engine country ids
 * (docs/notes/countries.json); influence patterns are plausible mid-game positions.
 */
import { COUNTRIES } from "../../../data";
import type { RegionScore, RegionScores, RegionalStatus } from "../../../engine/types";
import type { PublicState, Side } from "../../../game/contract";
import type { MapTargets, RegionSlot } from "../contract";

type Inf = Record<number, [number, number]>;

/** Turn 5, mid war (the mockup's position): [US, USSR] influence by country id. */
export const MIDGAME: Inf = {
  0: [2, 0], 1: [5, 0], 4: [1, 0], 5: [0, 1], 6: [1, 0], 7: [4, 1], 8: [3, 1], 10: [3, 1], 11: [2, 0], 12: [2, 0], 13: [0, 1],
  14: [0, 4], 15: [0, 4], 16: [0, 3], 17: [0, 3], 18: [0, 1], 19: [0, 3], 20: [0, 3],
  21: [0, 1], 22: [0, 2], 23: [4, 0], 24: [0, 3], 25: [2, 0], 26: [0, 1], 28: [1, 0], 29: [0, 2], 30: [0, 2],
  31: [0, 2], 32: [2, 0], 33: [1, 1], 36: [2, 0], 37: [0, 2], 39: [1, 0], 40: [1, 0], 41: [4, 0], 43: [0, 3], 44: [3, 0], 45: [4, 0],
  47: [0, 2], 53: [1, 0], 54: [0, 1], 57: [0, 2], 59: [2, 0], 63: [1, 0],
  64: [2, 0], 70: [1, 0], 71: [0, 3], 77: [1, 0], 81: [0, 1], 82: [1, 0],
};

/** The standard start after setup and the bid. */
export const OPENING: Inf = {
  0: [2, 0], 1: [5, 0], 7: [4, 0], 8: [1, 0], 10: [2, 0], 14: [0, 3], 15: [0, 4], 16: [0, 0], 18: [0, 1], 19: [0, 0],
  23: [1, 0], 24: [0, 1], 25: [1, 0], 22: [0, 1], 41: [4, 0], 43: [0, 3], 44: [1, 0], 45: [1, 0], 63: [1, 0], 70: [1, 0], 5: [0, 1],
};

function controlOf(us: number, ussr: number, stab: number): Side | "NONE" {
  if (us >= stab && us - ussr >= stab) return "US";
  if (ussr >= stab && ussr - us >= stab) return "USSR";
  return "NONE";
}

/** A PublicState with only what the map reads filled in (the rest is inert placeholder data). */
export function sampleState(inf: Inf, humanSide: Side): PublicState {
  const countries: PublicState["countries"] = {};
  for (const c of COUNTRIES) {
    const [us, ussr] = inf[c.id] ?? [0, 0];
    countries[c.engineName] = {
      id: c.id, name: c.engineName, stability: c.stability, battleground: c.battleground, region: c.region,
      us_influence: us, ussr_influence: ussr, controlled_by: controlOf(us, ussr, c.stability),
    };
  }
  const state = {
    victory_points: 2, defcon: 3, mil_ops: { US: 1, USSR: 2 }, space: { US: 2, USSR: 3 }, turn: 5, action_round: 3,
    phasing_player: humanSide, current_phase: 2, headline_us_card: 0, headline_ussr_card: 0, forced_card_player: "NONE",
    forced_card_id: 0, space_turns_used: { US: 0, USSR: 0 }, china_card: { holder: "USSR", playable: true }, flags: [],
    persistent_effects: 0, countries, hands: { US: [], USSR: [] }, discard_pile: [], removed_pile: [], draw_deck_count: 20,
    decision_context: { decision_player: humanSide, decision_type: 5, pending_op_card: 0 },
    legal_actions: {}, is_terminal: false, terminal_utility: 0,
    humanSide, aiHandCount: 5, aiKnownCards: [], aiHeadlineHidden: false,
  };
  return state as unknown as PublicState;
}

const side = (status: RegionalStatus | null, countries: number, bgs: number, adj: number, vp: number) => ({
  status, countries, battlegrounds: bgs, adjacent: adj, base_vp: null, vp, controlled: [],
});

/** Region scores in the shape the engine returns (slot 6 = Southeast Asia). */
export function sampleScores(): RegionScores {
  const r = (slot: number, net: number, us: ReturnType<typeof side>, ussr: ReturnType<typeof side>, wins: Side | null = null): RegionScore =>
    ({ slot, battlegrounds: 0, net, wins, us, ussr });
  return {
    regions: [
      r(0, 0, side("PRESENCE", 6, 2, 0, 3), side("PRESENCE", 8, 2, 1, 3)),
      r(1, 1, side("DOMINATION", 6, 3, 1, 8), side("PRESENCE", 4, 1, 1, 7)),
      r(2, -2, side("PRESENCE", 3, 2, 0, 5), side("DOMINATION", 5, 3, 0, 7)),
      r(3, -1, side("PRESENCE", 3, 0, 0, 1), side("PRESENCE", 3, 1, 0, 2)),
      r(4, 2, side("DOMINATION", 3, 1, 1, 5), side("PRESENCE", 1, 1, 0, 3)),
      r(5, 0, side("NONE", 1, 0, 0, 0), side("NONE", 0, 0, 0, 0)),
      r(6, 2, side(null, 2, 0, 0, 2), side(null, 0, 0, 0, 0)),
    ],
    ignored_flags: [],
  };
}

export function scoresWith(base: RegionScores, slot: RegionSlot, patch: Partial<RegionScore>): RegionScores {
  return { ...base, regions: base.regions.map(r => (r.slot === slot ? { ...r, ...patch } : r)) };
}

/** Influence targets for `decider`: countries with its influence and their neighbours (+ superpower adjacency). */
export function influenceTargets(inf: Inf, decider: Side): number[] {
  const has = (id: number) => (inf[id]?.[decider === "US" ? 0 : 1] ?? 0) > 0;
  return COUNTRIES.filter(c => has(c.id) || c.superpowerAdjacent === decider || c.neighbours.some(has)).map(c => c.id);
}

export function targetsOf(ids: readonly number[], o: Partial<Omit<MapTargets, "ids">> = {}): MapTargets {
  return {
    ids: new Set(ids),
    tone: ids.length > 12 ? "quiet" : "loud",
    danger: o.danger ?? new Set(),
    cost2: o.cost2 ?? new Set(),
    verb: o.verb ?? "add",
    cap: o.cap,
    ghostSide: o.ghostSide,
  };
}
