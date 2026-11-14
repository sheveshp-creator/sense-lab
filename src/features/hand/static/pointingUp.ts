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

// Index straight and pointing up, the other three curled. Thumb is free.
export const pointingUp = () =>
  createStaticGesture({
    id: 'pointingUp',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        closed(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
        clamp01((f.metrics.indexUp - 0.6) / 0.3),
      ),
  });
