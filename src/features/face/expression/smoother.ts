import { EXPRESSIONS } from './types';
import type { Expression } from './types';

export interface SmootherOptions {
  /** Frames averaged for the displayed scores. */
  window: number;
  /** A new label must lead for this many frames in a row before it replaces the current one. */
  stableFrames: number;
  /** ...and its averaged score must beat the current label's by at least this much. */
  margin: number;
}

export const DEFAULT_SMOOTHER: SmootherOptions = { window: 5, stableFrames: 4, margin: 0.05 };

/**
 * Keeps one face's expression steady: scores are averaged over ~5 frames, and the label only changes
 * after a different label has led for a few frames in a row. One odd frame therefore never flips it.
 * Fixed-size typed arrays, so update() does not allocate.
 */
export class ExpressionSmoother {
  readonly scores = new Float32Array(EXPRESSIONS.length);
  label: Expression = 'neutral';
  /** Time of the last label change (ms), or -1. */
  changedAt = -1;

  private readonly ring: Float32Array;
  private head = 0;
  private size = 0;
  private candidate = -1;
  private streak = 0;
  private readonly opts: SmootherOptions;

  constructor(opts: Partial<SmootherOptions> = {}) {
    this.opts = { ...DEFAULT_SMOOTHER, ...opts };
    this.ring = new Float32Array(this.opts.window * EXPRESSIONS.length);
  }

  /** Feed the raw per-expression scores of one frame. Returns true if the label changed. */
  update(raw: ArrayLike<number>, tMs: number): boolean {
    const n = EXPRESSIONS.length;
    this.ring.set(Array.prototype.slice.call(raw, 0, n) as number[], this.head * n);
    this.head = (this.head + 1) % this.opts.window;
    this.size = Math.min(this.size + 1, this.opts.window);
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let i = 0; i < this.size; i++) sum += this.ring[i * n + k]!;
      this.scores[k] = sum / this.size;
    }

    let best = 0;
    for (let k = 1; k < n; k++) if (this.scores[k]! > this.scores[best]!) best = k;
    const current = EXPRESSIONS.indexOf(this.label);
    if (best === current) {
      this.candidate = -1;
      this.streak = 0;
      return false;
    }
    if (best === this.candidate) this.streak++;
    else {
      this.candidate = best;
      this.streak = 1;
    }
    const leads = this.scores[best]! - this.scores[current]! >= this.opts.margin;
    if (this.streak >= this.opts.stableFrames && leads) {
      this.label = EXPRESSIONS[best]!;
      this.changedAt = tMs;
      this.candidate = -1;
      this.streak = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.scores.fill(0);
    this.label = 'neutral';
    this.changedAt = -1;
    this.head = 0;
    this.size = 0;
    this.candidate = -1;
    this.streak = 0;
  }
}
