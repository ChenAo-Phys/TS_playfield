/**
 * Motion and layering constants for JavaScript (the frame runner, WAAPI animations, portals).
 * Mirrors tokens.css sections E and F; tests/theme/tokens.test.ts keeps both in sync.
 * The animation catalogue these numbers implement is docs/design/ui-spec.md §9.
 */

/** Base durations at speed 1× (ms). */
export const DUR = {
  xs: 120,
  s: 220,
  m: 380,
  l: 650,
  xl: 900,
  holdRead: 900,
  holdLong: 1400,
} as const;

/** Easing curves (CSS syntax, usable as WAAPI `easing`). */
export const EASE = {
  out: "cubic-bezier(.2, .8, .2, 1)",
  in: "cubic-bezier(.4, 0, 1, 1)",
  inOut: "cubic-bezier(.65, 0, .35, 1)",
  thunk: "cubic-bezier(.3, 1.45, .45, 1)",
  back: "cubic-bezier(.34, 1.56, .64, 1)",
  linear: "linear",
  flicker: "steps(2, end)",
} as const;
export type EaseName = keyof typeof EASE;

/** Stacking layers (also --ts-z-* in tokens.css). */
export const Z = {
  map: 0,
  mapHud: 10,
  tray: 15,
  rail: 20,
  console: 30,
  stage: 40,
  flight: 50,
  sheet: 60,
  modal: 70,
  popover: 80,
  toast: 90,
  gameover: 95,
  danger: 100,
} as const;

/** The animation-speed setting (ui-spec §9.2); labels are `ui:settings.speed.<value>`. */
export type SpeedSetting = "slow" | "normal" | "fast" | "instant";
export const SPEED_FACTOR: Readonly<Record<SpeedSetting, number>> = {
  slow: 1.4,
  normal: 1,
  fast: 0.55,
  instant: 0,
};

/**
 * Per-beat timings at 1× (ms), one entry per row of the animation catalogue (ui-spec §9.4).
 * `block` is how long the runner waits before the next beat; `hold` is reading time that the
 * speed setting scales but reduced motion does not remove; anything else runs in parallel.
 */
export const TIMING = {
  turnStart: { in: 350, hold: 900, holdEra: 1300, out: 350 },
  phaseBanner: { in: 250, hold: 700, out: 250 },
  actionRound: { dur: 300 },
  deal: { perCard: 280, stagger: 70, maxTotal: 1400 },
  reshuffle: { dur: 900, toast: 3000 },
  handRevealed: { perCard: 350, stagger: 90, stamp: 300 },
  aiCardReveal: { flight: 450, flip: 300, caption: 200, hold: 1100, dock: 350 },
  humanCardPlayed: { dur: 300 },
  cardToPile: { dur: 450 },
  passStamp: { dur: 300 },
  cardMoved: { dur: 450, stagger: 60, maxTotal: 1200 },
  headlineChosen: { dur: 400 },
  headlineReveal: { drop: 500, stamp: 250, hold: 1600, fold: 350 },
  influenceAdd: { dur: 260, float: 700 },
  influenceRemove: { dur: 220, float: 700 },
  countryStagger: { dur: 120 },
  control: { delay: 80, dur: 350 },
  roll: { lock: 250, tumble: 700, math: 200, hold: 900, holdShort: 600 },
  vp: { dur: 600, chip: 600 },
  defconDown: { flicker: 300, light: 400, toast: 3000 },
  defconUp: { dur: 400 },
  milops: { dur: 300, stagger: 40 },
  space: { dur: 600, perkToast: 2000 },
  scoring: { in: 360, row: 120, net: 300, hold: 2000 },
  effectOn: { dur: 450 },
  effectOff: { dur: 300 },
  chinaCard: { flight: 700, flip: 300, toast: 2500 },
  gameOver: { beat: 600, rise: 480, stamp: 300, chart: 900 },
  cameraPan: { dur: 350 },
  stageEnter: { dur: 380 },
  toast: { in: 220, out: 220, default: 3000 },
} as const;

export interface FrameSpeedInput {
  speed: SpeedSetting;
  /** `Frame.auto` (single legal option / forced event target). */
  auto: boolean;
  /** `Frame.actor === humanSide` and not auto: the human just made this move. */
  byHuman: boolean;
  /** `ViewModel.queued` when the frame started. */
  queued: number;
  /** Space / click on the stage, or "skip to my turn" in progress. */
  skipping?: boolean;
  /** Shift held down. */
  boost?: boolean;
}

export interface FrameSpeed {
  /** Multiplier for motion durations (0 = instant). */
  motion: number;
  /** Multiplier for reading holds (0 = no hold). */
  hold: number;
}

/**
 * How fast a frame plays (ui-spec §9.2). Motion and holds scale separately: auto-played frames and
 * long queues drop their holds; the human's own moves play quicker but keep the dice hold.
 */
export function frameSpeed(i: FrameSpeedInput): FrameSpeed {
  const base = SPEED_FACTOR[i.speed];
  if (i.skipping || base === 0) return { motion: 0, hold: 0 };
  let motion = base;
  let hold = base;
  if (i.auto) { motion *= 0.6; hold = 0; }
  if (i.byHuman) motion *= 0.6;
  if (i.queued > 6) { motion *= 0.3; hold = 0; } else if (i.queued > 2) { motion *= 0.6; hold *= 0.6; }
  if (i.boost) { motion /= 3; hold /= 3; }
  return { motion, hold };
}

/** A base duration under a multiplier, rounded to whole ms (0 stays 0). */
export function dur(base: number, factor: number): number {
  return factor <= 0 ? 0 : Math.round(base * factor);
}
