/**
 * The stage (ui-spec §9.5, §10, §15.3 W8): big moments and the AI's turn on the table. Public API for
 * the shell and the other workstreams.
 *
 *   <main className="table">
 *     <MapView … focusRegion={focus ?? promptFocus} />
 *     <Stage onFocusRegion={setFocus} />           // reveal dock, dice, headline papers, scoring sheet, turn banner
 *   </main>
 *   <GameOverTelex ending={vm.ending} humanSide={vm.humanSide} onNewGame={…} onReview={…} onLog={…} />  // when vm.ending
 *   <DangerFrame />                                // once, at the app root
 *
 *   const { waiting, proceed } = useStageWaiting(); // the slip's "Continue ⎵" while papers / a scoring sheet wait
 *   <ScoringTable score={scoreOf(regionScores, slot)} />   // the map's region-plate popover body
 */
export { Stage, type StageProps } from "./Stage";
export { RevealDock, DockPanel, DOCK_CARD_W, DOCK_PINNED_W, dockSlotIn, measureDock } from "./RevealDock";
export { DiceTray, DiceTrayView, type DiceTrayViewProps } from "./DiceTray";
export { HeadlinePapers, HeadlinePapersView, ContinueKeys, type HeadlinePapersViewProps } from "./HeadlinePapers";
export { ScoringSheet, ScoringSheetView, ScoringTable, type ScoringSheetViewProps, type ScoringTableProps } from "./ScoringSheet";
export { TurnBanner, TurnBannerView, useTypewriter, TYPE_MS_PER_CHAR } from "./TurnBanner";
export { DangerFrame } from "./DangerFrame";
export { GameOverTelex, TelexOverlay, TelexSheet, type GameOverTelexProps, type TelexStats, type TelexOverlayProps } from "./GameOverTelex";
export { VpChart, chartX, chartY, type VpChartProps } from "./VpChart";
export { useStageStore, useStageState, useStageBeats, useStageWaiting, stageStoreFor } from "./useStage";
export {
  StageStore, EMPTY_STAGE, REDUCED_FADE, defaultEnv,
  type StageState, type StageEnv, type StageHandler, type DockState, type DiceState, type PapersState, type ScoringState,
  type BannerState, type OverState,
} from "./stageStore";
export {
  scoringSlot, regionInk, slotKey, sheetSide, eraOf, eraStampOf, opponentNote, isOpsPlay, collapseAnchor, diceAnchor, diceModel,
  rollCountry, influenceDeltas, cancelledHeadline, scoringRows, playedBy, vpLead, placeBeside, hangUnder, dockBesideSheet, overlaps, boxOf,
  otherSide,
  type DiceModel, type DieView, type ScoringRow, type Box,
} from "./model";
export {
  GameRecorder, tallyFromLog, mergeTally, vpPoints, vpOfScore, emptyTally, type GameTally, type VpPoint,
} from "./record";
