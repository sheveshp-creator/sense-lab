/**
 * Automatic quality mode (architecture rule 4).
 *
 * What is measured: the cost of one processed frame (capture + worker round trip), not the gap between
 * video frames. A 30 fps camera always has ~33 ms between frames, so that gap says nothing about load;
 * the cost does: if it is above the frame budget the worker cannot keep up and frames get dropped.
 * We use the median of the last WINDOW samples so one slow frame (model warm-up, a GC pause) cannot
 * trigger a step down by itself.
 *
 * Each level has its own deadline: budget x the number of video frames between two processed frames.
 * Skipping frames does not make one processed frame cheaper, it gives each one more time, so comparing
 * cost with a fixed 33 ms could never show that a lower level helped.
 *
 * Down: median cost above this level's deadline.
 * Up: the level has met its own deadline (with a small margin) for UPAFTER, so try one level higher. This is
 * a probe, not a prediction: measured on the dev machine, per-frame cost goes UP when the load goes down
 * (GPU clocks drop), so the cost at a low level says little about the cost at a higher one. If the probe
 * misses its deadline we step back down and wait twice as long before the next try, so a machine that
 * really cannot sustain the higher level only pays for a short probe now and then.
 */

export type QualityId = 0 | 1 | 2;

export interface QualityLevel {
  id: QualityId;
  label: string;
  /** Face and hand models run on every Nth video frame. */
  faceEvery: number;
  handEvery: number;
  /** GestureRecognizer cross-check: every Nth frame, 0 = off. */
  gestureEvery: number;
  /** Face recognition for new faces. Off at the lowest level: its crops are too small to trust there. */
  identity: boolean;
  /** Skip the costly overlay layers (mesh, heatmap). The user's toggles are not changed. */
  lightOverlay: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  {
    id: 0,
    label: 'High',
    faceEvery: 1,
    handEvery: 1,
    gestureEvery: 8,
    identity: true,
    lightOverlay: false,
  },
  {
    id: 1,
    label: 'Medium',
    faceEvery: 1,
    handEvery: 1,
    gestureEvery: 0,
    identity: true,
    lightOverlay: true,
  },
  {
    id: 2,
    label: 'Low',
    faceEvery: 2,
    handEvery: 2,
    gestureEvery: 0,
    identity: false,
    lightOverlay: true,
  },
];

export interface QualityOptions {
  /** Time per processed frame at full rate (ms). 33 = 30 fps. */
  budgetMs?: number;
  /** A step up needs the median below this fraction of the current level's deadline (not right at the edge). */
  calm?: number;
  levels?: readonly QualityLevel[];
  /** Samples in the decision window. */
  window?: number;
  /** Calm must last this long (ms) before stepping up. */
  upAfterMs?: number;
  /** A step down within this time of a step up counts as a failed step up and doubles the wait. */
  revertWithinMs?: number;
  maxUpAfterMs?: number;
}

const FORGET_AFTER_MS = 120_000;

export class QualityManager {
  level: QualityId = 0;

  private readonly budget: number;
  private readonly calm: number;
  private readonly levels: readonly QualityLevel[];
  private readonly size: number;
  private readonly baseUpAfter: number;
  private readonly revertWithin: number;
  private readonly maxUpAfter: number;
  private readonly ring: Float64Array;
  private count = 0;
  private head = 0;
  private readonly sorted: Float64Array;
  private upAfter: number;
  private calmSince = -1;
  private lastUpAt = -Infinity;
  private changedAt = 0;
  private lastNow = 0;

  constructor(o: QualityOptions = {}) {
    this.budget = o.budgetMs ?? 33;
    this.calm = o.calm ?? 0.95;
    this.levels = o.levels ?? QUALITY_LEVELS;
    this.size = o.window ?? 30;
    this.baseUpAfter = o.upAfterMs ?? 6000;
    this.revertWithin = o.revertWithinMs ?? 20_000;
    this.maxUpAfter = o.maxUpAfterMs ?? 60_000;
    this.upAfter = this.baseUpAfter;
    this.ring = new Float64Array(this.size);
    this.sorted = new Float64Array(this.size);
  }

  /**
   * Feed the cost (ms) of one processed frame. Returns the new level when it changed, else null.
   * The window restarts on every change, so a decision never uses samples from the previous level.
   */
  sample(costMs: number, now: number): QualityId | null {
    this.lastNow = now;
    this.ring[this.head] = costMs;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
    if (this.count < this.size) return null; // not enough evidence yet

    // A level that has held for a long time earns back the short wait. Cycles of failed probes are always
    // shorter than this, so a machine that cannot hold a level keeps its long wait.
    if (now - this.changedAt > FORGET_AFTER_MS) this.upAfter = this.baseUpAfter;

    const m = this.median();
    if (m > this.deadline(this.level)) {
      this.calmSince = -1;
      if (this.level < 2) {
        if (now - this.lastUpAt < this.revertWithin) {
          this.upAfter = Math.min(this.upAfter * 2, this.maxUpAfter);
        }
        return this.move((this.level + 1) as QualityId);
      }
      return null;
    }
    if (this.level > 0 && m < this.calm * this.deadline(this.level)) {
      if (this.calmSince < 0) this.calmSince = now;
      if (now - this.calmSince >= this.upAfter) {
        this.lastUpAt = now;
        return this.move((this.level - 1) as QualityId);
      }
    } else {
      this.calmSince = -1;
    }
    return null;
  }

  /** Jump to a level (manual override, or leaving manual mode). Clears the evidence. */
  set(level: QualityId): void {
    this.move(level);
  }

  private move(level: QualityId, now = this.lastNow): QualityId {
    this.level = level;
    this.changedAt = now;
    this.count = 0;
    this.head = 0;
    this.calmSince = -1;
    return level;
  }

  /** Time one processed frame may take at this level (ms). */
  private deadline(level: number): number {
    return this.budget * this.levels[level]!.faceEvery;
  }

  private median(): number {
    this.sorted.set(this.ring);
    this.sorted.sort();
    return this.sorted[this.size >> 1]!;
  }
}
