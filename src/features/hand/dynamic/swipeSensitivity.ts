import { DEFAULT_SWIPE } from './swipe';
import type { SwipeConfig } from './swipe';

/**
 * How hard a swipe has to be. "normal" is the tuned default (what the tests and the false-trigger counter were
 * measured with). The easier levels accept shorter, slower, less straight sweeps, at the cost of more accidental
 * swipes; they are opt-in from the Slide Remote demo.
 */
export type SwipeSensitivity = 'normal' | 'easy' | 'easiest';

export const SWIPE_LEVELS: readonly { id: SwipeSensitivity; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'easy', label: 'Easy' },
  { id: 'easiest', label: 'Easiest' },
];

/** Overrides on top of DEFAULT_SWIPE. Constant objects: the detector notices a change by identity. */
export const SWIPE_PRESETS: Record<SwipeSensitivity, Partial<SwipeConfig>> = {
  normal: {},
  easy: { minDistance: 1.4, minSpeed: 2.4, minDominance: 1.6, minStraightness: 0.6, windowMs: 600 },
  easiest: {
    minDistance: 1.0,
    minSpeed: 1.6,
    minDominance: 1.4,
    minStraightness: 0.5,
    windowMs: 700,
  },
};

/** The full settings of each level, for anything that wants to measure against them (the demo's meter). */
export const SWIPE_CONFIGS: Record<SwipeSensitivity, SwipeConfig> = {
  normal: { ...DEFAULT_SWIPE, ...SWIPE_PRESETS.normal },
  easy: { ...DEFAULT_SWIPE, ...SWIPE_PRESETS.easy },
  easiest: { ...DEFAULT_SWIPE, ...SWIPE_PRESETS.easiest },
};

const KEY = 'senselab.swipe';

const read = (): SwipeSensitivity => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'easy' || v === 'easiest' ? v : 'normal';
  } catch {
    return 'normal';
  }
};

/** The level in use. The swipe detector reads it on every update; the demo's selector writes it. */
export const swipeTuning: { level: SwipeSensitivity } = { level: read() };

export function setSwipeSensitivity(level: SwipeSensitivity): void {
  swipeTuning.level = level;
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* private mode: the choice lasts for this session */
  }
}
