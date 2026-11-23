/**
 * The branch dossier (ui-spec §8.8): Warsaw Pact, Olympic Games, Wargames. A folder tabbed with the
 * event's name around a 640 px paper panel: the event card (92 px) and the prompt's title and detail,
 * then one large tile per option with `branchMeta` (src/game/branches) title and description. Tiles
 * stage (brass ring); "Confirm ↵", Enter or a second click on the tile commits; a certain loss (Wargames'
 * "end the game") wears hazard stripes and needs the hold. A tile whose option ends the game says so on the
 * tile: a loss in the hazard line, a win (e.g. an Olympic boycott at DEFCON 2 in the AI's round) in a
 * caution line (§8.3), without stripes or hold. Esc cancels the selection, then goes back
 * (undo) when the controller allows it. Compact: a full-screen sheet (the Dossier does it).
 */
import { useContext } from "react";
import type { Prompt, Side } from "../../game/contract";
import { branchMeta } from "../../game/branches";
import { warningMessage } from "../../game/messages";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { Dossier } from "../common/Dossier";
import { Icon } from "../common/Icon";
import { MessageText } from "../common/MessageText";
import { useTouchUi } from "../common/touch";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { ConfirmButton, DialogKeys, DoneButton } from "./dialogParts";
import { doneText } from "./doneText";
import { confirmLabel } from "./labels";
import { isDanger, isHumanWin } from "./policy";
import { usePromptActions } from "./usePromptActions";
import s from "./dossiers.module.css";

export function BranchDossier({ prompt }: { prompt: Prompt }) {
  const i18n = useI18n();
  const { t, render, cardName } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const touch = useTouchUi();
  if (prompt.kind !== "branch") return null;
  const state = shown?.state ?? root.vm.frame?.state ?? null;
  const human: Side = root.vm.humanSide ?? "US";
  const card = prompt.resolvingCard;
  const staged = actions.stagedOption();
  const done = doneText(prompt);
  const tiles = prompt.options.filter(o => o.kind === "branch");
  return (
    <Dossier
      tab={card ? cardName(card) : t("ui_prompts:branch.tab")}
      title={<MessageText message={prompt.title} refs={false} />}
      width={640}
      onClose={root.vm.canUndo ? actions.undo : undefined}
      footer={(
        <>
          {done ? <DoneButton actions={actions} prompt={prompt} label={render(done)} /> : null}
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
      <div className={s.tiles} data-count={tiles.length}>
        {tiles.map(o => {
          const meta = state ? branchMeta(card, o.id, state) : null;
          const fatal = (o.warnings ?? []).filter(w => isDanger(w, human));
          const wins = fatal.length ? [] : (o.warnings ?? []).filter(w => isHumanWin(w, human));
          const hold = actions.policyOf(o).commit === "hold";
          const selected = actions.staged?.kind === "option" && actions.staged.id === o.idx;
          return (
            <button
              key={o.idx}
              type="button"
              className={[s.tile, selected ? s.selected : "", hold || fatal.length ? s.hazard : "", wins.length ? s.cautionTile : ""].filter(Boolean).join(" ")}
              aria-pressed={selected}
              aria-disabled={!actions.interactive || undefined}
              onClick={() => actions.activateOption(o.idx)}
            >
              <span className={s.tileIco} aria-hidden="true">{hold || fatal.length ? <span className={s.hz} /> : <Icon name="event" />}</span>
              <span className={s.tileTitle}>{meta ? render(meta.title) : t("ui_prompts:branch.option", { n: o.id + 1 })}</span>
              {meta ? <span className={s.tileDesc}>{render(meta.desc)}</span> : null}
              {fatal.map((w, i) => <span key={i} className={s.tileWarn}><MessageText message={warningMessage(w)} /></span>)}
              {wins.map((w, i) => <span key={`w${i}`} className={s.tileCaution}><MessageText message={warningMessage(w)} /></span>)}
            </button>
          );
        })}
      </div>
    </Dossier>
  );
}
