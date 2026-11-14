/**
 * Ring buffer of one hand's recent positions in display space (see HandMetrics for the units).
 * Holds 64 samples: about 2 s at 30 fps, comfortably more than the ~1 s the detectors look back.
 * Preallocated typed arrays, so pushing a sample never allocates.
 */
export class HandMotion {
  static readonly CAPACITY = 64;
  private readonly cap = HandMotion.CAPACITY;
  private readonly ts = new Float64Array(this.cap);
  private readonly pxs = new Float32Array(this.cap);
  private readonly pys = new Float32Array(this.cap);
  private readonly txs = new Float32Array(this.cap);
  private readonly tys = new Float32Array(this.cap);
  private readonly opens = new Float32Array(this.cap);
  private head = 0;
  private size = 0;
  /** Latest palm length, the unit for thresholds. */
  palmLen = 1e-6;

  get length(): number {
    return this.size;
  }

  push(
    t: number,
    px: number,
    py: number,
    tx: number,
    ty: number,
    open: number,
    palmLen: number,
  ): void {
    const h = this.head;
    this.ts[h] = t;
    this.pxs[h] = px;
    this.pys[h] = py;
    this.txs[h] = tx;
    this.tys[h] = ty;
    this.opens[h] = open;
    this.palmLen = palmLen || 1e-6;
    this.head = (h + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  // Index i counts back from the newest sample: 0 = newest.
  private idx(i: number): number {
    return (this.head - 1 - i + this.cap * 2) % this.cap;
  }
  t(i: number): number {
    return this.ts[this.idx(i)]!;
  }
  px(i: number): number {
    return this.pxs[this.idx(i)]!;
  }
  py(i: number): number {
    return this.pys[this.idx(i)]!;
  }
  tx(i: number): number {
    return this.txs[this.idx(i)]!;
  }
  ty(i: number): number {
    return this.tys[this.idx(i)]!;
  }
  /** 0..1: how open the hand was (1 = all four fingers straight). */
  open(i: number): number {
    return this.opens[this.idx(i)]!;
  }

  /** How many of the newest samples fall within windowMs of the newest one (and not before minT). */
  countWithin(windowMs: number, minT = -Infinity): number {
    if (this.size === 0) return 0;
    const newest = this.t(0);
    let n = 1;
    while (n < this.size && newest - this.t(n) <= windowMs && this.t(n) >= minT) n++;
    return n;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

/**
 * Counts how often the palm reverses direction along x within a window, ignoring wiggles smaller
 * than `amp` (display units). Used by wave (needs >= 3) and to stop swipes firing during a wave.
 */
export function countReversals(
  m: HandMotion,
  windowMs: number,
  amp: number,
  minT = -Infinity,
): number {
  const n = m.countWithin(windowMs, minT);
  if (n < 3) return 0;
  let lo = m.px(n - 1);
  let hi = lo;
  let ext = lo;
  let dir = 0;
  let turns = 0;
  for (let i = n - 2; i >= 0; i--) {
    const x = m.px(i);
    if (dir === 0) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      if (x - lo >= amp) {
        dir = 1;
        ext = x;
      } else if (hi - x >= amp) {
        dir = -1;
        ext = x;
      }
    } else if (dir === 1) {
      if (x > ext) ext = x;
      else if (ext - x >= amp) {
        turns++;
        dir = -1;
        ext = x;
      }
    } else if (x < ext) {
      ext = x;
    } else if (x - ext >= amp) {
      turns++;
      dir = 1;
      ext = x;
    }
  }
  return turns;
}
