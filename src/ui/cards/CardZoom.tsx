/**
 * The shared card zoom (ui-spec §7.5). `CardZoomHost` renders the provider's zoom state
 * (`UiRoot.zoomCard(card, from)`): on desktop / tablet a paper popover (z popover) with the image
 * 292×409 and a 236 px text panel (title, meta, the card text from data = current errata, play notes,
 * warnings), opening above its source, flipping to stay on screen and never over the orders slip; Esc,
 * a press elsewhere, or the source's own pointer-leave close it. On compact layouts it is the card sheet.
 */
import { useContext, type ReactNode } from "react";
import { useI18n } from "../../i18n/react";
import { Popover } from "../common/Popover";
import { OverlayContext, UiRootContext } from "../state/context";
import { CardFace } from "./CardFace";
import { CardMeta, CardText, PlayNotesList, useCardPlayNotes } from "./CardDetails";
import { CardSheet } from "./CardSheet";
import { useCardImageLang } from "./cardImages";
import type { PlayNotes } from "./playNotes";
import s from "./cards.module.css";

export interface CardZoomContentProps {
  card: number;
  notes?: PlayNotes;
}

/** Image + text panel (desktop zoom). */
export function CardZoomContent({ card, notes }: CardZoomContentProps) {
  const { t, cardName } = useI18n();
  const imageLang = useCardImageLang();
  return (
    <div className={s.zoom} data-card={card}>
      <CardFace card={card} width={292} eager className={s.zoomImg} />
      <div className={`${s.zoomText} ts-on-paper`}>
        <h3 className={s.zoomTitle}>{cardName(card)}</h3>
        <CardMeta card={card} />
        <CardText card={card} />
        {notes ? <PlayNotesList {...notes} tone="paper" /> : null}
        {imageLang === "en" ? <div className={s.errata}>{t("ui_common:zoom.errata")}</div> : null}
      </div>
    </div>
  );
}

export interface CardZoomHostProps {
  /** Compact card sheet: the prompt's answers for this card ("Play this card", mode rows…). */
  actions?: (card: number) => ReactNode;
}

export function CardZoomHost({ actions }: CardZoomHostProps) {
  const overlays = useContext(OverlayContext);
  const root = useContext(UiRootContext);
  const zoom = overlays?.zoom ?? null;
  if (!overlays || !zoom) return null;
  const compact = root ? root.layout === "compact" || root.layout === "compact-landscape" : false;
  if (compact) return <CardSheet card={zoom.card} onClose={overlays.closeZoom} actions={actions?.(zoom.card)} />;
  return <ZoomPopover card={zoom.card} from={zoom.from} onClose={overlays.closeZoom} />;
}

function ZoomPopover({ card, from, onClose }: { card: number; from: Element | null; onClose(): void }) {
  const root = useContext(UiRootContext);
  const { cardName, t } = useI18n();
  const notes = useCardPlayNotes(card);
  const slip = root?.anchors.rect("slip") ?? null;
  return (
    <Popover
      anchor={from && from.isConnected ? from : null}
      placement="top"
      tone="paper"
      arrow={false}
      onClose={onClose}
      avoid={slip ? [slip] : undefined}
      role="dialog"
      label={t("ui_common:zoom.label", { card: cardName(card) })}
      passThrough
      className={s.zoomPop}
    >
      <CardZoomContent card={card} notes={notes} />
    </Popover>
  );
}
