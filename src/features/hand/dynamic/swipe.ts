import { countReversals } from './motion';
import { clamp01, NONE } from './common';
import type { GestureDetector, GestureEvent, GestureId } from '../types';

export interface SwipeConfig {
  /** Minimum travel, in palm lengths. */
  minDistance: number;
  /** Minimum average speed, in palm lengths per second. */
  minSpeed: number;
  /** Main axis must be at least this many times longer than the other axis. */
  minDominance: number;
  /** Net travel / path length: 1 = perfectly straight. Rejects wiggles and waves. */
  minStraightness: number;
  /** Look-back window. */
  windowMs: number;
  /** The last N inter-frame moves must all go the same way at a decent speed. */
  holdFrames: number;
  cooldownMs: number;
  /** After a swipe, the opposite swipe is ignored this long: it is just the hand coming back. */
  returnRefractoryMs: number;
}

export const DEFAULT_SWIPE: SwipeConfig = {
  minDistance: 2.0,
  minSpeed: 3.5,
  minDominance: 2.0,
  minStraightness: 0.7,
  windowMs: 450,
  holdFrames: 3,
  cooldownMs: 500,
  returnRefractoryMs: 800,
};

interface HandState {
  lastFireT: number;
  lastId: GestureId | null;
  /** Samples at or before this time are ignored, so one motion cannot fire twice. */
  startT: number;
}

const OPPOSITE: Partial<Record<GestureId, GestureId>> = {
  swipeLeft: 'swipeRight',
  swipeRight: 'swipeLeft',
  swipeUp: 'swipeDown',
  swipeDown: 'swipeUp',
};

/**
 * Four-direction swipe in the on-screen (mirrored) view: "swipeLeft" means the hand moved to the
 * left of the screen. Needs distance AND speed AND a dominant, straight direction, then a cooldown.
 */
export function createSwipe(
  overrides: Partial<SwipeConfig> = {},
  /** Optional live tuning, read every update (the sensitivity setting). Must return the same object until it changes. */
  live?: () => Partial<SwipeConfig> | undefined,
): GestureDetector {
  const base = { ...DEFAULT_SWIPE, ...overrides };
  let cfg = base;
  let lastLive: Partial<SwipeConfig> | undefined;
  const states = new Map<number, HandState>();

  return {
    id: 'swipe',
    update(frame) {
      let s = states.get(frame.handId);
      if (!s)
        states.set(frame.handId, (s = { lastFireT: -Infinity, lastId: null, startT: -Infinity }));
      // Rebuilt only when the setting changes (the presets are constant objects), so no allocation per frame.
      const tuned = live?.();
      if (tuned !== lastLive) {
        lastLive = tuned;
        cfg = { ...base, ...tuned };
      }
      const m = frame.motion;
      const now = frame.t;
      if (now - s.lastFireT < cfg.cooldownMs) return NONE;

      const n = m.countWithin(cfg.windowMs, s.startT + 1);
      if (n < 4) return NONE;
      const j = n - 1; // oldest sample in the window
      const palm = m.palmLen;
      const dx = m.px(0) - m.px(j);
      const dy = m.py(0) - m.py(j);
      const dtS = (m.t(0) - m.t(j)) / 1000;
      if (dtS < 0.1) return NONE;

      const dist = Math.hypot(dx, dy) / palm;
      const speed = dist / dtS;
      let path = 0;
      for (let i = j; i > 0; i--) path += Math.hypot(m.px(i - 1) - m.px(i), m.py(i - 1) - m.py(i));
      const straight = path > 0 ? (dist * palm) / path : 0;
      const major = Math.max(Math.abs(dx), Math.abs(dy));
      const dominance = major / (Math.min(Math.abs(dx), Math.abs(dy)) + 1e-6);

      const ratio = Math.min(
        dist / cfg.minDistance,
        speed / cfg.minSpeed,
        dominance / cfg.minDominance,
        straight / cfg.minStraightness,
      );
      if (ratio < 1) return NONE;

      // Hold: the latest moves must all agree with the overall direction (a fast flick that has
      // already stopped, or a single jumpy frame, is not a swipe).
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const sign = Math.sign(horizontal ? dx : dy);
      for (let i = 0; i < cfg.holdFrames; i++) {
        const step = horizontal ? m.px(i) - m.px(i + 1) : m.py(i) - m.py(i + 1);
        const stepDt = (m.t(i) - m.t(i + 1)) / 1000;
        if (
          stepDt <= 0 ||
          Math.sign(step) !== sign ||
          Math.abs(step) / palm / stepDt < cfg.minSpeed * 0.4
        ) {
          return NONE;
        }
      }

      // Mid-wave strokes look like swipes: stay quiet while the hand is zigzagging.
      if (countReversals(m, 1000, 0.35 * palm) >= 2) return NONE;

      const id: GestureId = horizontal
        ? dx > 0
          ? 'swipeRight'
          : 'swipeLeft'
        : dy > 0
          ? 'swipeDown'
          : 'swipeUp';
      if (s.lastId && OPPOSITE[id] === s.lastId && now - s.lastFireT < cfg.returnRefractoryMs) {
        s.startT = now; // swallow the return stroke
        return NONE;
      }
      s.lastFireT = now;
      s.lastId = id;
      s.startT = now;
      const e: GestureEvent = {
        id,
        kind: 'fire',
        handId: frame.handId,
        hand: frame.hand,
        confidence: clamp01(ratio / 1.5),
        t: now,
        data: { distance: dist, speed, dx: dx / palm, dy: dy / palm },
      };
      return [e];
    },
    release(handId) {
      states.delete(handId);
    },
  };
}
