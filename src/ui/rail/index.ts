/**
 * The rail (ui-spec §6, §15.3 W5 "rail"). Import from here.
 *
 *   <Rail collapsed={settings.railCollapsed} onToggle={…} />          // desktop
 *   <RailStrip open={panel} onOpen={setPanel} />  {panel && <RailFlyout panel={panel} onClose={…} />}   // tablet
 *   <AdversarySection/> <EffectsSection/> <DispatchesSection/>        // compact sheets
 */
export { Rail, type RailProps } from "./Rail";
export { AdversaryDossier, miniStep, type AdversaryDossierProps, type AdversaryStatus } from "./AdversaryDossier";
export { EffectsStrip, effectChips, type EffectsStripProps } from "./EffectsStrip";
export { Dispatches, LOG_WINDOW, tapeMove, tapeRefs, type DispatchesProps } from "./Dispatches";
export { AiAnnouncer, announcedLines, announcementText, plainText } from "./Announcer";
export { RailStrip, type RailStripProps } from "./RailStrip";
export { RailFlyout, type RailFlyoutProps } from "./RailFlyout";
export { RailPanel, AdversarySection, EffectsSection, DispatchesSection, type RailPanelName } from "./sections";
export { useRailBeats, registerRailHandlers, type RailHandlerDeps } from "./useRailBeats";
export { useRailData, type RailData } from "./useRailData";
export { railStoreFor, createRailStore, useRailView, EMPTY_RAIL_VIEW, type RailStore, type RailView } from "./railStore";
export { logRows, timeCodes, passesFilter, isDiceEntry, diceOf, LOG_FILTERS, type LogFilter, type LogRow, type TimeCode } from "./logModel";
