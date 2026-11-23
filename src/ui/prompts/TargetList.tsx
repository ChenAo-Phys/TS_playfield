/**
 * The target list (ui-spec §8.13): the accessible alternative to the map for map prompts. The
 * prompt's countries grouped by region in board order, one 52 px row each: name · stability ·
 * battleground chip · US / USSR influence · "2 Ops" tag · the action ("+1", "Coup", "Roll", "Select";
 * the confirm words once staged). Activating a row runs the same policy as the map. A listbox with
 * `aria-activedescendant`: arrows / Home / End move, Enter or Space activates, Esc passes on. The active
 * row is kept by country id in the prompt store across list updates and remounts (after a placement it
 * stays on the country just used, so a second Enter adds there again). Each row's accessible name says
 * it all: "Finland, stability 4, US 0, USSR 1 — place 1 influence".
 * Desktop opens it with T or the slip's "List" link (in a dossier); compact shows it in the expanded sheet.
 */
import { useEffect, useId, useMemo, type KeyboardEvent } from "react";
import { COUNTRIES } from "../../data";
import type { Prompt, PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { useUiRoot } from "../state/context";
import { cost2Targets, countryFacts, deciderOf } from "./costHint";
import { verbFor } from "./eventVerbs";
import { confirmLabel, slotName } from "./labels";
import { groupByRegion } from "./regions";
import { usePromptActions } from "./usePromptActions";
import { usePromptStore, usePromptUi } from "./useStaging";
import s from "./TargetList.module.css";

/** Every country in board order (the target list's order). */
const BOARD_ORDER: readonly number[] = groupByRegion(Object.keys(COUNTRIES).map(Number)).flatMap(g => g.ids);

/**
 * The list's active row (pure): the remembered country while it is still a target; else the staged one;
 * else, when the remembered one left the list (capped, coup done), the next target after it in board
 * order (the last row past the end); else the first row.
 */
export function activeRow(order: readonly number[], remembered: number | null, staged: number | null): number | null {
  if (!order.length) return null;
  if (remembered !== null && order.includes(remembered)) return remembered;
  if (staged !== null && order.includes(staged)) return staged;
  if (remembered !== null) {
    const at = BOARD_ORDER.indexOf(remembered);
    if (at >= 0) return order.find(id => BOARD_ORDER.indexOf(id) > at) ?? order[order.length - 1]!;
  }
  return order[0]!;
}

export interface TargetListProps {
  prompt: Prompt;
  state: PublicState;
}

export function TargetList({ prompt, state }: TargetListProps) {
  const i18n = useI18n();
  const { t, countryName } = i18n;
  const root = useUiRoot();
  const actions = usePromptActions();
  const human: Side = root.vm.humanSide ?? state.humanSide;
  const decider = deciderOf(state, human);
  const groups = useMemo(() => groupByRegion(prompt.countries), [prompt.countries]);
  const order = useMemo(() => groups.flatMap(g => g.ids), [groups]);
  const cost2 = useMemo(() => cost2Targets(prompt, state), [prompt, state]);
  const verb = verbFor(prompt, decider);
  const baseId = useId();
  const store = usePromptStore();
  const remembered = usePromptUi("listActive");
  const staged = actions.staged?.kind === "country" ? actions.staged.id : null;
  const active = activeRow(order, remembered, staged);
  const setActive = (id: number | null) => store.setListActive(id);
  // Remember the row shown, so it survives the list's next update (a placement) and a remount.
  useEffect(() => { if (active !== remembered) store.setListActive(active); }, [active, remembered, store]);
  const rowId = (id: number) => `${baseId}-c${id}`;

  /** What activating the row does, in words (its accessible name's tail). */
  const actionSaid = (id: number): string => {
    if (staged === id) return actionWord(id);
    switch (verb) {
      case "add": return t(cost2.has(id) ? "ui_prompts:list.say.add2" : "ui_prompts:list.say.add");
      case "remove": return t("ui_prompts:list.say.remove");
      case "coup": return t("ui_prompts:list.say.coup");
      case "realign": return t("ui_prompts:list.say.realign");
      default: return t("ui_prompts:list.say.select");
    }
  };
  const rowName = (id: number, f: ReturnType<typeof countryFacts>, battleground: boolean): string => t(battleground ? "ui_prompts:list.rowBg" : "ui_prompts:list.row", {
    country: countryName(id),
    stability: f.stability,
    us: t("ui_prompts:list.influence", { side: t("ui:side.US"), n: f.us }),
    ussr: t("ui_prompts:list.influence", { side: t("ui:side.USSR"), n: f.ussr }),
    action: actionSaid(id),
  });

  const actionWord = (id: number): string => {
    if (staged === id) {
      const option = prompt.options.find(o => o.kind === "country" && o.id === id);
      if (option) return confirmLabel(i18n, prompt, option, state, human);
    }
    switch (verb) {
      case "add": return t("ui_prompts:list.action.add");
      case "remove": return t("ui_prompts:list.action.remove");
      case "coup": return t("ui:mode.coup");
      case "realign": return t("ui_prompts:list.action.roll");
      default: return t("ui_prompts:list.action.select");
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!order.length) return;
    const i = active === null ? -1 : order.indexOf(active);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = order[Math.min(order.length - 1, i + 1)]!;
    else if (e.key === "ArrowUp") next = order[Math.max(0, i - 1)]!;
    else if (e.key === "Home") next = order[0]!;
    else if (e.key === "End") next = order[order.length - 1]!;
    else if ((e.key === "Enter" || e.key === " ") && active !== null) {
      e.preventDefault();
      actions.activateCountry(active);
      return;
    } else return;
    e.preventDefault();
    setActive(next);
    actions.hoverCountry(next);
    if (typeof document !== "undefined") document.getElementById(rowId(next))?.scrollIntoView({ block: "nearest" });
  };

  if (!order.length) return <div className={s.empty}>{t("ui_prompts:list.empty")}</div>;
  return (
    <div
      className={s.list}
      role="listbox"
      tabIndex={0}
      aria-label={t("ui_prompts:list.title")}
      aria-activedescendant={active !== null ? rowId(active) : undefined}
      onKeyDown={onKey}
      onBlur={() => actions.hoverCountry(null)}
    >
      {groups.map(g => (
        <div key={g.slot} role="group" aria-label={slotName(i18n, g.slot)} className={s.group}>
          <div className={s.groupHead} aria-hidden="true">{slotName(i18n, g.slot)}</div>
          {g.ids.map(id => {
            const f = countryFacts(state, id);
            const info = COUNTRIES[id];
            return (
              <div
                key={id}
                id={rowId(id)}
                role="option"
                aria-label={rowName(id, f, !!info?.battleground)}
                aria-selected={staged === id}
                className={[s.row, active === id ? s.active : "", staged === id ? s.staged : ""].filter(Boolean).join(" ")}
                aria-disabled={!actions.interactive || undefined}
                onClick={() => { setActive(id); actions.activateCountry(id); }}
                onPointerEnter={() => actions.hoverCountry(id)}
                onPointerLeave={() => actions.hoverCountry(null)}
              >
                <span className={s.name}>{countryName(id)}</span>
                <span className={s.stab} title={t("ui:tip.stabilityRegion", { region: slotName(i18n, g.slot) })}>{f.stability}</span>
                {info?.battleground ? <span className={s.bg}>{t("ui:tip.battleground")}</span> : <span className={s.bgNone} />}
                <span className={`${s.inf} ${s.us} ${f.ctrl === "US" ? s.ctrl : ""}`} aria-label={t("ui_prompts:list.influence", { side: t("ui:side.US"), n: f.us })}>{f.us}</span>
                <span className={`${s.inf} ${s.ussr} ${f.ctrl === "USSR" ? s.ctrl : ""}`} aria-label={t("ui_prompts:list.influence", { side: t("ui:side.USSR"), n: f.ussr })}>{f.ussr}</span>
                {cost2.has(id) ? <span className={s.cost}>{t("ui:map.cost2")}</span> : <span className={s.costNone} />}
                <span className={s.action} aria-hidden="true">{actionWord(id)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
