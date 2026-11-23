/**
 * Pieces the prompt dossiers share: the keys inside a dialog's scope (Enter commits the staged choice,
 * Esc cancels it before the dossier closes), the confirm button (primary ↵, or a hold button for a
 * certain loss), and a card peek on hover (the shared card zoom).
 */
import { useContext, useRef, type ReactNode } from "react";
import type { Prompt, PromptOption, Side } from "../../game/contract";
import { warningMessage } from "../../game/messages";
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { HoldButton } from "../common/HoldButton";
import { useHoverIntent } from "../common/hooks";
import { useKey } from "../common/keymap";
import { OverlayContext, useUiRoot } from "../state/context";
import { isDanger } from "./policy";
import type { PromptActions } from "./usePromptActions";

/** Enter / Esc inside a dossier (register as a child of the Dossier, i.e. inside its key scope). */
export function DialogKeys({ actions }: { actions: PromptActions }) {
  useKey("Enter", () => (actions.confirm() ? undefined : false));
  useKey("Escape", () => (actions.cancel() ? undefined : false));
  return null;
}

/**
 * The dossier's primary: "Confirm ↵" (disabled until something is staged) or the hold button, which takes
 * focus when it appears (a hold option was just selected) so a held Enter reaches it.
 */
export function ConfirmButton({ actions, option, label, human }: { actions: PromptActions; option: PromptOption | null; label: string; human: Side }) {
  const { t, render } = useI18n();
  const pol = option ? actions.policyOf(option) : null;
  if (option && pol?.commit === "hold") {
    const fatal = (option.warnings ?? []).find(w => isDanger(w, human));
    return (
      <HoldButton key={option.idx} autoFocus globalEnter label={fatal ? render(warningMessage(fatal)) : label} disabled={!actions.interactive} onConfirm={() => actions.commit(option.idx)}>
        {label}
      </HoldButton>
    );
  }
  return (
    <Button variant="primary" onPaper kbd="↵" disabled={!option || !actions.interactive} onClick={() => actions.confirm()}>
      {option ? label : t("ui:action.confirm")}
    </Button>
  );
}

/** The done button of a dossier footer (ghost, left), pressed while staged. */
export function DoneButton({ actions, prompt, label }: { actions: PromptActions; prompt: Prompt; label: ReactNode }) {
  const staged = !!prompt.done && actions.staged?.kind === "option" && actions.staged.id === prompt.done.idx;
  return (
    <Button variant="ghost" onPaper kbd="D" pressed={staged} disabled={!actions.interactive} onClick={actions.done}>
      {label}
    </Button>
  );
}

/** Hover a card for 250 ms to open the shared zoom on it; leaving closes a zoom it opened. */
export function useCardPeek(card: number) {
  const root = useUiRoot();
  const overlays = useContext(OverlayContext);
  const opened = useRef<Element | null>(null);
  const zoom = useRef(overlays);
  zoom.current = overlays;
  const peek = useHoverIntent(250, {
    onStart: el => { opened.current = el; root.zoomCard(card, el); },
    onEnd: () => {
      const o = zoom.current;
      if (o?.zoom && o.zoom.from === opened.current) o.closeZoom();
      opened.current = null;
    },
  });
  return peek.bind;
}
