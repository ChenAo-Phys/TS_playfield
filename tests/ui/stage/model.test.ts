/**
 * The stage's pure helpers (src/ui/stage/model.ts): scoring regions, eras, the dock's note and collapse
 * target, dice anchors and texts (on every roll recorded in the fixtures), Defectors, scoring rows,
 * tray placement.
 */
import { afterAll, describe, expect, it } from "vitest";
import { REGIONS } from "../../../src/data";
import type { DieRollState } from "../../../src/engine/types";
import type { Frame, GameEvent } from "../../../src/game/contract";
import { render, setLanguage } from "../../../src/i18n";
import {
  cancelledHeadline, cappedVp, clampInside, collapseAnchor, finalScoringRows, pickSheetSide, slotCountries, diceAnchor, diceModel, dockBesideSheet, eraOf,
  eraStampOf, hangUnder, rollCountry,
  influenceDeltas, isOpsPlay, opponentNote, overlaps, placeBeside, playedBy, regionInk, scoringRows, scoringSlot, sheetSide, shuttleApplied, slotKey, vpLead,
} from "../../../src/ui/stage/model";
import { fixture, fixtureNames } from "../../fixtures/load";

afterAll(async () => { await setLanguage("en"); });

const frameWith = (events: GameEvent[], base?: Frame): Frame => ({
  seq: 1, state: base?.state ?? fixture("prompt-midgame").frames[0]!.state, regionScores: base?.regionScores ?? { regions: [], ignored_flags: [] },
  actor: "US", events, auto: false,
});

const roll = (r: Partial<DieRollState> & { type: string }): DieRollState => ({
  card_id: 0, card_name: "", country_id: 255, country_name: "", mod1: 0, mod2: 0, net_delta: 0, roll1: 1, roll2: 0, roller: "US", success: false, total1: 1, total2: 0, ...r,
});

