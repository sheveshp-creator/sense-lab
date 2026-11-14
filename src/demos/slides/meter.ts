/**
 * Shows how close a sideways swipe came, so a swipe that does not register is no longer a silent failure.
 * It measures what the swipe detector measures (sideways travel and average speed over the look-back window, in
 * palm lengths) as a fraction of what that detector needs: 1 means "enough". Both must reach 1, and the motion
 * must also be straight and not a wave, which this does not judge.
 *
 * Fixed-size typed arrays, no allocation per sample (it is fed every frame).
 */
export interface MeterSettings {
  minDistance: number;
  minSpeed: number;
  windowMs: number;
}

export interface MeterReading {
  /** Sideways travel over the window / the distance needed. */
  distance: number;
  /** Sideways speed over the window / the speed needed. */
  speed: number;
}

const CAP = 48;
/** How long the best recent attempt stays on screen after it happened. */
const PEAK_HOLD_MS = 1800;

export class SwipeMeter {
  private readonly ts = new Float64Array(CAP);
  private readonly xs = new Float32Array(CAP);
  private head = 0;
  private size = 0;
  private palm = 0;
  /** The best reading in the last PEAK_HOLD_MS, and when it happened. */
  readonly peak: MeterReading = { distance: 0, speed: 0 };
  private peakAt = -Infinity;
  /** Reused result object. */
  private readonly out: MeterReading = { distance: 0, speed: 0 };

  push(nowMs: number, x: number, palmLen: number): void {
    this.ts[this.head] = nowMs;
    this.xs[this.head] = x;
    this.head = (this.head + 1) % CAP;
    if (this.size < CAP) this.size++;
    this.palm = palmLen;
  }

  /** No hand in view: forget the motion (a hand that comes back starts fresh). */
  clear(): void {
    this.size = 0;
  }

  private at(i: number): number {
    return (this.head - 1 - i + CAP * 2) % CAP; // 0 = newest
  }

  read(nowMs: number, s: MeterSettings): MeterReading {
    const out = this.out;
    out.distance = 0;
    out.speed = 0;
    if (this.size >= 2 && this.palm > 0) {
      const newest = this.at(0);
      // The oldest sample still inside the look-back window.
      let oldest = newest;
      for (let i = 1; i < this.size; i++) {
        const k = this.at(i);
        if (this.ts[newest]! - this.ts[k]! > s.windowMs) break;
        oldest = k;
      }
      const dtS = (this.ts[newest]! - this.ts[oldest]!) / 1000;
      if (dtS >= 0.1) {
        const palms = Math.abs(this.xs[newest]! - this.xs[oldest]!) / this.palm;
        out.distance = palms / s.minDistance;
        out.speed = palms / dtS / s.minSpeed;
      }
    }
    // Keep the best attempt for a moment so it can be read after the hand has stopped.
    const score = Math.min(out.distance, out.speed);
    if (
      score >= Math.min(this.peak.distance, this.peak.speed) ||
      nowMs - this.peakAt > PEAK_HOLD_MS
    ) {
      this.peak.distance = out.distance;
      this.peak.speed = out.speed;
      this.peakAt = nowMs;
    }
    return out;
  }
}
