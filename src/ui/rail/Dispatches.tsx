/**
 * Dispatches, the teleprinter log (ui-spec §6.3). Paper tape with perforated edges and a top fade,
 * newest at the bottom; it follows new entries unless you scrolled up, then a "Jump to latest ↓" pill
 * appears. One row per `LogEntry`: time code (`Setup`, `T5 HL`, `AR3`, `T5`) · the side's glyph · the
 * text (`MessageText`: cards and countries are hoverable refs: card zoom, map pulse) · details below.
 * Side bar on the left: US solid, USSR dashed (a pattern, not only colour), system a 1 px ink line. Turn
 * separators "— Turn 5 · Mid War —". The play in progress has a brass wash and a blinking caret.
 * Filters: All / Plays / Dice. The screen-reader mirror of new entries is the game screen's `AiAnnouncer`
 * (./Announcer), mounted once in every arrangement, so this panel has none.
 *
 * Keyboard (Q-049): the tape is one Tab stop (it scrolls with ↑ ↓ PgUp PgDn). → / ← step into the card and
 * country names on screen; from a name ↑ ↓ ← → move between names, Home / End go to the first / last,
 * Enter / Space open it (card zoom, map pulse) and Esc goes back to the tape. The names are not Tab stops.
 */
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { LogEntry, Side } from "../../game/contract";
import type { Message } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { MessageText } from "../common/MessageText";
import { SideGlyph } from "../common/SideGlyph";
import { diceOf, LOG_FILTERS, logRows, type LogFilter, type TimeCode } from "./logModel";
import s from "./Rail.module.css";

export interface DispatchesProps {
  log: readonly LogEntry[];
  humanSide: Side;
  /** The turn and AR being played (brass wash + caret), or null when no play is in progress. */
  current: { turn: number; ar: number } | null;
  // ── extensions ──
  /** Without the "Dispatches" header (a host sheet titles it). */
  bare?: boolean;
  className?: string;
}

/** Rows drawn before "Show earlier dispatches" (a full game logs ~1500 entries). */
export const LOG_WINDOW = 240;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function Code({ code }: { code: TimeCode }) {
  const { t } = useI18n();
  const text = code.k === "setup" ? t("ui_console:log.code.setup")
    : code.k === "headline" ? t("ui_console:log.code.headline", { turn: code.turn })
    : code.k === "turn" ? t("ui_console:log.code.turn", { turn: code.turn })
    : t("ui_console:log.code.ar", { ar: code.ar });
  return <span className={s.when}>{text}</span>;
}

function Detail({ m }: { m: Message }) {
  const dice = diceOf(m);
  return (
    <div className={s.det}>
      {dice.map((d, i) => <span key={i} className={s.dieIco} aria-hidden="true">{d}</span>)}
      {dice.length ? " " : null}
      <MessageText message={m} />
    </div>
  );
}

const Entry = memo(function Entry({ entry, code, current, caret }: { entry: LogEntry; code: TimeCode; current: boolean; caret: boolean }) {
  const side = entry.side;
  const cls = [s.le, side === "US" ? s.leUs : side === "USSR" ? s.leUssr : s.leSys, current ? s.now : ""].filter(Boolean).join(" ");
  return (
    <li className={cls} data-id={entry.id} data-kind={entry.kind}>
      <Code code={code} />{" "}
      {side ? <><SideGlyph side={side} className={side === "US" ? s.whoUs : s.whoUssr} />{" "}</> : null}
      <MessageText message={entry.text} />
      {(entry.details ?? []).map((d, i) => <Detail key={i} m={d} />)}
      {caret ? <span className={`${s.caret} ts-ambient`} aria-hidden="true" /> : null}
    </li>
  );
}, (a, b) => a.entry === b.entry && a.current === b.current && a.caret === b.caret && sameCode(a.code, b.code));

function sameCode(a: TimeCode, b: TimeCode): boolean {
  if (a.k !== b.k) return false;
  if (a.k === "ar") return a.ar === (b as typeof a).ar;
  if (a.k === "setup") return true;
  return a.turn === (b as typeof a).turn;
}

/** The card / country names inside a tape, in reading order. */
export function tapeRefs(root: ParentNode | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>("[data-card][role=button], [data-country][role=button]") ?? [])];
}

/** Where a key moves inside the tape: an index into the names, "tape" (back to the tape), or null (not ours). */
export function tapeMove(key: string, at: number, n: number, firstVisible: number, lastVisible: number): number | "tape" | null {
  if (!n) return null;
  if (at < 0) {
    // On the tape itself: ↑ ↓ scroll it; → / ← step into the names on screen.
    if (key === "ArrowRight") return Math.max(0, firstVisible);
    if (key === "ArrowLeft") return lastVisible >= 0 ? lastVisible : n - 1;
    return null;
  }
  switch (key) {
    case "ArrowDown": case "ArrowRight": return Math.min(n - 1, at + 1);
    case "ArrowUp": case "ArrowLeft": return Math.max(0, at - 1);
    case "Home": return 0;
    case "End": return n - 1;
    case "Escape": return "tape";
    default: return null;
  }
}

