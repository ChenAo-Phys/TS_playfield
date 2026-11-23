/**
 * The screen-reader mirror of the log (ui-spec §12 "a log mirror that announces each AI play once"; QA
 * Q-045, Q-050). One visually hidden polite live region, mounted by the game screen in every arrangement
 * (desktop rail open or collapsed, tablet strip, phone), so the Dispatches panels keep none and nothing is
 * read twice.
 *
 * Each new entry by the AI is read once, as one message: its main line and every detail line (the die and
 * the result, DEFCON, VP, the space race...), so "US attempts Coup in Egypt" comes with "US rolls 1 ... Coup
 * failed ... DEFCON 3 → 2". The headline reveal, which sits in whichever side's entry committed second, is
 * read whoever's entry it is. Everything read is already in the public log (the controller redacts it).
 */
import { useEffect, useRef, useState } from "react";
import type { LogEntry, Side } from "../../game/contract";
import type { Message } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { messageParts, partsText } from "../common/MessageText";
import { useRailData } from "./useRailData";

/** Detail lines read from any side's entry: the simultaneous headline reveal and the order it resolves in. */
const ALWAYS_READ = new Set(["log:headline.revealed", "log:headline.order"]);

/** The lines to read for one log entry (empty: nothing to announce). */
export function announcedLines(entry: LogEntry, aiSide: Side): Message[] {
  if (entry.side === aiSide) return [entry.text, ...(entry.details ?? [])];
  return (entry.details ?? []).filter(m => typeof m.key === "string" && ALWAYS_READ.has(m.key));
}

/** Plain text of a message (names as text, inline markup dropped). */
export function plainText(m: Message): string {
  return partsText(messageParts(m)).replace(/\s+/g, " ").trim();
}

/** One announcement: the lines joined into sentences ("…". in English, "…。" in Chinese). */
export function announcementText(lines: readonly string[], stop: string): string {
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => (/[.!?。！？…]$/.test(l) ? l : l + stop.trim()))
    .join(stop.endsWith(" ") ? " " : "");
}

/** How many past announcements stay in the region (older ones are removed, which is not read). */
const KEEP = 8;

export function AiAnnouncer() {
  const { t } = useI18n();
  const d = useRailData();
  const [said, setSaid] = useState<{ id: number; text: string }[]>([]);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    const log = d.log;
    const newest = log.length ? log[log.length - 1]!.id : 0;
    // The first look (a game opened or resumed) reads nothing: only what happens from now on.
    if (lastId.current === null || newest < lastId.current) {
      lastId.current = newest;
      return;
    }
    const fresh = log.filter(e => e.id > lastId.current!);
    lastId.current = Math.max(lastId.current, newest);
    const stop = t("ui_console:log.announceStop");
    const out = fresh
      .map(e => ({ id: e.id, text: announcementText(announcedLines(e, d.aiSide).map(plainText), stop) }))
      .filter(a => a.text);
    if (out.length) setSaid(prev => [...prev, ...out].slice(-KEEP));
  }, [d.log, d.aiSide, t]);

  return (
    <div className="ts-vh" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("ui_console:log.announcer")}>
      {said.map(a => <p key={a.id}>{a.text}</p>)}
    </div>
  );
}
