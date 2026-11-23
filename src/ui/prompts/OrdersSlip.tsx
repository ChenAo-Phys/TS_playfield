/**
 * The orders slip (ui-spec §8.1, §9.5): the one place that asks you something. Paper slip with a typed
 * head ("ORDERS · TURN 5 · AR 3" + a side stamp), the card clip, the title, the crumb of the play so
 * far, the big counter and Ops coins, undo, a hint (or the staged choice's warnings / consequence), and
 * the actions row (primary ↵, hold, done, the target-list link).
 *
 * Modes: a live prompt; frozen on the last prompt while your own click animates (non-interactive, no
 * flicker); AI mode while the AI thinks or its play animates (stamp "US · AI", "Waiting for the United
 * States…" with a caret, the AI play's crumb, the speed segment and Skip); game over.
 * Variants: desktop (344 px), tablet (296 px, no clip, no hint), compact (full sheet width; `expanded`
 * shows the target list or the full detail). The title and counter are a polite live region.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cardInfo } from "../../data";
import type { CoupOdds, PlayHow, Prompt, PromptOption, PublicState, Side, Warning } from "../../game/contract";
import { branchMeta } from "../../game/branches";
import { endingReasonMessage, warningMessage } from "../../game/messages";
import { useI18n, type I18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { Button } from "../common/Button";
import { HoldButton } from "../common/HoldButton";
import { Icon } from "../common/Icon";
import { MessageText } from "../common/MessageText";
import { Stamp } from "../common/Stamp";
import { useTouchUi } from "../common/touch";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { Shown } from "../ui-contract";
import { cost2Targets, pointCost } from "./costHint";
import { coupNumbers } from "./CountryTooltip";
import { cachedPreview } from "./previews";
import { doneText } from "./doneText";
import { confirmLabel, howWord, ordersHead, promptCard, promptCrumb, REPEATING_PICKERS, scoredNet, slotName, type Crumb } from "./labels";
import { isDanger, MAP_KINDS, PLACEMENT_KINDS } from "./policy";
import { RegionChoice } from "./RegionChoice";
import { SCORING_SLOT } from "./regions";
import { runCardPicks, runTotalOf, useRun } from "./runTotals";
import { TargetList } from "./TargetList";
import { claimSlowHint, slowHintClaimedBy, SLOW_HINT_TOAST_MS, useAiWait } from "./aiWait";
import { usePromptActions, type PromptActions } from "./usePromptActions";
import { usePromptKeys } from "./usePromptKeys";
import { usePromptStore, usePromptUi } from "./useStaging";
import { Dossier } from "../common/Dossier";
import { useShell } from "../screens/shellContext";
import { useStageWaiting } from "../stage/useStage";
import { rollCountry } from "../stage/model";
import s from "./OrdersSlip.module.css";

export interface OrdersSlipProps {
  variant: "desktop" | "tablet" | "compact";
  /** Compact: the sheet is expanded (the target list for map prompts, else the full detail). */
  expanded?: boolean;
  className?: string;
}

export type SlipMode = "prompt" | "frozen" | "ai" | "over";

const other = (side: Side): Side => (side === "US" ? "USSR" : "US");

/** Which face the slip shows (pure). */
export function slipMode(vm: { prompt: Prompt | null; status: string; aiThinking: boolean; frame: { actor: Side | null } | null; queued?: number }, shown: Pick<Shown, "busy" | "actor"> | null, human: Side, lastPrompt: Prompt | null): SlipMode {
  // The controller is "over" as soon as it queues the last frames: wait until they have played, so the
  // slip doesn't announce the end before the board shows it.
  if (vm.status === "over" && !shown?.busy && !(vm.queued ?? 0)) return "over";
  if (vm.prompt && !shown?.busy) return "prompt";
  const ownFrame = (shown?.busy && shown.actor === human) || (!vm.aiThinking && vm.frame?.actor === human);
  if (lastPrompt && ownFrame) return "frozen";
  if (vm.prompt) return "prompt";
  return "ai";
}

/** Kinds that show the big counter (§8.1). */
function hasCounter(p: Prompt, total: number): boolean {
  if (PLACEMENT_KINDS.has(p.kind) || p.kind === "realign-target") return true;
  return p.kind === "event-target" && (p.remaining > 1 || total > 1);
}

/** Ops coins (one per point of the run) belong to Ops influence (§8.6); other counters stand alone. */
function hasCoins(p: Prompt): boolean {
  return p.kind === "influence";
}

const SENTINEL = "\u0001";

/** A catalog sentence with the "2 Ops" chip where it names the exception (`{{cost}}`). */
function WithCostChip({ text, chip }: { text: string; chip: string }) {
  const parts = text.split(SENTINEL);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 ? <span className={s.costChip}>{chip}</span> : null}
        </span>
      ))}
    </>
  );
}

function Coins({ total, spent, pulse }: { total: number; spent: number; pulse: number }) {
  const n = Math.min(total, 10);
  return (
    <span className={s.coins} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const isSpent = i < spent;
        const pulsing = !isSpent && i < spent + pulse;
        return <span key={i} className={[s.coin, isSpent ? s.coinSpent : "", pulsing ? s.coinPulse : ""].filter(Boolean).join(" ")} />;
      })}
    </span>
  );
}

