/**
 * The rail's beat handlers (ui-spec §9.4, §15.3 W5 `useRailBeats(director, aiSide)`):
 *
 *  - `hand-revealed` (the AI's cards only; the tray handles yours): the backs flip one by one to faces
 *    (350 ms each, 90 ms apart), then a "Revealed" stamp on the dossier (300 ms). Reduced: the faces
 *    and the stamp just appear (the stamp's 300 ms stays).
 *  - `headline-chosen` (the AI's): a face-down card slides into the dossier's headline slot, "Committed"
 *    stamp (400 ms). Reduced: it appears.
 *  - `effect`: on → the chip arrives in the In-effect strip, shrinking into place with a pin (450 ms);
 *    off → it tears off (scaleY 1 → 0 with a 6° skew, 300 ms), then stays hidden until the commit
 *    removes the flag. Flags without `effectInfo` are not shown and resolve at once.
 *
 * Every handler writes the rail store first (so a Skip lands on the final picture) and resolves when
 * its motion is done; the store is cleared at the commit.
 */
import { useContext, useEffect, useRef } from "react";
import { effectInfo } from "../../data";
import type { Side } from "../../game/contract";
import { abortableSleep } from "../runner/frameRunner";
import { useOnCommit } from "../runner/ShownContext";
import { UiRootContext } from "../state/context";
import { isReducedMotion, systemPrefersReducedMotion } from "../state/useReducedMotion";
import { TIMING, dur } from "../theme";
import type { Director, UiRoot } from "../ui-contract";
import { shareRegistration } from "../console/shared";
import { railStoreFor, type RailStore } from "./railStore";

export interface RailHandlerDeps {
  store: RailStore;
  /** The AI's side (only its reveals and headline are the rail's). */
  aiSide(): Side;
  reduced(): boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function registerRailHandlers(director: Director, deps: RailHandlerDeps): () => void {
  return shareRegistration(deps.store, deps, cur => registerOnce(director, deps.store, cur));
}

function registerOnce(director: Director, store: RailStore, cur: () => RailHandlerDeps): () => void {
  const wait = (ms: number, signal: AbortSignal) => {
    const sleep = cur().sleep ?? abortableSleep;
    return ms > 0 && !signal.aborted ? sleep(ms, signal) : Promise.resolve();
  };

  const offRevealed = director.on("hand-revealed", async (beat, ctx) => {
    const deps = cur();
    if (beat.side !== deps.aiSide() || !beat.cards.length) return;
    const reduced = deps.reduced();
    const per = dur(TIMING.handRevealed.perCard, ctx.speed.motion);
    const stagger = dur(TIMING.handRevealed.stagger, ctx.speed.motion);
    // Reduced motion keeps the stamp's moment, not the flips.
    const stamp = dur(TIMING.handRevealed.stamp, ctx.speed.motion);
    const seq = store.nextSeq();
    store.update(v => ({ ...v, reveal: { cards: [...beat.cards], seq, per: reduced ? 0 : per, stagger: reduced ? 0 : stagger, reduced } }));
    const motion = reduced ? 0 : per + stagger * (beat.cards.length - 1);
    await wait(motion + stamp, ctx.signal);
  });

  const offHeadline = director.on("headline-chosen", async (beat, ctx) => {
    const deps = cur();
    if (beat.side !== deps.aiSide()) return;
    const reduced = deps.reduced();
    const ms = dur(TIMING.headlineChosen.dur, ctx.speed.motion);
    const seq = store.nextSeq();
    store.update(v => ({ ...v, headline: { seq, ms: reduced ? 0 : ms, reduced } }));
    await wait(ms, ctx.signal);
  });

  const offEffect = director.on("effect", async (beat, ctx) => {
    if (!effectInfo(beat.flag)) return;
    const reduced = cur().reduced();
    const ms = dur(beat.on ? TIMING.effectOn.dur : TIMING.effectOff.dur, ctx.speed.motion);
    const seq = store.nextSeq();
    const entry = { seq, ms: reduced ? 0 : ms, reduced };
    store.update(v => beat.on
      ? { ...v, fxOn: { ...v.fxOn, [beat.flag]: entry } }
      : { ...v, fxOff: { ...v.fxOff, [beat.flag]: entry } });
    await wait(reduced ? 0 : ms, ctx.signal);
  });

  return () => {
    offRevealed();
    offHeadline();
    offEffect();
  };
}

/** Register the rail's handlers for as long as the caller is mounted (Rail, RailStrip, compact hosts). */
export function useRailBeats(director: Director, aiSide: Side): void {
  const root = useContext(UiRootContext);
  const rootRef = useRef<UiRoot | null>(root);
  rootRef.current = root;
  const sideRef = useRef(aiSide);
  sideRef.current = aiSide;
  const store = railStoreFor(director);
  useOnCommit(() => store.reset());
  useEffect(() => registerRailHandlers(director, {
    store,
    aiSide: () => sideRef.current,
    reduced: () => isReducedMotion(rootRef.current?.settings.motion ?? "system", systemPrefersReducedMotion()),
  }), [director, store]);
}
