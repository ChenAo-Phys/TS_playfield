/**
 * Engine-truth previews for the human (critique.md section 3.6): coup and realignment odds,
 * effective Ops, and what each prompt option would do -- its warnings, its influence cost, whether
 * it ends the human's play, and what an event-target click does. Each runs snapshot -> step ->
 * read -> restore on the main engine, so no rule is restated, and the position (state and
 * rng_state) is exactly as it was afterwards. They clobber the engine's click buffers
 * (settledDisplay, clickRolls, clickEventTracks): the controller reads those right after each real
 * step, before any preview runs.
 *
 * Dice are always forced (`stepDice`), never rolled: a step that rolls is tried on every face of its
 * die, and a step with an opposed roll (realignment, Summit, Olympic Games) on 11 pairs of dice
 * that reach every outcome (see OPPOSED_PAIRS). The RNG is never consulted.
 *
 * No preview may tell the human what the RNG or the AI's hand holds:
 * - a step whose outcome depends on randomness without a die (a random discard, a draw) or that
 *   reveals hidden cards (the draw deck, the AI's unseen hand, its face-down headline) gets no
 *   game-ending warning, and counts as ending the play (`endsPlay`, the safe answer);
 * - endings that turn on the AI's hand (a held scoring card at the turn's end, and final scoring,
 *   which comes after that check) are never previewed; the scoring-card warning covers the human's
 *   own hand from public facts.
 */
import { COUNTRIES } from "../data/countries";
import type { DieRollState, GameState, MicroAction } from "../engine/types";
import type { WasmEngine } from "../engine/wasm_engine";
import type { CoupOdds, EndingReason, Prompt, PromptKind, RealignOdds, Side, Warning } from "./contract";
import { cardSide, classifyPrompt, legalIndices } from "./prompt";
import {
  CHINA_CARD, CUBAN_MISSILE_CRISIS, EAST_EUROPEAN_UNREST, MUSLIM_REVOLUTION, SUEZ_CRISIS, classifyEnding, countryById, crossesPlay, forcedEventTarget, isScoringCard,
  otherSide, playerOf, sideOf, strandsScoring, suezSnapshot,
} from "./rules";
import { aiHeadlineFaceDown } from "./view";

/** Endings a preview may announce: they follow from public facts and the forced die alone. */
const PUBLIC_ENDINGS: ReadonlySet<EndingReason> = new Set(["defcon", "cmc-suicide", "wargames", "vp20", "europe-control", "milops-vp20"]);

/** Prompt kinds whose country options carry `cost` (contract PromptOption.cost). */
const COST_KINDS: ReadonlySet<PromptKind> = new Set(["setup-place", "bid-place", "influence"]);

/** Opposed rolls (engine RollType names): both dice matter. */
const OPPOSED_ROLLS: ReadonlySet<string> = new Set(["REALIGNMENT", "OLYMPIC_GAMES", "SUMMIT"]);

/** One die forced to each face (the second die, unused, mirrors it). Weight: 6 of the 36 pairs. */
const FACES: ReadonlyArray<readonly [number, number, number]> = [1, 2, 3, 4, 5, 6].map(d => [d, d, 6] as const);

/**
 * Opposed rolls: the engine decides them by the difference of the two dice alone (ops.cpp
 * `execute_realign`; card_dispatcher.cpp Summit and Olympic Games compare the totals), so these 11
 * pairs -- every difference from -5 to 5, the acting die on every face -- reach every outcome. Each
 * is weighted by the number of the 36 pairs with its difference. (A further roll in the same click,
 * such as a war card's Event after the last realignment, takes the acting die.)
 */
const OPPOSED_PAIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
].map(([d, e]) => [d, e, 6 - Math.abs(d - e)] as const);

/** Event-target prompts: how many country options are tried to find what a click does. */
const EFFECT_PROBES = 4;

/** Events whose targets may be forced (rules.ts forcedEventTarget): Suez Crisis, Muslim Revolution, East European Unrest. */
const FORCED_TARGET_CARDS: ReadonlySet<number> = new Set([SUEZ_CRISIS, MUSLIM_REVOLUTION, EAST_EUROPEAN_UNREST]);

