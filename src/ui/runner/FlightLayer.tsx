/**
 * The flight layer (ui-spec §9.6; catalogue rows `card-moved`, `deal`, `reshuffle` of §9.4): a
 * fixed, pointer-transparent portal at z `--ts-z-flight` where cards fly between anchors along a
 * quadratic arc (40 px lift). It registers three beat handlers with the Director:
 *
 *  - `card-moved`: one card from `anchorForLocation(from)` to `anchorForLocation(to)`, face up, or a
 *    back when it ends out of sight; skipped when an anchor is missing (a collapsed rail...).
 *  - `deal`: deck → your hand (faces, flipping at mid-flight) or the AI dossier (backs); up to 4
 *    flights, staggered, the rest just appear at commit.
 *  - `reshuffle`: three offset ghost backs slide from the discard pile onto the deck, and the
 *    toast "Deck exhausted…".
 *
 * Reduced motion: nothing travels; the card fades out at its source and in at its destination
 * (≤ 150 ms each). The reshuffle keeps only its toast. Speed 0 (instant, skipping) or Skip: no flight.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/react";
import { CardBack } from "../cards/CardBack";
import { CardFace } from "../cards/CardFace";
import { systemPrefersReducedMotion, isReducedMotion } from "../state/useReducedMotion";
import { useUiRoot } from "../state/context";
import { EASE, TIMING, dur } from "../theme";
import type { AnchorId, AnchorRegistry, BeatContext } from "../ui-contract";
import { dealtCards } from "./beats";
import { flightFor } from "./locations";
import { useShown } from "./ShownContext";
import s from "./FlightLayer.module.css";

/** Flight card size (ui-spec §9.6). */
export const FLIGHT_W = 60;
export const FLIGHT_H = 84;
const LIFT = 40;
const DEAL_FLIGHTS = 4;

interface Pt { x: number; y: number }

export interface FlightSpec {
  id: number;
  card: number;
  /** Face down for the whole flight. */
  back: boolean;
  /** Start face down, turn face up at mid-flight. */
  flip: boolean;
  from: DOMRect;
  to: DOMRect;
  duration: number;
  delay: number;
  reduced: boolean;
  /** Pixel offset of a ghost in a stack (reshuffle). */
  offset?: number;
}

