/**
 * Full-sentence i18n keys with React nodes inside (ui-spec §1: never concatenate translated
 * fragments). A parameter that should become an element is passed as a private-use slot marker, and
 * the translated string is split around the markers afterwards:
 *
 *   fillSlots(t("ui:track.vpLead", { side: slot("side"), vp: 2 }), { side: <b className="ussr">USSR</b> })
 *
 * The pseudo-language's ⟦…⟧ marks stay around the whole sentence.
 */
import { createElement, Fragment, type ReactNode } from "react";

const OPEN = "";
const CLOSE = "";
const SLOT = new RegExp(`${OPEN}([^${CLOSE}]*)${CLOSE}`, "g");

/** The marker for slot `name` (pass it as the i18n parameter). */
export function slot(name: string): string {
  return `${OPEN}${name}${CLOSE}`;
}

/** The translated string split into text and the slot nodes. */
export function fillSlots(text: string, slots: Readonly<Record<string, ReactNode>>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  SLOT.lastIndex = 0;
  for (let m = SLOT.exec(text); m; m = SLOT.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(createElement(Fragment, { key: `s${i++}` }, slots[m[1]!] ?? null));
    last = SLOT.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The plain text of a slotted string (slots replaced by their text). */
export function slotText(text: string, slots: Readonly<Record<string, string>>): string {
  SLOT.lastIndex = 0;
  return text.replace(SLOT, (_, name: string) => slots[name] ?? "");
}

/** Wrap the first occurrence of `n` (as written) in a node: "<b>5</b> cards in hand". */
export function emphasizeNumber(text: string, n: number, wrap: (s: string) => ReactNode): ReactNode[] {
  const s = String(n);
  const at = text.indexOf(s);
  if (at < 0) return [text];
  return [text.slice(0, at), createElement(Fragment, { key: "n" }, wrap(s)), text.slice(at + s.length)].filter(x => x !== "");
}
