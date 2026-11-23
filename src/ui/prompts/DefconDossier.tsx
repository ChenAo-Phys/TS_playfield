/**
 * The DEFCON dossier (ui-spec §8.9; `situation-room-defcon-choice.png`): Summit and How I Learned to
 * Stop Worrying. Five lamp tiles 5 → 1: the level's numeral in its DEFCON colour and a caption
 * (current / improve / degrade, or what level 1's own warnings say: "ends the game — you lose" /
 * "— you win"); levels not offered are disabled. A tile stages; a losing level 1 is hazard-striped and
 * needs the hold, a winning one stages with a caution ring and the warning's words (§8.2, §8.3: the
 * phasing player takes the DEFCON-1 loss, so Summit / How I Learned in the AI's round can win it). Under
 * the tiles, the restriction of the selected level (`ui:track.defconRule.N`).
 */
import { useContext } from "react";
import type { Prompt, Side, Warning } from "../../game/contract";
import { warningMessage } from "../../game/messages";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { Dossier } from "../common/Dossier";
import { MessageText } from "../common/MessageText";
import { useTouchUi } from "../common/touch";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { ConfirmButton, DialogKeys } from "./dialogParts";
import { confirmLabel } from "./labels";
import { gameEndOf, isDanger, isHumanWin } from "./policy";
import { usePromptActions } from "./usePromptActions";
import s from "./dossiers.module.css";

const LEVELS = [5, 4, 3, 2, 1] as const;

export type DefconCaption = "current" | "improve" | "degrade" | "ends" | "endsWin";

/**
 * The caption of a level tile (display only): relative to the current DEFCON, except where the option's
 * own warnings name the end of the game ("ends" = you lose, "endsWin" = you win). Without such a warning
 * no tile claims to end the game.
 */
export function defconCaption(level: number, current: number, warnings?: readonly Warning[], humanSide?: Side): DefconCaption {
  const end = gameEndOf(warnings, humanSide);
  if (end === "lose") return "ends";
  if (end === "win") return "endsWin";
  if (level === current) return "current";
  return level > current ? "improve" : "degrade";
}

export function DefconDossier({ prompt }: { prompt: Prompt }) {
  const i18n = useI18n();
  const { t, cardName } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const touch = useTouchUi();
  if (prompt.kind !== "defcon-level") return null;
  const state = shown?.state ?? root.vm.frame?.state ?? null;
  const human: Side = root.vm.humanSide ?? "US";
  const current = state?.defcon ?? 5;
  const card = prompt.resolvingCard;
  const staged = actions.stagedOption();
  const shownLevel = staged?.kind === "defcon" ? staged.id : current;
  // A staged game end you win says so where the choice is made (§8.3 caution).
  const stagedWin = (staged?.warnings ?? []).find(w => isHumanWin(w, human));
  return (
    <Dossier
      tab={card ? cardName(card) : t("ui:track.defcon")}
      title={<MessageText message={prompt.title} refs={false} />}
      width={640}
      onClose={root.vm.canUndo ? actions.undo : undefined}
      footer={(
        <>
          <span className={s.footHint}>{t(touch ? "ui_prompts:touch.dialog" : "ui_prompts:dialog.hint")}</span>
          <ConfirmButton actions={actions} option={staged} label={staged ? confirmLabel(i18n, prompt, staged, state, human) : t("ui:action.confirm")} human={human} />
        </>
      )}
    >
      <DialogKeys actions={actions} />
      <div className={s.header}>
        {card ? <CardFace card={card} width={92} eager className={s.headCard} /> : null}
        {prompt.detail ? <p className={s.detail}><MessageText message={prompt.detail} /></p> : null}
      </div>
      <div className={s.lamps} role="group" aria-label={t("ui:track.defcon")}>
        {LEVELS.map(level => {
          const option = prompt.options.find(o => o.kind === "defcon" && o.id === level);
          const caption = defconCaption(level, current, option?.warnings, human);
          const fatal = (option?.warnings ?? []).filter(w => isDanger(w, human));
          const win = (option?.warnings ?? []).filter(w => isHumanWin(w, human));
          const hold = !!option && actions.policyOf(option).commit === "hold";
          const selected = !!option && actions.staged?.kind === "option" && actions.staged.id === option.idx;
          const said = fatal[0] ?? win[0];
          return (
            <button
              key={level}
              type="button"
              className={[
                s.lamp, s[`l${level}`], selected ? s.selected : "", caption === "current" ? s.current : "",
                hold || fatal.length ? s.hazard : "", !fatal.length && win.length ? s.win : "",
              ].filter(Boolean).join(" ")}
              disabled={!option}
              aria-pressed={selected}
              aria-disabled={!actions.interactive || undefined}
              aria-label={`${t("ui:track.defconLevel", { level })} · ${t(`ui_prompts:defcon.${caption}`)}`}
              title={said ? i18n.render(warningMessage(said)) : undefined}
              onClick={() => { if (option) actions.activateOption(option.idx); }}
            >
              <span className={`${s.lampNum} ts-num`}>{level}</span>
              <span className={s.lampCap}>{t(`ui_prompts:defcon.${caption}`)}</span>
            </button>
          );
        })}
      </div>
      <p className={s.rule}>{t(`ui:track.defconRule.${shownLevel as 1}`)}</p>
      {stagedWin ? <p className={s.caution} role="status"><MessageText message={warningMessage(stagedWin)} /></p> : null}
    </Dossier>
  );
}
