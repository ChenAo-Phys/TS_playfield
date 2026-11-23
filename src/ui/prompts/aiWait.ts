/**
 * The AI's wait, softened (QA round 1, owner decision OD-2: the AI stays at full strength everywhere, so on
 * a slow device a decision can take tens of seconds). The slip's "still thinking" note counts the seconds
 * ("Still thinking · 14 s", once a second, from 8 s on), and once per page session, when a decision passes
 * 20 s, the note goes on with one sentence: at full strength the AI can take up to a minute per move on this
 * device (`ui_prompts:ai.stillThinkingSlow`) where the slip has room for it; where it has not (tablet slips),
 * the same sentence comes once as a toast (`ui_prompts:ai.slowHint`).
 *
 * No hidden information: the clock is the prompt store's `aiSince`, which starts whenever the controller says
 * the AI thinks, for every AI decision alike (the padded forced answers too), so the count shows nothing the
 * "thinking" state does not.
 */
import { useEffect, useState } from "react";
import { usePromptStore, usePromptUi } from "./useStaging";

/** The note appears after this many seconds of one decision (as before: "Still thinking"). */
export const STILL_THINKING_S = 8;
/** The one-time hint appears when a decision passes this many seconds. */
export const SLOW_HINT_S = 20;
/** How long the toast form of the hint stays (ms). */
export const SLOW_HINT_TOAST_MS = 9000;
/** sessionStorage flag: the hint was shown in this page session (a reload keeps it). */
export const SLOW_HINT_KEY = "ts-playfield.aiSlowHint";

/** Whole seconds since `since` (0 when not thinking). */
export function elapsedSeconds(since: number | null, now: number): number {
  if (since === null) return 0;
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** Ms until the next whole second of the count (so the number ticks on the second, not drifting). */
export function msToNextSecond(since: number, now: number): number {
  const into = (now - since) % 1000;
  return into < 0 ? 1000 : 1000 - into;
}

// ── The one-time hint (module state: one per page; sessionStorage survives a reload) ──────────────
let hintDecision: number | null = null;
let hintSeen: boolean | null = null;

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function seen(): boolean {
  if (hintSeen === null) {
    try { hintSeen = storage()?.getItem(SLOW_HINT_KEY) === "1"; } catch { hintSeen = false; }
  }
  return hintSeen;
}

/** May the decision that began at `since` show the hint? Yes if it already does, or none has in this session. */
export function slowHintAvailable(since: number): boolean {
  return hintDecision === since || !seen();
}

/** Has the decision that began at `since` claimed the hint? */
export function slowHintClaimedBy(since: number): boolean {
  return hintDecision === since;
}

/** The decision that began at `since` shows the hint (it keeps it until it ends; no later decision gets it). */
export function claimSlowHint(since: number): void {
  if (hintDecision === since) return;
  hintDecision = since;
  hintSeen = true;
  try { storage()?.setItem(SLOW_HINT_KEY, "1"); } catch { /* private mode: once per page load then */ }
}

/** Tests: forget that the hint was shown. */
export function resetSlowHint(): void {
  hintDecision = null;
  hintSeen = null;
  try { storage()?.removeItem(SLOW_HINT_KEY); } catch { /* ignore */ }
}

export interface AiWait {
  /** When the current AI decision began (the store's clock), null while the AI is not thinking. */
  since: number | null;
  /** Seconds into the current AI decision (0 when the AI is not thinking). */
  seconds: number;
  /** Show the "still thinking" note (from `STILL_THINKING_S`). */
  still: boolean;
  /** The one-time hint may follow the count now (past `SLOW_HINT_S`, not yet shown by another decision). */
  hintDue: boolean;
}

/** The current AI decision's wait, re-rendering once a second while the AI thinks. */
export function useAiWait(): AiWait {
  const store = usePromptStore();
  const since = usePromptUi("aiSince");
  const [now, setNow] = useState(() => store.now());
  useEffect(() => {
    if (since === null) return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = store.now();
      setNow(t);
      id = setTimeout(tick, msToNextSecond(since, t) + 5);
    };
    tick();
    return () => clearTimeout(id);
  }, [since, store]);
  const seconds = since === null ? 0 : elapsedSeconds(since, Math.max(now, since));
  return {
    since,
    seconds,
    still: since !== null && seconds >= STILL_THINKING_S,
    hintDue: since !== null && seconds >= SLOW_HINT_S && slowHintAvailable(since),
  };
}
