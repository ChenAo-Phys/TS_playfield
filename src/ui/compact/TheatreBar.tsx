/**
 * The compact theatre bar (ui-spec §3.3): region chips in board order with a brass count of the open
 * map prompt's targets in each (SE Asia counted on its own and inside Asia), then "⤢ World". Chips
 * without targets dim while a map prompt is open; the framed region's chip is pressed. Tapping frames
 * the region. During a region prompt (Chernobyl) the offered regions' chips answer it instead.
 * The bar scrolls sideways; at rest the chip its right edge cuts shows at least 44 px (a tap target) or none: the
 * chips' side padding adapts by a few px (`chipPadding`, R3-09). An edge with more chips beyond it fades out
 * (`data-more`), so the bar still says it scrolls when no chip is cut there.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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

/** The chips' side padding in the stylesheet (px), and the range `chipPadding` may move it in. */
export const CHIP_PAD = { base: 9, lo: 6, hi: 12 } as const;
/** The smallest visible part of a chip cut by the bar's edge that still counts as a tap target (px). */
export const CHIP_MIN_VISIBLE = 44;

/**
 * The chips' side padding (px) at which the chip that the bar's right edge cuts, with the bar scrolled to its start,
 * shows at least `min` px, or none (R3-09: a sliver narrower than a finger is not a tap target; at 360 px in Chinese
 * "南美洲" showed 32 px). `widths` are the chips' widths at the base padding, `view` the bar's visible width, `start`
 * its left padding, `gap` the gap between chips. Pulling the chips together (down to `lo`) is preferred, as a cut chip
 * tells that the bar scrolls; else they spread (up to `hi`) until the cut chip starts at the edge; else the base.
 */
export function chipPadding(
  widths: readonly number[],
  view: number,
  o: { start?: number; gap?: number; base?: number; lo?: number; hi?: number; min?: number } = {},
): number {
  const { start = 8, gap = 5, base = CHIP_PAD.base, lo = CHIP_PAD.lo, hi = CHIP_PAD.hi, min = CHIP_MIN_VISIBLE } = o;
  const cutAt = (p: number): { i: number; seen: number } | null => {
    let x = start;
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i]! + 2 * (p - base);
      if (x < view - 0.5 && x + w > view + 0.5) return { i, seen: view - x };
      x += w + gap;
    }
    return null;
  };
  const fits = (p: number) => {
    const c = cutAt(p);
    return !c || c.seen >= min - 0.01;
  };
  if (fits(base)) return base;
  const c = cutAt(base)!;
  if (c.i === 0) return base;
  const pull = Math.floor((base - (min - c.seen) / (2 * c.i)) * 4) / 4;
  if (pull >= lo && fits(pull)) return pull;
  const push = Math.ceil((base + c.seen / (2 * c.i)) * 4) / 4;
  if (push <= hi && fits(push)) return push;
  return base;
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
  const { t, lang } = useI18n();
  const counts = theatreCounts(targets);
  const bar = useRef<HTMLElement | null>(null);
  const pressed = regionTargets ? stagedRegion ?? null : framed;
  const key = `${lang}|${THEATRE_ORDER.map(slot => counts[slot]).join(",")}|${overlay ? 1 : 0}`;
  const pad = useChipPadding(bar, key);
  const more = useScrollEdges(bar, `${key}|${pad}`);

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
      style={pad === CHIP_PAD.base ? undefined : ({ "--chip-pad": `${pad}px` } as CSSProperties)}
      data-more={more ?? undefined}
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

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Measure the bar (`chipPadding`) before paint whenever its chips' text changes (`key`), and again when the bar
 * resizes or the web fonts arrive. The chips' widths are read back to the base padding, so the result does not
 * depend on the padding in force.
 */
function useChipPadding(ref: { current: HTMLElement | null }, key: string): number {
  const [pad, setPad] = useState<number>(CHIP_PAD.base);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const chips = [...el.children] as HTMLElement[];
      if (!chips.length || !el.clientWidth) return;
      const cs = getComputedStyle(el);
      const now = parseFloat(getComputedStyle(chips[0]!).paddingLeft) || CHIP_PAD.base;
      const widths = chips.map(c => c.getBoundingClientRect().width - 2 * (now - CHIP_PAD.base));
      const next = chipPadding(widths, el.clientWidth, { start: parseFloat(cs.paddingLeft) || 0, gap: parseFloat(cs.columnGap) || 0 });
      setPad(p => (Math.abs(p - next) < 0.01 ? p : next));
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    void document.fonts?.ready.then(measure);
    return () => { live = false; ro?.disconnect(); };
  }, [ref, key]);
  return pad;
}

/** Which ends of a horizontal scroller have more content beyond them. */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): "start" | "end" | "both" | null {
  const start = scrollLeft > 1;
  const end = scrollLeft + clientWidth < scrollWidth - 1;
  return start && end ? "both" : start ? "start" : end ? "end" : null;
}

/** `scrollEdges` of the bar, kept up to date on scroll and resize (a state change only when an edge flips). */
function useScrollEdges(ref: { current: HTMLElement | null }, key: string): ReturnType<typeof scrollEdges> {
  const [edges, setEdges] = useState<ReturnType<typeof scrollEdges>>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const read = () => setEdges(scrollEdges(el.scrollLeft, el.clientWidth, el.scrollWidth));
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", read); ro?.disconnect(); };
  }, [ref, key]);
  return edges;
}
