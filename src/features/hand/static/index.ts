import type { GestureDetector } from '../types';
import { fist } from './fist';
import { ok } from './ok';
import { five, four, one, three, two } from './numbers';
import { openPalm } from './openPalm';
import { peace } from './peace';
import { pointingUp } from './pointingUp';
import { rock } from './rock';
import { thumbsDown } from './thumbsDown';
import { thumbsUp } from './thumbsUp';

/**
 * Registry. Order is priority: when several detectors match the same hand (pointing up is also
 * "one", an open palm is also "five"), the earliest one wins. Add a gesture = one file + one line. Factories, so every engine gets fresh per-hand state.
 */
export const createStaticDetectors = (): GestureDetector[] => [
  thumbsUp(),
  thumbsDown(),
  ok(),
  rock(),
  peace(),
  pointingUp(),
  fist(),
  openPalm(),
  five(),
  four(),
  three(),
  two(),
  one(),
];
