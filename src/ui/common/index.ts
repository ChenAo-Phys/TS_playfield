/**
 * Shared UI pieces (ui-spec §15.3 W3 "common"). Import from here or from the files directly.
 */
export { STAR_PATH, HAMMER_SICKLE_PATH, HAMMER_SICKLE_PATH_LARGE, LARGE_GLYPH_PX, glyphPath } from "./glyphs";
export { SideGlyph, type SideGlyphProps } from "./SideGlyph";
export { Seal, type SealProps } from "./Seal";
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./Icon";
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { HoldButton, HOLD_MS, type HoldButtonProps } from "./HoldButton";
export { Stamp, type StampProps } from "./Stamp";
export { MessageText, messageParts, parseParts, partsText, renderWithSentinels, type MessagePart, type MessageTextProps } from "./MessageText";
export { CardRef, type CardRefProps } from "./CardRef";
export { CountryRef, type CountryRefProps } from "./CountryRef";
export { CountryPulseContext, useCountryPulse, type CountryPulse } from "./countryPulse";
export { Popover, type PopoverProps } from "./Popover";
export { placePopover, placeCentered, intersects, type Placed, type PlacementPref, type PlaceOptions, type RectLike, type Side4 } from "./placement";
export { Dossier, trapTab, useFocusReturn, type DossierProps } from "./Dossier";
export { Sheet, swipeCloses, type SheetProps } from "./Sheet";
export { Toaster, useToast, type ToasterProps } from "./Toaster";
export { Die, PIPS, type DieProps } from "./Die";
export { RollingNumber, type RollingNumberProps } from "./RollingNumber";
export { formatSigned, formatNumber, MINUS } from "./format";
export { useHoverIntent, useLongPress, usePrefersReducedMotion, prefersReducedMotion, type HoverIntent, type LongPress } from "./hooks";
export {
  useKey, KeymapProvider, KeyScope, KeymapRegistry, useKeymap, sharedKeymap, parseCombo, matchCombo, normalizeKey,
  isTypingTarget, isControlTarget, comboLabel, ROOT_SCOPE,
  type KeyHandler, type KeyOptions, type KeyScopeProps, type KeymapProviderProps, type Combo, type KeyEventLike,
} from "./keymap";
export { useTouchUi, createTouchSignal, TouchUiContext, TOUCH_QUERY, type TouchSignal } from "./touch";
export { displayTurnAr, lastActionRound, type TurnAr } from "./turnAr";
