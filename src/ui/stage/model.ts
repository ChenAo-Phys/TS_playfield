/**
 * Pure helpers of the stage (ui-spec §9.4, §9.5, §10): what a die roll shows, which region a scoring
 * card scores, where a dock collapses to, where a dice tray may sit. No React, no DOM: unit-tested in
 * Node (tests/ui/stage/model.test.ts).
 *
 * Everything here formats engine data (`DieRollState`, `RegionScore`, frame events); nothing decides a
 * rule. Texts are `Message`s so a language switch redraws them.
 */
import type { DieRollState, RegionScore, RegionScores } from "../../engine/types";
import type { Frame, PlayHow, PublicState, Side } from "../../game/contract";
import { cardInfo, countryInfo, REGIONS, SUBREGIONS } from "../../data";
import { message, type Message, type MessageArg } from "../../i18n";
import { formatNumber, formatSigned } from "../common/format";
import type { AnchorId, RegionSlot } from "../ui-contract";

export const otherSide = (s: Side): Side => (s === "US" ? "USSR" : "US");
const SIDES: readonly Side[] = ["US", "USSR"];

/** A side's short label ("US" / 美国) as a deferred message argument. */
export const sideLabel = (s: Side): Message => message(`ui:side.${s}`);
/** A side's name in a sentence ("United States") as a deferred message argument. */
export const sideLong = (s: Side): Message => message(`ui:side.long.${s}`);

// ── Regions ───────────────────────────────────────────────────────────────────────────────────

/** The region slot a scoring card scores (from src/data: REGIONS / SUBREGIONS `scoringCard`), else null. */
export function scoringSlot(card: number): RegionSlot | null {
  const r = REGIONS.find(x => x.scoringCard === card);
  if (r) return r.id as RegionSlot;
  return SUBREGIONS.some(x => x.key === "SOUTHEAST_ASIA" && x.scoringCard === card) ? 6 : null;
}

/** The region-ink token of a slot (scoring-sheet header, ui-spec §2.1) and whether its text is paper. */
export function regionInk(slot: RegionSlot): { ink: string; paperText: boolean } {
  const ink = ["eue", "asia", "me", "af", "ca", "sa", "sea"][slot] ?? "me";
  return { ink: `var(--ts-reg-${ink})`, paperText: slot === 0 };
}

/** The engine area key of a slot, for `regionName()` ("EUROPE" … "SOUTHEAST_ASIA"). */
export function slotKey(slot: RegionSlot): string {
  return slot === 6 ? "SOUTHEAST_ASIA" : REGIONS[slot]?.key ?? "EUROPE";
}

/** Docked side of the scoring sheet: away from the region (ui-spec §10.2). */
export function sheetSide(slot: RegionSlot | null): "left" | "right" {
  return slot === 4 || slot === 5 ? "right" : "left";
}

/** The countries a region slot scores (Southeast Asia: its subregion). */
export function slotCountries(slot: RegionSlot): readonly number[] {
  return slot === 6 ? SUBREGIONS.find(x => x.key === "SOUTHEAST_ASIA")?.countries ?? [] : REGIONS[slot]?.countries ?? [];
}

/**
 * The side that keeps the region in view: the spec's side, unless the sheet docked on the other side
 * covers clearly less of the region's boxes on this map (`sheet` is the sheet's box docked on
 * `preferred`, mirrored inside `host` for the other side).
 */
export function pickSheetSide(preferred: "left" | "right", sheet: Box, host: Box, boxes: readonly Box[]): "left" | "right" {
  const mirrored = { ...sheet, x: host.x + host.w - (sheet.x - host.x) - sheet.w };
  const cover = (b: Box) => boxes.reduce((n, x) => n + area(b, x), 0);
  const here = cover(sheet), there = cover(mirrored);
  return there < here * 0.6 ? (preferred === "left" ? "right" : "left") : preferred;
}

// ── Turn track ────────────────────────────────────────────────────────────────────────────────

/** The era band of a turn as the board's turn track prints it. */
export function eraOf(turn: number): "early" | "mid" | "late" {
  return turn <= 3 ? "early" : turn <= 7 ? "mid" : "late";
}

/** The turns at which a new era's cards enter (the banner's era stamp). */
export function eraStampOf(turn: number): "mid" | "late" | null {
  return turn === 4 ? "mid" : turn === 8 ? "late" : null;
}

// ── Reveal dock ───────────────────────────────────────────────────────────────────────────────

