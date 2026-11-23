/**
 * Pencil marks and delta pills (ui-spec §4.4, §9.5), as a pure reducer over committed frames.
 *
 *  - `lastOpponent`: the influence changes the AI's decisions made since its last card play began
 *    (frames whose actor is the AI), per country. A new play (either side's) starts it afresh, so the
 *    pills of the AI's play stay up while you decide, and go away with the first choice of your next
 *    play. Undoing back to the start of your play brings them back.
 *  - `placedThisPlay`: influence you added to your own side in the current play (pencil marks);
 *    an undo frame takes its points back; cleared when a play starts or ends.
 *
 * Play identity: `Frame.playId` when the controller gives it (gap G2). Without it: a play starts with
 * the first acting frame after a turn / phase / action-round boundary (in the setup: when the actor
 * changes), or with a `card-played` / `headline-chosen` of a side other than the current play's.
 */
import type { Frame, GameEvent, Side } from "../../game/contract";

export type Deltas = Readonly<Record<number, { us: number; ussr: number }>>;

export interface LastPlayState {
  lastOpponent: Deltas;
  placedThisPlay: Readonly<Record<number, number>>;
  /** Whose play the latest frames belong to. */
  owner: Side | null;
  /** `Frame.playId` of the current play (null without one). */
  playId: number | null;
  /** A boundary (turn, phase, action round) was crossed: the next acting frame starts a play. */
  boundary: boolean;
  /** `lastOpponent` as it was when your play began (restored by an undo frame). */
  stash: Deltas | null;
}

export const EMPTY_LAST_PLAY: LastPlayState = {
  lastOpponent: {}, placedThisPlay: {}, owner: null, playId: null, boundary: true, stash: null,
};

const BOUNDARY = new Set<GameEvent["t"]>(["action-round", "turn-start", "phase"]);

function isLead(e: GameEvent): e is Extract<GameEvent, { t: "card-played" | "headline-chosen" }> {
  return e.t === "card-played" || e.t === "headline-chosen";
}

/** An undo frame: no actor, something changed, and no turn / phase / round / ending in it. */
export function isUndoFrame(frame: Frame): boolean {
  return frame.actor === null && frame.events.length > 0
    && !frame.events.some(e => BOUNDARY.has(e.t) || e.t === "game-over" || e.t === "deal");
}

export function reduceLastPlay(prev: LastPlayState, frame: Frame, humanSide: Side): LastPlayState {
  const ai: Side = humanSide === "US" ? "USSR" : "US";
  let { owner, playId, boundary, stash } = prev;
  let opp: Record<number, { us: number; ussr: number }> | null = null; // copy-on-write
  let placed: Record<number, number> | null = null;
  let oppOut: Deltas = prev.lastOpponent;
  let placedOut: Readonly<Record<number, number>> = prev.placedThisPlay;

  const startPlay = (side: Side) => {
    if (side === humanSide && owner !== humanSide) stash = oppOut;
    else if (side !== humanSide) stash = null;
    owner = side;
    boundary = false;
    oppOut = {};
    opp = null;
    placedOut = {};
    placed = null;
  };

  if (frame.playId !== undefined) {
    if (frame.playId !== playId) {
      const lead = frame.events.find(isLead);
      const side = frame.actor ?? (lead ? lead.side : null);
      if (side) startPlay(side);
      playId = frame.playId;
    }
  } else if (frame.actor && !frame.events.some(isLead)
    && (boundary || (frame.state.current_phase_name === "SETUP" && frame.actor !== owner))) {
    // After a boundary; and in the setup, where each side's placements are one play with no AR.
    startPlay(frame.actor);
  }

  const undo = isUndoFrame(frame);
  if (undo && owner === humanSide) {
    if (stash) oppOut = stash;
    opp = null;
    // Back at the start of the play: your next choice starts it again.
    boundary = true;
    playId = null;
  }

  for (const e of frame.events) {
    if (frame.playId === undefined && isLead(e) && (boundary || e.side !== owner)) startPlay(e.side);
    if (e.t !== "influence") continue;
    const d = e.to - e.from;
    if (frame.actor === ai) {
      opp ??= { ...oppOut };
      const cur = opp[e.country] ?? { us: 0, ussr: 0 };
      const next = e.side === "US" ? { us: cur.us + d, ussr: cur.ussr } : { us: cur.us, ussr: cur.ussr + d };
      if (next.us === 0 && next.ussr === 0) delete opp[e.country];
      else opp[e.country] = next;
      oppOut = opp;
    } else if ((frame.actor === humanSide || undo) && e.side === humanSide) {
      placed ??= { ...placedOut };
      const n = Math.max(0, (placed[e.country] ?? 0) + d);
      if (n > 0) placed[e.country] = n;
      else delete placed[e.country];
      placedOut = placed;
    }
  }

  if (frame.events.some(e => BOUNDARY.has(e.t))) {
    boundary = true;
    if (Object.keys(placedOut).length) placedOut = {};
  }

  return { lastOpponent: oppOut, placedThisPlay: placedOut, owner, playId, boundary, stash };
}