function CrumbLine({ crumb }: { crumb: Crumb }) {
  const { t, cardName } = useI18n();
  const parts: ReactNode[] = [];
  if (crumb.card) parts.push(<span key="c" className={s.crumbCard}>{cardName(crumb.card)}</span>);
  if (crumb.mode) parts.push(<b key="m" className={s.crumbMode}>{crumb.mode}</b>);
  const tail = (
    <>
      {crumb.target ? <span className={s.crumbTarget}><i aria-hidden="true">→</i>{crumb.target}</span> : null}
      {crumb.ops ? <span className={s.crumbOps}><i aria-hidden="true">·</i>{crumb.ops}</span> : null}
    </>
  );
  if (!parts.length && !crumb.target && !crumb.ops) return null;
  // The line ellipsizes when the slip is narrow: the whole crumb is its tooltip.
  const full = [
    [crumb.card ? cardName(crumb.card) : "", crumb.mode ?? ""].filter(Boolean).join(" › "),
    crumb.target ? `→ ${crumb.target}` : "",
    crumb.ops ? `· ${crumb.ops}` : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={s.crumb} aria-label={t("ui_prompts:crumb.label")} title={full} data-crumb="">
      {parts.map((p, i) => (
        <span key={i} className={s.crumbPart}>{i > 0 ? <i aria-hidden="true">›</i> : null}{p}</span>
      ))}
      {tail}
    </div>
  );
}

function WarningPanel({ warnings }: { warnings: readonly Warning[] }) {
  return (
    <div className={s.warn} role="alert">
      <span className={s.hazard} aria-hidden="true" />
      <div>
        {warnings.map((w, i) => <div key={i}><MessageText message={warningMessage(w)} /></div>)}
      </div>
    </div>
  );
}

function Clip({ card }: { card: number }) {
  const root = useUiRoot();
  const { cardName } = useI18n();
  const ref = useRef<HTMLButtonElement | null>(null);
  if (!card) return null;
  return (
    <button
      ref={ref}
      type="button"
      className={s.clip}
      aria-label={cardName(card)}
      onClick={() => root.zoomCard(card, ref.current)}
    >
      <CardFace card={card} width={56} eager className={s.clipCard} />
      <span className={s.paperclip} aria-hidden="true" />
    </button>
  );
}

/** Vietnam Revolts (#9) while it is in effect. */
const VIETNAM_REVOLTS = 9;

/**
 * The conditional Ops bonuses a play counts (§8.6): the China Card's +1 if every point goes to Asia, Vietnam
 * Revolts' +1 (USSR) if every point goes to Southeast Asia. The engine includes them in `remaining` (influence
 * points, realignment rolls) or the coup's Ops and drops them at the first point / roll placed elsewhere (a coup
 * elsewhere gets 1 less), so the slip says so: influence (QA Q-037), realignment and coup (R-015), each in its
 * own words.
 */
export function bonusHints(p: Pick<Prompt, "kind" | "pendingCard">, state: Pick<PublicState, "flags"> | null, human: Side, i18n: Pick<I18n, "t" | "cardName">): string[] {
  if (p.kind !== "influence" && p.kind !== "realign-target" && p.kind !== "coup-target") return [];
  const out: string[] = [];
  const china = p.pendingCard === 6;
  const vietnam = human === "USSR" && !!state?.flags?.includes("VIETNAM_REVOLTS_ACTIVE");
  const card = i18n.cardName(VIETNAM_REVOLTS);
  if (p.kind === "influence") {
    if (china) out.push(i18n.t("ui:slip.hint.asiaBonus"));
    if (vietnam) out.push(i18n.t("ui_prompts:hint.seAsiaBonus", { card }));
  } else if (p.kind === "realign-target") {
    if (china) out.push(i18n.t("ui_prompts:hint.asiaBonusRealign"));
    if (vietnam) out.push(i18n.t("ui_prompts:hint.seAsiaBonusRealign", { card }));
  } else {
    if (china) out.push(i18n.t("ui_prompts:hint.asiaBonusCoup"));
    if (vietnam) out.push(i18n.t("ui_prompts:hint.seAsiaBonusCoup", { card }));
  }
  return out;
}

interface HintContext {
  i18n: I18n;
  /** Touch wording (QA Q-032): "Tap", and no key hints. */
  touch: boolean;
  bonuses: readonly string[];
}

/** The hint line of a prompt (detail / per-kind hint / keys), unstaged. */
function PromptHint({ p, ctx }: { p: Prompt; ctx: HintContext }) {
  const { t } = ctx.i18n;
  if (p.kind === "influence") {
    // A conditional bonus first: the slip shows the lines that fit, and it matters more than the click instruction.
    return (
      <>
        {ctx.bonuses.map((b, i) => <b key={i} className={s.bonus}>{b} </b>)}
        <WithCostChip text={t(ctx.touch ? "ui_prompts:touch.influence" : "ui:slip.hint.influence", { cost: SENTINEL })} chip={t("ui:map.cost2")} />
      </>
    );
  }
  if (p.kind === "coup-target" || p.kind === "realign-target") {
    // The conditional bonus leads here too (R-015): a roll / coup outside Asia drops it.
    const rest = p.kind === "coup-target" ? t("ui:slip.hint.coup-target") : p.detail ? <MessageText message={p.detail} /> : null;
    return (
      <>
        {ctx.bonuses.map((b, i) => <b key={i} className={s.bonus}>{b} </b>)}
        {rest}
      </>
    );
  }
  if (p.kind === "headline") return p.detail ? <MessageText message={p.detail} /> : <>{t("ui:slip.hint.headline")}</>;
  if (p.kind === "play-mode" || p.kind === "op-mode") {
    const keys = ctx.touch ? "" : playModeKeys(p);
    return keys ? <>{t("ui_prompts:hint.keys", { keys })}</> : null;
  }
  if (p.kind === "region") return null;
  return p.detail ? <MessageText message={p.detail} /> : null;
}

