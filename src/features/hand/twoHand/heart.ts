import { clamp01, createTwoHandStatic } from './common';
import type { TwoHandFrame } from './types';

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/**
 * Heart made with two hands: thumb tips touching at the bottom, index tips touching at the top,
 * the other fingers curled. All distances are in palm lengths. Untested on real hands: only the
 * geometry is checked (synthetic poses), so expect to tune it.
 */
export const heartConfidence = (f: TwoHandFrame): number => {
  const palm = (f.a.metrics.palmLen + f.b.metrics.palmLen) / 2;
  const am = f.a.metrics;
  const bm = f.b.metrics;
  const thumbs = dist(am.thumbX, am.thumbY, bm.thumbX, bm.thumbY) / palm;
  const indexes = dist(am.tipX, am.tipY, bm.tipX, bm.tipY) / palm;
  // Index tips above thumb tips (display y grows downward).
  const above = ((am.thumbY + bm.thumbY) / 2 - (am.tipY + bm.tipY) / 2) / palm;
  const curled = (h: TwoHandFrame['a']) => (h.curl[2]! + h.curl[3]! + h.curl[4]!) / 3;
  return Math.min(
    clamp01((0.7 - thumbs) / 0.3),
    clamp01((0.8 - indexes) / 0.3),
    clamp01((above - 0.3) / 0.3),
    clamp01((curled(f.a) - 0.3) / 0.3),
    clamp01((curled(f.b) - 0.3) / 0.3),
  );
};

export const createHeart = () =>
  createTwoHandStatic({
    id: 'heart',
    confidence: heartConfidence,
    holdFrames: 5,
    cooldownMs: 1000,
  });
