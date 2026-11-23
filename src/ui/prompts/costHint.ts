/**
 * Display-only influence facts the controller does not spell out (ui-spec §8.5, §8.12, gap G1). The
 * controller's `PromptOption.cost` (how much `remaining` drops) is used where present; the "2 Ops"
 * map tag means *opponent control*, so it is derived from control, never from `cost >= 2` alone
 * (a point outside Asia also forfeits the China Card bonus, and a run's last point costs all of
 * `remaining`). Nothing here decides legality: the targets are `prompt.countries`.
 */
import { COUNTRIES } from "../../data";
import type { Prompt, PromptOption, PublicState, Side } from "../../game/contract";
import { PLACEMENT_KINDS } from "./policy";

export interface CountryFacts {
  id: number;
  us: number;
  ussr: number;
  ctrl: Side | "NONE";
  stability: number;
  battleground: boolean;
}

const other = (s: Side): Side => (s === "US" ? "USSR" : "US");

/** A country's influence and control in the (redacted) state; zeros for an unknown id. */
export function countryFacts(state: PublicState | null, id: number): CountryFacts {
  const info = COUNTRIES[id];
  const base = { id, us: 0, ussr: 0, ctrl: "NONE" as Side | "NONE", stability: info?.stability ?? 0, battleground: !!info?.battleground };
  if (!state) return base;
  for (const c of Object.values(state.countries)) {
    if (c.id === id) return { ...base, us: c.us_influence, ussr: c.ussr_influence, ctrl: c.controlled_by, stability: c.stability || base.stability };
  }
  return base;
}

/** The side deciding the prompt (the human), from the state's decision context. */
export function deciderOf(state: PublicState | null, fallback?: Side): Side {
  const p = state?.decision_context?.decision_player;
  if (p === "US" || p === "USSR") return p;
  return fallback ?? state?.humanSide ?? "US";
}

/**
 * Influence-type prompts (setup, bid, Ops influence): the targets the decider's opponent controls,
 * where a point costs 2 Ops (the "2 Ops" tag). Empty for every other kind.
 */
export function cost2Targets(prompt: Prompt | null, state: PublicState | null): Set<number> {
  const out = new Set<number>();
  if (!prompt || !state || !PLACEMENT_KINDS.has(prompt.kind)) return out;
  const opp = other(deciderOf(state));
  const ids = new Set(prompt.countries);
  for (const c of Object.values(state.countries)) if (ids.has(c.id) && c.controlled_by === opp) out.add(c.id);
  return out;
}

/** How many Ops a point in `option`'s country spends: the option's `cost` capped at what is left, else 1 or 2. */
export function pointCost(prompt: Prompt, option: PromptOption, cost2: ReadonlySet<number>): number {
  const raw = option.cost ?? (cost2.has(option.id) ? 2 : 1);
  return Math.max(1, Math.min(raw, Math.max(1, prompt.remaining)));
}

/** Who would control the country if `side` had `delta` more (or less) influence there (display only). */
export function controlAfter(f: CountryFacts, side: Side, delta: number): Side | "NONE" {
  const us = Math.max(0, f.us + (side === "US" ? delta : 0));
  const ussr = Math.max(0, f.ussr + (side === "USSR" ? delta : 0));
  if (f.stability > 0 && us >= f.stability && us - ussr >= f.stability) return "US";
  if (f.stability > 0 && ussr >= f.stability && ussr - us >= f.stability) return "USSR";
  return "NONE";
}

/** True when +1 for `side` would flip the country to `side`'s control (the tooltip's "→ control"). */
export function wouldTakeControl(f: CountryFacts, side: Side, delta = 1): boolean {
  return f.ctrl !== side && controlAfter(f, side, delta) === side;
}

/** Countries next to `id` controlled by each side, and the superpower it touches (realignment facts). */
export function realignFacts(state: PublicState | null, id: number): { us: number; ussr: number; superpower: Side | null } {
  const info = COUNTRIES[id];
  let us = 0, ussr = 0;
  for (const n of info?.neighbours ?? []) {
    const c = countryFacts(state, n).ctrl;
    if (c === "US") us++;
    else if (c === "USSR") ussr++;
  }
  return { us, ussr, superpower: info?.superpowerAdjacent ?? null };
}
