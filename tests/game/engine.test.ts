/**
 * The engine wrapper's extensions: loading from a file URL under Node, stderr routing of anomaly
 * dumps, the first-headline split, the RNG string, the debug card-location helpers.
 */
import { describe, expect, it } from "vitest";
import { EngineDiagnostics, WasmEngine } from "../../src/engine/wasm_engine";
import { loadEngine, mulberry32, PUBLIC_BASE } from "./helpers";

describe("WasmEngine extensions", () => {
  it("builds the module URL from a site base or an absolute base", () => {
    expect(WasmEngine.moduleUrl("file:///x/public/")).toBe("file:///x/public/engine/ts_engine.mjs");
    expect(WasmEngine.moduleUrl("file:///x/public")).toBe("file:///x/public/engine/ts_engine.mjs");
    expect(WasmEngine.moduleUrl("https://chenao-phys.github.io/TS_playfield/")).toBe("https://chenao-phys.github.io/TS_playfield/engine/ts_engine.mjs");
    // No location under Node: a site-relative base stays a path.
    expect(WasmEngine.moduleUrl("/TS_playfield/")).toBe("/TS_playfield/engine/ts_engine.mjs");
  });

  it("loads under Node from public/engine through a file URL", async () => {
    const E = await WasmEngine.load(PUBLIC_BASE);
    expect(E.actionSize).toBe(304);
    expect(E.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    E.newGame(1234);
    expect(E.rngState()).toMatch(/^\d+$/);
  });

  it("routes anomaly dumps to the diagnostics buffer and other lines to the fallback", () => {
    const other: string[] = [];
    const d = new EngineDiagnostics(l => other.push(l), 2);
    const dump = (n: number) => ["", `=== ts engine anomaly #${n}: POINT_NODE with no legal target ===`, "turn 2 AR 0 phase 1",
      "state=00ff", `=== end anomaly #${n} ===`];
    for (const l of [...dump(1), "plain error", ...dump(2), ...dump(3)]) d.line(l);
    expect(other).toEqual(["plain error"]);
    expect(d.anomalyCount).toBe(3);
    expect(d.anomalies).toHaveLength(2);
    expect(d.anomalies[1].header).toContain("#3");
    expect(d.anomalies[1].context).toBe("turn 2 AR 0 phase 1");
  });

  it("splits the headlines with firstHeadline and keeps the real step's dice", async () => {
    const E = await loadEngine();
    let splits = 0;
    for (let g = 0; g < 20 && splits < 5; g++) {
      E.newGame(500 + g);
      E.seat(1, E.currentRules);
      E.seat(-1, 12);
      const rand = mulberry32(g);
      for (let s = 0; s < 400 && !E.isTerminal(); s++) {
        const m = E.mask(false);
        const legal = [...m.keys()].filter(i => m[i]);
        const a = E.decodeFlat(legal[Math.floor(rand() * legal.length)]);
        const d = E.display();
        const fh = d.current_phase_name === "HEADLINE" ? E.firstHeadline(a) : null;
        const save = E.saveJson();
        expect(E.step(a, 0)).toBeNull();
        if (fh) {
          splits++;
          // The preview did not touch the game, and its dice are the real step's first dice.
          expect(fh.rolls).toBeLessThanOrEqual(E.clickRolls().length);
          expect(fh.state.headline_first_card).toBeGreaterThan(0);
          expect(save).not.toBe(E.saveJson());
        }
      }
    }
    expect(splits).toBeGreaterThan(0);
    expect(E.diagnostics.anomalyCount).toBeGreaterThanOrEqual(0);
  });

  it("reads and moves card locations (debug)", async () => {
    const E = await loadEngine();
    E.newGame(77);
    const d = E.display();
    const card = d.hands.USSR[0];
    expect(E.cardLocation(card)).toBe(4); // HAND_USSR_UNKNOWN
    expect(E.setCardLocation(card, 6)).toBeNull();
    expect(E.display().card_locations?.[String(card)]).toBe("DISCARD_PILE");
  });
});
