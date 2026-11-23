/**
 * Headline reveal (ui-spec §10.1, final.css `.headline` / `.paper`): over the stage scrim two newspapers
 * drop in, US left ("The Washington Dispatch", −2°) and USSR right ("ПРАВДА", +1.6°): masthead, dateline,
 * the card name as the headline, the card as the photo, its text as the column, and a brass badge
 * "1st" / "2nd". The caption says who resolves first. With `pauseOnReveals` it waits for Continue (Space,
 * Enter, Esc or a click), else it holds; then the papers fold away (the first towards the reveal dock).
 * A headline cancelled in the same frame (Defectors) gets a CANCELLED stamp and slides to the discard
 * pile. Compact: the papers stack, US on top.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { cardInfo, cardTextLines, dataLang } from "../../data";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { Button } from "../common/Button";
import { useKey, KeyScope } from "../common/keymap";
import { Stamp } from "../common/Stamp";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import { EASE } from "../theme/motion";
import type { PapersState } from "./stageStore";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./HeadlinePapers.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HeadlinePapers() {
  const store = useStageStore();
  useStageBeats(["headline"], store);
  const papers = useStageState(st => st.papers, store);
  const waiting = useStageState(st => st.waiting, store) === "headline";
  if (!papers) return null;
  return <HeadlinePapersView key={papers.key} papers={papers} waiting={waiting} onContinue={store.proceed} />;
}

export interface HeadlinePapersViewProps {
  papers: PapersState;
  waiting: boolean;
  onContinue(): void;
}

/** The scrim, both papers, the order caption and (while waiting) Continue. */
export function HeadlinePapersView({ papers, waiting, onContinue }: HeadlinePapersViewProps) {
  const root = useUiRoot();
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const host = useRef<HTMLDivElement | null>(null);
  const continueBtn = useRef<HTMLButtonElement | null>(null);
  const first = papers.first;
  const firstCard = first === "US" ? papers.us : papers.ussr;
  const secondCard = first === "US" ? papers.ussr : papers.us;
  const ops = (c: number) => cardInfo(c)?.ops ?? 0;

  // Fold: the first paper towards the reveal dock (top right), the second back to its side, a
  // cancelled one to the discard pile.
  useIsoLayoutEffect(() => {
    const el = host.current;
    if (!el || papers.phase !== "fold" || papers.ms.fold <= 0) return;
    const anims: Animation[] = [];
    for (const paper of el.querySelectorAll<HTMLElement>("[data-paper]")) {
      const side = paper.dataset.paper as Side;
      const card = side === "US" ? papers.us : papers.ussr;
      if (reduced) {
        anims.push(paper.animate([{ opacity: 1 }, { opacity: 0 }], { duration: papers.ms.fold, fill: "forwards" }));
        continue;
      }
      const me = paper.getBoundingClientRect();
      const hr = el.getBoundingClientRect();
      const target = card === papers.cancelled ? root.anchors.rect("discard") : null;
      const centre = (r: { left: number; top: number; width: number; height: number }) => [r.left + r.width / 2, r.top + r.height / 2] as const;
      const [mx, my] = centre(me);
      let to: string;
      if (target) {
        const [tx, ty] = centre(target);
        to = `translate(${tx - mx}px, ${ty - my}px) scale(.12)`;
      } else if (card === firstCard && !compact) {
        // Towards the reveal dock at the table's top right (ui-spec §9.5: right 64, top 34, 236 wide).
        to = `translate(${hr.right - 182 - mx}px, ${hr.top + 174 - my}px) scale(.3)`;
      } else {
        to = "translateY(40px) scale(.6)";
      }
      anims.push(paper.animate([{ transform: "none", opacity: 1 }, { transform: to, opacity: 0 }], { duration: papers.ms.fold, easing: EASE.in, fill: "forwards" }));
    }
    return () => { for (const a of anims) a.cancel(); };
  }, [papers.phase]);

  // Focus Continue while waiting (the papers are a dialog then); give focus back afterwards.
  useEffect(() => {
    if (!waiting || typeof document === "undefined") return;
    const opener = document.activeElement as HTMLElement | null;
    continueBtn.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [waiting]);

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    if (waiting) onContinue();
  };
  const order = t("ui:headline.order", { a: ops(firstCard), b: ops(secondCard), side: t(`ui:side.long.${first}`) });
  const style = { ["--drop" as string]: `${papers.ms.drop}ms`, ["--stamp" as string]: `${papers.ms.stamp}ms` } as CSSProperties;
  const body = (
    <div
      ref={host}
      className={s.scrim}
      data-phase={papers.phase}
      data-compact={compact || undefined}
      data-reduced={reduced || undefined}
      style={style}
      role={waiting ? "dialog" : "group"}
      aria-modal={waiting || undefined}
      aria-label={t("ui:headline.reveal")}
      onClick={stop}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className={s.papers}>
        <Paper side="US" card={papers.us} order={first === "US" ? 1 : 2} turn={papers.turn} cancelled={papers.cancelled === papers.us} photo={compact ? 64 : 140} />
        <Paper side="USSR" card={papers.ussr} order={first === "USSR" ? 1 : 2} turn={papers.turn} cancelled={papers.cancelled === papers.ussr} photo={compact ? 64 : 140} />
      </div>
      <p className={s.caption}>{order}</p>
      {waiting ? (
        <Button ref={continueBtn} variant="brass" kbd={t("ui:shortcuts.key.space")} onClick={onContinue} className={s.continue}>{t("ui:slip.continue")}</Button>
      ) : null}
    </div>
  );
  // One tree whether waiting or not (a remount would replay the drop): the key scope is active only while waiting.
  return <KeyScope active={waiting} modal onEscape={onContinue}><ContinueKeys enabled={waiting} onContinue={onContinue} />{body}</KeyScope>;
}

