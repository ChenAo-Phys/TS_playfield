// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * Ongoing effects by the engine's flag name (the display state's `active_effects` / `effect-on`
 * events): the card each comes from, whom it favours and how long it lasts. Pure data, moved out of
 * DeepStruggle's `web/ui/src/cards_view.ts` (`EFFECT_INFO_MAP`).
 *
 * The words for an effect live in the i18n catalog: `effects:<FLAG>.name`, `.description` and, for
 * some of this turn's effects, a shorter `.short` for the map (see `effectText` in src/i18n).
 */
import { CARDS } from "./cards";

export type EffectSide = "US" | "USSR" | "BOTH" | "NEUTRAL";
export type EffectDuration = "PERMANENT" | "TURN" | "CONDITIONAL" | "SPACE_PERK";

export interface EffectInfo {
  /** The card whose Event set the flag. */
  readonly cardId: number;
  /** That card's English title (our card_text.json title; named by id when shown). */
  readonly cardName: string;
  readonly side: EffectSide;
  readonly duration: EffectDuration;
}

type Row = readonly [cardId: number, side: EffectSide, duration: EffectDuration];

const ROWS: Readonly<Record<string, Row>> = {
  NATO_ACTIVE: [21, "US", "PERMANENT"],
  NATO_CANCELED_FRANCE: [17, "NEUTRAL", "PERMANENT"],
  NATO_CANCELED_WEST_GERMANY: [55, "NEUTRAL", "CONDITIONAL"],
  MARSHALL_PLAN_PLAYED: [23, "US", "PERMANENT"],
  WARSAW_PACT_PLAYED: [16, "USSR", "PERMANENT"],
  US_JAPAN_PACT_ACTIVE: [27, "US", "PERMANENT"],
  CONTAINMENT_ACTIVE: [25, "US", "TURN"],
  PURGE_US_ACTIVE: [31, "US", "TURN"],
  PURGE_USSR_ACTIVE: [31, "USSR", "TURN"],
  VIETNAM_REVOLTS_ACTIVE: [9, "USSR", "TURN"],
  FORMOSAN_RESOLUTION_ACTIVE: [35, "US", "CONDITIONAL"],
  CMC_ACTIVE_US: [40, "US", "TURN"],
  CMC_ACTIVE_USSR: [40, "USSR", "TURN"],
  NUCLEAR_SUBS_ACTIVE: [41, "US", "TURN"],
  QUAGMIRE_ACTIVE: [42, "US", "CONDITIONAL"],
  BEAR_TRAP_ACTIVE: [44, "USSR", "CONDITIONAL"],
  SALT_ACTIVE: [43, "BOTH", "TURN"],
  WE_WILL_BURY_YOU_PENDING: [50, "USSR", "TURN"],
  BREZHNEV_DOCTRINE_ACTIVE: [51, "USSR", "TURN"],
  FLOWER_POWER_ACTIVE: [59, "USSR", "CONDITIONAL"],
  U2_INCIDENT_ACTIVE: [60, "USSR", "TURN"],
  SHUTTLE_DIPLOMACY_ACTIVE: [73, "US", "CONDITIONAL"],
  DEATH_SQUADS_US: [69, "US", "TURN"],
  DEATH_SQUADS_USSR: [69, "USSR", "TURN"],
  CAMP_DAVID_PLAYED: [65, "US", "PERMANENT"],
  IRON_LADY_PLAYED: [83, "US", "PERMANENT"],
  NORTH_SEA_OIL_PLAYED: [86, "US", "PERMANENT"],
  NORTH_SEA_OIL_ACTIVE: [86, "US", "TURN"],
  THE_REFORMER_PLAYED: [87, "US", "PERMANENT"],
  IRAN_CONTRA_ACTIVE: [93, "USSR", "TURN"],
  EVIL_EMPIRE_PLAYED: [97, "US", "PERMANENT"],
  ALDRICH_AMES_ACTIVE: [98, "USSR", "TURN"],
  JOHN_PAUL_II_PLAYED: [68, "US", "PERMANENT"],
  NORAD_ACTIVE: [106, "US", "CONDITIONAL"],
  YURI_AND_SAMANTHA_ACTIVE: [109, "USSR", "TURN"],
  AWACS_PLAYED: [110, "US", "PERMANENT"],
  // The engine's own name for the bit (bindings/state_json.cpp), shortened there: keyed as
  // `..._PLAYED` this entry never matched and the panel showed the raw flag instead.
  IRANIAN_HOSTAGE_CRISIS_PLAY: [82, "USSR", "PERMANENT"],
  WILLY_BRANDT_PLAYED: [55, "USSR", "CONDITIONAL"],
  TEAR_DOWN_THIS_WALL_PLAYED: [96, "US", "PERMANENT"],
  CHERNOBYL_ACTIVE: [94, "US", "TURN"],
  // Not an effect bit: the side given Missile Envy, which still holds it and owes its Operations (state_json.cpp adds
  // these after the bits). Until it is played.
  MISSILE_ENVY_US: [49, "US", "CONDITIONAL"],
  MISSILE_ENVY_USSR: [49, "USSR", "CONDITIONAL"],
};

/** Every ongoing effect the page names, by engine flag. */
export const EFFECT_INFO_MAP: Readonly<Record<string, EffectInfo>> = Object.freeze(
  Object.fromEntries(
    Object.entries(ROWS).map(([flag, [cardId, side, duration]]) => {
      const card = CARDS[cardId - 1];
      if (!card || card.id !== cardId) throw new Error(`effects: ${flag} names unknown card ${cardId}`);
      return [flag, Object.freeze({ cardId, cardName: card.title.en, side, duration })];
    }),
  ),
);

/** The engine flags listed in `EFFECT_INFO_MAP`, in its order. */
export const EFFECT_FLAGS: readonly string[] = Object.freeze(Object.keys(ROWS));

/** An effect by its engine flag, or null for a flag the page does not describe. */
export function effectInfo(flag: string): EffectInfo | null {
  return Object.hasOwn(EFFECT_INFO_MAP, flag) ? EFFECT_INFO_MAP[flag]! : null;
}