/** Ops plays of an opponent card: its event also happens, for the card's owner (ui-spec §9.4 note). */
export function opponentNote(card: number, side: Side, how: PlayHow): Side | null {
  if (how !== "influence" && how !== "coup" && how !== "realign") return null;
  const owner = cardInfo(card)?.side;
  return owner === otherSide(side) ? owner : null;
}

/** Whether a play spends Ops (the dock's how line then shows the card's printed Ops). */
export function isOpsPlay(how: PlayHow): boolean {
  return how === "influence" || how === "coup" || how === "realign" || how === "space";
}

/**
 * Where the pinned dock collapses to: the anchor of the card's current location (ui-spec §9.5).
 * A card still in a hand or the deck (the play is not over) has no pile: the dock just fades.
 */
export function collapseAnchor(location: string | undefined): AnchorId | null {
  switch (location) {
    case "DISCARD_PILE": return "discard";
    case "REMOVED_FROM_GAME": return "removed";
    case "ONGOING_EVENT": return "effects";
    default: return null;
  }
}

// ── Dice ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The country a roll is about: coups, realignments and war cards name one (ids 0–83). Every other roll
 * has none, whatever its record's `country_id` holds (a Space Race roll stores the space box there, R-007).
 */
export function rollCountry(roll: DieRollState): number | null {
  const id = roll.country_id ?? 255;
  const named = Number.isInteger(id) && id >= 0 && id < 84;
  return named && (roll.type === "COUP" || roll.type === "REALIGNMENT" || roll.type === "WAR_EVENT") ? id : null;
}

/** Where the dice tray sits (ui-spec §9.4 `roll` row). */
export function diceAnchor(roll: DieRollState): AnchorId {
  const id = rollCountry(roll);
  if (id !== null) return `country:${id}`;
  if (roll.type === "SPACE_RACE" && (roll.roller === "US" || roll.roller === "USSR")) return `space:${roll.roller}`;
  return "stage";
}

export interface DieView {
  side: Side | "neutral";
  face: number;
  /** Modifier under the die ("+1", "−1"); absent when none applies. */
  mod?: string;
}

export interface DiceModel {
  /** "Coup · Israel", "Indo-Pakistani War · India", "Space race". */
  title: Message;
  /** US die left, USSR die right (ui-spec §0 principle 4). */
  dice: DieView[];
  /** The maths line ("5 + 1 Op − 2×1 = 4"), or null. */
  math: Message | null;
  /** Result parts, shown joined by " · " ("US −1 · USSR +3"). */
  result: Message[];
  /** Success tint (ok) / failure (steel); null when neither side "succeeds" (a tie). */
  ok: boolean | null;
}

const KIND: Record<string, string> = {
  COUP: "rolls:kind.coup", REALIGNMENT: "rolls:kind.realignment", SPACE_RACE: "rolls:kind.spaceRace", WAR_EVENT: "rolls:kind.war",
  OLYMPIC_GAMES: "rolls:kind.olympics", SUMMIT: "rolls:kind.summit", TRAP_ESCAPE: "rolls:kind.trap",
};

const asSide = (s: string | undefined): Side | null => (s === "US" || s === "USSR" ? s : null);

/** Influence change per side in a country over the frame (first `from` → last `to`), US first. */
export function influenceDeltas(frame: Frame | null, country: number): { side: Side; delta: number }[] {
  if (!frame) return [];
  const span = new Map<Side, { from: number; to: number }>();
  for (const e of frame.events) {
    if (e.t !== "influence" || e.country !== country) continue;
    const s = span.get(e.side);
    if (s) s.to = e.to;
    else span.set(e.side, { from: e.from, to: e.to });
  }
  return SIDES.flatMap(side => {
    const s = span.get(side);
    return s && s.to !== s.from ? [{ side, delta: s.to - s.from }] : [];
  });
}

/** The VP change of a frame as "{side} +n VP", or null. */
function vpPart(frame: Frame | null): Message | null {
  const e = frame?.events.find(x => x.t === "vp");
  if (!e || e.t !== "vp" || e.to === e.from) return null;
  const d = e.to - e.from;
  return message("ui_stage:dice.vp", { side: sideLabel(d > 0 ? "US" : "USSR"), n: Math.abs(d) });
}

