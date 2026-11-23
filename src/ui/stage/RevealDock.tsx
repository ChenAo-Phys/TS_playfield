/**
 * The reveal dock (ui-spec §9.4 `card-played` (AI), §9.5, final.css `.reveal-dock`): the AI's card
 * leaves the adversary dossier, flies to the dock at the table's top right and flips at mid-flight;
 * the caption gives the kicker ("United States plays"), the name and the how line, which fills in as
 * later beats arrive ("Operations · Coup → Angola · 1 Op"), plus a note when an opponent card is played
 * for Ops. After the hold the dock stays pinned in its compact form until the play ends, moving to the
 * top left if a box it covers changes or a scoring sheet docks under it (folding away when the table has no
 * room for both), then collapses into the pile the card went to.
 *
 * Headline cards resolve through the dock too (the paper folds into it). Compact layout: the reveal
 * shows centred for its hold and then shrinks away (the shell's ticker shows the play banner).
 * Registers the `dock` anchor (the card) for flights and the VP chip.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { cardInfo } from "../../data";
import { useI18n } from "../../i18n/react";
import { CardBack } from "../cards/CardBack";
import { CardFace } from "../cards/CardFace";
import { SideGlyph } from "../common/SideGlyph";
import { Stamp } from "../common/Stamp";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import { dur, EASE, SPEED_FACTOR, TIMING } from "../theme/motion";
import { isOpsPlay } from "./model";
import type { DockState } from "./stageStore";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./RevealDock.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Full-size card in the dock (px) and the pinned (compact form) one. */
export const DOCK_CARD_W = 200;
export const DOCK_PINNED_W = 120;

export function RevealDock() {
  const store = useStageStore();
  useStageBeats(["reveal", "country", "dockTrack"], store);
  const dock = useStageState(st => st.dock, store);
  const leaving = useStageState(st => st.leaving, store);
  const list = dock ? [...leaving, dock] : leaving;
  if (!list.length) return null;
  return (
    <>
      {list.map(d => <DockPanel key={d.key} dock={d} />)}
    </>
  );
}

/** The current reveal dock's slot (desktop / tablet, not collapsing) inside the stage element `host`, else null. */
export function dockSlotIn(host: Element): HTMLElement | null {
  return host.querySelector<HTMLElement>(":scope > [data-dock-slot]:not([data-leaving]):not([data-compact])");
}

/**
 * The current reveal dock inside the stage element `host` (desktop / tablet; not one collapsing into its
 * pile): its box where it is and where it would be in the other top corner of the table, measured by
 * switching its slot over and back before the next paint, with the side it is on (`pos`, as drawn). Its slot,
 * not the panel, so a running flight or slide does not count. Null when there is none. The scoring sheet and the dice trays keep clear of it (R-006).
 */
export function measureDock(host: Element): { pos: DockState["pos"]; here: DOMRect; there: DOMRect } | null {
  const slot = dockSlotIn(host);
  if (!slot) return null;
  const pos = slot.dataset.pos === "left" ? "left" : "right";
  const here = slot.getBoundingClientRect();
  slot.dataset.pos = pos === "left" ? "right" : "left";
  const there = slot.getBoundingClientRect();
  slot.dataset.pos = pos;
  return { pos, here, there };
}

