import { clamp01, closed, createStaticGesture, INDEX, MIDDLE, PINKY, RING, THUMB } from './common';

// Mirror of thumbs up: thumb out and pointing down.
export const thumbsDown = () =>
  createStaticGesture({
    id: 'thumbsDown',
    confidence: (f) =>
      Math.min(
        clamp01((0.7 - f.curl[THUMB]!) / 0.4),
        clamp01((-f.metrics.thumbUp - 0.4) / 0.4),
        closed(f, INDEX),
        closed(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
      ),
  });
