/**
 * The console's beat handlers (ui-spec §9.4: `action-round`, `vp`, `defcon`, `milops`, `space`, all
 * delivered as `track` beats) and the hooks the instruments read.
 *
 *  - action-round: the new current half-pip floods brass, the readout changes (300 ms).
 *  - vp: a "+3" chip flies from the source (`source.country` → its box, `source.card` → the card /
 *    stage, else the last country changed in the frame, else the table centre) to the gauge (600 ms
 *    `out`), then the needle swings with an overshoot (600 ms `back`) and the number rolls. Reduced:
 *    no chip, the needle jumps, the readout flashes.
 *  - defcon: down → the new lamp flickers twice and lights (300 + 400 ms), the console border flashes,
 *    at 2 the toast "DEFCON 2: a battleground coup now ends the game"; up → a 400 ms cross-fade.
 *  - milops: the cells fill or empty left to right (300 ms, 40 ms stagger).
 *  - space: the marker hops one box (600 ms); a privilege box shows its privilege for 2 s (under the
 *    instrument, or as a toast when the Space instrument is not on screen).
 *
 * Each handler writes its override to the track store first, so a Skip (abort) still lands on the
 * final value; the store is cleared at the commit. Handlers are registered once per Director however
 * many consoles / status panels are mounted.
 */
