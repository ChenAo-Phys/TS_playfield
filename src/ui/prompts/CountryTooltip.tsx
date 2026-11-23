/**
 * The country tooltip's content during a prompt (ui-spec §8.12), given to the map as `renderTooltip`
 * (the map positions the paper popover). Header (name + battleground chip), stability · region, the
 * US and USSR rows (your side marked), then by prompt kind:
 *   add      "+1 → USSR 0 → 1" (+ "→ control"), "Costs 2 Ops (US-controlled)" on opponent control
 *   remove   "−1 → US 2 → 1"
 *   coup     "3 Ops + ⚀ − 2×2", "Success 4/6", the odds strip (six dice, net below), battleground
 *            DEFCON line, mil ops (`CoupOdds.milOps`, R-002); `controller.coupOdds` asked on hover (debounced, cached per prompt)
 *   realign  the outcome odds (`realignOdds`), adjacent controlled countries, superpower adjacency
 *   target   the prompt's own line (wars and other targeted events)
 * then the option's warnings and a key hint. Non-targets and idle hovers get the plain rows.
 */
import type { ReactNode } from "react";
import { COUNTRIES } from "../../data";
import type { CoupOdds, Prompt, PublicState, RealignOdds, Side } from "../../game/contract";
import { warningMessage } from "../../game/messages";
import { EVENT_COUP_CARDS } from "../../game/prompt";
import { useI18n } from "../../i18n/react";
import { Die } from "../common/Die";
import { MINUS } from "../common/format";
import { useTouchUi } from "../common/touch";
import { MessageText } from "../common/MessageText";
import { SideGlyph } from "../common/SideGlyph";
import { useUiRoot } from "../state/context";
import { cost2Targets, countryFacts, deciderOf, realignFacts, wouldTakeControl } from "./costHint";
import { effectOf, removeAmount, verbFor } from "./eventVerbs";
import { slotName } from "./labels";
import { MAP_KINDS, policyFor } from "./policy";
import { usePreview } from "./previews";
import { slotOfCountry } from "./regions";
import { runPlaced, useRun } from "./runTotals";
import s from "./CountryTooltip.module.css";

export interface CountryTooltipProps {
  country: number;
  prompt: Prompt | null;
  state: PublicState;
  humanSide: Side;
}

const other = (side: Side): Side => (side === "US" ? "USSR" : "US");

/**
 * The coup's numbers as the engine rolls them (QA Q-038): the Ops the coup is credited with (`CoupOdds.ops`:
 * the China Card's +1 only in Asia, Vietnam Revolts' only in SE Asia) and the roll modifier
 * (`CoupOdds.modifier`: SALT −1, Latin American Death Squads ±1). Both are optional contract fields: without
 * them the prompt's Ops and no modifier (the formula may then disagree with the odds strip, which is the
 * engine's own).
 */
export function coupNumbers(odds: CoupOdds | null | undefined, prompt: Pick<Prompt, "opsValue">): { ops: number; modifier: number } {
  const o = odds as (CoupOdds & { ops?: number; modifier?: number }) | null | undefined;
  return {
    ops: typeof o?.ops === "number" ? o.ops : prompt.opsValue,
    modifier: typeof o?.modifier === "number" ? o.modifier : 0,
  };
}

/**
 * The tooltip's "Mil ops +N" (R-002): the military operations the engine credits for this coup (`CoupOdds.milOps`:
 * 0 for an Event's own free coup -- Junta, Tear Down This Wall, Ortega -- Che's Ops included). Without the optional
 * field, the old rule: the coup's Ops on a coup-target prompt, none for event coups. 0 means no line.
 */
export function coupMilOps(odds: CoupOdds | null | undefined, prompt: Pick<Prompt, "kind">, ops: number): number {
  if (typeof odds?.milOps === "number") return Math.max(0, odds.milOps);
  return ops > 0 && prompt.kind === "coup-target" ? ops : 0;
}

