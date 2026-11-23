/**
 * Shared test helpers: the engine loaded from public/engine through a file URL, a stub AiPlayer
 * (seeded random legal moves on its own engine instance, as the real worker has its own), and a
 * scripted driver that plays a whole game through the controller as a random human.
 */
import { WasmEngine } from "../../src/engine/wasm_engine";
import type { GameState } from "../../src/engine/types";
import type { AiInfo, AiMove, AiPlayer, Frame, GameEvent, LogEntry, Prompt, PublicState, Side, ViewModel } from "../../src/game/contract";
import { TsGameController, type ControllerDeps } from "../../src/game/controller";
import { MemoryStorage } from "../../src/game/persistence";
import { cardsIn } from "../../src/game/log";
import { aiHeadlineFaceDown, secretCards } from "../../src/game/view";
import { classifyPrompt } from "../../src/game/prompt";
import { countryById, isCardChoice, isScoringCard, otherSide, playerOf, sideOf } from "../../src/game/rules";
import type { Message } from "../../src/i18n";

export const PUBLIC_BASE = new URL("../../public/", import.meta.url).href;

export function loadEngine(): Promise<WasmEngine> {
  return WasmEngine.load(PUBLIC_BASE, { printErr: line => { throw new Error(`unexpected engine stderr: ${line}`); } });
}

/** Mulberry32: a small seeded PRNG for reproducible tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The thinking time the stub AI reports for every decision (ViewModel.aiStats checks). */
export const STUB_AI_MS = 5;

/** A stub AI: a random legal move on its own engine, avoiding moves that lose on the spot. */
export class StubAi implements AiPlayer {
  engine: WasmEngine | null = null;
  calls = 0;
  cancels = 0;
  /** Called with each request before it is answered (protocol checks). */
  onRequest?: (req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }) => void;
  private salt: number;

  constructor(salt = 1, private readonly avoidLosing = true) {
    this.salt = salt;
  }

  async init(): Promise<AiInfo> {
    if (!this.engine) this.engine = await loadEngine();
    return { modelSha256: "stub-sha", search: "stub", obsFeatures: 12, engineFingerprint: this.engine.fingerprint };
  }

  async choose(req: { state: Uint8Array; seed: number; moves: readonly AiMove[] }): Promise<{ idx: number; ms: number }> {
    if (!this.engine) await this.init();
    const E = this.engine!;
    this.calls++;
    this.onRequest?.(req);
    E.restore(req.state);
    const mask = E.mask(false);
    const legal: number[] = [];
    for (let i = 0; i < E.layout.size; i++) if (mask[i]) legal.push(i);
    if (legal.length < 2) throw new Error(`the controller asked the AI at a forced decision (${legal.length} legal)`);
    const rand = mulberry32(req.seed ^ this.salt);
    const me = E.decisionPlayer();
    let pool = legal;
    if (this.avoidLosing) {
      // Coups at DEFCON 2 mostly end the game; a scripted player that avoids them plays longer games.
      if (E.display().defcon <= 2 && rand() < 0.95) {
        const noCoup = pool.filter(idx => idx !== E.layout.offsets.play_mode + E.layout.resolutions.OPS_COUP);
        if (noCoup.length) pool = noCoup;
      }
      const snap = E.snapshot();
      const safe = pool.filter(idx => {
        if (E.step(E.decodeFlat(idx), 0)) return false;
        const lost = E.isTerminal() && Math.sign(E.terminalUtility()) === -me;
        E.restore(snap);
        return !lost;
      });
      if (safe.length) pool = safe;
    }
    return { idx: pool[Math.floor(rand() * pool.length)], ms: STUB_AI_MS };
  }

  cancel(): void { this.cancels++; }
  dispose(): void { /* nothing */ }
}

export interface Harness {
  ctrl: TsGameController;
  ai: StubAi;
  storage: MemoryStorage;
  engine: () => WasmEngine;
  /** The unredacted state each frame / log entry was made from (controller debug hooks). */
  rawFrames: Map<number, GameState>;
  rawLogs: Map<number, GameState>;
  /** The engine's saveJson() when the last frame was pushed (the position a prompt opens at). */
  lastFrameSave: { value: string };
  /** Per frame: the RNG state after its step, and the step's raw display before it (none for system frames). */
  frameRng: Map<number, string>;
  frameStep: Map<number, { before: GameState; part: number }>;
  /** Every prompt built, with its build time (debug.onPromptBuilt). */
  builds: Array<{ kind: string; options: number; ms: number }>;
}

export function makeController(opts: Partial<ControllerDeps> & { aiSalt?: number; engine?: WasmEngine; storage?: MemoryStorage; seed?: number } = {}): Harness {
  const ai = (opts.ai as StubAi | undefined) ?? new StubAi(opts.aiSalt ?? 1);
  const storage = opts.storage ?? new MemoryStorage();
  const rand = mulberry32(opts.seed ?? 12345);
  const rawFrames = new Map<number, GameState>();
  const rawLogs = new Map<number, GameState>();
  const lastFrameSave = { value: "" };
  const frameRng = new Map<number, string>();
  const frameStep = new Map<number, { before: GameState; part: number }>();
  const builds: Harness["builds"] = [];
  const ctrl: TsGameController = new TsGameController({
    loadEngine: opts.engine ? async () => opts.engine! : loadEngine,
    ai, storage, random: rand, minAiDelayMs: 0, sleep: async () => { /* no delay */ },
    onError: () => { /* status error is asserted by the driver */ },
    debug: {
      onFrame: (f, raw, step) => {
        rawFrames.set(f.seq, raw);
        lastFrameSave.value = ctrl.engineForDiagnostics?.saveJson() ?? "";
        frameRng.set(f.seq, /"rng_state":(\d+)/.exec(lastFrameSave.value)?.[1] ?? "");
        if (step) frameStep.set(f.seq, step);
      },
      onLog: (e, raw) => rawLogs.set(e.id, raw),
      onPromptBuilt: (p, ms) => builds.push({ kind: p.kind, options: p.options.length, ms }),
    },
    ...opts,
  });
  return { ctrl, ai, storage, engine: () => ctrl.engineForDiagnostics!, rawFrames, rawLogs, lastFrameSave, frameRng, frameStep, builds };
}

