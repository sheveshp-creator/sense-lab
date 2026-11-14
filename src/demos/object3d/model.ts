import type { LiveTwoHand } from '../../core/frameStore';

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 3D Object: two open hands pulled apart or together zoom it, turning the line between them rotates it, a clap
 * resets it. The model holds the TARGET size and angle; the view eases toward them. What the user reached when
 * the hands let go is kept, and the next grip continues from there (it does not snap back).
 */
export class ObjectModel {
  scale = 1;
  /** Degrees, counter-clockwise on screen positive. */
  rotationDeg = 0;
  private wasEngaged = false;
  private baseScale = 1;
  private baseRot = 0;
  /** Bumped by reset() so the view can ease back (and tests can see it happened). */
  resets = 0;

  /** Per-frame input from the live two-hand state. */
  frame(t: LiveTwoHand): void {
    if (t.engaged && !this.wasEngaged) {
      this.baseScale = this.scale;
      this.baseRot = this.rotationDeg;
    }
    if (t.engaged) {
      this.scale = clamp(this.baseScale * t.scale, MIN_SCALE, MAX_SCALE);
      this.rotationDeg = this.baseRot + t.deg;
    }
    this.wasEngaged = t.engaged;
  }

  zoomBy(factor: number): void {
    this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    this.baseScale = this.scale;
  }

  rotateBy(deg: number): void {
    this.rotationDeg += deg;
    this.baseRot = this.rotationDeg;
  }

  reset(): void {
    this.scale = 1;
    this.rotationDeg = 0;
    this.baseScale = 1;
    this.baseRot = 0;
    this.resets++;
  }
}
