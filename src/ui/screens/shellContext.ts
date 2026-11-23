/**
 * What the shell offers the rest of the UI (owned by the shell workstream): the dialogs it hosts and
 * the moves between screens. Components read it with `useShell()`; outside the app (demos, markup
 * tests) it is null and they hide the controls that need it.
 */
import { createContext, useContext } from "react";
import type { Side } from "../../game/contract";

/** The coin of a random side on the start screen: "toss" while the controller draws, then the side drawn. */
export type CoinState = "toss" | Side | null;

/** The dossiers / sheets the shell hosts above both screens. */
export type ShellDialog = "settings" | "about" | "shortcuts" | "newGame" | "resign";

export interface ShellActions {
  /** Open one of the shell's dialogs (replacing any other). */
  open(dialog: ShellDialog): void;
  /** Leave the game for the start screen to pick a side for a new game. */
  toStart(): void;
  /** Reopen the game-over telex (after "Review board"). */
  showResult(): void;
  /** Changes with every new or resumed game (a React key for per-game components). */
  gameKey: number;
  /** Changes every time the telex is reopened. */
  telexKey: number;
}

export const ShellContext = createContext<ShellActions | null>(null);

export function useShell(): ShellActions | null {
  return useContext(ShellContext);
}
