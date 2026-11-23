/**
 * The map's public types. The shared shapes (`RegionSlot`, `MapTargets`, the `country` beat and the
 * base `MapHandle` / `MapViewProps`) come from `src/ui/ui-contract.ts` (ui-spec §15.1); this file adds
 * the map's own extensions. `MapViewProps` here is the contract's, widened (state / regionScores may be
 * null, the callbacks are optional) plus optional extras, so the contract's props are assignable to it.
 */
import type { ReactNode } from "react";
import type { RegionScores } from "../../engine/types";
import type { PublicState } from "../../game/contract";
import type { FrameSpeed } from "../theme";
import type { Beat, MapHandle as ContractMapHandle, MapViewProps as ContractMapViewProps } from "../ui-contract";

export type { RegionSlot, MapTargets } from "../ui-contract";
import type { RegionSlot } from "../ui-contract";

/** The runner's `country` beat (ui-spec §15.1). */
export type CountryBeat = Extract<Beat, { k: "country" }>;

/** Screen-space insets of the map container covered by other UI (px), for the "fit" camera. */
export interface MapInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Minimal anchor registry the map registers `country:<id>` / `plate:<slot>` with (ui-spec §15.1). */
export interface MapAnchorSink {
  ref(id: `country:${number}` | `plate:${RegionSlot}`): (el: Element | null) => void;
}

/**
 * ui-spec §15.1 `MapViewProps`, widened: `state`/`regionScores` may be null (an empty board), the
 * callbacks and `renderTooltip` are optional, and a few optional map extensions follow.
 */
type ContractCore = Omit<ContractMapViewProps,
  "state" | "regionScores" | "onActivate" | "onInspect" | "onHover" | "onRegionActivate" | "onRegionHover" | "renderTooltip">;
export interface MapViewProps extends ContractCore {
  state: PublicState | null;
  regionScores: RegionScores | null;
  onActivate?(country: number): void;
  onInspect?(country: number): void;
  onHover?(country: number | null): void;
  onRegionActivate?(slot: RegionSlot): void;
  onRegionHover?(slot: RegionSlot | null): void;
  /** Tooltip body for a hovered/focused/inspected country (positioned by the map). Default: §4.8 content. */
  renderTooltip?(country: number): ReactNode;

  // ── Map extensions (optional) ─────────────────────────────────────────────────────────────
  /** Name language; default: the page language (useI18n). */
  lang?: "en" | "zh";
  /** Desktop "Follow action" setting (compact always follows). */
  follow?: boolean;
  /** Container area covered by other UI (e.g. the tray), excluded from the fit. */
  insets?: MapInsets;
  /** How far (px) the fitted map may slide under `insets.bottom` (desktop 64, tablet 48). */
  insetOverlap?: number;
  /** Registers `country:<id>` and `plate:<slot>` anchors (pass UiRoot.anchors). */
  anchors?: MapAnchorSink;
  /** Show the [+][−][⤢] buttons (default true). */
  controls?: boolean;
  /** Body for a region plate's popover (the scoring breakdown); default: a compact table. */
  renderPlateTooltip?(slot: RegionSlot): ReactNode;
  /** Briefly ring a box when its numbers change outside `playCountry` (default true). */
  flashChanges?: boolean;
  /**
   * The open prompt's id (`vm.prompt?.promptId`, null when none): a change closes the transient popovers (a
   * pinned or tapped tooltip, a plate's "if scored now"), also between prompts that offer nothing on the map.
   */
  promptKey?: string | number | null;
  /** Called after every camera move settles (scale in CSS px per map unit). */
  onCamera?(view: { x: number; y: number; w: number; h: number; scale: number }): void;
  className?: string;
}

export interface CountryAnchor {
  /** Box centre in map units. */
  svg: { x: number; y: number };
  /** The box's viewport rect (null when the map is not mounted). */
  rect: DOMRect | null;
  /** The box centre in viewport px (null when not mounted). */
  client: { x: number; y: number } | null;
}

export interface MapHandle extends ContractMapHandle {
  // ── Map extensions ─────────────────────────────────────────────────────────────────────────
  /**
   * Pan (keeping the zoom) so the country's box is in view; does nothing while a finger is on the
   * map or within 3 s of a manual pan/zoom (ui-spec §4.7). Resolves when the camera has settled.
   */
  reveal(country: number, opts?: { animate?: boolean }): Promise<void>;
  /** Frame a region (theatre chips, keys 1–7). */
  frameRegion(slot: RegionSlot, opts?: { animate?: boolean }): Promise<void>;
  /** Where a country's box is (flights, dice trays, chips); null for an unknown id. */
  getCountryAnchor(country: number): CountryAnchor | null;
  /** A region plate's viewport rect (null when not mounted). */
  getPlateRect(slot: RegionSlot): DOMRect | null;
  /** Zoom by a factor around the viewport centre (the +/− buttons). */
  zoomBy(factor: number): void;
  /** Current scale (CSS px per map unit). */
  scale(): number;
}

/** What useMapBeats needs from the runner's Director (structurally compatible with ui-spec §15.1). */
export interface CountryBeatDirector {
  on(kind: "country", handler: (beat: CountryBeat, ctx: { speed: FrameSpeed; signal: AbortSignal }) => Promise<void>): () => void;
}
