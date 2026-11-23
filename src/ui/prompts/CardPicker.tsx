/**
 * The card picker / pile viewer (ui-spec §8.10): an 860 px dossier (compact: a full-screen sheet) tabbed
 * with the event's name, the prompt's title and detail, and a grid of cards (132×185; compact two
 * columns), each with its location tag ("Hand", "Discard pile", "Drawn", "US hand") from the redacted
 * `card_locations`. Hover zooms a card. One selection (brass ring); a second click (a double-click),
 * Enter or the primary ("Take OPEC ↵", "Discard …", "Give …") commits; `done` sits on the left.
 * Repeating pickers (Ask Not, Our Man in Tehran) count what was already discarded.
 *
 * Browse mode (`{ browse, onClose }`): the discard pile or the removed cards, read-only, sorted by id,
 * with side / era / Ops filters.
 */
import { useContext, useMemo, useState } from "react";
import { cardInfo } from "../../data";
import type { Prompt, PublicState, Side } from "../../game/contract";
import { useI18n, type I18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { Dossier } from "../common/Dossier";
import { MessageText } from "../common/MessageText";
import { useTouchUi } from "../common/touch";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { ConfirmButton, DialogKeys, DoneButton, useCardPeek } from "./dialogParts";
import { doneText } from "./doneText";
import { confirmLabel, REPEATING_PICKERS as REPEATING } from "./labels";
import { runCardPicks, useRun } from "./runTotals";
import { usePromptActions, type PromptActions } from "./usePromptActions";
import s from "./CardPicker.module.css";

export type CardPickerProps = { prompt: Prompt } | { browse: "discard" | "removed"; onClose(): void };


/** The location tag of a card for the human (ui-spec §8.10). */
export function locationTag(i18n: Pick<I18n, "t">, state: PublicState | null, card: number, human: Side): string | null {
  const { t } = i18n;
  const loc = state?.card_locations?.[String(card)] ?? "";
  if (!loc) return null;
  if (loc.startsWith(`HAND_${human}`)) return t("ui:pile.hand");
  if (loc.startsWith("HAND_")) return t("ui:pile.opponentHand", { side: t(`ui:side.${human === "US" ? "USSR" : "US"}`) });
  switch (loc) {
    case "DISCARD_PILE": return t("ui:pile.discard");
    case "REMOVED_FROM_GAME": return t("ui:pile.removed");
    case "PEEKED_TEMP": return t("ui_prompts:picker.drawn");
    case "DRAW_DECK": case "UNSEEN": return t("ui:pile.deck");
    case "ONGOING_EVENT": return t("ui:effects.title");
    default: return null;
  }
}

function PickCard({ card, tag, selected, onActivate, disabled, compact }: { card: number; tag: string | null; selected: boolean; onActivate?(): void; disabled: boolean; compact: boolean }) {
  const { cardName } = useI18n();
  const peek = useCardPeek(card);
  const width = compact ? 148 : 132;
  const body = (
    <>
      <CardFace card={card} width={width} className={s.face} />
      {tag ? <span className={s.tag}>{tag}</span> : null}
    </>
  );
  if (!onActivate) {
    return <div className={s.card} {...peek} role="listitem" aria-label={cardName(card)}>{body}</div>;
  }
  return (
    <button
      type="button"
      className={[s.card, s.pickable, selected ? s.selected : ""].filter(Boolean).join(" ")}
      aria-pressed={selected}
      aria-label={tag ? `${cardName(card)} · ${tag}` : cardName(card)}
      aria-disabled={disabled || undefined}
      {...peek}
      onClick={onActivate}
    >
      {body}
    </button>
  );
}

function PromptPicker({ prompt, actions }: { prompt: Prompt; actions: PromptActions }) {
  const i18n = useI18n();
  const { t, render, cardName } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const run = useRun();
  const state = shown?.state ?? root.vm.frame?.state ?? null;
  const human: Side = root.vm.humanSide ?? "US";
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const touch = useTouchUi();
  const staged = actions.stagedOption();
  const done = doneText(prompt);
  const card = prompt.resolvingCard;
  const picks = REPEATING.has(card) ? runCardPicks(run, state) : 0;
  const cards = prompt.options.filter(o => o.kind === "card");
  return (
    <Dossier
      tab={cardInfo(card) ? cardName(card) : t("ui_prompts:picker.tab")}
      title={<MessageText message={prompt.title} refs={false} />}
      width={860}
      onClose={root.vm.canUndo ? actions.undo : undefined}
      footer={(
        <>
          {done ? <DoneButton actions={actions} prompt={prompt} label={render(done)} /> : null}
          {picks > 0 ? <span className={s.count}>{t("ui_prompts:picker.count", { count: picks })}</span> : null}
          <span className={s.hint}>{t(touch ? "ui_prompts:touch.picker" : "ui_prompts:picker.hint")}</span>
          <ConfirmButton actions={actions} option={staged} label={staged ? confirmLabel(i18n, prompt, staged, state, human) : t("ui:action.confirm")} human={human} />
        </>
      )}
    >
      <DialogKeys actions={actions} />
      {prompt.detail ? <p className={s.detail}><MessageText message={prompt.detail} /></p> : null}
      <div className={[s.grid, compact ? s.compact : ""].join(" ")}>
        {cards.map(o => (
          <PickCard
            key={o.idx}
            card={o.id}
            tag={locationTag(i18n, state, o.id, human)}
            selected={actions.staged?.kind === "card" && actions.staged.id === o.id}
            disabled={!actions.interactive}
            compact={compact}
            onActivate={() => actions.activateCard(o.id)}
          />
        ))}
      </div>
    </Dossier>
  );
}

type SideFilter = "all" | "US" | "USSR" | "NEUTRAL";
type EraFilter = "all" | "early" | "mid" | "late";
type OpsFilter = "all" | 0 | 1 | 2 | 3 | 4;

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; text: string }[]; onChange(v: T): void }) {
  return (
    <span className={s.seg} role="group" aria-label={label}>
      <span className={s.segLabel}>{label}</span>
      {options.map(o => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.text}</button>
      ))}
    </span>
  );
}