/** The hint as plain text (the hint line's tooltip: it is clamped to the lines that fit). */
function promptHintText(p: Prompt, ctx: HintContext): string {
  const { t, render } = ctx.i18n;
  if (p.kind === "influence") return [...ctx.bonuses, t(ctx.touch ? "ui_prompts:touch.influence" : "ui:slip.hint.influence", { cost: t("ui:map.cost2") })].join(" ");
  if (p.kind === "coup-target") return [...ctx.bonuses, t("ui:slip.hint.coup-target")].join(" ");
  if (p.kind === "realign-target") return [...ctx.bonuses, p.detail ? render(p.detail) : ""].filter(Boolean).join(" ");
  if (p.kind === "headline") return p.detail ? render(p.detail) : t("ui:slip.hint.headline");
  if (p.kind === "play-mode" || p.kind === "op-mode") {
    const keys = ctx.touch ? "" : playModeKeys(p);
    return keys ? t("ui_prompts:hint.keys", { keys }) : "";
  }
  if (p.kind === "region") return "";
  return p.detail ? render(p.detail) : "";
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How many whole lines of `line` fit in `box` (a flex column of fixed height) beside its other children,
 * up to `max`: the slip is short (tray height − 4 px), so a hint shows the lines that fit, never a line cut
 * in half, and none when there is no room. Re-measured on every render and when the box resizes.
 */
function useFitLines(box: RefObject<HTMLElement | null>, line: RefObject<HTMLElement | null>, max: number, enabled: boolean): number {
  const [lines, setLines] = useState(max);
  // A new maximum starts from itself: a content-sized slip (compact) only "has room" for what it already shows.
  const [prevMax, setPrevMax] = useState(max);
  if (prevMax !== max) {
    setPrevMax(max);
    setLines(max);
  }
  const fit = () => {
    const b = box.current, l = line.current;
    if (!enabled || !b || !l || typeof getComputedStyle !== "function") return;
    const cs = getComputedStyle(l);
    const lh = parseFloat(cs.lineHeight) || 17;
    let used = parseFloat(cs.marginTop) || 0;
    for (const c of Array.from(b.children) as HTMLElement[]) {
      if (c === l) continue;
      // The actions row's auto top margin only takes what is left over: count its height alone.
      used += c.offsetHeight + (c.dataset.dock !== undefined ? 0 : (parseFloat(getComputedStyle(c).marginTop) || 0));
    }
    const n = Math.max(0, Math.min(max, Math.floor((b.clientHeight - used + 1) / lh)));
    setLines(prev => (prev === n ? prev : n));
  };
  useIsoLayoutEffect(fit);
  // The observer calls the latest `fit` (its `max` changes: the AI note's one-time hint raises it from 1 to 3).
  const latest = useRef(fit);
  latest.current = fit;
  useIsoLayoutEffect(() => {
    const b = box.current;
    if (!enabled || !b || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => latest.current());
    ro.observe(b);
    return () => ro.disconnect();
  }, [enabled]);
  return enabled ? lines : max;
}

/**
 * How many lines the slip's title may take (QA R-012): at least `min` (the 2-line clamp; 1 on the dense region
 * prompt), up to `max` (4) while the slip has room beside everything but its note (the hint / consequence under
 * the title, `data-note`), which keeps the whole lines left after the title (`useFitLines`) and is reserved one
 * line here where it shows (`noteShown`). The title never depends on the note's own fit, so the two settle in
 * one pass. Re-measured on every render and when the slip resizes.
 */
function useTitleLines(title: RefObject<HTMLElement | null>, min: number, max: number, noteShown: boolean, enabled: boolean): number {
  const [lines, setLines] = useState(min);
  const fit = () => {
    const tl = title.current, top = tl?.parentElement, b = top?.parentElement;
    if (!enabled || !tl || !top || !b || typeof getComputedStyle !== "function") return;
    const lh = parseFloat(getComputedStyle(tl).lineHeight) || 20;
    let used = top.offsetHeight - tl.offsetHeight;
    for (const c of Array.from(b.children) as HTMLElement[]) {
      if (c === top) continue;
      const cs = getComputedStyle(c);
      if (c.dataset.note !== undefined) {
        if (noteShown) used += (parseFloat(cs.lineHeight) || 17) + (parseFloat(cs.marginTop) || 0);
        continue;
      }
      used += c.offsetHeight + (c.dataset.dock !== undefined ? 0 : (parseFloat(cs.marginTop) || 0));
    }
    const n = Math.max(min, Math.min(max, Math.floor((b.clientHeight - used + 1) / lh)));
    setLines(prev => (prev === n ? prev : n));
  };
  useIsoLayoutEffect(fit);
  const latest = useRef(fit);
  latest.current = fit;
  useIsoLayoutEffect(() => {
    const b = title.current?.parentElement?.parentElement;
    if (!enabled || !b || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => latest.current());
    ro.observe(b);
    return () => ro.disconnect();
  }, [enabled]);
  return enabled ? lines : min;
}

/**
 * Is the slip's title (or its crumb) cut? Then a tap on it shows the whole question in place (QA R-012: the
 * `title` tooltip needs a hover, which touch screens don't have, ui-spec §12). Not re-measured while open.
 */
function useTitleCut(title: RefObject<HTMLElement | null>, open: boolean): boolean {
  const [cut, setCut] = useState(false);
  const measure = () => {
    const tl = title.current;
    if (!tl || open) return;
    const over = (e: Element) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
    const crumb = tl.parentElement?.querySelector<HTMLElement>("[data-crumb]");
    const c = over(tl) || (!!crumb && [crumb, ...Array.from(crumb.children)].some(over));
    setCut(prev => (prev === c ? prev : c));
  };
  useIsoLayoutEffect(measure);
  // Also when the slip resizes or a web font arrives (the text reflows without a render).
  const latest = useRef(measure);
  latest.current = measure;
  useIsoLayoutEffect(() => {
    const top = title.current?.parentElement;
    const again = () => latest.current();
    const ro = top && typeof ResizeObserver !== "undefined" ? new ResizeObserver(again) : null;
    if (top) ro?.observe(top);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", again);
    void fonts?.ready?.then(again);
    return () => { ro?.disconnect(); fonts?.removeEventListener?.("loadingdone", again); };
  }, []);
  return cut;
}

/** True while `row`'s content is wider than the row (re-checked when `key` changes or the row resizes). */
function useOverflows(row: RefObject<HTMLElement | null>, key: string): boolean {
  const [tight, setTight] = useState(false);
  // A new content key starts wide again, then drops to the tight form if it doesn't fit.
  useIsoLayoutEffect(() => { setTight(false); }, [key]);
  useIsoLayoutEffect(() => {
    const el = row.current;
    if (!el || tight) return;
    if (el.scrollWidth > el.clientWidth + 1) setTight(true);
  });
  return tight;
}

/** "E · I · C · R · S" for the modes on offer. */
export function playModeKeys(p: Prompt): string {
  const letters: string[] = [];
  const has = (kind: string, id: number) => p.options.some(o => o.kind === kind && o.id === id);
  if (p.kind === "play-mode") {
    if (has("mode", 0)) letters.push("E");
    if (has("mode", 2)) letters.push("I");
    if (has("mode", 3)) letters.push("C");
    if (has("mode", 4)) letters.push("R");
    if (has("mode", 1)) letters.push("S");
  } else {
    if (has("op-mode", 0)) letters.push("I");
    if (has("op-mode", 1)) letters.push("C");
    if (has("op-mode", 2)) letters.push("R");
  }
  return letters.join(" · ");
}

/** What the staged choice will do, in one line (scoring net, coup finality, Chernobyl's region); null when nothing. */
function consequenceText(p: Prompt, option: PromptOption, state: PublicState | null, i18n: I18n, regionScores: Parameters<typeof scoredNet>[1], touch = false): string | null {
  const { t, render, countryName } = i18n;
  if (p.kind === "action-card" && option.kind === "card") {
    const slot = SCORING_SLOT[option.id];
    if (slot !== undefined) {
      const net = scoredNet(t, regionScores, slot);
      return net ? t("ui_prompts:consequence.ifScored", { region: slotName(i18n, slot), net }) : null;
    }
  }
  if (p.kind === "coup-target" && option.kind === "country") return t(touch ? "ui_prompts:touch.coupFinal" : "ui:slip.hint.coupFinal", { country: countryName(option.id) });
  if (p.kind === "region" && option.kind === "region" && state) {
    const meta = branchMeta(p.resolvingCard, option.id, state);
    return meta ? render(meta.desc) : null;
  }
  if (p.kind === "realign-target" && option.kind === "country") return t("ui_prompts:consequence.realign");
  return null;
}

function PromptBody({ p, frozen, variant, expanded, actions }: { p: Prompt; frozen: boolean; variant: OrdersSlipProps["variant"]; expanded: boolean; actions: PromptActions }) {
  const i18n = useI18n();
  const { t, render } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const store = usePromptStore();
  const vm = root.vm;
  const state = shown?.state ?? vm.frame?.state ?? null;
  const human: Side = vm.humanSide ?? "US";
  const run = useRun();
  const hover = usePromptUi("hover");
  const total = runTotalOf(run, p);
  const staged = frozen ? null : actions.stagedOption();
  const pol = staged ? actions.policyOf(staged) : null;
  const disabled = frozen || !actions.interactive;
  const cost2 = useMemo(() => cost2Targets(p, state), [p, state]);
  const compactLandscape = root.layout === "compact-landscape";
  const touch = useTouchUi();

  // Title (§8.1): the short verb for influence / coup / realign, else the prompt's own title.
  let title: ReactNode;
  if (p.kind === "influence") title = t("ui:slip.verb.influence");
  else if (p.kind === "coup-target") title = staged?.kind === "country" ? t("ui_prompts:title.coupTarget", { country: i18n.countryName(staged.id) }) : t("ui:slip.verb.coup-target");
  else if (p.kind === "realign-target") title = t("ui:slip.verb.realign-target");
  else if (p.kind === "play-mode") title = t("ui:mode.howTitle");
  else title = <MessageText message={p.title} refs={false} />;
  // Its tooltip (the title clamps to two lines).
  const titleText = typeof title === "string" ? title : render(p.title);

  const crumb = promptCrumb(i18n, p, staged);
  const bonuses = bonusHints(p, state, human, i18n);
  // A staged coup is credited with the Ops the engine gives it there (the China Card's +1 only in Asia, Q-038).
  if (p.kind === "coup-target" && staged?.kind === "country") {
    const odds = cachedPreview(root.controller, p, "coup", staged.id) as CoupOdds | null | undefined;
    if (odds) crumb.ops = t("ui_prompts:ops", { count: coupNumbers(odds, p).ops });
    else if (bonuses.length) crumb.ops = null;
  } else if (p.kind === "coup-target" && bonuses.length) {
    // Unstaged, a conditional bonus makes the prompt's Ops a maximum (a coup elsewhere gets 1 less): no number
    // until a target says which (R-015); the hint says why.
    crumb.ops = null;
  }
  const counter = hasCounter(p, total);
  const coins = hasCoins(p) && !compactLandscape && total > 0;
  const hoverOpt = hover !== null ? p.options.find(o => o.kind === "country" && o.id === hover) : undefined;
  const pulse = hoverOpt && !frozen ? pointCost(p, hoverOpt, cost2) : 0;
  const canUndo = vm.canUndo && !frozen;
  const done = p.done && !frozen ? doneText(p) : null;
  const doneStaged = staged?.kind === "done";
  // Where the actions row is busy (a primary, a done button) undo shrinks to its icon (full name in the title).
  // Region prompts on desktop / tablet: a dense grid whose staged button is the primary (§8.11 rows).
  const regionDense = p.kind === "region" && variant !== "compact";
  const crowded = !!staged || (!!done && !doneStaged) || regionDense;
  // The Ops-coins row (coins · list · undo) is one line: when the words don't fit (Chinese, many coins), undo
  // drops to its icon as well.
  const opsRow = useRef<HTMLDivElement | null>(null);
  const coinsTight = useOverflows(opsRow, `${i18n.lang}|${variant}|${total}|${canUndo}|${!!staged}`);
  const undoIconOnly = (crowded || (coinsTight && hasCoins(p))) && variant !== "compact";
  // Dense region prompt: undo stands beside the region grid, the height of its two rows, its icon alone (no key cap:
  // the columns need the width) (R-009: under the grid it fell off the 120–138 px slips of tablets and 1280 × 720 /
  // 1366 × 768 desktops).
  const undoClass = [undoIconOnly ? s.iconOnly : "", regionDense ? s.regionUndo : ""].filter(Boolean).join(" ") || undefined;
  const undoBtn = canUndo && p.kind !== "play-mode" ? (
    <Button variant="ghost" size="s" onPaper icon="undo" kbd={regionDense ? undefined : "Z"} className={undoClass} title={t("ui:game.undoTitle")} keyshortcuts="Z Control+Z Meta+Z" disabled={disabled} onClick={actions.undo}>
      {undoIconOnly ? <span className="ts-vh">{t("ui:game.undo")}</span> : t("ui:game.undo")}
    </Button>
  ) : null;

  const isMapPrompt = MAP_KINDS.has(p.kind);
  // The target list link (§8.13): an icon (named for assistive technology), hidden while something is staged.
  const listBtn = isMapPrompt && !frozen && !staged && (variant !== "compact" || compactLandscape) ? (
    <Button variant="ghost" size="s" onPaper icon="list" kbd="T" className={s.listLink} title={t("ui_prompts:list.title")} disabled={disabled} onClick={() => store.setListOpen(true)}>
      <span className="ts-vh">{t("ui:slip.list")}</span>
    </Button>
  ) : null;
  const hold = pol?.commit === "hold";
  // A hold button says the warning itself (§8.3 fatal); other staged choices show it in the panel.
  const warnings = staged && !hold ? (staged.warnings ?? []).filter(w => w.code !== "opponent-event") : [];

  let primary: ReactNode = null;
  if (staged && pol) {
    const label = confirmLabel(i18n, p, staged, state, human);
    if (pol.commit === "hold") {
      const fatal = (staged.warnings ?? []).find(w => isDanger(w, human));
      const text = fatal ? render(warningMessage(fatal)) : label;
      // Focus moves to the hold button (autoFocus, one per option) so a held Enter reaches it: Enter on the
      // control that made the selection belongs to that control.
      primary = (
        <HoldButton
          key={staged.idx}
          autoFocus
          globalEnter
          disabled={disabled}
          className={s.holdWide}
          label={text}
          onConfirm={() => actions.commit(staged.idx)}
          onHoldChange={h => store.pause(h)}
        >
          {text}
        </HoldButton>
      );
    } else {
      primary = (
        <Button variant="primary" onPaper kbd="↵" disabled={disabled} onClick={() => actions.confirm()}>
          {label}
        </Button>
      );
    }
  }

  const picks = p.kind === "event-card" && REPEATING_PICKERS.has(p.resolvingCard) ? runCardPicks(run, state) : 0;
  const hintCtx: HintContext = { i18n, touch, bonuses };
  const hint = staged ? null : (
    <>
      {picks > 0 ? <b className={s.picks}>{t("ui_prompts:picker.count", { count: picks })}</b> : null}
      <PromptHint p={p} ctx={hintCtx} />
    </>
  );
  const hintText = [picks > 0 ? t("ui_prompts:picker.count", { count: picks }) : "", promptHintText(p, hintCtx)].filter(Boolean).join(" ");
  const staticConsequence = staged && !hold ? consequenceText(p, staged, state, i18n, vm.frame?.regionScores ?? null, touch) : null;
  // A realignment keeps its country staged across its rolls, so the conditional bonus leads the consequence too: it
  // explains "5/5" turning into "3/5" after a roll outside Asia (R-015).
  const consequence = staticConsequence && p.kind === "realign-target" && bonuses.length ? [...bonuses, staticConsequence].join(" ") : staticConsequence;
  // Desktop / tablet: the note under the title (the hint, or the staged choice's consequence) keeps the whole
  // lines that fit beside the rest (2 at most; the hint 1 on short windows, as the CSS), never half a line.
  const main = useRef<HTMLDivElement | null>(null);
  const noteEl = useRef<HTMLDivElement | null>(null);
  const noteRef = (el: HTMLDivElement | null) => { noteEl.current = el; main.current = el?.parentElement as HTMLDivElement | null; };
  const showConsequence = !!consequence && !warnings.length && !regionDense;
  // The dense region prompt's one line: the staged region's consequence, else what the choice does (the detail).
  const regionText = regionDense ? (staged ? consequence : p.detail ? render(p.detail) : null) : null;
  const fitNote = (regionDense ? !!regionText : showConsequence || !!hint) && !expanded && variant !== "compact";
  const noteLines = useFitLines(main, noteEl, regionDense ? 1 : 2, fitNote);

  // The title (R-012): up to 4 lines where the slip has room (2 at least; 1 beside the dense region grid), and a
  // tap on a cut title or crumb shows the whole question in place (`aria-expanded`), until tapped again or the
  // prompt changes.
  const titleEl = useRef<HTMLDivElement | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = openId === p.promptId;
  const fixedSlip = variant !== "compact";
  const noteShown = regionDense ? !!regionText : showConsequence || (!!hint && variant !== "tablet");
  const titleLines = useTitleLines(titleEl, regionDense ? 1 : 2, regionDense ? 1 : 4, noteShown, fixedSlip && !open);
  const cut = useTitleCut(titleEl, open);
  const toggle = cut || open;
  const flip = () => setOpenId(open ? null : p.promptId);

  return (
    <>
      <div
        className={s.top}
        aria-live="polite"
        aria-atomic="true"
        data-open={open || undefined}
        data-toggle={toggle || undefined}
        onClick={toggle ? flip : undefined}
      >
        <div
          ref={titleEl}
          className={s.title}
          title={titleText}
          data-lines={fixedSlip && !open ? titleLines : undefined}
          {...(toggle ? {
            role: "button",
            tabIndex: 0,
            "aria-expanded": open,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              flip();
            },
          } : {})}
        >
          {title}
        </div>
        {/* Desktop / tablet slips are short: a warning panel takes the crumb's line (the clip and the primary name the play). */}
        {regionDense || (warnings.length > 0 && variant !== "compact") ? null : <CrumbLine crumb={crumb} />}
        {counter ? (
          <div className={s.bigCount}>
            <b className="ts-num">{p.remaining}</b>
            <small className="ts-num">/{total}</small>
            <span className={s.countLabel}>{t(`ui:slip.counter.${p.kind as "influence"}`)}</span>
          </div>
        ) : null}
      </div>
      {coins ? (
        <div ref={opsRow} className={s.opsRow} data-tight={coinsTight || undefined}>
          <Coins total={total} spent={Math.max(0, total - p.remaining)} pulse={pulse} />
          <span className={s.rowTools}>{listBtn}{staged ? null : undoBtn}</span>
        </div>
      ) : null}
      {regionDense && (!frozen || undoBtn) ? (
        <div className={s.regionRow}>
          {frozen ? <span /> : <RegionChoice prompt={p} dense />}
          {undoBtn}
        </div>
      ) : null}
      {regionText ? (
        <div ref={noteRef} className={s.regionLine} title={regionText} data-note="" data-lines={fitNote ? noteLines : undefined}>{regionText}</div>
      ) : null}
      {warnings.length ? <WarningPanel warnings={warnings} /> : null}
      {showConsequence ? (
        <div ref={noteRef} className={s.consequence} title={consequence ?? undefined} data-note="" data-lines={fitNote ? noteLines : undefined}>{consequence}</div>
      ) : null}
      {hint && !regionDense ? (
        <div
          ref={noteRef}
          className={[s.hint, expanded ? s.hintFull : ""].join(" ")}
          title={hintText || undefined}
          data-note=""
          data-lines={fitNote ? noteLines : undefined}
        >
          {hint}
        </div>
      ) : null}
      {p.kind === "region" && !frozen && !regionDense ? <RegionChoice prompt={p} /> : null}
      {!regionDense && (primary || (done && !doneStaged) || (!coins && (listBtn || undoBtn))) ? (
        <div className={s.actions} data-dock="">
          {primary}
          {done && !doneStaged ? (
            <Button variant="ghost" size="s" onPaper kbd="D" disabled={disabled} onClick={actions.done}>{render(done)}</Button>
          ) : null}
          {!coins || staged ? undoBtn : null}
          {!coins ? listBtn : null}
        </div>
      ) : null}
    </>
  );
}

