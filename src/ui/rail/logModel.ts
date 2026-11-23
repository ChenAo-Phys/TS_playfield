/**
 * The Dispatches model (ui-spec §6.3), pure: time codes, filters, turn separators and the current
 * play's entries. Display only; every text comes from the controller's `LogEntry` Messages.
 */
import type { LogEntry, Side } from "../../game/contract";
import type { Message } from "../../i18n";
import { eraOf, type Era } from "../console/model";

export type LogFilter = "all" | "plays" | "dice";
export const LOG_FILTERS: readonly LogFilter[] = ["all", "plays", "dice"];

/** "Setup" · "T5 HL" (headline phase) · "AR3" · "T5" (turn end, system lines outside a round). */
export type TimeCode =
  | { k: "setup" }
  | { k: "headline"; turn: number }
  | { k: "ar"; ar: number }
  | { k: "turn"; turn: number };

/** Kinds the "Plays" filter keeps (ui-spec §6.3). */
const PLAY_KINDS = new Set<LogEntry["kind"]>(["play", "headline", "event", "score", "turn"]);

const isRollMessage = (m: Message | undefined) => !!m && typeof m.key === "string" && m.key.startsWith("log:roll.");

/**
 * The "Dice" filter: entries with a die roll. The controller writes rolls as details of the play
 * (`log:roll.*`) rather than as `kind: "roll"` entries, so both count.
 */
export function isDiceEntry(e: LogEntry): boolean {
  return e.kind === "roll" || isRollMessage(e.text) || (e.details ?? []).some(isRollMessage);
}

export function passesFilter(e: LogEntry, f: LogFilter): boolean {
  if (f === "all") return true;
  if (f === "plays") return PLAY_KINDS.has(e.kind);
  return isDiceEntry(e);
}

/** Time codes for every entry, in log order (the setup is everything in turn 1 before the first headline). */
export function timeCodes(log: readonly LogEntry[]): TimeCode[] {
  let setup = true;
  return log.map(e => {
    if (e.turn !== 1 || e.ar > 0 || e.kind === "headline" || e.kind === "turn") setup = false;
    if (e.kind === "turn") return { k: "turn", turn: e.turn };
    if (e.ar > 0) return { k: "ar", ar: e.ar };
    if (setup) return { k: "setup" };
    // System lines outside a round (game over, resume) carry ar 0 but are not the headline's.
    if (e.kind === "system") return { k: "turn", turn: e.turn };
    return { k: "headline", turn: e.turn };
  });
}

export type LogRow =
  | { k: "sep"; key: string; turn: number; era: Era }
  | { k: "entry"; key: number; entry: LogEntry; code: TimeCode; current: boolean; caret: boolean };

/**
 * The rows to draw, oldest first: separators "— Turn 5 · Mid War —" before the first shown entry of
 * each turn, then the entries that pass the filter. The current play (`current` = the turn and AR being
 * played, null when no play is in progress) is the run of `play`/`event`/`roll`/`score` entries at that
 * turn and AR by the side of the newest one; they get the brass wash and the last one the caret.
 */
export function logRows(log: readonly LogEntry[], filter: LogFilter, current: { turn: number; ar: number } | null): LogRow[] {
  const codes = timeCodes(log);
  const live = new Set<number>();
  let caret = -1;
  if (current) {
    let side: Side | null | undefined;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i]!;
      if (e.turn !== current.turn || e.ar !== current.ar) break;
      if (e.kind === "turn" || e.kind === "headline" || e.kind === "system") break;
      if (side === undefined) side = e.side;
      if (e.side !== side) break;
      live.add(e.id);
      if (caret < 0) caret = e.id;
    }
  }
  const rows: LogRow[] = [];
  let lastTurn = -1;
  log.forEach((e, i) => {
    if (!passesFilter(e, filter)) return;
    if (e.turn !== lastTurn) {
      // An "End of turn N" line closes turn N; it never opens a new one.
      if (e.kind !== "turn") rows.push({ k: "sep", key: `t${e.turn}:${e.id}`, turn: e.turn, era: eraOf(e.turn) });
      lastTurn = e.turn;
    }
    rows.push({ k: "entry", key: e.id, entry: e, code: codes[i]!, current: live.has(e.id), caret: e.id === caret });
  });
  return rows;
}

/** The die faces a roll line reports (coup / space: `roll`; realignment: `usRoll`, `ussrRoll`). */
export function diceOf(m: Message): number[] {
  if (!isRollMessage(m)) return [];
  const p = (m.params ?? {}) as Record<string, unknown>;
  const out: number[] = [];
  for (const k of ["roll", "usRoll", "ussrRoll"]) {
    const v = p[k];
    if (typeof v === "number" && v >= 1 && v <= 6) out.push(v);
  }
  return out;
}
