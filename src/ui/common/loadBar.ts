/**
 * How far the page's load has come, as one 0..1 bar over all its stages: the rules engine, then the AI's model
 * download (most of the bytes), its check and the AI's start. `LoadProgress.fraction` starts again at each stage, so
 * a bar or a percentage made from it alone falls back (98 % → 50 %, QA L-2); this one only rises. The start screen's
 * boot line (`bootProgress`) and the slip's "GETTING THE AI READY… N%" both read it.
 */
import type { LoadProgress } from "../../game/contract";

export function loadBar(load: LoadProgress): number {
  switch (load.stage) {
    case "engine": return 0.08;
    case "model-download": return 0.15 + 0.65 * (load.fraction ?? 0);
    case "model-verify": return 0.84;
    case "ai-worker": return 0.9 + 0.1 * (load.fraction ?? 0);
    default: return 0.15;
  }
}

/** `loadBar` as a whole percentage (0 when nothing loads). */
export function loadPercent(load: LoadProgress | undefined): number {
  return load ? Math.round(loadBar(load) * 100) : 0;
}
