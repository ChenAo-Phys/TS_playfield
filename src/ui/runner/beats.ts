/**
 * Frame events → beat groups (ui-spec §9.4). Pure; the runner plays the groups in order and the
 * beats of one group together (country and card-moved beats staggered by the runner, by their index).
 *
 * Order in an ordinary frame (src/game/events.ts already emits cause before effect; this sorts by the
 * same ranks so a frame from anywhere, e.g. an undo, plays the same way):
 *   1 card-played / headline-chosen / headline-reveal (each its own group, in event order)
 *   2 each roll · 3 each scoring
 *   4 one group of country beats: influence + control merged per country, in board order
 *   5 one group of track beats: mil ops, space, DEFCON, VP
 *   6 one group of effect-on / effect-off
 *   7 reshuffle → deal → hand-revealed → card-moved (one group each)
 *   8 china-card · 9 turn-start → phase → action-round (each its own group) · 10 game-over
 * End-of-turn frames (they carry `turn-start`) keep the events module's own order (VP → mil ops → …
 * → turn start → deal → China → phase → AR); only the country beats are merged and consecutive beats
 * of one kind grouped.
 *
 * Beats that would never animate are left out (§9.6, so no group waits on them):
 *  - card moves to or from UNAVAILABLE (cards entering the game: the turn banner's era stamp says it);
 *  - with a reshuffle in the frame, DISCARD_PILE → UNSEEN (the reshuffle beat shows it);
 *  - with a deal to a side in the frame, moves from the deck (UNSEEN / DISCARD_PILE) into that
 *    side's hand (the deal beat flies them; FlightLayer reads their ids from `ctx.frame.events`);
 *  - with a headline-chosen in the frame, moves into HEADLINE_COMMITTED (that beat shows it).
 *  - with a headline-reveal in the frame, the cancelled headline's move to a pile (Defectors): the headline papers
 *    stamp it CANCELLED and slide it into the discard pile (`cancelledHeadlineCard`; QA round 2 R-004).
 *  - phase banners other than HEADLINE (§9.4: SETUP / ACTION_ROUND / GAME_OVER show none).
 */
import { COUNTRIES } from "../../data";
import type { Frame, GameEvent, PublicState, Side } from "../../game/contract";
import { TIMING } from "../theme";
import type { Beat } from "../ui-contract";

type Cat =
  | "lead" | "roll" | "scoring" | "country" | "track" | "effect" | "reshuffle" | "deal" | "revealed" | "moved"
  | "china" | "turn" | "phase" | "ar" | "over";

const RANK: Record<Cat, number> = {
  lead: 10, roll: 20, scoring: 30, country: 40, track: 50, effect: 60, reshuffle: 70, deal: 71, revealed: 72, moved: 73,
  china: 80, turn: 90, phase: 91, ar: 92, over: 100,
};
/** Categories whose consecutive beats share one group (the others: one group per beat). */
const GROUPED = new Set<Cat>(["country", "track", "effect", "deal", "revealed", "moved"]);

/** Board order of the countries (ui-spec §9.4 stagger): Europe, Middle East, Asia, SE Asia, Africa,
 *  Central America, South America; inside a region top to bottom, left to right on the board. */
