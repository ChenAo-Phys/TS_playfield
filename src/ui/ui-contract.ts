/**
 * Shared interfaces of the React UI (docs/design/ui-spec.md §15.1). Every src/ui workstream codes
 * against this file; it imports only the game contract, engine types and the theme constants.
 * Change it only together with the spec.
 */
import type { ReactNode } from "react";
import type { DieRollState, RegionScores } from "../engine/types";
import type { Ending, Frame, GameController, GameEvent, PlayHow, Prompt, PromptOption, PublicState, Side, ViewModel } from "../game/contract";
import type { FrameSpeed, LayoutKind, SpeedSetting } from "./theme";

// ── Settings (persisted per device: localStorage "ts-playfield.ui.v1") ─────────────────────────
export interface UiSettings {
  speed: SpeedSetting; //                      "normal"
  motion: "system" | "reduce" | "full"; //      "system"
  /** Stage the action that ends your play (last point, Event, Space, done). Dice always stage. */
  confirmFinal: boolean; //                     true
  /** Headline reveal and scoring wait for Continue. */
  pauseOnReveals: boolean; //                   true
  sound: boolean; //                            false
  mapLabels: 100 | 115 | 130; //                100
  patterns: boolean; //                         false
  railCollapsed: boolean; //                    false
  /** Desktop camera follows prompts and AI moves when zoomed in (compact: always on). */
  followAction: boolean; //                     false
  cardImages: "follow" | "en" | "zh"; //        "follow"
}
export const DEFAULT_SETTINGS: UiSettings = {
  speed: "normal", motion: "system", confirmFinal: true, pauseOnReveals: true, sound: false,
  mapLabels: 100, patterns: false, railCollapsed: false, followAction: false, cardImages: "follow",
};

// ── Regions as the scoring slots of RegionScore (0..5 engine Region, 6 = Southeast Asia) ───────
export type RegionSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ── Anchors: where things are on screen (flights, dice trays, tooltips, chips) ─────────────────
export type AnchorId =
  | "deck" | "discard" | "removed" | "effects" | "stage" | "slip" | "dock"
  | "hand:US" | "hand:USSR" | "china:US" | "china:USSR" | "headline:US" | "headline:USSR"
  | "vp" | "defcon" | "turn" | "ar" | "milops:US" | "milops:USSR" | "space:US" | "space:USSR"
  | "scoring" //                                                  the scoring sheet's net bar (stage registers it)
  | `card:${number}` | `country:${number}` | `plate:${RegionSlot}`;

export interface AnchorRegistry {
  /** Ref callback: `ref={anchors.ref("deck")}`. */
  ref(id: AnchorId): (el: Element | null) => void;
  /** Viewport rect, or null when the anchor is not mounted / not visible. */
  rect(id: AnchorId): DOMRect | null;
}

// ── The frame runner: beats and the director ───────────────────────────────────────────────────
/** A unit of animation. The runner plays groups of beats in order; beats in one group run together. */
export type Beat =
  | { k: "reveal"; side: Side; card: number; how: PlayHow; byHuman: boolean }
  | { k: "headline-chosen"; side: Side }
  | { k: "headline-reveal"; us: number; ussr: number; first: Side }
  | { k: "roll"; roll: DieRollState }
  | { k: "scoring"; card: number; vp: number; scores: RegionScores }
  | { k: "country"; country: number; influence: { side: Side; from: number; to: number }[]; control?: { from: Side | "NONE"; to: Side | "NONE" } }
  | { k: "track"; event: Extract<GameEvent, { t: "vp" | "defcon" | "milops" | "space" | "action-round" }> }
  | { k: "effect"; flag: string; on: boolean }
  | { k: "reshuffle" }
  | { k: "deal"; side: Side; count: number }
  | { k: "hand-revealed"; side: Side; cards: number[] }
  | { k: "card-moved"; card: number; from: string; to: string; fromHand?: Side }
  | { k: "china"; holder: Side; playable: boolean }
  | { k: "banner"; kind: "turn" | "phase"; turn?: number; phase?: "SETUP" | "HEADLINE" | "ACTION_ROUND" | "GAME_OVER" }
  | { k: "game-over"; ending: Ending };
export type BeatKind = Beat["k"];

export interface BeatContext {
  frame: Frame;
  /** The state shown before this frame (what is on screen when the beat starts). */
  before: PublicState;
  humanSide: Side;
  speed: FrameSpeed;
  /** Aborted on Skip: finish instantly (jump to the end state) and resolve. */
  signal: AbortSignal;
  settings: UiSettings;
}
export type BeatHandler<K extends BeatKind = BeatKind> = (beat: Extract<Beat, { k: K }>, ctx: BeatContext) => Promise<void>;

export interface Director {
  /**
   * Add a handler for one beat kind; returns the unregister function. Several handlers may share a
   * kind (e.g. "hand-revealed": the rail animates the AI's cards, the tray the human's): they run in
   * parallel and each ignores beats that are not its own. A kind with no handler resolves at once.
   */
  on<K extends BeatKind>(kind: K, handler: BeatHandler<K>): () => void;
  /** Run every handler of the beat's kind (the runner calls this). */
  run(beat: Beat, ctx: BeatContext): Promise<void>;
}