interface Outcome {
  reason: EndingReason;
  winner: Side | "DRAW";
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// One option, one die outcome
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface ProbeContext {
  E: WasmEngine;
  human: Side;
  /** Unredacted display at the prompt (the engine holds this position). */
  raw: GameState;
  kind: PromptKind;
  snap: Uint8Array;
  rng0: string;
  /** Cards the human cannot see at the prompt (draw deck, the AI's unseen hand). */
  hidden0: ReadonlySet<number>;
  /** The AI's headline is face down at the prompt. */
  headlineDown: boolean;
  /** Suez Crisis: the controller's record of the node's start, when the prompt is at it. */
  suezStart: Readonly<Record<number, number>> | null;
}

interface RunResult {
  /** The step rolled at least one die / an opposed roll; how many dice records it left. */
  rolled: boolean;
  opposed: boolean;
  rolls: number;
  /** The countries the step's dice were rolled for (coups, realignments, wars). */
  rollCountries: number[];
  /** positionKey() right after the step ("T" when the game is over). */
  key: string;
  terminal: Outcome | null;
  /** The human has no further decision in this play after it (see `attachPreviews`). */
  endsPlay: boolean;
  /** The outcome turned on hidden information (non-die randomness, revealed cards). */
  hidden: boolean;
  /** Influence-type prompts: how much `remaining` drops (all of it when the run ends). */
  cost?: number;
  /** Requested: the change of the option's country (event-target effect). */
  delta?: { US: number; USSR: number };
}

/** The cards in `d` the human cannot see: the draw deck and the AI's unseen hand. */
function hiddenCards(d: GameState, human: Side): Set<number> {
  const unseen = `HAND_${otherSide(human)}_UNKNOWN`;
  const out = new Set<number>();
  for (const [id, loc] of Object.entries(d.card_locations ?? {})) if (loc === unseen || loc === "DRAW_DECK") out.add(Number(id));
  return out;
}

/** Whether going from the prompt to `d` showed the human something hidden at the prompt. */
function revealsHidden(ctx: ProbeContext, d: GameState): boolean {
  if (ctx.headlineDown && !aiHeadlineFaceDown(d, ctx.human)) return true;
  const unseen = `HAND_${otherSide(ctx.human)}_UNKNOWN`;
  const locs = d.card_locations ?? {};
  for (const id of ctx.hidden0) {
    const loc = locs[String(id)];
    if (loc !== unseen && loc !== "DRAW_DECK") return true;
  }
  return false;
}

/** The human's next prompt continues the same run of points (cost), read from the display after the step. */
function sameRun(ctx: ProbeContext, d: GameState): boolean {
  const a = d.decision_context;
  const b = ctx.raw.decision_context;
  return a.decision_type === b.decision_type && sideOf(a.decision_player) === ctx.human && d.current_phase_name === ctx.raw.current_phase_name
    && a.pending_op_card === b.pending_op_card && a.resolving_card === b.resolving_card && a.remaining_steps < b.remaining_steps
    && classifyPrompt(d, ctx.E.layout) === ctx.kind;
}

/**
 * After the option's step: play the human's forced follow-ups (single legal action, forced event
 * target), as the controller does, and tell whether the human then has a real decision in the same
 * play. `d` is the display after the step when already read. The engine is left wherever it got.
 */
function settle(ctx: ProbeContext, d: GameState | null, die: number, opp: number): { ends: boolean; last: GameState | null } {
  const { E } = ctx;
  const L = E.layout;
  const me = playerOf(ctx.human);
  const atSuez = (s: GameState) => s.decision_context.decision_type === L.decision_types.POINT_NODE && s.decision_context.resolving_card === SUEZ_CRISIS;
  let suez = atSuez(ctx.raw) ? ctx.suezStart : null;
  for (let i = 0; i < 16; i++) {
    if (E.isTerminal() || E.decisionPlayer() !== me) return { ends: true, last: d };
    d ??= E.display();
    if (crossesPlay(ctx.raw, d)) return { ends: true, last: d };
    if (atSuez(d)) suez ??= suezSnapshot(d);
    else suez = null;
    const m = E.mask(false);
    const legal = legalIndices(m, L.size);
    const forced = legal.length === 1 ? legal[0] : forcedEventTarget(d, m, suez, L.offsets.node, L.confirm_done_index);
    if (forced < 0) return { ends: false, last: d };
    if (E.stepDice(E.decodeFlat(forced), die, opp)) return { ends: true, last: d };
    d = null;
  }
  return { ends: true, last: d };
}

/**
 * The ending the engine reached in the probe (null while the game goes on): its classified outcome, the display, and
 * whether reaching it showed the human something hidden at the prompt (a random draw, a card out of the AI's unseen
 * hand or the deck, the AI's face-down headline).
 */
function terminalOf(ctx: ProbeContext): { outcome: Outcome; hidden: boolean; after: GameState } | null {
  const { E } = ctx;
  if (!E.isTerminal()) return null;
  const after = E.display();
  // classifyEnding reads the settled board only for endings at the turn's end.
  const flags = after.flags ?? [];
  const plainEnd = after.defcon <= 1 || flags.includes("CMC_SUICIDE_LOSS") || flags.includes("EUROPE_CONTROL_WIN");
  const e = classifyEnding(ctx.raw, plainEnd ? after : E.settledDisplay(), after, E.endingReason());
  return { outcome: { reason: e.reason, winner: e.winner }, hidden: E.rngState() !== ctx.rng0 || revealsHidden(ctx, after), after };
}

/**
 * The probe ended the game in a way a preview may announce: a public ending (PUBLIC_ENDINGS) reached without anything
 * hidden coming to light. Never the turn-end held-scoring check or final scoring, which turn on the AI's hand.
 */
function publicEnd(ctx: ProbeContext): boolean {
  const end = terminalOf(ctx);
  return !!end && !end.hidden && PUBLIC_ENDINGS.has(end.outcome.reason);
}

/**
 * A cheap fingerprint of the position after one die outcome of an option, for reusing `settle`
 * between the outcomes of that option: who decides, the decision type, and whether the decision is
 * forced (one legal action) -- or the whole legal set where a forced event target could apply
 * (`fine`: Suez Crisis, Muslim Revolution, East European Unrest).
 */
function positionKey(E: WasmEngine, fine: boolean): string {
  if (E.isTerminal()) return "T";
  const m = E.mask(false);
  let n = 0;
  let h = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    n++;
    h = (Math.imul(h, 31) + i + 1) | 0;
  }
  return `${E.decisionPlayer()}|${E.decisionType()}|${fine ? h : Math.min(n, 2)}`;
}

