/**
 * Registers the map's beat handler with the frame runner's Director (ui-spec §9.4 rows `influence` /
 * `control`, §4.7 compact camera): before a country beat on compact layouts (or with `follow`), an
 * off-screen box is panned into view first, keeping the zoom (unless the user is touching or just
 * moved the map); then the box animates.
 */
import { useEffect, type RefObject } from "react";
import type { FrameSpeed, LayoutKind } from "../theme";
import type { CountryBeat, CountryBeatDirector, MapHandle } from "./contract";

/** The `country` beat handler over whatever map is mounted (pure; unit-tested). */
export function countryBeatHandler(getMap: () => MapHandle | null, follow: boolean) {
  return async (beat: CountryBeat, ctx: { speed: FrameSpeed; signal: AbortSignal }): Promise<void> => {
    const map = getMap();
    if (!map) return;
    if (follow && ctx.speed.motion > 0 && !ctx.signal.aborted && !map.isVisible(beat.country)) {
      await map.reveal(beat.country, { animate: true });
    }
    await map.playCountry(beat, ctx.speed, ctx.signal);
  };
}

export function useMapBeats(
  ref: RefObject<MapHandle | null>,
  director: CountryBeatDirector,
  opts: { layout?: LayoutKind; follow?: boolean } = {},
): void {
  const follow = opts.follow ?? (opts.layout === "compact" || opts.layout === "compact-landscape");
  useEffect(() => director.on("country", countryBeatHandler(() => ref.current, follow)), [director, ref, follow]);
}