/** The thinking title with its blinking caret, which never sits alone on a line (it wraps with the last word). */
function CaretTitle({ text }: { text: string }) {
  const cut = text.trimEnd().lastIndexOf(" ") + 1;
  return (
    <>
      {text.slice(0, cut)}
      <span className={s.nowrap}>{text.slice(cut)}<span className={`${s.caret} ts-ambient`} aria-hidden="true" /></span>
    </>
  );
}

/** A placeholder no message contains, to find where a count goes in a translated sentence. */
const SECONDS_MARK = "\u2063#\u2063";

/** `text` split around the first `mark` ([null, null] when it is not there). */
export function splitAt(text: string, mark: string): [string, string] | [null, null] {
  const i = text.indexOf(mark);
  return i < 0 ? [null, null] : [text.slice(0, i), text.slice(i + mark.length)];
}

interface AiPlay {
  card: number;
  how: PlayHow | null;
  target: number | null;
}

/** The AI play being shown (crumb), from the director's reveal / roll beats; cleared at your prompt. */
function useAiPlay(ai: Side): AiPlay | null {
  const root = useUiRoot();
  const [play, setPlay] = useState<AiPlay | null>(null);
  useEffect(() => {
    const offReveal = root.director.on("reveal", async beat => {
      if (beat.side === ai) setPlay({ card: beat.card, how: beat.how, target: null });
      else setPlay(null);
    });
    const offRoll = root.director.on("roll", async beat => {
      // Only coups, realignments and wars name a country: a Space Race roll keeps the space box in country_id (R-007).
      const c = rollCountry(beat.roll);
      if (c !== null) setPlay(p => (p && p.target === null ? { ...p, target: c } : p));
    });
    return () => { offReveal(); offRoll(); };
  }, [root.director, ai]);
  const promptOpen = !!root.vm.prompt;
  useEffect(() => { if (promptOpen) setPlay(null); }, [promptOpen]);
  return play;
}

