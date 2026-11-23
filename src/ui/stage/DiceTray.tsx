/**
 * The dice tray (ui-spec §9.4 `roll`, final.css `.dice-tray`): a felt tray beside the target box (never
 * over it, never under the reveal dock) — the country for coups, realignments and wars, the space
 * track for the Space Race, the table centre otherwise. A reticle locks on, the die tumbles and lands
 * on the engine's roll, then the maths line and the result ("US −1 · USSR +3") type in. Two dice for
 * opposed rolls: US left, USSR right, modifiers under each. Reduced motion: the final face and the
 * maths at once, same hold. The tray stays until the frame commits.
 *
 * Placement: the tray is measured once with its final content (maths and result; a hidden pass before
 * the first paint) and no wider than the table, so the spot it gets keeps it whole inside the table when
 * those lines arrive; the maths wraps on a narrow table. A later change of its size (fonts, language) or
 * of the table's moves it back inside.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../../i18n/react";
import { Die } from "../common/Die";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import { clampInside, hangUnder, placeBeside, type Box, type DiceModel } from "./model";
import { dockSlotIn } from "./RevealDock";
import type { DiceState } from "./stageStore";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./DiceTray.module.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DiceTray() {
  const store = useStageStore();
  useStageBeats(["roll"], store);
  const dice = useStageState(st => st.dice, store);
  if (!dice) return null;
  return <PlacedTray key={dice.key} dice={dice} />;
}

/** Inside the table (the stage), 8 px from its edges. */
const EDGE = 8;

/** The tray positioned beside its anchor inside the stage. */
function PlacedTray({ dice }: { dice: DiceState }) {
  const root = useUiRoot();
  const reduced = useReducedMotion();
  const el = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  /** The widest the tray may be: the table's width inside its margins (null until measured). */
  const [maxW, setMaxW] = useState<number | null>(null);
  const [lock, setLock] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  // Measured with its final content (the first render shows the landed tray, hidden), so the spot
  // fits the tray once the maths and the result are in.
  useIsoLayoutEffect(() => {
    const tray = el.current;
    const host = tray?.offsetParent as HTMLElement | null;
    if (!tray || !host) return;
    const hr = host.getBoundingClientRect();
    const bounds = boundsOf(hr);
    tray.style.maxWidth = `${bounds.w}px`;
    setMaxW(bounds.w);
    const size = { w: tray.offsetWidth, h: tray.offsetHeight };
    const local = (r: DOMRect) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height });
    const a = root.anchors.rect(dice.anchor);
    // The whole reveal dock (card and caption), not only its card (R-006).
    const dock = dockSlotIn(host)?.getBoundingClientRect();
    const avoid = dock ? [local(dock)] : [];
    if (a && dice.anchor !== "stage") {
      const anchor = local(a);
      const inside = anchor.x + anchor.w > 0 && anchor.y + anchor.h > 0 && anchor.x < hr.width && anchor.y < hr.height;
      if (inside) {
        setPos(placeBeside(anchor, size, bounds, avoid));
        if (dice.anchor.startsWith("country:")) setLock(anchor);
        return;
      }
      // The space track sits in the console above the table: hang the tray from the table's top edge under it,
      // beside the pinned dock rather than under it (R-006).
      const cx = anchor.x + anchor.w / 2;
      const x = Math.max(bounds.x, Math.min(cx - size.w / 2, bounds.x + bounds.w - size.w));
      setPos(hangUnder(cx, size, bounds, avoid) ?? placeBeside({ x, y: 0, w: size.w, h: 1 }, size, bounds, avoid));
      return;
    }
    setPos(clampInside({ x: (hr.width - size.w) / 2, y: hr.height * 0.42 - size.h / 2 }, size, bounds));
  }, [dice.key]);

  // Fonts, a language switch or a resized table: back inside the table (as little a move as possible).
  useEffect(() => {
    const tray = el.current;
    const host = tray?.offsetParent as HTMLElement | null;
    if (!tray || !host || typeof ResizeObserver === "undefined") return;
    const refit = () => {
      const p = posRef.current;
      if (!p) return;
      const bounds = boundsOf(host.getBoundingClientRect());
      setMaxW(w => (w === bounds.w ? w : bounds.w));
      const next = clampInside(p, { w: tray.offsetWidth, h: tray.offsetHeight }, bounds);
      if (next.x !== p.x || next.y !== p.y) setPos(next);
    };
    const ro = new ResizeObserver(refit);
    ro.observe(tray);
    ro.observe(host);
    return () => ro.disconnect();
  }, [dice.key]);

  const placed = pos !== null;
  return (
    <>
      {lock && (dice.phase === "lock" || dice.phase === "tumble") ? (
        <span
          className={s.reticle}
          aria-hidden="true"
          data-reduced={reduced || undefined}
          style={{ left: lock.x - 6, top: lock.y - 6, width: lock.w + 12, height: lock.h + 12, ["--ms" as string]: `${dice.ms.lock}ms` } as CSSProperties}
        />
      ) : null}
      <div
        ref={el}
        className={s.place}
        style={placed ? { left: pos.x, top: pos.y, maxWidth: maxW ?? undefined } : { left: 0, top: 0, visibility: "hidden" }}
        data-phase={dice.phase}
        data-reduced={reduced || undefined}
        aria-hidden={placed ? undefined : true}
      >
        {/* Unplaced: the landed tray (hidden), only to measure the size it will reach. */}
        <DiceTrayView model={dice.model} phase={placed ? dice.phase : "hold"} tumbleMs={dice.ms.tumble} mathMs={dice.ms.math} />
      </div>
    </>
  );
}

