/**
 * The piles (ui-spec §7.4): three stacked rows, 104 px wide (tablet: 76, icon only). Thumbnail 22 × 30
 * (deck = card back; discard = its top card; removed = its top card, greyscale), label and count.
 * Discard and Removed open the pile viewer (`onOpen`); the deck only shows its count. Anchors `deck`,
 * `discard`, `removed` (on the thumbnails). The deck count pulses when a beat asks (tray store).
 */
import { useContext } from "react";
import { useI18n } from "../../i18n/react";
import { CardBack } from "../cards/CardBack";
import { CardFace } from "../cards/CardFace";
import { RollingNumber } from "../common/RollingNumber";
import { UiRootContext } from "../state/context";
import { pileTop, type TrayVariant } from "./trayModel";
import { useTrayStore } from "./useTrayBeats";
import s from "./Piles.module.css";

export interface PilesProps {
  deck: number;
  discard: readonly number[];
  removed: readonly number[];
  onOpen(pile: "discard" | "removed"): void;
  // ── extensions ──
  /** desktop (default), tablet (icon only), panel (compact Status sheet: a row). */
  variant?: TrayVariant | "panel";
  className?: string;
}

export function Piles({ deck, discard, removed, onOpen, variant = "desktop", className }: PilesProps) {
  const { t } = useI18n();
  const root = useContext(UiRootContext);
  const store = useTrayStore();
  const thumbW = variant === "tablet" ? 18 : 22;
  const deckName = t("ui:pile.deck");
  const discardName = t("ui:pile.discard");
  const removedName = t("ui:pile.removed");
  const topDiscard = pileTop(discard);
  const topRemoved = pileTop(removed);
  const empty = <span className={s.emptyThumb} style={{ width: thumbW, height: Math.round(thumbW * 1.4) }} />;
  return (
    <div className={[s.piles, s[variant], className].filter(Boolean).join(" ")} role="group" aria-label={t("ui_tray:pile.group")}>
      <div className={s.pile} role="img" aria-label={t("ui_tray:pile.count", { pile: deckName, count: deck })} title={t("ui_tray:pile.count", { pile: deckName, count: deck })} data-pile="deck">
        <span className={s.thumb} ref={root?.anchors.ref("deck")}>{deck > 0 ? <CardBack width={thumbW} label="" /> : empty}</span>
        <span className={s.label} aria-hidden="true">{t("ui_tray:pile.short.deck")}</span>
        <b className={s.count} ref={store?.ref("deckCount")} aria-hidden="true"><RollingNumber value={deck} /></b>
      </div>
      <button
        type="button"
        className={`${s.pile} ${s.button}`}
        onClick={() => onOpen("discard")}
        aria-label={t("ui_tray:pile.open", { pile: discardName, count: discard.length })}
        title={t("ui_tray:pile.count", { pile: discardName, count: discard.length })}
        data-pile="discard"
      >
        <span className={s.thumb} ref={root?.anchors.ref("discard")}>{topDiscard ? <CardFace card={topDiscard} width={thumbW} className={s.thumbCard} /> : empty}</span>
        <span className={s.label} aria-hidden="true">{t("ui_tray:pile.short.discard")}</span>
        <b className={s.count} aria-hidden="true"><RollingNumber value={discard.length} /></b>
      </button>
      <button
        type="button"
        className={`${s.pile} ${s.button} ${s.removed}`}
        onClick={() => onOpen("removed")}
        aria-label={t("ui_tray:pile.open", { pile: removedName, count: removed.length })}
        title={t("ui_tray:pile.count", { pile: removedName, count: removed.length })}
        data-pile="removed"
      >
        <span className={s.thumb} ref={root?.anchors.ref("removed")}>{topRemoved ? <CardFace card={topRemoved} width={thumbW} className={s.thumbCard} /> : empty}</span>
        <span className={s.label} aria-hidden="true">{t("ui_tray:pile.short.removed")}</span>
        <b className={s.count} aria-hidden="true"><RollingNumber value={removed.length} /></b>
      </button>
    </div>
  );
}
