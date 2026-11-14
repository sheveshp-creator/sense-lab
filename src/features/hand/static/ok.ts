import { clamp01, createStaticGesture, extended, MIDDLE, PINKY, RING } from './common';

// Thumb tip touching index tip, other three fingers straight.
export const ok = () =>
  createStaticGesture({
    id: 'ok',
    confidence: (f) =>
      Math.min(
        clamp01((0.6 - f.metrics.pinch) / 0.3),
        extended(f, MIDDLE),
        extended(f, RING),
        extended(f, PINKY),
      ),
  });
