// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * What an event's branch choice (CHOOSE_BRANCH) means, for the prompt's buttons and the log (port of
 * DS game/branches.ts). The engine asks for a branch in six events; the branch is a number whose
 * meaning is the event's: Chernobyl's is a region, Summit's and How I Learned to Stop Worrying's the
 * DEFCON level to set.
 */
import type { GameState } from "../engine/types";
import { engineLayout, namesByValue, titleCase } from "../engine/layout";
import { Message, MessageArg, message } from "../i18n";

export interface BranchMeta {
  title: Message;
  desc: Message;
  /** The log's verb phrase: "<player> <verb> (<event>)". */
  verb: Message;
}

/** A region by the engine's `Region` value under its English name ("Middle East"). */
export function regionEnglishName(region: number): string | undefined {
  const L = engineLayout();
  const name = L ? namesByValue(L.regions)[region] : undefined;
  return name === undefined ? undefined : titleCase(name);
}

function branch(id: string, params?: Record<string, MessageArg>): BranchMeta {
  const m = (part: string) => message(`branches:${id}.${part}` as Message["key"], params);
  return { title: m("title"), desc: m("desc"), verb: m("verb") };
}

const FIXED: Record<string, Record<number, string>> = {
  WARSAW_PACT_FORMED: { 0: "warsawPact.remove", 1: "warsawPact.add" },
  OLYMPIC_GAMES: { 0: "olympics.participate", 1: "olympics.boycott" },
  WARGAMES: { 0: "wargames.end", 1: "wargames.continue" },
};

function defconLevel(level: number, current: number): BranchMeta {
  const how = level === current ? "unchanged" : level > current ? "improve" : "degrade";
  const meta = branch(`defcon.${how}`, { level, current });
  return level === 1 ? { ...meta, desc: message("branches:defcon.endsGame") } : meta;
}

/** The ts::card_ids name of `card` among those the engine exports, or "". */
export function cardKey(card: number): string {
  const L = engineLayout();
  if (!L || !card) return "";
  for (const [k, v] of Object.entries(L.card_ids)) if (v === card) return k;
  return "";
}

/** The meaning of branch `branchIndex` of `card`'s event in `state`, or null for an event it does not know. */
export function branchMeta(card: number, branchIndex: number, state: Pick<GameState, "defcon">): BranchMeta | null {
  const key = cardKey(card);
  if (!key) return null;
  if (key === "CHERNOBYL") {
    const english = regionEnglishName(branchIndex);
    const region: MessageArg = english !== undefined ? { region: english }
      : message("branches:chernobyl.regionNumber", { n: branchIndex });
    return branch("chernobyl", { region });
  }
  if (key === "SUMMIT" || key === "HOW_I_LEARNED_TO_STOP_WORRYING") return defconLevel(branchIndex, state.defcon);
  const id = FIXED[key]?.[branchIndex];
  return id ? branch(id) : null;
}
