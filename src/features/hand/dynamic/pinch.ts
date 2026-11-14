import { NONE } from './common';
import type { GestureDetector, GestureEvent, HandFrame } from '../types';

export interface PinchConfig {
  /** Thumb-index distance / palm width below which a pinch starts... */
  startRatio: number;
  /** ...and above which it ends (higher than start: hysteresis). */
  endRatio: number;
  holdFrames: number;
  releaseFrames: number;
  cooldownMs: number;
  /** Pointer travel (frame heights) before a pinch counts as a drag. */
  dragDistance: number;
  /**
   * The pinch point itself moves while the fingers close (and the smoothing filter catches up), which
   * would read as a drag. For this long after a pinch starts the anchor follows the pointer.
   */
  settleMs: number;
}

export const DEFAULT_PINCH: PinchConfig = {
  startRatio: 0.3,
  endRatio: 0.6,
  holdFrames: 3,
  releaseFrames: 2,
  cooldownMs: 200,
  dragDistance: 0.04,
  settleMs: 250,
};

/** What the renderer and demos read every frame. Positions are display space (frame heights). */
export interface PinchState {
  active: boolean;
  dragging: boolean;
  /** Pinch point: midpoint of thumb and index tips. */
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** Movement since the pinch started. */
  dx: number;
  dy: number;
}

interface Internal extends PinchState {
  hold: number;
  release: number;
  endedAt: number;
  startedAt: number;
}

/** A closed fist also brings thumb and index tips together; do not call that a pinch. */
const isFist = (f: HandFrame) =>
  f.curl[1]! > 0.9 && f.curl[2]! > 0.9 && f.curl[3]! > 0.9 && f.curl[4]! > 0.9;

/**
 * Pinch (thumb + index) with drag. Emits 'pinch' start/end, and 'pinchDrag' start/end once the
 * pinch point has moved dragDistance. The live pointer is read from state(handId).
 */
export function createPinch(overrides: Partial<PinchConfig> = {}) {
  const cfg = { ...DEFAULT_PINCH, ...overrides };
  const states = new Map<number, Internal>();

  const ev = (
    s: Internal,
    f: HandFrame,
    id: 'pinch' | 'pinchDrag',
    kind: 'start' | 'end',
  ): GestureEvent => ({
    id,
    kind,
    handId: f.handId,
    hand: f.hand,
    confidence: Math.max(0, Math.min(1, 1 - f.metrics.pinch / cfg.endRatio)),
    t: f.t,
    data: { x: s.x, y: s.y, dx: s.dx, dy: s.dy },
  });

  const detector: GestureDetector = {
    id: 'pinch',
    update(f) {
      let s = states.get(f.handId);
      if (!s) {
        s = {
          active: false,
          dragging: false,
          x: 0,
          y: 0,
          startX: 0,
          startY: 0,
          dx: 0,
          dy: 0,
          hold: 0,
          release: 0,
          endedAt: -Infinity,
          startedAt: 0,
        };
        states.set(f.handId, s);
      }
      const m = f.metrics;
      s.x = (m.tipX + m.thumbX) / 2;
      s.y = (m.tipY + m.thumbY) / 2;

      if (!s.active) {
        s.hold = m.pinch <= cfg.startRatio && !isFist(f) ? s.hold + 1 : 0;
        if (s.hold >= cfg.holdFrames && f.t - s.endedAt >= cfg.cooldownMs) {
          s.active = true;
          s.startedAt = f.t;
          s.dragging = false;
          s.startX = s.x;
          s.startY = s.y;
          s.dx = s.dy = 0;
          s.release = 0;
          return [ev(s, f, 'pinch', 'start')];
        }
        return NONE;
      }

      if (f.t - s.startedAt < cfg.settleMs) {
        s.startX = s.x;
        s.startY = s.y;
      }
      // While the fingers are parting (a release in progress) the pinch point slides, which is not a
      // drag: freeze the drag measurement until the release is confirmed or the pinch closes again.
      const opening = m.pinch > cfg.startRatio * 1.5;
      if (!opening) {
        s.dx = s.x - s.startX;
        s.dy = s.y - s.startY;
      }
      s.release = m.pinch >= cfg.endRatio ? s.release + 1 : 0;
      if (s.release >= cfg.releaseFrames) {
        const out: GestureEvent[] = [];
        if (s.dragging) out.push(ev(s, f, 'pinchDrag', 'end'));
        out.push(ev(s, f, 'pinch', 'end'));
        s.active = false;
        s.dragging = false;
        s.hold = 0;
        s.endedAt = f.t;
        return out;
      }
      if (!opening && !s.dragging && Math.hypot(s.dx, s.dy) >= cfg.dragDistance) {
        s.dragging = true;
        return [ev(s, f, 'pinchDrag', 'start')];
      }
      return NONE;
    },
    release(handId) {
      states.delete(handId);
    },
  };

  return { detector, state: (handId: number): PinchState | undefined => states.get(handId) };
}
