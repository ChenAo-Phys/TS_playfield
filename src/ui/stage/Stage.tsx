/**
 * The stage (ui-spec §3.1 "Stage overlays", §3.5 z 40, §15.3 W8): a layer over the table that hosts
 * the big moments — reveal dock, dice trays, headline newspapers, scoring sheet, turn banner. It never
 * covers the rail or the slip (the shell puts it inside the table area). Registers the `stage` anchor
 * (the table centre: Grain Sales' drawn card, the AI's just-played card) and records the game for the
 * telex (VP by turn, coups) from every committed frame.
 *
 *   <main className="table"> <MapView …/> <Stage onFocusRegion={setFocus}/> … </main>
 *
 * Mount it once per game screen, for the whole game. The danger frame and the game-over telex are
 * separate (the shell places them over the whole app).
 */
import { useEffect, useRef } from "react";
import { useOnCommit, useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { RegionSlot } from "../ui-contract";
import { DiceTray } from "./DiceTray";
import { HeadlinePapers } from "./HeadlinePapers";
import { dockSlotIn, RevealDock } from "./RevealDock";
import { ScoringSheet } from "./ScoringSheet";
import { TurnBanner } from "./TurnBanner";
import { useStageState, useStageStore } from "./useStage";
import s from "./Stage.module.css";

export interface StageProps {
  /** The region the stage spotlights (scoring sheet, Europe control), for MapView `focusRegion`. */
  onFocusRegion?(slot: RegionSlot | null): void;
  className?: string;
}

export function Stage({ onFocusRegion, className }: StageProps) {
  const root = useUiRoot();
  const shown = useShown();
  const store = useStageStore();
  const vmRef = useRef(root.vm);
  vmRef.current = root.vm;

  // The record and the commit-time fades; what was on screen before the first commit we hear of.
  useOnCommit(frame => store.commit(frame, vmRef.current));
  useEffect(() => { store.noteShown(shown.state, shown.regionScores, vmRef.current.log); }, [store, shown.state, shown.regionScores]);

  // The pinned dock ends when the runner stops pinning it or a human prompt opens (ui-spec §9.5).
  const promptOpen = root.vm.prompt !== null;
  useEffect(() => {
    store.syncDock(shown.aiPlayCard, promptOpen, shown.state);
  }, [store, shown.aiPlayCard, promptOpen, shown.state]);

  const focus = useStageState(st => st.focusRegion, store);
  const onFocus = useRef(onFocusRegion);
  onFocus.current = onFocusRegion;
  useEffect(() => { onFocus.current?.(focus); }, [focus]);

  // Avoidance measures the whole reveal dock (card and caption), not only its card (R-006).
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    store.configure({ dockRect: () => (el.current ? dockSlotIn(el.current)?.getBoundingClientRect() ?? null : null) });
    return () => store.configure({ dockRect: undefined });
  }, [store]);

  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  return (
    <div ref={el} className={[s.stage, className].filter(Boolean).join(" ")} data-layout={compact ? "compact" : "wide"} data-stage="">
      <div className={s.centre} ref={root.anchors.ref("stage")} aria-hidden="true" />
      <TurnBanner />
      {/* The dock under the trays and the sheet: they are never covered by it, even while it slides away (R-006). */}
      <RevealDock />
      <DiceTray />
      <ScoringSheet />
      <HeadlinePapers />
    </div>
  );
}
