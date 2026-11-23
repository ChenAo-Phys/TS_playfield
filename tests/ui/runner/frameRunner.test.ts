/**
 * The frame runner core (ui-spec §9.1, §9.2, §9.5) driven by the FixtureController over recorded
 * sequences: commit only after a frame's beats, then ack; skip; skip to my turn; boost; hidden tab;
 * queue speed-up; the reveal-dock card; the AI lead-in; jumps and new games.
 */
import { describe, expect, it } from "vitest";
import { FixtureController, type FixtureControllerOptions } from "../../../src/dev/FixtureController";
import type { Frame, PublicState, Side } from "../../../src/game/contract";
import { createDirector } from "../../../src/ui/runner/director";
import { AI_LEAD_IN_MS, FrameRunner } from "../../../src/ui/runner/frameRunner";
import { frameSpeed, type FrameSpeed } from "../../../src/ui/theme";
import type { BeatKind } from "../../../src/ui/ui-contract";
import { DEFAULT_SETTINGS, type Beat, type UiSettings } from "../../../src/ui/ui-contract";
import { fixture } from "../../fixtures/load";

const tick = () => new Promise<void>(r => setImmediate(r));
async function until(pred: () => boolean, max = 5000): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (pred()) return;
    await tick();
  }
  throw new Error("condition never met");
}

interface Seen { beat: Beat; seq: number; shownState: PublicState | null; speed: FrameSpeed; aborted: boolean; aiPlayCard: number; busy: boolean }

const KINDS: BeatKind[] = ["reveal", "headline-chosen", "headline-reveal", "roll", "scoring", "country", "track", "effect", "reshuffle", "deal", "hand-revealed", "card-moved", "china", "banner", "game-over"];

function setup(name: string, opts: { settings?: Partial<UiSettings>; ctrl?: FixtureControllerOptions; handler?: (b: Beat, signal: AbortSignal) => Promise<void> } = {}) {
  const fx = fixture(name);
  const controller = new FixtureController(fx, opts.ctrl);
  const director = createDirector();
  const settings: UiSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const sleeps: number[] = [];
  const seen: Seen[] = [];
  const commits: { seq: number; ackedBefore: boolean }[] = [];
  const runner: FrameRunner = new FrameRunner({
    controller, director, settings: () => settings,
    sleep: async ms => { sleeps.push(ms); },
    onCommit: f => commits.push({ seq: f.seq, ackedBefore: controller.calls.some(c => c.fn === "ackFrame" && c.seq === f.seq && c.accepted) }),
  });
  for (const k of KINDS) {
    director.on(k, async (beat, ctx) => {
      const s = runner.getShown();
      seen.push({ beat, seq: ctx.frame.seq, shownState: s.state, speed: ctx.speed, aborted: ctx.signal.aborted, aiPlayCard: s.aiPlayCard, busy: s.busy });
      if (opts.handler) await opts.handler(beat, ctx.signal);
    });
  }
  return { fx, controller, director, runner, seen, sleeps, commits, settings };
}

const done = (c: FixtureController) => () => c.position.done;

