import { createClap } from './clap';
import { createFrame } from './frame';
import { TwoHandGrip } from './grip';
import { createHeart } from './heart';
import { createRotate } from './rotate';
import { createZoom } from './zoom';
import type { TwoHandDetector } from './types';

/**
 * Registry of two-hand gestures. Zoom and rotate share one grip state (both hands open and held),
 * so the set owns it and the pipeline updates it once per frame before running the detectors.
 */
export function createTwoHandSet() {
  const grip = new TwoHandGrip();
  const frame = createFrame();
  const detectors: TwoHandDetector[] = [
    createZoom(grip),
    createRotate(grip),
    createClap(),
    createHeart(),
    frame.detector,
  ];
  return { grip, detectors, frameRect: frame.rect };
}
