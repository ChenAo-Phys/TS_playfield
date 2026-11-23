/**
 * A popover (z popover, ui-spec §3.5): paper (tooltips, card zoom) or room (menus). Rendered in a portal
 * with `position: fixed`, placed next to its anchor on the preferred side, flipped to stay on screen and
 * kept off `avoid` rects (the orders slip). Esc closes it (a non-modal key scope: other keys pass), and so
 * does a press outside it and its anchor. Under SSR it renders in place.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KeyScope } from "./keymap";
import { placeCentered, placePopover, type Placed, type PlacementPref, type RectLike } from "./placement";
import s from "./Popover.module.css";

export interface PopoverProps {
  /** What it points at: an element (tracked while open) or a fixed viewport rect; null = centred. */
  anchor: DOMRect | Element | null;
  placement?: PlacementPref;
  tone: "paper" | "room";
  arrow?: boolean;
  onClose?(): void;
  children: ReactNode;
  // ── extensions ──
  /** Viewport rects to keep clear (e.g. the slip). */
  avoid?: readonly RectLike[];
  /** Distance from the anchor (default 12). */
  gap?: number;
  /** ARIA role (default "dialog"; "tooltip" for hover-only content). */
  role?: "dialog" | "tooltip" | "menu";
  /** Accessible name. */
  label?: string;
  /** Let the pointer through (hover peeks that must not block what is under them). */
  passThrough?: boolean;
  className?: string;
  id?: string;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The anchor's viewport rect (null when an anchor element left the document). */
function anchorRect(a: DOMRect | Element | null): RectLike | null {
  if (!a) return null;
  if (typeof (a as Element).getBoundingClientRect === "function") {
    const el = a as Element;
    return el.isConnected ? el.getBoundingClientRect() : null;
  }
  return a as DOMRect;
}

export function Popover({ anchor, placement = "auto", tone, arrow = true, onClose, children, avoid, gap = 12, role = "dialog", label, passThrough = false, className, id }: PopoverProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Placed | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const avoidKey = (avoid ?? []).map(r => `${r.left},${r.top},${r.width},${r.height}`).join(";");

  const place = () => {
    const node = el.current;
    if (!node || typeof window === "undefined") return;
    const size = { width: node.offsetWidth, height: node.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const r = anchorRect(anchor);
    const next = r ? placePopover(r, size, viewport, { placement, gap, avoid }) : placeCentered(size, viewport);
    setPos(p => (p && p.left === next.left && p.top === next.top && p.placement === next.placement && p.arrow === next.arrow ? p : next));
  };

  useIsoLayoutEffect(place);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const ro = typeof ResizeObserver !== "undefined" && el.current ? new ResizeObserver(onMove) : null;
    if (ro && el.current) ro.observe(el.current);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      ro?.disconnect();
    };
  }, [anchor, placement, gap, avoidKey]);

  // A press outside the popover and its anchor closes it.
  useEffect(() => {
    if (!onClose || typeof document === "undefined") return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || el.current?.contains(target)) return;
      if (anchor && typeof (anchor as Element).contains === "function" && (anchor as Element).contains(target)) return;
      closeRef.current?.();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor, !!onClose]);

  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top, ["--arrow" as string]: `${pos.arrow}px` }
    : { left: 0, top: 0, visibility: "hidden" };
  const cls = [s.pop, tone === "paper" ? s.paper : s.room, passThrough ? s.passThrough : "", pos ? s.shown : "", className].filter(Boolean).join(" ");
  const body = (
    <div
      ref={el}
      id={id}
      className={cls}
      style={style}
      role={role}
      aria-label={label}
      data-placement={pos?.placement ?? "none"}
    >
      {arrow && pos && pos.placement !== "center" ? <span className={s.arrow} aria-hidden="true" /> : null}
      {children}
    </div>
  );
  const content = <KeyScope modal={false} onEscape={onClose}>{body}</KeyScope>;
  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