export const tick = () => new Promise<void>(resolve => setImmediate(resolve));

/** What a driven game saw, for coverage and assertions. */
export interface GameRecord {
  frames: number;
  prompts: number;
  steps: number;
  promptKinds: Map<string, number>;
  humanResolving: Map<number, number>;
  warnings: Map<string, number>;
  /** Prompt title message ids, and option kinds, seen. */
  titles: Map<string, number>;
  optionKinds: Map<string, number>;
  undos: number;
  ending: ViewModel["ending"];
  humanSide: Side;
  leaks: string[];
  problems: string[];
  /** The option previews checked against what the chosen option did (see `checkChoice`). */
  checks: ChoiceChecks;
}

export interface ChoiceChecks {
  /** Choices whose `endsPlay` was compared with what happened; of those, the play ended. */
  endsPlay: number;
  ended: number;
  /** endsPlay true, the play went on: a die or a draw decided it (allowed, "at least one outcome"). */
  endsPlayOther: number;
  cost: number;
  /** Event-target effects verified, by "card:verb:side-relative-to-the-human". */
  effects: Map<string, number>;
  /** Realignment rolls whose result was among realignOdds' outcomes. */
  realign: number;
  /** Frames whose playId was checked; plays seen. */
  playFrames: number;
  plays: number;
  aiStats: number;
  savedGame: number;
  /** Frames whose hands were accounted for (both sides); cards dealt (drawn) by side; frames with a reshuffle. */
  handFrames: number;
  dealt: { US: number; USSR: number };
  /** Cards entering a hand other than by a draw (Missile Envy, Grain Sales, SALT, undo...). */
  gained: number;
  reshuffles: number;
  /** Scoring-card plays (each with its `scoring` event); of those, scored 0 net. */
  scorings: number;
  zeroScorings: number;
  /** card-moved.fromHand: moves marked; random discards / takes checked, by the card that caused them (5, 49, 67, 92). */
  fromHandMarks: number;
  fromHandCauses: Map<number, number>;
  /** USSR headlines cancelled by Defectors (no card-played, one log line each). */
  cancelledHeadlines: number;
}

export function emptyChecks(): ChoiceChecks {
  return {
    endsPlay: 0, ended: 0, endsPlayOther: 0, cost: 0, effects: new Map(), realign: 0, playFrames: 0, plays: 0, aiStats: 0, savedGame: 0,
    handFrames: 0, dealt: { US: 0, USSR: 0 }, gained: 0, reshuffles: 0, scorings: 0, zeroScorings: 0,
    fromHandMarks: 0, fromHandCauses: new Map(), cancelledHeadlines: 0,
  };
}

const SIDES = ["US", "USSR"] as const;

function inHandOf(loc: string | undefined, side: Side): boolean {
  return loc === `HAND_${side}_KNOWN` || loc === `HAND_${side}_UNKNOWN`;
}

/**
 * Hand accounting for one frame (raw states of the previous frame and of this one): per side, the
 * hand-size increase is the `deal` count plus the cards gained by other visible means (a
 * `card-moved` into the hand) minus the cards that left. The deal counts exactly the cards drawn --
 * from the deck, from the new era's cards (turns 4 and 8) or from the reshuffled discard pile -- for
 * both sides; the human sees each card it draws (a `card-moved`); a reshuffle has its event.
 */
