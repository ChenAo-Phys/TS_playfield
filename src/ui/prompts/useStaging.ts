/**
 * The staged selection of the open prompt (ui-spec §8.2): `staged` is the selection made by a first
 * activation of a "stage" (or "hold") option, until it is committed, cancelled (Esc), replaced, timed
 * out (6 s without activity) or the prompt changes. Shared by every caller (one store per controller).
 */
import { useSyncExternalStore } from "react";
import type { Prompt } from "../../game/contract";
import { useUiRoot } from "../state/context";
import { promptStore, type PromptStore, type Staged, type StagedKind } from "./store";

export interface StagedSelection {
  kind: StagedKind;
  id: number;
  idx: number;
}

export interface Staging {
  staged: StagedSelection | null;
  stage(kind: StagedKind, id: number, idx: number): void;
  clear(): boolean;
  /** Restart the 6 s timeout (activity on the selection). */
  touch(): void;
}

/** The selection only counts for the prompt it was made on. */
export function stagedFor(staged: Staged | null, prompt: Prompt | null): StagedSelection | null {
  if (!staged || !prompt || staged.promptId !== prompt.promptId) return null;
  return { kind: staged.kind, id: staged.id, idx: staged.idx };
}

/** The prompt store of the current UiRoot's controller. */
export function usePromptStore(): PromptStore {
  return promptStore(useUiRoot().controller);
}

export function useStaging(prompt: Prompt | null): Staging {
  const store = usePromptStore();
  const raw = useSyncExternalStore(store.subscribe, () => store.get().staged, () => store.get().staged);
  const staged = stagedFor(raw, prompt);
  return {
    staged,
    stage: (kind, id, idx) => { if (prompt) store.stage({ kind, id, idx, promptId: prompt.promptId }); },
    clear: () => store.clear(),
    touch: () => store.touch(),
  };
}

/** A field of the prompt store (re-renders when it changes). */
export function usePromptUi<K extends "hover" | "hoverRegion" | "listOpen" | "lastPrompt" | "listActive" | "aiSince" | "focusCard">(key: K): ReturnType<PromptStore["get"]>[K] {
  const store = usePromptStore();
  return useSyncExternalStore(store.subscribe, () => store.get()[key], () => store.get()[key]);
}