function CoupSection({ odds, prompt, country, state }: { odds: CoupOdds | null | undefined; prompt: Prompt; country: number; state: PublicState }) {
  const { t } = useI18n();
  const f = countryFacts(state, country);
  const { ops, modifier } = coupNumbers(odds, prompt);
  const k = odds ? odds.faces.filter(x => x.success).length : null;
  const milOps = coupMilOps(odds, prompt, ops);
  const nuclearSubs = state.flags?.includes("NUCLEAR_SUBS_ACTIVE") && deciderOf(state) === "US";
  const formula = ops <= 0 ? null : modifier
    ? t("ui_prompts:tip.coupFormulaMod", { count: ops, stab: f.stability, mod: modifier > 0 ? `+ ${modifier}` : `${MINUS} ${-modifier}` })
    : t("ui_prompts:tip.coupFormula", { count: ops, stab: f.stability });
  return (
    <div className={s.section}>
      <div className={s.row}>
        <span className={s.formula}>{formula}</span>
        {k !== null ? <b className={s.odds}>{t("ui:tip.success", { k })}</b> : null}
      </div>
      <div className={s.strip} role="img" aria-label={t("ui_prompts:tip.oddsLabel")}>
        {odds ? odds.faces.map(face => (
          <span key={face.die} className={s.face}>
            <Die face={face.die} side="neutral" numeral size={26} result={face.endsGame ? "boom" : face.success ? "ok" : "fail"} />
            <small className="ts-num">{face.success ? `+${face.netDelta}` : "+0"}</small>
          </span>
        )) : Array.from({ length: 6 }, (_, i) => <span key={i} className={`${s.face} ${s.pending}`} />)}
      </div>
      {f.battleground && !nuclearSubs ? (
        <div className={s.hazardLine}>
          <span className={s.hz} aria-hidden="true" />
          {t("ui:tip.battlegroundDefcon", { from: state.defcon, to: Math.max(1, state.defcon - 1) })}
        </div>
      ) : null}
      {milOps > 0 ? <div className={s.row}>{t("ui:tip.milops", { n: milOps })}</div> : null}
    </div>
  );
}

function RealignSection({ odds, country, state }: { odds: RealignOdds | null | undefined; country: number; state: PublicState }) {
  const { t } = useI18n();
  const facts = realignFacts(state, country);
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <div className={s.section}>
      {odds ? (
        <div className={s.outcomes} role="list" aria-label={t("ui_prompts:tip.realignOdds")}>
          {odds.outcomes.filter(o => o.p > 0).map((o, i) => (
            <div key={i} className={s.outcome} role="listitem">
              <span className={o.side === "US" ? s.us : o.side === "USSR" ? s.ussr : s.none}>
                {o.side === "NONE" || o.amount === 0
                  ? t("ui_prompts:tip.realignNone")
                  : <><SideGlyph side={o.side} />{t("ui_prompts:tip.realignOutcome", { side: t(`ui:side.${o.side}`), n: o.amount })}</>}
              </span>
              <span className={s.bar} aria-hidden="true"><i style={{ width: pct(o.p) }} /></span>
              <b className="ts-num">{pct(o.p)}</b>
            </div>
          ))}
        </div>
      ) : null}
      <div className={s.fact}>{t("ui_prompts:tip.adjacentControlled", { us: facts.us, ussr: facts.ussr })}</div>
      {facts.superpower ? <div className={s.fact}>{t("ui_prompts:tip.superpower", { side: t(`ui:side.long.${facts.superpower}`) })}</div> : null}
    </div>
  );
}

/**
 * The tooltip's last line: how to act on the country, with the mouse / keys or by touch (QA Q-032): "Click
 * place · Right-click details" / "Tap to place · Hold for details"; `commit` null for a non-target.
 */
export function tooltipKeysKey(commit: "instant" | "stage" | "hold" | null, coup: boolean, verb: string | null, touch: boolean) {
  if (commit === null) return touch ? "ui_prompts:touch.inspect" : "ui:tip.keys.inspect";
  if (commit === "hold") return touch ? "ui_prompts:touch.hold" : "ui_prompts:tip.keys.hold";
  if (commit === "stage") {
    if (coup) return touch ? "ui_prompts:touch.coup" : "ui:tip.keys.coup";
    return touch ? "ui_prompts:touch.select" : "ui_prompts:tip.keys.select";
  }
  if (verb === "add") return touch ? "ui_prompts:touch.place" : "ui:tip.keys.place";
  return touch ? "ui_prompts:touch.choose" : "ui_prompts:tip.keys.choose";
}

