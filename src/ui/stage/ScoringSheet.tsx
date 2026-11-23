/**
 * The scoring sheet (ui-spec §10.2, final.css `.scoring`): a paper sheet docked inside the table on the
 * side away from the scored region (Europe, Middle East, Africa, Asia, SE Asia → left; the Americas →
 * right) while the region is spotlit, never under the AI's pinned reveal dock (which moves to the other corner, or
 * folds away). Header in the region ink (name + "Card #3"), a kicker for who
 * played it, the table US | USSR (status, countries, battlegrounds, adjacent, status VP, total; SE Asia:
 * one row per controlled country), rows filling top-down with rolling numerals, then the result bar
 * "USSR scores · Net USSR +3" (Europe control: game over, hazard underline), which registers the anchor
 * `scoring`. Waits for Continue with `pauseOnReveals`, else holds; the body scrolls (to the net bar when it
 * arrives) under a fixed Continue footer. The final scoring (after turn 10) is one combined sheet, a region per row,
 * then the China Card's +1 for its holder. The net is always the rows' net; when the VP track stopped the change at
 * ±20, a line under the bar says what was applied. Shuttle Diplomacy's missing battleground is noted under the table.
 *
 * `ScoringTable({ score })` is the table alone, for the map's region-plate popover too.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { RegionScore, RegionScores } from "../../engine/types";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { KeyScope } from "../common/keymap";
import { RollingNumber } from "../common/RollingNumber";
import { SideGlyph } from "../common/SideGlyph";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import { ContinueKeys } from "./HeadlinePapers";
import {
  boxOf, finalScoringRows, pickSheetSide, regionInk, scoringRows, sheetSide, SHUTTLE_DIPLOMACY, shuttleApplied, slotCountries, slotKey,
  vpLead, type Box, type ScoringRow,
} from "./model";
import { measureDock } from "./RevealDock";
import type { ScoringState } from "./stageStore";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./ScoringSheet.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ScoringSheet() {
  const store = useStageStore();
  useStageBeats(["scoring"], store);
  const sheet = useStageState(st => st.scoring, store);
  const waiting = useStageState(st => st.waiting, store) === "scoring";
  if (!sheet) return null;
  return <ScoringSheetView key={sheet.key} sheet={sheet} waiting={waiting} onContinue={store.proceed} />;
}

export interface ScoringSheetViewProps {
  sheet: ScoringState;
  waiting: boolean;
  onContinue(): void;
}

export function ScoringSheetView({ sheet, waiting, onContinue }: ScoringSheetViewProps) {
  const root = useUiRoot();
  const store = useStageStore();
  const { t, render, cardName, regionName } = useI18n();
  const btn = useRef<HTMLButtonElement | null>(null);
  const section = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const human = root.vm.humanSide;
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const final = sheet.card === 0;
  const slot = sheet.slot;
  const ink = slot !== null ? regionInk(slot) : { ink: "var(--ts-ink-900)", paperText: true };
  const region = slot !== null ? regionName(slotKey(slot)) : t("ui:scoring.final");
  const fill = sheet.phase === "in" ? "none" : sheet.phase === "rows" ? "timed" : "all";
  const net = sheet.vp;
  const winner = sheet.score?.wins ?? null;
  const [side, setSide] = useState(sheetSide(slot));

  // Away from the region on this map: measure the region's boxes against both docks. Then clear the AI's
  // pinned reveal dock off the sheet (R-006): it moves to the other corner, or folds away.
  useIsoLayoutEffect(() => {
    const el = section.current, host = el?.offsetParent as HTMLElement | null;
    if (!el || !host || compact) return;
    let at = side;
    const boxes = slot === null ? [] : slotCountries(slot).flatMap(c => { const r = root.anchors.rect(`country:${c}`); return r ? [boxOf(r)] : []; });
    if (slot !== null && boxes.length) {
      at = pickSheetSide(sheetSide(slot), boxOf(el.getBoundingClientRect()), boxOf(host.getBoundingClientRect()), boxes);
      setSide(at);
    }
    const dock = measureDock(host);
    if (dock) store.clearSheet(sheetBox(el, host, at !== side), { pos: dock.pos, here: boxOf(dock.here), there: boxOf(dock.there) });
  }, [sheet.key]);

  // The net bar (and the Europe-control line) scroll into view when they arrive, and again when the
  // Continue footer takes its room: on a phone the table is taller than the sheet, which scrolls.
  const showsNet = sheet.phase === "net" || sheet.phase === "read" || sheet.phase === "out";
  useEffect(() => {
    const box = scroller.current, last = end.current;
    if (!showsNet || !box || !last) return;
    const below = last.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (below > 0.5) box.scrollBy?.({ top: below, behavior: reduced ? "auto" : "smooth" });
  }, [showsNet, waiting, reduced]);

  useEffect(() => {
    if (!waiting || typeof document === "undefined") return;
    const opener = document.activeElement as HTMLElement | null;
    btn.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [waiting]);

  const kicker = final || !sheet.by ? null
    : sheet.by === human ? t("ui:scoring.kickerYou", { card: cardName(sheet.card) })
      : t("ui:scoring.kickerAi", { side: t(`ui:side.long.${sheet.by}`), card: cardName(sheet.card) });
  const scorer: Side | null = net > 0 ? "US" : net < 0 ? "USSR" : null;
  const style = {
    ["--reg" as string]: ink.ink,
    ["--reg-text" as string]: ink.paperText ? "var(--ts-paper-50)" : "var(--ts-band-text)",
    ["--in" as string]: `${sheet.ms.in}ms`,
    ["--net" as string]: `${sheet.ms.net}ms`,
  } as CSSProperties;
  const stop = (e: MouseEvent) => e.stopPropagation();
  const body = (
    <section
      ref={section}
      className={s.sheet}
      data-dock={compact ? "bottom" : side}
      data-phase={sheet.phase}
      data-reduced={reduced || undefined}
      style={style}
      role={waiting ? "dialog" : "group"}
      aria-modal={waiting || undefined}
      aria-label={final ? t("ui:scoring.final") : t("ui_stage:scoring.label", { region })}
      onClick={stop}
      onPointerDown={stop}
    >
      <div ref={scroller} className={s.scroll}>
        <header className={s.head}>
          <b>{region}</b>
          {final ? null : <span className="ts-num">{t("ui:scoring.cardNumber", { id: sheet.card })}</span>}
        </header>
        {kicker ? <p className={s.kicker}>{kicker}</p> : null}
        {final
          ? <FinalTable scores={sheet.scores} china={sheet.china ?? null} fill={fill} rowMs={sheet.ms.row} />
          : sheet.score ? <ScoringTable score={sheet.score} fill={fill} rowMs={sheet.ms.row} /> : null}
        {showsNet ? (
          // The anchor "scoring": the VP chip of a scoring card starts here (console, ui-spec §9.4 `vp`).
          <footer ref={root.anchors.ref("scoring")} className={s.result} data-side={scorer ?? "none"} data-wins={winner ?? undefined}>
            <span>{scorer ? t("ui:scoring.scores", { side: t(`ui:side.${scorer}`) }) : null}</span>
            <b className="ts-num">{scorer ? t("ui:scoring.net", { side: t(`ui:side.${scorer}`), n: Math.abs(net) }) : t("ui:track.vpEven")}</b>
          </footer>
        ) : null}
        {showsNet && typeof sheet.capped === "number" ? (
          <p className={s.capped}>{t("ui_stage:scoring.capped", { vp: render(vpLead(sheet.capped)) })}</p>
        ) : null}
        {winner && showsNet ? <p className={s.control}>{t("ui:scoring.europeControl")}</p> : null}
        <div ref={end} aria-hidden="true" />
      </div>
      {waiting ? (
        // Outside the scrolling body: Continue is always on screen, however tall the table.
        <div className={s.actions}>
          <Button ref={btn} variant="primary" onPaper kbd={t("ui:shortcuts.key.space")} onClick={onContinue}>{t("ui:slip.continue")}</Button>
        </div>
      ) : null}
    </section>
  );
  return <KeyScope active={waiting} modal onEscape={onContinue}><ContinueKeys enabled={waiting} onContinue={onContinue} />{body}</KeyScope>;
}

/**
 * The sheet's box in the viewport, mirrored when it is about to change sides: its layout box (not the
 * slide-in), down to the table's bottom, as it grows when the net bar and Continue arrive.
 */
