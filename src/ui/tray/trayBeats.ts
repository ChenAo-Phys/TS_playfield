/**
 * The tray's beat handlers (ui-spec §9.4, §15.3 `useTrayBeats`), without React:
 *
 *  - `reveal` (the human's card-played): the hand card glides into the slip clip (anchor `slip`), then
 *    leaves a "lifted out" outline until the commit.
 *  - `hand-revealed` (human): the "KNOWN TO AI" eye tag appears on those cards and blinks one by one.
 *  - `headline-chosen` (human): the chosen card slides face down into the headline slot ("COMMITTED").
 *  - `china` (when the human gives or gets the China Card, or it turns face up): the card slides
 *    between the slots / flips, plus the toast "The China Card passes to the…" (the tray owns it).
 *  - `deal` with ≤ 2 cards left in the deck, and the era turn banners (turns 4 and 8): the deck count pulses.
 *
 * Every handler applies its end state as an *override* in a `TrayStore` (the static tray draws
 * `Shown.state`, which lags until the commit) and the overrides are dropped on commit. On Skip
 * (`signal`) handlers jump to their end state. Under reduced motion nothing travels: the state swaps.
 * Handlers read only the beat, `ctx.before` and `ctx.frame` (never the live ViewModel).
 */
import type { Side } from "../../game/contract";
import { CHINA_CARD } from "../../data";
import { EASE, TIMING, dur } from "../theme";
import type { AnchorRegistry, Beat, BeatContext, Director } from "../ui-contract";

export interface TrayOverrides {
  /** Hand cards that already left (into the slip clip / the headline slot) but are still in Shown.state. */
  gone: ReadonlySet<number>;
  /** Cards that show the KNOWN TO AI tag before the commit (hand-revealed). */
  known: ReadonlySet<number>;
  /** Cards whose known tag blinks now: card → delay (ms). */
  blink: ReadonlyMap<number, number>;
  /** Blink duration per card (ms). */
  blinkMs: number;
  /** The human's headline slot during the headline-chosen beat. */
  headline: { card: number; faceDown: boolean } | null;
  /** The China Card after its beat (holder / face). */
  china: { holder: Side; playable: boolean } | null;
}

export const NO_OVERRIDES: TrayOverrides = Object.freeze({
  gone: new Set<number>(),
  known: new Set<number>(),
  blink: new Map<number, number>(),
  blinkMs: 0,
  headline: null,
  china: null,
}) as TrayOverrides;

/** Element keys the tray registers for its own animations (besides the shared anchors). */
export type TrayElKey = `card:${number}` | "china" | "headline" | "deckCount";

/** Overrides + the tray's own element registry; an external store for useSyncExternalStore. */
export class TrayStore {
  private s: TrayOverrides = NO_OVERRIDES;
  private readonly listeners = new Set<() => void>();
  private readonly els = new Map<TrayElKey, HTMLElement>();
  private readonly refs = new Map<TrayElKey, (el: HTMLElement | null) => void>();

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  readonly get = (): TrayOverrides => this.s;

  patch(p: Partial<TrayOverrides>): void {
    this.s = { ...this.s, ...p };
    for (const l of [...this.listeners]) l();
  }
  /** Drop every override (on commit). */
  reset(): void {
    if (this.s === NO_OVERRIDES) return;
    this.s = NO_OVERRIDES;
    for (const l of [...this.listeners]) l();
  }
  /** A stable ref callback for an element key. */
  ref(key: TrayElKey): (el: HTMLElement | null) => void {
    let cb = this.refs.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) this.els.set(key, el);
        else if (!this.els.get(key)?.isConnected) this.els.delete(key);
      };
      this.refs.set(key, cb);
    }
    return cb;
  }
  /** The connected element for a key, if any. */
  el(key: TrayElKey): HTMLElement | null {
    const e = this.els.get(key);
    return e && e.isConnected ? e : null;
  }
}

export interface TrayBeatDeps {
  director: Director;
  store: TrayStore;
  anchors: AnchorRegistry;
  humanSide: () => Side | null;
  reduced: () => boolean;
  /** Show a toast (UiRoot.toast). */
  toast(message: string, ms: number): void;
  /** The China toast text for the new holder (`ui:toast.china`). */
  chinaToast(holder: Side): string;
  /** Wait for the next paint (default: two animation frames, or a 0 ms timer without a DOM). */
  nextPaint?: () => Promise<void>;
}

const other = (s: Side): Side => (s === "US" ? "USSR" : "US");

function defaultNextPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame !== "function") { setTimeout(resolve, 0); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Run a WAAPI animation on `el`; resolves when it ends, or at once on abort. With `hold`, the end
 * frame stays applied until the returned `release()` is called (so a React re-render can take over
 * without a one-frame flash); otherwise `release` is a no-op.
 */
export function play(el: Element | null, frames: Keyframe[], ms: number, easing: string, signal: AbortSignal, hold = false): Promise<() => void> {
  const none = () => { /* nothing to release */ };
  if (!el || ms <= 0 || signal.aborted || typeof (el as HTMLElement).animate !== "function") return Promise.resolve(none);
  const a = (el as HTMLElement).animate(frames, { duration: ms, easing, fill: hold ? "forwards" : "none" });
  const release = () => { try { a.cancel(); } catch { /* gone */ } };
  return new Promise(resolve => {
    const done = () => { signal.removeEventListener("abort", onAbort); resolve(hold ? release : none); };
    const onAbort = () => { release(); signal.removeEventListener("abort", onAbort); resolve(none); };
    signal.addEventListener("abort", onAbort, { once: true });
    a.finished.then(done, done);
  });
}

/** Sleep that resolves early on abort. */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const id = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(id); resolve(); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function rectOf(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

function safeRect(anchors: AnchorRegistry, id: Parameters<AnchorRegistry["rect"]>[0]): DOMRect | null {
  try { return anchors.rect(id); } catch { return null; }
}

/** The card the human committed in this frame (headline-chosen carries only the side). */
export function chosenHeadline(beat: Extract<Beat, { k: "headline-chosen" }>, ctx: Pick<BeatContext, "frame">): number {
  for (const e of ctx.frame.events) {
    if (e.t === "card-moved" && e.to === "HEADLINE_COMMITTED" && e.from.startsWith(`HAND_${beat.side}`)) return e.card;
  }
  const st = ctx.frame.state;
  return (beat.side === "US" ? st.headline_us_card : st.headline_ussr_card) || 0;
}

/**
 * Register the tray's handlers with the director; returns the unregister function. Pure apart from
 * the DOM elements it animates (none in Node: handlers then only set overrides).
 */
export function registerTrayBeats(deps: TrayBeatDeps): () => void {
  const { director, store, anchors } = deps;
  const nextPaint = deps.nextPaint ?? defaultNextPaint;
  const offs: (() => void)[] = [];
  let lastPulseSeq = -1;

  const pulseDeck = (ctx: BeatContext) => {
    if (lastPulseSeq === ctx.frame.seq) return;
    lastPulseSeq = ctx.frame.seq;
    const el = store.el("deckCount");
    const d = dur(TIMING.space.dur, ctx.speed.motion);
    if (!el || d <= 0) return;
    const frames: Keyframe[] = deps.reduced()
      ? [{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }]
      : [{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.35 }, { transform: "scale(1)" }];
    void play(el, frames, d, EASE.out, ctx.signal);
  };

  // ── reveal (human): hand → slip clip ─────────────────────────────────────────────────────
  offs.push(director.on("reveal", async (beat, ctx) => {
    const human = deps.humanSide() ?? ctx.humanSide;
    if (beat.side !== human) return;
    const card = beat.card;
    const key: TrayElKey = card === CHINA_CARD ? "china" : `card:${card}`;
    const el = store.el(key);
    const from = el && el.dataset.state !== "lifted" ? rectOf(el) : null;
    const slip = safeRect(anchors, "slip");
    const d = dur(TIMING.humanCardPlayed.dur, ctx.speed.motion);
    let release = () => { /* no animation */ };
    if (el && from && slip && d > 0 && !deps.reduced()) {
      const a = centre(from);
      const b = centre(slip);
      const k = Math.max(0.3, Math.min(1, 56 / from.width));
      release = await play(el, [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${(b.x - a.x).toFixed(1)}px, ${(b.y - a.y).toFixed(1)}px) scale(${k.toFixed(3)})`, opacity: 0 },
      ], d, EASE.out, ctx.signal, true);
    }
    store.patch({ gone: new Set([...store.get().gone, card]) });
    if (!ctx.signal.aborted) await nextPaint();
    release();
  }));

  // ── hand-revealed (human): the KNOWN TO AI tag blinks on ─────────────────────────────────
  offs.push(director.on("hand-revealed", async (beat, ctx) => {
    const human = deps.humanSide() ?? ctx.humanSide;
    if (beat.side !== human || !beat.cards.length) return;
    const known = new Set([...store.get().known, ...beat.cards]);
    const per = dur(TIMING.handRevealed.perCard, ctx.speed.motion);
    const stagger = dur(TIMING.handRevealed.stagger, ctx.speed.motion);
    if (per <= 0 || deps.reduced()) {
      store.patch({ known, blink: new Map(), blinkMs: 0 });
      return;
    }
    const blink = new Map(beat.cards.map((c, i) => [c, i * stagger] as const));
    store.patch({ known, blink, blinkMs: per });
    await wait(per + stagger * (beat.cards.length - 1), ctx.signal);
    store.patch({ blink: new Map(), blinkMs: 0 });
  }));

  // ── headline-chosen (human): the card slides face down into the headline slot ────────────
  offs.push(director.on("headline-chosen", async (beat, ctx) => {
    const human = deps.humanSide() ?? ctx.humanSide;
    if (beat.side !== human) return;
    const card = chosenHeadline(beat, ctx);
    if (!card) return;
    const from = rectOf(store.el(`card:${card}`));
    store.patch({ gone: new Set([...store.get().gone, card]), headline: { card, faceDown: true } });
    const d = dur(TIMING.headlineChosen.dur, ctx.speed.motion);
    if (!from || d <= 0 || deps.reduced() || ctx.signal.aborted) return;
    await nextPaint();
    const slot = store.el("headline");
    const to = rectOf(slot);
    if (!slot || !to) return;
    const a = centre(from);
    const b = centre(to);
    await play(slot, [
      { transform: `translate(${(a.x - b.x).toFixed(1)}px, ${(a.y - b.y).toFixed(1)}px) scale(${(from.width / to.width).toFixed(3)})` },
      { transform: "translate(0, 0) scale(1)" },
    ], d, EASE.out, ctx.signal);
  }));

  // ── china: pass between the slots / flip, and the toast ──────────────────────────────────
  offs.push(director.on("china", async (beat, ctx) => {
    const human = deps.humanSide() ?? ctx.humanSide;
    const before = ctx.before.china_card;
    if (before.holder !== human && beat.holder !== human) return;
    const next = { holder: beat.holder, playable: beat.playable };
    const passes = before.holder !== beat.holder;
    if (passes) deps.toast(deps.chinaToast(beat.holder), TIMING.chinaCard.toast);
    const flight = dur(TIMING.chinaCard.flight, ctx.speed.motion);
    const flip = dur(TIMING.chinaCard.flip, ctx.speed.motion);
    if (deps.reduced() || flight <= 0 || ctx.signal.aborted) {
      store.patch({ china: next });
      return;
    }
    const ai = other(human);
    if (passes && before.holder === human) {
      // Leaving: slide towards the AI's China anchor (the adversary dossier), else off to the right.
      // Already played out of the slot (into the slip clip / onto the stage): nothing left to slide.
      const el = store.get().gone.has(CHINA_CARD) ? null : store.el("china");
      const from = el && el.dataset.state !== "lifted" ? rectOf(el) : null;
      const target = safeRect(anchors, `china:${ai}`);
      let release = () => { /* no animation */ };
      if (el && from) {
        const a = centre(from);
        const b = target ? centre(target) : { x: a.x + 160, y: a.y - 60 };
        release = await play(el, [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${((b.x - a.x) * 0.6).toFixed(1)}px, ${((b.y - a.y) * 0.6 - 36).toFixed(1)}px) scale(.8)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${(b.x - a.x).toFixed(1)}px, ${(b.y - a.y).toFixed(1)}px) scale(.5)`, opacity: 0 },
        ], flight, EASE.inOut, ctx.signal, true);
      }
      store.patch({ china: next });
      if (!ctx.signal.aborted) await nextPaint();
      release();
      return;
    }
    if (passes) {
      // Arriving face down: from the AI's China anchor (if shown) into the felt.
      const from = safeRect(anchors, `china:${ai}`);
      store.patch({ china: next });
      await nextPaint();
      const el = store.el("china");
      const to = rectOf(el);
      if (!el || !to) return;
      const b = centre(to);
      const a = from ? centre(from) : { x: b.x + 160, y: b.y - 60 };
      await play(el, [
        { transform: `translate(${(a.x - b.x).toFixed(1)}px, ${(a.y - b.y).toFixed(1)}px) scale(.5)`, opacity: from ? 1 : 0 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ], flight, EASE.inOut, ctx.signal);
      return;
    }
    // Same holder: turn over (face up at turn start, or face down).
    const el = store.el("china");
    const release = await play(el, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }], Math.round(flip / 2), EASE.in, ctx.signal, true);
    store.patch({ china: next });
    if (!ctx.signal.aborted) await nextPaint();
    release();
    await play(store.el("china"), [{ transform: "rotateY(90deg)" }, { transform: "rotateY(0deg)" }], Math.round(flip / 2), EASE.out, ctx.signal);
  }));

  // ── deck pulse: a deal from a nearly empty deck, or an era turn adding cards ──────────────
  offs.push(director.on("deal", async (_beat, ctx) => {
    if (ctx.before.draw_deck_count <= 2) pulseDeck(ctx);
  }));
  offs.push(director.on("banner", async (beat, ctx) => {
    if (beat.kind === "turn" && (beat.turn === 4 || beat.turn === 8)) pulseDeck(ctx);
  }));

  return () => { for (const off of offs) off(); };
}
