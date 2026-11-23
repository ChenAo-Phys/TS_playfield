/**
 * A counter that rolls vertically to its new value (odometer style): up when it grows, down when it
 * shrinks. Tabular figures (`.ts-num`). Reduced motion swaps the value at once. The current value is in
 * the accessibility tree once; the rolling strip is hidden from it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUR, EASE } from "../theme/motion";
import { formatNumber } from "./format";
import { usePrefersReducedMotion } from "./hooks";
import s from "./common.module.css";

export interface RollingNumberProps {
  value: number;
  /** Roll duration (default DUR.m = 380 ms). */
  ms?: number;
  /** "+2" / "−3" / "0" (U+2212 minus). */
  signed?: boolean;
  className?: string;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function RollingNumber({ value, ms = DUR.m, signed = false, className }: RollingNumberProps) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<{ value: number; from: number | null }>({ value, from: null });
  const strip = useRef<HTMLSpanElement | null>(null);

  useIsoLayoutEffect(() => {
    setShown(prev => {
      if (prev.value === value) return prev;
      if (reduced || ms <= 0) return { value, from: null };
      return { value, from: prev.from ?? prev.value };
    });
  }, [value, reduced, ms]);

  useEffect(() => {
    if (shown.from === null) return;
    const el = strip.current;
    const up = shown.value > shown.from;
    const frames = up
      ? [{ transform: "translateY(0)" }, { transform: "translateY(-50%)" }]
      : [{ transform: "translateY(-50%)" }, { transform: "translateY(0)" }];
    const done = () => setShown(cur => (cur.from === null ? cur : { value: cur.value, from: null }));
    if (!el || typeof el.animate !== "function") { done(); return; }
    const a = el.animate(frames, { duration: ms, easing: EASE.out, fill: "forwards" });
    a.onfinish = done;
    return () => { a.onfinish = null; a.cancel(); };
  }, [shown, ms]);

  const text = (n: number) => formatNumber(n, signed);
  const rolling = shown.from !== null;
  const rows = rolling ? (shown.value > shown.from! ? [shown.from!, shown.value] : [shown.value, shown.from!]) : [shown.value];
  return (
    <span className={[s.roll, "ts-num", className].filter(Boolean).join(" ")} data-value={value}>
      <span className="ts-vh">{text(value)}</span>
      <span className={s.rollWindow} aria-hidden="true">
        <span ref={strip} className={s.rollStrip}>
          {rows.map((n, i) => <span key={`${i}:${n}`} className={s.rollRow}>{text(n)}</span>)}
        </span>
        {/* Sizes the window to the widest of the rows (both stay in flow, invisible). */}
        <span className={s.rollSizer}>{rows.map(text).sort((a, b) => b.length - a.length)[0]}</span>
      </span>
    </span>
  );
}