function AiBody({ ai }: { ai: Side }) {
  const i18n = useI18n();
  const { t, cardName, countryName } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const vm = root.vm;
  const play = useAiPlay(ai);
  const stage = useStageWaiting();
  const card = shown?.aiPlayCard || play?.card || 0;
  const thinking = vm.aiThinking;
  // "Still thinking · 14 s" from 8 s into a decision, and once per page session past 20 s the slow-device hint.
  const wait = useAiWait();
  const long = thinking && wait.still;
  const side = t(`ui:side.long.${ai}`);
  const loading = vm.load && vm.load.stage !== undefined && thinking;
  let title: string;
  if (loading) title = t("ui:slip.ai.preparing", { percent: Math.round((vm.load?.fraction ?? 0) * 100) });
  else if (card) title = t("ui:slip.ai.plays", { side, card: cardName(card) });
  else title = t("ui:slip.ai.waiting", { side });
  const crumb: Crumb | null = card ? {
    card,
    mode: play?.card === card && play.how ? howWord(t, play.how) : null,
    target: play?.card === card && play.target !== null ? countryName(play.target) : null,
    ops: play?.how === "coup" || play?.how === "realign" || play?.how === "influence" ? t("ui_prompts:ops", { count: cardInfo(card)?.ops ?? 0 }) : null,
  } : null;
  const speed = root.settings.speed;
  const busy = !!shown?.busy;
  const stillBox = useRef<HTMLDivElement | null>(null);
  const stillEl = useRef<HTMLDivElement | null>(null);
  // Whole lines that fit: the count alone needs one; with the one-time hint, the sentence after it needs two or three.
  const due = long && wait.hintDue;
  const stillLines = useFitLines(stillBox, stillEl, due ? 3 : 1, long);
  const fits = stillLines >= 2;
  const hint = due && fits;
  // Once the fit has settled: the decision claims the one-time hint, shown in the note, or as a toast where the
  // slip has no second line for it (tablet).
  useEffect(() => {
    const since = wait.since;
    if (!due || since === null) return;
    const id = setTimeout(() => {
      if (slowHintClaimedBy(since)) return;
      claimSlowHint(since);
      if (!fits) root.toast(t("ui_prompts:ai.slowHint"), { ms: SLOW_HINT_TOAST_MS });
    }, 400);
    return () => clearTimeout(id);
  }, [due, fits, wait.since, root, t]);
  const stillKey = hint ? "ui_prompts:ai.stillThinkingSlow" : "ui_prompts:ai.stillThinking";
  const stillText = t(stillKey, { seconds: wait.seconds });
  // The number in its own fixed-width span (tabular, 2 digits reserved): nothing shifts as it counts.
  const [stillPre, stillPost] = splitAt(t(stillKey, { seconds: SECONDS_MARK }), SECONDS_MARK);
  return (
    <>
      <div className={s.top} aria-live="polite" aria-atomic="true">
        <div className={`${s.title} ${s.aiTitle}`} title={title}>
          {thinking ? <CaretTitle text={title} /> : title}
        </div>
        {crumb ? <CrumbLine crumb={crumb} /> : null}
      </div>
      {long ? (
        <div
          ref={el => { stillEl.current = el; stillBox.current = el?.parentElement as HTMLDivElement | null; }}
          className={s.still}
          title={stillText}
          data-lines={stillLines}
          data-still=""
          data-slow-hint={hint || undefined}
        >
          {stillPre === null ? stillText : (
            <>{stillPre}<span className={s.secs} data-seconds={wait.seconds}>{wait.seconds}</span>{stillPost}</>
          )}
        </div>
      ) : null}
      <div className={`${s.actions} ${s.aiActions}`} data-dock="">
        <span className={s.speedSeg} role="group" aria-label={t("ui:slip.speed")}>
          <button type="button" aria-pressed={speed === "normal" || speed === "slow"} aria-label={t("ui:settings.speed.normal")} onClick={() => root.setSettings({ speed: "normal" })}>1×</button>
          <button type="button" aria-pressed={speed === "fast"} aria-label={t("ui:settings.speed.fast")} onClick={() => root.setSettings({ speed: "fast" })}>2×</button>
          <button type="button" aria-pressed={speed === "instant"} aria-label={t("ui:slip.skipAll")} title={t("ui:slip.skipAll")} onClick={() => shown?.skipToMyTurn()}>
            <Icon name="skip" />
          </button>
        </span>
        {stage.waiting ? (
          // The headline papers / scoring sheet wait for Continue (pauseOnReveals, ui-spec §10.2).
          <Button variant="primary" size="s" onPaper kbd={t("ui:shortcuts.key.space")} onClick={stage.proceed}>
            {t("ui:slip.continue")}
          </Button>
        ) : (
          <Button variant="ghost" size="s" onPaper kbd={t("ui:shortcuts.key.space")} disabled={!busy} onClick={() => shown?.skip()}>
            {t("ui:slip.skip")}
          </Button>
        )}
      </div>
    </>
  );
}

