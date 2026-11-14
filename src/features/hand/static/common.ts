import type { GestureDetector, GestureEvent, GestureId, HandFrame } from '../types';

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Fuzzy "finger i is straight": 1 at curl <= 0.2, 0 at curl >= 0.6. */
export const extended = (f: HandFrame, i: number) => clamp01((0.6 - f.curl[i]!) / 0.4);
/**
 * Fuzzy "finger i is curled": 0 at curl <= 0.3, 1 at curl >= 0.65. Calibrated on real photos, where
 * curled fingers held by the thumb (victory sign) measure ~0.63-0.67, not 1.0 like a tight fist.
 */
export const closed = (f: HandFrame, i: number) => clamp01((f.curl[i]! - 0.3) / 0.35);
/** Fuzzy "not sticking out": for the thumb, which is often tucked loosely rather than fully closed. */
export const tucked = (f: HandFrame, i: number) => clamp01((f.curl[i]! - 0.25) / 0.3);

export const THUMB = 0;
export const INDEX = 1;
export const MIDDLE = 2;
export const RING = 3;
export const PINKY = 4;

export interface StaticGestureConfig {
  id: GestureId;
  /** 0..1 how well the hand matches. Combine fuzzy terms with Math.min (fuzzy AND). */
  confidence: (f: HandFrame) => number;
  /** Consecutive frames above threshold before the gesture fires. */
  holdFrames?: number;
  threshold?: number;
  /** Minimum time between the end of one activation and the start of the next. */
  cooldownMs?: number;
  /** Consecutive frames below threshold before the gesture ends (stops flicker). */
  releaseFrames?: number;
  /** Optional payload attached to the start event (e.g. pointing direction). */
  data?: (f: HandFrame) => Record<string, number>;
}

interface HandState {
  hold: number;
  release: number;
  active: boolean;
  endedAt: number;
}

const NONE: GestureEvent[] = [];

/**
 * Builds a GestureDetector from a confidence function. Handles the hold-frames, threshold,
 * cooldown and release rules in one place so each gesture file only describes its hand shape.
 */
export function createStaticGesture(cfg: StaticGestureConfig): GestureDetector {
  const holdFrames = cfg.holdFrames ?? 3;
  const threshold = cfg.threshold ?? 0.6;
  const cooldownMs = cfg.cooldownMs ?? 300;
  const releaseFrames = cfg.releaseFrames ?? 2;
  const states = new Map<number, HandState>();

  return {
    id: cfg.id,
    update(frame) {
      let s = states.get(frame.handId);
      if (!s) {
        s = { hold: 0, release: 0, active: false, endedAt: -Infinity };
        states.set(frame.handId, s);
      }
      const conf = cfg.confidence(frame);
      if (conf >= threshold) {
        s.release = 0;
        s.hold++;
        if (!s.active && s.hold >= holdFrames && frame.t - s.endedAt >= cooldownMs) {
          s.active = true;
          return [
            {
              id: cfg.id,
              kind: 'start',
              handId: frame.handId,
              hand: frame.hand,
              confidence: conf,
              t: frame.t,
              ...(cfg.data ? { data: cfg.data(frame) } : {}),
            },
          ];
        }
        return NONE;
      }
      s.hold = 0;
      if (s.active && ++s.release >= releaseFrames) {
        s.active = false;
        s.release = 0;
        s.endedAt = frame.t;
        return [
          {
            id: cfg.id,
            kind: 'end',
            handId: frame.handId,
            hand: frame.hand,
            confidence: conf,
            t: frame.t,
          },
        ];
      }
      return NONE;
    },
    release(handId) {
      states.delete(handId);
    },
  };
}