/**
 * Apply `a` with the dice forced to (`die`, `opp`) and read what it does; restores the position.
 * `endsPlay` is reused from `seen` for a position already settled (same decider, decision and
 * legal set): only the first die outcome reaching a position pays for reading it.
 */
function run(ctx: ProbeContext, a: MicroAction, die: number, opp: number,
             want: { cost: boolean; delta: number | null }, seen: Map<string, { ends: boolean; hidden: boolean }>): RunResult | null {
  const { E } = ctx;
  if (E.stepDice(a, die, opp)) { E.restore(ctx.snap); return null; }
  try {
    const rolls: DieRollState[] = E.clickRolls();
    const res: RunResult = {
      rolled: rolls.length > 0, opposed: rolls.some(r => OPPOSED_ROLLS.has(r.type)), rolls: rolls.length, key: "T",
      rollCountries: rolls.map(r => r.country_id ?? -1).filter(c => c >= 0 && c < 84),
      terminal: null, endsPlay: true, hidden: false,
    };
    const countryDelta = (d: GameState) => {
      if (want.delta === null) return;
      const was = countryById(ctx.raw, want.delta);
      const now = countryById(d, want.delta);
      if (was && now) res.delta = { US: now.us_influence - was.us_influence, USSR: now.ussr_influence - was.ussr_influence };
    };
    const end = terminalOf(ctx);
    if (end) {
      res.terminal = end.outcome;
      res.hidden = end.hidden;
      if (want.cost) res.cost = ctx.raw.decision_context.remaining_steps;
      countryDelta(end.after);
      return res;
    }
    let d: GameState | null = null;
    if (want.cost) {
      const rem = ctx.raw.decision_context.remaining_steps;
      res.cost = rem;
      if (E.decisionPlayer() === playerOf(ctx.human) && E.decisionType() === E.layout.decision_types.POINT_NODE) {
        d = E.display();
        if (sameRun(ctx, d)) res.cost = rem - d.decision_context.remaining_steps;
      }
    }
    if (want.delta !== null) {
      d ??= E.display();
      countryDelta(d);
    }
    const key = positionKey(E, FORCED_TARGET_CARDS.has(ctx.raw.decision_context.resolving_card));
    res.key = key;
    const known = seen.get(key);
    if (known) {
      res.endsPlay = known.ends;
      res.hidden = known.hidden;
      return res;
    }
    const s = settle(ctx, d, die, opp);
    let hidden = false;
    if (!s.ends) {
      // The human goes on deciding: only when that does not rest on something the human cannot know.
      const last = s.last ?? E.display();
      hidden = E.rngState() !== ctx.rng0 || revealsHidden(ctx, last);
    }
    res.endsPlay = s.ends || hidden;
    res.hidden = hidden;
    seen.set(key, { ends: res.endsPlay, hidden });
    return res;
  } finally {
    E.restore(ctx.snap);
  }
}

