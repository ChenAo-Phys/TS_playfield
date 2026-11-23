/**
 * The parts of a card's details shared by the zoom (paper) and the compact card sheet (room): meta line,
 * text with its printed labels, play notes and warnings, and the hook that gathers the play notes.
 */
import { useContext, type ReactNode } from "react";
import { cardInfo, cardTextLines, dataLang } from "../../data";
import { engineLayout } from "../../engine/layout";
import { warningMessage } from "../../game/messages";
import type { Side, Warning } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { MessageText } from "../common/MessageText";
import { SideGlyph } from "../common/SideGlyph";
import { UiRootContext } from "../state/context";
import { cardPlayNotes, type PlayNotes } from "./playNotes";
import s from "./cards.module.css";

/** Play notes for a card at the current prompt (empty outside a UiRoot or without a relevant prompt). */
export function useCardPlayNotes(card: number): PlayNotes {
  const root = useContext(UiRootContext);
  if (!root) return { notes: [], warnings: [] };
  const { vm, controller } = root;
  const prompt = vm.prompt;
  let effectiveOps: number | null = null;
  if (prompt && (prompt.cards.includes(card) || prompt.pendingCard === card)) {
    try { effectiveOps = controller.effectiveOps(card); } catch { effectiveOps = null; }
  }
  return cardPlayNotes({
    card, prompt, humanSide: vm.humanSide,
    space: vm.frame?.state.space ?? null,
    effectiveOps,
    spaceBoxes: engineLayout()?.space_boxes ?? null,
  });
}

/** "#74 · ★ US · 2 Ops · Mid War" */
export function CardMeta({ card }: { card: number }) {
  const { t, sideName } = useI18n();
  const info = cardInfo(card);
  if (!info) return null;
  const side = info.side === "NEUTRAL" ? null : (info.side as Side);
  const parts: ReactNode[] = [
    <span key="n" className="ts-num">{t("ui:card.number", { id: card })}</span>,
    side ? <span key="s" className={side === "US" ? s.metaUs : s.metaUssr}><SideGlyph side={side} /> {sideName(side)}</span> : <span key="s">{t("ui_common:zoom.neutral")}</span>,
    <span key="o">{info.scoring ? t("ui:card.scoring") : t("ui:card.ops", { ops: info.ops })}</span>,
    <span key="e">{t(`ui:track.era.${info.era}`)}</span>,
  ];
  return (
    <div className={s.meta}>
      {parts.map((p, i) => <span key={i} className={s.metaPart}>{i ? <span className={s.metaDot} aria-hidden="true">·</span> : null}{p}</span>)}
    </div>
  );
}

/** The card's text (data, current errata) with its printed labels (removed after event, may not be held). */
export function CardText({ card }: { card: number }) {
  const { t, lang } = useI18n();
  const info = cardInfo(card);
  if (!info) return null;
  const text = info.text[dataLang(lang)];
  const lines = cardTextLines(text);
  const labels: string[] = [];
  if (info.scoring) {
    const held = t("ui:card.mayNotBeHeld");
    if (!text.toLowerCase().includes(held.replace(/[⟦⟧!！]/g, "").toLowerCase())) labels.push(held);
    if (info.starred) labels.push(t("ui:card.removeAfterScoring"));
  } else if (info.starred) labels.push(t("ui:card.removeAfterEvent"));
  return (
    <div className={s.cardText}>
      {lines.map((line, i) => (
        <p key={i}>{line.map((span, j) => (span.em ? <em key={j}>{span.text}</em> : <span key={j}>{span.text}</span>))}</p>
      ))}
      {labels.map(l => <p key={l} className={s.cardLabel}>{l}</p>)}
    </div>
  );
}

/** Play notes and warnings (shared by the zoom and the card sheet). */
export function PlayNotesList({ notes, warnings, tone }: PlayNotes & { tone: "paper" | "room" }) {
  const { t } = useI18n();
  if (!notes.length && !warnings.length) return null;
  return (
    <div className={`${s.notes} ${tone === "room" ? s.notesRoom : ""}`}>
      {notes.length ? <div className={s.notesTitle}>{t("ui_common:zoom.notes.title")}</div> : null}
      {notes.map(n => (
        <div key={n.kind} className={s.note} data-note={n.kind}>
          {n.label ? <span className={s.noteLabel}><MessageText message={n.label} refs={false} /></span> : null}
          <span className={[s.noteValue, n.side === "US" ? s.metaUs : n.side === "USSR" ? s.metaUssr : "", n.label ? "" : s.noteWide].join(" ")}>
            {typeof n.value === "string" ? <span className="ts-num">{n.value}</span> : <MessageText message={n.value} refs={false} />}
            {n.detail ? <span className={s.noteDetail}><MessageText message={n.detail} refs={false} /></span> : null}
          </span>
        </div>
      ))}
      {warnings.map((w, i) => <WarnLine key={`${w.code}${i}`} warning={w} />)}
    </div>
  );
}

function WarnLine({ warning }: { warning: Warning }) {
  const p = warning.params ?? {};
  const fatal = warning.code === "defcon-suicide" || warning.code === "cmc-suicide" || warning.code === "game-ending";
  const certain = fatal && (typeof p.faces !== "number" || p.faces >= 6);
  return (
    <div className={[s.warnline, warning.code === "opponent-event" ? s.warnInfo : certain ? s.warnFatal : ""].join(" ")} data-warning={warning.code}>
      <span className={s.hazard} aria-hidden="true" />
      <span><MessageText message={warningMessage(warning)} refs={false} /></span>
    </div>
  );
}
