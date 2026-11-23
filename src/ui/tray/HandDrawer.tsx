/**
 * The compact hand drawer (ui-spec §3.3, §7.6): a bottom sheet (~224 px) over the dock with the header
 * "YOUR HAND · 5" + the China Card status, then a horizontal, scroll-snapping strip of 112 × 157 cards
 * with captions and tags (the China Card last). A tap opens the card sheet (the shared zoom, which
 * carries the prompt's answers); Enter on a playable card activates it; Space zooms; ←/→ move.
 * Playable / passive / staged / lifted states as on desktop. Props-driven like `Tray`: the shell owns
 * `open` (auto-open on hand prompts: `isHandPrompt`) and passes the prompt layer's `offered` / `staged`.
 * Because it opens by itself over the orders slip, its header also carries the hand prompt's question and
 * its done button (`HandPromptBar`, from the prompts layer: Blockade's "Discard nothing", QA Q-028).
 */
import { useContext, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CHINA_CARD, cardInfo } from "../../data";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { CardTags } from "../cards/CardTags";
import { ChinaCardFace } from "../cards/ChinaCardFace";
import { mergeHandOrder } from "../cards/sortHand";
import { Sheet } from "../common/Sheet";
import { Stamp } from "../common/Stamp";
import { useTouchUi } from "../common/touch";
import { HandPromptBar } from "../prompts/HandPromptBar";
import { useShown } from "../runner/ShownContext";
import { OverlayContext, useUiRoot } from "../state/context";
import type { OptionPolicy } from "../ui-contract";
import { moveCardFocus } from "./Hand";
import { useHandView } from "./Tray";
import { cardStateKey, handCardState, handCardWidth, knownToAi, type HandCardState, type StampVerb } from "./trayModel";
import { useTrayOverrides, useTrayStore, WithTrayBeats } from "./useTrayBeats";
import s from "./HandDrawer.module.css";

export interface HandDrawerProps {
  open: boolean;
  onClose(): void;
  offered: ReadonlyMap<number, OptionPolicy>;
  staged: number | null;
  onActivateCard(card: number): void;
  className?: string;
}

/**
 * Keep it mounted (with `open` false when closed): it then also runs the tray beats (unless a
 * TrayBeatsProvider is above), so the China toast and the known-card overrides work in compact.
 */
export function HandDrawer(props: HandDrawerProps) {
  return <WithTrayBeats><DrawerBody {...props} /></WithTrayBeats>;
}

function DrawerBody({ open, onClose, offered, staged, onActivateCard, className }: HandDrawerProps) {
  const { t } = useI18n();
  const root = useUiRoot();
  const vm = root.vm;
  const shown = useShown();
  const ov = useTrayOverrides();
  const state = shown.state;
  const human = vm.humanSide;
  const view = useHandView({
    prompt: vm.prompt, state, human, offered, staged, busy: shown.busy, actor: shown.actor, aiThinking: vm.aiThinking, overrides: ov,
  });
  const prevOrder = useRef<readonly number[]>([]);
  const hand = state && human ? state.hands[human] : [];
  const order = useMemo(() => {
    const o = mergeHandOrder(prevOrder.current, hand);
    prevOrder.current = o;
    return o;
  }, [hand]);
  if (!state || !human) return null;

  const china = ov.china ?? state.china_card;
  const holdsChina = china.holder === human;
  const count = order.filter(c => !ov.gone.has(c)).length;
  const where = holdsChina ? (china.playable ? "mine" : "mineFaceDown") : (china.playable ? "theirs" : "theirsFaceDown");
  const header = (
    <>
      <HandPromptBar />
      <div className={s.header}>
        <span className={s.title}>{t("ui_tray:drawer.title", { count })}</span>
        <span className={s.china}>{t("ui:adversary.china", { where: t(`ui:adversary.chinaWhere.${where}`) })}</span>
      </div>
    </>
  );
  const lifted = new Set(ov.gone);
  if (view.lifted !== null) lifted.add(view.lifted);
  return (
    <Sheet open={open} onClose={onClose} height="auto" label={t("ui_tray:drawer.label")} header={header} className={[s.drawer, className].filter(Boolean).join(" ")}>
      <DrawerStrip
        human={human}
        cards={order}
        china={holdsChina ? china : null}
        states={order.map(c => handCardState(c, { mode: view.mode, offered: view.offered, staged: view.staged, lifted }))}
        chinaState={holdsChina ? chinaState(china.playable, view.mode, view.offered.has(CHINA_CARD), view.staged === CHINA_CARD, lifted.has(CHINA_CARD)) : null}
        offered={view.offered}
        known={(c: number) => ov.known.has(c) || knownToAi(state, human, c)}
        blink={ov.blink}
        blinkMs={ov.blinkMs}
        verb={view.verb}
        interactive={view.interactive}
        onActivate={onActivateCard}
      />
    </Sheet>
  );
}

type ChinaState = HandCardState | "faceDown";
function chinaState(playable: boolean, mode: ReturnType<typeof useHandView>["mode"], offered: boolean, staged: boolean, lifted: boolean): ChinaState {
  if (lifted) return "lifted";
  if (staged) return "staged";
  if (!playable) return "faceDown";
  if (offered) return "playable";
  return mode === "neutral" ? "neutral" : "passive";
}

const DIM: Record<ChinaState, "none" | "passive" | "unplayable"> = {
  neutral: "none", playable: "none", staged: "none", lifted: "none", passive: "passive", unplayable: "unplayable", faceDown: "none",
};