/** Space / Enter continue while the overlay waits (inside its key scope). */
export function ContinueKeys({ onContinue, enabled = true }: { onContinue(): void; enabled?: boolean }) {
  useKey(["Space", "Enter"], () => onContinue(), { allowOnControls: true, enabled });
  return null;
}

function Paper({ side, card, order, turn, cancelled, photo }: { side: Side; card: number; order: 1 | 2; turn: number; cancelled: boolean; photo: number }) {
  const { t, lang, cardName } = useI18n();
  const info = cardInfo(card);
  const lines = info ? cardTextLines(info.text[dataLang(lang)]) : [];
  return (
    <article className={s.paper} data-paper={side} data-side={side} aria-label={cardName(card)}>
      <header className={s.mast}>{t(side === "US" ? "ui:headline.papers.us" : "ui:headline.papers.ussr")}</header>
      <div className={s.dateline}>
        <span>{t("ui:headline.dateline", { side: t(`ui:side.${side}`), turn, ops: info?.ops ?? 0 })}</span>
      </div>
      <h3 className={s.hl}>{cardName(card)}</h3>
      <div className={s.photo}>
        <CardFace card={card} width={photo} eager className={s.img} />
        <div className={s.col}>
          {lines.map((line, i) => (
            <p key={i}>{line.map((span, j) => (span.em ? <em key={j}>{span.text}</em> : <span key={j}>{span.text}</span>))}</p>
          ))}
        </div>
      </div>
      <span className={s.order} aria-label={t(order === 1 ? "ui_stage:headline.first" : "ui_stage:headline.second")}>
        {t(order === 1 ? "ui_stage:headline.first" : "ui_stage:headline.second")}
      </span>
      {cancelled ? <Stamp tone="alert" size="l" tilt={-9} className={s.cancelled}>{t("ui:stamp.cancelled")}</Stamp> : null}
      <span className={s.band} aria-hidden="true" />
    </article>
  );
}