/** What the runner exposes to every component (React context from src/ui/runner). */
export interface Shown {
  /** The last fully animated frame's state: what static UI draws. Null before the first frame. */
  state: PublicState | null;
  regionScores: RegionScores | null;
  /** True while a frame is animating (clicks on map/hand are ignored then). */
  busy: boolean;
  /** Actor of the frame being animated (null when idle). */
  actor: Side | null;
  /** The AI card pinned in the reveal dock for the current AI play (0 = none). */
  aiPlayCard: number;
  /** Countries changed by the opponent's last play: id → deltas. Cleared when the human's next play starts. */
  lastOpponent: Readonly<Record<number, { us: number; ussr: number }>>;
  /** Countries placed into by the human in the current play (pencil marks). Cleared at play end / undo. */
  placedThisPlay: Readonly<Record<number, number>>;
  skip(): void;
  skipToMyTurn(): void;
}

// ── Map (src/ui/map) ───────────────────────────────────────────────────────────────────────────
export interface MapTargets {
  /** prompt.countries */
  ids: ReadonlySet<number>;
  /** ≤ 12 targets → "loud" (dashed marching ring), otherwise "quiet" (solid thin ring). */
  tone: "quiet" | "loud";
  /** Options carrying defcon-suicide / cmc-suicide / game-ending: hazard ring. */
  danger: ReadonlySet<number>;
  /** Influence-type prompts: countries where a point costs 2 Ops (contract gap G1 fallback). */
  cost2: ReadonlySet<number>;
  /** What a click does, for the ghost marker: add the decider's influence, remove, or a die roll. */
  verb: "add" | "remove" | "coup" | "realign" | "target";
  /** Event placements with prompt.maxPerCountry: placed so far in this run per country. */
  cap?: { max: number; placed: Readonly<Record<number, number>> };
  /** Whose counter the ghost marker previews (event removals); from Prompt.effect when present. */
  ghostSide?: Side;
}

export interface MapViewProps {
  state: PublicState;
  regionScores: RegionScores;
  humanSide: Side;
  layout: LayoutKind;
  targets: MapTargets | null;
  /** Chernobyl: the regions offered (region prompt). */
  regionTargets: ReadonlySet<RegionSlot> | null;
  /** Staged country (reticle). */
  selection: number | null;
  placed: Readonly<Record<number, number>>;
  lastOpponent: Readonly<Record<number, { us: number; ussr: number }>>;
  /** Spotlight a region (scoring, region-prompt hover): its boxes full colour, the rest dimmed. */
  focusRegion: RegionSlot | null;
  /** False while frames animate: hover/zoom/inspect still work, activation does not. */
  interactive: boolean;
  labelScale: number;
  patterns: boolean;
  onActivate(country: number): void;
  onInspect(country: number): void;
  onHover(country: number | null): void;
  onRegionActivate(slot: RegionSlot): void;
  onRegionHover(slot: RegionSlot | null): void;
  /** Tooltip body for a hovered/focused/inspected country (positioned by the map). */
  renderTooltip(country: number): ReactNode;
}

export interface MapHandle {
  /** Animate one country beat; the box then shows `to` until clearOverrides(). */
  playCountry(beat: Extract<Beat, { k: "country" }>, speed: FrameSpeed, signal: AbortSignal): Promise<void>;
  /** Drop per-country overrides (the runner calls it after committing frame.state). */
  clearOverrides(): void;
  /** Camera: frame these countries (padding 80 u), or the whole world. */
  frame(countries: readonly number[] | "world", opts?: { animate?: boolean }): Promise<void>;
  /** Is the country's box fully inside the map viewport? */
  isVisible(country: number): boolean;
  /** 1 s attention ring (log hover, tooltips elsewhere). */
  pulse(country: number): void;
}

// ── Prompt layer helpers (src/ui/prompts) ──────────────────────────────────────────────────────
export type Commit = "instant" | "stage" | "hold";
export interface OptionPolicy {
  option: PromptOption;
  commit: Commit;
  /** Most severe warning on the option, for styling. */
  severity: "none" | "info" | "caution" | "fatal";
}

// ── Root context (src/ui/state) ────────────────────────────────────────────────────────────────
export interface UiRoot {
  controller: GameController;
  vm: ViewModel;
  layout: LayoutKind;
  settings: UiSettings;
  setSettings(patch: Partial<UiSettings>): void;
  anchors: AnchorRegistry;
  director: Director;
  /** Open the shared card zoom (desktop popover / compact sheet). */
  zoomCard(card: number, from?: Element | null): void;
  toast(message: ReactNode, opts?: { tone?: "info" | "warn"; ms?: number }): void;
}

/** Convenience: the current prompt or null (shape re-exported for components). */
export type CurrentPrompt = Prompt | null;
