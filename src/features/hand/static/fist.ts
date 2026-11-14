import { closed, createStaticGesture, INDEX, MIDDLE, PINKY, RING, THUMB, tucked } from './common';

// Four fingers curled and the thumb tucked in (not sticking out like a thumbs up).
export const fist = () =>
  createStaticGesture({
    id: 'fist',
    confidence: (f) =>
      Math.min(
        closed(f, INDEX),
        closed(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
        tucked(f, THUMB),
      ),
  });
