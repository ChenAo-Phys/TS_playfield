/**
 * The map's runner glue and strings: the `country` beat handler pans before off-screen beats when
 * following, then plays; map strings fall back to local English/Chinese until the catalog has them.
 */
import { afterAll, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n";
import type { CountryBeat, CountryBeatDirector, MapHandle } from "../../src/ui/map/contract";
import { mapText } from "../../src/ui/map/strings";
import { countryBeatHandler } from "../../src/ui/map/useMapBeats";

function fakeMap(visible: boolean) {
  const calls: string[] = [];
  const map = {
    isVisible: () => visible,
    reveal: async (id: number) => { calls.push(`reveal ${id}`); },
    playCountry: async (b: CountryBeat) => { calls.push(`play ${b.country}`); },
  } as unknown as MapHandle;
  return { map, calls };
}
const beat: CountryBeat = { k: "country", country: 25, influence: [{ side: "US", from: 1, to: 2 }] };
const ctx = (motion = 1) => ({ speed: { motion, hold: 1 }, signal: new AbortController().signal });

describe("country beat handler", () => {
  it("pans to an off-screen box first when following", async () => {
    const { map, calls } = fakeMap(false);
    await countryBeatHandler(() => map, true)(beat, ctx());
    expect(calls).toEqual(["reveal 25", "play 25"]);
  });

  it("does not move the camera when not following, when visible, or at instant speed", async () => {
    for (const [follow, visible, motion] of [[false, false, 1], [true, true, 1], [true, false, 0]] as const) {
      const { map, calls } = fakeMap(visible);
      await countryBeatHandler(() => map, follow)(beat, ctx(motion));
      expect(calls).toEqual(["play 25"]);
    }
  });

  it("resolves at once with no map mounted", async () => {
    await expect(countryBeatHandler(() => null, true)(beat, ctx())).resolves.toBeUndefined();
  });

  it("is a handler a Director accepts", () => {
    let registered = false;
    const director: CountryBeatDirector = { on: (kind, h) => { registered = kind === "country" && typeof h === "function"; return () => undefined; } };
    director.on("country", countryBeatHandler(() => null, false));
    expect(registered).toBe(true);
  });
});

describe("map strings", () => {
  afterAll(async () => { await setLanguage("en"); });

  it("uses the local text in either language until the catalog has the key", async () => {
    await setLanguage("en");
    expect(mapText("en", "map.toUSA")).toBe("To USA");
    expect(mapText("zh", "map.toUSA")).toBe("往美国");
    expect(mapText("en", "plate.net", { side: "USSR", vp: 2 })).toBe("USSR +2");
    await setLanguage("zh-CN");
    expect(mapText("zh", "plate.wins", { side: "美国" })).toBe("美国获胜");
    expect(mapText("en", "plate.even")).toBe("Even");
  });
});
