/**
 * The game layer's public API for the UI (src/ui) and the AI (src/ai). The contract types live in
 * ./contract; everything here is pure logic or the controller.
 *
 *   import { createGameController, browserStorage } from "../game";
 *   const controller = createGameController({
 *     loadEngine: () => WasmEngine.load(),      // BASE_URL
 *     ai,                                       // the AiPlayer from src/ai
 *     storage: browserStorage(),
 *     minAiDelayMs: AI_CONFIG.minDelayMs,
 *   });
 *   await controller.boot();
 */
export * from "./contract";
export { TsGameController, createGameController, DEFAULT_AI_OBS_FEATURES } from "./controller";
export type { ControllerDeps, ControllerViewModel } from "./controller";
export { browserStorage, MemoryStorage, readSave, clearSave, SAVE_KEY } from "./persistence";
export type { SavedGame, StorageLike } from "./persistence";
export { redactState, secretCards, aiHeadlineFaceDown, UNSEEN } from "./view";
export {
  classifyEnding, forcedEventTarget, maxActionRound, playsLeft, strandsScoring, isScoringCard, otherSide, playerOf, sideOf,
  SCORING_CARDS, CHINA_CARD,
} from "./rules";
export { buildFrameEvents } from "./events";
export { buildPrompt, classifyPrompt, classifyOption, cardSide, EVENT_COUP_CARDS } from "./prompt";
export { warningMessage, doneLabel, endingReasonMessage, endingMessage } from "./messages";
export { branchMeta, regionEnglishName } from "./branches";
export type { LogLine } from "./log";
