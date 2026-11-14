import type { HandFrame } from '../types';
import type { TwoHandFrame } from './types';

export interface GripConfig {
  /** Both hands must be at least this open (0..1) for the grip to engage. */
  minOpen: number;
  engageFrames: number;
  /** Frames of "not both open" (or a hand missing) before the grip lets go. */
  releaseFrames: number;
}

export const DEFAULT_GRIP: GripConfig = { minOpen: 0.7, engageFrames: 6, releaseFrames: 4 };

const wrapDeg = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

/** Open palm: the four fingers straight and the thumb not tucked. */
export const isOpenHand = (h: HandFrame, minOpen: number): boolean =>
  1 - (h.curl[1]! + h.curl[2]! + h.curl[3]! + h.curl[4]!) / 4 >= minOpen && h.curl[0]! < 0.7;

/**
 * The shared "two hands are holding something" state behind zoom and rotate. It engages only after
 * both hands have been open for ~200 ms (typing or gesturing with one hand never engages it), then
 * measures how the hands moved relative to where they were when it engaged:
 *   scale = distance now / distance at engage       (zoom)
 *   deg   = unwrapped angle change since engage     (rotate, counter-clockwise positive)
 * Owned by the hand pipeline, which calls update() once per frame before the detectors read it.
 */
export class TwoHandGrip {
  engaged = false;
  scale = 1;
  deg = 0;
  private hold = 0;
  private miss = 0;
  private dist0 = 1;
  private lastAngle = 0;

  constructor(private readonly cfg: GripConfig = DEFAULT_GRIP) {}

  update(f: TwoHandFrame | null): void {
    const both =
      f !== null && isOpenHand(f.a, this.cfg.minOpen) && isOpenHand(f.b, this.cfg.minOpen);
    if (!this.engaged) {
      this.hold = both ? this.hold + 1 : 0;
      if (both && this.hold >= this.cfg.engageFrames) {
        this.engaged = true;
        this.miss = 0;
        this.dist0 = f.distance;
        this.lastAngle = f.angleDeg;
        this.scale = 1;
        this.deg = 0;
      }
      return;
    }
    this.miss = both ? 0 : this.miss + 1;
    if (this.miss >= this.cfg.releaseFrames) {
      this.engaged = false;
      this.hold = 0;
      this.scale = 1;
      this.deg = 0;
      return;
    }
    if (f) {
      this.scale = f.distance / this.dist0;
      this.deg += wrapDeg(f.angleDeg - this.lastAngle);
      this.lastAngle = f.angleDeg;
    }
  }
}