function checkHands(f: Frame, pr: GameState, r: GameState, human: Side, rec: GameRecord): void {
  const pl = pr.card_locations ?? {};
  const rl = r.card_locations ?? {};
  const pub = f.state.card_locations ?? {};
  const reshuffle = f.events.some(e => e.t === "reshuffle");
  const moved = (id: number, side: Side) => f.events.some(e => e.t === "card-moved" && e.card === id && e.to === pub[String(id)] && inHandOf(e.to, side));
  let reshuffled = false;
  for (let id = 1; id <= 110; id++) {
    if (pl[String(id)] === "DISCARD_PILE" && (rl[String(id)] === "DRAW_DECK" || rl[String(id)] === "PEEKED_TEMP")) reshuffled = true;
  }
  if (reshuffled !== reshuffle) rec.problems.push(`frame ${f.seq}: discarded cards back in the deck ${reshuffled}, reshuffle event ${reshuffle}`);
  // A card a side discards or gives is its own (not Aldrich Ames' pick, not Our Man in Tehran's peek).
  for (const e of f.events) {
    if (e.t === "card-played" && (e.how === "discard" || e.how === "give") && !inHandOf(pl[String(e.card)], e.side)) {
      rec.problems.push(`frame ${f.seq}: ${e.side} ${e.how}s card ${e.card} from ${pl[String(e.card)]}`);
    }
  }
  if (reshuffle) rec.checks.reshuffles++;
  for (const side of SIDES) {
    const deal = f.events.reduce((n, e) => n + (e.t === "deal" && e.side === side ? e.count : 0), 0);
    if (f.events.some(e => e.t === "deal" && e.side === side && !(e.count > 0))) rec.problems.push(`frame ${f.seq}: an empty deal`);
    const entered: number[] = [];
    let left = 0;
    let before = 0;
    let after = 0;
    for (let id = 1; id <= 110; id++) {
      const was = inHandOf(pl[String(id)], side);
      const now = inHandOf(rl[String(id)], side);
      before += was ? 1 : 0;
      after += now ? 1 : 0;
      if (!was && now) entered.push(id);
      if (was && !now) left++;
    }
    const drawnFrom = (id: number) => {
      const loc = pl[String(id)];
      return loc === "DRAW_DECK" || loc === "UNAVAILABLE" || (loc === "DISCARD_PILE" && reshuffle);
    };
    const drawn = entered.filter(drawnFrom);
    const other = entered.filter(id => !drawnFrom(id));
    const visible = other.filter(id => moved(id, side));
    if (after - before !== deal + visible.length - left) {
      rec.problems.push(`frame ${f.seq}: ${side} hand ${before} -> ${after}, but deal ${deal} + gained ${visible.length} - left ${left}`
        + ` (drawn ${drawn.join(",")}; gained ${other.map(id => `${id}:${pl[String(id)]}`).join(",")})`);
    }
    if (deal !== drawn.length) rec.problems.push(`frame ${f.seq}: deal ${side} ${deal}, drew ${drawn.length} (${drawn.map(id => `${id}:${pl[String(id)]}`).join(",")})`);
    if (side === human) for (const id of drawn) if (!moved(id, side)) rec.problems.push(`frame ${f.seq}: the human drew ${id} without a card-moved`);
    rec.checks.dealt[side] += deal;
    rec.checks.gained += visible.length;
  }
  rec.checks.handFrames++;
}

/** Cards whose Event takes cards out of the opponent's hand at random or by force: Five Year Plan, Missile Envy, Grain Sales, Terrorism. */
export const HAND_TAKERS: ReadonlySet<number> = new Set([5, 49, 67, 92]);
const OWN_PLAY = new Set(["event", "space", "influence", "coup", "realign", "scoring", "headline"]);

/**
 * card-moved.fromHand (contract.ts), against the raw state before the frame (`pr`): set only on a move out of the AI's
 * hidden hand (from UNSEEN) to a public place outside it, never on the AI's own played card unless it lands in the
 * human's hand; always set on a move from the AI's hidden hand into the human's, and when a card leaves the AI's hidden
 * hand while Five Year Plan, Terrorism, Grain Sales or Missile Envy is in play or played in the frame (the random
 * discards and takes), except that card itself.
 */
function checkHandOrigins(f: Frame, pr: GameState, step: { before: GameState } | undefined, human: Side, rec: GameRecord): void {
  const ai = otherSide(human);
  const pl = pr.card_locations ?? {};
  const c = step?.before.decision_context;
  const causes = new Set<number>([c?.resolving_card ?? 0, c?.pending_op_card ?? 0]);
  for (const e of f.events) if (e.t === "card-played") causes.add(e.card);
  // The AI's own plays: its cards played in the frame, and its headline (revealed with the human's).
  const played = new Set(f.events.flatMap(e => (e.t === "card-played" && e.side === ai && OWN_PLAY.has(e.how) ? [e.card] : [])));
  for (const e of f.events) if (e.t === "headline-reveal") played.add(ai === "US" ? e.us : e.ussr);
  for (const d of [pr, step?.before]) {
    const hl = d && (ai === "US" ? d.headline_us_card : d.headline_ussr_card);
    if (hl) played.add(hl);
  }
  const cause = [...causes].find(x => HAND_TAKERS.has(x));
  for (const e of f.events) {
    if (e.t !== "card-moved") continue;
    const left = e.from === "UNSEEN" && inHandOf(pl[String(e.card)], ai) && e.to !== "UNSEEN" && !inHandOf(e.to, ai);
    if (e.fromHand !== undefined) {
      rec.checks.fromHandMarks++;
      if (e.fromHand !== ai || !left) rec.problems.push(`frame ${f.seq}: card ${e.card} ${e.from} -> ${e.to} (raw ${pl[String(e.card)]}) marked fromHand ${e.fromHand}`);
      if (played.has(e.card) && !inHandOf(e.to, human)) rec.problems.push(`frame ${f.seq}: the AI's own played card ${e.card} marked fromHand`);
    }
    // Out of the AI's hidden hand into the human's: always marked (Grain Sales, Missile Envy either way).
    if (left && inHandOf(e.to, human) && e.fromHand !== ai) rec.problems.push(`frame ${f.seq}: card ${e.card} went from the AI's hand to the human's without fromHand`);
    if (cause !== undefined && left && !causes.has(e.card) && !played.has(e.card)) {
      if (e.fromHand !== ai) rec.problems.push(`frame ${f.seq}: card ${e.card} left the AI's hand by card ${cause} (${e.from} -> ${e.to}) without fromHand`);
      rec.checks.fromHandCauses.set(cause, (rec.checks.fromHandCauses.get(cause) ?? 0) + 1);
    }
  }
}

