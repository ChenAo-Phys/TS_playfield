/**
 * What a click on a map target does, for the ghost marker and the tooltip (ui-spec §8.5, gap G3).
 * The controller's `Prompt.effect` is the answer; the table below by resolving card is only the
 * fallback for an older controller (or `previews: false`), with "target" (no ghost) as the default.
 */
import type { Prompt, Side } from "../../game/contract";
import type { MapTargets } from "../ui-contract";
import { PLACEMENT_KINDS } from "./policy";

export type EventEffect = NonNullable<Prompt["effect"]>;

/** Fallback by `resolvingCard`: add / remove the decider's ("self") or the opponent's influence, or a die roll. */
type Rel = { verb: "add" | "remove"; whose: "self" | "opponent" } | { verb: "target" };
export const EVENT_VERBS: Readonly<Record<number, Rel>> = {
  7: { verb: "remove", whose: "opponent" }, //   Socialist Governments
  14: { verb: "add", whose: "self" }, //         COMECON
  19: { verb: "remove", whose: "opponent" }, //  Truman Doctrine
  22: { verb: "target" }, //                     Independent Reds
  23: { verb: "add", whose: "self" }, //         Marshall Plan
  24: { verb: "target" }, //                     Indo-Pakistani War
  28: { verb: "remove", whose: "opponent" }, //  Suez Crisis
  29: { verb: "remove", whose: "opponent" }, //  East European Unrest
  30: { verb: "add", whose: "self" }, //         Decolonization
  36: { verb: "target" }, //                     Brush War
  40: { verb: "remove", whose: "self" }, //      Cuban Missile Crisis payoff
  47: { verb: "add", whose: "self" }, //         Junta
  53: { verb: "add", whose: "self" }, //         South African Unrest
  56: { verb: "remove", whose: "opponent" }, //  Muslim Revolution
  63: { verb: "add", whose: "self" }, //         Colonial Rear Guards
  66: { verb: "add", whose: "self" }, //         Puppet Governments
  70: { verb: "add", whose: "self" }, //         OAS Founded
  74: { verb: "remove", whose: "opponent" }, //  The Voice of America
  75: { verb: "add", whose: "self" }, //         Liberation Theology
  76: { verb: "add", whose: "self" }, //         Ussuri River Skirmish
  87: { verb: "add", whose: "self" }, //         The Reformer
  88: { verb: "remove", whose: "opponent" }, //  Marine Barracks Bombing
  91: { verb: "target" }, //                     Ortega Elected in Nicaragua (coup)
  95: { verb: "add", whose: "self" }, //         Latin American Debt Crisis (doubling)
  99: { verb: "remove", whose: "opponent" }, //  Pershing II Deployed
  102: { verb: "target" }, //                    Iran-Iraq War
  104: { verb: "add", whose: "self" }, //        The Cambridge Five
  105: { verb: "add", whose: "self" }, //        Special Relationship
  106: { verb: "add", whose: "self" }, //        NORAD
  107: { verb: "target" }, //                    Che (coup)
};

/** Per-title variants of two-step events (Warsaw Pact, De-Stalinization). */
const TITLE_VERBS: Readonly<Record<string, Rel>> = {
  "prompt:card.16.targetRemove": { verb: "remove", whose: "opponent" },
  "prompt:card.16.targetAdd": { verb: "add", whose: "self" },
  "prompt:card.33.targetRemove": { verb: "remove", whose: "self" },
  "prompt:card.33.targetAdd": { verb: "add", whose: "self" },
};

const other = (s: Side): Side => (s === "US" ? "USSR" : "US");

/** The event-target effect: the controller's `Prompt.effect`, else the fallback table (null = unknown). */
export function effectOf(prompt: Prompt, decider: Side): EventEffect | null {
  if (prompt.kind !== "event-target") return null;
  if (prompt.effect) return prompt.effect;
  const rel = TITLE_VERBS[prompt.title.key] ?? EVENT_VERBS[prompt.resolvingCard];
  if (!rel) return null;
  if (rel.verb === "target") return { verb: "target", side: decider };
  return { verb: rel.verb, side: rel.whose === "self" ? decider : other(decider) };
}

/** What a click does on the map (`MapTargets.verb`). */
export function verbFor(prompt: Prompt, decider: Side = "US"): MapTargets["verb"] {
  if (PLACEMENT_KINDS.has(prompt.kind)) return "add";
  if (prompt.kind === "coup-target") return "coup";
  if (prompt.kind === "realign-target") return "realign";
  if (prompt.kind === "event-target") return effectOf(prompt, decider)?.verb ?? "target";
  return "target";
}

/**
 * Removal events that take more than one point per click (display only, for the tooltip's
 * "US 2 → 0"): all of it (Warsaw Pact's removal, Truman Doctrine, Muslim Revolution) or 2 (the Cuban
 * Missile Crisis payoff). Every other removal takes one point per click.
 */
const REMOVE_ALL: ReadonlySet<string> = new Set(["prompt:card.16.targetRemove", "prompt:card.19.target", "prompt:card.56.target"]);
const REMOVE_TWO: ReadonlySet<number> = new Set([40]);

/** How much a removal click takes from a country holding `from` (display only). */
export function removeAmount(prompt: Prompt, from: number): number {
  if (REMOVE_ALL.has(prompt.title.key)) return from;
  if (REMOVE_TWO.has(prompt.resolvingCard)) return Math.min(2, from);
  return Math.min(1, from);
}

/** Whose slot the ghost marker uses (the map's `ghostSide` extension); undefined = the map's default. */
export function ghostSideFor(prompt: Prompt, decider: Side): Side | undefined {
  if (PLACEMENT_KINDS.has(prompt.kind)) return decider;
  const e = effectOf(prompt, decider);
  return e && e.verb !== "target" ? e.side : undefined;
}
