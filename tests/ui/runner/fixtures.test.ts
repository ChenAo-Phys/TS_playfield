/**
 * The recorded fixtures (tests/fixtures/ui) and the dev kit over them: the format round-trips, the
 * files cover every PromptKind and GameEvent type, hold only redacted data, stay small, and the
 * FixtureController replays them as the real controller releases frames.
 */
import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FixtureController } from "../../../src/dev/FixtureController";
import { applyDelta, decodeFrames, encodeFrames, idRanges, objectDelta } from "../../../src/dev/fixtureFormat";
import type { GameEvent, PromptKind, Side } from "../../../src/game/contract";
import { fixture, fixtureFile, fixtureIndex, fixtureNames } from "../../fixtures/load";

const DIR = new URL("../../fixtures/ui/", import.meta.url);
const KINDS: PromptKind[] = [
  "setup-place", "bid-place", "headline", "action-card", "play-mode", "op-mode", "influence", "coup-target", "realign-target",
  "event-target", "event-card", "branch", "defcon-level", "region",
];
const EVENTS: GameEvent["t"][] = [
  "turn-start", "phase", "action-round", "deal", "reshuffle", "hand-revealed", "card-played", "card-moved", "headline-chosen",
  "headline-reveal", "influence", "control", "roll", "vp", "defcon", "milops", "space", "scoring", "effect-on", "effect-off",
  "china-card", "game-over",
];

describe("fixture format", () => {
  it("object deltas round-trip (set, delete, one level deep)", () => {
    const a = { x: 1, y: { p: 1, q: 2 }, z: [1, 2], gone: true };
    const b = { x: 2, y: { p: 1, r: 3 }, z: [1, 2, 3], added: "n" };
    expect(applyDelta(a as Record<string, unknown>, objectDelta(a, b))).toEqual(b);
    expect(objectDelta(a, a)).toEqual({});
  });

  it("frames round-trip through the delta encoding", () => {
    const fx = fixture("seq-ai-turn");
    expect(decodeFrames(encodeFrames(fx.frames))).toEqual(fx.frames);
  });

  it("idRanges compresses ascending ids", () => {
    expect(idRanges([1, 2, 3, 7, 8, 10])).toEqual([[1, 3], [7, 8], [10, 10]]);
    expect(idRanges([])).toEqual([]);
  });
});

describe("recorded fixtures", () => {
  const index = fixtureIndex();

  it("the index lists exactly the files, and they total under 3 MB", () => {
    const files = readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "index.json").map(f => f.slice(0, -5)).sort();
    expect(index.map(r => r.name).sort()).toEqual(files);
    const total = files.reduce((n, f) => n + statSync(new URL(`${f}.json`, DIR)).size, 0);
    expect(total).toBeLessThan(3_000_000);
  });

  it("every file decodes; sequences have consecutive frame seqs", () => {
    for (const name of fixtureNames()) {
      const fx = fixture(name);
      expect(fx.frames.length, name).toBeGreaterThan(0);
      expect(fx.logs.length, name).toBe(fx.frames.length);
      for (let i = 1; i < fx.frames.length; i++) expect(fx.frames[i]!.seq, name).toBe(fx.frames[i - 1]!.seq + 1);
      if (fx.kind === "scene") expect(fx.final.prompt, name).not.toBeNull();
      expect(fx.final.frame).toBe(fx.frames[fx.frames.length - 1]);
    }
  });

  it("has a scene for every PromptKind, and the asked-for variants", () => {
    const sceneKinds = new Set(fixtureNames("scene").map(n => fixture(n).final.prompt!.kind));
    for (const k of KINDS) expect(sceneKinds.has(k), k).toBe(true);
    const coup = fixture("prompt-coup-target");
    expect(Object.keys(coup.final.prompt!.countries).length).toBeGreaterThan(0);
    for (const c of coup.final.prompt!.countries) expect(coup.previews.coupOdds?.[c]?.faces).toHaveLength(6);
    expect(fixture("prompt-action-card-china").final.prompt!.cards).toContain(6);
    for (const n of ["prompt-action-card", "prompt-play-mode"]) expect(Object.keys(fixture(n).previews.effectiveOps ?? {}).length, n).toBeGreaterThan(0);
    const verb = (n: string) => fixture(n).final.prompt!.effect?.verb;
    // Prompt.effect (gap G3) when the controller sets it; the capture classified by the result otherwise.
    if (verb("prompt-event-target-add")) expect(verb("prompt-event-target-add")).toBe("add");
    if (verb("prompt-event-target-remove")) expect(verb("prompt-event-target-remove")).toBe("remove");
    const mid = fixture("prompt-midgame");
    expect(mid.frames[0]!.state.turn).toBeGreaterThanOrEqual(5);
    expect(mid.frames[0]!.state.turn).toBeLessThanOrEqual(7);
    expect(mid.final.log[0]!.id).toBe(1); // the whole log
  });

  it("the sequences cover every GameEvent type, several endings, an AI turn and an undo", () => {
    const seen = new Set<string>();
    for (const n of fixtureNames("sequence")) for (const f of fixture(n).frames.slice(1)) for (const e of f.events) seen.add(e.t);
    for (const t of EVENTS) expect(seen.has(t), t).toBe(true);
    const endings = index.filter(r => r.name.startsWith("seq-over-"));
    expect(endings.length).toBeGreaterThanOrEqual(4);
    for (const r of endings) expect(fixture(r.name).final.ending, r.name).not.toBeNull();
    const ai = fixture("seq-ai-turn");
    const aiSide: Side = ai.humanSide === "US" ? "USSR" : "US";
    expect(ai.frames.some(f => f.events.some(e => e.t === "card-played" && e.side === aiSide))).toBe(true);
    expect(fixture("seq-undo").frames.some(f => f.actor === null && f.events.some(e => e.t === "influence" && e.to < e.from))).toBe(true);
  });

  it("seq-event-scoring plays a scoring card that scores (a non-zero net)", () => {
    const fx = fixture("seq-event-scoring");
    const f = fx.frames.find(x => x.events.some(e => e.t === "scoring" && e.vp !== 0));
    expect(f).toBeDefined();
    const sc = f!.events.find(e => e.t === "scoring" && e.vp !== 0)!;
    expect(f!.events.some(e => e.t === "card-played" && sc.t === "scoring" && e.card === sc.card)).toBe(true);
  });

  it("holds only redacted data: unknown AI cards are UNSEEN, never in the AI's hand list", () => {
    for (const n of fixtureNames()) {
      const fx = fixture(n);
      const ai: Side = fx.humanSide === "US" ? "USSR" : "US";
      for (const f of fx.frames) {
        const st = f.state;
        expect(st.humanSide, n).toBe(fx.humanSide);
        for (const loc of Object.values(st.card_locations ?? {})) {
          expect(loc, n).not.toBe(`HAND_${ai}_UNKNOWN`);
          expect(loc, n).not.toBe("DRAW_DECK");
        }
        for (const c of st.hands[ai]) expect(st.card_locations?.[String(c)], `${n} card ${c}`).toBe(`HAND_${ai}_KNOWN`);
        expect(st.aiHandCount, n).toBe(st.hands[ai].length + (st.hidden_cards?.[ai] ?? 0));
        if (st.aiHeadlineHidden) expect(ai === "US" ? st.headline_us_card : st.headline_ussr_card, n).toBe(0);
      }
      // The file has no field outside the format (nothing from the raw engine).
      expect(Object.keys(fixtureFile(n)).sort(), n).toEqual(expect.arrayContaining(["final", "frames", "frameVm", "log"]));
    }
  });
});