describe("regions and eras", () => {
  it("maps every scoring card to its region slot (from src/data)", () => {
    expect([2, 1, 3, 79, 37, 81, 38].map(scoringSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(scoringSlot(4)).toBeNull();
    for (const r of REGIONS) expect(scoringSlot(r.scoringCard!)).toBe(r.id);
  });

  it("docks the sheet away from the region, inks it, names it", () => {
    expect([0, 1, 2, 3, 6].map(s => sheetSide(s as 0))).toEqual(["left", "left", "left", "left", "left"]);
    expect([4, 5].map(s => sheetSide(s as 4))).toEqual(["right", "right"]);
    expect(regionInk(0)).toEqual({ ink: "var(--ts-reg-eue)", paperText: true });
    expect(regionInk(6).ink).toBe("var(--ts-reg-sea)");
    expect(slotKey(6)).toBe("SOUTHEAST_ASIA");
    expect(slotKey(2)).toBe("MIDDLE_EAST");
  });

  it("knows the eras of the turn track and the turns new cards enter", () => {
    expect([1, 3, 4, 7, 8, 10].map(eraOf)).toEqual(["early", "early", "mid", "mid", "late", "late"]);
    expect([3, 4, 5, 8, 9].map(eraStampOf)).toEqual([null, "mid", null, "late", null]);
  });
});

describe("reveal dock", () => {
  it("notes an opponent card played for Ops (its event happens for the owner)", () => {
    // #30 Decolonization is a USSR card, #26 CIA Created a US card, #32 UN Intervention neutral.
    expect(opponentNote(30, "US", "coup")).toBe("USSR");
    expect(opponentNote(30, "US", "influence")).toBe("USSR");
    expect(opponentNote(30, "US", "space")).toBeNull();
    expect(opponentNote(30, "USSR", "coup")).toBeNull();
    expect(opponentNote(26, "USSR", "realign")).toBe("US");
    expect(opponentNote(32, "USSR", "influence")).toBeNull();
    expect(opponentNote(30, "US", "event")).toBeNull();
    expect(["influence", "coup", "realign", "space"].every(h => isOpsPlay(h as "coup"))).toBe(true);
    expect(isOpsPlay("event")).toBe(false);
  });

  it("collapses into the card's pile, else fades", () => {
    expect(collapseAnchor("DISCARD_PILE")).toBe("discard");
    expect(collapseAnchor("REMOVED_FROM_GAME")).toBe("removed");
    expect(collapseAnchor("ONGOING_EVENT")).toBe("effects");
    expect(collapseAnchor("UNSEEN")).toBeNull();
    expect(collapseAnchor("HAND_US_KNOWN")).toBeNull();
    expect(collapseAnchor(undefined)).toBeNull();
  });

  it("finds who played a card in a frame", () => {
    const f = frameWith([{ t: "card-played", side: "USSR", card: 37, how: "scoring" }]);
    expect(playedBy(f, 37)).toBe("USSR");
    expect(playedBy(f, 2)).toBeNull();
  });
});

describe("dice", () => {
  it("anchors the tray at the country, the space track or the table centre", () => {
    expect(diceAnchor(roll({ type: "COUP", country_id: 71 }))).toBe("country:71");
    expect(diceAnchor(roll({ type: "REALIGNMENT", country_id: 0 }))).toBe("country:0");
    expect(diceAnchor(roll({ type: "WAR_EVENT", country_id: 33 }))).toBe("country:33");
    expect(diceAnchor(roll({ type: "WAR_EVENT", country_id: 255 }))).toBe("stage");
    expect(diceAnchor(roll({ type: "SPACE_RACE", roller: "USSR", country_id: 3 }))).toBe("space:USSR");
    expect(diceAnchor(roll({ type: "SUMMIT" }))).toBe("stage");
    expect(diceAnchor(roll({ type: "TRAP_ESCAPE", country_id: 255 }))).toBe("stage");
  });

  it("names a country only for a coup, a realignment or a war (R-007: a space roll keeps its box in country_id)", async () => {
    expect(rollCountry(roll({ type: "COUP", country_id: 71 }))).toBe(71);
    expect(rollCountry(roll({ type: "REALIGNMENT", country_id: 0 }))).toBe(0);
    expect(rollCountry(roll({ type: "WAR_EVENT", country_id: 33 }))).toBe(33);
    expect(rollCountry(roll({ type: "WAR_EVENT", country_id: 255 }))).toBeNull();
    expect(rollCountry(roll({ type: "COUP", country_id: 84 }))).toBeNull();
    for (const type of ["SPACE_RACE", "OLYMPIC_GAMES", "SUMMIT", "TRAP_ESCAPE", "NONE"]) {
      expect(rollCountry(roll({ type, country_id: 2 }))).toBeNull();
    }
    expect(diceAnchor(roll({ type: "SPACE_RACE", roller: "US", country_id: 2 }))).toBe("space:US");
    await setLanguage("en");
    const m = diceModel(roll({ type: "SPACE_RACE", roller: "USSR", country_id: 2, roll1: 6, mod1: 4 }), frameWith([]), null);
    expect(render(m.title)).not.toMatch(/Norway/);
  });

  it("sums influence changes per side over a frame, US first", () => {
    const f = frameWith([
      { t: "influence", country: 56, side: "USSR", from: 0, to: 2 }, { t: "influence", country: 56, side: "US", from: 1, to: 0 },
      { t: "influence", country: 56, side: "USSR", from: 2, to: 3 }, { t: "influence", country: 4, side: "US", from: 0, to: 1 },
    ]);
    expect(influenceDeltas(f, 56)).toEqual([{ side: "US", delta: -1 }, { side: "USSR", delta: 3 }]);
    expect(influenceDeltas(null, 56)).toEqual([]);
  });

  it("writes the coup maths and result from the engine's record", async () => {
    await setLanguage("en");
    const m = diceModel(
      roll({ type: "COUP", roller: "US", country_id: 71, country_name: "Cuba", roll1: 6, mod1: 3, total1: 9, mod2: 6, total2: 6, success: true, net_delta: 3 }),
      frameWith([{ t: "influence", country: 71, side: "USSR", from: 3, to: 0 }]), null,
    );
    expect(render(m.title)).toBe("Coup · Cuba");
    expect(m.dice).toEqual([{ side: "US", face: 6 }]);
    expect(render(m.math!)).toBe("6 + 3 Ops − 2×3 = 3");
    expect(m.result.map(r => render(r))).toEqual(["USSR −3"]);
    expect(m.ok).toBe(true);
    const one = diceModel(roll({ type: "COUP", roller: "USSR", country_id: 44, roll1: 4, mod1: 1, total1: 5, mod2: 6, total2: 6 }), frameWith([]), null);
    expect(render(one.math!)).toBe("4 + 1 Op − 2×3 = −1");
    expect(render(one.result[0]!)).toBe("Fails");
    expect(one.ok).toBe(false);
  });

  it("puts the US die left and the USSR die right in opposed rolls", async () => {
    await setLanguage("en");
    const r = diceModel(roll({ type: "REALIGNMENT", country_id: 22, roll1: 5, mod1: 1, total1: 6, roll2: 2, mod2: 1, total2: 3 }), frameWith([{ t: "influence", country: 22, side: "USSR", from: 3, to: 0 }]), null);
    expect(r.dice.map(d => [d.side, d.face, d.mod])).toEqual([["US", 5, "+1"], ["USSR", 2, "+1"]]);
    expect(render(r.math!)).toBe("6 vs 3");
    expect(render(r.result[0]!)).toBe("USSR −3");
    const tie = diceModel(roll({ type: "REALIGNMENT", country_id: 22, roll1: 3, mod1: 2, total1: 5, roll2: 4, mod2: 1, total2: 5 }), frameWith([]), null);
    expect(render(tie.result[0]!)).toBe("Tie");
    expect(tie.ok).toBeNull();
    // Olympic Games: roll1 is the sponsor's; a USSR sponsor's die still goes right.
    const og = diceModel(roll({ type: "OLYMPIC_GAMES", roller: "USSR", card_id: 20, roll1: 3, total1: 5, roll2: 4, total2: 4 }), frameWith([{ t: "vp", from: 0, to: -2 }]), null);
    expect(og.dice.map(d => [d.side, d.face, d.mod])).toEqual([["US", 4, "0"], ["USSR", 3, "+2"]]);
    expect(og.result.map(x => render(x))).toEqual(["USSR wins", "USSR +2 VP"]);
  });

  it("describes space, war, summit and trap rolls", async () => {
    await setLanguage("en");
    const sp = diceModel(roll({ type: "SPACE_RACE", roller: "US", roll1: 2, mod1: 3, total1: 5, success: true }), frameWith([{ t: "space", side: "US", from: 2, to: 3 }]), null);
    expect(render(sp.math!)).toBe("Roll 2 · needs 3 or less");
    expect(render(sp.result[0]!)).toBe("US reaches box 3");
    const war = diceModel(roll({ type: "WAR_EVENT", card_id: 24, country_id: 33, roll1: 5, mod1: -1, total1: 4, mod2: 4, success: true }), frameWith([{ t: "vp", from: 0, to: 2 }]), null);
    expect(render(war.title)).toBe("Indo-Pakistani War · India");
    expect(render(war.math!)).toBe("5 −1 = 4 · needs 4+");
    expect(war.result.map(x => render(x))).toEqual(["Success", "US +2 VP"]);
    const summit = diceModel(roll({ type: "SUMMIT", card_id: 48, roll1: 3, mod1: 1, total1: 4, roll2: 5, mod2: 1, total2: 6 }), frameWith([]), null);
    expect(render(summit.result[0]!)).toBe("USSR wins");
    const trap = diceModel(roll({ type: "TRAP_ESCAPE", roll1: 4, mod2: 4, success: true }), frameWith([]), null);
    expect(render(trap.math!)).toBe("Roll 4 · needs 4 or less");
    expect(render(trap.result[0]!)).toBe("Escapes");
  });

  it("describes every roll recorded in the fixtures, in English and Chinese", async () => {
    const models: ReturnType<typeof diceModel>[] = [];
    for (const name of fixtureNames("sequence")) {
      const fx = fixture(name);
      fx.frames.forEach((f, i) => {
        for (const e of f.events) {
          if (e.t !== "roll") continue;
          const m = diceModel(e.roll, f, fx.frames[i - 1]?.state ?? f.state);
          expect(m.dice.length).toBe(e.roll.type === "REALIGNMENT" || e.roll.type === "SUMMIT" || e.roll.type === "OLYMPIC_GAMES" ? 2 : 1);
          models.push(m);
        }
      });
    }
    expect(models.length).toBeGreaterThan(50);
    for (const lang of ["en", "zh-CN"] as const) {
      await setLanguage(lang);
      for (const m of models) {
        for (const tx of [m.title, ...(m.math ? [m.math] : []), ...m.result].map(x => render(x))) expect(tx).not.toMatch(/ui_stage:|rolls:|\{\{|undefined/);
      }
    }
    await setLanguage("zh-CN");
    const zh = diceModel(roll({ type: "COUP", roller: "US", country_id: 71, roll1: 6, mod1: 3, total1: 9, mod2: 6, total2: 6, success: true }), frameWith([{ t: "influence", country: 71, side: "USSR", from: 3, to: 0 }]), null);
    expect(render(zh.title)).toBe("政变 · 古巴");
    expect(render(zh.math!)).toBe("6 + 3 行动点 − 2×3 = 3");
    expect(render(zh.result[0]!)).toBe("苏联 −3");
    await setLanguage("en");
  });
});

describe("headline", () => {
  it("finds a headline cancelled in the frame (Defectors) and nothing otherwise", () => {
    const seq = fixture("seq-headline");
    const reveal = seq.frames.find(f => f.events.some(e => e.t === "headline-reveal"))!;
    expect(cancelledHeadline(reveal, 24, 18)).toBe(0);
    const defectors = frameWith([
      { t: "headline-reveal", us: 103, ussr: 21, first: "US" }, { t: "card-played", side: "US", card: 103, how: "headline" },
      { t: "card-moved", card: 21, from: "HEADLINE_COMMITTED", to: "DISCARD_PILE" }, { t: "card-moved", card: 103, from: "UNSEEN", to: "DISCARD_PILE" },
    ]);
    expect(cancelledHeadline(defectors, 103, 21)).toBe(21);
  });
});

describe("scoring rows", () => {
  const scores = fixture("prompt-midgame").frames[0]!.regionScores;

  it("lists status, countries, battlegrounds, adjacent, status VP and total for a region", () => {
    const me = scores.regions.find(r => r.slot === 2)!;
    const rows = scoringRows(me);
    expect(rows.map(r => r.key)).toEqual(["status", "countries", "battlegrounds", "adjacent", "base", "total"]);
    expect(rows[0]!.status).toBe(true);
    expect(rows[5]).toMatchObject({ us: me.us.vp, ussr: me.ussr.vp, total: true });
    expect(rows.filter(r => r.each).map(r => r.key)).toEqual(["battlegrounds", "adjacent"]);
  });

  it("lists Southeast Asia country by country", () => {
    const sea = scores.regions.find(r => r.slot === 6)!;
    const rows = scoringRows(sea);
    const controlled = [...sea.us.controlled, ...sea.ussr.controlled];
    expect(rows.length).toBe(new Set(controlled.map(c => c.id)).size + 1);
    expect(rows[rows.length - 1]).toMatchObject({ key: "total", us: sea.us.vp, ussr: sea.ussr.vp });
    for (const r of rows.slice(0, -1)) expect("country" in r.label).toBe(true);
  });

  it("the final scoring: six regions, the China Card's +1 for its holder, the total; the net is the rows'", async () => {
    const regions = scores.regions.filter(r => r.slot <= 5);
    const sum = regions.reduce((n, r) => n + r.net, 0);
    for (const holder of ["US", "USSR"] as const) {
      const { rows, net } = finalScoringRows(scores, holder);
      expect(rows.map(r => r.key)).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "china", "total"]);
      const china = rows.find(r => r.key === "china")!;
      expect(china.label).toEqual({ card: 6 });
      expect([china.us, china.ussr]).toEqual(holder === "US" ? [1, null] : [null, 1]);
      const total = rows[rows.length - 1]!;
      expect(total).toMatchObject({ total: true });
      expect(Number(total.us) - Number(total.ussr)).toBe(net);
      // Scoring::execute_final_scoring: the six regions' nets, then +1 / −1 for the China Card.
      expect(net).toBe(sum + (holder === "US" ? 1 : -1));
    }
    await setLanguage("en");
    expect(render(finalScoringRows(scores, "US").rows.find(r => r.key === "china")!.sub!)).toBe("+1 VP for its holder");
    await setLanguage("zh-CN");
    expect(render(finalScoringRows(scores, "US").rows.find(r => r.key === "china")!.sub!)).toBe("持有者 +1 VP");
    await setLanguage("en");
    // Southeast Asia (slot 6) is part of Asia: never its own row. No holder known: no China row.
    expect(finalScoringRows(scores, null).rows.map(r => r.key)).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "total"]);
    expect(finalScoringRows(null, "USSR")).toMatchObject({ net: -1 });
  });

  it("knows when the VP track stopped a scoring at 20, and when it did not", () => {
    // USSR +15, Asia nets USSR +6: the track takes 5 (QA Q-019).
    expect(cappedVp(-6, -5, -20)).toBe(-5);
    // US +17, final scoring nets US +8: 3 applied.
    expect(cappedVp(8, 3, 20)).toBe(3);
    // Went through whole, also when it lands exactly on 20.
    expect(cappedVp(-4, -4, -9)).toBeNull();
    expect(cappedVp(5, 5, 20)).toBeNull();
    // Europe control sets ±20: more than the rows' net, not a stop.
    expect(cappedVp(7, 23, 20)).toBeNull();
    expect(cappedVp(-3, -17, -20)).toBeNull();
  });

  it("notes Shuttle Diplomacy only when the engine says it took a battleground out", () => {
    const me = scores.regions.find(r => r.slot === 2)!;
    expect(shuttleApplied(me)).toBe(!!me.ussr.shuttle_diplomacy);
    expect(shuttleApplied({ ...me, ussr: { ...me.ussr, shuttle_diplomacy: true } })).toBe(true);
    expect(shuttleApplied({ ...me, ussr: { ...me.ussr, shuttle_diplomacy: false } })).toBe(false);
    expect(shuttleApplied(null)).toBe(false);
  });

  it("says the VP lead the way the console does", async () => {
    await setLanguage("en");
    expect(render(vpLead(3))).toBe("US +3");
    expect(render(vpLead(-20))).toBe("USSR +20");
    expect(render(vpLead(0))).toBe("Even");
  });
});

