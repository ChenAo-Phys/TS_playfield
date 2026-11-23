/**
 * endingMessages: every EndingReason renders a complete sentence in both languages, from the
 * human's point of view.
 */
import { afterAll, describe, expect, it } from "vitest";
import { render, renderEnglish, setLanguage } from "../../src/i18n";
import { cardListArg, endingMessages } from "../../src/i18n/endings";
import type { Ending, EndingReason } from "../../src/game/contract";

const REASONS: EndingReason[] = [
  "vp20", "europe-control", "defcon", "cmc-suicide", "held-scoring", "held-scoring-both",
  "milops-vp20", "final-scoring", "wargames", "resign",
];

const ending = (reason: EndingReason, winner: Ending["winner"], extra: Partial<Ending> = {}): Ending => ({
  winner, reason, vpBefore: 12, vpFinal: winner === "USSR" ? -20 : winner === "US" ? 20 : 0, turn: 6, ...extra,
});

describe("endingMessages", () => {
  afterAll(async () => { await setLanguage("en"); });

  it("titles the game from the human's side", () => {
    expect(endingMessages(ending("vp20", "US"), "US").outcome).toBe("won");
    expect(endingMessages(ending("vp20", "US"), "USSR").outcome).toBe("lost");
    expect(endingMessages(ending("final-scoring", "DRAW"), "US").outcome).toBe("draw");
    expect(renderEnglish(endingMessages(ending("vp20", "USSR"), "USSR").title)).toBe("Victory");
    expect(renderEnglish(endingMessages(ending("vp20", "USSR"), "US").title)).toBe("Defeat");
  });

  for (const lang of ["en", "zh-CN"] as const) {
    it(`renders every reason in ${lang}`, async () => {
      await setLanguage(lang);
      for (const reason of REASONS) {
        for (const winner of ["US", "USSR", "DRAW"] as const) {
          const m = endingMessages(ending(reason, winner, { cards: [2, 38] }), "US");
          const text = render(m.text);
          expect(text, `${reason}/${winner}`).not.toMatch(/\{\{|\}\}|ui:/);
          expect(render(m.title)).not.toMatch(/ui:/);
          if (lang === "zh-CN") expect(text).toMatch(/[一-鿿]/);
        }
      }
    });
  }

  it("names the loser and the held cards", async () => {
    await setLanguage("en");
    const m = endingMessages(ending("held-scoring", "USSR", { cards: [2, 38], turn: 4 }), "US");
    expect(render(m.text)).toBe("The US held a scoring card at the end of turn 4 (Europe Scoring, Southeast Asia Scoring) and loses.");
    await setLanguage("zh-CN");
    expect(render(m.text)).toBe("第 4 回合结束时美国仍持有计分牌（欧洲计分、东南亚计分），输掉游戏。");
    expect(render(endingMessages(ending("final-scoring", "US", { vpFinal: 7 }), "US").text)).toBe("最终计分后美国领先 7 VP。");
    expect(render(endingMessages(ending("resign", "USSR"), "US").text)).toBe("美国认输。");
  });

  it("joins card lists", async () => {
    await setLanguage("en");
    expect(cardListArg([])).toBe("");
    expect(cardListArg([21])).toEqual({ card: 21, name: "NATO" });
  });
});