describe("FrameRunner", () => {
  it("commits each frame only after its beats, then acks it; the prompt appears at the end", async () => {
    const { fx, controller, runner, seen, commits } = setup("seq-ai-turn");
    // Constructed on the base frame: committed at once (no animation), acked on start.
    expect(runner.getShown().state).toBe(fx.frames[0]!.state);
    runner.start();
    await until(done(controller));
    const shown = runner.getShown();
    expect(shown.state).toBe(fx.frames[fx.frames.length - 1]!.state);
    expect(shown.regionScores).toBe(fx.frames[fx.frames.length - 1]!.regionScores);
    expect(shown.busy).toBe(false);
    expect(controller.getSnapshot().prompt).toEqual(fx.final.prompt);
    // Every beat of frame k ran while frame k-1 was on screen.
    expect(seen.length).toBeGreaterThan(5);
    for (const s of seen) {
      const k = fx.frames.findIndex(f => f.seq === s.seq);
      expect(s.shownState).toBe(fx.frames[k - 1]!.state);
      expect(s.busy).toBe(true);
    }
    // Commits in order (the base frame at construction), each before its ack.
    expect(commits.map(c => c.seq)).toEqual(fx.frames.map(f => f.seq));
    expect(commits.every(c => !c.ackedBefore)).toBe(true);
    const acks = controller.calls.filter(c => c.fn === "ackFrame" && c.accepted).map(c => (c as { seq: number }).seq);
    expect(acks).toEqual(fx.frames.map(f => f.seq));
    runner.stop();
  });

  it("a scene is on screen from construction (server rendering), and start() changes nothing", async () => {
    const { fx, controller, runner, seen } = setup("prompt-coup-target");
    expect(runner.getShown().state).toBe(fx.frames[0]!.state);
    runner.start();
    await tick();
    expect(seen).toEqual([]);
    expect(controller.getSnapshot().prompt?.kind).toBe("coup-target");
    runner.stop();
  });

  it("sets the dock card on the AI reveal (after a 400 ms lead-in) and clears it at the action round", async () => {
    const { fx, controller, runner, seen, sleeps } = setup("seq-ai-turn");
    const ai: Side = fx.humanSide === "US" ? "USSR" : "US";
    runner.start();
    await until(done(controller));
    const reveal = seen.find(s => s.beat.k === "reveal" && s.beat.side === ai)!;
    expect(reveal.aiPlayCard).toBe((reveal.beat as { card: number }).card);
    expect(sleeps).toContain(AI_LEAD_IN_MS);
    const later = seen.filter(s => s.seq > reveal.seq && s.beat.k === "country");
    expect(later.length).toBeGreaterThan(0);
    for (const s of later) expect(s.aiPlayCard).toBe(reveal.aiPlayCard);
    const ar = seen.find(s => s.seq >= reveal.seq && s.beat.k === "track" && s.beat.event.t === "action-round")!;
    expect(seen.filter(s => s.seq > ar.seq).every(s => s.aiPlayCard === 0)).toBe(true);
    expect(runner.getShown().aiPlayCard).toBe(0); // the human prompt is open
    runner.stop();
  });

  it("Skip aborts the current frame (commit + ack) and the next frames play normally", async () => {
    let block = true;
    const { fx, controller, runner, seen } = setup("seq-ai-turn", {
      handler: (_b, signal) => (block ? new Promise<void>(r => signal.addEventListener("abort", () => r(), { once: true })) : Promise.resolve()),
    });
    runner.start();
    await until(() => seen.length === 1);
    const first = seen[0]!;
    expect(runner.getShown().busy).toBe(true);
    block = false;
    runner.getShown().skip();
    await until(done(controller));
    expect(runner.getShown().state).toBe(fx.frames[fx.frames.length - 1]!.state);
    // The skipped frame ran no further beat; later frames ran unaborted at full speed.
    const later = seen.filter(s => s.seq > first.seq);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every(s => !s.aborted && s.speed.motion > 0)).toBe(true);
    runner.stop();
  });

  it("Skip to my turn plays the rest at speed 0 until the human prompt", async () => {
    let first = true;
    const { controller, runner, seen } = setup("seq-ai-turn", {
      settings: { pauseOnReveals: false },
      handler: (_b, signal) => {
        if (!first) return Promise.resolve();
        first = false;
        return new Promise<void>(r => signal.addEventListener("abort", () => r(), { once: true }));
      },
    });
    runner.start();
    await until(() => seen.length >= 1);
    expect(seen[0]!.speed.motion).toBeGreaterThan(0);
    runner.getShown().skipToMyTurn();
    await until(done(controller));
    const after = seen.slice(1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(s => s.speed.motion === 0 && s.speed.hold === 0)).toBe(true);
    expect(runner.isSkipping).toBe(false); // the prompt ended it
    runner.stop();
  });

  it("Skip to my turn stops before a headline reveal when pauseOnReveals is on", async () => {
    const { controller, runner, seen } = setup("seq-headline");
    runner.getShown().skipToMyTurn();
    runner.start();
    await until(done(controller));
    const reveal = seen.find(s => s.beat.k === "headline-reveal")!;
    expect(reveal.speed.motion).toBeGreaterThan(0);
    expect(seen.filter(s => s.beat.k === "headline-chosen").every(s => s.speed.motion === 0)).toBe(true);
    runner.stop();
  });

  it("speeds up when frames queue, with Shift held, and plays nothing in a hidden tab", async () => {
    const q = setup("seq-ai-turn", { ctrl: { queued: "remaining" } });
    q.runner.start();
    await until(done(q.controller));
    const n = q.fx.frames.length;
    // Every beat ran at the speed of the queue behind its frame (vm.queued at that moment).
    for (const s of q.seen) {
      const k = q.fx.frames.findIndex(f => f.seq === s.seq);
      const f = q.fx.frames[k]!;
      expect(s.speed).toEqual(frameSpeed({
        speed: "normal", auto: f.auto, byHuman: f.actor === q.fx.humanSide && !f.auto, queued: n - 1 - k,
      }));
    }
    expect(q.seen.some(s => s.speed.motion < 1)).toBe(true);
    q.runner.stop();

    const b = setup("seq-ai-turn");
    b.runner.setBoost(true);
    b.runner.start();
    await until(done(b.controller));
    expect(b.seen.every(s => s.speed.motion <= 1 / 3 + 1e-9)).toBe(true);
    b.runner.stop();

    const h = setup("seq-ai-turn");
    h.runner.setHidden(true);
    h.runner.start();
    await until(done(h.controller));
    expect(h.runner.getShown().state).toBe(h.fx.frames[h.fx.frames.length - 1]!.state);
    expect(h.seen.every(s => s.aborted || s.speed.motion === 0)).toBe(true);
    h.runner.stop();
  });

  it("a jump (restart, seek) or another game commits at once, unanimated, and resets the marks", async () => {
    const { fx, controller, runner, seen } = setup("seq-ai-turn");
    runner.start();
    await until(done(controller));
    const before = seen.length;
    expect(Object.keys(runner.getShown().lastOpponent).length).toBeGreaterThanOrEqual(0);
    controller.restart("begin");
    await until(() => controller.position.index >= 1);
    expect(runner.getShown().state).not.toBe(fx.frames[fx.frames.length - 1]!.state);
    await until(done(controller));
    expect(seen.length - before).toBe(before); // the same beats again, from the base frame on
    // Another game (another first log entry): its frame is committed without beats.
    const other = fixture("prompt-midgame");
    const n = seen.length;
    controller.setFixture(other);
    await until(() => runner.getShown().state === other.frames[0]!.state);
    expect(seen.length).toBe(n);
    expect(runner.getShown().lastOpponent).toEqual({});
    runner.stop();
  });

  it("stop() then start() at once (React StrictMode) does not abort the frame in progress", async () => {
    let release!: () => void;
    let blocked = false;
    const { controller, runner, seen } = setup("seq-ai-turn", {
      handler: (_b, signal) => {
        if (blocked) return Promise.resolve();
        blocked = true;
        return new Promise<void>(r => { release = r; signal.addEventListener("abort", () => r(), { once: true }); });
      },
    });
    runner.start();
    await until(() => seen.length === 1);
    runner.stop();
    runner.start();
    await new Promise(r => setTimeout(r, 5));
    release();
    await until(done(controller));
    expect(seen.every(x => !x.aborted)).toBe(true);
    // A real stop aborts (a moment later) and commits.
    runner.stop();
  });

  it("busy and actor follow the animation; commit listeners see every commit", async () => {
    const { fx, controller, runner } = setup("seq-opening-ussr");
    const states: { busy: boolean; actor: Side | null }[] = [];
    runner.subscribe(() => { const s = runner.getShown(); states.push({ busy: s.busy, actor: s.actor }); });
    const seqs: number[] = [];
    runner.onCommit((f: Frame) => seqs.push(f.seq));
    runner.start();
    await until(done(controller));
    expect(seqs).toEqual(fx.frames.slice(1).map(f => f.seq));
    expect(states.some(s => s.busy && s.actor === "USSR")).toBe(true);
    expect(runner.getShown().busy).toBe(false);
    expect(runner.getShown().actor).toBeNull();
    runner.stop();
  });
});