export function CountryTooltip({ country, prompt, state, humanSide }: CountryTooltipProps) {
  const i18n = useI18n();
  const { t, countryName } = i18n;
  const root = useUiRoot();
  const run = useRun();
  const touch = useTouchUi();
  const info = COUNTRIES[country];
  const f = countryFacts(state, country);
  const mapPrompt = prompt && MAP_KINDS.has(prompt.kind) ? prompt : null;
  const option = mapPrompt?.options.find(o => o.kind === "country" && o.id === country) ?? null;
  const decider = deciderOf(state, humanSide);
  const verb = option && mapPrompt ? verbFor(mapPrompt, decider) : null;
  const coup = !!option && mapPrompt !== null && (mapPrompt.kind === "coup-target" || (mapPrompt.kind === "event-target" && EVENT_COUP_CARDS.has(mapPrompt.resolvingCard)));
  const realign = !!option && mapPrompt?.kind === "realign-target";
  const coupOdds = usePreview(root.controller, mapPrompt, coup ? "coup" : null, country);
  const realignOdds = usePreview(root.controller, mapPrompt, realign ? "realign" : null, country);
  if (!info) return null;
  const region = slotName(i18n, slotOfCountry(country));

  const sideRow = (side: Side) => {
    const n = side === "US" ? f.us : f.ussr;
    return (
      <div className={s.row} key={side}>
        <span className={`${s.label} ${side === "US" ? s.us : s.ussr}`}>
          <SideGlyph side={side} />
          {t(`ui:side.${side}`)}
          {side === humanSide ? ` ${t("ui:tip.you")}` : ""}
        </span>
        <b className="ts-num">
          {n}
          {f.ctrl === side ? ` · ${t("ui:tip.control")}` : ""}
        </b>
      </div>
    );
  };

  let section: ReactNode = null;
  if (option && mapPrompt) {
    if (coup) section = <CoupSection odds={coupOdds} prompt={mapPrompt} country={country} state={state} />;
    else if (realign) section = <RealignSection odds={realignOdds} country={country} state={state} />;
    else if (verb === "add") {
      const e = effectOf(mapPrompt, decider);
      const side = e && e.verb === "add" ? e.side : decider;
      const from = side === "US" ? f.us : f.ussr;
      const cost2 = cost2Targets(mapPrompt, state).has(country);
      const cap = mapPrompt.maxPerCountry > 0 && mapPrompt.kind === "event-target" ? runPlaced(run, state, side)[country] ?? 0 : null;
      section = (
        <div className={s.section}>
          <div className={s.delta}>
            {t("ui_prompts:tip.add", { n: 1, side: t(`ui:side.${side}`), from, to: from + 1 })}
            {wouldTakeControl(f, side) ? <span className={side === "US" ? s.toCtrlUs : s.toCtrlUssr}>{t("ui:map.toControl")}</span> : null}
          </div>
          {cost2 ? <div className={s.cost}>{t("ui:tip.costs2", { side: t(`ui:side.${other(decider)}`) })}</div> : null}
          {cap !== null ? <div className={s.fact}>{t("ui_prompts:tip.capped", { placed: cap, max: mapPrompt.maxPerCountry })}</div> : null}
        </div>
      );
    } else if (verb === "remove") {
      const e = effectOf(mapPrompt, decider);
      const side = e && e.verb === "remove" ? e.side : other(decider);
      const from = side === "US" ? f.us : f.ussr;
      const n = removeAmount(mapPrompt, from);
      section = (
        <div className={s.section}>
          <div className={s.delta}>{t("ui_prompts:tip.remove", { n, side: t(`ui:side.${side}`), from, to: from - n })}</div>
        </div>
      );
    } else {
      section = (
        <div className={s.section}>
          <div className={s.verbLine}><MessageText message={mapPrompt.detail ?? mapPrompt.title} refs={false} /></div>
        </div>
      );
    }
  }

  const warnings = option?.warnings?.filter(w => w.code !== "opponent-event") ?? [];
  const commit = option && mapPrompt
    ? policyFor(mapPrompt, option, { settings: root.settings, cost2: cost2Targets(mapPrompt, state), humanSide }).commit
    : null;
  const keys = t(tooltipKeysKey(commit, coup, verb, touch));

  return (
    <div className={s.tip} data-country={country} data-verb={verb ?? undefined}>
      <div className={s.head}>
        <span className={s.name}>{coup && mapPrompt?.kind === "coup-target" ? t("ui_prompts:tip.coupHead", { country: countryName(country) }) : countryName(country)}</span>
        {info.battleground ? <span className={s.bg}>{t("ui:tip.battleground")}</span> : null}
      </div>
      <div className={s.row}>
        <span className={s.label}>{t("ui:tip.stabilityRegion", { region })}</span>
        <b className="ts-num">{f.stability}</b>
      </div>
      {sideRow("US")}
      {sideRow("USSR")}
      {section}
      {warnings.length ? (
        <div className={s.warnings}>
          {warnings.map((w, i) => (
            <div key={i} className={s.hazardLine}><span className={s.hz} aria-hidden="true" /><MessageText message={warningMessage(w)} /></div>
          ))}
        </div>
      ) : null}
      <div className={s.keys}>{keys}</div>
    </div>
  );
}