function DrawerStrip(p: {
  human: Side;
  cards: readonly number[];
  china: { playable: boolean } | null;
  states: readonly HandCardState[];
  chinaState: ChinaState | null;
  offered: ReadonlyMap<number, OptionPolicy>;
  known(card: number): boolean;
  blink: ReadonlyMap<number, number>;
  blinkMs: number;
  verb: StampVerb;
  interactive: boolean;
  onActivate(card: number): void;
}) {
  const { t, cardName } = useI18n();
  const root = useUiRoot();
  const overlays = useContext(OverlayContext);
  const store = useTrayStore();
  const touch = useTouchUi();
  const strip = useRef<HTMLDivElement | null>(null);
  const w = handCardWidth("compact");
  const tabCard = p.cards[p.states.indexOf("staged")] ?? p.cards[p.states.indexOf("playable")] ?? p.cards[0] ?? CHINA_CARD;

  const click = (card: number, state: ChinaState) => (e: MouseEvent<HTMLButtonElement>) => {
    if (state === "lifted") return;
    // Enter (detail 0) plays an offered card; a tap or click opens the card sheet with its answers.
    if (e.detail === 0 && p.interactive && (state === "playable" || state === "staged")) {
      p.onActivate(card);
      return;
    }
    const z = overlays?.zoom;
    if (z && z.card === card && z.from === e.currentTarget) overlays?.closeZoom();
    else root.zoomCard(card, e.currentTarget);
  };
  const keys = (card: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (!e.repeat) root.zoomCard(card, e.currentTarget);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (moveCardFocus(strip.current, e.currentTarget, e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
    }
  };
  // Stable merged refs: the shared anchors (`card:<id>`, `china:<human>`, `hand:<human>`) and the tray's registry.
  const refs = useRef(new Map<number, (el: HTMLButtonElement | null) => void>());
  const ref = (card: number) => {
    let r = refs.current.get(card);
    if (!r) {
      const a = root.anchors.ref(card === CHINA_CARD ? `china:${p.human}` : `card:${card}`);
      const b = store?.ref(card === CHINA_CARD ? "china" : `card:${card}`);
      r = (el: HTMLButtonElement | null) => { a(el); b?.(el); };
      refs.current.set(card, r);
    }
    return r;
  };
  const handAnchor = root.anchors.ref(`hand:${p.human}`);
  const stripRef = useMemo(() => (el: HTMLDivElement | null) => { strip.current = el; handAnchor(el); }, [handAnchor]);
  const label = (card: number, state: ChinaState) => {
    if (card === CHINA_CARD && state === "faceDown") return t("ui_tray:china.aria.faceDown", { card: cardName(card) });
    const st = t(cardStateKey(state, touch));
    if (card === CHINA_CARD) return t("ui_tray:china.aria.faceUp", { card: cardName(card), state: st });
    const info = cardInfo(card);
    const ops = info?.scoring ? t("ui:card.scoring") : t("ui_tray:card.ops", { count: info?.ops ?? 0 });
    return t(p.known(card) ? "ui_tray:card.ariaKnown" : "ui_tray:card.aria", { card: cardName(card), ops, state: st });
  };
  const item = (card: number, state: ChinaState, face: ReactNode) => {
    const b = p.blink.get(card);
    return (
      <button
        key={card}
        ref={ref(card)}
        type="button"
        className={[s.card, s[`st_${state}`], b !== undefined && p.blinkMs > 0 ? s.blink : ""].filter(Boolean).join(" ")}
        style={b !== undefined && p.blinkMs > 0 ? { ["--blink-delay" as string]: `${b}ms`, ["--blink-ms" as string]: `${p.blinkMs}ms` } : undefined}
        data-card={card}
        data-state={state}
        data-hand-card=""
        tabIndex={card === tabCard ? 0 : -1}
        aria-label={label(card, state)}
        aria-disabled={state === "unplayable" || state === "lifted" || state === "faceDown" ? true : undefined}
        aria-haspopup="dialog"
        onClick={click(card, state)}
        onKeyDown={keys(card)}
      >
        {face}
        {state === "staged" ? (
          <span className={s.stamp}><Stamp side={p.human} tilt={-6} size="s" className={s.stampInner}>{t(`ui:stamp.${p.verb}`)}</Stamp></span>
        ) : null}
      </button>
    );
  };
  return (
    <div className={s.strip} ref={stripRef} role="group" aria-label={t("ui_tray:hand.region", { count: p.cards.length })}>
      {p.cards.map((card, i) => {
        const state = p.states[i]!;
        return item(card, state, (
          <CardFace
            card={card}
            width={w}
            caption
            eager
            dim={DIM[state]}
            className={s.face}
            tags={<CardTags card={card} warnings={p.offered.get(card)?.option.warnings} known={p.known(card)} />}
          />
        ));
      })}
      {p.china && p.chinaState ? item(CHINA_CARD, p.chinaState, (
        <ChinaCardFace
          faceUp={p.china.playable}
          width={w}
          caption={p.china.playable}
          eager
          dim={DIM[p.chinaState]}
          className={`${s.face} ${p.chinaState === "faceDown" ? s.faceDown : ""}`}
          tags={p.offered.get(CHINA_CARD) ? <CardTags card={CHINA_CARD} warnings={p.offered.get(CHINA_CARD)?.option.warnings} /> : undefined}
        />
      )) : null}
      {!p.cards.length && !p.china ? <span className={s.empty}>{t("ui_tray:hand.empty")}</span> : null}
    </div>
  );
}
