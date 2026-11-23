/**
 * A bottom sheet (ui-spec §3.3 compact sheets and drawers, z sheet): slides up over a scrim, has a grab
 * handle, closes by swiping it down, tapping the grab or the scrim, or Esc. role="dialog" (aria-modal),
 * focus moves in and returns to the opener. Heights: auto (up to 90 %), 60 %, 80 %, full.
 * Compact landscape (§3.4): the panel opens over the left (map) column only, leaving the side column (console,
 * orders slip, dock) in view under the scrim.
 */
import { useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/react";
import { UiRootContext } from "../state/context";
import { DUR, EASE } from "../theme/motion";
import { trapTab, useFocusReturn } from "./Dossier";
import { usePrefersReducedMotion } from "./hooks";
import { KeyScope } from "./keymap";
import s from "./Sheet.module.css";

export interface SheetProps {
  open: boolean;
  onClose(): void;
  height: "auto" | "60%" | "80%" | "full";
  /** Accessible name of the sheet. */
  label: string;
  children: ReactNode;
  // ── extensions ──
  /** Content shown in the grab row, beside the handle (a sheet header). */
  header?: ReactNode;
  className?: string;
}

/** Drag distance (px) or speed (px/ms) past which a release closes the sheet. */
export const SWIPE_CLOSE_PX = 96;
export const SWIPE_CLOSE_SPEED = 0.6;

/** Whether a swipe-down gesture should close the sheet. */
export function swipeCloses(dy: number, ms: number, sheetHeight: number): boolean {
  if (dy <= 0) return false;
  const far = dy >= Math.min(SWIPE_CLOSE_PX, sheetHeight * 0.25);
  const fast = ms > 0 && dy / ms >= SWIPE_CLOSE_SPEED && dy > 16;
  return far || fast;
}

export function Sheet(props: SheetProps) {
  const { open } = props;
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    if (reduced) { setMounted(false); return; }
    setLeaving(true);
    const id = setTimeout(() => { setMounted(false); setLeaving(false); }, DUR.s);
    return () => clearTimeout(id);
  }, [open]);
  if (!mounted) return null;
  const body = <SheetBody {...props} leaving={leaving} />;
  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}

function SheetBody({ onClose, height, label, children, header, className, leaving }: SheetProps & { leaving: boolean }) {
  const { t } = useI18n();
  const side = useContext(UiRootContext)?.layout === "compact-landscape";
  const reduced = usePrefersReducedMotion();
  const panel = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; t: number; id: number; grab: boolean } | null>(null);
  const [dy, setDy] = useState(0);
  useFocusReturn(true, panel);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const target = e.target as Element | null;
    // A control in the header (e.g. the hand drawer's done button) gets its own click: it is neither a drag
    // start nor the grab (a tap on the grab closes the sheet).
    if (target?.closest?.("button, a[href], input, select, textarea, [role=button]") && !target.closest("[data-sheet-grab]")) return;
    const grab = !!target?.closest?.("[data-sheet-grab]");
    drag.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId, grab };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setDy(Math.max(0, e.clientY - d.y));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const moved = Math.max(0, e.clientY - d.y);
    // A tap on the grab closes (with pointer capture the click itself lands on the row).
    if (moved < 4 && d.grab) { setDy(0); onClose(); return; }
    const h = panel.current?.offsetHeight ?? 400;
    if (swipeCloses(moved, e.timeStamp - d.t, h)) { onClose(); return; }
    if (moved > 0 && !reduced) {
      const el = panel.current;
      el?.animate?.([{ transform: `translateY(${moved}px)` }, { transform: "translateY(0)" }], { duration: DUR.s, easing: EASE.out });
    }
    setDy(0);
  };

  return (
    <KeyScope modal onEscape={onClose}>
      <div className={[s.root, leaving ? s.leaving : "", side ? s.side : ""].filter(Boolean).join(" ")}>
        <div className={s.scrim} onPointerDown={onClose} aria-hidden="true" />
        <div
          ref={panel}
          className={[s.panel, s[`h_${height.replace("%", "")}`], className].filter(Boolean).join(" ")}
          style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={e => trapTab(e, panel.current)}
        >
          <div className={s.grabRow} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setDy(0); }}>
            <button type="button" className={s.grab} data-sheet-grab="" aria-label={t("ui_common:sheet.grab")} onClick={e => { if (e.detail === 0) onClose(); /* keyboard; pointer taps close in onUp */ }}>
              <span className={s.grabBar} />
            </button>
            {header ? <div className={s.header}>{header}</div> : null}
          </div>
          <div className={s.content}>{children}</div>
        </div>
      </div>
    </KeyScope>
  );
}
