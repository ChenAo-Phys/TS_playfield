// Ported from DeepStruggle (https://github.com/mihaild/DeepStruggle, commit 5b95e91), MIT License,
// Copyright (c) 2026 Mikhail Dektyarev. See THIRD_PARTY_LICENSES.md.
// One language's catalogs by namespace. DeepStruggle's play-related namespaces (common ... hud) plus
// ours: `ui` (app chrome, src/i18n owns it) and `prompt` (prompt titles, src/game owns it), plus one
// `ui_<area>` namespace per src/ui workstream (each owned by that workstream; see docs/ARCHITECTURE.md).
// Card, country and region names are not here: they come from src/data.
import common from "./common.json";
import hud from "./hud.json";
import rolls from "./rolls.json";
import region from "./region.json";
import map from "./map.json";
import tracks from "./tracks.json";
import cards from "./cards.json";
import branches from "./branches.json";
import effects from "./effects.json";
import enums from "./enums.json";
import endings from "./endings.json";
import actions from "./actions.json";
import log from "./log.json";
import prompt from "./prompt.json";
import ui from "./ui.json";
import ui_common from "./ui_common.json";
import ui_runner from "./ui_runner.json";
import ui_console from "./ui_console.json";
import ui_tray from "./ui_tray.json";
import ui_prompts from "./ui_prompts.json";
import ui_stage from "./ui_stage.json";
import ui_shell from "./ui_shell.json";

export default {
  common, hud, rolls, region, map, tracks, cards, branches, effects, enums, endings, actions, log, prompt, ui,
  ui_common, ui_runner, ui_console, ui_tray, ui_prompts, ui_stage, ui_shell,
};
