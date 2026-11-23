/**
 * The frame runner (ui-spec §9, §15.3 W4). Public API for the other UI workstreams.
 *
 *   <UiRootProvider controller={c}>                       // src/ui/state: director + anchors live here
 *     <ShownProvider onCommit={() => map.current?.clearOverrides()}>
 *       …  <FlightLayer />                                 // once, anywhere inside
 *     </ShownProvider>
 *   </UiRootProvider>
 *
 *   const shown = useShown();                              // Shown.state is what static UI draws
 *   useEffect(() => root.director.on("reveal", handler), [root.director]);
 *   <div ref={root.anchors.ref("deck")} />                 // flight / dice / chip anchors
 */
export { buildBeats, boardRank, cancelledHeadlineCard, dealtCards, silentMove, staggerOffset, STAGGER } from "./beats";
export { createDirector, ABORT_GRACE_MS, type BeatRecord, type RunnerDirector } from "./director";
export { createAnchorRegistry, type RunnerAnchors } from "./anchors";
export { reduceLastPlay, isUndoFrame, EMPTY_LAST_PLAY, type LastPlayState, type Deltas } from "./lastPlay";
export { anchorForLocation, flightFor, handSide, type CardMove, type FlightPlan, type LocationContext } from "./locations";
export { FrameRunner, abortableSleep, AI_LEAD_IN_MS, type FrameRunnerDeps } from "./frameRunner";
export { useFrameRunner, useFrameRunnerInstance, type FrameRunnerOptions } from "./useFrameRunner";
export {
  ShownProvider, ShownContext, StaticShownProvider, staticShown, useShown, useOnCommit, useFrameRunnerHandle,
} from "./ShownContext";
export { FlightLayer, arcKeyframes, FLIGHT_W, FLIGHT_H, type FlightSpec } from "./FlightLayer";