describe("scoring sheet side", () => {
  const host = { x: 0, y: 0, w: 1100, h: 800 };
  const sheet = { x: 28, y: 120, w: 520, h: 500 };
  it("keeps the spec's side unless the other side covers clearly less of the region", () => {
    const west = [{ x: 100, y: 300, w: 56, h: 36 }, { x: 200, y: 400, w: 56, h: 36 }];
    expect(pickSheetSide("left", sheet, host, west)).toBe("right");
    const east = [{ x: 800, y: 300, w: 56, h: 36 }];
    expect(pickSheetSide("left", sheet, host, east)).toBe("left");
    const both = [{ x: 300, y: 300, w: 56, h: 36 }, { x: 700, y: 300, w: 56, h: 36 }];
    expect(pickSheetSide("left", sheet, host, both)).toBe("left");
    expect(slotCountries(6)).toContain(36);
    expect(slotCountries(0)).toContain(7);
  });
});

describe("the scoring sheet and the pinned reveal dock (R-006)", () => {
  // As measured at 1280 × 720 (r2-long): the table 0–992, the Europe sheet docked right, the dock pinned top right.
  const sheet = { x: 444, y: 74, w: 520, h: 646 };
  const dockRight = { x: 728, y: 92, w: 200, h: 257 };
  const dockLeft = { x: 28, y: 92, w: 200, h: 257 };

  it("moves the dock to the other corner when the sheet docks under it; the sheet is then free", () => {
    expect(dockBesideSheet(sheet, dockRight, dockLeft)).toBe("move");
    expect(overlaps(sheet, dockLeft, 8)).toBe(false);
    // A sheet docked on the other side leaves the dock where it is.
    const left = { ...sheet, x: 28 };
    expect(dockBesideSheet(left, dockRight, dockLeft)).toBe("stay");
  });

  it("folds the dock away when the table has no room for both", () => {
    // An 800 px tablet: the table is 732 wide, the sheet takes 520 of it on either side.
    const narrow = { x: 184, y: 70, w: 520, h: 600 };
    expect(dockBesideSheet(narrow, { x: 468, y: 88, w: 200, h: 257 }, { x: 28, y: 88, w: 200, h: 257 })).toBe("fold");
  });
});

