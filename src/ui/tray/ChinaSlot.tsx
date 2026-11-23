/**
 * The China Card slot (ui-spec §7.3): green felt with the card tilted −3°, and a label under it.
 * Face up and offered → playable glow; face up, not offered → passive; face down → the face-down
 * design, desaturated, not playable, tooltip "Cannot be played until next turn"; held by the AI →
 * a dashed outline "With the US" (the card itself sits in the adversary dossier). Hover / Space /
 * long press zoom it. Anchor `china:<human>`.
 */
import { useContext, useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { CHINA_CARD } from "../../data";
import type { PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { ChinaCardFace } from "../cards/ChinaCardFace";
import { useHoverIntent, useLongPress } from "../common/hooks";
import { Stamp } from "../common/Stamp";
import { useTouchUi } from "../common/touch";
import { promptStore } from "../prompts/store";
import { OverlayContext, UiRootContext } from "../state/context";
import type { OptionPolicy } from "../ui-contract";
import { cardStateKey, chinaCardWidth, chinaFocusReady, chinaView, serveFocusRequest, type HandMode, type StampVerb, type TrayVariant } from "./trayModel";
import { useTrayStore } from "./useTrayBeats";
import s from "./ChinaSlot.module.css";

export interface ChinaSlotProps {
  china: PublicState["china_card"];
  humanSide: Side;
  /** The China Card's option at the current prompt (null = not offered). */
  policy: OptionPolicy | null;
  onActivate(): void;
  // ── extensions ──
  variant?: TrayVariant;
  /** The hand's mode: a face-up card that is not offered is passive while a prompt or the AI is busy. */
  mode?: HandMode;
  staged?: boolean;
  /** On the stage / in the slip clip (play-mode with the China Card). */
  lifted?: boolean;
  verb?: StampVerb;
  /** Clicks activate (false while frames animate). Default true. */
  interactive?: boolean;
  /** Roving tab stop (part of the hand's arrow-key order). */
  tabIndex?: number;
  className?: string;
}

const NO_SUBSCRIBE = () => () => undefined;
const NO_FOCUS = () => null;

export function ChinaSlot(props: ChinaSlotProps) {
  const { china, humanSide, policy, onActivate, variant = "desktop", mode = "neutral", staged = false, lifted = false, verb = "play", interactive = true } = props;
  const { t, cardName } = useI18n();
  const touch = useTouchUi();
  const root = useContext(UiRootContext);
  const overlays = useContext(OverlayContext);
  const store = useTrayStore();
  const el = useRef<HTMLButtonElement | null>(null);
  const latest = useRef(overlays);
  latest.current = overlays;
  const byHover = useRef(false);
  const view = chinaView(china, humanSide);
  const w = chinaCardWidth(variant);

  const zoomIsMine = () => {
    const z = latest.current?.zoom;
    return !!z && z.card === CHINA_CARD && z.from === el.current;
  };
  const openZoom = () => {
    if (!root) return;
    byHover.current = false;
    hover.cancel();
    root.zoomCard(CHINA_CARD, el.current);
  };
  const hover = useHoverIntent(250, {
    enabled: !!root && view !== "withAi" && !lifted,
    onStart: () => { byHover.current = true; root?.zoomCard(CHINA_CARD, el.current); },
    onEnd: () => {
      if (byHover.current && zoomIsMine()) latest.current?.closeZoom();
      byHover.current = false;
    },
  });
  const press = useLongPress(350, () => openZoom(), { enabled: !!root });

  // Esc / Back to hand after playing the China Card (QA R-016): the prompt layer asks for card 6, which is not in
  // the hand's order; focus it here once it is back in the slot and playable, as the hand does for its cards.
  const prompts = root ? promptStore(root.controller) : null;
  const focusReq = useSyncExternalStore(prompts?.subscribe ?? NO_SUBSCRIBE, prompts ? () => prompts.get().focusCard : NO_FOCUS, NO_FOCUS);
  const focusReady = chinaFocusReady(focusReq, { view, lifted, interactive, mode });
  useEffect(() => {
    if (focusReady && prompts) serveFocusRequest(prompts, el.current);
  }, [focusReady, prompts]);

  const state = lifted ? "lifted" : staged ? "staged" : view === "faceDown" ? "faceDown" : policy ? "playable" : mode === "neutral" ? "neutral" : "passive";
  const activatable = interactive && view === "faceUp" && !lifted && !!policy;
  const onClick = () => {
    if (lifted) return;
    if (activatable) {
      hover.cancel();
      onActivate();
      return;
    }
    if (zoomIsMine() && !byHover.current) latest.current?.closeZoom();
    else openZoom();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (e.repeat) return;
      if (zoomIsMine()) latest.current?.closeZoom();
      else openZoom();
    }
  };

  const setRef = (node: HTMLButtonElement | null) => {
    el.current = node;
    store?.ref("china")(node);
  };
  const ai: Side = humanSide === "US" ? "USSR" : "US";
  const stateText = t(cardStateKey(state, touch));
  const anchor = root?.anchors.ref(`china:${humanSide}`);
  return (
    <div className={[s.slot, s[variant], props.className].filter(Boolean).join(" ")} ref={anchor} data-view={view}>
      <div className={s.felt} aria-hidden="true" />
      {view === "withAi" ? (
        <div
          className={s.outline}
          style={{ width: w, height: Math.round(w * 1.4) }}
          role="img"
          aria-label={t(china.playable ? "ui_tray:china.aria.withAiUp" : "ui_tray:china.aria.withAiDown", {
            card: cardName(CHINA_CARD),
            side: t(ai === "US" ? "ui:side.long.US" : "ui:side.long.USSR"),
          })}
        >
          <span className={s.outlineText}>{t("ui_tray:china.withSide", { side: t(ai === "US" ? "ui:side.US" : "ui:side.USSR") })}</span>
        </div>
      ) : (
        <button
          ref={setRef}
          type="button"
          className={[s.card, s[`st_${state}`], interactive ? "" : s.inert].filter(Boolean).join(" ")}
          data-card={CHINA_CARD}
          data-state={state}
          data-hand-card=""
          tabIndex={props.tabIndex}
          aria-label={view === "faceDown"
            ? t("ui_tray:china.aria.faceDown", { card: cardName(CHINA_CARD) })
            : t("ui_tray:china.aria.faceUp", { card: cardName(CHINA_CARD), state: stateText })}
          aria-disabled={view === "faceDown" || lifted || (mode === "active" && !policy) ? true : undefined}
          aria-haspopup="dialog"
          title={view === "faceDown" ? t("ui:china.faceDownHint") : undefined}
          onClick={onClick}
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
          <ChinaCardFace
            faceUp={view === "faceUp"}
            width={w}
            eager
            dim={state === "passive" ? "passive" : "none"}
            className={s.face}
          />
          {staged ? (
            <span className={s.stamp}><Stamp side={humanSide} tilt={-6} size="s" className={s.stampInner}>{t(`ui:stamp.${verb}`)}</Stamp></span>
          ) : null}
        </button>
      )}
      <span className={s.lbl} aria-hidden="true">
        {t(china.playable ? "ui_tray:china.label.faceUp" : "ui_tray:china.label.faceDown")}
      </span>
    </div>
  );
}