/** The stability of a country in a state (engine name key), if known. */
function stabilityOf(state: PublicState | null, country: number): number | null {
  const name = countryInfo(country)?.engineName;
  const node = name ? (state?.countries as Record<string, { stability?: number }> | undefined)?.[name] : undefined;
  return typeof node?.stability === "number" ? node.stability : countryInfo(country)?.stability ?? null;
}

/**
 * What the dice tray shows for one engine roll record. `frame` is the frame the roll belongs to (its
 * influence / space / VP events give the result line); `before` the state before it (stability).
 */
export function diceModel(roll: DieRollState, frame: Frame | null, before: PublicState | null): DiceModel {
  const type = roll.type ?? "NONE";
  const country = rollCountry(roll) ?? 255;
  const named = country !== 255;
  const kind = KIND[type] ? message(KIND[type] as never) : message("rolls:kind.coup");
  const card = roll.card_id && roll.card_id > 0 ? roll.card_id : 0;
  const cardArg: MessageArg | null = card ? { card, name: cardInfo(card)?.title.en ?? roll.card_name ?? `#${card}` } : null;
  const cardTitle = cardArg ? message("ui_stage:dice.card", { card: cardArg }) : null;
  const countryArg: MessageArg | null = named ? { country, name: countryInfo(country)?.name.en ?? roll.country_name ?? "" } : null;
  const roller = asSide(roll.roller) ?? "US";
  const r1 = roll.roll1 ?? 0, m1 = roll.mod1 ?? 0, t1 = roll.total1 ?? r1 + m1;
  const r2 = roll.roll2 ?? 0, m2 = roll.mod2 ?? 0, t2 = roll.total2 ?? r2 + m2;
  const deltas = named ? influenceDeltas(frame, country) : [];
  const deltaParts = deltas.map(d => message("ui_stage:dice.delta", { side: sideLabel(d.side), delta: formatSigned(d.delta) }));
  const vp = vpPart(frame);
  const withVp = (parts: Message[]) => (vp ? [...parts, vp] : parts);

  switch (type) {
    case "COUP": {
      const stab = named ? stabilityOf(before, country) : null;
      const defense = stab !== null && stab * 2 === t2 ? `2×${stab}` : String(t2);
      const net = t1 - t2;
      return {
        title: countryArg ? message("ui_stage:dice.title", { kind, where: countryArg }) : kind,
        dice: [{ side: roller, face: r1 }],
        math: message("ui_stage:dice.coupMath", { roll: r1, count: m1, defense, net: formatNumber(net) }),
        result: deltaParts.length ? deltaParts : [message(roll.success ? "ui_stage:dice.success" : "ui_stage:dice.fail")],
        ok: !!roll.success,
      };
    }
    case "REALIGNMENT": {
      const removed = deltas.some(d => d.delta < 0);
      return {
        title: countryArg ? message("ui_stage:dice.title", { kind, where: countryArg }) : kind,
        dice: [{ side: "US", face: r1, mod: formatSigned(m1) }, { side: "USSR", face: r2, mod: formatSigned(m2) }],
        math: message("ui_stage:dice.versus", { us: t1, ussr: t2 }),
        result: deltaParts.length ? deltaParts : [message(t1 === t2 ? "ui_stage:dice.tie" : "ui_stage:dice.noChange")],
        ok: removed ? true : t1 === t2 ? null : false,
      };
    }
    case "SPACE_RACE": {
      const sp = frame?.events.find(e => e.t === "space" && e.side === roller);
      const result = roll.success && sp && sp.t === "space"
        ? message("ui_stage:dice.advances", { side: sideLabel(roller), box: sp.to })
        : message(roll.success ? "ui_stage:dice.success" : "ui_stage:dice.fail");
      return {
        title: kind,
        dice: [{ side: roller, face: r1 }],
        math: message("ui_stage:dice.needAtMost", { roll: r1, need: m1 }),
        result: withVp([result]),
        ok: !!roll.success,
      };
    }
    case "WAR_EVENT": {
      const where = countryArg ?? cardArg;
      return {
        title: cardTitle && countryArg ? message("ui_stage:dice.title", { kind: cardTitle, where: countryArg }) : where ? message("ui_stage:dice.title", { kind, where }) : kind,
        dice: [{ side: roller, face: r1 }],
        math: message("ui_stage:dice.needAtLeast", { roll: r1, mod: formatSigned(m1), total: t1, need: m2 }),
        result: withVp(deltaParts.length ? deltaParts : [message(roll.success ? "ui_stage:dice.success" : "ui_stage:dice.fail")]),
        ok: !!roll.success,
      };
    }
    case "OLYMPIC_GAMES": {
      // roll1 is the sponsor's (+2 as the engine applies it), roll2 the opponent's.
      const sponsor = roller, opp = otherSide(sponsor);
      const sp: DieView = { side: sponsor, face: r1, mod: formatSigned(t1 - r1) };
      const op: DieView = { side: opp, face: r2, mod: formatSigned(t2 - r2) };
      const [us, ussr] = sponsor === "US" ? [t1, t2] : [t2, t1];
      const winner: Side | null = us > ussr ? "US" : ussr > us ? "USSR" : null;
      return {
        title: cardTitle ?? kind,
        dice: sponsor === "US" ? [sp, op] : [op, sp],
        math: message("ui_stage:dice.versus", { us, ussr }),
        result: withVp([winner ? message("ui_stage:dice.wins", { side: sideLabel(winner) }) : message("ui_stage:dice.tie")]),
        ok: winner ? true : null,
      };
    }
    case "SUMMIT": {
      const winner: Side | null = t1 > t2 ? "US" : t2 > t1 ? "USSR" : null;
      return {
        title: cardTitle ?? kind,
        dice: [{ side: "US", face: r1, mod: formatSigned(m1) }, { side: "USSR", face: r2, mod: formatSigned(m2) }],
        math: message("ui_stage:dice.versus", { us: t1, ussr: t2 }),
        result: withVp([winner ? message("ui_stage:dice.wins", { side: sideLabel(winner) }) : message("ui_stage:dice.tie")]),
        ok: winner ? true : null,
      };
    }
    case "TRAP_ESCAPE": {
      return {
        title: kind,
        dice: [{ side: roller, face: r1 }],
        math: m2 > 0 ? message("ui_stage:dice.needAtMost", { roll: r1, need: m2 }) : null,
        result: [message(roll.success ? "ui_stage:dice.escapes" : "ui_stage:dice.trapped")],
        ok: !!roll.success,
      };
    }
    default:
      return {
        title: cardTitle ?? kind,
        dice: [{ side: asSide(roll.roller) ?? "neutral", face: r1 }],
        math: null,
        result: withVp([message(roll.success ? "ui_stage:dice.success" : "ui_stage:dice.fail")]),
        ok: roll.success ?? null,
      };
  }
}

