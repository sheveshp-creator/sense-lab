import {
  closed,
  createStaticGesture,
  extended,
  INDEX,
  MIDDLE,
  PINKY,
  RING,
} from '../static/common';
import type { HandFrame } from '../types';

/** How well the hand is pointing: index straight, middle/ring/pinky curled. Thumb and direction are free. */
export const pointConfidence = (f: HandFrame): number =>
  Math.min(extended(f, INDEX), closed(f, MIDDLE), closed(f, RING), closed(f, PINKY));

/**
 * Pointing with a direction. The start event carries the ray (origin = fingertip, unit direction,
 * both in display space). The ray is also in HandFrame.metrics (tipX/tipY, indexDirX/Y) every frame,
 * which is what the renderer and demos use, so no per-frame events are needed.
 * Held for 4 frames, ends after 3, so a hand passing through the pose does not trigger it.
 */
export const createPoint = () =>
  createStaticGesture({
    id: 'point',
    confidence: pointConfidence,
    holdFrames: 4,
    releaseFrames: 3,
    cooldownMs: 300,
    data: (f) => ({
      ox: f.metrics.tipX,
      oy: f.metrics.tipY,
      dx: f.metrics.indexDirX,
      dy: f.metrics.indexDirY,
      angleDeg: (Math.atan2(-f.metrics.indexDirY, f.metrics.indexDirX) * 180) / Math.PI,
    }),
  });
