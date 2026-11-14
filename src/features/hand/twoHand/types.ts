import type { GestureEvent, HandFrame } from '../types';

/**
 * The two visible hands, ordered left to right on screen (not by handedness, which is noisy).
 * Positions are display space, like HandMetrics. One reused object, updated every frame.
 */
export interface TwoHandFrame {
  t: number;
  a: HandFrame;
  b: HandFrame;
  /** Distance between palm centres, in frame heights. */
  distance: number;
  /** The same distance in average palm lengths, so thresholds work at any camera distance. */
  gapPalms: number;
  /** Angle of the line a -> b in degrees, counter-clockwise positive as seen on screen. */
  angleDeg: number;
}

/** Same idea as GestureDetector but sees both hands. `null` means fewer than two hands are visible. */
export interface TwoHandDetector {
  id: string;
  update(frame: TwoHandFrame | null): GestureEvent[];
}
