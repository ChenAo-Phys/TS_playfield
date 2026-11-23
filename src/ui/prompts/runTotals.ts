/**
 * Decision runs (ui-spec §8.1 big counter, §8.6 cap tags and picker counters). A run is the series of
 * consecutive prompts of one decision (a card's influence points, a realignment's rolls, an event's
 * placements, a repeating card picker). The slip's counter shows `remaining / total`, where the total
 * is the `remaining` seen at the run's first prompt.
 *
 * Pure: `nextRun(prev, prompt, state)` is fed every prompt (the prompt store does it as the
 * controller publishes them) and keeps a snapshot of the board at the run's start, so per-country
 * placements (cap tags) and card picks are differences of the state, which survives forced
 * (auto-played) points and undo.
 */
import { useSyncExternalStore } from "react";
import type { Prompt, PublicState, Side } from "../../game/contract";
import { useUiRoot } from "../state/context";
import { promptStore } from "./store";

export interface RunState {
  key: string;
  /** promptId of the latest prompt seen in this run. */
  promptId: number;
  /** `remaining` at the run's first prompt. */
  total: number;
  /** `remaining` at the latest prompt. */
  remaining: number;
  /** Influence per country id at the run's start. */
  start: Readonly<Record<number, { us: number; ussr: number }>>;
  /** Card id → location at the run's start, for the cards offered by its first prompt. */
  cards: Readonly<Record<number, string>>;
}

/** Prompts of the same decision share this key. */
export function runKey(p: Prompt): string {
  return `${p.kind}|${p.decisionType}|${p.pendingCard}|${p.resolvingCard}|${p.maxPerCountry}`;
}

function snapshot(state: PublicState | null): Record<number, { us: number; ussr: number }> {
  const out: Record<number, { us: number; ussr: number }> = {};
  if (!state) return out;
  for (const c of Object.values(state.countries)) out[c.id] = { us: c.us_influence, ussr: c.ussr_influence };
  return out;
}

function cardLocations(prompt: Prompt, state: PublicState | null): Record<number, string> {
  const out: Record<number, string> = {};
  const locs = state?.card_locations ?? {};
  for (const id of prompt.cards) out[id] = locs[String(id)] ?? "";
  return out;
}

/**
 * The run after `prompt`. A null prompt (frames animating between two prompts) keeps the run. The
 * run continues while prompts keep the key and `remaining` falls (card pickers: while the key holds);
 * anything else (another decision, an undo back to a run's start) starts a new one.
 */
export function nextRun(prev: RunState | null, prompt: Prompt | null, state: PublicState | null): RunState | null {
  if (!prompt) return prev;
  if (prev && prev.promptId === prompt.promptId) return prev;
  const key = runKey(prompt);
  const continues = !!prev && prev.key === key && (prompt.kind === "event-card" || prompt.remaining < prev.remaining);
  if (continues && prev) return { ...prev, promptId: prompt.promptId, remaining: prompt.remaining };
  return {
    key, promptId: prompt.promptId, total: prompt.remaining, remaining: prompt.remaining,
    start: snapshot(state), cards: cardLocations(prompt, state),
  };
}

/** The counter's total for `prompt` (its own `remaining` when the run is unknown). */
export function runTotalOf(run: RunState | null, prompt: Prompt): number {
  // Ops runs also know their size from the prompt (a run first seen mid-way, e.g. after a reload).
  const ops = prompt.kind === "influence" || prompt.kind === "realign-target" ? prompt.opsValue : 0;
  if (run && run.key === runKey(prompt) && run.promptId === prompt.promptId) return Math.max(run.total, prompt.remaining, ops);
  return Math.max(prompt.remaining, ops);
}

/** How much `side`'s influence moved per country since the run began (cap tags: "1/2"). */
export function runPlaced(run: RunState | null, state: PublicState | null, side: Side): Record<number, number> {
  const out: Record<number, number> = {};
  if (!run || !state) return out;
  for (const c of Object.values(state.countries)) {
    const s = run.start[c.id];
    if (!s) continue;
    const d = Math.abs((side === "US" ? c.us_influence - s.us : c.ussr_influence - s.ussr));
    if (d > 0) out[c.id] = d;
  }
  return out;
}

/** Cards offered at the run's start that have moved since (repeating pickers: "Discarded 2"). */
export function runCardPicks(run: RunState | null, state: PublicState | null): number {
  if (!run || !state?.card_locations) return 0;
  let n = 0;
  for (const [id, loc] of Object.entries(run.cards)) if ((state.card_locations[id] ?? "") !== loc) n++;
  return n;
}

/** The current run (re-renders when it changes). */
export function useRun(): RunState | null {
  const root = useUiRoot();
  const store = promptStore(root.controller);
  return useSyncExternalStore(store.subscribe, () => store.get().run, () => store.get().run);
}

/** The big counter's total for `prompt` (ui-spec §8.1). */
export function useRunTotal(prompt: Prompt | null): number {
  const run = useRun();
  return prompt ? runTotalOf(run, prompt) : 0;
}
