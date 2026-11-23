/**
 * The console and its instruments (ui-spec §5, §15.3 W5 "console"). Import from here.
 *
 *   <Console variant="desktop" onSettings={…} onMenu={el => …} />   // registers the track beats itself
 *   <StatusPanel after={<Piles …/>} />                              // tablet flyout / compact sheet
 */
export { Console, needsAttention, type ConsoleProps, type ConsoleVariant } from "./Console";
export { TurnTrack, TurnReadout, TurnTip, type TurnTrackProps } from "./TurnTrack";
export { ArTrack, ArReadout, type ArTrackProps } from "./ArTrack";
export { DefconGauge, DefconTip, type DefconGaugeProps } from "./DefconGauge";
export { VpGauge, VpLead, VpSparkline, vpLeadText, type VpGaugeProps } from "./VpGauge";
export { MilOpsTrack, MilOpsTip, type MilOpsTrackProps } from "./MilOpsTrack";
export { SpaceTrack, SpaceTip, type SpaceTrackProps } from "./SpaceTrack";
export { LangToggle, type LangToggleProps } from "./LangToggle";
export { StatusPanel, type StatusPanelProps } from "./StatusPanel";
export { Instrument, useAnchorRef, type InstrumentProps } from "./Instrument";
export {
  useTrackBeats, registerTrackHandlers, useTrackValues, trackValues, useVpHistory, chipSource, flyChipDom,
  type TrackHandlerDeps, type TrackValues, type ChipSpec,
} from "./useTrackBeats";
export {
  trackStoreFor, createTrackStore, useTrackView, EMPTY_TRACK_VIEW,
  type TrackStore, type TrackView, type TrackOverrides, type TrackAnim, type TrackAnimKey,
} from "./trackStore";
export {
  eraOf, vpLead, vpNeedle, vpHistory, arModel, clampDefcon, milOpsShort, perksReached, spaceBoxKey, SPACE_PERK_BOXES, ERA_START,
  type Era, type ArModel, type ArPip, type HalfState, type VpPoint,
} from "./model";
export { slot, fillSlots, slotText, emphasizeNumber } from "./slots";
