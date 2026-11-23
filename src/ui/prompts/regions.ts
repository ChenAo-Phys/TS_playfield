/**
 * Regions as prompt answers (Chernobyl, ui-spec §8.11) and as the target list's groups (§8.13).
 * Region options carry the engine Region (Europe 0 … South America 5), which is also the map's
 * RegionSlot; Southeast Asia (slot 6) is a list group only.
 */
import { COUNTRIES } from "../../data";
import type { Prompt } from "../../game/contract";
import type { RegionSlot } from "../ui-contract";

/** Board order of the regions (the theatre bar, the target list): Europe, Middle East, Asia, SE Asia, Africa, C. & S. America. */
export const BOARD_SLOTS: readonly RegionSlot[] = [0, 2, 1, 6, 3, 4, 5];

/** The regions a region prompt offers, as map slots. */
export function regionTargetsOf(prompt: Prompt | null): Set<RegionSlot> {
  const out = new Set<RegionSlot>();
  if (!prompt || prompt.kind !== "region") return out;
  for (const o of prompt.options) if (o.kind === "region" && o.id >= 0 && o.id <= 5) out.add(o.id as RegionSlot);
  return out;
}

/** A country's list group: its region, or Southeast Asia (6) for the SE Asian countries. */
export function slotOfCountry(id: number): RegionSlot {
  const c = COUNTRIES[id];
  if (!c) return 0;
  return c.subregions.includes("SOUTHEAST_ASIA") ? 6 : (c.region as RegionSlot);
}

/** `ids` grouped by board region, each group in id order; empty groups left out. */
export function groupByRegion(ids: Iterable<number>): { slot: RegionSlot; ids: number[] }[] {
  const by = new Map<RegionSlot, number[]>();
  for (const id of ids) {
    const s = slotOfCountry(id);
    const list = by.get(s) ?? [];
    list.push(id);
    by.set(s, list);
  }
  return BOARD_SLOTS.filter(s => by.has(s)).map(s => ({ slot: s, ids: by.get(s)!.sort((a, b) => a - b) }));
}

/** The region a scoring card scores (0..5 engine Region, 6 Southeast Asia); null for other cards. */
export const SCORING_SLOT: Readonly<Record<number, RegionSlot>> = { 1: 1, 2: 0, 3: 2, 37: 4, 38: 6, 79: 3, 81: 5 };
