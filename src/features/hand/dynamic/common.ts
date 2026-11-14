import type { GestureEvent } from '../types';

export const NONE: GestureEvent[] = [];
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The false-trigger guard every detector applies, in one shape. Each detector adds its own
 * measurements (distance, speed, ...), but all of them share these three ideas:
 *  - confidence: how clearly the motion matches (must reach 1 on every measured criterion)
 *  - hold: how many consecutive frames it must persist
 *  - cooldown: minimum time before the same gesture can fire again
 */
export interface Guard {
  holdFrames: number;
  cooldownMs: number;
}
