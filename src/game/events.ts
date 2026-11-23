/**
 * The events a frame animates, derived from two REDACTED states (game/view.ts) and the step's
 * public dice/event records. Hidden information can only enter through the counts passed in
 * `draws` (how many cards each side drew, which is public; src/game/draws.ts counts them).
 *
 * Order inside a frame, cause before effect:
 *   pre (the step's own action: card played, headline chosen/revealed)
 *   → dice → scoring → influence → control → mil-ops → space → DEFCON → VP → effects
 *   → reshuffle / deal / hand-revealed / per-card moves → China Card → turn / phase / action round.
 * A turn-transition frame (the end-of-turn cleanup) orders its own: VP (mil-ops penalty) → mil-ops
 * reset → effects → DEFCON → turn start → reshuffle / deal / moves → China Card → phase → AR.
 * A `vp` event names its source (`vpSource`) when an Event moved the VP.
 *
 * Events that carry news even when nothing changes: every scoring-card play has its `scoring` event
 * (net 0 included); The Cambridge Five's Event always has a `hand-revealed` for the US listing the
 * US scoring cards now known (empty: the US holds none).
 * `deal` counts every card drawn into a hand, both sides (the AI's by count only). An AI card shown
 * in place (no AI draw in the span) is a `hand-revealed`, not a `card-moved` out of the unseen pile.
 */
import type { DieRollState, EventTrackState } from "../engine/types";
import type { GameEvent, PlayHow, PublicState, Side } from "./contract";
import { countryById, isScoringCard, otherSide } from "./rules";
import { inHandOf, UNSEEN } from "./view";

/** Flags that are bookkeeping rather than effects (the dice and the ending say them). */
const BOOKKEEPING = /^(SPACE_(US|USSR)_ATTEMPT_\d|DEFCON_SUICIDE_PROVOKED|CMC_SUICIDE_LOSS|EUROPE_CONTROL_WIN)$/;
const PHASES = new Set(["SETUP", "HEADLINE", "ACTION_ROUND", "GAME_OVER"]);
/** How a scoring card is played so that it scores (not discarded, given or passed). */
const SCORES = new Set(["scoring", "headline", "event"]);
/** The Cambridge Five: its Event reveals the US scoring cards; it cannot be played from turn 8 on. */
const CAMBRIDGE_FIVE = 104;

export interface FrameEventInput {
  before: PublicState;
  after: PublicState;
  /** The step's own events (card-played, headline-chosen, headline-reveal...), first. */
  pre?: GameEvent[];
  rolls?: DieRollState[];
  tracks?: EventTrackState[];
  /**
   * Cards each side drew in this span: from the deck, from the new era's cards (turns 4 and 8) or
   * from the reshuffled discard pile (draws.ts, counted on the unredacted states). Both sides.
   */
  draws?: Partial<Record<Side, number>>;
  reshuffled?: boolean;
  /** The end-of-turn cleanup frame. */
  transition?: boolean;
}

function sides(): Side[] {
  return ["US", "USSR"];
}

/** The influence and control changes from `b` to `a`, countries by id. */
export function influenceEvents(b: PublicState, a: PublicState): { influence: GameEvent[]; control: GameEvent[] } {
  const influence: GameEvent[] = [];
  const control: GameEvent[] = [];
  const ids = Object.values(a.countries).map(c => c.id).sort((x, y) => x - y);
  for (const id of ids) {
    const was = countryById(b, id);
    const now = countryById(a, id);
    if (!was || !now) continue;
    if (was.us_influence !== now.us_influence) influence.push({ t: "influence", country: id, side: "US", from: was.us_influence, to: now.us_influence });
    if (was.ussr_influence !== now.ussr_influence) influence.push({ t: "influence", country: id, side: "USSR", from: was.ussr_influence, to: now.ussr_influence });
    if (was.controlled_by !== now.controlled_by) control.push({ t: "control", country: id, from: was.controlled_by, to: now.controlled_by });
  }
  return { influence, control };
}

