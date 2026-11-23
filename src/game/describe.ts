// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The action log: what an applied step did and what it changed, as log lines (Messages with their
 * cards, countries and sides by id). A port of DS game/describe.ts and of the card wording of DS
 * game/log_view.ts (`Board.cardLines`), changed in one essential way: everything here reads
 * REDACTED states (game/view.ts), so a line can never name a card the human may not see. The
 * AI's face-down headline is logged without its card; card moves the human cannot see are
 * "UNSEEN" -> "UNSEEN" and say nothing.
 */
import type { DieRollState, EventTrackState, GameState, MicroAction } from "../engine/types";
import type { ActionLayout } from "../engine/layout";
import { namesByValue } from "../engine/layout";
import { CARDS_METADATA } from "../data/metadata";
import { Message, MessageArg, MessageKey, message, messageIfKnown } from "../i18n";
import type { Side } from "./contract";
import { branchMeta } from "./branches";
import { LogLine, cardArg, countryArg, list, logLine, sideArg, signed } from "./log";
import { UNSEEN } from "./view";
import { otherSide } from "./rules";

const SIDE = new Map(CARDS_METADATA.map(c => [c.id, c.side]));

/** What the log needs from the engine: names and the layout (WasmEngine provides all of it). */
export interface Names {
  readonly layout: ActionLayout;
  cardName(id: number): string;
  cardOps(id: number): number;
  countryName(id: number): string;
}

/** Card ids the log words itself, from the engine's layout. */
function ids(L: ActionLayout) {
  const c = L.card_ids;
  return {
    GRAIN_SALES: c.GRAIN_SALES_TO_SOVIETS, STAR_WARS: c.STAR_WARS, SALT: c.SALT_NEGOTIATIONS,
    UN_INTERVENTION: c.UN_INTERVENTION, MISSILE_ENVY: c.MISSILE_ENVY, FIVE_YEAR_PLAN: c.FIVE_YEAR_PLAN,
    EAGLE_BEAR_LANDED: c.EAGLE_BEAR_LANDED_DISCARD, TERRORISM: c.TERRORISM,
  };
}

function isConfirmDone(a: Required<MicroAction>): boolean {
  return (a.flags & 0x80) !== 0 || a.primary_id === 255;
}

/** A score as the log says it: "+3 (US)", "-2 (USSR)", "0 (Tie)". */
export function vpScore(vp: number): Message {
  return vp > 0 ? message("log:vpScore.us", { n: vp }) : vp < 0 ? message("log:vpScore.ussr", { n: -vp })
    : message("log:vpScore.tie");
}

function cardRef(names: Names, id: number): MessageArg {
  return id >= 1 && id <= 110 ? cardArg(id, names.cardName(id)) : `#${id}`;
}

function modeWords(kind: "playMode" | "opMode", name: string | undefined, value: number): MessageArg {
  return (name ? messageIfKnown(`log:${kind}.${name}`) : null) ?? String(value);
}

/** The second headline commit, as the controller read it from the unredacted state: both cards are
 *  public from this step on. */
export interface HeadlineReveal {
  us: number;
  ussr: number;
  first: Side;
}

/**
 * The step's own line, and the headline reveal on the second commit. `before`/`after` are redacted.
 * `reveal` is set only on the second headline commit.
 */
