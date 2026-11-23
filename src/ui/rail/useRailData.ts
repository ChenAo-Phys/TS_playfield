/**
 * What every rail section reads (ui-spec §6, §9.5): the shown state, the sides, the adversary's status
 * (THINKING while `vm.aiThinking`, PLAYING while the AI's frames animate, else WAITING), the log and the
 * play in progress (for the Dispatches' brass wash).
 */
import { useMemo } from "react";
import type { LogEntry, PublicState, Side } from "../../game/contract";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { AdversaryStatus } from "./AdversaryDossier";

export interface RailData {
  state: PublicState | null;
  humanSide: Side;
  aiSide: Side;
  status: AdversaryStatus;
  log: readonly LogEntry[];
  /** The turn and AR whose play is in progress, or null. */
  current: { turn: number; ar: number } | null;
}

const CARD_CHOICES = new Set(["action-card", "headline"]);

export function useRailData(): RailData {
  const root = useUiRoot();
  const shown = useShown();
  const vm = root.vm;
  const state = shown.state;
  const humanSide: Side = vm.humanSide ?? state?.humanSide ?? "US";
  const aiSide: Side = humanSide === "US" ? "USSR" : "US";
  const status: AdversaryStatus = vm.aiThinking ? "thinking" : shown.busy && shown.actor === aiSide ? "playing" : "waiting";
  const inPlay = !!state && state.current_phase_name === "ACTION_ROUND" && state.action_round > 0
    && (shown.busy || vm.aiThinking || (!!vm.prompt && !CARD_CHOICES.has(vm.prompt.kind)));
  const turn = state?.turn ?? 0;
  const ar = state?.action_round ?? 0;
  const current = useMemo(() => (inPlay ? { turn, ar } : null), [inPlay, turn, ar]);
  return { state, humanSide, aiSide, status, log: vm.log, current };
}