const centre = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The arc keyframes (translate of the card's centre, scale to the anchor size). Pure. */
export function arcKeyframes(from: DOMRect, to: DOMRect, steps = 12, offset = 0): Keyframe[] {
  const a = centre(from);
  const b = centre(to);
  const lift = LIFT + Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  const s0 = fitScale(from);
  const s1 = fitScale(to);
  const out: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x - FLIGHT_W / 2 + offset;
    const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y - FLIGHT_H / 2 - offset;
    const sc = s0 + (s1 - s0) * t;
    out.push({ offset: t, visibility: "visible", transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})` });
  }
  return out;
}

/** The card's scale at an anchor: as big as fits the anchor, within 0.35–1.6. */
function fitScale(r: DOMRect): number {
  return Math.max(0.35, Math.min(1.6, r.width / FLIGHT_W, r.height / FLIGHT_H));
}

function placeAt(r: DOMRect, offset = 0): string {
  const c = centre(r);
  const sc = fitScale(r);
  return `translate(${(c.x - FLIGHT_W / 2 + offset).toFixed(1)}px, ${(c.y - FLIGHT_H / 2 - offset).toFixed(1)}px) scale(${sc.toFixed(3)})`;
}

function Sprite({ spec, onDone }: { spec: FlightSpec; onDone: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || typeof node.animate !== "function") {
      onDone(spec.id);
      return;
    }
    const anims: Animation[] = [];
    if (spec.reduced) {
      // Fade out at the source, then in and out at the destination: no travel (ui-spec §9.3).
      const a = placeAt(spec.from, spec.offset);
      const b = placeAt(spec.to, spec.offset);
      anims.push(node.animate(
        [
          { opacity: 1, visibility: "visible", transform: a, offset: 0 },
          { opacity: 0, visibility: "visible", transform: a, offset: 0.33 },
          { opacity: 0, visibility: "visible", transform: b, offset: 0.34 },
          { opacity: 1, visibility: "visible", transform: b, offset: 0.67 },
          { opacity: 0, visibility: "visible", transform: b, offset: 1 },
        ],
        { duration: Math.min(450, Math.max(180, spec.duration)), delay: spec.delay, fill: "both", easing: EASE.linear }));
    } else {
      anims.push(node.animate(arcKeyframes(spec.from, spec.to, 12, spec.offset), { duration: spec.duration, delay: spec.delay, fill: "both", easing: EASE.inOut }));
      if (spec.flip && inner.current) {
        anims.push(inner.current.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: 0.35 }, { transform: "rotateY(0deg)", offset: 0.65 }, { transform: "rotateY(0deg)" }],
          { duration: spec.duration, delay: spec.delay, fill: "both", easing: EASE.inOut }));
      }
    }
    // Unmounting cancels without reporting: an abort or the layer's own cleanup releases the
    // waiter (and StrictMode's remount simply starts the flight again).
    let live = true;
    const finish = () => { if (live) onDone(spec.id); };
    Promise.all(anims.map(a => a.finished)).then(finish, finish);
    return () => {
      live = false;
      for (const a of anims) a.cancel();
    };
  }, [spec, onDone]);
  // Until the animation applies its first keyframe (fill: both, also during the delay), the card
  // waits unseen at the viewport origin.
  const style: CSSProperties = { width: FLIGHT_W, height: FLIGHT_H, visibility: "hidden" };
  return (
    <div ref={el} className={s.flight} style={style} data-flight={spec.card || "back"}>
      <div ref={inner} className={s.inner} data-flip={spec.flip || undefined}>
        {spec.back || spec.card === 0 ? (
          <div className={s.face}><CardBack width={FLIGHT_W} label="" /></div>
        ) : (
          <>
            <div className={s.face}><CardFace card={spec.card} width={FLIGHT_W} eager /></div>
            {spec.flip && <div className={`${s.face} ${s.backFace}`}><CardBack width={FLIGHT_W} label="" /></div>}
          </>
        )}
      </div>
    </div>
  );
}

/** Rect of an anchor, or null (also null without a DOM). */
function rectOf(anchors: AnchorRegistry, id: AnchorId): DOMRect | null {
  try {
    return anchors.rect(id);
  } catch {
    return null;
  }
}

export function FlightLayer() {
  const root = useUiRoot();
  const shown = useShown();
  const { t } = useI18n();
  const [flights, setFlights] = useState<readonly FlightSpec[]>([]);
  const waiters = useRef(new Map<number, () => void>());
  const nextId = useRef(1);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const rootRef = useRef(root);
  rootRef.current = root;
  const tRef = useRef(t);
  tRef.current = t;

  const onDone = useRef((id: number) => {
    const w = waiters.current.get(id);
    waiters.current.delete(id);
    setFlights(list => list.filter(f => f.id !== id));
    w?.();
  }).current;

  useEffect(() => {
    const { director, anchors } = rootRef.current;
    const reduced = () => isReducedMotion(rootRef.current.settings.motion, systemPrefersReducedMotion());

    /** Launch flights; resolves when all landed, or at once on abort. */
    const fly = (specs: Omit<FlightSpec, "id">[], ctx: BeatContext): Promise<void> => {
      if (!specs.length || ctx.signal.aborted) return Promise.resolve();
      const withIds = specs.map(sp => ({ ...sp, id: nextId.current++ }));
      const done = withIds.map(sp => new Promise<void>(resolve => waiters.current.set(sp.id, resolve)));
      setFlights(list => [...list, ...withIds]);
      const abort = () => {
        const ids = new Set(withIds.map(x => x.id));
        for (const id of ids) {
          waiters.current.get(id)?.();
          waiters.current.delete(id);
        }
        setFlights(list => list.filter(f => !ids.has(f.id)));
      };
      ctx.signal.addEventListener("abort", abort, { once: true });
      return Promise.all(done).then(() => ctx.signal.removeEventListener("abort", abort));
    };

    const offCard = director.on("card-moved", (beat, ctx) => {
      const d = dur(TIMING.cardMoved.dur, ctx.speed.motion);
      if (d <= 0) return Promise.resolve();
      // The beat carries the event's fromHand (beats.ts), so a card taken out of the AI's hand starts there.
      const plan = flightFor(beat, { aiPlayCard: shownRef.current.aiPlayCard, mounted: id => anchors.rect(id) !== null });
      if (!plan) return Promise.resolve();
      const from = rectOf(anchors, plan.from);
      const to = rectOf(anchors, plan.to);
      if (!from || !to) return Promise.resolve();
      return fly([{ card: beat.card, back: plan.back, flip: false, from, to, duration: d, delay: 0, reduced: reduced() }], ctx);
    });

    const offDeal = director.on("deal", (beat, ctx) => {
      const per = dur(TIMING.deal.perCard, ctx.speed.motion);
      if (per <= 0 || reduced()) return Promise.resolve();
      const from = rectOf(anchors, "deck");
      if (!from) return Promise.resolve();
      const human = beat.side === ctx.humanSide;
      const cards = human ? dealtCards(ctx.frame, beat.side) : [];
      const n = Math.min(DEAL_FLIGHTS, human ? cards.length || beat.count : beat.count);
      const stagger = dur(TIMING.deal.stagger, ctx.speed.motion);
      const specs: Omit<FlightSpec, "id">[] = [];
      for (let i = 0; i < n; i++) {
        const card = human ? cards[i] ?? 0 : 0;
        const target: AnchorId = card && anchors.rect(`card:${card}`) ? `card:${card}` : `hand:${beat.side}`;
        const to = rectOf(anchors, target);
        if (!to) continue;
        const delay = Math.min(i * stagger, Math.max(0, dur(TIMING.deal.maxTotal, ctx.speed.motion) - per));
        specs.push({ card, back: !human || !card, flip: human && !!card, from, to, duration: per, delay, reduced: false });
      }
      return fly(specs, ctx);
    });

    const offReshuffle = director.on("reshuffle", (_beat, ctx) => {
      rootRef.current.toast(tRef.current("ui:toast.reshuffle"), { ms: TIMING.reshuffle.toast });
      const d = dur(TIMING.reshuffle.dur, ctx.speed.motion);
      if (d <= 0 || reduced()) return Promise.resolve();
      const from = rectOf(anchors, "discard");
      const to = rectOf(anchors, "deck");
      if (!from || !to) return Promise.resolve();
      const each = Math.round(d * 0.7);
      const step = Math.round((d - each) / 2);
      return fly([0, 1, 2].map(i => ({ card: 0, back: true, flip: false, from, to, duration: each, delay: i * step, reduced: false, offset: i * 3 })), ctx);
    });

    return () => {
      offCard();
      offDeal();
      offReshuffle();
      for (const w of waiters.current.values()) w();
      waiters.current.clear();
    };
  }, [root.director, root.anchors]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={s.layer} aria-hidden="true" data-testid="flight-layer">
      {flights.map(f => <Sprite key={f.id} spec={f} onDone={onDone} />)}
    </div>,
    document.body,
  );
}

