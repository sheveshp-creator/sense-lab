import type { GestureDetector } from '../types';
import { createCircle } from './circle';
import { createPinch } from './pinch';
import { createPoint } from './point';
import { createSwipe } from './swipe';
import { createWave } from './wave';

/**
 * Registry of motion gestures. Add one = one file + one line here. These run independently of
 * the static pose engine (a swipe can happen while "fist" is shown), so there is no priority.
 */
export function createDynamicSet() {
  const pinch = createPinch();
  const detectors: GestureDetector[] = [
    createSwipe(),
    createWave(),
    createPoint(),
    pinch.detector,
    createCircle(),
  ];
  return { detectors, pinch };
}
