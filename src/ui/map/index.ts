/**
 * The map (ui-spec §4). Public API for the shell, prompts and runner workstreams.
 *
 *   <MapView ref={mapRef} state=… regionScores=… humanSide=… layout=… targets=… … />
 *   useMapBeats(mapRef, director, { layout })
 */
export { MapView } from "./MapView";
export { countryBeatHandler, useMapBeats } from "./useMapBeats";
export type {
  CountryAnchor,
  CountryBeat,
  CountryBeatDirector,
  MapAnchorSink,
  MapHandle,
  MapInsets,
  MapTargets,
  MapViewProps,
  RegionSlot,
} from "./contract";
export { mapLabel, shortName, fullName } from "./names";
export {
  BOARD_ORDER,
  COUNTRY_LAYOUT,
  MAP_H,
  MAP_W,
  PLATES,
  areaRect,
  boundsOf,
  countriesOfSlot,
  countryRect,
} from "./layout";
export { GEOMETRY } from "./geometry.generated";
