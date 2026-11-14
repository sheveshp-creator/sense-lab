import { countReversals } from './motion';
import { clamp01, NONE } from './common';
import type { GestureDetector } from '../types';

export interface WaveConfig {
  windowMs: number;
  /** Direction changes needed inside the window. */
  minReversals: number;
  /** A sideways swing must be at least this many palm lengths to count (ignores jitter). */
  minAmplitude: number;
  /** The hand must be open for this share of the window. */
  minOpenShare: number;
  minSamples: number;
  cooldownMs: number;
}

export const DEFAULT_WAVE: WaveConfig = {
  windowMs: 1200,
  minReversals: 3,
  minAmplitude: 0.35,
  minOpenShare: 0.7,
  minSamples: 8,
  cooldownMs: 1500,
};

interface HandState {
  lastFireT: number;
  startT: number;
}

/** Open palm moving side to side: 3+ direction changes along x within ~1.2 s. */
export function createWave(overrides: Partial<WaveConfig> = {}): GestureDetector {
  const cfg = { ...DEFAULT_WAVE, ...overrides };
  const states = new Map<number, HandState>();
  return {
    id: 'wave',
    update(frame) {
      let s = states.get(frame.handId);
      if (!s) states.set(frame.handId, (s = { lastFireT: -Infinity, startT: -Infinity }));
      const m = frame.motion;
      if (frame.t - s.lastFireT < cfg.cooldownMs) return NONE;
      const n = m.countWithin(cfg.windowMs, s.startT + 1);
      if (n < cfg.minSamples) return NONE;

      let openCount = 0;
      for (let i = 0; i < n; i++) if (m.open(i) >= 0.6) openCount++;
      const openShare = openCount / n;
      if (openShare < cfg.minOpenShare || m.open(0) < 0.6) return NONE;

      const reversals = countReversals(m, cfg.windowMs, cfg.minAmplitude * m.palmLen, s.startT + 1);
      if (reversals < cfg.minReversals) return NONE;

      s.lastFireT = frame.t;
      s.startT = frame.t;
      return [
        {
          id: 'wave',
          kind: 'fire',
          handId: frame.handId,
          hand: frame.hand,
          confidence: clamp01(
            Math.min(reversals / cfg.minReversals, openShare / cfg.minOpenShare) / 1.5,
          ),
          t: frame.t,
          data: { reversals },
        },
      ];
    },
    release(handId) {
      states.delete(handId);
    },
  };
}