// ── Headline ──────────────────────────────────────────────────────────────────────────────────

/**
 * The headline cancelled in this frame (Defectors): a committed headline card that leaves for a pile
 * without being played. 0 when none.
 */
export function cancelledHeadline(frame: Frame | null, us: number, ussr: number): number {
  if (!frame) return 0;
  for (const card of [us, ussr]) {
    if (!card) continue;
    const played = frame.events.some(e => e.t === "card-played" && e.card === card);
    const left = frame.events.some(e => e.t === "card-moved" && e.card === card && (e.to === "DISCARD_PILE" || e.to === "REMOVED_FROM_GAME"));
    if (left && !played) return card;
  }
  return 0;
}

// ── Scoring ───────────────────────────────────────────────────────────────────────────────────

export type ScoringRowKey = "status" | "countries" | "battlegrounds" | "adjacent" | "base" | "total";

/** The China Card (#6): its holder scores +1 VP at the final scoring (Scoring::execute_final_scoring). */
export const CHINA_CARD = 6;
/** Shuttle Diplomacy (#73): takes one USSR battleground out of the next Asia or Middle East scoring. */
export const SHUTTLE_DIPLOMACY = 73;
/** The end of the VP track: a VP change stops there (and the game ends). */
export const VP_TRACK_END = 20;

export interface ScoringRow {
  key: string;
  /**
   * Label: a message, a country (Southeast Asia rows), a region (the final-scoring sheet) or a card (the
   * China Card's row of the final scoring).
   */
  label: Message | { country: number } | { slot: RegionSlot } | { card: number };
  /** "+1 each" under the label. */
  each?: boolean;
  /** Another small line under the label (the China Card: "+1 VP for its holder"). */
  sub?: Message;
  us: number | string | null;
  ussr: number | string | null;
  /** Status chip side when the cell is a status. */
  status?: boolean;
  total?: boolean;
}

/**
 * The scoring sheet's rows for one region score (ui-spec §10.2), columns US | USSR. Southeast Asia
 * (no status): one row per controlled country with its VP, then the total.
 */
