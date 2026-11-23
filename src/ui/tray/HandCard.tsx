/**
 * One card of the hand (ui-spec §7.2): the card face with its caption and tags, lifted and glowing
 * when playable, dimmed when not, a dashed outline when lifted out, a brass ring and a verb stamp when
 * staged. Hover 250 ms (or Space) opens the card zoom; a long press does on touch. A click / Enter
 * activates a playable or staged card (`onActivate`); on any other card it opens the zoom instead.
 */
import { useContext, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { cardInfo } from "../../data";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { useHoverIntent, useLongPress } from "../common/hooks";
import { Stamp } from "../common/Stamp";
import { useTouchUi } from "../common/touch";
import { OverlayContext, UiRootContext } from "../state/context";
import { cardStateKey, type HandCardState, type StampVerb } from "./trayModel";
import s from "./Hand.module.css";

export interface HandCardProps {
  card: number;
  state: HandCardState;
  /** Tags hanging from the top edge (CardTags). */
  tags?: ReactNode;
  /** Px of this card covered by the next one. */
  overlapRight: number;
  /** Overlapped: the name runs down a spine on the visible strip (CardFace `spine`). Default false. */
  spine?: boolean;
  onActivate(): void;
  // ── extensions ──
  /** Card width in px (height × 1.4). Default 104. */
  width?: number;
  /** Fan rotation in degrees. */
  angle?: number;
  /** Margin-left (px; negative = overlap). */
  offset?: number;
  /** Verb stamp shown while staged. */
  verb?: StampVerb;
  /** The human's side (stamp colour). */
  side?: Side | null;
  /** Clicks activate (false while frames animate or no prompt is open). Default true. */
  interactive?: boolean;
  /** The KNOWN TO AI tag blinks: its delay (ms) and duration. */
  blink?: { delay: number; ms: number } | null;
  /** Roving tab stop. */
  tabIndex?: number;
  onFocus?(): void;
  /** The AI knows this card (named in the accessible label). */
  known?: boolean;
  /** Element ref (anchors `card:<id>` and the tray's beat registry). */
  elRef?: Ref<HTMLButtonElement>;
  className?: string;
}

const DIM: Record<HandCardState, "none" | "passive" | "unplayable"> = {
  neutral: "none", playable: "none", staged: "none", lifted: "none", passive: "passive", unplayable: "unplayable",
};

export function HandCard(props: HandCardProps) {
  const { card, state, tags, overlapRight, onActivate, width = 104, angle = 0, offset = 0, verb = "play", side = null, interactive = true, blink = null } = props;
  const { t, cardName } = useI18n();
  const touch = useTouchUi();
  const root = useContext(UiRootContext);
  const overlays = useContext(OverlayContext);
  const el = useRef<HTMLButtonElement | null>(null);
  const latest = useRef(overlays);
  latest.current = overlays;
  const byHover = useRef(false);

  const openZoom = () => {
    if (!root) return;
    byHover.current = false; // a pinned zoom: the pointer leaving no longer closes it
    hover.cancel();
    root.zoomCard(card, el.current);
  };
  const zoomIsMine = () => {
    const z = latest.current?.zoom;
    return !!z && z.card === card && z.from === el.current;
  };
  const hover = useHoverIntent(250, {
    enabled: !!root && state !== "lifted",
    onStart: () => { byHover.current = true; root?.zoomCard(card, el.current); },
    onEnd: () => {
      if (byHover.current && zoomIsMine()) latest.current?.closeZoom();
      byHover.current = false;
    },
  });
  const press = useLongPress(350, () => openZoom(), { enabled: !!root });

  const activatable = interactive && (state === "playable" || state === "staged");
  const onClick = () => {
    if (state === "lifted") return;
    if (activatable) {
      hover.cancel();
      if (zoomIsMine()) latest.current?.closeZoom();
      onActivate();
      return;
    }
    if (zoomIsMine() && !byHover.current) latest.current?.closeZoom();
    else openZoom();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      // Space toggles the zoom (ui-spec §7.2); it never activates the card.
      e.preventDefault();
      if (e.repeat) return;
      if (zoomIsMine()) latest.current?.closeZoom();
      else openZoom();
    }
  };

  const info = cardInfo(card);
  const ops = info?.scoring ? t("ui:card.scoring") : t("ui_tray:card.ops", { count: info?.ops ?? 0 });
  const label = t(props.known ? "ui_tray:card.ariaKnown" : "ui_tray:card.aria", { card: cardName(card), ops, state: t(cardStateKey(state, touch)) });
  const style: CSSProperties = {
    rotate: angle ? `${angle.toFixed(2)}deg` : undefined,
    marginLeft: offset ? `${offset}px` : undefined,
    ["--blink-delay" as string]: blink ? `${blink.delay}ms` : undefined,
    ["--blink-ms" as string]: blink ? `${blink.ms}ms` : undefined,
  };
  const setRef = (node: HTMLButtonElement | null) => {
    el.current = node;
    const r = props.elRef;
    if (typeof r === "function") r(node);
    else if (r) (r as { current: HTMLButtonElement | null }).current = node;
  };
  const cls = [s.card, s[`st_${state}`], blink ? s.blink : "", interactive ? "" : s.inert, props.className].filter(Boolean).join(" ");
  return (
    <button
      ref={setRef}
      type="button"
      className={cls}
      style={style}
      data-card={card}
      data-state={state}
      data-hand-card=""
      tabIndex={props.tabIndex}
      aria-label={label}
      aria-disabled={state === "unplayable" || state === "lifted" ? true : undefined}
      aria-haspopup="dialog"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={props.onFocus}
      onPointerEnter={hover.bind.onPointerEnter}
      onPointerLeave={e => { hover.bind.onPointerLeave(e); press.bind.onPointerLeave(); }}
      onPointerDown={e => { hover.bind.onPointerDown(e); press.bind.onPointerDown(e); }}
      onPointerMove={press.bind.onPointerMove}
      onPointerUp={press.bind.onPointerUp}
      onPointerCancel={press.bind.onPointerCancel}
      onContextMenu={press.bind.onContextMenu}
      onClickCapture={press.bind.onClickCapture}
    >
      <CardFace card={card} width={width} caption tags={tags} dim={DIM[state]} overlapRight={overlapRight} spine={props.spine} eager className={s.face} />
      {state === "staged" ? (
        <span className={s.stamp}><Stamp side={side} tilt={-6} size="s" className={s.stampInner}>{t(`ui:stamp.${verb}`)}</Stamp></span>
      ) : null}
    </button>
  );
}
