import { NONE } from './common';
import type { TwoHandDetector } from './types';

export interface ClapConfig {
  /**
   * Gap (in palm lengths) at or below which the hands count as touching. Palm centres of side-by-side
   * hands are ~1 palm apart, and smoothing keeps the measured gap a bit above the true one.
   */
  touchGap: number;
  /** The gap must have been at least this wide within the look-back window. */
  openGap: number;
  /** Average closing speed in palm lengths per second. */
  minSpeed: number;
  windowMs: number;
  cooldownMs: number;
  /** If the hands vanish this soon after being close, treat it as a clap (they merged into one blob). */
  mergeGraceMs: number;
}

export const DEFAULT_CLAP: ClapConfig = {
  touchGap: 1.5,
  openGap: 2.2,
  minSpeed: 5,
  windowMs: 300,
  cooldownMs: 800,
  mergeGraceMs: 150,
};

const CAP = 16;

/**
 * Two hands closing fast. MediaPipe usually loses one hand when they overlap, so a clap shows up
 * either as a small gap, or as the second hand disappearing right after a fast approach. Both count.
 */
export function createClap(overrides: Partial<ClapConfig> = {}): TwoHandDetector {
  const cfg = { ...DEFAULT_CLAP, ...overrides };
  const ts = new Float64Array(CAP);
  const gaps = new Float32Array(CAP);
  let head = 0;
  let size = 0;
  let lastFire = -Infinity;
  let lastSeenT = -Infinity;
  let lastT = 0;

  /** Fast-closing check against the samples in the window; returns closing speed or 0. */
  const closing = (now: number, gapNow: number): number => {
    let maxGap = gapNow;
    let tMax = now;
    for (let k = 0; k < size; k++) {
      const i = (head - 1 - k + CAP * 2) % CAP;
      if (now - ts[i]! > cfg.windowMs) break;
      if (gaps[i]! > maxGap) {
        maxGap = gaps[i]!;
        tMax = ts[i]!;
      }
    }
    if (maxGap < cfg.openGap || tMax >= now) return 0;
    const speed = (maxGap - gapNow) / ((now - tMax) / 1000);
    return speed >= cfg.minSpeed ? speed : 0;
  };

  const fire = (t: number, speed: number) => {
    lastFire = t;
    size = 0;
    return [
      {
        id: 'clap' as const,
        kind: 'fire' as const,
        handId: -1,
        hand: 'Both' as const,
        t,
        confidence: Math.min(1, speed / (cfg.minSpeed * 1.5)),
        data: { speed },
      },
    ];
  };

  return {
    id: 'clap',
    update(f) {
      if (!f) {
        // Hands vanished: a clap if they were close and had been closing fast.
        const t = lastT;
        if (size > 0 && t - lastSeenT <= cfg.mergeGraceMs && t - lastFire >= cfg.cooldownMs) {
          const last = (head - 1 + CAP) % CAP;
          const speed = closing(ts[last]!, gaps[last]!);
          if (gaps[last]! <= cfg.touchGap * 1.5 && speed > 0) {
            size = 0;
            return fire(ts[last]!, speed);
          }
        }
        return NONE;
      }
      lastT = f.t;
      lastSeenT = f.t;
      ts[head] = f.t;
      gaps[head] = f.gapPalms;
      head = (head + 1) % CAP;
      size = Math.min(size + 1, CAP);
      if (f.t - lastFire < cfg.cooldownMs || f.gapPalms > cfg.touchGap) return NONE;
      const speed = closing(f.t, f.gapPalms);
      return speed > 0 ? fire(f.t, speed) : NONE;
    },
  };
}
