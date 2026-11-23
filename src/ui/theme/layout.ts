/**
 * Breakpoints and the fixed layout sizes of the game screen (docs/design/ui-spec.md §3), as data
 * for JavaScript (map fitting, camera, flight anchors). The CSS side is tokens.css section D.
 */

export type LayoutKind = "desktop" | "tablet" | "compact" | "compact-landscape";

/**
 * Which arrangement a viewport (CSS px) gets:
 *  - compact-landscape: phones held sideways (height < 500 and wider than tall);
 *  - compact: phones (< 700 wide) and portrait tablets (< 1200 wide, taller than wide);
 *  - tablet: 700–1199 wide in landscape, or any width with height < 640;
 *  - desktop: ≥ 1200 × 640.
 */
export function layoutFor(width: number, height: number): LayoutKind {
  if (height < 500 && width > height) return "compact-landscape";
  if (width < 700) return "compact";
  if (width < 1200) return height > width ? "compact" : "tablet";
  if (height < 640) return "tablet";
  return "desktop";
}

/** Width from which the desktop rail and tray grow (ui-spec §3.1). */
export const WIDE_FROM = 1600;

export const DESKTOP = {
  consoleH: 58,
  railW: 288,
  railWWide: 336,
  tablePad: 10,
  slipW: 344,
  /** The map may slide this far under the tray (only ocean and plates live there). */
  trayOverlap: 64,
} as const;

export const TABLET = {
  consoleH: 54,
  railStripW: 60,
  flyoutW: 320,
  tablePad: 8,
  slipW: 296,
  trayOverlap: 48,
} as const;

export const COMPACT = {
  consoleH: 48,
  theatreH: 36,
  dockH: 60,
  drawerH: 224,
  cardW: 112,
  cardH: 157,
  sideColW: 300,
} as const;

/** Tray height on desktop/tablet: clamp(152, 18.5 % of the viewport height, 184). */
export function trayHeight(viewportHeight: number, kind: LayoutKind): number {
  if (kind === "tablet") return Math.round(Math.min(150, Math.max(132, viewportHeight * 0.18)));
  return Math.round(Math.min(184, Math.max(152, viewportHeight * 0.185)));
}

/**
 * The "fit" map scale (CSS px per map unit) on desktop/tablet: the whole map is visible, width-bound
 * when possible, and its bottom band may slide under the tray by `trayOverlap` px.
 * `mapW/mapH` are the map viewBox size in map units (ui-spec §5.1).
 */
export function fitScale(o: {
  tableW: number;
  tableH: number;
  trayH: number;
  pad: number;
  overlap: number;
  mapW: number;
  mapH: number;
}): number {
  const w = Math.max(1, o.tableW - 2 * o.pad);
  const h = Math.max(1, o.tableH - 2 * o.pad - o.trayH + o.overlap);
  return Math.min(w / o.mapW, h / o.mapH);
}

/** Semantic zoom level of the map at scale `s` (ui-spec §5.4). */
export type MapDetail = "overview" | "standard" | "detail";
export function mapDetail(s: number): MapDetail {
  if (s < 0.4) return "overview";
  if (s < 0.9) return "standard";
  return "detail";
}
