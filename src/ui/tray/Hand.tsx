/**
 * The human's hand on desktop / tablet (ui-spec §7.2): order (scoring first, then Ops descending,
 * stable within a turn), a fan of ±2.2° per card that overlaps just enough to fit (ResizeObserver),
 * capped at 55 % of a card; past the cap a horizontal scroller (edge fades, no fan) holds the
 * remainder. Every card the next one covers wears a spine (its name down the visible strip, QA OD-3); the
 * rightmost and a hovered / focused / staged card show the caption. Card states come from the hand's mode and
 * the prompt layer's `offered` / `staged`. Keys:
 * ←/→ move focus (one tab stop),
 * Enter plays or stages, Space toggles the zoom. Anchors: `hand:<human>` and `card:<id>`.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type WheelEvent } from "react";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardTags, cardTagKinds } from "../cards/CardTags";
import { mergeHandOrder } from "../cards/sortHand";
import { promptStore } from "../prompts/store";
import { UiRootContext } from "../state/context";
import type { OptionPolicy } from "../ui-contract";
import { HandCard } from "./HandCard";
import { fanAngle, fitHand, handCardState, handCardWidth, handFocusReady, HAND_FIT_PAD, serveFocusRequest, spineOf, type HandMode, type StampVerb, type TrayVariant } from "./trayModel";
import { useTrayStore } from "./useTrayBeats";
import { useWide } from "./useWide";
import s from "./Hand.module.css";

export interface HandProps {
  cards: readonly number[];
  offered: ReadonlyMap<number, OptionPolicy>;
  staged: number | null;
  liftedOut: number | null;
  mode: HandMode;
  onActivate(card: number): void;
  // ── extensions ──
  variant?: TrayVariant;
  /** Default: the root's `vm.humanSide`. */
  humanSide?: Side | null;
  /** Cards the AI knows (HAND_<human>_KNOWN, plus a hand-revealed beat's). */
  known?: ReadonlySet<number>;
  /** Cards that already left (beat overrides): drawn as lifted out until the commit. */
  gone?: ReadonlySet<number>;
  /** KNOWN tags blinking now: card → delay (ms), and the blink duration. */
  blink?: ReadonlyMap<number, number>;
  blinkMs?: number;
  /** Verb stamped on the staged card. */
  verb?: StampVerb;
  /** Clicks activate cards (false while frames animate). Default true. */
  interactive?: boolean;
  className?: string;
}

const EMPTY = new Set<number>();
const NO_SUBSCRIBE = () => () => undefined;
const NO_FOCUS = () => null;
/** Visible strip (px) below which the KNOWN TO AI tag shows only its eye. */
const NARROW_STRIP = 84;
const NO_BLINK = new Map<number, number>();

/** Move focus to the previous / next element marked `[data-hand-card]` inside `container`. */
export function moveCardFocus(container: Element | null, from: Element, dir: -1 | 1, wrap = false): boolean {
  if (!container) return false;
  const items = [...container.querySelectorAll<HTMLElement>("[data-hand-card]")];
  const i = items.indexOf(from as HTMLElement);
  if (i < 0) return false;
  let j = i + dir;
  if (wrap) j = (j + items.length) % items.length;
  const next = items[j];
  if (!next) return false;
  next.focus();
  next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}

