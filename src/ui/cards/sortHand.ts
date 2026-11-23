/**
 * Hand order (ui-spec §7.2): scoring cards first, then Ops descending, then id.
 */
import { cardInfo } from "../../data";

/** Comparator of the hand order. */
export function compareHand(a: number, b: number): number {
  const A = cardInfo(a), B = cardInfo(b);
  const sa = A?.scoring ? 1 : 0, sb = B?.scoring ? 1 : 0;
  if (sa !== sb) return sb - sa;
  const oa = A?.ops ?? 0, ob = B?.ops ?? 0;
  if (oa !== ob) return ob - oa;
  return a - b;
}

/** The cards in hand order (a new array). */
export function sortHand(cards: readonly number[]): number[] {
  return [...cards].sort(compareHand);
}

/**
 * Keep a hand's order stable within a turn: cards still held keep their relative order; new cards go
 * in at their sorted place among them. With no previous order this is `sortHand`.
 */
export function mergeHandOrder(prev: readonly number[], cards: readonly number[]): number[] {
  const held = new Set(cards);
  const out = prev.filter(c => held.has(c));
  const kept = new Set(out);
  for (const c of sortHand(cards.filter(c => !kept.has(c)))) {
    const at = out.findIndex(o => compareHand(c, o) < 0);
    if (at < 0) out.push(c);
    else out.splice(at, 0, c);
  }
  return out;
}