/** Every scoring-card play has its `scoring` event in the same frame (net 0 included), and back. */
function checkScoring(f: Frame, rec: GameRecord): void {
  for (const e of f.events) {
    if (e.t === "card-played" && isScoringCard(e.card) && (e.how === "scoring" || e.how === "headline" || e.how === "event")) {
      const s = f.events.filter(x => x.t === "scoring" && x.card === e.card);
      if (s.length !== 1) rec.problems.push(`frame ${f.seq}: ${e.side} plays scoring card ${e.card} (${e.how}) with ${s.length} scoring events`);
      rec.checks.scorings++;
      if (s.length === 1 && s[0].t === "scoring" && s[0].vp === 0) rec.checks.zeroScorings++;
    } else if (e.t === "scoring" && !f.events.some(x => x.t === "card-played" && x.card === e.card)) {
      rec.problems.push(`frame ${f.seq}: scoring event for card ${e.card} that was not played in the frame`);
    }
  }
}

/** The draw counts the log tells, by side: the human's draws name the cards, the AI's are counts only. */
function logDraws(entry: LogEntry, human: Side, tally: Record<Side, number>, problems: string[]): void {
  for (const m of [entry.text, ...(entry.details ?? [])]) {
    const side = (m.params?.side as { side?: Side } | undefined)?.side;
    const count = Number(m.params?.count ?? 0);
    if (m.key === "log:card.draws" || m.key === "prompt:log.drawsHidden") {
      if (!side) { problems.push(`log ${entry.id}: a draw line without a side`); continue; }
      if (m.key === "log:card.draws" && side !== human) problems.push(`log ${entry.id}: the AI's draws named card by card`);
      if (m.key === "prompt:log.drawsHidden" && side === human) problems.push(`log ${entry.id}: the human's draws told by count`);
      tally[side] += count;
    }
  }
}

/** What the driver remembers about a choice until the next prompt shows what it did. */
interface PendingChoice {
  prompt: Prompt;
  option: Prompt["options"][number];
  /** Unredacted display at the prompt. */
  raw: GameState;
  /** Frames pushed since the choice. */
  frames: Frame[];
  realign: ReturnType<TsGameController["realignOdds"]> | null;
  /** RNG state at the prompt. */
  rng: string;
}

/** Every card a message names. */
function msgCards(m: Message | undefined): number[] {
  return m ? cardsIn(m) : [];
}

/** Cards an event names, and whether it names them only as "out of sight". */
function eventCards(e: GameEvent): Array<{ card: number; hiddenOk: boolean }> {
  switch (e.t) {
    case "card-played": return e.card ? [{ card: e.card, hiddenOk: false }] : [];
    case "card-moved": return [{ card: e.card, hiddenOk: e.to === "UNSEEN" }];
    case "headline-reveal": return [{ card: e.us, hiddenOk: false }, { card: e.ussr, hiddenOk: false }];
    case "hand-revealed": return e.cards.map(card => ({ card, hiddenOk: false }));
    case "scoring": return [{ card: e.card, hiddenOk: false }];
    default: return [];
  }
}

export interface DriveOptions {
  rand: () => number;
  /** Probability of avoiding an option with a game-ending warning (longer games). */
  avoidWarned?: number;
  /** Probability of pressing undo when offered. */
  undoRate?: number;
  /** Stop after this many prompts (to test resume mid-game); the game is left running. */
  stopAfterPrompts?: number;
  maxIterations?: number;
  /** Fail when no prompt or ending comes for this long (ms). Default 240 s. */
  timeoutMs?: number;
  /** Called at every visible prompt. */
  onPrompt?: (p: Prompt, vm: ViewModel) => void;
}

/**
 * Drive the controller's current game as a scripted random human until it ends, checking every
 * frame, log entry and prompt against the unredacted engine at the moment it appears.
 */
