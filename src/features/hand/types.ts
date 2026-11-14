import type { Handedness } from '../../core/tracking/handTracker';
import type { HandMotion } from './dynamic/motion';

/** Poses held by one hand (see static/). */
export type StaticGestureId =
  | 'thumbsUp'
  | 'thumbsDown'
  | 'peace'
  | 'openPalm'
  | 'fist'
  | 'pointingUp'
  | 'ok'
  | 'rock'
  | 'one'
  | 'two'
  | 'three'
  | 'four'
  | 'five';

/** Motion of one hand (see dynamic/). */
export type DynamicGestureId =
  | 'swipeLeft'
  | 'swipeRight'
  | 'swipeUp'
  | 'swipeDown'
  | 'wave'
  | 'point'
  | 'pinch'
  | 'pinchDrag'
  | 'circle';

/** Gestures that need both hands (see twoHand/). */
export type TwoHandGestureId = 'zoom' | 'rotate' | 'clap' | 'heart' | 'frame';

export type GestureId = StaticGestureId | DynamicGestureId | TwoHandGestureId;

export interface GestureEvent {
  id: GestureId;
  /**
   * 'start' / 'end' bracket a gesture that is held (poses, point, pinch, zoom ...).
   * 'fire' is a one-shot (swipe, wave, clap, circle).
   */
  kind: 'start' | 'end' | 'fire';
  /** Hand ID, or -1 for two-hand gestures. */
  handId: number;
  hand: Handedness | 'Both';
  confidence: number;
  /** ms, same clock as HandFrame.t */
  t: number;
  /** Small numeric payload, e.g. swipe speed, pointing direction, zoom scale. */
  data?: Record<string, number>;
}

/** Derived geometry that several detectors need. Computed once per hand per frame. */
export interface HandMetrics {
  /** Palm width (index MCP to pinky MCP) in metres. Everything below is relative to it. */
  palmSize: number;
  /** Thumb direction (MCP to tip) against screen up: +1 straight up, -1 straight down. */
  thumbUp: number;
  /** Index direction (MCP to tip) against screen up: +1 straight up. */
  indexUp: number;
  /** Thumb tip to index tip distance / palmSize. Small = pinching (OK sign). */
  pinch: number;
  /** Index tip to middle tip distance / palmSize. Large = fingers spread (peace sign). */
  indexMiddleSpread: number;
  /** Angle between thumb and index finger directions in degrees (an "L" is ~90). */
  thumbIndexAngle: number;
  // Positions below are in "display space": mirrored like the on-screen selfie view, with the unit
  // being the frame HEIGHT (so x runs 0..aspect and distances are not skewed by a 4:3 frame).
  /** Palm centre (mean of wrist and the four finger knuckles). */
  palmX: number;
  palmY: number;
  /** Wrist to middle knuckle length. All motion thresholds are in palm lengths, so they work at any distance. */
  palmLen: number;
  tipX: number;
  tipY: number;
  thumbX: number;
  thumbY: number;
  /** Index knuckle: the corner of an "L". */
  cornerX: number;
  cornerY: number;
  /** Unit vector of the index finger (knuckle to tip) in display space. */
  indexDirX: number;
  indexDirY: number;
}

/** What a gesture detector sees. One object per tracked hand, reused every frame. */
export interface HandFrame {
  handId: number;
  hand: Handedness;
  /** ms */
  t: number;
  score: number;
  /** Smoothed image landmarks (x, y, z). */
  landmarks: Float32Array;
  /** Smoothed world landmarks (metres). */
  world: Float32Array;
  /** Per finger (thumb, index, middle, ring, pinky): 0 = straight .. 1 = fully curled. */
  curl: Float32Array;
  /** Per finger: FINGER_OPEN / FINGER_HALF / FINGER_CLOSED. Has hysteresis, so it does not flicker. */
  state: Uint8Array;
  /** Per finger: fingertip speed in palm-lengths per second. */
  tipSpeed: Float32Array;
  metrics: HandMetrics;
  /** Recent palm / fingertip positions, for dynamic gestures. */
  motion: HandMotion;
}

export interface GestureDetector {
  id: string;
  update(frame: HandFrame): GestureEvent[];
  /** Optional: forget per-hand state when a hand's track expires. */
  release?(handId: number): void;
}
