/**
 * The play-mode stage (ui-spec §8.7, `final-playmode.png`): "How will you play it?" over a scrim in the
 * table, the card at 262×367 beside a 392 px panel: kicker, card name, meta (side glyph + whose card ·
 * effective Ops), the Event row (`E`), the Operations group (Influence `I` / Coup `C` / Realign `R`, one
 * shared opponent-event footer), the Space race row (`S`, next box from the engine layout), Grain Sales'
 * UN Intervention row and return button, and the footer (Esc · Back to hand = undo, "Undo is free until
 * a die is rolled"). Options not offered stay in place, disabled. Also the op-mode panel (deferred /
 * free Ops: the three Operations only, the source card named by the prompt's title).
 *
 * Compact: the same rows in a bottom sheet under the card image (rows ≥ 56 px); on short viewports (phones
 * held sideways, 200 % zoom) the card is a thumbnail beside its name and the rows 44 px, options first.
 * `PlayModeRows` is the panel alone, for the compact card sheet.
 */
import { useContext, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cardInfo } from "../../data";
import { engineLayout } from "../../engine/layout";
import type { Prompt, PromptOption, Side, Warning } from "../../game/contract";
import { warningMessage } from "../../game/messages";
import { message, type Message } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { sideArg } from "../../game/log";
import { CardFace } from "../cards/CardFace";
import { Button } from "../common/Button";
import { HoldButton } from "../common/HoldButton";
import { Icon, type IconName } from "../common/Icon";
import { useKey } from "../common/keymap";
import { MessageText } from "../common/MessageText";
import { Sheet } from "../common/Sheet";
import { SideGlyph } from "../common/SideGlyph";
import { useTouchUi } from "../common/touch";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { doneText } from "./doneText";
import { isDanger } from "./policy";
import type { PromptStore } from "./store";
import { usePromptActions, type PromptActions } from "./usePromptActions";
import { usePromptStore } from "./useStaging";
import s from "./PlayModeStage.module.css";

export interface PlayModeStageProps {
  prompt: Prompt;
}

/** Resolution ids of a play-mode prompt / OpMode ids of an op-mode prompt. */
const MODE = { event: 0, space: 1, influence: 2, coup: 3, realign: 4 } as const;
const OP_MODE = { influence: 0, coup: 1, realign: 2 } as const;

interface Row {
  key: "event" | "space" | "influence" | "coup" | "realign";
  option: PromptOption | null;
  letter: string;
  icon: IconName;
}

function rowsOf(prompt: Prompt): { event: Row | null; ops: Row[]; space: Row | null } {
  const op = prompt.kind === "op-mode";
  const find = (kind: "mode" | "op-mode", id: number) => prompt.options.find(o => o.kind === kind && o.id === id) ?? null;
  const ops: Row[] = op
    ? [
        { key: "influence", option: find("op-mode", OP_MODE.influence), letter: "I", icon: "influence" },
        { key: "coup", option: find("op-mode", OP_MODE.coup), letter: "C", icon: "coup" },
        { key: "realign", option: find("op-mode", OP_MODE.realign), letter: "R", icon: "realign" },
      ]
    : [
        { key: "influence", option: find("mode", MODE.influence), letter: "I", icon: "influence" },
        { key: "coup", option: find("mode", MODE.coup), letter: "C", icon: "coup" },
        { key: "realign", option: find("mode", MODE.realign), letter: "R", icon: "realign" },
      ];
  return {
    event: op ? null : { key: "event", option: find("mode", MODE.event), letter: "E", icon: "event" },
    ops,
    space: op ? null : { key: "space", option: find("mode", MODE.space), letter: "S", icon: "space" },
  };
}

/**
 * The Event row's words for an opponent's card: why the Event happens anyway and when (QA Q-036). Always the
 * ordinary play-mode explanation, never `prompt.detail`, which at Grain Sales' play-mode is Grain Sales' own
 * instruction (return the card, UN Intervention: rows of their own); the stage header keeps that.
 */
export function opponentEventDetail(side: Side): Message {
  return message("prompt:detail.playModeOpponent", { side: sideArg(side) });
}

/** The row letter of a key event ("KeyS" on non-Latin layouts, as the keymap matches it). */
export function letterOf(e: { key: string; code?: string }): string {
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) return k;
  const code = e.code ?? "";
  return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : k;
}

