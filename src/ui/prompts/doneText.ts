/**
 * The CONFIRM_DONE button's label (ui-spec §8.4). `doneLabel` (src/game/messages) already returns the
 * per-context words (`prompt:doneFor.*`: "Skip action round 8", "Stop realigning", "Keep my hand"…) and
 * otherwise the meaning's ("Pass", "Done", "Decline", "Return it", "Skip"); the UI adds nothing.
 */
import type { Prompt } from "../../game/contract";
import { doneLabel } from "../../game/messages";
import type { Message } from "../../i18n";

export function doneText(prompt: Prompt | null): Message | null {
  return prompt ? doneLabel(prompt) : null;
}