interface OptionProbe {
  /** The first try (dice 1/1). */
  first: RunResult;
  /** Every die outcome tried, with its weight in 36ths. */
  runs: Array<{ r: RunResult; w: number }>;
}

/**
 * Every die outcome of flat index `idx` (one when no die is rolled). Null when the engine refuses it.
 *
 * Shortcut: a click whose only randomness is one roll is tried at the extreme dice first (1 and 6
 * for the acting die; for an opposed roll the largest win each way). When they agree -- the same
 * ending (or none, the same winner) and the same `endsPlay` -- the dice in between, whose results
 * lie between the extremes (a coup, a war or a realignment takes more or less, never something
 * else, and the board scores monotonically), agree too, and the click counts as one outcome.
 * Otherwise every face (or pair) is tried. A further roll in the same click takes the full set.
 */
function probeOption(ctx: ProbeContext, idx: number, want: { cost: boolean; delta: number | null }): OptionProbe | null {
  const a = ctx.E.decodeFlat(idx);
  const seen = new Map<string, { ends: boolean; hidden: boolean }>();
  const first = run(ctx, a, 1, 1, want, seen);
  if (!first) return null;
  if (!first.rolled) return { first, runs: [{ r: first, w: 36 }] };
  const dice = first.opposed ? OPPOSED_PAIRS : FACES;
  const rest = { cost: false, delta: null };
  const tried = new Map<string, RunResult | null>([["1|1", first]]);
  const tryDice = (d: number, e: number) => {
    const k = `${d}|${e}`;
    if (!tried.has(k)) tried.set(k, run(ctx, a, d, e, rest, seen));
    return tried.get(k) ?? null;
  };
  const extremes = (first.opposed ? [[6, 1], [1, 6]] : [[6, 6]]).map(([d, e]) => tryDice(d, e));
  const sameEnd = (x: Outcome | null, y: Outcome | null) => x === y || (!!x && !!y && x.reason === y.reason && x.winner === y.winner);
  const plain = (r: RunResult | null) => !!r && r.rolls === 1 && sameEnd(r.terminal, first.terminal) && r.endsPlay === first.endsPlay
    && r.hidden === first.hidden;
  if (plain(first) && extremes.every(plain)) return { first, runs: [{ r: first, w: 36 }] };
  const runs: Array<{ r: RunResult; w: number }> = [];
  for (const [d, e, w] of dice) {
    const r = tryDice(d, e);
    if (r) runs.push({ r, w });
  }
  return { first, runs };
}

/** The public game-ending outcomes of a probed option, each with its share of the 6 die faces. */
function endingsOf(p: OptionProbe): Array<Outcome & { faces: number }> {
  if (p.runs.some(x => x.r.terminal && x.r.hidden)) return [];
  const total = p.runs.reduce((s, x) => s + x.w, 0);
  const groups = new Map<string, Outcome & { w: number }>();
  for (const { r, w } of p.runs) {
    if (!r.terminal || !PUBLIC_ENDINGS.has(r.terminal.reason)) continue;
    const key = `${r.terminal.reason}|${r.terminal.winner}`;
    const g = groups.get(key);
    if (g) g.w += w;
    else groups.set(key, { ...r.terminal, w });
  }
  return [...groups.values()].map(g => {
    const faces = g.w >= total ? 6 : Math.min(5, Math.max(1, Math.round((6 * g.w) / total)));
    return { reason: g.reason, winner: g.winner, faces };
  });
}