export function buildFrameEvents(input: FrameEventInput): GameEvent[] {
  const { before: b, after: a } = input;
  const out: GameEvent[] = [...(input.pre ?? [])];
  const transition = !!input.transition;

  for (const roll of input.rolls ?? []) out.push({ t: "roll", roll });
  out.push(...scoringEvents(input.pre ?? [], input.tracks ?? []));

  const { influence, control } = influenceEvents(b, a);
  const milops: GameEvent[] = [];
  for (const s of sides()) if (b.mil_ops[s] !== a.mil_ops[s]) milops.push({ t: "milops", side: s, from: b.mil_ops[s], to: a.mil_ops[s] });
  const space: GameEvent[] = [];
  for (const s of sides()) if (b.space[s] !== a.space[s]) space.push({ t: "space", side: s, from: b.space[s], to: a.space[s] });
  const defcon: GameEvent[] = b.defcon !== a.defcon ? [{ t: "defcon", from: b.defcon, to: a.defcon }] : [];
  const vp: GameEvent[] = [];
  if (b.victory_points !== a.victory_points) {
    const source = vpSource(input.tracks, input.rolls);
    vp.push(source ? { t: "vp", from: b.victory_points, to: a.victory_points, source } : { t: "vp", from: b.victory_points, to: a.victory_points });
  }
  const oldFlags = new Set(b.flags);
  const newFlags = new Set(a.flags);
  const effects: GameEvent[] = [];
  for (const f of [...oldFlags].filter(x => !newFlags.has(x) && !BOOKKEEPING.test(x)).sort()) effects.push({ t: "effect-off", flag: f });
  for (const f of [...newFlags].filter(x => !oldFlags.has(x) && !BOOKKEEPING.test(x)).sort()) effects.push({ t: "effect-on", flag: f });

  const cards = cardEvents(input);
  const china: GameEvent[] = b.china_card.holder !== a.china_card.holder || b.china_card.playable !== a.china_card.playable
    ? [{ t: "china-card", holder: a.china_card.holder, playable: a.china_card.playable }] : [];

  const turn: GameEvent[] = a.turn !== b.turn && a.current_phase_name !== "GAME_OVER" ? [{ t: "turn-start", turn: a.turn }] : [];
  const phaseName = a.current_phase_name ?? "";
  const phase: GameEvent[] = phaseName !== b.current_phase_name && PHASES.has(phaseName)
    ? [{ t: "phase", phase: phaseName as "SETUP" | "HEADLINE" | "ACTION_ROUND" | "GAME_OVER" }] : [];
  const arChanged = a.current_phase_name === "ACTION_ROUND"
    && (a.action_round !== b.action_round || a.phasing_player !== b.phasing_player || b.current_phase_name !== "ACTION_ROUND");
  const side = a.phasing_player === "US" || a.phasing_player === "USSR" ? a.phasing_player : null;
  const ar: GameEvent[] = arChanged && side ? [{ t: "action-round", ar: a.action_round, side }] : [];

  if (transition) {
    out.push(...vp, ...milops, ...influence, ...control, ...space, ...effects, ...defcon, ...turn, ...cards, ...china, ...phase, ...ar);
  } else {
    out.push(...influence, ...control, ...milops, ...space, ...defcon, ...vp, ...effects, ...cards, ...china, ...turn, ...phase, ...ar);
  }
  return out;
}

/**
 * One `scoring` event per scoring card that scored in this span: each scoring card played (for its
 * scoring, as a headline, as an Event) -- the engine records no track when the net is 0, so its VP
 * is then 0 -- and any other scoring card whose Event moved VP. VP = the card's own track.
 */
export function scoringEvents(pre: readonly GameEvent[], tracks: readonly EventTrackState[]): GameEvent[] {
  const out: GameEvent[] = [];
  const done = new Set<number>();
  const add = (card: number) => {
    if (done.has(card)) return;
    done.add(card);
    out.push({ t: "scoring", card, vp: tracks.reduce((sum, t) => sum + (t.card_id === card ? t.vp_delta : 0), 0) });
  };
  for (const e of pre) if (e.t === "card-played" && isScoringCard(e.card) && SCORES.has(e.how)) add(e.card);
  for (const t of tracks) if (isScoringCard(t.card_id)) add(t.card_id);
  return out;
}

/**
 * Where a frame's VP change comes from (contract gap G7): the Event (scoring cards included) whose
 * record moved VP the most in this span, and the country its die was rolled for (a war). Undefined
 * when no Event moved VP (Space Race, the military-operations penalty, final scoring).
 */
export function vpSource(tracks: readonly EventTrackState[] | undefined, rolls: readonly DieRollState[] | undefined)
  : { card?: number; country?: number } | undefined {
  let best: EventTrackState | undefined;
  for (const t of tracks ?? []) {
    if (t.vp_delta !== 0 && t.card_id > 0 && (!best || Math.abs(t.vp_delta) > Math.abs(best.vp_delta))) best = t;
  }
  if (!best) return undefined;
  const card = best.card_id;
  const roll = (rolls ?? []).find(r => r.card_id === card && typeof r.country_id === "number" && r.country_id >= 0 && r.country_id < 84);
  return roll ? { card, country: roll.country_id } : { card };
}

