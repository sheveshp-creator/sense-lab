import { clamp01, createTwoHandStatic } from './common';
import type { HandFrame } from '../types';
import type { TwoHandFrame } from './types';

/** An "L": thumb and index straight and about 90 degrees apart, other fingers curled. */
const lShape = (h: HandFrame): number =>
  Math.min(
    clamp01((0.6 - h.curl[0]!) / 0.3),
    clamp01((0.6 - h.curl[1]!) / 0.4),
    clamp01((h.curl[2]! - 0.3) / 0.35),
    clamp01((h.curl[3]! - 0.3) / 0.35),
    clamp01((h.curl[4]! - 0.3) / 0.35),
    // Full score between 55 and 125 degrees, fading out 20 degrees beyond each side.
    clamp01(Math.min(h.metrics.thumbIndexAngle - 35, 145 - h.metrics.thumbIndexAngle) / 20),
  );

/** Where the "camera frame" is: the rectangle spanned by the two L corners. Display space. */
export interface FrameRect {
  valid: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Two L-shapes at opposite corners ("camera frame"): each hand is an L, the corners are apart on
 * both axes, and each L opens toward the other hand's corner. Like the heart, geometry-only tested.
 */
export const frameConfidence = (f: TwoHandFrame, rect?: FrameRect): number => {
  const a = f.a.metrics;
  const b = f.b.metrics;
  const palm = (a.palmLen + b.palmLen) / 2;
  const abx = b.cornerX - a.cornerX;
  const aby = b.cornerY - a.cornerY;
  const len = Math.hypot(abx, aby) || 1e-6;
  // Opening direction of an L: from its corner to the middle of thumb tip and index tip.
  const open = (m: typeof a, sx: number, sy: number) => {
    const ox = (m.thumbX + m.tipX) / 2 - m.cornerX;
    const oy = (m.thumbY + m.tipY) / 2 - m.cornerY;
    return (ox * sx + oy * sy) / ((Math.hypot(ox, oy) || 1e-6) * len);
  };
  const towardB = open(a, abx, aby);
  const towardA = open(b, -abx, -aby);
  const diagonal = Math.min(Math.abs(abx), Math.abs(aby)) / palm;
  const conf = Math.min(
    lShape(f.a),
    lShape(f.b),
    clamp01((towardB - 0.3) / 0.4),
    clamp01((towardA - 0.3) / 0.4),
    clamp01((diagonal - 0.8) / 0.6),
  );
  if (rect) {
    rect.valid = conf > 0;
    rect.x = Math.min(a.cornerX, b.cornerX);
    rect.y = Math.min(a.cornerY, b.cornerY);
    rect.w = Math.abs(abx);
    rect.h = Math.abs(aby);
  }
  return conf;
};

/** The detector plus the rectangle it keeps up to date (for the renderer). */
export function createFrame() {
  const rect: FrameRect = { valid: false, x: 0, y: 0, w: 0, h: 0 };
  const detector = createTwoHandStatic({
    id: 'frame',
    confidence: (f) => frameConfidence(f, rect),
    holdFrames: 5,
    cooldownMs: 800,
  });
  return { detector, rect };
}