/**
 * The public game-ending outcomes of playing flat index `idx` now, each with the number of die
 * faces (of 6) that lead to it; [] when none (or when the outcome cannot be told without leaking).
 * `before` is the unredacted display at the human's decision; the engine holds that position.
 */
export function endingOutcomes(E: WasmEngine, idx: number, before: GameState, human: Side, rng0 = E.rngState())
  : Array<Outcome & { faces: number }> {
  const ctx = context(E, before, human, null, rng0);
  const p = probeOption(ctx, idx, { cost: false, delta: null });
  return p ? endingsOf(p) : [];
}

function context(E: WasmEngine, raw: GameState, human: Side, suezStart: Readonly<Record<number, number>> | null, rng0 = E.rngState()): ProbeContext {
  return {
    E, human, raw, kind: classifyPrompt(raw, E.layout), snap: E.snapshot(), rng0, hidden0: hiddenCards(raw, human),
    headlineDown: aiHeadlineFaceDown(raw, human), suezStart,
  };
}

function outcomeWarning(o: Outcome & { faces: number }, human: Side): Warning {
  const loses = o.winner === otherSide(human);
  if (o.reason === "defcon" && loses) return { code: "defcon-suicide", params: { faces: o.faces } };
  if (o.reason === "cmc-suicide" && loses) return { code: "cmc-suicide", params: { faces: o.faces } };
  return { code: "game-ending", params: { winner: o.winner, reason: o.reason, faces: o.faces } };
}

function push(warnings: Map<number, Warning[]>, idx: number, w: Warning): void {
  const list = warnings.get(idx) ?? [];
  list.push(w);
  warnings.set(idx, list);
}

/**
 * What an event-target click does, from the first country options' outcomes (dice 1/1): a die
 * rolled for the country makes it a "target" (a coup, a war); else the country's change.
 */
function effectOf(probes: Array<{ country: number; p: OptionProbe | null }>, decider: Side): NonNullable<Prompt["effect"]> {
  const sides: Side[] = decider === "US" ? ["US", "USSR"] : ["USSR", "US"];
  for (const { country, p } of probes) {
    if (!p) continue;
    if (p.first.rollCountries.includes(country)) return { verb: "target", side: decider };
    const dl = p.first.delta;
    if (!dl) continue;
    if (dl[decider] > 0) return { verb: "add", side: decider };
    const removed = sides.find(s => dl[s] < 0);
    if (removed) return { verb: "remove", side: removed };
    const added = sides.find(s => dl[s] > 0);
    if (added) return { verb: "add", side: added };
  }
  return { verb: "target", side: decider };
}

export interface PreviewOptions {
  /** The controller's Suez Crisis record (US influence when the node opened), when the prompt is at it. */
  suezStart?: Readonly<Record<number, number>> | null;
  /** Also fill `cost`, `endsPlay` and `effect` (default true). */
  options?: boolean;
}

/**
 * Attach every preview to the prompt (mutates `prompt`). `raw` is the unredacted display at the
 * human's decision; the engine holds that position and is left exactly there.
 *
 * - `warnings`: `scoring-stranded` {scoring, plays}; `defcon-suicide` / `cmc-suicide` {faces};
 *   `game-ending` {winner: "US"|"USSR"|"DRAW", reason: EndingReason, faces}; `opponent-event`
 *   {card: card id, side: the side the Event belongs to}. `faces` is how many of the six die faces
 *   lead there (6 = certain; opposed rolls: the share of the 36 pairs, rounded, 6 only if certain).
 * - `cost` (setup-place, bid-place, influence; country options only): how much `remaining` drops,
 *   i.e. the Ops the point consumes (1, or 2 where the opponent has control) plus any conditional
 *   bonus it forfeits (the China Card's Asia +1 spent outside Asia); all of `remaining` when the
 *   point ends the run.
 * - `endsPlay` (every option): after it, and after the human's forced follow-ups the controller
 *   auto-plays, the human has no further decision in this play for at least one die outcome: the
 *   game ends, the AI decides next (even a forced AI move), the turn or phase changes, a headline
 *   starts resolving, or the human's next decision starts a new play (a card choice). True also
 *   whenever the answer would rest on hidden information.
 * - `effect` (event-target): what a click does, from the engine's own result on the first country
 *   options -- "add"/"remove" with the side whose influence changes there, or "target" when a die
 *   is rolled for the country (coups, wars) or its influence does not change.
 */