const REGION_RANK: Record<number, number> = { 0: 0, 2: 1, 1: 2, 3: 4, 4: 5, 5: 6 };
const BOARD_RANK: ReadonlyMap<number, number> = (() => {
  const key = (c: (typeof COUNTRIES)[number]) => {
    const sea = c.subregions.includes("SOUTHEAST_ASIA") ? 1 : 0;
    const [l, t, r, b] = c.layout.board;
    return [(REGION_RANK[c.region as number] ?? 9) + sea, Math.round((t + b) / 2 / 60), (l + r) / 2] as const;
  };
  const sorted = [...COUNTRIES].sort((p, q) => {
    const a = key(p), b = key(q);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return new Map(sorted.map((c, i) => [c.id, i]));
})();

export function boardRank(country: number): number {
  return BOARD_RANK.get(country) ?? 1000 + country;
}

const HAND = /^HAND_(US|USSR)_/;

const PILES: ReadonlySet<string> = new Set(["DISCARD_PILE", "REMOVED_FROM_GAME"]);

/**
 * The headline a frame with the headline reveal cancels (Defectors), 0 when none: a revealed headline card that
 * leaves for a pile without being played. The headline papers show its move (CANCELLED stamp, slide into the
 * discard pile), whether it left the AI's hidden hand (UNSEEN), a known AI card or the human's hand. The runner's
 * twin of the papers' own rule, src/ui/stage/model.ts `cancelledHeadline` (tests/ui/runner/beats.test.ts checks
 * that they agree).
 */
export function cancelledHeadlineCard(frame: Frame): number {
  const reveal = frame.events.find((x): x is Extract<GameEvent, { t: "headline-reveal" }> => x.t === "headline-reveal");
  if (!reveal) return 0;
  for (const card of [reveal.us, reveal.ussr]) {
    if (!card) continue;
    const played = frame.events.some(x => x.t === "card-played" && x.card === card);
    const left = frame.events.some(x => x.t === "card-moved" && x.card === card && PILES.has(x.to));
    if (left && !played) return card;
  }
  return 0;
}

/** The card-moved events no flight would show (see the header). */
export function silentMove(e: Extract<GameEvent, { t: "card-moved" }>, frame: Frame): boolean {
  if (e.from === "UNAVAILABLE" || e.to === "UNAVAILABLE") return true;
  if (e.to === "HEADLINE_COMMITTED" && frame.events.some(x => x.t === "headline-chosen")) return true;
  if (e.card !== 0 && PILES.has(e.to) && e.card === cancelledHeadlineCard(frame)) return true;
  const reshuffled = frame.events.some(x => x.t === "reshuffle");
  if (reshuffled && e.from === "DISCARD_PILE" && e.to === "UNSEEN") return true;
  const toHand = HAND.exec(e.to);
  if (toHand && (e.from === "UNSEEN" || e.from === "DISCARD_PILE")) {
    const side = toHand[1] as Side;
    if (frame.events.some(x => x.t === "deal" && x.side === side)) return true;
  }
  return false;
}

/**
 * The cards a deal beat for `side` brings into view (the moves `silentMove` folded into it). At the
 * turns new era cards enter the deck, some arrive straight from UNAVAILABLE.
 */
export function dealtCards(frame: Frame, side: Side): number[] {
  const out: number[] = [];
  for (const e of frame.events) {
    if (e.t !== "card-moved") continue;
    const toHand = HAND.exec(e.to);
    if (toHand && toHand[1] === side && (e.from === "UNSEEN" || e.from === "DISCARD_PILE" || e.from === "UNAVAILABLE")) out.push(e.card);
  }
  return out;
}

interface Item {
  cat: Cat;
  beat: Beat;
  order: number;
}

export function buildBeats(frame: Frame, _before: PublicState, humanSide: Side): Beat[][] {
  const items: Item[] = [];
  const countries = new Map<number, Extract<Beat, { k: "country" }>>();
  const push = (cat: Cat, beat: Beat) => items.push({ cat, beat, order: items.length });
  const countryBeat = (id: number) => {
    let b = countries.get(id);
    if (!b) {
      b = { k: "country", country: id, influence: [] };
      countries.set(id, b);
      push("country", b);
    }
    return b;
  };

  for (const e of frame.events) {
    switch (e.t) {
      case "card-played":
        push("lead", { k: "reveal", side: e.side, card: e.card, how: e.how, byHuman: e.side === humanSide });
        break;
      case "headline-chosen":
        push("lead", { k: "headline-chosen", side: e.side });
        break;
      case "headline-reveal":
        push("lead", { k: "headline-reveal", us: e.us, ussr: e.ussr, first: e.first });
        break;
      case "roll":
        push("roll", { k: "roll", roll: e.roll });
        break;
      case "scoring":
        push("scoring", { k: "scoring", card: e.card, vp: e.vp, scores: frame.regionScores });
        break;
      case "influence": {
        const b = countryBeat(e.country);
        const prev = b.influence.find(x => x.side === e.side);
        if (prev) prev.to = e.to;
        else b.influence.push({ side: e.side, from: e.from, to: e.to });
        break;
      }
      case "control":
        countryBeat(e.country).control = { from: e.from, to: e.to };
        break;
      case "milops":
      case "space":
      case "defcon":
      case "vp":
        push("track", { k: "track", event: e });
        break;
      case "action-round":
        push("ar", { k: "track", event: e });
        break;
      case "effect-on":
      case "effect-off":
        push("effect", { k: "effect", flag: e.flag, on: e.t === "effect-on" });
        break;
      case "reshuffle":
        push("reshuffle", { k: "reshuffle" });
        break;
      case "deal":
        push("deal", { k: "deal", side: e.side, count: e.count });
        break;
      case "hand-revealed":
        push("revealed", { k: "hand-revealed", side: e.side, cards: [...e.cards] });
        break;
      case "card-moved":
        if (!silentMove(e, frame)) {
          // fromHand rides along on the beat for flightFor (FlightLayer reads it as a CardMove).
          const beat: Extract<Beat, { k: "card-moved" }> & { fromHand?: Side } = { k: "card-moved", card: e.card, from: e.from, to: e.to };
          if (e.fromHand) beat.fromHand = e.fromHand;
          push("moved", beat);
        }
        break;
      case "china-card":
        push("china", { k: "china", holder: e.holder, playable: e.playable });
        break;
      case "turn-start":
        push("turn", { k: "banner", kind: "turn", turn: e.turn });
        break;
      case "phase":
        if (e.phase === "HEADLINE") push("phase", { k: "banner", kind: "phase", phase: e.phase });
        break;
      case "game-over":
        push("over", { k: "game-over", ending: e.ending });
        break;
    }
  }

  const transition = frame.events.some(e => e.t === "turn-start");
  if (!transition) items.sort((a, b) => RANK[a.cat] - RANK[b.cat] || a.order - b.order);

  // Country beats in board order, at the place of the first one.
  const firstCountry = items.findIndex(i => i.cat === "country");
  if (firstCountry >= 0) {
    const cs = items.filter(i => i.cat === "country").sort((a, b) => boardRank((a.beat as { country: number }).country) - boardRank((b.beat as { country: number }).country));
    const rest = items.filter(i => i.cat !== "country");
    rest.splice(items.slice(0, firstCountry).filter(i => i.cat !== "country").length, 0, ...cs);
    items.splice(0, items.length, ...rest);
  }

  const groups: Beat[][] = [];
  let last: Cat | null = null;
  for (const it of items) {
    if (GROUPED.has(it.cat) && it.cat === last) groups[groups.length - 1]!.push(it.beat);
    else groups.push([it.beat]);
    last = it.cat;
  }
  return groups;
}

/** Beat kinds whose beats the runner starts one after another inside their group (ms at 1×, cap). */
export const STAGGER: Partial<Record<Beat["k"], { step: number; maxTotal?: number; dur?: number }>> = {
  country: { step: TIMING.countryStagger.dur },
  "card-moved": { step: TIMING.cardMoved.stagger, maxTotal: TIMING.cardMoved.maxTotal, dur: TIMING.cardMoved.dur },
};

/** Start offset (ms at 1×) of beat `i` of `n` of a staggered kind. */
export function staggerOffset(kind: Beat["k"], i: number, n: number): number {
  const s = STAGGER[kind];
  if (!s || n <= 1) return 0;
  let step = s.step;
  if (s.maxTotal !== undefined && s.dur !== undefined) step = Math.min(step, Math.max(0, (s.maxTotal - s.dur) / (n - 1)));
  return Math.round(i * step);
}
