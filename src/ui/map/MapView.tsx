/**
 * <MapView>: the map (ui-spec §4). SVG root with camera (pan / zoom / pinch, region framing), the
 * land, links, region and superpower plates, 84 country boxes with every state, annotations, the
 * tooltip host, keyboard navigation, and the imperative MapHandle the frame runner animates through.
 * Pure props (typed against src/game/contract.ts); it never talks to the engine.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { dataLang, REGIONS, type DataLang } from "../../data";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { dur, mapDetail, TIMING, type FrameSpeed } from "../theme";
import {
  anchorOnMap, boardValues, EMPTY_BOX, plateSpent, popoversAfter, raisedBox, sameValues, scoreOf, targetLook, tipAfterTap, withOverrides, type BoxValues,
  type TipState,
} from "./board";
import { COMPACT_TOUCH_SCALE, FRAME_PAD, scaleOf, scaleToFit } from "./camera";
import type { CountryBeat, MapHandle, MapViewProps, RegionSlot } from "./contract";
import { CountryBox } from "./CountryBox";
import { Annotations, Defs, Ground, Links, RegionTint } from "./Layers";
import {
  areaRect,
  BOARD_ORDER,
  boundsOf,
  COUNTRY_LAYOUT,
  countriesInCircle,
  MAP_H,
  MAP_W,
  nearestInDirection,
  padRect,
  readingOrder,
  REGION_SLOTS,
  type Direction,
} from "./layout";
import s from "./MapView.module.css";
import { DefaultCountryTip, DefaultPlateTip, MapTooltipHost } from "./MapTooltipHost";
import { textWidth, useFontsReady } from "./measure";
import { animate, prefersReducedMotion, wait } from "./motion";
import { fitLabel, NAME_SIZE } from "./names";
import { RegionPlate, SuperpowerPlate } from "./Plates";
import { mapText } from "./strings";
import { useCamera } from "./useCamera";

const SVG_NS = "http://www.w3.org/2000/svg";
const HOVER_DELAY = 300;
const LONG_PRESS = 350;
/** A focus this soon (ms) after a touch press came from the finger, not the keyboard. */
const TOUCH_FOCUS_MS = 1000;
/** The constant initial viewBox React renders; the camera owns the attribute after mount. */
const INITIAL_VIEWBOX = `0 0 ${MAP_W} ${MAP_H}`;

