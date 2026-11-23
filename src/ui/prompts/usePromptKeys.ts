/**
 * The prompt layer's global keys (ui-spec §12), bound while the slip is mounted:
 *   Enter       commit the staged selection (hold options: the slip's HoldButton holds Enter itself)
 *   Esc         cancel the staged selection; with nothing staged the key passes on (popover, dialog, back)
 *   Z, Mod+Z    undo the play (when the controller allows it)
 *   D           done / pass (with its policy: it stages under confirmFinal)
 *   T           the target list (map prompts; desktop, tablet and the compact-landscape side column — compact
 *               portrait shows it in the expanded sheet)
 * Every handler returns false when it has nothing to do, so the keymap passes the key on.
 */
import { useKey } from "../common/keymap";
import { useUiRoot } from "../state/context";
import { MAP_KINDS } from "./policy";
import type { PromptActions } from "./usePromptActions";
import { usePromptStore } from "./useStaging";

export function usePromptKeys(actions: PromptActions, enabled: boolean): void {
  const root = useUiRoot();
  const store = usePromptStore();
  // Compact portrait has the list in its expanded sheet (the grab); every other arrangement opens the dossier.
  const portrait = root.layout === "compact";
  const p = actions.prompt;
  useKey("Enter", () => (actions.confirm() ? undefined : false), { enabled });
  useKey("Escape", () => (actions.cancel() ? undefined : false), { enabled });
  useKey(["z", "Mod+z"], () => {
    if (!root.vm.canUndo || !actions.interactive) return false;
    actions.undo();
  }, { enabled });
  useKey("d", () => {
    if (!p?.done || !actions.interactive) return false;
    actions.done();
  }, { enabled });
  useKey("t", () => {
    if (!p || !MAP_KINDS.has(p.kind) || portrait) return false;
    store.setListOpen(!store.get().listOpen);
  }, { enabled });
}
