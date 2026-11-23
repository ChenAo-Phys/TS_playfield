# tools/

Data generators. Run from the repository root.

| script | what | run |
|---|---|---|
| `gen-data.mjs` | Writes `src/data/cards.ts` and `src/data/countries.ts` from `game_resources/card_text.json`, `docs/notes/cards_meta.json`, `docs/notes/countries.json`, cross-checked against `src/data/ds/{cards,map}.json`. Chinese country-name overrides live here (`ZH_NAME_OVERRIDES`, see `docs/glossary.md`). | `node tools/gen-data.mjs` (`--check` exits 1 when an output is stale; `tests/i18n/data.test.ts` checks the same) |
| `ui-keys.mjs` | The War Table UI's `ui:` keys (ui-spec §14.1, §11.2, §12; `UI_KEYS`, `[en, zh]` per leaf). Deep-merges them into `src/i18n/locales/{en,zh-CN}/ui.json`; keys not listed there are kept. Map-only short names are in `gen-data.mjs` (`EN_SHORT_NAMES`, `ZH_SHORT_NAMES`). | `node tools/ui-keys.mjs` (`--check` exits 1 on drift; `tests/i18n/ui-keys.test.ts` checks the same) |
| `notes/build_countries.py` | Built `docs/notes/countries.json` from DeepStruggle's engine table, `rules/map.json`, `map_view.ts`, its zh-CN names, and `notes/ref_boxes.json`. | `python3 tools/notes/build_countries.py vendor/DeepStruggle tools/notes/ref_boxes.json docs/notes/countries.json` |
| `notes/ref_boxes.py` | Snapped hand-read country boxes to the outlines on `game_resources/TS_map.jpg` (needs Pillow); output `notes/ref_boxes.json`. | see the script's docstring |
| `notes/board_ref.py` | Wrote `docs/notes/board_ref_positions.json` (scoring boxes, tracks, labels on `TS_map.jpg`). | `python3 tools/notes/board_ref.py docs/notes/board_ref_positions.json` |
| `notes/build_cards.py` | Built `docs/notes/cards_meta.json` from DeepStruggle's `card_data.cpp`, `rules/cards.json`, zh-CN catalog, our `card_text.json` and the card galleries. | `python3 tools/notes/build_cards.py vendor/DeepStruggle game_resources docs/notes/cards_meta.json` |

The `notes/` scripts are the research-phase generators (copied from the scratchpad, unchanged); they only read
`vendor/DeepStruggle`.