export function attachPreviews(E: WasmEngine, prompt: Prompt, raw: GameState, human: Side, opts: PreviewOptions = {}): void {
  const warnings = new Map<number, Warning[]>();

  // The scoring-card warning (and rule 9.5 for the China Card) at the human's own card choices.
  if (prompt.kind === "action-card" || prompt.kind === "headline") {
    for (const o of prompt.options) {
      if (o.kind !== "card" && o.kind !== "done") continue;
      const choice = o.kind === "card" ? o.id : 0;
      if (isScoringCard(choice)) continue;
      const r = strandsScoring(raw, human, choice);
      if (r.stranded) push(warnings, o.idx, { code: "scoring-stranded", params: { scoring: r.scoring, plays: r.plays } });
    }
  }

  // Playing an opponent's card for Operations (Grain Sales' drawn card included): its Event happens
  // for the opponent.
  if (prompt.kind === "play-mode") {
    const side = cardSide(prompt.pendingCard);
    const opp = otherSide(human);
    if (side === opp.toLowerCase()) {
      for (const o of prompt.options) {
        if (o.kind === "mode" && o.id >= 2) push(warnings, o.idx, { code: "opponent-event", params: { card: prompt.pendingCard, side: opp } });
      }
    }
  }

  // Engine truth: step every option on every die outcome.
  const full = opts.options !== false;
  const ctx = context(E, raw, human, opts.suezStart ?? null);
  const endings = prompt.kind !== "setup-place" && prompt.kind !== "bid-place";
  const effectProbes: Array<{ country: number; p: OptionProbe | null }> = [];
  for (const o of prompt.options) {
    if (!full && !endings) break;
    const cost = full && COST_KINDS.has(prompt.kind) && o.kind === "country";
    const delta = full && prompt.kind === "event-target" && o.kind === "country" && effectProbes.length < EFFECT_PROBES ? o.id : null;
    const p = probeOption(ctx, o.idx, { cost, delta });
    if (delta !== null) effectProbes.push({ country: delta, p });
    if (!p) continue;
    if (endings) for (const outcome of endingsOf(p)) push(warnings, o.idx, outcomeWarning(outcome, human));
    if (full) {
      o.endsPlay = p.runs.some(x => x.r.endsPlay);
      if (cost && p.first.cost !== undefined) o.cost = p.first.cost;
    }
  }
  if (full && prompt.kind === "event-target") prompt.effect = effectOf(effectProbes, human);

  for (const o of prompt.options) {
    const w = warnings.get(o.idx);
    if (w && w.length) o.warnings = w;
  }
}

/** The warnings alone (and, by default, the other option previews): see `attachPreviews`. */
export function attachWarnings(E: WasmEngine, prompt: Prompt, raw: GameState, human: Side, opts: PreviewOptions = {}): void {
  attachPreviews(E, prompt, raw, human, opts);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Hover previews
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Coup odds in `country` at the human's coup decision: one entry per forced die face. If the coup
 * first asks where to pay for the Cuban Missile Crisis, the first legal payment is taken. `endsGame`
 * is set only for a public ending (as the option warnings: never held scoring or final scoring).
 * `milOps` (R-002): the military operations the coup credits, 0 for an Event's own free coup (see
 * `coupEarnsMilOps`; contract `CoupOdds.milOps?`).
 */
