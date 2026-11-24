/**
 * Action-round instrument (ui-spec §5): 6 pips (turns 1–3) or 7, plus a dashed 8th when a side has
 * AR 8 (`maxActionRound`, src/game/rules). Each pip is split USSR half left · US half right, in play
 * order (the USSR moves first in every action round). Played halves in side tints,
 * the current half brass and lit, the readout "AR 3 · USSR (you)" (side word in side colour, "(you)" in
 * brass). Headline / setup phases: the readout names the phase. The current half floods in when an
 * `action-round` beat moves it (scale .6 → 1).
 */
import type { Ending, PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { SideGlyph } from "../common/SideGlyph";
import { arModel, type ArModel } from "./model";
import { fillSlots, slot } from "./slots";
import { Instrument } from "./Instrument";
import { useTrackView } from "./trackStore";
import s from "./Console.module.css";

export interface ArTrackProps {
  state: PublicState;
  humanSide: Side;
  // ── extensions ──
  /** The round and phasing side while an `action-round` beat animates (default: from `state`). */
  ar?: { ar: number; side: Side } | null;
  /** Readout only (compact console). */
  readoutOnly?: boolean;
  /** The readout's side as its word and its glyph (the tablet console's squeeze step 5 shows the glyph; R3-06). */
  glyph?: boolean;
  /** The game's ending once over: the readout shows the end of its turn, never the engine's counters past it (Q-031). */
  ending?: Pick<Ending, "turn"> | null;
  className?: string;
}

const NORTH_SEA_OIL = 86;

/** The readout as plain text ("AR 3 · USSR (you)", "Headline"…): names and tooltips. */
export function arReadoutText(t: ReturnType<typeof useI18n>["t"], model: ArModel, humanSide: Side): string {
  if (model.phase === "headline") return t("ui:track.headline");
  if (model.phase === "setup") return t("ui:track.setup");
  if (model.phase === "end") return t("log:session.endOfTurn", { turn: model.turn });
  if (!model.side || model.ar <= 0) return "";
  const side = t(`ui:side.${model.side}`);
  return model.side === humanSide
    ? t("ui_console:ar.readoutYou", { ar: model.ar, side, you: t("ui:tip.you") })
    : t("ui_console:ar.readout", { ar: model.ar, side });
}

/**
 * "AR 3 · USSR (you)" / "Headline" / "Setup" with the side word and "(you)" as styled nodes. `fit`
 * (compact console): a measured line (`data-fit`, see ./squeeze) whose text the instrument's name repeats.
 * `glyph` (default `fit`): the side as both its word and its glyph, for a console squeeze step that shows the glyph.
 */
export function ArReadout({ model, humanSide, className, fit = false, glyph = fit }: { model: ArModel; humanSide: Side; className?: string; fit?: boolean; glyph?: boolean }) {
  const { t } = useI18n();
  let body;
  if (model.phase === "headline") body = t("ui:track.headline");
  else if (model.phase === "setup") body = t("ui:track.setup");
  else if (model.phase === "end") body = t("log:session.endOfTurn", { turn: model.turn });
  else if (model.side && model.ar > 0) {
    const mine = model.side === humanSide;
    const text = mine
      ? t("ui_console:ar.readoutYou", { ar: model.ar, side: slot("side"), you: slot("you") })
      : t("ui_console:ar.readout", { ar: model.ar, side: slot("side") });
    const word = t(`ui:side.${model.side}`);
    body = fillSlots(text, {
      // The compact console's squeeze step 3 (the tablet's step 5) shows the glyph instead of the word (./squeeze).
      side: <span className={model.side === "US" ? s.sideUs : s.sideUssr}>
        {glyph ? <><span className={s.arWord}>{word}</span><SideGlyph side={model.side} className={s.arGlyph} /></> : word}
      </span>,
      you: <span className={s.you}>{t("ui:tip.you")}</span>,
    });
  } else body = " ";
  const fitAttrs = fit ? { "data-fit": "", "aria-hidden": true } : {};
  return <div className={[s.arRead, className].filter(Boolean).join(" ")} {...fitAttrs}>{body}</div>;
}

function ArTip({ state, model }: { state: PublicState; model: ArModel }) {
  const { t, cardName } = useI18n();
  const max = Math.max(model.max.US, model.max.USSR);
  const reasons = (["US", "USSR"] as const).filter(side => model.max[side] === 8).map(side => {
    const reason = side === "US" && state.flags?.includes("NORTH_SEA_OIL_ACTIVE") ? cardName(NORTH_SEA_OIL) : t("tracks:spaceBox.spaceStation");
    return <div key={side} className={s.tipRow}>{t("ui_console:ar.tip.ar8", { side: t(`ui:side.long.${side}`), reason })}</div>;
  });
  return (
    <>
      <div className={s.tipHead}>
        {model.phase === "ar" && model.ar > 0 ? t("ui_console:ar.tip.title", { ar: model.ar, max }) : t("ui_console:ar.tip.count", { max })}
      </div>
      {reasons}
    </>
  );
}

export function ArTrack({ state, humanSide, ar, readoutOnly = false, glyph = false, ending, className }: ArTrackProps) {
  const { t } = useI18n();
  const view = useTrackView();
  const model = arModel(state, ar ?? null, ending);
  const anim = view.anim.ar;
  const label = model.phase === "ar" && model.side && model.ar > 0
    ? t("ui_console:ar.aria", { ar: model.ar, side: t(`ui:side.long.${model.side}`) })
    : model.phase === "headline" ? t("ui:track.headline") : model.phase === "setup" ? t("ui:track.setup")
    : model.phase === "end" ? t("log:session.endOfTurn", { turn: model.turn }) : t("ui:track.actionRound");
  if (readoutOnly) return <ArReadout model={model} humanSide={humanSide} glyph={glyph} className={className} />;
  return (
    <Instrument label={label} anchor="ar" tip={<ArTip state={state} model={model} />} className={[s.ar, className].filter(Boolean).join(" ")} data={{ ar: model.ar, phase: model.phase }}>
      <div className={s.instLabel} aria-hidden="true">{t("ui:track.actionRound")}</div>
      <div className={s.arTrack} aria-hidden="true">
        {model.pips.map(p => (
          <span key={p.n} className={[s.arPip, p.optional ? s.opt : ""].filter(Boolean).join(" ")} data-n={p.n}>
            {(["USSR", "US"] as const).map(side => {
              const st = p[side];
              const flood = st === "now" && anim && !anim.reduced && anim.ms > 0;
              return (
                <b
                  key={side + (flood ? `:${anim.seq}` : "")}
                  className={[side === "US" ? s.halfUs : s.halfUssr, s[`half_${st}`], flood ? s.flood : ""].filter(Boolean).join(" ")}
                  style={flood ? { animationDuration: `${anim.ms}ms` } : undefined}
                />
              );
            })}
          </span>
        ))}
      </div>
      <ArReadout model={model} humanSide={humanSide} glyph={glyph} />
    </Instrument>
  );
}
