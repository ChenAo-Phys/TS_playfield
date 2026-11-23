/**
 * The compact card sheet (ui-spec §7.5 "Compact", §7.6): a bottom sheet at 80 % with the card image, its
 * title, meta, text, play notes and warnings, then `actions` (the prompt's answers for this card, given
 * by the prompts layer: "Play this card", "Headline this card", or the play-mode rows). A one-button answer
 * is a sticky footer, in view however short the screen (phones held sideways, 200 % zoom).
 */
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/react";
import { Sheet } from "../common/Sheet";
import { CardFace } from "./CardFace";
import { CardMeta, CardText, PlayNotesList, useCardPlayNotes } from "./CardDetails";
import { useCardImageLang } from "./cardImages";
import s from "./cards.module.css";

export interface CardSheetProps {
  card: number;
  onClose(): void;
  actions?: ReactNode;
}

export function CardSheet({ card, onClose, actions }: CardSheetProps) {
  const { t, cardName } = useI18n();
  const notes = useCardPlayNotes(card);
  const imageLang = useCardImageLang();
  return (
    <Sheet open onClose={onClose} height="80%" label={t("ui_common:zoom.label", { card: cardName(card) })}>
      <div className={s.sheetCard} data-card={card}>
        <div className={s.sheetTop}>
          <CardFace card={card} width={148} eager className={s.sheetImg} />
          <div className={s.sheetHead}>
            <h2 className={s.sheetTitle}>{cardName(card)}</h2>
            <div className={s.sheetMeta}><CardMeta card={card} /></div>
            <div className={s.sheetText}><CardText card={card} /></div>
          </div>
        </div>
        <PlayNotesList {...notes} tone="room" />
        {imageLang === "en" ? <div className={`${s.errata} ${s.errataRoom}`}>{t("ui_common:zoom.errata")}</div> : null}
        {actions ? <div className={s.sheetActions}>{actions}</div> : null}
      </div>
    </Sheet>
  );
}