const inSlot = (id: number, slot: RegionSlot): boolean => {
  const c = COUNTRY_LAYOUT[id];
  if (!c) return false;
  return slot === 6 ? c.slot === 6 : c.info.region === slot;
};
const sideColor = (side: Side) => (side === "US" ? "var(--ts-us-600)" : "var(--ts-ussr-600)");

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(props, ref) {
  const {
    state, regionScores, humanSide, layout, targets, regionTargets, selection, placed, lastOpponent,
    focusRegion, interactive, labelScale, patterns,
  } = props;
  const i18n = useI18n();
  const lang: DataLang = props.lang ?? dataLang(i18n.lang);
  const zh = lang === "zh";
  const fontsVersion = useFontsReady();
  const compact = layout === "compact" || layout === "compact-landscape";

  // ── Refs and camera ─────────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const boxEls = useRef(new Map<number, SVGGElement>());
  const plateEls = useRef(new Map<RegionSlot, SVGGElement>());
  const propsRef = useRef(props);
  propsRef.current = props;

  const overlap = props.insetOverlap ?? 0;
  /** Bumped whenever the camera settles (re-anchors the tooltip). */
  const [settled, setSettled] = useState(0);
  const camera = useCamera({
    svgRef, containerRef, layout, insets: props.insets, overlap,
    initialRect: areaRect(0),
    onSettle: (v, scale) => {
      setSettled(n => n + 1);
      propsRef.current.onCamera?.({ ...v, scale });
    },
    // A tap on what the prompt offers is a click, never half of a double-tap zoom.
    isTarget: target => {
      const p = propsRef.current;
      if (!p.interactive) return false;
      const id = idFrom(target);
      if (id !== null) return p.targets?.ids.has(id) ?? false;
      const slot = plateFrom(target);
      return slot !== null && (p.regionTargets?.has(slot) ?? false);
    },
  });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const detail = mapDetail(camera.scale);

  // ── Values shown in the boxes (state + beat overrides) ──────────────────────────────────
  const base = useMemo(() => boardValues(state), [state]);
  const [overrides, setOverrides] = useState<Readonly<Record<number, BoxValues>>>({});
  const shown = useMemo(() => withOverrides(base, overrides), [base, overrides]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // ── Hover, focus, tooltip ───────────────────────────────────────────────────────────────
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  /** A box a finger focused, not raised until its tap's click is through (`raisedBox`, QA X-1). */
  const [touchHeld, setTouchHeld] = useState<number | null>(null);
  const [roving, setRoving] = useState<number>(() => readingOrder(COUNTRY_LAYOUT.map(c => c.id))[0] ?? 0);
  const [tipFor, setTipFor] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [plateHover, setPlateHover] = useState<RegionSlot | null>(null);
  const [plateTip, setPlateTip] = useState<RegionSlot | null>(null);
  const [spot, setSpot] = useState<RegionSlot | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const swallowClick = useRef(false);
  const lastPointer = useRef<{ type: string; x: number; y: number; t: number }>({ type: "mouse", x: 0, y: 0, t: -Infinity });
  const animating = useRef(new Set<number>());
  const touchPress = () => lastPointer.current.type === "touch" && performance.now() - lastPointer.current.t < TOUCH_FOCUS_MS;
  const setTip = (tip: TipState) => { setPinned(tip.pinned); setTipFor(tip.tipFor); };

  // The transient popovers (a pinned or tapped tooltip, a plate's "if scored now") close as the moment
  // passes (R-008, board.ts `popoversAfter`).
  const popovers = useRef({ pinned, tipFor, plateTip });
  popovers.current = { pinned, tipFor, plateTip };
  const closePopovers = useCallback((e: "context" | "outside" | "off-map") => {
    const cur = popovers.current;
    const next = popoversAfter(cur, e, lastPointer.current.type === "touch");
    if (next === cur) return;
    setPinned(next.pinned);
    setTipFor(next.tipFor);
    setPlateTip(next.plateTip);
  }, []);
  // A new prompt (its id, or what it offers on the map), the runner taking the map (a frame plays) or another
  // layout (a rotation).
  useEffect(() => { closePopovers("context"); }, [targets, regionTargets, props.promptKey, interactive, layout, closePopovers]);
  // A press outside the map: a card, the hand drawer, a sheet (presses on the map are the map's own: the sea, a
  // box, a plate, the zoom buttons). The popover itself closes on its click (`onClose`): closed on the press, the
  // tap would fall through to the box under it.
  const anyOpen = pinned !== null || tipFor !== null || plateTip !== null;
  useEffect(() => {
    if (!anyOpen || typeof document === "undefined") return;
    const onDown = (e: PointerEvent) => {
      const at = e.target as Element | null;
      if (at && (containerRef.current?.contains(at) || at.closest?.("[data-map-tip]"))) return;
      closePopovers("outside");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anyOpen, closePopovers]);
  useEffect(() => () => { window.clearTimeout(hoverTimer.current); window.clearTimeout(pressTimer.current); }, []);

  // ── Labels ──────────────────────────────────────────────────────────────────────────────
  const labelSize = NAME_SIZE[lang] * (labelScale || 1);
  const labels = useMemo(
    () => COUNTRY_LAYOUT.map(c => fitLabel(c.id, lang, detail, text => textWidth(text, zh ? "name-zh" : "name-en", labelSize))),
    // fontsVersion: re-measure once the web fonts have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, detail, labelSize, zh, fontsVersion],
  );

  // ── Derived per-box state ───────────────────────────────────────────────────────────────
  const prompting = targets !== null;
  const regionFocus: RegionSlot | null = focusRegion ?? spot ?? (regionTargets ? plateHover : null);
  const hot = hover ?? focused;
  // The box raised at the last commit: a finger's press keeps it raised until its click (`raisedBox`, X-1).
  const raisedBefore = useRef<number | null>(null);
  const raised = raisedBox(hover, focused, touchHeld, raisedBefore.current);
  useEffect(() => { raisedBefore.current = raised; }, [raised]);
  const front = useMemo(() => new Set([raised, selection, pinned].filter((v): v is number => v !== null)), [raised, selection, pinned]);
  const order = useMemo(() => {
    const ids = COUNTRY_LAYOUT.map(c => c.id);
    const back = ids.filter(id => !front.has(id) && !(targets?.ids.has(id)));
    const mid = ids.filter(id => !front.has(id) && targets?.ids.has(id));
    return [...back, ...mid, ...[...front].filter(id => id >= 0 && id < COUNTRY_LAYOUT.length)];
  }, [targets, front]);

  const ariaLabels = useMemo(() => COUNTRY_LAYOUT.map(c => {
    const v = shown[c.id] ?? EMPTY_BOX;
    const region = c.slot === 6 ? mapText(lang, "plate.name.6") : REGIONS[c.info.region]?.name[lang] ?? "";
    const isT = targets?.ids.has(c.id) ?? false;
    return mapText(lang, "map.countryLabel", {
      name: c.info.name[lang],
      region,
      bg: c.info.battleground ? mapText(lang, "map.aria.bg") : "",
      stab: c.info.stability,
      us: v.us,
      usCtrl: v.ctrl === "US" ? mapText(lang, "map.aria.controlled") : "",
      ussr: v.ussr,
      ussrCtrl: v.ctrl === "USSR" ? mapText(lang, "map.aria.controlled") : "",
      target: isT ? mapText(lang, targets!.cost2.has(c.id) ? "map.aria.targetCost2" : "map.aria.target") : "",
    });
  }), [shown, lang, targets]);

  const boxRefs = useMemo(() => COUNTRY_LAYOUT.map(c => (el: SVGGElement | null) => {
    if (el) boxEls.current.set(c.id, el); else boxEls.current.delete(c.id);
    propsRef.current.anchors?.ref(`country:${c.id}`)(el);
  }), []);
  const plateRefs = useMemo(() => REGION_SLOTS.map(slot => (el: SVGGElement | null) => {
    if (el) plateEls.current.set(slot, el); else plateEls.current.delete(slot);
    propsRef.current.anchors?.ref(`plate:${slot}`)(el);
  }), []);

  // ── Imperative effects ──────────────────────────────────────────────────────────────────
  const ripple = useCallback((id: number, color: string, ms: number, reduced = prefersReducedMotion()) => {
    const el = boxEls.current.get(id)?.querySelector<SVGRectElement>("[data-pulse]");
    if (!el || ms <= 0) return null;
    el.style.stroke = color;
    return reduced
      ? animate(el, [{ opacity: 0.9 }, { opacity: 0.9, offset: 0.7 }, { opacity: 0 }], { duration: ms })
      : animate(el, [{ opacity: 0.95, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.14)" }], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, []);

  const floatText = useCallback((id: number, text: string, cls: string, ms: number, rise = 22) => {
    const fx = fxRef.current, c = COUNTRY_LAYOUT[id];
    if (!fx || !c || ms <= 0 || typeof document === "undefined") return null;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(c.cx));
    t.setAttribute("y", String(c.rect.y + 2));
    t.setAttribute("class", cls);
    t.textContent = text;
    fx.appendChild(t);
    const reduced = prefersReducedMotion();
    const a = animate(t, reduced
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
      : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)", offset: 0.15 }, { opacity: 0, transform: `translateY(${-rise}px)` }],
    { duration: ms, easing: "linear" });
    const remove = () => t.remove();
    if (a) { a.onfinish = remove; a.oncancel = remove; } else setTimeout(remove, ms);
    return a;
  }, []);

  // ── Effects: flash a box whose numbers change outside a beat ────────────────────────────
  const prevShown = useRef<BoxValues[] | null>(null);
  useEffect(() => {
    const prev = prevShown.current;
    prevShown.current = shown;
    if (!prev || props.flashChanges === false || prefersReducedMotion()) return;
    const changed: number[] = [];
    for (let i = 0; i < shown.length; i++) if (!sameValues(prev[i]!, shown[i]!) && !animating.current.has(i)) changed.push(i);
    if (changed.length === 0 || changed.length > 12) return; // a new game / resume: no fireworks
    for (const id of changed) {
      const a = prev[id]!, b = shown[id]!;
      const side: Side = b.us - a.us > b.ussr - a.ussr ? "US" : b.ussr !== a.ussr ? "USSR" : b.ctrl === "USSR" ? "USSR" : "US";
      ripple(id, sideColor(side), 520);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const setOverride = useCallback((id: number, v: BoxValues) => {
    flushSync(() => setOverrides(o => ({ ...o, [id]: v })));
  }, []);

  const playCountry = useCallback(async (beat: CountryBeat, speed: FrameSpeed, signal: AbortSignal): Promise<void> => {
    const id = beat.country;
    if (!COUNTRY_LAYOUT[id]) return;
    const start = shownRef.current[id] ?? EMPTY_BOX;
    // The end state of this beat.
    let end: BoxValues = { ...start };
    for (const inf of beat.influence) end = inf.side === "US" ? { ...end, us: inf.to } : { ...end, ussr: inf.to };
    if (beat.control) end = { ...end, ctrl: beat.control.to };
    const running = new Set<Animation>();
    const track = (a: Animation | null) => { if (a) { running.add(a); void a.finished.catch(() => undefined).then(() => running.delete(a)); } };
    const finishAll = () => { for (const a of running) { try { a.finish(); } catch { /* already gone */ } } running.clear(); };
    const onAbort = () => finishAll();
    signal.addEventListener("abort", onAbort, { once: true });
    animating.current.add(id);
    try {
      // Step out of any React commit in progress (flushSync must not run inside an effect).
      await Promise.resolve();
      if (speed.motion <= 0 || signal.aborted) { setOverride(id, end); return; }
      const reduced = prefersReducedMotion();
      let cur: BoxValues = { ...start };
      for (const inf of beat.influence) {
        if (signal.aborted) break;
        const box = boxEls.current.get(id);
        const up = inf.to > inf.from;
        const next: BoxValues = inf.side === "US" ? { ...cur, us: inf.to } : { ...cur, ussr: inf.to };
        const ms = dur(up ? TIMING.influenceAdd.dur : TIMING.influenceRemove.dur, speed.motion);
        const floatMs = dur(up ? TIMING.influenceAdd.float : TIMING.influenceRemove.float, speed.motion);
        const delta = inf.to - inf.from;
        if (!up && inf.to === 0 && !reduced) {
          // The counter lifts away before it disappears.
          const mk = box?.querySelector(`[data-mk="${inf.side}"]`);
          const a = animate(mk, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: ms, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
          track(a);
          track(floatText(id, `−${Math.abs(delta)}`, `${s.fxText} ${inf.side === "US" ? s.fxUS : s.fxUSSR}`, floatMs));
          await wait(ms, signal);
          a?.cancel();
          setOverride(id, next);
        } else {
          setOverride(id, next);
          const mk = boxEls.current.get(id)?.querySelector(`[data-mk="${inf.side}"]`);
          if (reduced) {
            track(animate(mk?.querySelector("text"), [{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(120, ms) }));
            track(ripple(id, sideColor(inf.side), 400, true));
          } else if (up) {
            track(animate(mk, [
              { opacity: 0, transform: "translateY(-14px) scale(1.15)" },
              { opacity: 1, transform: "translateY(0) scale(1.15)", offset: 0.55 },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ], { duration: ms, easing: "cubic-bezier(.3,1.45,.45,1)" }));
            track(animate(mk?.querySelector("text"), [{ opacity: 0.2, transform: "translateY(-5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: ms }));
            track(ripple(id, sideColor(inf.side), Math.max(ms, 380)));
          } else {
            track(animate(mk?.querySelector("text"), [{ opacity: 0.2, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: ms, easing: "cubic-bezier(.4,0,1,1)" }));
            track(ripple(id, sideColor(inf.side), Math.max(ms, 380)));
          }
          if (delta !== 0) track(floatText(id, delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`, `${s.fxText} ${inf.side === "US" ? s.fxUS : s.fxUSSR}`, floatMs));
          await wait(ms, signal);
        }
        cur = next;
      }
      if (beat.control && !signal.aborted) {
        const ctl = beat.control;
        await wait(dur(TIMING.control.delay, speed.motion), signal);
        const ms = dur(TIMING.control.dur, speed.motion);
        const flipSide: Side | null = ctl.to !== "NONE" ? ctl.to : ctl.from !== "NONE" ? ctl.from : null;
        const box = boxEls.current.get(id);
        if (!reduced && flipSide && !signal.aborted) {
          const mk = box?.querySelector(`[data-mk="${flipSide}"]`);
          const a = animate(mk, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: ms / 2, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
          track(a);
          await wait(ms / 2, signal);
          a?.cancel();
        }
        setOverride(id, { ...cur, ctrl: ctl.to });
        cur = { ...cur, ctrl: ctl.to };
        if (flipSide) {
          const mk = boxEls.current.get(id)?.querySelector(`[data-mk="${flipSide}"]`);
          if (!reduced) track(animate(mk, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: ms / 2, easing: "cubic-bezier(.65,0,.35,1)" }));
          track(ripple(id, sideColor(flipSide), reduced ? 1000 : Math.max(ms, 420), reduced));
          const word = mapText(lang, ctl.to !== "NONE" ? "map.control" : "map.lost");
          track(floatText(id, word, `${s.fxText} ${s.fxStamp} ${flipSide === "US" ? s.fxUS : s.fxUSSR}`, dur(600, speed.motion) || 0, 10));
        }
        await wait(reduced ? 0 : ms / 2, signal);
      }
      setOverride(id, end);
    } finally {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) finishAll();
      animating.current.delete(id);
    }
  }, [floatText, lang, ripple, setOverride]);

  // ── Camera helpers ──────────────────────────────────────────────────────────────────────
  const frameCountries = useCallback((ids: readonly number[] | "world", opts?: { animate?: boolean }) => {
    const cam = cameraRef.current;
    if (ids === "world") return cam.fit({ animate: opts?.animate });
    if (ids.length === 0) return Promise.resolve();
    return cam.frame(boundsOf(ids, FRAME_PAD), { animate: opts?.animate });
  }, []);

  const focusBox = useCallback((id: number) => {
    setRoving(id);
    const el = boxEls.current.get(id);
    el?.focus({ preventScroll: true });
    const r = COUNTRY_LAYOUT[id]?.rect;
    if (r && !cameraRef.current.isVisible(r)) void cameraRef.current.reveal(r, { animate: true });
  }, []);

  // Follow the prompt (compact always, desktop when the setting is on): ui-spec §4.7. Keyed on the
  // target set's contents, so a new prompt with the same targets does not move the camera.
  const targetsKey = useMemo(() => (targets ? [...targets.ids].sort((a, b) => a - b).join(",") : ""), [targets]);
  useEffect(() => {
    if (!targets || !targetsKey) return;
    if (!compact && !props.follow) return;
    const cam = cameraRef.current;
    if (cam.userBusy()) return;
    const ids = [...targets.ids];
    const vp = cam.viewportNow();
    if (!compact) {
      // Desktop: only when zoomed in and some target is off-screen; never zoom further in.
      if (ids.every(id => cam.isVisible(COUNTRY_LAYOUT[id]!.rect))) return;
      void cam.frame(boundsOf(ids, FRAME_PAD), { animate: true, maxScale: scaleOf(cam.view(), vp) });
      return;
    }
    const all = boundsOf(ids, FRAME_PAD);
    if (scaleToFit(all, vp) >= COMPACT_TOUCH_SCALE) { void cam.frame(all, { animate: true }); return; }
    const bySlot = (pick: (slot: RegionSlot) => number) =>
      BOARD_ORDER.filter(sl => sl !== 6).reduce<{ slot: RegionSlot; n: number } | null>((best, sl) => {
        const n = pick(sl);
        return n > 0 && (!best || n > best.n) ? { slot: sl, n } : best;
      }, null);
    const placedIds = Object.keys(placed).map(Number);
    const choice = bySlot(sl => placedIds.filter(id => inSlot(id, sl)).length) ?? bySlot(sl => ids.filter(id => inSlot(id, sl)).length);
    const inRegion = choice ? ids.filter(id => inSlot(id, choice.slot)) : ids;
    void cam.frame(boundsOf(inRegion.length ? inRegion : ids, FRAME_PAD), { animate: true, minScale: COMPACT_TOUCH_SCALE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey, compact, props.follow]);

  // ── Handle ──────────────────────────────────────────────────────────────────────────────
  useImperativeHandle(ref, (): MapHandle => ({
    playCountry,
    clearOverrides: () => setOverrides(o => (Object.keys(o).length ? {} : o)),
    frame: frameCountries,
    isVisible: id => {
      const r = COUNTRY_LAYOUT[id]?.rect;
      return !!r && cameraRef.current.isVisible(r);
    },
    pulse: id => { ripple(id, "var(--ts-brass-400)", 1000); },
    reveal: (id, opts) => {
      const r = COUNTRY_LAYOUT[id]?.rect;
      const cam = cameraRef.current;
      if (!r || cam.userBusy() || cam.isVisible(r)) return Promise.resolve();
      return cam.reveal(padRect(r, 24), { animate: opts?.animate ?? true });
    },
    frameRegion: (slot, opts) => cameraRef.current.frame(areaRect(slot), { animate: opts?.animate }),
    getCountryAnchor: id => {
      const c = COUNTRY_LAYOUT[id];
      if (!c) return null;
      const el = boxEls.current.get(id);
      const rect = el ? cameraRef.current.mapToClient(c.rect) : null;
      return { svg: { x: c.cx, y: c.cy }, rect, client: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null };
    },
    getPlateRect: slot => plateEls.current.get(slot)?.getBoundingClientRect() ?? null,
    zoomBy: f => { void cameraRef.current.zoomBy(f, undefined, { animate: true }); },
    scale: () => scaleOf(cameraRef.current.view(), cameraRef.current.viewportNow()),
  }), [frameCountries, playCountry, ripple]);

  // ── Pointer / keyboard handlers (delegated on the boxes layer) ──────────────────────────
  const idFrom = (target: EventTarget | null): number | null => {
    const el = (target as Element | null)?.closest?.("[data-cid]");
    if (!el) return null;
    const id = Number(el.getAttribute("data-cid"));
    return Number.isInteger(id) ? id : null;
  };

  const startHover = useCallback((id: number | null, immediate = false) => {
    window.clearTimeout(hoverTimer.current);
    setHover(id);
    propsRef.current.onHover?.(id);
    if (id === null) { setTipFor(null); return; }
    if (immediate) setTipFor(id);
    else hoverTimer.current = window.setTimeout(() => setTipFor(id), HOVER_DELAY);
  }, []);

  const onBoxPointerOver = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const id = idFrom(e.target);
    if (id !== null && id !== hover) startHover(id);
  };
  const onBoxPointerOut = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const id = idFrom(e.target);
    const to = idFrom(e.relatedTarget);
    if (id !== null && to !== id) startHover(to);
  };
  /** Every press on the map (boxes, plates, the sea): what pointer the next click / focus came from. */
  const onMapPointerDown = (e: ReactPointerEvent) => {
    lastPointer.current = { type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onBoxPointerDown = (e: ReactPointerEvent) => {
    swallowClick.current = false;
    window.clearTimeout(pressTimer.current);
    const id = idFrom(e.target);
    if (id === null || e.pointerType !== "touch") return;
    pressTimer.current = window.setTimeout(() => {
      if (cameraRef.current.consumeDrag()) return;
      swallowClick.current = true;
      try { navigator.vibrate?.(10); } catch { /* unsupported */ }
      propsRef.current.onInspect?.(id);
      // Long-press pins the tooltip; on a phone the app may show the details in a sheet instead (onInspect).
      if (!compact || !propsRef.current.onInspect) { setPlateTip(null); setPinned(id); setTipFor(id); }
    }, LONG_PRESS);
  };
  const onBoxPointerUp = () => window.clearTimeout(pressTimer.current);

  const activate = useCallback((id: number) => {
    const p = propsRef.current;
    const isTarget = p.targets?.ids.has(id) ?? false;
    if (isTarget && p.interactive) {
      p.onActivate?.(id);
    } else {
      p.onInspect?.(id);
      setPlateTip(null);
      setPinned(cur => (cur === id ? null : id));
      setTipFor(id);
    }
  }, []);

  const onBoxClick = (e: ReactMouseEvent) => {
    // The tap's click is through: a box its finger focused may be raised now (X-1).
    setTouchHeld(null);
    const drag = cameraRef.current.consumeDrag();
    const id = idFrom(e.target);
    if (id === null) return;
    if (drag || swallowClick.current) { swallowClick.current = false; return; }
    window.clearTimeout(pressTimer.current);
    // Tap safety (compact, small scale): a tap covering ≥ 2 targets zooms in instead.
    const cam = cameraRef.current;
    const scale = scaleOf(cam.view(), cam.viewportNow());
    if (compact && lastPointer.current.type === "touch" && targets && scale < 0.6) {
      const p = cam.clientToMap(e.clientX, e.clientY);
      if (countriesInCircle(p, 24 / scale, targets.ids).length >= 2) {
        const svgR = svgRef.current?.getBoundingClientRect();
        void cam.zoomBy(2, { x: e.clientX - (svgR?.left ?? 0), y: e.clientY - (svgR?.top ?? 0) }, { animate: true });
        return;
      }
    }
    if (lastPointer.current.type === "touch") {
      // Touch has no hover: a tap opens a non-target's tooltip and a second tap closes it; a target's tap
      // plays and closes another box's tooltip (ui-spec §4.8).
      const p = propsRef.current;
      const isTarget = !!(p.targets?.ids.has(id) && p.interactive);
      const sheet = compact && !!p.onInspect;
      if (!sheet || isTarget) setTip(tipAfterTap({ pinned, tipFor }, { box: id, target: isTarget }));
      setPlateTip(null);
      if (isTarget) p.onActivate?.(id);
      else p.onInspect?.(id);
      return;
    }
    activate(id);
  };
  /** A click on the sea (not a box, not a plate) closes the tooltip and the plate popover. */
  const onSeaClick = (e: ReactMouseEvent) => {
    if ((e.target as Element | null)?.closest?.("[data-cid],[data-plate]")) return;
    if (cameraRef.current.consumeDrag()) return;
    setTip(tipAfterTap({ pinned, tipFor }, { box: null, target: false }));
    setPlateTip(null);
  };
  const onBoxContextMenu = (e: ReactMouseEvent) => {
    const id = idFrom(e.target);
    if (id === null) return;
    e.preventDefault();
    propsRef.current.onInspect?.(id);
    setPlateTip(null);
    setPinned(id);
    setTipFor(id);
  };
  const onBoxFocus = (e: ReactFocusEvent) => {
    const id = idFrom(e.target);
    if (id === null) return;
    setFocused(id);
    setRoving(id);
    window.clearTimeout(hoverTimer.current);
    // Focus from a finger is not keyboard focus: the tap itself decides about the tooltip, and the box is raised
    // only after the tap's click (X-1).
    const finger = touchPress();
    setTouchHeld(finger ? id : null);
    if (!finger) setTipFor(id);
    propsRef.current.onHover?.(id);
  };
  const onBoxBlur = (e: ReactFocusEvent) => {
    setTouchHeld(null);
    const to = idFrom(e.relatedTarget);
    if (to === null) {
      setFocused(null);
      if (hover === null) { setTipFor(null); propsRef.current.onHover?.(null); }
    }
  };

  const targetList = useMemo(() => (targets ? readingOrder(targets.ids) : []), [targets]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const cam = cameraRef.current;
    const cur = focused ?? idFrom(e.target);
    const dirs: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (e.key in dirs) {
      e.preventDefault();
      const from = cur ?? roving;
      const next = (targets && nearestInDirection(from, dirs[e.key]!, targets.ids)) ?? nearestInDirection(from, dirs[e.key]!);
      if (next !== null) focusBox(next);
      return;
    }
    if ((e.key === "[" || e.key === "]") && targetList.length) {
      e.preventDefault();
      const i = cur !== null ? targetList.indexOf(cur) : -1;
      const n = targetList.length;
      const j = e.key === "]" ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1);
      focusBox(targetList[j]!);
      return;
    }
    if (/^[1-7]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const slot = BOARD_ORDER[Number(e.key) - 1]!;
      void cam.frame(areaRect(slot), { animate: true });
      const inRegion = readingOrder(COUNTRY_LAYOUT.filter(c => inSlot(c.id, slot)).map(c => c.id));
      const first = inRegion.find(id => targets?.ids.has(id)) ?? inRegion[0];
      if (first !== undefined) {
        setRoving(first);
        boxEls.current.get(first)?.focus({ preventScroll: true });
      }
      return;
    }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); void cam.zoomBy(1.5, undefined, { animate: true }); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); void cam.zoomBy(1 / 1.5, undefined, { animate: true }); return; }
    if (e.key === "0") { e.preventDefault(); void cam.fit({ animate: true }); return; }
    if (e.key === "Escape" && (pinned !== null || plateTip !== null)) { e.preventDefault(); setPinned(null); setPlateTip(null); return; }
    if (cur === null) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (targets?.ids.has(cur) && interactive) props.onActivate?.(cur);
      return;
    }
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      props.onInspect?.(cur);
      setPlateTip(null);
      setPinned(p => (p === cur ? null : cur));
      setTipFor(cur);
    }
  };

  // ── Plates ──────────────────────────────────────────────────────────────────────────────
  const spotTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(spotTimer.current), []);
  const plateFrom = (target: EventTarget | null): RegionSlot | null => {
    const el = (target as Element | null)?.closest?.("[data-plate]");
    if (!el) return null;
    const v = Number(el.getAttribute("data-plate"));
    return v >= 0 && v <= 6 ? (v as RegionSlot) : null;
  };
  const onPlateClick = (e: ReactMouseEvent) => {
    if (cameraRef.current.consumeDrag()) return;
    const slot = plateFrom(e.target);
    if (slot === null) return;
    if (regionTargets?.has(slot)) {
      if (interactive) props.onRegionActivate?.(slot);
      return;
    }
    setPinned(null); setTipFor(null); setPlateTip(cur => (cur === slot ? null : slot));
    setSpot(slot);
    window.clearTimeout(spotTimer.current);
    spotTimer.current = window.setTimeout(() => setSpot(null), 2000);
  };
  const onPlateOver = (e: ReactPointerEvent) => {
    const slot = plateFrom(e.target);
    if (slot !== null && slot !== plateHover) { setPlateHover(slot); props.onRegionHover?.(slot); }
  };
  const onPlateOut = (e: ReactPointerEvent) => {
    const to = plateFrom(e.relatedTarget);
    if (to === null && plateHover !== null) { setPlateHover(null); props.onRegionHover?.(null); }
  };
  const onPlateKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = plateFrom(e.target);
    if (slot === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (regionTargets?.has(slot)) { if (interactive) props.onRegionActivate?.(slot); return; }
    setPinned(null); setTipFor(null); setPlateTip(cur => (cur === slot ? null : slot));
  };

  // ── Tooltip content ─────────────────────────────────────────────────────────────────────
  // A staged selection keeps its tooltip (ui-spec §8.6 coup: "reticle + pinned tooltip"), also while the
  // clicked box keeps focus after the pointer leaves.
  const tipId = pinned ?? tipFor ?? (selection !== null && hover === null && (focused === null || focused === selection) ? selection : null);
  const [tipAnchor, setTipAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (tipId === null && plateTip === null) { setTipAnchor(null); return; }
    const el = tipId !== null ? boxEls.current.get(tipId) : plateEls.current.get(plateTip!);
    const r = el ? el.getBoundingClientRect() : null;
    const view = containerRef.current?.getBoundingClientRect();
    if (r && view && !anchorOnMap(r, view)) {
      // Its box or plate left the view (a pan, a resize): never point at nothing (R-008).
      setTipAnchor(null);
      closePopovers("off-map");
      return;
    }
    setTipAnchor(r);
    // Re-anchor when the camera settles too (it settles after every resize).
  }, [tipId, plateTip, settled, closePopovers]);
  const tipBody = tipId !== null
    ? (props.renderTooltip
      ? props.renderTooltip(tipId)
      : <DefaultCountryTip id={tipId} values={shown[tipId] ?? EMPTY_BOX} humanSide={humanSide} lang={lang} />)
    : plateTip !== null
      ? (props.renderPlateTooltip
        ? props.renderPlateTooltip(plateTip)
        : <DefaultPlateTip slot={plateTip} score={scoreOf(regionScores, plateTip)} lang={lang} />)
      : null;

  // ── Render ──────────────────────────────────────────────────────────────────────────────
  const rootCls = [s.root, compact && s.compact, zh && s.zh, !interactive && s.busy, props.className].filter(Boolean).join(" ");
  const svgCls = [s.svg, (prompting || regionTargets) && s.focusMode].filter(Boolean).join(" ");
  const tintSlot = regionFocus;
  const touch = compact;
  const showControls = props.controls !== false;

  return (
    <div ref={containerRef} className={rootCls} data-detail={detail}>
      <svg
        ref={svgRef}
        className={svgCls}
        viewBox={INITIAL_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        xmlns={SVG_NS}
        role="application"
        aria-label={mapText(lang, "map.ariaMap")}
        onKeyDown={onKeyDown}
        onPointerDownCapture={onMapPointerDown}
        onClick={onSeaClick}
      >
        <Defs />
        <Ground />
        <RegionTint slot={tintSlot} hot={regionTargets !== null} />
        <Links lang={lang} />
        <g onClick={onPlateClick} onPointerOver={onPlateOver} onPointerOut={onPlateOut} onKeyDown={onPlateKey}>
          {REGION_SLOTS.map(slot => (
            <RegionPlate
              key={slot}
              slot={slot}
              score={scoreOf(regionScores, slot)}
              spent={plateSpent(state, slot)}
              lang={lang}
              big={detail === "overview"}
              offered={regionTargets?.has(slot) ?? false}
              hot={regionFocus === slot || plateTip === slot}
              dim={regionTargets !== null && !regionTargets.has(slot)}
              fontsVersion={fontsVersion}
              plateRef={plateRefs[slot]}
            />
          ))}
        </g>
        <SuperpowerPlate side="US" />
        <SuperpowerPlate side="USSR" />
        <g
          onClick={onBoxClick}
          onPointerOver={onBoxPointerOver}
          onPointerOut={onBoxPointerOut}
          onPointerDown={onBoxPointerDown}
          onPointerUp={onBoxPointerUp}
          onPointerCancel={onBoxPointerUp}
          onContextMenu={onBoxContextMenu}
          onFocus={onBoxFocus}
          onBlur={onBoxBlur}
        >
          {order.map(id => {
            const c = COUNTRY_LAYOUT[id]!;
            const v = shown[id] ?? EMPTY_BOX;
            const look = targetLook(targets, id);
            const isHot = hot === id || pinned === id;
            const dim = (prompting && look === "none") || (regionFocus !== null && !inSlot(id, regionFocus));
            return (
              <CountryBox
                key={id}
                layout={c}
                values={v}
                label={labels[id]!}
                labelSize={labelSize}
                zh={zh}
                detail={detail}
                target={look}
                dim={dim}
                hot={isHot}
                ghost={null /* no hover preview: influence shows only once placed (owner, 2026-11-23) */}
                patterns={patterns}
                touchPad={touch}
                tabIndex={prompting ? (look !== "none" ? 0 : -1) : id === roving ? 0 : -1}
                ariaLabel={ariaLabels[id]!}
                boxRef={boxRefs[id]}
              />
            );
          })}
        </g>
        <Annotations lang={lang} detail={detail} targets={targets} placed={placed} lastOpponent={lastOpponent} selection={selection} />
        <g ref={fxRef} aria-hidden="true" />
        <rect className={s.frame} width={MAP_W} height={MAP_H} rx={6} />
      </svg>
      <div className={s.lamp} aria-hidden="true" />
      {showControls && (
        <div className={s.controls}>
          <button type="button" aria-label={mapText(lang, "map.zoomIn")} title={mapText(lang, "map.zoomIn")} onClick={() => void camera.zoomBy(1.5, undefined, { animate: true })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" aria-label={mapText(lang, "map.zoomOut")} title={mapText(lang, "map.zoomOut")} onClick={() => void camera.zoomBy(1 / 1.5, undefined, { animate: true })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <button type="button" aria-label={mapText(lang, "map.world")} title={mapText(lang, "map.world")} onClick={() => void camera.fit({ animate: true })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        </div>
      )}
      <MapTooltipHost
        anchor={tipAnchor}
        pinned={pinned !== null || plateTip !== null}
        onClose={() => closePopovers("outside")}
        zh={zh}
        bounds={layout === "compact-landscape" ? () => containerRef.current?.getBoundingClientRect() ?? null : undefined}
      >
        {tipBody}
      </MapTooltipHost>
    </div>
  );
});
