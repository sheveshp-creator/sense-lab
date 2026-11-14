import type { GestureEvent, TwoHandGestureId } from '../types';
import type { TwoHandDetector, TwoHandFrame } from './types';

export const NONE: GestureEvent[] = [];
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface TwoHandStaticConfig {
  id: TwoHandGestureId;
  /** 0..1 how well the two hands match the shape. */
  confidence: (f: TwoHandFrame) => number;
  holdFrames?: number;
  threshold?: number;
  cooldownMs?: number;
  releaseFrames?: number;
}

/**
 * Held two-hand shape (heart, frame) with the usual guard: confidence threshold, hold frames,
 * release frames and cooldown. Emits start/end events.
 */
export function createTwoHandStatic(cfg: TwoHandStaticConfig): TwoHandDetector {
  const holdFrames = cfg.holdFrames ?? 5;
  const threshold = cfg.threshold ?? 0.6;
  const cooldownMs = cfg.cooldownMs ?? 800;
  const releaseFrames = cfg.releaseFrames ?? 3;
  let hold = 0;
  let release = 0;
  let active = false;
  let endedAt = -Infinity;
  let lastT = 0;

  const event = (kind: 'start' | 'end', confidence: number, t: number): GestureEvent[] => [
    { id: cfg.id, kind, handId: -1, hand: 'Both', confidence, t },
  ];

  return {
    id: cfg.id,
    update(f) {
      const t = f?.t ?? lastT;
      lastT = t;
      const conf = f ? cfg.confidence(f) : 0;
      if (conf >= threshold) {
        release = 0;
        hold++;
        if (!active && hold >= holdFrames && t - endedAt >= cooldownMs) {
          active = true;
          return event('start', conf, t);
        }
        return NONE;
      }
      hold = 0;
      if (active && ++release >= releaseFrames) {
        active = false;
        release = 0;
        endedAt = t;
        return event('end', conf, t);
      }
      return NONE;
    },
  };
}
