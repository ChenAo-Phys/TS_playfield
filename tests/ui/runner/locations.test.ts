/** anchorForLocation / flightFor (ui-spec §9.6), on the table's rows and on every recorded move. */
import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../../src/game/contract";
import { anchorForLocation, flightFor, handSide, type CardMove } from "../../../src/ui/runner/locations";
import { buildBeats } from "../../../src/ui/runner/beats";
import type { AnchorId } from "../../../src/ui/ui-contract";
import { fixture, fixtureNames } from "../../fixtures/load";

describe("anchorForLocation", () => {
  it("maps every row of the §9.6 table", () => {
    expect(anchorForLocation("DRAW_DECK", 5)).toBe("deck");
    expect(anchorForLocation("UNSEEN", 5)).toBe("deck");
    expect(anchorForLocation("UNSEEN", 5, { aiPlayCard: 5 })).toBe("stage");
    expect(anchorForLocation("HAND_US_KNOWN", 5)).toBe("hand:US");
    expect(anchorForLocation("HAND_USSR_UNKNOWN", 5)).toBe("hand:USSR");
    const mounted = (id: AnchorId) => id === "card:5";
    expect(anchorForLocation("HAND_US_KNOWN", 5, { mounted })).toBe("card:5");
    expect(anchorForLocation("HAND_US_KNOWN", 7, { mounted })).toBe("hand:US");
    expect(anchorForLocation("DISCARD_PILE", 5)).toBe("discard");
    expect(anchorForLocation("REMOVED_FROM_GAME", 5)).toBe("removed");
    expect(anchorForLocation("ONGOING_EVENT", 5)).toBe("effects");
    expect(anchorForLocation("ONGOING_EVENT", 6)).toBeNull();
    expect(anchorForLocation("PEEKED_TEMP", 5)).toBe("stage");
    expect(anchorForLocation("HEADLINE_COMMITTED", 5, { other: "HAND_USSR_KNOWN" })).toBe("headline:USSR");
    expect(anchorForLocation("HEADLINE_COMMITTED", 5, { headlineSide: "US" })).toBe("headline:US");
    expect(anchorForLocation("HEADLINE_COMMITTED", 5)).toBeNull();
    expect(anchorForLocation("UNAVAILABLE", 5)).toBeNull();
    expect(anchorForLocation("SOMEWHERE_NEW", 5)).toBeNull();
    expect(handSide("HAND_USSR_KNOWN")).toBe("USSR");
    expect(handSide("DISCARD_PILE")).toBeNull();
  });
});

describe("flightFor", () => {
  it("flies public moves face up and moves out of sight face down", () => {
    expect(flightFor({ card: 9, from: "HAND_US_KNOWN", to: "DISCARD_PILE" })).toEqual({ from: "hand:US", to: "discard", back: false });
    expect(flightFor({ card: 9, from: "DISCARD_PILE", to: "UNSEEN" })).toEqual({ from: "discard", to: "deck", back: true });
    expect(flightFor({ card: 9, from: "HAND_USSR_KNOWN", to: "HAND_US_KNOWN" })).toEqual({ from: "hand:USSR", to: "hand:US", back: false });
    expect(flightFor({ card: 9, from: "HEADLINE_COMMITTED", to: "REMOVED_FROM_GAME" }, { headlineSide: "USSR" })).toEqual({ from: "headline:USSR", to: "removed", back: false });
  });

  it("flies a card that left the AI's hidden hand (fromHand) from that hand, not from the deck", () => {
    // Five Year Plan's random discard, a Grain Sales / Missile Envy take into the human's hand.
    expect(flightFor({ card: 27, from: "UNSEEN", to: "DISCARD_PILE", fromHand: "USSR" })).toEqual({ from: "hand:USSR", to: "discard", back: false });
    const mounted = (id: AnchorId) => id === "card:27";
    expect(flightFor({ card: 27, from: "UNSEEN", to: "HAND_US_KNOWN", fromHand: "USSR" }, { mounted })).toEqual({ from: "hand:USSR", to: "card:27", back: false });
    // The pinned AI card still collapses with the dock; fromHand only applies to an UNSEEN origin.
    expect(flightFor({ card: 27, from: "UNSEEN", to: "DISCARD_PILE", fromHand: "USSR" }, { aiPlayCard: 27 })).toBeNull();
    expect(flightFor({ card: 27, from: "HAND_USSR_KNOWN", to: "DISCARD_PILE", fromHand: "USSR" })).toEqual({ from: "hand:USSR", to: "discard", back: false });
    // The beat carries the event's fromHand through buildBeats.
    const base = fixture("seq-ai-turn").frames[0]!;
    const frame = { ...base, seq: base.seq + 1, events: [{ t: "card-moved", card: 27, from: "UNSEEN", to: "DISCARD_PILE", fromHand: "US" } as GameEvent] };
    const beat = buildBeats(frame, base.state, "USSR").flat().find(b => b.k === "card-moved")!;
    expect(flightFor(beat as CardMove)).toEqual({ from: "hand:US", to: "discard", back: false });
  });

  it("has no flight without both anchors, for the same anchor, the China Card's effects, or the pinned AI card", () => {
    expect(flightFor({ card: 9, from: "UNAVAILABLE", to: "UNSEEN" })).toBeNull();
    expect(flightFor({ card: 9, from: "DRAW_DECK", to: "UNSEEN" })).toBeNull();
    expect(flightFor({ card: 6, from: "HAND_US_KNOWN", to: "ONGOING_EVENT" })).toBeNull();
    expect(flightFor({ card: 27, from: "UNSEEN", to: "DISCARD_PILE" }, { aiPlayCard: 27 })).toBeNull();
    expect(flightFor({ card: 27, from: "UNSEEN", to: "DISCARD_PILE" })).toEqual({ from: "deck", to: "discard", back: false });
  });

  it("every recorded location is a known one, and every animated move of the recordings resolves", () => {
    const known = /^(DRAW_DECK|UNSEEN|HAND_(US|USSR)_(KNOWN|UNKNOWN)|DISCARD_PILE|REMOVED_FROM_GAME|ONGOING_EVENT|PEEKED_TEMP|HEADLINE_COMMITTED|UNAVAILABLE)$/;
    let flights = 0;
    for (const name of fixtureNames("sequence")) {
      const fx = fixture(name);
      for (let i = 1; i < fx.frames.length; i++) {
        const f = fx.frames[i]!;
        for (const e of f.events) {
          if (e.t !== "card-moved") continue;
          expect(e.from, name).toMatch(known);
          expect(e.to, name).toMatch(known);
        }
        for (const b of buildBeats(f, fx.frames[i - 1]!.state, fx.humanSide).flat()) {
          if (b.k !== "card-moved") continue;
          const committed = f.events.find((e): e is Extract<GameEvent, { t: "headline-chosen" }> => e.t === "headline-chosen");
          const plan = flightFor(b, { headlineSide: committed?.side });
          if (plan) flights++;
          if (b.from !== "UNAVAILABLE" && b.to !== "UNAVAILABLE" && !(b.card === 6 && (b.to === "ONGOING_EVENT" || b.from === "ONGOING_EVENT"))) {
            expect(plan === null ? `${b.from}->${b.to}` : "ok", name).toMatch(/ok|UNSEEN->UNSEEN|HEADLINE_COMMITTED|DRAW_DECK->UNSEEN|UNSEEN->DRAW_DECK/);
          }
        }
      }
    }
    expect(flights).toBeGreaterThan(50);
  });
});
