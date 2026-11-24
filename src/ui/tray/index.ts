/**
 * The tray (ui-spec §7.2–§7.4, §7.6, §15.3 W6). Import from here or from the files directly.
 *
 *   <Tray variant="desktop" slip={<OrdersSlip variant="desktop"/>} offered={offered} staged={staged}
 *         onActivateCard={actions.activateCard} onOpenPile={openPileViewer} />
 *   <HandDrawer open={panel === "hand"} onClose={closePanel} offered={offered} staged={staged} onActivateCard={…} />
 */
export { Tray, useHandView, computeHandView, type TrayProps, type HandView, type HandViewInput } from "./Tray";
export { Hand, moveCardFocus, type HandProps } from "./Hand";
export { HandCard, type HandCardProps } from "./HandCard";
export { ChinaSlot, type ChinaSlotProps } from "./ChinaSlot";
export { Piles, type PilesProps } from "./Piles";
export { HeadlineSlot, type HeadlineSlotProps } from "./HeadlineSlot";
export { HandDrawer, type HandDrawerProps } from "./HandDrawer";
export { useTrayBeats, TrayBeatsProvider, WithTrayBeats, TrayStoreContext, useTrayOverrides, useTrayStore } from "./useTrayBeats";
export { registerTrayBeats, TrayStore, NO_OVERRIDES, chosenHeadline, play, wait, type TrayOverrides, type TrayBeatDeps, type TrayElKey } from "./trayBeats";
export {
  fitHand, fanAngle, handMode, handCardState, handOffered, stampVerb, liftedOutCard, isHandPrompt, knownToAi, locationOf,
  headlineSlotOf, pileTop, chinaView, handCardWidth, chinaCardWidth, FAN_DEG, MIN_OVERLAP, MAX_OVERLAP, HAND_FIT_PAD, SPINE_FROM, spineOf,
  DISCARD_PICK_CARDS, GIVE_PICK_CARD, chinaFocusReady, handFocusReady, drawerFocusCard, serveFocusRequest,
  type HandMode, type HandCardState, type StampVerb, type TrayVariant, type HandFit, type ChinaView, type PilesView,
} from "./trayModel";
export { useWide } from "./useWide";