export async function drive(h: Harness, opts: DriveOptions): Promise<GameRecord> {
  const { ctrl } = h;
  const rec: GameRecord = {
    frames: 0, prompts: 0, steps: 0, promptKinds: new Map(), humanResolving: new Map(), warnings: new Map(), titles: new Map(),
    optionKinds: new Map(), undos: 0,
    ending: null, humanSide: ctrl.getSnapshot().humanSide!, leaks: [], problems: [], checks: emptyChecks(),
  };
  let pending: PendingChoice | null = null;
  // Plays (Frame.playId): the last id seen, the last setup actor, the raw state of the last frame.
  let lastPlay: number | undefined;
  let lastSetupActor: Side | null = null;
  const human = rec.humanSide;
  const ai = otherSide(human);
  // What exists already (a resumed game's rebuilt log) was checked when it was first played.
  let lastFrameSeq = 0;
  let lastLogId = Math.max(0, ...ctrl.getSnapshot().log.map(e => e.id));
  let prev: PublicState | null = ctrl.getSnapshot().frame?.state ?? null;
  let prevRaw: GameState | null = null;
  const logDrawn: Record<Side, number> = { US: 0, USSR: 0 };
  const seenPrompt = new Set<number>();
  // After a headline reveal, both headlines are announced as played before the next turn, except a USSR headline
  // cancelled by Defectors (headlined by the US, or fired in the headline phase by a random discard...): that one goes
  // to the discard pile without a card-played, and the log says so (prompt:log.headlineCancelled).
  let headlinesOwed = 0;
  let revealed: { us: number; ussr: number } | null = null;
  let cancelledHeadlines = 0;

  // Frame.playId: a play starts at a card choice's answer, a headline starting to resolve, or a
  // side's first setup point, and runs until the next start; the turn's end (a system frame) closes it.
  let afterTurnEnd = false;
  const checkPlay = (f: Frame) => {
    const c = rec.checks;
    c.playFrames++;
    if (f.actor === null) {
      if (f.playId !== undefined) rec.problems.push(`frame ${f.seq}: system frame with playId ${f.playId}`);
      if (f.events.some(e => e.t === "turn-start")) afterTurnEnd = true;
      return;
    }
    if (f.playId === undefined) { rec.problems.push(`frame ${f.seq}: no playId`); return; }
    const step = h.frameStep.get(f.seq);
    if (!step) { rec.problems.push(`frame ${f.seq}: no step`); return; }
    const headline = f.events.some(e => e.t === "card-played" && e.how === "headline");
    const answered = step.part === 0 && isCardChoice(step.before);
    const inSetup = step.before.current_phase_name === "SETUP";
    const setup = step.part === 0 && inSetup && f.actor !== lastSetupActor;
    if (inSetup) lastSetupActor = f.actor;
    const starts = headline || answered || setup;
    if (f.events.some(e => e.t === "headline-chosen") && !answered) rec.problems.push(`frame ${f.seq}: a headline choice that answers no card choice`);
    if (afterTurnEnd && !starts) rec.problems.push(`frame ${f.seq}: the first frame after a turn's end starts no play`);
    if (lastPlay !== undefined) {
      if (starts && f.playId <= lastPlay) rec.problems.push(`frame ${f.seq}: a new play keeps id ${f.playId} (last ${lastPlay})`);
      if (!starts && f.playId !== lastPlay) rec.problems.push(`frame ${f.seq}: playId ${f.playId} within play ${lastPlay} (${f.events.map(e => e.t).join(",")})`);
    }
    // A card's mode (and Grain Sales' UN Intervention) belongs to the play its choice started.
    if (f.events.some(e => e.t === "card-played" && ["event", "space", "influence", "coup", "realign"].includes(e.how)) && answered) {
      rec.problems.push(`frame ${f.seq}: a card's mode answers a card choice`);
    }
    if (starts) c.plays++;
    lastPlay = f.playId;
    afterTurnEnd = false;
  };

  const checkFrame = (f: Frame) => {
    rec.frames++;
    const raw = h.rawFrames.get(f.seq);
    if (!raw) { rec.problems.push(`frame ${f.seq} has no raw state`); return; }
    checkPlay(f);
    if (prevRaw) checkHands(f, prevRaw, raw, human, rec);
    if (prevRaw) checkHandOrigins(f, prevRaw, h.frameStep.get(f.seq), human, rec);
    prevRaw = raw;
    checkScoring(f, rec);
    pending?.frames.push(f);
    const secrets = secretCards(raw, human);
    // Cards the human saw before this frame are known wherever they went since.
    const visibleBefore = (card: number) => !!prev && prev.card_locations?.[String(card)] !== "UNSEEN";
    const st = f.state;
    for (const card of secrets) {
      if (visibleBefore(card)) continue;
      if (st.card_locations?.[String(card)] !== "UNSEEN") rec.leaks.push(`frame ${f.seq}: card ${card} location ${st.card_locations?.[String(card)]}`);
      if (st.hands[ai].includes(card) || st.aiKnownCards.includes(card)) rec.leaks.push(`frame ${f.seq}: card ${card} in the AI hand`);
      for (const e of f.events) {
        for (const x of eventCards(e)) {
          if (x.card === card && !x.hiddenOk) rec.leaks.push(`frame ${f.seq}: event ${e.t} names card ${card}`);
        }
      }
    }
    if (aiHeadlineFaceDown(raw, human)) {
      const hl = ai === "US" ? st.headline_us_card : st.headline_ussr_card;
      if (hl) rec.leaks.push(`frame ${f.seq}: the AI's face-down headline ${hl} is shown`);
      const real = ai === "US" ? raw.headline_us_card : raw.headline_ussr_card;
      for (const e of f.events) for (const x of eventCards(e)) if (x.card === real && !x.hiddenOk && !visibleBefore(real)) rec.leaks.push(`frame ${f.seq}: event names the face-down headline`);
      if (!st.aiHeadlineHidden) rec.problems.push(`frame ${f.seq}: aiHeadlineHidden false while face down`);
    }
    if (st.aiHandCount !== (raw.hands[ai]?.length ?? 0)) rec.problems.push(`frame ${f.seq}: aiHandCount ${st.aiHandCount} != ${raw.hands[ai]?.length}`);
    if (st.aiHandCount !== st.hands[ai].length + (st.hidden_cards?.[ai] ?? 0)) rec.problems.push(`frame ${f.seq}: aiHandCount inconsistent`);
    for (const e of f.events) {
      if (e.t === "headline-reveal") {
        headlinesOwed = 2;
        revealed = { us: e.us, ussr: e.ussr };
      } else if (e.t === "card-played" && e.how === "headline") {
        headlinesOwed--;
        if (revealed && e.card === revealed.ussr && (revealed.us === 103 || raw.headline_second_card === 0 && raw.headline_first_card !== e.card)) {
          rec.problems.push(`frame ${f.seq}: the USSR headline ${e.card} announced as played although Defectors cancelled it`);
        }
      } else if (e.t === "card-moved" && revealed && headlinesOwed > 0 && e.card === revealed.ussr && e.to === "DISCARD_PILE"
                 && !f.events.some(x => x.t === "card-played" && x.card === e.card)) {
        // Unplayed out of the headline: only Defectors cancels a headline.
        const defectors = revealed.us === 103 || f.events.some(x => x.t === "card-moved" && x.card === 103);
        if (!defectors) rec.problems.push(`frame ${f.seq}: the USSR headline ${e.card} discarded unplayed without Defectors`);
        headlinesOwed--;
        cancelledHeadlines++;
      } else if (e.t === "turn-start" && headlinesOwed > 0) {
        rec.problems.push(`frame ${f.seq}: ${headlinesOwed} headline(s) never announced as played`);
      }
    }
    // Influence events sum to the board's change.
    if (prev) {
      const sum = new Map<string, number>();
      for (const e of f.events) if (e.t === "influence") sum.set(`${e.country}:${e.side}`, (sum.get(`${e.country}:${e.side}`) ?? 0) + e.to - e.from);
      for (const c of Object.values(st.countries)) {
        const p = Object.values(prev.countries).find(x => x.id === c.id)!;
        const du = c.us_influence - p.us_influence;
        const dr = c.ussr_influence - p.ussr_influence;
        if ((sum.get(`${c.id}:US`) ?? 0) !== du || (sum.get(`${c.id}:USSR`) ?? 0) !== dr) {
          rec.problems.push(`frame ${f.seq}: influence events for country ${c.id} do not sum to the board's change`);
        }
      }
    }
    prev = st;
  };

  let loggedCancels = 0;
  const checkLog = (entry: LogEntry) => {
    logDraws(entry, human, logDrawn, rec.problems);
    loggedCancels += [entry.text, ...(entry.details ?? [])].filter(m => m.key === "prompt:log.headlineCancelled").length;
    const raw = h.rawLogs.get(entry.id) ?? h.engine().display();
    const secrets = secretCards(raw, human);
    // The tournament rule reveals a scoring card held at the end of the turn: the game is over.
    for (const c of ctrl.getSnapshot().ending?.cards ?? []) secrets.delete(c);
    const named = [...msgCards(entry.text), ...(entry.details ?? []).flatMap(d => msgCards(d)), ...(entry.card ? [entry.card] : [])];
    for (const card of named) {
      if (secrets.has(card) && prev?.card_locations?.[String(card)] === "UNSEEN") rec.leaks.push(`log ${entry.id}: names hidden card ${card} (${JSON.stringify(entry.text)}) raw ${raw.card_locations?.[String(card)]} ctx ${raw.decision_context.decision_type}/${raw.decision_context.resolving_card} hl ${raw.headline_us_card}/${raw.headline_ussr_card}`);
    }
    if (aiHeadlineFaceDown(raw, human)) {
      const real = ai === "US" ? raw.headline_us_card : raw.headline_ussr_card;
      if (named.includes(real) && entry.kind === "headline" && entry.side === ai) rec.leaks.push(`log ${entry.id}: names the AI's face-down headline`);
    }
  };

  const listener = () => {
    const vm = ctrl.getSnapshot();
    for (const e of vm.log) {
      if (e.id <= lastLogId) continue;
      lastLogId = e.id;
      checkLog(e);
    }
    const f = vm.frame;
    if (f && f.seq > lastFrameSeq) {
      lastFrameSeq = f.seq;
      checkFrame(f);
      ctrl.ackFrame(f.seq);
    }
  };
  const unsubscribe = ctrl.subscribe(listener);
  listener();

  const maxIterations = opts.maxIterations ?? 2_000_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  let idle = 0;
  try {
    for (let it = 0; it < maxIterations; it++) {
      const vm = ctrl.getSnapshot();
      if (vm.status === "error") throw new Error(`controller error: ${vm.error}`);
      if (vm.status === "over") break;
      const p = vm.prompt;
      if (!p) {
        // Waiting for the AI: microtask ticks first, then real time (a real AI computes for a while).
        if (Date.now() > deadline) throw new Error("the game stalled: no prompt and no ending");
        if (++idle < 1000) await tick();
        else await new Promise<void>(resolve => setTimeout(resolve, 2));
        continue;
      }
      idle = 0;
      if (seenPrompt.has(p.promptId)) throw new Error(`prompt ${p.promptId} offered twice`);
      seenPrompt.add(p.promptId);
      rec.prompts++;
      if (pending) checkChoice(h, pending, p, rec);
      pending = null;
      checkPrompt(h, p, rec, human, prev);
      checkViewModel(h, vm, rec);
      opts.onPrompt?.(p, vm);
      if (opts.stopAfterPrompts !== undefined && rec.prompts >= opts.stopAfterPrompts) break;
      if (vm.canUndo && opts.undoRate && opts.rand() < opts.undoRate) {
        undoChecked(h, rec);
        continue;
      }
      const idx = pickOption(p, { ...opts, defcon: vm.frame?.state.defcon });
      const option = p.options.find(o => o.idx === idx)!;
      const realign = option.kind === "country" ? ctrl.realignOdds(option.id) : null;
      pending = { prompt: p, option, raw: h.engine().display(), frames: [], realign, rng: h.engine().rngState() };
      ctrl.choose(p.promptId, idx);
    }
    if (pending && ctrl.getSnapshot().status === "over") checkChoice(h, pending, null, rec);
  } finally {
    unsubscribe();
  }
  // Each cancelled headline has its log line.
  if (loggedCancels !== cancelledHeadlines) rec.problems.push(`${cancelledHeadlines} headline(s) cancelled, ${loggedCancels} cancellation line(s) logged`);
  rec.checks.cancelledHeadlines += cancelledHeadlines;
  // The log's draw lines agree with the deal events (every frame and log entry was released by now).
  for (const side of SIDES) {
    if (logDrawn[side] !== rec.checks.dealt[side]) rec.problems.push(`the log tells ${logDrawn[side]} ${side} draws, the deal events ${rec.checks.dealt[side]}`);
  }
  const vm = ctrl.getSnapshot();
  rec.ending = vm.ending;
  rec.steps = ctrl.stepActors().length;
  return rec;
}