/** A mode button: paper row (or a hold button when choosing it certainly loses the game). */
function ModeButton({ row, actions, title, desc, wide, human, autoFocus, buttonRef }: {
  row: Row; actions: PromptActions; title: string; desc?: ReactNode; wide: boolean; human: Side; autoFocus?: boolean;
  /** The row's button (the letter keys move focus to the row they choose). */
  buttonRef?(el: HTMLButtonElement | null): void;
}) {
  const { render } = useI18n();
  const touch = useTouchUi();
  const option = row.option;
  const policy = option ? actions.policyOf(option) : null;
  const staged = !!option && actions.staged?.kind === "option" && actions.staged.id === option.idx;
  const fatal = (option?.warnings ?? []).filter(w => isDanger(w, human));
  const disabled = !option || !actions.interactive;
  const ref = useRef<HTMLButtonElement | null>(null);
  const setRef = (el: HTMLButtonElement | null) => { ref.current = el; buttonRef?.(el); };
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const body = (
    <>
      {wide ? <span className={s.ico} aria-hidden="true"><Icon name={row.icon} /></span> : null}
      <span className={s.text}>
        <span className={s.t}>{!wide ? <Icon name={row.icon} className={s.inlineIco} /> : null}{title}</span>
        {desc ? <span className={s.d}>{desc}</span> : null}
      </span>
      {/* No key caps on touch screens (§3.3, QA R-011); the letter stays in aria-keyshortcuts. */}
      {touch ? null : <kbd className={s.k} aria-hidden="true">{row.letter}</kbd>}
      {fatal.length ? (
        <span className={s.warn}>{fatal.map((w, i) => <span key={i}><MessageText message={warningMessage(w)} /></span>)}</span>
      ) : null}
    </>
  );
  if (policy?.commit === "hold" && option) {
    return (
      <HoldButton
        ref={setRef}
        className={[s.mode, wide ? s.wide : s.narrow, s.holdMode, touch ? s.noKey : ""].join(" ")}
        autoFocus={autoFocus}
        onPaper={false}
        disabled={disabled}
        label={fatal[0] ? render(warningMessage(fatal[0])) : title}
        onConfirm={() => actions.commit(option.idx)}
      >
        <span className={s.holdBody}>{body}</span>
      </HoldButton>
    );
  }
  return (
    <button
      ref={setRef}
      type="button"
      className={[s.mode, wide ? s.wide : s.narrow, staged ? s.staged : "", fatal.length ? s.danger : "", touch ? s.noKey : ""].filter(Boolean).join(" ")}
      data-mode={row.key}
      aria-disabled={disabled || undefined}
      aria-pressed={staged || undefined}
      aria-keyshortcuts={row.letter}
      onClick={() => { if (option && !disabled) actions.activateOption(option.idx); }}
    >
      {body}
    </button>
  );
}