export function scoringRows(score: RegionScore): ScoringRow[] {
  const us = score.us, ussr = score.ussr;
  if (us.status === null && ussr.status === null) {
    const ids = [...new Set([...us.controlled.map(c => c.id), ...ussr.controlled.map(c => c.id)])];
    ids.sort((a, b) => a - b);
    const vpOf = (list: RegionScore["us"]["controlled"], id: number) => list.find(c => c.id === id)?.vp ?? null;
    return [
      ...ids.map(id => ({ key: `c${id}`, label: { country: id }, us: vpOf(us.controlled, id), ussr: vpOf(ussr.controlled, id) })),
      { key: "total", label: message("ui:scoring.total"), us: us.vp, ussr: ussr.vp, total: true },
    ];
  }
  return [
    { key: "status", label: message("ui:scoring.status"), us: us.status ?? "NONE", ussr: ussr.status ?? "NONE", status: true },
    { key: "countries", label: message("ui:scoring.countries"), us: us.countries, ussr: ussr.countries },
    { key: "battlegrounds", label: message("ui:scoring.battlegrounds"), us: us.battlegrounds, ussr: ussr.battlegrounds, each: true },
    { key: "adjacent", label: message("ui:scoring.adjacent"), us: us.adjacent, ussr: ussr.adjacent, each: true },
    { key: "base", label: message("ui:scoring.base"), us: us.base_vp ?? 0, ussr: ussr.base_vp ?? 0 },
    { key: "total", label: message("ui:scoring.total"), us: us.vp, ussr: ussr.vp, total: true },
  ];
}

/**
 * The combined final-scoring sheet (ui-spec §10.2, deviation 8 in docs/handoff/ui-stage.md): one row per
 * region (each side's VP there; Southeast Asia is part of Asia), the China Card's +1 VP for its holder,
 * then the total. `net` is the rows' US-positive net, what the engine adds to the VP before clamping
 * (Scoring::execute_final_scoring: the six regions, then the China Card).
 */
export function finalScoringRows(scores: RegionScores | null, chinaHolder: Side | null): { rows: ScoringRow[]; net: number } {
  const regions = (scores?.regions ?? []).filter(r => r.slot <= 5).sort((a, b) => a.slot - b.slot);
  const china = (s: Side) => (chinaHolder === s ? 1 : 0);
  const us = regions.reduce((n, r) => n + r.us.vp, 0) + china("US");
  const ussr = regions.reduce((n, r) => n + r.ussr.vp, 0) + china("USSR");
  const rows: ScoringRow[] = [
    ...regions.map(r => ({ key: `r${r.slot}`, label: { slot: r.slot as RegionSlot }, us: r.us.vp, ussr: r.ussr.vp })),
    ...(chinaHolder ? [{
      key: "china", label: { card: CHINA_CARD }, sub: message("ui_stage:scoring.chinaBonus"),
      us: chinaHolder === "US" ? 1 : null, ussr: chinaHolder === "USSR" ? 1 : null,
    }] : []),
    { key: "total", label: message("ui:scoring.total"), total: true, us, ussr },
  ];
  return { rows, net: us - ussr };
}

/**
 * The VP a scoring actually moved when the VP track stopped it at ±20, else null (the rows' net went
 * through whole). `net`: the sheet's net (its rows); `applied`: the engine's VP change; `after`: the VP
 * after it. A Europe-control win (VP set to ±20, more than the rows' net) is not a stop.
 */
export function cappedVp(net: number, applied: number, after: number): number | null {
  return applied !== net && Math.abs(after) >= VP_TRACK_END && Math.abs(applied) < Math.abs(net) && applied * net >= 0 ? applied : null;
}

/** Whether Shuttle Diplomacy took a USSR battleground out of this region's count (engine flag). */
export function shuttleApplied(score: RegionScore | null | undefined): boolean {
  return !!score?.ussr.shuttle_diplomacy;
}

/** Who played a card in a frame (the `card-played` event), else null. */
export function playedBy(frame: Frame | null, card: number): Side | null {
  const e = frame?.events.find(x => x.t === "card-played" && x.card === card);
  return e && e.t === "card-played" ? e.side : null;
}

/** A signed US-positive VP amount as "{side} +n" / "Even". */
export function vpLead(vp: number): Message {
  return vp === 0 ? message("ui:track.vpEven") : message("ui:track.vpLead", { side: sideLabel(vp > 0 ? "US" : "USSR"), vp: Math.abs(vp) });
}