function pickOption(p: Prompt, opts: DriveOptions & { defcon?: number }): number {
  const r = opts.rand;
  const bad = (o: Prompt["options"][number]) => (o.warnings ?? []).some(w => w.code !== "opponent-event");
  let pool = p.options;
  if (opts.avoidWarned && r() < opts.avoidWarned) {
    const good = p.options.filter(o => !bad(o));
    if (good.length) pool = good;
    // Coups at DEFCON 2 end most games early: a scripted human mostly avoids choosing them.
    const noCoup = pool.filter(o => !((o.kind === "mode" && o.id === 3) || (o.kind === "op-mode" && o.id === 1)));
    if (opts.defcon !== undefined && opts.defcon <= 2 && noCoup.length) pool = noCoup;
  }
  // Prefer real moves over "done" a little, so events get resolved rather than skipped.
  if (pool.length > 1 && p.done && r() < 0.7) pool = pool.filter(o => o.kind !== "done");
  return pool[Math.floor(r() * pool.length)].idx;
}

function checkPrompt(h: Harness, p: Prompt, rec: GameRecord, human: Side, prev: PublicState | null): void {
  const E = h.engine();
  const raw = E.display();
  if (E.decisionPlayer() !== playerOf(human)) rec.problems.push(`prompt ${p.promptId} while the human does not decide`);
  if (p.options.length < 1) rec.problems.push(`prompt ${p.promptId} has no option`);
  const mask = E.mask(false);
  let legal = 0;
  for (let i = 0; i < E.layout.size; i++) legal += mask[i];
  if (legal !== p.options.length) rec.problems.push(`prompt ${p.promptId}: ${p.options.length} options for ${legal} legal actions`);
  for (const o of p.options) {
    if (!mask[o.idx]) rec.problems.push(`prompt ${p.promptId}: option ${o.idx} is not legal`);
    for (const w of o.warnings ?? []) rec.warnings.set(w.code, (rec.warnings.get(w.code) ?? 0) + 1);
  }
  if (legal === 1) rec.problems.push(`prompt ${p.promptId}: a single-legal decision was not auto-played`);
  rec.promptKinds.set(p.kind, (rec.promptKinds.get(p.kind) ?? 0) + 1);
  rec.titles.set(p.title.key, (rec.titles.get(p.title.key) ?? 0) + 1);
  for (const o of p.options) rec.optionKinds.set(o.kind, (rec.optionKinds.get(o.kind) ?? 0) + 1);
  rec.humanResolving.set(p.resolvingCard, (rec.humanResolving.get(p.resolvingCard) ?? 0) + 1);
  const secrets = secretCards(raw, human);
  const named = [...msgCards(p.title), ...msgCards(p.detail), ...p.cards];
  for (const c of named) if (secrets.has(c) && prev?.card_locations?.[String(c)] === "UNSEEN") rec.leaks.push(`prompt ${p.promptId} (${p.kind}, resolving ${p.resolvingCard}, pending ${p.pendingCard}, ${raw.card_locations?.[String(c)]}) names hidden card ${c}`);
}

