export interface OneEuroParams {
  /** Lower = smoother when still (less jitter). */
  minCutoff: number;
  /** Higher = less lag when moving fast. */
  beta: number;
  /** Cutoff for the derivative estimate; 1 Hz is the paper's default. */
  dCutoff: number;
}

/** Defaults tuned for coordinates normalised to 0..1 (speeds are ~600x smaller than in pixels). */
export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.0, beta: 4, dCutoff: 1.0 };

const smoothingFactor = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

/**
 * One-Euro filter (Casiez et al. 2012) over a fixed-size vector, e.g. all landmarks of a face.
 * Speed-adaptive: heavy smoothing when still, almost none when moving, so it does not lag
 * the way a plain moving average does. State lives in typed arrays, so filter() never allocates.
 */
export class OneEuroFilterArray {
  private readonly prev: Float32Array;
  private readonly dPrev: Float32Array;
  private lastT = -1;
  private readonly params: OneEuroParams;

  constructor(
    readonly size: number,
    params: Partial<OneEuroParams> = {},
  ) {
    this.params = { ...DEFAULT_ONE_EURO, ...params };
    this.prev = new Float32Array(size);
    this.dPrev = new Float32Array(size);
  }

  /** Forget history, e.g. after a long gap where smoothing across it would smear the result. */
  reset(): void {
    this.lastT = -1;
  }

  /** Filters `input` into `out` at time `tSec` (seconds, increasing). input and out may alias. */
  filter(input: ArrayLike<number>, out: Float32Array, tSec: number): void {
    const n = this.size;
    if (this.lastT < 0) {
      for (let i = 0; i < n; i++) {
        const x = input[i]!;
        this.prev[i] = x;
        out[i] = x;
      }
      this.dPrev.fill(0);
      this.lastT = tSec;
      return;
    }
    const dt = tSec - this.lastT;
    if (dt <= 0) {
      // Same timestamp twice: nothing new to learn, return the previous estimate.
      for (let i = 0; i < n; i++) out[i] = this.prev[i]!;
      return;
    }
    this.lastT = tSec;
    const { minCutoff, beta, dCutoff } = this.params;
    const aD = smoothingFactor(dCutoff, dt);
    for (let i = 0; i < n; i++) {
      const x = input[i]!;
      const dx = (x - this.prev[i]!) / dt;
      const dHat = aD * dx + (1 - aD) * this.dPrev[i]!;
      const a = smoothingFactor(minCutoff + beta * Math.abs(dHat), dt);
      const xHat = a * x + (1 - a) * this.prev[i]!;
      this.dPrev[i] = dHat;
      this.prev[i] = xHat;
      out[i] = xHat;
    }
  }
}
