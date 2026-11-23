/**
 * React binding of the frame runner (ui-spec §9.1): one `FrameRunner` per controller, started while
 * mounted; Shift held = boost; a hidden tab finishes frames at once. Components read the result
 * through `useShown()` (ShownContext.tsx), not this hook.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Frame } from "../../game/contract";
import type { Shown, UiRoot } from "../ui-contract";
import { FrameRunner } from "./frameRunner";

export interface FrameRunnerOptions {
  /** After each commit (Shown updated), before the ack: drop animation overrides here. */
  onCommit?: (frame: Frame) => void;
}

/** The runner instance for `root` (created once per controller + director). */
export function useFrameRunnerInstance(root: UiRoot, opts: FrameRunnerOptions = {}): FrameRunner {
  const settingsRef = useRef(root.settings);
  settingsRef.current = root.settings;
  const commitRef = useRef(opts.onCommit);
  commitRef.current = opts.onCommit;
  const runner = useMemo(
    () => new FrameRunner({
      controller: root.controller,
      director: root.director,
      settings: () => settingsRef.current,
      onCommit: f => commitRef.current?.(f),
    }),
    [root.controller, root.director],
  );
  useEffect(() => {
    runner.start();
    return () => runner.stop();
  }, [runner]);
  // Shift held: boost (durations ÷ 3).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = (e: KeyboardEvent) => runner.setBoost(e.shiftKey);
    const off = () => runner.setBoost(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", off);
    };
  }, [runner]);
  // A hidden tab plays nothing: the current frame finishes at once, later ones at speed 0.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const on = () => runner.setHidden(document.hidden);
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [runner]);
  return runner;
}

/** ui-spec §15.3: the runner's `Shown` for `root`. */
export function useFrameRunner(root: UiRoot, opts: FrameRunnerOptions = {}): Shown {
  const runner = useFrameRunnerInstance(root, opts);
  return useSyncExternalStore(runner.subscribe, runner.getShown, runner.getShown);
}
