/**
 * The console's fit (ui-spec §3.3; QA Q-041, R3-06). Two bars squeeze in measured steps, each a CSS class on the bar
 * (`sq1`…`sqN`, cumulative), taken in order while something is cut. The steps never change the bar's text: both forms
 * of a readout are rendered and CSS shows one.
 *
 * The compact bar holds the turn / AR readout, the DEFCON numeral and the mini VP gauge in 360–430 px (or the 300 px
 * side column in landscape), in English, Chinese and the pseudo-language. The VP number is never cut: when the
 * readouts do not fit, it takes these steps (SQUEEZE_STEPS):
 *
 *   1  the VP lead's side word becomes its glyph ("USSR +13" → "☭ +13")
 *   2  the DEFCON numeral loses its "DEFCON" caption
 *   3  the AR readout's side word becomes its glyph ("AR 2 · ☭ (you)")
 *   4  the mini VP gauge loses its "VP" label (the bar, the glyph and the number stay)
 *
 * and only then the turn readout lines ellipsize (their full text is in the instrument's name and tooltip).
 *
 * The tablet bar (700 px wide and up; also any width under 640 px tall) keeps the language switch, ⚙ and ☰ on screen
 * by these steps (TABLET_SQUEEZE_STEPS), nothing lost before step 6; the condensed desktop bar (1200–1439 px) takes
 * the same steps when it needs them (Chinese and the pseudo-language below ~1290 px), its DEFCON caption and wordmark
 * subtitle going with steps 1 and 2:
 *
 *   1  DEFCON: the five lamps give way to the word "DEFCON" beside the numeral (the numeral already tells the level)
 *   2  the wordmark goes on two lines
 *   3  Action round: the pips go, the readout stays ("AR 2 · USSR (you)")
 *   4  VP: the label "VP", no end labels, the gauge as wide as its readout (96 px at least)
 *   5  the AR readout's and the VP lead's side words become their glyphs
 *   6  Turn: "6/10" without the era (the era is in the instrument's name and tooltip)
 *   7  the wordmark goes (the ☰ opens the same menu)
 *
 * Whether something is cut is measured, not guessed: the bar's content wider than the bar, or an element marked
 * `data-fit` whose text overflows it.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";

/** Steps of the compact bar. */
export const SQUEEZE_STEPS = 4;
/** Steps of the tablet bar. */
export const TABLET_SQUEEZE_STEPS = 7;

/** The next level after a measurement: one more step while something is cut and steps remain. */
export function nextSqueeze(level: number, cut: boolean, max = SQUEEZE_STEPS): number {
  return cut && level < max ? level + 1 : level;
}

/** What the measurement keys on: a new width or new text starts again from level 0. */
export function squeezeKey(width: number, text: string): string {
  return `${Math.round(width)}|${text}`;
}

/** Is any `[data-fit]` line inside `el` (or `el` itself) wider than its box? */
export function isCut(el: Element): boolean {
  const over = (e: Element) => e.scrollWidth > e.clientWidth + 0.5;
  if (over(el)) return true;
  for (const e of el.querySelectorAll("[data-fit]")) if (over(e)) return true;
  return false;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The squeeze level of the bar `ref` (0 when `enabled` is false), up to `max` steps. Measured before paint after
 * every render: a changed width or text resets to 0, then each cut takes one more step (a few synchronous renders at
 * most, no flicker). The level classes must not change the bar's text (both forms of a readout are rendered and CSS
 * shows one), so the key stays put while the steps are taken.
 */
export function useSqueeze(ref: RefObject<HTMLElement>, enabled: boolean, max = SQUEEZE_STEPS): number {
  const [level, setLevel] = useState(0);
  const key = useRef("");
  const [tick, remeasure] = useReducer((n: number) => n + 1, 0);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      key.current = "";
      if (level !== 0) setLevel(0);
      return;
    }
    const k = squeezeKey(el.clientWidth, el.textContent ?? "");
    if (k !== key.current) {
      key.current = k;
      if (level !== 0) { setLevel(0); return; }
    }
    const next = nextSqueeze(level, isCut(el), max);
    if (next !== level) setLevel(next);
  });

  // The bar's width (rotation, a resized window) and late web fonts change what fits.
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof window === "undefined") return;
    let live = true;
    const again = () => { if (live) { key.current = ""; remeasure(); } };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    ro?.observe(el);
    void document.fonts?.ready.then(again);
    return () => { live = false; ro?.disconnect(); };
  }, [enabled, ref]);

  void tick;
  return enabled ? Math.min(level, max) : 0;
}
