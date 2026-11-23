/**
 * The tray's pure model (src/ui/tray/trayModel.ts): fit and fan, mode and card states, stamp verbs,
 * the lifted-out card, hand prompts, the headline slot, KNOWN TO AI, piles and the China view — on
 * hand-made inputs and on recorded fixtures.
 */
import { describe, expect, it } from "vitest";
import type { PublicState } from "../../../src/game/contract";
import {
  chinaView, fanAngle, fitHand, handCardState, handCardWidth, handMode, headlineSlotOf, isHandPrompt, knownToAi, liftedOutCard,
  MAX_OVERLAP, MIN_OVERLAP, pileTop, SPINE_FROM, spineOf, stampVerb,
} from "../../../src/ui/tray/trayModel";
import { fixture } from "../../fixtures/load";
import { prompt } from "../common/mocks";

const last = (name: string) => {
  const fx = fixture(name);
  return { fx, state: fx.frames[fx.frames.length - 1]!.state, prompt: fx.final.prompt, human: fx.humanSide };
};

describe("fit and fan (ui-spec §7.2)", () => {
  it("overlaps just enough, never more than 8 px apart", () => {
    expect(fitHand(5, 104, 504)).toEqual({ ov: 4, scroll: false });
    expect(fitHand(3, 104, 900)).toEqual({ ov: MIN_OVERLAP, scroll: false });
    expect(fitHand(9, 104, 490).ov).toBeCloseTo((9 * 104 - 490) / 8, 1);
  });
  it("past 55 % of a card it keeps the 55 % overlap and scrolls only the remainder", () => {
    const n = 10, w = 104, avail = 490;
    expect((n * w - avail) / (n - 1)).toBeGreaterThan(MAX_OVERLAP * w);
    expect(fitHand(n, w, avail)).toEqual({ ov: 57.2, scroll: true });
    // Exactly at the cap: still a fan, no scroller.
    const atCap = w + (n - 1) * (1 - MAX_OVERLAP) * w;
    expect(fitHand(n, w, atCap)).toEqual({ ov: 57.2, scroll: false });
  });
  it("1366 × 768 with a 9-card headline hand and 1440 × 900 with 8 cards + the headline slot keep ~7–8 cards in view", () => {
    // The hand's width measured in the app (GameScreen, rail open): 446 px at 1366 × 768 (prompt-headline),
    // 410 px at 1440 × 900 beside the headline slot; the fit gets clientWidth − HAND_FIT_PAD.
    const visible = (n: number, avail: number) => {
      const f = fitHand(n, 104, avail);
      return { f, shown: Math.min(n, 1 + (avail - 104) / (104 - f.ov)) };
    };
    const a = visible(9, 446 - 16);
    expect(a.f).toEqual({ ov: 57.2, scroll: true });
    expect(a.shown).toBeGreaterThan(7.9); // was ~3.8 with the 8 px gaps of the old scroller
    const b = visible(8, 410 - 16);
    expect(b.f).toEqual({ ov: 57.2, scroll: true });
    expect(b.shown).toBeGreaterThan(7.1);
  });
  it("one or no card", () => {
    expect(fitHand(0, 104, 400)).toEqual({ ov: 0, scroll: false });
    expect(fitHand(1, 104, 400)).toEqual({ ov: 0, scroll: false });
    expect(fitHand(1, 104, 60).scroll).toBe(true);
  });
  it("fans ±2.2° per card around the middle", () => {
    expect([0, 1, 2, 3, 4].map(i => fanAngle(i, 5))).toEqual([-4.4, -2.2, 0, 2.2, 4.4]);
    expect(fanAngle(0, 2)).toBeCloseTo(-1.1);
    expect(fanAngle(0, 1)).toBe(0);
  });
  it("card sizes per arrangement", () => {
    expect(handCardWidth("desktop")).toBe(104);
    expect(handCardWidth("desktop", true)).toBe(112);
    expect(handCardWidth("tablet")).toBe(86);
    expect(handCardWidth("compact")).toBe(112);
  });
});