/** The box the tray may use inside the table (stage) whose client rect is `hr`, in stage coordinates. */
function boundsOf(hr: { width: number; height: number }): Box {
  return { x: EDGE, y: EDGE, w: Math.max(0, hr.width - 2 * EDGE), h: Math.max(0, hr.height - 2 * EDGE) };
}

export interface DiceTrayViewProps {
  model: DiceModel;
  phase: DiceState["phase"];
  tumbleMs?: number;
  mathMs?: number;
}

/** The tray's content (also used by tests and the demo). */
export function DiceTrayView({ model, phase, tumbleMs = 0, mathMs = 0 }: DiceTrayViewProps) {
  const { render } = useI18n();
  const reduced = useReducedMotion();
  const landed = phase === "math" || phase === "hold" || phase === "out";
  const tumbling = phase === "tumble" && !reduced;
  const flicker = useFlicker(tumbling);
  const result = model.ok === null ? undefined : model.ok ? "ok" : "fail";
  const title = render(model.title);
  return (
    <div className={s.tray} data-phase={phase} data-ok={model.ok === null ? "none" : String(model.ok)} role="group" aria-label={title}>
      <div className={s.dice}>
        {model.dice.map((d, i) => (
          <span key={i} className={s.dieCol}>
            <span className={tumbling ? s.tumble : landed && !reduced ? s.land : undefined} style={{ ["--ms" as string]: `${tumbleMs}ms` } as CSSProperties}>
              <Die face={landed || reduced ? d.face : flicker[i % flicker.length]!} side={d.side} size={40} tilt={-8} result={landed ? result : undefined} />
            </span>
            {d.mod !== undefined ? <span className={`${s.mod} ts-num`} aria-hidden={!landed}>{d.mod}</span> : null}
          </span>
        ))}
      </div>
      <div className={s.text} style={{ ["--ms" as string]: `${mathMs}ms` } as CSSProperties}>
        <div className={s.title}>{title}</div>
        {landed ? (
          <>
            {model.math ? <div className={`${s.math} ts-num`}>{render(model.math)}</div> : null}
            <div className={s.result}>{model.result.map(m => render(m)).join(" · ")}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Random faces every 80 ms while the dice tumble (cosmetic; the result comes from the engine). */
function useFlicker(on: boolean): number[] {
  const [faces, setFaces] = useState([3, 5]);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 80);
    return () => clearInterval(id);
  }, [on]);
  return faces;
}