export function computeCoupOdds(E: WasmEngine, country: number): CoupOdds | null {
  const L = E.layout;
  const idx = L.offsets.node + country;
  if (!E.mask(false)[idx]) return null;
  const a = E.decodeFlat(idx);
  const player = E.decisionPlayer();
  const human = sideOf(player);
  if (!human) return null;
  const ctx = context(E, E.display(), human, null);
  const snap = ctx.snap;
  const faces: CoupOdds["faces"] = [];
  let mod1: number | undefined;
  try {
    for (let die = 1; die <= 6; die++) {
      const why = E.step(a, die);
      if (why) return null;
      let rolls = E.clickRolls();
      if (rolls.length === 0 && !E.isTerminal() && E.decisionPlayer() === player
          && E.display().decision_context.resolving_card === CUBAN_MISSILE_CRISIS) {
        const m = E.mask(false);
        const pay = m.findIndex((v, i) => v === 1 && i >= L.offsets.node && i < L.offsets.branch);
        if (pay >= 0 && !E.step(E.decodeFlat(pay), die)) rolls = E.clickRolls();
      }
      const r = rolls.find(x => x.type === "COUP");
      if (die === 1 && typeof r?.mod1 === "number") mod1 = r.mod1;
      // Only a public ending: a coup on the turn's last action runs the turn's end, whose held-scoring check (and final
      // scoring after it) turns on the AI's hand.
      faces.push({ die, success: !!r?.success, netDelta: r?.net_delta ?? 0, endsGame: publicEnd(ctx) });
      E.restore(snap);
    }
  } finally {
    E.restore(snap);
  }
  if (mod1 === undefined) return { country, faces };
  // The engine records one combined modifier (ops.cpp execute_coup: mod1 = Ops + roll modifiers). Split it: the roll
  // modifiers come from public effects in force at the click (Q-038), the rest is the Ops the coup is credited with
  // (the China Card's +1 only in Asia, Vietnam Revolts' only in Southeast Asia).
  const modifier = coupRollModifier(ctx.raw.flags, COUNTRIES[country]?.region, human);
  const ops = mod1 - modifier;
  const earns = coupEarnsMilOps(E);
  return earns === null ? { country, faces, ops, modifier } : { country, faces, ops, modifier, milOps: earns ? ops : 0 };
}

/** Card ids of `free_action::coup_earns_no_military_ops` (engine constants.hpp). */
const JUNTA = 47;
const TEAR_DOWN_THIS_WALL = 96;
const ORTEGA_ELECTED_IN_NICARAGUA = 91;

/**
 * Whether a coup at the open decision earns military operations (ops.cpp execute_coup, step 2, which reads the
 * open decision's frame: `free_action::coup_earns_no_military_ops`, constants.hpp). An Event's own free coup earns
 * none: Junta and Tear Down This Wall when the Event granted the Ops (`event_granted_ops`; played for Ops they
 * earn them), and Ortega Elected in Nicaragua. Every other coup earns its Ops, Che's included (R-002).
 *
 * The display has no `event_granted_ops`, so the frame comes from the save, which carries the decision stack.
 * The rule, not the probe's `mil_ops` change: that change is 0 for a side already at 5 and is wiped when the coup
 * is the turn's last action and the step runs the turn's end. Null when the save has no such frame.
 */
export function coupEarnsMilOps(E: WasmEngine): boolean | null {
  let frame: { pending_op_card?: number; event_granted_ops?: number; resolving_card?: number } | undefined;
  try {
    const save = JSON.parse(E.saveJson()) as { ctx_stack?: (typeof frame)[]; ctx_stack_depth?: number };
    frame = save.ctx_stack?.[save.ctx_stack_depth ?? -1];
  } catch {
    return null;
  }
  if (!frame || typeof frame.pending_op_card !== "number" || typeof frame.resolving_card !== "number") return null;
  const regionLocked = (frame.event_granted_ops ?? 0) !== 0
    && (frame.pending_op_card === JUNTA || frame.pending_op_card === TEAR_DOWN_THIS_WALL);
  return !(regionLocked || frame.resolving_card === ORTEGA_ELECTED_IN_NICARAGUA);
}

/** The coup roll's modifier for `side` in a country of `region` (ops.cpp execute_coup): SALT −1; Latin American
 *  Death Squads +1 for the side whose effect it is, −1 for the other, in Central and South America only. */
export function coupRollModifier(flags: readonly string[], region: number | undefined, side: Side): number {
  let m = 0;
  if (region === 4 || region === 5) {
    if (flags.includes("DEATH_SQUADS_US")) m += side === "US" ? 1 : -1;
    if (flags.includes("DEATH_SQUADS_USSR")) m += side === "USSR" ? 1 : -1;
  }
  if (flags.includes("SALT_ACTIVE")) m -= 1;
  return m;
}