describe("spines on overlapped cards (QA OD-3)", () => {
  it("every card the next one covers by at least 12 % of its width wears one; the rightmost never", () => {
    expect(SPINE_FROM).toBe(0.12);
    const fit = fitHand(7, 104, 450);
    expect(fit.ov).toBeGreaterThan(SPINE_FROM * 104);
    expect([0, 1, 5].map(i => spineOf(i, 7, fit, 104))).toEqual([true, true, true]);
    expect(spineOf(6, 7, fit, 104)).toBe(false);
    // a roomy hand (gaps or a sliver of overlap) keeps its captions
    expect(spineOf(0, 5, fitHand(5, 104, 900), 104)).toBe(false);
    expect(spineOf(0, 5, { ov: 12, scroll: false }, 104)).toBe(false);
    expect(spineOf(0, 5, { ov: 12.5, scroll: false }, 104)).toBe(true);
    expect(spineOf(0, 1, { ov: 0, scroll: false }, 104)).toBe(false);
  });
  it("the crowded hands QA measured: 1280–1440 px with 7–9 cards (+ the headline slot) all get spines", () => {
    // Hand widths (clientWidth) measured in the app: 1280 × 720 ~300 px, 1366 × 768 446 px (9 cards), 1440 × 900 410 px
    // beside the headline slot (8 cards), 1440 × 900 7 cards ~470 px; tablet 1024 × 768 86 px cards.
    for (const [n, w, avail] of [[7, 104, 300], [9, 104, 446], [8, 104, 410], [7, 104, 470], [9, 86, 420]] as const) {
      const fit = fitHand(n, w, avail - 16);
      for (let i = 0; i < n - 1; i++) expect(spineOf(i, n, fit, w)).toBe(true);
      expect(spineOf(n - 1, n, fit, w)).toBe(false);
    }
    // 1920 × 1080 with 112 px cards and room: captions.
    expect(spineOf(0, 9, fitHand(9, 112, 1000), 112)).toBe(false);
  });
});

describe("mode and card states", () => {
  const offered = new Map([[25, {}], [26, {}]]);
  it("active only while a prompt offers hand cards (and nothing animates)", () => {
    const p = prompt({ kind: "action-card", cards: [25, 26] });
    expect(handMode({ prompt: p, hand: [25, 26, 31], offered, busy: false, aiThinking: false })).toBe("active");
    expect(handMode({ prompt: p, hand: [25, 26, 31], offered, busy: true, aiThinking: false })).toBe("passive");
    expect(handMode({ prompt: prompt({ kind: "influence" }), hand: [31], offered: new Map(), busy: false, aiThinking: false })).toBe("passive");
    expect(handMode({ prompt: null, hand: [31], offered: new Map(), busy: false, aiThinking: true })).toBe("passive");
    expect(handMode({ prompt: null, hand: [31], offered: new Map(), busy: true, aiThinking: false })).toBe("passive");
    expect(handMode({ prompt: null, hand: [31], offered: new Map(), busy: false, aiThinking: false })).toBe("neutral");
    // Only the China Card offered (all hand cards unplayable): still a card prompt.
    expect(handMode({ prompt: p, hand: [31], offered: new Map([[6, {}]]), holdsChina: true, busy: false, aiThinking: false })).toBe("active");
  });
  it("per card: lifted > staged > playable / unplayable / passive / neutral", () => {
    const base = { mode: "active" as const, offered, staged: null, lifted: null };
    expect(handCardState(25, base)).toBe("playable");
    expect(handCardState(31, base)).toBe("unplayable");
    expect(handCardState(25, { ...base, staged: 25 })).toBe("staged");
    expect(handCardState(25, { ...base, staged: 25, lifted: 25 })).toBe("lifted");
    expect(handCardState(25, { ...base, lifted: new Set([25]) })).toBe("lifted");
    expect(handCardState(25, { ...base, mode: "passive" })).toBe("passive");
    expect(handCardState(25, { ...base, mode: "neutral" })).toBe("neutral");
  });
});

