import {
  clamp01,
  closed,
  createStaticGesture,
  extended,
  INDEX,
  MIDDLE,
  PINKY,
  RING,
} from './common';

// Index and middle up and apart in a V, ring and pinky curled. Thumb position is not checked.
export const peace = () =>
  createStaticGesture({
    id: 'peace',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        extended(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
        clamp01((f.metrics.indexMiddleSpread - 0.25) / 0.35),
      ),
  });