function sheetBox(el: HTMLElement, host: HTMLElement, mirror: boolean): Box {
  const hr = host.getBoundingClientRect();
  const x0 = hr.left + host.clientLeft, y0 = hr.top + host.clientTop;
  const left = mirror ? host.clientWidth - el.offsetLeft - el.offsetWidth : el.offsetLeft;
  const y = y0 + el.offsetTop;
  return { x: x0 + left, y, w: el.offsetWidth, h: Math.max(el.offsetHeight, hr.bottom - y) };
}

export interface ScoringTableProps {
  score: RegionScore;
  /**
   * How the numbers appear: all at once (default), none yet (the sheet sliding in), or one row every
   * `rowMs` with rolling numerals (the scoring beat).
   */
  fill?: "all" | "none" | "timed";
  rowMs?: number;
  className?: string;
}

/**
 * A region's scoring breakdown, columns US | USSR (ui-spec §10.2). Also the body of the map's region-plate
 * popover: `<ScoringTable score={scoreOf(regionScores, slot)} />`.
 */
export function ScoringTable({ score, fill = "all", rowMs = 0, className }: ScoringTableProps) {
  const { t, cardName } = useI18n();
  // Shuttle Diplomacy took a USSR battleground out of the count: say so, or the table disagrees with the map.
  const note = shuttleApplied(score) ? t("ui_stage:scoring.shuttle", { card: cardName(SHUTTLE_DIPLOMACY) }) : undefined;
  return <SheetTable rows={scoringRows(score)} fill={fill} rowMs={rowMs} className={className} note={note} />;
}