describe("stamp verbs (ui-spec §8.2)", () => {
  it("headline, discard prompts, Missile Envy, else play", () => {
    expect(stampVerb(null)).toBe("play");
    expect(stampVerb(prompt({ kind: "headline" }))).toBe("headline");
    expect(stampVerb(prompt({ kind: "action-card" }))).toBe("play");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 49 }))).toBe("give");
    for (const rc of [10, 77, 95, 98, 108, 250]) expect(stampVerb(prompt({ kind: "event-card", resolvingCard: rc }))).toBe("discard");
    expect(stampVerb(prompt({ kind: "event-card", resolvingCard: 32 }))).toBe("play");
    expect(stampVerb(prompt({ kind: "action-card", title: { key: "prompt:title.actionCardQuagmire" } }))).toBe("discard");
    expect(stampVerb(prompt({ kind: "action-card", title: { key: "prompt:title.actionCardBearTrap" } }))).toBe("discard");
  });
  it("on fixtures", () => {
    expect(stampVerb(last("prompt-headline").prompt)).toBe("headline");
    expect(stampVerb(last("prompt-action-card").prompt)).toBe("play");
    expect(stampVerb(last("prompt-event-card").prompt)).toBe("play");
  });
});

describe("lifted-out card and hand prompts", () => {
  it("the play-mode card is lifted out of the hand (fixture)", () => {
    const { state, prompt: p, human } = last("prompt-play-mode");
    expect(p?.kind).toBe("play-mode");
    expect(state.hands[human]).toContain(p!.pendingCard);
    expect(liftedOutCard(p, state.hands[human])).toBe(p!.pendingCard);
  });
  it("nothing is lifted when the pending card already left or is an option", () => {
    const { state, prompt: p, human } = last("prompt-influence");
    expect(liftedOutCard(p, state.hands[human])).toBeNull();
    expect(liftedOutCard(prompt({ kind: "event-card", pendingCard: 25, cards: [25] }), [25])).toBeNull();
    expect(liftedOutCard(null, [25])).toBeNull();
  });
  it("the China Card is lifted only while the human holds it", () => {
    const p = prompt({ kind: "play-mode", pendingCard: 6 });
    expect(liftedOutCard(p, [25], true)).toBe(6);
    expect(liftedOutCard(p, [25], false)).toBeNull();
  });
  it("hand prompts open the compact drawer", () => {
    const hand = last("prompt-event-card");
    expect(isHandPrompt(hand.prompt, hand.state.hands[hand.human])).toBe(true);
    expect(isHandPrompt(last("prompt-headline").prompt, [])).toBe(true);
    expect(isHandPrompt(last("prompt-action-card").prompt, [])).toBe(true);
    expect(isHandPrompt(last("prompt-influence").prompt, [])).toBe(false);
    expect(isHandPrompt(prompt({ kind: "event-card", cards: [40] }), [25])).toBe(false);
    expect(isHandPrompt(null, [])).toBe(false);
  });
});

