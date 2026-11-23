/**
 * `Shown` for every component (ui-spec §9.1, §15.1): what static UI draws (`state`, the last fully
 * animated frame's), `busy`, the reveal-dock card, pencil marks and delta pills, Skip.
 *
 *   <UiRootProvider controller={c}>
 *     <ShownProvider onCommit={() => map.current?.clearOverrides()}>…</ShownProvider>
 *   </UiRootProvider>
 *
 *   const shown = useShown();               // re-renders on change
 *   useOnCommit(frame => drop my overrides); // after each commit, before the ack
 *
 * `StaticShownProvider` (tests, stills) provides a fixed value without running anything.
 */
import { createContext, createElement, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { RegionScores } from "../../engine/types";
import type { Frame, PublicState } from "../../game/contract";
import { useUiRoot } from "../state/context";
import type { Shown } from "../ui-contract";
import type { FrameRunner } from "./frameRunner";
import { useFrameRunnerInstance } from "./useFrameRunner";

export const ShownContext = createContext<Shown | null>(null);
const RunnerContext = createContext<FrameRunner | null>(null);

export function ShownProvider(props: { children?: ReactNode; onCommit?: (frame: Frame) => void }) {
  const root = useUiRoot();
  const runner = useFrameRunnerInstance(root, { onCommit: props.onCommit });
  const shown = useSyncExternalStore(runner.subscribe, runner.getShown, runner.getShown);
  return createElement(RunnerContext.Provider, { value: runner }, createElement(ShownContext.Provider, { value: shown }, props.children));
}

export function useShown(): Shown {
  const s = useContext(ShownContext);
  if (!s) throw new Error("useShown() used outside <ShownProvider>");
  return s;
}

/** The runner (demo tools, advanced use); null under StaticShownProvider. */
export function useFrameRunnerHandle(): FrameRunner | null {
  return useContext(RunnerContext);
}

/** Call `fn` after every commit (Shown.state caught up: drop overrides), before the ack. */
export function useOnCommit(fn: (frame: Frame) => void): void {
  const runner = useContext(RunnerContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => runner?.onCommit(f => ref.current(f)), [runner]);
}

const noop = () => { /* static */ };

/** A fixed `Shown` (stills, markup tests): idle, nothing pinned, no marks unless given. */
export function staticShown(state: PublicState | null, regionScores: RegionScores | null, patch: Partial<Shown> = {}): Shown {
  return {
    state, regionScores, busy: false, actor: null, aiPlayCard: 0, lastOpponent: {}, placedThisPlay: {},
    skip: noop, skipToMyTurn: noop, ...patch,
  };
}

export function StaticShownProvider(props: { value: Shown; children?: ReactNode }) {
  return createElement(ShownContext.Provider, { value: props.value }, props.children);
}