import { useContext, useEffect, useMemo, useRef } from "react";
import { cardInfo } from "../../data";
import type { GameEvent, PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { abortableSleep } from "../runner/frameRunner";
import { useOnCommit } from "../runner/ShownContext";
import { UiRootContext } from "../state/context";
import { isReducedMotion, systemPrefersReducedMotion } from "../state/useReducedMotion";
import { EASE, TIMING, dur } from "../theme";
import type { AnchorId, AnchorRegistry, BeatContext, Director, UiRoot } from "../ui-contract";
import { vpHistory, vpLead, type VpPoint, SPACE_PERK_BOXES } from "./model";
import { shareRegistration } from "./shared";
import { trackStoreFor, useTrackView, type TrackAnimKey, type TrackStore } from "./trackStore";
import s from "./Console.module.css";

type TrackEvent = Extract<GameEvent, { t: "vp" | "defcon" | "milops" | "space" | "action-round" }>;

export interface TrackHandlerDeps {
  store: TrackStore;
  anchors(): AnchorRegistry;
  toast(message: string, opts?: { tone?: "info" | "warn"; ms?: number }): void;
  /** Translated text (the current language). */
  text: {
    defcon2(): string;
    vpChip(side: Side, n: number): string;
    perk(side: Side, box: number): string;
  };
  reduced(): boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Fly the VP chip (DOM); resolves when it lands. Default: a WAAPI chip on document.body. */
  flyChip?: (spec: ChipSpec, signal: AbortSignal) => Promise<void>;
}

export interface ChipSpec {
  text: string;
  side: Side;
  from: DOMRect;
  to: DOMRect;
  ms: number;
}

/**
 * Where the VP chip starts (ui-spec §9.4 `vp`, gap G7 fallback): the event's country; for a scoring card
 * the scoring sheet's net bar (anchor `scoring`) while it is mounted; the source card; the frame's last
 * country; the table's centre. Null: no visible source.
 */
export function chipSource(e: Extract<GameEvent, { t: "vp" }>, frame: BeatContext["frame"], anchors: AnchorRegistry): DOMRect | null {
  const rect = (id: AnchorId) => {
    try { return anchors.rect(id); } catch { return null; }
  };
  if (e.source?.country !== undefined) {
    const r = rect(`country:${e.source.country}`);
    if (r) return r;
  }
  if (e.source?.card) {
    if (cardInfo(e.source.card)?.scoring) {
      const r = rect("scoring");
      if (r) return r;
    }
    const r = rect(`card:${e.source.card}`);
    if (r) return r;
  }
  for (let i = frame.events.length - 1; i >= 0; i--) {
    const x = frame.events[i]!;
    if (x.t === "influence" || x.t === "control") {
      const r = rect(`country:${x.country}`);
      if (r) return r;
      break;
    }
  }
  const stage = rect("stage");
  if (!stage) return null;
  return centred(stage);
}

function centred(r: DOMRect): DOMRect {
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  return typeof DOMRect === "function" ? new DOMRect(x - 1, y - 1, 2, 2) : ({ left: x - 1, top: y - 1, width: 2, height: 2, right: x + 1, bottom: y + 1, x: x - 1, y: y - 1, toJSON: () => null } as DOMRect);
}

/** The default chip: a pill on document.body flying on a shallow arc, removed when it lands. */
export function flyChipDom(spec: ChipSpec, signal: AbortSignal): Promise<void> {
  if (typeof document === "undefined" || signal.aborted) return Promise.resolve();
  const el = document.createElement("div");
  el.className = `${s.vpChip} ${spec.side === "US" ? s.chipUs : s.chipUssr}`;
  el.textContent = spec.text;
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  if (typeof el.animate !== "function") {
    el.remove();
    return Promise.resolve();
  }
  const w = el.offsetWidth || 40;
  const h = el.offsetHeight || 18;
  const a = { x: spec.from.left + spec.from.width / 2 - w / 2, y: spec.from.top + spec.from.height / 2 - h / 2 };
  const b = { x: spec.to.left + spec.to.width / 2 - w / 2, y: spec.to.top + spec.to.height / 2 - h / 2 };
  const lift = 30 + Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.06);
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
    const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    frames.push({ offset: t, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1.15 - 0.3 * t).toFixed(3)})`, opacity: t > 0.9 ? 0.4 : 1 });
  }
  const anim = el.animate(frames, { duration: spec.ms, easing: EASE.out, fill: "both" });
  return new Promise<void>(resolve => {
    const done = () => {
      signal.removeEventListener("abort", stop);
      el.remove();
      resolve();
    };
    const stop = () => { anim.cancel(); done(); };
    signal.addEventListener("abort", stop, { once: true });
    anim.finished.then(done, done);
  });
}

/**
 * Register the `track` handler on `director`; returns the unregister function. Several callers with the
 * same store share one handler (it reads the newest caller's deps) until the last one unregisters.
 */
export function registerTrackHandlers(director: Director, deps: TrackHandlerDeps): () => void {
  return shareRegistration(deps.store, deps, cur => registerOnce(director, deps.store, cur));
}

function registerOnce(director: Director, store: TrackStore, cur: () => TrackHandlerDeps): () => void {
  const setAnim = (key: TrackAnimKey, from: number, to: number, ms: number, reduced: boolean) => {
    const seq = store.nextSeq();
    store.update(v => ({ ...v, anim: { ...v.anim, [key]: { ms, seq, from, to, reduced } } }));
    return seq;
  };
  const endAnim = (key: TrackAnimKey, seq: number) => {
    store.update(v => {
      if (v.anim[key]?.seq !== seq) return v;
      const anim = { ...v.anim };
      delete anim[key];
      return { ...v, anim };
    });
  };

  return director.on("track", async (beat, ctx) => {
    const deps = cur();
    const sleep = deps.sleep ?? abortableSleep;
    const fly = deps.flyChip ?? flyChipDom;
    const e = beat.event as TrackEvent;
    const reduced = deps.reduced();
    const motion = ctx.speed.motion;
    const wait = (ms: number) => (ms > 0 && !ctx.signal.aborted ? sleep(ms, ctx.signal) : Promise.resolve());
    switch (e.t) {
      case "action-round": {
        const ms = dur(TIMING.actionRound.dur, motion);
        store.update(v => ({ ...v, over: { ...v.over, ar: { ar: e.ar, side: e.side } } }));
        const seq = setAnim("ar", 0, e.ar, reduced ? 0 : ms, reduced);
        await wait(reduced ? 0 : ms);
        endAnim("ar", seq);
        return;
      }
      case "vp": {
        const chipMs = dur(TIMING.vp.chip, motion);
        const needleMs = dur(TIMING.vp.dur, motion);
        const lead = vpLead(e.to - e.from);
        if (!reduced && chipMs > 0 && lead.side && !ctx.signal.aborted) {
          const anchors = deps.anchors();
          const to = safeRect(anchors, "vp");
          const from = to ? chipSource(e, ctx.frame, anchors) : null;
          if (from && to) await fly({ text: deps.text.vpChip(lead.side, lead.n), side: lead.side, from, to, ms: chipMs }, ctx.signal);
        }
        store.update(v => ({ ...v, over: { ...v.over, vp: e.to } }));
        const ms = reduced ? Math.min(150, needleMs) : needleMs;
        const seq = setAnim("vp", e.from, e.to, ms, reduced);
        await wait(ms);
        endAnim("vp", seq);
        return;
      }
      case "defcon": {
        const down = e.to < e.from;
        const ms = down ? dur(TIMING.defconDown.flicker + TIMING.defconDown.light, motion) : dur(TIMING.defconUp.dur, motion);
        store.update(v => ({ ...v, over: { ...v.over, defcon: e.to }, flash: down && ms > 0 && !reduced ? store.nextSeq() : v.flash }));
        if (down && e.to === 2) deps.toast(deps.text.defcon2(), { tone: "warn", ms: TIMING.defconDown.toast });
        const shown = reduced ? Math.min(150, ms) : ms;
        const seq = setAnim("defcon", e.from, e.to, shown, reduced);
        await wait(shown);
        endAnim("defcon", seq);
        return;
      }
      case "milops": {
        const ms = dur(TIMING.milops.dur + TIMING.milops.stagger * Math.max(0, Math.abs(e.to - e.from) - 1), motion);
        const side = e.side;
        store.update(v => ({ ...v, over: { ...v.over, milOps: { ...v.over.milOps, [side]: e.to } } }));
        const seq = setAnim(`milops:${side}`, e.from, e.to, reduced ? 0 : ms, reduced);
        await wait(reduced ? 0 : ms);
        endAnim(`milops:${side}`, seq);
        return;
      }
      case "space": {
        const ms = dur(TIMING.space.dur, motion);
        const side = e.side;
        store.update(v => ({ ...v, over: { ...v.over, space: { ...v.over.space, [side]: e.to } } }));
        if (e.to > e.from && SPACE_PERK_BOXES[e.to] && !ctx.signal.aborted && motion > 0) {
          if (safeRect(deps.anchors(), `space:${side}`)) {
            const pseq = store.nextSeq();
            store.update(v => ({ ...v, perk: { side, box: e.to, seq: pseq } }));
          } else {
            deps.toast(deps.text.perk(side, e.to), { ms: TIMING.space.perkToast });
          }
        }
        const seq = setAnim(`space:${side}`, e.from, e.to, reduced ? 0 : ms, reduced);
        await wait(reduced ? 0 : ms);
        endAnim(`space:${side}`, seq);
        return;
      }
    }
  });
}

function safeRect(anchors: AnchorRegistry, id: AnchorId): DOMRect | null {
  try { return anchors.rect(id); } catch { return null; }
}

/**
 * Register the console's track handlers with `director` for as long as the caller is mounted (the
 * Console calls it; calling it again elsewhere is harmless). Clears the overrides at each commit.
 */
export function useTrackBeats(director: Director): void {
  const root = useContext(UiRootContext);
  const { t } = useI18n();
  const rootRef = useRef<UiRoot | null>(root);
  rootRef.current = root;
  const tRef = useRef(t);
  tRef.current = t;
  const store = trackStoreFor(director);
  useOnCommit(() => store.reset());
  useEffect(() => registerTrackHandlers(director, {
    store,
    anchors: () => rootRef.current?.anchors ?? { ref: () => () => undefined, rect: () => null },
    toast: (m, o) => rootRef.current?.toast(m, o),
    reduced: () => isReducedMotion(rootRef.current?.settings.motion ?? "system", systemPrefersReducedMotion()),
    text: {
      defcon2: () => tRef.current("ui:toast.defcon2"),
      vpChip: (side, n) => tRef.current("ui:track.vpLead", { side: tRef.current(`ui:side.${side}`), vp: n }),
      perk: (side, box) => {
        const key = SPACE_PERK_BOXES[box];
        return tRef.current("ui_console:space.perk", { side: tRef.current(`ui:side.long.${side}`), perk: key ? tRef.current(`tracks:privilegeShort.${key}`) : "" });
      },
    },
  }), [director, store]);
}

/** What the instruments show: `Shown.state` with the running beats' overrides on top. */
export interface TrackValues {
  vp: number;
  defcon: number;
  milOps: { US: number; USSR: number };
  space: { US: number; USSR: number };
  ar: { ar: number; side: Side } | null;
}

export function trackValues(state: PublicState, over: ReturnType<typeof useTrackView>["over"]): TrackValues {
  return {
    vp: over.vp ?? state.victory_points,
    defcon: over.defcon ?? state.defcon,
    milOps: { US: over.milOps?.US ?? state.mil_ops.US, USSR: over.milOps?.USSR ?? state.mil_ops.USSR },
    space: { US: over.space?.US ?? state.space.US, USSR: over.space?.USSR ?? state.space.USSR },
    ar: over.ar ?? null,
  };
}

export function useTrackValues(state: PublicState): TrackValues {
  const view = useTrackView();
  return trackValues(state, view.over);
}

const EMPTY_LOG: readonly never[] = [];

/**
 * VP at the end of each finished turn, plus now (VP tooltip; the game-over chart may use it too). Read
 * from the controller's log, so it survives a reload; `vp`/`turn` are the shown values.
 */
export function useVpHistory(turn: number, vp: number): VpPoint[] {
  const root = useContext(UiRootContext);
  const log = root?.vm.log ?? EMPTY_LOG;
  return useMemo(() => vpHistory(log, turn > 0 ? { turn, vp } : null), [log, turn, vp]);
}