describe("state reads", () => {
  it("KNOWN TO AI from the redacted locations (fixture)", () => {
    const { state, human } = last("prompt-action-card-china");
    expect(human).toBe("USSR");
    expect(knownToAi(state, human, 21)).toBe(true);
    expect(knownToAi(state, human, 1)).toBe(false);
    expect(knownToAi(state, human, 28)).toBe(false);
  });
  it("the headline slot holds the human's committed card (fixture seq-headline)", () => {
    const fx = fixture("seq-headline");
    expect(fx.humanSide).toBe("USSR");
    expect(headlineSlotOf(fx.frames[0]!.state, "USSR")).toBeNull();
    const revealed = fx.frames[1]!.state;
    expect(headlineSlotOf(revealed, "USSR")).toEqual({ card: 18, faceDown: false });
    const committed = { ...revealed, headline_stage: 0 } as PublicState;
    expect(headlineSlotOf(committed, "USSR")).toEqual({ card: 18, faceDown: true });
    // After it resolves it is no longer in the slot.
    expect(headlineSlotOf(fx.frames[3]!.state, "USSR")).toBeNull();
    // Last turn's stale headline ids don't count.
    expect(headlineSlotOf(last("prompt-action-card").state, "USSR")).toBeNull();
  });
  it("without card_locations: the HEADLINE phase and not in hand", () => {
    const st = { headline_us_card: 7, headline_ussr_card: 0, hands: { US: [], USSR: [] }, current_phase_name: "HEADLINE" } as unknown as PublicState;
    expect(headlineSlotOf(st, "US")).toEqual({ card: 7, faceDown: true });
    expect(headlineSlotOf({ ...st, current_phase_name: "ACTION_ROUND" } as PublicState, "US")).toBeNull();
  });
  it("pile tops and the China view", () => {
    expect(pileTop([])).toBe(0);
    expect(pileTop([3, 9])).toBe(9);
    expect(chinaView({ holder: "USSR", playable: true }, "USSR")).toBe("faceUp");
    expect(chinaView({ holder: "USSR", playable: false }, "USSR")).toBe("faceDown");
    expect(chinaView({ holder: "US", playable: true }, "USSR")).toBe("withAi");
  });
});


describe("hand view across your own frames (no flicker)", async () => {
  const { computeHandView } = await import("../../../src/ui/tray/Tray");
  const { NO_OVERRIDES } = await import("../../../src/ui/tray/trayBeats");
  const { state, prompt: p, human } = last("prompt-action-card-china");
  const offered = new Map(p!.options.filter(o => o.kind === "card").map(o => [o.id, { option: o, commit: "instant" as const, severity: "none" as const }]));
  const base = { state, human, offered, staged: 25, busy: false, actor: null, aiThinking: false, overrides: NO_OVERRIDES };
  it("live at a prompt; frozen and inert while your click resolves; dropped once the AI acts", () => {
    const a = computeHandView({ ...base, prompt: p }, null);
    expect(a.view.mode).toBe("active");
    expect(a.view.interactive).toBe(true);
    const b = computeHandView({ ...base, prompt: null, busy: true, actor: human }, a.last);
    expect(b.view.mode).toBe("active");
    expect(b.view.staged).toBe(25);
    expect(b.view.interactive).toBe(false);
    const c = computeHandView({ ...base, prompt: null, busy: false }, b.last);
    expect(c.view.mode).toBe("active");
    const d = computeHandView({ ...base, prompt: null, aiThinking: true }, c.last);
    expect(d.view.mode).toBe("passive");
    expect(d.last).toBeNull();
    const e = computeHandView({ ...base, prompt: null }, d.last);
    expect(e.view.mode).toBe("neutral");
    expect(e.view.interactive).toBe(false);
  });
  it("a frozen lifted card is dropped once it left the hand", () => {
    const pm = last("prompt-play-mode");
    const a = computeHandView({ ...base, state: pm.state, offered: new Map(), staged: null, prompt: pm.prompt }, null);
    expect(a.view.lifted).toBe(28);
    const after = { ...pm.state, hands: { ...pm.state.hands, USSR: pm.state.hands.USSR.filter(c => c !== 28) } } as PublicState;
    const b = computeHandView({ ...base, state: after, offered: new Map(), staged: null, prompt: null, busy: true, actor: "USSR" }, a.last);
    expect(b.view.lifted).toBeNull();
  });
});

describe("card state words (QA Q-032)", () => {
  it("the staged card says tap on touch; face-down China reads unplayable", async () => {
    const { cardStateKey } = await import("../../../src/ui/tray/trayModel");
    expect(cardStateKey("staged", false)).toBe("ui_tray:card.state.staged");
    expect(cardStateKey("staged", true)).toBe("ui_tray:card.state.stagedTouch");
    expect(cardStateKey("playable", true)).toBe("ui_tray:card.state.playable");
    expect(cardStateKey("faceDown", false)).toBe("ui_tray:card.state.unplayable");
  });
});
