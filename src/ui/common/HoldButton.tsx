/**
 * Press-and-hold confirmation (ui-spec §8.2 "hold"): for choices that certainly end the game. A ring
 * (`--ts-danger`) fills around the button for `ms` (1.2 s); releasing early cancels. Pointer, Enter and
 * Space hold it; with `globalEnter` a held Enter anywhere does too (not while typing or on another
 * control). Reduced motion: the ring fills linearly, without easing. The button wears hazard stripes.
 * `forwardRef` to the button; `autoFocus` focuses it on mount (no scroll).
 */
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ForwardedRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useI18n } from "../../i18n/react";
import { DUR, EASE } from "../theme/motion";
import { usePrefersReducedMotion } from "./hooks";
import { useKey } from "./keymap";
import s from "./HoldButton.module.css";

export interface HoldButtonProps {
  /** Hold duration (default 1200 ms). */
  ms?: number;
  onConfirm(): void;
  children: ReactNode;
  /** Accessible name (what holding does). */
  label: string;
  // ── extensions ──
  /** Also hold with Enter while focus is elsewhere (the slip's primary action). */
  globalEnter?: boolean;
  disabled?: boolean;
  /** Paper (slip) or room surface; changes the focus ring. Default paper. */
  onPaper?: boolean;
  /** Called with true when a hold starts and false when it ends (confirmed or cancelled). */
  onHoldChange?(holding: boolean): void;
  /**
   * Take focus when mounted (without scrolling), so a held Enter reaches it: a hold option that was just
   * selected elsewhere (a map box, a hand card) moves focus here. Give the button a `key` per option.
   */
  autoFocus?: boolean;
  className?: string;
}

export const HOLD_MS = 1200;

function setRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const HoldButton = forwardRef<HTMLButtonElement, HoldButtonProps>(function HoldButton(
  { ms = HOLD_MS, onConfirm, children, label, globalEnter = false, disabled = false, onPaper = true, onHoldChange, autoFocus = false, className },
  ref,
) {
  const { t } = useI18n();
  const button = useRef<HTMLButtonElement | null>(null);
  const refFn = useCallback((el: HTMLButtonElement | null) => { button.current = el; setRef(ref, el); }, [ref]);
  useEffect(() => {
    if (autoFocus) button.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const reduced = usePrefersReducedMotion();
  const hintId = useId();
  const ring = useRef<SVGRectElement | null>(null);
  const anim = useRef<Animation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const changeRef = useRef(onHoldChange);
  changeRef.current = onHoldChange;

  const stop = useCallback((confirmed: boolean) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    const a = anim.current;
    anim.current = null;
    if (a) {
      if (confirmed) a.finish();
      else {
        // Drain the ring quickly so a release reads as "cancelled", not "frozen".
        try {
          a.pause();
          const el = ring.current;
          const now = el ? getComputedStyle(el).strokeDashoffset : null;
          a.cancel();
          if (el && now) el.animate([{ strokeDashoffset: now }, { strokeDashoffset: "100" }], { duration: DUR.xs, easing: EASE.out });
        } catch {
          a.cancel();
        }
      }
    }
    changeRef.current?.(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    changeRef.current?.(true);
    const el = ring.current;
    if (el && typeof el.animate === "function") {
      anim.current = el.animate([{ strokeDashoffset: "100" }, { strokeDashoffset: "0" }], {
        duration: ms, easing: reduced ? EASE.linear : EASE.in, fill: "forwards",
      });
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      stop(true);
      confirmRef.current();
    }, ms);
  }, [disabled, ms, reduced, stop]);

  useEffect(() => () => stop(false), [stop]);
  useEffect(() => { if (disabled) stop(false); }, [disabled, stop]);

  useKey("Enter", () => { start(); }, { enabled: globalEnter && !disabled });
  useKey("Enter", () => { if (!holdingRef.current) return false; stop(false); }, { enabled: globalEnter, event: "keyup", allowOnControls: true });

  const isHoldKey = (e: KeyboardEvent) => e.key === "Enter" || e.key === " ";
  return (
    <button
      ref={refFn}
      type="button"
      className={[s.hold, onPaper ? s.onPaper : s.onRoom, holding ? s.holding : "", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      data-holding={holding || undefined}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.button > 0) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        start();
      }}
      onPointerUp={() => stop(false)}
      onPointerCancel={() => stop(false)}
      onLostPointerCapture={() => stop(false)}
      onContextMenu={e => e.preventDefault()}
      onClick={e => e.preventDefault()}
      onKeyDown={e => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={e => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        stop(false);
      }}
      onBlur={() => stop(false)}
    >
      <svg className={s.ring} aria-hidden="true" focusable="false">
        <rect ref={ring} className={s.ringFill} x="1.5" y="1.5" rx="3" pathLength="100" strokeDasharray="100" strokeDashoffset="100" />
      </svg>
      <span className={s.content}>{children}</span>
      <span id={hintId} className={s.hint}>{t("ui_common:hold.hint")}</span>
    </button>
  );
});
