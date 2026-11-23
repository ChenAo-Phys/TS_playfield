/**
 * The compact theatre bar (ui-spec §3.3): region chips in board order with a brass count of the open
 * map prompt's targets in each (SE Asia counted on its own and inside Asia), then "⤢ World". Chips
 * without targets dim while a map prompt is open; the framed region's chip is pressed. Tapping frames
 * the region. During a region prompt (Chernobyl) the offered regions' chips answer it instead.
 */
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/react";
import { areaRect, COUNTRY_LAYOUT, countriesOfSlot } from "../map/layout";
import type { MapTargets, RegionSlot } from "../ui-contract";
import s from "./compact.module.css";

/** Board order (ui-spec §3.3): Europe, Middle East, Asia, SE Asia, Africa, C. America, S. America. */
export const THEATRE_ORDER: readonly RegionSlot[] = [0, 2, 1, 6, 3, 4, 5];

/** Targets per region chip (Asia includes SE Asia). */
export function theatreCounts(targets: MapTargets | null): Record<RegionSlot, number> {
  const out = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<RegionSlot, number>;
  if (!targets) return out;
  for (const slot of THEATRE_ORDER) out[slot] = countriesOfSlot(slot).filter(id => targets.ids.has(id)).length;
  return out;
}

/**
 * The region a camera view frames (its chip shows pressed): among the regions with at least 60 % of their
 * boxes in view, the one that best fills the view (share of the region in view × its share of the boxes in
 * view); none when most of the world is in view. A tall view (portrait phones) also holds most of the
 * neighbouring regions above and below the framed one, so there the region whose area is centred nearest
 * the view's centre wins instead (Q-047).
 */
export function framedSlot(view: { x: number; y: number; w: number; h: number }): RegionSlot | null {
  const inView = (id: number) => {
    const c = COUNTRY_LAYOUT[id];
    return !!c && c.cx >= view.x && c.cx <= view.x + view.w && c.cy >= view.y && c.cy <= view.y + view.h;
  };
  const all = COUNTRY_LAYOUT.filter(c => inView(c.id)).length;
  if (!all || all >= COUNTRY_LAYOUT.length * 0.75) return null;
  const tall = view.h > view.w;
  const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  let best: { slot: RegionSlot; score: number } | null = null;
  for (const slot of THEATRE_ORDER) {
    const ids = countriesOfSlot(slot);
    const seen = ids.filter(inView).length;
    const share = seen / ids.length;
    if (share < 0.6) continue;
    let score: number;
    if (tall) {
      const r = areaRect(slot);
      score = -Math.hypot((r.x + r.w / 2 - cx) / view.w, (r.y + r.h / 2 - cy) / view.h);
    } else {
      score = share * (seen / all);
    }
    if (!best || score > best.score) best = { slot, score };
  }
  return best?.slot ?? null;
}

export interface TheatreBarProps {
  targets: MapTargets | null;
  framed: RegionSlot | null;
  onFrame(slot: RegionSlot | "world"): void;
  // ── extensions ──
  /** Region prompt: the offered regions (their chips answer the prompt). */
  regionTargets?: ReadonlySet<RegionSlot> | null;
  /** The staged region of a region prompt (pressed). */
  stagedRegion?: RegionSlot | null;
  onRegionActivate?(slot: RegionSlot): void;
  onRegionHover?(slot: RegionSlot | null): void;
  /** Compact landscape: transparent, over the map. */
  overlay?: boolean;
  className?: string;
}

export function TheatreBar({ targets, framed, onFrame, regionTargets, stagedRegion, onRegionActivate, onRegionHover, overlay, className }: TheatreBarProps) {
  const { t } = useI18n();
  const counts = theatreCounts(targets);
  const bar = useRef<HTMLDivElement | null>(null);
  const pressed = regionTargets ? stagedRegion ?? null : framed;

  // Keep the pressed chip in view.
  useEffect(() => {
    if (pressed === null) return;
    const el = bar.current?.querySelector<HTMLElement>(`[data-slot="${pressed}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pressed]);

  return (
    <nav
      ref={bar}
      className={[s.theatres, overlay ? s.theatresOverlay : "", className].filter(Boolean).join(" ")}
      aria-label={t("ui_shell:theatre.label")}
    >
      {THEATRE_ORDER.map(slot => {
        const name = t(`ui:plate.name.${slot}`);
        const offered = regionTargets?.has(slot) ?? false;
        const n = regionTargets ? 0 : counts[slot];
        const dim = regionTargets ? !offered : !!targets && n === 0;
        return (
          <button
            key={slot}
            type="button"
            data-slot={slot}
            className={[s.chip, dim ? s.chipNone : "", offered ? s.chipOffered : ""].filter(Boolean).join(" ")}
            aria-pressed={pressed === slot}
            aria-label={n ? t("ui_shell:theatre.count", { region: name, count: n }) : name}
            onClick={() => (regionTargets ? offered && onRegionActivate?.(slot) : onFrame(slot))}
            onPointerEnter={() => offered && onRegionHover?.(slot)}
            onPointerLeave={() => offered && onRegionHover?.(null)}
            onFocus={() => offered && onRegionHover?.(slot)}
            onBlur={() => offered && onRegionHover?.(null)}
          >
            <span>{name}</span>
            {n ? <span className={s.count} aria-hidden="true">{n}</span> : null}
          </button>
        );
      })}
      <button type="button" className={s.chip} aria-pressed={false} onClick={() => onFrame("world")}>
        <span aria-hidden="true">⤢</span> <span>{t("ui:map.world")}</span>
      </button>
    </nav>
  );
}
