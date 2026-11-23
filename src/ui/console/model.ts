/**
 * Pure helpers for the console instruments (ui-spec §5). Display only: legality and previews come from
 * the controller; the few facts drawn here (eras by turn, the AR count) come from the board or from
 * src/game/rules.
 */
import type { Ending, LogEntry, PublicState, Side } from "../../game/contract";
import { maxActionRound } from "../../game/rules";
import { displayTurnAr } from "../common/turnAr";
import type { Message } from "../../i18n";

export type Era = "early" | "mid" | "late";

/** The war period printed on the turn track: turns 1–3, 4–7, 8–10. */
export function eraOf(turn: number): Era {
  return turn <= 3 ? "early" : turn <= 7 ? "mid" : "late";
}

/** The turns at which a new era's cards enter the deck (the board's turn track). */
export const ERA_START: Readonly<Record<Exclude<Era, "early">, number>> = { mid: 4, late: 8 };

/** Who leads on the VP track (positive = US) and by how much. */
export function vpLead(vp: number): { side: Side | null; n: number } {
  return vp > 0 ? { side: "US", n: vp } : vp < 0 ? { side: "USSR", n: -vp } : { side: null, n: 0 };
}

/** Needle position on the gauge, % from the left: US 20 at 0 %, USSR 20 at 100 % (ui-spec §5). */
export function vpNeedle(vp: number): number {
  const v = Math.max(-20, Math.min(20, vp));
  return 50 - v * 2.5;
}

