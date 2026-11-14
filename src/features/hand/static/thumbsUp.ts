import { clamp01, closed, createStaticGesture, INDEX, MIDDLE, PINKY, RING, THUMB } from './common';

// Thumb out and pointing up, other four fingers curled.
export const thumbsUp = () =>
  createStaticGesture({
    id: 'thumbsUp',
    confidence: (f) =>
      Math.min(
        clamp01((0.7 - f.curl[THUMB]!) / 0.4),
        clamp01((f.metrics.thumbUp - 0.4) / 0.4),
        closed(f, INDEX),
        closed(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
      ),
  });