/**
 * What the chosen option did, against its previews: `endsPlay` (an ended play must have been
 * announced; an announced end that did not happen needs a die or a draw), `cost` (the real drop of
 * `remaining`), the event-target `effect` (the board's change in the country), and the realignment
 * roll (one of realignOdds' outcomes). `next` is the next human prompt (null: the game ended).
 */
function checkChoice(h: Harness, pc: PendingChoice, next: Prompt | null, rec: GameRecord): void {
  const { prompt: p, option: o, frames } = pc;
  const human = rec.humanSide;
  const c = rec.checks;
  const first = frames[0];
  if (!first || first.actor !== human || first.auto) { rec.problems.push(`prompt ${p.promptId}: no frame for the human's step`); return; }
  const raw = h.rawFrames.get(first.seq)!;
  const stepFrames = frames.filter(f => f.actor === human && !f.auto);

  // endsPlay
  const ai = otherSide(human);
  const ended = next === null || frames.some(f => f.actor === ai) || frames.some(f => f.playId !== first.playId && f.actor !== null)
    || frames.some(f => f.actor === null && f.events.some(e => e.t === "turn-start"))
    || next.kind === "action-card" || next.kind === "headline" || (next.kind === "event-card" && next.resolvingCard === 250);
  if (o.endsPlay === undefined) rec.problems.push(`prompt ${p.promptId}: option ${o.idx} has no endsPlay`);
  c.endsPlay++;
  if (ended) {
    c.ended++;
    if (o.endsPlay === false) rec.problems.push(`prompt ${p.promptId} (${p.kind}, card ${p.resolvingCard || p.pendingCard}): option ${o.kind} ${o.id} ended the play but endsPlay is false`);
  } else if (o.endsPlay) {
    // Allowed when chance or hidden cards decided it: a die rolled, the RNG moved (a random discard,
    // a draw), or something hidden came to light.
    const chance = h.frameRng.get(first.seq) !== pc.rng || stepFrames.some(f => f.events.some(e => e.t === "roll" || e.t === "deal"
      || e.t === "reshuffle" || e.t === "hand-revealed" || e.t === "headline-reveal" || (e.t === "card-moved" && e.from === "UNSEEN")));
    if (chance) c.endsPlayOther++;
    else rec.problems.push(`prompt ${p.promptId} (${p.kind}, card ${p.resolvingCard || p.pendingCard}): option ${o.kind} ${o.id} has endsPlay but the play went on`);
  }

  // cost
  const costKind = p.kind === "setup-place" || p.kind === "bid-place" || p.kind === "influence";
  if (costKind && o.kind === "country") {
    const a = raw.decision_context;
    const same = a.decision_type === p.decisionType && sideOf(a.decision_player) === human && a.pending_op_card === p.pendingCard
      && a.resolving_card === p.resolvingCard && a.remaining_steps < p.remaining && raw.current_phase_name === pc.raw.current_phase_name
      && classifyPrompt(raw, h.engine().layout) === p.kind;
    const want = same ? p.remaining - a.remaining_steps : p.remaining;
    if (o.cost !== want) rec.problems.push(`prompt ${p.promptId} (${p.kind}): cost ${o.cost} of country ${o.id}, remaining dropped by ${want}`);
    c.cost++;
  } else if (o.cost !== undefined) {
    rec.problems.push(`prompt ${p.promptId} (${p.kind}): option ${o.kind} has a cost`);
  }

  // effect
  if (p.kind === "event-target" && o.kind === "country") {
    const e = p.effect;
    if (!e) rec.problems.push(`prompt ${p.promptId}: event-target without effect`);
    else {
      const was = countryById(pc.raw, o.id)!;
      const now = countryById(raw, o.id)!;
      const d = { US: now.us_influence - was.us_influence, USSR: now.ussr_influence - was.ussr_influence };
      const rolled = first.events.some(x => x.t === "roll" && x.roll.country_id === o.id);
      const ok = e.verb === "add" ? d[e.side] > 0 : e.verb === "remove" ? d[e.side] < 0 : rolled || (d.US === 0 && d.USSR === 0);
      if (!ok) rec.problems.push(`prompt ${p.promptId}: effect ${e.verb} ${e.side} (card ${p.resolvingCard}) but country ${o.id} changed ${JSON.stringify(d)}${rolled ? " after a roll" : ""}`);
      const key = `${p.resolvingCard}:${e.verb}:${e.side === human ? "own" : "opp"}`;
      c.effects.set(key, (c.effects.get(key) ?? 0) + 1);
    }
  } else if (p.effect && p.kind !== "event-target") {
    rec.problems.push(`prompt ${p.promptId} (${p.kind}) has an effect`);
  }

  // realignment roll
  if (p.kind === "realign-target" && o.kind === "country") {
    const roll = first.events.find(x => x.t === "roll" && x.roll.type === "REALIGNMENT");
    if (!pc.realign || !roll || roll.t !== "roll") rec.problems.push(`prompt ${p.promptId}: realignOdds ${JSON.stringify(pc.realign)} / roll ${!!roll}`);
    else {
      const r = roll.roll;
      const amount = r.net_delta ?? 0;
      const side = amount <= 0 || r.total1 === r.total2 ? "NONE" : (r.total1 ?? 0) > (r.total2 ?? 0) ? "USSR" : "US";
      const hit = pc.realign.outcomes.find(x => x.side === side && x.amount === (side === "NONE" ? 0 : amount));
      if (!hit || hit.p <= 0) rec.problems.push(`prompt ${p.promptId}: realignment ${side} -${amount} is not among ${JSON.stringify(pc.realign.outcomes)}`);
      c.realign++;
    }
  }
}

