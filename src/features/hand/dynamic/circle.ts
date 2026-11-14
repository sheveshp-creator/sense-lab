import { clamp01, NONE } from './common';
import { pointConfidence } from './point';
import type { GestureDetector } from '../types';

export interface CircleConfig {
  windowMs: number;
  /** Total angle swept around the centre, degrees. */
  minSweepDeg: number;
  /** Spread of the distance from the centre / mean distance. Lower = rounder. */
  maxRadiusVariation: number;
  /** Circle diameter limits in palm lengths (rejects tiny jitter and huge arm sweeps). */
  minDiameter: number;
  maxDiameter: number;
  minPoints: number;
  cooldownMs: number;
}

export const DEFAULT_CIRCLE: CircleConfig = {
  windowMs: 1600,
  minSweepDeg: 300,
  maxRadiusVariation: 0.3,
  minDiameter: 1.0,
  maxDiameter: 8,
  minPoints: 12,
  cooldownMs: 1000,
};

const CAP = 64;

interface HandState {
  t: Float64Array;
  x: Float32Array;
  y: Float32Array;
  head: number;
  size: number;
  lastPointT: number;
  lastFireT: number;
}

/**
 * Draw a circle in the air with the index finger. Only listens while the hand is pointing, and checks
 * the traced path geometrically (angle swept, roundness, size) instead of matching templates ($1 / DTW)
 * to keep it simple: one pass, no template set to maintain. Event data.direction: +1 clockwise on screen.
 */
export function createCircle(overrides: Partial<CircleConfig> = {}): GestureDetector {
  const cfg = { ...DEFAULT_CIRCLE, ...overrides };
  const states = new Map<number, HandState>();
  return {
    id: 'circle',
    update(f) {
      let s = states.get(f.handId);
      if (!s) {
        s = {
          t: new Float64Array(CAP),
          x: new Float32Array(CAP),
          y: new Float32Array(CAP),
          head: 0,
          size: 0,
          lastPointT: -Infinity,
          lastFireT: -Infinity,
        };
        states.set(f.handId, s);
      }
      if (pointConfidence(f) < 0.5) {
        // Pointing stopped: forget the trail after a short grace period.
        if (f.t - s.lastPointT > 250) s.size = 0;
        return NONE;
      }
      s.lastPointT = f.t;
      s.t[s.head] = f.t;
      s.x[s.head] = f.metrics.tipX;
      s.y[s.head] = f.metrics.tipY;
      s.head = (s.head + 1) % CAP;
      s.size = Math.min(s.size + 1, CAP);
      if (f.t - s.lastFireT < cfg.cooldownMs) return NONE;

      // Collect the points inside the window, oldest first.
      let n = 0;
      for (let k = s.size - 1; k >= 0; k--) {
        const i = (s.head - 1 - k + CAP * 2) % CAP;
        if (f.t - s.t[i]! <= cfg.windowMs) n++;
      }
      if (n < cfg.minPoints) return NONE;
      const first = (s.head - n + CAP * 2) % CAP;
      let cx = 0;
      let cy = 0;
      for (let k = 0; k < n; k++) {
        const i = (first + k) % CAP;
        cx += s.x[i]!;
        cy += s.y[i]!;
      }
      cx /= n;
      cy /= n;

      let sumR = 0;
      let sweep = 0;
      let prevA = 0;
      const radii: number[] = [];
      for (let k = 0; k < n; k++) {
        const i = (first + k) % CAP;
        const ddx = s.x[i]! - cx;
        const ddy = s.y[i]! - cy;
        const r = Math.hypot(ddx, ddy);
        radii.push(r);
        sumR += r;
        const a = Math.atan2(ddy, ddx);
        if (k > 0) {
          let d = a - prevA;
          if (d > Math.PI) d -= 2 * Math.PI;
          else if (d < -Math.PI) d += 2 * Math.PI;
          sweep += d;
        }
        prevA = a;
      }
      const meanR = sumR / n;
      const diameter = (2 * meanR) / f.metrics.palmLen;
      if (diameter < cfg.minDiameter || diameter > cfg.maxDiameter) return NONE;
      const variance = radii.reduce((acc, r) => acc + (r - meanR) ** 2, 0) / n;
      const variation = Math.sqrt(variance) / meanR;
      const sweepDeg = Math.abs(sweep) * (180 / Math.PI);
      if (sweepDeg < cfg.minSweepDeg || variation > cfg.maxRadiusVariation) return NONE;

      s.lastFireT = f.t;
      s.size = 0; // start a fresh trail
      return [
        {
          id: 'circle',
          kind: 'fire',
          handId: f.handId,
          hand: f.hand,
          confidence: clamp01(
            Math.min(
              sweepDeg / cfg.minSweepDeg,
              cfg.maxRadiusVariation / Math.max(variation, 1e-6),
            ) / 1.5,
          ),
          t: f.t,
          // Display y grows downward, so a positive swept angle (atan2 with y down) is clockwise.
          data: { direction: sweep > 0 ? 1 : -1, diameter, sweepDeg },
        },
      ];
    },
    release(handId) {
      states.delete(handId);
    },
  };
}