export function describeAction(names: Names, human: Side, before: GameState, after: GameState,
                               action: Required<MicroAction>, reveal: HeadlineReveal | null): LogLine[] {
  const d = action.decision_type;
  const primary = action.primary_id;
  const ctx = before.decision_context;
  const p = ctx?.decision_player ?? "NONE";
  const side = sideArg(p);
  const logs: LogLine[] = [];
  const say = (key: MessageKey, params?: Record<string, MessageArg>) => logs.push(logLine(undefined, key, { side, ...params }));
  const L = names.layout;
  const DT = L.decision_types;
  const C = ids(L);

  if (d === DT.SELECT_CARD) {
    const resolving = ctx?.resolving_card ?? 0;
    const card = { card: cardRef(names, primary), id: primary };
    const phase = before.current_phase_name ?? "";
    if (resolving !== 0 && resolving !== C.EAGLE_BEAR_LANDED) {
      logs.push(eventCardChoice(names, before, after, action, p, resolving));
    } else if (resolving === C.EAGLE_BEAR_LANDED) {
      if (isConfirmDone(action) || primary === 0) say("log:action.eagleBearLandedPass");
      else say("log:action.eagleBearLandedDiscard", card);
    } else if (phase === "HEADLINE") {
      if (reveal) {
        say("log:action.headlineCommit", card);
        const us = cardArg(reveal.us, names.cardName(reveal.us));
        const ussr = cardArg(reveal.ussr, names.cardName(reveal.ussr));
        const usOps = names.cardOps(reveal.us);
        const ussrOps = names.cardOps(reveal.ussr);
        const firstP = reveal.first;
        const secondP = otherSide(firstP);
        logs.push(logLine("★", "log:headline.revealed", {
          usCard: us, usId: reveal.us, usOps, ussrCard: ussr, ussrId: reveal.ussr, ussrOps,
        }));
        logs.push(logLine("★", "log:headline.order", {
          first: sideArg(firstP), firstCard: firstP === "US" ? us : ussr, firstOps: firstP === "US" ? usOps : ussrOps,
          second: sideArg(secondP), secondCard: firstP === "US" ? ussr : us, secondOps: firstP === "US" ? ussrOps : usOps,
        }));
      } else if (p === human) {
        say("log:action.headlineCommit", card);
      } else {
        say("log:action.headlineFaceDown");
      }
    } else if (isConfirmDone(action) || primary === 0) {
      say("prompt:log.pass");
    } else {
      say("log:action.plays", card);
    }
  } else if (d === DT.POINT_NODE) {
    if (isConfirmDone(action)) {
      say("prompt:log.done");
    } else {
      const country = primary < 84 ? countryArg(primary, names.countryName(primary)) : message("log:node", { n: primary });
      const resolving = ctx?.resolving_card ?? 0;
      const phase = before.current_phase_name ?? "";
      if (phase === "SETUP") {
        say("log:action.setupInfluence", { country });
      } else if (resolving > 0) {
        say("log:action.eventTarget", { country, card: cardRef(names, resolving), id: resolving });
      } else {
        const opMode = ctx?.op_mode ?? L.op_modes.INFLUENCE;
        if (opMode === L.op_modes.COUP) say("log:action.coup", { country });
        else if (opMode === L.op_modes.REALIGN) say("log:action.realign", { country });
        else say("log:action.influence", { country });
      }
    }
  } else if (d === DT.SELECT_PLAY_MODE) {
    if (isConfirmDone(action) && (ctx?.resolving_card ?? 0) === C.GRAIN_SALES) {
      const drawn = ctx?.pending_op_card ?? 0;
      say("log:action.grainSalesReturn", { card: cardRef(names, drawn), id: drawn });
    } else {
      const pending = ctx?.pending_op_card ?? 0;
      const name = namesByValue(L.resolutions)[primary];
      const own = name ? messageIfKnown(`prompt:log.mode.${name}`, { side, card: cardRef(names, pending) }) : null;
      if (own) logs.push({ msg: own });
      else say("log:action.playMode", { mode: modeWords("playMode", name, primary) });
    }
  } else if (d === DT.SELECT_OP_MODE) {
    const pending = ctx?.pending_op_card ?? 0;
    const name = namesByValue(L.op_modes)[primary];
    const own = name ? messageIfKnown(`prompt:log.opMode.${name}`, { side, card: cardRef(names, pending) }) : null;
    if (isConfirmDone(action)) say("prompt:log.decline");
    else if (own) logs.push({ msg: own });
    else say("log:action.opMode", { mode: modeWords("opMode", name, primary) });
  } else if (d === DT.CHOOSE_BRANCH) {
    const card = ctx?.resolving_card ?? 0;
    const meta = isConfirmDone(action) ? null : branchMeta(card, primary, before);
    if (isConfirmDone(action)) say("prompt:log.decline");
    else if (meta) say("log:action.branch", { verb: meta.verb, event: cardRef(names, card) });
    else say("log:action.option", { n: primary });
  } else {
    say("log:action.other", { type: d, primary, secondary: action.secondary_id, flags: action.flags });
  }
  return logs;
}

