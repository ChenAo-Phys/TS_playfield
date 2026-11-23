/**
 * The map's targets for a map prompt (ui-spec §8.5): `ids` = `prompt.countries`, the ring tone, the
 * hazard set (options that may lose the game), the "2 Ops" set (opponent control, display only), the
 * click's verb and ghost side, and the per-country cap tags of capped event placements.
 *
 * `usePromptTargets` also freezes the last targets while your own click animates (§8.5.4): the rings
 * stay as they were until the next prompt arrives, so nothing flashes between two points.
 */
import { useContext, useMemo, useRef } from "react";
import type { Prompt, PublicState, Side } from "../../game/contract";
import type { MapTargets } from "../map/contract";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { cost2Targets, deciderOf } from "./costHint";
import { effectOf, ghostSideFor, verbFor } from "./eventVerbs";
import { isDanger, MAP_KINDS } from "./policy";
import { runPlaced, useRun, type RunState } from "./runTotals";

/** At most this many targets get the loud (marching) ring. */
export const LOUD_MAX = 12;

/** Targets for `prompt` in `state` (null for prompts not answered on the map). Pure. */
export function promptTargets(prompt: Prompt | null, state: PublicState | null, humanSide: Side, run: RunState | null = null): MapTargets | null {
  if (!prompt || !MAP_KINDS.has(prompt.kind)) return null;
  const decider = deciderOf(state, humanSide);
  const ids = new Set(prompt.countries);
  const danger = new Set<number>();
  for (const o of prompt.options) {
    if (o.kind === "country" && (o.warnings ?? []).some(w => isDanger(w, humanSide))) danger.add(o.id);
  }
  const targets: MapTargets = {
    ids,
    tone: ids.size <= LOUD_MAX ? "loud" : "quiet",
    danger,
    cost2: cost2Targets(prompt, state),
    verb: verbFor(prompt, decider),
  };
  const ghost = ghostSideFor(prompt, decider);
  if (ghost) targets.ghostSide = ghost;
  if (prompt.maxPerCountry > 0 && prompt.kind === "event-target") {
    const effect = effectOf(prompt, decider);
    const side = effect && effect.verb !== "target" ? effect.side : decider;
    targets.cap = { max: prompt.maxPerCountry, placed: runPlaced(run, state, side) };
  }
  return targets;
}

/**
 * The map targets of the open prompt. While no prompt is open and the frame on screen is your own
 * click animating (the AI is not thinking yet), the previous targets stay.
 */
export function usePromptTargets(prompt: Prompt | null, state: PublicState | null): MapTargets | null {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const run = useRun();
  const vm = root.vm;
  const humanSide: Side = vm.humanSide ?? state?.humanSide ?? "US";
  const live = useMemo(() => promptTargets(prompt, state, humanSide, run), [prompt, state, humanSide, run]);
  const last = useRef<MapTargets | null>(null);
  if (prompt) {
    last.current = live;
    return live;
  }
  const ownFrame = (shown?.busy && shown.actor === humanSide) || (vm.frame?.actor === humanSide && !vm.aiThinking && vm.status === "playing");
  if (ownFrame && last.current) return last.current;
  last.current = null;
  return null;
}
