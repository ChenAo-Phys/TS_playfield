/**
 * The compact ticker (ui-spec §3.3, §9.5): a paper strip at the top of the map. While an AI play is
 * on (`aiPlayCard`), it is the 72 px play banner (thumbnail, "USSR · Action round 4", the card's name,
 * the how-chip); otherwise it shows the AI's last completed play in one line for 6 s, and hides when
 * the human acts. Tap → the log sheet.
 */
import { useEffect, useState } from "react";
import type { LogEntry, PlayHow, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { MessageText } from "../common/MessageText";
import { SideGlyph } from "../common/SideGlyph";
import { howWord } from "../prompts/labels";
import s from "./compact.module.css";

/** How long the one-line recap stays (ui-spec §3.3). */
export const TICKER_MS = 6000;

export interface TickerProps {
  /** The AI's last completed play (the last LogEntry with side === ai), or null. */
  entry: LogEntry | null;
  /** The AI card pinned for the current AI play (0 = none). */
  aiPlayCard: number;
  // ── extensions ──
  aiSide?: Side;
  /** How the pinned card is being played (from its reveal beat). */
  how?: PlayHow | null;
  /** The turn / action round of the AI play, for the banner kicker. */
  turn?: number;
  ar?: number;
  /** Hide the recap now (the human acted). */
  quiet?: boolean;
  onOpenLog?(): void;
  className?: string;
}

export function Ticker({ entry, aiPlayCard, aiSide = "US", how, ar = 0, quiet = false, onOpenLog, className }: TickerProps) {
  const { t, cardName } = useI18n();
  const [shownId, setShownId] = useState<number | null>(null);
  const id = entry?.id ?? null;
  useEffect(() => {
    if (id === null) return;
    setShownId(id);
    const timer = setTimeout(() => setShownId(v => (v === id ? null : v)), TICKER_MS);
    return () => clearTimeout(timer);
  }, [id]);
  useEffect(() => { if (quiet) setShownId(null); }, [quiet]);

  if (aiPlayCard) {
    const kicker = ar > 0
      ? t("ui_shell:ticker.ar", { side: t(`ui:side.${aiSide}`), ar })
      : t("ui_shell:ticker.headline", { side: t(`ui:side.${aiSide}`) });
    return (
      <button type="button" className={[s.ticker, s.banner, className].filter(Boolean).join(" ")} onClick={onOpenLog} aria-label={t("ui_shell:ticker.open")}>
        <CardFace card={aiPlayCard} width={40} className={s.bannerCard} />
        <span className={s.bannerText}>
          <span className={s.bannerKicker}><SideGlyph side={aiSide} size={11} /> {kicker}</span>
          <span className={s.bannerName}>{cardName(aiPlayCard)}</span>
        </span>
        {how ? <span className={s.howChip}>{howWord(t, how)}</span> : null}
      </button>
    );
  }
  if (!entry || shownId !== entry.id || quiet) return null;
  return (
    <button type="button" className={[s.ticker, className].filter(Boolean).join(" ")} onClick={onOpenLog} aria-label={t("ui_shell:ticker.open")}>
      <span className={s.tkSide}><SideGlyph side={aiSide} size={14} /></span>
      <span className={s.tkText}><MessageText message={entry.text} refs={false} /></span>
    </button>
  );
}
