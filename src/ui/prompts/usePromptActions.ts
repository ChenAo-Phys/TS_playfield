/**
 * What every prompt surface calls (ui-spec §8.2): the map, the hand and the China slot, the slip, the
 * play-mode stage, the dossiers and the target list. Each activation applies the option's commit policy
 * (policy.ts): instant options call `controller.choose(promptId, idx)` at once; stage / hold options
 * are selected first, and the second activation of the same thing (stage), Enter or the slip's primary
 * commits. Activations are ignored while a frame animates (`Shown.busy`), as the spec asks, with one
 * exception: a map activation during your own placement's animation (a quick second tap that lands in the
 * ~250 ms control-flip beat) is queued and applied to the next prompt if that prompt continues the run and
 * offers the same country; otherwise it is dropped silently (`PromptStore.queue`).
 */
import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Prompt, PromptOption, PublicState, Side } from "../../game/contract";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { OptionPolicy, RegionSlot } from "../ui-contract";
import { cost2Targets } from "./costHint";
import { policyFor, severityOf, type PolicyContext } from "./policy";
import type { StagedKind } from "./store";
import { useStaging, usePromptStore, type StagedSelection } from "./useStaging";

export interface PromptActions {
  /** The open prompt (null while none is open). */
  prompt: Prompt | null;
  staged: StagedSelection | null;
  /** False while a frame animates or no prompt is open. */
  interactive: boolean;
  policyOf(option: PromptOption): OptionPolicy;
  /** The staged option itself (null when nothing is staged). */
  stagedOption(): PromptOption | null;
  activateCountry(id: number): void;
  activateCard(id: number): void;
  activateRegion(slot: RegionSlot): void;
  /** A mode, op-mode, branch, DEFCON level, region, un-intervention or done option, by flat index. */
  activateOption(idx: number): void;
  /** The prompt's CONFIRM_DONE (pass / stop / decline / return / skip), with its policy. */
  done(): void;
  undo(): void;
  /** Commit the staged selection (Enter, the slip's primary). Hold options need the hold: false. */
  confirm(): boolean;
  /** Drop the staged selection (Esc); false when nothing was staged. */
  cancel(): boolean;
  /** Choose an option now, whatever its policy (a completed hold). */
  commit(idx: number): void;
  hoverCountry(id: number | null): void;
  hoverRegion(slot: RegionSlot | null): void;
  /**
   * Apply the queued map activation (a quick second tap during your own placement's animation) if it is for
   * the open, interactive prompt; true when one was applied. Every mounted surface calls it after rendering.
   */
  flushQueued(): boolean;
}

/** How a staged option is identified: countries, cards and regions by id, the rest by flat index. */
export function stagedKey(option: PromptOption): { kind: StagedKind; id: number } {
  switch (option.kind) {
    case "country": return { kind: "country", id: option.id };
    case "card": return { kind: "card", id: option.id };
    case "region": return { kind: "region", id: option.id };
    default: return { kind: "option", id: option.idx };
  }
}

/** The policy context of a prompt in a state. */
export function policyContext(prompt: Prompt | null, state: PublicState | null, confirmFinal: boolean, humanSide?: Side): PolicyContext {
  return { settings: { confirmFinal }, cost2: cost2Targets(prompt, state), humanSide };
}

export function usePromptActions(): PromptActions {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const store = usePromptStore();
  const vm = root.vm;
  const prompt = vm.prompt;
  const busy = !!shown?.busy;
  const state = shown?.state ?? vm.frame?.state ?? null;
  const humanSide = vm.humanSide ?? undefined;
  const ctx = useMemo(
    () => policyContext(prompt, state, root.settings.confirmFinal, humanSide),
    [prompt, state, root.settings.confirmFinal, humanSide],
  );
  const staging = useStaging(prompt);
  const staged = staging.staged;
  const interactive = !!prompt && !busy;
  const queuedFor = () => store.get().queued?.to ?? null;
  const queuedTo = useSyncExternalStore(store.subscribe, queuedFor, queuedFor);

  const commit = (idx: number) => {
    if (!prompt || busy) return;
    const option = prompt.options.find(o => o.idx === idx);
    if (!option) return;
    // A realignment keeps its country staged across the roll (the store carries it to the next prompt).
    if (!(prompt.kind === "realign-target" && option.kind === "country")) store.clear();
    root.controller.choose(prompt.promptId, idx);
  };

  const activate = (option: PromptOption | undefined) => {
    if (!option || !prompt || busy) return;
    const pol = policyFor(prompt, option, ctx);
    if (pol.commit === "instant") {
      commit(option.idx);
      return;
    }
    const key = stagedKey(option);
    if (staged && staged.kind === key.kind && staged.id === key.id) {
      if (pol.commit === "stage") commit(option.idx);
      else store.touch(); // hold: only the hold button commits
      return;
    }
    staging.stage(key.kind, key.id, option.idx);
  };

  const find = (pred: (o: PromptOption) => boolean) => prompt?.options.find(pred);

  /** Your own placement is animating (no AI move in between): a tap now may be meant for the next point. */
  const ownFrame = (busy && shown?.actor === humanSide)
    || (!prompt && !busy && vm.frame?.actor === humanSide && !vm.aiThinking && vm.status === "playing");
  const activateCountry = (id: number) => {
    if (prompt && !busy) {
      activate(find(o => o.kind === "country" && o.id === id));
      return;
    }
    if (ownFrame && humanSide) store.queue(prompt ?? store.get().lastPrompt, id);
  };

  // The queued tap, once the prompt it applies to is open and interactive: exactly what a tap now would do.
  // Every mounted surface runs this; `takeQueued` hands the tap to the first one only.
  const flushQueued = (): boolean => {
    if (!interactive || !prompt || queuedTo !== prompt.promptId) return false;
    const q = store.takeQueued(prompt);
    if (!q) return false;
    activate(find(o => o.kind === "country" && o.id === q.id));
    return true;
  };
  useEffect(() => { flushQueued(); });

  return {
    prompt,
    staged,
    interactive,
    policyOf: option => (prompt ? policyFor(prompt, option, ctx) : { option, commit: "instant", severity: severityOf(option.warnings, humanSide) }),
    stagedOption: () => (staged ? find(o => o.idx === staged.idx) ?? null : null),
    activateCountry,
    activateCard: id => activate(find(o => o.kind === "card" && o.id === id)),
    activateRegion: slot => activate(find(o => o.kind === "region" && o.id === slot)),
    activateOption: idx => activate(find(o => o.idx === idx)),
    done: () => activate(prompt?.done ?? find(o => o.kind === "done")),
    undo: () => {
      if (!vm.canUndo || busy || !prompt) return;
      store.clear();
      root.controller.undo();
    },
    confirm: () => {
      if (!staged || !prompt || busy) return false;
      const option = find(o => o.idx === staged.idx);
      if (!option) return false;
      if (policyFor(prompt, option, ctx).commit === "hold") return false;
      commit(option.idx);
      return true;
    },
    cancel: () => store.clear(),
    commit,
    hoverCountry: id => store.setHover(id),
    hoverRegion: slot => store.setHoverRegion(slot),
    flushQueued,
  };
}