function PileViewer({ pile, onClose }: { pile: "discard" | "removed"; onClose(): void }) {
  const { t } = useI18n();
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const state = shown?.state ?? root.vm.frame?.state ?? null;
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const [side, setSide] = useState<SideFilter>("all");
  const [era, setEra] = useState<EraFilter>("all");
  const [ops, setOps] = useState<OpsFilter>("all");
  const all = useMemo(() => [...(pile === "discard" ? state?.discard_pile ?? [] : state?.removed_pile ?? [])].sort((a, b) => a - b), [pile, state]);
  const cards = all.filter(id => {
    const c = cardInfo(id);
    if (!c) return false;
    if (side !== "all" && c.side !== side) return false;
    if (era !== "all" && c.era !== era) return false;
    if (ops !== "all" && c.ops !== ops) return false;
    return true;
  });
  const title = pile === "discard" ? t("ui:pile.discard") : t("ui:pile.removed");
  return (
    <Dossier tab={title} title={`${title} · ${t("ui:pile.cards", { count: all.length })}`} width={860} onClose={onClose}>
      <div className={s.filters}>
        <Seg<SideFilter> label={t("ui_prompts:picker.filter.side")} value={side} onChange={setSide} options={[
          { v: "all", text: t("ui_prompts:picker.filter.all") }, { v: "US", text: t("ui:side.US") },
          { v: "USSR", text: t("ui:side.USSR") }, { v: "NEUTRAL", text: t("ui_prompts:picker.filter.neutral") },
        ]} />
        <Seg<EraFilter> label={t("ui_prompts:picker.filter.era")} value={era} onChange={setEra} options={[
          { v: "all", text: t("ui_prompts:picker.filter.all") }, { v: "early", text: t("ui:track.era.early") },
          { v: "mid", text: t("ui:track.era.mid") }, { v: "late", text: t("ui:track.era.late") },
        ]} />
        <Seg<OpsFilter> label={t("ui_prompts:picker.filter.ops")} value={ops} onChange={setOps} options={[
          { v: "all", text: t("ui_prompts:picker.filter.all") },
          ...([0, 1, 2, 3, 4] as const).map(n => ({ v: n as OpsFilter, text: String(n) })),
        ]} />
      </div>
      {cards.length ? (
        <div className={[s.grid, compact ? s.compact : ""].join(" ")} role="list">
          {cards.map(id => <PickCard key={id} card={id} tag={null} selected={false} disabled compact={compact} />)}
        </div>
      ) : <p className={s.empty}>{t("ui:pile.empty")}</p>}
    </Dossier>
  );
}

export function CardPicker(props: CardPickerProps) {
  const actions = usePromptActions();
  if ("browse" in props) return <PileViewer pile={props.browse} onClose={props.onClose} />;
  if (props.prompt.kind !== "event-card") return null;
  return <PromptPicker prompt={props.prompt} actions={actions} />;
}