/** One dock (also used by tests and the demo with a fixed state). */
export function DockPanel({ dock: d }: { dock: DockState }) {
  const root = useUiRoot();
  const { t, cardName, countryName } = useI18n();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLElement | null>(null);
  const cardBox = useRef<HTMLDivElement | null>(null);
  const flip = useRef<HTMLDivElement | null>(null);
  const cap = useRef<HTMLDivElement | null>(null);
  const lastRect = useRef<DOMRect | null>(null);
  const lastPos = useRef(d.pos);
  const headline = d.how === "headline";
  const anchorRef = root.anchors.ref("dock");
  // The card is also `card:<id>` while it is in the dock: the VP chip of its play starts there (gap G7 source.card).
  const cardRef = root.anchors.ref(`card:${d.card}`);
  const setCardBox = useCallback((el: HTMLDivElement | null) => { cardBox.current = el; anchorRef(el); cardRef(el); }, [anchorRef, cardRef]);
  const pinned = d.phase === "pinned" || d.phase === "leaving";

  // Enter: the card flies from the adversary dossier (or the papers) and flips at mid-flight.
  useIsoLayoutEffect(() => {
    const el = panel.current, box = cardBox.current, inner = flip.current;
    if (!el || !box || !inner || d.phase !== "enter" || d.enterMs <= 0) return;
    if (reduced || d.flightMs <= 0) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d.enterMs, easing: "linear" });
      return;
    }
    const to = box.getBoundingClientRect();
    const from = d.from ? root.anchors.rect(d.from) : null;
    const anims: Animation[] = [];
    if (from && to.width > 0) {
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const k = Math.max(0.15, Math.min(1, from.height / to.height));
      anims.push(box.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: "none" }],
        { duration: d.flightMs, easing: EASE.out },
      ));
    } else {
      anims.push(box.animate([{ transform: "translateY(-24px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: d.flightMs, easing: EASE.out }));
    }
    if (!headline) {
      const flipShare = TIMING.aiCardReveal.flip / TIMING.aiCardReveal.flight;
      const a = (1 - flipShare) / 2;
      anims.push(inner.animate(
        [{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: a }, { transform: "rotateY(0deg)", offset: 1 - a }, { transform: "rotateY(0deg)" }],
        { duration: d.flightMs, easing: EASE.inOut },
      ));
    }
    anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(d.flightMs, TIMING.aiCardReveal.caption), easing: "linear" }));
    const captionMs = Math.max(0, d.enterMs - d.flightMs);
    if (cap.current) {
      anims.push(cap.current.animate(
        [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 0, transform: "translateY(4px)", offset: d.flightMs / d.enterMs }, { opacity: 1, transform: "none" }],
        { duration: d.flightMs + captionMs, easing: "linear" },
      ));
    }
    return () => { for (const a of anims) a.finish(); };
  }, [d.key]);

  // Avoidance: slide from the top right to the top left (FLIP).
  useIsoLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const now = el.getBoundingClientRect();
    const before = lastRect.current;
    lastRect.current = now;
    if (lastPos.current === d.pos) return;
    lastPos.current = d.pos;
    if (!before) return;
    const speed = SPEED_FACTOR[root.settings.speed] ?? 1;
    const ms = dur(TIMING.aiCardReveal.dock, speed);
    if (ms <= 0) return;
    if (reduced) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear" });
      return;
    }
    el.animate([{ transform: `translateX(${before.left - now.left}px)` }, { transform: "none" }], { duration: ms, easing: EASE.inOut });
  });

  // Collapse into the card's pile (or fade / shrink away).
  useIsoLayoutEffect(() => {
    const el = panel.current;
    if (!el || d.phase !== "leaving" || d.leaveMs <= 0) return;
    const me = el.getBoundingClientRect();
    const target = d.to ? root.anchors.rect(d.to) : null;
    let frames: Keyframe[];
    if (reduced) frames = [{ opacity: 1 }, { opacity: 0 }];
    else if (target && me.width > 0) {
      const dx = target.left + target.width / 2 - (me.left + me.width / 2);
      const dy = target.top + target.height / 2 - (me.top + me.height / 2);
      const k = Math.max(0.08, Math.min(1, target.height / me.height));
      frames = [{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.2 }];
    } else if (d.compact) frames = [{ transform: "none", opacity: 1 }, { transform: "translateY(-40%) scale(.4)", opacity: 0 }];
    else frames = [{ transform: "none", opacity: 1 }, { transform: "scale(.85)", opacity: 0 }];
    const a = el.animate(frames, { duration: d.leaveMs, easing: EASE.inOut, fill: "forwards" });
    return () => a.cancel();
  }, [d.phase]);

  const side = d.side;
  const kicker = headline
    ? t("ui_stage:dock.kickerHeadline", { side: t(`ui:side.${side}`) })
    : t("ui_stage:dock.kicker", { side: t(`ui:side.long.${side}`) });
  const howText = t(`ui_stage:dock.how.${d.how}`);
  const target = d.country !== null && d.country >= 0 ? t("ui_stage:dock.target", { how: howText, country: countryName(d.country) }) : howText;
  const ops = isOpsPlay(d.how) ? cardInfo(d.card)?.ops ?? null : null;
  const style = {
    ["--k" as string]: pinned ? String(DOCK_PINNED_W / DOCK_CARD_W) : "1",
    ["--dock-ms" as string]: `${dur(TIMING.aiCardReveal.dock, SPEED_FACTOR[root.settings.speed] ?? 1)}ms`,
  } as CSSProperties;
  return (
    <div className={s.slot} data-dock-slot="" data-pos={d.pos} data-compact={d.compact || undefined} data-leaving={d.phase === "leaving" || undefined} data-side={side}>
      <section
        ref={panel}
        className={s.dock}
        data-phase={d.phase}
        data-pinned={pinned || undefined}
        style={style}
        aria-label={t("ui_stage:dock.label", { side: t(`ui:side.long.${side}`) })}
      >
        <div className={s.kicker}>
          <SideGlyph side={side} size={12} className={s.glyph} />
          <span>{kicker}</span>
        </div>
        <div className={s.cardBox} ref={setCardBox}>
          <div className={s.flip} ref={flip}>
            <div className={s.front}><CardFace card={d.card} width={DOCK_CARD_W} eager /></div>
            {headline ? null : <div className={s.back} aria-hidden="true"><CardBack width={DOCK_CARD_W} label="" /></div>}
          </div>
          {d.how === "pass" ? <Stamp side={side} size="m" tilt={-8} className={s.stamp}>{t("ui:stamp.pass")}</Stamp> : null}
        </div>
        <div className={s.cap} ref={cap}>
          <div className={s.name}>{cardName(d.card)}</div>
          <div className={s.how}>
            <span>{target}</span>
            {ops !== null ? <span className={s.ops}>{t("ui_stage:dock.ops", { count: ops })}</span> : null}
          </div>
          {d.note ? <div className={s.note}>{t("ui_stage:dock.opponentNote", { owner: t(`ui:side.${d.note}`) })}</div> : null}
        </div>
      </section>
    </div>
  );
}