/** Your own scoring card / headline waiting on the stage: the slip's Continue (ui-spec §10.2). */
function FrozenContinue() {
  const { t } = useI18n();
  const stage = useStageWaiting();
  if (!stage.waiting) return null;
  return (
    <div className={[s.actions, s.aiActions].join(" ")}>
      <Button variant="primary" size="s" onPaper kbd={t("ui:shortcuts.key.space")} onClick={stage.proceed}>{t("ui:slip.continue")}</Button>
    </div>
  );
}

function OverBody() {
  const root = useUiRoot();
  const shell = useShell();
  const { t, render } = useI18n();
  const ending = root.vm.ending;
  return (
    <>
      <div className={s.top} aria-live="polite">
        <div className={s.title}>{t("ui:over.gameOver")}</div>
        {ending ? <div className={s.hint} title={render(endingReasonMessage(ending.reason))}><MessageText message={endingReasonMessage(ending.reason)} /></div> : null}
      </div>
      {shell ? (
        // The "Game over · New game" chip (ui-spec §10.4 Review board); the shell owns the screens.
        <div className={[s.actions, s.aiActions].join(" ")}>
          <Button variant="primary" size="s" onPaper onClick={() => shell.toStart()}>{t("ui:ending.newGame")}</Button>
          <Button variant="ghost" size="s" onPaper onClick={() => shell.showResult()}>{t("ui_shell:over.result")}</Button>
        </div>
      ) : null}
    </>
  );
}