/**
 * Realignment odds in `country` at the human's realignment decision, over the 36 forced pairs of
 * dice: the distribution of whose influence is removed and how much (side "NONE", amount 0 when
 * nothing is removed). Null when clicking `country` is not a realignment roll there.
 */
export function computeRealignOdds(E: WasmEngine, country: number): RealignOdds | null {
  const L = E.layout;
  const idx = L.offsets.node + country;
  if (!E.mask(false)[idx]) return null;
  const a = E.decodeFlat(idx);
  const snap = E.snapshot();
  const counts = new Map<string, { side: Side | "NONE"; amount: number; n: number }>();
  let total = 0;
  try {
    for (let die = 1; die <= 6; die++) {
      for (let opp = 1; opp <= 6; opp++) {
        const why = E.stepDice(a, die, opp);
        if (why) return null;
        const r = E.clickRolls().find(x => x.type === "REALIGNMENT" && x.country_id === country);
        E.restore(snap);
        if (!r) return null;
        const amount = r.net_delta ?? 0;
        const us = r.total1 ?? 0;
        const ussr = r.total2 ?? 0;
        // total1 is the US roll, total2 the USSR's; the loser's influence goes (ops.cpp execute_realign).
        const side: Side | "NONE" = amount <= 0 || us === ussr ? "NONE" : us > ussr ? "USSR" : "US";
        const key = `${side}|${side === "NONE" ? 0 : amount}`;
        const c = counts.get(key);
        if (c) c.n++;
        else counts.set(key, { side, amount: side === "NONE" ? 0 : amount, n: 1 });
        total++;
      }
    }
  } finally {
    E.restore(snap);
  }
  const order = (s: Side | "NONE") => (s === "US" ? 0 : s === "USSR" ? 1 : 2);
  const outcomes = [...counts.values()]
    .sort((x, y) => order(x.side) - order(y.side) || x.amount - y.amount)
    .map(c => ({ side: c.side, amount: c.amount, p: c.n / total }));
  return { country, outcomes };
}

/**
 * Effective Ops of `card` if played for Operations now (Containment, Brezhnev, Red Scare/Purge
 * applied). The bonuses that hold only where the Ops are spent -- the China Card's +1 in Asia,
 * Vietnam Revolts' +1 in Southeast Asia -- are not included.
 * At the human's action-card prompt (the card is selected first) or play-mode prompt (`card` must
 * be the pending card). Null when it cannot be played for Ops now.
 */
export function computeEffectiveOps(E: WasmEngine, card: number): number | null {
  const L = E.layout;
  const DT = L.decision_types;
  const snap = E.snapshot();
  try {
    let d = E.display();
    if (d.decision_context.decision_type === DT.SELECT_CARD) {
      if (!E.mask(false)[L.offsets.card + card - 1]) return null;
      if (E.step(E.decodeFlat(L.offsets.card + card - 1), 0)) return null;
      if (E.clickRolls().length > 0 || E.isTerminal()) return null;
      d = E.display();
    }
    if (d.decision_context.decision_type !== DT.SELECT_PLAY_MODE || d.decision_context.pending_op_card !== card) return null;
    const m = E.mask(false);
    const modes = [L.resolutions.OPS_INFLUENCE, L.resolutions.OPS_COUP, L.resolutions.OPS_REALIGN].map(r => L.offsets.play_mode + r);
    const idx = modes.find(i => m[i]);
    if (idx === undefined) return null;
    const player = E.decisionPlayer();
    if (E.step(E.decodeFlat(idx), 0)) return null;
    const after = E.display();
    const budget = after.decision_context.pending_ops_value || after.decision_context.remaining_steps;
    // The engine's budget includes the bonuses that hold only where the Ops are spent
    // (ops.cpp budget_if_spent_in): the China Card's +1 in Asia, Vietnam Revolts' +1 in Southeast Asia.
    const china = card === CHINA_CARD ? 1 : 0;
    const vietnam = player === -1 && after.flags.includes("VIETNAM_REVOLTS_ACTIVE") ? 1 : 0;
    const ops = budget - china - vietnam;
    return ops > 0 ? ops : null;
  } finally {
    E.restore(snap);
  }
}