/** The panel's rows (stage, compact sheet, card sheet). */
export function PlayModeRows({ prompt, compact = false, focusFirst = false }: { prompt: Prompt; compact?: boolean; focusFirst?: boolean }) {
  const { t, render, cardName } = useI18n();
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const vm = root.vm;
  const human: Side = vm.humanSide ?? "US";
  const card = prompt.pendingCard;
  const info = cardInfo(card);
  const opMode = prompt.kind === "op-mode";
  const effective = !opMode && card ? root.controller.effectiveOps(card) : null;
  const ops = opMode ? prompt.opsValue : effective ?? info?.ops ?? 0;
  const { event, ops: opsRows, space } = rowsOf(prompt);
  const opponent = !!info && info.side !== "NEUTRAL" && info.side !== human;
  const oppWarning: Warning | undefined = opsRows.flatMap(r => r.option?.warnings ?? []).find(w => w.code === "opponent-event");
  const un = prompt.options.find(o => o.kind === "un-intervention") ?? null;
  const done = prompt.done ? doneText(prompt) : null;
  const doneStaged = !!prompt.done && actions.staged?.kind === "option" && actions.staged.id === prompt.done.idx;
  const enabled = actions.interactive;
  const first = [event, ...opsRows, space].find(r => r?.option) ?? null;

  // Space race: the next box of the engine's track (space[me] + 1), when the layout is loaded.
  const state = shown?.state ?? vm.frame?.state ?? null;
  const at = state?.space?.[human] ?? 0;
  const box = engineLayout()?.space_boxes?.[at + 1];
  const spaceDesc = box ? t("ui_prompts:mode.spaceDesc", { from: at, to: at + 1, roll: box.max_roll }) : t("ui_prompts:mode.spaceDescPlain");

  const byLetter: Record<string, Row | null> = { e: event, i: opsRows[0]!, c: opsRows[1]!, r: opsRows[2]!, s: space };
  // The letters choose a row and move focus to it, so Enter ("confirm a staged choice") lands on the row
  // just staged (a second activation commits it), not on the auto-focused first row.
  const buttons = useRef(new Map<Row["key"], HTMLButtonElement>());
  const refFor = (key: Row["key"]) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };
  useKey(["e", "i", "c", "r", "s"], e => {
    const row = byLetter[letterOf(e)];
    if (!row?.option || !enabled) return false;
    buttons.current.get(row.key)?.focus({ preventScroll: true });
    actions.activateOption(row.option.idx);
  }, { enabled });
  const store = usePromptStore();
  useKey("Escape", () => {
    if (actions.cancel()) return;
    if (!vm.canUndo || !enabled) return false;
    backToHand(store, actions, prompt);
  }, { enabled });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([aria-disabled='true'])")];
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? Math.min(buttons.length - 1, i + 1) : Math.max(0, i - 1);
    buttons[next]!.focus();
  };

  return (
    <div className={[s.rows, compact ? s.compactRows : ""].join(" ")} data-rows="" onKeyDown={onKeyDown}>
      {event ? (
        <ModeButton
          row={event}
          actions={actions}
          buttonRef={refFor("event")}
          wide
          human={human}
          autoFocus={focusFirst && first === event}
          title={opponent ? t("ui:mode.eventFirst") : t("ui:mode.event")}
          desc={opponent ? <MessageText message={opponentEventDetail(info!.side as Side)} refs={false} /> : t("ui:mode.eventDesc")}
        />
      ) : null}
      <div className={s.opsGroup} role="group" aria-label={t("ui:mode.operations")}>
        <div className={s.gh}><span>{t("ui:mode.operations")}</span><span className="ts-num">{t("ui_prompts:ops", { count: ops })}</span></div>
        <div className={s.modeRow}>
          {opsRows.map(r => (
            <ModeButton key={r.key} row={r} actions={actions} buttonRef={refFor(r.key)} wide={false} human={human} autoFocus={focusFirst && first === r} title={t(`ui:mode.${r.key as "influence"}`)} />
          ))}
        </div>
        {oppWarning ? (
          <div className={s.gwarn}><span className={s.hz} aria-hidden="true" /><MessageText message={warningMessage(oppWarning)} /></div>
        ) : null}
      </div>
      {space ? (
        <ModeButton row={space} actions={actions} buttonRef={refFor("space")} wide human={human} autoFocus={focusFirst && first === space} title={t("ui:mode.space")} desc={spaceDesc} />
      ) : null}
      {un ? (
        <button type="button" className={`${s.mode} ${s.wide} ${s.unRow}`} aria-disabled={!enabled || undefined} onClick={() => enabled && actions.activateOption(un.idx)}>
          <span className={s.ico} aria-hidden="true"><Icon name="event" /></span>
          <span className={s.text}><span className={s.t}>{t("ui:mode.un", { card: cardName(32) })}</span></span>
          <span />
        </button>
      ) : null}
      {done && prompt.done ? (
        <Button variant="dark" pressed={doneStaged} kbd="D" disabled={!enabled} className={s.doneBtn} onClick={actions.done}>
          {render(done)}
        </Button>
      ) : null}
    </div>
  );
}

