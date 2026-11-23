/**
 * The human's headline slot (ui-spec §8.6 headline, §10.1): after the commit the card sits face down at
 * the left end of the hand with a "COMMITTED" stamp until the headlines are revealed (then face up,
 * "REVEALED", until it resolves). The human knows the card: hover / Space / long press zoom it.
 * Anchor `headline:<human>`. Renders nothing when there is no card.
 */
import { useContext, useRef, type KeyboardEvent } from "react";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardBack } from "../cards/CardBack";
import { CardFace } from "../cards/CardFace";
import { useHoverIntent, useLongPress } from "../common/hooks";
import { Stamp } from "../common/Stamp";
import { OverlayContext, UiRootContext } from "../state/context";
import type { TrayVariant } from "./trayModel";
import { useTrayStore } from "./useTrayBeats";
import s from "./HeadlineSlot.module.css";

export interface HeadlineSlotProps {
  card: number | null;
  faceDown: boolean;
  // ── extensions ──
  variant?: TrayVariant;
  /** Default: the root's `vm.humanSide`. */
  humanSide?: Side | null;
  className?: string;
}

export function HeadlineSlot({ card, faceDown, variant = "desktop", humanSide, className }: HeadlineSlotProps) {
  const { t, cardName } = useI18n();
  const root = useContext(UiRootContext);
  const overlays = useContext(OverlayContext);
  const store = useTrayStore();
  const human = humanSide ?? root?.vm.humanSide ?? null;
  const el = useRef<HTMLDivElement | null>(null);
  const latest = useRef(overlays);
  latest.current = overlays;
  const byHover = useRef(false);
  const zoomIsMine = () => !!card && latest.current?.zoom?.card === card && latest.current.zoom.from === el.current;
  const openZoom = () => {
    if (!root || !card) return;
    byHover.current = false;
    hover.cancel();
    root.zoomCard(card, el.current);
  };
  const hover = useHoverIntent(250, {
    enabled: !!root && !!card,
    onStart: () => { if (card) { byHover.current = true; root?.zoomCard(card, el.current); } },
    onEnd: () => {
      if (byHover.current && zoomIsMine()) latest.current?.closeZoom();
      byHover.current = false;
    },
  });
  const press = useLongPress(350, () => openZoom(), { enabled: !!root });
  if (!card) return null;

  const w = variant === "tablet" ? 70 : 84;
  const toggle = () => { if (zoomIsMine() && !byHover.current) latest.current?.closeZoom(); else openZoom(); };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) toggle();
    }
  };
  const anchor = human ? root?.anchors.ref(`headline:${human}`) : undefined;
  const slotRef = (node: HTMLDivElement | null) => {
    anchor?.(node);
    store?.ref("headline")(node);
  };
  return (
    <div className={[s.slot, s[variant], className].filter(Boolean).join(" ")} data-face={faceDown ? "down" : "up"}>
      <div ref={slotRef} className={s.cardBox}>
        <div
          ref={el}
          className={s.card}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label={t(faceDown ? "ui_tray:headline.aria.committed" : "ui_tray:headline.aria.revealed", { card: cardName(card) })}
          onClick={toggle}
          onKeyDown={onKeyDown}
          onPointerEnter={hover.bind.onPointerEnter}
          onPointerLeave={e => { hover.bind.onPointerLeave(e); press.bind.onPointerLeave(); }}
          onPointerDown={e => { hover.bind.onPointerDown(e); press.bind.onPointerDown(e); }}
          onPointerMove={press.bind.onPointerMove}
          onPointerUp={press.bind.onPointerUp}
          onPointerCancel={press.bind.onPointerCancel}
          onContextMenu={press.bind.onContextMenu}
          onClickCapture={press.bind.onClickCapture}
        >
          {faceDown ? <CardBack width={w} label="" /> : <CardFace card={card} width={w} eager />}
          <span className={s.stamp} aria-hidden="true">
            <Stamp side={human} tilt={-8} size="s" className={s.stampInner}>{t(faceDown ? "ui:stamp.committed" : "ui:stamp.revealed")}</Stamp>
          </span>
        </div>
      </div>
      <span className={s.lbl} aria-hidden="true">{t("ui:headline.title")}</span>
    </div>
  );
}
