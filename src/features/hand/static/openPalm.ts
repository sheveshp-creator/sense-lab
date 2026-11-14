import { createStaticGesture, extended } from './common';

// All five fingers straight.
export const openPalm = () =>
  createStaticGesture({
    id: 'openPalm',
    confidence: (f) =>
      Math.min(extended(f, 0), extended(f, 1), extended(f, 2), extended(f, 3), extended(f, 4)),
  });