function Header({ prompt, labelId }: { prompt: Prompt; labelId: string }) {
  const { t, cardName } = useI18n();
  const root = useUiRoot();
  const human: Side = root.vm.humanSide ?? "US";
  const card = prompt.pendingCard;
  const info = cardInfo(card);
  const opMode = prompt.kind === "op-mode";
  const ops = opMode ? prompt.opsValue : root.controller.effectiveOps(card) ?? info?.ops ?? 0;
  const side: Side | null = info?.side === "US" || info?.side === "USSR" ? info.side : null;
  const meta = !info ? null : info.side === "NEUTRAL"
    ? t("ui_prompts:mode.meta.neutral", { count: ops })
    : info.side === human ? t("ui_prompts:mode.meta.own", { count: ops }) : t("ui_prompts:mode.meta.opponent", { count: ops });
  return (
    <>
      <h2 className={s.kicker} id={labelId}>{opMode ? <MessageText message={prompt.title} refs={false} /> : t("ui:mode.howTitle")}</h2>
      {card ? <div className={s.cardName}>{cardName(card)}</div> : null}
      {meta && !opMode ? (
        <div className={[s.meta, side === "US" ? s.metaUs : side === "USSR" ? s.metaUssr : ""].join(" ")}>
          {side ? <SideGlyph side={side} /> : null}{meta}
        </div>
      ) : null}
      {/* A play-mode of its own (Grain Sales' drawn card): its instruction heads the panel; the rows keep theirs. */}
      {!opMode && prompt.detail && prompt.title.key !== "prompt:title.playMode" ? (
        <p className={s.headDetail}><MessageText message={prompt.detail} refs={false} /></p>
      ) : null}
    </>
  );
}

/**
 * "Back to hand" (Esc or the footer button): undo the play, and ask the hand to focus the card that returns
 * to it once it is there (the stage that had focus disappears; QA Q-043 / round-2 polish).
 */
export function backToHand(store: Pick<PromptStore, "setFocusCard">, actions: Pick<PromptActions, "undo">, prompt: Prompt): void {
  if (prompt.kind === "play-mode" && prompt.pendingCard) store.setFocusCard(prompt.pendingCard);
  actions.undo();
}

function Footer({ prompt }: { prompt: Prompt }) {
  const { t } = useI18n();
  const actions = usePromptActions();
  const store = usePromptStore();
  const root = useUiRoot();
  if (!root.vm.canUndo) return <div className={s.foot}><span /><span>{t("ui:mode.undoFree")}</span></div>;
  return (
    <div className={s.foot}>
      <Button variant="dark" size="s" kbd="Esc" disabled={!actions.interactive} onClick={() => backToHand(store, actions, prompt)}>{t("ui:mode.back")}</Button>
      <span>{prompt.kind === "play-mode" ? t("ui:mode.undoFree") : null}</span>
    </div>
  );
}

export function PlayModeStage({ prompt }: PlayModeStageProps) {
  const root = useUiRoot();
  const actions = usePromptActions();
  const { t, cardName } = useI18n();
  const labelId = useId();
  if (prompt.kind !== "play-mode" && prompt.kind !== "op-mode") return null;
  const card = prompt.pendingCard;
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  if (compact) {
    // Sideways phones (and 200 % zoom): the sheet takes the whole map column (sheets open over it, §3.4) and
    // the card shrinks beside its name (CSS), so the options are on screen.
    const landscape = root.layout === "compact-landscape";
    return (
      <Sheet open height={landscape ? "full" : "80%"} label={card ? cardName(card) : t("ui:mode.howTitle")} onClose={() => { if (root.vm.canUndo) actions.undo(); }}>
        <div className={s.sheet}>
          <div className={s.sheetTop}>
            {card ? <CardFace card={card} width={148} eager className={s.sheetCard} /> : null}
            <div className={s.sheetHead}><Header prompt={prompt} labelId={labelId} /></div>
          </div>
          <PlayModeRows prompt={prompt} compact />
          <Footer prompt={prompt} />
        </div>
      </Sheet>
    );
  }
  return (
    <div className={s.stage} data-kind={prompt.kind}>
      <div className={s.playmode} role="dialog" aria-modal="false" aria-labelledby={labelId}>
        {card ? (
          <div className={s.bigWrap}>
            <CardFace card={card} width={262} eager className={s.big} />
          </div>
        ) : null}
        <div className={s.modes}>
          <Header prompt={prompt} labelId={labelId} />
          <PlayModeRows prompt={prompt} focusFirst />
          <Footer prompt={prompt} />
        </div>
      </div>
    </div>
  );
}