const HAND = /^HAND_(US|USSR)_(KNOWN|UNKNOWN)$/;

function cardEvents(input: FrameEventInput): GameEvent[] {
  const { before: b, after: a } = input;
  const out: GameEvent[] = [];
  const ai = otherSide(b.humanSide);
  if (input.reshuffled) out.push({ t: "reshuffle" });
  for (const s of sides()) {
    const n = input.draws?.[s] ?? 0;
    if (n > 0) out.push({ t: "deal", side: s, count: n });
  }
  const revealed: Record<Side, number[]> = { US: [], USSR: [] };
  const moves: GameEvent[] = [];
  const bl = b.card_locations ?? {};
  const al = a.card_locations ?? {};
  for (let id = 1; id <= 110; id++) {
    const from = bl[String(id)];
    const to = al[String(id)];
    if (!from || !to || from === to) continue;
    const hf = HAND.exec(from);
    const ht = HAND.exec(to);
    if (ht && ht[2] === "KNOWN") {
      // Known in place: one hand's unknown card became known to the other side -- no move.
      if (hf && hf[1] === ht[1] && hf[2] === "UNKNOWN") { revealed[ht[1] as Side].push(id); continue; }
      if (from === UNSEEN && ht[1] === ai) {
        revealed[ai].push(id);
        // With no AI draw in the span, an unseen card that turns up known in the AI hand was
        // already there: a reveal (CIA Created, Lone Gunman, Aldrich Ames, a reshuffle), no move.
        // With a draw, it may have just been drawn face up: a move out of the unseen pile too
        // (the deal shows it), since which of them were held before is not for the human to know.
        if (!(input.draws?.[ai] ?? 0)) continue;
      }
    }
    moves.push({ t: "card-moved", card: id, from, to });
  }
  // The Cambridge Five shows the US scoring cards, or that there are none.
  const cambridge = (input.pre ?? []).some(e => e.t === "card-played" && e.card === CAMBRIDGE_FIVE && (e.how === "event" || e.how === "headline"))
    && b.turn < 8;
  if (cambridge) {
    for (let id = 1; id <= 110; id++) {
      if (isScoringCard(id) && al[String(id)] === "HAND_US_KNOWN" && !revealed.US.includes(id)) revealed.US.push(id);
    }
    revealed.US.sort((x, y) => x - y);
  }
  for (const s of sides()) if (revealed[s].length || (s === "US" && cambridge)) out.push({ t: "hand-revealed", side: s, cards: revealed[s] });
  out.push(...moves);
  return out;
}

/** How a side plays a card of its own (the card in play), as opposed to giving or discarding one. */
const PLAYED: ReadonlySet<PlayHow> = new Set<PlayHow>(["event", "space", "influence", "coup", "realign", "scoring", "headline"]);

/**
 * `card-moved.fromHand` (contract.ts): marks each move of a card out of the AI's hidden hand -- `from` is UNSEEN and
 * `rawLocations` (the UNREDACTED card locations the frame's diff starts from) have it in the AI's hand -- to a public
 * place outside that hand: the Five Year Plan / Terrorism random discards, the Grain Sales / Missile Envy takes, the
 * AI's own discards (Blockade, LADC, Ask Not...). The rules say whose hand the card left, so the origin is public.
 * Not marked: the AI's own played card -- one in `own` (the caller's: the AI's cards in play as the step starts, its
 * headline, its own card choice), one the AI plays in this frame (a card-played event of the AI other than a give or a
 * discard), its headline revealed here -- since the reveal dock shows it, except when it lands in the human's hand
 * (the AI's Missile Envy, exchanged after the human's give has cleared the dock). Mutates `events`; returns how many
 * it marked.
 */
export function markHandOrigins(events: GameEvent[], rawLocations: Readonly<Record<string, string>>, ai: Side, own: Iterable<number> = []): number {
  const human = otherSide(ai);
  const mine = new Set<number>(own);
  for (const e of events) {
    if (e.t === "card-played" && e.side === ai && PLAYED.has(e.how)) mine.add(e.card);
    if (e.t === "headline-reveal") mine.add(ai === "US" ? e.us : e.ussr);
  }
  let n = 0;
  for (const e of events) {
    if (e.t !== "card-moved" || e.from !== UNSEEN || e.to === UNSEEN || e.to.startsWith(`HAND_${ai}_`)) continue;
    if (!inHandOf(rawLocations[String(e.card)], ai)) continue;
    if (mine.has(e.card) && !e.to.startsWith(`HAND_${human}_`)) continue;
    e.fromHand = ai;
    n++;
  }
  return n;
}