export function OrdersSlip({ variant, expanded = false, className }: OrdersSlipProps) {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const { t } = useI18n();
  const store = usePromptStore();
  const actions = usePromptActions();
  const vm = root.vm;
  const human: Side = vm.humanSide ?? "US";
  const ai = other(human);
  const lastPrompt = usePromptUi("lastPrompt");
  const listOpen = usePromptUi("listOpen");
  const mode = slipMode(vm, shown, human, lastPrompt);
  usePromptKeys(actions, mode === "prompt");
  const state: PublicState | null = shown?.state ?? vm.frame?.state ?? null;
  const p = mode === "prompt" ? vm.prompt : mode === "frozen" ? lastPrompt : null;
  const clipCard = mode === "ai" ? shown?.aiPlayCard ?? 0 : promptCard(p);
  const stamp = mode === "ai"
    ? <Stamp key="ai" side={ai}>{t("ui:slip.stamp.ai", { side: t(`ui:side.${ai}`) })}</Stamp>
    : mode === "over" ? null : <Stamp key="you" side={human}>{t("ui:slip.stamp.you")}</Stamp>;
  const showClip = variant !== "tablet" && clipCard > 0;
  const listMode = mode === "prompt" || mode === "frozen";
  // Compact landscape: the slip sits in the side column (no grab, no expanded sheet), so the target list opens
  // as on desktop (the List link, T), in a dossier, which is a full-screen sheet there.
  const compactLandscape = variant === "compact" && root.layout === "compact-landscape";
  const cls = [s.slip, s[variant], compactLandscape ? s.side : "", mode === "ai" ? s.ai : "", mode === "frozen" ? s.frozen : "", expanded ? s.expanded : "", className]
    .filter(Boolean).join(" ");
  return (
    <section
      ref={root.anchors.ref("slip")}
      className={`${cls} ts-on-paper`}
      aria-label={t("ui_prompts:slip.label")}
      aria-disabled={mode === "frozen" || undefined}
      data-mode={mode}
      data-variant={variant}
      onPointerEnter={() => store.pause(true)}
      onPointerLeave={() => store.pause(false)}
    >
      <div className={s.head}>
        <span className={s.headText}>{ordersHead(t, state, vm.ending)}</span>
        {stamp}
      </div>
      <div className={s.body}>
        {showClip ? <Clip card={clipCard} /> : null}
        <div className={s.main}>
          {p ? <PromptBody p={p} frozen={mode === "frozen"} variant={variant} expanded={expanded} actions={actions} />
            : mode === "over" ? <OverBody /> : <AiBody ai={ai} />}
        </div>
      </div>
      {mode === "frozen" ? <FrozenContinue /> : null}
      {/* The list stays mounted while your own click animates (frozen): no remount, the active row and focus stay. */}
      {expanded && !compactLandscape && p && listMode && state && MAP_KINDS.has(p.kind) ? (
        <div className={s.listBox}><TargetList prompt={p} state={state} /></div>
      ) : null}
      {listOpen && p && listMode && state && (variant !== "compact" || compactLandscape) && MAP_KINDS.has(p.kind) ? (
        <Dossier
          tab={t("ui:slip.list")}
          title={<MessageText message={p.title} refs={false} />}
          width={520}
          onClose={() => store.setListOpen(false)}
        >
          <TargetList prompt={p} state={state} />
        </Dossier>
      ) : null}
    </section>
  );
}