/** The view model at a prompt: the AI's stats and the save summary match the game. */
function checkViewModel(h: Harness, vm: ViewModel, rec: GameRecord): void {
  const ai = otherSide(rec.humanSide);
  const decisions = h.ctrl.stepActors().filter(s => s.by === ai && !s.auto).length;
  const ms = h.ai instanceof StubAi ? decisions * STUB_AI_MS : vm.aiStats?.ms;
  if (vm.aiStats?.decisions !== decisions || vm.aiStats?.ms !== ms || !(ms! >= 0)) {
    rec.problems.push(`aiStats ${JSON.stringify(vm.aiStats)} after ${decisions} AI decisions`);
  }
  rec.checks.aiStats++;
  const d = h.engine().display();
  const want = { turn: d.turn, ar: d.current_phase_name === "ACTION_ROUND" ? d.action_round : 0, humanSide: rec.humanSide };
  const got = vm.savedGame;
  if (!vm.hasSavedGame || !got || got.turn !== want.turn || got.ar !== want.ar || got.humanSide !== want.humanSide || !(got.savedAt > 0)) {
    rec.problems.push(`savedGame ${JSON.stringify(got)} at ${JSON.stringify(want)}`);
  }
  rec.checks.savedGame++;
  // The prompt's previews left the position exactly where the last frame left it (rng_state included).
  if (h.engine().saveJson() !== h.lastFrameSave.value) rec.problems.push(`building prompt ${vm.prompt?.promptId} (${vm.prompt?.kind}) changed the engine`);
}

function undoChecked(h: Harness, rec: GameRecord): void {
  const E = h.engine();
  const before = h.ctrl.stepActors();
  const rng = E.rngState();
  h.ctrl.undo();
  const after = h.ctrl.stepActors();
  if (after.length >= before.length) rec.problems.push("undo removed no step");
  if (before.slice(after.length).some(s => s.by !== rec.humanSide)) rec.problems.push("undo took back an AI step");
  if (E.rngState() !== rng) rec.problems.push("undo changed the RNG state");
  rec.undos++;
}