export function Hand(props: HandProps) {
  const { cards, offered, staged, liftedOut, mode, onActivate, variant = "desktop", known = EMPTY, gone = EMPTY, blink = NO_BLINK, blinkMs = 0, verb = "play", interactive = true } = props;
  const { t } = useI18n();
  const root = useContext(UiRootContext);
  const store = useTrayStore();
  const human = props.humanSide ?? root?.vm.humanSide ?? null;
  const wide = useWide();
  const w = handCardWidth(variant, wide);

  // Stable order within a turn.
  const prevOrder = useRef<readonly number[]>([]);
  const order = useMemo(() => mergeHandOrder(prevOrder.current, cards), [cards]);
  useEffect(() => { prevOrder.current = order; }, [order]);

  // Fit: measure the available width.
  const box = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIso(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = order.length;
  const fit = avail > 0 ? fitHand(n, w, avail - HAND_FIT_PAD) : { ov: 0, scroll: false };

  // Roving tab stop: the staged card, else the first playable, else the first.
  const lifted = useMemo(() => {
    const set = new Set(gone);
    if (liftedOut !== null) set.add(liftedOut);
    return set;
  }, [gone, liftedOut]);
  const states = order.map(c => handCardState(c, { mode, offered, staged, lifted }));
  const [focusCard, setFocusCard] = useState<number | null>(null);
  const tabCard = focusCard !== null && order.includes(focusCard)
    ? focusCard
    : order[states.indexOf("staged")] ?? order[states.indexOf("playable")] ?? order[0];

  // Stable merged refs per card: the anchor `card:<id>`, the tray's beat registry and our own element map.
  const refs = useRef(new Map<number, (el: HTMLButtonElement | null) => void>());
  const els = useRef(new Map<number, HTMLButtonElement>());
  const refFor = (card: number) => {
    let r = refs.current.get(card);
    if (!r) {
      const a = root?.anchors.ref(`card:${card}`);
      const b = store?.ref(`card:${card}`);
      r = (el: HTMLButtonElement | null) => {
        a?.(el); b?.(el);
        if (el) els.current.set(card, el);
        else els.current.delete(card);
      };
      refs.current.set(card, r);
    }
    return r;
  };

  // Esc "Back to hand" on the play-mode stage: focus the card once it is back in the hand and playable again
  // (the prompt layer asks through its store; the stage that had focus is gone).
  const prompts = root ? promptStore(root.controller) : null;
  const focusReq = useSyncExternalStore(prompts?.subscribe ?? NO_SUBSCRIBE, prompts ? () => prompts.get().focusCard : NO_FOCUS, NO_FOCUS);
  const focusReady = handFocusReady(focusReq, order, states, { interactive, mode });
  useEffect(() => {
    if (!focusReady || focusReq === null || !prompts) return;
    serveFocusRequest(prompts, els.current.get(focusReq) ?? null);
  }, [focusReady, focusReq, prompts]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const from = (e.target as Element).closest("[data-hand-card]");
    if (!from) return;
    if (moveCardFocus(box.current, from, e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!fit.scroll || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  const shownCount = order.filter(c => !gone.has(c)).length;
  const anchorRef = human ? root?.anchors.ref(`hand:${human}`) : undefined;
  return (
    <div
      className={[s.hand, s[variant], fit.scroll ? s.scrolling : "", interactive ? "" : s.busy, props.className].filter(Boolean).join(" ")}
      ref={anchorRef}
      role="group"
      aria-label={t("ui_tray:hand.region", { count: shownCount })}
      data-mode={mode}
    >
      <div className={s.row} ref={box} onKeyDown={onKeyDown} onWheel={onWheel} data-fit={fit.scroll ? "scroll" : "fan"}>
        {order.map((card, i) => {
          const state = states[i]!;
          const policy = offered.get(card);
          const b = blink.get(card);
          return (
            <HandCard
              key={card}
              card={card}
              state={state}
              width={w}
              angle={fit.scroll ? 0 : fanAngle(i, n)}
              offset={i === 0 ? 0 : -fit.ov}
              overlapRight={i < n - 1 ? Math.max(0, fit.ov) : 0}
              spine={spineOf(i, n, fit, w)}
              tags={cardTagKinds(card, policy?.option.warnings, known.has(card)).length ? (
                // Centre the tags on the strip of the card that stays visible under its right neighbour;
                // on a narrow strip KNOWN TO AI shrinks to its eye (the card's name says it in full).
                <span className={s.tagShift} style={{ translate: i < n - 1 && fit.ov > 0 ? `${(-fit.ov / 2).toFixed(1)}px 0` : undefined }}>
                  <CardTags card={card} warnings={policy?.option.warnings} known={known.has(card)} compact={i < n - 1 && w - fit.ov < NARROW_STRIP} />
                </span>
              ) : undefined}
              known={known.has(card)}
              verb={verb}
              side={human}
              interactive={interactive}
              blink={b !== undefined && blinkMs > 0 ? { delay: b, ms: blinkMs } : null}
              tabIndex={card === tabCard ? 0 : -1}
              onFocus={() => setFocusCard(card)}
              onActivate={() => onActivate(card)}
              elRef={refFor(card)}
            />
          );
        })}
        {n === 0 ? <span className={s.empty}>{t("ui_tray:hand.empty")}</span> : null}
      </div>
      <span className={s.label} aria-hidden="true">{t("ui_tray:hand.label", { count: shownCount })}</span>
    </div>
  );
}
