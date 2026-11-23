/**
 * The DEFCON-2 danger frame (ui-spec §10.5): an inset frame over the whole app (z 100, never
 * interactive) — a 2 px alert border and a 60 px inner glow pulsing every 2.4 s (ambient; static under
 * reduced motion). It shows whenever `Shown.state.defcon === 2`; while a frame animates, the DEFCON beat
 * switches it with the lamp (before the commit).
 *
 * The shell renders it once at the app root: `<DangerFrame />`.
 */
import { useShown } from "../runner/ShownContext";
import { useReducedMotion } from "../state/useReducedMotion";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./DangerFrame.module.css";

export function DangerFrame() {
  const shown = useShown();
  const store = useStageStore();
  useStageBeats(["dangerTrack"], store);
  const override = useStageState(st => st.danger, store);
  const reduced = useReducedMotion();
  const on = override ?? shown.state?.defcon === 2;
  if (!on) return null;
  return <div className={`${s.frame} ts-ambient`} aria-hidden="true" data-danger="" data-reduced={reduced || undefined} />;
}