describe("a tray hung under the space track (R-006)", () => {
  const bounds = { x: 8, y: 8, w: 976, h: 600 };
  const size = { w: 170, h: 74 };

  it("sits centred under the track when free, else just beside the pinned dock, never under it", () => {
    expect(hangUnder(500, size, bounds, [])).toEqual({ x: 415, y: 12 });
    // The track is at the table's right end, over the dock (right 64 px): the tray stops left of the dock.
    const dock = { x: 728, y: 34, w: 200, h: 257 };
    const p = hangUnder(1010, size, bounds, [dock])!;
    expect(overlaps({ ...p, ...size }, dock)).toBe(false);
    expect(p.x + size.w).toBe(dock.x - 8);
    expect(p.y).toBe(12);
    // The dock moved to the top left: the tray hangs at the right end again.
    expect(hangUnder(1010, size, bounds, [{ ...dock, x: 28 }])).toEqual({ x: 984 - 170, y: 12 });
    // No room along the top: the caller places it beside the track instead.
    expect(hangUnder(500, size, bounds, [{ x: 0, y: 0, w: 1000, h: 100 }])).toBeNull();
  });
});

describe("placement beside a box", () => {
  const bounds = { x: 0, y: 0, w: 1000, h: 700 };
  const size = { w: 220, h: 70 };

  it("goes right of the box, else left, else below, never over the box or the dock", () => {
    const box = { x: 100, y: 300, w: 56, h: 36 };
    const p = placeBeside(box, size, bounds);
    expect(p.x).toBe(box.x + box.w + 18);
    const nearRight = { x: 900, y: 300, w: 56, h: 36 };
    const q = placeBeside(nearRight, size, bounds);
    expect(q.x + size.w).toBeLessThanOrEqual(nearRight.x);
    const dock = { x: 170, y: 220, w: 250, h: 110 };
    const r = placeBeside(box, size, bounds, [dock]);
    expect(overlaps({ ...r, ...size }, dock, 4)).toBe(false);
    expect(overlaps({ ...r, ...size }, box)).toBe(false);
    // Boxed in: the least covering spot, still off the anchor.
    const wall = { x: 0, y: 0, w: 1000, h: 290 };
    const w = placeBeside(box, size, bounds, [wall]);
    expect(overlaps({ ...w, ...size }, box)).toBe(false);
    expect(w.y).toBeGreaterThanOrEqual(290);
  });

  it("clamps a box back inside the bounds with the smallest move", () => {
    expect(clampInside({ x: 234, y: 371 }, { w: 219, h: 74 }, { x: 8, y: 8, w: 374, h: 546 })).toEqual({ x: 163, y: 371 });
    expect(clampInside({ x: 100, y: 100 }, { w: 50, h: 50 }, bounds)).toEqual({ x: 100, y: 100 });
    expect(clampInside({ x: -20, y: 690 }, size, bounds)).toEqual({ x: 0, y: 630 });
    // Wider than the bounds: the left edge wins.
    expect(clampInside({ x: 40, y: 0 }, { w: 1200, h: 10 }, bounds).x).toBe(0);
  });

  it("stays inside the bounds", () => {
    for (const box of [{ x: -50, y: -50, w: 56, h: 36 }, { x: 980, y: 690, w: 56, h: 36 }, { x: 480, y: 330, w: 56, h: 36 }]) {
      const p = placeBeside(box, size, bounds, [{ x: 0, y: 0, w: 1000, h: 700 }]);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + size.w).toBeLessThanOrEqual(1000);
      expect(p.y + size.h).toBeLessThanOrEqual(700);
    }
  });
});