export function clampDefcon(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

// ── Action rounds ────────────────────────────────────────────────────────────────────────────

/** One side's half of an AR pip: played, being played, still to come, or not this side's (AR 8). */
export type HalfState = "done" | "now" | "future" | "na";

export interface ArPip {
  n: number;
  US: HalfState;
  USSR: HalfState;
  /** The 8th round, available to one side only (dashed). */
  optional: boolean;
}

export interface ArModel {
  pips: ArPip[];
  /**
   * "ar" while action rounds run; the headline / setup phases show their name instead; "end" once the
   * last round of the turn is played (the cleanup between turns) and after the game ended (`displayTurnAr`, Q-031).
   */
  phase: "ar" | "headline" | "setup" | "end" | "other";
  ar: number;
  /** The turn to show (`displayTurnAr`: the ending's turn once over, never past 10). */
  turn: number;
  side: Side | null;
  max: Record<Side, number>;
}

/**
 * The AR track: `max(maxActionRound)` pips (6 in turns 1–3, else 7; 8 when a side has AR 8, dashed when
 * only one does), each split US left · USSR right. The USSR moves first in a round, so at AR k with the
 * US phasing the USSR half of pip k is already played. `over` replaces the round and phasing side
 * while an `action-round` beat animates.
 */
export function arModel(state: PublicState, over?: { ar: number; side: Side } | null, ending?: Pick<Ending, "turn"> | null): ArModel {
  const max: Record<Side, number> = { US: maxActionRound(state, "US"), USSR: maxActionRound(state, "USSR") };
  const count = Math.max(max.US, max.USSR);
  const name = state.current_phase_name;
  const ar = over?.ar ?? state.action_round;
  const at = displayTurnAr(state, ending);
  const named: ArModel["phase"] = over ? "ar"
    : name === "ACTION_ROUND" ? "ar" : name === "HEADLINE" ? "headline" : name === "SETUP" ? "setup" : "other";
  // Past the turn's last round, or the game over (its counters run past the end: "AR 9", "turn 11"): the end of the
  // turn (Q-031). An action-round phase before its first round keeps "ar" (an empty readout).
  const phase: ArModel["phase"] = over ? "ar"
    : named === "ar" && ar > count ? "end"
    : at.phase === "end" && (ending != null || named === "other") ? "end"
    : named;
  const p = over?.side ?? state.phasing_player;
  const side: Side | null = p === "US" || p === "USSR" ? p : null;
  // A game that ended inside a round (DEFCON, 20 VP, resignation…) keeps its played pips; a finished turn shows all.
  const pipPhase = phase === "end" && named === "other" && ending != null && ending.turn === state.turn && ar >= 1 && ar <= count ? "other" : phase;
  const half = (n: number, s: Side): HalfState => {
    if (n > max[s]) return "na";
    if (pipPhase === "end") return "done";
    if (pipPhase !== "ar" && pipPhase !== "other") return "future";
    if (n < ar) return "done";
    if (n > ar) return "future";
    if (side === s) return pipPhase === "ar" ? "now" : "done";
    return s === "USSR" && side === "US" ? "done" : "future";
  };
  const pips: ArPip[] = [];
  for (let n = 1; n <= count; n++) {
    pips.push({ n, US: half(n, "US"), USSR: half(n, "USSR"), optional: n === 8 && Math.min(max.US, max.USSR) < 8 });
  }
  return { pips, phase, ar, turn: at.turn, side, max };
}

// ── Space race ───────────────────────────────────────────────────────────────────────────────

/** Track boxes 0–8 by name (catalog `tracks:spaceBox.*`). */
export const SPACE_BOX_KEYS = [
  "launchpad", "earthSatellite", "animalInSpace", "manInSpace", "manInEarthOrbit", "lunarOrbit", "eagleBearHasLanded",
  "spaceShuttle", "spaceStation",
] as const;
export type SpaceBoxKey = (typeof SPACE_BOX_KEYS)[number];

/** The boxes printed with a privilege (catalog `tracks:privilegeShort.*`). */
export const SPACE_PERK_BOXES: Readonly<Record<number, "animalInSpace" | "manInEarthOrbit" | "eagleBearHasLanded" | "spaceStation">> = {
  2: "animalInSpace", 4: "manInEarthOrbit", 6: "eagleBearHasLanded", 8: "spaceStation",
};

export function spaceBoxKey(box: number): SpaceBoxKey | null {
  return SPACE_BOX_KEYS[box] ?? null;
}

/** The privilege boxes a side has reached. */
export function perksReached(box: number): number[] {
  return Object.keys(SPACE_PERK_BOXES).map(Number).filter(b => b <= box);
}

// ── Mil ops ──────────────────────────────────────────────────────────────────────────────────

/** How far a side is below the DEFCON level on the mil-ops track (display only, gap G10). */
export function milOpsShort(milOps: number, required: number): number {
  return Math.max(0, required - milOps);
}

// ── VP history (tooltip sparkline, game-over chart) ──────────────────────────────────────────

export interface VpPoint {
  turn: number;
  vp: number;
}

/** The VP a `log:vpScore.*` Message stands for (positive = US), or null. */
function vpOfScore(m: unknown): number | null {
  if (!m || typeof m !== "object" || !("key" in m)) return null;
  const { key, params } = m as Message;
  const n = Number((params as Record<string, unknown> | undefined)?.n ?? 0);
  if (key === "log:vpScore.us") return n;
  if (key === "log:vpScore.ussr") return -n;
  if (key === "log:vpScore.tie") return 0;
  return null;
}

function* vpChanges(m: Message | undefined): Generator<number> {
  if (!m) return;
  if (m.key === "log:change.vp") {
    const to = vpOfScore((m.params as Record<string, unknown> | undefined)?.to);
    if (to !== null) yield to;
  }
}

/**
 * VP at the end of each finished turn, read from the log (the `log:change.vp` lines; the log is rebuilt
 * on resume, so the history survives a reload), plus `now` for the turn in progress.
 */
export function vpHistory(log: readonly LogEntry[], now?: VpPoint | null): VpPoint[] {
  const out: VpPoint[] = [];
  let vp = 0;
  for (const e of log) {
    for (const v of vpChanges(e.text)) vp = v;
    for (const d of e.details ?? []) for (const v of vpChanges(d)) vp = v;
    if (e.kind === "turn") {
      const last = out[out.length - 1];
      if (last && last.turn === e.turn) last.vp = vp;
      else out.push({ turn: e.turn, vp });
    }
  }
  if (now) {
    const last = out[out.length - 1];
    if (!last || last.turn < now.turn) out.push({ ...now });
    else if (last.turn === now.turn) last.vp = now.vp;
  }
  return out;
}