/** Rows filled so far: all, none, or one more every `rowMs`. */
function useFilled(fill: "all" | "none" | "timed", rowMs: number, total: number): number {
  const [n, setN] = useState(fill === "all" ? total : 0);
  useEffect(() => {
    if (fill !== "timed" || rowMs <= 0) {
      setN(fill === "none" ? 0 : total);
      return;
    }
    setN(1);
    let i = 1;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= total) clearInterval(id);
    }, rowMs);
    return () => clearInterval(id);
  }, [fill, rowMs, total]);
  return fill === "all" ? total : n;
}

function SheetTable({ rows, fill, rowMs, className, firstHead, note }: {
  rows: ScoringRow[]; fill: "all" | "none" | "timed"; rowMs: number; className?: string; firstHead?: string; note?: string;
}) {
  const { t, render, countryName, regionName, cardName } = useI18n();
  const filledRows = useFilled(fill, rowMs, rows.length);
  return (
    <table className={[s.table, className].filter(Boolean).join(" ")}>
      <thead>
        <tr>
          <th scope="col">{firstHead ?? ""}</th>
          <th scope="col" className={s.us}><SideGlyph side="US" size={11} /> {t("ui:side.US")}</th>
          <th scope="col" className={s.ussr}><SideGlyph side="USSR" size={11} /> {t("ui:side.USSR")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const filled = i < filledRows;
          const label = "country" in r.label ? countryName(r.label.country)
            : "slot" in r.label ? regionName(slotKey(r.label.slot))
              : "card" in r.label ? cardName(r.label.card)
                : render(r.label);
          return (
            <tr key={r.key} className={r.total ? s.total : undefined} data-filled={filled || undefined}>
              <th scope="row">
                {label}
                {r.each ? <small className={s.each}>{t("ui_stage:scoring.each")}</small> : null}
                {r.sub ? <small className={s.each}>{render(r.sub)}</small> : null}
              </th>
              <Cell row={r} side="US" filled={filled} />
              <Cell row={r} side="USSR" filled={filled} />
            </tr>
          );
        })}
      </tbody>
      {note ? (
        <tfoot>
          <tr><td colSpan={3} className={s.note}>{note}</td></tr>
        </tfoot>
      ) : null}
    </table>
  );
}

function Cell({ row, side, filled }: { row: ScoringRow; side: Side; filled: boolean }) {
  const { t } = useI18n();
  const v = side === "US" ? row.us : row.ussr;
  const cls = side === "US" ? s.us : s.ussr;
  if (row.status) {
    const st = String(v ?? "NONE") as "NONE" | "PRESENCE" | "DOMINATION" | "CONTROL";
    return (
      <td className={cls}>
        <span className={s.chip} data-side={st === "NONE" ? "none" : side} data-filled={filled || undefined}>{t(`ui:scoring.statusName.${st}`)}</span>
      </td>
    );
  }
  if (v === null || v === undefined) return <td className={cls}><span className={s.dash}>—</span></td>;
  return (
    <td className={cls}>
      <RollingNumber value={filled ? Number(v) : 0} className={s.num} />
    </td>
  );
}

/** The combined final-scoring sheet: one region per row (subtotals), the China Card's +1, then the total. */
function FinalTable({ scores, china, fill, rowMs }: { scores: RegionScores | null; china: Side | null; fill: "all" | "none" | "timed"; rowMs: number }) {
  const { t } = useI18n();
  const { rows } = finalScoringRows(scores, china);
  return <SheetTable rows={rows} fill={fill} rowMs={rowMs} firstHead={t("ui_stage:scoring.region")} />;
}
