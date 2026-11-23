/**
 * A card named in running text (log lines, prompt titles, warnings). Hover 250 ms opens the card zoom
 * (`UiRoot.zoomCard`), which closes again when the pointer leaves; click, Enter or Space open it and
 * leave it open (Esc closes). Outside a UiRoot it is plain text.
 */
import { useContext, useRef, type ReactNode } from "react";
import { OverlayContext, UiRootContext } from "../state/context";
import { useHoverIntent } from "./hooks";
import s from "./common.module.css";

export interface CardRefProps {
  card: number;
  children: ReactNode;
  className?: string;
}

export function CardRef({ card, children, className }: CardRefProps) {
  const root = useContext(UiRootContext);
  const overlays = useContext(OverlayContext);
  const el = useRef<HTMLSpanElement | null>(null);
  const latest = useRef(overlays);
  latest.current = overlays;
  const byHover = useRef(false);
  const hover = useHoverIntent(250, {
    enabled: !!root,
    onStart: () => {
      if (!root) return;
      byHover.current = true;
      root.zoomCard(card, el.current);
    },
    onEnd: () => {
      const o = latest.current;
      if (byHover.current && o?.zoom && o.zoom.card === card && o.zoom.from === el.current) o.closeZoom();
      byHover.current = false;
    },
  });
  const cls = [s.ref, s.cardRef, className].filter(Boolean).join(" ");
  if (!root) return <span className={cls} data-card={card}>{children}</span>;
  const open = () => {
    hover.cancel();
    byHover.current = false;
    root.zoomCard(card, el.current);
  };
  return (
    <span
      ref={el}
      className={cls}
      data-card={card}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      {...hover.bind}
      onClick={e => { e.stopPropagation(); open(); }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }}
    >
      {children}
    </span>
  );
}
