import {
  clamp01,
  closed,
  createStaticGesture,
  extended,
  INDEX,
  MIDDLE,
  PINKY,
  RING,
  THUMB,
  tucked,
} from './common';

// Finger counting 1-5. For 1-4 the thumb stays tucked. They share one file because they are the
// same idea with a different set of straight fingers.
export const one = () =>
  createStaticGesture({
    id: 'one',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        closed(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
        tucked(f, THUMB),
      ),
  });

// Fingers together, to tell it apart from the peace sign (V). Parallel fingers sit one knuckle
// apart (~0.33 palm widths); a V is ~0.65. Peace scores from 0.25 up, two from 0.5 down.
export const two = () =>
  createStaticGesture({
    id: 'two',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        extended(f, MIDDLE),
        closed(f, RING),
        closed(f, PINKY),
        tucked(f, THUMB),
        clamp01((0.5 - f.metrics.indexMiddleSpread) / 0.15),
      ),
  });

export const three = () =>
  createStaticGesture({
    id: 'three',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        extended(f, MIDDLE),
        extended(f, RING),
        closed(f, PINKY),
        tucked(f, THUMB),
      ),
  });

export const four = () =>
  createStaticGesture({
    id: 'four',
    confidence: (f) =>
      Math.min(
        extended(f, INDEX),
        extended(f, MIDDLE),
        extended(f, RING),
        extended(f, PINKY),
        tucked(f, THUMB),
      ),
  });

// Same pose as an open palm; the engine's priority order shows "openPalm" for it.
export const five = () =>
  createStaticGesture({
    id: 'five',
    confidence: (f) =>
      Math.min(
        extended(f, THUMB),
        extended(f, INDEX),
        extended(f, MIDDLE),
        extended(f, RING),
        extended(f, PINKY),
      ),
  });