/** Where a card was, for "from the US hand" (null where it says nothing). */
function from(loc: string | undefined): Message | null {
  if (!loc) return null;
  if (loc.startsWith("HAND_US_")) return message("log:from.hand", { side: sideArg("US") });
  if (loc.startsWith("HAND_USSR_")) return message("log:from.hand", { side: sideArg("USSR") });
  if (loc === "DISCARD_PILE") return message("log:from.discardPile");
  if (loc === "PEEKED_TEMP") return message("log:from.drawn");
  return null;
}

const CHOICE = {
  discards: ["log:choice.discards", "log:choice.discardsFrom"],
  removes: ["log:choice.removes", "log:choice.removesFrom"],
  returns: ["log:choice.returns", "log:choice.returnsFrom"],
  takes: ["log:choice.takes", "log:choice.takesFrom"],
  gives: ["log:choice.gives", "log:choice.givesFrom"],
  chooses: ["log:choice.chooses", "log:choice.choosesFrom"],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>;

/** A card chosen while an event resolves, said as what happened to it (redacted locations). */
function eventCardChoice(names: Names, before: GameState, after: GameState, action: Required<MicroAction>,
                         p: string, resolving: number): LogLine {
  const C = ids(names.layout);
  const side = sideArg(p);
  const event = cardRef(names, resolving);
  const id = action.primary_id;
  if (isConfirmDone(action) || id === 0) return logLine(undefined, "log:choice.none", { side, event });
  const card = { side, event, card: cardRef(names, id), id };
  const opp = p === "US" ? "USSR" : "US";
  const src = before.card_locations?.[String(id)];
  const dst = after.card_locations?.[String(id)];
  if (resolving === C.STAR_WARS) return logLine(undefined, "log:choice.starWars", card);
  if (resolving === C.SALT) return logLine(undefined, "log:choice.salt", card);
  if (resolving === C.UN_INTERVENTION) return logLine(undefined, "log:choice.unIntervention", card);
  if (resolving === C.MISSILE_ENVY) return logLine(undefined, "log:choice.missileEnvy", { ...card, opponent: sideArg(opp) });
  if (resolving === C.GRAIN_SALES && id === C.UN_INTERVENTION) {
    return logLine(undefined, "log:choice.grainSalesUn", { side, event, un: cardRef(names, id) });
  }
  const verb = dst === "DISCARD_PILE" ? CHOICE.discards : dst === "REMOVED_FROM_GAME" ? CHOICE.removes
    : dst === "DRAW_DECK" || (dst === UNSEEN && src === "PEEKED_TEMP") ? CHOICE.returns
    : dst?.startsWith(`HAND_${p}_`) ? CHOICE.takes
    : dst?.startsWith(`HAND_${opp}_`) ? CHOICE.gives : CHOICE.chooses;
  const where = from(src);
  return logLine(undefined, where ? verb[1] : verb[0], { ...card, opponent: sideArg(opp), ...(where ? { from: where } : {}) });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// What changed
// ─────────────────────────────────────────────────────────────────────────────────────────────

function countriesById(s: GameState) {
  return Object.values(s.countries || {}).sort((a, b) => a.id - b.id);
}

export function influenceLine(country: MessageArg, us: [number, number] | null, ussr: [number, number] | null): LogLine {
  const u: Record<string, MessageArg> = us ? { usFrom: us[0], usTo: us[1], usDelta: signed(us[1] - us[0]) } : {};
  const r: Record<string, MessageArg> = ussr ? { ussrFrom: ussr[0], ussrTo: ussr[1], ussrDelta: signed(ussr[1] - ussr[0]) } : {};
  const key = us && ussr ? "log:change.influenceBoth" : us ? "log:change.influenceUs" : "log:change.influenceUssr";
  return logLine("•", key, { country, ...u, ...r });
}

/** Flags that are bookkeeping, not effects to tell (the dice line or the ending says them). */
const BOOKKEEPING = /^(SPACE_(US|USSR)_ATTEMPT_\d|DEFCON_SUICIDE_PROVOKED|CMC_SUICIDE_LOSS|EUROPE_CONTROL_WIN)$/;

/** An effect flag by its name in the `effects` catalog, else the flag itself. */
export function effectName(flag: string): MessageArg {
  return messageIfKnown(`effects:${flag}.name`) ?? flag;
}

const HAND = /^HAND_(US|USSR)_(KNOWN|UNKNOWN)$/;

/**
 * The board's changes from `before` to `after` (both redacted): influence, tracks, effects, card
 * moves in words, random discards and Missile Envy's exchange. `implied`: cards whose move, to
 * where they went, the step's own line already says (an event's choice: "discards", "removes",
 * "returns", "takes", "gives"; Grain Sales' return). `drawn`: the
 * cards the human drew in this span (src/game/draws.ts: from the deck, the new era's cards, the
 * reshuffled discard pile) -- said as one "draws" line, as the AI's draws are by count.
 */
export function describeDeltas(names: Names, human: Side, before: GameState, after: GameState, implied: number[] = [],
                               chosen = 0, drawn: readonly number[] = []): LogLine[] {
  const logs: LogLine[] = [];
  const oldCountries = before.countries || {};
  for (const c of countriesById(after)) {
    const old = oldCountries[c.name];
    if (!old) continue;
    const usDiff = c.us_influence - old.us_influence;
    const ussrDiff = c.ussr_influence - old.ussr_influence;
    if (usDiff !== 0 || ussrDiff !== 0) {
      logs.push(influenceLine(countryArg(c.id, c.name),
        usDiff !== 0 ? [old.us_influence, c.us_influence] : null,
        ussrDiff !== 0 ? [old.ussr_influence, c.ussr_influence] : null));
    }
  }
  if (before.defcon !== after.defcon) logs.push(logLine("•", "log:change.defcon", { from: before.defcon, to: after.defcon }));
  if (before.victory_points !== after.victory_points) {
    const a = before.victory_points ?? 0, b = after.victory_points ?? 0;
    logs.push(logLine("•", "log:change.vp", { from: vpScore(a), to: vpScore(b), delta: signed(b - a) }));
  }
  for (const side of ["US", "USSR"] as const) {
    const b = before.mil_ops?.[side], a = after.mil_ops?.[side];
    if (b !== a) logs.push(logLine("•", "log:change.milOps", { side: sideArg(side), from: b ?? 0, to: a ?? 0 }));
  }
  for (const side of ["US", "USSR"] as const) {
    const b = before.space?.[side], a = after.space?.[side];
    if (b !== undefined && a !== undefined && b !== a) logs.push(logLine("•", "log:change.space", { side: sideArg(side), from: b, to: a }));
  }
  const oldFlags = new Set(before.flags || []);
  const newFlags = new Set(after.flags || []);
  for (const f of [...newFlags].filter(x => !oldFlags.has(x) && !BOOKKEEPING.test(x)).sort()) {
    logs.push(logLine("•", "log:change.inEffect", { effect: effectName(f) }));
  }
  for (const f of [...oldFlags].filter(x => !newFlags.has(x) && !BOOKKEEPING.test(x)).sort()) {
    logs.push(logLine("•", "log:change.noLongerInEffect", { effect: effectName(f) }));
  }
  const random = randomDiscards(names, human, before, after, chosen);
  const envy = missileEnvyExchange(names, human, before, after);
  logs.push(...random, ...envy);
  // A random discard or the exchange said the card left its hand; where it went is said again
  // only when that is somewhere else (a starred event that fired: removed from the game).
  const told: number[] = [];
  for (const l of [...random, ...envy]) {
    const c = l.msg.params?.card;
    if (typeof c === "object" && c !== null && "card" in c) told.push(c.card);
  }
  // "Missile Envy goes to the ... hand" says where the card went.
  if (envy.length) told.push(ids(names.layout).MISSILE_ENVY);
  logs.push(...cardLines(names, human, before, after, implied, told, drawn));
  return logs;
}

/**
 * Card moves in words (DS log_view.ts Board.cardLines), over redacted locations. The human's draws
 * (`drawn`) make one line; a card that reaches the human's hand from the AI's unseen hand (Grain
 * Sales, Missile Envy) is taken from it, not drawn. The new era's cards and a reshuffled discard
 * pile are counted whole, the cards drawn from them included.
 */
function cardLines(names: Names, human: Side, before: GameState, after: GameState, implied: readonly number[],
                   told: readonly number[], drawn: readonly number[]): LogLine[] {
  const out: LogLine[] = [];
  const ai = otherSide(human);
  const draws: Record<Side, MessageArg[]> = { US: [], USSR: [] };
  const drew = new Set(drawn);
  let reshuffled = 0;
  let added = 0;
  const b = before.card_locations ?? {};
  const a = after.card_locations ?? {};
  for (let id = 1; id <= 110; id++) {
    const fromLoc = b[String(id)];
    const to = a[String(id)];
    if (!fromLoc || !to || fromLoc === to || to === "HEADLINE_COMMITTED") continue;
    if (fromLoc === "UNAVAILABLE") added++;
    if (implied.includes(id) || (told.includes(id) && (to === "DISCARD_PILE" || HAND.test(to)))) continue;
    const card = { card: cardArg(id, names.cardName(id)), id };
    const hf = HAND.exec(fromLoc);
    const ht = HAND.exec(to);
    if (ht && ht[1] === human && drew.has(id)) {
      draws[human].push(card.card);
      if (fromLoc === "DISCARD_PILE") reshuffled++;
      continue;
    }
    if (to === UNSEEN && fromLoc === "DISCARD_PILE") { reshuffled++; continue; }
    if (to === UNSEEN && fromLoc === "UNAVAILABLE") continue;
    let says: Message;
    if (fromLoc === UNSEEN && ht && ht[1] === ai) {
      // An AI card the human now sees (a reveal, or one drawn already known).
      says = message("log:card.nowKnown", { ...card, side: sideArg(ai), other: sideArg(human) });
    } else if (fromLoc === UNSEEN && ht) {
      // Not a draw (those are in `drawn`): out of the AI's unseen hand into the human's.
      says = message("prompt:log.takenFrom", { ...card, from: sideArg(ai), side: sideArg(human) });
    } else if (ht && hf && hf[1] === ht[1]) {
      const sides = { side: sideArg(ht[1]), other: sideArg(otherSide(ht[1] as Side)) };
      says = message(ht[2] === "KNOWN" ? "log:card.nowKnown" : "log:card.noLongerKnown", { ...card, ...sides });
    } else if (ht && hf) {
      says = message("prompt:log.takenFrom", { ...card, from: sideArg(hf[1]), side: sideArg(ht[1]) });
    } else if (ht) {
      says = message("log:card.toHand", { ...card, side: sideArg(ht[1]) });
    } else if (to === UNSEEN) {
      says = fromLoc === "PEEKED_TEMP" || fromLoc === "DISCARD_PILE" ? message("log:card.to.DRAW_DECK", card)
        : hf && hf[1] === ai ? message("log:card.noLongerKnown", { ...card, side: sideArg(ai), other: sideArg(human) })
        : message("prompt:log.cardUnseen", { ...card, side: sideArg(ai) });
    } else {
      says = messageIfKnown(`log:card.to.${to}`, card) ?? message("log:card.to.other", { ...card, to });
    }
    out.push({ mark: "•", msg: says });
  }
  for (const side of ["US", "USSR"] as const) {
    const n = draws[side].length;
    if (n) out.push(logLine("•", "log:card.draws", { side: sideArg(side), count: n, cards: list(draws[side]) }));
  }
  if (added) out.push(logLine("•", "log:card.newEra", { n: added }));
  if (reshuffled) out.push(logLine("•", "log:card.reshuffled", { n: reshuffled }));
  return out;
}

/** The AI's hidden draws, told by count only (never by card). */
export function hiddenDrawLine(ai: Side, count: number): LogLine {
  return logLine("•", "prompt:log.drawsHidden", { side: sideArg(ai), count });
}

/** In a redacted state, is `loc` in `side`'s hand (the AI's unseen cards are UNSEEN)? */
function inHand(loc: string, side: Side, ai: Side): boolean {
  return loc.startsWith(`HAND_${side}_`) || (side === ai && loc === UNSEEN);
}

/** Five Year Plan's and Terrorism's random discards, each on its own line (DS describe.ts). */
function randomDiscards(names: Names, human: Side, before: GameState, after: GameState, chosen: number): LogLine[] {
  const C = ids(names.layout);
  const ai = otherSide(human);
  const lines: LogLine[] = [];
  const c = before.decision_context;
  const ownPlay = [chosen, c?.pending_op_card, before.headline_us_card, before.headline_ussr_card,
                   after.headline_us_card, after.headline_ussr_card];
  const events: Array<[number, Side[]]> = [[C.FIVE_YEAR_PLAN, ["USSR"]], [C.TERRORISM, ["US", "USSR"]]];
  for (const [event, victims] of events) {
    const played = c?.decision_type === names.layout.decision_types.SELECT_PLAY_MODE && c.pending_op_card === event;
    const leaves = before.card_locations?.[String(event)] !== after.card_locations?.[String(event)];
    if (!played && !leaves) continue;
    for (let cid = 1; cid <= 110; cid++) {
      if (cid === event || ownPlay.includes(cid)) continue;
      const o = before.card_locations?.[String(cid)] ?? "";
      const n = after.card_locations?.[String(cid)] ?? "";
      if (n !== "DISCARD_PILE" && n !== "REMOVED_FROM_GAME") continue;
      const side = victims.find(v => inHand(o, v, ai));
      if (!side) continue;
      const fires = event === C.FIVE_YEAR_PLAN && SIDE.get(cid) === "us";
      lines.push(logLine("✂", fires ? "log:randomDiscardFires" : "log:randomDiscard", {
        side: sideArg(side), card: cardArg(cid, names.cardName(cid)), id: cid, event: cardArg(event, names.cardName(event)),
      }));
    }
  }
  return lines;
}

/** Missile Envy's exchange, as one line per card taken plus the card going over (DS describe.ts). */
function missileEnvyExchange(names: Names, human: Side, before: GameState, after: GameState): LogLine[] {
  const C = ids(names.layout);
  const ai = otherSide(human);
  const forced = after.forced_card_id === C.MISSILE_ENVY && after.forced_card_player !== "NONE";
  const already = before.forced_card_id === C.MISSILE_ENVY && before.forced_card_player === after.forced_card_player;
  if (!forced || already) return [];
  const giver = after.forced_card_player as Side, taker = otherSide(giver);
  const sides = { giver: sideArg(giver), taker: sideArg(taker), event: cardArg(C.MISSILE_ENVY, names.cardName(C.MISSILE_ENVY)) };
  const headlines = [before.headline_us_card, before.headline_ussr_card, after.headline_us_card, after.headline_ussr_card];
  const lines: LogLine[] = [];
  for (let cid = 1; cid <= 110; cid++) {
    if (cid === C.MISSILE_ENVY || headlines.includes(cid)) continue;
    const was = before.card_locations?.[String(cid)] ?? "";
    const now = after.card_locations?.[String(cid)] ?? "";
    if (!inHand(was, giver, ai) || inHand(now, giver, ai) || now === UNSEEN) continue;
    const side = SIDE.get(cid);
    const card = { ...sides, card: cardArg(cid, names.cardName(cid)), id: cid };
    if (side === giver.toLowerCase()) lines.push(logLine("⇄", "log:envy.takesGivers", { ...card, ops: names.cardOps(cid) }));
    else if (side === "neutral") lines.push(logLine("⇄", "log:envy.takesBoth", card));
    else lines.push(logLine("⇄", "log:envy.takesTakers", card));
  }
  lines.push(logLine("⇄", "log:envy.goes", sides));
  return lines;
}

/** What each Event of a step did to VP and DEFCON, when the step's before/after cannot say it. */
export function describeEventTracks(before: GameState, after: GameState, tracks: EventTrackState[] | undefined,
                                    names: Names): LogLine[] {
  if (!tracks || tracks.length === 0) return [];
  const vp = tracks.reduce((sum, t) => sum + t.vp_delta, 0);
  const defcon = tracks.reduce((sum, t) => sum + t.defcon_delta, 0);
  const netVp = (after.victory_points ?? 0) - (before.victory_points ?? 0);
  const netDefcon = (after.defcon ?? 0) - (before.defcon ?? 0);
  if (tracks.length === 1 && vp === netVp && defcon === netDefcon) return [];
  return tracks.map(t => {
    const card = { card: cardRef(names, t.card_id), id: t.card_id };
    const vpPart = t.vp_delta !== 0 ? { side: sideArg(t.vp_delta > 0 ? "US" : "USSR"), vp: Math.abs(t.vp_delta) } : null;
    const defconPart = t.defcon_delta !== 0 ? { defcon: signed(t.defcon_delta) } : null;
    const key = vpPart && defconPart ? "log:eventTrack.both" : vpPart ? "log:eventTrack.vp"
      : defconPart ? "log:eventTrack.defcon" : "log:eventTrack.none";
    return logLine("•", key, { ...card, ...vpPart, ...defconPart });
  });
}

/** The dice line for one roll; `before` is the position the roll was made from (redacted is fine). */
export function describeRoll(names: Names, before: GameState, r: DieRollState, p: string): LogLine[] {
  const logs: LogLine[] = [];
  const type = r.type ?? "NONE";
  const named = (r.country_id ?? 255) < 84;
  const cname = () => r.country_name || (named ? names.countryName(r.country_id ?? 0) : "");
  const country = (name: string): MessageArg => (named ? countryArg(r.country_id ?? 0, name) : name);
  const sgn = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
  const roller = sideArg(r.roller && r.roller !== "NONE" ? r.roller : p);
  if (type === "COUP") {
    const c = cname();
    const stab = before.countries?.[c]?.stability ?? 1;
    const roll1 = r.roll1 ?? 0, mod1 = r.mod1 ?? 0, tot1 = r.total1 ?? roll1 + mod1;
    const result = r.success ? message("log:roll.coupSucceeded", { net: r.net_delta ?? 0 }) : message("log:roll.coupFailed");
    const values = { country: country(c), roller, roll: roll1, mod: mod1, total: tot1, defense: stab * 2, stability: stab, result };
    if (r.card_name) {
      const card: MessageArg = r.card_id ? cardArg(r.card_id, r.card_name) : r.card_name;
      logs.push(logLine("🎲", "log:roll.coupWithCard", { ...values, card }));
    } else {
      logs.push(logLine("🎲", "log:roll.coup", values));
    }
  } else if (type === "REALIGNMENT") {
    const c = cname();
    const rus = r.roll1 ?? 0, mus = r.mod1 ?? 0, tus = r.total1 ?? rus + mus;
    const rr = r.roll2 ?? 0, mr = r.mod2 ?? 0, tr = r.total2 ?? rr + mr;
    const net = r.net_delta ?? 0;
    const result = tus > tr ? message("log:roll.realignUs", { by: tus - tr, net })
      : tr > tus ? message("log:roll.realignUssr", { by: tr - tus, net }) : message("log:roll.realignTie");
    logs.push(logLine("🎲", "log:roll.realign", {
      country: country(c), usRoll: rus, usMod: sgn(mus), usTotal: tus, ussrRoll: rr, ussrMod: sgn(mr), ussrTotal: tr, result,
    }));
  } else if (type === "SPACE_RACE") {
    const box = r.country_id ?? 0;
    const roll1 = r.roll1 ?? 0;
    const result = r.success ? message("log:roll.spaceSucceeded", { box })
      : message("log:roll.spaceFailed", { roll: roll1, threshold: r.mod1 ?? 0 });
    logs.push(logLine("🎲", "log:roll.space", { box, roller, roll: roll1, result }));
  } else if (type === "WAR_EVENT") {
    const name = r.card_name || `Card #${r.card_id}`;
    const card: MessageArg = r.card_id !== undefined ? cardArg(r.card_id, name) : name;
    const c = cname();
    const roll1 = r.roll1 ?? 0, mod1 = r.mod1 ?? 0, tot1 = r.total1 ?? roll1 + mod1;
    const threshold = r.mod2 ?? 0;
    const result = r.success ? message("log:roll.warSucceeded", { total: tot1, threshold })
      : message("log:roll.warFailed", { total: tot1, threshold });
    const values = { card, roller, roll: roll1, mod: sgn(mod1), total: tot1, result };
    if (c) logs.push(logLine("🎲", "log:roll.warTargeting", { ...values, country: country(c) }));
    else logs.push(logLine("🎲", "log:roll.war", values));
  } else if (type === "OLYMPIC_GAMES") {
    const sponsor = r.roller && r.roller !== "NONE" ? r.roller : p;
    const sr = r.roll1 ?? 0, st = r.total1 ?? sr + (r.mod1 ?? 2);
    const or = r.roll2 ?? 0, ot = r.total2 ?? or;
    const opp = sponsor === "USSR" ? "US" : "USSR";
    const result = st > ot ? message("log:roll.olympicsSponsor", { side: sideArg(sponsor), by: st - ot })
      : ot > st ? message("log:roll.olympicsOpponent", { side: sideArg(opp) }) : message("log:roll.olympicsTie");
    logs.push(logLine("🎲", "log:roll.olympics", {
      sponsor: sideArg(sponsor), sponsorRoll: sr, sponsorTotal: st, opponent: sideArg(opp), opponentRoll: or, result,
    }));
  } else if (type === "SUMMIT") {
    const ur = r.roll1 ?? 0, ud = r.mod1 ?? 0, ut = r.total1 ?? ur + ud;
    const sr = r.roll2 ?? 0, sd = r.mod2 ?? 0, stt = r.total2 ?? sr + sd;
    const by = Math.abs(ut - stt);
    const result = ut > stt ? message("log:roll.summitUs", { by }) : stt > ut ? message("log:roll.summitUssr", { by })
      : message("log:roll.summitTie");
    logs.push(logLine("🎲", "log:roll.summit", {
      usRoll: ur, usMod: ud, usTotal: ut, ussrRoll: sr, ussrMod: sd, ussrTotal: stt, result,
    }));
  } else if (type === "TRAP_ESCAPE") {
    const result = r.success ? message("log:roll.trapSucceeded") : message("log:roll.trapFailed");
    logs.push(logLine("🎲", "log:roll.trap", { roller, roll: r.roll1 ?? 0, result }));
  }
  return logs;
}
