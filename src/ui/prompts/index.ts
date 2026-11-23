/**
 * The prompt layer (ui-spec §8, §15.3 W7): the orders slip, the confirmation model, map targets and the
 * country tooltip, the play-mode stage, the branch / DEFCON dossiers, the card picker and pile viewer,
 * the region choice and the target list. See wiring.tsx for how the shell plugs it in.
 */
export {
  policyFor, policiesOf, commitFor, isFinalPoint, endsThePlay, severityOf, warningFaces, isDanger, isHumanWin, isFatalCode,
  isTrapEscape, isDiceEvent, handPolicies, cardVerb, stampVerb,
  ALWAYS_STAGE_KINDS, MAP_KINDS, PLACEMENT_KINDS, HAND_KINDS, FATAL_CODES, WARGAMES,
  type PolicyContext, type CardVerb,
} from "./policy";
export { cost2Targets, countryFacts, deciderOf, pointCost, controlAfter, wouldTakeControl, realignFacts, type CountryFacts } from "./costHint";
export { verbFor, effectOf, ghostSideFor, removeAmount, EVENT_VERBS, type EventEffect } from "./eventVerbs";
export { nextRun, runKey, runTotalOf, runPlaced, runCardPicks, useRun, useRunTotal, type RunState } from "./runTotals";
export {
  PromptStore, promptStore, STAGE_TIMEOUT_MS, QUEUE_TIMEOUT_MS, FOCUS_TIMEOUT_MS, QUEUE_KINDS,
  type Staged, type StagedKind, type PromptUiState, type QueuedActivation, type Timers,
} from "./store";
export {
  useAiWait, elapsedSeconds, msToNextSecond, slowHintAvailable, slowHintClaimedBy, claimSlowHint, resetSlowHint,
  STILL_THINKING_S, SLOW_HINT_S, SLOW_HINT_KEY, SLOW_HINT_TOAST_MS, type AiWait,
} from "./aiWait";
export { useStaging, stagedFor, usePromptStore, usePromptUi, type Staging, type StagedSelection } from "./useStaging";
export { usePromptActions, policyContext, stagedKey, type PromptActions } from "./usePromptActions";
export { usePromptTargets, promptTargets, LOUD_MAX } from "./usePromptTargets";
export { usePromptKeys } from "./usePromptKeys";
export { doneText } from "./doneText";
export { regionTargetsOf, groupByRegion, slotOfCountry, BOARD_SLOTS, SCORING_SLOT } from "./regions";
export { confirmLabel, promptCrumb, promptCard, ordersHead, scoredNet, howWord, slotName, type Crumb } from "./labels";
export { cachedPreview, previewNow, usePreview, PREVIEW_DEBOUNCE_MS } from "./previews";
export { useCardPeek, DialogKeys, ConfirmButton, DoneButton } from "./dialogParts";
export { OrdersSlip, slipMode, playModeKeys, type OrdersSlipProps, type SlipMode } from "./OrdersSlip";
export { PlayModeStage, PlayModeRows, backToHand, type PlayModeStageProps } from "./PlayModeStage";
export { BranchDossier } from "./BranchDossier";
export { DefconDossier, defconCaption } from "./DefconDossier";
export { CardPicker, locationTag, type CardPickerProps } from "./CardPicker";
export { RegionChoice } from "./RegionChoice";
export { CountryTooltip, type CountryTooltipProps } from "./CountryTooltip";
export { TargetList, type TargetListProps } from "./TargetList";
export {
  usePromptMapProps, useHandProps, handOffers, promptSurface, isHandPicker, CardSheetActions, PromptStage, PromptDialogs,
  type PromptMapProps, type HandProps, type PromptSurface,
} from "./wiring";