// `humanSide` (spec prop) is no longer read here: the announcer that needed it moved to the game screen.
export function Dispatches({ log, current, bare = false, className }: DispatchesProps) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<LogFilter>("all");
  const [all, setAll] = useState(false);
  const tape = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  const [away, setAway] = useState(false);
  const hintId = useId();

  const rows = useMemo(() => logRows(log, filter, current), [log, filter, current?.turn, current?.ar]);
  const shown = all || rows.length <= LOG_WINDOW ? rows : rows.slice(rows.length - LOG_WINDOW);
  const hidden = rows.length - shown.length;

  // Follow the newest entry unless the reader scrolled up. Only a scroll *up* unpins: content growing
  // under a pinned tape (new entries, fonts arriving, a language switch) keeps it pinned.
  const lastTop = useRef(0);
  const list = useRef<HTMLOListElement | null>(null);
  const toEnd = () => {
    const el = tape.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastTop.current = el.scrollTop;
  };
  useIsoLayoutEffect(() => {
    if (pinned.current) toEnd();
  }, [shown.length, log.length, filter, lang]);
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (pinned.current) toEnd(); });
    ro.observe(el);
    if (tape.current) ro.observe(tape.current);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = tape.current;
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    if (atEnd) pinned.current = true;
    else if (el.scrollTop < lastTop.current - 2) pinned.current = false;
    lastTop.current = el.scrollTop;
    if (!pinned.current !== away) setAway(!pinned.current);
  };
  const jump = () => {
    pinned.current = true;
    setAway(false);
    toEnd();
  };

  // The names in the tape are reached with the arrow keys, not Tab (one Tab stop for the whole log). The
  // shared CardRef / CountryRef are tab stops elsewhere, so the tape takes them out of the Tab order here.
  useIsoLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const quiet = () => { for (const r of tapeRefs(el)) if (r.tabIndex !== -1) r.tabIndex = -1; };
    quiet();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(quiet);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const onTapeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const box = tape.current;
    const refs = tapeRefs(list.current);
    const at = refs.indexOf(document.activeElement as HTMLElement);
    if (at < 0 && e.target !== box) return;
    let first = -1, last = -1;
    if (at < 0 && box) {
      const r = box.getBoundingClientRect();
      refs.forEach((el, i) => {
        const b = el.getBoundingClientRect();
        if (b.bottom > r.top && b.top < r.bottom) { if (first < 0) first = i; last = i; }
      });
    }
    const to = tapeMove(e.key, at, refs.length, first, last);
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (to === "tape") { box?.focus(); return; }
    const el = refs[to];
    el?.focus({ preventScroll: true });
    el?.scrollIntoView?.({ block: "nearest" });
  };

  return (
    <section className={[s.log, className].filter(Boolean).join(" ")} aria-label={t("ui:log.title")}>
      <div className={s.panelH}>
        {bare ? <span /> : <h2>{t("ui:log.title")}</h2>}
        <span className={s.filters} role="group" aria-label={t("ui_console:log.filters")}>
          {LOG_FILTERS.map(f => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); pinned.current = true; setAway(false); }}>
              {t(`ui:log.filter.${f}`)}
            </button>
          ))}
        </span>
      </div>
      <div className={s.tapeWrap}>
        <div
          className={`${s.tape} ts-on-paper`}
          ref={tape}
          onScroll={onScroll}
          onKeyDown={onTapeKey}
          tabIndex={0}
          aria-label={t("ui:log.title")}
          aria-describedby={hintId}
        >
          <ol ref={list} className={s.tapeInner}>
            {hidden > 0 ? (
              <li className={s.earlier}>
                <button type="button" onClick={() => setAll(true)}>{t("ui_console:log.showEarlier")}</button>
              </li>
            ) : null}
            {shown.length === 0 ? <li className={s.leEmpty}>{t("ui_console:log.empty")}</li> : null}
            {shown.map(r => r.k === "sep" ? (
              <li key={r.key} className={s.sep} aria-hidden="true">
                {t("ui:log.turnSep", { turn: r.turn, era: t(`ui:track.era.${r.era}`) })}
              </li>
            ) : (
              <Entry key={r.key} entry={r.entry} code={r.code} current={r.current} caret={r.caret} />
            ))}
          </ol>
        </div>
        <div className={s.tapeFade} aria-hidden="true" />
        {away ? (
          <button type="button" className={s.jump} onClick={jump}>
            {t("ui:log.jump")} <span aria-hidden="true">↓</span>
          </button>
        ) : null}
      </div>
      <span className="ts-vh" id={hintId}>{t("ui_console:log.keysHint")}</span>
    </section>
  );
}
