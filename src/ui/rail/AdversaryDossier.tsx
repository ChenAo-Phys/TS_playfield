/**
 * The adversary dossier (ui-spec §6.1): header "Adversary" + the round, the AI's seal, name and "DeepStruggle
 * AI · full strength", a status chip (Waiting / Thinking with a blinking phosphor dot / Playing), and the
 * hand row: unknown cards as backs (count = aiHandCount − aiKnownCards), then the known cards face up,
 * lifted, tagged "Known" (click → card zoom), then the China Card mini when the AI holds it. In the
 * headline phase a committed AI headline sits face down in its slot.
 *
 * Hidden information: it draws only `aiHandCount`, `aiKnownCards`, `aiHeadlineHidden` and the China Card
 * holder from PublicState, plus the cards a `hand-revealed` beat is revealing right now (the same cards the
 * committed state will list as known). Never an unknown card's face.
 *
 * Anchors: `hand:<ai>` (the hand row), `china:<ai>` (the China mini; the hand row while the AI doesn't hold
 * it), `headline:<ai>` (the headline slot).
 */
import { useContext, useRef, type CSSProperties } from "react";
import type { PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardBack } from "../cards/CardBack";
import { CardFace } from "../cards/CardFace";
import { ChinaCardFace } from "../cards/ChinaCardFace";
import { Seal } from "../common/Seal";
import { Stamp } from "../common/Stamp";
import { useAnchorRef } from "../console/Instrument";
import { arModel } from "../console/model";
import { emphasizeNumber } from "../console/slots";
import { UiRootContext } from "../state/context";
import { useRailView } from "./railStore";
import s from "./Rail.module.css";

export type AdversaryStatus = "waiting" | "thinking" | "playing";

export interface AdversaryDossierProps {
  state: PublicState;
  aiSide: Side;
  status: AdversaryStatus;
  className?: string;
}

const MINI_W = 44;
const CHINA_W = 33;
/** Room for the hand row's cards before they overlap more than the default 12 px. */
const ROW_MAX = 156;

/** Where each mini starts: 32 px apart (12 px overlap), closer when the hand is large. */
export function miniStep(n: number, max = ROW_MAX): number {
  if (n <= 1) return MINI_W;
  return Math.max(10, Math.min(MINI_W - 12, (max - MINI_W) / (n - 1)));
}

function KnownMini({ card, flip }: { card: number; flip?: { delay: number; ms: number } }) {
  const root = useContext(UiRootContext);
  const { t, cardName } = useI18n();
  const el = useRef<HTMLButtonElement | null>(null);
  const style = flip ? ({ "--flip-delay": `${flip.delay}ms`, "--flip-ms": `${flip.ms}ms` } as CSSProperties) : undefined;
  return (
    <button
      ref={el}
      type="button"
      className={[s.mini, s.known, flip ? s.flipping : ""].filter(Boolean).join(" ")}
      style={style}
      data-card={card}
      aria-label={t("ui_console:adversary.knownCard", { card: cardName(card) })}
      onClick={() => root?.zoomCard(card, el.current)}
    >
      <span className={s.flipInner}>
        <span className={s.face}><CardFace card={card} width={MINI_W} /></span>
        {flip ? <span className={`${s.face} ${s.faceBack}`}><CardBack width={MINI_W} label="" /></span> : null}
      </span>
    </button>
  );
}

