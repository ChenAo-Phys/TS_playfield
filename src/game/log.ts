// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The action log's lines, kept as what they say rather than as text (port of DS game/log.ts without
 * its HTML rendering, which the React UI does): each is a Message with its cards, countries and
 * sides as ids, worded only where the log is shown, in the language of that moment.
 */
import { Message, MessageArg, MessageKey, message } from "../i18n";

/** The mark a line is indented under: a change to the board, a die, the headline reveal, a random
 *  discard, Missile Envy's exchange, a decision within a play. */
export type LogMark = "•" | "🎲" | "★" | "✂" | "⇄" | "▸";

export interface LogLine {
  msg: Message;
  mark?: LogMark;
}

export function logLine(mark: LogMark | undefined, key: MessageKey, params?: Record<string, MessageArg>): LogLine {
  return mark ? { mark, msg: message(key, params) } : { msg: message(key, params) };
}

export type CardArg = { card: number; name: string };
export type CountryArg = { country: number; name: string };

export const cardArg = (card: number, name: string): CardArg => ({ card, name });
export const countryArg = (country: number, name: string): CountryArg => ({ country, name });
export const sideArg = (side: string): MessageArg => ({ side });

export function signed(v: number): string {
  return v > 0 ? `+${v}` : `${v}`;
}

export function isCardArg(a: MessageArg | undefined): a is CardArg {
  return typeof a === "object" && a !== null && "card" in a;
}

function isMessage(a: MessageArg | undefined): a is Message {
  return typeof a === "object" && a !== null && "key" in a;
}

/** Every card id a message names, nested messages included. */
export function cardsIn(m: Message): number[] {
  const out: number[] = [];
  for (const a of Object.values(m.params ?? {})) {
    if (isCardArg(a)) out.push(a.card);
    else if (isMessage(a)) out.push(...cardsIn(a));
  }
  return out;
}

/** Several items as one parameter: "A, B, C" (`log:list`). */
export function list(items: MessageArg[]): MessageArg {
  if (items.length === 0) return "";
  return items.slice(0, -1).reduceRight<MessageArg>((rest, first) => message("log:list", { first, rest }), items[items.length - 1]);
}