// ── Geometry ──────────────────────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxOf = (r: { left: number; top: number; width: number; height: number }): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

export function overlaps(a: Box, b: Box, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

function area(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

/** `p` moved (as little as possible) so a `size` box at it lies inside `bounds` (top-left wins when it cannot). */
export function clampInside(p: { x: number; y: number }, size: { w: number; h: number }, bounds: Box): { x: number; y: number } {
  return {
    x: Math.max(bounds.x, Math.min(p.x, bounds.x + bounds.w - size.w)),
    y: Math.max(bounds.y, Math.min(p.y, bounds.y + bounds.h - size.h)),
  };
}

/**
 * What the AI's pinned reveal dock does while a scoring sheet is up, so the sheet is never under it
 * (R-006): it stays when it leaves the sheet free, moves to the other top corner of the table when the
 * sheet is free of it there (`there`: the dock's box on that side), else folds away (the narrow tablet
 * table holds both only on opposite sides). Boxes in one coordinate space; `margin` px of air.
 */
export function dockBesideSheet(sheet: Box, here: Box, there: Box, margin = 8): "stay" | "move" | "fold" {
  if (!overlaps(sheet, here, margin)) return "stay";
  return overlaps(sheet, there, margin) ? "fold" : "move";
}

/**
 * A spot for a tray of `size` hung from the top of `bounds` (at `y`) under a console anchor whose centre is
 * `cx` (the space track above the table): centred under it, kept inside the bounds and moved sideways just
 * clear of the `avoid` boxes it would lie under (the pinned reveal dock, R-006), the nearest such spot
 * first. Null when no spot along that edge is free.
 */
export function hangUnder(cx: number, size: { w: number; h: number }, bounds: Box, avoid: readonly Box[] = [], y = 12, gap = 8): { x: number; y: number } | null {
  const clampX = (x: number) => Math.max(bounds.x, Math.min(x, bounds.x + bounds.w - size.w));
  const free = (x: number) => !avoid.some(b => overlaps({ x, y, w: size.w, h: size.h }, b, gap));
  const x0 = clampX(cx - size.w / 2);
  if (free(x0)) return { x: x0, y };
  const xs = avoid.flatMap(b => [b.x - gap - size.w, b.x + b.w + gap]).map(clampX).filter(free);
  xs.sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0));
  return xs.length ? { x: xs[0]!, y } : null;
}

/**
 * A spot for a `size` box beside `anchor` inside `bounds` that covers neither the anchor nor any
 * `avoid` box: right of the anchor (nudged up), else left, below, above (centred, then edge-aligned).
 * When nothing is free, the spot inside the bounds that covers the anchor least, then the avoided
 * boxes least. All boxes in the same coordinates.
 */
export function placeBeside(anchor: Box, size: { w: number; h: number }, bounds: Box, avoid: readonly Box[] = [], gap = 18): { x: number; y: number } {
  const clamp = (p: { x: number; y: number }) => clampInside(p, size, bounds);
  const cy = anchor.y + anchor.h / 2 - size.h / 2;
  const cx = anchor.x + anchor.w / 2 - size.w / 2;
  const right = anchor.x + anchor.w + gap, left = anchor.x - gap - size.w;
  const below = anchor.y + anchor.h + gap / 2, above = anchor.y - gap / 2 - size.h;
  const tries = [
    { x: right, y: anchor.y - 6 }, { x: left, y: anchor.y - 6 },
    { x: cx, y: below }, { x: cx, y: above },
    { x: right, y: cy }, { x: left, y: cy },
    { x: anchor.x, y: below }, { x: anchor.x + anchor.w - size.w, y: below },
    { x: anchor.x, y: above }, { x: anchor.x + anchor.w - size.w, y: above },
  ];
  let best = clamp(tries[0]!), bestCost = Infinity;
  for (const t of tries) {
    const p = clamp(t);
    const box = { ...p, ...size };
    const cost = area(box, anchor) * 1000 + avoid.reduce((n, a) => n + area(box, { x: a.x - 4, y: a.y - 4, w: a.w + 8, h: a.h + 8 }), 0)
      + Math.abs(p.x - t.x) + Math.abs(p.y - t.y);
    if (cost === 0) return p;
    if (cost < bestCost) {
      best = p;
      bestCost = cost;
    }
  }
  return best;
}