export function AdversaryDossier({ state, aiSide, status, className }: AdversaryDossierProps) {
  const { t } = useI18n();
  const rail = useRailView();
  const holdsChina = state.china_card.holder === aiSide;
  // `china:<ai>`: the China mini while the AI holds it, else the hand row (where a China Card the AI is
  // about to receive slides to). The anchor's newest visible element wins, so the row only registers it
  // while there is no mini.
  const handRef = useAnchorRef(holdsChina ? `hand:${aiSide}` : [`hand:${aiSide}`, `china:${aiSide}`]);
  const chinaRef = useAnchorRef(`china:${aiSide}`);
  const headlineRef = useAnchorRef(`headline:${aiSide}`);
  const human: Side = aiSide === "US" ? "USSR" : "US";

  const known = [...state.aiKnownCards];
  const revealing = (rail.reveal?.cards ?? []).filter(c => !known.includes(c));
  // A reveal can run ahead of the committed hand count (the end-of-turn deal is in the same frame).
  const handCount = Math.max(state.aiHandCount, known.length + revealing.length);
  const backs = handCount - known.length - revealing.length;
  const minis = backs + known.length + revealing.length + (holdsChina ? 1 : 0);
  const step = miniStep(minis);
  const rowStyle = { "--step": `${step}px` } as CSSProperties;

  const model = arModel(state);
  const round = model.phase === "setup" ? t("ui_console:adversary.phase.setup")
    : model.phase === "headline" ? t("ui_console:adversary.phase.headline")
    : model.phase === "ar" && model.ar > 0 ? t("ui:track.arShort", { ar: model.ar }) : "";

  const chinaWhere = state.china_card.holder === human
    ? (state.china_card.playable ? "mine" : "mineFaceDown")
    : (state.china_card.playable ? "theirs" : "theirsFaceDown");
  const headlineShown = state.aiHeadlineHidden || !!rail.headline;
  const hl = rail.headline;

  return (
    <section className={[s.adversary, className].filter(Boolean).join(" ")} aria-label={t("ui:adversary.title")} data-ai={aiSide}>
      <div className={s.panelH}>
        <h2>{t("ui:adversary.title")}</h2>
        <span className={s.count}>{round}</span>
      </div>
      <div className={s.advId}>
        <Seal side={aiSide} size={40} />
        <div className={s.advWho}>
          <div className={s.advName}>{t(`ui:side.long.${aiSide}`)}</div>
          <div className={s.advSub}>{t("ui:adversary.sub")}</div>
        </div>
        <span className={[s.advStatus, s[`st_${status}`], status === "thinking" ? "ts-ambient" : ""].filter(Boolean).join(" ")} data-status={status}>
          {t(`ui:adversary.${status}`)}
        </span>
      </div>
      <div className={s.advHand}>
        <div ref={handRef} className={s.minis} style={rowStyle} aria-label={t("ui:pile.opponentHand", { side: t(`ui:side.${aiSide}`) })} role="group" data-backs={backs}>
          {Array.from({ length: backs }, (_, i) => (
            <span key={`b${i}`} className={s.mini} data-mini="back">
              <CardBack width={MINI_W} label={i === 0 ? t("ui:pile.unknownCard") : ""} />
            </span>
          ))}
          {known.length + revealing.length ? (
            <span className={s.knownSet}>
              {known.map(c => <KnownMini key={c} card={c} />)}
              {revealing.map((c, i) => (
                <KnownMini key={`r${c}:${rail.reveal!.seq}`} card={c} flip={rail.reveal!.reduced ? undefined : { delay: i * rail.reveal!.stagger, ms: rail.reveal!.per }} />
              ))}
              <span className={s.knownTag} aria-hidden="true">{t("ui:adversary.knownTag")}</span>
            </span>
          ) : null}
          {holdsChina ? (
            <span ref={chinaRef} className={[s.mini, s.chinaMini].join(" ")} data-china={state.china_card.playable ? "up" : "down"}>
              <ChinaCardFace faceUp={state.china_card.playable} width={CHINA_W} />
            </span>
          ) : null}
          {rail.reveal ? (
            <span key={rail.reveal.seq} className={s.stampAt}>
              <Stamp tone="alert" tilt={-6} size="s" animate={!rail.reveal.reduced}>{t("ui:stamp.revealed")}</Stamp>
            </span>
          ) : null}
        </div>
        <div className={s.advMeta}>
          <div>{emphasizeNumber(t("ui:adversary.hand", { count: handCount }), handCount, n => <b className="ts-num">{n}</b>)}</div>
          {known.length + revealing.length > 0 ? <div>{t("ui:adversary.known", { count: known.length + revealing.length })}</div> : null}
          <div className={state.china_card.holder === "US" ? s.chinaUs : s.chinaUssr}>
            {t("ui:adversary.china", { where: t(`ui:adversary.chinaWhere.${chinaWhere}`) })}
          </div>
        </div>
      </div>
      {headlineShown ? (
        <div className={s.headlineRow}>
          <span
            ref={headlineRef}
            key={hl ? `h${hl.seq}` : "h"}
            className={[s.headlineCard, hl && !hl.reduced && hl.ms > 0 ? s.slideIn : ""].filter(Boolean).join(" ")}
            style={hl && hl.ms > 0 ? { animationDuration: `${hl.ms}ms` } : undefined}
          >
            <CardBack width={CHINA_W} label={t("ui:headline.faceDown")} />
          </span>
          <span className={s.headlineLabel}>{t("ui_console:adversary.headlineCommitted")}</span>
          {hl ? (
            <span key={hl.seq} className={s.headlineStamp}>
              <Stamp side={aiSide} tilt={-5} size="s" animate={!hl.reduced}>{t("ui:stamp.committed")}</Stamp>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
