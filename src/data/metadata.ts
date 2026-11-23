// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
/**
 * The map and the card list from DeepStruggle's rules/ (the formal spec the engine implements),
 * copied into src/data/ds/. Engine card/country ids index these.
 */
import mapJson from "./ds/map.json";
import cardsJson from "./ds/cards.json";
import type { CardMetadata, MapMetadata } from "../engine/types";

export const MAP_METADATA = mapJson as unknown as MapMetadata;
export const CARDS_METADATA = cardsJson as unknown as CardMetadata[];
