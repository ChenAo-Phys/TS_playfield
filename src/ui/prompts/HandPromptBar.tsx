/**
 * The open hand prompt's question and its decline, for the compact hand drawer's header (QA Q-028). The
 * drawer opens by itself on card prompts (ui-spec §3.3) and covers the orders slip, so it repeats the
 * prompt's title and, when the prompt has `done` (Blockade's "Discard nothing — lose West Germany
 * influence", "Keep my hand"…), the done button with the slip's label and policy: under confirmFinal the
 * first press stages it (pressed, with the confirm words) and the second commits; a certain loss needs the
 * hold. D presses it inside the drawer (the slip's own D is behind the drawer's modal scope).
 *
 * Renders nothing unless the open prompt is answered from the hand.
 */
import { useContext } from "react";
import type { Side } from "../../game/contract";
import { warningMessage } from "../../game/messages";
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { HoldButton } from "../common/HoldButton";
import { useKey } from "../common/keymap";
import { MessageText } from "../common/MessageText";
import { ShownContext } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import { doneText } from "./doneText";
import { confirmLabel } from "./labels";
import { isDanger } from "./policy";
import { usePromptActions } from "./usePromptActions";
import { promptSurface } from "./wiring";
import s from "./HandPromptBar.module.css";

export function HandPromptBar({ className }: { className?: string }) {
  const i18n = useI18n();
  const { render } = i18n;
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const prompt = root.vm.prompt;
  const state = shown?.state ?? root.vm.frame?.state ?? null;
  const human: Side = root.vm.humanSide ?? state?.humanSide ?? "US";
  const onHand = !!prompt && !shown?.busy && promptSurface(prompt, state, human) === "hand";
  const done = onHand && prompt.done ? prompt.done : null;
  useKey("d", () => {
    if (!done || !actions.interactive) return false;
    actions.done();
  }, { enabled: !!done });
  if (!onHand || !prompt) return null;
  const label = done ? doneText(prompt) : null;
  const pol = done ? actions.policyOf(done) : null;
  const staged = !!done && actions.staged?.kind === "option" && actions.staged.id === done.idx;
  let button = null;
  if (done && label) {
    if (pol?.commit === "hold") {
      const fatal = (done.warnings ?? []).find(w => isDanger(w, human));
      const text = fatal ? render(warningMessage(fatal)) : render(label);
      button = (
        <HoldButton key={done.idx} onPaper={false} label={text} disabled={!actions.interactive} className={s.done} onConfirm={() => actions.commit(done.idx)}>
          {render(label)}
        </HoldButton>
      );
    } else {
      button = (
        <Button
          variant={staged ? "brass" : "dark"}
          size="touch"
          pressed={staged}
          kbd={staged ? "↵" : "D"}
          disabled={!actions.interactive}
          className={s.done}
          onClick={actions.done}
        >
          {staged ? confirmLabel(i18n, prompt, done, state, human) : render(label)}
        </Button>
      );
    }
  }
  return (
    <div className={[s.bar, className].filter(Boolean).join(" ")} data-hand-prompt="">
      <div className={s.title} title={render(prompt.title)}><MessageText message={prompt.title} refs={false} /></div>
      {button}
    </div>
  );
}
