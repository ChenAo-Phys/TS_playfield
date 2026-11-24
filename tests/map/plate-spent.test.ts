import { describe, expect, it } from "vitest";
import { ghostFor, plateSpent, SCORING_CARD } from "../../src/ui/map/board";
import { cardInfo } from "../../src/data";

describe("scoring plates: played since the last reshuffle (owner request 2026-11-23)", () => {
  it("maps every region slot to its scoring card", () => {
    for (const [slot, card] of Object.entries(SCORING_CARD)) {
      expect(cardInfo(card)?.scoring, `slot ${slot} card ${card}`).toBe(true);
    }
    expect(cardInfo(SCORING_CARD[4])?.title.en).toBe("Central America Scoring");
    expect(cardInfo(SCORING_CARD[6])?.title.en).toBe("Southeast Asia Scoring");
  });

  it("is 'discard' while the card waits in the discard pile, 'removed' when out of play, else null", () => {
    const state = { discard_pile: [2, 40, 79], removed_pile: [38] };
    expect(plateSpent(state, 0)).toBe("discard"); // Europe
    expect(plateSpent(state, 3)).toBe("discard"); // Africa
    expect(plateSpent(state, 6)).toBe("removed"); // Southeast Asia
    expect(plateSpent(state, 4)).toBeNull(); // Central America (#37) not played; #40 is Cuban Missile Crisis
    expect(plateSpent({ discard_pile: [], removed_pile: [] }, 0)).toBeNull(); // after a reshuffle
    expect(plateSpent(null, 1)).toBeNull();
  });

  it("the map no longer passes hover ghosts (ghostFor stays for the demo only)", () => {
    expect(typeof ghostFor).toBe("function");
  });
});