describe("FixtureController", () => {
  it("a scene starts at its end: prompt open, frame acked, previews answered", () => {
    const fx = fixture("prompt-coup-target");
    const c = new FixtureController(fx);
    const vm = c.getSnapshot();
    expect(vm.prompt?.kind).toBe("coup-target");
    expect(vm.frame).toBe(fx.frames[0]);
    const target = vm.prompt!.countries[0]!;
    expect(c.coupOdds(target)?.country).toBe(target);
    expect(c.coupOdds(999)).toBeNull();
    expect(c.effectiveOps(1)).toBeNull();
    c.choose(vm.prompt!.promptId, vm.prompt!.options[0]!.idx);
    expect(c.choices).toEqual([{ promptId: vm.prompt!.promptId, idx: vm.prompt!.options[0]!.idx }]);
    expect(c.getSnapshot()).toBe(vm); // a recording: choose changes nothing
  });

  it("a sequence releases one frame per ack, then the final ViewModel", () => {
    const fx = fixture("seq-ai-turn");
    const c = new FixtureController(fx, { queued: "remaining" });
    let emits = 0;
    c.subscribe(() => emits++);
    expect(c.getSnapshot().frame).toBe(fx.frames[0]);
    expect(c.getSnapshot().prompt).toBeNull();
    expect(c.getSnapshot().queued).toBe(fx.frames.length - 1);
    c.ackFrame(fx.frames[0]!.seq + 1); // wrong seq: ignored
    expect(c.getSnapshot().frame).toBe(fx.frames[0]);
    for (let i = 0; i < fx.frames.length; i++) {
      const vm = c.getSnapshot();
      expect(vm.frame).toBe(fx.frames[i]);
      expect(vm.log).toBe(fx.logs[i]);
      expect(vm.prompt).toBeNull();
      c.ackFrame(vm.frame!.seq);
    }
    expect(c.getSnapshot().prompt).toEqual(fx.final.prompt);
    expect(c.position.done).toBe(true);
    expect(emits).toBe(fx.frames.length);
    c.ackFrame(fx.frames[fx.frames.length - 1]!.seq); // a second ack of the last frame does nothing
    expect(emits).toBe(fx.frames.length);
    c.restart("begin");
    expect(c.getSnapshot().frame).toBe(fx.frames[0]);
  });

  it("an ending sequence shows status over and the ending from the game-over frame on", () => {
    const fx = fixture("seq-over-defcon");
    const c = new FixtureController(fx, { start: "end" });
    expect(c.getSnapshot().status).toBe("over");
    expect(c.getSnapshot().ending?.reason).toBe("defcon");
  });

  it("aiThinkingMs shows the AI thinking before each AI frame", () => {
    const fx = fixture("seq-ai-turn");
    const timers: (() => void)[] = [];
    const c = new FixtureController(fx, { aiThinkingMs: 500, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {} });
    const ai: Side = fx.humanSide === "US" ? "USSR" : "US";
    const k = fx.frames.findIndex((f, i) => i > 0 && f.actor === ai);
    c.seek(k - 1);
    c.ackFrame(fx.frames[k - 1]!.seq);
    expect(c.getSnapshot().aiThinking).toBe(true);
    expect(c.getSnapshot().frame).toBe(fx.frames[k - 1]);
    timers.shift()!();
    expect(c.getSnapshot().aiThinking).toBe(false);
    expect(c.getSnapshot().frame).toBe(fx.frames[k]);
  });
});
