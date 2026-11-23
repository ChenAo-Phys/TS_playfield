import { describe, expect, it } from "vitest";
import { drive, makeController, mulberry32 } from "./helpers";

describe("controller smoke", () => {
  it("plays one game as each side", async () => {
    for (const side of ["USSR", "US"] as const) {
      const h = makeController({ aiSalt: 7 });
      await h.ctrl.boot();
      const t0 = performance.now();
      await h.ctrl.newGame({ side, seed: side === "US" ? 1001 : 1002 });
      const rec = await drive(h, { rand: mulberry32(5), avoidWarned: 0.95, undoRate: 0.05 });
      console.log(side, rec.steps, "steps", rec.prompts, "prompts", rec.frames, "frames", Math.round(performance.now() - t0), "ms", rec.ending, rec.undos, "undos");
      expect(rec.leaks).toEqual([]);
      expect(rec.problems).toEqual([]);
      expect(rec.ending).not.toBeNull();
    }
  });
});
